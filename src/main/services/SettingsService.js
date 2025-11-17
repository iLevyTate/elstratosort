const { app, ipcMain } = require('electron');
const fs = require('fs').promises;
const fsSync = require('fs');
const path = require('path');
const { backupAndReplace } = require('../../shared/atomicFileOperations');
const {
  validateSettings,
  sanitizeSettings,
} = require('../../shared/settingsValidation');
const { DEFAULT_SETTINGS } = require('../../shared/defaultSettings');

let singletonInstance = null;

class SettingsService {
  constructor() {
    this.settingsPath = path.join(app.getPath('userData'), 'settings.json');
    this.backupDir = path.join(app.getPath('userData'), 'settings-backups');
    this.maxBackups = 10; // Keep last 10 backups
    this.defaults = DEFAULT_SETTINGS;
    this._cache = null;
    this._cacheTimestamp = 0;
    this._cacheTtlMs = 2_000; // short TTL to avoid repeated disk reads
    this._fileWatcher = null;
    this._debounceTimer = null;
    this._debounceDelay = 500; // 500ms debounce
    this._isInternalChange = false; // Flag to ignore changes we made ourselves

    // Fixed: Add mutex to prevent concurrent save operations
    this._saveMutex = Promise.resolve();
    this._saveQueue = [];

    // Start file watching
    this._startFileWatcher();
  }

  async load() {
    try {
      const now = Date.now();
      if (this._cache && now - this._cacheTimestamp < this._cacheTtlMs) {
        return this._cache;
      }
      const raw = await fs.readFile(this.settingsPath, 'utf-8');
      const parsed = JSON.parse(raw);
      const merged = { ...this.defaults, ...parsed };
      this._cache = merged;
      this._cacheTimestamp = now;
      return merged;
    } catch (err) {
      const merged = { ...this.defaults };
      this._cache = merged;
      this._cacheTimestamp = Date.now();
      if (err && err.code !== 'ENOENT') {
        console.warn(
          '[SETTINGS] Failed to read settings, using defaults:',
          err.message,
        );
      }
      return merged;
    }
  }

  // Fixed: Proper cache invalidation, settings merging, and validation
  async save(settings) {
    // Fixed: Use mutex to prevent race conditions from concurrent saves
    return this._withMutex(async () => {
      // Validate settings before saving
      const validation = validateSettings(settings);
      if (!validation.valid) {
        const error = new Error('Invalid settings provided');
        error.validationErrors = validation.errors;
        error.validationWarnings = validation.warnings;
        throw error;
      }

      // Log warnings if any
      if (validation.warnings.length > 0) {
        console.warn('[SETTINGS] Validation warnings:', validation.warnings);
      }

      // Sanitize settings to remove any invalid values
      const sanitized = sanitizeSettings(settings);

      // Load current settings first to avoid data loss on partial updates
      // This is now safe because we're inside the mutex
      const current = await this.load();
      const merged = { ...current, ...sanitized };

      // CRITICAL: Create backup before saving - mandatory with retry logic
      // Ensure backup directory exists first
      try {
        await fs.mkdir(this.backupDir, { recursive: true });
      } catch (error) {
        const errorMsg = `Failed to create backup directory: ${error.message}`;
        console.error(`[SETTINGS] ${errorMsg}`);
        throw new Error(errorMsg);
      }

      // Retry backup creation with exponential backoff (3 attempts)
      let backupResult = null;
      const maxBackupRetries = 3;
      const initialBackupDelay = 100; // Start with 100ms

      for (let attempt = 0; attempt < maxBackupRetries; attempt++) {
        try {
          backupResult = await this.createBackup();
          if (backupResult.success) {
            break; // Success, exit retry loop
          }
        } catch (error) {
          const isLastAttempt = attempt === maxBackupRetries - 1;
          if (isLastAttempt) {
            const errorMsg = `Failed to create backup after ${maxBackupRetries} attempts: ${error.message}`;
            console.error(`[SETTINGS] ${errorMsg}`);
            throw new Error(errorMsg);
          }
          // Wait before retry with exponential backoff
          const delay = initialBackupDelay * Math.pow(2, attempt);
          await new Promise((resolve) => setTimeout(resolve, delay));
          console.warn(
            `[SETTINGS] Backup attempt ${attempt + 1} failed, retrying in ${delay}ms...`,
          );
        }
      }

      // Verify backup was successful
      if (!backupResult || !backupResult.success) {
        const errorMsg = `Backup creation failed: ${backupResult?.error || 'Unknown error'}`;
        console.error(`[SETTINGS] ${errorMsg}`);
        throw new Error(errorMsg);
      }

      // Now safe to save settings
      // Set flag to ignore our own file change
      this._isInternalChange = true;
      try {
        await fs.mkdir(path.dirname(this.settingsPath), { recursive: true });
        const result = await backupAndReplace(
          this.settingsPath,
          JSON.stringify(merged, null, 2),
        );
        if (!result.success) {
          throw new Error(result.error || 'Failed to save settings');
        }

        // Invalidate and update cache immediately
        this._cache = merged;
        this._cacheTimestamp = Date.now();
      } finally {
        // Reset flag after a short delay to allow file system to settle
        setTimeout(() => {
          this._isInternalChange = false;
        }, 100);
      }

      return {
        settings: merged,
        validationWarnings: validation.warnings,
        backupCreated: true,
        backupPath: backupResult.path,
      };
    }); // End of mutex wrapper
  }

  /**
   * Execute a function with mutex lock to prevent concurrent operations
   * @private
   */
  async _withMutex(fn) {
    // Fixed: Robust mutex implementation using promise chaining
    // CRITICAL: Mutex must ALWAYS resolve (never reject) to maintain the chain
    const previousMutex = this._saveMutex;

    // Create a new promise that will resolve when fn completes
    let resolveMutex;
    this._saveMutex = new Promise((resolve) => {
      resolveMutex = resolve;
    });

    try {
      // Wait for previous operation to complete
      // Use .catch() to handle rejection from previous operation
      await previousMutex.catch(() => {
        // Previous operation failed, but we continue with current operation
        // This prevents error propagation from breaking the mutex chain
      });

      // Execute the function
      const result = await fn();

      // Release the mutex
      resolveMutex();

      return result;
    } catch (error) {
      // Fixed: ALWAYS resolve the mutex, never reject
      // This ensures the next operation can proceed even if this one fails
      resolveMutex();
      throw error;
    }
  }

  // Add explicit cache invalidation method
  invalidateCache() {
    this._cache = null;
    this._cacheTimestamp = 0;
  }

  // Force reload from disk, bypassing cache
  async reload() {
    this.invalidateCache();
    return await this.load();
  }

  // Fixed: Add permanent backup management
  /**
   * Create a permanent backup of current settings
   */
  async createBackup() {
    try {
      // Ensure backup directory exists
      await fs.mkdir(this.backupDir, { recursive: true });

      // Load current settings
      const settings = await this.load();

      // Create backup filename with timestamp
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const backupPath = path.join(
        this.backupDir,
        `settings-${timestamp}.json`,
      );

      // Write backup with metadata
      const backupData = {
        timestamp: new Date().toISOString(),
        appVersion: app.getVersion(),
        settings,
      };

      await fs.writeFile(
        backupPath,
        JSON.stringify(backupData, null, 2),
        'utf8',
      );

      // Clean up old backups
      await this.cleanupOldBackups();

      return {
        success: true,
        path: backupPath,
        timestamp: backupData.timestamp,
      };
    } catch (error) {
      console.error('[SETTINGS] Failed to create backup:', error);
      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * List all available backups
   */
  async listBackups() {
    try {
      // Ensure backup directory exists
      await fs.mkdir(this.backupDir, { recursive: true });

      // Read backup directory
      const files = await fs.readdir(this.backupDir);

      // Filter and parse backup files
      const backups = [];
      for (const file of files) {
        if (file.startsWith('settings-') && file.endsWith('.json')) {
          const filePath = path.join(this.backupDir, file);

          try {
            const content = await fs.readFile(filePath, 'utf8');
            const data = JSON.parse(content);

            const stats = await fs.stat(filePath);

            const timestamp = data.timestamp || stats.mtime.toISOString();

            backups.push({
              filename: file,
              path: filePath,
              timestamp,
              appVersion: data.appVersion || 'unknown',
              size: stats.size,
              _parsedTime: new Date(timestamp).getTime(), // Fixed: Parse once for efficient sorting
            });
          } catch (error) {
            // Skip invalid backup files
            console.warn(
              '[SETTINGS] Invalid backup file:',
              file,
              error.message,
            );
          }
        }
      }

      // Fixed: Optimized sort using pre-parsed timestamps
      backups.sort((a, b) => b._parsedTime - a._parsedTime);

      backups.forEach((backup) => {
        delete backup._parsedTime;
      });

      return backups;
    } catch (error) {
      console.error('[SETTINGS] Failed to list backups:', error);
      return [];
    }
  }

  /**
   * Restore settings from a backup
   */
  async restoreFromBackup(backupPath) {
    // Fixed: Use mutex to prevent race conditions during restore
    return this._withMutex(async () => {
      try {
        // Read backup file
        const content = await fs.readFile(backupPath, 'utf8');
        const backupData = JSON.parse(content);

        if (!backupData.settings) {
          throw new Error('Invalid backup file: missing settings object');
        }

        // Create a backup of current settings before restoring
        await this.createBackup();

        // Validate backup settings
        const validation = validateSettings(backupData.settings);
        if (!validation.valid) {
          const error = new Error('Backup contains invalid settings');
          error.validationErrors = validation.errors;
          error.validationWarnings = validation.warnings;
          throw error;
        }

        // Sanitize settings
        const sanitized = sanitizeSettings(backupData.settings);

        // Merge with defaults to ensure all required fields exist
        const merged = { ...this.defaults, ...sanitized };

        // Save restored settings
        await fs.mkdir(path.dirname(this.settingsPath), { recursive: true });
        const result = await backupAndReplace(
          this.settingsPath,
          JSON.stringify(merged, null, 2),
        );

        if (!result.success) {
          throw new Error(result.error || 'Failed to save restored settings');
        }

        // Invalidate cache
        this._cache = merged;
        this._cacheTimestamp = Date.now();

        return {
          success: true,
          settings: merged,
          validationWarnings: validation.warnings,
          restoredFrom: backupData.timestamp,
        };
      } catch (error) {
        console.error('[SETTINGS] Failed to restore from backup:', error);
        return {
          success: false,
          error: error.message,
          validationErrors: error.validationErrors,
          validationWarnings: error.validationWarnings,
        };
      }
    });
  }

  /**
   * Clean up old backups, keeping only the most recent ones
   */
  async cleanupOldBackups() {
    try {
      const backups = await this.listBackups();

      // Keep only the most recent backups
      if (backups.length > this.maxBackups) {
        const backupsToDelete = backups.slice(this.maxBackups);

        for (const backup of backupsToDelete) {
          try {
            await fs.unlink(backup.path);
          } catch (error) {
            console.warn(
              '[SETTINGS] Failed to delete old backup:',
              backup.filename,
              error.message,
            );
          }
        }
      }
    } catch (error) {
      console.error('[SETTINGS] Failed to cleanup old backups:', error);
    }
  }

  /**
   * Delete a specific backup
   */
  async deleteBackup(backupPath) {
    try {
      await fs.unlink(backupPath);
      return { success: true };
    } catch (error) {
      console.error('[SETTINGS] Failed to delete backup:', error);
      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * Start watching the settings file for external changes
   * @private
   */
  _startFileWatcher() {
    try {
      // Ensure settings directory exists
      const settingsDir = path.dirname(this.settingsPath);
      if (!fsSync.existsSync(settingsDir)) {
        fsSync.mkdirSync(settingsDir, { recursive: true });
      }

      // Watch the settings file
      this._fileWatcher = fsSync.watch(
        this.settingsPath,
        (eventType, filename) => {
          // Ignore our own changes
          if (this._isInternalChange) {
            return;
          }

          // Handle file changes with debouncing
          if (eventType === 'change' || eventType === 'rename') {
            // Clear existing debounce timer
            if (this._debounceTimer) {
              clearTimeout(this._debounceTimer);
            }

            // Set new debounce timer
            this._debounceTimer = setTimeout(() => {
              this._handleExternalFileChange(eventType, filename);
            }, this._debounceDelay);
          }
        },
      );

      // Handle watcher errors
      this._fileWatcher.on('error', (error) => {
        console.error('[SETTINGS] File watcher error:', error);
        // Attempt to restart watcher after a delay
        setTimeout(() => {
          this._restartFileWatcher();
        }, 5000);
      });

      console.log('[SETTINGS] File watcher started for:', this.settingsPath);
    } catch (error) {
      console.warn('[SETTINGS] Failed to start file watcher:', error.message);
      // Non-fatal - app can still function without file watching
    }
  }

  /**
   * Restart the file watcher
   * @private
   */
  _restartFileWatcher() {
    this._stopFileWatcher();
    this._startFileWatcher();
  }

  /**
   * Stop watching the settings file
   * @private
   */
  _stopFileWatcher() {
    if (this._fileWatcher) {
      try {
        this._fileWatcher.close();
        this._fileWatcher = null;
        console.log('[SETTINGS] File watcher stopped');
      } catch (error) {
        console.error('[SETTINGS] Error stopping file watcher:', error);
      }
    }

    // Clear debounce timer
    if (this._debounceTimer) {
      clearTimeout(this._debounceTimer);
      this._debounceTimer = null;
    }
  }

  /**
   * Handle external file changes
   * @private
   */
  async _handleExternalFileChange(eventType, filename) {
    try {
      console.log(
        '[SETTINGS] External file change detected:',
        eventType,
        filename,
      );

      // Check if file still exists (might have been deleted)
      try {
        await fs.access(this.settingsPath);
      } catch (error) {
        if (error.code === 'ENOENT') {
          console.log('[SETTINGS] Settings file was deleted, using defaults');
          this.invalidateCache();
          this._notifySettingsChanged();
          return;
        }
        throw error;
      }

      // Invalidate cache to force reload
      this.invalidateCache();

      // Reload settings from disk
      const newSettings = await this.load();
      console.log('[SETTINGS] Settings reloaded from external change');

      // Notify renderer process of settings change
      this._notifySettingsChanged();

      return newSettings;
    } catch (error) {
      console.error('[SETTINGS] Failed to handle external file change:', error);
      // Invalidate cache anyway to prevent stale data
      this.invalidateCache();
    }
  }

  /**
   * Notify renderer process of settings changes via IPC
   * @private
   */
  _notifySettingsChanged() {
    try {
      // Emit IPC event to notify renderer
      if (ipcMain && ipcMain.emit) {
        // Get all BrowserWindows and send event
        const { BrowserWindow } = require('electron');
        const windows = BrowserWindow.getAllWindows();
        windows.forEach((win) => {
          if (win && !win.isDestroyed() && win.webContents) {
            try {
              win.webContents.send('settings-changed-external');
            } catch (error) {
              console.warn(
                '[SETTINGS] Failed to send settings-changed event:',
                error.message,
              );
            }
          }
        });
      }
    } catch (error) {
      console.warn(
        '[SETTINGS] Failed to notify settings change:',
        error.message,
      );
    }
  }

  /**
   * Shutdown the service and cleanup resources
   */
  shutdown() {
    this._stopFileWatcher();
  }
}

function getService() {
  if (!singletonInstance) {
    singletonInstance = new SettingsService();
  }
  return singletonInstance;
}

module.exports = SettingsService;
module.exports.getService = getService;

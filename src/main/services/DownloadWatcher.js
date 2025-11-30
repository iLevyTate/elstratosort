const fs = require('fs').promises;
const path = require('path');
const os = require('os');
const chokidar = require('chokidar');
const { logger } = require('../../shared/logger');
const {
  FileSystemError,
  WatcherError,
  FILE_SYSTEM_ERROR_CODES,
} = require('../errors/FileSystemError');
logger.setContext('DownloadWatcher');

// Simple utility to determine if a path is an image based on extension
const IMAGE_EXTENSIONS = new Set([
  '.png',
  '.jpg',
  '.jpeg',
  '.gif',
  '.bmp',
  '.webp',
  '.tiff',
  '.svg',
  '.heic',
]);

// Temporary/incomplete file patterns to ignore
const TEMP_FILE_PATTERNS = [
  /\.(tmp|temp)$/i, // Generic temp files
  /\.crdownload$/i, // Chrome download temp
  /\.part$/i, // Firefox/partial downloads
  /\.!qB$/i, // qBittorrent temp
  /\.download$/i, // Safari temp
  /\.partial$/i, // Generic partial
  /~\$/, // Microsoft Office temp files
  /^~/, // Unix temp files starting with ~
  /\.swp$/i, // Vim swap files
  /\.lock$/i, // Lock files
  /\.lck$/i, // Alternative lock files
  /\._/, // macOS resource forks
  /\.DS_Store$/i, // macOS directory settings
  /Thumbs\.db$/i, // Windows thumbnails
  /desktop\.ini$/i, // Windows desktop settings
];

/**
 * Check if a file path is a temporary or incomplete file
 * @param {string} filePath - Path to check
 * @returns {boolean} True if the file appears to be temporary
 */
function isTemporaryFile(filePath) {
  const basename = path.basename(filePath);

  // Check against temp file patterns
  for (const pattern of TEMP_FILE_PATTERNS) {
    if (pattern.test(basename)) {
      return true;
    }
  }

  return false;
}

class DownloadWatcher {
  constructor({
    analyzeDocumentFile,
    analyzeImageFile,
    getCustomFolders,
    autoOrganizeService,
    settingsService,
  }) {
    this.analyzeDocumentFile = analyzeDocumentFile;
    this.analyzeImageFile = analyzeImageFile;
    this.getCustomFolders = getCustomFolders;
    this.autoOrganizeService = autoOrganizeService;
    this.settingsService = settingsService;
    this.watcher = null;
    this.isStarting = false;
    this.restartAttempts = 0;
    this.maxRestartAttempts = 3;
    this.restartDelay = 5000; // 5 seconds between restart attempts
    this.lastError = null;
    this.processingFiles = new Set(); // Track files being processed to avoid duplicates
    this.debounceTimers = new Map(); // Debounce timers for each file
    this.debounceDelay = 500; // 500ms debounce for rapid events
  }

  start() {
    if (this.watcher) {
      logger.debug('[DOWNLOAD-WATCHER] Watcher already running');
      return;
    }

    if (this.isStarting) {
      logger.debug('[DOWNLOAD-WATCHER] Watcher is already starting');
      return;
    }

    this.isStarting = true;

    try {
      const downloadsPath = path.join(os.homedir(), 'Downloads');

      // Verify downloads directory exists and is accessible
      this._verifyDirectory(downloadsPath)
        .then((isValid) => {
          if (!isValid) {
            this.isStarting = false;
            return;
          }

          logger.info('[DOWNLOAD-WATCHER] Watching', downloadsPath);

          // PERFORMANCE FIX: Optimize chokidar watcher configuration
          // - ignoreInitial: Don't process existing files on startup
          // - ignored: Comprehensive temp/system file filtering
          // - awaitWriteFinish: Wait for file writes to complete before processing
          // - usePolling: false by default for better performance, set to true for network drives
          this.watcher = chokidar.watch(downloadsPath, {
            ignoreInitial: true,
            ignored: [
              /(^|[\\/\\])\../, // Ignore dotfiles
              /\.tmp$/i, // Ignore temp files
              /\.temp$/i, // Ignore temp files
              /\.crdownload$/i, // Chrome download temp files
              /\.part$/i, // Firefox download temp files
              /\.!qB$/i, // qBittorrent temp files
              /\.download$/i, // Safari temp files
              /\.partial$/i, // Generic partial downloads
              /~\$/, // Microsoft Office temp files
              /^~/, // Unix temp files
              /\.swp$/i, // Vim swap files
              /\.lock$/i, // Lock files
              /\.lck$/i, // Alternative lock files
              /Thumbs\.db$/i, // Windows thumbnails
              /desktop\.ini$/i, // Windows desktop settings
              /\.DS_Store$/i, // macOS directory settings
              '**/node_modules/**', // Ignore node_modules
              '**/.git/**', // Ignore git directories
            ],
            awaitWriteFinish: {
              stabilityThreshold: 2000, // Wait 2s after last change
              pollInterval: 100, // Check every 100ms
            },
            // Error handling options
            persistent: true,
            usePolling: false, // Use native watchers for better performance
            alwaysStat: false, // Don't stat files we're ignoring
            depth: 0, // Only watch immediate directory, not subdirectories
          });

          // FIX #32: Validate watcher was created successfully before registering listeners
          if (!this.watcher) {
            logger.error('[DOWNLOAD-WATCHER] Failed to create file watcher');
            this.isStarting = false;
            return;
          }

          // Handle new files with debouncing
          this.watcher.on('add', (filePath) => {
            this._debouncedHandleFile(filePath);
          });

          // Handle watcher errors with recovery
          this.watcher.on('error', (error) => {
            this._handleWatcherError(error);
          });

          // Handle ready event
          this.watcher.on('ready', () => {
            logger.info('[DOWNLOAD-WATCHER] Watcher ready and monitoring');
            this.restartAttempts = 0; // Reset restart counter on successful start
            this.lastError = null;
          });

          this.isStarting = false;
        })
        .catch((error) => {
          this.isStarting = false;
          this._handleWatcherError(error);
        });
    } catch (error) {
      this.isStarting = false;
      this._handleWatcherError(error);
    }
  }

  /**
   * Verify that the downloads directory exists and is accessible
   * @param {string} dirPath - Path to verify
   * @returns {Promise<boolean>} True if directory is valid
   */
  async _verifyDirectory(dirPath) {
    try {
      const stats = await fs.stat(dirPath);
      if (!stats.isDirectory()) {
        logger.error('[DOWNLOAD-WATCHER] Path is not a directory:', dirPath);
        return false;
      }

      // Try to access the directory (read permissions check)
      await fs.access(dirPath, fs.constants?.R_OK || 4);
      return true;
    } catch (error) {
      const fsError = FileSystemError.fromNodeError(error, {
        path: dirPath,
        operation: 'verify',
      });

      logger.error('[DOWNLOAD-WATCHER] Cannot access downloads directory:', {
        path: dirPath,
        error: fsError.getUserFriendlyMessage(),
        code: fsError.code,
      });

      this.lastError = fsError;
      return false;
    }
  }

  /**
   * Debounced file handling to avoid processing files multiple times
   * @param {string} filePath - Path to the file
   */
  _debouncedHandleFile(filePath) {
    // Clear any existing timer for this file
    if (this.debounceTimers.has(filePath)) {
      clearTimeout(this.debounceTimers.get(filePath));
    }

    // Set new timer
    const timer = setTimeout(async () => {
      this.debounceTimers.delete(filePath);

      // Check if already processing this file
      if (this.processingFiles.has(filePath)) {
        logger.debug('[DOWNLOAD-WATCHER] File already being processed:', filePath);
        return;
      }

      try {
        this.processingFiles.add(filePath);
        await this.handleFile(filePath);
      } catch (e) {
        const errorInfo = e.isFileSystemError
          ? { code: e.code, message: e.getUserFriendlyMessage() }
          : { message: e.message };

        logger.error('[DOWNLOAD-WATCHER] Failed processing file', {
          filePath,
          ...errorInfo,
          stack: e.stack,
        });
      } finally {
        this.processingFiles.delete(filePath);
      }
    }, this.debounceDelay);

    timer.unref(); // Don't prevent process exit
    this.debounceTimers.set(filePath, timer);
  }

  /**
   * Handle watcher errors with automatic restart capability
   * @param {Error} error - The error that occurred
   */
  _handleWatcherError(error) {
    const fsError =
      error.isFileSystemError
        ? error
        : new WatcherError(path.join(os.homedir(), 'Downloads'), error);

    logger.error('[DOWNLOAD-WATCHER] Watcher error:', {
      message: fsError.getUserFriendlyMessage(),
      code: fsError.code,
      originalError: error.message,
    });

    this.lastError = fsError;

    // Attempt automatic restart if error seems recoverable
    if (fsError.shouldRetry() && this.restartAttempts < this.maxRestartAttempts) {
      this.restartAttempts++;
      logger.info(
        `[DOWNLOAD-WATCHER] Attempting restart (${this.restartAttempts}/${this.maxRestartAttempts})...`,
      );

      // Stop the current watcher
      this.stop();

      // Schedule restart
      const restartTimer = setTimeout(() => {
        this.start();
      }, this.restartDelay * this.restartAttempts); // Exponential backoff
      restartTimer.unref();
    } else if (this.restartAttempts >= this.maxRestartAttempts) {
      logger.error(
        '[DOWNLOAD-WATCHER] Max restart attempts reached. Watcher disabled.',
      );
      this.stop();
    }
  }

  stop() {
    // Clear all debounce timers
    for (const timer of this.debounceTimers.values()) {
      clearTimeout(timer);
    }
    this.debounceTimers.clear();
    this.processingFiles.clear();

    if (this.watcher) {
      try {
        // Remove all listeners before closing
        this.watcher.removeAllListeners();
        this.watcher.close();
        logger.info('[DOWNLOAD-WATCHER] Stopped watching downloads');
      } catch (error) {
        logger.error('[DOWNLOAD-WATCHER] Error stopping watcher:', error);
      } finally {
        this.watcher = null;
      }
    }

    this.isStarting = false;
  }

  /**
   * Get the current status of the watcher
   * @returns {Object} Status information
   */
  getStatus() {
    return {
      isRunning: this.watcher !== null,
      isStarting: this.isStarting,
      restartAttempts: this.restartAttempts,
      maxRestartAttempts: this.maxRestartAttempts,
      lastError: this.lastError ? this.lastError.toJSON() : null,
      processingCount: this.processingFiles.size,
      pendingDebounce: this.debounceTimers.size,
    };
  }

  /**
   * Reset the watcher state and restart
   */
  restart() {
    logger.info('[DOWNLOAD-WATCHER] Manual restart requested');
    this.restartAttempts = 0;
    this.lastError = null;
    this.stop();
    this.start();
  }

  async handleFile(filePath) {
    const ext = path.extname(filePath).toLowerCase();
    const basename = path.basename(filePath);

    // Enhanced temporary file detection using comprehensive patterns
    // FIX: Use precise path segment matching instead of substring matching
    // to avoid false positives like 'project.gitignore' being skipped
    const pathSegments = filePath.split(path.sep);
    const hasGitDir = pathSegments.includes('.git');
    const hasNodeModules = pathSegments.includes('node_modules');

    if (
      ext === '' ||
      isTemporaryFile(filePath) ||
      hasGitDir ||
      hasNodeModules ||
      basename.startsWith('.')
    ) {
      logger.debug(
        '[DOWNLOAD-WATCHER] Skipping system/temporary file:',
        filePath,
      );
      return;
    }

    // CRITICAL FIX: Verify file exists and is stable before processing
    // Files may be deleted quickly (e.g., git lock files)
    try {
      await fs.access(filePath);

      // Additional check: verify file has some content (not empty)
      const stats = await fs.stat(filePath);
      if (stats.size === 0) {
        logger.debug(
          '[DOWNLOAD-WATCHER] Skipping empty file:',
          filePath,
        );
        return;
      }
    } catch (error) {
      if (error.code === 'ENOENT') {
        logger.debug(
          '[DOWNLOAD-WATCHER] File no longer exists, skipping:',
          filePath,
        );
        return;
      }

      // Convert to FileSystemError for consistent handling
      const fsError = FileSystemError.fromNodeError(error, {
        path: filePath,
        operation: 'access',
      });

      // Log with context but don't crash
      logger.warn('[DOWNLOAD-WATCHER] Cannot access file:', {
        filePath,
        error: fsError.getUserFriendlyMessage(),
        code: fsError.code,
      });

      // Only throw if it's a critical error
      if (!fsError.isRecoverable()) {
        throw fsError;
      }
      return;
    }

    const folders = this.getCustomFolders().filter((f) => f && f.path);

    // Try to use the new auto-organize service if available
    if (this.autoOrganizeService && this.settingsService) {
      try {
        const settings = await this.settingsService.load();

        // Use the new auto-organize service with suggestions
        const result = await this.autoOrganizeService.processNewFile(
          filePath,
          folders,
          {
            autoOrganizeEnabled: settings.autoOrganize,
            confidenceThreshold: settings.downloadConfidenceThreshold || 0.9,
            defaultLocation: settings.defaultSmartFolderLocation || 'Documents',
          },
        );

        if (result && result.destination) {
          // CRITICAL FIX: Verify file still exists before renaming
          try {
            await fs.access(filePath);
          } catch (error) {
            if (error.code === 'ENOENT') {
              logger.debug(
                '[DOWNLOAD-WATCHER] File deleted before organization, skipping:',
                filePath,
              );
              return;
            }
            throw error;
          }

          // Create destination directory with error handling
          try {
            await fs.mkdir(path.dirname(result.destination), { recursive: true });
          } catch (mkdirError) {
            const fsError = FileSystemError.forOperation('mkdir', mkdirError, result.destination);
            logger.error('[DOWNLOAD-WATCHER] Failed to create destination directory:', {
              destination: result.destination,
              error: fsError.getUserFriendlyMessage(),
              code: fsError.code,
            });
            throw fsError;
          }

          // Move file with cross-device handling
          try {
            await fs.rename(filePath, result.destination);
          } catch (renameError) {
            // Handle cross-device move (different drives)
            if (renameError.code === 'EXDEV') {
              logger.debug('[DOWNLOAD-WATCHER] Cross-device move detected, using copy+delete');
              try {
                await fs.copyFile(filePath, result.destination);
                // Verify copy succeeded
                const [srcStats, destStats] = await Promise.all([
                  fs.stat(filePath),
                  fs.stat(result.destination),
                ]);
                if (srcStats.size !== destStats.size) {
                  await fs.unlink(result.destination).catch(() => {});
                  throw new FileSystemError(FILE_SYSTEM_ERROR_CODES.SIZE_MISMATCH, {
                    path: result.destination,
                    operation: 'move',
                    expectedSize: srcStats.size,
                    actualSize: destStats.size,
                  });
                }
                await fs.unlink(filePath);
              } catch (copyError) {
                const fsError = copyError.isFileSystemError
                  ? copyError
                  : FileSystemError.forOperation('copy', copyError, filePath);
                logger.error('[DOWNLOAD-WATCHER] Cross-device move failed:', {
                  source: filePath,
                  destination: result.destination,
                  error: fsError.getUserFriendlyMessage(),
                });
                throw fsError;
              }
            } else {
              const fsError = FileSystemError.forOperation('move', renameError, filePath);
              logger.error('[DOWNLOAD-WATCHER] Failed to move file:', {
                source: filePath,
                destination: result.destination,
                error: fsError.getUserFriendlyMessage(),
                code: fsError.code,
              });
              throw fsError;
            }
          }

          logger.info(
            '[DOWNLOAD-WATCHER] Auto-organized with',
            Math.round(result.confidence * 100) + '% confidence:',
            filePath,
            '=>',
            result.destination,
          );
          return;
        } else {
          logger.info(
            '[DOWNLOAD-WATCHER] File not auto-organized (low confidence or disabled)',
          );
          return;
        }
      } catch (e) {
        // Log with appropriate detail based on error type
        const errorInfo = e.isFileSystemError
          ? { code: e.code, message: e.getUserFriendlyMessage() }
          : { message: e.message };

        logger.warn(
          '[DOWNLOAD-WATCHER] Auto-organize service failed, falling back:',
          errorInfo,
        );
        // Fall through to original logic
      }
    }

    // Fallback to original logic
    // CRITICAL FIX: Verify file still exists before fallback processing
    try {
      await fs.access(filePath);
    } catch (error) {
      if (error.code === 'ENOENT') {
        logger.debug(
          '[DOWNLOAD-WATCHER] File no longer exists for fallback, skipping:',
          filePath,
        );
        return;
      }
      const fsError = FileSystemError.fromNodeError(error, {
        path: filePath,
        operation: 'access',
      });
      logger.warn('[DOWNLOAD-WATCHER] Cannot access file for fallback:', {
        filePath,
        error: fsError.getUserFriendlyMessage(),
      });
      return;
    }

    const folderCategories = folders.map((f) => ({
      name: f.name,
      description: f.description || '',
      id: f.id,
    }));

    let result;
    try {
      if (IMAGE_EXTENSIONS.has(ext)) {
        result = await this.analyzeImageFile(filePath, folderCategories);
      } else {
        result = await this.analyzeDocumentFile(filePath, folderCategories);
      }
    } catch (e) {
      logger.error('[DOWNLOAD-WATCHER] Analysis failed', {
        filePath,
        error: e.message,
      });
      return;
    }

    const destFolder = this.resolveDestinationFolder(result, folders);
    if (!destFolder) {
      logger.debug('[DOWNLOAD-WATCHER] No matching destination folder found for:', filePath);
      return;
    }

    try {
      // CRITICAL FIX: Verify file still exists before renaming in fallback
      try {
        await fs.access(filePath);
      } catch (error) {
        if (error.code === 'ENOENT') {
          logger.debug(
            '[DOWNLOAD-WATCHER] File deleted before fallback rename, skipping:',
            filePath,
          );
          return;
        }
        throw error;
      }

      // Create destination directory
      try {
        await fs.mkdir(destFolder.path, { recursive: true });
      } catch (mkdirError) {
        const fsError = FileSystemError.forOperation('mkdir', mkdirError, destFolder.path);
        logger.error('[DOWNLOAD-WATCHER] Failed to create destination folder:', {
          folder: destFolder.path,
          error: fsError.getUserFriendlyMessage(),
        });
        return;
      }

      const baseName = path.basename(filePath);
      const extname = path.extname(baseName);
      const newName = result.suggestedName
        ? `${result.suggestedName}${extname}`
        : baseName;
      const destPath = path.join(destFolder.path, newName);

      // Move file with cross-device handling
      try {
        await fs.rename(filePath, destPath);
      } catch (renameError) {
        if (renameError.code === 'EXDEV') {
          // Cross-device move
          logger.debug('[DOWNLOAD-WATCHER] Cross-device move in fallback, using copy+delete');
          await fs.copyFile(filePath, destPath);
          const [srcStats, destStats] = await Promise.all([
            fs.stat(filePath),
            fs.stat(destPath),
          ]);
          if (srcStats.size !== destStats.size) {
            await fs.unlink(destPath).catch(() => {});
            throw new FileSystemError(FILE_SYSTEM_ERROR_CODES.SIZE_MISMATCH, {
              path: destPath,
              operation: 'move',
            });
          }
          await fs.unlink(filePath);
        } else if (renameError.code === 'EEXIST') {
          // Handle file exists - generate unique name
          let counter = 1;
          let uniquePath = destPath;
          const nameWithoutExt = path.basename(destPath, extname);
          const destDir = path.dirname(destPath);

          while (counter < 1000) {
            uniquePath = path.join(destDir, `${nameWithoutExt}_${counter}${extname}`);
            try {
              await fs.access(uniquePath);
              counter++;
            } catch {
              // File doesn't exist, use this path
              break;
            }
          }

          await fs.rename(filePath, uniquePath);
          logger.info(
            '[DOWNLOAD-WATCHER] Moved (fallback, renamed due to conflict)',
            filePath,
            '=>',
            uniquePath,
          );
          return;
        } else {
          throw renameError;
        }
      }

      logger.info(
        '[DOWNLOAD-WATCHER] Moved (fallback)',
        filePath,
        '=>',
        destPath,
      );
    } catch (e) {
      const errorInfo = e.isFileSystemError
        ? { code: e.code, message: e.getUserFriendlyMessage() }
        : { message: e.message };

      logger.error('[DOWNLOAD-WATCHER] Failed to move file', {
        source: filePath,
        destination: destFolder.path,
        ...errorInfo,
      });
    }
  }

  resolveDestinationFolder(result, folders) {
    if (!result) return null;
    // Prefer explicit smartFolder id
    if (result.smartFolder && result.smartFolder.id) {
      return folders.find((f) => f.id === result.smartFolder.id);
    }
    // Try folder match candidates
    if (Array.isArray(result.folderMatchCandidates)) {
      for (const cand of result.folderMatchCandidates) {
        const found = folders.find(
          (f) => f.id === cand.id || f.name === cand.name,
        );
        if (found) return found;
      }
    }
    // Fallback to category name match
    if (result.category) {
      return folders.find(
        (f) => f.name.toLowerCase() === result.category.toLowerCase(),
      );
    }
    return null;
  }
}

module.exports = DownloadWatcher;

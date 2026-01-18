/**
 * Persistence
 *
 * User pattern persistence for organization service.
 * Extracted from OrganizationSuggestionService for better maintainability.
 *
 * @module services/organization/persistence
 */

const path = require('path');
const fs = require('fs').promises;
const { app } = require('electron');
const { logger: baseLogger, createLogger } = require('../../../shared/logger');
const { z } = require('zod');

const logger =
  typeof createLogger === 'function' ? createLogger('Organization:Persistence') : baseLogger;
if (typeof createLogger !== 'function' && logger?.setContext) {
  logger.setContext('Organization:Persistence');
}

const patternEntrySchema = z.object({
  folder: z.string().optional(),
  path: z.string().optional(),
  count: z.number().optional(),
  confidence: z.number().optional(),
  lastUsed: z.number().optional(),
  createdAt: z.number().optional()
});

const feedbackEntrySchema = z.object({
  timestamp: z.number().optional(),
  accepted: z.boolean().optional(),
  file: z
    .object({
      name: z.string().optional(),
      type: z.string().optional()
    })
    .optional(),
  suggestion: z.object({}).passthrough().optional()
});

const patternsSchema = z.object({
  patterns: z.array(z.tuple([z.string(), patternEntrySchema])).optional(),
  feedbackHistory: z.array(feedbackEntrySchema).optional(),
  folderUsageStats: z
    .array(
      z.tuple([
        z.string(),
        z
          .object({
            count: z.number().optional(),
            lastUsed: z.number().optional()
          })
          .passthrough()
      ])
    )
    .optional(),
  lastUpdated: z.string().optional()
});

/**
 * Persistence manager for user patterns
 */
class PatternPersistence {
  /**
   * @param {Object} options - Configuration
   * @param {string} options.filename - Patterns filename
   * @param {number} options.saveThrottleMs - Throttle interval for saves
   */
  constructor(options = {}) {
    this.userDataPath = app.getPath('userData');
    this.patternsFilePath = path.join(this.userDataPath, options.filename || 'user-patterns.json');
    this.lastSaveTime = Date.now();
    this.saveThrottleMs = options.saveThrottleMs || 5000;
    this.pendingSave = null;
    // FIX: Store pending data to prevent stale data in throttled saves
    this._pendingSaveData = null;
  }

  /**
   * Load user patterns from storage
   * @returns {Promise<Object>} Stored data
   */
  async load() {
    try {
      const data = await fs.readFile(this.patternsFilePath, 'utf-8');
      const stored = JSON.parse(data);
      const parsed = patternsSchema.safeParse(stored);
      if (!parsed.success) {
        logger.warn('[Persistence] Invalid pattern data, starting fresh', {
          issues: parsed.error.issues?.length || 0
        });
        return null;
      }

      logger.info(`[Persistence] Loaded patterns from ${this.patternsFilePath}`);
      return parsed.data;
    } catch (error) {
      if (error.code !== 'ENOENT') {
        logger.error('[Persistence] Error loading patterns:', {
          filePath: this.patternsFilePath,
          errorCode: error.code,
          errorMessage: error.message
        });
        throw error;
      }
      logger.debug('[Persistence] No patterns file found, starting fresh');
      return null;
    }
  }

  /**
   * Save user patterns to storage
   * @param {Object} data - Data to save
   * @returns {Promise<void>}
   */
  async save(data) {
    try {
      // Throttle saves
      const now = Date.now();
      if (now - this.lastSaveTime < this.saveThrottleMs) {
        // FIX: Always store the latest data, so throttled saves use the most recent version
        this._pendingSaveData = data;
        if (!this.pendingSave) {
          this.pendingSave = setTimeout(
            () => {
              this.pendingSave = null;
              // FIX: Use stored pending data instead of stale closure variable
              const dataToSave = this._pendingSaveData;
              this._pendingSaveData = null;
              if (dataToSave) {
                this.save(dataToSave);
              }
            },
            this.saveThrottleMs - (now - this.lastSaveTime)
          );

          if (typeof this.pendingSave.unref === 'function') {
            this.pendingSave.unref();
          }
        }
        return;
      }

      this.lastSaveTime = now;
      // Clear pending data since we're saving now
      this._pendingSaveData = null;

      const saveData = {
        ...data,
        lastUpdated: new Date().toISOString()
      };

      // Ensure directory exists
      await fs.mkdir(path.dirname(this.patternsFilePath), { recursive: true });

      // Write atomically with temp file
      // FIX MED-24: Use random UUID for temp file to prevent collisions
      const randomId = require('crypto').randomUUID();
      const tempPath = `${this.patternsFilePath}.${randomId}.tmp`;
      const serialized = JSON.stringify(saveData, null, 2);
      await fs.writeFile(tempPath, serialized);
      const expectedSize = Buffer.byteLength(serialized);
      const tempStats = await fs.stat(tempPath);
      if (tempStats.size !== expectedSize) {
        throw new Error(
          `[Persistence] Atomic write size mismatch: expected ${expectedSize}, got ${tempStats.size}`
        );
      }
      await fs.rename(tempPath, this.patternsFilePath);

      logger.debug(`[Persistence] Saved patterns to ${this.patternsFilePath}`);
      return { success: true };
    } catch (error) {
      logger.error('[Persistence] Failed to save patterns:', error);
      // FIX: Clear pendingSave on error to prevent throttle logic from breaking
      this.pendingSave = null;
      return { success: false, error: error.message };
    }
  }

  /**
   * Cancel any pending save
   */
  cancelPendingSave() {
    if (this.pendingSave) {
      clearTimeout(this.pendingSave);
      this.pendingSave = null;
    }
    this._pendingSaveData = null;
  }

  /**
   * Shutdown the persistence layer, flushing any pending saves before stopping
   * Should be called during application shutdown
   * FIX MED-1: Force save pending data on shutdown instead of discarding it
   * @returns {Promise<void>}
   */
  async shutdown() {
    // Cancel the pending timeout to prevent double-save
    if (this.pendingSave) {
      clearTimeout(this.pendingSave);
      this.pendingSave = null;
    }

    // FIX MED-1: If there's pending data, save it immediately before shutdown
    if (this._pendingSaveData) {
      logger.info('[Persistence] Flushing pending save on shutdown');
      try {
        // Reset throttle time to allow immediate save
        this.lastSaveTime = 0;
        await this.save(this._pendingSaveData);
      } catch (error) {
        logger.error('[Persistence] Failed to flush pending save on shutdown:', error.message);
      }
    }

    this._pendingSaveData = null;
    logger.debug('[Persistence] Shutdown complete');
  }
}

module.exports = { PatternPersistence };

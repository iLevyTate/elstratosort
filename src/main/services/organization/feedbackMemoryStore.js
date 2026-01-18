/**
 * Feedback Memory Store
 *
 * Persists natural-language feedback memories for recommendation tuning.
 *
 * @module services/organization/feedbackMemoryStore
 */

const path = require('path');
const fs = require('fs').promises;
const { app } = require('electron');
const { logger: baseLogger, createLogger } = require('../../../shared/logger');
const { z } = require('zod');

const logger =
  typeof createLogger === 'function'
    ? createLogger('Organization:FeedbackMemoryStore')
    : baseLogger;
if (typeof createLogger !== 'function' && logger?.setContext) {
  logger.setContext('Organization:FeedbackMemoryStore');
}

const feedbackEntrySchema = z
  .object({
    id: z.string(),
    text: z.string(),
    source: z.string().optional(),
    targetFolder: z.string().nullable().optional(),
    scope: z.object({}).passthrough().optional(),
    embeddingModel: z.string().optional(),
    createdAt: z.string().optional(),
    updatedAt: z.string().optional()
  })
  .passthrough();

class FeedbackMemoryStore {
  constructor(options = {}) {
    this.userDataPath = app.getPath('userData');
    this.filePath = path.join(this.userDataPath, options.filename || 'feedback-memory.json');
    this.saveThrottleMs = options.saveThrottleMs || 5000;
    this.lastSaveTime = Date.now();
    this.pendingSave = null;
    // FIX H-6: Flag to track if a save is needed after throttle expires
    this._needsSave = false;
    this._loaded = false;
    this._entries = [];
  }

  async load() {
    if (this._loaded) {
      return this._entries;
    }
    try {
      const data = await fs.readFile(this.filePath, 'utf-8');
      const parsed = JSON.parse(data);
      const items = Array.isArray(parsed?.items) ? parsed.items : [];
      const validated = [];
      let invalidCount = 0;
      for (const item of items) {
        const result = feedbackEntrySchema.safeParse(item);
        if (result.success) {
          validated.push(result.data);
        } else {
          invalidCount += 1;
        }
      }
      if (invalidCount > 0) {
        logger.warn('[FeedbackMemoryStore] Dropped invalid feedback entries', {
          invalidCount
        });
      }
      this._entries = validated;
      this._loaded = true;
      logger.info('[FeedbackMemoryStore] Loaded feedback memory');
      return this._entries;
    } catch (error) {
      if (error.code !== 'ENOENT') {
        logger.warn('[FeedbackMemoryStore] Failed to load memory file:', error.message);
      }
      this._entries = [];
      this._loaded = true;
      return this._entries;
    }
  }

  async list() {
    await this.load();
    return this._entries.slice();
  }

  async add(entry) {
    await this.load();
    this._entries.unshift(entry);
    await this._save();
    return entry;
  }

  async update(id, patch) {
    await this.load();
    const index = this._entries.findIndex((item) => item.id === id);
    if (index === -1) {
      return null;
    }
    this._entries[index] = { ...this._entries[index], ...patch };
    await this._save();
    return this._entries[index];
  }

  async remove(id) {
    await this.load();
    const originalLength = this._entries.length;
    this._entries = this._entries.filter((item) => item.id !== id);
    if (this._entries.length !== originalLength) {
      await this._save();
      return true;
    }
    return false;
  }

  async _save() {
    const now = Date.now();
    if (now - this.lastSaveTime < this.saveThrottleMs) {
      // FIX H-6: Mark that a save is needed, so throttled callback uses current entries
      this._needsSave = true;
      if (!this.pendingSave) {
        this.pendingSave = setTimeout(
          () => {
            this.pendingSave = null;
            // FIX H-6: Only save if still needed (entries may have changed multiple times)
            if (this._needsSave) {
              this._save();
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
    // FIX H-6: Clear the needsSave flag since we're saving now
    this._needsSave = false;
    try {
      await fs.mkdir(path.dirname(this.filePath), { recursive: true });
      const payload = {
        items: this._entries,
        lastUpdated: new Date().toISOString()
      };
      const tempPath = `${this.filePath}.tmp`;
      await fs.writeFile(tempPath, JSON.stringify(payload, null, 2));
      await fs.rename(tempPath, this.filePath);
      logger.debug('[FeedbackMemoryStore] Saved feedback memory');
    } catch (error) {
      logger.warn('[FeedbackMemoryStore] Failed to save memory file:', error.message);
      // FIX H-6: Clear pendingSave on error to allow future saves
      this.pendingSave = null;
    }
  }

  cancelPendingSave() {
    if (this.pendingSave) {
      clearTimeout(this.pendingSave);
      this.pendingSave = null;
    }
    this._needsSave = false;
  }

  /**
   * Shutdown the store, flushing any pending saves before stopping
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

    // FIX MED-1: If there's pending data to save, save it immediately before shutdown
    if (this._needsSave && this._loaded) {
      logger.info('[FeedbackMemoryStore] Flushing pending save on shutdown');
      try {
        // Reset throttle time to allow immediate save
        this.lastSaveTime = 0;
        await this._save();
      } catch (error) {
        logger.error(
          '[FeedbackMemoryStore] Failed to flush pending save on shutdown:',
          error.message
        );
      }
    }

    this._needsSave = false;
    logger.debug('[FeedbackMemoryStore] Shutdown complete');
  }
}

module.exports = { FeedbackMemoryStore };

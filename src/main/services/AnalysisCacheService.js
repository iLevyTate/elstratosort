const crypto = require('crypto');
const { logger } = require('../../shared/logger');
const { createSingletonHelpers } = require('../../shared/singletonFactory');

logger.setContext('AnalysisCacheService');

class AnalysisCacheService {
  constructor() {
    this.maxEntries = 200;
    this.ttlMs = 3600000; // 1 hour
    this.cache = new Map(); // key -> { value, timestamp }
  }

  /**
   * Generate a cache key for text content and analysis options
   */
  generateKey(textContent, model, smartFolders) {
    // Limit input size to prevent excessive hash computation
    const MAX_TEXT_LENGTH = 50000; // 50KB max for hash key
    const truncatedText =
      textContent?.length > MAX_TEXT_LENGTH ? textContent.slice(0, MAX_TEXT_LENGTH) : textContent;

    const hasher = crypto.createHash('sha1');
    // Include original length to prevent hash collision
    hasher.update(`${textContent?.length || 0}:`);
    hasher.update(truncatedText || '');
    hasher.update('|');
    hasher.update(String(model || ''));
    hasher.update('|');
    try {
      const foldersKey = Array.isArray(smartFolders)
        ? smartFolders
            .map((f) => `${f?.name || ''}:${(f?.description || '').slice(0, 64)}`)
            .join(',')
        : '';
      hasher.update(foldersKey);
    } catch (error) {
      // Expected: Continue with partial key if folder data is malformed
    }
    return hasher.digest('hex');
  }

  /**
   * Generate a file signature for caching based on metadata
   */
  generateFileSignature(filePath, stats) {
    if (!stats) return null;
    return `file:${filePath}:${stats.size}:${stats.mtimeMs}`;
  }

  get(key) {
    const entry = this.cache.get(key);
    if (!entry) return null;

    // Check TTL
    if (Date.now() - entry.timestamp > this.ttlMs) {
      this.cache.delete(key);
      return null;
    }

    // LRU: Move to end by re-inserting
    this.cache.delete(key);
    this.cache.set(key, { ...entry, timestamp: Date.now() });
    return entry.value;
  }

  set(key, value) {
    // Evict oldest entry if at capacity (LRU eviction)
    if (this.cache.size >= this.maxEntries) {
      const oldestKey = this.cache.keys().next().value;
      this.cache.delete(oldestKey);
    }

    this.cache.set(key, {
      value,
      timestamp: Date.now()
    });
  }

  clear() {
    this.cache.clear();
  }

  getStats() {
    return {
      size: this.cache.size,
      maxEntries: this.maxEntries
    };
  }

  shutdown() {
    this.clear();
  }
}

// Use shared singleton factory
const { getInstance, createInstance, registerWithContainer, resetInstance } =
  createSingletonHelpers({
    ServiceClass: AnalysisCacheService,
    serviceId: 'ANALYSIS_CACHE',
    serviceName: 'AnalysisCacheService',
    containerPath: './ServiceContainer',
    shutdownMethod: 'shutdown'
  });

module.exports = AnalysisCacheService;
module.exports.getInstance = getInstance;
module.exports.createInstance = createInstance;
module.exports.registerWithContainer = registerWithContainer;
module.exports.resetInstance = resetInstance;

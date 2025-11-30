const fs = require('fs').promises;
const path = require('path');
const { app } = require('electron');
const crypto = require('crypto');
const { logger } = require('../../shared/logger');
const { get: getConfig } = require('../../shared/config');
const { CACHE, LIMITS } = require('../../shared/performanceConstants');
logger.setContext('AnalysisHistoryService');

class AnalysisHistoryService {
  constructor() {
    this.userDataPath = app.getPath('userData');
    this.historyPath = path.join(this.userDataPath, 'analysis-history.json');
    this.indexPath = path.join(this.userDataPath, 'analysis-index.json');
    this.configPath = path.join(this.userDataPath, 'analysis-config.json');

    this.analysisHistory = null;
    this.analysisIndex = null;
    this.config = null;
    this.initialized = false;

    // Schema version for future migration support
    this.SCHEMA_VERSION = '1.0.0';
    this.MAX_HISTORY_ENTRIES = LIMITS.MAX_HISTORY_ENTRIES;

    // Performance optimization: Multi-level caching system
    // Cache TTLs are tiered based on how frequently data changes (from unified config)
    this.CACHE_TTL_MS = getConfig('PERFORMANCE.cacheTtlShort', 5000); // 5 second cache for frequently accessed data
    this.STATS_CACHE_TTL_MS = getConfig('PERFORMANCE.cacheTtlMedium', 30000); // 30 second cache for statistics (computed values)
    this.SEARCH_CACHE_TTL_MS = CACHE.SEARCH_CACHE_TTL_MS;

    // Cache stores
    this._cache = {
      // Sorted entries cache for getRecentAnalysis - avoids O(n log n) sort
      sortedEntries: null,
      sortedEntriesTime: 0,
      sortedEntriesValid: false,

      // Statistics cache - avoids full iteration for computed stats
      statistics: null,
      statisticsTime: 0,

      // Search results cache - keyed by query hash
      searchResults: new Map(),
      searchResultsMaxSize: CACHE.MAX_LRU_CACHE / 2, // LRU cache size limit

      // Category/tag query caches with pagination support
      categoryResults: new Map(),
      tagResults: new Map(),

      // Incremental statistics - updated on each record/delete
      // These avoid recalculating totals from scratch
      incrementalStats: {
        totalConfidence: 0,
        totalProcessingTime: 0,
        entryCount: 0,
        initialized: false,
      },
    };

    // Performance: Track if full recalculation is needed
    this._statsNeedFullRecalc = true;
  }

  /**
   * Invalidate all caches - called when data structure changes significantly
   */
  _invalidateCaches() {
    this._cache.sortedEntries = null;
    this._cache.sortedEntriesValid = false;
    this._cache.statistics = null;
    this._cache.searchResults.clear();
    this._cache.categoryResults.clear();
    this._cache.tagResults.clear();
    this._statsNeedFullRecalc = true;
  }

  /**
   * Invalidate only caches affected by adding a new entry
   * More surgical than full invalidation - preserves search caches
   */
  _invalidateCachesOnAdd() {
    this._cache.sortedEntriesValid = false;
    this._cache.statistics = null;
    // Don't clear search caches - new entry won't affect existing searches much
    // Category/tag caches need refresh since new entry may belong to them
    this._cache.categoryResults.clear();
    this._cache.tagResults.clear();
  }

  /**
   * Invalidate only caches affected by removing entries
   */
  _invalidateCachesOnRemove() {
    this._invalidateCaches(); // Full invalidation needed on removal
  }

  /**
   * LRU cache helper - evict oldest entries when size exceeded
   */
  _maintainCacheSize(cacheMap, maxSize) {
    if (cacheMap.size > maxSize) {
      // Remove oldest entries (first inserted)
      const keysToRemove = Array.from(cacheMap.keys()).slice(
        0,
        cacheMap.size - maxSize,
      );
      keysToRemove.forEach((key) => cacheMap.delete(key));
    }
  }

  /**
   * Generate cache key for search queries
   */
  _getSearchCacheKey(query, options) {
    return `${query}:${options.limit || 100}:${options.offset || 0}`;
  }

  async ensureParentDirectory(filePath) {
    const parentDirectory = path.dirname(filePath);
    await fs.mkdir(parentDirectory, { recursive: true });
  }

  async initialize() {
    if (this.initialized) return;

    try {
      await this.loadConfig();
      await this.loadHistory();
      await this.loadIndex();
      this.initialized = true;
      logger.info('[AnalysisHistoryService] Initialized successfully');
    } catch (error) {
      logger.error('[AnalysisHistoryService] Failed to initialize', {
        error: error.message,
      });
      await this.createDefaultStructures();
    }
  }

  async loadConfig() {
    try {
      const configData = await fs.readFile(this.configPath, 'utf8');
      this.config = JSON.parse(configData);
    } catch (error) {
      this.config = this.getDefaultConfig();
      await this.saveConfig();
    }
  }

  getDefaultConfig() {
    return {
      schemaVersion: this.SCHEMA_VERSION,
      maxHistoryEntries: this.MAX_HISTORY_ENTRIES,
      retentionDays: 365, // Keep analysis for 1 year
      enableRAG: true,
      enableFullTextSearch: true,
      compressionEnabled: false, // For future use
      backupEnabled: true,
      backupFrequencyDays: 7,
      lastBackup: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
  }

  async loadHistory() {
    try {
      const historyData = await fs.readFile(this.historyPath, 'utf8');
      this.analysisHistory = JSON.parse(historyData);

      // Validate schema version
      if (this.analysisHistory.schemaVersion !== this.SCHEMA_VERSION) {
        await this.migrateHistory();
      }
    } catch (error) {
      this.analysisHistory = this.createEmptyHistory();
      await this.saveHistory();
    }
  }

  createEmptyHistory() {
    return {
      schemaVersion: this.SCHEMA_VERSION,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      totalAnalyzed: 0,
      totalSize: 0,
      entries: {},
      metadata: {
        lastCleanup: null,
        totalEntries: 0,
        averageAnalysisTime: 0,
      },
    };
  }

  async loadIndex() {
    try {
      const indexData = await fs.readFile(this.indexPath, 'utf8');
      this.analysisIndex = JSON.parse(indexData);
    } catch (error) {
      this.analysisIndex = this.createEmptyIndex();
      await this.saveIndex();
    }
  }

  createEmptyIndex() {
    return {
      schemaVersion: this.SCHEMA_VERSION,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      fileHashes: {},
      pathLookup: {},
      tagIndex: {},
      categoryIndex: {},
      dateIndex: {},
      sizeIndex: {},
      lastOptimized: null,
    };
  }

  async recordAnalysis(fileInfo, analysisResults) {
    await this.initialize();

    const timestamp = new Date().toISOString();
    const fileHash = this.generateFileHash(
      fileInfo.path,
      fileInfo.size,
      fileInfo.lastModified,
    );

    const analysisEntry = {
      id: crypto.randomUUID(),
      fileHash: fileHash,
      timestamp: timestamp,

      // File information
      originalPath: fileInfo.path,
      fileName: path.basename(fileInfo.path),
      fileExtension: path.extname(fileInfo.path).toLowerCase(),
      fileSize: fileInfo.size,
      lastModified: fileInfo.lastModified,
      mimeType: fileInfo.mimeType || null,

      // Analysis results
      analysis: {
        subject: analysisResults.subject || null,
        category: analysisResults.category || null,
        tags: analysisResults.tags || [],
        confidence: analysisResults.confidence || 0,
        summary: analysisResults.summary || null,
        extractedText: analysisResults.extractedText || null,
        keyEntities: analysisResults.keyEntities || [],
        dates: analysisResults.dates || [],
        amounts: analysisResults.amounts || [],
        language: analysisResults.language || null,
        sentiment: analysisResults.sentiment || null,
      },

      // Processing metadata
      processing: {
        model: analysisResults.model || 'unknown',
        processingTimeMs: analysisResults.processingTime || 0,
        version: this.SCHEMA_VERSION,
        errorCount: analysisResults.errorCount || 0,
        warnings: analysisResults.warnings || [],
      },

      // Organization results (if file was moved/renamed)
      organization: {
        suggested: analysisResults.suggestedPath || null,
        actual: analysisResults.actualPath || null,
        renamed: analysisResults.renamed || false,
        newName: analysisResults.newName || null,
        smartFolder: analysisResults.smartFolder || null,
      },

      // Future expansion fields
      embedding: null, // For RAG functionality
      relations: [], // Related files
      userFeedback: null, // User corrections/ratings
      exportHistory: [], // Export/share history
      accessCount: 0,
      lastAccessed: timestamp,
    };

    // Store the entry
    this.analysisHistory.entries[analysisEntry.id] = analysisEntry;
    this.analysisHistory.totalAnalyzed++;
    this.analysisHistory.totalSize += fileInfo.size;
    this.analysisHistory.updatedAt = timestamp;
    this.analysisHistory.metadata.totalEntries++;

    // Update indexes
    await this.updateIndexes(analysisEntry);

    // Update incremental stats (avoids full recalculation)
    this._updateIncrementalStatsOnAdd(analysisEntry);

    // Invalidate relevant caches (surgical invalidation, not full)
    this._invalidateCachesOnAdd();

    // Save to disk
    // FIX: Use Promise.allSettled to ensure both operations complete even if one fails
    const saveResults = await Promise.allSettled([this.saveHistory(), this.saveIndex()]);
    saveResults.forEach((result, index) => {
      if (result.status === 'rejected') {
        logger.warn(`[ANALYSIS-HISTORY] Save operation ${index} failed:`, result.reason?.message);
      }
    });

    // Cleanup if needed
    await this.performMaintenanceIfNeeded();

    return analysisEntry.id;
  }

  async updateIndexes(entry) {
    const timestamp = new Date().toISOString();
    this.analysisIndex.updatedAt = timestamp;

    // File hash index
    this.analysisIndex.fileHashes[entry.fileHash] = entry.id;

    // Path lookup index
    this.analysisIndex.pathLookup[entry.originalPath] = entry.id;

    // Tag index
    if (entry.analysis.tags) {
      entry.analysis.tags.forEach((tag) => {
        if (!this.analysisIndex.tagIndex[tag]) {
          this.analysisIndex.tagIndex[tag] = [];
        }
        this.analysisIndex.tagIndex[tag].push(entry.id);
      });
    }

    // Category index
    if (entry.analysis.category) {
      if (!this.analysisIndex.categoryIndex[entry.analysis.category]) {
        this.analysisIndex.categoryIndex[entry.analysis.category] = [];
      }
      this.analysisIndex.categoryIndex[entry.analysis.category].push(entry.id);
    }

    // Date index (by month)
    const dateKey = entry.timestamp.substring(0, 7); // YYYY-MM
    if (!this.analysisIndex.dateIndex[dateKey]) {
      this.analysisIndex.dateIndex[dateKey] = [];
    }
    this.analysisIndex.dateIndex[dateKey].push(entry.id);

    // Size index (by size ranges)
    const sizeRange = this.getSizeRange(entry.fileSize);
    if (!this.analysisIndex.sizeIndex[sizeRange]) {
      this.analysisIndex.sizeIndex[sizeRange] = [];
    }
    this.analysisIndex.sizeIndex[sizeRange].push(entry.id);
  }

  getSizeRange(size) {
    if (size < 1024) return 'tiny'; // < 1KB
    if (size < 1024 * 1024) return 'small'; // < 1MB
    if (size < 10 * 1024 * 1024) return 'medium'; // < 10MB
    if (size < 100 * 1024 * 1024) return 'large'; // < 100MB
    return 'huge'; // >= 100MB
  }

  generateFileHash(filePath, size, lastModified) {
    const hashInput = `${filePath}:${size}:${lastModified}`;
    return crypto
      .createHash('sha256')
      .update(hashInput)
      .digest('hex')
      .substring(0, 16);
  }

  /**
   * Search analysis entries with caching and pagination
   * Performance optimizations:
   * - LRU cache for repeated queries
   * - Early exit when max results reached (for simple queries)
   * - Optimized scoring with pre-computed lowercase fields
   *
   * @param {string} query - Search query
   * @param {Object} options - Search options
   * @param {number} options.limit - Maximum results to return (default: 100)
   * @param {number} options.offset - Offset for pagination (default: 0)
   * @param {boolean} options.skipCache - Force bypass cache (default: false)
   * @returns {Promise<{results: Array, total: number, hasMore: boolean, fromCache: boolean}>}
   */
  async searchAnalysis(query, options = {}) {
    await this.initialize();

    const { limit = 100, offset = 0, skipCache = false } = options;
    const cacheKey = this._getSearchCacheKey(query, { limit: 1000, offset: 0 }); // Cache full results
    const now = Date.now();

    // Check cache for this query (cache stores full results, we paginate from cache)
    if (!skipCache && this._cache.searchResults.has(cacheKey)) {
      const cached = this._cache.searchResults.get(cacheKey);
      if (now - cached.time < this.SEARCH_CACHE_TTL_MS) {
        const paginatedResults = cached.results.slice(offset, offset + limit);
        return {
          results: paginatedResults,
          total: cached.results.length,
          hasMore: offset + limit < cached.results.length,
          fromCache: true,
        };
      }
      // Cache expired, remove it
      this._cache.searchResults.delete(cacheKey);
    }

    const queryLower = query.toLowerCase();
    const allResults = [];
    const entries = Object.values(this.analysisHistory.entries);

    // Performance: Pre-compute search for each entry
    for (let i = 0; i < entries.length; i++) {
      const entry = entries[i];
      let score = 0;

      // Search in file name (highest weight)
      const fileNameLower = entry.fileName.toLowerCase();
      if (fileNameLower.includes(queryLower)) {
        score += 10;
        // Exact match bonus
        if (fileNameLower === queryLower) {
          score += 5;
        }
      }

      // Search in analysis fields
      if (entry.analysis.subject) {
        const subjectLower = entry.analysis.subject.toLowerCase();
        if (subjectLower.includes(queryLower)) {
          score += 8;
        }
      }

      if (entry.analysis.summary) {
        const summaryLower = entry.analysis.summary.toLowerCase();
        if (summaryLower.includes(queryLower)) {
          score += 6;
        }
      }

      // Search in tags (optimized - early exit on first match for scoring)
      if (entry.analysis.tags && entry.analysis.tags.length > 0) {
        for (const tag of entry.analysis.tags) {
          if (tag.toLowerCase().includes(queryLower)) {
            score += 4;
            // Only count first match for performance
            break;
          }
        }
      }

      // Search in category
      if (
        entry.analysis.category &&
        entry.analysis.category.toLowerCase().includes(queryLower)
      ) {
        score += 5;
      }

      // Search in extracted text (lower priority, only if no other matches)
      // Skip this expensive search if we already have matches
      if (
        score === 0 &&
        entry.analysis.extractedText &&
        entry.analysis.extractedText.toLowerCase().includes(queryLower)
      ) {
        score += 3;
      }

      if (score > 0) {
        allResults.push({
          ...entry,
          searchScore: score,
        });
      }
    }

    // Sort by score (descending), then by timestamp (most recent first)
    allResults.sort((a, b) => {
      if (b.searchScore !== a.searchScore) {
        return b.searchScore - a.searchScore;
      }
      return new Date(b.timestamp) - new Date(a.timestamp);
    });

    // Cache the full results for future pagination requests
    this._cache.searchResults.set(cacheKey, {
      results: allResults,
      time: now,
    });
    this._maintainCacheSize(
      this._cache.searchResults,
      this._cache.searchResultsMaxSize,
    );

    // Return paginated results
    const paginatedResults = allResults.slice(offset, offset + limit);
    return {
      results: paginatedResults,
      total: allResults.length,
      hasMore: offset + limit < allResults.length,
      fromCache: false,
    };
  }

  async getAnalysisByPath(filePath) {
    await this.initialize();
    const entryId = this.analysisIndex.pathLookup[filePath];
    return entryId ? this.analysisHistory.entries[entryId] : null;
  }

  /**
   * Get analysis entries by category with pagination and caching
   * @param {string} category - Category to filter by
   * @param {Object} options - Query options
   * @param {number} options.limit - Maximum results (default: 100)
   * @param {number} options.offset - Offset for pagination (default: 0)
   * @param {string} options.sortBy - Sort field: 'timestamp', 'fileName', 'confidence' (default: 'timestamp')
   * @param {string} options.sortOrder - Sort order: 'asc' or 'desc' (default: 'desc')
   * @returns {Promise<{results: Array, total: number, hasMore: boolean}>}
   */
  async getAnalysisByCategory(
    category,
    options = {},
  ) {
    await this.initialize();

    const {
      limit = 100,
      offset = 0,
      sortBy = 'timestamp',
      sortOrder = 'desc',
    } = options;
    const cacheKey = `${category}:${sortBy}:${sortOrder}`;
    const now = Date.now();

    // Check cache
    if (this._cache.categoryResults.has(cacheKey)) {
      const cached = this._cache.categoryResults.get(cacheKey);
      if (now - cached.time < this.CACHE_TTL_MS) {
        const paginatedResults = cached.results.slice(offset, offset + limit);
        return {
          results: paginatedResults,
          total: cached.results.length,
          hasMore: offset + limit < cached.results.length,
        };
      }
      this._cache.categoryResults.delete(cacheKey);
    }

    const entryIds = this.analysisIndex.categoryIndex[category] || [];
    let entries = entryIds
      .map((id) => this.analysisHistory.entries[id])
      .filter(Boolean);

    // Sort entries
    entries = this._sortEntries(entries, sortBy, sortOrder);

    // Cache sorted results
    this._cache.categoryResults.set(cacheKey, {
      results: entries,
      time: now,
    });
    this._maintainCacheSize(this._cache.categoryResults, 20);

    // Return paginated results
    const paginatedResults = entries.slice(offset, offset + limit);
    return {
      results: paginatedResults,
      total: entries.length,
      hasMore: offset + limit < entries.length,
    };
  }

  /**
   * Get analysis entries by tag with pagination and caching
   * @param {string} tag - Tag to filter by
   * @param {Object} options - Query options
   * @param {number} options.limit - Maximum results (default: 100)
   * @param {number} options.offset - Offset for pagination (default: 0)
   * @param {string} options.sortBy - Sort field: 'timestamp', 'fileName', 'confidence' (default: 'timestamp')
   * @param {string} options.sortOrder - Sort order: 'asc' or 'desc' (default: 'desc')
   * @returns {Promise<{results: Array, total: number, hasMore: boolean}>}
   */
  async getAnalysisByTag(tag, options = {}) {
    await this.initialize();

    const {
      limit = 100,
      offset = 0,
      sortBy = 'timestamp',
      sortOrder = 'desc',
    } = options;
    const cacheKey = `${tag}:${sortBy}:${sortOrder}`;
    const now = Date.now();

    // Check cache
    if (this._cache.tagResults.has(cacheKey)) {
      const cached = this._cache.tagResults.get(cacheKey);
      if (now - cached.time < this.CACHE_TTL_MS) {
        const paginatedResults = cached.results.slice(offset, offset + limit);
        return {
          results: paginatedResults,
          total: cached.results.length,
          hasMore: offset + limit < cached.results.length,
        };
      }
      this._cache.tagResults.delete(cacheKey);
    }

    const entryIds = this.analysisIndex.tagIndex[tag] || [];
    let entries = entryIds
      .map((id) => this.analysisHistory.entries[id])
      .filter(Boolean);

    // Sort entries
    entries = this._sortEntries(entries, sortBy, sortOrder);

    // Cache sorted results
    this._cache.tagResults.set(cacheKey, {
      results: entries,
      time: now,
    });
    this._maintainCacheSize(this._cache.tagResults, 20);

    // Return paginated results
    const paginatedResults = entries.slice(offset, offset + limit);
    return {
      results: paginatedResults,
      total: entries.length,
      hasMore: offset + limit < entries.length,
    };
  }

  /**
   * Helper to sort entries by various fields
   * @private
   */
  _sortEntries(entries, sortBy, sortOrder) {
    const multiplier = sortOrder === 'desc' ? -1 : 1;

    return entries.sort((a, b) => {
      let comparison = 0;
      switch (sortBy) {
        case 'timestamp':
          comparison = new Date(a.timestamp) - new Date(b.timestamp);
          break;
        case 'fileName':
          comparison = a.fileName.localeCompare(b.fileName);
          break;
        case 'confidence':
          comparison =
            (a.analysis.confidence || 0) - (b.analysis.confidence || 0);
          break;
        case 'fileSize':
          comparison = (a.fileSize || 0) - (b.fileSize || 0);
          break;
        default:
          comparison = new Date(a.timestamp) - new Date(b.timestamp);
      }
      return comparison * multiplier;
    });
  }

  /**
   * Get recent analysis entries with caching and pagination
   * Performance: Uses cached sorted array to avoid O(n log n) on every call
   * @param {number} limit - Maximum entries to return (default: 50)
   * @param {number} offset - Offset for pagination (default: 0)
   * @returns {Promise<{results: Array, total: number, hasMore: boolean}>}
   */
  async getRecentAnalysis(limit = 50, offset = 0) {
    await this.initialize();

    const now = Date.now();

    // Check if sorted cache is valid
    if (
      this._cache.sortedEntriesValid &&
      this._cache.sortedEntries &&
      now - this._cache.sortedEntriesTime < this.CACHE_TTL_MS
    ) {
      const results = this._cache.sortedEntries.slice(offset, offset + limit);
      return {
        results,
        total: this._cache.sortedEntries.length,
        hasMore: offset + limit < this._cache.sortedEntries.length,
      };
    }

    // Rebuild sorted cache
    const entries = Object.values(this.analysisHistory.entries);

    // Sort by timestamp descending (most recent first)
    this._cache.sortedEntries = entries.sort(
      (a, b) => new Date(b.timestamp) - new Date(a.timestamp),
    );
    this._cache.sortedEntriesValid = true;
    this._cache.sortedEntriesTime = now;

    const results = this._cache.sortedEntries.slice(offset, offset + limit);
    return {
      results,
      total: this._cache.sortedEntries.length,
      hasMore: offset + limit < this._cache.sortedEntries.length,
    };
  }

  /**
   * Get statistics with incremental updates and caching
   * Performance optimizations:
   * - Uses pre-computed incremental stats when available
   * - Longer cache TTL since stats don't need real-time accuracy
   * - Avoids full iteration when possible
   */
  async getStatistics() {
    await this.initialize();

    const now = Date.now();

    // Check if cache is valid (use longer TTL for stats)
    if (
      this._cache.statistics &&
      now - this._cache.statisticsTime < this.STATS_CACHE_TTL_MS
    ) {
      return this._cache.statistics;
    }

    // Initialize incremental stats if needed
    if (!this._cache.incrementalStats.initialized || this._statsNeedFullRecalc) {
      await this._recalculateIncrementalStats();
    }

    const entries = Object.values(this.analysisHistory.entries);
    const categories = Object.keys(this.analysisIndex.categoryIndex);
    const tags = Object.keys(this.analysisIndex.tagIndex);

    const entryCount = this._cache.incrementalStats.entryCount;
    const hasEntries = entryCount > 0;

    // Use incremental stats for averages
    const statistics = {
      totalFiles: entryCount,
      totalSize: this.analysisHistory.totalSize,
      categoriesCount: categories.length,
      tagsCount: tags.length,
      // Use pre-computed totals for averages
      averageConfidence: hasEntries
        ? this._cache.incrementalStats.totalConfidence / entryCount
        : 0,
      averageProcessingTime: hasEntries
        ? this._cache.incrementalStats.totalProcessingTime / entryCount
        : 0,
      // For min/max timestamps, use sorted cache if available
      oldestAnalysis: hasEntries ? this._getOldestTimestamp(entries) : null,
      newestAnalysis: hasEntries ? this._getNewestTimestamp(entries) : null,
      // Category and tag distribution (top 10)
      topCategories: this._getTopItems(this.analysisIndex.categoryIndex, 10),
      topTags: this._getTopItems(this.analysisIndex.tagIndex, 10),
      // Size distribution
      sizeDistribution: this._getSizeDistribution(),
      // Additional metadata
      isEmpty: !hasEntries,
      lastUpdated: this.analysisHistory.updatedAt,
    };

    // Cache the result
    this._cache.statistics = statistics;
    this._cache.statisticsTime = now;

    return statistics;
  }

  /**
   * Recalculate incremental stats from scratch
   * Called on initialization or when data is loaded from disk
   * @private
   */
  async _recalculateIncrementalStats() {
    const entries = Object.values(this.analysisHistory.entries);

    let totalConfidence = 0;
    let totalProcessingTime = 0;

    for (const entry of entries) {
      totalConfidence += entry.analysis.confidence || 0;
      totalProcessingTime += entry.processing.processingTimeMs || 0;
    }

    this._cache.incrementalStats = {
      totalConfidence,
      totalProcessingTime,
      entryCount: entries.length,
      initialized: true,
    };

    this._statsNeedFullRecalc = false;
  }

  /**
   * Update incremental stats when a new entry is added
   * @private
   */
  _updateIncrementalStatsOnAdd(entry) {
    if (!this._cache.incrementalStats.initialized) {
      return; // Will be calculated on next getStatistics call
    }

    this._cache.incrementalStats.totalConfidence +=
      entry.analysis.confidence || 0;
    this._cache.incrementalStats.totalProcessingTime +=
      entry.processing.processingTimeMs || 0;
    this._cache.incrementalStats.entryCount++;
  }

  /**
   * Update incremental stats when an entry is removed
   * @private
   */
  _updateIncrementalStatsOnRemove(entry) {
    if (!this._cache.incrementalStats.initialized) {
      return;
    }

    this._cache.incrementalStats.totalConfidence -=
      entry.analysis.confidence || 0;
    this._cache.incrementalStats.totalProcessingTime -=
      entry.processing.processingTimeMs || 0;
    this._cache.incrementalStats.entryCount--;

    // Ensure we don't go negative due to floating point errors
    if (this._cache.incrementalStats.entryCount < 0) {
      this._cache.incrementalStats.entryCount = 0;
    }
  }

  /**
   * Get oldest timestamp efficiently
   * @private
   */
  _getOldestTimestamp(entries) {
    // If sorted cache exists, use it (last item is oldest)
    if (this._cache.sortedEntriesValid && this._cache.sortedEntries?.length) {
      return this._cache.sortedEntries[this._cache.sortedEntries.length - 1]
        .timestamp;
    }

    // Otherwise find it
    // FIX: Guard against empty entries array to prevent crash
    if (!entries || entries.length === 0) {
      return null;
    }
    let oldest = entries[0];
    for (let i = 1; i < entries.length; i++) {
      if (new Date(entries[i].timestamp) < new Date(oldest.timestamp)) {
        oldest = entries[i];
      }
    }
    return oldest.timestamp;
  }

  /**
   * Get newest timestamp efficiently
   * @private
   */
  _getNewestTimestamp(entries) {
    // If sorted cache exists, use it (first item is newest)
    if (this._cache.sortedEntriesValid && this._cache.sortedEntries?.length) {
      return this._cache.sortedEntries[0].timestamp;
    }

    // Otherwise find it
    // FIX: Guard against empty entries array to prevent crash
    if (!entries || entries.length === 0) {
      return null;
    }
    let newest = entries[0];
    for (let i = 1; i < entries.length; i++) {
      if (new Date(entries[i].timestamp) > new Date(newest.timestamp)) {
        newest = entries[i];
      }
    }
    return newest.timestamp;
  }

  /**
   * Get top N items from an index by count
   * @private
   */
  _getTopItems(index, limit) {
    return Object.entries(index)
      .map(([name, ids]) => ({ name, count: ids.length }))
      .sort((a, b) => b.count - a.count)
      .slice(0, limit);
  }

  /**
   * Get size distribution from index
   * @private
   */
  _getSizeDistribution() {
    const distribution = {};
    for (const [range, ids] of Object.entries(this.analysisIndex.sizeIndex)) {
      distribution[range] = ids.length;
    }
    return distribution;
  }

  /**
   * Get quick summary stats without full calculation
   * Useful for UI that just needs counts
   */
  async getQuickStats() {
    await this.initialize();

    return {
      totalFiles: Object.keys(this.analysisHistory.entries).length,
      totalSize: this.analysisHistory.totalSize,
      categoriesCount: Object.keys(this.analysisIndex.categoryIndex).length,
      tagsCount: Object.keys(this.analysisIndex.tagIndex).length,
      lastUpdated: this.analysisHistory.updatedAt,
    };
  }

  /**
   * Get analysis entries by date range using the date index
   * Performance: Uses date index for O(1) month lookups instead of full scan
   * @param {Date|string} startDate - Start of date range
   * @param {Date|string} endDate - End of date range
   * @param {Object} options - Query options (limit, offset, sortBy, sortOrder)
   * @returns {Promise<{results: Array, total: number, hasMore: boolean}>}
   */
  async getAnalysisByDateRange(startDate, endDate, options = {}) {
    await this.initialize();

    const { limit = 100, offset = 0, sortBy = 'timestamp', sortOrder = 'desc' } = options;
    const start = new Date(startDate);
    const end = new Date(endDate);

    // Get all month keys in range
    const monthKeys = [];
    const current = new Date(start);
    current.setDate(1); // Start of month

    while (current <= end) {
      const key = current.toISOString().substring(0, 7); // YYYY-MM
      if (this.analysisIndex.dateIndex[key]) {
        monthKeys.push(key);
      }
      current.setMonth(current.getMonth() + 1);
    }

    // Collect entry IDs from relevant months
    const entryIds = new Set();
    for (const key of monthKeys) {
      for (const id of this.analysisIndex.dateIndex[key]) {
        entryIds.add(id);
      }
    }

    // Filter to exact date range and resolve entries
    let entries = [];
    for (const id of entryIds) {
      const entry = this.analysisHistory.entries[id];
      if (entry) {
        const entryDate = new Date(entry.timestamp);
        if (entryDate >= start && entryDate <= end) {
          entries.push(entry);
        }
      }
    }

    // Sort entries
    entries = this._sortEntries(entries, sortBy, sortOrder);

    // Return paginated results
    const paginatedResults = entries.slice(offset, offset + limit);
    return {
      results: paginatedResults,
      total: entries.length,
      hasMore: offset + limit < entries.length,
    };
  }

  /**
   * Get all available categories with counts
   * Performance: Uses index directly, no iteration over entries
   */
  async getCategories() {
    await this.initialize();

    return Object.entries(this.analysisIndex.categoryIndex)
      .map(([name, ids]) => ({ name, count: ids.length }))
      .sort((a, b) => b.count - a.count);
  }

  /**
   * Get all available tags with counts
   * Performance: Uses index directly, no iteration over entries
   */
  async getTags() {
    await this.initialize();

    return Object.entries(this.analysisIndex.tagIndex)
      .map(([name, ids]) => ({ name, count: ids.length }))
      .sort((a, b) => b.count - a.count);
  }

  /**
   * Prefetch/warm cache for expected queries
   * Call this on app startup or before UI needs data
   */
  async warmCache() {
    await this.initialize();

    // Warm the sorted entries cache
    await this.getRecentAnalysis(50);

    // Warm incremental stats
    if (!this._cache.incrementalStats.initialized) {
      await this._recalculateIncrementalStats();
    }

    logger.debug('[AnalysisHistoryService] Cache warmed');
  }

  /**
   * Clear all caches - useful for debugging or forcing fresh data
   */
  clearCaches() {
    this._invalidateCaches();
    logger.debug('[AnalysisHistoryService] Caches cleared');
  }

  async performMaintenanceIfNeeded() {
    // Cleanup old entries if we exceed the limit
    const entryCount = Object.keys(this.analysisHistory.entries).length;
    if (entryCount > this.config.maxHistoryEntries) {
      await this.cleanupOldEntries();
    }

    // Remove entries older than retention period
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - this.config.retentionDays);
    await this.removeExpiredEntries(cutoffDate);
  }

  async cleanupOldEntries() {
    const entries = Object.entries(this.analysisHistory.entries);
    const sortedEntries = entries.sort(
      (a, b) => new Date(a[1].timestamp) - new Date(b[1].timestamp),
    );

    const toRemove = sortedEntries.slice(
      0,
      entries.length - this.config.maxHistoryEntries,
    );

    for (const [id, entry] of toRemove) {
      delete this.analysisHistory.entries[id];
      // Update incremental stats before removing from indexes
      this._updateIncrementalStatsOnRemove(entry);
      await this.removeFromIndexes(entry);
    }

    // Invalidate caches after bulk removal
    if (toRemove.length > 0) {
      this._invalidateCachesOnRemove();
    }

    this.analysisHistory.metadata.lastCleanup = new Date().toISOString();
    await this.saveHistory();
    await this.saveIndex();
  }

  async removeExpiredEntries(cutoffDate) {
    const entries = Object.entries(this.analysisHistory.entries);
    let removedCount = 0;

    for (const [id, entry] of entries) {
      if (new Date(entry.timestamp) < cutoffDate) {
        delete this.analysisHistory.entries[id];
        // Update incremental stats before removing from indexes
        this._updateIncrementalStatsOnRemove(entry);
        await this.removeFromIndexes(entry);
        removedCount++;
      }
    }

    if (removedCount > 0) {
      // Invalidate caches after bulk removal
      this._invalidateCachesOnRemove();
      logger.info(
        `[AnalysisHistoryService] Removed ${removedCount} expired analysis entries`,
      );
      await this.saveHistory();
      await this.saveIndex();
    }
  }

  async removeFromIndexes(entry) {
    // Remove from various indexes
    delete this.analysisIndex.fileHashes[entry.fileHash];
    delete this.analysisIndex.pathLookup[entry.originalPath];

    // Remove from tag index
    if (entry.analysis.tags) {
      entry.analysis.tags.forEach((tag) => {
        const tagEntries = this.analysisIndex.tagIndex[tag] || [];
        this.analysisIndex.tagIndex[tag] = tagEntries.filter(
          (id) => id !== entry.id,
        );
        if (this.analysisIndex.tagIndex[tag].length === 0) {
          delete this.analysisIndex.tagIndex[tag];
        }
      });
    }

    // Remove from category index
    if (entry.analysis.category) {
      const categoryEntries =
        this.analysisIndex.categoryIndex[entry.analysis.category] || [];
      this.analysisIndex.categoryIndex[entry.analysis.category] =
        categoryEntries.filter((id) => id !== entry.id);
      if (
        this.analysisIndex.categoryIndex[entry.analysis.category].length === 0
      ) {
        delete this.analysisIndex.categoryIndex[entry.analysis.category];
      }
    }

    // Remove from date index
    const dateKey = entry.timestamp.substring(0, 7); // YYYY-MM
    if (this.analysisIndex.dateIndex[dateKey]) {
      this.analysisIndex.dateIndex[dateKey] = this.analysisIndex.dateIndex[
        dateKey
      ].filter((id) => id !== entry.id);
      if (this.analysisIndex.dateIndex[dateKey].length === 0) {
        delete this.analysisIndex.dateIndex[dateKey];
      }
    }

    // Remove from size index
    const sizeRange = this.getSizeRange(entry.fileSize);
    if (this.analysisIndex.sizeIndex[sizeRange]) {
      this.analysisIndex.sizeIndex[sizeRange] = this.analysisIndex.sizeIndex[
        sizeRange
      ].filter((id) => id !== entry.id);
      if (this.analysisIndex.sizeIndex[sizeRange].length === 0) {
        delete this.analysisIndex.sizeIndex[sizeRange];
      }
    }
  }

  async migrateHistory() {
    // Future migration logic for schema changes
    logger.debug(
      '[AnalysisHistoryService] Schema migration not yet implemented',
    );
  }

  async createDefaultStructures() {
    this.config = this.getDefaultConfig();
    this.analysisHistory = this.createEmptyHistory();
    this.analysisIndex = this.createEmptyIndex();

    await Promise.all([
      this.saveConfig(),
      this.saveHistory(),
      this.saveIndex(),
    ]);

    this.initialized = true;
  }

  /**
   * FIX: Atomic write helper - writes to temp file then renames to prevent corruption
   * @param {string} filePath - Target file path
   * @param {string} data - Data to write
   */
  async _atomicWriteFile(filePath, data) {
    const tempPath = filePath + '.tmp.' + Date.now();
    try {
      await fs.writeFile(tempPath, data);
      await fs.rename(tempPath, filePath);
    } catch (error) {
      // Clean up temp file on failure
      try {
        await fs.unlink(tempPath);
      } catch {
        // Ignore cleanup errors
      }
      throw error;
    }
  }

  async saveConfig() {
    this.config.updatedAt = new Date().toISOString();
    await this.ensureParentDirectory(this.configPath);
    // FIX: Use atomic write to prevent corruption on crash
    await this._atomicWriteFile(this.configPath, JSON.stringify(this.config, null, 2));
  }

  async saveHistory() {
    // Note: Cache invalidation is now handled surgically by the calling methods
    // (recordAnalysis, cleanupOldEntries, removeExpiredEntries) to avoid
    // unnecessary full cache invalidation on every save

    this.analysisHistory.updatedAt = new Date().toISOString();
    await this.ensureParentDirectory(this.historyPath);
    // FIX: Use atomic write to prevent corruption on crash
    await this._atomicWriteFile(
      this.historyPath,
      JSON.stringify(this.analysisHistory, null, 2),
    );
  }

  async saveIndex() {
    this.analysisIndex.updatedAt = new Date().toISOString();
    await this.ensureParentDirectory(this.indexPath);
    // FIX: Use atomic write to prevent corruption on crash
    await this._atomicWriteFile(
      this.indexPath,
      JSON.stringify(this.analysisIndex, null, 2),
    );
  }
}

module.exports = AnalysisHistoryService;

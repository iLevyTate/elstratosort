/**
 * SearchService - Hybrid Search with BM25 + Vector Similarity
 *
 * Combines keyword-based BM25 search with semantic vector search
 * using Reciprocal Rank Fusion for optimal result quality.
 *
 * @module services/SearchService
 */

const lunr = require('lunr');
const { logger } = require('../../shared/logger');
const { THRESHOLDS, TIMEOUTS, SEARCH } = require('../../shared/performanceConstants');

logger.setContext('SearchService');

/**
 * Minimum score threshold for results (filters low-quality matches)
 * Uses MIN_SIMILARITY_SCORE from performanceConstants
 */
const MIN_RESULT_SCORE = THRESHOLDS.MIN_SIMILARITY_SCORE;

/**
 * Vector search timeout before falling back to BM25
 */
const VECTOR_SEARCH_TIMEOUT = TIMEOUTS.SEMANTIC_QUERY;

/**
 * Default search options (from performanceConstants.SEARCH)
 */
const DEFAULT_OPTIONS = {
  topK: SEARCH.DEFAULT_TOP_K,
  mode: 'hybrid', // 'vector', 'bm25', 'hybrid'
  vectorWeight: SEARCH.VECTOR_WEIGHT,
  bm25Weight: SEARCH.BM25_WEIGHT,
  minScore: MIN_RESULT_SCORE // Minimum score threshold
};

class SearchService {
  /**
   * Create a new SearchService instance
   *
   * @param {Object} dependencies - Service dependencies
   * @param {Object} dependencies.chromaDbService - ChromaDB service for vector search
   * @param {Object} dependencies.analysisHistoryService - Analysis history for document data
   * @param {Object} dependencies.parallelEmbeddingService - Embedding service for query vectors
   */
  constructor({ chromaDbService, analysisHistoryService, parallelEmbeddingService } = {}) {
    // Validate required dependencies
    if (!chromaDbService) {
      throw new Error('SearchService requires chromaDbService dependency');
    }
    if (!analysisHistoryService) {
      throw new Error('SearchService requires analysisHistoryService dependency');
    }
    if (!parallelEmbeddingService) {
      throw new Error('SearchService requires parallelEmbeddingService dependency');
    }

    this.chromaDb = chromaDbService;
    this.history = analysisHistoryService;
    this.embedding = parallelEmbeddingService;

    this.bm25Index = null;
    this.documentMap = new Map(); // id -> document metadata
    this.indexBuiltAt = null;
    this.indexVersion = 0;

    // Index staleness threshold (15 minutes)
    this.INDEX_STALE_MS = 15 * 60 * 1000;

    // Cached serialized index for faster rebuilds
    this._serializedIndex = null;
    this._serializedDocMap = null;
  }

  /**
   * Check if the BM25 index needs rebuilding
   *
   * @returns {boolean} True if index is stale or missing
   */
  isIndexStale() {
    if (!this.bm25Index || !this.indexBuiltAt) {
      return true;
    }
    return Date.now() - this.indexBuiltAt > this.INDEX_STALE_MS;
  }

  /**
   * Build or rebuild the BM25 index from analysis history
   *
   * @returns {Promise<{success: boolean, indexed: number, error?: string}>}
   */
  async buildBM25Index() {
    try {
      logger.info('[SearchService] Building BM25 index...');

      await this.history.initialize();
      const entries = this.history.analysisHistory?.entries || {};
      const documents = Object.values(entries);

      if (documents.length === 0) {
        logger.warn('[SearchService] No documents to index');
        this.bm25Index = null;
        this.documentMap.clear();
        return { success: true, indexed: 0 };
      }

      // Clear existing document map
      this.documentMap.clear();

      // Build lunr index
      const self = this;
      this.bm25Index = lunr(function () {
        // Configure fields with boosting
        this.ref('id');
        this.field('fileName', { boost: 3 });
        this.field('subject', { boost: 2 });
        this.field('summary', { boost: 1.5 });
        this.field('tags', { boost: 2 });
        this.field('category', { boost: 1.5 });
        this.field('extractedText', { boost: 1 });

        // Add documents
        for (const doc of documents) {
          const analysis = doc.analysis || {};
          const indexDoc = {
            id: doc.id,
            fileName: doc.fileName || '',
            subject: analysis.subject || '',
            summary: analysis.summary || '',
            tags: (analysis.tags || []).join(' '),
            category: analysis.category || '',
            extractedText: self._truncateText(analysis.extractedText, 5000)
          };

          this.add(indexDoc);

          // Store document metadata for result enrichment
          self.documentMap.set(doc.id, {
            id: doc.id,
            path: doc.originalPath,
            name: doc.fileName,
            type: doc.mimeType || 'document',
            subject: analysis.subject,
            summary: analysis.summary,
            tags: analysis.tags || [],
            category: analysis.category
          });
        }
      });

      this.indexBuiltAt = Date.now();
      this.indexVersion++;

      // Cache serialized index for faster subsequent loads
      // Lunr indexes support JSON serialization
      try {
        this._serializedIndex = JSON.stringify(this.bm25Index);
        this._serializedDocMap = JSON.stringify(Array.from(this.documentMap.entries()));
        logger.debug('[SearchService] Index serialized for caching');
      } catch (serializeErr) {
        logger.warn('[SearchService] Failed to serialize index:', serializeErr.message);
      }

      logger.info(`[SearchService] BM25 index built with ${documents.length} documents`);
      return { success: true, indexed: documents.length };
    } catch (error) {
      logger.error('[SearchService] Failed to build BM25 index:', error);
      return { success: false, indexed: 0, error: error.message };
    }
  }

  /**
   * Load index from serialized cache if available
   * Much faster than rebuilding from scratch
   *
   * @returns {boolean} True if loaded from cache
   */
  _tryLoadFromCache() {
    if (!this._serializedIndex || !this._serializedDocMap) {
      return false;
    }

    try {
      const startTime = Date.now();
      this.bm25Index = lunr.Index.load(JSON.parse(this._serializedIndex));
      this.documentMap = new Map(JSON.parse(this._serializedDocMap));
      this.indexBuiltAt = Date.now();

      logger.info(`[SearchService] Index loaded from cache in ${Date.now() - startTime}ms`);
      return true;
    } catch (error) {
      logger.warn('[SearchService] Failed to load from cache:', error.message);
      this._serializedIndex = null;
      this._serializedDocMap = null;
      return false;
    }
  }

  /**
   * Truncate text to a maximum length for indexing
   *
   * @param {string} text - Text to truncate
   * @param {number} maxLength - Maximum length
   * @returns {string} Truncated text
   */
  _truncateText(text, maxLength) {
    if (!text || typeof text !== 'string') return '';
    return text.length > maxLength ? text.slice(0, maxLength) : text;
  }

  /**
   * Search using BM25 keyword matching
   *
   * @param {string} query - Search query
   * @param {number} topK - Number of results to return
   * @returns {Array} Search results with scores
   */
  bm25Search(query, topK = 20) {
    if (!this.bm25Index) {
      logger.warn('[SearchService] BM25 index not built');
      return [];
    }

    try {
      // Escape special lunr characters
      const safeQuery = this._escapeLunrQuery(query);
      const results = this.bm25Index.search(safeQuery);

      return results.slice(0, topK).map((result) => {
        const meta = this.documentMap.get(result.ref) || {};
        return {
          id: result.ref,
          score: result.score,
          metadata: {
            path: meta.path,
            name: meta.name,
            type: meta.type
          },
          source: 'bm25'
        };
      });
    } catch (error) {
      logger.error('[SearchService] BM25 search failed:', error);
      return [];
    }
  }

  /**
   * Escape special characters for lunr query
   *
   * @param {string} query - Raw query string
   * @returns {string} Escaped query
   */
  _escapeLunrQuery(query) {
    if (!query || typeof query !== 'string') return '';

    // Escape lunr special characters: + - && || ! ( ) { } [ ] ^ " ~ * ? : \
    return query.replace(/[+\-&|!(){}[\]^"~*?:\\/]/g, ' ').trim();
  }

  /**
   * Search using vector similarity via ChromaDB
   *
   * @param {string} query - Search query
   * @param {number} topK - Number of results to return
   * @returns {Promise<Array>} Search results with scores
   */
  async vectorSearch(query, topK = 20) {
    try {
      // Generate query embedding
      const embedResult = await this.embedding.embedText(query);
      if (!embedResult || !embedResult.vector) {
        logger.warn('[SearchService] Failed to generate query embedding');
        return [];
      }

      // Query ChromaDB
      const chromaResults = await this.chromaDb.querySimilarFiles(embedResult.vector, topK);

      if (!chromaResults || !Array.isArray(chromaResults)) {
        return [];
      }

      return chromaResults.map((result) => ({
        id: result.id,
        score: result.score || 1 - (result.distance || 0),
        metadata: result.metadata || {},
        source: 'vector'
      }));
    } catch (error) {
      logger.error('[SearchService] Vector search failed:', error);
      return [];
    }
  }

  /**
   * Normalize scores to [0, 1] range using min-max scaling
   *
   * @param {Array} results - Array of results with scores
   * @returns {Array} Results with normalized scores
   */
  _normalizeScores(results) {
    if (!results || results.length === 0) return results;

    const scores = results.map((r) => r.score || 0);
    const minScore = Math.min(...scores);
    const maxScore = Math.max(...scores);
    const range = maxScore - minScore;

    // If all scores are the same, return with score 1.0
    if (range === 0) {
      return results.map((r) => ({ ...r, score: 1.0, originalScore: r.score }));
    }

    return results.map((r) => ({
      ...r,
      score: (r.score - minScore) / range,
      originalScore: r.score
    }));
  }

  /**
   * Combine results using Reciprocal Rank Fusion with score normalization
   *
   * RRF formula: score(d) = sum(1 / (k + rank_i(d)))
   * Enhanced with optional weighted score blending for better ranking
   *
   * @param {Array<Array>} resultSets - Arrays of ranked results
   * @param {number} k - RRF constant (default: 60)
   * @param {Object} options - Fusion options
   * @param {boolean} options.normalizeScores - Whether to normalize source scores (default: true)
   * @param {boolean} options.useScoreBlending - Blend original scores with RRF (default: true)
   * @returns {Array} Fused and re-ranked results
   */
  reciprocalRankFusion(resultSets, k = SEARCH.RRF_K, options = {}) {
    const { normalizeScores = true, useScoreBlending = true } = options;

    const rrfScores = new Map();
    const originalScores = new Map(); // Track original scores for blending
    const resultData = new Map();

    // Normalize scores within each result set for fair comparison
    const normalizedSets = normalizeScores
      ? resultSets.map((set) => this._normalizeScores(set))
      : resultSets;

    for (const results of normalizedSets) {
      for (let rank = 0; rank < results.length; rank++) {
        const result = results[rank];
        const id = result.id;

        // RRF score contribution
        const rrfContribution = 1 / (k + rank + 1);
        rrfScores.set(id, (rrfScores.get(id) || 0) + rrfContribution);

        // Track normalized scores for blending
        if (useScoreBlending) {
          const currentMax = originalScores.get(id) || 0;
          originalScores.set(id, Math.max(currentMax, result.score || 0));
        }

        // Prefer vector search metadata (has current file names) over BM25 (may have old names)
        // Vector search uses ChromaDB which is updated when files are organized
        const existing = resultData.get(id);
        if (!existing || (result.source === 'vector' && existing.source !== 'vector')) {
          resultData.set(id, result);
        }
      }
    }

    // Normalize RRF scores to [0, 1]
    const rrfValues = Array.from(rrfScores.values());
    const maxRrf = Math.max(...rrfValues, SEARCH.MIN_EPSILON);

    // Sort by RRF score
    const fusedResults = Array.from(rrfScores.entries())
      .sort((a, b) => b[1] - a[1])
      .map(([id, rrfScore]) => {
        const original = resultData.get(id) || {};
        const normalizedRrf = rrfScore / maxRrf;

        // Blend RRF with original score for better ranking
        let finalScore = normalizedRrf;
        if (useScoreBlending && originalScores.has(id)) {
          const origScore = originalScores.get(id);
          finalScore =
            SEARCH.RRF_NORMALIZED_WEIGHT * normalizedRrf + SEARCH.RRF_ORIGINAL_WEIGHT * origScore;
        }

        return {
          id,
          score: finalScore,
          rrfScore: normalizedRrf,
          metadata: original.metadata || {},
          sources: original.source ? [original.source] : ['fused']
        };
      });

    return fusedResults;
  }

  /**
   * Execute vector search with timeout, falling back to empty results on timeout
   *
   * @param {string} query - Search query
   * @param {number} topK - Number of results
   * @param {number} timeout - Timeout in milliseconds
   * @returns {Promise<{results: Array, timedOut: boolean}>}
   */
  async _vectorSearchWithTimeout(query, topK, timeout = VECTOR_SEARCH_TIMEOUT) {
    try {
      const result = await Promise.race([
        this.vectorSearch(query, topK).then((results) => ({ results, timedOut: false })),
        new Promise((resolve) =>
          setTimeout(() => resolve({ results: [], timedOut: true }), timeout)
        )
      ]);
      return result;
    } catch (error) {
      logger.warn('[SearchService] Vector search error, falling back:', error.message);
      return { results: [], timedOut: false, error: error.message };
    }
  }

  /**
   * Filter results by minimum score threshold
   *
   * @param {Array} results - Search results
   * @param {number} minScore - Minimum score threshold
   * @returns {Array} Filtered results
   */
  _filterByScore(results, minScore) {
    if (!minScore || minScore <= 0) return results;
    return results.filter((r) => (r.score || 0) >= minScore);
  }

  /**
   * Perform hybrid search combining BM25 and vector search
   *
   * Features:
   * - Score normalization before RRF fusion
   * - Timeout fallback to BM25-only on vector search timeout
   * - Minimum score filtering for quality control
   *
   * @param {string} query - Search query
   * @param {Object} options - Search options
   * @param {number} options.topK - Number of results (default: 20)
   * @param {string} options.mode - Search mode: 'hybrid', 'vector', 'bm25' (default: 'hybrid')
   * @param {number} options.minScore - Minimum score threshold (default: 0.5)
   * @returns {Promise<{success: boolean, results: Array, mode: string}>}
   */
  async hybridSearch(query, options = {}) {
    const {
      topK = DEFAULT_OPTIONS.topK,
      mode = DEFAULT_OPTIONS.mode,
      minScore = DEFAULT_OPTIONS.minScore
    } = options;

    if (!query || typeof query !== 'string' || query.trim().length < 2) {
      return { success: false, results: [], error: 'Query too short' };
    }

    try {
      // Ensure BM25 index is up to date
      if (this.isIndexStale()) {
        await this.buildBM25Index();
      }

      // Handle different search modes
      if (mode === 'bm25') {
        const results = this.bm25Search(query, topK);
        const filtered = this._filterByScore(results, minScore);
        return { success: true, results: filtered, mode: 'bm25' };
      }

      if (mode === 'vector') {
        const results = await this.vectorSearch(query, topK);
        const filtered = this._filterByScore(results, minScore);
        return { success: true, results: filtered, mode: 'vector' };
      }

      // Hybrid mode: combine both search types with timeout protection
      const bm25Results = this.bm25Search(query, topK * 2);
      const { results: vectorResults, timedOut } = await this._vectorSearchWithTimeout(
        query,
        topK * 2
      );

      // If vector search timed out, use BM25-only with degraded mode indicator
      if (timedOut) {
        logger.warn('[SearchService] Vector search timed out, using BM25-only fallback');
        const filtered = this._filterByScore(bm25Results.slice(0, topK), minScore);
        return {
          success: true,
          results: filtered,
          mode: 'bm25-fallback',
          meta: {
            vectorTimedOut: true,
            bm25Count: bm25Results.length
          }
        };
      }

      // Log search results for debugging
      logger.debug('[SearchService] Hybrid search results:', {
        vectorCount: vectorResults.length,
        bm25Count: bm25Results.length
      });

      // Fuse results using enhanced RRF with score normalization
      const fusedResults = this.reciprocalRankFusion([vectorResults, bm25Results]);

      // Apply minimum score filter to fused results
      const filteredResults = this._filterByScore(fusedResults.slice(0, topK), minScore);

      return {
        success: true,
        results: filteredResults,
        mode: 'hybrid',
        meta: {
          vectorCount: vectorResults.length,
          bm25Count: bm25Results.length,
          fusedCount: fusedResults.length,
          filteredCount: filteredResults.length,
          minScoreApplied: minScore
        }
      };
    } catch (error) {
      logger.error('[SearchService] Hybrid search failed:', error);

      // Last resort: try BM25-only on complete failure
      try {
        const bm25Results = this.bm25Search(query, topK);
        if (bm25Results.length > 0) {
          logger.info('[SearchService] Falling back to BM25-only after hybrid failure');
          const filtered = this._filterByScore(bm25Results, minScore);
          return {
            success: true,
            results: filtered,
            mode: 'bm25-fallback',
            meta: { hybridError: error.message }
          };
        }
      } catch (bm25Error) {
        logger.error('[SearchService] BM25 fallback also failed:', bm25Error);
      }

      return {
        success: false,
        results: [],
        error: error.message
      };
    }
  }

  /**
   * Get the current index status
   *
   * @returns {Object} Index status information
   */
  getIndexStatus() {
    return {
      hasIndex: !!this.bm25Index,
      documentCount: this.documentMap.size,
      indexBuiltAt: this.indexBuiltAt,
      indexVersion: this.indexVersion,
      isStale: this.isIndexStale()
    };
  }

  /**
   * Force rebuild the BM25 index
   *
   * @returns {Promise<Object>} Build result
   */
  async rebuildIndex() {
    return this.buildBM25Index();
  }

  /**
   * Clear the BM25 index
   */
  clearIndex() {
    this.bm25Index = null;
    this.documentMap.clear();
    this.indexBuiltAt = null;
    logger.info('[SearchService] BM25 index cleared');
  }

  /**
   * Warm up the search service by pre-building indices
   * Call this during app startup for faster first search
   *
   * @param {Object} options - Warm-up options
   * @param {boolean} [options.buildBM25=true] - Build BM25 index
   * @param {boolean} [options.warmChroma=true] - Warm ChromaDB connection
   * @returns {Promise<{success: boolean, bm25Indexed: number, chromaReady: boolean}>}
   */
  async warmUp(options = {}) {
    const { buildBM25 = true, warmChroma = true } = options;
    const result = { success: true, bm25Indexed: 0, chromaReady: false };

    try {
      logger.info('[SearchService] Starting warm-up...');

      const tasks = [];

      // Build BM25 index in background
      if (buildBM25) {
        tasks.push(
          this.buildBM25Index().then((res) => {
            result.bm25Indexed = res.indexed || 0;
            return res;
          })
        );
      }

      // Warm ChromaDB connection
      if (warmChroma && this.chromaDb) {
        tasks.push(
          this.chromaDb.initialize().then(() => {
            result.chromaReady = true;
            return true;
          })
        );
      }

      await Promise.allSettled(tasks);

      logger.info('[SearchService] Warm-up complete', result);
      return result;
    } catch (error) {
      logger.warn('[SearchService] Warm-up failed:', error.message);
      result.success = false;
      return result;
    }
  }

  /**
   * Get search performance metrics
   *
   * @returns {Object} Performance metrics
   */
  getPerformanceMetrics() {
    return {
      indexStatus: this.getIndexStatus(),
      hasCachedIndex: !!this._serializedIndex,
      cachedIndexSize: this._serializedIndex?.length || 0,
      documentCount: this.documentMap.size
    };
  }
}

module.exports = { SearchService };

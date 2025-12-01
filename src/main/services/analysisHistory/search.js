/**
 * Search
 *
 * Full-text search functionality for analysis history.
 * Includes caching, scoring, and pagination.
 *
 * @module analysisHistory/search
 */

const { getSearchCacheKey, maintainCacheSize } = require('./cacheManager');

/**
 * Search analysis entries with caching and pagination
 * Performance optimizations:
 * - LRU cache for repeated queries
 * - Early exit when max results reached (for simple queries)
 * - Optimized scoring with pre-computed lowercase fields
 *
 * @param {Object} analysisHistory - Analysis history data
 * @param {Object} cache - Cache store
 * @param {number} searchCacheTTL - Search cache TTL in ms
 * @param {string} query - Search query
 * @param {Object} options - Search options
 * @param {number} options.limit - Maximum results to return (default: 100)
 * @param {number} options.offset - Offset for pagination (default: 0)
 * @param {boolean} options.skipCache - Force bypass cache (default: false)
 * @returns {{results: Array, total: number, hasMore: boolean, fromCache: boolean}}
 */
function searchAnalysis(
  analysisHistory,
  cache,
  searchCacheTTL,
  query,
  options = {},
) {
  const { limit = 100, offset = 0, skipCache = false } = options;
  const cacheKey = getSearchCacheKey(query, { limit: 1000, offset: 0 }); // Cache full results
  const now = Date.now();

  // Check cache for this query (cache stores full results, we paginate from cache)
  if (!skipCache && cache.searchResults.has(cacheKey)) {
    const cached = cache.searchResults.get(cacheKey);
    if (now - cached.time < searchCacheTTL) {
      const paginatedResults = cached.results.slice(offset, offset + limit);
      return {
        results: paginatedResults,
        total: cached.results.length,
        hasMore: offset + limit < cached.results.length,
        fromCache: true,
      };
    }
    // Cache expired, remove it
    cache.searchResults.delete(cacheKey);
  }

  const queryLower = query.toLowerCase();
  const allResults = [];
  const entries = Object.values(analysisHistory.entries);

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
  cache.searchResults.set(cacheKey, {
    results: allResults,
    time: now,
  });
  maintainCacheSize(cache.searchResults, cache.searchResultsMaxSize);

  // Return paginated results
  const paginatedResults = allResults.slice(offset, offset + limit);
  return {
    results: paginatedResults,
    total: allResults.length,
    hasMore: offset + limit < allResults.length,
    fromCache: false,
  };
}

module.exports = {
  searchAnalysis,
};

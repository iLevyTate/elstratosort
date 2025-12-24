/**
 * Stats Collector Utility
 *
 * Provides reusable statistics tracking for services and components.
 * Supports common patterns: request counting, latency tracking, rate calculation.
 *
 * @module shared/StatsCollector
 */

/**
 * Create a stats collector with specified counters
 *
 * @param {Object} schema - Object defining stat names and their types
 * @returns {Object} Stats collector with increment, set, get, reset, and getAll methods
 *
 * @example
 * const stats = createStatsCollector({
 *   totalRequests: 'counter',
 *   successfulRequests: 'counter',
 *   failedRequests: 'counter',
 *   avgLatencyMs: 'average',
 *   peakConcurrency: 'max'
 * });
 *
 * stats.increment('totalRequests');
 * stats.recordLatency('avgLatencyMs', 150);
 * stats.updateMax('peakConcurrency', 5);
 */
function createStatsCollector(schema) {
  const counters = {};
  const averages = {};
  const maxValues = {};
  const values = {};

  // Initialize based on schema
  for (const [key, type] of Object.entries(schema)) {
    switch (type) {
      case 'counter':
        counters[key] = 0;
        break;
      case 'average':
        averages[key] = { sum: 0, count: 0 };
        break;
      case 'max':
        maxValues[key] = 0;
        break;
      case 'value':
      default:
        values[key] = null;
        break;
    }
  }

  return {
    /**
     * Increment a counter
     * @param {string} name - Counter name
     * @param {number} amount - Amount to increment (default: 1)
     */
    increment(name, amount = 1) {
      if (name in counters) {
        counters[name] += amount;
      }
    },

    /**
     * Decrement a counter
     * @param {string} name - Counter name
     * @param {number} amount - Amount to decrement (default: 1)
     */
    decrement(name, amount = 1) {
      if (name in counters) {
        counters[name] = Math.max(0, counters[name] - amount);
      }
    },

    /**
     * Record a value for averaging
     * @param {string} name - Average stat name
     * @param {number} value - Value to record
     */
    recordForAverage(name, value) {
      if (name in averages) {
        averages[name].sum += value;
        averages[name].count++;
      }
    },

    /**
     * Update a max value if new value is greater
     * @param {string} name - Max stat name
     * @param {number} value - New value to compare
     */
    updateMax(name, value) {
      if (name in maxValues) {
        maxValues[name] = Math.max(maxValues[name], value);
      }
    },

    /**
     * Set a raw value
     * @param {string} name - Value name
     * @param {*} value - Value to set
     */
    set(name, value) {
      if (name in values) {
        values[name] = value;
      } else if (name in counters) {
        counters[name] = value;
      }
    },

    /**
     * Get a specific stat value
     * @param {string} name - Stat name
     * @returns {*} Stat value
     */
    get(name) {
      if (name in counters) return counters[name];
      if (name in maxValues) return maxValues[name];
      if (name in values) return values[name];
      if (name in averages) {
        const avg = averages[name];
        return avg.count > 0 ? avg.sum / avg.count : 0;
      }
      return undefined;
    },

    /**
     * Get all stats as an object
     * @returns {Object} All stats
     */
    getAll() {
      const result = { ...counters, ...maxValues, ...values };

      // Calculate averages
      for (const [key, avg] of Object.entries(averages)) {
        result[key] = avg.count > 0 ? avg.sum / avg.count : 0;
      }

      return result;
    },

    /**
     * Reset all stats to initial values
     */
    reset() {
      for (const key of Object.keys(counters)) {
        counters[key] = 0;
      }
      for (const key of Object.keys(averages)) {
        averages[key] = { sum: 0, count: 0 };
      }
      for (const key of Object.keys(maxValues)) {
        maxValues[key] = 0;
      }
      for (const key of Object.keys(values)) {
        values[key] = null;
      }
    },

    /**
     * Reset a specific stat
     * @param {string} name - Stat name to reset
     */
    resetOne(name) {
      if (name in counters) counters[name] = 0;
      if (name in averages) averages[name] = { sum: 0, count: 0 };
      if (name in maxValues) maxValues[name] = 0;
      if (name in values) values[name] = null;
    }
  };
}

/**
 * Pre-configured stats collector for request-based services
 *
 * Includes: totalRequests, successfulRequests, failedRequests,
 * retriedRequests, avgLatencyMs, lastError, lastErrorTime
 *
 * @returns {Object} Stats collector configured for request tracking
 */
function createRequestStatsCollector() {
  const collector = createStatsCollector({
    totalRequests: 'counter',
    successfulRequests: 'counter',
    failedRequests: 'counter',
    retriedRequests: 'counter',
    avgLatencyMs: 'average',
    lastError: 'value',
    lastErrorTime: 'value'
  });

  return {
    ...collector,

    /**
     * Record a successful request
     * @param {number} latencyMs - Request latency in milliseconds
     */
    recordSuccess(latencyMs) {
      collector.increment('totalRequests');
      collector.increment('successfulRequests');
      if (latencyMs !== undefined) {
        collector.recordForAverage('avgLatencyMs', latencyMs);
      }
    },

    /**
     * Record a failed request
     * @param {Error|string} error - Error that occurred
     */
    recordFailure(error) {
      collector.increment('totalRequests');
      collector.increment('failedRequests');
      collector.set('lastError', error?.message || String(error));
      collector.set('lastErrorTime', new Date().toISOString());
    },

    /**
     * Record a retry attempt
     */
    recordRetry() {
      collector.increment('retriedRequests');
    },

    /**
     * Get success rate as a percentage
     * @returns {number} Success rate (0-100)
     */
    getSuccessRate() {
      const total = collector.get('totalRequests');
      const successful = collector.get('successfulRequests');
      return total > 0 ? (successful / total) * 100 : 0;
    }
  };
}

/**
 * Pre-configured stats collector for queue-based services
 *
 * Includes: totalEnqueued, totalProcessed, totalFailed, totalDropped,
 * currentSize, peakSize
 *
 * @returns {Object} Stats collector configured for queue tracking
 */
function createQueueStatsCollector() {
  const collector = createStatsCollector({
    totalEnqueued: 'counter',
    totalProcessed: 'counter',
    totalFailed: 'counter',
    totalDropped: 'counter',
    deduplicated: 'counter',
    currentSize: 'value',
    peakSize: 'max'
  });

  return {
    ...collector,

    /**
     * Record an item being enqueued
     * @param {number} currentQueueSize - Current queue size after enqueue
     */
    recordEnqueue(currentQueueSize) {
      collector.increment('totalEnqueued');
      collector.set('currentSize', currentQueueSize);
      collector.updateMax('peakSize', currentQueueSize);
    },

    /**
     * Record an item being processed successfully
     * @param {number} currentQueueSize - Current queue size after processing
     */
    recordProcessed(currentQueueSize) {
      collector.increment('totalProcessed');
      collector.set('currentSize', currentQueueSize);
    },

    /**
     * Record a processing failure
     */
    recordFailed() {
      collector.increment('totalFailed');
    },

    /**
     * Record an item being dropped
     */
    recordDropped() {
      collector.increment('totalDropped');
    },

    /**
     * Record a duplicate being detected
     */
    recordDeduplicated() {
      collector.increment('deduplicated');
    }
  };
}

/**
 * Pre-configured stats collector for cache services
 *
 * Includes: hits, misses, evictions, size
 *
 * @returns {Object} Stats collector configured for cache tracking
 */
function createCacheStatsCollector() {
  const collector = createStatsCollector({
    hits: 'counter',
    misses: 'counter',
    evictions: 'counter',
    size: 'value',
    maxSize: 'value'
  });

  return {
    ...collector,

    /**
     * Record a cache hit
     */
    recordHit() {
      collector.increment('hits');
    },

    /**
     * Record a cache miss
     */
    recordMiss() {
      collector.increment('misses');
    },

    /**
     * Record an eviction
     */
    recordEviction() {
      collector.increment('evictions');
    },

    /**
     * Update current cache size
     * @param {number} size - Current cache size
     */
    updateSize(size) {
      collector.set('size', size);
    },

    /**
     * Get hit rate as a percentage
     * @returns {number} Hit rate (0-100)
     */
    getHitRate() {
      const hits = collector.get('hits');
      const misses = collector.get('misses');
      const total = hits + misses;
      return total > 0 ? (hits / total) * 100 : 0;
    }
  };
}

module.exports = {
  createStatsCollector,
  createRequestStatsCollector,
  createQueueStatsCollector,
  createCacheStatsCollector
};

/**
 * Performance optimization utilities for React components.
 * Provides debouncing, throttling, memoization, and React-specific helpers.
 *
 * Core debounce/throttle are imported from the consolidated promiseUtils module.
 *
 * @module renderer/utils/performance
 */

// Import core utilities from consolidated module
const {
  debounce,
  throttle,
} = require('../../shared/promiseUtils');

/**
 * Simple memoization function for expensive computations
 *
 * @param {Function} fn - The function to memoize
 * @param {Function} keyResolver - Function to resolve cache key from arguments
 * @returns {Function} The memoized function with clear method
 */
function memoize(fn, keyResolver) {
  const cache = new Map();

  const memoized = function (...args) {
    const key = keyResolver ? keyResolver.apply(this, args) : args[0];

    if (cache.has(key)) {
      return cache.get(key);
    }

    const result = fn.apply(this, args);
    cache.set(key, result);
    return result;
  };

  memoized.clear = () => cache.clear();
  memoized.delete = (key) => cache.delete(key);
  memoized.has = (key) => cache.has(key);

  return memoized;
}

/**
 * LRU (Least Recently Used) cache implementation
 *
 * @param {number} maxSize - Maximum number of items in cache
 * @returns {Object} Cache object with get, set, has, delete, and clear methods
 */
function createLRUCache(maxSize = 100) {
  const cache = new Map();

  return {
    get(key) {
      if (!cache.has(key)) {
        return undefined;
      }
      // Move to end (most recently used)
      const value = cache.get(key);
      cache.delete(key);
      cache.set(key, value);
      return value;
    },

    set(key, value) {
      // Remove key if it exists (to update position)
      if (cache.has(key)) {
        cache.delete(key);
      }
      // Add to end
      cache.set(key, value);

      // Remove oldest if over capacity
      if (cache.size > maxSize) {
        const firstKey = cache.keys().next().value;
        cache.delete(firstKey);
      }
    },

    has(key) {
      return cache.has(key);
    },

    delete(key) {
      return cache.delete(key);
    },

    clear() {
      cache.clear();
    },

    get size() {
      return cache.size;
    },
  };
}

/**
 * Request animation frame throttle for smooth animations
 *
 * @param {Function} callback - The function to throttle
 * @returns {Function} The throttled function
 */
function rafThrottle(callback) {
  let requestId = null;
  let lastArgs;

  const throttled = function (...args) {
    lastArgs = args;

    if (requestId === null) {
      requestId = requestAnimationFrame(() => {
        callback.apply(this, lastArgs);
        requestId = null;
      });
    }
  };

  throttled.cancel = () => {
    if (requestId !== null) {
      cancelAnimationFrame(requestId);
      requestId = null;
    }
  };

  return throttled;
}

/**
 * Creates a function that batches multiple calls into a single async operation
 *
 * @param {Function} fn - The function to batch
 * @param {number} wait - Time to wait before executing batch
 * @param {number} maxBatchSize - Maximum batch size
 * @returns {Function} The batched function
 */
function batchProcessor(fn, wait = 0, maxBatchSize = Infinity) {
  let batch = [];
  let timeoutId;

  const processBatch = async () => {
    const currentBatch = batch;
    batch = [];
    timeoutId = null;

    if (currentBatch.length > 0) {
      await fn(currentBatch);
    }
  };

  return {
    add(item) {
      batch.push(item);

      if (batch.length >= maxBatchSize) {
        if (timeoutId) {
          clearTimeout(timeoutId);
        }
        processBatch();
      } else if (!timeoutId) {
        timeoutId = setTimeout(processBatch, wait);
      }
    },

    flush() {
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
      return processBatch();
    },

    clear() {
      if (timeoutId) {
        clearTimeout(timeoutId);
        timeoutId = null;
      }
      batch = [];
    },
  };
}

module.exports = {
  debounce,
  throttle,
  memoize,
  createLRUCache,
  rafThrottle,
  batchProcessor,
};

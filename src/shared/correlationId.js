/**
 * Correlation ID Context
 *
 * Provides a mechanism to track operations across asynchronous calls
 * using Node.js AsyncLocalStorage.
 *
 * @module shared/correlationId
 */

const { AsyncLocalStorage } = require('async_hooks');
const crypto = require('crypto');

// Browser/Renderer fallback for AsyncLocalStorage
// When bundled with webpack fallback: false, AsyncLocalStorage will be undefined
const asyncLocalStorage = AsyncLocalStorage
  ? new AsyncLocalStorage()
  : {
      run: (id, callback) => callback(),
      getStore: () => undefined
    };

/**
 * Execute a callback within a correlation context
 * @param {Function} callback - Function to execute
 * @param {string} [correlationId] - Optional existing ID to propagate
 * @returns {*} Result of the callback
 */
function withCorrelationId(callback, correlationId) {
  const id =
    correlationId || `req_${Date.now().toString(36)}_${crypto.randomBytes(4).toString('hex')}`;
  return asyncLocalStorage.run(id, callback);
}

/**
 * Get the current correlation ID
 * @returns {string|undefined} Current correlation ID or undefined
 */
function getCorrelationId() {
  return asyncLocalStorage.getStore();
}

/**
 * Wrap an async function to ensure it runs in a new correlation context
 * @param {Function} fn - Async function to wrap
 * @returns {Function} Wrapped function
 */
function wrapWithCorrelationId(fn) {
  return async function (...args) {
    return withCorrelationId(() => fn(...args));
  };
}

module.exports = {
  withCorrelationId,
  getCorrelationId,
  wrapWithCorrelationId
};

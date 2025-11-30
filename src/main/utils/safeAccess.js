/**
 * Safe access utilities to prevent null reference errors.
 *
 * Some utilities are re-exported from consolidated modules for consistency.
 *
 * @module main/utils/safeAccess
 */

const { logger } = require('../../shared/logger');
const {
  safeGetNestedProperty,
  safeGet: consolidatedSafeGet,
  safeString,
} = require('../../shared/edgeCaseUtils');
const { safeCall: consolidatedSafeCall } = require('../../shared/promiseUtils');

logger.setContext('SafeAccess');

/**
 * Safely access nested object properties.
 * Re-exported from edgeCaseUtils for backward compatibility.
 *
 * @param {Object} obj - The object to access
 * @param {string} path - The path to access (e.g., 'a.b.c')
 * @param {*} defaultValue - The default value if path doesn't exist
 * @returns {*} The value at the path or default value
 * @see module:shared/edgeCaseUtils.safeGetNestedProperty
 */
function safeGet(obj, path, defaultValue = null) {
  return safeGetNestedProperty(obj, path, defaultValue);
}

/**
 * Safely call a function with error handling.
 * Wrapper around consolidated safeCall that supports the legacy (fn, args, defaultValue) signature.
 *
 * @param {Function} fn - The function to call
 * @param {Array} args - Arguments to pass to the function
 * @param {*} defaultValue - Default value on error
 * @returns {*} Function result or default value
 * @see module:shared/promiseUtils.safeCall
 */
async function safeCall(fn, args = [], defaultValue = null) {
  // Use the consolidated safeCall but apply with provided args
  const wrappedFn = consolidatedSafeCall(fn, defaultValue);
  return wrappedFn(...args);
}

/**
 * Validate required properties on an object
 * @param {Object} obj - Object to validate
 * @param {Array<string>} requiredProps - List of required property names
 * @returns {boolean} True if all required properties exist
 */
function validateRequired(obj, requiredProps) {
  if (!obj || typeof obj !== 'object') {
    return false;
  }

  for (const prop of requiredProps) {
    if (!(prop in obj) || obj[prop] === null || obj[prop] === undefined) {
      logger.warn('[Validation] Missing required property', { property: prop });
      return false;
    }
  }

  return true;
}

/**
 * Safely access array element.
 * Delegates to safeGet from edgeCaseUtils.
 *
 * @param {Array} arr - The array to access
 * @param {number} index - Index to access
 * @param {*} defaultValue - Default value if out of bounds
 * @returns {*} Element at index or default value
 * @see module:shared/edgeCaseUtils.safeGet
 */
function safeArrayAccess(arr, index, defaultValue = null) {
  return consolidatedSafeGet(arr, index, defaultValue);
}

/**
 * Create a safe wrapper for an object that prevents null reference errors
 * @param {Object} obj - Object to wrap
 * @returns {Proxy} Proxied object with safe access
 */
function createSafeProxy(obj) {
  if (!obj || typeof obj !== 'object') {
    return {};
  }

  return new Proxy(obj, {
    get(target, prop) {
      if (prop in target) {
        const value = target[prop];
        if (value && typeof value === 'object' && !Array.isArray(value)) {
          return createSafeProxy(value);
        }
        return value;
      }
      return undefined;
    },
    set(target, prop, value) {
      target[prop] = value;
      return true;
    },
  });
}

/**
 * Safely parse JSON with error handling
 * @param {string} jsonString - JSON string to parse
 * @param {*} defaultValue - Default value on parse error
 * @returns {*} Parsed object or default value
 */
function safeJsonParse(jsonString, defaultValue = null) {
  if (typeof jsonString !== 'string') {
    return defaultValue;
  }

  try {
    return JSON.parse(jsonString);
  } catch (error) {
    logger.warn('[SafeJSON] Failed to parse JSON', {
      error: error.message,
      input: jsonString.slice(0, 100),
    });
    return defaultValue;
  }
}

/**
 * Ensure a value is an array.
 * Wraps safeArray from edgeCaseUtils with legacy behavior (wraps single values in array).
 *
 * @param {*} value - Value to check
 * @returns {Array} The value as array or empty array
 * @see module:shared/edgeCaseUtils.safeArray
 */
function ensureArray(value) {
  if (Array.isArray(value)) {
    return value;
  }

  if (value === null || value === undefined) {
    return [];
  }

  // Legacy behavior: wrap single values in an array
  return [value];
}

/**
 * Ensure a value is a string.
 * Delegates to safeString from edgeCaseUtils.
 *
 * @param {*} value - Value to check
 * @param {string} defaultValue - Default string value
 * @returns {string} The value as string
 * @see module:shared/edgeCaseUtils.safeString
 */
function ensureString(value, defaultValue = '') {
  return safeString(value, defaultValue);
}

/**
 * Safely access and validate file path
 * @param {string} filePath - Path to validate
 * @returns {string|null} Valid path or null
 */
function safeFilePath(filePath) {
  if (!filePath || typeof filePath !== 'string') {
    return null;
  }

  // Remove any null bytes or control characters
  const cleanPath = filePath.replace(/\0/g, '').trim();

  if (!cleanPath || cleanPath.length === 0) {
    return null;
  }

  return cleanPath;
}

module.exports = {
  safeGet,
  safeCall,
  validateRequired,
  safeArrayAccess,
  createSafeProxy,
  safeJsonParse,
  ensureArray,
  ensureString,
  safeFilePath,
};

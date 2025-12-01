/**
 * Safe access utilities to prevent null reference errors.
 *
 * @module main/utils/safeAccess
 */

const { safeGetNestedProperty } = require('../../shared/edgeCaseUtils');

/**
 * Safely access nested object properties.
 *
 * @param {Object} obj - The object to access
 * @param {string} path - The path to access (e.g., 'a.b.c')
 * @param {*} defaultValue - The default value if path doesn't exist
 * @returns {*} The value at the path or default value
 */
function safeGet(obj, path, defaultValue = null) {
  return safeGetNestedProperty(obj, path, defaultValue);
}

/**
 * Ensure a value is an array.
 *
 * @param {*} value - Value to check
 * @returns {Array} The value as array or empty array
 */
function ensureArray(value) {
  if (Array.isArray(value)) {
    return value;
  }

  if (value === null || value === undefined) {
    return [];
  }

  return [value];
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
  ensureArray,
  safeFilePath,
};

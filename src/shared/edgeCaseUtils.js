/**
 * Edge Case Utilities - Centralized Defensive Programming Patterns
 * Provides reusable utilities to handle common edge cases across the application.
 *
 * @module shared/edgeCaseUtils
 */

/**
 * CATEGORY 1: OBJECT PROPERTY ACCESS
 */

/**
 * Safely get nested property from object
 * @param {Object} obj - Input object
 * @param {string} path - Dot-separated path (e.g., 'user.profile.name')
 * @param {*} defaultValue - Default value if path doesn't exist
 * @returns {*} Value at path or default
 */
function safeGetNestedProperty(obj, path, defaultValue = null) {
  if (!obj || typeof obj !== 'object') {
    return defaultValue;
  }

  if (!path || typeof path !== 'string') {
    return defaultValue;
  }

  const keys = path.split('.');
  let current = obj;

  for (const key of keys) {
    if (current === null || current === undefined) {
      return defaultValue;
    }

    if (typeof current !== 'object') {
      return defaultValue;
    }

    current = current[key];
  }

  return current !== undefined ? current : defaultValue;
}

module.exports = {
  safeGetNestedProperty,
};

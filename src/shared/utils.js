/**
 * Shared Utilities
 *
 * Centralized utility functions to eliminate code duplication across the codebase.
 * DUP-1, DUP-2, DUP-3, DUP-8, DUP-11 fixes from vibecoding audit.
 */

const path = require('path');

// ============================================================================
// DUP-1: URL Normalization
// ============================================================================

/**
 * Normalize a URL for Ollama server connection
 * Handles missing protocol, extra whitespace, and double-protocol issues
 *
 * @param {string} [hostUrl] - The URL to normalize
 * @param {string} [defaultUrl='http://127.0.0.1:11434'] - Default URL if none provided
 * @returns {string} Normalized URL with protocol
 */
function normalizeOllamaUrl(hostUrl, defaultUrl = 'http://127.0.0.1:11434') {
  let url = hostUrl || defaultUrl;

  if (url && typeof url === 'string') {
    url = url.trim();
    // Remove any existing protocol to prevent double-protocol
    url = url.replace(/^https?:\/\//i, '');
    // Add http:// if no protocol specified
    if (!url.startsWith('http://') && !url.startsWith('https://')) {
      url = `http://${url}`;
    }
  }

  return url;
}

// ============================================================================
// DUP-2: Timestamp Utilities
// ============================================================================

/**
 * Get current timestamp in ISO format
 * @returns {string} ISO timestamp string
 */
function timestamp() {
  return new Date().toISOString();
}

/**
 * Get current Unix timestamp in milliseconds
 * @returns {number} Unix timestamp
 */
function timestampMs() {
  return Date.now();
}

/**
 * Format a date for display
 * @param {Date|string|number} date - Date to format
 * @returns {string} Formatted date string
 */
function formatDate(date) {
  const d = date instanceof Date ? date : new Date(date);
  return d.toLocaleDateString();
}

/**
 * Format a date with time for display
 * @param {Date|string|number} date - Date to format
 * @returns {string} Formatted date-time string
 */
function formatDateTime(date) {
  const d = date instanceof Date ? date : new Date(date);
  return d.toLocaleString();
}

// ============================================================================
// DUP-3: File Extension Utilities
// ============================================================================

/**
 * Extract file extension from filename or path
 * @param {string} fileNameOrPath - Filename or full path
 * @returns {string} Extension with leading dot (e.g., '.pdf') or empty string
 */
function getExtension(fileNameOrPath) {
  if (!fileNameOrPath || typeof fileNameOrPath !== 'string') {
    return '';
  }

  const fileName = path.basename(fileNameOrPath);
  if (!fileName.includes('.')) {
    return '';
  }

  return '.' + fileName.split('.').pop().toLowerCase();
}

/**
 * Get filename without extension
 * @param {string} fileNameOrPath - Filename or full path
 * @returns {string} Filename without extension
 */
function getBaseName(fileNameOrPath) {
  if (!fileNameOrPath || typeof fileNameOrPath !== 'string') {
    return '';
  }

  const fileName = path.basename(fileNameOrPath);
  const lastDot = fileName.lastIndexOf('.');

  if (lastDot <= 0) {
    return fileName;
  }

  return fileName.substring(0, lastDot);
}

// ============================================================================
// DUP-8: Path Utilities (replacing path.split(/[\\/]/).pop())
// ============================================================================

/**
 * Get filename from path (cross-platform)
 * Replaces: path.split(/[\\/]/).pop()
 *
 * @param {string} filePath - Full file path
 * @returns {string} Filename
 */
function getFileName(filePath) {
  if (!filePath || typeof filePath !== 'string') {
    return '';
  }
  return path.basename(filePath);
}

/**
 * Get directory from path (cross-platform)
 * @param {string} filePath - Full file path
 * @returns {string} Directory path
 */
function getDirectory(filePath) {
  if (!filePath || typeof filePath !== 'string') {
    return '';
  }
  return path.dirname(filePath);
}

// ============================================================================
// DUP-11: Confidence Color Mapping
// ============================================================================

/**
 * Confidence thresholds for color coding
 */
const CONFIDENCE_THRESHOLDS = {
  HIGH: 0.8,
  MEDIUM: 0.5,
  LOW: 0.3,
};

/**
 * Get color class based on confidence score
 * @param {number} confidence - Confidence score (0-1 or 0-100)
 * @returns {string} Tailwind color class
 */
function getConfidenceColor(confidence) {
  // Normalize to 0-1 range if given as percentage
  const normalized = confidence > 1 ? confidence / 100 : confidence;

  if (normalized >= CONFIDENCE_THRESHOLDS.HIGH) {
    return 'text-green-600';
  }
  if (normalized >= CONFIDENCE_THRESHOLDS.MEDIUM) {
    return 'text-yellow-600';
  }
  return 'text-red-600';
}

/**
 * Get background color class based on confidence score
 * @param {number} confidence - Confidence score (0-1 or 0-100)
 * @returns {string} Tailwind background color class
 */
function getConfidenceBgColor(confidence) {
  // Normalize to 0-1 range if given as percentage
  const normalized = confidence > 1 ? confidence / 100 : confidence;

  if (normalized >= CONFIDENCE_THRESHOLDS.HIGH) {
    return 'bg-green-100';
  }
  if (normalized >= CONFIDENCE_THRESHOLDS.MEDIUM) {
    return 'bg-yellow-100';
  }
  return 'bg-red-100';
}

/**
 * Get confidence label
 * @param {number} confidence - Confidence score (0-1 or 0-100)
 * @returns {string} Human-readable label
 */
function getConfidenceLabel(confidence) {
  // Normalize to 0-1 range if given as percentage
  const normalized = confidence > 1 ? confidence / 100 : confidence;

  if (normalized >= CONFIDENCE_THRESHOLDS.HIGH) {
    return 'High';
  }
  if (normalized >= CONFIDENCE_THRESHOLDS.MEDIUM) {
    return 'Medium';
  }
  return 'Low';
}

// ============================================================================
// DUP-7: Array Validation
// ============================================================================

/**
 * Check if value is a non-empty array
 * @param {*} value - Value to check
 * @returns {boolean} True if non-empty array
 */
function isNonEmptyArray(value) {
  return Array.isArray(value) && value.length > 0;
}

/**
 * Ensure value is an array
 * @param {*} value - Value to wrap
 * @returns {Array} Original array or wrapped value
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

// ============================================================================
// Module Exports
// ============================================================================

module.exports = {
  // URL utilities
  normalizeOllamaUrl,

  // Timestamp utilities
  timestamp,
  timestampMs,
  formatDate,
  formatDateTime,

  // File utilities
  getExtension,
  getBaseName,
  getFileName,
  getDirectory,

  // Confidence utilities
  CONFIDENCE_THRESHOLDS,
  getConfidenceColor,
  getConfidenceBgColor,
  getConfidenceLabel,

  // Array utilities
  isNonEmptyArray,
  ensureArray,
};

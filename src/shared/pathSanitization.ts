/**
 * Path Sanitization Utilities
 * Provides secure path validation and sanitization for database storage
 */import path from 'path';import os from 'os';

// Path length limits by platform
const MAX_PATH_LENGTHS = {
  win32: 260, // Windows MAX_PATH
  linux: 4096, // Linux PATH_MAX
  darwin: 1024, // macOS PATH_MAX (typically 1024)
};

// Reserved Windows filenames (case-insensitive)
const RESERVED_WINDOWS_NAMES = new Set([
  'CON',
  'PRN',
  'AUX',
  'NUL',
  'COM1',
  'COM2',
  'COM3',
  'COM4',
  'COM5',
  'COM6',
  'COM7',
  'COM8',
  'COM9',
  'LPT1',
  'LPT2',
  'LPT3',
  'LPT4',
  'LPT5',
  'LPT6',
  'LPT7',
  'LPT8',
  'LPT9',
]);

// Maximum path depth to prevent deep nesting attacks
const MAX_PATH_DEPTH = 100;

/**
 * Sanitize a file path for safe storage in database
 * Prevents directory traversal and normalizes path format
 *
 * @param {string} filePath - The file path to sanitize
 * @returns {string} Sanitized path
 * @throws {Error} If path is invalid or dangerous
 */
function sanitizePath(filePath) {
  if (!filePath || typeof filePath !== 'string') {
    return '';
  }

  // 1. Remove null bytes (security critical)
  // Instead of throwing, we sanitize by removing them
  let sanitized = filePath.replace(/\0/g, '');

  // 2. Unicode normalization (NFD to NFC for consistency)
  // This helps prevent homograph attacks and ensures consistent encoding
  let normalized = sanitized.normalize('NFC');

  // 3. Handle path length limits
  const platform = os.platform();
  const maxLength = MAX_PATH_LENGTHS[platform] || MAX_PATH_LENGTHS.linux;
  if (normalized.length > maxLength) {
    // Truncate the path if it's too long instead of throwing
    // Try to preserve the file extension if possible
    const ext = path.extname(normalized);
    const truncateLength = maxLength - ext.length;
    if (truncateLength > 0) {
      normalized = normalized.substring(0, truncateLength) + ext;
    } else {
      normalized = normalized.substring(0, maxLength);
    }
  }

  // 4. Check for path traversal attempts before normalization
  if (normalized.includes('..')) {
    throw new Error('Invalid path: path traversal detected');
  }

  // 5. Normalize the path (resolves .., ., etc.)
  normalized = path.normalize(normalized);

  // 6. Validate path depth to prevent deep nesting attacks
  const pathParts = normalized
    .split(path.sep)
    .filter((part) => part.length > 0);
  if (pathParts.length > MAX_PATH_DEPTH) {
    throw new Error(
      `Invalid path: path depth (${pathParts.length}) exceeds maximum (${MAX_PATH_DEPTH})`,
    );
  }

  // 7. Check for reserved Windows filenames (case-insensitive)
  if (platform === 'win32') {
    for (const part of pathParts) {
      const nameWithoutExt = path.parse(part).name.toUpperCase();
      if (RESERVED_WINDOWS_NAMES.has(nameWithoutExt)) {
        throw new Error(
          `Invalid path: reserved Windows filename detected: ${nameWithoutExt}`,
        );
      }
    }
  }

  // 8. Ensure it's an absolute path for consistency
  if (!path.isAbsolute(normalized)) {
    // For relative paths, we just normalize them
    // The calling code should handle making them absolute if needed
    return normalized;
  }

  return normalized;
}

/**
 * Validate that a path is safe for database storage
 *
 * @param {string} filePath - The file path to validate
 * @returns {boolean} True if path is safe
 */
function isPathSafe(filePath) {
  try {
    sanitizePath(filePath);
    return true;
  } catch {
    return false;
  }
}

/**
 * Sanitize metadata object, filtering out dangerous or unnecessary fields
 *
 * @param {Object} metadata - Metadata object to sanitize
 * @param {Array<string>} allowedFields - List of allowed field names
 * @returns {Object} Sanitized metadata
 */
function sanitizeMetadata(metadata, allowedFields = null) {
  if (!metadata || typeof metadata !== 'object') {
    return {};
  }

  const sanitized = {};

  // Define default allowed fields if not specified
  const defaultAllowed = [
    // Basic identification
    'path',
    'name',
    'extension',
    'fileHash',
    'fileSize',
    'mimeType',
    'fileExtension',
    // Analysis results
    'category',
    'project',
    'purpose',
    'documentType',
    'keywords',
    'summary',
    'language',
    'tags',
    // Document structure
    'hasHeadings',
    'hasTables',
    'wordCount',
    // Image-specific
    'contentType',
    'hasText',
    'textContent',
    // Confidence tracking
    'confidence',
    'confidenceBreakdown',
    // Processing metadata
    'model',
    'promptVersion',
    'processingTimeMs',
    'analyzedAt',
    'updatedAt',
    // Folder-specific
    'description',
    'typicalContents',
    'exampleKeywords',
    'fileCount',
    'matchSuccessRate',
  ];

  const allowed = allowedFields || defaultAllowed;

  for (const [key, value] of Object.entries(metadata)) {
    // Skip if not in allowed list
    if (!allowed.includes(key)) {
      continue;
    }

    // Skip dangerous keys
    const dangerousKeys = ['__proto__', 'constructor', 'prototype'];
    if (dangerousKeys.includes(key)) {
      continue;
    }

    // Sanitize path fields
    if (key === 'path' && typeof value === 'string') {
      try {
        sanitized[key] = sanitizePath(value);
      } catch (error) {
        // For paths that are invalid due to traversal attempts or other security issues,
        // we skip them entirely. But null bytes are now sanitized, not thrown.
        continue;
      }
    }
    // Copy other allowed fields
    else if (value !== undefined && value !== null) {
      // Prevent storing functions or objects with methods
      if (typeof value === 'function') {
        continue;
      }

      sanitized[key] = value;
    }
  }

  return sanitized;
}export { sanitizePath, isPathSafe, sanitizeMetadata };

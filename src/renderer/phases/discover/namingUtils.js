/**
 * Naming Utilities
 *
 * Pure utility functions for file naming conventions.
 * Extracted from DiscoverPhase for better maintainability.
 *
 * @module phases/discover/namingUtils
 */

/**
 * Format a date according to the specified format
 * @param {Date} date - Date to format
 * @param {string} format - Date format string
 * @returns {string} Formatted date
 */
export function formatDate(date, format) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');

  switch (format) {
    case 'YYYY-MM-DD':
      return `${year}-${month}-${day}`;
    case 'MM-DD-YYYY':
      return `${month}-${day}-${year}`;
    case 'DD-MM-YYYY':
      return `${day}-${month}-${year}`;
    case 'YYYYMMDD':
      return `${year}${month}${day}`;
    default:
      return `${year}-${month}-${day}`;
  }
}

/**
 * Apply case convention to text
 * @param {string} text - Text to transform
 * @param {string} convention - Case convention to apply
 * @returns {string} Transformed text
 */
export function applyCaseConvention(text, convention) {
  switch (convention) {
    case 'kebab-case':
      return text
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '');
    case 'snake_case':
      return text
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '_')
        .replace(/^_|_$/g, '');
    case 'camelCase':
      return text
        .split(/[^a-z0-9]+/i)
        .map((word, index) =>
          index === 0
            ? word.toLowerCase()
            : word.charAt(0).toUpperCase() + word.slice(1).toLowerCase(),
        )
        .join('');
    case 'PascalCase':
      return text
        .split(/[^a-z0-9]+/i)
        .map(
          (word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase(),
        )
        .join('');
    case 'lowercase':
      return text.toLowerCase();
    case 'UPPERCASE':
      return text.toUpperCase();
    default:
      return text;
  }
}

/**
 * Generate a preview name based on naming convention settings
 * @param {string} originalName - Original filename
 * @param {Object} settings - Naming settings
 * @param {string} settings.convention - Naming convention
 * @param {string} settings.separator - Separator character
 * @param {string} settings.dateFormat - Date format
 * @param {string} settings.caseConvention - Case convention
 * @returns {string} Preview name
 */
export function generatePreviewName(originalName, settings) {
  const { convention, separator, dateFormat, caseConvention } = settings;

  const baseName = originalName.replace(/\.[^/.]+$/, '');
  const extension = originalName.includes('.')
    ? `.${originalName.split('.').pop()}`
    : '';
  const today = new Date();

  let previewName = '';

  switch (convention) {
    case 'subject-date':
      previewName = `${baseName}${separator}${formatDate(today, dateFormat)}`;
      break;
    case 'date-subject':
      previewName = `${formatDate(today, dateFormat)}${separator}${baseName}`;
      break;
    case 'project-subject-date':
      previewName = `Project${separator}${baseName}${separator}${formatDate(today, dateFormat)}`;
      break;
    case 'category-subject':
      previewName = `Category${separator}${baseName}`;
      break;
    case 'keep-original':
      previewName = baseName;
      break;
    default:
      previewName = baseName;
  }

  return applyCaseConvention(previewName, caseConvention) + extension;
}

/**
 * Validate progress state object
 * @param {Object} progress - Progress state to validate
 * @returns {boolean} True if valid
 */
export function validateProgressState(progress) {
  if (!progress || typeof progress !== 'object') return false;
  if (
    typeof progress.current !== 'number' ||
    typeof progress.total !== 'number'
  )
    return false;
  if (progress.current < 0 || progress.total < 0) return false;
  if (progress.current > progress.total) return false;
  if (!progress.lastActivity || typeof progress.lastActivity !== 'number')
    return false;

  // Check if progress is too old (more than 15 minutes)
  const timeSinceActivity = Date.now() - progress.lastActivity;
  if (timeSinceActivity > 15 * 60 * 1000) return false;

  return true;
}

/**
 * Get file state display information
 * @param {string} state - Current file state
 * @param {boolean} hasAnalysis - Whether file has analysis
 * @returns {Object} Display information
 */
export function getFileStateDisplayInfo(state, hasAnalysis) {
  if (state === 'analyzing')
    return {
      icon: '🔄',
      label: 'Analyzing...',
      color: 'text-blue-600',
      spinning: true,
    };
  if (state === 'error')
    return {
      icon: '❌',
      label: 'Error',
      color: 'text-red-600',
      spinning: false,
    };
  if (hasAnalysis && state === 'ready')
    return {
      icon: '✅',
      label: 'Ready',
      color: 'text-green-600',
      spinning: false,
    };
  if (state === 'pending')
    return {
      icon: '⏳',
      label: 'Pending',
      color: 'text-yellow-600',
      spinning: false,
    };
  return {
    icon: '❌',
    label: 'Failed',
    color: 'text-red-600',
    spinning: false,
  };
}

/**
 * Extract extension from filename
 * @param {string} fileName - Filename to parse
 * @returns {string} Extension with dot prefix
 */
export function extractExtension(fileName) {
  return fileName.includes('.')
    ? `.${fileName.split('.').pop().toLowerCase()}`
    : '';
}

/**
 * Extract filename from path
 * @param {string} filePath - Full file path
 * @returns {string} Filename
 */
export function extractFileName(filePath) {
  return filePath.split(/[\\/]/).pop();
}

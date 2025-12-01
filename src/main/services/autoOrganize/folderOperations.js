/**
 * Folder Operations
 *
 * Folder creation, path building, and fallback destination logic.
 *
 * @module autoOrganize/folderOperations
 */

const path = require('path');
const fs = require('fs').promises;
const { app } = require('electron');
const { logger } = require('../../../shared/logger');
const { getFileTypeCategory } = require('./fileTypeUtils');

logger.setContext('AutoOrganize-Folders');

/**
 * Check if path is a UNC path (Windows network path)
 * @param {string} p - Path to check
 * @returns {boolean} True if UNC path
 */
function isUNCPath(p) {
  if (!p || typeof p !== 'string') return false;
  return p.startsWith('\\\\') || p.startsWith('//');
}

/**
 * Create default folder for unanalyzed files with security validation
 * @param {Array} smartFolders - Array of smart folders to add to
 * @returns {Promise<Object|null>} Created folder object or null
 */
async function createDefaultFolder(smartFolders) {
  logger.warn(
    '[AutoOrganize] No default folder found, creating emergency fallback',
  );

  try {
    // Validate documentsDir exists and is accessible
    const documentsDir = app.getPath('documents');

    if (!documentsDir || typeof documentsDir !== 'string') {
      throw new Error('Invalid documents directory path from Electron');
    }

    // Check for UNC paths which can bypass security checks on Windows
    if (isUNCPath(documentsDir)) {
      throw new Error(
        `Security violation: UNC paths not allowed in documents directory. ` +
          `Detected UNC path: ${documentsDir}`,
      );
    }

    // Sanitize folder path components to prevent directory traversal
    const sanitizedBaseName = 'StratoSort'.replace(/[^a-zA-Z0-9_-]/g, '_');
    const sanitizedFolderName = 'Uncategorized'.replace(/[^a-zA-Z0-9_-]/g, '_');

    // Use path.resolve to normalize path and prevent traversal
    const defaultFolderPath = path.resolve(
      documentsDir,
      sanitizedBaseName,
      sanitizedFolderName,
    );

    // Additional UNC path check on resolved path
    if (isUNCPath(defaultFolderPath)) {
      throw new Error(
        `Security violation: UNC path detected after resolution. ` +
          `Path ${defaultFolderPath} is a UNC path which is not allowed`,
      );
    }

    // Verify the resolved path is actually inside documents directory
    const resolvedDocumentsDir = path.resolve(documentsDir);

    // On Windows, normalize path separators for consistent comparison
    const normalizedDefaultPath = defaultFolderPath
      .replace(/\\/g, '/')
      .toLowerCase();
    const normalizedDocumentsDir = resolvedDocumentsDir
      .replace(/\\/g, '/')
      .toLowerCase();

    if (!normalizedDefaultPath.startsWith(normalizedDocumentsDir)) {
      throw new Error(
        `Security violation: Attempted path traversal detected. ` +
          `Path ${defaultFolderPath} is outside documents directory ${resolvedDocumentsDir}`,
      );
    }

    // Additional validation - check for suspicious path patterns
    const suspiciousPatterns = [
      /\.\./, // Parent directory reference
      /\.\.[\\/]/, // Parent with separator
      /[\\/]\.\./, // Separator with parent
      /^[a-zA-Z]:/, // Different drive letter (if not expected)
      /\0/, // Null bytes
      /[<>:"|?*]/, // Invalid Windows filename chars in unexpected positions
    ];

    for (const pattern of suspiciousPatterns) {
      if (
        pattern.test(defaultFolderPath.substring(resolvedDocumentsDir.length))
      ) {
        throw new Error(
          `Security violation: Suspicious path pattern detected. ` +
            `Path contains potentially dangerous characters or sequences`,
        );
      }
    }

    logger.info(
      '[AutoOrganize] Path validation passed for emergency default folder',
      {
        documentsDir: resolvedDocumentsDir,
        defaultFolderPath,
        sanitized: true,
        uncPathCheck: 'passed',
        traversalCheck: 'passed',
      },
    );

    // Check if directory already exists before creating
    let dirExists = false;
    let isSymbolicLink = false;
    try {
      // Use lstat instead of stat to detect symbolic links
      const stats = await fs.lstat(defaultFolderPath);
      dirExists = stats.isDirectory();
      isSymbolicLink = stats.isSymbolicLink();

      // Reject symbolic links for security
      if (isSymbolicLink) {
        throw new Error(
          `Security violation: Symbolic links are not allowed for safety reasons. ` +
            `Path ${defaultFolderPath} is a symbolic link.`,
        );
      }
    } catch (error) {
      // Directory doesn't exist, which is fine - we'll create it
      if (error.code !== 'ENOENT') {
        // Some other error (permission denied, symbolic link rejection, etc.)
        throw error;
      }
    }

    if (!dirExists) {
      // Ensure directory exists with proper error handling
      await fs.mkdir(defaultFolderPath, { recursive: true });
      logger.info(
        '[AutoOrganize] Created emergency default folder at:',
        defaultFolderPath,
      );
    } else {
      logger.info(
        '[AutoOrganize] Emergency default folder already exists at:',
        defaultFolderPath,
      );
    }

    // Create default folder object
    const defaultFolder = {
      id: `emergency-default-${Date.now()}`,
      name: 'Uncategorized',
      path: defaultFolderPath,
      description: 'Emergency fallback folder for files without analysis',
      keywords: [],
      isDefault: true,
      createdAt: new Date().toISOString(),
    };

    // Add to smartFolders array for this session
    smartFolders.push(defaultFolder);

    logger.info(
      '[AutoOrganize] Emergency default folder configured at:',
      defaultFolderPath,
    );

    return defaultFolder;
  } catch (error) {
    logger.error('[AutoOrganize] Failed to create emergency default folder:', {
      error: error.message,
      stack: error.stack,
    });

    return null;
  }
}

/**
 * Get fallback destination for files with no good match
 * @param {Object} file - File object
 * @param {Array} smartFolders - Smart folders
 * @param {string} defaultLocation - Default location
 * @returns {string} Fallback destination path
 */
function getFallbackDestination(file, smartFolders, defaultLocation) {
  // Try to match based on file type
  const fileType = getFileTypeCategory(file.extension);

  // Look for a smart folder that matches the file type
  const typeFolder = smartFolders.find((f) =>
    f.name.toLowerCase().includes(fileType.toLowerCase()),
  );

  if (typeFolder) {
    return path.join(
      typeFolder.path || `${defaultLocation}/${typeFolder.name}`,
      file.name,
    );
  }

  // Use category from analysis if available
  if (file.analysis?.category) {
    const categoryFolder = smartFolders.find(
      (f) => f.name.toLowerCase() === file.analysis.category.toLowerCase(),
    );

    if (categoryFolder) {
      return path.join(
        categoryFolder.path || `${defaultLocation}/${categoryFolder.name}`,
        file.name,
      );
    }

    // Create new folder based on category
    return path.join(defaultLocation, file.analysis.category, file.name);
  }

  // Ultimate fallback - organize by file type
  return path.join(defaultLocation, fileType, file.name);
}

/**
 * Build destination path for a file
 * @param {Object} file - File object
 * @param {Object} suggestion - Suggestion object
 * @param {string} defaultLocation - Default location
 * @param {boolean} preserveNames - Whether to preserve original names
 * @returns {string} Destination path
 */
function buildDestinationPath(
  file,
  suggestion,
  defaultLocation,
  preserveNames,
) {
  const folderPath =
    suggestion.path || path.join(defaultLocation, suggestion.folder);

  const fileName = preserveNames
    ? file.name
    : file.analysis?.suggestedName || file.name;

  return path.join(folderPath, fileName);
}

module.exports = {
  isUNCPath,
  createDefaultFolder,
  getFallbackDestination,
  buildDestinationPath,
};

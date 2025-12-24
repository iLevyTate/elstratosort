/**
 * Analysis Handler Utilities
 *
 * Shared utilities for analysis IPC handlers to reduce duplication.
 * Provides wrappers for processing state lifecycle, history recording,
 * error context building, and fallback responses.
 *
 * @module ipc/analysisUtils
 */

const path = require('path');
const fs = require('fs').promises;

/**
 * Wrapper for processing state lifecycle management.
 * Handles markAnalysisStart, markAnalysisComplete/markAnalysisError, and cleanup.
 *
 * @param {Object} options - Options
 * @param {string} options.filePath - File being analyzed
 * @param {Object} options.processingState - Processing state service (optional)
 * @param {Object} options.logger - Logger instance
 * @param {string} options.logPrefix - Prefix for log messages (e.g., '[IPC-ANALYSIS]')
 * @param {Function} options.fn - The analysis function to execute
 * @returns {Promise<*>} Result from the analysis function
 */
async function withProcessingState({ filePath, processingState, logger, logPrefix, fn }) {
  let analysisStarted = false;

  try {
    // Mark analysis start
    if (processingState) {
      try {
        await processingState.markAnalysisStart(filePath);
        analysisStarted = true;
      } catch (stateError) {
        logger.warn(`${logPrefix} Failed to mark analysis start:`, stateError.message);
      }
    }

    // Execute the analysis
    const result = await fn();

    // Mark analysis complete on success
    if (processingState) {
      try {
        await processingState.markAnalysisComplete?.(filePath);
      } catch (completeError) {
        logger.debug(`${logPrefix} Failed to mark analysis complete:`, completeError.message);
      }
    }

    return result;
  } catch (error) {
    // Mark analysis error
    if (processingState) {
      try {
        await processingState.markAnalysisError(filePath, error.message);
      } catch (stateError) {
        logger.warn(`${logPrefix} Failed to mark analysis error:`, {
          filePath,
          error: stateError.message
        });
      }
    }
    throw error;
  } finally {
    // Guaranteed cleanup - only if state is still in_progress
    if (analysisStarted && processingState) {
      try {
        const currentState = processingState.getState?.(filePath);
        if (currentState === 'in_progress') {
          await processingState.clearState?.(filePath);
          logger.debug(`${logPrefix} Cleaned up processing state for:`, filePath);
        }
      } catch (cleanupError) {
        logger.warn(`${logPrefix} Failed to cleanup processing state:`, cleanupError.message);
      }
    }
  }
}

/**
 * Build standardized error context for logging.
 *
 * @param {Object} options - Options
 * @param {string} options.operation - Operation name (e.g., 'document-analysis')
 * @param {string} options.filePath - File path
 * @param {Error} options.error - The error object
 * @returns {Object} Error context for logging
 */
function buildErrorContext({ operation, filePath, error }) {
  return {
    operation,
    filePath,
    fileName: path.basename(filePath),
    fileExtension: path.extname(filePath),
    timestamp: new Date().toISOString(),
    error: error.message,
    errorStack: error.stack,
    errorCode: error.code
  };
}

/**
 * Create a standardized fallback response for failed analysis.
 *
 * @param {string} filePath - File path
 * @param {string} category - Default category ('documents' or 'images')
 * @param {string} errorMessage - Error message
 * @returns {Object} Fallback analysis result
 */
function createAnalysisFallback(filePath, category, errorMessage) {
  return {
    error: errorMessage,
    suggestedName: path.basename(filePath), // Keep extension to prevent unopenable files
    category,
    keywords: [],
    confidence: 0
  };
}

/**
 * Normalize analysis result and record to history.
 *
 * @param {Object} options - Options
 * @param {string} options.filePath - File path
 * @param {Object} options.result - Raw analysis result
 * @param {number} options.processingTime - Processing time in ms
 * @param {string} options.modelType - Model type ('llm' or 'vision')
 * @param {Object} options.analysisHistory - Analysis history service (optional)
 * @param {Object} options.logger - Logger instance
 * @returns {Promise<void>}
 */
async function recordAnalysisResult({
  filePath,
  result,
  processingTime,
  modelType,
  analysisHistory,
  logger
}) {
  if (!analysisHistory) return;

  try {
    const stats = await fs.stat(filePath);
    const fileInfo = {
      path: filePath,
      size: stats.size,
      lastModified: stats.mtimeMs,
      mimeType: null
    };

    const normalized = {
      subject: result.suggestedName || path.basename(filePath),
      category: result.category || 'uncategorized',
      tags: Array.isArray(result.keywords) ? result.keywords : [],
      confidence: typeof result.confidence === 'number' ? result.confidence : 0,
      summary: result.purpose || result.summary || '',
      extractedText: result.extractedText || null,
      model: result.model || modelType,
      processingTime,
      smartFolder: result.smartFolder || null,
      newName: result.suggestedName || null,
      renamed: Boolean(result.suggestedName)
    };

    await analysisHistory.recordAnalysis(fileInfo, normalized);
  } catch (historyError) {
    logger.warn('[ANALYSIS-HISTORY] Failed to record analysis:', historyError.message);
  }
}

/**
 * Get folder categories from custom folders function.
 *
 * @param {Function} getCustomFolders - Function to get custom folders
 * @param {Function} mapFoldersToCategories - Function to map folders to categories
 * @param {Object} logger - Logger instance
 * @returns {Array} Folder categories
 */
function getFolderCategories(getCustomFolders, mapFoldersToCategories, logger) {
  let folders = [];
  try {
    folders = typeof getCustomFolders === 'function' ? getCustomFolders() : [];
  } catch (folderError) {
    logger.warn('[ANALYSIS] Failed to get custom folders:', folderError.message);
  }
  return mapFoldersToCategories(folders);
}

module.exports = {
  withProcessingState,
  buildErrorContext,
  createAnalysisFallback,
  recordAnalysisResult,
  getFolderCategories
};

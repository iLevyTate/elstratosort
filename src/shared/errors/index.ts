/**
 * Error system exports
 * Provides typed errors with context, user messages, and recovery actions
 */
import StratoSortError from './StratoSortError';
import FileOperationError from './FileOperationError';
import AnalysisError from './AnalysisError';
import ServiceError from './ServiceError';
import ValidationError from './ValidationError';
import ErrorHandler from './ErrorHandler';

/**
 * Check if an error is a StratoSort error
 * @param {Error} error - Error to check
 * @returns {boolean} True if error is a StratoSort error
 */
function isStratoSortError(error: any): boolean {
  return error instanceof StratoSortError;
}

/**
 * Normalize an error to a StratoSort error
 * @param {Error} error - Error to normalize
 * @returns {StratoSortError} Normalized error
 */
function normalizeError(error: any): StratoSortError {
  if (isStratoSortError(error)) {
    return error;
  }

  return new StratoSortError(
    error.message || 'An unknown error occurred',
    'UNKNOWN_ERROR',
    { originalError: error.name, stack: error.stack }
  );
}

export {
  // Base error
  StratoSortError,

  // Specific error types
  FileOperationError,
  AnalysisError,
  ServiceError,
  ValidationError,

  // Error handler utility
  ErrorHandler,

  // Helper functions
  isStratoSortError,
  normalizeError,
};

/**
 * Error system exports
 * Provides typed errors with context, user messages, and recovery actions
 */
import StratoSortError, { ErrorCodes, ErrorCode } from './StratoSortError';
import FileOperationError from './FileOperationError';
import FileProcessingError from './FileProcessingError';
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
    { originalError: error.name, stack: error.stack },
  );
}

/**
 * Safely get error message from an unknown error type
 * Handles Error instances, string errors, and objects with message property
 * @param {unknown} error - Unknown error value
 * @returns {string} Error message string
 */
function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  if (typeof error === 'string') {
    return error;
  }
  if (error && typeof error === 'object' && 'message' in error) {
    return String((error as { message: unknown }).message);
  }
  return String(error);
}

/**
 * Safely get error stack from an unknown error type
 * @param {unknown} error - Unknown error value
 * @returns {string | undefined} Error stack if available
 */
function getErrorStack(error: unknown): string | undefined {
  if (error instanceof Error) {
    return error.stack;
  }
  return undefined;
}

export {
  // Base error
  StratoSortError,
  ErrorCodes,

  // Type exports
  type ErrorCode,

  // Specific error types
  FileOperationError,
  FileProcessingError,
  AnalysisError,
  ServiceError,
  ValidationError,

  // Error handler utility
  ErrorHandler,

  // Helper functions
  isStratoSortError,
  normalizeError,
  getErrorMessage,
  getErrorStack,
};

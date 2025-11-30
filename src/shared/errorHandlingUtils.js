/**
 * Centralized Error Handling Utilities
 * Provides reusable error handling patterns across the application.
 *
 * Note: Core async utilities (withTimeout, withRetry) are consolidated in
 * promiseUtils.js. This module re-exports them for backward compatibility
 * and provides error-specific utilities.
 *
 * @module shared/errorHandlingUtils
 */

const { logger } = require('./logger');
const {
  withTimeout: consolidatedWithTimeout,
  withRetry: consolidatedWithRetry,
  safeCall: consolidatedSafeCall,
} = require('./promiseUtils');

logger.setContext('ErrorHandlingUtils');

/**
 * Standard error response structure
 * @typedef {Object} ErrorResponse
 * @property {boolean} success - Always false for errors
 * @property {string} error - Error message
 * @property {string} [code] - Error code for programmatic handling
 * @property {Object} [details] - Additional error context
 */

/**
 * Standard success response structure
 * @typedef {Object} SuccessResponse
 * @property {boolean} success - Always true for success
 * @property {*} data - Response data
 */

/**
 * Error codes for consistent error handling
 */
const ERROR_CODES = {
  // File system errors
  FILE_NOT_FOUND: 'FILE_NOT_FOUND',
  FILE_ACCESS_DENIED: 'FILE_ACCESS_DENIED',
  FILE_READ_ERROR: 'FILE_READ_ERROR',
  FILE_WRITE_ERROR: 'FILE_WRITE_ERROR',
  DIRECTORY_NOT_FOUND: 'DIRECTORY_NOT_FOUND',

  // Analysis errors
  ANALYSIS_FAILED: 'ANALYSIS_FAILED',
  MODEL_NOT_AVAILABLE: 'MODEL_NOT_AVAILABLE',
  INVALID_FILE_TYPE: 'INVALID_FILE_TYPE',

  // Network errors
  NETWORK_ERROR: 'NETWORK_ERROR',
  TIMEOUT: 'TIMEOUT',
  SERVICE_UNAVAILABLE: 'SERVICE_UNAVAILABLE',

  // Validation errors
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  INVALID_INPUT: 'INVALID_INPUT',

  // Generic errors
  UNKNOWN_ERROR: 'UNKNOWN_ERROR',
  OPERATION_CANCELLED: 'OPERATION_CANCELLED',
};

/**
 * Creates a standardized error response
 * @param {string} message - Error message
 * @param {string} [code=ERROR_CODES.UNKNOWN_ERROR] - Error code
 * @param {Object} [details={}] - Additional error details
 * @returns {ErrorResponse}
 */
function createErrorResponse(
  message,
  code = ERROR_CODES.UNKNOWN_ERROR,
  details = {},
) {
  return {
    success: false,
    error: message,
    code,
    details,
  };
}

/**
 * Creates a standardized success response
 * @param {*} data - Response data
 * @returns {SuccessResponse}
 */
function createSuccessResponse(data) {
  return {
    success: true,
    data,
  };
}

/**
 * Wraps an async function with standardized error handling and logging
 * @param {Function} fn - Async function to wrap
 * @param {Object} options - Configuration options
 * @param {string} options.context - Context for logging (e.g., 'FileAnalysis')
 * @param {string} [options.operation] - Operation name for logging
 * @param {Function} [options.onError] - Custom error handler
 * @returns {Function} Wrapped function
 */
function withErrorHandling(fn, { context, operation, onError } = {}) {
  return async function (...args) {
    const startTime = Date.now();
    const logContext = operation || fn.name;

    try {
      logger.debug(`[${context}] Starting: ${logContext}`);
      const result = await fn(...args);
      const duration = Date.now() - startTime;
      logger.debug(`[${context}] Completed: ${logContext}`, {
        duration: `${duration}ms`,
      });
      return createSuccessResponse(result);
    } catch (error) {
      const duration = Date.now() - startTime;

      // Log the error
      logger.error(`[${context}] Failed: ${logContext}`, {
        error: error.message,
        stack: error.stack,
        duration: `${duration}ms`,
      });

      // Call custom error handler if provided
      if (onError) {
        try {
          onError(error, args);
        } catch (handlerError) {
          logger.error(`[${context}] Error handler failed`, {
            original: error.message,
            handler: handlerError.message,
          });
        }
      }

      // Map error to appropriate error code
      const errorCode = mapErrorToCode(error);

      return createErrorResponse(
        error.message || 'An unexpected error occurred',
        errorCode,
        {
          originalError: error.name,
          args: process.env.NODE_ENV === 'development' ? args : undefined,
        },
      );
    }
  };
}

/**
 * Maps error objects to standardized error codes
 * @param {Error} error - Error object
 * @returns {string} Error code
 */
function mapErrorToCode(error) {
  const message = error.message?.toLowerCase() || '';

  if (error.code === 'ENOENT' || message.includes('not found')) {
    return ERROR_CODES.FILE_NOT_FOUND;
  }
  if (error.code === 'EACCES' || message.includes('permission denied')) {
    return ERROR_CODES.FILE_ACCESS_DENIED;
  }
  if (message.includes('timeout')) {
    return ERROR_CODES.TIMEOUT;
  }
  if (message.includes('network') || message.includes('fetch failed')) {
    return ERROR_CODES.NETWORK_ERROR;
  }
  if (message.includes('cancelled') || message.includes('aborted')) {
    return ERROR_CODES.OPERATION_CANCELLED;
  }
  if (message.includes('validation') || message.includes('invalid')) {
    return ERROR_CODES.VALIDATION_ERROR;
  }

  return ERROR_CODES.UNKNOWN_ERROR;
}

/**
 * Retry wrapper with exponential backoff.
 * Re-exported from promiseUtils for backward compatibility.
 *
 * @param {Function} fn - Function to retry
 * @param {Object} options - Retry options
 * @returns {Function} Wrapped function with retry logic
 * @see module:shared/promiseUtils.withRetry
 */
const withRetry = consolidatedWithRetry;

/**
 * Timeout wrapper for async operations.
 * Re-exported from promiseUtils for backward compatibility.
 *
 * @param {Function|Promise} fnOrPromise - Async function to wrap OR a promise to timeout
 * @param {number} timeoutMs - Timeout in milliseconds
 * @param {string} [operationName] - Operation name for error messages
 * @returns {Function|Promise} Wrapped function with timeout OR promise that races with timeout
 * @see module:shared/promiseUtils.withTimeout
 */
const withTimeout = consolidatedWithTimeout;

/**
 * Safe execution wrapper that catches all errors and returns fallback.
 * Re-exported from promiseUtils for backward compatibility.
 *
 * @param {Function} fn - Function to execute safely
 * @param {*} [fallbackValue] - Value to return on error
 * @returns {Function} Wrapped function
 * @see module:shared/promiseUtils.safeCall
 */
const safeExecute = consolidatedSafeCall;

/**
 * Validates input and throws standardized error if invalid
 * @param {Object} input - Input to validate
 * @param {Object} schema - Validation schema
 * @throws {Error} Validation error with details
 */
function validateInput(input, schema) {
  const errors = [];

  for (const [field, rules] of Object.entries(schema)) {
    const value = input[field];

    if (rules.required && (value === undefined || value === null)) {
      errors.push(`${field} is required`);
      continue;
    }

    if (value !== undefined && value !== null) {
      if (rules.type && typeof value !== rules.type) {
        errors.push(`${field} must be of type ${rules.type}`);
      }
      if (rules.min !== undefined && value < rules.min) {
        errors.push(`${field} must be at least ${rules.min}`);
      }
      if (rules.max !== undefined && value > rules.max) {
        errors.push(`${field} must be at most ${rules.max}`);
      }
      if (rules.pattern && !rules.pattern.test(value)) {
        errors.push(`${field} format is invalid`);
      }
      if (rules.custom && !rules.custom(value)) {
        errors.push(
          `${field} validation failed: ${rules.customMessage || 'custom check'}`,
        );
      }
    }
  }

  if (errors.length > 0) {
    const error = new Error('Validation failed');
    error.code = ERROR_CODES.VALIDATION_ERROR;
    error.details = errors;
    throw error;
  }
}

module.exports = {
  ERROR_CODES,
  createErrorResponse,
  createSuccessResponse,
  withErrorHandling,
  withRetry,
  withTimeout,
  safeExecute,
  validateInput,
  mapErrorToCode,
};

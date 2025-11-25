/**
 * Standard IPC Response Helpers
 *
 * Provides consistent response envelope format for all IPC handlers.
 * All handlers should use these helpers to ensure uniform response structure.
 *
 * Success Response: { success: true, data: T, requestId?, timestamp }
 * Error Response: { success: false, error: { code, message, details? }, requestId?, timestamp }
 */

/**
 * Standard error codes for IPC responses
 */
export const ERROR_CODES = {
  // Validation errors
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  INVALID_PATH: 'INVALID_PATH',
  INVALID_INPUT: 'INVALID_INPUT',

  // File operation errors
  FILE_NOT_FOUND: 'FILE_NOT_FOUND',
  FILE_EXISTS: 'FILE_EXISTS',
  PERMISSION_DENIED: 'PERMISSION_DENIED',
  FILE_TOO_LARGE: 'FILE_TOO_LARGE',

  // Service errors
  SERVICE_UNAVAILABLE: 'SERVICE_UNAVAILABLE',
  SERVICE_NOT_INITIALIZED: 'SERVICE_NOT_INITIALIZED',

  // Operation errors
  OPERATION_FAILED: 'OPERATION_FAILED',
  OPERATION_CANCELLED: 'OPERATION_CANCELLED',
  TIMEOUT: 'TIMEOUT',

  // Batch operation errors
  BATCH_TOO_LARGE: 'BATCH_TOO_LARGE',
  EMPTY_BATCH: 'EMPTY_BATCH',
  PARTIAL_FAILURE: 'PARTIAL_FAILURE',

  // AI/Analysis errors
  AI_UNAVAILABLE: 'AI_UNAVAILABLE',
  MODEL_NOT_FOUND: 'MODEL_NOT_FOUND',
  ANALYSIS_FAILED: 'ANALYSIS_FAILED',

  // Generic
  UNKNOWN_ERROR: 'UNKNOWN_ERROR',
};

/**
 * Create a standardized success response
 * @param {*} data - The response data
 * @param {string|null} requestId - Optional request ID for tracking
 * @returns {{ success: true, data: *, requestId?: string, timestamp: string }}
 */
export function createSuccess(data, requestId = null) {
  const response: any = {
    success: true,
    data,
    timestamp: new Date().toISOString(),
  };

  if (requestId) {
    response.requestId = requestId;
  }

  return response;
}

/**
 * Create a standardized error response
 * @param {string} code - Error code from ERROR_CODES
 * @param {string} message - Human-readable error message
 * @param {*} details - Optional additional error details
 * @param {string|null} requestId - Optional request ID for tracking
 * @returns {{ success: false, error: { code: string, message: string, details?: * }, requestId?: string, timestamp: string }}
 */
export function createError(code, message, details = null, requestId = null) {
  const response: any = {
    success: false,
    error: {
      code: code || ERROR_CODES.UNKNOWN_ERROR,
      message: message || 'An unknown error occurred',
    },
    timestamp: new Date().toISOString(),
  };

  if (details !== null && details !== undefined) {
    response.error.details = details;
  }

  if (requestId) {
    response.requestId = requestId;
  }

  return response;
}

/**
 * Create an error response from an Error object
 * @param {Error} error - The error object
 * @param {string|null} requestId - Optional request ID for tracking
 * @returns {{ success: false, error: { code: string, message: string, details?: * }, requestId?: string, timestamp: string }}
 */
export function createErrorFromException(error, requestId = null) {
  return createError(
    (error as any).code || ERROR_CODES.OPERATION_FAILED,
    error.message || 'An error occurred',
    (error as any).details || null,
    requestId
  );
}

/**
 * Check if a response is in a standard-like format (has success property)
 * This is permissive to support backward compatibility with handlers that
 * return { success: true, ...data } instead of { success: true, data: {...} }
 * @param {*} response - The response to check
 * @returns {boolean}
 */
export function isStandardResponse(response) {
  if (response === null || typeof response !== 'object') {
    return false;
  }

  // If it has a success boolean property, consider it already in a success-like format
  // This handles both new format { success, data } and legacy format { success, ...fields }
  if (typeof (response as any).success === 'boolean') {
    return true;
  }

  return false;
}

/**
 * Wrap a raw value in a success response if not already wrapped
 * @param {*} value - The value to wrap
 * @param {string|null} requestId - Optional request ID
 * @returns {{ success: boolean, data?: *, error?: object, timestamp: string }}
 */
export function ensureStandardResponse(value, requestId = null) {
  if (isStandardResponse(value)) {
    // Already in standard format, just add requestId if provided
    if (requestId && !(value as any).requestId) {
      return { ...value, requestId };
    }
    return value;
  }

  return createSuccess(value, requestId);
}

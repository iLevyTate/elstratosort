/**
 * Standard error codes for StratoSort errors
 */
export const ErrorCodes = {
  // Validation errors
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  INVALID_PATH: 'INVALID_PATH',
  INVALID_INPUT: 'INVALID_INPUT',
  MISSING_FIELD: 'MISSING_FIELD',

  // File operation errors
  FILE_NOT_FOUND: 'FILE_NOT_FOUND',
  FILE_EXISTS: 'FILE_EXISTS',
  FILE_MOVE_FAILED: 'FILE_MOVE_FAILED',
  FILE_COPY_FAILED: 'FILE_COPY_FAILED',
  FILE_DELETE_FAILED: 'FILE_DELETE_FAILED',
  PERMISSION_DENIED: 'PERMISSION_DENIED',
  FILE_TOO_LARGE: 'FILE_TOO_LARGE',

  // Analysis errors
  ANALYSIS_ERROR: 'ANALYSIS_ERROR',
  ANALYSIS_VALIDATION_ERROR: 'ANALYSIS_VALIDATION_ERROR',
  ANALYSIS_TIMEOUT: 'ANALYSIS_TIMEOUT',
  MODEL_ERROR: 'MODEL_ERROR',

  // Organization errors
  ORGANIZATION_ERROR: 'ORGANIZATION_ERROR',
  ORGANIZATION_FAILED: 'ORGANIZATION_FAILED',

  // Service errors
  SERVICE_UNAVAILABLE: 'SERVICE_UNAVAILABLE',
  SERVICE_NOT_INITIALIZED: 'SERVICE_NOT_INITIALIZED',
  INIT_FAILED: 'INIT_FAILED',

  // Operations
  OPERATION_FAILED: 'OPERATION_FAILED',
  OPERATION_CANCELLED: 'OPERATION_CANCELLED',
  TIMEOUT: 'TIMEOUT',

  // Batch operations
  BATCH_TOO_LARGE: 'BATCH_TOO_LARGE',
  EMPTY_BATCH: 'EMPTY_BATCH',
  PARTIAL_FAILURE: 'PARTIAL_FAILURE',

  // AI/Analysis
  AI_UNAVAILABLE: 'AI_UNAVAILABLE',
  MODEL_NOT_FOUND: 'MODEL_NOT_FOUND',

  // Unknown
  UNKNOWN_ERROR: 'UNKNOWN_ERROR',
} as const;

export type ErrorCode = (typeof ErrorCodes)[keyof typeof ErrorCodes];

/**
 * Base error class for all StratoSort errors
 * Provides rich context, user messages, and recovery actions
 */
class StratoSortError extends Error {
  code: string;
  context: Record<string, any>;
  userMessage: string;
  recoveryActions: Array<{
    label: string;
    action: string;
    description: string;
  }>;
  timestamp: string;

  /**
   * @param message - Technical error message for developers
   * @param code - Error code (e.g., 'FILE_MOVE_FAILED')
   * @param context - Additional context (file paths, operations, etc.)
   * @param userMessage - User-friendly message
   * @param recoveryActions - Suggested actions for user
   */
  constructor(
    message: string,
    code: string,
    context: Record<string, any> = {},
    userMessage: string | null = null,
    recoveryActions: Array<{
      label: string;
      action: string;
      description: string;
    }> = []
  ) {
    super(message);
    this.name = this.constructor.name;
    this.code = code;
    this.context = context;
    this.userMessage = userMessage || message;
    this.recoveryActions = recoveryActions;
    this.timestamp = new Date().toISOString();

    // Capture stack trace
    Error.captureStackTrace(this, this.constructor);
  }

  /**
   * Convert to JSON for serialization
   */
  toJSON() {
    return {
      name: this.name,
      message: this.message,
      code: this.code,
      context: this.context,
      userMessage: this.userMessage,
      recoveryActions: this.recoveryActions,
      timestamp: this.timestamp,
      stack: this.stack,
    };
  }

  /**
   * Get user-facing error display object
   */
  toUserDisplay() {
    return {
      title: this.userMessage,
      details: this.message,
      code: this.code,
      actions: this.recoveryActions,
      timestamp: this.timestamp,
    };
  }

  /**
   * Get structured log entry
   */
  toLogEntry(level: string = 'error') {
    return {
      level,
      name: this.name,
      message: this.message,
      code: this.code,
      context: this.context,
      timestamp: this.timestamp,
      stack: this.stack,
    };
  }
}

export { StratoSortError };
export default StratoSortError;

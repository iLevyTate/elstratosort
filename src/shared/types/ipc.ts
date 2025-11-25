/**
 * IPC Type Definitions
 * Standardized envelope types for main↔renderer communication
 * Used for request tracing and debugging via correlation IDs
 */

/**
 * Request envelope sent from renderer to main
 * Contains correlation ID for tracing requests through the system
 */
export interface IPCRequest<T = unknown> {
  /** Unique identifier for tracing this request through logs */
  correlationId: string;
  /** When the request was initiated */
  timestamp: number;
  /** The actual request payload */
  payload: T;
}

/**
 * Response envelope returned from main to renderer
 * Contains correlation ID to match with original request
 */
export interface IPCResponse<T = unknown> {
  /** Matches the correlationId from the request */
  correlationId: string;
  /** Whether the operation succeeded */
  success: boolean;
  /** The response data (only present if success is true) */
  data?: T;
  /** Error details (only present if success is false) */
  error?: IPCError;
  /** How long the operation took in milliseconds */
  durationMs: number;
  /** When the response was generated */
  timestamp: string;
}

/**
 * Standardized error structure for IPC responses
 */
export interface IPCError {
  /** Machine-readable error code */
  code: string;
  /** Human-readable error message */
  message: string;
  /** Additional error context */
  details?: unknown;
  /** Original stack trace (only in development) */
  stack?: string;
}

/**
 * Log context for structured logging
 */
export interface LogContext {
  /** Correlation ID for request tracing */
  correlationId?: string;
  /** Component/module name */
  component?: string;
  /** Operation being performed */
  operation?: string;
  /** Duration in milliseconds */
  durationMs?: number;
  /** Additional context data */
  [key: string]: unknown;
}

/**
 * Standard error codes used in IPC responses
 */
export const IPC_ERROR_CODES = {
  // General errors
  UNKNOWN: 'UNKNOWN_ERROR',
  VALIDATION: 'VALIDATION_ERROR',
  NOT_FOUND: 'NOT_FOUND',
  TIMEOUT: 'TIMEOUT',
  CANCELLED: 'CANCELLED',

  // File operations
  FILE_NOT_FOUND: 'FILE_NOT_FOUND',
  FILE_ACCESS_DENIED: 'FILE_ACCESS_DENIED',
  FILE_ALREADY_EXISTS: 'FILE_ALREADY_EXISTS',
  FILE_OPERATION_FAILED: 'FILE_OPERATION_FAILED',

  // Service errors
  SERVICE_UNAVAILABLE: 'SERVICE_UNAVAILABLE',
  SERVICE_ERROR: 'SERVICE_ERROR',
  OLLAMA_ERROR: 'OLLAMA_ERROR',

  // Analysis errors
  ANALYSIS_FAILED: 'ANALYSIS_FAILED',
  MODEL_NOT_FOUND: 'MODEL_NOT_FOUND',

  // IPC errors
  HANDLER_NOT_FOUND: 'HANDLER_NOT_FOUND',
  INVALID_CHANNEL: 'INVALID_CHANNEL',
  RATE_LIMITED: 'RATE_LIMITED',
} as const;

export type IPCErrorCode = typeof IPC_ERROR_CODES[keyof typeof IPC_ERROR_CODES];

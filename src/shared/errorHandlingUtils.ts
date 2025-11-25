/**
 * Centralized Error Handling Utilities
 * Provides reusable error handling patterns across the application
 */
import { logger } from './logger';

logger.setContext('ErrorHandlingUtils');

/**
 * Standard error response structure
 */
export interface ErrorResponse {
  success: false;
  error: string;
  code?: string;
  details?: Record<string, any>;
}

/**
 * Standard success response structure
 */
export interface SuccessResponse<T = any> {
  success: true;
  data: T;
}

/**
 * Error codes for consistent error handling
 */
export const ERROR_CODES = {
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
} as const;

/**
 * Creates a standardized error response
 */
export function createErrorResponse(
  message: string,
  code: string = ERROR_CODES.UNKNOWN_ERROR,
  details: Record<string, any> = {},
): ErrorResponse {
  return {
    success: false,
    error: message,
    code,
    details,
  };
}

/**
 * Creates a standardized success response
 */
export function createSuccessResponse<T = any>(data: T): SuccessResponse<T> {
  return {
    success: true,
    data,
  };
}

/**
 * Options for withErrorHandling function
 */
interface ErrorHandlingOptions {
  context: string;
  operation?: string;
  onError?: (error: any, args: any[]) => void;
}

/**
 * Wraps an async function with standardized error handling and logging
 */
export function withErrorHandling<T extends (...args: any[]) => Promise<any>>(
  fn: T,
  options: ErrorHandlingOptions,
): (...args: Parameters<T>) => Promise<SuccessResponse<Awaited<ReturnType<T>>> | ErrorResponse> {
  const { context, operation, onError } = options;

  return async function (...args: Parameters<T>): Promise<SuccessResponse<Awaited<ReturnType<T>>> | ErrorResponse> {
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
    } catch (error: any) {
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
        } catch (handlerError: any) {
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
 */
export function mapErrorToCode(error: any): string {
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
 * Retry options interface
 */
interface RetryOptions {
  maxRetries?: number;
  initialDelay?: number;
  maxDelay?: number;
  shouldRetry?: (error: any) => boolean;
}

/**
 * Retry wrapper with exponential backoff
 */
export function withRetry<T extends (...args: any[]) => Promise<any>>(
  fn: T,
  options: RetryOptions = {},
): (...args: Parameters<T>) => Promise<Awaited<ReturnType<T>>> {
  const {
    maxRetries = 3,
    initialDelay = 1000,
    maxDelay = 10000,
    shouldRetry = () => true,
  } = options;

  return async function (...args: Parameters<T>): Promise<Awaited<ReturnType<T>>> {
    let lastError: any;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        return await fn(...args);
      } catch (error: any) {
        lastError = error;
        if (attempt < maxRetries && shouldRetry(error)) {
          const delay = Math.min(initialDelay * Math.pow(2, attempt), maxDelay);
          logger.warn(
            `Retry attempt ${attempt + 1}/${maxRetries} after ${delay}ms`,
            {
              error: error.message,
            },
          );
          await new Promise((resolve) => setTimeout(resolve, delay));
        } else {
          break;
        }
      }
    }

    throw lastError;
  };
}

/**
 * Timeout wrapper for async operations
 */
export function withTimeout<T extends (...args: any[]) => Promise<any>>(
  fn: T,
  timeoutMs: number,
  message?: string,
): (...args: Parameters<T>) => Promise<Awaited<ReturnType<T>>> {
  return async function (...args: Parameters<T>): Promise<Awaited<ReturnType<T>>> {
    return Promise.race([
      fn(...args),
      new Promise<never>((_, reject) =>
        setTimeout(
          () =>
            reject(
              new Error(message || `Operation timed out after ${timeoutMs}ms`),
            ),
          timeoutMs,
        ),
      ),
    ]);
  };
}

/**
 * Safe execution wrapper that catches all errors and returns ErrorResponse
 */
export function safeExecute<T extends (...args: any[]) => Promise<any>>(
  fn: T,
  fallbackValue: any = null,
): (...args: Parameters<T>) => Promise<Awaited<ReturnType<T>> | typeof fallbackValue> {
  return async function (...args: Parameters<T>): Promise<Awaited<ReturnType<T>> | typeof fallbackValue> {
    try {
      return await fn(...args);
    } catch (error: any) {
      logger.error('Safe execution caught error', {
        function: fn.name,
        error: error.message,
      });
      return fallbackValue;
    }
  };
}

/**
 * Validation rule interface
 */
interface ValidationRule {
  required?: boolean;
  type?: string;
  min?: number;
  max?: number;
  pattern?: RegExp;
  custom?: (value: any) => boolean;
  customMessage?: string;
}

/**
 * Validation schema type
 */
type ValidationSchema = Record<string, ValidationRule>;

/**
 * Validation error class
 */
export class ValidationError extends Error {
  code: string;
  details: string[];

  constructor(message: string, details: string[]) {
    super(message);
    this.name = 'ValidationError';
    this.code = ERROR_CODES.VALIDATION_ERROR;
    this.details = details;
  }
}

/**
 * Validates input and throws standardized error if invalid
 */
export function validateInput(input: Record<string, any>, schema: ValidationSchema): void {
  const errors: string[] = [];

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
    throw new ValidationError('Validation failed', errors);
  }
}

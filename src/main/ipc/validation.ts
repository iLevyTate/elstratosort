/**
 * IPC Validation Middleware
 * Provides runtime validation for IPC messages using Zod schemas
 * and ensures standardized response envelope format.
 */
import { z } from 'zod';
import { StratoSortError } from '../../shared/errors';
import log from 'electron-log';
import {
  createSuccess,
  createError,
  createErrorFromException,
  isStandardResponse,
  ERROR_CODES,
} from './responseHelpers';

log.transports.file.level = 'info';
log.transports.console.level = 'debug';

/**
 * Wraps an IPC handler with Zod validation
 * @param {z.ZodSchema} schema - Zod schema to validate against
 * @param {Function} handler - IPC handler function
 * @returns {Function} Wrapped handler with validation
 */
export function validateIpc(schema) {
  return (handler) => {
    return async (event, ...args) => {
      const requestId = generateRequestId();
      const startTime = Date.now();

      try {
        // Parse the data (single argument or multiple)
        const data = args.length === 1 ? args[0] : args;

        // Validate with Zod
        const validated = schema.parse(data);

        log.debug(`[IPC] Request validated`, {
          requestId,
          channel: handler.name,
          argsCount: args.length,
        });

        // Call the original handler with validated data
        const result = await handler(event, validated);

        log.info(`[IPC] Request completed`, {
          requestId,
          channel: handler.name,
          duration: Date.now() - startTime,
          success: true,
        });

        return result;
      } catch (error) {
        if (error instanceof z.ZodError) {
          // Zod validation error
          const errorDetails = error.issues || [];
          log.error(`[IPC] Validation failed`, {
            requestId,
            channel: handler.name,
            duration: Date.now() - startTime,
            errors: errorDetails,
          });

          throw new StratoSortError(
            'Invalid IPC request data',
            'VALIDATION_FAILED',
            {
              requestId,
              errors: errorDetails.map((e) => ({
                path: e.path ? e.path.join('.') : 'unknown',
                message: e.message || 'Validation failed',
                code: e.code || 'invalid',
              })),
            },
            'The request data is invalid. Please check your input and try again.',
            [
              {
                label: 'Review input',
                action: 'review',
                description: 'Check the data being sent and correct any errors',
              },
            ]
          );
        }

        // Other errors (pass through)
        log.error(`[IPC] Request failed`, {
          requestId,
          channel: handler.name,
          duration: Date.now() - startTime,
          error: (error as Error).message,
        });

        throw error;
      }
    };
  };
}

/**
 * Creates an IPC handler with request ID tracking
 * @param {Function} handler - IPC handler function
 * @returns {Function} Wrapped handler with request ID
 */
export function withRequestId(handler) {
  return async (event, ...args) => {
    const requestId = generateRequestId();
    const startTime = Date.now();

    log.info(`[IPC] Request started`, {
      requestId,
      channel: handler.name || 'unknown',
    });

    try {
      const result = await handler(event, ...args);

      log.info(`[IPC] Request completed`, {
        requestId,
        duration: Date.now() - startTime,
      });

      return result;
    } catch (error) {
      log.error(`[IPC] Request failed`, {
        requestId,
        duration: Date.now() - startTime,
        error: (error as Error).message,
        stack: (error as Error).stack,
      });

      throw error;
    }
  };
}

/**
 * Creates an IPC error handler wrapper
 * Standardizes error responses for IPC using the standard envelope format.
 * Also wraps successful raw returns in the standard success envelope.
 * @param {Function} handler - IPC handler function
 * @returns {Function} Wrapped handler with error handling and standard response format
 */
export function withErrorHandling(handler) {
  return async (event, ...args) => {
    try {
      const result = await handler(event, ...args);

      // If result is already in standard format, pass through
      if (isStandardResponse(result)) {
        return result;
      }

      // Wrap raw returns in success envelope
      return createSuccess(result);
    } catch (error) {
      const { isStratoSortError } = await import('../../shared/errors');

      if (isStratoSortError(error)) {
        // Known StratoSort error - use standard error format
        const errorJson = (error as any).toJSON();
        return createError(
          errorJson.code || ERROR_CODES.OPERATION_FAILED,
          errorJson.message,
          { name: errorJson.name, details: errorJson.details }
        );
      }

      // Unknown error - log and return standard error format
      log.error('[IPC] Unexpected error', {
        error: (error as Error).message,
        stack: (error as Error).stack,
      });

      return createErrorFromException(error as Error);
    }
  };
}

/**
 * Generate a unique request ID
 * @returns {string} Request ID
 */
function generateRequestId() {
  return `req_${Date.now()}_${Math.random().toString(36).substring(7)}`;
}

/**
 * Compose multiple middleware functions
 * @param {...Function} middlewares - Middleware functions to compose
 * @returns {Function} Composed middleware
 */
export function compose(...middlewares) {
  return (handler) => {
    return middlewares.reduceRight(
      (wrapped, middleware) => middleware(wrapped),
      handler
    );
  };
}

export { generateRequestId };

// Re-export response helpers for convenience
export {
  createSuccess,
  createError,
  createErrorFromException,
  isStandardResponse,
  ERROR_CODES,
};

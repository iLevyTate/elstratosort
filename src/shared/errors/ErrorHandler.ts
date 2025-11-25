/**
 * Centralized error handling utility
 */
import StratoSortError from "./StratoSortError";
import { logger } from "../logger";

class ErrorHandler {
  /**
   * Handle an error - log it and return user-facing error object
   *
   * @param error - The error to handle
   * @param context - Additional context
   * @returns User-facing error object
   */
  static handle(error: Error, context: Record<string, unknown> = {}): {
    title: string;
    details: string;
    code: string;
    actions: Array<{ label: string; action: string; description: string }>;
    timestamp: string;
  } {
    // Log the error
    if (error instanceof StratoSortError) {
      const logEntry = error.toLogEntry();
      logger.error(`[${logEntry.name}] ${logEntry.message}`, {
        ...logEntry,
        additionalContext: context,
      });
    } else {
      // Unknown error type
      logger.error('[UnhandledError] Unexpected error occurred', {
        message: error.message,
        stack: error.stack,
        context,
        timestamp: new Date().toISOString(),
      });
    }

    // Return user-facing error
    if (error instanceof StratoSortError) {
      return error.toUserDisplay();
    }

    // Fallback for unknown errors
    return {
      title: 'An unexpected error occurred',
      details: error.message || 'Unknown error',
      code: 'UNKNOWN_ERROR',
      actions: [
        {
          label: 'Try again',
          action: 'retry',
          description: 'Retry the operation',
        },
        {
          label: 'Report bug',
          action: 'reportBug',
          description: 'Help us fix this issue by reporting it',
        },
      ],
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * Wrap a function to automatically convert errors
   *
   * @param fn - Function to wrap
   * @param errorFactory - Function that creates appropriate error type
   * @returns Wrapped function
   */
  static wrap<T extends unknown[], R>(
    fn: (...args: T) => Promise<R>,
    errorFactory: (error: Error, ...args: T) => Error
  ): (...args: T) => Promise<R> {
    return async (...args: T): Promise<R> => {
      try {
        return await fn(...args);
      } catch (error) {
        // If already a StratoSortError, rethrow as-is
        if (error instanceof StratoSortError) {
          throw error;
        }

        // Convert to appropriate error type
        throw errorFactory(error as Error, ...args);
      }
    };
  }

  /**
   * Create an async error boundary for IPC handlers
   *
   * @param handler - IPC handler function
   * @returns Wrapped handler that catches and formats errors
   */
  static ipcBoundary<T extends unknown[], R>(
    handler: (event: Electron.IpcMainInvokeEvent, ...args: T) => Promise<R>
  ): (event: Electron.IpcMainInvokeEvent, ...args: T) => Promise<{ success: true; data: R } | { success: false; error: ReturnType<typeof ErrorHandler.handle> }> {
    return async (event: Electron.IpcMainInvokeEvent, ...args: T) => {
      try {
        const result = await handler(event, ...args);
        return { success: true as const, data: result };
      } catch (error) {
        const userError = ErrorHandler.handle(error as Error, {
          ipcHandler: handler.name,
          args: args.map((arg) =>
            typeof arg === 'object' ? JSON.stringify(arg) : String(arg)
          ),
        });

        return {
          success: false as const,
          error: userError,
        };
      }
    };
  }

  /**
   * Convert error to safe serializable format for IPC
   *
   * @param error - Error to serialize
   * @returns Serializable error object
   */
  static serialize(error: Error & { code?: string }): {
    name: string;
    message: string;
    code: string;
    stack?: string;
    timestamp: string;
  } {
    if (error instanceof StratoSortError) {
      return error.toJSON();
    }

    return {
      name: error.name || 'Error',
      message: error.message,
      code: error.code || 'UNKNOWN',
      stack: error.stack,
      timestamp: new Date().toISOString(),
    };
  }
}

export default ErrorHandler;

/**
 * Centralized Ollama API retry utility with exponential backoff
 * Provides robust error handling for transient failures
 */
import { logger } from '../../shared/logger';
import { withRetry } from '../../shared/errorHandlingUtils';

logger.setContext('OllamaApiRetry');

/**
 * Determines if an error is retryable
 */
function isRetryableError(error: any): boolean {
  if (!error) return false;

  const message = error.message?.toLowerCase() || '';
  const code = error.code || '';

  // Network errors (retryable)
  if (
    code === 'ECONNREFUSED' ||
    code === 'ECONNRESET' ||
    code === 'ETIMEDOUT' ||
    code === 'ENOTFOUND' ||
    code === 'EHOSTUNREACH' ||
    code === 'ENETUNREACH'
  ) {
    return true;
  }

  // Fetch errors (retryable)
  if (
    message.includes('fetch failed') ||
    message.includes('network') ||
    message.includes('timeout') ||
    message.includes('aborted') ||
    message.includes('connection')
  ) {
    return true;
  }

  // HTTP status codes (some are retryable)
  if (error.status) {
    // Retryable HTTP status codes
    const retryableStatuses = [
      408, // Request Timeout
      429, // Too Many Requests
      500, // Internal Server Error
      502, // Bad Gateway
      503, // Service Unavailable
      504, // Gateway Timeout
    ];
    if (retryableStatuses.includes(error.status)) {
      return true;
    }
  }

  // Ollama-specific temporary errors
  if (
    message.includes('model is loading') ||
    message.includes('server busy') ||
    message.includes('temporarily unavailable')
  ) {
    return true;
  }

  // Non-retryable errors
  if (
    message.includes('invalid') ||
    message.includes('validation') ||
    message.includes('not found') ||
    message.includes('unauthorized') ||
    message.includes('forbidden') ||
    message.includes('bad request') ||
    message.includes('zero length image') ||
    message.includes('unsupported')
  ) {
    return false;
  }

  // Default to not retrying unknown errors
  return false;
}

/**
 * Options for Ollama retry wrapper
 */
interface OllamaRetryOptions {
  operation?: string;
  maxRetries?: number;
  initialDelay?: number;
  maxDelay?: number;
  onRetry?: ((attempt: number, options: OllamaRetryOptions) => void | Promise<void>) | null;
}

/**
 * Retry context added to errors
 */
interface RetryContext {
  operation: string;
  attempts: number;
  maxRetries: number;
  wasRetryable: boolean;
}

/**
 * Error with retry context
 */
interface ErrorWithRetryContext extends Error {
  retryContext?: RetryContext;
}

/**
 * Wraps an Ollama API call with retry logic and exponential backoff
 */
export async function withOllamaRetry<T>(
  apiCall: () => Promise<T>,
  options: OllamaRetryOptions = {},
): Promise<T> {
  const {
    operation = 'Ollama API call',
    maxRetries = 3,
    initialDelay = 1000,
    maxDelay = 4000,
    onRetry = null,
  } = options;

  let attemptNumber = 0;

  try {
    // Intercept retries to log and call onRetry callback
    const originalCall = apiCall;
    const instrumentedCall = async (): Promise<T> => {
      attemptNumber++;

      if (attemptNumber > 1) {
        logger.info(
          `[${operation}] Retry attempt ${attemptNumber}/${maxRetries + 1}`,
        );
        if (onRetry) {
          await onRetry(attemptNumber - 1, options);
        }
      }

      try {
        const result = await originalCall();

        if (attemptNumber > 1) {
          logger.info(
            `[${operation}] Succeeded on retry attempt ${attemptNumber}`,
          );
        }

        return result;
      } catch (error: any) {
        // Enhanced error logging
        const errorDetails = {
          attempt: attemptNumber,
          error: error.message,
          code: error.code,
          status: error.status,
          retryable: isRetryableError(error),
        };

        if (attemptNumber <= maxRetries && isRetryableError(error)) {
          const delay = Math.min(
            initialDelay * Math.pow(2, attemptNumber - 1),
            maxDelay,
          );
          logger.warn(
            `[${operation}] Failed on attempt ${attemptNumber}, retrying in ${delay}ms:`,
            errorDetails,
          );
        } else {
          logger.error(
            `[${operation}] Failed after ${attemptNumber} attempts:`,
            errorDetails,
          );
        }

        throw error;
      }
    };

    // Use the instrumented call with retry wrapper
    return await withRetry(instrumentedCall, {
      maxRetries,
      initialDelay,
      maxDelay,
      shouldRetry: isRetryableError,
    })();
  } catch (error: any) {
    // Final error after all retries exhausted
    logger.error(`[${operation}] All retry attempts exhausted:`, {
      totalAttempts: attemptNumber,
      finalError: error.message,
      code: error.code,
      status: error.status,
    });

    // Add retry context to the error
    const errorWithContext = error as ErrorWithRetryContext;
    errorWithContext.retryContext = {
      operation,
      attempts: attemptNumber,
      maxRetries,
      wasRetryable: isRetryableError(error),
    };

    throw error;
  }
}

/**
 * HTTP error with additional properties
 */
interface HttpError extends Error {
  status?: number;
  response?: Response;
}

/**
 * Wraps a fetch call to Ollama with retry logic
 */
export async function fetchWithRetry(
  url: string,
  fetchOptions: RequestInit = {},
  retryOptions: OllamaRetryOptions = {},
): Promise<Response> {
  const operation = retryOptions.operation || `Fetch ${url}`;

  return withOllamaRetry(
    async () => {
      const response = await fetch(url, fetchOptions);

      // Check if response indicates a retryable error
      if (!response.ok) {
        const error: HttpError = new Error(
          `HTTP ${response.status}: ${response.statusText}`,
        );
        error.status = response.status;
        error.response = response;

        // Try to extract error message from response body
        try {
          const text = await response.text();
          if (text) {
            const jsonError = JSON.parse(text);
            if (jsonError.error) {
              error.message = `HTTP ${response.status}: ${jsonError.error}`;
            }
          }
        } catch {
          // Ignore parsing errors
        }

        throw error;
      }

      return response;
    },
    {
      operation,
      ...retryOptions,
    },
  );
}

/**
 * Ollama client interface
 */
interface OllamaClient {
  generate(options: any): Promise<any>;
}

/**
 * Wraps an Ollama client generate call with retry logic
 */
export async function generateWithRetry(
  client: OllamaClient,
  generateOptions: any,
  retryOptions: OllamaRetryOptions = {},
): Promise<any> {
  const operation =
    retryOptions.operation || `Generate with ${generateOptions.model}`;

  return withOllamaRetry(
    async () => {
      return await client.generate(generateOptions);
    },
    {
      operation,
      ...retryOptions,
    },
  );
}

/**
 * Axios response interface
 */
interface AxiosResponse {
  status: number;
  statusText: string;
  data: any;
}

/**
 * Axios error interface
 */
interface AxiosError extends Error {
  response?: AxiosResponse;
  code?: string;
}

/**
 * Wraps an axios call with retry logic for Ollama endpoints
 */
export async function axiosWithRetry<T = any>(
  axiosCall: () => Promise<T>,
  retryOptions: OllamaRetryOptions = {},
): Promise<T> {
  const operation = retryOptions.operation || 'Axios request';

  return withOllamaRetry(
    async () => {
      try {
        return await axiosCall();
      } catch (error: any) {
        // Normalize axios errors
        const axiosError = error as AxiosError;
        if (axiosError.response) {
          const normalizedError: HttpError = new Error(
            `HTTP ${axiosError.response.status}: ${axiosError.response.statusText}`,
          );
          normalizedError.status = axiosError.response.status;
          normalizedError.response = axiosError.response as any;
          throw normalizedError;
        }
        throw error;
      }
    },
    {
      operation,
      ...retryOptions,
    },
  );
}

export { isRetryableError };

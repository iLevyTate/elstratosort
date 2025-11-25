/**
 * Promise utilities for robust async operations
 */
import { logger } from '../../shared/logger';
import { TIMEOUTS } from '../../shared/performanceConstants';

logger.setContext('PromiseUtils');

/**
 * Type alias for timeout IDs that works across Node.js versions
 */
type TimeoutId = ReturnType<typeof setTimeout>;

/**
 * Execute a promise with a timeout
 */
export async function withTimeout<T = any>(
  promise: Promise<T>,
  timeoutMs: number = 30000,
  operationName: string = 'Operation',
): Promise<T> {
  let timeoutId: TimeoutId | null = null;

  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => {
      reject(new Error(`${operationName} timed out after ${timeoutMs}ms`));
    }, timeoutMs);

    // Allow process to exit even if timeout is pending
    if (timeoutId && typeof timeoutId === 'object' && 'unref' in timeoutId) {
      (timeoutId as NodeJS.Timeout).unref();
    }
  });

  try {
    const result = await Promise.race([promise, timeoutPromise]);
    if (timeoutId) clearTimeout(timeoutId);
    return result;
  } catch (error) {
    if (timeoutId) clearTimeout(timeoutId);
    throw error;
  }
}

/**
 * Retry options interface
 */
interface RetryOptions {
  maxAttempts?: number;
  delay?: number;
  backoff?: number;
  operationName?: string;
  shouldRetry?: (error: any, attempt: number) => boolean;
}

/**
 * Execute a promise with retry logic
 */
export async function withRetry<T = any>(
  fn: () => Promise<T>,
  options: RetryOptions = {},
): Promise<T> {
  const {
    maxAttempts = 3,
    delay = 1000,
    backoff = 2,
    operationName = 'Operation',
    shouldRetry = () => true,
  } = options;

  let lastError: any;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (error: any) {
      lastError = error;

      if (attempt === maxAttempts) {
        logger.error(
          `[Retry] ${operationName} failed after ${maxAttempts} attempts`,
          {
            error: error.message,
          },
        );
        break;
      }

      // Check if we should retry this error
      if (!shouldRetry(error, attempt)) {
        logger.info(`[Retry] ${operationName} not retryable`, {
          error: error.message,
          attempt,
        });
        break;
      }

      const waitTime = delay * Math.pow(backoff, attempt - 1);
      logger.warn(
        `[Retry] ${operationName} attempt ${attempt} failed, retrying in ${waitTime}ms`,
        {
          error: error.message,
        },
      );

      await new Promise((resolve) => setTimeout(resolve, waitTime));
    }
  }

  throw lastError;
}

/**
 * Ensure all promises in an array are settled with proper error handling
 */
export async function allSettledWithErrors<T = any>(
  promises: Promise<T>[],
  onError: ((error: any, index: number) => void | Promise<void>) | null = null,
): Promise<(T | null)[]> {
  if (!Array.isArray(promises)) {
    throw new Error('Expected an array of promises');
  }

  const results = await Promise.allSettled(promises);
  const finalResults: (T | null)[] = [];
  const errors: Array<{ index: number; error: any }> = [];

  for (let i = 0; i < results.length; i++) {
    const result = results[i];
    if (result.status === 'fulfilled') {
      finalResults.push(result.value);
    } else {
      errors.push({ index: i, error: result.reason });
      finalResults.push(null);

      if (onError) {
        try {
          await onError(result.reason, i);
        } catch (handlerError: any) {
          logger.error('[AllSettled] Error handler failed', {
            error: handlerError.message,
            originalError: result.reason?.message,
          });
        }
      }
    }
  }

  if (errors.length > 0) {
    logger.warn(
      `[AllSettled] ${errors.length} of ${promises.length} promises failed`,
      {
        errors: errors.map((e) => ({
          index: e.index,
          message: e.error?.message,
        })),
      },
    );
  }

  return finalResults;
}

/**
 * Deferred promise interface
 */
interface Deferred<T = any> {
  promise: Promise<T>;
  resolve: (value: T | PromiseLike<T>) => void;
  reject: (reason?: any) => void;
}

/**
 * Create a deferred promise that can be resolved/rejected externally
 */
export function createDeferred<T = any>(): Deferred<T> {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: any) => void;

  const promise = new Promise<T>((_resolve, _reject) => {
    resolve = _resolve;
    reject = _reject;
  });

  return { promise, resolve, reject };
}

/**
 * Execute promises in batches with controlled concurrency
 */
export async function batchProcess<T = any, R = any>(
  items: T[],
  fn: (item: T, index: number) => Promise<R>,
  batchSize: number = 5,
): Promise<(R | null)[]> {
  const results: (R | null)[] = [];

  for (let i = 0; i < items.length; i += batchSize) {
    const batch = items.slice(i, i + batchSize);
    const batchPromises = batch.map((item, index) => fn(item, i + index));
    const batchResults = await allSettledWithErrors(batchPromises);
    results.push(...batchResults);

    // Add small delay between batches to prevent overwhelming the system
    if (i + batchSize < items.length) {
      await new Promise((resolve) => setTimeout(resolve, TIMEOUTS.DELAY_BATCH));
    }
  }

  return results;
}

/**
 * Create a promise that resolves after a delay
 */
export function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    const timeoutId = setTimeout(resolve, ms);
    // Allow process to exit even if timeout is pending
    if (timeoutId.unref) {
      timeoutId.unref();
    }
  });
}

/**
 * Abortable operation interface
 */
interface AbortableOperation<T = any> {
  promise: Promise<T>;
  abort: () => void;
}

/**
 * Execute a promise with an abort signal
 */
export function withAbort<T = any>(
  fn: (signal: AbortSignal) => Promise<T>,
  timeoutMs: number | null = null,
): AbortableOperation<T> {
  const abortController = new AbortController();
  let timeoutId: TimeoutId | null = null;

  if (timeoutMs) {
    timeoutId = setTimeout(() => {
      abortController.abort(
        new Error(`Operation aborted after ${timeoutMs}ms`),
      );
    }, timeoutMs);

    // Allow process to exit even if timeout is pending
    if (timeoutId.unref) {
      timeoutId.unref();
    }
  }

  const promise = (async (): Promise<T> => {
    try {
      const result = await fn(abortController.signal);
      if (timeoutId) clearTimeout(timeoutId);
      return result;
    } catch (error) {
      if (timeoutId) clearTimeout(timeoutId);
      throw error;
    }
  })();

  return {
    promise,
    abort: () => {
      if (timeoutId) clearTimeout(timeoutId);
      abortController.abort();
    },
  };
}

/**
 * Debounce a promise-returning function
 */
export function debouncePromise<T extends (...args: any[]) => Promise<any>>(
  fn: T,
  waitMs: number = 300,
): (...args: Parameters<T>) => Promise<Awaited<ReturnType<T>>> {
  let timeoutId: NodeJS.Timeout | null = null;
  let pendingPromise: Promise<Awaited<ReturnType<T>>> | null = null;

  return function (this: any, ...args: Parameters<T>): Promise<Awaited<ReturnType<T>>> {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }

    if (!pendingPromise) {
      pendingPromise = new Promise((resolve, reject) => {
        timeoutId = setTimeout(async () => {
          try {
            const result = await fn.apply(this, args);
            resolve(result);
          } catch (error) {
            reject(error);
          } finally {
            pendingPromise = null;
            timeoutId = null;
          }
        }, waitMs);
      });
    }

    return pendingPromise;
  };
}

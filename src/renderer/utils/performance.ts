/**
 * Performance optimization utilities for React components
 * Provides debouncing, throttling, and memoization helpers
 */

/**
 * Debounce options
 */
interface DebounceOptions {
  leading?: boolean;
  trailing?: boolean;
  maxWait?: number;
}

/**
 * Debounced function with cancel and flush methods
 */
interface DebouncedFunction<T extends (...args: unknown[]) => unknown> {
  (...args: Parameters<T>): ReturnType<T> | undefined;
  cancel: () => void;
  flush: () => ReturnType<T> | undefined;
}

/**
 * Creates a debounced function that delays invoking func until after wait milliseconds
 * have elapsed since the last time the debounced function was invoked
 *
 * @param func - The function to debounce
 * @param wait - The number of milliseconds to delay
 * @param options - Options object
 * @returns The debounced function with cancel and flush methods
 */
function debounce<T extends (...args: unknown[]) => unknown>(
  func: T,
  wait: number,
  options: DebounceOptions = {}
): DebouncedFunction<T> {
  let lastArgs: Parameters<T> | undefined;
  let lastThis: unknown;
  let lastCallTime: number | undefined;
  let result: ReturnType<T> | undefined;
  let timerId: ReturnType<typeof setTimeout> | undefined;
  let lastInvokeTime = 0;
  const leading = options.leading || false;
  const trailing = options.trailing !== false;
  const maxWait = options.maxWait;
  const hasMaxWait = 'maxWait' in options;

  function invokeFunc(time: number): ReturnType<T> | undefined {
    const args = lastArgs;
    const thisArg = lastThis;

    lastArgs = undefined;
    lastThis = undefined;
    lastInvokeTime = time;
    result = func.apply(thisArg, args as Parameters<T>) as ReturnType<T>;
    return result;
  }

  function leadingEdge(time: number): ReturnType<T> | undefined {
    lastInvokeTime = time;
    timerId = setTimeout(timerExpired, wait);
    return leading ? invokeFunc(time) : result;
  }

  function remainingWait(time: number): number {
    const timeSinceLastCall = time - (lastCallTime ?? 0);
    const timeSinceLastInvoke = time - lastInvokeTime;
    const timeWaiting = wait - timeSinceLastCall;

    return hasMaxWait && maxWait !== undefined
      ? Math.min(timeWaiting, maxWait - timeSinceLastInvoke)
      : timeWaiting;
  }

  function shouldInvoke(time: number): boolean {
    const timeSinceLastCall = time - (lastCallTime ?? 0);
    const timeSinceLastInvoke = time - lastInvokeTime;

    return (
      lastCallTime === undefined ||
      timeSinceLastCall >= wait ||
      timeSinceLastCall < 0 ||
      (hasMaxWait && maxWait !== undefined && timeSinceLastInvoke >= maxWait)
    );
  }

  function timerExpired(): ReturnType<T> | undefined {
    const time = Date.now();
    if (shouldInvoke(time)) {
      return trailingEdge(time);
    }
    timerId = setTimeout(timerExpired, remainingWait(time));
    return undefined;
  }

  function trailingEdge(time: number): ReturnType<T> | undefined {
    timerId = undefined;

    if (trailing && lastArgs) {
      return invokeFunc(time);
    }
    lastArgs = undefined;
    lastThis = undefined;
    return result;
  }

  function cancel(): void {
    if (timerId !== undefined) {
      clearTimeout(timerId);
    }
    lastInvokeTime = 0;
    lastArgs = undefined;
    lastCallTime = undefined;
    lastThis = undefined;
    timerId = undefined;
  }

  function flush(): ReturnType<T> | undefined {
    return timerId === undefined ? result : trailingEdge(Date.now());
  }

  function debounced(this: unknown, ...args: Parameters<T>): ReturnType<T> | undefined {
    const time = Date.now();
    const isInvoking = shouldInvoke(time);

    lastArgs = args;
    lastThis = this;
    lastCallTime = time;

    if (isInvoking) {
      if (timerId === undefined) {
        return leadingEdge(lastCallTime);
      }
      if (hasMaxWait) {
        timerId = setTimeout(timerExpired, wait);
        return invokeFunc(lastCallTime);
      }
    }
    if (timerId === undefined) {
      timerId = setTimeout(timerExpired, wait);
    }
    return result;
  }

  debounced.cancel = cancel;
  debounced.flush = flush;
  return debounced as DebouncedFunction<T>;
}

/**
 * Throttle options
 */
interface ThrottleOptions {
  leading?: boolean;
  trailing?: boolean;
}

/**
 * Creates a throttled function that only invokes func at most once per every wait milliseconds
 *
 * @param func - The function to throttle
 * @param wait - The number of milliseconds to throttle invocations to
 * @param options - Options object
 * @returns The throttled function
 */
function throttle<T extends (...args: unknown[]) => unknown>(
  func: T,
  wait: number,
  options: ThrottleOptions = {}
): DebouncedFunction<T> {
  const leading = options.leading !== false;
  const trailing = options.trailing !== false;

  return debounce(func, wait, {
    leading,
    trailing,
    maxWait: wait,
  });
}

/**
 * Creates a memoized version of a function
 * Results are cached based on the first argument by default
 *
 * @param func - The function to memoize
 * @param resolver - Function to resolve cache key
 * @returns The memoized function with cache property
 */
function memoize<T extends (...args: unknown[]) => unknown>(
  func: T,
  resolver?: (...args: Parameters<T>) => unknown
): T & { cache: Map<unknown, ReturnType<T>> } {
  const cache = new Map<unknown, ReturnType<T>>();

  const memoized = function (this: unknown, ...args: Parameters<T>): ReturnType<T> {
    const key = resolver ? resolver.apply(this, args) : args[0];

    if (cache.has(key)) {
      return cache.get(key)!;
    }

    const result = func.apply(this, args) as ReturnType<T>;
    cache.set(key, result);
    return result;
  };

  memoized.cache = cache;
  return memoized as T & { cache: Map<unknown, ReturnType<T>> };
}

/**
 * Shallow comparison of two values
 *
 * @param a - First value
 * @param b - Second value
 * @returns True if values are shallowly equal
 */
function shallowEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (a === null || b === null) return false;
  if (typeof a !== 'object' || typeof b !== 'object') return false;

  const keysA = Object.keys(a as Record<string, unknown>);
  const keysB = Object.keys(b as Record<string, unknown>);

  if (keysA.length !== keysB.length) return false;

  for (const key of keysA) {
    if (
      !Object.prototype.hasOwnProperty.call(b, key) ||
      (a as Record<string, unknown>)[key] !== (b as Record<string, unknown>)[key]
    ) {
      return false;
    }
  }

  return true;
}

/**
 * Creates a function that only runs once
 *
 * @param func - The function to restrict
 * @returns A function that invokes func once and returns the result on subsequent calls
 */
function once<T extends (...args: unknown[]) => unknown>(func: T): T {
  let called = false;
  let result: ReturnType<T>;

  return function (this: unknown, ...args: Parameters<T>): ReturnType<T> {
    if (!called) {
      called = true;
      result = func.apply(this, args) as ReturnType<T>;
    }
    return result;
  } as T;
}

/**
 * Batch update helper - delays callback execution until next animation frame
 * Useful for batching multiple state updates
 *
 * @param callback - Function to execute
 * @returns The request animation frame ID
 */
function batchUpdate(callback: () => void): number {
  return requestAnimationFrame(() => {
    callback();
  });
}

/**
 * Performance measurement result
 */
interface MeasureResult<T> {
  result: T;
  duration: number;
}

/**
 * Measures execution time of a function
 *
 * @param func - Function to measure
 * @param label - Label for console output
 * @returns Object with result and duration
 */
function measurePerformance<T>(func: () => T, label?: string): MeasureResult<T> {
  const start = performance.now();
  const result = func();
  const duration = performance.now() - start;

  if (label) {
    console.debug(`[Performance] ${label}: ${duration.toFixed(2)}ms`);
  }

  return { result, duration };
}

/**
 * Async performance measurement result
 */
async function measurePerformanceAsync<T>(
  func: () => Promise<T>,
  label?: string
): Promise<MeasureResult<T>> {
  const start = performance.now();
  const result = await func();
  const duration = performance.now() - start;

  if (label) {
    console.debug(`[Performance] ${label}: ${duration.toFixed(2)}ms`);
  }

  return { result, duration };
}

/**
 * Rate limit info
 */
interface RateLimitInfo {
  isAllowed: boolean;
  remainingCalls: number;
  resetTime: number;
}

/**
 * Creates a rate limiter for function calls
 *
 * @param maxCalls - Maximum calls allowed in the time window
 * @param windowMs - Time window in milliseconds
 * @returns Rate limit check function
 */
function createRateLimiter(
  maxCalls: number,
  windowMs: number
): () => RateLimitInfo {
  const calls: number[] = [];

  return function checkRateLimit(): RateLimitInfo {
    const now = Date.now();
    const windowStart = now - windowMs;

    // Remove old calls outside window
    while (calls.length > 0 && calls[0] < windowStart) {
      calls.shift();
    }

    const remainingCalls = Math.max(0, maxCalls - calls.length);
    const resetTime = calls.length > 0 ? calls[0] + windowMs : now;

    if (calls.length < maxCalls) {
      calls.push(now);
      return {
        isAllowed: true,
        remainingCalls: remainingCalls - 1,
        resetTime,
      };
    }

    return {
      isAllowed: false,
      remainingCalls: 0,
      resetTime,
    };
  };
}

/**
 * Idle callback options
 */
interface IdleCallbackOptions {
  timeout?: number;
}

/**
 * Schedules work during browser idle time
 * Falls back to setTimeout if requestIdleCallback is not available
 *
 * @param callback - Work to schedule
 * @param options - Options with timeout
 * @returns Cancel function
 */
function scheduleIdleWork(
  callback: () => void,
  options: IdleCallbackOptions = {}
): () => void {
  const { timeout = 5000 } = options;

  if (typeof requestIdleCallback === 'function') {
    const id = requestIdleCallback(callback, { timeout });
    return () => cancelIdleCallback(id);
  }

  // Fallback for environments without requestIdleCallback
  const id = setTimeout(callback, 1);
  return () => clearTimeout(id);
}

/**
 * Creates an abort controller with timeout
 *
 * @param timeoutMs - Timeout in milliseconds
 * @returns AbortController that auto-aborts after timeout
 */
function createTimeoutController(timeoutMs: number): AbortController {
  const controller = new AbortController();

  const timeoutId = setTimeout(() => {
    controller.abort();
  }, timeoutMs);

  // Allow cleanup of timeout
  const originalAbort = controller.abort.bind(controller);
  controller.abort = () => {
    clearTimeout(timeoutId);
    originalAbort();
  };

  return controller;
}

export {
  debounce,
  throttle,
  memoize,
  shallowEqual,
  once,
  batchUpdate,
  measurePerformance,
  measurePerformanceAsync,
  createRateLimiter,
  scheduleIdleWork,
  createTimeoutController,
};

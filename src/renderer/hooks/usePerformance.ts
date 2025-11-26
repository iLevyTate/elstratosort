/**
 * React performance optimization hooks
 * Provides custom hooks for common performance patterns
 */

import { useCallback, useEffect, useMemo, useRef, useState, MutableRefObject } from 'react';
import {
  debounce,
  throttle,
  createRateLimiter,
} from '../utils/performance';

interface DebouncedFunction<T extends (...args: unknown[]) => unknown> {
  (...args: Parameters<T>): ReturnType<T> | undefined;
  cancel: () => void;
  flush: () => ReturnType<T> | undefined;
}

/**
 * Hook for debounced values
 *
 * @param value - The value to debounce
 * @param delay - Debounce delay in milliseconds
 * @returns The debounced value
 */
export function useDebounce<T>(value: T, delay: number): T {
  const [debouncedValue, setDebouncedValue] = useState<T>(value);

  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedValue(value);
    }, delay);

    return () => {
      clearTimeout(handler);
    };
  }, [value, delay]);

  return debouncedValue;
}

/**
 * Hook for debounced callbacks
 *
 * @param callback - The callback to debounce
 * @param delay - Debounce delay in milliseconds
 * @param deps - Dependencies array
 * @returns The debounced callback
 */
export function useDebouncedCallback<T extends (...args: unknown[]) => unknown>(
  callback: T,
  delay: number,
  deps: unknown[] = []
): DebouncedFunction<T> {
  const callbackRef = useRef<T>(callback);

  useEffect(() => {
    callbackRef.current = callback;
  }, [callback]);

  const debouncedCallback = useMemo(
    () => debounce((...args: unknown[]) => callbackRef.current(...args), delay),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [delay, ...deps],
  ) as DebouncedFunction<T>;

  useEffect(() => {
    return () => {
      debouncedCallback.cancel();
    };
  }, [debouncedCallback]);

  return debouncedCallback;
}

/**
 * Hook for throttled callbacks
 *
 * @param callback - The callback to throttle
 * @param delay - Throttle delay in milliseconds
 * @param deps - Dependencies array
 * @returns The throttled callback
 */
export function useThrottledCallback<T extends (...args: unknown[]) => unknown>(
  callback: T,
  delay: number,
  deps: unknown[] = []
): DebouncedFunction<T> {
  const callbackRef = useRef<T>(callback);

  useEffect(() => {
    callbackRef.current = callback;
  }, [callback]);

  const throttledCallback = useMemo(
    () => throttle((...args: unknown[]) => callbackRef.current(...args), delay),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [delay, ...deps],
  ) as DebouncedFunction<T>;

  useEffect(() => {
    return () => {
      throttledCallback.cancel();
    };
  }, [throttledCallback]);

  return throttledCallback;
}

/**
 * Hook for RAF (RequestAnimationFrame) throttled callbacks
 *
 * @param callback - The callback to throttle
 * @returns The RAF throttled callback
 */
export function useRAFCallback<T extends (...args: unknown[]) => unknown>(
  callback: T
): (...args: Parameters<T>) => void {
  const rafRef = useRef<number | null>(null);
  const callbackRef = useRef<T>(callback);

  useEffect(() => {
    callbackRef.current = callback;
  }, [callback]);

  const rafCallback = useCallback((...args: Parameters<T>) => {
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
    }
    rafRef.current = requestAnimationFrame(() => {
      callbackRef.current(...args);
    });
  }, []);

  useEffect(() => {
    return () => {
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
      }
    };
  }, []);

  return rafCallback;
}

/**
 * Hook for tracking previous value
 *
 * @param value - Current value
 * @returns Previous value
 */
export function usePrevious<T>(value: T): T | undefined {
  const ref = useRef<T>();
  useEffect(() => {
    ref.current = value;
  });
  return ref.current;
}

/**
 * Hook for component mount state
 *
 * @returns Ref indicating if component is mounted
 */
export function useIsMounted(): MutableRefObject<boolean> {
  const isMounted = useRef(true);

  useEffect(() => {
    isMounted.current = true;
    return () => {
      isMounted.current = false;
    };
  }, []);

  return isMounted;
}

/**
 * Hook for safe async operations
 *
 * @returns Safe async operation wrapper
 */
export function useSafeAsync<T>(): {
  safeAsync: (asyncFn: () => Promise<T>) => Promise<T | undefined>;
  isMounted: boolean;
} {
  const isMountedRef = useIsMounted();

  const safeAsync = useCallback(
    async (asyncFn: () => Promise<T>): Promise<T | undefined> => {
      const result = await asyncFn();
      if (isMountedRef.current) {
        return result;
      }
      return undefined;
    },
    []
  );

  return { safeAsync, isMounted: isMountedRef.current };
}

interface CacheEntry<T> {
  value: T;
  timestamp: number;
}

/**
 * Hook for memoized values with TTL
 *
 * @param key - Cache key
 * @param factory - Factory function to create value
 * @param ttl - Time to live in milliseconds
 * @returns Cached value
 */
export function useMemoizedWithTTL<T>(
  key: string,
  factory: () => T,
  ttl: number
): T {
  const cacheRef = useRef<Map<string, CacheEntry<T>>>(new Map());

  return useMemo(() => {
    const cache = cacheRef.current;
    const cached = cache.get(key);
    const now = Date.now();

    if (cached && now - cached.timestamp < ttl) {
      return cached.value;
    }

    const value = factory();
    cache.set(key, { value, timestamp: now });
    return value;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, ttl]);
}

/**
 * Hook for rate-limited callbacks
 *
 * @param callback - The callback to rate limit
 * @param maxCalls - Maximum calls per window
 * @param windowMs - Time window in milliseconds
 * @returns Rate-limited callback and status
 */
export function useRateLimitedCallback<T extends (...args: unknown[]) => unknown>(
  callback: T,
  maxCalls: number,
  windowMs: number
): {
  callback: (...args: Parameters<T>) => ReturnType<T> | undefined;
  isLimited: boolean;
  remainingCalls: number;
} {
  const callbackRef = useRef<T>(callback);
  const [isLimited, setIsLimited] = useState(false);
  const [remainingCalls, setRemainingCalls] = useState(maxCalls);

  useEffect(() => {
    callbackRef.current = callback;
  }, [callback]);

  const rateLimiter = useMemo(
    () => createRateLimiter(maxCalls, windowMs),
    [maxCalls, windowMs]
  );

  const rateLimitedCallback = useCallback(
    (...args: Parameters<T>): ReturnType<T> | undefined => {
      const { isAllowed, remainingCalls: remaining } = rateLimiter();
      setRemainingCalls(remaining);
      setIsLimited(!isAllowed);

      if (isAllowed) {
        return callbackRef.current(...args) as ReturnType<T>;
      }
      return undefined;
    },
    [rateLimiter]
  );

  return { callback: rateLimitedCallback, isLimited, remainingCalls };
}

/**
 * Hook for lazy initialization
 *
 * @param factory - Factory function
 * @returns Lazy value and initialization status
 */
export function useLazy<T>(factory: () => T): { value: T | null; isInitialized: boolean; initialize: () => void } {
  const [isInitialized, setIsInitialized] = useState(false);
  const valueRef = useRef<T | null>(null);

  const initialize = useCallback(() => {
    if (!isInitialized) {
      valueRef.current = factory();
      setIsInitialized(true);
    }
  }, [factory, isInitialized]);

  return { value: valueRef.current, isInitialized, initialize };
}

/**
 * Hook for render counting (development only)
 *
 * @param componentName - Name of the component
 * @returns Render count
 */
export function useRenderCount(componentName = 'Component'): number {
  const countRef = useRef(0);
  countRef.current++;

  if (process.env.NODE_ENV === 'development') {
    console.debug(`[RenderCount] ${componentName}: ${countRef.current}`);
  }

  return countRef.current;
}

/**
 * Hook for detecting expensive renders
 *
 * @param threshold - Threshold in milliseconds
 * @param componentName - Component name for logging
 */
export function useRenderPerformance(threshold = 16, componentName = 'Component'): void {
  const startTime = useRef(performance.now());

  useEffect(() => {
    const renderTime = performance.now() - startTime.current;
    if (renderTime > threshold && process.env.NODE_ENV === 'development') {
      console.warn(
        `[Performance] ${componentName} render took ${renderTime.toFixed(2)}ms (threshold: ${threshold}ms)`
      );
    }
  });

  startTime.current = performance.now();
}

/**
 * Hook for stable callback reference
 *
 * @param callback - Callback function
 * @returns Stable callback
 */
export function useStableCallback<T extends (...args: unknown[]) => unknown>(
  callback: T
): T {
  const callbackRef = useRef<T>(callback);

  useEffect(() => {
    callbackRef.current = callback;
  }, [callback]);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  return useCallback(((...args: unknown[]) => callbackRef.current(...args)) as T, []);
}

/**
 * Hook for interval with cleanup
 *
 * @param callback - Interval callback
 * @param delay - Interval delay (null to pause)
 */
export function useInterval(callback: () => void, delay: number | null): void {
  const savedCallback = useRef(callback);

  useEffect(() => {
    savedCallback.current = callback;
  }, [callback]);

  useEffect(() => {
    if (delay === null) return;

    const id = setInterval(() => {
      savedCallback.current();
    }, delay);

    return () => clearInterval(id);
  }, [delay]);
}

/**
 * Hook for timeout with cleanup
 *
 * @param callback - Timeout callback
 * @param delay - Timeout delay (null to cancel)
 */
export function useTimeout(callback: () => void, delay: number | null): void {
  const savedCallback = useRef(callback);

  useEffect(() => {
    savedCallback.current = callback;
  }, [callback]);

  useEffect(() => {
    if (delay === null) return;

    const id = setTimeout(() => {
      savedCallback.current();
    }, delay);

    return () => clearTimeout(id);
  }, [delay]);
}

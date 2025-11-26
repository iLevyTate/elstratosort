/**
 * React Edge Case Utilities
 * Provides hooks and utilities for handling common React edge cases
 */
import { useEffect, useRef, useCallback, useState, useMemo, MutableRefObject, SetStateAction, Dispatch } from 'react';
import { logger } from '../../shared/logger';

logger.setContext('ReactEdgeCaseUtils');

/**
 * CATEGORY 1: STALE STATE PREVENTION
 */

/**
 * Hook to get latest value without causing re-renders
 * Prevents stale closure issues in event handlers and callbacks
 * @param value - Value to track
 * @returns Ref containing latest value
 */
function useLatest<T>(value: T): MutableRefObject<T> {
  const ref = useRef<T>(value);

  useEffect(() => {
    ref.current = value;
  }, [value]);

  return ref;
}

/**
 * Hook for stable callback that always uses latest props/state
 * Prevents stale closures in async operations and event handlers
 * @param callback - Callback function
 * @returns Stable callback with latest values
 */
function useStableCallback<T extends (...args: unknown[]) => unknown>(
  callback: T
): (...args: Parameters<T>) => ReturnType<T> | undefined {
  const callbackRef = useLatest(callback);

  return useCallback((...args: Parameters<T>) => {
    return callbackRef.current?.(...args) as ReturnType<T> | undefined;
  }, []);
}

/**
 * Hook for previous value tracking
 * Useful for detecting changes and handling transitions
 * @param value - Value to track
 * @returns Previous value
 */
function usePrevious<T>(value: T): T | undefined {
  const ref = useRef<T>();

  useEffect(() => {
    ref.current = value;
  });

  // Intentionally returns ref.current during render to get the previous value
  // This is the standard usePrevious pattern from React docs
  return ref.current;
}

/**
 * Hook for safe async state updates (prevents updates after unmount)
 * @param initialValue - Initial state value
 * @returns [state, setState] - Safe state tuple
 */
function useSafeState<T>(initialValue: T): [T, Dispatch<SetStateAction<T>>] {
  const [state, setState] = useState<T>(initialValue);
  const mountedRef = useRef(true);

  useEffect(() => {
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const safeSetState = useCallback((value: SetStateAction<T>) => {
    if (mountedRef.current) {
      setState(value);
    }
  }, []);

  return [state, safeSetState];
}

/**
 * CATEGORY 2: EVENT LISTENER CLEANUP
 */

interface EventListenerOptions {
  passive?: boolean;
  capture?: boolean;
  once?: boolean;
}

/**
 * Hook for safe event listener with automatic cleanup
 * @param eventName - Event name
 * @param handler - Event handler
 * @param target - Event target (default: window)
 * @param options - Event listener options
 */
function useEventListener(
  eventName: string,
  handler: (event: Event) => void,
  target: EventTarget | null = null,
  options: EventListenerOptions = {}
): void {
  const savedHandler = useLatest(handler);

  useEffect(() => {
    const targetElement = target || window;

    if (!targetElement?.addEventListener) {
      return;
    }

    const listener = (event: Event) => {
      savedHandler.current?.(event);
    };

    targetElement.addEventListener(eventName, listener, options);

    return () => {
      targetElement.removeEventListener(eventName, listener, options);
    };
  }, [eventName, target, options.capture, options.passive, options.once]);
}

/**
 * Hook for interval with automatic cleanup
 * @param callback - Interval callback
 * @param delay - Delay in ms (null to pause)
 */
function useInterval(callback: () => void, delay: number | null): void {
  const savedCallback = useLatest(callback);

  useEffect(() => {
    if (delay === null) return;

    const id = setInterval(() => {
      savedCallback.current?.();
    }, delay);

    return () => clearInterval(id);
  }, [delay]);
}

/**
 * Hook for timeout with automatic cleanup
 * @param callback - Timeout callback
 * @param delay - Delay in ms (null to cancel)
 */
function useTimeout(callback: () => void, delay: number | null): void {
  const savedCallback = useLatest(callback);

  useEffect(() => {
    if (delay === null) return;

    const id = setTimeout(() => {
      savedCallback.current?.();
    }, delay);

    return () => clearTimeout(id);
  }, [delay]);
}

/**
 * CATEGORY 3: ASYNC OPERATION SAFETY
 */

interface AsyncState<T> {
  data: T | null;
  loading: boolean;
  error: Error | null;
}

/**
 * Hook for async operations with cancellation
 * @param asyncFn - Async function
 * @param deps - Dependencies
 * @returns Object with data, loading, error
 */
function useAsync<T>(
  asyncFn: () => Promise<T>,
  deps: unknown[] = []
): AsyncState<T> {
  const [state, setState] = useSafeState<AsyncState<T>>({
    data: null,
    loading: true,
    error: null,
  });

  useEffect(() => {
    let cancelled = false;

    setState({ data: null, loading: true, error: null });

    asyncFn()
      .then((data) => {
        if (!cancelled) {
          setState({ data, loading: false, error: null });
        }
      })
      .catch((error: Error) => {
        if (!cancelled) {
          setState({ data: null, loading: false, error });
        }
      });

    return () => {
      cancelled = true;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  return state;
}

/**
 * Hook for debounced value
 * @param value - Value to debounce
 * @param delay - Debounce delay
 * @returns Debounced value
 */
function useDebouncedValue<T>(value: T, delay: number): T {
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
 * Hook for throttled callback
 * @param callback - Callback to throttle
 * @param delay - Throttle delay
 * @returns Throttled callback
 */
function useThrottledCallback<T extends (...args: unknown[]) => unknown>(
  callback: T,
  delay: number
): (...args: Parameters<T>) => void {
  const lastRun = useRef(Date.now());
  const savedCallback = useLatest(callback);

  return useCallback(
    (...args: Parameters<T>) => {
      const now = Date.now();
      if (now - lastRun.current >= delay) {
        lastRun.current = now;
        savedCallback.current?.(...args);
      }
    },
    [delay]
  );
}

/**
 * CATEGORY 4: COMPONENT LIFECYCLE
 */

/**
 * Hook for detecting first render
 * @returns Boolean indicating if it's first render
 */
function useIsFirstRender(): boolean {
  const isFirst = useRef(true);

  if (isFirst.current) {
    isFirst.current = false;
    return true;
  }

  return isFirst.current;
}

/**
 * Hook for effect only on updates (not initial mount)
 * @param effect - Effect function
 * @param deps - Dependencies
 */
function useUpdateEffect(effect: () => void | (() => void), deps: unknown[]): void {
  const isFirst = useRef(true);

  useEffect(() => {
    if (isFirst.current) {
      isFirst.current = false;
      return;
    }

    return effect();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
}

/**
 * Hook for tracking mounted state
 * @returns Ref containing mounted state
 */
function useIsMounted(): MutableRefObject<boolean> {
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
 * Hook for cleanup on unmount
 * @param cleanup - Cleanup function
 */
function useOnUnmount(cleanup: () => void): void {
  const cleanupRef = useLatest(cleanup);

  useEffect(() => {
    return () => {
      cleanupRef.current?.();
    };
  }, []);
}

/**
 * CATEGORY 5: MEMOIZATION HELPERS
 */

/**
 * Hook for deep comparison memoization
 * @param value - Value to memoize
 * @returns Memoized value (same reference if deeply equal)
 */
function useDeepMemo<T>(value: T): T {
  const ref = useRef<T>(value);

  if (JSON.stringify(ref.current) !== JSON.stringify(value)) {
    ref.current = value;
  }

  return ref.current;
}

/**
 * Hook for stable object reference
 * @param obj - Object to stabilize
 * @returns Stable object reference
 */
function useStableObject<T extends Record<string, unknown>>(obj: T): T {
  // eslint-disable-next-line react-hooks/exhaustive-deps
  return useMemo(() => obj, Object.values(obj));
}

/**
 * CATEGORY 6: ERROR BOUNDARY HELPERS
 */

interface ErrorBoundaryState {
  error: Error | null;
  errorInfo: unknown;
  resetError: () => void;
}

/**
 * Hook for error boundary fallback
 * @returns Object with error state and reset function
 */
function useErrorBoundary(): ErrorBoundaryState {
  const [error, setError] = useState<Error | null>(null);
  const [errorInfo, setErrorInfo] = useState<unknown>(null);

  const resetError = useCallback(() => {
    setError(null);
    setErrorInfo(null);
  }, []);

  useEffect(() => {
    const handleError = (event: ErrorEvent) => {
      setError(new Error(event.message));
      setErrorInfo(event);
    };

    const handleRejection = (event: PromiseRejectionEvent) => {
      setError(new Error(event.reason?.message || 'Unhandled promise rejection'));
      setErrorInfo(event);
    };

    window.addEventListener('error', handleError);
    window.addEventListener('unhandledrejection', handleRejection);

    return () => {
      window.removeEventListener('error', handleError);
      window.removeEventListener('unhandledrejection', handleRejection);
    };
  }, []);

  return { error, errorInfo, resetError };
}

/**
 * CATEGORY 7: PERFORMANCE HELPERS
 */

interface RenderCountResult {
  count: number;
  resetCount: () => void;
}

/**
 * Hook for render counting (development only)
 * @param componentName - Component name for logging
 * @returns Render count and reset function
 */
function useRenderCount(componentName = 'Component'): RenderCountResult {
  const countRef = useRef(0);
  countRef.current++;

  if (process.env.NODE_ENV === 'development') {
    logger.debug(`[RenderCount] ${componentName}: ${countRef.current}`);
  }

  const resetCount = useCallback(() => {
    countRef.current = 0;
  }, []);

  return { count: countRef.current, resetCount };
}

/**
 * Hook for detecting why component re-rendered
 * @param props - Component props
 * @param componentName - Component name for logging
 */
function useWhyDidYouUpdate(
  props: Record<string, unknown>,
  componentName = 'Component'
): void {
  const prevProps = useRef<Record<string, unknown>>({});

  useEffect(() => {
    if (process.env.NODE_ENV === 'development') {
      const allKeys = Object.keys({ ...prevProps.current, ...props });
      const changedProps: Record<string, { from: unknown; to: unknown }> = {};

      allKeys.forEach((key) => {
        if (prevProps.current[key] !== props[key]) {
          changedProps[key] = {
            from: prevProps.current[key],
            to: props[key],
          };
        }
      });

      if (Object.keys(changedProps).length > 0) {
        logger.debug(`[WhyDidYouUpdate] ${componentName}`, changedProps);
      }
    }

    prevProps.current = props;
  });
}

/**
 * CATEGORY 8: FORM HELPERS
 */

interface FormState<T> {
  values: T;
  errors: Record<keyof T, string | undefined>;
  touched: Record<keyof T, boolean>;
}

interface FormHookResult<T> {
  values: T;
  errors: Record<keyof T, string | undefined>;
  touched: Record<keyof T, boolean>;
  handleChange: (name: keyof T, value: T[keyof T]) => void;
  handleBlur: (name: keyof T) => void;
  setFieldValue: (name: keyof T, value: T[keyof T]) => void;
  setFieldError: (name: keyof T, error: string | undefined) => void;
  resetForm: () => void;
}

/**
 * Hook for form state management
 * @param initialValues - Initial form values
 * @returns Form state and handlers
 */
function useFormState<T extends Record<string, unknown>>(
  initialValues: T
): FormHookResult<T> {
  const [state, setState] = useState<FormState<T>>({
    values: initialValues,
    errors: {} as Record<keyof T, string | undefined>,
    touched: {} as Record<keyof T, boolean>,
  });

  const handleChange = useCallback((name: keyof T, value: T[keyof T]) => {
    setState((prev) => ({
      ...prev,
      values: { ...prev.values, [name]: value },
    }));
  }, []);

  const handleBlur = useCallback((name: keyof T) => {
    setState((prev) => ({
      ...prev,
      touched: { ...prev.touched, [name]: true },
    }));
  }, []);

  const setFieldValue = useCallback((name: keyof T, value: T[keyof T]) => {
    setState((prev) => ({
      ...prev,
      values: { ...prev.values, [name]: value },
    }));
  }, []);

  const setFieldError = useCallback((name: keyof T, error: string | undefined) => {
    setState((prev) => ({
      ...prev,
      errors: { ...prev.errors, [name]: error },
    }));
  }, []);

  const resetForm = useCallback(() => {
    setState({
      values: initialValues,
      errors: {} as Record<keyof T, string | undefined>,
      touched: {} as Record<keyof T, boolean>,
    });
  }, [initialValues]);

  return {
    ...state,
    handleChange,
    handleBlur,
    setFieldValue,
    setFieldError,
    resetForm,
  };
}

export {
  useLatest,
  useStableCallback,
  usePrevious,
  useSafeState,
  useEventListener,
  useInterval,
  useTimeout,
  useAsync,
  useDebouncedValue,
  useThrottledCallback,
  useIsFirstRender,
  useUpdateEffect,
  useIsMounted,
  useOnUnmount,
  useDeepMemo,
  useStableObject,
  useErrorBoundary,
  useRenderCount,
  useWhyDidYouUpdate,
  useFormState,
};

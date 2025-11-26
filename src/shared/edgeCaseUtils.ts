/**
 * Edge Case Utilities - Centralized Defensive Programming Patterns
 * Provides reusable utilities to handle common edge cases across the application
 */

// Import standardized withTimeout from promiseUtils
import { withTimeout as promiseWithTimeout } from '../main/utils/promiseUtils';

/**
 * CATEGORY 1: EMPTY ARRAY/STRING HANDLING
 */

/**
 * Safely get array from unknown input
 */
function safeArray<T = any>(value: any, defaultValue: T[] = []): T[] {
  if (Array.isArray(value)) {
    return value;
  }
  if (value === null || value === undefined) {
    return defaultValue;
  }
  // Try to convert iterable to array
  try {
    if (typeof value[Symbol.iterator] === 'function') {
      return Array.from(value);
    }
  } catch {
    // Not iterable
  }
  return defaultValue;
}

/**
 * Safely get non-empty array from unknown input
 */
function safeNonEmptyArray<T = any>(value: any, defaultValue: T[] = []): T[] {
  const arr = safeArray<T>(value, defaultValue);
  return arr.length > 0 ? arr : defaultValue;
}

/**
 * Safely get string from unknown input
 */
function safeString(value: any, defaultValue: string = ''): string {
  if (typeof value === 'string') {
    return value;
  }
  if (value === null || value === undefined) {
    return defaultValue;
  }
  // Try to convert to string safely
  try {
    const str = String(value);
    return str === '[object Object]' ? defaultValue : str;
  } catch {
    return defaultValue;
  }
}

/**
 * Safely get non-empty string from unknown input
 */
function safeNonEmptyString(value: any, defaultValue: string = ''): string {
  const str = safeString(value, defaultValue);
  const trimmed = str.trim();
  return trimmed.length > 0 ? trimmed : defaultValue;
}

/**
 * Safely get number from unknown input
 */
function safeNumber(value: any, defaultValue: number = 0): number {
  if (typeof value === 'number' && !isNaN(value) && isFinite(value)) {
    return value;
  }
  if (value === null || value === undefined) {
    return defaultValue;
  }
  const num = Number(value);
  return !isNaN(num) && isFinite(num) ? num : defaultValue;
}

/**
 * Safely get positive number from unknown input
 */
function safePositiveNumber(value: any, defaultValue: number = 0): number {
  const num = safeNumber(value, defaultValue);
  return num > 0 ? num : defaultValue;
}

/**
 * CATEGORY 2: DIVISION BY ZERO / EMPTY COLLECTION OPERATIONS
 */

/**
 * Safely calculate average, returning fallback for empty arrays
 */
function safeAverage(values: any, defaultValue: number = 0): number {
  const arr = safeArray(values, []);
  const validNumbers = arr.filter(
    (v: any) => typeof v === 'number' && !isNaN(v) && isFinite(v),
  );

  if (validNumbers.length === 0) {
    return defaultValue;
  }

  const sum = validNumbers.reduce((acc: number, val: number) => acc + val, 0);
  return sum / validNumbers.length;
}

/**
 * Safely divide two numbers, returning fallback for division by zero
 */
function safeDivide(numerator: any, denominator: any, defaultValue: number = 0): number {
  const num = safeNumber(numerator, 0);
  const denom = safeNumber(denominator, 1);

  if (denom === 0) {
    return defaultValue;
  }

  const result = num / denom;
  return isFinite(result) ? result : defaultValue;
}

/**
 * Safely calculate percentage, handling edge cases
 */
function safePercentage(part: any, total: any, defaultValue: number = 0): number {
  const percentage = safeDivide(part, total, defaultValue / 100) * 100;
  // Clamp between 0 and 100
  return Math.max(0, Math.min(100, percentage));
}

/**
 * CATEGORY 3: ARRAY OPERATIONS EDGE CASES
 */

/**
 * Safely get first element of array
 */
function safeFirst<T = any>(arr: any, defaultValue: T | null = null): T | null {
  const array = safeArray<T>(arr, []);
  return array.length > 0 ? array[0] : defaultValue;
}

/**
 * Safely get last element of array
 */
function safeLast<T = any>(arr: any, defaultValue: T | null = null): T | null {
  const array = safeArray<T>(arr, []);
  return array.length > 0 ? array[array.length - 1] : defaultValue;
}

/**
 * Safely get element at index
 */
function safeGet<T = any>(arr: any, index: any, defaultValue: T | null = null): T | null {
  const array = safeArray<T>(arr, []);
  const idx = safeNumber(index, 0);

  if (idx < 0 || idx >= array.length) {
    return defaultValue;
  }

  return array[idx];
}

/**
 * Safely find element in array
 */
function safeFind<T = any>(
  arr: any,
  predicate: (value: T, index: number, obj: T[]) => boolean,
  defaultValue: T | null = null,
): T | null {
  const array = safeArray<T>(arr, []);

  if (typeof predicate !== 'function') {
    return defaultValue;
  }

  try {
    const result = array.find(predicate);
    return result !== undefined ? result : defaultValue;
  } catch {
    return defaultValue;
  }
}

/**
 * Safely filter array
 */
function safeFilter<T = any>(
  arr: any,
  predicate: (value: T, index: number, obj: T[]) => boolean,
): T[] {
  const array = safeArray<T>(arr, []);

  if (typeof predicate !== 'function') {
    return array;
  }

  try {
    return array.filter(predicate);
  } catch {
    return array;
  }
}

/**
 * Safely map array
 */
function safeMap<T = any, U = any>(
  arr: any,
  mapper: (value: T, index: number, obj: T[]) => U,
): T[] | U[] {
  const array = safeArray<T>(arr, []);

  if (typeof mapper !== 'function') {
    return array;
  }

  try {
    return array.map(mapper);
  } catch {
    return array;
  }
}

/**
 * CATEGORY 4: OBJECT PROPERTY ACCESS
 */

/**
 * Safely get nested property from object
 */
function safeGetNestedProperty(obj: any, path: string, defaultValue: any = null): any {
  if (!obj || typeof obj !== 'object') {
    return defaultValue;
  }

  const pathStr = safeString(path, '');
  if (!pathStr) {
    return defaultValue;
  }

  const keys = pathStr.split('.');
  let current: any = obj;

  for (const key of keys) {
    if (current === null || current === undefined) {
      return defaultValue;
    }

    if (typeof current !== 'object') {
      return defaultValue;
    }

    current = current[key];
  }

  return current !== undefined ? current : defaultValue;
}

/**
 * Safely check if object has property
 */
function safeHasProperty(obj: any, prop: string): boolean {
  if (!obj || typeof obj !== 'object') {
    return false;
  }

  return Object.prototype.hasOwnProperty.call(obj, prop);
}

/**
 * CATEGORY 5: ASYNC/PROMISE HELPERS
 */

/**
 * Wraps a promise with a timeout (delegates to promiseUtils for consistency)
 */
function withTimeout(
  promise: Promise<any>,
  timeoutMs: number,
  timeoutMessage: string = 'Operation timed out',
): Promise<any> {
  return promiseWithTimeout(promise, timeoutMs, timeoutMessage);
}

/**
 * Retry async operation with exponential backoff
 */
interface RetryOptions {
  maxRetries?: number;
  initialDelay?: number;
  maxDelay?: number;
  backoffFactor?: number;
  shouldRetry?: (error: any, attempt: number) => boolean;
}

async function retry<T = any>(
  operation: () => Promise<T>,
  options: RetryOptions = {},
): Promise<T> {
  const {
    maxRetries = 3,
    initialDelay = 1000,
    maxDelay = 10000,
    backoffFactor = 2,
    shouldRetry = () => true,
  } = options;

  let lastError: any = null;

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;

      if (attempt === maxRetries - 1) {
        // Final attempt failed
        break;
      }

      if (!shouldRetry(error, attempt)) {
        // Error is not retriable
        break;
      }

      // Calculate delay with exponential backoff
      const delay = Math.min(
        initialDelay * Math.pow(backoffFactor, attempt),
        maxDelay,
      );

      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }

  throw lastError || new Error('Retry failed');
}

/**
 * Safely await promise with fallback value
 */
async function safeAwait<T = any>(promise: Promise<T>, defaultValue: T | null = null): Promise<T | null> {
  try {
    return await promise;
  } catch {
    return defaultValue;
  }
}

/**
 * CATEGORY 6: TYPE VALIDATION
 */

/**
 * Check if value is a valid plain object (not null, not array, not date, etc.)
 */
function isPlainObject(value: any): boolean {
  if (value === null || value === undefined) {
    return false;
  }

  if (typeof value !== 'object') {
    return false;
  }

  // Exclude arrays, dates, regexes, etc.
  if (Array.isArray(value)) {
    return false;
  }

  if (value instanceof Date) {
    return false;
  }

  if (value instanceof RegExp) {
    return false;
  }

  // Check if it's a plain object
  const proto = Object.getPrototypeOf(value);
  return proto === null || proto === Object.prototype;
}

/**
 * Validate value against type constraints
 */
interface TypeConstraints {
  type?: string | string[];
  min?: number;
  max?: number;
  minLength?: number;
  maxLength?: number;
  pattern?: RegExp;
  enum?: any[];
}

interface ValidationResult {
  valid: boolean;
  value: any;
  errors: string[];
}

function validateType(value: any, constraints: TypeConstraints): ValidationResult {
  const errors: string[] = [];
  let sanitized = value;

  // Type check
  if (constraints.type) {
    const actualType = Array.isArray(value) ? 'array' : typeof value;

    if (Array.isArray(constraints.type)) {
      if (!constraints.type.includes(actualType)) {
        errors.push(
          `Expected type ${constraints.type.join(' or ')}, got ${actualType}`,
        );
      }
    } else if (constraints.type !== actualType) {
      errors.push(`Expected type ${constraints.type}, got ${actualType}`);
    }
  }

  // Min/max for numbers
  if (typeof sanitized === 'number') {
    if (constraints.min !== undefined && sanitized < constraints.min) {
      sanitized = constraints.min;
      errors.push(`Value below minimum ${constraints.min}`);
    }

    if (constraints.max !== undefined && sanitized > constraints.max) {
      sanitized = constraints.max;
      errors.push(`Value above maximum ${constraints.max}`);
    }
  }

  // Length constraints for strings/arrays
  if (typeof sanitized === 'string' || Array.isArray(sanitized)) {
    if (
      constraints.minLength !== undefined &&
      sanitized.length < constraints.minLength
    ) {
      errors.push(`Length below minimum ${constraints.minLength}`);
    }

    if (
      constraints.maxLength !== undefined &&
      sanitized.length > constraints.maxLength
    ) {
      sanitized = Array.isArray(sanitized)
        ? sanitized.slice(0, constraints.maxLength)
        : sanitized.substring(0, constraints.maxLength);
      errors.push(`Length above maximum ${constraints.maxLength}, truncated`);
    }
  }

  // Pattern matching for strings
  if (typeof sanitized === 'string' && constraints.pattern) {
    if (!constraints.pattern.test(sanitized)) {
      errors.push(`Value does not match pattern ${constraints.pattern}`);
    }
  }

  // Enum validation
  if (constraints.enum && !constraints.enum.includes(sanitized)) {
    errors.push(`Value not in allowed enum: ${constraints.enum.join(', ')}`);
  }

  return {
    valid: errors.length === 0,
    value: sanitized,
    errors,
  };
}

/**
 * CATEGORY 7: RESOURCE LIMITING
 */

/**
 * Create a bounded cache with LRU eviction
 */
interface BoundedCache<K = any, V = any> {
  get(key: K): V | undefined;
  set(key: K, value: V): void;
  has(key: K): boolean;
  clear(): void;
  readonly size: number;
}

function createBoundedCache<K = any, V = any>(maxSize: number = 100): BoundedCache<K, V> {
  const cache = new Map<K, V>();

  return {
    get(key: K): V | undefined {
      if (!cache.has(key)) {
        return undefined;
      }

      // LRU: Move to end by re-inserting
      const value = cache.get(key)!;
      cache.delete(key);
      cache.set(key, value);
      return value;
    },

    set(key: K, value: V): void {
      // Remove existing key to update position
      if (cache.has(key)) {
        cache.delete(key);
      }

      // Evict oldest if at capacity
      if (cache.size >= maxSize) {
        const oldestKey = cache.keys().next().value;
        if (oldestKey !== undefined) {
          cache.delete(oldestKey);
        }
      }

      cache.set(key, value);
    },

    has(key: K): boolean {
      return cache.has(key);
    },

    clear(): void {
      cache.clear();
    },

    get size(): number {
      return cache.size;
    },
  };
}

/**
 * Create a rate limiter
 */
function createRateLimiter(maxCalls: number, windowMs: number): () => boolean {
  const calls: number[] = [];

  return function isAllowed(): boolean {
    const now = Date.now();
    const windowStart = now - windowMs;

    // Remove old calls outside window
    while (calls.length > 0 && calls[0] < windowStart) {
      calls.shift();
    }

    if (calls.length < maxCalls) {
      calls.push(now);
      return true;
    }

    return false;
  };
}

/**
 * Create a debounced function
 */
function debounce<T extends (...args: any[]) => any>(
  func: T,
  waitMs: number,
): (...args: Parameters<T>) => void {
  let timeoutId: NodeJS.Timeout | null = null;

  return function debounced(this: any, ...args: Parameters<T>): void {
    if (timeoutId !== null) {
      clearTimeout(timeoutId);
    }

    timeoutId = setTimeout(() => {
      timeoutId = null;
      func.apply(this, args);
    }, waitMs);
  };
}

export {
  // Empty array/string handling
  safeArray,
  safeNonEmptyArray,
  safeString,
  safeNonEmptyString,
  safeNumber,
  safePositiveNumber,

  // Division by zero / empty collections
  safeAverage,
  safeDivide,
  safePercentage,

  // Array operations
  safeFirst,
  safeLast,
  safeGet,
  safeFind,
  safeFilter,
  safeMap,

  // Object property access
  safeGetNestedProperty,
  safeHasProperty,

  // Async/Promise helpers
  withTimeout,
  retry,
  safeAwait,

  // Type validation
  isPlainObject,
  validateType,

  // Resource limiting
  createBoundedCache,
  createRateLimiter,
  debounce,
};

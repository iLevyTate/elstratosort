import { logger } from '../../shared/logger';

logger.setContext('SafeAccess');

/**
 * Safe access utilities to prevent null reference errors
 */

/**
 * Safely access nested object properties
 * @param obj - The object to access
 * @param path - The path to access (e.g., 'a.b.c')
 * @param defaultValue - The default value if path doesn't exist
 * @returns The value at the path or default value
 */
export function safeGet(obj: any, path: string, defaultValue: any = null): any {
  if (!obj || typeof obj !== 'object') {
    return defaultValue;
  }

  const keys = path.split('.');
  let current = obj;

  for (const key of keys) {
    if (current === null || current === undefined) {
      return defaultValue;
    }

    if (typeof current !== 'object' || !(key in current)) {
      return defaultValue;
    }

    current = current[key];
  }

  return current !== undefined ? current : defaultValue;
}

/**
 * Safely call a function with error handling
 * @param fn - The function to call
 * @param args - Arguments to pass to the function
 * @param defaultValue - Default value on error
 * @returns Function result or default value
 */
export async function safeCall(fn: any, args: any[] = [], defaultValue: any = null): Promise<any> {
  if (typeof fn !== 'function') {
    logger.warn('[SafeCall] Attempted to call non-function', {
      type: typeof fn,
    });
    return defaultValue;
  }

  try {
    const result = await fn(...args);
    return result !== undefined ? result : defaultValue;
  } catch (error: any) {
    logger.error('[SafeCall] Function call failed', {
      error: error.message,
      stack: error.stack,
    });
    return defaultValue;
  }
}

/**
 * Validate required properties on an object
 * @param obj - Object to validate
 * @param requiredProps - List of required property names
 * @returns True if all required properties exist
 */
export function validateRequired(obj: any, requiredProps: string[]): boolean {
  if (!obj || typeof obj !== 'object') {
    return false;
  }

  for (const prop of requiredProps) {
    if (!(prop in obj) || obj[prop] === null || obj[prop] === undefined) {
      logger.warn('[Validation] Missing required property', { property: prop });
      return false;
    }
  }

  return true;
}

/**
 * Safely access array element
 * @param arr - The array to access
 * @param index - Index to access
 * @param defaultValue - Default value if out of bounds
 * @returns Element at index or default value
 */
export function safeArrayAccess(arr: any, index: number, defaultValue: any = null): any {
  if (!Array.isArray(arr)) {
    return defaultValue;
  }

  if (index < 0 || index >= arr.length) {
    return defaultValue;
  }

  return arr[index] !== undefined ? arr[index] : defaultValue;
}

/**
 * Create a safe wrapper for an object that prevents null reference errors
 * @param obj - Object to wrap
 * @returns Proxied object with safe access
 */
export function createSafeProxy(obj: any): any {
  if (!obj || typeof obj !== 'object') {
    return {};
  }

  return new Proxy(obj, {
    get(target, prop) {
      if (prop in target) {
        const value = target[prop as string];
        if (value && typeof value === 'object' && !Array.isArray(value)) {
          return createSafeProxy(value);
        }
        return value;
      }
      return undefined;
    },
    set(target, prop, value) {
      target[prop as string] = value;
      return true;
    },
  });
}

/**
 * Safely parse JSON with error handling
 * @param jsonString - JSON string to parse
 * @param defaultValue - Default value on parse error
 * @returns Parsed object or default value
 */
export function safeJsonParse(jsonString: any, defaultValue: any = null): any {
  if (typeof jsonString !== 'string') {
    return defaultValue;
  }

  try {
    return JSON.parse(jsonString);
  } catch (error: any) {
    logger.warn('[SafeJSON] Failed to parse JSON', {
      error: error.message,
      input: jsonString.slice(0, 100),
    });
    return defaultValue;
  }
}

/**
 * Ensure a value is an array
 * @param value - Value to check
 * @returns The value as array or empty array
 */
export function ensureArray(value: any): any[] {
  if (Array.isArray(value)) {
    return value;
  }

  if (value === null || value === undefined) {
    return [];
  }

  return [value];
}

/**
 * Ensure a value is a string
 * @param value - Value to check
 * @param defaultValue - Default string value
 * @returns The value as string
 */
export function ensureString(value: any, defaultValue: string = ''): string {
  if (typeof value === 'string') {
    return value;
  }

  if (value === null || value === undefined) {
    return defaultValue;
  }

  return String(value);
}

/**
 * Safely access and validate file path
 * @param filePath - Path to validate
 * @returns Valid path or null
 */
export function safeFilePath(filePath: any): string | null {
  if (!filePath || typeof filePath !== 'string') {
    return null;
  }

  // Remove any null bytes or control characters
  const cleanPath = filePath.replace(/\0/g, '').trim();

  if (!cleanPath || cleanPath.length === 0) {
    return null;
  }

  return cleanPath;
}

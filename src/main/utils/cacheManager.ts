/**
 * Cache management utilities for performance optimization
 * Provides various caching strategies for expensive operations
 */
import { logger } from '../../shared/logger';

logger.setContext('CacheManager');

interface CacheEntry<T> {
  value: T;
  timestamp: number;
}

interface LRUCacheOptions {
  maxSize?: number;
  ttl?: number;
  onEvict?: (key: string, value: any) => void;
}

interface LRUCache<T> {
  get(key: string): T | undefined;
  set(key: string, value: T): void;
  has(key: string): boolean;
  delete(key: string): boolean;
  clear(): void;
  stats(): CacheStats;
  prune(): number;
}

interface CacheStats {
  size: number;
  maxSize: number;
  ttl: number;
  expired: number;
  utilization: number;
}

/**
 * Creates an LRU (Least Recently Used) cache
 *
 * @param options - Cache configuration
 * @returns Cache instance with get, set, has, delete, clear methods
 */
export function createLRUCache<T = any>(options: LRUCacheOptions = {}): LRUCache<T> {
  const { maxSize = 100, ttl = 3600000, onEvict } = options;
  const cache = new Map<string, CacheEntry<T>>();
  const accessOrder = new Map<string, number>();

  /**
   * Update access time for LRU tracking
   */
  function updateAccess(key: string): void {
    accessOrder.delete(key);
    accessOrder.set(key, Date.now());
  }

  /**
   * Check if entry is expired
   */
  function isExpired(entry: CacheEntry<T>): boolean {
    return ttl > 0 && Date.now() - entry.timestamp > ttl;
  }

  /**
   * Evict oldest entry
   */
  function evictOldest(): void {
    const oldestKey = accessOrder.keys().next().value;
    if (oldestKey !== undefined) {
      const entry = cache.get(oldestKey);
      cache.delete(oldestKey);
      accessOrder.delete(oldestKey);

      if (onEvict && entry) {
        onEvict(oldestKey, entry.value);
      }
    }
  }

  return {
    /**
     * Get value from cache
     */
    get(key: string): T | undefined {
      const entry = cache.get(key);
      if (!entry) return undefined;

      if (isExpired(entry)) {
        this.delete(key);
        return undefined;
      }

      updateAccess(key);
      return entry.value;
    },

    /**
     * Set value in cache
     */
    set(key: string, value: T): void {
      // Remove existing entry to update position
      if (cache.has(key)) {
        accessOrder.delete(key);
      }

      // Evict if at capacity
      while (cache.size >= maxSize) {
        evictOldest();
      }

      cache.set(key, {
        value,
        timestamp: Date.now(),
      });
      updateAccess(key);
    },

    /**
     * Check if key exists and is not expired
     */
    has(key: string): boolean {
      const entry = cache.get(key);
      if (!entry) return false;

      if (isExpired(entry)) {
        this.delete(key);
        return false;
      }

      return true;
    },

    /**
     * Delete entry from cache
     */
    delete(key: string): boolean {
      const entry = cache.get(key);
      const deleted = cache.delete(key);
      accessOrder.delete(key);

      if (deleted && onEvict && entry) {
        onEvict(key, entry.value);
      }

      return deleted;
    },

    /**
     * Clear all entries
     */
    clear(): void {
      if (onEvict) {
        for (const [key, entry] of Array.from(cache.entries())) {
          onEvict(key, entry.value);
        }
      }
      cache.clear();
      accessOrder.clear();
    },

    /**
     * Get cache statistics
     */
    stats(): CacheStats {
      let expired = 0;
      for (const entry of Array.from(cache.values())) {
        if (isExpired(entry)) expired++;
      }

      return {
        size: cache.size,
        maxSize,
        ttl,
        expired,
        utilization: (cache.size / maxSize) * 100,
      };
    },

    /**
     * Clean up expired entries
     */
    prune(): number {
      const keys = Array.from(cache.keys());
      let pruned = 0;

      for (const key of keys) {
        const entry = cache.get(key);
        if (entry && isExpired(entry)) {
          this.delete(key);
          pruned++;
        }
      }

      return pruned;
    },
  };
}

interface MemoizeOptions {
  keyResolver?: (...args: any[]) => string;
  maxSize?: number;
  ttl?: number;
}

interface MemoizedFunction<T extends (...args: any[]) => any> {
  (...args: Parameters<T>): ReturnType<T>;
  cache: LRUCache<any>;
  clear: () => void;
  stats: () => CacheStats;
}

/**
 * Creates a memoization wrapper for functions
 *
 * @param fn - Function to memoize
 * @param options - Memoization options
 * @returns Memoized function
 */
export function memoize<T extends (...args: any[]) => any>(
  fn: T,
  options: MemoizeOptions = {}
): MemoizedFunction<T> {
  const {
    keyResolver = (...args: any[]) => JSON.stringify(args),
    maxSize = 50,
    ttl = 300000, // 5 minutes default
  } = options;

  const cache = createLRUCache({ maxSize, ttl });

  const memoized = async function (...args: any[]): Promise<any> {
    const key = keyResolver(...args);

    // Check cache
    if (cache.has(key)) {
      const cached = cache.get(key);
      if (cached !== undefined) {
        return cached;
      }
    }

    // Execute function
    const result = await fn(...args);
    cache.set(key, result);
    return result;
  } as MemoizedFunction<T>;

  // Attach cache management methods
  memoized.cache = cache;
  memoized.clear = () => cache.clear();
  memoized.stats = () => cache.stats();

  return memoized;
}

interface BatchProcessorOptions<T> {
  maxBatchSize?: number;
  maxWaitTime?: number;
  keyExtractor?: (item: T) => any;
}

interface PromiseCallbacks {
  resolve: (value: any) => void;
  reject: (reason: any) => void;
}

interface BatchProcessor<T> {
  add(item: T): Promise<any>;
  flush(): Promise<void>;
  stats(): BatchStats;
}

interface BatchStats {
  pendingItems: number;
  processing: boolean;
  maxBatchSize: number;
  maxWaitTime: number;
}

/**
 * Creates a batch processor that groups multiple calls
 *
 * @param processor - Function to process batch
 * @param options - Batch options
 * @returns Batch processor
 */
export function createBatchProcessor<T = any>(
  processor: (items: T[]) => Promise<any[]>,
  options: BatchProcessorOptions<T> = {}
): BatchProcessor<T> {
  const {
    maxBatchSize = 100,
    maxWaitTime = 100,
    keyExtractor = (item: T) => item,
  } = options;

  let batch = new Map<any, PromiseCallbacks[]>();
  let timeoutId: NodeJS.Timeout | null = null;
  let processing = false;

  async function processBatch(): Promise<void> {
    if (processing || batch.size === 0) return;

    processing = true;
    const currentBatch = new Map(batch);
    batch.clear();

    try {
      const items = Array.from(currentBatch.keys());
      const results = await processor(items);

      // Resolve promises for each item
      for (let i = 0; i < items.length; i++) {
        const callbacks = currentBatch.get(items[i]);
        const result = results[i];

        if (callbacks) {
          for (const { resolve, reject } of callbacks) {
            if (result instanceof Error) {
              reject(result);
            } else {
              resolve(result);
            }
          }
        }
      }
    } catch (error) {
      // Reject all promises on batch error
      for (const callbacks of Array.from(currentBatch.values())) {
        for (const { reject } of callbacks) {
          reject(error);
        }
      }
    } finally {
      processing = false;

      // Process any items added while processing
      if (batch.size > 0) {
        scheduleProcessing();
      }
    }
  }

  function scheduleProcessing(): void {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }

    if (batch.size >= maxBatchSize) {
      // Process immediately if batch is full
      setImmediate(processBatch);
    } else {
      // Wait for more items or timeout
      timeoutId = setTimeout(processBatch, maxWaitTime);
    }
  }

  return {
    /**
     * Add item to batch
     */
    add(item: T): Promise<any> {
      return new Promise((resolve, reject) => {
        const key = keyExtractor(item);

        if (!batch.has(key)) {
          batch.set(key, []);
        }

        batch.get(key)!.push({ resolve, reject });

        if (!processing) {
          scheduleProcessing();
        }
      });
    },

    /**
     * Flush pending batch
     */
    async flush(): Promise<void> {
      if (timeoutId) {
        clearTimeout(timeoutId);
        timeoutId = null;
      }
      await processBatch();
    },

    /**
     * Get batch statistics
     */
    stats(): BatchStats {
      return {
        pendingItems: batch.size,
        processing,
        maxBatchSize,
        maxWaitTime,
      };
    },
  };
}

interface AutoRefreshCacheOptions {
  refreshInterval?: number;
  errorRetryInterval?: number;
  maxRetries?: number;
}

interface AutoRefreshCache<T> {
  get(): Promise<T>;
  refresh(): Promise<T>;
  clear(): void;
  status(): RefreshCacheStatus;
}

interface RefreshCacheStatus {
  hasCache: boolean;
  lastFetch: number;
  age: number | null;
  retryCount: number;
  fetching: boolean;
}

/**
 * Creates a result cache with automatic refresh
 *
 * @param fetcher - Function to fetch data
 * @param options - Cache options
 * @returns Auto-refreshing cache
 */
export function createAutoRefreshCache<T = any>(
  fetcher: () => Promise<T>,
  options: AutoRefreshCacheOptions = {}
): AutoRefreshCache<T> {
  const {
    refreshInterval = 60000, // 1 minute
    errorRetryInterval = 5000,
    maxRetries = 3,
  } = options;

  let cache: T | null = null;
  let lastFetch = 0;
  let refreshTimer: NodeJS.Timeout | null = null;
  let retryCount = 0;
  let fetching = false;

  async function refresh(): Promise<T> {
    if (fetching && cache !== null) return cache;

    fetching = true;

    try {
      const data = await fetcher();
      cache = data;
      lastFetch = Date.now();
      retryCount = 0;

      // Schedule next refresh
      if (refreshTimer) {
        clearTimeout(refreshTimer);
      }
      refreshTimer = setTimeout(() => refresh(), refreshInterval);

      return data;
    } catch (error) {
      logger.error('Cache refresh failed:', (error as Error).message);
      retryCount++;

      // Retry with backoff
      if (retryCount <= maxRetries) {
        const retryDelay = errorRetryInterval * Math.pow(2, retryCount - 1);
        refreshTimer = setTimeout(() => refresh(), retryDelay);
      }

      // Return stale cache if available
      if (cache !== null) {
        return cache;
      }

      throw error;
    } finally {
      fetching = false;
    }
  }

  return {
    /**
     * Get cached value or fetch
     */
    async get(): Promise<T> {
      if (cache === null || Date.now() - lastFetch > refreshInterval * 2) {
        return refresh();
      }
      return cache;
    },

    /**
     * Force refresh
     */
    refresh,

    /**
     * Clear cache and stop refresh
     */
    clear(): void {
      if (refreshTimer) {
        clearTimeout(refreshTimer);
        refreshTimer = null;
      }
      cache = null;
      lastFetch = 0;
      retryCount = 0;
    },

    /**
     * Get cache status
     */
    status(): RefreshCacheStatus {
      return {
        hasCache: cache !== null,
        lastFetch,
        age: cache !== null ? Date.now() - lastFetch : null,
        retryCount,
        fetching,
      };
    },
  };
}

interface DebouncedWriterOptions {
  debounceTime?: number;
  maxWaitTime?: number;
}

interface DebouncedWriter<T> {
  write(data: T): void;
  flush(): Promise<void>;
  hasPending(): boolean;
}

/**
 * Creates a debounced cache that batches updates
 *
 * @param writer - Function to write cached data
 * @param options - Debounce options
 * @returns Debounced cache writer
 */
export function createDebouncedWriter<T = any>(
  writer: (data: T) => Promise<void>,
  options: DebouncedWriterOptions = {}
): DebouncedWriter<T> {
  const { debounceTime = 1000, maxWaitTime = 5000 } = options;

  let pendingData: T | null = null;
  let debounceTimer: NodeJS.Timeout | null = null;
  let maxWaitTimer: NodeJS.Timeout | null = null;
  let writing = false;

  async function flush(): Promise<void> {
    if (writing || pendingData === null) return;

    writing = true;
    const data = pendingData;
    pendingData = null;

    // Clear timers
    if (debounceTimer) {
      clearTimeout(debounceTimer);
      debounceTimer = null;
    }
    if (maxWaitTimer) {
      clearTimeout(maxWaitTimer);
      maxWaitTimer = null;
    }

    try {
      await writer(data);
    } catch (error) {
      logger.error('Debounced write failed:', (error as Error).message);
      throw error;
    } finally {
      writing = false;

      // Process any pending writes
      if (pendingData !== null) {
        scheduleWrite();
      }
    }
  }

  function scheduleWrite(): void {
    // Clear existing debounce timer
    if (debounceTimer) {
      clearTimeout(debounceTimer);
    }

    // Set new debounce timer
    debounceTimer = setTimeout(flush, debounceTime);

    // Set max wait timer if not already set
    if (!maxWaitTimer) {
      maxWaitTimer = setTimeout(flush, maxWaitTime);
    }
  }

  return {
    /**
     * Write data (debounced)
     */
    write(data: T): void {
      pendingData = data;

      if (!writing) {
        scheduleWrite();
      }
    },

    /**
     * Flush pending writes immediately
     */
    flush,

    /**
     * Check if there are pending writes
     */
    hasPending(): boolean {
      return pendingData !== null;
    },
  };
}

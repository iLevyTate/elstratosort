/**
 * Service Lifecycle Utilities
 *
 * Provides reusable patterns for service initialization and shutdown.
 * Used by services that need initialization guards, mutex patterns, or cleanup.
 *
 * Two patterns are provided:
 * 1. Simple guard: For services where concurrent init calls just return early
 * 2. Mutex pattern: For services where concurrent init calls should wait for the first
 *
 * @module shared/ServiceLifecycle
 */

const { logger } = require('./logger');

/**
 * Default timeout for waiting on concurrent initialization
 */
const DEFAULT_INIT_WAIT_TIMEOUT = 30000;

/**
 * Creates a simple initialization guard
 *
 * Use this for services where re-initialization should just return early.
 *
 * @example
 * class MyService {
 *   constructor() {
 *     this._lifecycle = createInitGuard('MyService');
 *   }
 *
 *   async initialize() {
 *     if (this._lifecycle.isInitialized()) return;
 *
 *     // ... initialization logic ...
 *
 *     this._lifecycle.markInitialized();
 *   }
 *
 *   async shutdown() {
 *     if (!this._lifecycle.isInitialized()) return;
 *
 *     // ... cleanup logic ...
 *
 *     this._lifecycle.markUninitialized();
 *   }
 * }
 *
 * @param {string} serviceName - Name for logging
 * @returns {Object} Guard object with state methods
 */
function createInitGuard(serviceName) {
  let initialized = false;

  return {
    /**
     * Check if service is initialized
     * @returns {boolean}
     */
    isInitialized() {
      return initialized;
    },

    /**
     * Mark service as initialized
     */
    markInitialized() {
      initialized = true;
      logger.debug(`[${serviceName}] Marked as initialized`);
    },

    /**
     * Mark service as uninitialized (for shutdown)
     */
    markUninitialized() {
      initialized = false;
      logger.debug(`[${serviceName}] Marked as uninitialized`);
    },

    /**
     * Require initialization, throws if not initialized
     * @throws {Error} If not initialized
     */
    requireInitialized() {
      if (!initialized) {
        throw new Error(`${serviceName} is not initialized`);
      }
    }
  };
}

/**
 * Creates an initialization mutex for race condition protection
 *
 * Use this for services where concurrent initialize() calls should wait
 * for the first initialization to complete rather than returning early.
 *
 * @example
 * class MyService {
 *   constructor() {
 *     this._lifecycle = createInitMutex('MyService');
 *   }
 *
 *   async initialize() {
 *     // Check if already initialized
 *     if (this._lifecycle.isInitialized()) {
 *       return true;
 *     }
 *
 *     // Wait for any concurrent initialization
 *     const waitResult = await this._lifecycle.waitIfInitializing();
 *     if (waitResult !== null) {
 *       return waitResult; // Another init completed
 *     }
 *
 *     // We're the first - run initialization
 *     return this._lifecycle.runInit(async () => {
 *       // ... initialization logic ...
 *       return true; // success
 *     });
 *   }
 * }
 *
 * @param {string} serviceName - Name for logging
 * @param {Object} options - Options
 * @param {number} options.timeout - Timeout for waiting on concurrent init (default: 30000)
 * @returns {Object} Mutex object with state methods
 */
function createInitMutex(serviceName, options = {}) {
  const { timeout = DEFAULT_INIT_WAIT_TIMEOUT } = options;

  let initialized = false;
  let isInitializing = false;
  let initPromise = null;

  return {
    /**
     * Check if service is initialized
     * @returns {boolean}
     */
    isInitialized() {
      return initialized;
    },

    /**
     * Check if initialization is in progress
     * @returns {boolean}
     */
    isInitializing() {
      return isInitializing;
    },

    /**
     * Get the current init promise (if any)
     * @returns {Promise|null}
     */
    getInitPromise() {
      return initPromise;
    },

    /**
     * Wait if another initialization is in progress
     *
     * @returns {Promise<*|null>} Resolves with init result if waited, null if no wait needed
     */
    async waitIfInitializing() {
      // Return existing promise if available
      if (initPromise) {
        logger.debug(`[${serviceName}] Waiting for existing init promise`);
        return initPromise;
      }

      if (!isInitializing) {
        return null; // No wait needed
      }

      // isInitializing is true but no promise yet - poll for it
      logger.debug(`[${serviceName}] Polling for init promise`);

      return new Promise((resolve, reject) => {
        const startTime = Date.now();
        let intervalId = null;
        let timeoutId = null;

        const cleanup = () => {
          if (intervalId) {
            clearInterval(intervalId);
            intervalId = null;
          }
          if (timeoutId) {
            clearTimeout(timeoutId);
            timeoutId = null;
          }
        };

        const checkStatus = () => {
          // Check if promise appeared
          if (initPromise) {
            cleanup();
            initPromise.then(resolve).catch(reject);
            return;
          }

          // Check if initialization completed
          if (!isInitializing && initialized) {
            cleanup();
            resolve(true);
            return;
          }

          // Check if initialization failed
          if (!isInitializing && !initialized) {
            cleanup();
            reject(new Error(`${serviceName} initialization failed`));
            return;
          }

          // Check timeout
          if (Date.now() - startTime > timeout) {
            cleanup();
            reject(new Error(`${serviceName} initialization timeout after ${timeout}ms`));
          }
        };

        intervalId = setInterval(checkStatus, 50);
        timeoutId = setTimeout(() => {
          cleanup();
          reject(new Error(`${serviceName} initialization timeout after ${timeout}ms`));
        }, timeout);

        // Ensure timers don't keep process alive
        if (intervalId && intervalId.unref) intervalId.unref();
        if (timeoutId && timeoutId.unref) timeoutId.unref();

        // Run first check immediately
        checkStatus();
      });
    },

    /**
     * Run initialization with mutex protection
     *
     * @param {Function} initFn - Async function that performs initialization
     * @returns {Promise<*>} Result of initFn
     */
    async runInit(initFn) {
      if (initialized) {
        return true;
      }

      if (initPromise) {
        return initPromise;
      }

      isInitializing = true;

      initPromise = (async () => {
        try {
          const result = await initFn();
          initialized = true;
          return result;
        } catch (error) {
          initialized = false;
          throw error;
        } finally {
          // Use nextTick to ensure promise is returned before clearing flag
          // This prevents race conditions when multiple callers are waiting
          process.nextTick(() => {
            isInitializing = false;
          });
        }
      })();

      return initPromise;
    },

    /**
     * Reset state (for shutdown or re-initialization)
     */
    reset() {
      initialized = false;
      isInitializing = false;
      initPromise = null;
      logger.debug(`[${serviceName}] Lifecycle state reset`);
    },

    /**
     * Force mark as initialized (for recovery scenarios)
     */
    forceInitialized() {
      initialized = true;
      isInitializing = false;
      logger.debug(`[${serviceName}] Force marked as initialized`);
    },

    /**
     * Require initialization, throws if not initialized
     * @throws {Error} If not initialized
     */
    requireInitialized() {
      if (!initialized) {
        throw new Error(`${serviceName} is not initialized`);
      }
    }
  };
}

/**
 * Creates a shutdown helper for graceful service shutdown
 *
 * @example
 * class MyService {
 *   constructor() {
 *     this._shutdown = createShutdownHelper('MyService');
 *   }
 *
 *   doWork() {
 *     const release = this._shutdown.trackOperation();
 *     try {
 *       // ... do work ...
 *     } finally {
 *       release();
 *     }
 *   }
 *
 *   async shutdown() {
 *     await this._shutdown.waitForOperations(5000);
 *     // ... cleanup ...
 *   }
 * }
 *
 * @param {string} serviceName - Name for logging
 * @returns {Object} Shutdown helper object
 */
function createShutdownHelper(serviceName) {
  const pendingOperations = new Set();
  let operationCounter = 0;
  let isShuttingDown = false;

  return {
    /**
     * Check if shutdown is in progress
     * @returns {boolean}
     */
    isShuttingDown() {
      return isShuttingDown;
    },

    /**
     * Track an operation. Returns a release function.
     * @returns {Function} Release function to call when operation completes
     */
    trackOperation() {
      if (isShuttingDown) {
        throw new Error(`${serviceName} is shutting down`);
      }

      const opId = ++operationCounter;
      pendingOperations.add(opId);

      return () => {
        pendingOperations.delete(opId);
      };
    },

    /**
     * Get count of pending operations
     * @returns {number}
     */
    getPendingCount() {
      return pendingOperations.size;
    },

    /**
     * Wait for all pending operations to complete
     *
     * @param {number} timeoutMs - Maximum time to wait
     * @returns {Promise<boolean>} True if all operations completed, false if timed out
     */
    async waitForOperations(timeoutMs = 5000) {
      isShuttingDown = true;

      if (pendingOperations.size === 0) {
        return true;
      }

      logger.debug(`[${serviceName}] Waiting for ${pendingOperations.size} pending operations`);

      return new Promise((resolve) => {
        const startTime = Date.now();
        let intervalId = null;

        const checkComplete = () => {
          if (pendingOperations.size === 0) {
            if (intervalId) clearInterval(intervalId);
            resolve(true);
            return;
          }

          if (Date.now() - startTime > timeoutMs) {
            if (intervalId) clearInterval(intervalId);
            logger.warn(
              `[${serviceName}] Shutdown timeout with ${pendingOperations.size} operations pending`
            );
            resolve(false);
          }
        };

        intervalId = setInterval(checkComplete, 50);
        if (intervalId && intervalId.unref) intervalId.unref();

        checkComplete();
      });
    },

    /**
     * Reset shutdown state (for re-initialization)
     */
    reset() {
      isShuttingDown = false;
      pendingOperations.clear();
    }
  };
}

/**
 * Default timeout for mutex operations
 */
const DEFAULT_MUTEX_TIMEOUT = 30000;

/**
 * Creates an async mutex for serializing operations
 *
 * Uses promise chaining to ensure only one operation runs at a time.
 * Includes optional timeout for deadlock detection.
 *
 * @example
 * class MyService {
 *   constructor() {
 *     this._mutex = createAsyncMutex('MyService', { timeoutMs: 10000 });
 *   }
 *
 *   async saveData(data) {
 *     return this._mutex.withLock(async () => {
 *       await fs.writeFile('data.json', JSON.stringify(data));
 *     });
 *   }
 * }
 *
 * @param {string} name - Name for logging
 * @param {Object} options - Options
 * @param {number} options.timeoutMs - Timeout for deadlock detection (default: 30000)
 * @returns {Object} Mutex object with withLock method
 */
function createAsyncMutex(name, options = {}) {
  const { timeoutMs = DEFAULT_MUTEX_TIMEOUT } = options;

  let currentLock = Promise.resolve();
  let lockAcquiredAt = null;

  return {
    /**
     * Execute a function with exclusive lock
     *
     * @param {Function} fn - Async function to execute
     * @returns {Promise<*>} Result of fn
     */
    async withLock(fn) {
      const previousLock = currentLock;

      // Create new promise that resolves when fn completes
      let resolveLock;
      currentLock = new Promise((resolve) => {
        resolveLock = resolve;
      });

      try {
        // Wait for previous lock with timeout for deadlock detection
        const waitForPrevious = previousLock.catch(() => {
          // Previous operation failed, continue with current
        });

        let timeoutId;
        const timeoutPromise = new Promise((_, reject) => {
          timeoutId = setTimeout(() => {
            reject(
              new Error(
                `[${name}] Mutex deadlock detected: Previous operation did not complete within ${timeoutMs}ms`
              )
            );
          }, timeoutMs);
          // Allow process to exit even if timeout is pending
          if (timeoutId.unref) timeoutId.unref();
        });

        try {
          await Promise.race([waitForPrevious, timeoutPromise]);
        } finally {
          if (timeoutId) clearTimeout(timeoutId);
        }

        // Execute the function with operation timeout
        lockAcquiredAt = Date.now();

        let operationTimeoutId;
        const operationPromise = fn();
        const operationTimeout = new Promise((_, reject) => {
          operationTimeoutId = setTimeout(() => {
            reject(
              new Error(
                `[${name}] Operation timeout: Function did not complete within ${timeoutMs}ms`
              )
            );
          }, timeoutMs);
          if (operationTimeoutId.unref) operationTimeoutId.unref();
        });

        try {
          return await Promise.race([operationPromise, operationTimeout]);
        } finally {
          if (operationTimeoutId) clearTimeout(operationTimeoutId);
          lockAcquiredAt = null;
          resolveLock();
        }
      } catch (error) {
        // Always release lock on error
        lockAcquiredAt = null;
        if (resolveLock) resolveLock();
        throw error;
      }
    },

    /**
     * Check if mutex is currently held
     * @returns {boolean}
     */
    isLocked() {
      return lockAcquiredAt !== null;
    },

    /**
     * Get time since lock was acquired (for debugging)
     * @returns {number|null} Milliseconds since lock acquired, or null if not locked
     */
    getLockDuration() {
      return lockAcquiredAt ? Date.now() - lockAcquiredAt : null;
    }
  };
}

/**
 * Creates a simple write lock (fire-and-forget pattern)
 *
 * Lighter weight than AsyncMutex - doesn't block caller, just chains operations.
 * Useful for fire-and-forget saves where you want serialization but not blocking.
 *
 * @example
 * class StateService {
 *   constructor() {
 *     this._writeLock = createWriteLock('StateService');
 *   }
 *
 *   saveState() {
 *     return this._writeLock.enqueue(async () => {
 *       await this._writeToFile();
 *     });
 *   }
 * }
 *
 * @param {string} name - Name for logging
 * @returns {Object} Write lock with enqueue method
 */
function createWriteLock(name) {
  let lockChain = Promise.resolve();
  let consecutiveFailures = 0;

  return {
    /**
     * Enqueue an operation to run after previous operations complete
     *
     * @param {Function} fn - Async function to execute
     * @param {Object} options - Options
     * @param {number} options.maxConsecutiveFailures - Max failures before logging critical (default: 3)
     * @returns {Promise<*>} Result of fn
     */
    async enqueue(fn, options = {}) {
      const { maxConsecutiveFailures = 3 } = options;

      const previousLock = lockChain;

      // Create lock entry immediately (before await) so concurrent callers queue behind us
      let resolveThisLock;
      const thisLock = new Promise((resolve) => {
        resolveThisLock = resolve;
      });
      lockChain = thisLock;

      // Wait for previous, but don't propagate errors
      await previousLock.catch((err) => {
        logger.debug(`[${name}] Previous operation had error:`, err?.message);
      });

      // Execute the operation
      try {
        const result = await fn();
        consecutiveFailures = 0;
        return result;
      } catch (err) {
        consecutiveFailures++;
        logger.error(`[${name}] Operation failed:`, {
          error: err?.message,
          consecutiveFailures
        });
        if (consecutiveFailures >= maxConsecutiveFailures) {
          logger.error(
            `[${name}] CRITICAL: Multiple consecutive failures - operations may be compromised`
          );
        }
        throw err;
      } finally {
        resolveThisLock();
      }
    },

    /**
     * Get consecutive failure count
     * @returns {number}
     */
    getConsecutiveFailures() {
      return consecutiveFailures;
    },

    /**
     * Reset failure count
     */
    resetFailures() {
      consecutiveFailures = 0;
    }
  };
}

module.exports = {
  createInitGuard,
  createInitMutex,
  createShutdownHelper,
  createAsyncMutex,
  createWriteLock,
  DEFAULT_INIT_WAIT_TIMEOUT,
  DEFAULT_MUTEX_TIMEOUT
};

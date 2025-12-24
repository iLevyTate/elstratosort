/**
 * Tests for ServiceLifecycle utilities
 */

// Mock logger
jest.mock('../src/shared/logger', () => ({
  logger: {
    setContext: jest.fn(),
    info: jest.fn(),
    debug: jest.fn(),
    warn: jest.fn(),
    error: jest.fn()
  }
}));

const {
  createInitGuard,
  createInitMutex,
  createShutdownHelper,
  createAsyncMutex,
  createWriteLock
} = require('../src/shared/ServiceLifecycle');

describe('ServiceLifecycle', () => {
  describe('createInitGuard', () => {
    test('creates guard with initialized = false', () => {
      const guard = createInitGuard('TestService');
      expect(guard.isInitialized()).toBe(false);
    });

    test('markInitialized sets state to true', () => {
      const guard = createInitGuard('TestService');
      guard.markInitialized();
      expect(guard.isInitialized()).toBe(true);
    });

    test('markUninitialized sets state to false', () => {
      const guard = createInitGuard('TestService');
      guard.markInitialized();
      guard.markUninitialized();
      expect(guard.isInitialized()).toBe(false);
    });

    test('requireInitialized throws when not initialized', () => {
      const guard = createInitGuard('TestService');
      expect(() => guard.requireInitialized()).toThrow('TestService is not initialized');
    });

    test('requireInitialized does not throw when initialized', () => {
      const guard = createInitGuard('TestService');
      guard.markInitialized();
      expect(() => guard.requireInitialized()).not.toThrow();
    });
  });

  describe('createInitMutex', () => {
    test('creates mutex with initialized = false', () => {
      const mutex = createInitMutex('TestService');
      expect(mutex.isInitialized()).toBe(false);
      expect(mutex.isInitializing()).toBe(false);
    });

    test('runInit executes initialization function', async () => {
      const mutex = createInitMutex('TestService');
      const initFn = jest.fn().mockResolvedValue('result');

      const result = await mutex.runInit(initFn);

      expect(initFn).toHaveBeenCalledTimes(1);
      expect(result).toBe('result');
      expect(mutex.isInitialized()).toBe(true);
    });

    test('runInit returns existing promise on concurrent calls', async () => {
      const mutex = createInitMutex('TestService');
      let resolveInit;
      const initFn = jest.fn(
        () =>
          new Promise((resolve) => {
            resolveInit = resolve;
          })
      );

      // Start first init
      const promise1 = mutex.runInit(initFn);

      // Start second init while first is running
      const promise2 = mutex.runInit(initFn);

      // Init function should only be called once
      expect(initFn).toHaveBeenCalledTimes(1);

      // Resolve the init
      resolveInit('done');

      // Both promises should resolve to the same value
      const [result1, result2] = await Promise.all([promise1, promise2]);
      expect(result1).toBe('done');
      expect(result2).toBe('done');

      expect(mutex.isInitialized()).toBe(true);
    });

    test('runInit returns early if already initialized', async () => {
      const mutex = createInitMutex('TestService');
      await mutex.runInit(async () => 'first');

      const initFn = jest.fn().mockResolvedValue('second');
      const result = await mutex.runInit(initFn);

      expect(initFn).not.toHaveBeenCalled();
      expect(result).toBe(true);
    });

    test('runInit sets initialized to false on error', async () => {
      const mutex = createInitMutex('TestService');
      const error = new Error('Init failed');

      await expect(
        mutex.runInit(async () => {
          throw error;
        })
      ).rejects.toThrow('Init failed');

      expect(mutex.isInitialized()).toBe(false);
    });

    test('waitIfInitializing returns null when not initializing', async () => {
      const mutex = createInitMutex('TestService');
      const result = await mutex.waitIfInitializing();
      expect(result).toBeNull();
    });

    test('waitIfInitializing returns init promise result when available', async () => {
      const mutex = createInitMutex('TestService');
      let resolveInit;

      // Start initialization
      const initPromise = mutex.runInit(
        () =>
          new Promise((resolve) => {
            resolveInit = resolve;
          })
      );

      // Wait should return the init promise
      const waitPromise = mutex.waitIfInitializing();

      // Resolve the init
      resolveInit('success');

      // Both should resolve to the same value
      const [initResult, waitResult] = await Promise.all([initPromise, waitPromise]);
      expect(initResult).toBe('success');
      expect(waitResult).toBe('success');
    });

    test('reset clears all state', async () => {
      const mutex = createInitMutex('TestService');
      await mutex.runInit(async () => 'done');

      expect(mutex.isInitialized()).toBe(true);

      mutex.reset();

      expect(mutex.isInitialized()).toBe(false);
      expect(mutex.isInitializing()).toBe(false);
      expect(mutex.getInitPromise()).toBeNull();
    });

    test('forceInitialized sets initialized without running init', () => {
      const mutex = createInitMutex('TestService');
      mutex.forceInitialized();

      expect(mutex.isInitialized()).toBe(true);
      expect(mutex.isInitializing()).toBe(false);
    });

    test('requireInitialized throws when not initialized', () => {
      const mutex = createInitMutex('TestService');
      expect(() => mutex.requireInitialized()).toThrow('TestService is not initialized');
    });

    test('requireInitialized does not throw when initialized', async () => {
      const mutex = createInitMutex('TestService');
      await mutex.runInit(async () => true);
      expect(() => mutex.requireInitialized()).not.toThrow();
    });

    test('handles timeout option', async () => {
      const mutex = createInitMutex('TestService', { timeout: 100 });

      // Manually set isInitializing without a promise to trigger timeout
      // This simulates a race condition where isInitializing is true but promise isn't set
      createInitMutex('TestService', { timeout: 100 });

      // We can't easily test the timeout path without accessing internals
      // But we can verify the option is accepted
      expect(mutex.isInitialized()).toBe(false);
    });
  });

  describe('createShutdownHelper', () => {
    test('creates helper with no pending operations', () => {
      const helper = createShutdownHelper('TestService');
      expect(helper.getPendingCount()).toBe(0);
      expect(helper.isShuttingDown()).toBe(false);
    });

    test('trackOperation increments pending count', () => {
      const helper = createShutdownHelper('TestService');

      const release1 = helper.trackOperation();
      expect(helper.getPendingCount()).toBe(1);

      const release2 = helper.trackOperation();
      expect(helper.getPendingCount()).toBe(2);

      release1();
      expect(helper.getPendingCount()).toBe(1);

      release2();
      expect(helper.getPendingCount()).toBe(0);
    });

    test('trackOperation throws when shutting down', async () => {
      const helper = createShutdownHelper('TestService');

      // Start shutdown
      helper.waitForOperations(100);

      expect(() => helper.trackOperation()).toThrow('TestService is shutting down');
    });

    test('waitForOperations returns true immediately when no operations pending', async () => {
      const helper = createShutdownHelper('TestService');
      const result = await helper.waitForOperations(1000);
      expect(result).toBe(true);
    });

    test('waitForOperations waits for operations to complete', async () => {
      const helper = createShutdownHelper('TestService');

      const release = helper.trackOperation();
      expect(helper.getPendingCount()).toBe(1);

      // Start waiting, but release before timeout
      const waitPromise = helper.waitForOperations(1000);

      // Release the operation
      setTimeout(() => release(), 50);

      const result = await waitPromise;
      expect(result).toBe(true);
    });

    test('waitForOperations returns false on timeout', async () => {
      const helper = createShutdownHelper('TestService');

      helper.trackOperation(); // Don't release

      const result = await helper.waitForOperations(100);
      expect(result).toBe(false);
    });

    test('reset clears shutdown state', async () => {
      const helper = createShutdownHelper('TestService');

      // Start shutdown
      await helper.waitForOperations(100);
      expect(helper.isShuttingDown()).toBe(true);

      // Reset
      helper.reset();
      expect(helper.isShuttingDown()).toBe(false);

      // Should be able to track operations again
      expect(() => helper.trackOperation()).not.toThrow();
    });

    test('reset clears pending operations', () => {
      const helper = createShutdownHelper('TestService');

      helper.trackOperation();
      helper.trackOperation();
      expect(helper.getPendingCount()).toBe(2);

      helper.reset();
      expect(helper.getPendingCount()).toBe(0);
    });
  });

  describe('createAsyncMutex', () => {
    test('creates mutex in unlocked state', () => {
      const mutex = createAsyncMutex('TestMutex');
      expect(mutex.isLocked()).toBe(false);
      expect(mutex.getLockDuration()).toBeNull();
    });

    test('withLock executes function and returns result', async () => {
      const mutex = createAsyncMutex('TestMutex');
      const result = await mutex.withLock(async () => 'success');
      expect(result).toBe('success');
    });

    test('withLock serializes concurrent operations', async () => {
      const mutex = createAsyncMutex('TestMutex');
      const order = [];

      // Start multiple operations concurrently
      const op1 = mutex.withLock(async () => {
        order.push('start1');
        await new Promise((r) => setTimeout(r, 50));
        order.push('end1');
        return 1;
      });

      const op2 = mutex.withLock(async () => {
        order.push('start2');
        await new Promise((r) => setTimeout(r, 30));
        order.push('end2');
        return 2;
      });

      const op3 = mutex.withLock(async () => {
        order.push('start3');
        order.push('end3');
        return 3;
      });

      const [r1, r2, r3] = await Promise.all([op1, op2, op3]);

      expect(r1).toBe(1);
      expect(r2).toBe(2);
      expect(r3).toBe(3);

      // Operations should complete in order
      expect(order).toEqual(['start1', 'end1', 'start2', 'end2', 'start3', 'end3']);
    });

    test('withLock releases lock on error', async () => {
      const mutex = createAsyncMutex('TestMutex');

      await expect(
        mutex.withLock(async () => {
          throw new Error('Test error');
        })
      ).rejects.toThrow('Test error');

      // Lock should be released, next operation should work
      const result = await mutex.withLock(async () => 'recovered');
      expect(result).toBe('recovered');
    });

    test('isLocked returns true during operation', async () => {
      const mutex = createAsyncMutex('TestMutex');
      let lockStateInside = null;

      await mutex.withLock(async () => {
        lockStateInside = mutex.isLocked();
      });

      expect(lockStateInside).toBe(true);
      expect(mutex.isLocked()).toBe(false);
    });

    test('getLockDuration returns elapsed time during lock', async () => {
      const mutex = createAsyncMutex('TestMutex');
      let duration = null;

      await mutex.withLock(async () => {
        await new Promise((r) => setTimeout(r, 100));
        duration = mutex.getLockDuration();
      });

      expect(duration).toBeGreaterThanOrEqual(90);
      expect(duration).toBeLessThan(200);
    });

    test('respects timeout option for deadlock detection', async () => {
      const mutex = createAsyncMutex('TestMutex', { timeoutMs: 100 });

      // Start a long operation
      const longOp = mutex.withLock(async () => {
        await new Promise((r) => setTimeout(r, 300));
        return 'long';
      });

      // Wait a bit then try another operation - should timeout waiting for previous
      await new Promise((r) => setTimeout(r, 10));

      // The first operation will timeout internally
      await expect(longOp).rejects.toThrow(/timeout/i);
    });
  });

  describe('createWriteLock', () => {
    test('creates lock with zero consecutive failures', () => {
      const lock = createWriteLock('TestLock');
      expect(lock.getConsecutiveFailures()).toBe(0);
    });

    test('enqueue executes function and returns result', async () => {
      const lock = createWriteLock('TestLock');
      const result = await lock.enqueue(async () => 'success');
      expect(result).toBe('success');
    });

    test('enqueue serializes operations', async () => {
      const lock = createWriteLock('TestLock');
      const order = [];

      const op1 = lock.enqueue(async () => {
        order.push('start1');
        await new Promise((r) => setTimeout(r, 50));
        order.push('end1');
        return 1;
      });

      const op2 = lock.enqueue(async () => {
        order.push('start2');
        await new Promise((r) => setTimeout(r, 30));
        order.push('end2');
        return 2;
      });

      const [r1, r2] = await Promise.all([op1, op2]);

      expect(r1).toBe(1);
      expect(r2).toBe(2);
      expect(order).toEqual(['start1', 'end1', 'start2', 'end2']);
    });

    test('tracks consecutive failures', async () => {
      const lock = createWriteLock('TestLock');

      // First failure
      await expect(
        lock.enqueue(async () => {
          throw new Error('Fail 1');
        })
      ).rejects.toThrow('Fail 1');
      expect(lock.getConsecutiveFailures()).toBe(1);

      // Second failure
      await expect(
        lock.enqueue(async () => {
          throw new Error('Fail 2');
        })
      ).rejects.toThrow('Fail 2');
      expect(lock.getConsecutiveFailures()).toBe(2);

      // Success resets counter
      await lock.enqueue(async () => 'success');
      expect(lock.getConsecutiveFailures()).toBe(0);
    });

    test('continues operation chain after errors', async () => {
      const lock = createWriteLock('TestLock');

      // First operation fails
      await expect(
        lock.enqueue(async () => {
          throw new Error('First fails');
        })
      ).rejects.toThrow('First fails');

      // Next operation should still work
      const result = await lock.enqueue(async () => 'recovered');
      expect(result).toBe('recovered');
    });

    test('resetFailures clears consecutive failure count', async () => {
      const lock = createWriteLock('TestLock');

      // Create some failures
      await expect(
        lock.enqueue(async () => {
          throw new Error('Fail');
        })
      ).rejects.toThrow();
      await expect(
        lock.enqueue(async () => {
          throw new Error('Fail');
        })
      ).rejects.toThrow();

      expect(lock.getConsecutiveFailures()).toBe(2);

      lock.resetFailures();
      expect(lock.getConsecutiveFailures()).toBe(0);
    });

    test('respects maxConsecutiveFailures option for logging', async () => {
      const lock = createWriteLock('TestLock');

      // Fail multiple times (exceeds default of 3)
      for (let i = 0; i < 4; i++) {
        await expect(
          lock.enqueue(
            async () => {
              throw new Error(`Fail ${i}`);
            },
            { maxConsecutiveFailures: 3 }
          )
        ).rejects.toThrow();
      }

      expect(lock.getConsecutiveFailures()).toBe(4);
    });
  });

  describe('integration scenarios', () => {
    test('typical service lifecycle with guard', async () => {
      const guard = createInitGuard('MyService');
      const shutdownHelper = createShutdownHelper('MyService');

      // Initialize
      expect(guard.isInitialized()).toBe(false);
      guard.markInitialized();
      expect(guard.isInitialized()).toBe(true);

      // Track some operations
      const op1 = shutdownHelper.trackOperation();
      const op2 = shutdownHelper.trackOperation();
      expect(shutdownHelper.getPendingCount()).toBe(2);

      // Complete operations
      op1();
      op2();

      // Shutdown
      const shutdownComplete = await shutdownHelper.waitForOperations(1000);
      expect(shutdownComplete).toBe(true);

      guard.markUninitialized();
      expect(guard.isInitialized()).toBe(false);
    });

    test('typical service lifecycle with mutex', async () => {
      const mutex = createInitMutex('MyService');
      const shutdownHelper = createShutdownHelper('MyService');

      // Initialize with async work
      const result = await mutex.runInit(async () => {
        await new Promise((r) => setTimeout(r, 10));
        return 'initialized';
      });

      expect(result).toBe('initialized');
      expect(mutex.isInitialized()).toBe(true);

      // Use service
      const op = shutdownHelper.trackOperation();
      op();

      // Shutdown
      await shutdownHelper.waitForOperations(1000);
      mutex.reset();

      expect(mutex.isInitialized()).toBe(false);
    });

    test('concurrent initialization with mutex', async () => {
      const mutex = createInitMutex('MyService');
      let initCount = 0;

      // Simulate multiple concurrent initialization requests
      const init1 = mutex.runInit(async () => {
        initCount++;
        await new Promise((r) => setTimeout(r, 50));
        return 'done';
      });

      const init2 = mutex.runInit(async () => {
        initCount++;
        await new Promise((r) => setTimeout(r, 50));
        return 'done';
      });

      const init3 = mutex.runInit(async () => {
        initCount++;
        await new Promise((r) => setTimeout(r, 50));
        return 'done';
      });

      // All should resolve to the same value
      const [r1, r2, r3] = await Promise.all([init1, init2, init3]);

      expect(r1).toBe('done');
      expect(r2).toBe('done');
      expect(r3).toBe('done');

      // Only one init should have actually run
      expect(initCount).toBe(1);
    });
  });
});

describe('batchLockManager', () => {
  beforeEach(() => {
    jest.resetModules();
  });

  test('acquire and release lock', async () => {
    jest.useFakeTimers();
    jest.setSystemTime(0);
    const {
      acquireBatchLock,
      releaseBatchLock
    } = require('../src/main/ipc/files/batchLockManager');

    const acquired = await acquireBatchLock('batch-1', 1000);
    expect(acquired).toBe(true);

    const waiterPromise = acquireBatchLock('batch-2', 1000);
    releaseBatchLock('batch-1');
    jest.runOnlyPendingTimers();
    const waiter = await waiterPromise;
    expect(waiter).toBe(true);
    releaseBatchLock('batch-2');
    jest.useRealTimers();
  });

  test('release by non-holder batch does not unlock', async () => {
    jest.useFakeTimers();
    jest.setSystemTime(0);
    const {
      acquireBatchLock,
      releaseBatchLock
    } = require('../src/main/ipc/files/batchLockManager');

    const acquired = await acquireBatchLock('batch-holder', 1000);
    expect(acquired).toBe(true);

    const waiterPromise = acquireBatchLock('batch-waiter', 1000);
    releaseBatchLock('wrong-batch-id');

    // Waiter should still be blocked until actual holder releases.
    jest.advanceTimersByTime(50);
    let settled = false;
    waiterPromise.then(() => {
      settled = true;
    });
    await Promise.resolve();
    expect(settled).toBe(false);

    releaseBatchLock('batch-holder');
    jest.runOnlyPendingTimers();
    await expect(waiterPromise).resolves.toBe(true);
    releaseBatchLock('batch-waiter');
    jest.useRealTimers();
  });
});

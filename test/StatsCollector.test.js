/**
 * Tests for StatsCollector utilities
 */

const {
  createStatsCollector,
  createRequestStatsCollector,
  createQueueStatsCollector,
  createCacheStatsCollector
} = require('../src/shared/StatsCollector');

describe('StatsCollector', () => {
  describe('createStatsCollector', () => {
    test('initializes counters to zero', () => {
      const stats = createStatsCollector({
        totalRequests: 'counter',
        failedRequests: 'counter'
      });

      expect(stats.get('totalRequests')).toBe(0);
      expect(stats.get('failedRequests')).toBe(0);
    });

    test('increment increases counter value', () => {
      const stats = createStatsCollector({ count: 'counter' });

      stats.increment('count');
      expect(stats.get('count')).toBe(1);

      stats.increment('count', 5);
      expect(stats.get('count')).toBe(6);
    });

    test('decrement decreases counter value', () => {
      const stats = createStatsCollector({ count: 'counter' });

      stats.increment('count', 10);
      stats.decrement('count', 3);
      expect(stats.get('count')).toBe(7);
    });

    test('decrement does not go below zero', () => {
      const stats = createStatsCollector({ count: 'counter' });

      stats.decrement('count', 5);
      expect(stats.get('count')).toBe(0);
    });

    test('recordForAverage tracks running average', () => {
      const stats = createStatsCollector({ latency: 'average' });

      stats.recordForAverage('latency', 100);
      stats.recordForAverage('latency', 200);
      stats.recordForAverage('latency', 300);

      expect(stats.get('latency')).toBe(200);
    });

    test('average returns 0 when no values recorded', () => {
      const stats = createStatsCollector({ latency: 'average' });
      expect(stats.get('latency')).toBe(0);
    });

    test('updateMax tracks maximum value', () => {
      const stats = createStatsCollector({ peak: 'max' });

      stats.updateMax('peak', 5);
      stats.updateMax('peak', 3);
      stats.updateMax('peak', 10);
      stats.updateMax('peak', 7);

      expect(stats.get('peak')).toBe(10);
    });

    test('set stores raw values', () => {
      const stats = createStatsCollector({ lastError: 'value' });

      stats.set('lastError', 'Connection failed');
      expect(stats.get('lastError')).toBe('Connection failed');
    });

    test('getAll returns all stats', () => {
      const stats = createStatsCollector({
        requests: 'counter',
        latency: 'average',
        peak: 'max',
        error: 'value'
      });

      stats.increment('requests', 10);
      stats.recordForAverage('latency', 100);
      stats.recordForAverage('latency', 200);
      stats.updateMax('peak', 5);
      stats.set('error', 'test');

      const all = stats.getAll();

      expect(all.requests).toBe(10);
      expect(all.latency).toBe(150);
      expect(all.peak).toBe(5);
      expect(all.error).toBe('test');
    });

    test('reset clears all stats', () => {
      const stats = createStatsCollector({
        count: 'counter',
        avg: 'average',
        max: 'max',
        val: 'value'
      });

      stats.increment('count', 5);
      stats.recordForAverage('avg', 100);
      stats.updateMax('max', 10);
      stats.set('val', 'test');

      stats.reset();

      expect(stats.get('count')).toBe(0);
      expect(stats.get('avg')).toBe(0);
      expect(stats.get('max')).toBe(0);
      expect(stats.get('val')).toBeNull();
    });

    test('resetOne clears single stat', () => {
      const stats = createStatsCollector({
        a: 'counter',
        b: 'counter'
      });

      stats.increment('a', 5);
      stats.increment('b', 10);

      stats.resetOne('a');

      expect(stats.get('a')).toBe(0);
      expect(stats.get('b')).toBe(10);
    });

    test('get returns undefined for unknown stats', () => {
      const stats = createStatsCollector({ known: 'counter' });
      expect(stats.get('unknown')).toBeUndefined();
    });

    test('operations on unknown stats are ignored', () => {
      const stats = createStatsCollector({ known: 'counter' });

      // These should not throw
      stats.increment('unknown');
      stats.decrement('unknown');
      stats.recordForAverage('unknown', 100);
      stats.updateMax('unknown', 5);
      stats.set('unknown', 'test');
    });
  });

  describe('createRequestStatsCollector', () => {
    test('recordSuccess increments counters and records latency', () => {
      const stats = createRequestStatsCollector();

      stats.recordSuccess(100);
      stats.recordSuccess(200);

      expect(stats.get('totalRequests')).toBe(2);
      expect(stats.get('successfulRequests')).toBe(2);
      expect(stats.get('avgLatencyMs')).toBe(150);
    });

    test('recordFailure increments counters and records error', () => {
      const stats = createRequestStatsCollector();

      stats.recordFailure(new Error('Connection timeout'));

      expect(stats.get('totalRequests')).toBe(1);
      expect(stats.get('failedRequests')).toBe(1);
      expect(stats.get('lastError')).toBe('Connection timeout');
      expect(stats.get('lastErrorTime')).toBeTruthy();
    });

    test('recordRetry increments retry counter', () => {
      const stats = createRequestStatsCollector();

      stats.recordRetry();
      stats.recordRetry();

      expect(stats.get('retriedRequests')).toBe(2);
    });

    test('getSuccessRate calculates percentage', () => {
      const stats = createRequestStatsCollector();

      stats.recordSuccess(100);
      stats.recordSuccess(100);
      stats.recordSuccess(100);
      stats.recordFailure(new Error('fail'));

      expect(stats.getSuccessRate()).toBe(75);
    });

    test('getSuccessRate returns 0 when no requests', () => {
      const stats = createRequestStatsCollector();
      expect(stats.getSuccessRate()).toBe(0);
    });
  });

  describe('createQueueStatsCollector', () => {
    test('recordEnqueue tracks queue additions', () => {
      const stats = createQueueStatsCollector();

      stats.recordEnqueue(1);
      stats.recordEnqueue(2);
      stats.recordEnqueue(3);

      expect(stats.get('totalEnqueued')).toBe(3);
      expect(stats.get('currentSize')).toBe(3);
      expect(stats.get('peakSize')).toBe(3);
    });

    test('recordProcessed tracks successful processing', () => {
      const stats = createQueueStatsCollector();

      stats.recordEnqueue(5);
      stats.recordProcessed(4);
      stats.recordProcessed(3);

      expect(stats.get('totalProcessed')).toBe(2);
      expect(stats.get('currentSize')).toBe(3);
      expect(stats.get('peakSize')).toBe(5);
    });

    test('recordFailed tracks failures', () => {
      const stats = createQueueStatsCollector();

      stats.recordFailed();
      stats.recordFailed();

      expect(stats.get('totalFailed')).toBe(2);
    });

    test('recordDropped tracks dropped items', () => {
      const stats = createQueueStatsCollector();

      stats.recordDropped();
      expect(stats.get('totalDropped')).toBe(1);
    });

    test('recordDeduplicated tracks duplicates', () => {
      const stats = createQueueStatsCollector();

      stats.recordDeduplicated();
      stats.recordDeduplicated();

      expect(stats.get('deduplicated')).toBe(2);
    });
  });

  describe('createCacheStatsCollector', () => {
    test('recordHit and recordMiss track cache access', () => {
      const stats = createCacheStatsCollector();

      stats.recordHit();
      stats.recordHit();
      stats.recordMiss();

      expect(stats.get('hits')).toBe(2);
      expect(stats.get('misses')).toBe(1);
    });

    test('recordEviction tracks evictions', () => {
      const stats = createCacheStatsCollector();

      stats.recordEviction();
      stats.recordEviction();

      expect(stats.get('evictions')).toBe(2);
    });

    test('updateSize tracks current size', () => {
      const stats = createCacheStatsCollector();

      stats.updateSize(10);
      expect(stats.get('size')).toBe(10);

      stats.updateSize(15);
      expect(stats.get('size')).toBe(15);
    });

    test('getHitRate calculates percentage', () => {
      const stats = createCacheStatsCollector();

      stats.recordHit();
      stats.recordHit();
      stats.recordHit();
      stats.recordMiss();

      expect(stats.getHitRate()).toBe(75);
    });

    test('getHitRate returns 0 when no accesses', () => {
      const stats = createCacheStatsCollector();
      expect(stats.getHitRate()).toBe(0);
    });
  });
});

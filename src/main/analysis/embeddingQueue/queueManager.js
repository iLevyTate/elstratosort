/**
 * EmbeddingQueueManager
 *
 * Wrapper that applies path updates/removals across all staged embedding queues.
 * Used by FilePathCoordinator so pending embeddings remain consistent after moves/renames/deletes.
 */
const { analysisQueue, organizeQueue } = require('./stageQueues');
const { delay } = require('../../../shared/promiseUtils');

function safeCallOptional(queue, method, ...args) {
  const fn = queue && typeof queue[method] === 'function' ? queue[method] : null;
  if (!fn) return 0;
  return fn.apply(queue, args);
}

function safeCallRequired(queue, method, ...args) {
  const fn = queue && typeof queue[method] === 'function' ? queue[method] : null;
  if (!fn) {
    const queueName = queue?.constructor?.name || 'UnknownQueue';
    throw new Error(`[EmbeddingQueueManager] Missing ${method} on ${queueName}`);
  }
  return fn.apply(queue, args);
}

const queues = [analysisQueue, organizeQueue];

async function waitForQueueCapacity(
  queue,
  {
    highWatermarkPercent = 75,
    releasePercent = 50,
    maxWaitMs = 60000,
    initialDelayMs = 250,
    maxDelayMs = 2000
  } = {}
) {
  if (!queue || typeof queue.getStats !== 'function') {
    return { waited: false, timedOut: false, capacityPercent: null };
  }

  const start = Date.now();
  const firstStats = queue.getStats() || {};
  let capacityPercent = Number(firstStats.capacityPercent) || 0;
  if (capacityPercent < highWatermarkPercent) {
    return { waited: false, timedOut: false, capacityPercent };
  }

  let waitMs = Math.max(50, initialDelayMs);
  while (Date.now() - start < maxWaitMs) {
    await delay(waitMs);
    const stats = queue.getStats() || {};
    capacityPercent = Number(stats.capacityPercent) || 0;
    if (capacityPercent <= releasePercent) {
      return { waited: true, timedOut: false, capacityPercent };
    }
    waitMs = Math.min(maxDelayMs, Math.round(waitMs * 1.5));
  }

  return { waited: true, timedOut: true, capacityPercent };
}

module.exports = {
  analysisQueue,
  organizeQueue,

  updateByFilePath(oldPath, newPath) {
    let total = 0;
    for (const q of queues) total += safeCallOptional(q, 'updateByFilePath', oldPath, newPath) || 0;
    return total;
  },

  updateByFilePaths(pathChanges) {
    let total = 0;
    for (const q of queues) total += safeCallOptional(q, 'updateByFilePaths', pathChanges) || 0;
    return total;
  },

  removeByFilePath(filePath) {
    let total = 0;
    for (const q of queues) total += safeCallOptional(q, 'removeByFilePath', filePath) || 0;
    return total;
  },

  removeByFilePaths(filePaths) {
    let total = 0;
    for (const q of queues) total += safeCallOptional(q, 'removeByFilePaths', filePaths) || 0;
    return total;
  },

  getStats() {
    return {
      analysis: analysisQueue?.getStats ? analysisQueue.getStats() : null,
      organize: organizeQueue?.getStats ? organizeQueue.getStats() : null
    };
  },

  waitForAnalysisQueueCapacity(options = {}) {
    return waitForQueueCapacity(analysisQueue, options);
  },

  waitForOrganizeQueueCapacity(options = {}) {
    return waitForQueueCapacity(organizeQueue, options);
  },

  async forceFlush() {
    const results = await Promise.allSettled(queues.map((q) => safeCallRequired(q, 'forceFlush')));
    const failures = results.filter((result) => result.status === 'rejected');
    if (failures.length > 0) {
      throw new AggregateError(
        failures.map((result) => result.reason),
        'Embedding queue forceFlush failed'
      );
    }
    return results;
  },

  async shutdown() {
    const results = await Promise.allSettled(queues.map((q) => safeCallRequired(q, 'shutdown')));
    const failures = results.filter((result) => result.status === 'rejected');
    if (failures.length > 0) {
      throw new AggregateError(
        failures.map((result) => result.reason),
        'Embedding queue shutdown failed'
      );
    }
    return results;
  }
};

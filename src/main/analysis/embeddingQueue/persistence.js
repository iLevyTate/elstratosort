/**
 * Embedding Queue Persistence Module
 *
 * Handles file I/O operations for queue persistence with atomic writes.
 * Uses shared atomicFile utilities for consistent atomic file operations.
 *
 * @module embeddingQueue/persistence
 */

const { logger } = require('../../../shared/logger');
const {
  atomicWriteFile,
  safeUnlink,
  loadJsonFile,
  persistData,
  persistMap
} = require('../../../shared/atomicFile');

/**
 * Load persisted data from a file
 * @param {string} filePath - Path to the file
 * @param {Function} onLoad - Callback with parsed data
 * @param {string} description - Description for logging
 */
async function loadPersistedData(filePath, onLoad, description) {
  await loadJsonFile(filePath, {
    onLoad,
    description,
    backupCorrupt: true
  });
}

/**
 * Persist queue data to disk
 * @param {string} filePath - Path to persist to
 * @param {Array} queue - Queue data to persist
 */
async function persistQueueData(filePath, queue) {
  try {
    await persistData(filePath, queue);
  } catch (error) {
    logger.debug('[EmbeddingQueue] Error persisting queue to disk:', error.message);
  }
}

/**
 * Persist failed items to disk
 * @param {string} filePath - Path to persist to
 * @param {Map} failedItems - Failed items map
 */
async function persistFailedItems(filePath, failedItems) {
  try {
    await persistMap(filePath, failedItems);
  } catch (error) {
    logger.debug('[EmbeddingQueue] Error persisting failed items:', error.message);
  }
}

/**
 * Persist dead letter queue to disk
 * @param {string} filePath - Path to persist to
 * @param {Array} deadLetterQueue - Dead letter queue
 */
async function persistDeadLetterQueue(filePath, deadLetterQueue) {
  try {
    await persistData(filePath, deadLetterQueue, { pretty: true });
  } catch (error) {
    logger.debug('[EmbeddingQueue] Error persisting dead letter queue:', error.message);
  }
}

module.exports = {
  loadPersistedData,
  atomicWriteFile,
  safeUnlink,
  persistQueueData,
  persistFailedItems,
  persistDeadLetterQueue
};

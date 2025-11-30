const fs = require('fs').promises;
const path = require('path');
const { app } = require('electron');
const { logger } = require('../../shared/logger');
const ChromaDBService = require('../services/ChromaDBService');
const { get: getConfig } = require('../../shared/config');
const {
  BATCH,
  LIMITS,
  THRESHOLDS,
  RETRY,
  CONCURRENCY,
} = require('../../shared/performanceConstants');

logger.setContext('EmbeddingQueue');

class EmbeddingQueue {
  constructor() {
    this.queue = [];
    this.persistencePath = path.join(
      app.getPath('userData'),
      'pending_embeddings.json',
    );
    // Dead letter queue persistence path for permanently failed items
    this.deadLetterPath = path.join(
      app.getPath('userData'),
      'dead_letter_embeddings.json',
    );
    // Failed items persistence path (for items pending retry)
    this.failedItemsPath = path.join(
      app.getPath('userData'),
      'failed_embeddings.json',
    );
    // Use unified config for batch size and retry settings
    this.BATCH_SIZE = getConfig('ANALYSIS.batchSize', 50);
    this.FLUSH_DELAY_MS = BATCH.EMBEDDING_FLUSH_DELAY_MS;
    this.flushTimer = null;
    this.isFlushing = false;
    this.initialized = false;
    // Max queue size to prevent unbounded memory growth
    this.MAX_QUEUE_SIZE = LIMITS.MAX_QUEUE_SIZE;
    // Max retry count for database offline scenarios
    this.MAX_RETRY_COUNT = getConfig('ANALYSIS.retryAttempts', 10);
    this.retryCount = 0;
    // Track failed items for retry with item-level retry counts
    this.failedItems = new Map(); // Map of itemId -> { item, retryCount, lastAttempt, error }
    // Max retries per individual item before moving to dead letter queue
    this.ITEM_MAX_RETRIES = getConfig('ANALYSIS.retryAttempts', 3);
    // Memory monitoring thresholds
    this.HIGH_WATERMARK = THRESHOLDS.QUEUE_HIGH_WATERMARK;
    this.CRITICAL_WATERMARK = THRESHOLDS.QUEUE_CRITICAL_WATERMARK;
    this.MEMORY_WARNING_THRESHOLD = Math.floor(this.MAX_QUEUE_SIZE * this.HIGH_WATERMARK);
    this.CRITICAL_WARNING_THRESHOLD = Math.floor(this.MAX_QUEUE_SIZE * this.CRITICAL_WATERMARK);
    this.memoryWarningLogged = false;
    this.criticalWarningLogged = false;
    // Dead letter queue for permanently failed items (in-memory cache)
    this.deadLetterQueue = [];
    // Maximum dead letter queue size before oldest entries are pruned
    this.MAX_DEAD_LETTER_SIZE = LIMITS.MAX_DEAD_LETTER_SIZE;

    // FIX: Parallel flush configuration for improved throughput
    this.PARALLEL_FLUSH_CONCURRENCY = CONCURRENCY.EMBEDDING_FLUSH;
    this.PARALLEL_BATCH_SIZE = BATCH.EMBEDDING_PARALLEL_SIZE;

    // Progress tracking for parallel operations
    this._progressCallbacks = new Set();

    // CRITICAL FIX: Track pending persistence operations for graceful shutdown
    this._pendingPersistence = null;
    this._pendingFlush = null;
  }

  /**
   * Ensure all pending operations complete (call before app quit)
   * @returns {Promise} Resolves when all pending operations are complete
   */
  async ensurePendingComplete() {
    const operations = [];
    if (this._pendingPersistence) {
      operations.push(this._pendingPersistence);
    }
    if (this._pendingFlush) {
      operations.push(this._pendingFlush);
    }
    if (operations.length > 0) {
      logger.info('[EmbeddingQueue] Waiting for pending operations to complete');
      try {
        await Promise.all(operations);
      } catch (err) {
        logger.error('[EmbeddingQueue] Error completing pending operations:', err.message);
      }
    }
    // Final persist to ensure nothing is lost
    await this.persistQueue();
  }

  /**
   * Register a progress callback for flush operations
   * @param {Function} callback - Progress callback (progress) => void
   * @returns {Function} Unsubscribe function
   */
  onProgress(callback) {
    this._progressCallbacks.add(callback);
    return () => this._progressCallbacks.delete(callback);
  }

  /**
   * Notify all progress callbacks
   * @param {Object} progress - Progress information
   */
  _notifyProgress(progress) {
    for (const callback of this._progressCallbacks) {
      try {
        callback(progress);
      } catch (e) {
        logger.warn('[EmbeddingQueue] Progress callback error:', e.message);
      }
    }
  }

  /**
   * Initialize the queue by loading pending items from disk
   */
  async initialize() {
    if (this.initialized) return;

    try {
      // Load main queue
      await this._loadPersistedData(
        this.persistencePath,
        (data) => {
          if (Array.isArray(data) && data.length > 0) {
            this.queue = data;
            logger.info(
              `[EmbeddingQueue] Restored ${this.queue.length} pending embeddings from disk`,
            );
          }
        },
        'pending embeddings'
      );

      // Load failed items awaiting retry
      await this._loadPersistedData(
        this.failedItemsPath,
        (data) => {
          if (data && typeof data === 'object') {
            // Convert array back to Map
            const entries = Array.isArray(data) ? data : Object.entries(data);
            for (const [id, itemData] of entries) {
              if (id && itemData && itemData.item) {
                this.failedItems.set(id, itemData);
              }
            }
            if (this.failedItems.size > 0) {
              logger.info(
                `[EmbeddingQueue] Restored ${this.failedItems.size} failed items awaiting retry`,
              );
            }
          }
        },
        'failed items'
      );

      // Load dead letter queue
      await this._loadPersistedData(
        this.deadLetterPath,
        (data) => {
          if (Array.isArray(data) && data.length > 0) {
            this.deadLetterQueue = data;
            logger.info(
              `[EmbeddingQueue] Loaded ${this.deadLetterQueue.length} items in dead letter queue`,
            );
          }
        },
        'dead letter queue'
      );

      this.initialized = true;

      // Schedule flush if there are pending items
      if (this.queue.length > 0 || this.failedItems.size > 0) {
        this.scheduleFlush();
      }
    } catch (error) {
      logger.error('[EmbeddingQueue] Initialization error:', error);
      // Continue despite error, just won't have persistence initially
      this.initialized = true;
    }
  }

  /**
   * Helper to load persisted data from a file
   * @param {string} filePath - Path to the file
   * @param {Function} onLoad - Callback with parsed data
   * @param {string} description - Description for logging
   */
  async _loadPersistedData(filePath, onLoad, description) {
    try {
      const exists = await fs
        .access(filePath)
        .then(() => true)
        .catch(() => false);

      if (exists) {
        const data = await fs.readFile(filePath, 'utf8');
        try {
          const parsed = JSON.parse(data);
          onLoad(parsed);
        } catch (parseError) {
          logger.error(
            `[EmbeddingQueue] Failed to parse ${description} file`,
            parseError,
          );
          // Backup corrupt file
          await fs
            .rename(filePath, `${filePath}.corrupt.${Date.now()}`)
            .catch(() => {});
        }
      }
    } catch (error) {
      logger.warn(`[EmbeddingQueue] Error loading ${description}:`, error.message);
    }
  }

  /**
   * Add an item to the embedding queue
   * @param {Object} item - Embedding item { id, vector, model, meta, updatedAt }
   * @returns {Object} Result with status and any warnings
   */
  async enqueue(item) {
    if (!item || !item.id || !item.vector) {
      logger.warn('[EmbeddingQueue] Invalid item ignored', {
        id: item?.id,
      });
      return { success: false, reason: 'invalid_item' };
    }

    // Ensure initialized
    if (!this.initialized) {
      await this.initialize();
    }

    const result = { success: true, warnings: [] };

    // Memory monitoring - warn at 75% capacity (high watermark)
    if (this.queue.length >= this.MEMORY_WARNING_THRESHOLD && !this.memoryWarningLogged) {
      const capacityPercent = Math.round((this.queue.length / this.MAX_QUEUE_SIZE) * 100);
      logger.warn(
        `[EmbeddingQueue] Queue at ${capacityPercent}% capacity (${this.queue.length}/${this.MAX_QUEUE_SIZE}) - approaching high watermark`,
      );
      this.memoryWarningLogged = true;
      result.warnings.push('high_watermark');
    }

    // Critical warning at 90% capacity
    if (this.queue.length >= this.CRITICAL_WARNING_THRESHOLD && !this.criticalWarningLogged) {
      const capacityPercent = Math.round((this.queue.length / this.MAX_QUEUE_SIZE) * 100);
      logger.error(
        `[EmbeddingQueue] CRITICAL: Queue at ${capacityPercent}% capacity (${this.queue.length}/${this.MAX_QUEUE_SIZE}) - flush may be failing`,
      );
      this.criticalWarningLogged = true;
      result.warnings.push('critical_watermark');
    }

    // Reset warning flags when queue drops below thresholds
    if (this.queue.length < this.MEMORY_WARNING_THRESHOLD * 0.5) {
      this.memoryWarningLogged = false;
    }
    if (this.queue.length < this.CRITICAL_WARNING_THRESHOLD * 0.5) {
      this.criticalWarningLogged = false;
    }

    // Enforce max queue size to prevent unbounded memory growth
    if (this.queue.length >= this.MAX_QUEUE_SIZE) {
      // Drop oldest items to make room (drop 5% at a time for efficiency)
      const dropCount = Math.max(1, Math.floor(this.MAX_QUEUE_SIZE * 0.05));
      const droppedItems = this.queue.splice(0, dropCount);
      logger.warn(
        `[EmbeddingQueue] Queue full (${this.MAX_QUEUE_SIZE}), dropped ${dropCount} oldest items`,
        { droppedIds: droppedItems.map(i => i.id).slice(0, 5) } // Log first 5 IDs
      );
      result.warnings.push('queue_overflow');
      result.droppedCount = dropCount;
    }

    this.queue.push(item);

    // Persist to disk asynchronously to prevent data loss on crash
    // Track the promise so we can await it on shutdown
    this._pendingPersistence = this.persistQueue()
      .catch((err) => {
        logger.warn('[EmbeddingQueue] Failed to persist queue:', err.message);
      })
      .finally(() => {
        this._pendingPersistence = null;
      });

    if (this.queue.length >= this.BATCH_SIZE) {
      // Track flush promise for graceful shutdown
      this._pendingFlush = this.flush()
        .catch((err) => {
          logger.error('[EmbeddingQueue] Flush failed:', err.message);
        })
        .finally(() => {
          this._pendingFlush = null;
        });
    } else {
      this.scheduleFlush();
    }

    return result;
  }

  /**
   * Schedule a delayed flush
   */
  scheduleFlush() {
    if (this.flushTimer) {
      return;
    }

    this.flushTimer = setTimeout(() => {
      this.flushTimer = null;
      this.flush().catch((err) => {
        logger.error('[EmbeddingQueue] Delayed flush failed:', err.message);
      });
    }, this.FLUSH_DELAY_MS);
  }

  /**
   * Persist current queue state to disk
   */
  async persistQueue() {
    try {
      if (this.queue.length === 0) {
        // If empty, remove the file to keep things clean
        await fs.unlink(this.persistencePath).catch((e) => {
          if (e.code !== 'ENOENT') throw e;
        });
        return;
      }
      // FIX: Use atomic write (temp + rename) to prevent corruption on crash
      const tempPath = this.persistencePath + '.tmp.' + Date.now();
      try {
        await fs.writeFile(tempPath, JSON.stringify(this.queue), 'utf8');
        await fs.rename(tempPath, this.persistencePath);
      } catch (writeError) {
        try {
          await fs.unlink(tempPath);
        } catch {
          // Ignore cleanup errors
        }
        throw writeError;
      }
    } catch (error) {
      // Log but don't throw, as this is a background safety mechanism
      logger.debug(
        '[EmbeddingQueue] Error persisting queue to disk:',
        error.message,
      );
    }
  }

  /**
   * Flush pending embeddings to ChromaDB
   * FIX: Improved with parallel processing and progress tracking for better performance
   */
  async flush() {
    if (this.isFlushing || this.queue.length === 0) {
      return;
    }

    this.isFlushing = true;
    const flushStartTime = Date.now();

    // Clear timer if running
    if (this.flushTimer) {
      clearTimeout(this.flushTimer);
      this.flushTimer = null;
    }

    // FIX: Don't optimistically clear - take snapshot but keep queue intact until success
    const batchSize = Math.min(this.queue.length, this.BATCH_SIZE);
    const batch = this.queue.slice(0, batchSize);

    // Notify progress start
    this._notifyProgress({
      phase: 'start',
      total: batch.length,
      completed: 0,
      percent: 0,
      queueRemaining: this.queue.length - batchSize,
    });

    try {
      logger.debug('[EmbeddingQueue] Flushing batch', { count: batch.length });

      const chromaDbService = ChromaDBService.getInstance();
      await chromaDbService.initialize();

      if (!chromaDbService.isOnline) {
        // FIX: Implement exponential backoff and max retry count to prevent infinite loops
        this.retryCount++;

        this._notifyProgress({
          phase: 'offline',
          total: batch.length,
          completed: 0,
          retryCount: this.retryCount,
          maxRetries: this.MAX_RETRY_COUNT,
        });

        if (this.retryCount >= this.MAX_RETRY_COUNT) {
          logger.error(
            `[EmbeddingQueue] Database offline after ${this.MAX_RETRY_COUNT} retries, moving ${batch.length} items to failed queue`,
          );
          // FIX: Move items to failed queue instead of dropping
          for (const item of batch) {
            this._trackFailedItem(item, 'Database offline');
          }
          // Remove from main queue
          this.queue.splice(0, batchSize);
          this.retryCount = 0;
          await this.persistQueue();
          return;
        }

        logger.warn(
          `[EmbeddingQueue] Database offline, will retry (${this.retryCount}/${this.MAX_RETRY_COUNT})`,
        );
        // Don't remove from queue - items stay in place

        // FIX: Exponential backoff: 5s, 10s, 20s, 40s, etc. up to 5 minutes max
        const backoffDelay = Math.min(
          RETRY.BACKOFF_BASE_MS * Math.pow(2, this.retryCount - 1),
          RETRY.BACKOFF_MAX_MS,
        );
        logger.info(`[EmbeddingQueue] Retry in ${backoffDelay / 1000}s`);
        // HIGH FIX: Call unref() to allow process to exit cleanly during shutdown
        const retryTimer = setTimeout(() => this.scheduleFlush(), backoffDelay);
        if (retryTimer.unref) retryTimer.unref();
        return;
      }

      // Reset retry count on successful online status
      this.retryCount = 0;

      const fileItems = batch.filter((i) => !i.id.startsWith('folder:'));
      const folderItems = batch.filter((i) => i.id.startsWith('folder:'));
      const failedItemIds = new Set();
      let processedCount = 0;

      // FIX: Process files with improved parallel processing
      if (fileItems.length > 0) {
        processedCount = await this._processItemsInParallel(
          fileItems,
          'file',
          chromaDbService,
          failedItemIds,
          processedCount,
          batch.length
        );
      }

      // FIX: Process folders with improved parallel processing
      if (folderItems.length > 0) {
        await this._processItemsInParallel(
          folderItems,
          'folder',
          chromaDbService,
          failedItemIds,
          processedCount,
          batch.length
        );
      }

      // Remove processed items from queue (both successful and failed - failed are tracked separately)
      this.queue.splice(0, batchSize);

      const flushDuration = Date.now() - flushStartTime;
      const successfulFiles = fileItems.length - [...failedItemIds].filter(id => !id.startsWith('folder:')).length;
      const successfulFolders = folderItems.length - [...failedItemIds].filter(id => id.startsWith('folder:')).length;

      logger.info('[EmbeddingQueue] Successfully flushed batch', {
        files: successfulFiles,
        folders: successfulFolders,
        failed: failedItemIds.size,
        remaining: this.queue.length,
        duration: `${flushDuration}ms`,
        throughput: `${(batch.length / (flushDuration / 1000)).toFixed(2)} items/sec`,
      });

      // Notify progress complete
      this._notifyProgress({
        phase: 'complete',
        total: batch.length,
        completed: batch.length - failedItemIds.size,
        failed: failedItemIds.size,
        percent: 100,
        queueRemaining: this.queue.length,
        duration: flushDuration,
      });

      // Persist updated queue state
      await this.persistQueue();

      // FIX: Retry failed items if they haven't exceeded max retries
      await this._retryFailedItems();

      // If there are more items in the queue, schedule another flush
      if (this.queue.length > 0) {
        this.scheduleFlush();
      }
    } catch (error) {
      logger.error('[EmbeddingQueue] Flush error:', error.message);

      this._notifyProgress({
        phase: 'error',
        error: error.message,
        retryCount: this.retryCount,
      });

      // FIX: Items remain in queue since we didn't splice them out
      // Schedule retry with backoff
      this.retryCount++;
      const backoffDelay = Math.min(
        RETRY.BACKOFF_BASE_MS * Math.pow(2, this.retryCount - 1),
          RETRY.BACKOFF_MAX_MS,
      );
      logger.info(`[EmbeddingQueue] Will retry in ${backoffDelay / 1000}s`);
      const retryTimer = setTimeout(() => this.scheduleFlush(), backoffDelay);
      if (retryTimer.unref) retryTimer.unref();
    } finally {
      this.isFlushing = false;
    }
  }

  /**
   * Process items in parallel with semaphore-based concurrency control
   * @param {Array} items - Items to process
   * @param {string} type - 'file' or 'folder'
   * @param {Object} chromaDbService - ChromaDB service instance
   * @param {Set} failedItemIds - Set to track failed item IDs
   * @param {number} startProcessedCount - Starting count for progress
   * @param {number} totalBatchSize - Total batch size for progress
   * @returns {number} Updated processed count
   */
  async _processItemsInParallel(items, type, chromaDbService, failedItemIds, startProcessedCount, totalBatchSize) {
    let processedCount = startProcessedCount;
    const concurrency = this.PARALLEL_FLUSH_CONCURRENCY;

    // Try batch upsert first if available
    const batchMethod = type === 'file' ? 'batchUpsertFiles' : 'batchUpsertFolders';
    const singleMethod = type === 'file' ? 'upsertFile' : 'upsertFolder';

    if (typeof chromaDbService[batchMethod] === 'function') {
      try {
        if (type === 'folder') {
          // Format folders for batch upsert
          const formattedItems = items.map((item) => ({
            id: item.id,
            vector: item.vector,
            name: item.meta?.name || item.id,
            path: item.meta?.path,
            model: item.model,
            updatedAt: item.updatedAt,
          }));
          await chromaDbService[batchMethod](formattedItems);
        } else {
          await chromaDbService[batchMethod](items);
        }

        // All items processed successfully
        processedCount += items.length;
        this._notifyProgress({
          phase: 'processing',
          total: totalBatchSize,
          completed: processedCount,
          // FIX: Prevent division by zero when totalBatchSize is 0
          percent: totalBatchSize > 0 ? Math.round((processedCount / totalBatchSize) * 100) : 0,
          itemType: type,
        });

        return processedCount;
      } catch (batchError) {
        logger.warn(`[EmbeddingQueue] Batch ${type} upsert failed, falling back to parallel individual:`, batchError.message);
        // Fall through to parallel individual processing
      }
    }

    // FIX: Improved parallel individual processing with semaphore pattern
    logger.debug(`[EmbeddingQueue] Processing ${items.length} ${type}s with concurrency ${concurrency}`);

    // Semaphore-based parallel processing
    let activeCount = 0;
    const waitQueue = [];

    const acquireSlot = () => {
      if (activeCount < concurrency) {
        activeCount++;
        return Promise.resolve();
      }
      return new Promise((resolve) => waitQueue.push(resolve));
    };

    const releaseSlot = () => {
      activeCount--;
      if (waitQueue.length > 0) {
        activeCount++;
        waitQueue.shift()();
      }
    };

    const processItem = async (item) => {
      await acquireSlot();
      try {
        const payload = type === 'folder'
          ? {
              id: item.id,
              vector: item.vector,
              name: item.meta?.name || item.id,
              path: item.meta?.path,
              model: item.model,
              updatedAt: item.updatedAt,
            }
          : {
              id: item.id,
              vector: item.vector,
              meta: item.meta,
              model: item.model,
              updatedAt: item.updatedAt,
            };

        await chromaDbService[singleMethod](payload);

        this._notifyProgress({
          phase: 'processing',
          total: totalBatchSize,
          completed: ++processedCount,
          // FIX: Prevent division by zero when totalBatchSize is 0
          percent: totalBatchSize > 0 ? Math.round((processedCount / totalBatchSize) * 100) : 0,
          itemType: type,
          currentItem: item.id,
        });
      } catch (itemError) {
        logger.warn(`[EmbeddingQueue] Failed to upsert ${type} ${item.id}:`, itemError.message);
        failedItemIds.add(item.id);
        this._trackFailedItem(item, itemError.message);
      } finally {
        releaseSlot();
      }
    };

    // Launch all tasks - semaphore controls actual concurrency
    await Promise.all(items.map(processItem));

    return processedCount;
  }

  /**
   * Track failed items for retry with exponential backoff
   * Items exceeding max retries are moved to the dead letter queue
   * @param {Object} item - The failed embedding item
   * @param {string} errorMessage - The error message
   */
  _trackFailedItem(item, errorMessage) {
    const existing = this.failedItems.get(item.id);
    const retryCount = existing ? existing.retryCount + 1 : 1;

    if (retryCount > this.ITEM_MAX_RETRIES) {
      // Move to dead letter queue instead of dropping
      this._addToDeadLetterQueue(item, errorMessage, retryCount);
      this.failedItems.delete(item.id);
      return;
    }

    this.failedItems.set(item.id, {
      item,
      retryCount,
      lastAttempt: Date.now(),
      error: errorMessage,
    });

    // Persist failed items to disk for recovery
    this._persistFailedItems().catch(err => {
      logger.warn('[EmbeddingQueue] Failed to persist failed items:', err.message);
    });

    logger.debug(`[EmbeddingQueue] Tracked failed item ${item.id} (retry ${retryCount}/${this.ITEM_MAX_RETRIES})`);
  }

  /**
   * Add an item to the dead letter queue (permanently failed items)
   * @param {Object} item - The failed embedding item
   * @param {string} errorMessage - The error message
   * @param {number} retryCount - Number of retries attempted
   */
  _addToDeadLetterQueue(item, errorMessage, retryCount) {
    const deadLetterEntry = {
      item,
      error: errorMessage,
      retryCount,
      failedAt: new Date().toISOString(),
      itemId: item.id,
      itemType: item.id.startsWith('folder:') ? 'folder' : 'file',
    };

    // Prune oldest entries if at capacity
    if (this.deadLetterQueue.length >= this.MAX_DEAD_LETTER_SIZE) {
      const pruneCount = Math.floor(this.MAX_DEAD_LETTER_SIZE * 0.1);
      this.deadLetterQueue.splice(0, pruneCount);
      logger.warn(
        `[EmbeddingQueue] Dead letter queue at capacity, pruned ${pruneCount} oldest entries`,
      );
    }

    this.deadLetterQueue.push(deadLetterEntry);

    logger.error(
      `[EmbeddingQueue] Item ${item.id} moved to dead letter queue after ${retryCount} failed attempts`,
      { error: errorMessage }
    );

    // Persist dead letter queue to disk
    this._persistDeadLetterQueue().catch(err => {
      logger.warn('[EmbeddingQueue] Failed to persist dead letter queue:', err.message);
    });
  }

  /**
   * Persist failed items map to disk for recovery after restart
   */
  async _persistFailedItems() {
    try {
      if (this.failedItems.size === 0) {
        await fs.unlink(this.failedItemsPath).catch(e => {
          if (e.code !== 'ENOENT') throw e;
        });
        return;
      }
      // Convert Map to array for JSON serialization
      const data = Array.from(this.failedItems.entries());
      // FIX: Use atomic write (temp + rename) to prevent corruption on crash
      const tempPath = this.failedItemsPath + '.tmp.' + Date.now();
      try {
        await fs.writeFile(tempPath, JSON.stringify(data), 'utf8');
        await fs.rename(tempPath, this.failedItemsPath);
      } catch (writeError) {
        try {
          await fs.unlink(tempPath);
        } catch {
          // Ignore cleanup errors
        }
        throw writeError;
      }
    } catch (error) {
      logger.debug('[EmbeddingQueue] Error persisting failed items:', error.message);
    }
  }

  /**
   * Persist dead letter queue to disk
   */
  async _persistDeadLetterQueue() {
    try {
      if (this.deadLetterQueue.length === 0) {
        await fs.unlink(this.deadLetterPath).catch(e => {
          if (e.code !== 'ENOENT') throw e;
        });
        return;
      }
      // FIX: Use atomic write (temp + rename) to prevent corruption on crash
      const tempPath = this.deadLetterPath + '.tmp.' + Date.now();
      try {
        await fs.writeFile(tempPath, JSON.stringify(this.deadLetterQueue, null, 2), 'utf8');
        await fs.rename(tempPath, this.deadLetterPath);
      } catch (writeError) {
        try {
          await fs.unlink(tempPath);
        } catch {
          // Ignore cleanup errors
        }
        throw writeError;
      }
    } catch (error) {
      logger.debug('[EmbeddingQueue] Error persisting dead letter queue:', error.message);
    }
  }

  /**
   * Retry failed items with exponential backoff
   */
  async _retryFailedItems() {
    if (this.failedItems.size === 0) return;

    const now = Date.now();
    const itemsToRetry = [];

    for (const [id, data] of this.failedItems) {
      // Exponential backoff per item: 10s, 20s, 40s
      const backoffMs = RETRY.BACKOFF_BASE_MS * 2 * Math.pow(2, data.retryCount - 1);

      if (now - data.lastAttempt >= backoffMs) {
        itemsToRetry.push(data.item);
        this.failedItems.delete(id);
      }
    }

    if (itemsToRetry.length > 0) {
      logger.info(`[EmbeddingQueue] Re-queuing ${itemsToRetry.length} failed items for retry`);
      // Add to front of queue for priority processing
      this.queue.unshift(...itemsToRetry);
      await this.persistQueue();
      await this._persistFailedItems();
    }
  }

  /**
   * Get comprehensive queue statistics for monitoring
   * @returns {Object} Queue statistics including health indicators
   */
  getStats() {
    const capacityPercent = Math.round((this.queue.length / this.MAX_QUEUE_SIZE) * 100);
    let healthStatus = 'healthy';
    if (capacityPercent >= this.CRITICAL_WATERMARK * 100) {
      healthStatus = 'critical';
    } else if (capacityPercent >= this.HIGH_WATERMARK * 100) {
      healthStatus = 'warning';
    }

    return {
      // Queue state
      queueLength: this.queue.length,
      maxQueueSize: this.MAX_QUEUE_SIZE,
      capacityPercent,
      healthStatus,
      isFlushing: this.isFlushing,

      // Retry state
      failedItemsCount: this.failedItems.size,
      retryCount: this.retryCount,
      maxRetryCount: this.MAX_RETRY_COUNT,
      itemMaxRetries: this.ITEM_MAX_RETRIES,

      // Dead letter queue
      deadLetterCount: this.deadLetterQueue.length,
      maxDeadLetterSize: this.MAX_DEAD_LETTER_SIZE,

      // Thresholds
      highWatermark: this.MEMORY_WARNING_THRESHOLD,
      criticalWatermark: this.CRITICAL_WARNING_THRESHOLD,

      // Flags
      isInitialized: this.initialized,
      hasHighWatermarkWarning: this.memoryWarningLogged,
      hasCriticalWarning: this.criticalWarningLogged,
    };
  }

  /**
   * Get items from the dead letter queue
   * @param {number} limit - Maximum number of items to return (default: 100)
   * @returns {Array} Dead letter queue items
   */
  getDeadLetterItems(limit = 100) {
    return this.deadLetterQueue.slice(-limit);
  }

  /**
   * Clear the dead letter queue (for manual intervention)
   * @returns {number} Number of items cleared
   */
  async clearDeadLetterQueue() {
    const count = this.deadLetterQueue.length;
    this.deadLetterQueue = [];
    await this._persistDeadLetterQueue();
    logger.info(`[EmbeddingQueue] Cleared ${count} items from dead letter queue`);
    return count;
  }

  /**
   * Retry a specific item from the dead letter queue
   * @param {string} itemId - The ID of the item to retry
   * @returns {boolean} Whether the item was found and re-queued
   */
  async retryDeadLetterItem(itemId) {
    const index = this.deadLetterQueue.findIndex(entry => entry.itemId === itemId);
    if (index === -1) {
      logger.warn(`[EmbeddingQueue] Dead letter item ${itemId} not found`);
      return false;
    }

    const entry = this.deadLetterQueue.splice(index, 1)[0];
    // Reset retry count when manually retrying
    this.queue.push(entry.item);
    await this.persistQueue();
    await this._persistDeadLetterQueue();
    logger.info(`[EmbeddingQueue] Manually re-queued dead letter item ${itemId}`);
    this.scheduleFlush();
    return true;
  }

  /**
   * Retry all items in the dead letter queue
   * @returns {number} Number of items re-queued
   */
  async retryAllDeadLetterItems() {
    if (this.deadLetterQueue.length === 0) {
      return 0;
    }

    const count = this.deadLetterQueue.length;
    const items = this.deadLetterQueue.map(entry => entry.item);
    this.deadLetterQueue = [];
    this.queue.push(...items);
    await this.persistQueue();
    await this._persistDeadLetterQueue();
    logger.info(`[EmbeddingQueue] Manually re-queued ${count} dead letter items`);
    this.scheduleFlush();
    return count;
  }

  /**
   * Force flush the queue immediately (for shutdown/cleanup)
   * @returns {Promise<void>}
   */
  async forceFlush() {
    // Clear any pending timer
    if (this.flushTimer) {
      clearTimeout(this.flushTimer);
      this.flushTimer = null;
    }

    // Wait for current flush to complete
    if (this.isFlushing) {
      logger.info('[EmbeddingQueue] Waiting for current flush to complete...');
      // Wait up to 30 seconds for flush to complete
      const maxWait = 30000;
      const startTime = Date.now();
      while (this.isFlushing && Date.now() - startTime < maxWait) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    }

    // Perform final flush
    if (this.queue.length > 0) {
      logger.info(`[EmbeddingQueue] Force flushing ${this.queue.length} remaining items`);
      await this.flush();
    }

    // Persist all state
    await this.persistQueue();
    await this._persistFailedItems();
    await this._persistDeadLetterQueue();
    logger.info('[EmbeddingQueue] Force flush complete');
  }

  /**
   * Graceful shutdown - persist state and cleanup
   */
  async shutdown() {
    logger.info('[EmbeddingQueue] Shutting down...');

    // Clear timer
    if (this.flushTimer) {
      clearTimeout(this.flushTimer);
      this.flushTimer = null;
    }

    // Persist all state to disk
    await this.persistQueue();
    await this._persistFailedItems();
    await this._persistDeadLetterQueue();

    logger.info('[EmbeddingQueue] Shutdown complete', {
      pendingItems: this.queue.length,
      failedItems: this.failedItems.size,
      deadLetterItems: this.deadLetterQueue.length,
    });
  }
}

module.exports = new EmbeddingQueue();

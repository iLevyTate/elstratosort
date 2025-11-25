import * as crypto from 'crypto';
import { logger } from '../../shared/logger';

logger.setContext('LLMOptimization');

/**
 * LLM Optimization Utilities
 * - Request deduplication: Prevent duplicate LLM calls for identical inputs
 * - Batching: Process multiple files in parallel with concurrency control
 * - Request coalescing: Merge multiple pending requests for the same input
 */

class LLMRequestDeduplicator {
  pendingRequests: Map<string, Promise<any>>;
  maxPendingRequests: number;

  constructor(maxPendingRequests: number = 100) {
    // Track in-flight requests to avoid duplicate calls
    this.pendingRequests = new Map(); // key -> Promise
    this.maxPendingRequests = maxPendingRequests;
  }

  /**
   * Generate a unique key for a request based on its inputs
   */
  generateKey(inputs: any): string {
    const hasher = crypto.createHash('sha1');

    // Handle different input types
    if (typeof inputs === 'string') {
      hasher.update(inputs);
    } else if (typeof inputs === 'object' && inputs !== null) {
      // Sort keys for consistent hashing
      const sorted = JSON.stringify(inputs, Object.keys(inputs).sort());
      hasher.update(sorted);
    } else {
      hasher.update(String(inputs));
    }

    return hasher.digest('hex');
  }

  /**
   * Execute a function with deduplication
   * If the same request is already in flight, return the existing promise
   */
  async deduplicate(key: string, fn: () => Promise<any>): Promise<any> {
    // If request is already in flight, return the existing promise
    if (this.pendingRequests.has(key)) {
      logger.debug('[LLM-DEDUP] Request already in flight, reusing', {
        key: key.slice(0, 8),
      });
      return this.pendingRequests.get(key);
    }

    // Check size limit and clean oldest if needed
    if (this.pendingRequests.size >= this.maxPendingRequests) {
      const firstKey = this.pendingRequests.keys().next().value;
      this.pendingRequests.delete(firstKey);
      logger.debug('[LLM-DEDUP] Cleaned oldest pending request');
    }

    // Execute the function and track the promise
    const promise = fn().finally(() => {
      // Clean up after completion
      this.pendingRequests.delete(key);
    });
    this.pendingRequests.set(key, promise);
    return promise;
  }

  /**
   * Clear all pending requests (useful for testing or reset)
   */
  clear(): void {
    this.pendingRequests.clear();
  }

  /**
   * Get statistics about pending requests
   */
  getStats(): any {
    return {
      pendingCount: this.pendingRequests.size,
      maxPending: this.maxPendingRequests,
    };
  }
}

class BatchProcessor {
  concurrencyLimit: number;
  activeCount: number;
  queue: any[];

  constructor(concurrencyLimit: number = 3) {
    this.concurrencyLimit = concurrencyLimit;
    this.activeCount = 0;
    this.queue = [];
  }

  /**
   * Process an array of items in parallel with concurrency control
   * @param items - Items to process
   * @param processFn - Async function to process each item
   * @param options - Processing options
   * @param options.concurrency - Concurrency limit
   * @param options.onProgress - Progress callback
   * @param options.stopOnError - Stop on first error
   * @param options.signal - Abort signal for cancellation
   * @returns Results array
   */
  async processBatch(items: any[], processFn: (item: any, index: number) => Promise<any>, options: any = {}): Promise<any> {
    const {
      concurrency = this.concurrencyLimit,
      onProgress = null,
      stopOnError = false,
      signal = null
    } = options;

    if (!Array.isArray(items) || items.length === 0) {
      return {
        results: [],
        errors: [],
        successful: 0,
        total: 0,
      };
    }

    logger.info('[BATCH-PROCESSOR] Starting batch processing', {
      itemCount: items.length,
      concurrency,
    });

    const results = new Array(items.length);
    const errors: any[] = [];
    let completedCount = 0;
    let isAborted = false;

    // Process items with concurrency control
    const processItem = async (index: number) => {
      if (isAborted || signal?.aborted) return;

      try {
        this.activeCount++;
        const item = items[index];

        // Check abort signal before processing
        if (signal?.aborted) {
          throw new Error('Operation cancelled');
        }

        const result = await processFn(item, index);

        if (signal?.aborted) {
           // Even if finished, if aborted, we might want to discard or mark as cancelled
           // But usually if it finished, we keep it.
           // Let's assume if processFn returns, it's done.
        }

        results[index] = result;
        completedCount++;

        if (onProgress) {
          onProgress({
            completed: completedCount,
            total: items.length,
            current: item,
            result,
          });
        }

        logger.debug('[BATCH-PROCESSOR] Item completed', {
          index,
          completed: completedCount,
          total: items.length,
        });
      } catch (error: any) {
        if (signal?.aborted || error.message === 'Operation cancelled') {
           logger.debug('[BATCH-PROCESSOR] Item cancelled', { index });
           return; // Don't count as error if cancelled
        }

        errors.push({ index, error });
        results[index] = { error: error.message, index };
        completedCount++; // Still count as processed (failed)

        logger.error('[BATCH-PROCESSOR] Item failed', {
          index,
          error: error.message,
        });

        if (stopOnError) {
          throw error;
        }
      } finally {
        this.activeCount--;
      }
    };

    // Create batches based on concurrency
    const batches: number[][] = [];
    for (let i = 0; i < items.length; i += concurrency) {
      const batchIndices: number[] = [];
      for (let j = i; j < Math.min(i + concurrency, items.length); j++) {
        batchIndices.push(j);
      }
      batches.push(batchIndices);
    }

    try {
        // Process batches sequentially, items within batch in parallel
        for (const batchIndices of batches) {
            if (signal?.aborted) {
                logger.info('[BATCH-PROCESSOR] Batch processing aborted');
                isAborted = true;
                break;
            }
            await Promise.allSettled(batchIndices.map((index) => processItem(index)));
        }
    } catch (error: any) {
        if (signal?.aborted || error.message === 'Operation cancelled') {
            logger.info('[BATCH-PROCESSOR] Batch processing aborted (caught exception)');
        } else {
            throw error;
        }
    }

    logger.info('[BATCH-PROCESSOR] Batch processing complete', {
      total: items.length,
      successful: items.length - errors.length,
      failed: errors.length,
      cancelled: signal?.aborted
    });

    return {
      results,
      errors,
      successful: items.length - errors.length,
      total: items.length,
      cancelled: !!signal?.aborted
    };
  }

  /**
   * Get current processing statistics
   */
  getStats(): any {
    return {
      activeCount: this.activeCount,
      concurrencyLimit: this.concurrencyLimit,
      queueSize: this.queue.length,
    };
  }
}

class PromptCombiner {
  /**
   * Combine multiple analysis prompts into a single LLM call
   * Useful for reducing sequential API calls
   */
  static combineAnalysisPrompts(prompts: any[], options: any = {}): any[] {
    const { maxCombined = 3, separator = '\n---\n' } = options;

    if (!Array.isArray(prompts) || prompts.length === 0) {
      return [];
    }

    // Don't combine if only one prompt
    if (prompts.length === 1) {
      return prompts;
    }

    // Group prompts by type if available
    const grouped: Record<string, any[]> = {};
    prompts.forEach((prompt, index) => {
      const type = prompt.type || 'default';
      if (!grouped[type]) {
        grouped[type] = [];
      }
      grouped[type].push({ ...prompt, originalIndex: index });
    });

    const combined: any[] = [];

    // Combine prompts of the same type
    Object.entries(grouped).forEach(([type, typePrompts]) => {
      for (let i = 0; i < typePrompts.length; i += maxCombined) {
        const batch = typePrompts.slice(i, i + maxCombined);

        if (batch.length === 1) {
          combined.push(batch[0]);
        } else {
          // Combine multiple prompts
          const combinedPrompt = {
            type,
            text: batch
              .map((p, idx) => `[Query ${idx + 1}]\n${p.text}`)
              .join(separator),
            components: batch,
            isCombined: true,
          };
          combined.push(combinedPrompt);
        }
      }
    });

    return combined;
  }

  /**
   * Split a combined response back into individual responses
   */
  static splitCombinedResponse(response: string, components: any[]): string[] {
    if (!components || components.length === 1) {
      return [response];
    }

    // Attempt to split by common delimiters
    const parts = response
      .split(/\[(?:Query|Response) \d+\]/)
      .filter((p) => p.trim());

    if (parts.length === components.length) {
      return parts.map((p) => p.trim());
    }

    // Fallback: return same response for all
    logger.warn(
      '[PROMPT-COMBINER] Could not split combined response, using same response for all',
    );
    return components.map(() => response);
  }
}

// Singleton instances for global use
const globalDeduplicator = new LLMRequestDeduplicator();
const globalBatchProcessor = new BatchProcessor(3); // Default concurrency of 3

export {
  LLMRequestDeduplicator,
  BatchProcessor,
  PromptCombiner,
  globalDeduplicator,
  globalBatchProcessor,
};

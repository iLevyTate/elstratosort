import { globalBatchProcessor } from '../utils/llmOptimization';
import { logger } from '../../shared/logger';
import * as path from 'path';
import * as os from 'os';
import { Worker } from 'worker_threads';
import { app } from 'electron';
import embeddingQueue from '../analysis/EmbeddingQueue';

logger.setContext('BatchAnalysisService');

interface WorkerWrapper {
  worker: Worker;
  taskCount: number;
  id: number;
}

interface AnalysisOptions {
  onProgress?: ((progress: any) => void) | null;
  stopOnError?: boolean;
  concurrency?: number;
}

/**
 * BatchAnalysisService
 * Processes multiple files in parallel with intelligent concurrency control
 * Reduces total processing time by analyzing files concurrently using Worker Threads
 */
class BatchAnalysisService {
  concurrency: number;
  batchProcessor: any;
  workers: WorkerWrapper[];
  idleWorkers: WorkerWrapper[];
  waitingResolvers: ((wrapper: WorkerWrapper | null) => void)[];
  workerIdCounter: number;
  MAX_TASKS_PER_WORKER: number;
  abortController: AbortController | null;

  constructor(options: any = {}) {
    // Calculate optimal concurrency based on CPU cores if not specified
    this.concurrency =
      options.concurrency || this.calculateOptimalConcurrency();
    this.batchProcessor = globalBatchProcessor;
    this.batchProcessor.concurrencyLimit = this.concurrency;
    this.workers = []; // Array of { worker: Worker, taskCount: number, id: number }
    this.idleWorkers = []; // Array of worker wrappers
    this.waitingResolvers = [];
    this.workerIdCounter = 0;
    this.MAX_TASKS_PER_WORKER = 50;
    this.abortController = null; // Track active cancellation

    logger.info('[BATCH-ANALYSIS] Service initialized', {
      concurrency: this.concurrency,
      cpuCores: os.cpus().length,
    });
  }

  /**
   * Calculate optimal concurrency based on system resources
   * @returns Optimal concurrency level
   */
  calculateOptimalConcurrency(): number {
    const cpuCores = os.cpus().length;
    const freeMem = os.freemem();
    const totalMem = os.totalmem();
    const memUsage = 1 - freeMem / totalMem;

    // Base concurrency on CPU cores (75% utilization to leave headroom)
    let concurrency = Math.max(2, Math.floor(cpuCores * 0.75));

    // Reduce if memory pressure is high (>85% usage)
    if (memUsage > 0.85) {
      concurrency = Math.max(2, Math.floor(concurrency * 0.5));
      logger.warn(
        '[BATCH-ANALYSIS] High memory usage detected, reducing concurrency',
        {
          memUsage: `${(memUsage * 100).toFixed(1)}%`,
          reducedConcurrency: concurrency,
        },
      );
    }

    // Cap at reasonable maximum to avoid overwhelming Ollama
    concurrency = Math.min(concurrency, 8);

    logger.debug('[BATCH-ANALYSIS] Calculated optimal concurrency', {
      cpuCores,
      memUsage: `${(memUsage * 100).toFixed(1)}%`,
      concurrency,
    });

    return concurrency;
  }

  /**
   * Create a new worker and return its wrapper
   */
  createWorker(): WorkerWrapper {
    const workerScript = path.resolve(__dirname, '../workers/analysisWorker.js');
    const userDataPath = app.getPath('userData');
    const logLevel = (logger as any).level;
    const logFile = (logger as any).logFile; // Pass log file path to worker
    const id = ++this.workerIdCounter;

    try {
      const worker = new Worker(workerScript, {
        workerData: { userDataPath, logLevel, logFile }
      });

      worker.on('error', (err) => {
        logger.error(`[BATCH-ANALYSIS] Worker ${id} error`, { error: err.message });
        // Worker error handling usually terminates it, so we might need to replace it
        // But for now, let's assume processFile catches errors
      });

      const wrapper: WorkerWrapper = { worker, taskCount: 0, id };
      logger.debug(`[BATCH-ANALYSIS] Created worker ${id}`);
      return wrapper;
    } catch (e: any) {
      logger.error(`[BATCH-ANALYSIS] Failed to create worker ${id}`, { error: e.message });
      throw e;
    }
  }

  /**
   * Initialize worker pool
   */
  initializeWorkers(count: number): void {
    this.terminateWorkers(); // Ensure clean slate

    logger.info(`[BATCH-ANALYSIS] Initializing ${count} workers`);

    for (let i = 0; i < count; i++) {
      try {
        const wrapper = this.createWorker();
        this.workers.push(wrapper);
        this.idleWorkers.push(wrapper);
      } catch (e) {
        // Logged in createWorker
      }
    }
  }

  /**
   * Terminate all workers
   */
  terminateWorkers(): void {
    if (this.workers.length > 0) {
      logger.info(`[BATCH-ANALYSIS] Terminating ${this.workers.length} workers`);
      this.workers.forEach(w => w.worker.terminate());
      this.workers = [];
      this.idleWorkers = [];
      this.waitingResolvers = [];
    }
  }

  /**
   * Acquire a worker from the pool, handling resource pressure
   */
  async acquireWorker(): Promise<WorkerWrapper | null> {
    // Check for memory pressure
    const freeMem = os.freemem();
    const MIN_FREE_MEM = 500 * 1024 * 1024; // 500MB

    if (freeMem < MIN_FREE_MEM) {
      logger.warn('[BATCH-ANALYSIS] Low memory detected, pausing for 2s', {
        free: `${Math.round(freeMem / 1024 / 1024)}MB`
      });
      // Simple backoff
      await new Promise(resolve => setTimeout(resolve, 2000));
    }

    if (this.idleWorkers.length > 0) {
      return this.idleWorkers.pop()!;
    }

    // Wait for a worker to become available
    return new Promise(resolve => {
      this.waitingResolvers.push(resolve);
    });
  }

  /**
   * Release a worker back to the pool, recycling if needed
   * HIGH PRIORITY FIX: Fixed race condition where waiting resolvers could get stale worker reference
   */
  releaseWorker(wrapper: WorkerWrapper): void {
    // Increment task count
    wrapper.taskCount++;

    // Check if worker needs recycling
    if (wrapper.taskCount >= this.MAX_TASKS_PER_WORKER) {
      logger.info(`[BATCH-ANALYSIS] Recycling worker ${wrapper.id} after ${wrapper.taskCount} tasks`);
      wrapper.worker.terminate();

      // Remove old wrapper from workers list
      const index = this.workers.indexOf(wrapper);
      if (index !== -1) {
        this.workers.splice(index, 1);
      }

      // Create new replacement - CRITICAL: Use new reference for resolvers
      let newWrapper: WorkerWrapper | null = null;
      try {
        newWrapper = this.createWorker();
        this.workers.push(newWrapper);
      } catch (e: any) {
        logger.error('[BATCH-ANALYSIS] Failed to recycle worker', { error: e.message });
        // HIGH PRIORITY FIX: Resolve waiting resolvers with error to prevent deadlock
        if (this.waitingResolvers.length > 0) {
          const resolve = this.waitingResolvers.shift()!;
          // Return null to signal worker creation failed - caller should handle gracefully
          resolve(null);
        }
        return;
      }

      // Use new worker reference for waiting resolver
      if (this.waitingResolvers.length > 0) {
        const resolve = this.waitingResolvers.shift()!;
        resolve(newWrapper);
      } else {
        this.idleWorkers.push(newWrapper);
      }
      return; // Don't fall through to default handling with old wrapper
    }

    if (this.waitingResolvers.length > 0) {
      const resolve = this.waitingResolvers.shift()!;
      resolve(wrapper);
    } else {
      this.idleWorkers.push(wrapper);
    }
  }

  /**
   * Run a task on a worker
   */
  async runOnWorker(wrapper: WorkerWrapper, filePath: string, smartFolders: any[]): Promise<any> {
    return new Promise((resolve, reject) => {
      const id = Math.random().toString(36).substring(7);
      const worker = wrapper.worker;

      const messageHandler = (message: any) => {
        if (message.id === id && (message.type === 'result' || message.type === 'error')) {
          cleanup();
          if (message.success) {
            resolve(message);
          } else {
            reject(message.error || new Error('Worker reported failure'));
          }
        }
      };

      const errorHandler = (err: Error) => {
        cleanup();
        reject(err);
      };

      const cleanup = () => {
        worker.off('message', messageHandler);
        worker.off('error', errorHandler);
      };

      worker.on('message', messageHandler);
      worker.on('error', errorHandler);

      worker.postMessage({
        type: 'analyze',
        id,
        filePath,
        smartFolders
      });
    });
  }

  /**
   * Cancel current batch analysis
   */
  cancel(): boolean {
    if (this.abortController) {
      logger.info('[BATCH-ANALYSIS] Cancelling active batch...');
      this.abortController.abort();
      this.abortController = null;

      // Forcefully terminate all workers to stop processing immediately
      this.terminateWorkers();
      return true;
    }
    return false;
  }

  /**
   * Analyze multiple files in parallel using worker threads
   * @param filePaths - Array of file paths to analyze
   * @param smartFolders - Smart folders for categorization
   * @param options - Processing options
   * @returns Results with success/error details
   */
  async analyzeFiles(filePaths: string[], smartFolders: any[] = [], options: AnalysisOptions = {}): Promise<any> {
    // Reset abort controller for new batch
    if (this.abortController) {
       this.cancel(); // Cancel any previous running batch
    }
    this.abortController = new AbortController();

    const {
      onProgress = null,
      stopOnError = false,
      concurrency = this.concurrency,
    } = options;

    if (!Array.isArray(filePaths) || filePaths.length === 0) {
      return {
        success: true,
        results: [],
        errors: [],
        total: 0,
      };
    }

    logger.info('[BATCH-ANALYSIS] Starting batch file analysis (Worker Threads)', {
      fileCount: filePaths.length,
      concurrency,
      smartFolders: smartFolders.length,
    });

    const startTime = Date.now();

    // Initialize workers
    this.initializeWorkers(concurrency);

    // Process each file
    const processFile = async (filePath: string, index: number) => {
      // Check cancellation before starting item
      if (this.abortController?.signal.aborted) {
        throw new Error('Operation cancelled');
      }

      let wrapper: WorkerWrapper | null = null;
      try {
        logger.debug('[BATCH-ANALYSIS] Waiting for worker', { index, path: filePath });
        wrapper = await this.acquireWorker();

        // Check again after acquiring
        if (this.abortController?.signal.aborted) {
           throw new Error('Operation cancelled');
        }

        if (!wrapper) {
          throw new Error('Failed to acquire worker');
        }

        logger.debug('[BATCH-ANALYSIS] Processing file on worker', {
          index,
          path: filePath,
          workerId: wrapper.id
        });

        const workerResponse = await this.runOnWorker(wrapper, filePath, smartFolders);

        // Handle embeddings returned from worker
        if (workerResponse.embeddings && Array.isArray(workerResponse.embeddings)) {
          for (const item of workerResponse.embeddings) {
            await embeddingQueue.enqueue(item);
          }
        }

        return {
          filePath,
          success: true,
          result: workerResponse.result,
          type: 'unknown', // Worker could return type if needed, but result usually has category
        };
      } catch (error: any) {
        // If cancelled, rethrow to be caught by batch processor
        if (error.message === 'Operation cancelled') throw error;

        // Map structured error if available
        const errorMsg = error.message || String(error);
        const errorCode = error.code || 'UNKNOWN_ERROR';

        logger.error('[BATCH-ANALYSIS] File analysis failed', {
          index,
          path: filePath,
          error: errorMsg,
          code: errorCode
        });

        return {
          filePath,
          success: false,
          error: errorMsg,
          errorCode,
          result: null,
        };
      } finally {
        if (wrapper) {
          this.releaseWorker(wrapper);
        }
      }
    };

    try {
      // Use batch processor for parallel processing logic (queue management)
      const batchResult = await this.batchProcessor.processBatch(
        filePaths,
        processFile,
        {
          concurrency,
          onProgress,
          stopOnError,
          signal: this.abortController.signal
        },
      );

      const duration = Date.now() - startTime;
      const avgTime = duration / filePaths.length;

      // Flush any remaining embeddings in queue after batch analysis completes
      try {
        await embeddingQueue.flush();
      } catch (error: any) {
        // Non-fatal - log but don't fail batch
        logger.warn('[BATCH-ANALYSIS] Error flushing embedding queues', {
          error: error.message,
        });
      }

      logger.info('[BATCH-ANALYSIS] Batch analysis complete', {
        total: filePaths.length,
        successful: batchResult.successful,
        failed: batchResult.errors.length,
        duration: `${duration}ms`,
        avgPerFile: `${Math.round(avgTime)}ms`,
        speedup: `${Math.round(filePaths.length / (duration / 1000))} files/sec`,
        cancelled: batchResult.cancelled
      });

      return {
        success: batchResult.errors.length === 0 && !batchResult.cancelled,
        results: batchResult.results,
        errors: batchResult.errors,
        total: filePaths.length,
        successful: batchResult.successful,
        cancelled: batchResult.cancelled,
        stats: {
          totalDuration: duration,
          avgPerFile: avgTime,
          filesPerSecond: filePaths.length / (duration / 1000),
        },
      };
    } finally {
      // Clean up workers
      this.terminateWorkers();
      this.abortController = null;
    }
  }

  /**
   * Analyze files grouped by type for better caching
   * Groups similar files together to maximize cache hits
   */
  async analyzeFilesGrouped(filePaths: string[], smartFolders: any[] = [], options: AnalysisOptions = {}): Promise<any> {
    // Group files by extension for better caching
    const groups = this.groupFilesByType(filePaths);

    logger.info('[BATCH-ANALYSIS] Analyzing files in groups', {
      totalFiles: filePaths.length,
      groups: Object.keys(groups).length,
    });

    const allResults: any = {
      results: [],
      errors: [],
      successful: 0,
      total: filePaths.length,
    };

    // Process each group
    for (const [type, files] of Object.entries(groups)) {
      logger.info(`[BATCH-ANALYSIS] Processing ${type} group`, {
        count: files.length,
      });

      const groupResult = await this.analyzeFiles(files, smartFolders, options);

      // Merge results
      allResults.results.push(...groupResult.results);
      allResults.errors.push(...groupResult.errors);
      allResults.successful += groupResult.successful;
    }

    return {
      success: allResults.errors.length === 0,
      ...allResults,
    };
  }

  /**
   * Group files by extension type
   */
  groupFilesByType(filePaths: string[]): Record<string, string[]> {
    const groups: Record<string, string[]> = {};

    filePaths.forEach((filePath) => {
      const ext = path.extname(filePath).toLowerCase();
      const type = this.getFileType(ext);

      if (!groups[type]) {
        groups[type] = [];
      }
      groups[type].push(filePath);
    });

    return groups;
  }

  /**
   * Get file type category
   */
  getFileType(extension: string): string {
    const imageExtensions = [
      '.jpg',
      '.jpeg',
      '.png',
      '.gif',
      '.bmp',
      '.webp',
      '.svg',
      '.tiff',
      '.tif',
    ];
    const documentExtensions = ['.pdf', '.doc', '.docx', '.txt', '.rtf'];
    const spreadsheetExtensions = ['.xlsx', '.xls', '.csv'];
    const presentationExtensions = ['.pptx', '.ppt'];

    if (imageExtensions.includes(extension)) return 'image';
    if (documentExtensions.includes(extension)) return 'document';
    if (spreadsheetExtensions.includes(extension)) return 'spreadsheet';
    if (presentationExtensions.includes(extension)) return 'presentation';

    return 'other';
  }

  /**
   * Check if file is an image
   */
  isImageFile(extension: string): boolean {
    const imageExtensions = [
      '.jpg',
      '.jpeg',
      '.png',
      '.gif',
      '.bmp',
      '.webp',
      '.svg',
      '.tiff',
      '.tif',
    ];
    return imageExtensions.includes(extension.toLowerCase());
  }

  /**
   * Set concurrency level
   */
  setConcurrency(concurrency: number): void {
    this.concurrency = Math.max(1, Math.min(concurrency, 10)); // Limit 1-10
    this.batchProcessor.concurrencyLimit = this.concurrency;
    logger.info('[BATCH-ANALYSIS] Concurrency updated', {
      concurrency: this.concurrency,
    });
  }

  /**
   * Cleanup and release resources
   */
  cleanup(): void {
    this.terminateWorkers();
  }

  /**
   * Get current processing statistics
   */
  getStats(): any {
    return {
      concurrency: this.concurrency,
      activeWorkers: this.workers.length - this.idleWorkers.length,
      totalWorkers: this.workers.length,
      workerRestarts: Math.max(0, this.workerIdCounter - this.workers.length),
      ...this.batchProcessor.getStats(),
    };
  }

  /**
   * Health check for service monitoring
   * @returns True if service is healthy
   */
  async healthCheck(): Promise<boolean> {
    try {
      // Check worker pool health
      if (this.workers.length === 0 && this.concurrency > 0) {
        logger.warn('[BatchAnalysisService] Health check warning: no workers initialized');
        // This is OK - workers are created on-demand
      }

      // Check for memory pressure
      const freeMem = os.freemem();
      const totalMem = os.totalmem();
      const memUsage = 1 - freeMem / totalMem;
      const MIN_FREE_MEM = 200 * 1024 * 1024; // 200MB minimum

      if (freeMem < MIN_FREE_MEM) {
        logger.warn('[BatchAnalysisService] Health check warning: low memory', {
          free: `${Math.round(freeMem / 1024 / 1024)}MB`,
          memUsage: `${(memUsage * 100).toFixed(1)}%`,
        });
        // Warning but not a failure
      }

      // Check batch processor state
      if (!this.batchProcessor) {
        logger.error('[BatchAnalysisService] Health check failed: no batch processor');
        return false;
      }

      // Check if embedding queue is available
      if (!embeddingQueue) {
        logger.warn('[BatchAnalysisService] Health check warning: no embedding queue');
        // This is a warning, not a failure
      }

      logger.debug('[BatchAnalysisService] Health check passed', {
        concurrency: this.concurrency,
        workers: this.workers.length,
        idleWorkers: this.idleWorkers.length,
        memUsage: `${(memUsage * 100).toFixed(1)}%`,
      });
      return true;
    } catch (error: any) {
      logger.error('[BatchAnalysisService] Health check error', {
        error: error.message,
        stack: error.stack,
      });
      return false;
    }
  }

  /**
   * Get service state for monitoring
   * @returns Service state information
   */
  getState(): any {
    const freeMem = os.freemem();
    const totalMem = os.totalmem();
    const memUsage = 1 - freeMem / totalMem;

    return {
      concurrency: this.concurrency,
      workers: {
        total: this.workers.length,
        idle: this.idleWorkers.length,
        active: this.workers.length - this.idleWorkers.length,
        waitingTasks: this.waitingResolvers.length,
        totalCreated: this.workerIdCounter,
      },
      system: {
        cpuCores: os.cpus().length,
        freeMemMB: Math.round(freeMem / 1024 / 1024),
        totalMemMB: Math.round(totalMem / 1024 / 1024),
        memUsagePercent: (memUsage * 100).toFixed(1),
      },
      isProcessing: !!this.abortController,
    };
  }
}

export default BatchAnalysisService;

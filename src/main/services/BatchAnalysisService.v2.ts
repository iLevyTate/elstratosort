/**
 * BatchAnalysisService (v2) - Refactored to use WorkerPool
 * Processes multiple files in parallel with intelligent concurrency control
 * Uses the new WorkerPool for better resource management
 */

import { logger } from '../../shared/logger';
import * as path from 'path';
import * as os from 'os';
import { app } from 'electron';
import embeddingQueue from '../analysis/EmbeddingQueue';
import WorkerPool from '../core/WorkerPool';

logger.setContext('BatchAnalysisService');

// Interfaces for type safety
interface BatchAnalysisOptions {
  concurrency?: number;
  onProgress?: ((progress: ProgressInfo) => void) | null;
  stopOnError?: boolean;
}

interface ProgressInfo {
  current: number;
  total: number;
  currentFile: string;
}

interface AnalysisResult {
  filePath: string;
  success: boolean;
  result?: any;
}

interface AnalysisError {
  filePath: string;
  error: string;
  errorCode: string;
}

interface BatchResult {
  success: boolean;
  results: AnalysisResult[];
  errors: AnalysisError[];
  total: number;
  successful: number;
  cancelled?: boolean;
  stats?: {
    totalDuration: number;
    avgPerFile: number;
    filesPerSecond: number;
  };
}

interface WorkerTaskData {
  type: 'analyze';
  filePath: string;
  smartFolders: any[];
}

interface WorkerResponse {
  result: any;
  embeddings?: Array<any>;
}

interface EmbeddingQueueItem {
  [key: string]: any;
}

interface SystemStats {
  concurrency: number;
  system: {
    cpuCores: number;
    freeMemMB: number;
    totalMemMB: number;
    memUsagePercent: string;
  };
  isProcessing: boolean;
  [key: string]: any;
}

interface FileGroups {
  [type: string]: string[];
}

class BatchAnalysisService {
  private concurrency: number;
  private abortController: AbortController | null;
  private workerPool: WorkerPool;

  constructor(options: BatchAnalysisOptions = {}) {
    // Calculate optimal concurrency based on CPU cores if not specified
    this.concurrency = options.concurrency || this.calculateOptimalConcurrency();
    this.abortController = null; // Track active cancellation

    // Create worker pool
    const workerScript = path.resolve(__dirname, '../workers/analysisWorker.js');
    const userDataPath = app.getPath('userData');
    const logLevel = (logger as any).level;
    const logFile = (logger as any).logFile;

    this.workerPool = new WorkerPool(workerScript, {
      minWorkers: 0, // Start with no workers (lazy)
      maxWorkers: this.concurrency,
      maxTasksPerWorker: 50,
      workerData: { userDataPath, logLevel, logFile },
      idleTimeout: 60000, // Terminate idle workers after 1 minute
      memoryThreshold: 500 * 1024 * 1024, // 500MB
    });

    // Listen to pool events for logging
    this.workerPool.on('worker:created', ({ workerId }: { workerId: number }) => {
      logger.debug(`[BATCH-ANALYSIS] Worker ${workerId} created`);
    });

    this.workerPool.on('worker:recycled', ({ workerId }: { workerId: number }) => {
      logger.info(`[BATCH-ANALYSIS] Worker ${workerId} recycled`);
    });

    this.workerPool.on('worker:terminated', ({ workerId, reason }: { workerId: number; reason: string }) => {
      logger.debug(`[BATCH-ANALYSIS] Worker ${workerId} terminated`, { reason });
    });

    this.workerPool.on('worker:error', ({ workerId, error }: { workerId: number; error: Error }) => {
      logger.error(`[BATCH-ANALYSIS] Worker ${workerId} error`, {
        error: error.message,
      });
    });

    logger.info('[BATCH-ANALYSIS] Service initialized with WorkerPool', {
      concurrency: this.concurrency,
      cpuCores: os.cpus().length,
    });
  }

  /**
   * Calculate optimal concurrency based on system resources
   * @returns {number} Optimal concurrency level
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
   * Cancel current batch analysis
   */
  cancel(): boolean {
    if (this.abortController) {
      logger.info('[BATCH-ANALYSIS] Cancelling active batch...');
      this.abortController.abort();
      this.abortController = null;
      return true;
    }
    return false;
  }

  /**
   * Analyze multiple files in parallel using worker pool
   * @param {Array} filePaths - Array of file paths to analyze
   * @param {Array} smartFolders - Smart folders for categorization
   * @param {Object} options - Processing options
   * @returns {Promise<Object>} Results with success/error details
   */
  async analyzeFiles(
    filePaths: string[],
    smartFolders: any[] = [],
    options: BatchAnalysisOptions = {}
  ): Promise<BatchResult> {
    // Reset abort controller for new batch
    if (this.abortController) {
      this.cancel(); // Cancel any previous running batch
    }
    this.abortController = new AbortController();

    const { onProgress = null, stopOnError = false } = options;

    if (!Array.isArray(filePaths) || filePaths.length === 0) {
      return {
        success: true,
        results: [],
        errors: [],
        total: 0,
        successful: 0,
      };
    }

    logger.info('[BATCH-ANALYSIS] Starting batch file analysis', {
      fileCount: filePaths.length,
      concurrency: this.concurrency,
      smartFolders: smartFolders.length,
    });

    const startTime = Date.now();
    const results: AnalysisResult[] = [];
    const errors: AnalysisError[] = [];
    let processed = 0;

    // Process files concurrently using worker pool
    const processTasks = filePaths.map((filePath, index) => async () => {
      // Check cancellation before starting
      if (this.abortController?.signal.aborted) {
        throw new Error('Operation cancelled');
      }

      try {
        // Execute task on worker pool
        const taskData: WorkerTaskData = {
          type: 'analyze',
          filePath,
          smartFolders,
        };

        const workerResponse = await this.workerPool.execute(taskData, 60000) as WorkerResponse; // 60s timeout

        // Handle embeddings returned from worker
        if (workerResponse.embeddings && Array.isArray(workerResponse.embeddings)) {
          for (const item of workerResponse.embeddings) {
            await (embeddingQueue as any).enqueue(item as EmbeddingQueueItem);
          }
        }

        results.push({
          filePath,
          success: true,
          result: workerResponse.result,
        });
      } catch (error: any) {
        // If cancelled, rethrow to stop processing
        if (error.message === 'Operation cancelled') {
          throw error;
        }

        const errorMsg = error.message || String(error);
        const errorCode = error.code || 'UNKNOWN_ERROR';

        logger.error('[BATCH-ANALYSIS] File analysis failed', {
          index,
          path: filePath,
          error: errorMsg,
          code: errorCode,
        });

        errors.push({
          filePath,
          error: errorMsg,
          errorCode,
        });

        if (stopOnError) {
          throw error;
        }
      } finally {
        processed++;

        // Report progress
        if (onProgress) {
          onProgress({
            current: processed,
            total: filePaths.length,
            currentFile: filePath,
          });
        }
      }
    });

    // Execute all tasks
    try {
      await Promise.all(processTasks.map((task) => task()));
    } catch (error: any) {
      if (error.message === 'Operation cancelled') {
        logger.warn('[BATCH-ANALYSIS] Batch cancelled by user');
      } else {
        logger.error('[BATCH-ANALYSIS] Batch processing error', {
          error: error.message,
        });
      }
    }

    const duration = Date.now() - startTime;
    const avgTime = duration / filePaths.length;

    // Flush any remaining embeddings in queue
    try {
      await (embeddingQueue as any).flush();
    } catch (error: any) {
      logger.warn('[BATCH-ANALYSIS] Error flushing embedding queues', {
        error: error.message,
      });
    }

    logger.info('[BATCH-ANALYSIS] Batch analysis complete', {
      total: filePaths.length,
      successful: results.length,
      failed: errors.length,
      duration: `${duration}ms`,
      avgPerFile: `${Math.round(avgTime)}ms`,
      speedup: `${Math.round(filePaths.length / (duration / 1000))} files/sec`,
    });

    return {
      success: errors.length === 0 && !this.abortController?.signal.aborted,
      results,
      errors,
      total: filePaths.length,
      successful: results.length,
      cancelled: this.abortController?.signal.aborted,
      stats: {
        totalDuration: duration,
        avgPerFile: avgTime,
        filesPerSecond: filePaths.length / (duration / 1000),
      },
    };
  }

  /**
   * Analyze files grouped by type for better caching
   * Groups similar files together to maximize cache hits
   */
  async analyzeFilesGrouped(
    filePaths: string[],
    smartFolders: any[] = [],
    options: BatchAnalysisOptions = {}
  ): Promise<BatchResult> {
    // Group files by extension for better caching
    const groups = this.groupFilesByType(filePaths);

    logger.info('[BATCH-ANALYSIS] Analyzing files in groups', {
      totalFiles: filePaths.length,
      groups: Object.keys(groups).length,
    });

    const allResults = {
      results: [] as AnalysisResult[],
      errors: [] as AnalysisError[],
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
  groupFilesByType(filePaths: string[]): FileGroups {
    const groups: FileGroups = {};

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
    logger.info('[BATCH-ANALYSIS] Concurrency updated', {
      concurrency: this.concurrency,
    });
    // Note: WorkerPool maxWorkers is set at construction time
    // Would need to recreate pool to change max workers
  }

  /**
   * Cleanup and release resources
   */
  async cleanup(): Promise<void> {
    await this.workerPool.shutdown();
  }

  /**
   * Get current processing statistics
   */
  getStats(): SystemStats {
    const poolStats = this.workerPool.getStats();
    const freeMem = os.freemem();
    const totalMem = os.totalmem();
    const memUsage = 1 - freeMem / totalMem;

    return {
      concurrency: this.concurrency,
      ...poolStats,
      system: {
        cpuCores: os.cpus().length,
        freeMemMB: Math.round(freeMem / 1024 / 1024),
        totalMemMB: Math.round(totalMem / 1024 / 1024),
        memUsagePercent: (memUsage * 100).toFixed(1),
      },
      isProcessing: !!this.abortController,
    };
  }

  /**
   * Health check for service monitoring
   * @returns {Promise<boolean>} True if service is healthy
   */
  async healthCheck(): Promise<boolean> {
    try {
      // Check worker pool is available
      if (!this.workerPool) {
        logger.error('[BatchAnalysisService] Health check failed: no worker pool');
        return false;
      }

      // Check for memory pressure
      const freeMem = os.freemem();
      const MIN_FREE_MEM = 200 * 1024 * 1024; // 200MB minimum

      if (freeMem < MIN_FREE_MEM) {
        logger.warn('[BatchAnalysisService] Health check warning: low memory', {
          free: `${Math.round(freeMem / 1024 / 1024)}MB`,
        });
        // Warning but not a failure
      }

      // Check if embedding queue is available
      if (!embeddingQueue) {
        logger.warn('[BatchAnalysisService] Health check warning: no embedding queue');
        // This is a warning, not a failure
      }

      const stats = this.getStats();
      logger.debug('[BatchAnalysisService] Health check passed', stats);
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
   * @returns {Object} Service state information
   */
  getState(): SystemStats {
    return this.getStats();
  }
}

export default BatchAnalysisService;

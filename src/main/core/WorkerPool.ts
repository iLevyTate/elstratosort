/**
 * WorkerPool - Manages a pool of worker threads with automatic recycling
 * Features:
 * - Dynamic worker creation and recycling
 * - Task queue management
 * - Memory pressure handling
 * - Automatic worker cleanup after N tasks
 * - Graceful shutdown
 */
import { Worker } from 'worker_threads';
import os from 'os';
import { logger } from '../../shared/logger';
import { EventEmitter } from 'events';

logger.setContext('WorkerPool');

class WorkerPool extends EventEmitter {
  workerScriptPath: any;
  minWorkers: any;
  maxWorkers: any;
  maxTasksPerWorker: any;
  workerData: any;
  idleTimeout: any;
  memoryThreshold: any;
  workers: any;
  idleWorkers: any;
  taskQueue: any;
  nextWorkerId: any;
  isShuttingDown: any;
  stats: any;

  constructor(workerScriptPath, options: any = {}) {
    super();
    this.workerScriptPath = workerScriptPath;
    this.minWorkers = options.minWorkers || 0;
    this.maxWorkers = options.maxWorkers || this._calculateOptimalWorkerCount();
    this.maxTasksPerWorker = options.maxTasksPerWorker || 50;
    this.workerData = options.workerData || {};
    this.idleTimeout = options.idleTimeout || 60000; // 1 minute default
    this.memoryThreshold = options.memoryThreshold || 500 * 1024 * 1024; // 500MB

    // Worker management
    this.workers = new Map(); // workerId -> WorkerInfo
    this.idleWorkers = []; // Array of idle worker IDs
    this.taskQueue = []; // Pending tasks waiting for workers
    this.nextWorkerId = 1;
    this.isShuttingDown = false;

    // Statistics
    this.stats = {
      tasksCompleted: 0,
      tasksErrored: 0,
      workersCreated: 0,
      workersRecycled: 0,
      workersTerminated: 0,
      currentTasks: 0,
    };

    logger.info('[WorkerPool] Initialized', {
      script: workerScriptPath,
      minWorkers: this.minWorkers,
      maxWorkers: this.maxWorkers,
      maxTasksPerWorker: this.maxTasksPerWorker,
    });

    // Initialize minimum workers if specified
    if (this.minWorkers > 0) {
      this._ensureMinimumWorkers();
    }
  }

  /**
   * Calculate optimal worker count based on CPU cores
   * @private
   */
  _calculateOptimalWorkerCount() {
    const cpuCores = os.cpus().length;
    return Math.min(Math.max(2, Math.floor(cpuCores * 0.75)), 8);
  }

  /**
   * Ensure minimum number of workers are available
   * @private
   */
  async _ensureMinimumWorkers() {
    const currentCount = this.workers.size;
    const needed = this.minWorkers - currentCount;

    for (let i = 0; i < needed; i++) {
      await this._createWorker();
    }
  }

  /**
   * Create a new worker
   * @returns {Promise<number>} Worker ID
   * @private
   */
  async _createWorker() {
    if (this.isShuttingDown) {
      throw new Error('Worker pool is shutting down');
    }
    if (this.workers.size >= this.maxWorkers) {
      throw new Error(`Maximum worker limit reached (${this.maxWorkers})`);
    }
    const workerId = this.nextWorkerId++;
    const worker = new Worker(this.workerScriptPath, {
      workerData: this.workerData,
    } as any);

    const workerInfo = {
      id: workerId,
      worker,
      tasksCompleted: 0,
      currentTask: null,
      createdAt: Date.now(),
      lastActiveAt: Date.now(),
      idleTimer: null,
    };

    // Set up worker event handlers
    worker.on('error', (error) => {
      logger.error(`[WorkerPool] Worker ${workerId} error`, {
        error: error.message,
        stack: error.stack,
      });
      this._handleWorkerError(workerId, error);
    });

    worker.on('exit', (code) => {
      logger.debug(`[WorkerPool] Worker ${workerId} exited`, { code });
      this._handleWorkerExit(workerId, code);
    });
    this.workers.set(workerId, workerInfo);
    this.idleWorkers.push(workerId);
    this.stats.workersCreated++;

    logger.debug(`[WorkerPool] Created worker ${workerId}`, {
      totalWorkers: this.workers.size,
    });
    this.emit('worker:created', { workerId });

    // Start idle timeout
    this._startIdleTimeout(workerId);

    return workerId;
  }

  /**
   * Start idle timeout for a worker
   * @private
   */
  _startIdleTimeout(workerId) {
    const workerInfo = this.workers.get(workerId);
    if (!workerInfo || this.minWorkers >= this.workers.size) {
      return; // Don't timeout if we're at minimum workers
    }

    // Clear existing timer
    if (workerInfo.idleTimer) {
      clearTimeout(workerInfo.idleTimer);
    }

    // Set new timer
    workerInfo.idleTimer = setTimeout(() => {
      this._terminateIdleWorker(workerId);
    }, this.idleTimeout);
  }

  /**
   * Terminate an idle worker
   * @private
   */
  async _terminateIdleWorker(workerId) {
    const workerInfo = this.workers.get(workerId);
    if (!workerInfo || workerInfo.currentTask) {
      return; // Worker is busy or already gone
    }

    logger.debug(`[WorkerPool] Terminating idle worker ${workerId}`);

    // Remove from idle list
    const idleIndex = this.idleWorkers.indexOf(workerId);
    if (idleIndex !== -1) {
      this.idleWorkers.splice(idleIndex, 1);
    }

    // Terminate worker
    await workerInfo.worker.terminate();
    this.workers.delete(workerId);
    this.stats.workersTerminated++;
    this.emit('worker:terminated', { workerId, reason: 'idle' });
  }

  /**
   * Handle worker errors
   * @private
   */
  _handleWorkerError(workerId, error) {
    const workerInfo = this.workers.get(workerId);
    if (!workerInfo) return;

    // If worker has a current task, reject it
    if (workerInfo.currentTask) {
      workerInfo.currentTask.reject(error);
      workerInfo.currentTask = null;
      this.stats.currentTasks--;
      this.stats.tasksErrored++;
    }

    // Remove worker
    this.workers.delete(workerId);
    const idleIndex = this.idleWorkers.indexOf(workerId);
    if (idleIndex !== -1) {
      this.idleWorkers.splice(idleIndex, 1);
    }
    this.emit('worker:error', { workerId, error });

    // Process next queued task if any
    this._processNextTask();
  }

  /**
   * Handle worker exit
   * @private
   */
  _handleWorkerExit(workerId, code) {
    const workerInfo = this.workers.get(workerId);
    if (!workerInfo) return;

    // If worker has a current task and exited abnormally, reject it
    if (workerInfo.currentTask && code !== 0) {
      workerInfo.currentTask.reject(new Error(`Worker exited with code ${code}`));
      workerInfo.currentTask = null;
      this.stats.currentTasks--;
      this.stats.tasksErrored++;
    }

    // Clean up
    if (workerInfo.idleTimer) {
      clearTimeout(workerInfo.idleTimer);
    }
    this.workers.delete(workerId);
    const idleIndex = this.idleWorkers.indexOf(workerId);
    if (idleIndex !== -1) {
      this.idleWorkers.splice(idleIndex, 1);
    }
    this.emit('worker:exit', { workerId, code });

    // Ensure minimum workers if not shutting down
    if (!this.isShuttingDown && this.workers.size < this.minWorkers) {
      this._ensureMinimumWorkers();
    }
  }

  /**
   * Check if worker needs recycling
   * @private
   */
  _shouldRecycleWorker(workerId) {
    const workerInfo = this.workers.get(workerId);
    if (!workerInfo) return false;
    return workerInfo.tasksCompleted >= this.maxTasksPerWorker;
  }

  /**
   * Recycle a worker (terminate and create new one)
   * @private
   */
  async _recycleWorker(workerId) {
    const workerInfo = this.workers.get(workerId);
    if (!workerInfo) return;

    logger.debug(`[WorkerPool] Recycling worker ${workerId}`, {
      tasksCompleted: workerInfo.tasksCompleted,
    });

    // Remove from tracking
    this.workers.delete(workerId);
    const idleIndex = this.idleWorkers.indexOf(workerId);
    if (idleIndex !== -1) {
      this.idleWorkers.splice(idleIndex, 1);
    }

    // Terminate old worker
    if (workerInfo.idleTimer) {
      clearTimeout(workerInfo.idleTimer);
    }
    await workerInfo.worker.terminate();
    this.stats.workersRecycled++;
    this.emit('worker:recycled', { workerId });

    // Create new worker to replace it
    await this._createWorker();
  }

  /**
   * Check memory pressure
   * @returns {boolean} True if under memory pressure
   * @private
   */
  _checkMemoryPressure() {
    const freeMem = os.freemem();
    if (freeMem < this.memoryThreshold) {
      logger.warn('[WorkerPool] Memory pressure detected', {
        free: `${Math.round(freeMem / 1024 / 1024)}MB`,
        threshold: `${Math.round(this.memoryThreshold / 1024 / 1024)}MB`,
      });
      return true;
    }
    return false;
  }

  /**
   * Execute a task on a worker
   * @param {any} taskData - Data to send to worker
   * @param {number} timeout - Task timeout in ms (optional)
   * @returns {Promise<any>} Task result
   */
  async execute(taskData, timeout = 0) {
    if (this.isShuttingDown) {
      throw new Error('Worker pool is shutting down');
    }

    // Check memory pressure
    if (this._checkMemoryPressure()) {
      // Wait a bit before proceeding
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }

    return new Promise((resolve, reject) => {
      const task = {
        data: taskData,
        resolve,
        reject,
        createdAt: Date.now(),
        timeout,
      };
      this.taskQueue.push(task);
      this._processNextTask();
    });
  }

  /**
   * Process the next queued task
   * @private
   */
  async _processNextTask() {
    if (this.taskQueue.length === 0 || this.isShuttingDown) {
      return;
    }

    // Try to get an idle worker
    let workerId = this.idleWorkers.shift();

    // If no idle workers, try to create one
    if (workerId === undefined && this.workers.size < this.maxWorkers) {
      try {
        workerId = await this._createWorker();
        // Remove from idle list since we're about to use it
        const idx = this.idleWorkers.indexOf(workerId);
        if (idx !== -1) {
          this.idleWorkers.splice(idx, 1);
        }
      } catch (error) {
        logger.error('[WorkerPool] Failed to create worker', {
          error: error.message,
        });
        // Task remains in queue, will retry
        return;
      }
    }

    // If still no worker available, wait
    if (workerId === undefined) {
      return; // Task remains in queue
    }
    const workerInfo = this.workers.get(workerId);
    if (!workerInfo) {
      // Worker disappeared, retry
      this._processNextTask();
      return;
    }
    const task = this.taskQueue.shift();
    if (!task) {
      // No task, put worker back
      this.idleWorkers.push(workerId);
      this._startIdleTimeout(workerId);
      return;
    }

    // Clear idle timeout
    if (workerInfo.idleTimer) {
      clearTimeout(workerInfo.idleTimer);
      workerInfo.idleTimer = null;
    }

    workerInfo.currentTask = task;
    workerInfo.lastActiveAt = Date.now();
    this.stats.currentTasks++;

    // Set up timeout if specified
    let timeoutHandle = null;
    if (task.timeout > 0) {
      timeoutHandle = setTimeout(() => {
        task.reject(new Error(`Task timeout after ${task.timeout}ms`));
        this._releaseWorker(workerId, false);
      }, task.timeout);
    }

    // Set up message handler for this task
    const messageHandler = (message) => {
      if (timeoutHandle) clearTimeout(timeoutHandle);

      workerInfo.worker.off('message', messageHandler);
      workerInfo.currentTask = null;
      workerInfo.tasksCompleted++;
      this.stats.currentTasks--;
      this.stats.tasksCompleted++;

      task.resolve(message);
      this._releaseWorker(workerId, true);
    };

    workerInfo.worker.on('message', messageHandler);

    // Send task to worker
    try {
      workerInfo.worker.postMessage(task.data);
    } catch (error) {
      if (timeoutHandle) clearTimeout(timeoutHandle);
      workerInfo.worker.off('message', messageHandler);
      workerInfo.currentTask = null;
      this.stats.currentTasks--;
      this.stats.tasksErrored++;
      task.reject(error);
      this._releaseWorker(workerId, false);
    }
  }

  /**
   * Release a worker back to the pool
   * @private
   */
  // eslint-disable-next-line no-unused-vars
  async _releaseWorker(workerId, _success) {
    const workerInfo = this.workers.get(workerId);
    if (!workerInfo) return;

    // Check if worker needs recycling
    if (this._shouldRecycleWorker(workerId)) {
      await this._recycleWorker(workerId);
    } else {
      // Put worker back in idle pool
      this.idleWorkers.push(workerId);
      this._startIdleTimeout(workerId);
    }

    // Process next task
    this._processNextTask();
  }

  /**
   * Get pool statistics
   * @returns {Object} Statistics
   */
  getStats() {
    return {
      ...this.stats,
      totalWorkers: this.workers.size,
      idleWorkers: this.idleWorkers.length,
      busyWorkers: this.workers.size - this.idleWorkers.length,
      queuedTasks: this.taskQueue.length,
      maxWorkers: this.maxWorkers,
      minWorkers: this.minWorkers,
    };
  }

  /**
   * Gracefully shutdown the pool
   * @returns {Promise<void>}
   */
  async shutdown() {
    if (this.isShuttingDown) {
      return;
    }
    this.isShuttingDown = true;
    logger.info('[WorkerPool] Starting shutdown', {
      workers: this.workers.size,
      queuedTasks: this.taskQueue.length,
    });

    // Reject all queued tasks
    for (const task of this.taskQueue) {
      task.reject(new Error('Worker pool shutting down'));
    }
    this.taskQueue = [];

    // Terminate all workers
    const terminationPromises = [];
    // eslint-disable-next-line no-unused-vars
    for (const [_workerId, workerInfo] of this.workers) {
      if (workerInfo.idleTimer) {
        clearTimeout(workerInfo.idleTimer);
      }
      terminationPromises.push(workerInfo.worker.terminate());
    }

    await Promise.allSettled(terminationPromises);
    this.workers.clear();
    this.idleWorkers = [];

    logger.info('[WorkerPool] Shutdown complete');
    this.emit('pool:shutdown');
  }
}

export default WorkerPool;

/**
 * Progress Tracker Utility
 * Provides standardized progress tracking for long-running operations
 */

class ProgressTracker {
  constructor(webContents, operationType, total = 0) {
    this.webContents = webContents;
    this.operationType = operationType;
    this.total = total;
    this.current = 0;
    this.startTime = Date.now();
    this.lastUpdate = Date.now();
    this.status = 'running';
    this.errors = [];
  }

  /**
   * Fixed: Calculate percentage with type validation
   */
  _calculatePercentage(current, total) {
    // Validate that both are numbers
    if (typeof current !== 'number' || typeof total !== 'number') {
      return 0;
    }

    // Avoid division by zero
    if (total <= 0) {
      return 0;
    }

    // Ensure current doesn't exceed total
    const safePercentage = Math.min(100, Math.round((current / total) * 100));
    return Math.max(0, safePercentage); // Ensure non-negative
  }

  /**
   * Update progress
   */
  update(current, message = '', data = {}) {
    this.current = current;
    this.lastUpdate = Date.now();

    const progress = {
      type: this.operationType,
      current: this.current,
      total: this.total,
      percentage: this._calculatePercentage(this.current, this.total),
      status: this.status,
      message,
      elapsed: Date.now() - this.startTime,
      ...data,
    };

    // Send progress update to renderer
    if (this.webContents && !this.webContents.isDestroyed()) {
      this.webContents.send('operation-progress', progress);
    }

    return progress;
  }

  /**
   * Increment progress by 1
   */
  increment(message = '', data = {}) {
    return this.update(this.current + 1, message, data);
  }

  /**
   * Set total count (useful when total is unknown at start)
   */
  setTotal(total) {
    this.total = total;
    return this.update(this.current);
  }

  /**
   * Add an error without stopping progress
   */
  addError(error, context = {}) {
    this.errors.push({
      message: error.message || String(error),
      timestamp: Date.now(),
      ...context,
    });

    // Send error notification
    if (this.webContents && !this.webContents.isDestroyed()) {
      this.webContents.send('operation-error', {
        type: this.operationType,
        error: error.message || String(error),
        context,
      });
    }
  }

  /**
   * Mark operation as completed
   */
  complete(message = 'Operation completed', data = {}) {
    this.status = 'completed';
    const finalProgress = this.update(this.total, message, {
      ...data,
      duration: Date.now() - this.startTime,
      errorCount: this.errors.length,
    });

    // Send completion event
    if (this.webContents && !this.webContents.isDestroyed()) {
      this.webContents.send('operation-complete', {
        type: this.operationType,
        ...finalProgress,
      });
    }

    return finalProgress;
  }

  /**
   * Mark operation as failed
   */
  fail(error, data = {}) {
    this.status = 'failed';
    const finalProgress = this.update(
      this.current,
      `Failed: ${error.message || error}`,
      {
        ...data,
        duration: Date.now() - this.startTime,
        error: error.message || String(error),
      },
    );

    // Send failure event
    if (this.webContents && !this.webContents.isDestroyed()) {
      this.webContents.send('operation-failed', {
        type: this.operationType,
        ...finalProgress,
      });
    }

    return finalProgress;
  }

  /**
   * Get current progress status
   */
  getStatus() {
    return {
      type: this.operationType,
      current: this.current,
      total: this.total,
      percentage: this._calculatePercentage(this.current, this.total),
      status: this.status,
      elapsed: Date.now() - this.startTime,
      lastUpdate: this.lastUpdate,
      errorCount: this.errors.length,
      errors: this.errors,
    };
  }
}

/**
 * Create a progress tracker for a specific operation
 */
function createProgressTracker(webContents, operationType, total = 0) {
  return new ProgressTracker(webContents, operationType, total);
}

/**
 * Wrap an async iterable operation with progress tracking
 */
async function trackProgress(webContents, operationType, items, processFn) {
  const tracker = new ProgressTracker(webContents, operationType, items.length);
  const results = [];
  const errors = [];

  for (let i = 0; i < items.length; i++) {
    try {
      const result = await processFn(items[i], i);
      results.push(result);
      tracker.increment(`Processing ${i + 1} of ${items.length}`);
    } catch (error) {
      errors.push({ item: items[i], error });
      tracker.addError(error, { index: i, item: items[i] });
    }
  }

  if (errors.length > 0) {
    tracker.complete(`Completed with ${errors.length} errors`, {
      successCount: results.length,
      errorCount: errors.length,
    });
  } else {
    tracker.complete(`Successfully processed ${results.length} items`, {
      successCount: results.length,
      errorCount: 0,
    });
  }

  return {
    results,
    errors,
    summary: {
      ...tracker.getStatus(),
      successCount: results.length,
      errorCount: errors.length,
    },
  };
}

module.exports = {
  ProgressTracker,
  createProgressTracker,
  trackProgress,
};

/**
 * Progress Tracker Utility
 * Provides standardized progress tracking for long-running operations
 */
import type { WebContents } from 'electron';

interface ProgressData {
  type: string;
  current: number;
  total: number;
  percentage: number;
  status: string;
  message: string;
  elapsed: number;
  [key: string]: any;
}

interface ErrorInfo {
  message: string;
  timestamp: number;
  [key: string]: any;
}

interface StatusInfo {
  type: string;
  current: number;
  total: number;
  percentage: number;
  status: string;
  elapsed: number;
  lastUpdate: number;
  errorCount: number;
  errors: ErrorInfo[];
}

interface ProcessResult<T> {
  results: T[];
  errors: Array<{ item: any; error: Error }>;
  summary: StatusInfo & {
    successCount: number;
    errorCount: number;
  };
}

export class ProgressTracker {
  private webContents: WebContents | null;
  private operationType: string;
  private total: number;
  private current: number;
  private startTime: number;
  private lastUpdate: number;
  private status: string;
  private errors: ErrorInfo[];

  constructor(webContents: WebContents | null, operationType: string, total = 0) {
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
   * Calculate percentage with type validation
   */
  private _calculatePercentage(current: number, total: number): number {
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
  update(current: number, message = '', data: Record<string, any> = {}): ProgressData {
    this.current = current;
    this.lastUpdate = Date.now();

    const progress: ProgressData = {
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
  increment(message = '', data: Record<string, any> = {}): ProgressData {
    return this.update(this.current + 1, message, data);
  }

  /**
   * Set total count (useful when total is unknown at start)
   */
  setTotal(total: number): ProgressData {
    this.total = total;
    return this.update(this.current);
  }

  /**
   * Add an error without stopping progress
   */
  addError(error: Error | string, context: Record<string, any> = {}): void {
    this.errors.push({
      message: error instanceof Error ? error.message : String(error),
      timestamp: Date.now(),
      ...context,
    });

    // Send error notification
    if (this.webContents && !this.webContents.isDestroyed()) {
      this.webContents.send('operation-error', {
        type: this.operationType,
        error: error instanceof Error ? error.message : String(error),
        context,
      });
    }
  }

  /**
   * Mark operation as completed
   */
  complete(message = 'Operation completed', data: Record<string, any> = {}): ProgressData {
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
  fail(error: Error | string, data: Record<string, any> = {}): ProgressData {
    this.status = 'failed';
    const errorMessage = error instanceof Error ? error.message : String(error);
    const finalProgress = this.update(this.current, `Failed: ${errorMessage}`, {
      ...data,
      duration: Date.now() - this.startTime,
      error: errorMessage,
    });

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
  getStatus(): StatusInfo {
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
export function createProgressTracker(
  webContents: WebContents | null,
  operationType: string,
  total = 0
): ProgressTracker {
  return new ProgressTracker(webContents, operationType, total);
}

/**
 * Wrap an async iterable operation with progress tracking
 */
export async function trackProgress<T, R>(
  webContents: WebContents | null,
  operationType: string,
  items: T[],
  processFn: (item: T, index: number) => Promise<R>
): Promise<ProcessResult<R>> {
  const tracker = new ProgressTracker(webContents, operationType, items.length);
  const results: R[] = [];
  const errors: Array<{ item: T; error: Error }> = [];

  for (let i = 0; i < items.length; i++) {
    try {
      const result = await processFn(items[i], i);
      results.push(result);
      tracker.increment(`Processing ${i + 1} of ${items.length}`);
    } catch (error) {
      errors.push({ item: items[i], error: error as Error });
      tracker.addError(error as Error, { index: i, item: items[i] });
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

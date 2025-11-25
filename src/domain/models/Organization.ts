/**
 * Organization Domain Model
 * Represents a file organization operation
 */

import type { File, FileData } from './File';

export type OperationStatus = 'pending' | 'executing' | 'completed' | 'failed' | 'undone';
export type BatchStatus = 'pending' | 'executing' | 'completed' | 'partial' | 'failed';

export interface OrganizationOperationData {
  id?: string | null;
  sourceFile: File;
  destinationPath: string;
  category: string;
  confidence: number;
  status?: OperationStatus;
  error?: string | null;
  executedAt?: string | null;
  undoable?: boolean;
}

export interface OrganizationOperationJSON {
  id: string;
  sourceFile: FileData;
  destinationPath: string;
  category: string;
  confidence: number;
  status: OperationStatus;
  error: string | null;
  executedAt: string | null;
  undoable: boolean;
}

export interface BatchProgress {
  current: number;
  total: number;
}

export interface BatchSummary {
  total: number;
  successful: number;
  failed: number;
  successRate: number;
  duration: number;
}

export interface OrganizationBatchData {
  id?: string | null;
  operations?: OrganizationOperation[];
  status?: BatchStatus;
  progress?: BatchProgress;
  startedAt?: string | null;
  completedAt?: string | null;
  summary?: BatchSummary | null;
}

export interface SmartFolder {
  path?: string;
  name: string;
}

export interface FromFilesOptions {
  defaultLocation: string;
  smartFolderMatcher?: (category: string) => SmartFolder | null;
}

export class OrganizationOperation {
  id: string;
  sourceFile: File;
  destinationPath: string;
  category: string;
  confidence: number;
  status: OperationStatus;
  error: string | null;
  executedAt: string | null;
  undoable: boolean;

  constructor({
    id = null,
    sourceFile,
    destinationPath,
    category,
    confidence,
    status = 'pending',
    error = null,
    executedAt = null,
    undoable = true,
  }: OrganizationOperationData) {
    this.id = id || this.generateId();
    this.sourceFile = sourceFile;
    this.destinationPath = destinationPath;
    this.category = category;
    this.confidence = confidence;
    this.status = status;
    this.error = error;
    this.executedAt = executedAt;
    this.undoable = undoable;
  }

  /**
   * Generate unique ID
   */
  generateId(): string {
    return `org_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Check if operation can be executed
   */
  canExecute(): { valid: boolean; reason?: string } {
    if (this.status !== 'pending') {
      return { valid: false, reason: 'Operation is not in pending state' };
    }
    if (!this.sourceFile) {
      return { valid: false, reason: 'Source file is missing' };
    }
    if (!this.destinationPath) {
      return { valid: false, reason: 'Destination path is missing' };
    }

    return { valid: true };
  }

  /**
   * Check if operation can be undone
   */
  canUndo(): { valid: boolean; reason?: string } {
    if (!this.undoable) {
      return { valid: false, reason: 'Operation is not undoable' };
    }
    if (this.status !== 'completed') {
      return {
        valid: false,
        reason: 'Operation is not in completed state',
      };
    }

    return { valid: true };
  }

  /**
   * Mark as executing
   */
  markAsExecuting(): void {
    this.status = 'executing';
  }

  /**
   * Mark as completed
   */
  markAsCompleted(): void {
    this.status = 'completed';
    this.executedAt = new Date().toISOString();
  }

  /**
   * Mark as failed
   */
  markAsFailed(error: string): void {
    this.status = 'failed';
    this.error = error;
    this.executedAt = new Date().toISOString();
  }

  /**
   * Mark as undone
   */
  markAsUndone(): void {
    this.status = 'undone';
  }

  /**
   * Get operation type
   */
  getType(): string {
    return 'move'; // Could be extended to 'copy', 'rename', etc.
  }

  /**
   * Convert to file operation format
   */
  toFileOperation(): { type: string; source: string; destination: string } {
    return {
      type: this.getType(),
      source: this.sourceFile.path,
      destination: this.destinationPath,
    };
  }

  /**
   * Convert to plain object
   */
  toJSON(): OrganizationOperationJSON {
    return {
      id: this.id,
      sourceFile: this.sourceFile.toJSON(),
      destinationPath: this.destinationPath,
      category: this.category,
      confidence: this.confidence,
      status: this.status,
      error: this.error,
      executedAt: this.executedAt,
      undoable: this.undoable,
    };
  }

  /**
   * Create from plain object
   */
  static fromJSON(data: OrganizationOperationJSON): OrganizationOperation {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const File = require('./File').default;
    return new OrganizationOperation({
      ...data,
      sourceFile: File.fromJSON(data.sourceFile),
    });
  }
}

export class OrganizationBatch {
  id: string;
  operations: OrganizationOperation[];
  status: BatchStatus;
  progress: BatchProgress;
  startedAt: string | null;
  completedAt: string | null;
  summary: BatchSummary | null;

  constructor({
    id = null,
    operations = [],
    status = 'pending',
    progress = { current: 0, total: 0 },
    startedAt = null,
    completedAt = null,
    summary = null,
  }: OrganizationBatchData) {
    this.id = id || this.generateId();
    this.operations = operations;
    this.status = status;
    this.progress = progress;
    this.startedAt = startedAt;
    this.completedAt = completedAt;
    this.summary = summary;
  }

  /**
   * Generate unique ID
   */
  generateId(): string {
    return `batch_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Add operation to batch
   */
  addOperation(operation: OrganizationOperation): void {
    this.operations.push(operation);
    this.progress.total = this.operations.length;
  }

  /**
   * Get successful operations
   */
  getSuccessful(): OrganizationOperation[] {
    return this.operations.filter((op) => op.status === 'completed');
  }

  /**
   * Get failed operations
   */
  getFailed(): OrganizationOperation[] {
    return this.operations.filter((op) => op.status === 'failed');
  }

  /**
   * Get pending operations
   */
  getPending(): OrganizationOperation[] {
    return this.operations.filter((op) => op.status === 'pending');
  }

  /**
   * Update progress
   */
  updateProgress(current: number): void {
    this.progress.current = current;
  }

  /**
   * Mark batch as started
   */
  markAsStarted(): void {
    this.status = 'executing';
    this.startedAt = new Date().toISOString();
  }

  /**
   * Mark batch as completed
   */
  markAsCompleted(): void {
    const failed = this.getFailed().length;
    const successful = this.getSuccessful().length;

    if (failed === 0) {
      this.status = 'completed';
    } else if (successful > 0) {
      this.status = 'partial';
    } else {
      this.status = 'failed';
    }
    this.completedAt = new Date().toISOString();
    this.summary = this.generateSummary();
  }

  /**
   * Generate summary
   */
  generateSummary(): BatchSummary {
    const successful = this.getSuccessful().length;
    const failed = this.getFailed().length;
    const total = this.operations.length;

    return {
      total,
      successful,
      failed,
      successRate: total > 0 ? (successful / total) * 100 : 0,
      duration: this.getDuration(),
    };
  }

  /**
   * Get batch duration
   */
  getDuration(): number {
    if (!this.startedAt) return 0;
    const end = this.completedAt ? new Date(this.completedAt) : new Date();
    const start = new Date(this.startedAt);
    return end.getTime() - start.getTime();
  }

  /**
   * Check if batch can be undone
   */
  canUndo(): boolean {
    const completed = this.getSuccessful();
    return completed.length > 0 && completed.every((op) => op.undoable);
  }

  /**
   * Convert to plain object
   */
  toJSON(): {
    id: string;
    operations: OrganizationOperationJSON[];
    status: BatchStatus;
    progress: BatchProgress;
    startedAt: string | null;
    completedAt: string | null;
    summary: BatchSummary | null;
  } {
    return {
      id: this.id,
      operations: this.operations.map((op) => op.toJSON()),
      status: this.status,
      progress: this.progress,
      startedAt: this.startedAt,
      completedAt: this.completedAt,
      summary: this.summary,
    };
  }

  /**
   * Create from plain object
   */
  static fromJSON(data: {
    id?: string;
    operations: OrganizationOperationJSON[];
    status?: BatchStatus;
    progress?: BatchProgress;
    startedAt?: string | null;
    completedAt?: string | null;
    summary?: BatchSummary | null;
  }): OrganizationBatch {
    return new OrganizationBatch({
      ...data,
      operations: data.operations.map((op) =>
        OrganizationOperation.fromJSON(op)
      ),
    });
  }

  /**
   * Create from files and options
   */
  static fromFiles(files: File[], options: FromFilesOptions): OrganizationBatch {
    const { defaultLocation, smartFolderMatcher } = options;

    const operations = files.map((file) => {
      const analysis = file.analysis;
      const category = analysis?.category || 'Uncategorized';
      const suggestedName = analysis?.suggestedName || file.name;

      // Match to smart folder
      let destinationDir = defaultLocation;
      if (smartFolderMatcher) {
        const smartFolder = smartFolderMatcher(category);
        if (smartFolder) {
          destinationDir = smartFolder.path || `${defaultLocation}/${smartFolder.name}`;
        } else {
          destinationDir = `${defaultLocation}/${category}`;
        }
      } else {
        destinationDir = `${defaultLocation}/${category}`;
      }

      const destinationPath = `${destinationDir}/${suggestedName}`;

      return new OrganizationOperation({
        sourceFile: file,
        destinationPath,
        category,
        confidence: analysis?.confidence || 0,
      });
    });

    return new OrganizationBatch({ operations });
  }
}

export default { OrganizationOperation, OrganizationBatch };

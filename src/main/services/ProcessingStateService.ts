import fs from 'fs/promises';
import path from 'path';
import { app } from 'electron';

interface AnalysisJob {
  status: 'pending' | 'in_progress' | 'done' | 'failed';
  startedAt?: string;
  completedAt: string | null;
  error: string | null;
}

interface OrganizeOperation {
  source?: string;
  destination?: string;
  status: 'pending' | 'in_progress' | 'done' | 'failed';
  error: string | null;
}

interface OrganizeBatch {
  id: string;
  operations: OrganizeOperation[];
  startedAt: string;
  completedAt: string | null;
}

interface ProcessingState {
  schemaVersion: string;
  createdAt: string;
  updatedAt: string;
  analysis: {
    jobs: Record<string, AnalysisJob>;
    lastUpdated: string;
  };
  organize: {
    batches: Record<string, OrganizeBatch>;
    lastUpdated: string;
  };
}

/**
 * ProcessingStateService
 * - Persists analysis jobs and organize batches to disk so work can resume after crashes/restarts
 */
class ProcessingStateService {
  userDataPath: string;
  statePath: string;
  state: ProcessingState | null;
  initialized: boolean;
  SCHEMA_VERSION: string;
  _initPromise: Promise<void> | null;
  _writeLock: Promise<void>;

  constructor() {
    this.userDataPath = app.getPath('userData');
    this.statePath = path.join(this.userDataPath, 'processing-state.json');
    this.state = null;
    this.initialized = false;
    this.SCHEMA_VERSION = '1.0.0';

    // Fixed: Add mutexes to prevent race conditions
    this._initPromise = null;
    this._writeLock = Promise.resolve();
  }

  async ensureParentDirectory(filePath: string): Promise<void> {
    const parentDirectory = path.dirname(filePath);
    await fs.mkdir(parentDirectory, { recursive: true });
  }

  async initialize(): Promise<void> {
    // Fixed: Use initialization promise to prevent race conditions
    if (this._initPromise) {
      return this._initPromise;
    }
    if (this.initialized) {
      return Promise.resolve();
    }
    this._initPromise = (async () => {
      try {
        await this.loadState();
        this.initialized = true;
      } catch (error) {
        this.state = this.createEmptyState();
        await this._saveStateInternal(); // Use internal method to avoid double-locking
        this.initialized = true;
      }
    })();
    return this._initPromise;
  }

  createEmptyState(): ProcessingState {
    const now = new Date().toISOString();
    return {
      schemaVersion: this.SCHEMA_VERSION,
      createdAt: now,
      updatedAt: now,
      analysis: {
        jobs: {}, // key: filePath, value: { status: 'pending'|'in_progress'|'done'|'failed', startedAt, completedAt, error }
        lastUpdated: now,
      },
      organize: {
        batches: {}, // key: batchId, value: { id, operations: [{ source, destination, status, error }], startedAt, completedAt }
        lastUpdated: now,
      },
    };
  }

  async loadState(): Promise<void> {
    try {
      const raw = await fs.readFile(this.statePath, 'utf8');
      this.state = JSON.parse(raw);
      if (this.state && !this.state.schemaVersion) {
        this.state.schemaVersion = this.SCHEMA_VERSION;
      }
    } catch (error: any) {
      if (error.code === 'ENOENT') {
        this.state = this.createEmptyState();
      } else {
        throw error;
      }
    }
  }

  /**
   * Internal save method without locking (for use within locked contexts)
   * @private
   */
  async _saveStateInternal(): Promise<void> {
    if (!this.state) {
      throw new Error('State is not initialized');
    }
    this.state.updatedAt = new Date().toISOString();
    await this.ensureParentDirectory(this.statePath);
    await fs.writeFile(this.statePath, JSON.stringify(this.state, null, 2));
  }

  /**
   * Save state with write lock to prevent concurrent writes
   */
  async saveState(): Promise<void> {
    // Fixed: Use write lock to prevent concurrent state file corruption
    // CRITICAL: Lock must always resolve to maintain the chain
    const previousLock = this._writeLock;

    // Create new lock that waits for previous, handling both success and failure
    this._writeLock = previousLock
      .then(() => this._saveStateInternal())
      .catch(() => {
        // Previous operation failed, but we still try current operation
        // This prevents error propagation from breaking the lock chain
        return this._saveStateInternal();
      });
    return this._writeLock;
  }

  // ===== Analysis tracking =====
  async markAnalysisStart(filePath: string): Promise<void> {
    await this.initialize();
    if (!this.state) {
      throw new Error('State not initialized');
    }
    const now = new Date().toISOString();
    this.state.analysis.jobs[filePath] = {
      ...(this.state.analysis.jobs[filePath] || {}),
      status: 'in_progress',
      startedAt: now,
      completedAt: null,
      error: null,
    };
    this.state.analysis.lastUpdated = now;
    await this.saveState();
  }

  async markAnalysisComplete(filePath: string): Promise<void> {
    await this.initialize();
    if (!this.state) {
      throw new Error('State not initialized');
    }
    const now = new Date().toISOString();
    this.state.analysis.jobs[filePath] = {
      ...(this.state.analysis.jobs[filePath] || {}),
      status: 'done',
      completedAt: now,
      error: null,
    };
    this.state.analysis.lastUpdated = now;
    await this.saveState();
  }

  async markAnalysisError(filePath: string, errorMessage: string): Promise<void> {
    await this.initialize();
    if (!this.state) {
      throw new Error('State not initialized');
    }
    const now = new Date().toISOString();
    this.state.analysis.jobs[filePath] = {
      ...(this.state.analysis.jobs[filePath] || {}),
      status: 'failed',
      completedAt: now,
      error: errorMessage || 'Unknown analysis error',
    };
    this.state.analysis.lastUpdated = now;
    await this.saveState();
  }

  getIncompleteAnalysisJobs(): Array<{ filePath: string } & AnalysisJob> {
    if (!this.state) return [];
    return Object.entries(this.state.analysis.jobs)
      .filter(([, j]) => j.status === 'in_progress' || j.status === 'pending')
      .map(([filePath, j]) => ({ filePath, ...j }));
  }

  // ===== Organize batch tracking =====
  async createOrLoadOrganizeBatch(
    batchId: string,
    operations: OrganizeOperation[],
  ): Promise<OrganizeBatch> {
    await this.initialize();
    if (!this.state) {
      throw new Error('State not initialized');
    }
    const now = new Date().toISOString();
    if (!this.state.organize.batches[batchId]) {
      this.state.organize.batches[batchId] = {
        id: batchId,
        operations: operations.map((op) => ({
          ...op,
          status: 'pending',
          error: null,
        })),
        startedAt: now,
        completedAt: null,
      };
      this.state.organize.lastUpdated = now;
      await this.saveState();
    }
    return this.state.organize.batches[batchId];
  }

  async markOrganizeOpStarted(batchId: string, index: number): Promise<void> {
    await this.initialize();
    if (!this.state) return;
    const batch = this.state.organize.batches[batchId];
    if (!batch) return;
    batch.operations[index].status = 'in_progress';
    batch.operations[index].error = null;
    this.state.organize.lastUpdated = new Date().toISOString();
    await this.saveState();
  }

  async markOrganizeOpDone(
    batchId: string,
    index: number,
    updatedOp: Partial<OrganizeOperation> | null = null,
  ): Promise<void> {
    await this.initialize();
    if (!this.state) return;
    const batch = this.state.organize.batches[batchId];
    if (!batch) return;
    if (updatedOp) {
      batch.operations[index] = { ...batch.operations[index], ...updatedOp };
    }
    batch.operations[index].status = 'done';
    batch.operations[index].error = null;
    this.state.organize.lastUpdated = new Date().toISOString();
    await this.saveState();
  }

  async markOrganizeOpError(
    batchId: string,
    index: number,
    errorMessage: string,
  ): Promise<void> {
    await this.initialize();
    if (!this.state) return;
    const batch = this.state.organize.batches[batchId];
    if (!batch) return;
    batch.operations[index].status = 'failed';
    batch.operations[index].error = errorMessage || 'Unknown organize error';
    this.state.organize.lastUpdated = new Date().toISOString();
    await this.saveState();
  }

  async completeOrganizeBatch(batchId: string): Promise<void> {
    await this.initialize();
    if (!this.state) return;
    const batch = this.state.organize.batches[batchId];
    if (!batch) return;
    batch.completedAt = new Date().toISOString();
    this.state.organize.lastUpdated = batch.completedAt;
    await this.saveState();
  }

  getIncompleteOrganizeBatches(): OrganizeBatch[] {
    if (!this.state) return [];
    return Object.values(this.state.organize.batches).filter(
      (batch) => !batch.completedAt,
    );
  }
}

export default ProcessingStateService;

/**
 * Atomic File Operations System
 *
 * Provides transactional file operations with rollback capabilities
 * to prevent data loss during file organization. Addresses the safety
 * concerns identified in the architectural analysis.
 */
import fs from 'fs/promises';
import path from 'path';
import crypto from 'crypto';
import os from 'os';
import { logger } from './logger';
import { getErrorMessage } from './errors';

logger.setContext('AtomicFileOperations');

/**
 * File operation types
 */
type OperationType = 'move' | 'copy' | 'create' | 'delete';

/**
 * File operation definition
 */
interface FileOperation {
  id?: string;
  type: OperationType;
  source?: string;
  destination?: string;
  data?: string | Buffer;
  metadata?: Record<string, unknown>;
  timestamp?: number;
}

/**
 * Backup entry
 */
interface BackupEntry {
  source: string;
  backup: string;
}

/**
 * Transaction status
 */
type TransactionStatus = 'active' | 'committed' | 'rolling_back' | 'rolled_back';

/**
 * Transaction definition
 */
interface Transaction {
  id: string;
  operations: FileOperation[];
  backups: BackupEntry[];
  startTime: number;
  status: TransactionStatus;
}

/**
 * Transaction status info
 */
interface TransactionStatusInfo {
  id: string;
  status: TransactionStatus;
  operationCount: number;
  backupCount: number;
  duration: number;
}

/**
 * Commit result
 */
interface CommitResult {
  success: boolean;
  results?: Array<{ operation: string | undefined; success: boolean; result?: unknown }>;
  error?: string;
  failedOperation?: string;
  rollbackSuccessful?: boolean;
  rollbackError?: string;
}

/**
 * Organize operation input
 */
interface OrganizeOperation {
  originalPath: string;
  targetPath: string;
  analysisData?: Record<string, unknown>;
}

/**
 * Transaction-based file operation manager
 */
class AtomicFileOperations {
  activeTransactions: Map<string, Transaction>;
  backupDirectory: string | null;
  operationTimeout: number;

  constructor() {
    this.activeTransactions = new Map();
    this.backupDirectory = null;
    this.operationTimeout = 30000; // 30 seconds
  }

  /**
   * Initialize backup directory for transaction safety
   */
  async initializeBackupDirectory(): Promise<string> {
    if (this.backupDirectory) return this.backupDirectory;
    const tempDir = os.tmpdir();
    this.backupDirectory = path.join(
      tempDir,
      'stratosort-backups',
      Date.now().toString(),
    );

    try {
      await fs.mkdir(this.backupDirectory, { recursive: true });
      return this.backupDirectory;
    } catch (error: unknown) {
      throw new Error(
        `Failed to initialize backup directory: ${getErrorMessage(error)}`,
      );
    }
  }

  /**
   * Generate unique transaction ID
   */
  generateTransactionId(): string {
    return crypto.randomBytes(16).toString('hex');
  }

  /**
   * Create a backup of a file before modification
   */
  async createBackup(filePath: string, transactionId: string): Promise<string> {
    await this.initializeBackupDirectory();

    const filename = path.basename(filePath);
    const backupPath = path.join(
      this.backupDirectory!,
      `${transactionId}_${filename}`,
    );

    try {
      await fs.copyFile(filePath, backupPath);
      return backupPath;
    } catch (error: unknown) {
      throw new Error(`Backup creation failed: ${getErrorMessage(error)}`);
    }
  }

  /**
   * Begin a new atomic transaction
   */
  async beginTransaction(operations: FileOperation[] = []): Promise<string> {
    const transactionId = this.generateTransactionId();
    const transaction: Transaction = {
      id: transactionId,
      operations: [],
      backups: [],
      startTime: Date.now(),
      status: 'active',
    };

    if (Array.isArray(operations) && operations.length > 0) {
      transaction.operations.push(...operations);
    }
    this.activeTransactions.set(transactionId, transaction);

    return transactionId;
  }

  /**
   * Add an operation to the transaction
   */
  addOperation(transactionId: string, operation: FileOperation): void {
    const transaction = this.activeTransactions.get(transactionId);
    if (!transaction) {
      throw new Error(`Transaction ${transactionId} not found`);
    }

    if (transaction.status !== 'active') {
      throw new Error(`Transaction ${transactionId} is not active`);
    }

    transaction.operations.push({
      ...operation,
      id: crypto.randomBytes(8).toString('hex'),
      timestamp: Date.now(),
    });
  }

  /**
   * Execute a single file operation with backup
   */
  async executeOperation(
    transactionId: string,
    operation: FileOperation
  ): Promise<{ success: boolean; backupPath: string | null }> {
    const transaction = this.activeTransactions.get(transactionId);
    if (!transaction) {
      throw new Error(`Transaction ${transactionId} not found`);
    }

    const { type, source, destination, data } = operation;

    let backupPath: string | null = null;

    // Create backup for existing files
    if (type === 'move' || type === 'copy') {
      if (source && await this.fileExists(source)) {
        backupPath = await this.createBackup(source, transactionId);
        transaction.backups.push({ source, backup: backupPath });
      }
    }

    // Execute the operation
    switch (type) {
      case 'move':
        if (source && destination) {
          await this.atomicMove(source, destination);
        }
        break;
      case 'copy':
        if (source && destination) {
          await this.atomicCopy(source, destination);
        }
        break;
      case 'create':
        if (destination && data !== undefined) {
          await this.atomicCreate(destination, data);
        }
        break;
      case 'delete':
        if (source && await this.fileExists(source)) {
          backupPath = await this.createBackup(source, transactionId);
          transaction.backups.push({ source, backup: backupPath });
          await fs.unlink(source);
        }
        break;
      default:
        throw new Error(`Unknown operation type: ${type}`);
    }

    return { success: true, backupPath };
  }

  /**
   * Atomic move operation with directory creation
   * Fixed: Added retry logic to prevent race conditions
   */
  async atomicMove(source: string, destination: string): Promise<string> {
    // Ensure destination directory exists
    await fs.mkdir(path.dirname(destination), { recursive: true });

    // Retry loop to handle race conditions atomically
    let finalDestination = destination;
    let attempts = 0;
    const maxAttempts = 10;

    while (attempts < maxAttempts) {
      try {
        // Try rename first (atomic operation)
        await fs.rename(source, finalDestination);
        return finalDestination;
      } catch (error: unknown) {
        const err = error as NodeJS.ErrnoException;
        if (err.code === 'EEXIST') {
          // Destination exists, generate unique name and retry
          attempts++;
          finalDestination = await this.generateUniqueFilename(destination);
          continue;
        } else if (err.code === 'EXDEV') {
          // Cross-device move: copy then delete with verification
          await fs.copyFile(source, finalDestination);
          // Verify copy succeeded
          const sourceStats = await fs.stat(source);
          const destStats = await fs.stat(finalDestination);
          if (sourceStats.size !== destStats.size) {
            await fs.unlink(finalDestination).catch((unlinkError: Error) => {
              logger.warn(
                'Failed to cleanup file after size mismatch in atomic operation',
                {
                  path: finalDestination,
                  error: unlinkError.message,
                },
              );
            });
            throw new Error('File copy verification failed - size mismatch');
          }
          await fs.unlink(source);
          return finalDestination;
        } else if (err.code === 'ENOENT' && attempts === 0) {
          throw new Error(`Source file not found: ${source}`);
        } else {
          throw error;
        }
      }
    }

    throw new Error(
      `Failed to move file after ${maxAttempts} attempts due to naming conflicts`,
    );
  }

  /**
   * Atomic copy operation
   * Fixed: Added retry logic to prevent race conditions
   */
  async atomicCopy(source: string, destination: string): Promise<string> {
    await fs.mkdir(path.dirname(destination), { recursive: true });

    // Retry loop to handle race conditions atomically
    let finalDestination = destination;
    let attempts = 0;
    const maxAttempts = 10;

    while (attempts < maxAttempts) {
      try {
        // Try to copy with exclusive flag to detect conflicts early
        await fs.copyFile(source, finalDestination, fs.constants.COPYFILE_EXCL);
        return finalDestination;
      } catch (error: unknown) {
        const err = error as NodeJS.ErrnoException;
        if (err.code === 'EEXIST') {
          // Destination exists, generate unique name and retry
          attempts++;
          finalDestination = await this.generateUniqueFilename(destination);
          continue;
        } else {
          throw error;
        }
      }
    }

    throw new Error(
      `Failed to copy file after ${maxAttempts} attempts due to naming conflicts`,
    );
  }

  // Note: Following code continues with the original atomicCopy implementation
  async atomicCopy_legacy(source: string, destination: string): Promise<string> {
    await fs.mkdir(path.dirname(destination), { recursive: true });

    if (await this.fileExists(destination)) {
      const uniqueDestination = await this.generateUniqueFilename(destination);
      destination = uniqueDestination;
    }

    await fs.copyFile(source, destination);
    return destination;
  }

  /**
   * Atomic create operation
   */
  async atomicCreate(filePath: string, data: string | Buffer): Promise<string> {
    await fs.mkdir(path.dirname(filePath), { recursive: true });

    const tempFile = `${filePath}.tmp.${Date.now()}`;

    try {
      await fs.writeFile(tempFile, data);
      await fs.rename(tempFile, filePath);
      return filePath;
    } catch (error) {
      // Cleanup temp file on failure
      try {
        await fs.unlink(tempFile);
      } catch {
        // Ignore cleanup errors
      }
      throw error;
    }
  }

  /**
   * Generate unique filename to avoid conflicts
   */
  async generateUniqueFilename(originalPath: string): Promise<string> {
    const dir = path.dirname(originalPath);
    const ext = path.extname(originalPath);
    const name = path.basename(originalPath, ext);

    let counter = 1;
    let uniquePath = originalPath;

    while (await this.fileExists(uniquePath)) {
      uniquePath = path.join(dir, `${name}_${counter}${ext}`);
      counter++;

      if (counter > 1000) {
        throw new Error(
          'Unable to generate unique filename after 1000 attempts',
        );
      }
    }

    return uniquePath;
  }

  /**
   * Check if file exists
   */
  async fileExists(filePath: string): Promise<boolean> {
    try {
      await fs.access(filePath);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Execute all operations in a transaction
   */
  async commitTransaction(transactionId: string): Promise<CommitResult> {
    const transaction = this.activeTransactions.get(transactionId);
    if (!transaction) {
      throw new Error(`Transaction ${transactionId} not found`);
    }

    if (transaction.status !== 'active') {
      throw new Error(`Transaction ${transactionId} is not active`);
    }

    const results: Array<{ operation: string | undefined; success: boolean; result?: unknown }> = [];
    // Use a wrapper object to prevent TypeScript narrowing issues
    const failedOpRef: { op: FileOperation | null } = { op: null };

    try {
      // Set timeout for the entire transaction
      let timeoutId: NodeJS.Timeout;
      const timeoutPromise = new Promise<never>((_, reject) => {
        timeoutId = setTimeout(() => {
          reject(new Error(`Transaction ${transactionId} timed out`));
        }, this.operationTimeout);
        timeoutId.unref();
      });

      const operationPromise = (async () => {
        for (const operation of transaction.operations) {
          try {
            const result = await this.executeOperation(
              transactionId,
              operation,
            );
            results.push({
              operation: operation.id,
              success: true,
              result,
            });
          } catch (error) {
            failedOpRef.op = operation;
            throw error;
          }
        }
      })();

      await Promise.race([operationPromise, timeoutPromise]);
      clearTimeout(timeoutId!);

      transaction.status = 'committed';
      // Transaction committed successfully

      // Clean up old backups after successful commit (optional)
      const cleanupTimer = setTimeout(
        () => this.cleanupBackups(transactionId),
        60000,
      ); // 1 minute delay
      cleanupTimer.unref();

      return { success: true, results };
    } catch (error: unknown) {
      // Transaction failed, will be rolled back
      const errorMsg = getErrorMessage(error);

      // Attempt to rollback
      try {
        await this.rollbackTransaction(transactionId);
        return {
          success: false,
          error: errorMsg,
          failedOperation: failedOpRef.op?.id,
          rollbackSuccessful: true,
        };
      } catch (rollbackError: unknown) {
        // Rollback failed - this is a critical error but we can't do much about it
        return {
          success: false,
          error: errorMsg,
          failedOperation: failedOpRef.op?.id,
          rollbackSuccessful: false,
          rollbackError: getErrorMessage(rollbackError),
        };
      }
    }
  }

  /**
   * Rollback a transaction using backups
   */
  async rollbackTransaction(transactionId: string): Promise<void> {
    const transaction = this.activeTransactions.get(transactionId);
    if (!transaction) {
      throw new Error(`Transaction ${transactionId} not found`);
    }

    // Rolling back transaction
    transaction.status = 'rolling_back';

    const rollbackErrors: Array<{ source: string; error: string }> = [];

    // Restore files from backups in reverse order
    for (let i = transaction.backups.length - 1; i >= 0; i--) {
      const { source, backup } = transaction.backups[i];

      try {
        // Check if backup exists
        if (await this.fileExists(backup)) {
          // Ensure source directory exists
          await fs.mkdir(path.dirname(source), { recursive: true });

          // Restore the file
          await fs.copyFile(backup, source);
          // File restored from backup
        }
      } catch (error: unknown) {
        rollbackErrors.push({ source, error: getErrorMessage(error) });
      }
    }

    transaction.status = 'rolled_back';

    if (rollbackErrors.length > 0) {
      throw new Error(
        `Rollback completed with errors: ${JSON.stringify(rollbackErrors)}`,
      );
    }

    // Transaction rolled back successfully
  }

  /**
   * Clean up backup files for a transaction
   */
  async cleanupBackups(transactionId: string): Promise<void> {
    const transaction = this.activeTransactions.get(transactionId);
    if (!transaction) return;

    for (const { backup } of transaction.backups) {
      try {
        if (await this.fileExists(backup)) {
          await fs.unlink(backup);
        }
      } catch {
        // Ignore cleanup errors
      }
    }

    // Remove from active transactions
    this.activeTransactions.delete(transactionId);
  }

  /**
   * Get transaction status
   */
  getTransactionStatus(transactionId: string): TransactionStatusInfo | null {
    const transaction = this.activeTransactions.get(transactionId);
    if (!transaction) return null;

    return {
      id: transaction.id,
      status: transaction.status,
      operationCount: transaction.operations.length,
      backupCount: transaction.backups.length,
      duration: Date.now() - transaction.startTime,
    };
  }

  /**
   * List all active transactions
   */
  getActiveTransactions(): TransactionStatusInfo[] {
    const statuses: TransactionStatusInfo[] = [];
    for (const id of this.activeTransactions.keys()) {
      const status = this.getTransactionStatus(id);
      if (status) {
        statuses.push(status);
      }
    }
    return statuses;
  }

  /**
   * Force cleanup of stale transactions
   */
  async cleanupStaleTransactions(maxAge: number = 3600000): Promise<number> {
    // 1 hour
    const now = Date.now();
    const staleTransactions: string[] = [];
    for (const [id, transaction] of this.activeTransactions) {
      if (now - transaction.startTime > maxAge) {
        staleTransactions.push(id);
      }
    }

    for (const id of staleTransactions) {
      try {
        await this.cleanupBackups(id);
      } catch {
        // Ignore cleanup errors for stale transactions
      }
    }

    return staleTransactions.length;
  }
}

// Export singleton instance
const atomicFileOps = new AtomicFileOperations();

// Convenience functions
async function organizeFilesAtomically(
  operations: OrganizeOperation[]
): Promise<CommitResult> {
  const transactionId = await atomicFileOps.beginTransaction();

  // Convert operations to atomic operations
  for (const op of operations) {
    atomicFileOps.addOperation(transactionId, {
      type: 'move',
      source: op.originalPath,
      destination: op.targetPath,
      metadata: op.analysisData,
    });
  }

  const result = await atomicFileOps.commitTransaction(transactionId);
  return result;
}

async function backupAndReplace(
  filePath: string,
  newContent: string | Buffer
): Promise<CommitResult> {
  const transactionId = await atomicFileOps.beginTransaction();

  atomicFileOps.addOperation(transactionId, {
    type: 'create',
    destination: filePath,
    data: newContent,
  });

  return await atomicFileOps.commitTransaction(transactionId);
}

export {
  AtomicFileOperations,
  atomicFileOps,
  organizeFilesAtomically,
  backupAndReplace,
};

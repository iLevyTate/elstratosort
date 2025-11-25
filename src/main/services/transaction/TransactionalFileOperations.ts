/**
 * Transactional File Operations
 * Wraps fs operations with transaction support for automatic rollback
 *
 * Pattern: Saga Pattern with compensating transactions
 * Usage:
 *   const txOps = new TransactionalFileOperations(journal);
 *   const txId = await txOps.beginTransaction();
 *   try {
 *     await txOps.move(txId, source, dest);
 *     await txOps.copy(txId, file1, file2);
 *     await txOps.commit(txId);
 *   } catch (error) {
 *     await txOps.rollback(txId);
 *   }
 */
import { promises as fs } from 'fs';
import path from 'path';
import { logger } from '../../../shared/logger';
import TransactionJournal from './TransactionJournal';
import FileOperationError from '../../../shared/errors/FileOperationError';

interface TransactionMetadata {
  [key: string]: any;
}

interface RollbackError {
  operation: DbOperation;
  error: string;
}

interface DbOperation {
  id: number;
  transaction_id: string;
  step_number: number;
  operation_type: string;
  source_path: string;
  destination_path: string;
  status: string;
  executed_at: number | null;
}

class TransactionalFileOperations {
  private journalPath: string;
  private journal: TransactionJournal | null;
  private stepCounters: Map<string, number>; // txId -> step number

  constructor(journalPath: string | null = null) {
    this.journalPath =
      journalPath || path.join(process.cwd(), '.stratosort', 'transactions', 'journal.db');
    this.journal = null;
    this.stepCounters = new Map(); // txId -> step number
  }

  /**
   * Initialize the transaction system
   */
  async initialize(): Promise<void> {
    if (this.journal) return;

    // Ensure directory exists
    await fs.mkdir(path.dirname(this.journalPath), { recursive: true });
    this.journal = new TransactionJournal(this.journalPath);

    // Recover any incomplete transactions from previous crash
    await this._recoverIncompleteTransactions();

    logger.info('[TransactionalFileOps] Initialized');
  }

  /**
   * Begin a new transaction
   * @param metadata - Optional metadata for the transaction
   * @returns Transaction ID
   */
  async beginTransaction(metadata: TransactionMetadata = {}): Promise<string> {
    await this.initialize();
    if (!this.journal) {
      throw new Error('Journal not initialized');
    }

    const txId = this.journal.beginTransaction();
    this.stepCounters.set(txId, 0);

    logger.debug('[TransactionalFileOps] Started transaction', { txId, metadata });
    return txId;
  }

  /**
   * Move a file within a transaction
   * @param txId - Transaction ID
   * @param source - Source file path
   * @param destination - Destination file path
   */
  async move(txId: string, source: string, destination: string): Promise<void> {
    const stepNumber = this._nextStep(txId);

    try {
      // Perform the move
      await fs.rename(source, destination);

      // Record in journal
      if (!this.journal) {
        throw new Error('Journal not initialized');
      }

      this.journal.recordOperation(txId, stepNumber, {
        type: 'move',
        source,
        destination,
      });

      logger.debug('[TransactionalFileOps] Move completed', {
        txId,
        step: stepNumber,
        source,
        destination,
      });
    } catch (error) {
      throw new FileOperationError('move', source, error);
    }
  }

  /**
   * Copy a file within a transaction
   * @param txId - Transaction ID
   * @param source - Source file path
   * @param destination - Destination file path
   */
  async copy(txId: string, source: string, destination: string): Promise<void> {
    const stepNumber = this._nextStep(txId);

    try {
      // Perform the copy
      await fs.copyFile(source, destination);

      // Record in journal
      if (!this.journal) {
        throw new Error('Journal not initialized');
      }

      this.journal.recordOperation(txId, stepNumber, {
        type: 'copy',
        source,
        destination,
      });

      logger.debug('[TransactionalFileOps] Copy completed', {
        txId,
        step: stepNumber,
        source,
        destination,
      });
    } catch (error) {
      throw new FileOperationError('copy', source, error);
    }
  }

  /**
   * Delete a file within a transaction (with backup)
   * @param txId - Transaction ID
   * @param filePath - File to delete
   */
  async delete(txId: string, filePath: string): Promise<void> {
    const stepNumber = this._nextStep(txId);

    try {
      // Create backup first
      const backupPath = `${filePath}.txbackup_${txId}`;
      await fs.rename(filePath, backupPath);

      // Record in journal (source is backup, destination is where it should be restored)
      if (!this.journal) {
        throw new Error('Journal not initialized');
      }

      this.journal.recordOperation(txId, stepNumber, {
        type: 'delete',
        source: backupPath,
        destination: filePath,
      });

      logger.debug('[TransactionalFileOps] Delete completed (backed up)', {
        txId,
        step: stepNumber,
        file: filePath,
        backup: backupPath,
      });
    } catch (error) {
      throw new FileOperationError('delete', filePath, error);
    }
  }

  /**
   * Create a directory within a transaction
   * @param txId - Transaction ID
   * @param dirPath - Directory to create
   */
  async mkdir(txId: string, dirPath: string): Promise<void> {
    const stepNumber = this._nextStep(txId);

    try {
      // Create directory
      await fs.mkdir(dirPath, { recursive: true });

      // Record in journal (source = destination for mkdir, we just need the path)
      if (!this.journal) {
        throw new Error('Journal not initialized');
      }

      this.journal.recordOperation(txId, stepNumber, {
        type: 'mkdir',
        source: dirPath,
        destination: dirPath,
      });

      logger.debug('[TransactionalFileOps] Directory created', {
        txId,
        step: stepNumber,
        directory: dirPath,
      });
    } catch (error) {
      throw new FileOperationError('mkdir', dirPath, error);
    }
  }

  /**
   * Commit the transaction
   * @param txId - Transaction ID
   */
  async commit(txId: string): Promise<void> {
    if (!this.journal) {
      throw new Error('Journal not initialized');
    }

    this.journal.commitTransaction(txId);
    this.stepCounters.delete(txId);

    // Clean up any backup files
    await this._cleanupBackups(txId);

    logger.info('[TransactionalFileOps] Transaction committed', { txId });
  }

  /**
   * Rollback the transaction by undoing all operations
   * @param txId - Transaction ID
   * @param reason - Reason for rollback
   */
  async rollback(txId: string, reason: string = 'Unknown error'): Promise<void> {
    if (!this.journal) {
      throw new Error('Journal not initialized');
    }

    logger.warn('[TransactionalFileOps] Rolling back transaction', { txId, reason });
    const operations = this.journal.getOperationsForRollback(txId);

    const errors: RollbackError[] = [];

    // Execute compensating actions in reverse order
    for (const op of operations) {
      try {
        await this._compensate(op);
        this.journal.markOperationRolledBack(op.id);

        logger.debug('[TransactionalFileOps] Compensated operation', {
          txId,
          opId: op.id,
          type: op.operation_type,
        });
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);

        logger.error('[TransactionalFileOps] Compensation failed', {
          txId,
          opId: op.id,
          type: op.operation_type,
          error: errorMessage,
        });

        errors.push({
          operation: op,
          error: errorMessage,
        });
      }
    }

    this.journal.markTransactionRolledBack(txId, reason);
    this.stepCounters.delete(txId);

    // Clean up backup files
    await this._cleanupBackups(txId);

    if (errors.length > 0) {
      logger.error('[TransactionalFileOps] Rollback completed with errors', {
        txId,
        errorCount: errors.length,
      });

      throw new Error(
        `Rollback completed but ${errors.length} operation(s) could not be compensated. Manual intervention may be required.`
      );
    }

    logger.info('[TransactionalFileOps] Rollback complete', { txId });
  }

  /**
   * Execute compensating action for an operation
   * @private
   */
  private async _compensate(operation: DbOperation): Promise<void> {
    const { operation_type, source_path, destination_path } = operation;

    try {
      switch (operation_type) {
        case 'move':
          // Undo move: move file back from destination to source
          await fs.rename(destination_path, source_path);
          logger.debug('[Compensate] Moved file back', {
            from: destination_path,
            to: source_path,
          });
          break;

        case 'copy':
          // Undo copy: delete the copied file
          try {
            await fs.unlink(destination_path);
            logger.debug('[Compensate] Deleted copied file', { path: destination_path });
          } catch (error: any) {
            // If file doesn't exist, that's fine
            if (error.code !== 'ENOENT') throw error;
          }
          break;

        case 'delete':
          // Undo delete: restore from backup
          // source_path is the backup, destination_path is where to restore
          await fs.rename(source_path, destination_path);
          logger.debug('[Compensate] Restored deleted file', {
            from: source_path,
            to: destination_path,
          });
          break;

        case 'mkdir':
          // Undo mkdir: remove directory if empty
          try {
            await fs.rmdir(source_path);
            logger.debug('[Compensate] Removed directory', { path: source_path });
          } catch (error: any) {
            // If directory not empty or doesn't exist, skip
            if (error.code !== 'ENOTEMPTY' && error.code !== 'ENOENT') {
              throw error;
            }
          }
          break;

        default:
          logger.warn('[Compensate] Unknown operation type', {
            type: operation_type,
          });
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);

      logger.error('[Compensate] Compensation failed', {
        operation: operation_type,
        source: source_path,
        destination: destination_path,
        error: errorMessage,
      });
      throw error;
    }
  }

  /**
   * Recover incomplete transactions from previous crash
   * @private
   */
  private async _recoverIncompleteTransactions(): Promise<void> {
    if (!this.journal) {
      throw new Error('Journal not initialized');
    }

    const incomplete = this.journal.findIncompleteTransactions();

    if (incomplete.length === 0) {
      logger.debug('[TransactionalFileOps] No incomplete transactions to recover');
      return;
    }

    logger.warn('[TransactionalFileOps] Recovering incomplete transactions', {
      count: incomplete.length,
    });

    for (const tx of incomplete) {
      try {
        await this.rollback(tx.id, 'Recovery after crash');
        logger.info('[TransactionalFileOps] Recovered transaction', { txId: tx.id });
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);

        logger.error('[TransactionalFileOps] Failed to recover transaction', {
          txId: tx.id,
          error: errorMessage,
        });
      }
    }
  }

  /**
   * Clean up backup files after transaction completes
   * @private
   */
  private async _cleanupBackups(txId: string): Promise<void> {
    if (!this.journal) {
      return;
    }

    try {
      // Find all .txbackup_{txId} files
      // Pattern: .txbackup_{txId}

      // We can't easily scan all directories, so we rely on the journal
      // to tell us what was backed up (delete operations)
      const tx = this.journal.getTransaction(txId);
      if (!tx) return;

      const operations = this.journal.getOperationsForRollback(txId);
      const deleteOps = operations.filter((op) => op.operation_type === 'delete');

      for (const op of deleteOps) {
        const backupPath = op.source_path; // For delete ops, source is the backup
        try {
          await fs.unlink(backupPath);
          logger.debug('[Cleanup] Deleted backup file', { path: backupPath });
        } catch (error: any) {
          // If file doesn't exist, that's fine
          if (error.code !== 'ENOENT') {
            logger.warn('[Cleanup] Failed to delete backup file', {
              path: backupPath,
              error: error.message,
            });
          }
        }
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);

      logger.warn('[Cleanup] Error cleaning up backups', {
        txId,
        error: errorMessage,
      });
    }
  }

  /**
   * Get next step number for transaction
   * @private
   */
  private _nextStep(txId: string): number {
    const current = this.stepCounters.get(txId) || 0;
    const next = current + 1;
    this.stepCounters.set(txId, next);
    return next;
  }

  /**
   * Get statistics about transactions
   */
  getStatistics(): ReturnType<TransactionJournal['getStatistics']> | { error: string } {
    if (!this.journal) {
      return { error: 'Journal not initialized' };
    }
    return this.journal.getStatistics();
  }

  /**
   * Close the transaction system
   */
  close(): void {
    if (this.journal) {
      this.journal.close();
      this.journal = null;
    }
  }
}

export default TransactionalFileOperations;

/**
 * File Organization Saga - Orchestrates file operations with rollback support
 * Implements the Saga pattern for transactional file operations
 */
import { promises as fs } from 'fs';
import path from 'path';
import TransactionJournal from './TransactionJournal';
import { logger } from '../../../shared/logger';
import FileOperationError from '../../../shared/errors/FileOperationError';

logger.setContext('FileOrganizationSaga');

interface FileOperation {
  type: 'move' | 'copy' | 'delete';
  source: string;
  destination: string;
}

interface OperationResult {
  success: boolean;
  operation: FileOperation;
  step: number;
}

interface RollbackResult {
  success: boolean;
  step: number;
  message?: string;
  error?: string;
}

interface ExecuteResult {
  success: boolean;
  transactionId: string;
  results: OperationResult[];
  successCount: number;
  failCount: number;
  failedStep?: number;
  error?: string;
  rollbackResults?: RollbackResult[];
  rolledBack?: boolean;
}

interface RecoveryResult {
  transactionId: string;
  success: boolean;
  rollbackResults?: RollbackResult[];
  error?: string;
}

interface DbOperation {
  id: number;
  step_number: number;
  operation_type: string;
  source_path: string;
  destination_path: string;
}

class FileOrganizationSaga {
  private journal: TransactionJournal;
  private static readonly MAX_COLLISION_RETRIES = 100;

  /**
   * @param journalPath - Path to transaction journal database
   */
  constructor(journalPath: string) {
    this.journal = new TransactionJournal(journalPath);
  }

  /**
   * Generate a unique filename when destination already exists
   * Appends _1, _2, etc. to the base name until finding an available name
   * @private
   */
  private async _generateUniqueFilename(originalPath: string): Promise<string> {
    const dir = path.dirname(originalPath);
    const ext = path.extname(originalPath);
    const baseName = path.basename(originalPath, ext);

    for (
      let counter = 1;
      counter <= FileOrganizationSaga.MAX_COLLISION_RETRIES;
      counter++
    ) {
      const candidate = path.join(dir, `${baseName}_${counter}${ext}`);
      try {
        await fs.access(candidate);
        // File exists, try next number
      } catch {
        // File doesn't exist, use this name
        return candidate;
      }
    }

    // Fallback: use UUID-style suffix
    const uuid =
      Date.now().toString(36) + Math.random().toString(36).substr(2, 5);
    return path.join(dir, `${baseName}_${uuid}${ext}`);
  }

  /**
   * Execute a batch of file operations transactionally
   *
   * @param operations - Array of operations {type, source, destination}
   * @returns Result with success status and details
   */
  async execute(operations: FileOperation[]): Promise<ExecuteResult> {
    const txId = this.journal.beginTransaction();
    logger.info('[Saga] Starting transaction', {
      transactionId: txId,
      operationCount: operations.length,
    });

    const results: OperationResult[] = [];
    let stepNumber = 0;

    try {
      for (const op of operations) {
        stepNumber++;

        logger.debug('[Saga] Executing step', {
          transactionId: txId,
          step: stepNumber,
          total: operations.length,
          operation: op.type,
          file: path.basename(op.source),
        });

        // Execute the operation - returns final destination (may differ if collision occurred)
        const finalDestination = await this._executeOperation(op);

        // Create operation record with final destination for proper rollback
        const recordedOp: FileOperation = {
          ...op,
          destination: finalDestination,
        };

        // Record in journal with actual destination used
        this.journal.recordOperation(txId, stepNumber, recordedOp);

        results.push({
          success: true,
          operation: recordedOp,
          step: stepNumber,
        });
      }

      // All operations succeeded - commit
      this.journal.commitTransaction(txId);

      logger.info('[Saga] Transaction committed successfully', {
        transactionId: txId,
        successCount: results.length,
      });

      return {
        success: true,
        transactionId: txId,
        results,
        successCount: results.length,
        failCount: 0,
      };
    } catch (error) {
      // Critical error occurred - rollback
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      const errorStack = error instanceof Error ? error.stack : undefined;

      logger.error('[Saga] Transaction failed, initiating rollback', {
        transactionId: txId,
        failedStep: stepNumber,
        error: errorMessage,
        stack: errorStack,
      });

      const rollbackResults = await this._rollback(txId, errorMessage);

      return {
        success: false,
        transactionId: txId,
        failedStep: stepNumber,
        error: errorMessage,
        results,
        rollbackResults,
        rolledBack: true,
        successCount: results.length,
        failCount: 1,
      };
    }
  }

  /**
   * Execute a single file operation with collision handling
   *
   * @param op - Operation {type, source, destination}
   * @returns The final destination path (may differ from original if collision occurred)
   * @private
   */
  private async _executeOperation(op: FileOperation): Promise<string> {
    const { type, source } = op;
    let destination = op.destination;

    try {
      switch (type) {
        case 'move':
          // Ensure destination directory exists
          await fs.mkdir(path.dirname(destination), { recursive: true });

          // Handle file collision with unique filename generation
          destination = await this._moveWithCollisionHandling(
            source,
            destination,
          );
          break;

        case 'copy':
          await fs.mkdir(path.dirname(destination), { recursive: true });
          destination = await this._copyWithCollisionHandling(
            source,
            destination,
          );
          break;

        case 'delete':
          await fs.unlink(source);
          break;

        default:
          throw new Error(`Unknown operation type: ${type}`);
      }

      return destination;
    } catch (error) {
      // Wrap in FileOperationError for better error handling
      throw new FileOperationError(type, source, error);
    }
  }

  /**
   * Move file with collision handling - retries with unique name if destination exists
   * @private
   */
  private async _moveWithCollisionHandling(
    source: string,
    destination: string,
  ): Promise<string> {
    let finalDest = destination;
    let attempts = 0;
    const maxAttempts = 10;

    while (attempts < maxAttempts) {
      try {
        // Atomic rename (same filesystem) or copy+delete (cross-filesystem)
        try {
          await fs.rename(source, finalDest);
          return finalDest;
        } catch (renameError: any) {
          if (renameError.code === 'EXDEV') {
            // Cross-device move: copy then delete
            await fs.copyFile(source, finalDest);
            await fs.unlink(source);
            return finalDest;
          } else if (renameError.code === 'EEXIST') {
            // Destination exists - generate unique name
            attempts++;
            finalDest = await this._generateUniqueFilename(destination);
            logger.debug('[Saga] File collision detected, using unique name', {
              originalDest: path.basename(destination),
              newDest: path.basename(finalDest),
            });
            continue;
          } else {
            throw renameError;
          }
        }
      } catch (error: any) {
        if (error.code === 'EEXIST') {
          // Destination exists - generate unique name
          attempts++;
          finalDest = await this._generateUniqueFilename(destination);
          continue;
        }
        throw error;
      }
    }

    throw new Error(
      `Failed to move file after ${maxAttempts} collision attempts`,
    );
  }

  /**
   * Copy file with collision handling
   * @private
   */
  private async _copyWithCollisionHandling(
    source: string,
    destination: string,
  ): Promise<string> {
    let finalDest = destination;
    let attempts = 0;
    const maxAttempts = 10;

    while (attempts < maxAttempts) {
      try {
        await fs.copyFile(source, finalDest, fs.constants.COPYFILE_EXCL);
        return finalDest;
      } catch (error: any) {
        if (error.code === 'EEXIST') {
          attempts++;
          finalDest = await this._generateUniqueFilename(destination);
          logger.debug('[Saga] Copy collision detected, using unique name', {
            originalDest: path.basename(destination),
            newDest: path.basename(finalDest),
          });
          continue;
        }
        throw error;
      }
    }

    throw new Error(
      `Failed to copy file after ${maxAttempts} collision attempts`,
    );
  }

  /**
   * Rollback a failed transaction
   *
   * @param txId - Transaction ID
   * @param errorMessage - Why rollback is needed
   * @returns Rollback results
   * @private
   */
  private async _rollback(
    txId: string,
    errorMessage: string,
  ): Promise<RollbackResult[]> {
    logger.warn('[Saga] Executing rollback', {
      transactionId: txId,
      reason: errorMessage,
    });

    const operations = this.journal.getOperationsForRollback(txId);
    const rollbackResults: RollbackResult[] = [];

    for (const op of operations) {
      try {
        logger.debug('[Saga] Rolling back operation', {
          transactionId: txId,
          step: op.step_number,
          operation: op.operation_type,
        });

        // Reverse the operation
        if (op.operation_type === 'move') {
          // Move back to original location
          try {
            await fs.rename(op.destination_path, op.source_path);
          } catch (renameError: any) {
            if (renameError.code === 'EXDEV') {
              // Cross-device: copy back then delete
              await fs.copyFile(op.destination_path, op.source_path);
              await fs.unlink(op.destination_path);
            } else {
              throw renameError;
            }
          }

          rollbackResults.push({
            success: true,
            step: op.step_number,
            message: 'Moved back to original location',
          });
        } else if (op.operation_type === 'copy') {
          // Delete the copy
          await fs.unlink(op.destination_path);

          rollbackResults.push({
            success: true,
            step: op.step_number,
            message: 'Copy removed',
          });
        } else if (op.operation_type === 'delete') {
          // Cannot restore deleted files
          rollbackResults.push({
            success: false,
            step: op.step_number,
            message: 'Cannot restore deleted file',
          });
        }

        // Mark operation as rolled back in journal
        this.journal.markOperationRolledBack(op.id);
      } catch (rollbackError) {
        const rollbackErrorMessage =
          rollbackError instanceof Error
            ? rollbackError.message
            : String(rollbackError);
        const rollbackErrorStack =
          rollbackError instanceof Error ? rollbackError.stack : undefined;

        logger.error('[Saga] Rollback failed for operation', {
          transactionId: txId,
          step: op.step_number,
          error: rollbackErrorMessage,
          stack: rollbackErrorStack,
        });

        rollbackResults.push({
          success: false,
          step: op.step_number,
          error: rollbackErrorMessage,
        });
      }
    }

    // Mark transaction as rolled back
    this.journal.markTransactionRolledBack(txId, errorMessage);

    const successCount = rollbackResults.filter((r) => r.success).length;
    logger.warn('[Saga] Rollback complete', {
      transactionId: txId,
      total: operations.length,
      succeeded: successCount,
      failed: operations.length - successCount,
    });

    return rollbackResults;
  }

  /**
   * Recover incomplete transactions (called on app startup)
   * Rolls back any transactions that were active when app crashed
   *
   * @returns Recovery results
   */
  async recoverIncompleteTransactions(): Promise<RecoveryResult[]> {
    const incomplete = this.journal.findIncompleteTransactions();

    if (incomplete.length === 0) {
      logger.info('[Saga] No incomplete transactions to recover');
      return [];
    }

    logger.warn('[Saga] Recovering incomplete transactions', {
      count: incomplete.length,
    });

    const recoveryResults: RecoveryResult[] = [];

    for (const tx of incomplete) {
      logger.info('[Saga] Rolling back incomplete transaction', {
        transactionId: tx.id,
        createdAt: new Date(tx.created_at).toISOString(),
      });

      try {
        const rollbackResults = await this._rollback(
          tx.id,
          'Recovery: Application crashed during transaction',
        );

        recoveryResults.push({
          transactionId: tx.id,
          success: true,
          rollbackResults,
        });
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : String(error);

        logger.error('[Saga] Recovery failed for transaction', {
          transactionId: tx.id,
          error: errorMessage,
        });

        recoveryResults.push({
          transactionId: tx.id,
          success: false,
          error: errorMessage,
        });
      }
    }

    logger.info('[Saga] Recovery complete', {
      recovered: recoveryResults.filter((r) => r.success).length,
      failed: recoveryResults.filter((r) => !r.success).length,
    });

    return recoveryResults;
  }

  /**
   * Get statistics about transactions
   *
   * @returns Statistics
   */
  getStatistics(): ReturnType<TransactionJournal['getStatistics']> {
    return this.journal.getStatistics();
  }

  /**
   * Close the saga (cleanup)
   */
  close(): void {
    this.journal.close();
  }
}

export default FileOrganizationSaga;

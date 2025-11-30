/**
 * Atomic File Operations System
 *
 * Provides transactional file operations with rollback capabilities
 * to prevent data loss during file organization. Addresses the safety
 * concerns identified in the architectural analysis.
 */

const fs = require('fs').promises;
const path = require('path');
const crypto = require('crypto');
const { logger } = require('./logger');

// Import FileSystemError - handle case where it might not exist yet in shared context
let FileSystemError, AtomicOperationError, IntegrityError, FILE_SYSTEM_ERROR_CODES;
try {
  const fsErrors = require('../main/errors/FileSystemError');
  FileSystemError = fsErrors.FileSystemError;
  AtomicOperationError = fsErrors.AtomicOperationError;
  IntegrityError = fsErrors.IntegrityError;
  FILE_SYSTEM_ERROR_CODES = fsErrors.FILE_SYSTEM_ERROR_CODES;
} catch {
  // Fallback - create minimal error wrapper if FileSystemError not available
  FileSystemError = class FileSystemError extends Error {
    constructor(code, metadata = {}) {
      super(metadata.originalError || code);
      this.code = code;
      this.metadata = metadata;
      this.isFileSystemError = true;
    }
    getUserFriendlyMessage() {
      return this.message;
    }
    static fromNodeError(error, context = {}) {
      const err = new FileSystemError(error.code || 'UNKNOWN', {
        ...context,
        originalError: error.message,
      });
      return err;
    }
  };
  AtomicOperationError = FileSystemError;
  IntegrityError = FileSystemError;
  FILE_SYSTEM_ERROR_CODES = {
    ATOMIC_OPERATION_FAILED: 'ATOMIC_OPERATION_FAILED',
    ROLLBACK_FAILED: 'ROLLBACK_FAILED',
    SIZE_MISMATCH: 'SIZE_MISMATCH',
    CHECKSUM_MISMATCH: 'CHECKSUM_MISMATCH',
    FILE_NOT_FOUND: 'FILE_NOT_FOUND',
    WRITE_FAILED: 'WRITE_FAILED',
  };
}

logger.setContext('AtomicFileOperations');

/**
 * Transaction-based file operation manager
 */
class AtomicFileOperations {
  constructor() {
    this.activeTransactions = new Map();
    this.backupDirectory = null;
    this.operationTimeout = 30000; // 30 seconds
  }

  /**
   * Initialize backup directory for transaction safety
   */
  async initializeBackupDirectory() {
    if (this.backupDirectory) return this.backupDirectory;

    const tempDir = require('os').tmpdir();
    this.backupDirectory = path.join(
      tempDir,
      'stratosort-backups',
      Date.now().toString(),
    );

    try {
      await fs.mkdir(this.backupDirectory, { recursive: true });
      logger.debug('[ATOMIC-OPS] Initialized backup directory:', this.backupDirectory);
      return this.backupDirectory;
    } catch (error) {
      const fsError = FileSystemError.fromNodeError(error, {
        path: this.backupDirectory,
        operation: 'initializeBackupDirectory',
      });
      logger.error('[ATOMIC-OPS] Failed to initialize backup directory:', {
        path: this.backupDirectory,
        error: fsError.getUserFriendlyMessage(),
      });
      throw new AtomicOperationError('initializeBackup', error, {
        path: this.backupDirectory,
      });
    }
  }

  /**
   * Generate unique transaction ID
   */
  generateTransactionId() {
    return crypto.randomBytes(16).toString('hex');
  }

  /**
   * Create a backup of a file before modification
   */
  async createBackup(filePath, transactionId) {
    await this.initializeBackupDirectory();

    const filename = path.basename(filePath);
    const backupPath = path.join(
      this.backupDirectory,
      `${transactionId}_${filename}`,
    );

    try {
      await fs.copyFile(filePath, backupPath);

      // Verify backup integrity
      const [sourceStats, backupStats] = await Promise.all([
        fs.stat(filePath),
        fs.stat(backupPath),
      ]);

      if (sourceStats.size !== backupStats.size) {
        // Clean up failed backup
        await fs.unlink(backupPath).catch(() => {});
        throw new IntegrityError(FILE_SYSTEM_ERROR_CODES.SIZE_MISMATCH, backupPath, {
          expectedSize: sourceStats.size,
          actualSize: backupStats.size,
          operation: 'backup',
        });
      }

      logger.debug('[ATOMIC-OPS] Created backup:', {
        source: filePath,
        backup: backupPath,
        size: sourceStats.size,
      });

      return backupPath;
    } catch (error) {
      if (error.isFileSystemError) {
        throw error;
      }

      const fsError = FileSystemError.fromNodeError(error, {
        path: filePath,
        operation: 'createBackup',
      });
      logger.error('[ATOMIC-OPS] Backup creation failed:', {
        source: filePath,
        backup: backupPath,
        error: fsError.getUserFriendlyMessage(),
      });
      throw new AtomicOperationError('createBackup', error, {
        source: filePath,
        backup: backupPath,
      });
    }
  }

  /**
   * Begin a new atomic transaction
   */
  async beginTransaction(operations = []) {
    const transactionId = this.generateTransactionId();
    const transaction = {
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
  addOperation(transactionId, operation) {
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
  async executeOperation(transactionId, operation) {
    const transaction = this.activeTransactions.get(transactionId);
    if (!transaction) {
      throw new Error(`Transaction ${transactionId} not found`);
    }

    const { type, source, destination, data } = operation;

    let backupPath = null;

    // Create backup for existing files
    if (type === 'move' || type === 'copy') {
      if (await this.fileExists(source)) {
        backupPath = await this.createBackup(source, transactionId);
        transaction.backups.push({ source, backup: backupPath });
      }
    }

    // Execute the operation
    switch (type) {
      case 'move':
        await this.atomicMove(source, destination);
        break;
      case 'copy':
        await this.atomicCopy(source, destination);
        break;
      case 'create':
        await this.atomicCreate(destination, data);
        break;
      case 'delete':
        if (await this.fileExists(source)) {
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
  async atomicMove(source, destination) {
    // Ensure destination directory exists
    try {
      await fs.mkdir(path.dirname(destination), { recursive: true });
    } catch (mkdirError) {
      const fsError = FileSystemError.fromNodeError(mkdirError, {
        path: path.dirname(destination),
        operation: 'mkdir',
      });
      logger.error('[ATOMIC-OPS] Failed to create destination directory:', {
        path: path.dirname(destination),
        error: fsError.getUserFriendlyMessage(),
      });
      throw fsError;
    }

    // Retry loop to handle race conditions atomically
    let finalDestination = destination;
    let attempts = 0;
    const maxAttempts = 10;

    while (attempts < maxAttempts) {
      try {
        // Try rename first (atomic operation)
        await fs.rename(source, finalDestination);
        logger.debug('[ATOMIC-OPS] Moved file:', { source, destination: finalDestination });
        return finalDestination;
      } catch (error) {
        if (error.code === 'EEXIST') {
          // Destination exists, generate unique name and retry
          attempts++;
          finalDestination = await this.generateUniqueFilename(destination);
          continue;
        } else if (error.code === 'EXDEV') {
          // Cross-device move: copy then delete with verification
          try {
            await fs.copyFile(source, finalDestination);

            // Verify copy succeeded
            const [sourceStats, destStats] = await Promise.all([
              fs.stat(source),
              fs.stat(finalDestination),
            ]);

            if (sourceStats.size !== destStats.size) {
              await fs.unlink(finalDestination).catch((unlinkError) => {
                logger.warn(
                  '[ATOMIC-OPS] Failed to cleanup file after size mismatch',
                  {
                    path: finalDestination,
                    error: unlinkError.message,
                  },
                );
              });
              throw new IntegrityError(FILE_SYSTEM_ERROR_CODES.SIZE_MISMATCH, finalDestination, {
                expectedSize: sourceStats.size,
                actualSize: destStats.size,
                operation: 'move',
              });
            }

            await fs.unlink(source);
            logger.debug('[ATOMIC-OPS] Cross-device move completed:', {
              source,
              destination: finalDestination,
            });
            return finalDestination;
          } catch (copyError) {
            if (copyError.isFileSystemError) {
              throw copyError;
            }
            const fsError = FileSystemError.fromNodeError(copyError, {
              path: source,
              operation: 'crossDeviceMove',
            });
            throw fsError;
          }
        } else if (error.code === 'ENOENT' && attempts === 0) {
          throw new FileSystemError(FILE_SYSTEM_ERROR_CODES.FILE_NOT_FOUND, {
            path: source,
            operation: 'move',
          });
        } else {
          const fsError = FileSystemError.fromNodeError(error, {
            path: source,
            operation: 'move',
            destination: finalDestination,
          });
          throw fsError;
        }
      }
    }

    throw new AtomicOperationError('move', null, {
      source,
      destination,
      attempts: maxAttempts,
      reason: 'naming conflicts exhausted',
    });
  }

  /**
   * Atomic copy operation
   * Fixed: Added retry logic to prevent race conditions
   */
  async atomicCopy(source, destination) {
    try {
      await fs.mkdir(path.dirname(destination), { recursive: true });
    } catch (mkdirError) {
      const fsError = FileSystemError.fromNodeError(mkdirError, {
        path: path.dirname(destination),
        operation: 'mkdir',
      });
      logger.error('[ATOMIC-OPS] Failed to create destination directory:', {
        path: path.dirname(destination),
        error: fsError.getUserFriendlyMessage(),
      });
      throw fsError;
    }

    // Retry loop to handle race conditions atomically
    let finalDestination = destination;
    let attempts = 0;
    const maxAttempts = 10;

    while (attempts < maxAttempts) {
      try {
        // Try to copy with exclusive flag to detect conflicts early
        await fs.copyFile(source, finalDestination, fs.constants.COPYFILE_EXCL);

        // Verify copy integrity
        const [sourceStats, destStats] = await Promise.all([
          fs.stat(source),
          fs.stat(finalDestination),
        ]);

        if (sourceStats.size !== destStats.size) {
          await fs.unlink(finalDestination).catch(() => {});
          throw new IntegrityError(FILE_SYSTEM_ERROR_CODES.SIZE_MISMATCH, finalDestination, {
            expectedSize: sourceStats.size,
            actualSize: destStats.size,
            operation: 'copy',
          });
        }

        logger.debug('[ATOMIC-OPS] Copied file:', { source, destination: finalDestination });
        return finalDestination;
      } catch (error) {
        if (error.isFileSystemError) {
          throw error;
        }
        if (error.code === 'EEXIST') {
          // Destination exists, generate unique name and retry
          attempts++;
          finalDestination = await this.generateUniqueFilename(destination);
          continue;
        } else if (error.code === 'ENOENT') {
          throw new FileSystemError(FILE_SYSTEM_ERROR_CODES.FILE_NOT_FOUND, {
            path: source,
            operation: 'copy',
          });
        } else {
          const fsError = FileSystemError.fromNodeError(error, {
            path: source,
            operation: 'copy',
            destination: finalDestination,
          });
          throw fsError;
        }
      }
    }

    throw new AtomicOperationError('copy', null, {
      source,
      destination,
      attempts: maxAttempts,
      reason: 'naming conflicts exhausted',
    });
  }

  /**
   * Atomic create operation - writes to temp file first, then renames
   * This ensures the file is complete before becoming visible
   */
  async atomicCreate(filePath, data) {
    try {
      await fs.mkdir(path.dirname(filePath), { recursive: true });
    } catch (mkdirError) {
      const fsError = FileSystemError.fromNodeError(mkdirError, {
        path: path.dirname(filePath),
        operation: 'mkdir',
      });
      logger.error('[ATOMIC-OPS] Failed to create directory for file:', {
        path: path.dirname(filePath),
        error: fsError.getUserFriendlyMessage(),
      });
      throw fsError;
    }

    const tempFile = `${filePath}.tmp.${Date.now()}.${crypto.randomBytes(4).toString('hex')}`;

    try {
      // Write to temp file first
      await fs.writeFile(tempFile, data);

      // Verify write succeeded by checking size
      const tempStats = await fs.stat(tempFile);
      const expectedSize = Buffer.isBuffer(data) ? data.length : Buffer.byteLength(data);

      if (tempStats.size !== expectedSize) {
        throw new IntegrityError(FILE_SYSTEM_ERROR_CODES.PARTIAL_WRITE, tempFile, {
          expectedSize,
          actualSize: tempStats.size,
          operation: 'create',
        });
      }

      // Atomic rename to final destination
      await fs.rename(tempFile, filePath);

      logger.debug('[ATOMIC-OPS] Created file atomically:', {
        path: filePath,
        size: expectedSize,
      });

      return filePath;
    } catch (error) {
      // Cleanup temp file on failure
      try {
        await fs.unlink(tempFile);
      } catch (cleanupError) {
        // Log but don't fail - cleanup is best effort
        logger.warn('[ATOMIC-OPS] Failed to cleanup temp file:', {
          tempFile,
          error: cleanupError.message,
        });
      }

      if (error.isFileSystemError) {
        throw error;
      }

      const fsError = FileSystemError.fromNodeError(error, {
        path: filePath,
        operation: 'create',
      });
      throw fsError;
    }
  }

  /**
   * Generate unique filename to avoid conflicts
   */
  async generateUniqueFilename(originalPath) {
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
  async fileExists(filePath) {
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
  async commitTransaction(transactionId) {
    const transaction = this.activeTransactions.get(transactionId);
    if (!transaction) {
      throw new Error(`Transaction ${transactionId} not found`);
    }

    if (transaction.status !== 'active') {
      throw new Error(`Transaction ${transactionId} is not active`);
    }

    const results = [];
    let failedOperation = null;

    try {
      // Set timeout for the entire transaction
      let timeoutId;
      const timeoutPromise = new Promise((_, reject) => {
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
            failedOperation = operation;
            throw error;
          }
        }
      })();

      await Promise.race([operationPromise, timeoutPromise]);
      clearTimeout(timeoutId);

      transaction.status = 'committed';
      // Transaction committed successfully

      // Clean up old backups after successful commit (optional)
      const cleanupTimer = setTimeout(
        () => this.cleanupBackups(transactionId),
        60000,
      ); // 1 minute delay
      cleanupTimer.unref();

      return { success: true, results };
    } catch (error) {
      // Transaction failed, will be rolled back

      // Attempt to rollback
      try {
        await this.rollbackTransaction(transactionId);
        return {
          success: false,
          error: error.message,
          failedOperation: failedOperation?.id,
          rollbackSuccessful: true,
        };
      } catch (rollbackError) {
        // Rollback failed - this is a critical error but we can't do much about it
        return {
          success: false,
          error: error.message,
          failedOperation: failedOperation?.id,
          rollbackSuccessful: false,
          rollbackError: rollbackError.message,
        };
      }
    }
  }

  /**
   * Rollback a transaction using backups
   */
  async rollbackTransaction(transactionId) {
    const transaction = this.activeTransactions.get(transactionId);
    if (!transaction) {
      throw new AtomicOperationError('rollback', null, {
        transactionId,
        reason: 'Transaction not found',
      });
    }

    logger.info('[ATOMIC-OPS] Rolling back transaction:', {
      transactionId,
      backupCount: transaction.backups.length,
    });

    // Rolling back transaction
    transaction.status = 'rolling_back';

    const rollbackErrors = [];
    let restoredCount = 0;

    // Restore files from backups in reverse order (LIFO)
    for (let i = transaction.backups.length - 1; i >= 0; i--) {
      const { source, backup } = transaction.backups[i];

      try {
        // Check if backup exists
        if (await this.fileExists(backup)) {
          // Ensure source directory exists
          try {
            await fs.mkdir(path.dirname(source), { recursive: true });
          } catch (mkdirError) {
            logger.warn('[ATOMIC-OPS] Failed to create directory during rollback:', {
              path: path.dirname(source),
              error: mkdirError.message,
            });
            // Continue with rollback attempt anyway
          }

          // Restore the file
          await fs.copyFile(backup, source);

          // Verify restore succeeded
          const [backupStats, restoredStats] = await Promise.all([
            fs.stat(backup),
            fs.stat(source),
          ]);

          if (backupStats.size !== restoredStats.size) {
            logger.error('[ATOMIC-OPS] Restore verification failed:', {
              backup,
              source,
              expectedSize: backupStats.size,
              actualSize: restoredStats.size,
            });
            rollbackErrors.push({
              source,
              error: 'Size mismatch after restore',
              code: FILE_SYSTEM_ERROR_CODES.SIZE_MISMATCH,
            });
          } else {
            restoredCount++;
            logger.debug('[ATOMIC-OPS] Restored file from backup:', {
              source,
              backup,
            });
          }
        } else {
          logger.warn('[ATOMIC-OPS] Backup file not found during rollback:', backup);
          rollbackErrors.push({
            source,
            error: 'Backup file not found',
            code: FILE_SYSTEM_ERROR_CODES.FILE_NOT_FOUND,
          });
        }
      } catch (error) {
        const errorInfo = error.isFileSystemError
          ? { message: error.getUserFriendlyMessage(), code: error.code }
          : { message: error.message, code: error.code || 'UNKNOWN' };

        logger.error('[ATOMIC-OPS] Error during rollback:', {
          source,
          backup,
          ...errorInfo,
        });

        rollbackErrors.push({
          source,
          error: errorInfo.message,
          code: errorInfo.code,
        });
      }
    }

    transaction.status = 'rolled_back';

    logger.info('[ATOMIC-OPS] Rollback completed:', {
      transactionId,
      restoredCount,
      errorCount: rollbackErrors.length,
    });

    if (rollbackErrors.length > 0) {
      const error = new AtomicOperationError('rollback', null, {
        transactionId,
        rollbackErrors,
        restoredCount,
        totalBackups: transaction.backups.length,
      });
      error.rollbackErrors = rollbackErrors;
      throw error;
    }

    // Transaction rolled back successfully
    return { success: true, restoredCount };
  }

  /**
   * Clean up backup files for a transaction
   */
  async cleanupBackups(transactionId) {
    const transaction = this.activeTransactions.get(transactionId);
    if (!transaction) return;

    for (const { backup } of transaction.backups) {
      try {
        if (await this.fileExists(backup)) {
          await fs.unlink(backup);
        }
      } catch (error) {
        // Ignore cleanup errors
      }
    }

    // Remove from active transactions
    this.activeTransactions.delete(transactionId);
  }

  /**
   * Get transaction status
   */
  getTransactionStatus(transactionId) {
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
  getActiveTransactions() {
    return Array.from(this.activeTransactions.keys()).map((id) =>
      this.getTransactionStatus(id),
    );
  }

  /**
   * Force cleanup of stale transactions
   */
  async cleanupStaleTransactions(maxAge = 3600000) {
    // 1 hour
    const now = Date.now();
    const staleTransactions = [];

    for (const [id, transaction] of this.activeTransactions) {
      if (now - transaction.startTime > maxAge) {
        staleTransactions.push(id);
      }
    }

    for (const id of staleTransactions) {
      try {
        await this.cleanupBackups(id);
      } catch (error) {
        // Ignore cleanup errors for stale transactions
      }
    }

    return staleTransactions.length;
  }
}

// Export singleton instance
const atomicFileOps = new AtomicFileOperations();

module.exports = {
  AtomicFileOperations,
  atomicFileOps,

  // Convenience functions
  async organizeFilesAtomically(operations) {
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
  },

  async backupAndReplace(filePath, newContent) {
    const transactionId = await atomicFileOps.beginTransaction();

    atomicFileOps.addOperation(transactionId, {
      type: 'create',
      destination: filePath,
      data: newContent,
    });

    return await atomicFileOps.commitTransaction(transactionId);
  },
};

/**
 * Error for file operation failures
 */
import StratoSortError from './StratoSortError';
import path from 'path';

class FileOperationError extends StratoSortError {
  operation: string;
  filePath: string;
  originalError: Error;

  /**
   * @param operation - Operation type (move, copy, delete, etc.)
   * @param filePath - Path to file that failed
   * @param originalError - The original error that occurred
   */
  constructor(operation: string, filePath: string, originalError: Error) {
    const fileName = path.basename(filePath);

    super(
      `File operation '${operation}' failed for ${filePath}: ${originalError.message}`,
      `FILE_${operation.toUpperCase()}_FAILED`,
      {
        operation,
        filePath,
        fileName,
        errorCode: (originalError as any).code,
        originalError: originalError.message,
      },
      `Unable to ${operation} file: ${fileName}`,
      FileOperationError._getRecoveryActions(operation, originalError)
    );

    this.operation = operation;
    this.filePath = filePath;
    this.originalError = originalError;
  }

  static _getRecoveryActions(
    operation: string,
    error: Error & { code?: string }
  ): Array<{
    label: string;
    action: string;
    description: string;
  }> {
    const actions: Array<{
      label: string;
      action: string;
      description: string;
    }> = [];

    // Permission errors
    if (error.code === 'EACCES' || error.code === 'EPERM') {
      actions.push({
        label: 'Check file permissions',
        action: 'checkPermissions',
        description:
          'Ensure you have permission to access this file. Try running as administrator or changing file permissions.',
      });
    }

    // Disk space errors
    if (error.code === 'ENOSPC') {
      actions.push({
        label: 'Free up disk space',
        action: 'checkDiskSpace',
        description:
          'Your disk is full. Delete some files or move them to another drive and try again.',
      });
    }

    // File not found errors
    if (error.code === 'ENOENT') {
      actions.push({
        label: 'Refresh file list',
        action: 'refresh',
        description:
          'The file may have been moved or deleted by another program. Refresh the file list.',
      });
    }

    // File in use errors
    if (error.code === 'EBUSY') {
      actions.push({
        label: 'Close the file',
        action: 'closeFile',
        description:
          'The file is currently open in another program. Close it and try again.',
      });
    }

    // Always offer retry
    actions.push({
      label: 'Try again',
      action: 'retry',
      description: 'Retry the operation',
    });

    return actions;
  }
}

export default FileOperationError;

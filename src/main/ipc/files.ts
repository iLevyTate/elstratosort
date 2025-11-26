import path from 'path';
import { promises as fs } from 'fs';
import { app } from 'electron';
import { z } from 'zod';
import {
  SUPPORTED_DOCUMENT_EXTENSIONS,
  SUPPORTED_IMAGE_EXTENSIONS,
  SUPPORTED_ARCHIVE_EXTENSIONS,
  ACTION_TYPES,
} from '../../shared/constants';
import { TIMEOUTS } from '../../shared/performanceConstants';
import { validateIpc, withRequestId, withErrorHandling, compose } from './validation';
import {
  FileOpenSchema,
  FileDeleteSchema,
  FileMoveSchema,
} from './schemas';
import { logger } from '../../shared/logger';
import { FileOrganizationSaga } from '../services/transaction';
import { getInstance as getChromaDB } from '../services/ChromaDBService';

logger.setContext('IPC:Files');

// Global saga instance (initialized on first use)
let saga: FileOrganizationSaga | null = null;

/**
 * Initialize the file organization saga
 */
function initializeSaga(): FileOrganizationSaga {
  if (saga) return saga;

  const journalPath = path.join(app.getPath('userData'), 'transaction-journal.db');
  saga = new FileOrganizationSaga(journalPath);

  // Recover any incomplete transactions from previous crashes
  saga.recoverIncompleteTransactions().catch((error) => {
    logger.error('[Saga] Recovery failed', { error: error.message });
  });

  logger.info('[Saga] Initialized', { journalPath });
  return saga;
}

// CRITICAL SECURITY FIX: Resource limits to prevent DOS attacks (CRIT-8)
const MAX_BATCH_SIZE = 1000; // Maximum operations per batch

/**
 * Shared batch organize handler logic
 * Uses FileOrganizationSaga for transactional operations with rollback
 */
interface BatchOperation {
  operations?: Array<{ source: string; destination: string; type?: string }>;
}

interface BatchOrganizeParams {
  operation: BatchOperation;
  logger: typeof import('../../shared/logger').logger;
  getServiceIntegration: () => unknown;
  getMainWindow?: () => Electron.BrowserWindow | null;
}

interface BatchOrganizeResult {
  success: boolean;
  error?: string;
  errorCode?: string;
  maxAllowed?: number;
  provided?: number;
  results?: unknown[];
  successCount?: number;
  failureCount?: number;
  failCount?: number;
  rollbackCount?: number;
  transactionId?: string;
  rolledBack?: boolean;
  rollbackResults?: Array<{ success: boolean }>;
  failedStep?: unknown;
  summary?: string;
}

async function handleBatchOrganize({
  operation,
  logger,
  getServiceIntegration,
  getMainWindow,
}: BatchOrganizeParams): Promise<BatchOrganizeResult> {
  // Initialize saga (lazy initialization)
  const fileSaga = initializeSaga();

  // Validate batch
  if (!operation.operations || !Array.isArray(operation.operations)) {
    return {
      success: false,
      error: 'Invalid batch: operations must be an array',
      errorCode: 'INVALID_BATCH',
    };
  }

  if (operation.operations.length === 0) {
    return {
      success: false,
      error: 'Invalid batch: no operations provided',
      errorCode: 'EMPTY_BATCH',
    };
  }

  if (operation.operations.length > MAX_BATCH_SIZE) {
    logger.warn(
      `[FILE-OPS] Batch size ${operation.operations.length} exceeds maximum ${MAX_BATCH_SIZE}`,
    );
    return {
      success: false,
      error: `Batch size exceeds maximum of ${MAX_BATCH_SIZE} operations`,
      errorCode: 'BATCH_TOO_LARGE',
      maxAllowed: MAX_BATCH_SIZE,
      provided: operation.operations.length,
    };
  }

  logger.info(`[FILE-OPS] Starting batch operation with ${operation.operations.length} files`);

  // Execute with saga (handles rollback automatically)
  const sagaResult = await fileSaga.execute(operation.operations);

  if (sagaResult.success) {
    // Update ChromaDB paths after successful operation
    try {const chromaDbService = getChromaDB();

      if (chromaDbService && sagaResult.results.length > 0) {
        const pathUpdates = sagaResult.results
          .filter((r: { success: boolean; operation: { source?: string; destination?: string } }) => r.success && r.operation.source && r.operation.destination)
          .map((r: { operation: { source: string; destination: string } }) => ({
            oldId: `file:${r.operation.source}`,
            newId: `file:${r.operation.destination}`,
            newMeta: {
              path: r.operation.destination,
              name: path.basename(r.operation.destination),
            },
          }));

        if (pathUpdates.length > 0) {
          logger.info('[FILE-OPS] Updating database paths after organization', {
            count: pathUpdates.length,
            transactionId: sagaResult.transactionId,
          });

          await chromaDbService.updateFilePaths(pathUpdates).catch((error) => {
            logger.warn('[FILE-OPS] Failed to update database paths (non-fatal)', {
              error: error.message,
              transactionId: sagaResult.transactionId,
            });
          });
        }
      }
    } catch (dbError: unknown) {
      logger.warn('[FILE-OPS] Error updating database paths (non-fatal)', {
        error: dbError instanceof Error ? dbError.message : String(dbError),
        transactionId: sagaResult.transactionId,
      });
    }

    // Record undo operation
    try {
      const undoOps = sagaResult.results.map((r: { operation: { source: string; destination: string } }) => ({
        type: 'move',
        originalPath: r.operation.source,
        newPath: r.operation.destination,
      }));

      await getServiceIntegration()?.undoRedo?.recordAction?.(
        ACTION_TYPES.BATCH_OPERATION,
        { operations: undoOps }
      );
    } catch {
      // Non-fatal if undo recording fails
    }

    return {
      success: true,
      results: sagaResult.results,
      transactionId: sagaResult.transactionId,
      successCount: sagaResult.successCount,
      failCount: 0,
      summary: `Successfully organized ${sagaResult.successCount} files`,
    };
  } else {
    // Operation failed and was rolled back
    return {
      success: false,
      error: sagaResult.error,
      transactionId: sagaResult.transactionId,
      rolledBack: true,
      rollbackResults: sagaResult.rollbackResults,
      failedStep: sagaResult.failedStep,
      results: sagaResult.results,
      successCount: 0,
      failCount: operation.operations.length,
      summary:
        `Batch operation failed and was rolled back. ` +
        `Reason: ${sagaResult.error}. ` +
        `Rolled back ${sagaResult.rollbackResults.filter((r: { success: boolean }) => r.success).length}/${sagaResult.rollbackResults.length} operations.`,
    };
  }
}
interface IpcChannels {
  SELECT: string;
  SELECT_FOLDER: string;
  SELECT_DIRECTORY: string;
  PERFORM_OPERATION: string;
  REVEAL: string;
  REVEAL_FILE: string;
  OPEN: string;
  OPEN_FILE: string;
  OPEN_FOLDER: string;
  DELETE: string;
  DELETE_FILE: string;
  DELETE_FOLDER: string;
  COPY_FILE: string;
  GET_SUPPORTED_EXTENSIONS: string;
  GET_DOCUMENTS_PATH: string;
  GET_FILE_STATS: string;
  CREATE_FOLDER_DIRECT: string;
  GET_FILES_IN_DIRECTORY: string;
}

interface FilesIpcDependencies {
  ipcMain: Electron.IpcMain;
  IPC_CHANNELS: { FILES: IpcChannels };
  logger: typeof import('../../shared/logger').logger;
  dialog: Electron.Dialog;
  shell: Electron.Shell;
  getMainWindow: () => Electron.BrowserWindow | null;
  getServiceIntegration: () => { undoRedo?: { recordAction?: (type: string, data: unknown) => Promise<void> } } | null;
}

export function registerFilesIpc({
  ipcMain,
  IPC_CHANNELS,
  logger,
  dialog,
  shell,
  getMainWindow,
  getServiceIntegration,
}: FilesIpcDependencies): void {
  // Define operation schema for performOperation handler
  const OperationSchema = z.object({
    type: z.enum(['move', 'copy', 'delete', 'batch_organize']),
    source: z.string().optional(),
    destination: z.string().optional(),
    operations: z
      .array(
        z.object({
          source: z.string(),
          destination: z.string(),
          type: z.string().optional(),
        }),
      )
      .optional(),
  });
  // Select files (and folders scanned shallowly)
  ipcMain.handle(
    IPC_CHANNELS.FILES.SELECT,
    compose(
      withErrorHandling,
      withRequestId
    )(async () => {
      logger.info(
        '[MAIN-FILE-SELECT] ===== FILE SELECTION HANDLER CALLED =====',
      );
      const mainWindow = getMainWindow();
      logger.info('[MAIN-FILE-SELECT] mainWindow exists?', !!mainWindow);
      logger.info(
        '[MAIN-FILE-SELECT] mainWindow visible?',
        mainWindow?.isVisible(),
      );
      logger.info(
        '[MAIN-FILE-SELECT] mainWindow focused?',
        mainWindow?.isFocused(),
      );
      try {
        if (mainWindow && !mainWindow.isFocused()) {
          logger.info('[MAIN-FILE-SELECT] Focusing window before dialog...');
          mainWindow.focus();
        }
        if (mainWindow) {
          if (mainWindow.isMinimized()) mainWindow.restore();
          if (!mainWindow.isVisible()) mainWindow.show();
          if (!mainWindow.isFocused()) mainWindow.focus();
          await new Promise((resolve) => {
            const t = setTimeout(resolve, TIMEOUTS.DELAY_BATCH);
            try {
              t.unref();
            } catch {
              // Non-fatal if timer is already cleared
            }
          });
        }
        const result = await dialog.showOpenDialog(mainWindow || null, {
          properties: ['openFile', 'multiSelections', 'dontAddToRecent'],
          title: 'Select Files to Organize',
          buttonLabel: 'Select Files',
          filters: (() => {
            const stripDot = (exts: readonly string[]) =>
              exts.map((e: string) => (e.startsWith('.') ? e.slice(1) : e));
            const docs = stripDot([
              ...SUPPORTED_DOCUMENT_EXTENSIONS,
              '.txt',
              '.md',
              '.rtf',
            ]);
            const images = stripDot(SUPPORTED_IMAGE_EXTENSIONS);
            const archives = stripDot(SUPPORTED_ARCHIVE_EXTENSIONS);
            const allSupported = Array.from(
              new Set([...docs, ...images, ...archives]),
            );
            return [
              { name: 'All Supported Files', extensions: allSupported },
              { name: 'Documents', extensions: docs },
              { name: 'Images', extensions: images },
              { name: 'Archives', extensions: archives },
              { name: 'All Files', extensions: ['*'] },
            ];
          })(),
        });
        logger.info('[MAIN-FILE-SELECT] Dialog closed, result:', result);
        if (result.canceled || !result.filePaths.length)
          return { success: false, files: [] };
        logger.info(
          `[FILE-SELECTION] Selected ${result.filePaths.length} items`,
        );
        const allFiles: string[] = [];
        const supportedExts = Array.from(
          new Set([
            ...SUPPORTED_DOCUMENT_EXTENSIONS,
            ...SUPPORTED_IMAGE_EXTENSIONS,
            ...SUPPORTED_ARCHIVE_EXTENSIONS,
            '.txt',
            '.md',
            '.rtf',
          ]),
        );
        const scanFolder = async (folderPath: string, depth = 0, maxDepth = 3): Promise<string[]> => {
          if (depth > maxDepth) return [];
          try {
            const items = await fs.readdir(folderPath, { withFileTypes: true });
            const foundFiles: string[] = [];
            for (const item of items) {
              const itemPath = path.join(folderPath, item.name);
              if (item.isFile()) {
                const ext = path.extname(item.name).toLowerCase();
                if (supportedExts.includes(ext)) foundFiles.push(itemPath);
              } else if (
                item.isDirectory() &&
                !item.name.startsWith('.') &&
                !item.name.startsWith('node_modules')
              ) {
                const subFiles: string[] = await scanFolder(
                  itemPath,
                  depth + 1,
                  maxDepth,
                );
                foundFiles.push(...subFiles);
              }
            }
            return foundFiles;
          } catch (error: unknown) {
            logger.warn(
              `[FILE-SELECTION] Error scanning folder ${folderPath}:`,
              error instanceof Error ? error.message : String(error),
            );
            return [];
          }
        };
        for (const selectedPath of result.filePaths) {
          try {
            const stats = await fs.stat(selectedPath);
            if (stats.isFile()) {
              const ext = path.extname(selectedPath).toLowerCase();
              if (supportedExts.includes(ext)) {
                allFiles.push(selectedPath);
                logger.info(
                  `[FILE-SELECTION] Added file: ${path.basename(selectedPath)}`,
                );
              }
            } else if (stats.isDirectory()) {
              logger.info(`[FILE-SELECTION] Scanning folder: ${selectedPath}`);
              const folderFiles = await scanFolder(selectedPath);
              allFiles.push(...folderFiles);
              logger.info(
                `[FILE-SELECTION] Found ${folderFiles.length} files in folder: ${path.basename(selectedPath)}`,
              );
            }
          } catch (error: unknown) {
            logger.warn(
              `[FILE-SELECTION] Error processing ${selectedPath}:`,
              error instanceof Error ? error.message : String(error),
            );
          }
        }
        const uniqueFiles = [...new Set(allFiles)];
        logger.info(
          `[FILE-SELECTION] Total files collected: ${uniqueFiles.length} (${allFiles.length - uniqueFiles.length} duplicates removed)`,
        );
        return {
          success: true,
          files: uniqueFiles,
          summary: {
            totalSelected: result.filePaths.length,
            filesFound: uniqueFiles.length,
            duplicatesRemoved: allFiles.length - uniqueFiles.length,
          },
        };
      } catch (error: unknown) {
        logger.error('[MAIN-FILE-SELECT] Failed to select files:', error);
        return { success: false, error: error instanceof Error ? error.message : String(error), files: [] };
      }
    }),
  );

  ipcMain.handle(
    IPC_CHANNELS.FILES.SELECT_DIRECTORY,
    compose(
      withErrorHandling,
      withRequestId
    )(async () => {
      try {
        const result = await dialog.showOpenDialog(getMainWindow() || null, {
          properties: ['openDirectory', 'dontAddToRecent'],
          title: 'Select Directory to Scan',
          buttonLabel: 'Select Directory',
        });
        if (result.canceled || !result.filePaths.length)
          return { success: false, folder: null };
        return { success: true, folder: result.filePaths[0] };
      } catch (error: unknown) {
        logger.error('[IPC] Directory selection failed:', error);
        return { success: false, folder: null, error: error instanceof Error ? error.message : String(error) };
      }
    }),
  );

  ipcMain.handle(
    IPC_CHANNELS.FILES.GET_DOCUMENTS_PATH,
    compose(
      withErrorHandling,
      withRequestId
    )(async () => {
      try {
        return app.getPath('documents');
      } catch (error) {
        logger.error('Failed to get documents path:', error);
        return null;
      }
    }),
  );

  // Get File Stats Handler - with full validation stack
  const getFileStatsHandler = compose(
    withErrorHandling,
    withRequestId,
    validateIpc(FileOpenSchema)
  )(async (_event: Electron.IpcMainInvokeEvent, data: { path: string }) => {
    const filePath = data.path;
    try {
      const stats = await fs.stat(filePath);
      return {
        size: stats.size,
        isDirectory: stats.isDirectory(),
        isFile: stats.isFile(),
        modified: stats.mtime,
        created: stats.birthtime,
      };
    } catch (error: unknown) {
      logger.error('Failed to get file stats:', error);
      return null;
    }
  });

  ipcMain.handle(IPC_CHANNELS.FILES.GET_FILE_STATS, getFileStatsHandler);

  // Create Folder Handler - with full validation stack
  const createFolderDirectHandler = compose(
    withErrorHandling,
    withRequestId,
    validateIpc(FileOpenSchema)
  )(async (_event: Electron.IpcMainInvokeEvent, data: { path: string }) => {
    const fullPath = data.path;
    try {
      const normalizedPath = path.resolve(fullPath);
      try {
        const stats = await fs.stat(normalizedPath);
        if (stats.isDirectory()) {
          logger.info(
            '[FILE-OPS] Folder already exists:',
            normalizedPath,
          );
          return { success: true, path: normalizedPath, existed: true };
        }
      } catch {
        // Folder does not exist, proceed to create
      }
      await fs.mkdir(normalizedPath, { recursive: true });
      logger.info('[FILE-OPS] Created folder:', normalizedPath);
      return { success: true, path: normalizedPath, existed: false };
    } catch (error: unknown) {
      logger.error('[FILE-OPS] Error creating folder:', error);
      const errObj = error as NodeJS.ErrnoException;
      let userMessage = 'Failed to create folder';
      if (errObj.code === 'EACCES' || errObj.code === 'EPERM')
        userMessage = 'Permission denied - check folder permissions';
      else if (errObj.code === 'ENOTDIR')
        userMessage = 'Invalid path - parent is not a directory';
      else if (errObj.code === 'EEXIST')
        userMessage = 'Folder already exists';
      return {
        success: false,
        error: userMessage,
        details: errObj.message,
        code: errObj.code,
      };
    }
  });

  ipcMain.handle(
    IPC_CHANNELS.FILES.CREATE_FOLDER_DIRECT,
    createFolderDirectHandler,
  );

  ipcMain.handle(
    IPC_CHANNELS.FILES.GET_FILES_IN_DIRECTORY,
    compose(
      withErrorHandling,
      withRequestId
    )(async (_event: Electron.IpcMainInvokeEvent, dirPath: string) => {
      try {
        const items = await fs.readdir(dirPath, { withFileTypes: true });
        const result = items.map((item) => ({
          name: item.name,
          path: path.join(dirPath, item.name),
          isDirectory: item.isDirectory(),
          isFile: item.isFile(),
        }));
        logger.info(
          '[FILE-OPS] Listed directory contents:',
          dirPath,
          result.length,
          'items',
        );
        return result;
      } catch (error: unknown) {
        logger.error('[FILE-OPS] Error reading directory:', error);
        return { error: error instanceof Error ? error.message : String(error) };
      }
    }),
  );

  interface OperationData {
    type: 'move' | 'copy' | 'delete' | 'batch_organize';
    source?: string;
    destination?: string;
    operations?: Array<{ source: string; destination: string; type?: string }>;
  }

  // Perform File Operation Handler - with full validation stack
  const performOperationHandler = compose(
    withErrorHandling,
    withRequestId,
    validateIpc(OperationSchema)
  )(async (_event: Electron.IpcMainInvokeEvent, operation: OperationData) => {
    try {
      // PERFORMANCE FIX: Removed expensive JSON.stringify logging
      // Only log essential info to reduce overhead
      logger.info('[FILE-OPS] Performing operation:', {
        type: operation.type,
        source: operation.source
          ? path.basename(operation.source)
          : 'N/A',
        destination: operation.destination
          ? path.basename(operation.destination)
          : 'N/A',
      });

      switch (operation.type) {
        case 'move':
          await fs.rename(operation.source, operation.destination);
          try {
            await getServiceIntegration()?.undoRedo?.recordAction?.(
              ACTION_TYPES.FILE_MOVE,
              {
                originalPath: operation.source,
                newPath: operation.destination,
              },
            );
          } catch {
            // Non-fatal if undo recording fails
          }

          // Update database path
          try {const chromaDbService = getChromaDB();
            if (chromaDbService) {
              const oldId = `file:${operation.source}`;
              const newId = `file:${operation.destination}`;
              // Non-blocking path update
              chromaDbService
                .updateFilePaths([
                  {
                    oldId,
                    newId,
                    newMeta: {
                      path: operation.destination,
                      name: path.basename(operation.destination),
                    },
                  },
                ])
                .catch((err) => {
                  logger.warn(
                    '[FILE-OPS] Failed to update database path (async)',
                    { error: err.message },
                  );
                });
            }
          } catch (dbError: unknown) {
            logger.warn(
              '[FILE-OPS] Failed to initiate database path update',
              { error: dbError instanceof Error ? dbError.message : String(dbError) },
            );
          }

          return {
            success: true,
            message: `Moved ${operation.source} to ${operation.destination}`,
          };

        case 'copy':
          await fs.copyFile(operation.source, operation.destination);
          return {
            success: true,
            message: `Copied ${operation.source} to ${operation.destination}`,
          };

        case 'delete':
          await fs.unlink(operation.source);

          // Delete from database
          try {const chromaDbService = getChromaDB();
            if (chromaDbService) {
              // Non-blocking delete
              chromaDbService
                .deleteFileEmbedding(`file:${operation.source}`)
                .catch((err) => {
                  logger.warn(
                    '[FILE-OPS] Failed to delete database entry (async)',
                    { error: err.message },
                  );
                });
            }
          } catch (dbError: unknown) {
            logger.warn(
              '[FILE-OPS] Failed to initiate database entry delete',
              { error: dbError instanceof Error ? dbError.message : String(dbError) },
            );
          }

          return {
            success: true,
            message: `Deleted ${operation.source}`,
          };

        case 'batch_organize':
          return await handleBatchOrganize({
            operation,
            logger,
            getServiceIntegration,
            getMainWindow,
          });

        default:
          logger.error(
            `[FILE-OPS] Unknown operation type: ${operation.type}`,
          );
          return {
            success: false,
            error: `Unknown operation type: ${operation.type}`,
          };
      }
    } catch (error: unknown) {
      logger.error('[FILE-OPS] Error performing operation:', error);
      return { success: false, error: error instanceof Error ? error.message : String(error) };
    }
  });

  ipcMain.handle(IPC_CHANNELS.FILES.PERFORM_OPERATION, performOperationHandler);

  // Delete File Handler - with full validation stack
  ipcMain.handle(
    IPC_CHANNELS.FILES.DELETE_FILE,
    compose(
      withErrorHandling,
      withRequestId,
      validateIpc(FileDeleteSchema)
    )(async (_event: Electron.IpcMainInvokeEvent, data: { path: string }) => {
      const filePath = data.path;
      try {
        if (!filePath || typeof filePath !== 'string') {
          return {
            success: false,
            error: 'Invalid file path provided',
            errorCode: 'INVALID_PATH',
          };
        }
        try {
          await fs.access(filePath);
        } catch (accessError: unknown) {
          return {
            success: false,
            error: 'File not found or inaccessible',
            errorCode: 'FILE_NOT_FOUND',
            details: accessError instanceof Error ? accessError.message : String(accessError),
          };
        }
        const stats = await fs.stat(filePath);
        await fs.unlink(filePath);

        // Delete from database
        try {const chromaDbService = getChromaDB();
          if (chromaDbService) {
            // Non-blocking delete
            chromaDbService
              .deleteFileEmbedding(`file:${filePath}`)
              .catch((err) => {
                logger.warn(
                  '[FILE-OPS] Failed to delete database entry (async)',
                  { error: err.message },
                );
              });
          }
        } catch (dbError: unknown) {
          logger.warn('[FILE-OPS] Failed to initiate database entry delete', {
            error: dbError instanceof Error ? dbError.message : String(dbError),
          });
        }

        logger.info(
          '[FILE-OPS] Deleted file:',
          filePath,
          `(${stats.size} bytes)`,
        );
        return {
          success: true,
          message: 'File deleted successfully',
          deletedFile: {
            path: filePath,
            size: stats.size,
            deletedAt: new Date().toISOString(),
          },
        };
      } catch (error: unknown) {
        logger.error('[FILE-OPS] Error deleting file:', error);
        const errObj = error as NodeJS.ErrnoException;
        let errorCode = 'DELETE_FAILED';
        let userMessage = 'Failed to delete file';
        if (errObj.code === 'ENOENT') {
          errorCode = 'FILE_NOT_FOUND';
          userMessage = 'File not found';
        } else if (errObj.code === 'EACCES' || errObj.code === 'EPERM') {
          errorCode = 'PERMISSION_DENIED';
          userMessage = 'Permission denied - file may be in use';
        } else if (errObj.code === 'EBUSY') {
          errorCode = 'FILE_IN_USE';
          userMessage = 'File is currently in use';
        }
        return {
          success: false,
          error: userMessage,
          errorCode,
          details: errObj.message,
          systemError: errObj.code,
        };
      }
    }),
  );

  // Open File Handler - with full validation stack
  ipcMain.handle(
    IPC_CHANNELS.FILES.OPEN_FILE,
    compose(
      withErrorHandling,
      withRequestId,
      validateIpc(FileOpenSchema)
    )(async (_event: Electron.IpcMainInvokeEvent, data: { path: string }) => {
      const filePath = data.path;
      try {
        await shell.openPath(filePath);
        logger.info('[FILE-OPS] Opened file:', filePath);
        return { success: true };
      } catch (error: unknown) {
        logger.error('[FILE-OPS] Error opening file:', error);
        return { success: false, error: error instanceof Error ? error.message : String(error) };
      }
    }),
  );

  // Reveal File Handler - with full validation stack
  ipcMain.handle(
    IPC_CHANNELS.FILES.REVEAL_FILE,
    compose(
      withErrorHandling,
      withRequestId,
      validateIpc(FileOpenSchema)
    )(async (_event: Electron.IpcMainInvokeEvent, data: { path: string }) => {
      const filePath = data.path;
      try {
        await shell.showItemInFolder(filePath);
        logger.info('[FILE-OPS] Revealed file in folder:', filePath);
        return { success: true };
      } catch (error: unknown) {
        logger.error('[FILE-OPS] Error revealing file:', error);
        return { success: false, error: error instanceof Error ? error.message : String(error) };
      }
    }),
  );

  // Copy File Handler - with full validation stack
  ipcMain.handle(
    IPC_CHANNELS.FILES.COPY_FILE,
    compose(
      withErrorHandling,
      withRequestId,
      validateIpc(FileMoveSchema)
    )(async (_event: Electron.IpcMainInvokeEvent, data: { source: string; destination: string }) => {
      const sourcePath = data.source;
      const destinationPath = data.destination;
      try {
        if (!sourcePath || !destinationPath) {
          return {
            success: false,
            error: 'Source and destination paths are required',
            errorCode: 'INVALID_PATHS',
          };
        }
        const normalizedSource = path.resolve(sourcePath);
        const normalizedDestination = path.resolve(destinationPath);
        try {
          await fs.access(normalizedSource);
        } catch (accessError: unknown) {
          return {
            success: false,
            error: 'Source file not found',
            errorCode: 'SOURCE_NOT_FOUND',
            details: accessError instanceof Error ? accessError.message : String(accessError),
          };
        }
        const destDir = path.dirname(normalizedDestination);
        await fs.mkdir(destDir, { recursive: true });
        const sourceStats = await fs.stat(normalizedSource);
        await fs.copyFile(normalizedSource, normalizedDestination);
        logger.info(
          '[FILE-OPS] Copied file:',
          normalizedSource,
          'to',
          normalizedDestination,
        );
        return {
          success: true,
          message: 'File copied successfully',
          operation: {
            source: normalizedSource,
            destination: normalizedDestination,
            size: sourceStats.size,
            copiedAt: new Date().toISOString(),
          },
        };
      } catch (error: unknown) {
        logger.error('[FILE-OPS] Error copying file:', error);
        const errObj = error as NodeJS.ErrnoException;
        let errorCode = 'COPY_FAILED';
        let userMessage = 'Failed to copy file';
        if (errObj.code === 'ENOSPC') {
          errorCode = 'INSUFFICIENT_SPACE';
          userMessage = 'Insufficient disk space';
        } else if (errObj.code === 'EACCES' || errObj.code === 'EPERM') {
          errorCode = 'PERMISSION_DENIED';
          userMessage = 'Permission denied';
        } else if (errObj.code === 'EEXIST') {
          errorCode = 'FILE_EXISTS';
          userMessage = 'Destination file already exists';
        }
        return {
          success: false,
          error: userMessage,
          errorCode,
          details: errObj.message,
        };
      }
    }),
  );

  // Open Folder Handler - with full validation stack
  ipcMain.handle(
    IPC_CHANNELS.FILES.OPEN_FOLDER,
    compose(
      withErrorHandling,
      withRequestId,
      validateIpc(FileOpenSchema)
    )(async (_event: Electron.IpcMainInvokeEvent, data: { path: string }) => {
      const folderPath = data.path;
      try {
        if (!folderPath || typeof folderPath !== 'string') {
          return {
            success: false,
            error: 'Invalid folder path provided',
            errorCode: 'INVALID_PATH',
          };
        }
        const normalizedPath = path.resolve(folderPath);
        try {
          const stats = await fs.stat(normalizedPath);
          if (!stats.isDirectory()) {
            return {
              success: false,
              error: 'Path is not a directory',
              errorCode: 'NOT_A_DIRECTORY',
            };
          }
        } catch (accessError: unknown) {
          return {
            success: false,
            error: 'Folder not found or inaccessible',
            errorCode: 'FOLDER_NOT_FOUND',
            details: accessError instanceof Error ? accessError.message : String(accessError),
          };
        }
        await shell.openPath(normalizedPath);
        logger.info('[FILE-OPS] Opened folder:', normalizedPath);
        return {
          success: true,
          message: 'Folder opened successfully',
          openedPath: normalizedPath,
        };
      } catch (error: unknown) {
        logger.error('[FILE-OPS] Error opening folder:', error);
        return {
          success: false,
          error: 'Failed to open folder',
          errorCode: 'OPEN_FAILED',
          details: error instanceof Error ? error.message : String(error),
        };
      }
    }),
  );

  // Delete Folder Handler - with full validation stack
  ipcMain.handle(
    IPC_CHANNELS.FILES.DELETE_FOLDER,
    compose(
      withErrorHandling,
      withRequestId,
      validateIpc(FileDeleteSchema)
    )(async (_event: Electron.IpcMainInvokeEvent, data: { path: string }) => {
      const fullPath = data.path;
      try {
        const normalizedPath = path.resolve(fullPath);
        try {
          const stats = await fs.stat(normalizedPath);
          if (!stats.isDirectory()) {
            return {
              success: false,
              error: 'Path is not a directory',
              code: 'NOT_DIRECTORY',
            };
          }
        } catch (statError: unknown) {
          const errObj = statError as NodeJS.ErrnoException;
          if (errObj.code === 'ENOENT') {
            return {
              success: true,
              message: 'Folder already deleted or does not exist',
              existed: false,
            };
          }
          throw statError;
        }
        const contents = await fs.readdir(normalizedPath);
        if (contents.length > 0) {
          return {
            success: false,
            error: `Directory not empty - contains ${contents.length} items`,
            code: 'NOT_EMPTY',
            itemCount: contents.length,
          };
        }
        await fs.rmdir(normalizedPath);
        logger.info('[FILE-OPS] Deleted folder:', normalizedPath);
        return {
          success: true,
          path: normalizedPath,
          message: 'Folder deleted successfully',
        };
      } catch (error: unknown) {
        logger.error('[FILE-OPS] Error deleting folder:', error);
        const errObj = error as NodeJS.ErrnoException;
        let userMessage = 'Failed to delete folder';
        if (errObj.code === 'EACCES' || errObj.code === 'EPERM')
          userMessage = 'Permission denied - check folder permissions';
        else if (errObj.code === 'ENOTEMPTY')
          userMessage = 'Directory not empty - contains files or subfolders';
        else if (errObj.code === 'EBUSY')
          userMessage = 'Directory is in use by another process';
        return {
          success: false,
          error: userMessage,
          details: errObj.message,
          code: errObj.code,
        };
      }
    }),
  );
}
export default registerFilesIpc;

import { getInstance as getChromaDB } from '../services/ChromaDBService';
import FolderMatchingService from '../services/FolderMatchingService';
import path from 'path';
import { SUPPORTED_IMAGE_EXTENSIONS } from '../../shared/constants';
import {
  validateIpc,
  withRequestId,
  withErrorHandling,
  compose,
} from './validation';
import { FindSimilarSchema } from './schemas';
import { app, IpcMain } from 'electron';

interface SmartFolder {
  name: string;
  description?: string;
  path?: string;
  id?: string;
}

interface Logger {
  setContext: (ctx: string) => void;
  info: (message: string, ...args: unknown[]) => void;
  warn: (message: string, ...args: unknown[]) => void;
  error: (message: string, ...args: unknown[]) => void;
}

interface EmbeddingsIpcDependencies {
  ipcMain: IpcMain;
  IPC_CHANNELS: { EMBEDDINGS: Record<string, string> };
  logger: Logger;
  getCustomFolders: () => SmartFolder[];
  getServiceIntegration: () => unknown;
}

export function registerEmbeddingsIpc({
  ipcMain,
  IPC_CHANNELS,
  logger,
  getCustomFolders,
  getServiceIntegration,
}: EmbeddingsIpcDependencies): void {
  logger.setContext('IPC:Embeddings');
  // Use ChromaDB singleton instance
  const chromaDbService = getChromaDB();
  const folderMatcher = new FolderMatchingService(
    chromaDbService as unknown as null,
  );

  // CRITICAL FIX: Track initialization state to prevent race conditions
  let initializationPromise: Promise<void> | null = null;
  let isInitialized = false;

  /**
   * Ensures services are initialized before IPC handlers execute
   * @returns {Promise<void>}
   */
  async function ensureInitialized() {
    if (isInitialized) return;
    if (initializationPromise) return initializationPromise;

    initializationPromise = (async () => {
      try {
        logger.info('[SEMANTIC] Starting initialization...');

        // Initialize ChromaDB first
        await chromaDbService.initialize();

        // CRITICAL FIX: MUST await FolderMatchingService initialization
        await folderMatcher.initialize();

        // Attempt to migrate existing JSONL data if present
        const basePath = path.join(app.getPath('userData'), 'embeddings');
        const filesPath = path.join(basePath, 'file-embeddings.jsonl');
        const foldersPath = path.join(basePath, 'folder-embeddings.jsonl');

        const filesMigrated = await chromaDbService.migrateFromJsonl(
          filesPath,
          'file',
        );
        const foldersMigrated = await chromaDbService.migrateFromJsonl(
          foldersPath,
          'folder',
        );

        if (filesMigrated > 0 || foldersMigrated > 0) {
          logger.info('[SEMANTIC] Migration complete', {
            files: filesMigrated,
            folders: foldersMigrated,
          });
        }

        logger.info('[SEMANTIC] Initialization complete');
        isInitialized = true;
      } catch (error) {
        logger.error('[SEMANTIC] Initialization failed:', error);
        initializationPromise = null; // Allow retry on next call
        throw error;
      }
    })();

    return initializationPromise;
  }

  // Start initialization immediately (but don't block IPC registration)
  ensureInitialized().catch((error) => {
    logger.error('[SEMANTIC] Background initialization failed:', error);
  });

  // Rebuild Folders Embeddings Handler - with middleware
  ipcMain.handle(
    IPC_CHANNELS.EMBEDDINGS.REBUILD_FOLDERS,
    compose(
      withErrorHandling,
      withRequestId,
    )(async () => {
      // CRITICAL FIX: Wait for initialization before executing
      await ensureInitialized();

      try {
        const smartFolders = getCustomFolders().filter(
          (f: SmartFolder) => f && f.name,
        );
        await chromaDbService.resetFolders();

        // Optimization: Batch process folder embeddings
        const folderPayloads = await Promise.all(
          smartFolders.map(async (folder: SmartFolder) => {
            try {
              const folderText = [folder.name, folder.description]
                .filter(Boolean)
                .join(' - ');

              const { vector, model } =
                await folderMatcher.embedText(folderText);
              const folderId =
                folder.id || folderMatcher.generateFolderId(folder);

              return {
                id: folderId,
                name: folder.name,
                description: folder.description || '',
                path: folder.path || '',
                vector,
                model,
                updatedAt: new Date().toISOString(),
              };
            } catch (error: unknown) {
              logger.warn(
                '[EMBEDDINGS] Failed to generate folder embedding:',
                folder.name,
                error instanceof Error ? error.message : String(error),
              );
              return null;
            }
          }),
        );

        const validPayloads = folderPayloads.filter((p) => p !== null);

        // Optimization: Use batch upsert instead of individual operations
        const count = await chromaDbService.batchUpsertFolders(validPayloads);

        return { success: true, folders: count };
      } catch (e: unknown) {
        logger.error('[EMBEDDINGS] Rebuild folders failed:', e);
        return {
          success: false,
          error: e instanceof Error ? e.message : String(e),
        };
      }
    }),
  );

  // Rebuild Files Embeddings Handler - with middleware
  ipcMain.handle(
    IPC_CHANNELS.EMBEDDINGS.REBUILD_FILES,
    compose(
      withErrorHandling,
      withRequestId,
    )(async () => {
      // CRITICAL FIX: Wait for initialization before executing
      await ensureInitialized();

      try {
        const serviceIntegration =
          getServiceIntegration && getServiceIntegration();
        const historyService = serviceIntegration?.analysisHistory;

        if (!historyService?.getRecentAnalysis) {
          return {
            success: false,
            error: 'Analysis history service unavailable',
          };
        }

        // Load all history entries (bounded by service defaults if any)
        const allEntries = await historyService.getRecentAnalysis(
          Number.MAX_SAFE_INTEGER,
        );

        const smartFolders = (
          typeof getCustomFolders === 'function' ? getCustomFolders() : []
        ).filter((f: SmartFolder) => f && f.name);

        // Optimization: Batch process folder embeddings
        if (smartFolders.length > 0) {
          const folderPayloads = await Promise.all(
            smartFolders.map(async (folder) => {
              try {
                const folderText = [folder.name, folder.description]
                  .filter(Boolean)
                  .join(' - ');

                const { vector, model } =
                  await folderMatcher.embedText(folderText);
                const folderId =
                  folder.id || folderMatcher.generateFolderId(folder);

                return {
                  id: folderId,
                  name: folder.name,
                  description: folder.description || '',
                  path: folder.path || '',
                  vector,
                  model,
                  updatedAt: new Date().toISOString(),
                };
              } catch (error) {
                logger.warn(
                  '[EMBEDDINGS] Failed to generate folder embedding:',
                  folder.name,
                );
                return null;
              }
            }),
          );

          const validFolderPayloads = folderPayloads.filter((p) => p !== null);
          await chromaDbService.batchUpsertFolders(validFolderPayloads);
        }

        // Reset file vectors to rebuild from scratch
        await chromaDbService.resetFiles();

        // Optimization: Batch process file embeddings
        const filePayloads = [];
        for (const entry of allEntries) {
          try {
            const filePath = entry.originalPath;
            const ext = (path.extname(filePath) || '').toLowerCase();
            const isImage = SUPPORTED_IMAGE_EXTENSIONS.includes(ext);
            const fileId = `${isImage ? 'image' : 'file'}:${filePath}`;

            const summary = [
              entry.analysis?.subject,
              entry.analysis?.summary,
              Array.isArray(entry.analysis?.tags)
                ? entry.analysis.tags.join(' ')
                : '',
              entry.analysis?.extractedText
                ? String(entry.analysis.extractedText).slice(0, 2000)
                : '',
            ]
              .filter(Boolean)
              .join('\n');

            // Generate embedding
            const { vector, model } = await folderMatcher.embedText(summary);

            filePayloads.push({
              id: fileId,
              vector,
              model,
              meta: {
                path: filePath,
                name: path.basename(filePath),
                type: isImage ? 'image' : 'document',
              },
              updatedAt: new Date().toISOString(),
            });
          } catch (e: unknown) {
            logger.warn(
              '[EMBEDDINGS] Failed to prepare file entry:',
              e instanceof Error ? e.message : String(e),
            );
            // continue on individual entry failure
          }
        }

        // Optimization: Batch upsert all files at once (in chunks for large datasets)
        const BATCH_SIZE = 50; // Process in chunks of 50
        let rebuilt = 0;
        for (let i = 0; i < filePayloads.length; i += BATCH_SIZE) {
          const batch = filePayloads.slice(i, i + BATCH_SIZE);
          try {
            const count = await chromaDbService.batchUpsertFiles(batch);
            rebuilt += count;
          } catch (e: unknown) {
            logger.warn(
              '[EMBEDDINGS] Failed to batch upsert files:',
              e instanceof Error ? e.message : String(e),
            );
          }
        }

        return { success: true, files: rebuilt };
      } catch (e: unknown) {
        logger.error('[EMBEDDINGS] Rebuild files failed:', e);
        return {
          success: false,
          error: e instanceof Error ? e.message : String(e),
        };
      }
    }),
  );

  // Clear Store Handler - with middleware
  ipcMain.handle(
    IPC_CHANNELS.EMBEDDINGS.CLEAR_STORE,
    compose(
      withErrorHandling,
      withRequestId,
    )(async () => {
      // CRITICAL FIX: Wait for initialization before executing
      await ensureInitialized();

      try {
        await chromaDbService.resetAll();
        return { success: true };
      } catch (e: unknown) {
        return {
          success: false,
          error: e instanceof Error ? e.message : String(e),
        };
      }
    }),
  );

  // Get Stats Handler - with middleware
  ipcMain.handle(
    IPC_CHANNELS.EMBEDDINGS.GET_STATS,
    compose(
      withErrorHandling,
      withRequestId,
    )(async () => {
      // CRITICAL FIX: Wait for initialization before executing
      await ensureInitialized();

      try {
        const stats = await chromaDbService.getStats();
        return { success: true, ...stats };
      } catch (e: unknown) {
        return {
          success: false,
          error: e instanceof Error ? e.message : String(e),
        };
      }
    }),
  );

  // Find Similar Handler - with full validation stack
  ipcMain.handle(
    IPC_CHANNELS.EMBEDDINGS.FIND_SIMILAR,
    compose(
      withErrorHandling,
      withRequestId,
      validateIpc(FindSimilarSchema),
    )(
      async (
        _event: Electron.IpcMainInvokeEvent,
        data: { fileId: string; topK: number },
      ) => {
        // CRITICAL FIX: Wait for initialization before executing
        await ensureInitialized();

        const fileId = data.fileId;
        const topK = data.topK;

        // HIGH PRIORITY FIX: Add timeout (addresses HIGH-11)
        const QUERY_TIMEOUT = 30000; // 30 seconds

        try {
          // Create timeout promise
          const timeoutPromise = new Promise((_, reject) => {
            setTimeout(
              () => reject(new Error('Query timeout exceeded')),
              QUERY_TIMEOUT,
            );
          });

          // Race query against timeout
          const similarFiles = await Promise.race([
            folderMatcher.findSimilarFiles(fileId, topK),
            timeoutPromise,
          ]);

          return { success: true, results: similarFiles };
        } catch (e: unknown) {
          const errMsg = e instanceof Error ? e.message : String(e);
          logger.error('[EMBEDDINGS] Find similar failed:', {
            fileId,
            topK,
            error: errMsg,
            timeout: errMsg.includes('timeout'),
          });
          return {
            success: false,
            error: errMsg,
            timeout: errMsg.includes('timeout'),
          };
        }
      },
    ),
  );

  // Cleanup on app quit
  app.on('before-quit', async () => {
    try {
      await chromaDbService.cleanup();
    } catch (error) {
      logger.error('[ChromaDB] Cleanup error:', error);
    }
  });
}

export default registerEmbeddingsIpc;

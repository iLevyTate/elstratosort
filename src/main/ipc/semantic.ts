import { getInstance as getChromaDB } from '../services/ChromaDBService';
import FolderMatchingService from '../services/FolderMatchingService';
import path from 'path';
import { SUPPORTED_IMAGE_EXTENSIONS } from '../../shared/constants';
import { validateIpc, withRequestId, withErrorHandling, compose } from './validation';
import { FindSimilarSchema } from './schemas';
import { app } from 'electron';

export function registerEmbeddingsIpc({
  ipcMain,
  IPC_CHANNELS,
  logger,
  getCustomFolders,
  getServiceIntegration,
}) {
  logger.setContext('IPC:Embeddings');
  // Use ChromaDB singleton instance
  const chromaDbService = getChromaDB();
  const folderMatcher = new FolderMatchingService(chromaDbService);

  // CRITICAL FIX: Track initialization state to prevent race conditions
  let initializationPromise = null;
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
      withRequestId
    )(async () => {
      // CRITICAL FIX: Wait for initialization before executing
      await ensureInitialized();

      try {
        const smartFolders = getCustomFolders().filter((f) => f && f.name);
        await chromaDbService.resetFolders();

        // Optimization: Batch process folder embeddings
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
                error.message,
              );
              return null;
            }
          }),
        );

        const validPayloads = folderPayloads.filter((p) => p !== null);

        // Optimization: Use batch upsert instead of individual operations
        const count = await chromaDbService.batchUpsertFolders(validPayloads);

        return { success: true, folders: count };
      } catch (e) {
        logger.error('[EMBEDDINGS] Rebuild folders failed:', e);
        return { success: false, error: e.message };
      }
    }),
  );

  // Rebuild Files Embeddings Handler - with middleware
  ipcMain.handle(
    IPC_CHANNELS.EMBEDDINGS.REBUILD_FILES,
    compose(
      withErrorHandling,
      withRequestId
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
        ).filter((f) => f && f.name);

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
          } catch (e) {
            logger.warn(
              '[EMBEDDINGS] Failed to prepare file entry:',
              e.message,
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
          } catch (e) {
            logger.warn(
              '[EMBEDDINGS] Failed to batch upsert files:',
              e.message,
            );
          }
        }

        return { success: true, files: rebuilt };
      } catch (e) {
        logger.error('[EMBEDDINGS] Rebuild files failed:', e);
        return { success: false, error: e.message };
      }
    }),
  );

  // Clear Store Handler - with middleware
  ipcMain.handle(
    IPC_CHANNELS.EMBEDDINGS.CLEAR_STORE,
    compose(
      withErrorHandling,
      withRequestId
    )(async () => {
      // CRITICAL FIX: Wait for initialization before executing
      await ensureInitialized();

      try {
        await chromaDbService.resetAll();
        return { success: true };
      } catch (e) {
        return { success: false, error: e.message };
      }
    }),
  );

  // Get Stats Handler - with middleware
  ipcMain.handle(
    IPC_CHANNELS.EMBEDDINGS.GET_STATS,
    compose(
      withErrorHandling,
      withRequestId
    )(async () => {
      // CRITICAL FIX: Wait for initialization before executing
      await ensureInitialized();

      try {
        const stats = await chromaDbService.getStats();
        return { success: true, ...stats };
      } catch (e) {
        return { success: false, error: e.message };
      }
    }),
  );

  // Find Similar Handler - with full validation stack
  ipcMain.handle(
    IPC_CHANNELS.EMBEDDINGS.FIND_SIMILAR,
    compose(
      withErrorHandling,
      withRequestId,
      validateIpc(FindSimilarSchema)
    )(async (_event, data) => {
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
      } catch (e) {
        logger.error('[EMBEDDINGS] Find similar failed:', {
          fileId,
          topK,
          error: e.message,
          timeout: e.message.includes('timeout'),
        });
        return {
          success: false,
          error: e.message,
          timeout: e.message.includes('timeout'),
        };
      }
    }),
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

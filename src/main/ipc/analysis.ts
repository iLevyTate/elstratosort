import path from 'path';
import { promises as fs } from 'fs';
import { performance } from 'perf_hooks';
import { validateIpc, withRequestId, withErrorHandling, compose } from './validation';
import { SingleFileAnalysisSchema, AnalysisRequestSchema } from './schemas';
import { safeGet, safeFilePath, ensureArray } from '../utils/safeAccess';
import BatchAnalysisService from '../services/BatchAnalysisService';

interface SmartFolder {
  name: string;
  description?: string;
  id?: string;
  isDefault?: boolean;
  path?: string;
}

interface AnalysisResult {
  suggestedName?: string;
  category?: string;
  keywords?: string[];
  confidence?: number;
  purpose?: string;
  summary?: string;
  extractedText?: string;
  model?: string;
  smartFolder?: unknown;
}

interface AnalysisIpcDependencies {
  ipcMain: Electron.IpcMain;
  IPC_CHANNELS: { ANALYSIS: Record<string, string> };
  logger: { setContext: (ctx: string) => void; info: (...args: unknown[]) => void; warn: (...args: unknown[]) => void; error: (...args: unknown[]) => void };
  tesseract: unknown;
  systemAnalytics: { recordProcessingTime: (duration: number) => void };
  analyzeDocumentFile: (path: string, folders: Array<{ name: string; description: string; id: string | null }>) => Promise<AnalysisResult>;
  analyzeImageFile: (path: string, folders: Array<{ name: string; description: string; id: string | null }>) => Promise<AnalysisResult>;
  getServiceIntegration: () => { processingState?: { markAnalysisStart: (path: string) => Promise<void>; markAnalysisComplete: (path: string) => Promise<void> }; analysisHistory?: { recordAnalysis: (fileInfo: unknown, normalized: unknown) => Promise<void> } } | null;
  getCustomFolders: () => SmartFolder[];
}

function registerAnalysisIpc({
  ipcMain,
  IPC_CHANNELS,
  logger,
  tesseract,
  systemAnalytics,
  analyzeDocumentFile,
  analyzeImageFile,
  getServiceIntegration,
  getCustomFolders,
}: AnalysisIpcDependencies): void {
  logger.setContext('IPC:Analysis');

  // Document Analysis Handler - with full validation stack
  const analyzeDocumentHandler = compose(
    withErrorHandling,
    withRequestId,
    validateIpc(SingleFileAnalysisSchema)
  )(async (_event: Electron.IpcMainInvokeEvent, data: { filePath: string }) => {
    const filePath = data.filePath;
    const serviceIntegration =
      getServiceIntegration && getServiceIntegration();
    let analysisStarted = false;
    let cleanPath: string | null = null;

    try {
      // Validate file path
      cleanPath = safeFilePath(filePath);
      if (!cleanPath) {
        throw new Error('Invalid file path provided');
      }

      const startTime = performance.now();
      logger.info(
        `[IPC-ANALYSIS] Starting document analysis for: ${cleanPath}`,
      );

      // RESOURCE FIX #8: Mark analysis start and track with flag for cleanup
      try {
        await serviceIntegration?.processingState?.markAnalysisStart(
          filePath,
        );
        analysisStarted = true;
      } catch (stateError: unknown) {
        // Non-fatal if processing state fails to update, but log it
        logger.warn(
          '[IPC-ANALYSIS] Failed to mark analysis start:',
          stateError instanceof Error ? stateError.message : String(stateError),
        );
      }
      // Add null check for getCustomFolders
      const folders =
        typeof getCustomFolders === 'function' ? getCustomFolders() : [];
      const customFolders = ensureArray(folders).filter(
        (f) => f && (!f.isDefault || f.path),
      );
      const folderCategories = customFolders.map((f) => ({
        name: safeGet(f, 'name', 'Unknown'),
        description: safeGet(f, 'description', ''),
        id: safeGet(f, 'id', null),
      }));
      logger.info(
        `[IPC-ANALYSIS] Using ${folderCategories.length} smart folders for context:`,
        folderCategories.map((f) => f.name).join(', '),
      );
      const result = await analyzeDocumentFile(
        filePath,
        folderCategories,
      );
      const duration = performance.now() - startTime;
      systemAnalytics.recordProcessingTime(duration);
      try {
        const stats = await fs.stat(filePath);
        const fileInfo = {
          path: filePath,
          size: stats.size,
          lastModified: stats.mtimeMs,
          mimeType: null,
        };
        const normalized = {
          subject: result.suggestedName || path.basename(filePath),
          category: result.category || 'uncategorized',
          tags: Array.isArray(result.keywords) ? result.keywords : [],
          confidence:
            typeof result.confidence === 'number' ? result.confidence : 0,
          summary: result.purpose || result.summary || '',
          extractedText: result.extractedText || null,
          model: result.model || 'llm',
          processingTime: duration,
          smartFolder: result.smartFolder || null,
          newName: result.suggestedName || null,
          renamed: Boolean(result.suggestedName),
        };
        await serviceIntegration?.analysisHistory?.recordAnalysis(
          fileInfo,
          normalized,
        );
      } catch (historyError: unknown) {
        logger.warn(
          '[ANALYSIS-HISTORY] Failed to record document analysis:',
          historyError instanceof Error ? historyError.message : String(historyError),
        );
      }

      return result;
    } catch (error: unknown) {
      // ERROR CONTEXT FIX #11: Enhanced error logging with full context
      const errObj = error instanceof Error ? error : new Error(String(error));
      const errorContext = {
        operation: 'document-analysis',
        filePath: filePath,
        fileName: path.basename(filePath),
        fileExtension: path.extname(filePath),
        timestamp: new Date().toISOString(),
        error: errObj.message,
        errorStack: errObj.stack,
        errorCode: (error as NodeJS.ErrnoException).code,
      };

      logger.error(
        '[IPC-ANALYSIS] Document analysis failed with context:',
        errorContext,
      );
      systemAnalytics.recordFailure(errObj);

      // RESOURCE FIX #8: Mark error in processing state
      const serviceIntegration =
        getServiceIntegration && getServiceIntegration();
      try {
        await serviceIntegration?.processingState?.markAnalysisError?.(
          filePath,
          errObj.message,
        );
      } catch (stateError: unknown) {
        // Non-fatal if processing state fails to update
        logger.warn('[IPC-ANALYSIS] Failed to mark analysis error:', {
          filePath,
          error: stateError instanceof Error ? stateError.message : String(stateError),
        });
      }
      return {
        error: errObj.message,
        suggestedName: path.basename(filePath), // Keep extension to prevent unopenable files
        category: 'documents',
        keywords: [],
        confidence: 0,
      };
    } finally {
      // RESOURCE FIX #8: Guaranteed cleanup in finally block
      // Ensure processing state is cleaned up even if error handling fails
      if (analysisStarted && cleanPath) {
        try {
          const serviceIntegration =
            getServiceIntegration && getServiceIntegration();
          // Only clean up if the state exists and wasn't already marked as error/complete
          const currentState =
            await serviceIntegration?.processingState?.getState?.(
              filePath,
            );
          if (currentState === 'analyzing') {
            // State is still analyzing, clean it up
            await serviceIntegration?.processingState?.clearState?.(
              filePath,
            );
            logger.debug(
              '[IPC-ANALYSIS] Cleaned up processing state for:',
              filePath,
            );
          }
        } catch (cleanupError: unknown) {
          // Log but don't throw - cleanup is best-effort
          logger.warn(
            '[IPC-ANALYSIS] Failed to cleanup processing state:',
            cleanupError instanceof Error ? cleanupError.message : String(cleanupError),
          );
        }
      }
    }
  });

  ipcMain.handle(
    IPC_CHANNELS.ANALYSIS.ANALYZE_DOCUMENT,
    analyzeDocumentHandler,
  );

  // Image Analysis Handler - with full validation stack
  const analyzeImageHandler = compose(
    withErrorHandling,
    withRequestId,
    validateIpc(SingleFileAnalysisSchema)
  )(async (_event: Electron.IpcMainInvokeEvent, data: { filePath: string }) => {
    const filePath = data.filePath;
    let analysisStarted = false;
    let cleanPath: string | null = null;

    try {
      cleanPath = safeFilePath(filePath);
      logger.info(`[IPC] Starting image analysis for: ${cleanPath}`);

      // RESOURCE FIX #8: Mark analysis start and track with flag for cleanup
      const serviceIntegration =
        getServiceIntegration && getServiceIntegration();
      try {
        await serviceIntegration?.processingState?.markAnalysisStart(
          filePath,
        );
        analysisStarted = true;
      } catch (stateError: unknown) {
        // Non-fatal if processing state fails to update, but log it
        logger.warn(
          '[IPC-IMAGE-ANALYSIS] Failed to mark analysis start:',
          stateError instanceof Error ? stateError.message : String(stateError),
        );
      }
      // Add null check for getCustomFolders
      const folders =
        typeof getCustomFolders === 'function' ? getCustomFolders() : [];
      const customFolders = ensureArray(folders).filter(
        (f) => f && (!f.isDefault || f.path),
      );
      const folderCategories = customFolders.map((f) => ({
        name: safeGet(f, 'name', 'Unknown'),
        description: safeGet(f, 'description', ''),
        id: safeGet(f, 'id', null),
      }));
      logger.info(
        `[IPC-IMAGE-ANALYSIS] Using ${folderCategories.length} smart folders for context:`,
        folderCategories.map((f) => f.name).join(', '),
      );
      const result = await analyzeImageFile(filePath, folderCategories);
      try {
        const stats = await fs.stat(filePath);
        const fileInfo = {
          path: filePath,
          size: stats.size,
          lastModified: stats.mtimeMs,
          mimeType: null,
        };
        const normalized = {
          subject: result.suggestedName || path.basename(filePath),
          category: result.category || 'uncategorized',
          tags: Array.isArray(result.keywords) ? result.keywords : [],
          confidence:
            typeof result.confidence === 'number' ? result.confidence : 0,
          summary: result.purpose || result.summary || '',
          extractedText: result.extractedText || null,
          model: result.model || 'vision',
          processingTime: 0,
          smartFolder: result.smartFolder || null,
          newName: result.suggestedName || null,
          renamed: Boolean(result.suggestedName),
        };
        await serviceIntegration?.analysisHistory?.recordAnalysis(
          fileInfo,
          normalized,
        );
      } catch (historyError: unknown) {
        logger.warn(
          '[ANALYSIS-HISTORY] Failed to record image analysis:',
          historyError instanceof Error ? historyError.message : String(historyError),
        );
      }

      return result;
    } catch (error: unknown) {
      // ERROR CONTEXT FIX #11: Enhanced error logging with full context
      const errObj = error instanceof Error ? error : new Error(String(error));
      const errorContext = {
        operation: 'image-analysis',
        filePath: filePath,
        fileName: path.basename(filePath),
        fileExtension: path.extname(filePath),
        timestamp: new Date().toISOString(),
        error: errObj.message,
        errorStack: errObj.stack,
        errorCode: (error as NodeJS.ErrnoException).code,
      };

      logger.error(
        '[IPC-IMAGE-ANALYSIS] Image analysis failed with context:',
        errorContext,
      );

      // RESOURCE FIX #8: Mark error in processing state
      const serviceIntegration =
        getServiceIntegration && getServiceIntegration();
      try {
        await serviceIntegration?.processingState?.markAnalysisError?.(
          filePath,
          errObj.message,
        );
      } catch (stateError: unknown) {
        // Non-fatal if processing state fails to update
        logger.warn(
          '[IPC-IMAGE-ANALYSIS] Failed to mark analysis error:',
          {
            filePath,
            error: stateError instanceof Error ? stateError.message : String(stateError),
          },
        );
      }
      return {
        error: errObj.message,
        suggestedName: path.basename(filePath), // Keep extension to prevent unopenable files
        category: 'images',
        keywords: [],
        confidence: 0,
      };
    } finally {
      // RESOURCE FIX #8: Guaranteed cleanup in finally block
      // Ensure processing state is cleaned up even if error handling fails
      if (analysisStarted && cleanPath) {
        try {
          const serviceIntegration =
            getServiceIntegration && getServiceIntegration();
          // Only clean up if the state exists and wasn't already marked as error/complete
          const currentState =
            await serviceIntegration?.processingState?.getState?.(
              filePath,
            );
          if (currentState === 'analyzing') {
            // State is still analyzing, clean it up
            await serviceIntegration?.processingState?.clearState?.(
              filePath,
            );
            logger.debug(
              '[IPC-IMAGE-ANALYSIS] Cleaned up processing state for:',
              filePath,
            );
          }
        } catch (cleanupError: unknown) {
          // Log but don't throw - cleanup is best-effort
          logger.warn(
            '[IPC-IMAGE-ANALYSIS] Failed to cleanup processing state:',
            cleanupError instanceof Error ? cleanupError.message : String(cleanupError),
          );
        }
      }
    }
  });

  ipcMain.handle(IPC_CHANNELS.ANALYSIS.ANALYZE_IMAGE, analyzeImageHandler);

  // OCR Text Extraction Handler - with full validation stack
  const extractImageTextHandler = compose(
    withErrorHandling,
    withRequestId,
    validateIpc(SingleFileAnalysisSchema)
  )(async (_event: Electron.IpcMainInvokeEvent, data: { filePath: string }) => {
    const filePath = data.filePath;
    try {
      const start = performance.now();
      const text = await (tesseract as { recognize: (path: string, options: { lang: string; oem: number; psm: number }) => Promise<string> }).recognize(filePath, {
        lang: 'eng',
        oem: 1,
        psm: 3,
      });
      const duration = performance.now() - start;
      systemAnalytics.recordProcessingTime(duration);
      return { success: true, text };
    } catch (error: unknown) {
      const errObj = error instanceof Error ? error : new Error(String(error));
      logger.error('OCR failed:', error);
      systemAnalytics.recordFailure(errObj);
      return { success: false, error: errObj.message };
    }
  });

  ipcMain.handle(
    IPC_CHANNELS.ANALYSIS.EXTRACT_IMAGE_TEXT,
    extractImageTextHandler,
  );

  // Maintain single instance of BatchAnalysisService to allow cancellation
  let activeBatchService: BatchAnalysisService | null = null;

  // Batch Analysis Handler - with full validation stack
  const startBatchHandler = compose(
    withErrorHandling,
    withRequestId,
    validateIpc(AnalysisRequestSchema)
  )(async (_event: Electron.IpcMainInvokeEvent, data: { files: string[] }) => {
    const filePaths = data.files;
    logger.info('[IPC-ANALYSIS] Starting batch analysis', {
      count: filePaths?.length,
    });

    // Cancel any existing batch
    if (activeBatchService) {
      activeBatchService.cancel();
    }

    const serviceIntegration =
      getServiceIntegration && getServiceIntegration();

    // Get smart folders
    const folders =
      typeof getCustomFolders === 'function' ? getCustomFolders() : [];
    const customFolders = ensureArray(folders).filter(
      (f) => f && (!f.isDefault || f.path),
    );
    const folderCategories = customFolders.map((f) => ({
      name: safeGet(f, 'name', 'Unknown'),
      description: safeGet(f, 'description', ''),
      id: safeGet(f, 'id', null),
    }));

    // Get concurrency from settings
    let concurrency = 3;
    try {
      const settings = await serviceIntegration?.settings?.getSettings();
      if (settings?.maxConcurrentAnalysis) {
        concurrency = Number(settings.maxConcurrentAnalysis);
      }
    } catch (e) {
      // Ignore settings load error
    }

    activeBatchService = new BatchAnalysisService({ concurrency });

    try {
      const result = await activeBatchService.analyzeFiles(
        filePaths,
        folderCategories,
        {
          onProgress: (progress) => {
            // { completed, total, current, result, errors }
            if (!event.sender.isDestroyed()) {
              event.sender.send('operation-progress', {
                type: 'analysis',
                current: progress.completed,
                total: progress.total,
                // Include current file path if available
                currentFile: progress.result?.filePath || '',
              });
            }
          },
        },
      );
      return result;
    } finally {
      activeBatchService = null;
    }
  });

  // HIGH PRIORITY FIX: Wrap cancelBatchHandler with error handling middleware
  const cancelBatchHandler = compose(
    withErrorHandling,
    withRequestId
  )(async () => {
    if (activeBatchService) {
      logger.info('[IPC-ANALYSIS] Cancelling batch analysis request');
      activeBatchService.cancel();
      return { success: true, cancelled: true };
    }
    return { success: true, cancelled: false, message: 'No active batch to cancel' };
  });

  ipcMain.handle(IPC_CHANNELS.ANALYSIS.START_BATCH, startBatchHandler);
  ipcMain.handle(IPC_CHANNELS.ANALYSIS.CANCEL_BATCH, cancelBatchHandler);
}
export default registerAnalysisIpc;

import {
  validateIpc,
  withRequestId,
  withErrorHandling,
  compose,
  createError,
  ERROR_CODES,
} from './validation';
import { AutoOrganizeSchema } from './schemas';
import { z } from 'zod';
import { logger } from '../../shared/logger';

logger.setContext('IPC:Organize');

/**
 * Helper to ensure ServiceIntegration is initialized before use
 * This fixes race conditions where IPC handlers are called before services are ready
 */
async function ensureServiceReady(
  getServiceIntegration: () => any,
): Promise<any> {
  const serviceIntegration = getServiceIntegration();

  if (!serviceIntegration) {
    throw new Error('ServiceIntegration not available');
  }

  // If not initialized, wait for initialization
  if (!serviceIntegration.initialized) {
    logger.info('[ORGANIZE] Waiting for ServiceIntegration to initialize...');
    await serviceIntegration.initialize();
  }

  if (!serviceIntegration.autoOrganizeService) {
    throw new Error('Auto-organize service not available after initialization');
  }

  return serviceIntegration;
}

// Schema for process new file
const ProcessNewFileSchema = z.object({
  filePath: z.string().min(1, 'File path is required'),
  options: z
    .object({
      force: z.boolean().optional(),
    })
    .optional(),
});

// Schema for update thresholds
const UpdateThresholdsSchema = z.object({
  thresholds: z.object({
    minConfidence: z.number().min(0).max(1).optional(),
    autoMoveThreshold: z.number().min(0).max(1).optional(),
  }),
});

export function registerOrganizeIpc({
  ipcMain,
  IPC_CHANNELS,
  getServiceIntegration,
  getCustomFolders,
}) {
  // Auto-organize Handler - with middleware and validation
  ipcMain.handle(
    IPC_CHANNELS.ORGANIZE.AUTO,
    compose(
      withErrorHandling,
      withRequestId,
      validateIpc(AutoOrganizeSchema),
    )(async (event, data) => {
      const { files, smartFolders, options = {} } = data as any;
      void event;
      try {
        logger.info('[ORGANIZE] Starting auto-organize', {
          fileCount: files.length,
        });

        // Ensure service is ready before proceeding
        const serviceIntegration = await ensureServiceReady(
          getServiceIntegration,
        );

        const folders = smartFolders || getCustomFolders();
        const result =
          await serviceIntegration.autoOrganizeService.organizeFiles(
            files,
            folders,
            options,
          );

        logger.info('[ORGANIZE] Auto-organize complete', {
          organized: result.organized?.length || 0,
          needsReview: result.needsReview?.length || 0,
          failed: result.failed?.length || 0,
        });

        // Return with success flag for proper envelope handling
        return {
          success: true,
          organized: result.organized || [],
          needsReview: result.needsReview || [],
          failed: result.failed || [],
          operations: result.operations || [],
        };
      } catch (error) {
        logger.error('[ORGANIZE] Auto-organize failed:', error);
        throw error;
      }
    }),
  );

  // Batch Organize Handler - with middleware and validation
  ipcMain.handle(
    IPC_CHANNELS.ORGANIZE.BATCH,
    compose(
      withErrorHandling,
      withRequestId,
      validateIpc(AutoOrganizeSchema),
    )(async (event, data) => {
      const { files, smartFolders, options = {} } = data as any;
      void event;
      try {
        logger.info('[ORGANIZE] Starting batch organize', {
          fileCount: files.length,
        });

        // Ensure service is ready before proceeding
        const serviceIntegration = await ensureServiceReady(
          getServiceIntegration,
        );

        const folders = smartFolders || getCustomFolders();
        const result =
          await serviceIntegration.autoOrganizeService.batchOrganize(
            files,
            folders,
            options,
          );

        logger.info('[ORGANIZE] Batch organize complete', {
          operationCount: result.operations?.length || 0,
          groupCount: result.groups?.length || 0,
        });

        return {
          success: true,
          operations: result.operations || [],
          groups: result.groups || [],
        };
      } catch (error) {
        logger.error('[ORGANIZE] Batch organize failed:', error);
        throw error;
      }
    }),
  );

  // Process New File Handler - with middleware and validation
  ipcMain.handle(
    IPC_CHANNELS.ORGANIZE.PROCESS_NEW,
    compose(
      withErrorHandling,
      withRequestId,
      validateIpc(ProcessNewFileSchema),
    )(async (event, data) => {
      const { filePath, options = {} } = data as any;
      void event;
      try {
        logger.info('[ORGANIZE] Processing new file', { filePath });

        // Ensure service is ready before proceeding
        const serviceIntegration = await ensureServiceReady(
          getServiceIntegration,
        );

        const smartFolders = getCustomFolders();
        const result =
          await serviceIntegration.autoOrganizeService.processNewFile(
            filePath,
            smartFolders,
            options,
          );

        if (result) {
          logger.info('[ORGANIZE] New file organized', result);
          return {
            success: true,
            ...result,
          };
        } else {
          logger.info(
            '[ORGANIZE] New file not organized (low confidence or disabled)',
          );
          return {
            success: true,
            organized: false,
            reason: 'Low confidence or auto-organize disabled',
          };
        }
      } catch (error) {
        logger.error('[ORGANIZE] Failed to process new file:', error);
        throw error;
      }
    }),
  );

  // Get Stats Handler - with middleware
  ipcMain.handle(
    IPC_CHANNELS.ORGANIZE.GET_STATS,
    compose(
      withErrorHandling,
      withRequestId,
    )(async (event) => {
      void event;
      try {
        // Try to get service, but don't fail if not available
        const serviceIntegration = getServiceIntegration();
        if (!serviceIntegration || !serviceIntegration.autoOrganizeService) {
          return {
            success: true,
            userPatterns: 0,
            feedbackHistory: 0,
            folderUsageStats: [],
            thresholds: {
              autoApprove: 0.8,
              requireReview: 0.5,
              reject: 0.3,
            },
          };
        }

        const stats =
          await serviceIntegration.autoOrganizeService.getStatistics();
        return {
          success: true,
          ...stats,
        };
      } catch (error) {
        logger.error('[ORGANIZE] Failed to get statistics:', error);
        return {
          success: true, // Return success with defaults to not break UI
          userPatterns: 0,
          feedbackHistory: 0,
          folderUsageStats: [],
          thresholds: {
            autoApprove: 0.8,
            requireReview: 0.5,
            reject: 0.3,
          },
        };
      }
    }),
  );

  // Update Thresholds Handler - with middleware and validation
  ipcMain.handle(
    IPC_CHANNELS.ORGANIZE.UPDATE_THRESHOLDS,
    compose(
      withErrorHandling,
      withRequestId,
      validateIpc(UpdateThresholdsSchema),
    )(async (event, data) => {
      const { thresholds } = data as any;
      void event;
      try {
        const serviceIntegration = getServiceIntegration();
        if (!serviceIntegration || !serviceIntegration.autoOrganizeService) {
          throw new Error('Auto-organize service not available');
        }

        serviceIntegration.autoOrganizeService.updateThresholds(thresholds);

        return {
          success: true,
          thresholds,
        };
      } catch (error) {
        logger.error('[ORGANIZE] Failed to update thresholds:', error);
        return {
          success: false,
          error: (error as Error).message,
        };
      }
    }),
  );

  logger.info('[IPC] Auto-organize handlers registered');
}

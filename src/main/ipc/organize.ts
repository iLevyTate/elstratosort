import { validateIpc, withRequestId, withErrorHandling, compose } from './validation';
import { AutoOrganizeSchema } from './schemas';
import { z } from 'zod';
import { logger } from '../../shared/logger';

logger.setContext('IPC:Organize');

// Schema for process new file
const ProcessNewFileSchema = z.object({
  filePath: z.string().min(1, 'File path is required'),
  options: z.object({
    force: z.boolean().optional(),
  }).optional(),
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
      validateIpc(AutoOrganizeSchema)
    )(async (event, data) => {
        const { files, smartFolders, options = {} } = data as any;
        void event;
        try {
          logger.info('[ORGANIZE] Starting auto-organize', {
            fileCount: files.length,
          });

          const serviceIntegration = getServiceIntegration();
          if (!serviceIntegration || !serviceIntegration.autoOrganizeService) {
            throw new Error('Auto-organize service not available');
          }

          const folders = smartFolders || getCustomFolders();
          const result =
            await serviceIntegration.autoOrganizeService.organizeFiles(
              files,
              folders,
              options,
            );

          logger.info('[ORGANIZE] Auto-organize complete', {
            organized: result.organized.length,
            needsReview: result.needsReview.length,
            failed: result.failed.length,
          });

          return result;
        } catch (error) {
          logger.error('[ORGANIZE] Auto-organize failed:', error);
          throw error;
        }
      },
    ),
  );

  // Batch Organize Handler - with middleware and validation
  ipcMain.handle(
    IPC_CHANNELS.ORGANIZE.BATCH,
    compose(
      withErrorHandling,
      withRequestId,
      validateIpc(AutoOrganizeSchema)
    )(async (event, data) => {
        const { files, smartFolders, options = {} } = data as any;
        void event;
        try {
          logger.info('[ORGANIZE] Starting batch organize', {
            fileCount: files.length,
          });

          const serviceIntegration = getServiceIntegration();
          if (!serviceIntegration || !serviceIntegration.autoOrganizeService) {
            throw new Error('Auto-organize service not available');
          }

          const folders = smartFolders || getCustomFolders();
          const result =
            await serviceIntegration.autoOrganizeService.batchOrganize(
              files,
              folders,
              options,
            );

          logger.info('[ORGANIZE] Batch organize complete', {
            operationCount: result.operations.length,
            groupCount: result.groups.length,
          });

          return result;
        } catch (error) {
          logger.error('[ORGANIZE] Batch organize failed:', error);
          throw error;
        }
      },
    ),
  );

  // Process New File Handler - with middleware and validation
  ipcMain.handle(
    IPC_CHANNELS.ORGANIZE.PROCESS_NEW,
    compose(
      withErrorHandling,
      withRequestId,
      validateIpc(ProcessNewFileSchema)
    )(async (event, data) => {
      const { filePath, options = {} } = data as any;
      void event;
      try {
        logger.info('[ORGANIZE] Processing new file', { filePath });

        const serviceIntegration = getServiceIntegration();
        if (!serviceIntegration || !serviceIntegration.autoOrganizeService) {
          throw new Error('Auto-organize service not available');
        }

        const smartFolders = getCustomFolders();
        const result =
          await serviceIntegration.autoOrganizeService.processNewFile(
            filePath,
            smartFolders,
            options,
          );

        if (result) {
          logger.info('[ORGANIZE] New file organized', result);
        } else {
          logger.info(
            '[ORGANIZE] New file not organized (low confidence or disabled)',
          );
        }

        return result;
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
      withRequestId
    )(async (event) => {
      void event;
      try {
        const serviceIntegration = getServiceIntegration();
        if (!serviceIntegration || !serviceIntegration.autoOrganizeService) {
          return {
            userPatterns: 0,
            feedbackHistory: 0,
            folderUsageStats: [],
            thresholds: {},
          };
        }

        const stats =
          await serviceIntegration.autoOrganizeService.getStatistics();
        return stats;
      } catch (error) {
        logger.error('[ORGANIZE] Failed to get statistics:', error);
        return {
          userPatterns: 0,
          feedbackHistory: 0,
          folderUsageStats: [],
          thresholds: {},
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
      validateIpc(UpdateThresholdsSchema)
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

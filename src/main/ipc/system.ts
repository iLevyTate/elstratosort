import { withRequestId, withErrorHandling, compose } from './validation';

export function registerSystemIpc({
  ipcMain,
  IPC_CHANNELS,
  logger,
  systemAnalytics,
  getServiceIntegration,
}) {
  logger.setContext('IPC:System');

  // Get Application Statistics Handler - with middleware
  ipcMain.handle(
    IPC_CHANNELS.SYSTEM.GET_APPLICATION_STATISTICS,
    compose(
      withErrorHandling,
      withRequestId
    )(async () => {
      try {
        const [analysisStats, historyRecent] = await Promise.all([
          getServiceIntegration()?.analysisHistory?.getStatistics?.() ||
            Promise.resolve({}),
          getServiceIntegration()?.analysisHistory?.getRecentAnalysis?.(20) ||
            Promise.resolve([]),
        ]);
        return {
          analysis: analysisStats,
          recentActions:
            getServiceIntegration()?.undoRedo?.getActionHistory?.(20) || [],
          recentAnalysis: historyRecent,
          timestamp: new Date().toISOString(),
        };
      } catch (error) {
        logger.error('Failed to get system statistics:', error);
        return {};
      }
    }),
  );

  // Get Metrics Handler - with middleware
  ipcMain.handle(
    IPC_CHANNELS.SYSTEM.GET_METRICS,
    compose(
      withErrorHandling,
      withRequestId
    )(async () => {
      try {
        return await systemAnalytics.collectMetrics();
      } catch (error) {
        logger.error('Failed to collect system metrics:', error);
        return {};
      }
    }),
  );

  // Apply Update Handler - with middleware
  ipcMain.handle(
    IPC_CHANNELS.SYSTEM.APPLY_UPDATE,
    compose(
      withErrorHandling,
      withRequestId
    )(async () => {
      try {
        const { autoUpdater } = await import('electron-updater');
        autoUpdater.quitAndInstall();
        return { success: true };
      } catch (error) {
        logger.error('Failed to apply update:', error);
        return { success: false, error: (error as Error).message };
      }
    }),
  );
}

import { withRequestId, withErrorHandling, compose } from './validation';

export function registerAnalysisHistoryIpc({
  ipcMain,
  IPC_CHANNELS,
  logger,
  getServiceIntegration,
}) {
  logger.setContext('IPC:AnalysisHistory');

  // Get Statistics Handler - with middleware
  ipcMain.handle(
    IPC_CHANNELS.ANALYSIS_HISTORY.GET_STATISTICS,
    compose(
      withErrorHandling,
      withRequestId
    )(async () => {
      try {
        return (
          (await getServiceIntegration()?.analysisHistory?.getStatistics()) ||
          {}
        );
      } catch (error) {
        logger.error('Failed to get analysis statistics:', error);
        return {};
      }
    }),
  );

  // Get History Handler - with middleware
  ipcMain.handle(
    IPC_CHANNELS.ANALYSIS_HISTORY.GET,
    compose(
      withErrorHandling,
      withRequestId
    )(async (event, options: any = {}) => {
      try {
        const { all = false, limit, offset = 0 } = options || {};
        if (all || limit === 'all') {
          const full =
            (await getServiceIntegration()?.analysisHistory?.getRecentAnalysis(
              Number.MAX_SAFE_INTEGER,
            )) || [];
          if (offset > 0) return full.slice(offset);
          return full;
        }
        const effLimit = typeof limit === 'number' && limit > 0 ? limit : 50;
        if (offset > 0) {
          const interim =
            (await getServiceIntegration()?.analysisHistory?.getRecentAnalysis(
              effLimit + offset,
            )) || [];
          return interim.slice(offset, offset + effLimit);
        }
        return (
          (await getServiceIntegration()?.analysisHistory?.getRecentAnalysis(
            effLimit,
          )) || []
        );
      } catch (error) {
        logger.error('Failed to get analysis history:', error);
        return [];
      }
    }),
  );

  // Search Handler - with middleware
  ipcMain.handle(
    IPC_CHANNELS.ANALYSIS_HISTORY.SEARCH,
    compose(
      withErrorHandling,
      withRequestId
    )(async (event, query = '', options = {}) => {
      try {
        return (
          (await getServiceIntegration()?.analysisHistory?.searchAnalysis(
            query,
            options,
          )) || []
        );
      } catch (error) {
        logger.error('Failed to search analysis history:', error);
        return [];
      }
    }),
  );

  // Get File History Handler - with middleware
  ipcMain.handle(
    IPC_CHANNELS.ANALYSIS_HISTORY.GET_FILE_HISTORY,
    compose(
      withErrorHandling,
      withRequestId
    )(async (event, filePath) => {
      try {
        return (
          (await getServiceIntegration()?.analysisHistory?.getAnalysisByPath(
            filePath,
          )) || null
        );
      } catch (error) {
        logger.error('Failed to get file analysis history:', error);
        return null;
      }
    }),
  );

  // Clear History Handler - with middleware
  ipcMain.handle(
    IPC_CHANNELS.ANALYSIS_HISTORY.CLEAR,
    compose(
      withErrorHandling,
      withRequestId
    )(async () => {
      try {
        await getServiceIntegration()?.analysisHistory?.createDefaultStructures();
        return { success: true };
      } catch (error) {
        logger.error('Failed to clear analysis history:', error);
        return { success: false, error: (error as Error).message };
      }
    }),
  );

  // Export History Handler - with middleware
  ipcMain.handle(
    IPC_CHANNELS.ANALYSIS_HISTORY.EXPORT,
    compose(
      withErrorHandling,
      withRequestId
    )(async (event, format = 'json') => {
      try {
        const history =
          (await getServiceIntegration()?.analysisHistory?.getRecentAnalysis(
            10000,
          )) || [];
        if (format === 'json') {
          return {
            success: true,
            data: JSON.stringify(history, null, 2),
            mime: 'application/json',
            filename: 'analysis-history.json',
          };
        }
        if (format === 'csv') {
          const headers = [
            'fileName',
            'originalPath',
            'category',
            'confidence',
            'timestamp',
          ];
          const lines = [headers.join(',')];
          for (const entry of history) {
            const row = [
              JSON.stringify((entry as any).fileName || ''),
              JSON.stringify((entry as any).originalPath || ''),
              JSON.stringify((entry as any).analysis?.category || (entry as any).category || ''),
              JSON.stringify(
                String((entry as any).analysis?.confidence ?? (entry as any).confidence ?? ''),
              ),
              JSON.stringify(
                (entry as any).timestamp ? new Date((entry as any).timestamp).toISOString() : '',
              ),
            ];
            lines.push(row.join(','));
          }
          return {
            success: true,
            data: lines.join('\n'),
            mime: 'text/csv',
            filename: 'analysis-history.csv',
          };
        }
        return { success: true, data: history };
      } catch (error) {
        logger.error('Failed to export analysis history:', error);
        return { success: false, error: (error as Error).message };
      }
    }),
  );
}

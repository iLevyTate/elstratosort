import { withRequestId, withErrorHandling, compose } from './validation';

export function registerUndoRedoIpc({
  ipcMain,
  IPC_CHANNELS,
  logger,
  getServiceIntegration,
}) {
  logger.setContext('IPC:UndoRedo');

  // Undo Handler - with middleware
  ipcMain.handle(
    IPC_CHANNELS.UNDO_REDO.UNDO,
    compose(
      withErrorHandling,
      withRequestId
    )(async () => {
      try {
        return (
          (await getServiceIntegration()?.undoRedo?.undo()) || {
            success: false,
            message: 'Undo service unavailable',
          }
        );
      } catch (error) {
        logger.error('Failed to execute undo:', error);
        return { success: false, message: (error as Error).message };
      }
    }),
  );

  // Redo Handler - with middleware
  ipcMain.handle(
    IPC_CHANNELS.UNDO_REDO.REDO,
    compose(
      withErrorHandling,
      withRequestId
    )(async () => {
      try {
        return (
          (await getServiceIntegration()?.undoRedo?.redo()) || {
            success: false,
            message: 'Redo service unavailable',
          }
        );
      } catch (error) {
        logger.error('Failed to execute redo:', error);
        return { success: false, message: (error as Error).message };
      }
    }),
  );

  // Get History Handler - with middleware
  ipcMain.handle(
    IPC_CHANNELS.UNDO_REDO.GET_HISTORY,
    compose(
      withErrorHandling,
      withRequestId
    )(async (event, limit = 50) => {
      try {
        return (
          (await getServiceIntegration()?.undoRedo?.getHistory(limit)) || []
        );
      } catch (error) {
        logger.error('Failed to get action history:', error);
        return [];
      }
    }),
  );

  // Clear History Handler - with middleware
  ipcMain.handle(
    IPC_CHANNELS.UNDO_REDO.CLEAR_HISTORY,
    compose(
      withErrorHandling,
      withRequestId
    )(async () => {
      try {
        return (
          (await getServiceIntegration()?.undoRedo?.clearHistory()) || {
            success: true,
          }
        );
      } catch (error) {
        logger.error('Failed to clear action history:', error);
        return { success: false, message: (error as Error).message };
      }
    }),
  );

  // Can Undo Handler - with middleware
  ipcMain.handle(
    IPC_CHANNELS.UNDO_REDO.CAN_UNDO,
    compose(
      withErrorHandling,
      withRequestId
    )(async () => {
      try {
        return (await getServiceIntegration()?.undoRedo?.canUndo()) || false;
      } catch (error) {
        logger.error('Failed to check undo status:', error);
        return false;
      }
    }),
  );

  // Can Redo Handler - with middleware
  ipcMain.handle(
    IPC_CHANNELS.UNDO_REDO.CAN_REDO,
    compose(
      withErrorHandling,
      withRequestId
    )(async () => {
      try {
        return (await getServiceIntegration()?.undoRedo?.canRedo()) || false;
      } catch (error) {
        logger.error('Failed to check redo status:', error);
        return false;
      }
    }),
  );
}

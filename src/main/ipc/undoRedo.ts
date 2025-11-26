import { withRequestId, withErrorHandling, compose } from './validation';

/**
 * Helper to ensure ServiceIntegration and UndoRedo service are ready
 */
async function ensureUndoRedoService(
  getServiceIntegration: () => any,
): Promise<any> {
  const serviceIntegration = getServiceIntegration();

  if (!serviceIntegration) {
    throw new Error('ServiceIntegration not available');
  }

  // If not initialized, wait for initialization
  if (!serviceIntegration.initialized) {
    await serviceIntegration.initialize();
  }

  if (!serviceIntegration.undoRedo) {
    throw new Error('UndoRedo service not available');
  }

  return serviceIntegration.undoRedo;
}

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
      withRequestId,
    )(async () => {
      try {
        const undoRedoService = await ensureUndoRedoService(
          getServiceIntegration,
        );
        const result = await undoRedoService.undo();

        // Ensure consistent response format with canUndo/canRedo state
        return {
          success: true,
          ...result,
          canUndo: (await undoRedoService.canUndo?.()) || false,
          canRedo: (await undoRedoService.canRedo?.()) || false,
        };
      } catch (error) {
        logger.error('Failed to execute undo:', error);
        return {
          success: false,
          error: (error as Error).message,
          canUndo: false,
          canRedo: false,
        };
      }
    }),
  );

  // Redo Handler - with middleware
  ipcMain.handle(
    IPC_CHANNELS.UNDO_REDO.REDO,
    compose(
      withErrorHandling,
      withRequestId,
    )(async () => {
      try {
        const undoRedoService = await ensureUndoRedoService(
          getServiceIntegration,
        );
        const result = await undoRedoService.redo();

        // Ensure consistent response format with canUndo/canRedo state
        return {
          success: true,
          ...result,
          canUndo: (await undoRedoService.canUndo?.()) || false,
          canRedo: (await undoRedoService.canRedo?.()) || false,
        };
      } catch (error) {
        logger.error('Failed to execute redo:', error);
        return {
          success: false,
          error: (error as Error).message,
          canUndo: false,
          canRedo: false,
        };
      }
    }),
  );

  // Get History Handler - with middleware
  ipcMain.handle(
    IPC_CHANNELS.UNDO_REDO.GET_HISTORY,
    compose(
      withErrorHandling,
      withRequestId,
    )(async (event, data) => {
      try {
        const limit = typeof data === 'number' ? data : data?.limit || 50;
        const undoRedoService = await ensureUndoRedoService(
          getServiceIntegration,
        );
        const history = (await undoRedoService.getHistory?.(limit)) || [];

        return {
          success: true,
          history,
        };
      } catch (error) {
        logger.error('Failed to get action history:', error);
        return {
          success: false,
          error: (error as Error).message,
          history: [],
        };
      }
    }),
  );

  // Clear History Handler - with middleware
  ipcMain.handle(
    IPC_CHANNELS.UNDO_REDO.CLEAR_HISTORY,
    compose(
      withErrorHandling,
      withRequestId,
    )(async () => {
      try {
        const undoRedoService = await ensureUndoRedoService(
          getServiceIntegration,
        );
        await undoRedoService.clearHistory?.();

        return {
          success: true,
        };
      } catch (error) {
        logger.error('Failed to clear action history:', error);
        return { success: false, error: (error as Error).message };
      }
    }),
  );

  // Can Undo Handler - with middleware
  ipcMain.handle(
    IPC_CHANNELS.UNDO_REDO.CAN_UNDO,
    compose(
      withErrorHandling,
      withRequestId,
    )(async () => {
      try {
        const undoRedoService = await ensureUndoRedoService(
          getServiceIntegration,
        );
        const canUndo = (await undoRedoService.canUndo?.()) || false;

        return {
          success: true,
          canUndo,
        };
      } catch (error) {
        logger.error('Failed to check undo status:', error);
        return { success: true, canUndo: false };
      }
    }),
  );

  // Can Redo Handler - with middleware
  ipcMain.handle(
    IPC_CHANNELS.UNDO_REDO.CAN_REDO,
    compose(
      withErrorHandling,
      withRequestId,
    )(async () => {
      try {
        const undoRedoService = await ensureUndoRedoService(
          getServiceIntegration,
        );
        const canRedo = (await undoRedoService.canRedo?.()) || false;

        return {
          success: true,
          canRedo,
        };
      } catch (error) {
        logger.error('Failed to check redo status:', error);
        return { success: true, canRedo: false };
      }
    }),
  );
}

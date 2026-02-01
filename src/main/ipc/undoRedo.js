/**
 * Undo/Redo IPC Handlers
 *
 * Handles undo, redo, and action history operations.
 * Demonstrates the service check pattern with fallback responses.
 */
const { IpcServiceContext, createFromLegacyParams } = require('./IpcServiceContext');
// FIX: Import safeSend for validated IPC event sending
const { createHandler, safeHandle, safeSend } = require('./ipcWrappers');

function registerUndoRedoIpc(servicesOrParams) {
  let container;
  if (servicesOrParams instanceof IpcServiceContext) {
    container = servicesOrParams;
  } else {
    container = createFromLegacyParams(servicesOrParams);
  }

  const { ipcMain, IPC_CHANNELS, logger } = container.core;
  const { getServiceIntegration } = container;

  const context = 'UndoRedo';

  // Helper to get undo/redo service
  const getUndoRedoService = () => getServiceIntegration()?.undoRedo;

  // Undo action
  safeHandle(
    ipcMain,
    IPC_CHANNELS.UNDO_REDO.UNDO,
    createHandler({
      logger,
      context,
      serviceName: 'undoRedo',
      getService: getUndoRedoService,
      fallbackResponse: { success: false, message: 'Undo service unavailable' },
      handler: async (event, service) => {
        try {
          const result = (await service.undo()) || {
            success: false,
            message: 'Nothing to undo'
          };
          // FIX H-3: Notify renderer to refresh file state after successful undo
          // FIX: Use safeSend for validated IPC event sending
          if (result?.success && event?.sender && !event.sender.isDestroyed()) {
            safeSend(event.sender, IPC_CHANNELS.UNDO_REDO.STATE_CHANGED, {
              action: 'undo',
              result
            });
          }
          return result;
        } catch (error) {
          logger.error('Failed to execute undo:', error);
          return { success: false, message: error.message };
        }
      }
    })
  );

  // Redo action
  safeHandle(
    ipcMain,
    IPC_CHANNELS.UNDO_REDO.REDO,
    createHandler({
      logger,
      context,
      serviceName: 'undoRedo',
      getService: getUndoRedoService,
      fallbackResponse: { success: false, message: 'Redo service unavailable' },
      handler: async (event, service) => {
        try {
          const result = (await service.redo()) || {
            success: false,
            message: 'Nothing to redo'
          };
          // FIX H-3: Notify renderer to refresh file state after successful redo
          // FIX: Use safeSend for validated IPC event sending
          if (result?.success && event?.sender && !event.sender.isDestroyed()) {
            safeSend(event.sender, IPC_CHANNELS.UNDO_REDO.STATE_CHANGED, {
              action: 'redo',
              result
            });
          }
          return result;
        } catch (error) {
          logger.error('Failed to execute redo:', error);
          return { success: false, message: error.message };
        }
      }
    })
  );

  // Get action history
  safeHandle(
    ipcMain,
    IPC_CHANNELS.UNDO_REDO.GET_HISTORY,
    createHandler({
      logger,
      context,
      serviceName: 'undoRedo',
      getService: getUndoRedoService,
      fallbackResponse: [],
      handler: async (event, payload, service) => {
        try {
          const limit = payload && typeof payload === 'number' ? payload : 50;
          return (await service.getActionHistory(limit)) || [];
        } catch (error) {
          logger.error('Failed to get action history:', error);
          return [];
        }
      }
    })
  );

  // Get full undo/redo state for UI synchronization
  safeHandle(
    ipcMain,
    IPC_CHANNELS.UNDO_REDO.GET_STATE,
    createHandler({
      logger,
      context,
      serviceName: 'undoRedo',
      getService: getUndoRedoService,
      fallbackResponse: { stack: [], pointer: -1, canUndo: false, canRedo: false },
      handler: async (event, service) => {
        try {
          return (
            service.getFullState() || {
              stack: [],
              pointer: -1,
              canUndo: false,
              canRedo: false
            }
          );
        } catch (error) {
          logger.error('Failed to get undo/redo state:', error);
          return { stack: [], pointer: -1, canUndo: false, canRedo: false };
        }
      }
    })
  );

  // Clear action history
  safeHandle(
    ipcMain,
    IPC_CHANNELS.UNDO_REDO.CLEAR_HISTORY,
    createHandler({
      logger,
      context,
      serviceName: 'undoRedo',
      getService: getUndoRedoService,
      fallbackResponse: { success: true },
      handler: async (event, service) => {
        try {
          return (await service.clearHistory()) || { success: true };
        } catch (error) {
          logger.error('Failed to clear action history:', error);
          return { success: false, message: error.message };
        }
      }
    })
  );

  // Check if undo is available
  safeHandle(
    ipcMain,
    IPC_CHANNELS.UNDO_REDO.CAN_UNDO,
    createHandler({
      logger,
      context,
      serviceName: 'undoRedo',
      getService: getUndoRedoService,
      fallbackResponse: false,
      handler: async (event, service) => {
        try {
          return (await service.canUndo()) || false;
        } catch (error) {
          logger.error('Failed to check undo status:', error);
          return false;
        }
      }
    })
  );

  // Check if redo is available
  safeHandle(
    ipcMain,
    IPC_CHANNELS.UNDO_REDO.CAN_REDO,
    createHandler({
      logger,
      context,
      serviceName: 'undoRedo',
      getService: getUndoRedoService,
      fallbackResponse: false,
      handler: async (event, service) => {
        try {
          return (await service.canRedo()) || false;
        } catch (error) {
          logger.error('Failed to check redo status:', error);
          return false;
        }
      }
    })
  );
}

module.exports = registerUndoRedoIpc;

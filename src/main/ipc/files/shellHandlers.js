/**
 * Shell Operation Handlers
 *
 * Simple file/folder shell operations (open, reveal).
 *
 * @module ipc/files/shellHandlers
 */

const { withErrorLogging } = require('../withErrorLogging');
const { logger } = require('../../../shared/logger');

logger.setContext('IPC:Files:Shell');

/**
 * Register shell operation IPC handlers
 *
 * @param {Object} params - Registration parameters
 * @param {Object} params.ipcMain - Electron IPC main
 * @param {Object} params.IPC_CHANNELS - IPC channel constants
 * @param {Object} params.shell - Electron shell module
 */
function registerShellHandlers({ ipcMain, IPC_CHANNELS, shell }) {
  // Open file with default application
  ipcMain.handle(
    IPC_CHANNELS.FILES.OPEN_FILE,
    withErrorLogging(logger, async (event, filePath) => {
      try {
        await shell.openPath(filePath);
        logger.info('[FILE-OPS] Opened file:', filePath);
        return { success: true };
      } catch (error) {
        logger.error('[FILE-OPS] Error opening file:', error);
        return { success: false, error: error.message };
      }
    }),
  );

  // Reveal file in file explorer
  ipcMain.handle(
    IPC_CHANNELS.FILES.REVEAL_FILE,
    withErrorLogging(logger, async (event, filePath) => {
      try {
        await shell.showItemInFolder(filePath);
        logger.info('[FILE-OPS] Revealed file in folder:', filePath);
        return { success: true };
      } catch (error) {
        logger.error('[FILE-OPS] Error revealing file:', error);
        return { success: false, error: error.message };
      }
    }),
  );
}

module.exports = { registerShellHandlers };

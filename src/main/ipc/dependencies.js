const { createHandler } = require('./ipcWrappers');
const { DependencyManagerService } = require('../services/DependencyManagerService');
const { getStartupManager } = require('../services/startup');

/**
 * Dependency management IPC.
 *
 * Emits progress via the existing 'operation-progress' event channel to avoid
 * introducing new receive channels.
 */
function registerDependenciesIpc({ ipcMain, IPC_CHANNELS, logger, getMainWindow }) {
  const safeLogger = logger || {
    info: () => {},
    debug: () => {},
    warn: () => {},
    error: () => {}
  };

  const sendProgress = (payload) => {
    try {
      const win = typeof getMainWindow === 'function' ? getMainWindow() : null;
      if (win && !win.isDestroyed()) {
        win.webContents.send('operation-progress', {
          type: 'dependency',
          ...payload
        });
      }
    } catch (e) {
      safeLogger.debug?.('[DependenciesIPC] Failed to emit progress', { error: e?.message });
    }
  };

  const manager = new DependencyManagerService({
    onProgress: (data) => sendProgress(data)
  });

  ipcMain.handle(
    IPC_CHANNELS.DEPENDENCIES.GET_STATUS,
    createHandler({
      logger: safeLogger,
      context: 'DependenciesIPC',
      handler: async () => {
        const status = await manager.getStatus();
        return { success: true, status };
      }
    })
  );

  ipcMain.handle(
    IPC_CHANNELS.DEPENDENCIES.INSTALL_OLLAMA,
    createHandler({
      logger: safeLogger,
      context: 'DependenciesIPC',
      handler: async () => {
        sendProgress({ message: 'Starting Ollama installation…', dependency: 'ollama' });
        const result = await manager.installOllama();
        if (result.success) {
          sendProgress({ message: 'Ollama installed.', dependency: 'ollama', stage: 'done' });
          // Best-effort: start via StartupManager so it is tracked/managed
          try {
            const startupManager = getStartupManager();
            await startupManager.startOllama();
          } catch (e) {
            safeLogger.warn?.('[DependenciesIPC] Failed to start Ollama after install', {
              error: e?.message
            });
          }
        } else {
          sendProgress({
            message: `Ollama install failed: ${result.error}`,
            dependency: 'ollama',
            stage: 'error'
          });
        }
        return result;
      }
    })
  );

  ipcMain.handle(
    IPC_CHANNELS.DEPENDENCIES.UPDATE_OLLAMA,
    createHandler({
      logger: safeLogger,
      context: 'DependenciesIPC',
      handler: async () => {
        sendProgress({ message: 'Updating Ollama…', dependency: 'ollama' });
        const result = await manager.updateOllama();
        return result;
      }
    })
  );

  ipcMain.handle(
    IPC_CHANNELS.DEPENDENCIES.INSTALL_CHROMADB,
    createHandler({
      logger: safeLogger,
      context: 'DependenciesIPC',
      handler: async () => {
        sendProgress({ message: 'Installing ChromaDB…', dependency: 'chromadb' });
        const result = await manager.installChromaDb({ upgrade: false, userInstall: true });
        if (result.success) {
          sendProgress({ message: 'ChromaDB installed.', dependency: 'chromadb', stage: 'done' });
          // Best-effort: attempt to start right away without requiring an app restart
          try {
            const startupManager = getStartupManager();
            await startupManager.startChromaDB();
          } catch (e) {
            safeLogger.warn?.('[DependenciesIPC] Failed to start ChromaDB after install', {
              error: e?.message
            });
          }
        } else {
          sendProgress({
            message: `ChromaDB install failed: ${result.error}`,
            dependency: 'chromadb',
            stage: 'error'
          });
        }
        return result;
      }
    })
  );

  ipcMain.handle(
    IPC_CHANNELS.DEPENDENCIES.UPDATE_CHROMADB,
    createHandler({
      logger: safeLogger,
      context: 'DependenciesIPC',
      handler: async () => {
        sendProgress({ message: 'Updating ChromaDB…', dependency: 'chromadb' });
        const result = await manager.updateChromaDb();
        return result;
      }
    })
  );
}

module.exports = { registerDependenciesIpc };

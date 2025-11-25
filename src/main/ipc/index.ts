import registerFilesIpc from './files';
import registerSmartFoldersIpc from './smartFolders';
import { registerUndoRedoIpc } from './undoRedo';
import { registerAnalysisHistoryIpc } from './analysisHistory';
import { registerSystemIpc } from './system';
import { registerOllamaIpc } from './ollama';
import registerAnalysisIpc from './analysis';
import registerSettingsIpc from './settings';
import registerEmbeddingsIpc from './semantic';
import { registerWindowIpc } from './window';
import { registerSuggestionsIpc } from './suggestions';
import { registerOrganizeIpc } from './organize';
import { registerServiceHealthHandlers } from './serviceHealth';

function registerAllIpc({
  ipcMain,
  IPC_CHANNELS,
  logger,
  dialog,
  shell,
  systemAnalytics,
  getMainWindow,
  getServiceIntegration,
  getCustomFolders,
  setCustomFolders,
  saveCustomFolders,
  analyzeDocumentFile,
  analyzeImageFile,
  tesseract,
  getOllama,
  getOllamaModel,
  getOllamaVisionModel,
  getOllamaEmbeddingModel,
  getOllamaHost,
  buildOllamaOptions,
  scanDirectory,
  settingsService,
  setOllamaHost,
  setOllamaModel,
  setOllamaVisionModel,
  setOllamaEmbeddingModel,
  onSettingsChanged,
}) {
  registerFilesIpc({
    ipcMain,
    IPC_CHANNELS,
    logger,
    dialog,
    shell,
    getMainWindow,
    getServiceIntegration,
  });
  registerSmartFoldersIpc({
    ipcMain,
    IPC_CHANNELS,
    logger,
    getCustomFolders,
    setCustomFolders,
    saveCustomFolders,
    buildOllamaOptions,
    getOllamaModel,
    scanDirectory,
  });
  registerUndoRedoIpc({ ipcMain, IPC_CHANNELS, logger, getServiceIntegration });
  registerAnalysisHistoryIpc({
    ipcMain,
    IPC_CHANNELS,
    logger,
    getServiceIntegration,
  });
  registerSystemIpc({
    ipcMain,
    IPC_CHANNELS,
    logger,
    systemAnalytics,
    getServiceIntegration,
  });
  registerOllamaIpc({
    ipcMain,
    IPC_CHANNELS,
    logger,
    systemAnalytics,
    getMainWindow,
    getOllama,
    getOllamaModel,
    getOllamaVisionModel,
    getOllamaEmbeddingModel,
    getOllamaHost,
  });
  registerAnalysisIpc({
    ipcMain,
    IPC_CHANNELS,
    logger,
    tesseract,
    systemAnalytics,
    analyzeDocumentFile,
    analyzeImageFile,
    getServiceIntegration,
    getCustomFolders,
  });
  registerSettingsIpc({
    ipcMain,
    IPC_CHANNELS,
    logger,
    settingsService,
    setOllamaHost,
    setOllamaModel,
    setOllamaVisionModel,
    setOllamaEmbeddingModel,
    onSettingsChanged,
  });
  registerEmbeddingsIpc({
    ipcMain,
    IPC_CHANNELS,
    logger,
    getCustomFolders,
    getServiceIntegration,
  });
  registerWindowIpc({ ipcMain, IPC_CHANNELS, getMainWindow });

  // Register suggestions IPC - ALWAYS register handlers even if services unavailable
  // Handlers will gracefully handle missing services and return appropriate errors
  if (getServiceIntegration) {
    const serviceIntegration = getServiceIntegration();

    // Get services (may be null if ChromaDB unavailable)
    const chromaDbService = serviceIntegration?.chromaDbService || null;
    const folderMatchingService =
      serviceIntegration?.folderMatchingService || null;

    if (!chromaDbService || !folderMatchingService) {
      logger.warn(
        '[IPC] Some services unavailable (ChromaDB or FolderMatching), suggestions will have limited functionality',
      );
    }

    // CRITICAL FIX: Always register handlers to prevent "No handler registered" errors
    // Handlers will check for null services and return graceful errors
    registerSuggestionsIpc({
      ipcMain,
      IPC_CHANNELS,
      chromaDbService,
      folderMatchingService,
      settingsService,
      getCustomFolders,
    });

    // Register organize IPC - ALWAYS register handlers
    registerOrganizeIpc({
      ipcMain,
      IPC_CHANNELS,
      getServiceIntegration,
      getCustomFolders,
    });

    logger.info('[IPC] Suggestions and organize handlers registered');
  } else {
    logger.error(
      '[IPC] getServiceIntegration not provided, cannot register suggestions/organize handlers',
    );
  }

  // Register service health monitoring handlers
  registerServiceHealthHandlers();
  logger.info('[IPC] Service health handlers registered');
}

export { registerAllIpc };

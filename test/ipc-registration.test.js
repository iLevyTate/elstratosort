const { ipcMain, dialog, shell } = require('./mocks/electron');
const { registerAllIpc } = require('../src/main/ipc');

describe('IPC registration', () => {
  beforeEach(() => {
    ipcMain._handlers.clear();
    ipcMain.handle.mockClear();
  });

  test('registerAllIpc registers core channels', () => {
    const IPC_CHANNELS = require('../src/shared/constants').IPC_CHANNELS;
    registerAllIpc({
      ipcMain,
      IPC_CHANNELS,
      logger: { info: jest.fn(), error: jest.fn(), warn: jest.fn() },
      dialog,
      shell,
      systemAnalytics: { collectMetrics: jest.fn(async () => ({})) },
      getMainWindow: () => null,
      getServiceIntegration: () => ({
        undoRedo: {},
        analysisHistory: {},
        processingState: {},
      }),
      getCustomFolders: () => [],
      setCustomFolders: () => {},
      saveCustomFolders: async () => {},
      analyzeDocumentFile: async () => ({ success: true }),
      analyzeImageFile: async () => ({ success: true }),
      tesseract: { recognize: async () => 'text' },
      getOllama: () => ({ list: async () => ({ models: [] }) }),
      getOllamaModel: () => 'llama3.2:latest',
      getOllamaVisionModel: () => null,
      buildOllamaOptions: async () => ({}),
      scanDirectory: async () => [],
    });

    // Note: Some channels are defined in constants but handlers not yet implemented
    // TODO: Implement handlers for SELECT_DIRECTORY, GET_DOCUMENTS_PATH,
    //       CREATE_FOLDER_DIRECT, GET_FILE_STATS, GET_FILES_IN_DIRECTORY
    const unimplementedChannels = [
      IPC_CHANNELS.FILES.SELECT_DIRECTORY,
      IPC_CHANNELS.FILES.GET_DOCUMENTS_PATH,
      IPC_CHANNELS.FILES.CREATE_FOLDER_DIRECT,
      IPC_CHANNELS.FILES.GET_FILE_STATS,
      IPC_CHANNELS.FILES.GET_FILES_IN_DIRECTORY,
    ];

    const expectedChannels = [
      // Files (excluding unimplemented)
      ...Object.values(IPC_CHANNELS.FILES).filter(
        (ch) => !unimplementedChannels.includes(ch),
      ),
      // Smart folders
      ...Object.values(IPC_CHANNELS.SMART_FOLDERS),
      // Undo/redo
      ...Object.values(IPC_CHANNELS.UNDO_REDO),
      // Analysis
      ...Object.values(IPC_CHANNELS.ANALYSIS),
      // Settings
      ...Object.values(IPC_CHANNELS.SETTINGS),
      // System
      ...Object.values(IPC_CHANNELS.SYSTEM),
      // Analysis history
      ...Object.values(IPC_CHANNELS.ANALYSIS_HISTORY),
      // Ollama
      ...Object.values(IPC_CHANNELS.OLLAMA),
    ];

    // Check that handlers are registered for expected channels
    const missing = expectedChannels.filter((ch) => !ipcMain._handlers.has(ch));
    expect(missing).toEqual([]);
  });
});

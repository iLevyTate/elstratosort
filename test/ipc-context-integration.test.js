/**
 * Tests for IpcServiceContext Integration
 * Verifies that registerAllIpc and individual handlers correctly work with IpcServiceContext
 */

const { ipcMain, dialog, shell, app } = require('./mocks/electron');
const { registerAllIpc, IpcServiceContext } = require('../src/main/ipc');
const { IPC_CHANNELS } = require('../src/shared/constants');

// Mock logger
jest.mock('../src/shared/logger', () => ({
  logger: {
    setContext: jest.fn(),
    info: jest.fn(),
    debug: jest.fn(),
    warn: jest.fn(),
    error: jest.fn()
  }
}));

describe('IpcServiceContext Integration', () => {
  let context;

  beforeEach(() => {
    jest.clearAllMocks();
    ipcMain._handlers.clear();
    ipcMain.handle.mockClear();

    // Create a fully populated context
    context = new IpcServiceContext()
      .setCore({
        ipcMain,
        IPC_CHANNELS,
        logger: require('../src/shared/logger').logger
      })
      .setElectron({
        dialog,
        shell,
        getMainWindow: () => null
      })
      .setFolders({
        getCustomFolders: jest.fn(() => []),
        setCustomFolders: jest.fn(),
        saveCustomFolders: jest.fn(),
        scanDirectory: jest.fn(() => [])
      })
      .setAnalysis({
        analyzeDocumentFile: jest.fn(() => ({ success: true })),
        analyzeImageFile: jest.fn(() => ({ success: true })),
        tesseract: { recognize: jest.fn(() => 'text') }
      })
      .setOllama({
        getOllama: jest.fn(() => ({ list: async () => ({ models: [] }) })),
        getOllamaHost: jest.fn(),
        setOllamaHost: jest.fn(),
        getOllamaModel: jest.fn(() => 'llama3.2:latest'),
        setOllamaModel: jest.fn(),
        getOllamaVisionModel: jest.fn(),
        setOllamaVisionModel: jest.fn(),
        getOllamaEmbeddingModel: jest.fn(),
        setOllamaEmbeddingModel: jest.fn(),
        buildOllamaOptions: jest.fn(async () => ({}))
      })
      .setSettings({
        settingsService: { get: jest.fn() },
        onSettingsChanged: jest.fn()
      })
      .setSystemAnalytics({
        collectMetrics: jest.fn(async () => ({}))
      })
      .setServiceIntegration(
        jest.fn(() => ({
          undoRedo: {},
          analysisHistory: {},
          processingState: {}
        }))
      );
  });

  test('registerAllIpc successfully registers all handlers with valid context', () => {
    registerAllIpc(context);

    // Verify key handlers are registered
    expect(ipcMain.handle).toHaveBeenCalled();

    // Check for specific channels from different domains
    const handlers = ipcMain._handlers;

    // File handlers
    expect(handlers.has(IPC_CHANNELS.FILES.SELECT)).toBe(true);

    // Smart folder handlers
    expect(handlers.has(IPC_CHANNELS.SMART_FOLDERS.GET)).toBe(true);

    // Analysis handlers
    expect(handlers.has(IPC_CHANNELS.ANALYSIS.ANALYZE_DOCUMENT)).toBe(true);

    // Settings handlers
    expect(handlers.has(IPC_CHANNELS.SETTINGS.GET)).toBe(true);
  });

  test('registerAllIpc throws if context is invalid', () => {
    const invalidContext = new IpcServiceContext().setCore({
      ipcMain: null, // Missing ipcMain
      IPC_CHANNELS,
      logger: require('../src/shared/logger').logger
    });

    expect(() => registerAllIpc(invalidContext)).toThrow(
      /IpcServiceContext missing required services/
    );
  });

  test('registerAllIpc works with legacy parameters (backward compatibility)', () => {
    const legacyParams = context.toLegacyParams();

    registerAllIpc(legacyParams);

    // Should still register handlers
    expect(ipcMain._handlers.has(IPC_CHANNELS.FILES.SELECT)).toBe(true);
  });
});

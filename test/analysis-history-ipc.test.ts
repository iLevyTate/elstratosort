const { ipcMain } = require('./mocks/electron');

describe('AnalysisHistory IPC', () => {
  beforeEach(() => {
    ipcMain._handlers.clear();
    ipcMain.handle.mockClear();
  });

  test('GET/SEARCH/GET_STATISTICS/EXPORT are wired', async () => {
    const registerAllIpc = require('../src/main/ipc').registerAllIpc;
    const { IPC_CHANNELS } = require('../src/shared/constants');
    const logger = {
      error: jest.fn(),
      info: jest.fn(),
      warn: jest.fn(),
      debug: jest.fn(),
      setContext: jest.fn(),
    };
    const service = {
      get: jest.fn(async () => []),
      searchAnalysis: jest.fn(async () => []),
      getStatistics: jest.fn(async () => ({ total: 0 })),
      getFileHistory: jest.fn(async () => []),
      clear: jest.fn(async () => ({})),
      export: jest.fn(async () => ({ success: true, path: 'out.json' })),
      getRecentAnalysis: jest.fn(async () => []),
    };

    registerAllIpc({
      ipcMain,
      IPC_CHANNELS,
      logger,
      systemAnalytics: { collectMetrics: jest.fn(async () => ({})) },
      getServiceIntegration: () => ({ analysisHistory: service }),
    });

    // Handlers now return standardized response format: { success: true, data: ... }
    const hGet = ipcMain._handlers.get(IPC_CHANNELS.ANALYSIS_HISTORY.GET);
    const getResult = await hGet();
    expect(getResult.success).toBe(true);
    expect(Array.isArray(getResult.data)).toBe(true);

    const hSearch = ipcMain._handlers.get(IPC_CHANNELS.ANALYSIS_HISTORY.SEARCH);
    const searchResult = await hSearch('term', {});
    expect(searchResult.success).toBe(true);
    expect(Array.isArray(searchResult.data)).toBe(true);

    const hStats = ipcMain._handlers.get(
      IPC_CHANNELS.ANALYSIS_HISTORY.GET_STATISTICS,
    );
    const statsResult = await hStats();
    expect(statsResult.success).toBe(true);
    expect(statsResult.data.total).toBe(0);

    const hExport = ipcMain._handlers.get(IPC_CHANNELS.ANALYSIS_HISTORY.EXPORT);
    const exportResult = await hExport('json');
    expect(exportResult.success).toBe(true);
  });
});

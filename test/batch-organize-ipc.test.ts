const { ipcMain, dialog, shell } = require('./mocks/electron');

// Mock ChromaDBService - mockUpdateFilePaths must be defined before mock
const mockUpdateFilePaths = jest.fn().mockResolvedValue(0);
jest.mock('../src/main/services/ChromaDBService', () => ({
  getInstance: () => ({
    updateFilePaths: mockUpdateFilePaths,
  }),
}));

// Mock FileOrganizationSaga to handle batch operations
// Use require inside the mock factory to avoid out-of-scope variable error
jest.mock('../src/main/services/transaction', () => ({
  FileOrganizationSaga: jest.fn().mockImplementation(() => ({
    execute: jest.fn().mockImplementation(async (operations) => {
      // Use require inside to avoid jest.mock scoping issue
      const mockFs = require('fs').promises;
      const results = [];
      for (const op of operations) {
        try {
          await mockFs.rename(op.source, op.destination);
          results.push({
            success: true,
            operation: op,
          });
        } catch (opError: any) {
          results.push({
            success: false,
            operation: op,
            error: opError.message,
          });
        }
      }
      const successCount = results.filter((r) => r.success).length;
      return {
        success: successCount > 0,
        results,
        successCount,
        failCount: results.length - successCount,
        transactionId: `test-${Date.now()}`,
      };
    }),
    recoverIncompleteTransactions: jest.fn().mockResolvedValue([]),
  })),
}));

describe('Files IPC - batch organize', () => {
  beforeEach(() => {
    ipcMain._handlers.clear();
    ipcMain.handle.mockClear();
    mockUpdateFilePaths.mockClear();
  });

  function register() {
    const { IPC_CHANNELS, ACTION_TYPES } = require('../src/shared/constants');
    const registerAllIpc = require('../src/main/ipc').registerAllIpc;
    const logger = {
      info: jest.fn(),
      error: jest.fn(),
      warn: jest.fn(),
      debug: jest.fn(),
      setContext: jest.fn(),
    };
    const getMainWindow = () => ({
      isDestroyed: () => false,
      webContents: { send: jest.fn() },
    });
    const serviceIntegration = {
      undoRedo: { recordAction: jest.fn(async () => {}) },
      processingState: {
        createOrLoadOrganizeBatch: jest.fn(async (_id, ops) => ({
          id: 'batch_test',
          operations: ops,
        })),
        markOrganizeOpStarted: jest.fn(async () => {}),
        markOrganizeOpDone: jest.fn(async () => {}),
        markOrganizeOpError: jest.fn(async () => {}),
        completeOrganizeBatch: jest.fn(async () => {}),
      },
    };

    registerAllIpc({
      ipcMain,
      IPC_CHANNELS,
      logger,
      dialog,
      shell,
      systemAnalytics: { collectMetrics: jest.fn(async () => ({})) },
      getMainWindow,
      getServiceIntegration: () => serviceIntegration,
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
    });
    return { IPC_CHANNELS, ACTION_TYPES, serviceIntegration };
  }

  test('performs batch organize and records undo batch', async () => {
    // expect.assertions(5); // Removed explicit assertion count to avoid maintenance burden
    const { IPC_CHANNELS } = register();
    const handler = ipcMain._handlers.get(IPC_CHANNELS.FILES.PERFORM_OPERATION);

    const tmp = require('os').tmpdir();
    const path = require('path');
    const fs = require('fs').promises;
    const sourceA = path.join(tmp, `src_A_${Date.now()}.txt`);
    const destA = path.join(tmp, `dest_A_${Date.now()}.txt`);
    const sourceB = path.join(tmp, `src_B_${Date.now()}.txt`);
    const destB = path.join(tmp, `dest_B_${Date.now()}.txt`);
    await fs.writeFile(sourceA, 'A');
    await fs.writeFile(sourceB, 'B');

    const result = await handler(null, {
      type: 'batch_organize',
      operations: [
        { source: sourceA, destination: destA },
        { source: sourceB, destination: destB },
      ],
    });

    // Debug: Check if result is what we expect
    if (!result || typeof result !== 'object') {
      console.error('Result is not an object:', result);
    } else if (!result.success) {
      console.error('Operation failed. Result keys:', Object.keys(result));
      console.error('Full result:', result);
    }

    const success = result?.success ?? false;
    const results = result?.results ?? [];
    const successCount = result?.successCount ?? 0;
    const failCount = result?.failCount ?? 0;
    expect(success).toBe(true);
    expect(successCount).toBe(2);
    expect(failCount).toBe(0);
    expect(Array.isArray(results)).toBe(true);

    // Verify database update was called with path updates
    expect(mockUpdateFilePaths).toHaveBeenCalled();
    const updateCalls = mockUpdateFilePaths.mock.calls[0][0];
    expect(updateCalls).toHaveLength(2);
    expect(updateCalls[0].oldId).toContain('src_A');
    expect(updateCalls[0].newId).toContain('dest_A');

    // Cleanup test files
    try {
      await fs.unlink(destA);
      await fs.unlink(destB);
    } catch (_e) {
      // Ignore cleanup errors
    }
  });
});

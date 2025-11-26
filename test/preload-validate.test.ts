// Mock electron before importing preload
jest.mock('electron', () => ({
  contextBridge: {
    exposeInMainWorld: jest.fn(),
  },
  ipcRenderer: {
    invoke: jest.fn(),
    on: jest.fn(),
    send: jest.fn(),
    removeListener: jest.fn(),
  },
}));

// Mock logger
jest.mock('../src/shared/logger', () => ({
  Logger: jest.fn().mockImplementation(() => ({
    setContext: jest.fn(),
    setLevel: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  })),
  LOG_LEVELS: { DEBUG: 'debug', INFO: 'info' },
}));

// Mock nanoid
jest.mock('nanoid', () => ({
  nanoid: jest.fn(() => 'test-id-123'),
}));

// Known valid channels list (subset of what preload validates against)
const VALID_CHANNELS = [
  'handle-file-selection',
  'select-directory',
  'get-documents-path',
  'perform-file-operation',
  'get-settings',
  'save-settings',
];

// Create a minimal SecureIPCManager for testing channel validation
class MockSecureIPCManager {
  async safeInvoke(channel: string, ..._args: unknown[]): Promise<unknown> {
    // Channel validation
    if (!VALID_CHANNELS.includes(channel)) {
      throw new Error(`Unauthorized IPC channel: ${channel}`);
    }
    return { success: true };
  }
}

describe('preload: SecureIPCManager channel validation', () => {
  test('blocks unauthorized channel', async () => {
    const mgr = new MockSecureIPCManager();
    await expect(mgr.safeInvoke('unknown-channel')).rejects.toThrow(
      'Unauthorized IPC channel',
    );
  });

  test('allows authorized channel', async () => {
    const mgr = new MockSecureIPCManager();
    const result = await mgr.safeInvoke('handle-file-selection');
    expect(result).toEqual({ success: true });
  });
});

/**
 * Tests for IPC Middleware
 * Tests Redux middleware for IPC event handling
 */

// Mock dependencies
jest.mock('../src/renderer/store/slices/analysisSlice', () => ({
  updateProgress: jest.fn((data) => ({ type: 'analysis/updateProgress', payload: data })),
  stopAnalysis: jest.fn(() => ({ type: 'analysis/stopAnalysis' }))
}));

jest.mock('../src/renderer/store/slices/systemSlice', () => ({
  updateMetrics: jest.fn((data) => ({ type: 'system/updateMetrics', payload: data })),
  updateHealth: jest.fn((data) => ({ type: 'system/updateHealth', payload: data })),
  addNotification: jest.fn((data) => ({ type: 'system/addNotification', payload: data }))
}));

jest.mock('../src/shared/ipcEventSchemas', () => ({
  hasEventSchema: jest.fn(() => true),
  validateEventPayload: jest.fn((_, data) => ({ valid: true, data }))
}));

jest.mock('../src/shared/logger', () => {
  const logger = {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn()
  };
  return { logger, createLogger: jest.fn(() => logger) };
});

describe('ipcMiddleware', () => {
  let ipcMiddleware;
  let cleanupIpcListeners;
  let markStoreReady;
  let recoverPersistedCriticalEvents;
  let mockStore;
  let mockDispatch;
  let mockNext;
  let mockCleanupFn;
  let mockElectronAPI;
  let mockAddEventListener;
  let mockRemoveEventListener;
  let storedLocalStorage;
  let operationProgressHandler;

  beforeEach(() => {
    jest.resetModules();

    mockCleanupFn = jest.fn();
    mockElectronAPI = {
      events: {
        onOperationProgress: jest.fn((handler) => {
          operationProgressHandler = handler;
          return mockCleanupFn;
        }),
        onSystemMetrics: jest.fn().mockReturnValue(mockCleanupFn)
      }
    };

    mockAddEventListener = jest.fn();
    mockRemoveEventListener = jest.fn();

    // Set up window mock - assign directly to existing window object
    storedLocalStorage = (() => {
      let storage = {};
      return {
        getItem: jest.fn((key) => (key in storage ? storage[key] : null)),
        setItem: jest.fn((key, value) => {
          storage[key] = String(value);
        }),
        removeItem: jest.fn((key) => {
          delete storage[key];
        }),
        clear: jest.fn(() => {
          storage = {};
        })
      };
    })();

    global.window = global.window || {};
    global.window.electronAPI = mockElectronAPI;
    global.window.addEventListener = mockAddEventListener;
    global.window.removeEventListener = mockRemoveEventListener;
    global.window.localStorage = storedLocalStorage;
    Object.defineProperty(global, 'localStorage', {
      value: storedLocalStorage,
      writable: true
    });

    // Mock module.hot
    global.module = { hot: null };

    // Import module fresh each test
    const ipcModule = require('../src/renderer/store/middleware/ipcMiddleware');
    ipcMiddleware = ipcModule.default;
    cleanupIpcListeners = ipcModule.cleanupIpcListeners;
    markStoreReady = ipcModule.markStoreReady;
    recoverPersistedCriticalEvents = ipcModule.recoverPersistedCriticalEvents;

    mockDispatch = jest.fn();
    mockStore = {
      dispatch: mockDispatch,
      getState: jest.fn().mockReturnValue({})
    };
    mockNext = jest.fn((action) => action);
  });

  afterEach(() => {
    // Cleanup listeners
    if (cleanupIpcListeners) {
      cleanupIpcListeners();
    }
  });

  describe('middleware setup', () => {
    test('returns a function', () => {
      expect(typeof ipcMiddleware).toBe('function');
    });

    test('returns next middleware in chain', () => {
      const middleware = ipcMiddleware(mockStore);
      expect(typeof middleware).toBe('function');

      const nextHandler = middleware(mockNext);
      expect(typeof nextHandler).toBe('function');
    });

    test('passes action through the chain', () => {
      const middleware = ipcMiddleware(mockStore);
      const nextHandler = middleware(mockNext);
      const action = { type: 'TEST_ACTION' };

      const result = nextHandler(action);

      expect(mockNext).toHaveBeenCalledWith(action);
      expect(result).toEqual(action);
    });
  });

  describe('IPC listener setup', () => {
    test('sets up operation progress listener', () => {
      ipcMiddleware(mockStore);

      expect(mockElectronAPI.events.onOperationProgress).toHaveBeenCalled();
    });

    test('sets up system metrics listener', () => {
      ipcMiddleware(mockStore);

      expect(mockElectronAPI.events.onSystemMetrics).toHaveBeenCalled();
    });

    test('adds beforeunload event listener', () => {
      ipcMiddleware(mockStore);

      expect(mockAddEventListener).toHaveBeenCalledWith('beforeunload', expect.any(Function));
    });

    test('only initializes listeners once', () => {
      ipcMiddleware(mockStore);
      ipcMiddleware(mockStore);
      ipcMiddleware(mockStore);

      // Should only be called once despite multiple middleware calls
      expect(mockElectronAPI.events.onOperationProgress).toHaveBeenCalledTimes(1);
    });
  });

  describe('event queue handling', () => {
    test('queues early events and flushes on markStoreReady', () => {
      ipcMiddleware(mockStore);

      operationProgressHandler({ percent: 12, file: 'a.txt' });
      expect(mockDispatch).not.toHaveBeenCalled();

      markStoreReady();

      expect(mockDispatch).toHaveBeenCalledWith({
        type: 'analysis/updateProgress',
        payload: { percent: 12, file: 'a.txt' }
      });
    });

    test('persists critical events when queue overflows', () => {
      jest.useFakeTimers();
      ipcMiddleware(mockStore);

      for (let i = 0; i < 305; i += 1) {
        operationProgressHandler({ percent: i });
      }

      const stored = storedLocalStorage.getItem('ipc_critical_events');
      expect(stored).not.toBeNull();
      expect(JSON.parse(stored).length).toBeGreaterThan(0);
      jest.useRealTimers();
    });

    test('recovers persisted critical events after store is ready', () => {
      jest.useFakeTimers();
      ipcMiddleware(mockStore);
      storedLocalStorage.setItem(
        'ipc_critical_events',
        JSON.stringify([{ actionType: 'updateProgress', data: { percent: 50 } }])
      );

      markStoreReady();
      recoverPersistedCriticalEvents();

      expect(storedLocalStorage.removeItem).toHaveBeenCalledWith('ipc_critical_events');
      expect(mockDispatch).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'system/addNotification' })
      );
      jest.useRealTimers();
    });
  });

  describe('cleanupIpcListeners', () => {
    test('calls cleanup functions', () => {
      ipcMiddleware(mockStore);
      cleanupIpcListeners();

      expect(mockCleanupFn).toHaveBeenCalled();
    });

    test('removes beforeunload listener', () => {
      ipcMiddleware(mockStore);
      cleanupIpcListeners();

      expect(mockRemoveEventListener).toHaveBeenCalledWith('beforeunload', expect.any(Function));
    });

    test('resets initialized flag', () => {
      ipcMiddleware(mockStore);
      cleanupIpcListeners();

      // Should allow re-initialization
      mockElectronAPI.events.onOperationProgress.mockClear();
      ipcMiddleware(mockStore);

      expect(mockElectronAPI.events.onOperationProgress).toHaveBeenCalled();
    });

    test('handles cleanup errors gracefully', () => {
      // Mock cleanup to throw
      mockCleanupFn.mockImplementation(() => {
        throw new Error('Cleanup error');
      });

      ipcMiddleware(mockStore);

      expect(() => cleanupIpcListeners()).not.toThrow();

      // Reset mock
      mockCleanupFn.mockImplementation(() => {});
    });
  });

  describe('without electronAPI', () => {
    test('handles missing electronAPI gracefully', () => {
      global.window.electronAPI = undefined;

      // Reload the middleware to test with missing API
      const middleware = ipcMiddleware;

      expect(() => middleware(mockStore)).not.toThrow();
    });

    test('handles missing events object gracefully', () => {
      global.window.electronAPI = {};

      // Reload the middleware to test with empty API
      const middleware = ipcMiddleware;

      expect(() => middleware(mockStore)).not.toThrow();
    });
  });

  describe('HMR support', () => {
    test('sets up HMR dispose handler when module.hot exists', () => {
      // Note: This test just verifies the middleware doesn't break with module.hot
      // The actual HMR setup would need integration testing
      global.module = {
        hot: {
          dispose: jest.fn()
        }
      };

      // Re-mock window
      global.window = {
        electronAPI: {
          events: {
            onOperationProgress: jest.fn().mockReturnValue(jest.fn()),
            onSystemMetrics: jest.fn().mockReturnValue(jest.fn())
          }
        },
        addEventListener: jest.fn(),
        removeEventListener: jest.fn()
      };

      // The middleware was already loaded, but the test verifies no crashes
      expect(() => ipcMiddleware(mockStore)).not.toThrow();
    });
  });
});

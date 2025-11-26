/**
 * IPC Middleware - Synchronizes state with main process via IPC
 * Handles bidirectional communication between renderer and main process
 */
import { logger } from '../../../shared/logger';

// Actions that should trigger IPC sync to main process
const IPC_SYNC_ACTIONS = {
  // Settings changes should be saved to main
  'settings/updateSetting': 'settings',
  'settings/updateMultipleSettings': 'settings',
  'settings/toggleAutoOrganize': 'settings',
  'settings/togglePreserveNames': 'settings',
  'settings/toggleCompactMode': 'settings',
  'settings/toggleNotifications': 'settings',
  'settings/setTheme': 'settings',

  // System state changes
  'system/setServiceStatus': 'system',
  'system/updateSystemMetrics': 'system',

  // Organization stats might need sync
  'organize/setBatchProgress': 'organize',
};

// Main process events mapping (implemented in setupMainProcessListeners below)
// These events are received from the main process and dispatched to Redux actions

interface Store {
  dispatch: (action: { type: string; payload?: unknown }) => void;
  getState: () => unknown;
}

class IPCManager {
  store: Store | null;
  eventUnsubscribers: Array<() => void>;
  isInitialized: boolean;

  constructor() {
    this.store = null;
    this.eventUnsubscribers = [];
    this.isInitialized = false;
  }

  /**
   * Initialize IPC listeners
   */
  initialize(store: Store): void {
    if (this.isInitialized) {
      console.warn('[IPCMiddleware] Already initialized');
      return;
    }
    this.store = store;
    this.setupMainProcessListeners();
    this.isInitialized = true;
  }

  /**
   * Setup listeners for main process events
   */
  setupMainProcessListeners(): void {
    if (!window.electronAPI?.events) {
      logger.error('[IPCMiddleware] electronAPI.events not available');
      return;
    }

    // Settings changed externally (e.g., from settings file)
    const unsubSettings = window.electronAPI.events.onSettingsChanged(
      (settings) => {
        if (this.store && settings) {
          this.store.dispatch({
            type: 'settings/updateMultipleSettings',
            payload: settings,
          });
        }
      },
    );
    this.eventUnsubscribers.push(unsubSettings);

    // System metrics updates
    const unsubMetrics = window.electronAPI.events.onSystemMetrics(
      (metrics) => {
        if (this.store && metrics) {
          this.store.dispatch({
            type: 'system/updateSystemMetrics',
            payload: {
              cpuUsage: metrics.cpu?.usage || 0,
              memoryUsage: metrics.memory?.usagePercent || 0,
              diskUsage: metrics.disk?.usagePercent || 0,
            },
          });
        }
      },
    );
    this.eventUnsubscribers.push(unsubMetrics);

    // Operation progress
    const unsubProgress = window.electronAPI.events.onOperationProgress(
      (progress) => {
        if (this.store && progress) {
          // Update batch progress in organize slice
          this.store.dispatch({
            type: 'organize/setBatchProgress',
            payload: {
              current: progress.current || 0,
              total: progress.total || 0,
              currentFile: progress.file || '',
            },
          });
        }
      },
    );
    this.eventUnsubscribers.push(unsubProgress);

    // Operation errors
    const unsubError = window.electronAPI.events.onOperationError((error) => {
      if (this.store && error) {
        this.store.dispatch({
          type: 'ui/addNotification',
          payload: {
            message: error.message || 'Operation failed',
            type: 'error',
            duration: 7000,
          },
        });
      }
    });
    this.eventUnsubscribers.push(unsubError);

    // Operation complete
    const unsubComplete = window.electronAPI.events.onOperationComplete(
      (result) => {
        if (this.store && result) {
          this.store.dispatch({
            type: 'ui/addNotification',
            payload: {
              message: result.message || 'Operation completed successfully',
              type: 'success',
              duration: 5000,
            },
          });
        }
      },
    );
    this.eventUnsubscribers.push(unsubComplete);

    // App errors
    const unsubAppError = window.electronAPI.events.onAppError((error) => {
      if (this.store && error) {
        this.store.dispatch({
          type: 'system/addSystemError',
          payload: {
            type: 'app_error',
            message: error.message || 'Application error occurred',
            details: error.details,
          },
        });

        // Also show notification
        this.store.dispatch({
          type: 'ui/addNotification',
          payload: {
            message: error.message || 'An error occurred',
            type: 'error',
            duration: 7000,
          },
        });
      }
    });
    this.eventUnsubscribers.push(unsubAppError);
  }

  /**
   * Sync state changes to main process
   */
  async syncToMain(actionType: string, state: { settings?: Record<string, unknown> }): Promise<void> {
    const syncTarget = IPC_SYNC_ACTIONS[actionType as keyof typeof IPC_SYNC_ACTIONS];
    if (!syncTarget) return;

    try {
      switch (syncTarget) {
        case 'settings':
          // Save settings to main process
          if (window.electronAPI?.settings?.save) {
            const settingsState = state.settings || {};
            // Extract only the settings data (exclude loading states)
            const settingsData = {
              autoOrganize: settingsState.autoOrganize,
              defaultLocation: settingsState.defaultLocation,
              preserveNames: settingsState.preserveNames,
              confidenceThreshold: settingsState.confidenceThreshold,
              ollamaHost: settingsState.ollamaHost,
              textModel: settingsState.textModel,
              visionModel: settingsState.visionModel,
              embeddingModel: settingsState.embeddingModel,
              theme: settingsState.theme,
              compactMode: settingsState.compactMode,
              showNotifications: settingsState.showNotifications,
            };
            await window.electronAPI.settings.save(settingsData);
          }
          break;

        case 'system':
          // System state is usually updated BY main, not TO main
          // But we could add metrics reporting here if needed
          break;

        case 'organize':
          // Organization progress is usually sent BY main
          // Could add batch organization requests here
          break;

        default:
          break;
      }
    } catch (error: unknown) {
      logger.error(`[IPCMiddleware] Failed to sync ${syncTarget}`, { error });
    }
  }

  /**
   * Cleanup listeners
   */
  cleanup(): void {
    for (const unsubscribe of this.eventUnsubscribers) {
      if (typeof unsubscribe === 'function') {
        unsubscribe();
      }
    }
    this.eventUnsubscribers = [];
    this.isInitialized = false;
    this.store = null;
  }
}

// Create singleton instance
const ipcManager = new IPCManager();

interface Action {
  type: string;
  payload?: unknown;
}

type MiddlewareAPI = {
  dispatch: (action: Action) => void;
  getState: () => { settings?: Record<string, unknown> };
};

/**
 * Redux middleware that syncs state with main process
 */
export const ipcMiddleware = (store: MiddlewareAPI) => {
  // Initialize on first use
  if (!ipcManager.isInitialized) {
    ipcManager.initialize(store);
  }

  return (next: (action: Action) => unknown) => (action: Action): unknown => {
    // Execute action
    const result = next(action);

    // Sync to main if needed
    if (action.type && IPC_SYNC_ACTIONS[action.type as keyof typeof IPC_SYNC_ACTIONS]) {
      const state = store.getState();
      ipcManager.syncToMain(action.type, state);
    }

    return result;
  };
};

/**
 * Initialize IPC listeners manually if needed
 */
export const initializeIPC = (store: Store): void => {
  ipcManager.initialize(store);
};

/**
 * Cleanup IPC listeners
 */
export const cleanupIPC = (): void => {
  ipcManager.cleanup();
};

// Cleanup on window unload
if (typeof window !== 'undefined') {
  window.addEventListener('beforeunload', () => {
    ipcManager.cleanup();
  });
}

export default ipcMiddleware;

/**
 * Persistence Middleware - Automatically saves state to localStorage
 * Persists specific slices to localStorage with debouncing for performance
 */
import { logger } from '../../../shared/logger';

type SliceName = 'settings' | 'ui' | 'files';

interface SliceConfig {
  excludeKeys?: string[];
  includeKeys?: string[];
}

// Configuration for which slices and keys to persist
const PERSISTENCE_CONFIG: Record<SliceName, SliceConfig> = {
  settings: {
    // Persist all settings except loading states
    excludeKeys: ['isLoading', 'isSaving', 'error'],
  },
  ui: {
    // Persist UI preferences
    includeKeys: [
      'currentPhase',
      'sidebarCollapsed',
      'theme',
      'compactMode',
      'showNotifications',
    ],
  },
  files: {
    // Persist filter preferences
    includeKeys: ['filters'],
  },
};

const STORAGE_KEY_PREFIX = 'stratosort_';
const DEBOUNCE_DELAY = 500; // ms

class PersistenceManager {
  private debounceTimers: Map<string, ReturnType<typeof setTimeout>>;
  private lastSavedState: Map<string, string>;

  constructor() {
    this.debounceTimers = new Map();
    this.lastSavedState = new Map();
  }

  /**
   * Load persisted state from localStorage
   */
  loadPersistedState(): Record<string, unknown> {
    const persistedState: Record<string, unknown> = {};

    try {
      for (const sliceName of Object.keys(PERSISTENCE_CONFIG) as SliceName[]) {
        const storageKey = `${STORAGE_KEY_PREFIX}${sliceName}`;
        const savedData = localStorage.getItem(storageKey);

        if (savedData) {
          try {
            persistedState[sliceName] = JSON.parse(savedData);
          } catch (parseError: unknown) {
            logger.error(
              `[PersistenceMiddleware] Failed to parse ${sliceName}`,
              { error: parseError },
            );
            // Clear corrupted data
            localStorage.removeItem(storageKey);
          }
        }
      }

      return persistedState;
    } catch (error: unknown) {
      logger.error('[PersistenceMiddleware] Failed to load state', { error });
      return {};
    }
  }

  /**
   * Extract persistable data from a slice based on config
   */
  extractPersistableData(
    sliceName: SliceName,
    sliceState: Record<string, unknown>,
  ): Record<string, unknown> | null {
    const config = PERSISTENCE_CONFIG[sliceName];
    if (!config) return null;

    const data: Record<string, unknown> = {};

    if (config.includeKeys) {
      // Only include specified keys
      for (const key of config.includeKeys) {
        if (key in sliceState) {
          data[key] = sliceState[key];
        }
      }
    } else {
      // Include all keys except excluded ones
      for (const [key, value] of Object.entries(sliceState)) {
        if (!config.excludeKeys || !config.excludeKeys.includes(key)) {
          data[key] = value;
        }
      }
    }

    return data;
  }

  /**
   * Save slice state to localStorage with debouncing
   */
  saveSlice(sliceName: SliceName, sliceState: Record<string, unknown>): void {
    // Clear existing timer
    if (this.debounceTimers.has(sliceName)) {
      clearTimeout(this.debounceTimers.get(sliceName));
    }

    // Set new debounced timer
    const timer = setTimeout(() => {
      try {
        const persistableData = this.extractPersistableData(
          sliceName,
          sliceState,
        );

        if (!persistableData) return;

        // Check if data actually changed
        const dataStr = JSON.stringify(persistableData);
        if (this.lastSavedState.get(sliceName) === dataStr) {
          return; // No changes, skip save
        }

        const storageKey = `${STORAGE_KEY_PREFIX}${sliceName}`;
        localStorage.setItem(storageKey, dataStr);
        this.lastSavedState.set(sliceName, dataStr);
      } catch (error: unknown) {
        // Handle quota exceeded errors gracefully
        if (error instanceof Error && error.name === 'QuotaExceededError') {
          logger.error(
            `[PersistenceMiddleware] localStorage quota exceeded for ${sliceName}`,
          );
        } else {
          logger.error(`[PersistenceMiddleware] Failed to save ${sliceName}`, {
            error,
          });
        }
      } finally {
        this.debounceTimers.delete(sliceName);
      }
    }, DEBOUNCE_DELAY);
    this.debounceTimers.set(sliceName, timer);
  }

  /**
   * Clear all persisted state
   */
  clearPersistedState() {
    try {
      for (const sliceName of Object.keys(PERSISTENCE_CONFIG)) {
        const storageKey = `${STORAGE_KEY_PREFIX}${sliceName}`;
        localStorage.removeItem(storageKey);
      }
      this.lastSavedState.clear();
    } catch (error) {
      logger.error('[PersistenceMiddleware] Failed to clear state', { error });
    }
  }

  /**
   * Cleanup timers
   */
  cleanup() {
    for (const timer of this.debounceTimers.values()) {
      clearTimeout(timer);
    }
    this.debounceTimers.clear();
  }
}

// Create singleton instance
const persistenceManager = new PersistenceManager();

import { Middleware, Dispatch, AnyAction } from '@reduxjs/toolkit';

/**
 * Redux middleware that persists state changes to localStorage
 */
export const persistenceMiddleware: Middleware =
  (store) => (next: Dispatch<AnyAction>) => (action: AnyAction) => {
    // Execute action first
    const result = next(action);

    // Get updated state
    const state = store.getState() as Record<string, Record<string, unknown>>;

    // Save each configured slice
    for (const sliceName of Object.keys(PERSISTENCE_CONFIG) as SliceName[]) {
      if (state[sliceName]) {
        persistenceManager.saveSlice(sliceName, state[sliceName]);
      }
    }

    return result;
  };

/**
 * Load persisted state (call this when creating the store)
 */
export const loadPersistedState = () => {
  return persistenceManager.loadPersistedState();
};

/**
 * Clear all persisted state (useful for logout/reset)
 */
export const clearPersistedState = () => {
  persistenceManager.clearPersistedState();
};

/**
 * Cleanup function to call on app shutdown
 */
export const cleanupPersistence = () => {
  persistenceManager.cleanup();
};

// Cleanup on window unload
if (typeof window !== 'undefined') {
  window.addEventListener('beforeunload', () => {
    persistenceManager.cleanup();
  });
}

export default persistenceMiddleware;

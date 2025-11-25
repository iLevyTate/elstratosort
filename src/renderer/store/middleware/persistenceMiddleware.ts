/**
 * Persistence Middleware - Automatically saves state to localStorage
 * Persists specific slices to localStorage with debouncing for performance
 */
import { logger } from '../../../shared/logger';

// Configuration for which slices and keys to persist
const PERSISTENCE_CONFIG = {
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
  constructor() {    this.debounceTimers = new Map();    this.lastSavedState = new Map();
  }

  /**
   * Load persisted state from localStorage
   */
  loadPersistedState() {
    const persistedState = {};

    try {
      for (const sliceName of Object.keys(PERSISTENCE_CONFIG)) {
        const storageKey = `${STORAGE_KEY_PREFIX}${sliceName}`;
        const savedData = localStorage.getItem(storageKey);

        if (savedData) {
          try {
            persistedState[sliceName] = JSON.parse(savedData);
          } catch (parseError) {
            logger.error(`[PersistenceMiddleware] Failed to parse ${sliceName}`, { error: parseError });
            // Clear corrupted data
            localStorage.removeItem(storageKey);
          }
        }
      }

      return persistedState;
    } catch (error) {
      logger.error('[PersistenceMiddleware] Failed to load state', { error });
      return {};
    }
  }

  /**
   * Extract persistable data from a slice based on config
   */
  extractPersistableData(sliceName, sliceState) {
    const config = PERSISTENCE_CONFIG[sliceName];
    if (!config) return null;

    const data = {};

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
  saveSlice(sliceName, sliceState) {
    // Clear existing timer    if (this.debounceTimers.has(sliceName)) {      clearTimeout(this.debounceTimers.get(sliceName));
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
        const dataStr = JSON.stringify(persistableData);        if (this.lastSavedState.get(sliceName) === dataStr) {
          return; // No changes, skip save
        }

        const storageKey = `${STORAGE_KEY_PREFIX}${sliceName}`;
        localStorage.setItem(storageKey, dataStr);        this.lastSavedState.set(sliceName, dataStr);
      } catch (error) {
        // Handle quota exceeded errors gracefully
        if (error.name === 'QuotaExceededError') {
          logger.error(`[PersistenceMiddleware] localStorage quota exceeded for ${sliceName}`);
        } else {
          logger.error(`[PersistenceMiddleware] Failed to save ${sliceName}`, { error });
        }
      } finally {        this.debounceTimers.delete(sliceName);
      }
    }, DEBOUNCE_DELAY);    this.debounceTimers.set(sliceName, timer);
  }

  /**
   * Clear all persisted state
   */
  clearPersistedState() {
    try {
      for (const sliceName of Object.keys(PERSISTENCE_CONFIG)) {
        const storageKey = `${STORAGE_KEY_PREFIX}${sliceName}`;
        localStorage.removeItem(storageKey);
      }      this.lastSavedState.clear();
    } catch (error) {
      logger.error('[PersistenceMiddleware] Failed to clear state', { error });
    }
  }

  /**
   * Cleanup timers
   */
  cleanup() {    for (const timer of this.debounceTimers.values()) {
      clearTimeout(timer);
    }    this.debounceTimers.clear();
  }
}

// Create singleton instance
const persistenceManager = new PersistenceManager();

/**
 * Redux middleware that persists state changes to localStorage
 */
export const persistenceMiddleware = (store) => (next) => (action) => {
  // Execute action first
  const result = next(action);

  // Get updated state
  const state = store.getState();

  // Save each configured slice
  for (const sliceName of Object.keys(PERSISTENCE_CONFIG)) {
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

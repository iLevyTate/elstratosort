/**
 * Redux Persist Configuration
 * Replaces custom persistenceMiddleware with battle-tested redux-persist
 */
import storage from 'redux-persist/lib/storage';
import { createTransform, type PersistConfig } from 'redux-persist';
import type { RootState } from './index';

/**
 * Transform to filter out transient UI state that shouldn't be persisted
 */
const uiTransform = createTransform(
  // Transform state on the way to being serialized and persisted
  (inboundState: Record<string, unknown>) => {
    // Only persist these specific UI keys
    const persistKeys = [
      'currentPhase',
      'sidebarCollapsed',
      'theme',
      'compactMode',
      'showNotifications',
    ];
    const filtered: Record<string, unknown> = {};
    for (const key of persistKeys) {
      if (key in inboundState) {
        filtered[key] = inboundState[key];
      }
    }
    return filtered;
  },
  // Transform state being rehydrated
  (outboundState) => outboundState,
  // Only apply to 'ui' slice
  { whitelist: ['ui'] },
);

/**
 * Transform to filter out transient settings state
 */
const settingsTransform = createTransform(
  (inboundState: Record<string, unknown>) => {
    // Exclude loading states
    const { isLoading, isSaving, error, ...rest } = inboundState;
    return rest;
  },
  (outboundState) => outboundState,
  { whitelist: ['settings'] },
);

/**
 * Transform to only persist file filters
 */
const filesTransform = createTransform(
  (inboundState: Record<string, unknown>) => {
    // Only persist filters
    return { filters: inboundState.filters };
  },
  (outboundState) => outboundState,
  { whitelist: ['files'] },
);

/**
 * Main persist configuration
 */
export const persistConfig: PersistConfig<RootState> = {
  key: 'stratosort',
  version: 1,
  storage,
  // Only persist these slices
  whitelist: ['settings', 'ui', 'files'],
  // Apply transforms
  transforms: [uiTransform, settingsTransform, filesTransform],
  // Throttle writes to every 500ms
  throttle: 500,
  // Migration function for future schema changes
  migrate: (state) => {
    // Add migration logic here when schema changes
    // Return a Promise for async migrations
    return Promise.resolve(state as RootState);
  },
};

/**
 * Debug configuration (development only)
 */
export const debugConfig = {
  serialize: process.env.NODE_ENV !== 'production',
  actionFilter: (action: { type: string }) => {
    // Don't log persistence actions in production
    return !action.type.startsWith('persist/');
  },
};

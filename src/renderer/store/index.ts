/**
 * Redux Store Configuration
 * Centralized state management for the application
 */
import { combineReducers, configureStore, type Action, type AnyAction } from '@reduxjs/toolkit';
import { createLogger } from 'redux-logger';
import {
  persistStore,
  persistReducer,
  FLUSH,
  REHYDRATE,
  PAUSE,
  PERSIST,
  PURGE,
  REGISTER,
} from 'redux-persist';
import { logger } from '../../shared/logger';

// Import slices
import filesReducer from './slices/filesSlice';
import analysisReducer from './slices/analysisSlice';
import organizeReducer from './slices/organizeSlice';
import settingsReducer from './slices/settingsSlice';
import systemReducer from './slices/systemSlice';
import uiReducer from './slices/uiSlice';

// Import middleware
import { ipcMiddleware } from './middleware/ipcMiddleware';

// Import persist config
import { persistConfig } from './persistConfig';

logger.setContext('ReduxStore');

// Combine all reducers
const rootReducer = combineReducers({
  files: filesReducer,
  analysis: analysisReducer,
  organize: organizeReducer,
  settings: settingsReducer,
  system: systemReducer,
  ui: uiReducer,
});

// Infer RootState from the root reducer
export type RootState = ReturnType<typeof rootReducer>;

// Create persisted reducer
const persistedReducer = persistReducer(persistConfig, rootReducer);

// Redux logger for development - shows every action with state diffs
const reduxLogger = createLogger({
  collapsed: true,
  diff: true,
  timestamp: true,
  duration: true,
  // Skip noisy UI actions and persist actions
  predicate: (_getState, action) =>
    !['ui/showTooltip', 'ui/hideTooltip', 'persist/PERSIST', 'persist/REHYDRATE'].includes(action.type),
  // Show correlation ID if present
  titleFormatter: (action: AnyAction, time?: string, took?: number) => {
    const cid = action.meta?.correlationId
      ? ` [${action.meta.correlationId}]`
      : '';
    return `${action.type}${cid} @ ${time} (${took?.toFixed(2)}ms)`;
  },
});

/**
 * Create and configure the Redux store
 */
export const store = configureStore({
  reducer: persistedReducer,
  middleware: (getDefaultMiddleware) => {
    const middleware = getDefaultMiddleware({
      serializableCheck: {
        // Ignore redux-persist actions
        ignoredActions: [
          FLUSH,
          REHYDRATE,
          PAUSE,
          PERSIST,
          PURGE,
          REGISTER,
          'files/setFilePreview',
          'analysis/setAnalysisProgress',
        ],
        ignoredPaths: ['files.fileObjects', 'analysis.progressCallbacks'],
      },
    }).concat(ipcMiddleware);

    // Add redux-logger only in development
    if (process.env.NODE_ENV === 'development') {
      return middleware.concat(reduxLogger);
    }
    return middleware;
  },
  // Enhanced DevTools configuration
  devTools:
    process.env.NODE_ENV !== 'production' && {
      name: 'StratoSort',
      trace: true, // Enable action stack traces
      traceLimit: 25,
      // Sanitize large file arrays for performance
      actionSanitizer: (action: Action) => {
        const anyAction = action as AnyAction;
        if (
          anyAction.type === 'files/addFiles' &&
          Array.isArray(anyAction.payload)
        ) {
          return {
            ...anyAction,
            payload: `[${anyAction.payload.length} files]`,
          };
        }
        return action;
      },
      stateSanitizer: (state: RootState) => ({
        ...state,
        files: {
          ...state.files,
          allFiles: `[${state.files.allFiles?.length || 0} files]` as unknown,
        },
      }),
    },
});

// Create persistor for redux-persist
export const persistor = persistStore(store);

// TypeScript types for the store
export type AppDispatch = typeof store.dispatch;

// Enable hot module replacement for reducers in development
declare const module: NodeModule & { hot?: { accept: (path: string, callback: () => void) => void } };
if (process.env.NODE_ENV === 'development' && module.hot) {
  module.hot.accept('./slices/filesSlice', () => {
    store.replaceReducer(persistedReducer);
  });
}

export default store;

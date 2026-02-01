/**
 * Tests for System Slice
 * Covers notifications and async config/document path loading
 */

import { configureStore } from '@reduxjs/toolkit';

jest.mock('../src/renderer/services/ipc', () => ({
  filesIpc: {
    getDocumentsPath: jest.fn()
  },
  systemIpc: {
    getConfigValue: jest.fn()
  }
}));

import systemReducer, {
  addNotification,
  removeNotification,
  markNotificationSeen,
  markNotificationDismissed,
  markAllNotificationsSeen,
  setDocumentsPath,
  fetchDocumentsPath,
  fetchRedactPaths
} from '../src/renderer/store/slices/systemSlice';

const { filesIpc, systemIpc } = require('../src/renderer/services/ipc');

describe('systemSlice', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('initial state', () => {
    test('returns initial state', () => {
      const result = systemReducer(undefined, { type: 'unknown' });

      expect(result.metrics).toEqual({ cpu: 0, memory: 0, uptime: 0 });
      expect(result.notifications).toEqual([]);
      expect(result.unreadNotificationCount).toBe(0);
      expect(result.documentsPath).toBeNull();
    });
  });

  describe('notifications', () => {
    test('adds notification and increments unread count', () => {
      const result = systemReducer(
        undefined,
        addNotification({ message: 'Test', severity: 'info' })
      );

      expect(result.notifications).toHaveLength(1);
      expect(result.notifications[0].status).toBe('displayed');
      expect(result.unreadNotificationCount).toBe(1);
    });

    test('markNotificationSeen decrements unread count', () => {
      const state = systemReducer(
        undefined,
        addNotification({ id: 'n1', message: 'Test', severity: 'info' })
      );

      const result = systemReducer(state, markNotificationSeen('n1'));

      expect(result.notifications[0].status).toBe('seen');
      expect(result.unreadNotificationCount).toBe(0);
    });

    test('markNotificationDismissed decrements unread count', () => {
      const state = systemReducer(
        undefined,
        addNotification({ id: 'n1', message: 'Test', severity: 'info' })
      );

      const result = systemReducer(state, markNotificationDismissed('n1'));

      expect(result.notifications[0].status).toBe('dismissed');
      expect(result.unreadNotificationCount).toBe(0);
    });

    test('markAllNotificationsSeen clears unread count', () => {
      let state = systemReducer(
        undefined,
        addNotification({ id: 'n1', message: 'First', severity: 'info' })
      );
      state = systemReducer(state, addNotification({ id: 'n2', message: 'Second' }));

      const result = systemReducer(state, markAllNotificationsSeen());

      expect(result.notifications.every((n) => n.status === 'seen')).toBe(true);
      expect(result.unreadNotificationCount).toBe(0);
    });

    test('removeNotification decrements unread count when unseen', () => {
      const state = systemReducer(
        undefined,
        addNotification({ id: 'n1', message: 'Test', severity: 'info' })
      );

      const result = systemReducer(state, removeNotification('n1'));

      expect(result.notifications).toHaveLength(0);
      expect(result.unreadNotificationCount).toBe(0);
    });
  });

  describe('setDocumentsPath', () => {
    test('normalizes documents path from object payload', () => {
      const result = systemReducer(undefined, setDocumentsPath({ path: '/docs' }));
      expect(result.documentsPath).toBe('/docs');
    });
  });

  describe('fetchDocumentsPath', () => {
    test('returns cached documents path if already loaded', async () => {
      filesIpc.getDocumentsPath.mockResolvedValue('/should-not-call');

      const store = configureStore({
        reducer: { system: systemReducer },
        preloadedState: {
          system: { ...systemReducer(undefined, { type: 'init' }), documentsPath: '/cached' }
        }
      });

      const action = await store.dispatch(fetchDocumentsPath());

      expect(action.payload).toBe('/cached');
      expect(filesIpc.getDocumentsPath).not.toHaveBeenCalled();
    });

    test('stores normalized documents path on success', async () => {
      filesIpc.getDocumentsPath.mockResolvedValue({ path: '/mock/documents' });

      const store = configureStore({ reducer: { system: systemReducer } });
      await store.dispatch(fetchDocumentsPath());

      const state = store.getState().system;
      expect(state.documentsPath).toBe('/mock/documents');
      expect(state.documentsPathLoading).toBe(false);
      expect(state.documentsPathError).toBeNull();
    });

    test('stores error and fallback path on failure', async () => {
      filesIpc.getDocumentsPath.mockRejectedValue(new Error('boom'));

      const store = configureStore({ reducer: { system: systemReducer } });
      await store.dispatch(fetchDocumentsPath());

      const state = store.getState().system;
      expect(state.documentsPath).toBe('Documents');
      expect(state.documentsPathError).toBe('boom');
    });
  });

  describe('fetchRedactPaths', () => {
    test('returns cached redactPaths if already loaded', async () => {
      systemIpc.getConfigValue.mockResolvedValue(true);

      const store = configureStore({
        reducer: { system: systemReducer },
        preloadedState: {
          system: { ...systemReducer(undefined, { type: 'init' }), redactPaths: true }
        }
      });

      const action = await store.dispatch(fetchRedactPaths());

      expect(action.payload).toBe(true);
      expect(systemIpc.getConfigValue).not.toHaveBeenCalled();
    });

    test('stores redactPaths flag on success', async () => {
      systemIpc.getConfigValue.mockResolvedValue('true');

      const store = configureStore({ reducer: { system: systemReducer } });
      await store.dispatch(fetchRedactPaths());

      const state = store.getState().system;
      expect(state.redactPaths).toBe(true);
      expect(state.redactPathsLoading).toBe(false);
      expect(state.redactPathsError).toBeNull();
    });

    test('stores error on failure', async () => {
      systemIpc.getConfigValue.mockRejectedValue(new Error('nope'));

      const store = configureStore({ reducer: { system: systemReducer } });
      await store.dispatch(fetchRedactPaths());

      const state = store.getState().system;
      expect(state.redactPaths).toBe(false);
      expect(state.redactPathsError).toBe('nope');
    });
  });
});

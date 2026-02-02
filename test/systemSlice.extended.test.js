/**
 * Extended tests for systemSlice
 * Covers: updateMetrics, updateHealth, notification cap at 50,
 * clearNotifications, timestamp fields, edge cases
 */

import { configureStore } from '@reduxjs/toolkit';

jest.mock('../src/renderer/utils/serialization', () => ({
  serializeData: jest.fn((data) => data)
}));

jest.mock('../src/renderer/services/ipc', () => ({
  filesIpc: {
    getDocumentsPath: jest.fn()
  },
  systemIpc: {
    getConfigValue: jest.fn()
  }
}));

import systemReducer, {
  updateMetrics,
  updateHealth,
  addNotification,
  removeNotification,
  clearNotifications,
  markNotificationSeen,
  markNotificationDismissed,
  markAllNotificationsSeen,
  setDocumentsPath,
  fetchDocumentsPath,
  fetchRedactPaths,
  NotificationStatus
} from '../src/renderer/store/slices/systemSlice';

describe('systemSlice - extended coverage', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('NotificationStatus constants', () => {
    test('exports expected status values', () => {
      expect(NotificationStatus.PENDING).toBe('pending');
      expect(NotificationStatus.DISPLAYED).toBe('displayed');
      expect(NotificationStatus.SEEN).toBe('seen');
      expect(NotificationStatus.DISMISSED).toBe('dismissed');
    });
  });

  describe('updateMetrics', () => {
    test('merges new metrics with existing', () => {
      const state = systemReducer(undefined, { type: 'init' });
      const result = systemReducer(state, updateMetrics({ cpu: 45, memory: 60 }));

      expect(result.metrics).toEqual({ cpu: 45, memory: 60, uptime: 0 });
    });

    test('partial update only changes specified fields', () => {
      const state = systemReducer(undefined, updateMetrics({ cpu: 10, memory: 20, uptime: 100 }));
      const result = systemReducer(state, updateMetrics({ cpu: 50 }));

      expect(result.metrics).toEqual({ cpu: 50, memory: 20, uptime: 100 });
    });
  });

  describe('updateHealth', () => {
    test('updates health status', () => {
      const result = systemReducer(
        undefined,
        updateHealth({ chromadb: 'online', ollama: 'online' })
      );

      expect(result.health).toEqual({ chromadb: 'online', ollama: 'online' });
    });

    test('partial health update merges with existing', () => {
      const state = systemReducer(undefined, updateHealth({ chromadb: 'online' }));
      const result = systemReducer(state, updateHealth({ ollama: 'connecting' }));

      expect(result.health).toEqual({ chromadb: 'online', ollama: 'connecting' });
    });

    test('does not mutate state when values are unchanged', () => {
      const state = systemReducer(undefined, updateHealth({ chromadb: 'online' }));
      const result = systemReducer(state, updateHealth({ chromadb: 'online' }));

      // Health object should be the same reference (no change detected)
      expect(result.health).toBe(state.health);
    });
  });

  describe('clearNotifications', () => {
    test('removes all notifications and resets unread count', () => {
      let state = systemReducer(undefined, addNotification({ id: 'n1', message: 'First' }));
      state = systemReducer(state, addNotification({ id: 'n2', message: 'Second' }));
      state = systemReducer(state, addNotification({ id: 'n3', message: 'Third' }));

      const result = systemReducer(state, clearNotifications());

      expect(result.notifications).toEqual([]);
      expect(result.unreadNotificationCount).toBe(0);
    });
  });

  describe('notification cap at 50', () => {
    test('shifts oldest notification when reaching 50 limit', () => {
      let state = systemReducer(undefined, { type: 'init' });

      // Add 50 notifications
      for (let i = 0; i < 50; i++) {
        state = systemReducer(
          state,
          addNotification({ id: `n${i}`, message: `Notification ${i}` })
        );
      }

      expect(state.notifications).toHaveLength(50);

      // Add one more - should remove the first
      state = systemReducer(
        state,
        addNotification({ id: 'n50', message: 'Overflow notification' })
      );

      expect(state.notifications).toHaveLength(50);
      // First notification should be gone
      expect(state.notifications.find((n) => n.id === 'n0')).toBeUndefined();
      // Last notification should be present
      expect(state.notifications[state.notifications.length - 1].id).toBe('n50');
    });
  });

  describe('notification timestamp fields', () => {
    test('addNotification sets displayedAt and status to displayed', () => {
      const result = systemReducer(undefined, addNotification({ id: 'ts1', message: 'Test' }));

      const notification = result.notifications[0];
      expect(notification.status).toBe('displayed');
      expect(notification.displayedAt).toBeTruthy();
      expect(notification.seenAt).toBeNull();
      expect(notification.dismissedAt).toBeNull();
    });

    test('markNotificationSeen sets seenAt timestamp', () => {
      const state = systemReducer(undefined, addNotification({ id: 'ts2', message: 'Test' }));

      const result = systemReducer(state, markNotificationSeen('ts2'));

      expect(result.notifications[0].seenAt).toBeTruthy();
      expect(result.notifications[0].status).toBe('seen');
    });

    test('markNotificationDismissed sets dismissedAt timestamp', () => {
      const state = systemReducer(undefined, addNotification({ id: 'ts3', message: 'Test' }));

      const result = systemReducer(state, markNotificationDismissed('ts3'));

      expect(result.notifications[0].dismissedAt).toBeTruthy();
      expect(result.notifications[0].status).toBe('dismissed');
    });

    test('preserves incoming timestamp when provided', () => {
      const result = systemReducer(
        undefined,
        addNotification({ id: 'ts4', message: 'Test', timestamp: '2026-01-01T00:00:00Z' })
      );

      expect(result.notifications[0].timestamp).toBe('2026-01-01T00:00:00Z');
    });

    test('generates timestamp when not provided', () => {
      const result = systemReducer(undefined, addNotification({ id: 'ts5', message: 'Test' }));

      expect(result.notifications[0].timestamp).toBeTruthy();
      // Should be a valid ISO string
      expect(() => new Date(result.notifications[0].timestamp)).not.toThrow();
    });
  });

  describe('notification ID generation', () => {
    test('generates ID when not provided', () => {
      const result = systemReducer(undefined, addNotification({ message: 'No ID' }));

      expect(result.notifications[0].id).toBeTruthy();
      expect(typeof result.notifications[0].id).toBe('string');
    });

    test('preserves incoming ID when provided', () => {
      const result = systemReducer(
        undefined,
        addNotification({ id: 'custom-id', message: 'With ID' })
      );

      expect(result.notifications[0].id).toBe('custom-id');
    });
  });

  describe('removeNotification edge cases', () => {
    test('does not decrement unread when removing already-seen notification', () => {
      let state = systemReducer(undefined, addNotification({ id: 'r1', message: 'First' }));
      state = systemReducer(state, addNotification({ id: 'r2', message: 'Second' }));

      // Mark r1 as seen
      state = systemReducer(state, markNotificationSeen('r1'));
      expect(state.unreadNotificationCount).toBe(1); // Only r2 is unread

      // Remove the seen notification
      state = systemReducer(state, removeNotification('r1'));

      expect(state.unreadNotificationCount).toBe(1); // r2 still unread
      expect(state.notifications).toHaveLength(1);
    });

    test('does not decrement unread when removing dismissed notification', () => {
      let state = systemReducer(undefined, addNotification({ id: 'r3', message: 'Test' }));
      state = systemReducer(state, addNotification({ id: 'r4', message: 'Test2' }));

      state = systemReducer(state, markNotificationDismissed('r3'));
      expect(state.unreadNotificationCount).toBe(1);

      state = systemReducer(state, removeNotification('r3'));
      expect(state.unreadNotificationCount).toBe(1);
    });

    test('removing non-existent notification is a no-op', () => {
      const state = systemReducer(undefined, addNotification({ id: 'exists', message: 'Test' }));

      const result = systemReducer(state, removeNotification('does-not-exist'));

      expect(result.notifications).toHaveLength(1);
      expect(result.unreadNotificationCount).toBe(1);
    });

    test('unread count never goes below zero', () => {
      let state = systemReducer(undefined, { type: 'init' });
      state = { ...state, unreadNotificationCount: 0, notifications: [] };

      // Remove from empty state - count should stay at 0
      const result = systemReducer(state, removeNotification('nonexistent'));
      expect(result.unreadNotificationCount).toBe(0);
    });
  });

  describe('markNotificationSeen edge cases', () => {
    test('does not double-decrement when marking already-seen notification', () => {
      let state = systemReducer(undefined, addNotification({ id: 'ms1', message: 'Test' }));

      state = systemReducer(state, markNotificationSeen('ms1'));
      expect(state.unreadNotificationCount).toBe(0);

      // Mark as seen again - should not go below 0
      state = systemReducer(state, markNotificationSeen('ms1'));
      expect(state.unreadNotificationCount).toBe(0);
    });

    test('does not change dismissed notification to seen', () => {
      let state = systemReducer(undefined, addNotification({ id: 'ms2', message: 'Test' }));

      state = systemReducer(state, markNotificationDismissed('ms2'));
      state = systemReducer(state, markNotificationSeen('ms2'));

      // Should remain dismissed
      expect(state.notifications[0].status).toBe('dismissed');
    });
  });

  describe('markAllNotificationsSeen', () => {
    test('skips already dismissed notifications', () => {
      let state = systemReducer(undefined, addNotification({ id: 'ma1', message: 'First' }));
      state = systemReducer(state, addNotification({ id: 'ma2', message: 'Second' }));
      state = systemReducer(state, addNotification({ id: 'ma3', message: 'Third' }));

      // Dismiss one
      state = systemReducer(state, markNotificationDismissed('ma2'));

      state = systemReducer(state, markAllNotificationsSeen());

      expect(state.notifications.find((n) => n.id === 'ma1').status).toBe('seen');
      expect(state.notifications.find((n) => n.id === 'ma2').status).toBe('dismissed');
      expect(state.notifications.find((n) => n.id === 'ma3').status).toBe('seen');
      expect(state.unreadNotificationCount).toBe(0);
    });
  });

  describe('setDocumentsPath - normalization', () => {
    test('normalizes string path', () => {
      const result = systemReducer(undefined, setDocumentsPath('/home/user/docs'));
      expect(result.documentsPath).toBe('/home/user/docs');
    });

    test('normalizes object with path property', () => {
      const result = systemReducer(undefined, setDocumentsPath({ path: '/home/user/docs' }));
      expect(result.documentsPath).toBe('/home/user/docs');
    });

    test('returns default "Documents" for null/undefined', () => {
      const result = systemReducer(undefined, setDocumentsPath(null));
      expect(result.documentsPath).toBe('Documents');
    });

    test('returns default "Documents" for non-string non-object', () => {
      const result = systemReducer(undefined, setDocumentsPath(42));
      expect(result.documentsPath).toBe('Documents');
    });
  });

  describe('addNotification - extra fields preserved', () => {
    test('preserves severity and other custom fields', () => {
      const result = systemReducer(
        undefined,
        addNotification({
          id: 'ef1',
          message: 'Test',
          severity: 'warning',
          source: 'watcher'
        })
      );

      const notification = result.notifications[0];
      expect(notification.message).toBe('Test');
      expect(notification.severity).toBe('warning');
      expect(notification.source).toBe('watcher');
    });
  });

  describe('fetchDocumentsPath thunk', () => {
    test('normalizes string return from IPC', async () => {
      const { filesIpc } = require('../src/renderer/services/ipc');
      filesIpc.getDocumentsPath.mockResolvedValue('/simple/path');

      const store = configureStore({ reducer: { system: systemReducer } });
      await store.dispatch(fetchDocumentsPath());

      expect(store.getState().system.documentsPath).toBe('/simple/path');
    });

    test('sets loading state while pending', () => {
      const result = systemReducer(undefined, { type: 'system/fetchDocumentsPath/pending' });
      expect(result.documentsPathLoading).toBe(true);
      expect(result.documentsPathError).toBeNull();
    });
  });

  describe('fetchRedactPaths thunk', () => {
    test('coerces truthy value to boolean', async () => {
      const { systemIpc } = require('../src/renderer/services/ipc');
      systemIpc.getConfigValue.mockResolvedValue(1);

      const store = configureStore({ reducer: { system: systemReducer } });
      await store.dispatch(fetchRedactPaths());

      expect(store.getState().system.redactPaths).toBe(true);
    });

    test('coerces falsy value to boolean', async () => {
      const { systemIpc } = require('../src/renderer/services/ipc');
      systemIpc.getConfigValue.mockResolvedValue(0);

      const store = configureStore({ reducer: { system: systemReducer } });
      await store.dispatch(fetchRedactPaths());

      expect(store.getState().system.redactPaths).toBe(false);
    });

    test('sets loading state while pending', () => {
      const result = systemReducer(undefined, { type: 'system/fetchRedactPaths/pending' });
      expect(result.redactPathsLoading).toBe(true);
      expect(result.redactPathsError).toBeNull();
    });
  });
});

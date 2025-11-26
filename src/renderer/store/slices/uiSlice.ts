/**
 * UI Slice - Manages UI state (modals, notifications, etc.)
 */
import { createSlice, PayloadAction } from '@reduxjs/toolkit';

type Phase = 'setup' | 'discover' | 'organize' | 'complete';

interface Notification {
  id: number;
  message: string;
  type: 'info' | 'success' | 'warning' | 'error';
  duration?: number;
  timestamp: number;
}

interface PhaseData {
  setup: Record<string, unknown>;
  discover: Record<string, unknown>;
  organize: Record<string, unknown>;
  complete: Record<string, unknown>;
}

interface UIState {
  currentPhase: Phase;
  phaseData: PhaseData;
  phaseHistory: Phase[];
  notifications: Notification[];
  nextNotificationId: number;
  activeModal: string | null;
  modalProps: Record<string, unknown>;
  globalLoading: boolean;
  loadingMessage: string;
  sidebarCollapsed: boolean;
  activeTooltip: string | null;
}

const initialState: UIState = {
  // Current phase
  currentPhase: 'discover', // 'setup', 'discover', 'organize', 'complete'

  // Phase-specific data (generic storage for any phase-specific state)
  phaseData: {
    setup: {},
    discover: {},
    organize: {},
    complete: {},
  },

  // Phase history for navigation
  phaseHistory: [],

  // Notifications
  notifications: [],
  nextNotificationId: 1,

  // Modals
  activeModal: null, // null, 'settings', 'about', 'confirm', etc.
  modalProps: {},

  // Loading states
  globalLoading: false,
  loadingMessage: '',

  // Sidebar
  sidebarCollapsed: false,

  // Tooltips
  activeTooltip: null,
};

const uiSlice = createSlice({
  name: 'ui',
  initialState,
  reducers: {
    // Phase management
    setPhase: (state, action: PayloadAction<Phase>) => {
      // Add to history before changing
      state.phaseHistory.push(state.currentPhase);
      state.currentPhase = action.payload;
    },

    nextPhase: (state) => {
      const phases: Phase[] = ['discover', 'organize', 'complete'];
      const currentIndex = phases.indexOf(state.currentPhase);
      if (currentIndex < phases.length - 1) {
        state.phaseHistory.push(state.currentPhase);
        state.currentPhase = phases[currentIndex + 1];
      }
    },

    previousPhase: (state) => {
      const phases: Phase[] = ['discover', 'organize', 'complete'];
      const currentIndex = phases.indexOf(state.currentPhase);
      if (currentIndex > 0) {
        state.phaseHistory.push(state.currentPhase);
        state.currentPhase = phases[currentIndex - 1];
      }
    },

    advancePhase: (
      state,
      action: PayloadAction<{
        targetPhase: Phase;
        data?: Record<string, unknown>;
      }>,
    ) => {
      const { targetPhase, data = {} } = action.payload || {};

      if (!targetPhase) {
        return; // Invalid payload, do nothing
      }

      // Add to history
      state.phaseHistory.push(state.currentPhase);

      // Change phase
      state.currentPhase = targetPhase;

      // Merge phase data if provided
      if (data && typeof data === 'object') {
        state.phaseData[targetPhase] = {
          ...state.phaseData[targetPhase],
          ...data,
        };
      }
    },

    setPhaseData: (
      state,
      action: PayloadAction<{ phase?: Phase; key: string; value: unknown }>,
    ) => {
      const { phase, key, value } = action.payload;

      // If no phase specified, use current phase
      const targetPhase: Phase = phase || state.currentPhase;

      // Ensure phaseData object exists (safety for rehydration)
      if (!state.phaseData) {
        state.phaseData = {
          setup: {},
          discover: {},
          organize: {},
          complete: {},
        };
      }

      if (!state.phaseData[targetPhase]) {
        state.phaseData[targetPhase] = {};
      }

      state.phaseData[targetPhase][key] = value;
    },

    clearPhaseData: (state, action: PayloadAction<Phase | undefined>) => {
      const phase: Phase = action.payload || state.currentPhase;
      state.phaseData[phase] = {};
    },

    resetWorkflow: (state) => {
      state.currentPhase = 'discover';
      state.phaseData = {
        setup: {},
        discover: {},
        organize: {},
        complete: {},
      };
      state.phaseHistory = [];
      state.globalLoading = false;
      state.activeModal = null;
    },

    // Notifications
    addNotification: (
      state,
      action: PayloadAction<
        | {
            message: string;
            type?: 'info' | 'success' | 'warning' | 'error';
            duration?: number;
          }
        | string
      >,
    ) => {
      // Ensure notifications array exists (safety for rehydration)
      if (!Array.isArray(state.notifications)) {
        state.notifications = [];
      }

      // Ensure nextNotificationId is a number
      if (typeof state.nextNotificationId !== 'number') {
        state.nextNotificationId = 1;
      }

      const payload =
        typeof action.payload === 'string'
          ? { message: action.payload }
          : action.payload;
      const notification: Notification = {
        id: state.nextNotificationId++,
        message: payload.message,
        type: payload.type || 'info', // 'success', 'error', 'warning', 'info'
        duration: payload.duration || 5000,
        timestamp: Date.now(),
      };
      state.notifications.push(notification);
    },

    removeNotification: (state, action: PayloadAction<number>) => {
      const id = action.payload;
      state.notifications = state.notifications.filter((n) => n.id !== id);
    },

    clearNotifications: (state) => {
      state.notifications = [];
    },

    // Modals
    openModal: (state, action) => {
      state.activeModal = action.payload.modal;
      state.modalProps = action.payload.props || {};
    },

    closeModal: (state) => {
      state.activeModal = null;
      state.modalProps = {};
    },

    updateModalProps: (state, action) => {
      state.modalProps = { ...state.modalProps, ...action.payload };
    },

    // Loading
    setGlobalLoading: (state, action) => {
      state.globalLoading = action.payload.loading;
      state.loadingMessage = action.payload.message || '';
    },

    clearGlobalLoading: (state) => {
      state.globalLoading = false;
      state.loadingMessage = '';
    },

    // Sidebar
    toggleSidebar: (state) => {
      state.sidebarCollapsed = !state.sidebarCollapsed;
    },

    setSidebarCollapsed: (state, action) => {
      state.sidebarCollapsed = action.payload;
    },

    // Tooltips
    showTooltip: (state, action) => {
      state.activeTooltip = action.payload;
    },

    hideTooltip: (state) => {
      state.activeTooltip = null;
    },

    // Reset UI state
    resetUI: (state) => {
      return {
        ...initialState,
        currentPhase: state.currentPhase, // Keep current phase
      };
    },
  },
});

export const {
  setPhase,
  nextPhase,
  previousPhase,
  advancePhase,
  setPhaseData,
  clearPhaseData,
  resetWorkflow,
  addNotification,
  removeNotification,
  clearNotifications,
  openModal,
  closeModal,
  updateModalProps,
  setGlobalLoading,
  clearGlobalLoading,
  toggleSidebar,
  setSidebarCollapsed,
  showTooltip,
  hideTooltip,
  resetUI,
} = uiSlice.actions;

// Define root state type for selectors
interface RootState {
  ui: UIState;
}

// Selectors
export const selectCurrentPhase = (state: RootState) => state.ui.currentPhase;
export const selectPhaseHistory = (state: RootState) => state.ui.phaseHistory;
export const selectPhaseData = (state: RootState, phase?: Phase) =>
  state.ui.phaseData[phase || state.ui.currentPhase] || {};
export const selectCurrentPhaseData = (state: RootState) =>
  state.ui.phaseData[state.ui.currentPhase] || {};
export const selectNotifications = (state: RootState) => state.ui.notifications;
export const selectActiveModal = (state: RootState) => state.ui.activeModal;
export const selectModalProps = (state: RootState) => state.ui.modalProps;
export const selectGlobalLoading = (state: RootState) => ({
  loading: state.ui.globalLoading,
  message: state.ui.loadingMessage,
});
export const selectIsLoading = (state: RootState) => state.ui.globalLoading;
export const selectShowSettings = (state: RootState) =>
  state.ui.activeModal === 'settings';
export const selectSidebarCollapsed = (state: RootState) =>
  state.ui.sidebarCollapsed;
export const selectActiveTooltip = (state: RootState) => state.ui.activeTooltip;

export default uiSlice.reducer;

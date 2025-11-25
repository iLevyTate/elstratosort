/**
 * UI Slice - Manages UI state (modals, notifications, etc.)
 */
import { createSlice } from '@reduxjs/toolkit';

const initialState = {
  // Current phase
  currentPhase: 'discover', // 'discover', 'organize', 'complete'

  // Phase-specific data (generic storage for any phase-specific state)
  phaseData: {
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
    setPhase: (state, action) => {
      // Add to history before changing
      state.phaseHistory.push(state.currentPhase);
      state.currentPhase = action.payload;
    },

    nextPhase: (state) => {
      const phases = ['discover', 'organize', 'complete'];
      const currentIndex = phases.indexOf(state.currentPhase);
      if (currentIndex < phases.length - 1) {
        state.phaseHistory.push(state.currentPhase);
        state.currentPhase = phases[currentIndex + 1];
      }
    },

    previousPhase: (state) => {
      const phases = ['discover', 'organize', 'complete'];
      const currentIndex = phases.indexOf(state.currentPhase);
      if (currentIndex > 0) {
        state.phaseHistory.push(state.currentPhase);
        state.currentPhase = phases[currentIndex - 1];
      }
    },

    advancePhase: (state, action) => {
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

    setPhaseData: (state, action) => {
      const { phase, key, value } = action.payload;

      // If no phase specified, use current phase
      const targetPhase = phase || state.currentPhase;

      if (!state.phaseData[targetPhase]) {
        state.phaseData[targetPhase] = {};
      }

      state.phaseData[targetPhase][key] = value;
    },

    clearPhaseData: (state, action) => {
      const phase = action.payload || state.currentPhase;
      state.phaseData[phase] = {};
    },

    resetWorkflow: (state) => {
      state.currentPhase = 'discover';
      state.phaseData = {
        discover: {},
        organize: {},
        complete: {},
      };
      state.phaseHistory = [];
      state.globalLoading = false;
      state.activeModal = null;
    },

    // Notifications
    addNotification: (state, action) => {
      const notification = {
        id: state.nextNotificationId++,
        message: action.payload.message || action.payload,
        type: action.payload.type || 'info', // 'success', 'error', 'warning', 'info'
        duration: action.payload.duration || 5000,
        timestamp: Date.now(),
      };
      state.notifications.push(notification);
    },

    removeNotification: (state, action) => {
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

// Selectors
export const selectCurrentPhase = (state) => state.ui.currentPhase;
export const selectPhaseHistory = (state) => state.ui.phaseHistory;
export const selectPhaseData = (state, phase) =>
  state.ui.phaseData[phase || state.ui.currentPhase] || {};
export const selectCurrentPhaseData = (state) => state.ui.phaseData[state.ui.currentPhase] || {};
export const selectNotifications = (state) => state.ui.notifications;
export const selectActiveModal = (state) => state.ui.activeModal;
export const selectModalProps = (state) => state.ui.modalProps;
export const selectGlobalLoading = (state) => ({
  loading: state.ui.globalLoading,
  message: state.ui.loadingMessage,
});
export const selectIsLoading = (state) => state.ui.globalLoading;
export const selectShowSettings = (state) => state.ui.activeModal === 'settings';
export const selectSidebarCollapsed = (state) => state.ui.sidebarCollapsed;
export const selectActiveTooltip = (state) => state.ui.activeTooltip;

export default uiSlice.reducer;

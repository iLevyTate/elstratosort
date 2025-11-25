/**
 * Settings Slice - Manages application settings
 */
import { createSlice } from '@reduxjs/toolkit';

const initialState = {
  // Application settings
  autoOrganize: false,
  defaultLocation: 'Documents',
  preserveNames: false,
  confidenceThreshold: 0.8,

  // Ollama settings
  ollamaHost: 'http://localhost:11434',
  textModel: 'llama3.2:3b',
  visionModel: 'llava:7b',
  embeddingModel: 'mxbai-embed-large',

  // UI settings
  theme: 'light',
  compactMode: false,
  showNotifications: true,

  // Loading state
  isLoading: false,
  isSaving: false,
  error: null,
};

const settingsSlice = createSlice({
  name: 'settings',
  initialState,
  reducers: {
    updateSetting: (state, action) => {
      const { key, value } = action.payload;
      state[key] = value;
    },

    updateMultipleSettings: (state, action) => {
      Object.assign(state, action.payload);
    },

    // eslint-disable-next-line no-unused-vars
    resetSettings: (_state) => {
      return { ...initialState };
    },

    // Quick setting toggles
    toggleAutoOrganize: (state) => {
      state.autoOrganize = !state.autoOrganize;
    },

    togglePreserveNames: (state) => {
      state.preserveNames = !state.preserveNames;
    },

    toggleCompactMode: (state) => {
      state.compactMode = !state.compactMode;
    },

    toggleNotifications: (state) => {
      state.showNotifications = !state.showNotifications;
    },

    setTheme: (state, action) => {
      state.theme = action.payload;
    },
  },
});

export const {
  updateSetting,
  updateMultipleSettings,
  resetSettings,
  toggleAutoOrganize,
  togglePreserveNames,
  toggleCompactMode,
  toggleNotifications,
  setTheme,
} = settingsSlice.actions;

// Selectors
export const selectSettings = (state) => state.settings;
export const selectAutoOrganize = (state) => state.settings.autoOrganize;
export const selectConfidenceThreshold = (state) =>
  state.settings.confidenceThreshold;
export const selectTheme = (state) => state.settings.theme;
export const selectOllamaSettings = (state) => ({
  host: state.settings.ollamaHost,
  textModel: state.settings.textModel,
  visionModel: state.settings.visionModel,
  embeddingModel: state.settings.embeddingModel,
});

export default settingsSlice.reducer;

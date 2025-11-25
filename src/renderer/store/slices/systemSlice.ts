/**
 * System Slice - Manages system information and health
 */
import { createSlice } from '@reduxjs/toolkit';

const initialState = {
  // System metrics
  cpuUsage: 0,
  memoryUsage: 0,
  diskUsage: 0,

  // Service health
  services: {},
  lastHealthCheck: null,
  isHealthCheckLoading: false,

  // App info  version: process.env.npm_package_version || '1.0.0',  platform: process.platform,

  // Connection status
  ollamaConnected: false,
  chromaDbConnected: false,

  // Errors
  systemErrors: [],
};

const systemSlice = createSlice({
  name: 'system',
  initialState,
  reducers: {
    updateSystemMetrics: (state, action) => {
      const { cpuUsage, memoryUsage, diskUsage } = action.payload;
      if (cpuUsage !== undefined) state.cpuUsage = cpuUsage;
      if (memoryUsage !== undefined) state.memoryUsage = memoryUsage;
      if (diskUsage !== undefined) state.diskUsage = diskUsage;
    },

    setServiceStatus: (state, action) => {
      const { service, status } = action.payload;
      state.services[service] = status;
    },

    setOllamaConnected: (state, action) => {
      state.ollamaConnected = action.payload;
    },

    setChromaDbConnected: (state, action) => {
      state.chromaDbConnected = action.payload;
    },

    addSystemError: (state, action) => {
      state.systemErrors.push({
        ...action.payload,
        timestamp: Date.now(),
      });

      // Keep only last 50 errors
      if (state.systemErrors.length > 50) {
        state.systemErrors = state.systemErrors.slice(-50);
      }
    },

    clearSystemErrors: (state) => {
      state.systemErrors = [];
    },

    removeSystemError: (state, action) => {
      const index = action.payload;
      state.systemErrors.splice(index, 1);
    },
  },
});

export const {
  updateSystemMetrics,
  setServiceStatus,
  setOllamaConnected,
  setChromaDbConnected,
  addSystemError,
  clearSystemErrors,
  removeSystemError,
} = systemSlice.actions;

// Selectors
export const selectSystemMetrics = (state) => ({
  cpuUsage: state.system.cpuUsage,
  memoryUsage: state.system.memoryUsage,
  diskUsage: state.system.diskUsage,
});

export const selectServiceHealth = (state) => state.system.services;
export const selectOllamaConnected = (state) => state.system.ollamaConnected;
export const selectChromaDbConnected = (state) => state.system.chromaDbConnected;
export const selectSystemErrors = (state) => state.system.systemErrors;
export const selectAppVersion = (state) => state.system.version;

export default systemSlice.reducer;

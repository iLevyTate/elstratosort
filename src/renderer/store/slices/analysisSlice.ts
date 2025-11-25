/**
 * Analysis Slice - Manages file analysis state
 */
import { createSlice } from '@reduxjs/toolkit';

const initialState = {
  // Analysis progress
  isAnalyzing: false,
  currentAnalysisFile: '',
  analysisProgress: {
    current: 0,
    total: 0,
    lastActivity: null,
  },
  analysisError: null,

  // Analysis results (array for compatibility with useFileAnalysis)
  analysisResults: [],

  // Statistics
  stats: {
    totalAnalyzed: 0,
    successRate: 0,
    averageDuration: 0,
  },
};

const analysisSlice = createSlice({
  name: 'analysis',
  initialState,
  reducers: {
    setIsAnalyzing: (state, action) => {
      state.isAnalyzing = action.payload;
    },

    setCurrentAnalysisFile: (state, action) => {
      state.currentAnalysisFile = action.payload;
    },

    setAnalysisProgress: (state, action) => {
      state.analysisProgress = { ...state.analysisProgress, ...action.payload };
    },

    setAnalysisResults: (state, action) => {
      state.analysisResults = action.payload;
    },

    resetAnalysisProgress: (state) => {
      state.analysisProgress = initialState.analysisProgress;
    },

    addAnalysisResult: (state, action) => {
      state.analysisResults.push(action.payload);
      state.stats.totalAnalyzed++;
    },

    clearAnalysisResults: (state) => {
      state.analysisResults = [];
      state.stats.totalAnalyzed = 0;
    },

    resetAnalysisState: (state) => {
      state.isAnalyzing = false;
      state.currentAnalysisFile = '';
      state.analysisProgress = initialState.analysisProgress;
    },

    // eslint-disable-next-line no-unused-vars
    resetAnalysis: (_state) => {
      return { ...initialState };
    },
  },
});

export const {
  setIsAnalyzing,
  setCurrentAnalysisFile,
  setAnalysisProgress,
  setAnalysisResults,
  resetAnalysisProgress,
  addAnalysisResult,
  clearAnalysisResults,
  resetAnalysisState,
  resetAnalysis,
} = analysisSlice.actions;

// Selectors
export const selectIsAnalyzing = (state) => state.analysis.isAnalyzing;
export const selectCurrentAnalysisFile = (state) => state.analysis.currentAnalysisFile;
export const selectAnalysisProgress = (state) => state.analysis.analysisProgress;
export const selectAnalysisResults = (state) => state.analysis.analysisResults;
export const selectAnalysisStats = (state) => state.analysis.stats;
export const selectAnalysisError = (state) => state.analysis.analysisError;

export default analysisSlice.reducer;

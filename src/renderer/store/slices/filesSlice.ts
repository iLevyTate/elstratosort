/**
 * Files Slice - Manages file discovery and selection state
 */
import { createSlice, PayloadAction } from '@reduxjs/toolkit';

interface FileInfo {
  path: string;
  name: string;
  extension: string;
  size: number;
  modified?: string;
  analysis?: Record<string, unknown>;
  error?: string | null;
  processingState?: string;
}

interface FiltersState {
  fileType: 'all' | 'documents' | 'images' | 'other';
  searchQuery: string;
  showProcessed: boolean;
}

interface StatsState {
  total: number;
  analyzed: number;
  organized: number;
  errors: number;
}

interface FilesState {
  allFiles: FileInfo[];
  selectedFiles: string[];
  processedFiles: string[];
  discoveryPath: string | null;
  isDiscovering: boolean;
  isScanning: boolean;
  discoveryError: string | null;
  filters: FiltersState;
  fileStates: Record<string, string>;
  analyzingFiles: string[];
  analysisErrors: Record<string, string>;
  stats: StatsState;
}

const initialState: FilesState = {
  // Discovered files
  allFiles: [],
  selectedFiles: [],
  processedFiles: [],

  // File discovery
  discoveryPath: null,
  isDiscovering: false,
  isScanning: false,
  discoveryError: null,

  // File filtering
  filters: {
    fileType: 'all', // 'all', 'documents', 'images', 'other'
    searchQuery: '',
    showProcessed: false,
  },

  // File states (for tracking analysis/processing status)
  fileStates: {},

  // File analysis
  analyzingFiles: [], // Array of file paths currently being analyzed
  analysisErrors: {},  // Map of filePath -> error

  // Statistics
  stats: {
    total: 0,
    analyzed: 0,
    organized: 0,
    errors: 0,
  },
};

const filesSlice = createSlice({
  name: 'files',
  initialState,
  reducers: {
    // File selection
    selectFile: (state, action: PayloadAction<string>) => {
      const filePath = action.payload;
      if (!state.selectedFiles.includes(filePath)) {
        state.selectedFiles.push(filePath);
      }
    },

    deselectFile: (state, action: PayloadAction<string>) => {
      const filePath = action.payload;
      state.selectedFiles = state.selectedFiles.filter((f) => f !== filePath);
    },

    selectAll: (state) => {
      state.selectedFiles = state.allFiles
        .filter((f) => !state.processedFiles.includes(f.path))
        .map((f) => f.path);
    },

    deselectAll: (state) => {
      state.selectedFiles = [];
    },

    toggleFileSelection: (state, action: PayloadAction<string>) => {
      const filePath = action.payload;
      if (state.selectedFiles.includes(filePath)) {
        state.selectedFiles = state.selectedFiles.filter((f) => f !== filePath);
      } else {
        state.selectedFiles.push(filePath);
      }
    },

    // File processing
    markFilesAsProcessed: (state, action: PayloadAction<string | string[]>) => {
      const filePaths = Array.isArray(action.payload)
        ? action.payload
        : [action.payload];

      filePaths.forEach((path) => {
        if (!state.processedFiles.includes(path)) {
          state.processedFiles.push(path);
          state.stats.organized++;
        }
      });

      // Remove from selected
      state.selectedFiles = state.selectedFiles.filter(
        (f) => !filePaths.includes(f)
      );
    },

    unmarkFilesAsProcessed: (state, action: PayloadAction<string | string[]>) => {
      const filePaths = Array.isArray(action.payload)
        ? action.payload
        : [action.payload];

      state.processedFiles = state.processedFiles.filter(
        (f) => !filePaths.includes(f)
      );
      state.stats.organized = Math.max(0, state.stats.organized - filePaths.length);
    },

    // Filters
    setFileTypeFilter: (state, action) => {
      state.filters.fileType = action.payload;
    },

    setSearchQuery: (state, action) => {
      state.filters.searchQuery = action.payload;
    },

    toggleShowProcessed: (state) => {
      state.filters.showProcessed = !state.filters.showProcessed;
    },

    // Clear state
    resetFiles: (state) => {
      state.allFiles = [];
      state.selectedFiles = [];
      state.processedFiles = [];
      state.discoveryPath = null;
      state.discoveryError = null;
      state.analyzingFiles = [];
      state.analysisErrors = {};
      state.stats = initialState.stats;
    },

    // Manual file updates
    updateFileAnalysis: (state, action) => {
      const { filePath, analysis } = action.payload;
      const file = state.allFiles.find((f) => f.path === filePath);
      if (file) {
        file.analysis = analysis;
        state.stats.analyzed++;
      }

      // Remove from analyzing
      state.analyzingFiles = state.analyzingFiles.filter((f) => f !== filePath);
    },

    setAnalysisError: (state, action) => {
      const { filePath, error } = action.payload;
      state.analysisErrors[filePath] = error;
      state.analyzingFiles = state.analyzingFiles.filter((f) => f !== filePath);
      state.stats.errors++;
    },

    // Add files to the list
    addFiles: (state, action) => {
      const newFiles = action.payload;
      const existingPaths = new Set(state.allFiles.map((f) => f.path));
      const uniqueNewFiles = newFiles.filter(
        (file) => !existingPaths.has(file.path)
      );
      state.allFiles = [...state.allFiles, ...uniqueNewFiles];
      state.selectedFiles = [...state.selectedFiles, ...uniqueNewFiles];
      state.stats.total = state.allFiles.length;
    },

    // Update file state
    updateFileState: (state, action) => {
      const { filePath, state: fileState, metadata } = action.payload;
      if (!state.fileStates) state.fileStates = {};
      state.fileStates[filePath] = {
        state: fileState,
        timestamp: new Date().toISOString(),
        ...metadata,
      };
    },

    // Set file states (batch update)
    setFileStates: (state, action) => {
      state.fileStates = action.payload;
    },

    // Update file error
    updateFileError: (state, action) => {
      const { filePath, error } = action.payload;
      state.analysisErrors[filePath] = error;
      if (!state.fileStates) state.fileStates = {};
      state.fileStates[filePath] = {
        state: 'error',
        timestamp: new Date().toISOString(),
        error,
      };
      state.stats.errors++;
    },

    // Set scanning state
    setIsScanning: (state, action) => {
      state.isScanning = action.payload;
    },

    // Set selected files
    setSelectedFiles: (state, action) => {
      state.selectedFiles = action.payload;
    },
  },
});

export const {
  selectFile,
  deselectFile,
  selectAll,
  deselectAll,
  toggleFileSelection,
  markFilesAsProcessed,
  unmarkFilesAsProcessed,
  setFileTypeFilter,
  setSearchQuery,
  toggleShowProcessed,
  resetFiles,
  updateFileAnalysis,
  setAnalysisError,
  addFiles,
  updateFileState,
  setFileStates,
  updateFileError,
  setIsScanning,
  setSelectedFiles,
} = filesSlice.actions;

// Selectors
export const selectAllFiles = (state) => state.files.allFiles;
export const selectSelectedFiles = (state) => state.files.selectedFiles;
export const selectProcessedFiles = (state) => state.files.processedFiles;
export const selectFilters = (state) => state.files.filters;
export const selectFileStates = (state) => state.files.fileStates || {};
export const selectIsScanning = (state) => state.files.isScanning || false;
export const selectIsDiscovering = (state) => state.files.isDiscovering;
export const selectFileStats = (state) => state.files.stats;
export const selectDiscoveryError = (state) => state.files.discoveryError;

// Filtered files selector
export const selectFilteredFiles = (state) => {
  const { allFiles, processedFiles, filters } = state.files;

  let filtered = allFiles;

  // Filter by processed status
  if (!filters.showProcessed) {
    filtered = filtered.filter((f) => !processedFiles.includes(f.path));
  }

  // Filter by file type
  if (filters.fileType !== 'all') {
    filtered = filtered.filter((f) => {
      const ext = f.extension?.toLowerCase();
      switch (filters.fileType) {
        case 'documents':
          return ['.pdf', '.doc', '.docx', '.txt'].includes(ext);
        case 'images':
          return ['.jpg', '.jpeg', '.png', '.gif'].includes(ext);
        case 'other':
          return !['.pdf', '.doc', '.docx', '.txt', '.jpg', '.jpeg', '.png', '.gif'].includes(ext);
        default:
          return true;
      }
    });
  }

  // Filter by search query
  if (filters.searchQuery) {
    const query = filters.searchQuery.toLowerCase();
    filtered = filtered.filter((f) =>
      f.name?.toLowerCase().includes(query) ||
      f.path?.toLowerCase().includes(query)
    );
  }

  return filtered;
};

export default filesSlice.reducer;

/**
 * Organize Slice - Manages file organization state
 */
import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';

// Helper to extract data from IPC response envelope
// IPC responses come in format: { success: boolean, data?: any, error?: any, ... }
// Some handlers return data directly in the envelope (e.g., { success: true, organized: [] })
// Others wrap in data property (e.g., { success: true, data: { organized: [] } })
function extractResponseData(result: any) {
  if (!result) return null;

  // If result has a data property, extract it
  if (result.data !== undefined) {
    return result.data;
  }

  // Otherwise, the data is spread directly in the result
  // Remove envelope properties and return the rest
  const { success, error, timestamp, requestId, ...data } = result;
  return data;
}

// Async thunks for organization operations
export const organizeFiles = createAsyncThunk(
  'organize/organizeFiles',
  async (
    {
      files,
      smartFolders,
      settings,
    }: { files: any[]; smartFolders: any[]; settings?: any },
    { rejectWithValue },
  ) => {
    try {
      const result = await window.electronAPI.organize.auto({
        files,
        smartFolders,
        options: settings,
      });

      // Handle error response
      if (result && result.success === false) {
        return rejectWithValue(result.error || 'Organization failed');
      }

      // Extract and return data
      const data = extractResponseData(result);
      return {
        success: true,
        organized: data?.organized || [],
        needsReview: data?.needsReview || [],
        failed: data?.failed || [],
        operations: data?.operations || [],
      };
    } catch (error: any) {
      return rejectWithValue(error?.message || 'Organization failed');
    }
  },
);

export const undoOrganization = createAsyncThunk(
  'organize/undo',
  async (_, { rejectWithValue }) => {
    try {
      const result = await window.electronAPI.undoRedo.undo();

      // Handle error response
      if (result && result.success === false) {
        return rejectWithValue(result.error || 'Undo failed');
      }

      const data = extractResponseData(result);
      return {
        success: true,
        canUndo: data?.canUndo ?? false,
        canRedo: data?.canRedo ?? false,
      };
    } catch (error: any) {
      return rejectWithValue(error?.message || 'Undo failed');
    }
  },
);

export const redoOrganization = createAsyncThunk(
  'organize/redo',
  async (_, { rejectWithValue }) => {
    try {
      const result = await window.electronAPI.undoRedo.redo();

      // Handle error response
      if (result && result.success === false) {
        return rejectWithValue(result.error || 'Redo failed');
      }

      const data = extractResponseData(result);
      return {
        success: true,
        canUndo: data?.canUndo ?? false,
        canRedo: data?.canRedo ?? false,
      };
    } catch (error: any) {
      return rejectWithValue(error?.message || 'Redo failed');
    }
  },
);

const initialState = {
  // Organization results
  organizedFiles: [],
  needsReview: [],
  failed: [],
  processedFileIds: [],

  // Organization process
  isOrganizing: false,
  organizationError: null,

  // Batch progress
  batchProgress: {
    current: 0,
    total: 0,
    currentFile: '',
  },

  // Preview
  preview: [],
  isPreviewVisible: false,

  // Undo/Redo
  canUndo: false,
  canRedo: false,
  undoHistory: [],
  redoHistory: [],

  // Statistics
  stats: {
    totalOrganized: 0,
    successRate: 0,
    averageConfidence: 0,
  },
};

const organizeSlice = createSlice({
  name: 'organize',
  initialState,
  reducers: {
    // Preview management
    setPreview: (state, action) => {
      state.preview = action.payload;
      state.isPreviewVisible = true;
    },

    clearPreview: (state) => {
      state.preview = [];
      state.isPreviewVisible = false;
    },

    togglePreview: (state) => {
      state.isPreviewVisible = !state.isPreviewVisible;
    },

    // Progress tracking
    setBatchProgress: (state, action) => {
      state.batchProgress = { ...state.batchProgress, ...action.payload };
    },

    resetBatchProgress: (state) => {
      state.batchProgress = initialState.batchProgress;
    },

    // Results management
    setOrganizedFiles: (state, action) => {
      state.organizedFiles = action.payload;
      state.stats.totalOrganized = action.payload.length;
    },

    addOrganizedFile: (state, action) => {
      state.organizedFiles.push(action.payload);
      state.stats.totalOrganized++;
    },

    addOrganizedFiles: (state, action) => {
      state.organizedFiles.push(...action.payload);
      state.stats.totalOrganized += action.payload.length;
    },

    removeOrganizedFile: (state, action) => {
      const filePath = action.payload;
      state.organizedFiles = state.organizedFiles.filter(
        (f) => f.originalPath !== filePath,
      );
      state.stats.totalOrganized = Math.max(0, state.stats.totalOrganized - 1);
    },

    // Processed file tracking
    markFilesAsProcessed: (state, action) => {
      const fileIds = Array.isArray(action.payload)
        ? action.payload
        : [action.payload];
      state.processedFileIds.push(...fileIds);
    },

    unmarkFilesAsProcessed: (state, action) => {
      const fileIds = Array.isArray(action.payload)
        ? action.payload
        : [action.payload];
      state.processedFileIds = state.processedFileIds.filter(
        (id) => !fileIds.includes(id),
      );
    },

    addFailedFile: (state, action) => {
      state.failed.push(action.payload);
    },

    clearOrganizationResults: (state) => {
      state.organizedFiles = [];
      state.needsReview = [];
      state.failed = [];
    },

    // Undo/Redo state
    setUndoRedoState: (state, action) => {
      const { canUndo, canRedo } = action.payload;
      state.canUndo = canUndo;
      state.canRedo = canRedo;
    },

    // Reset state
    // eslint-disable-next-line no-unused-vars
    resetOrganize: (_state) => {
      return { ...initialState };
    },
  },

  extraReducers: (builder) => {
    // Organize files
    builder.addCase(organizeFiles.pending, (state) => {
      state.isOrganizing = true;
      state.organizationError = null;
      state.batchProgress = { current: 0, total: 0, currentFile: '' };
    });

    builder.addCase(organizeFiles.fulfilled, (state, action) => {
      state.isOrganizing = false;
      state.organizedFiles = action.payload.organized || [];
      state.needsReview = action.payload.needsReview || [];
      state.failed = action.payload.failed || [];

      // Update statistics
      const total = state.organizedFiles.length;
      state.stats.totalOrganized = total;
      state.stats.successRate =
        total > 0
          ? (state.organizedFiles.length / (total + state.failed.length)) * 100
          : 0;

      if (total > 0) {
        const avgConfidence =
          state.organizedFiles.reduce(
            (sum, f) => sum + (f.confidence || 0),
            0,
          ) / total;
        state.stats.averageConfidence = avgConfidence;
      }

      // Reset progress
      state.batchProgress = initialState.batchProgress;
    });

    builder.addCase(organizeFiles.rejected, (state, action) => {
      state.isOrganizing = false;
      state.organizationError = action.payload || 'Organization failed';
      state.batchProgress = initialState.batchProgress;
    });

    // Undo
    builder.addCase(undoOrganization.fulfilled, (state, action) => {
      state.canUndo = action.payload.canUndo || false;
      state.canRedo = action.payload.canRedo || false;
    });

    // Redo
    builder.addCase(redoOrganization.fulfilled, (state, action) => {
      state.canUndo = action.payload.canUndo || false;
      state.canRedo = action.payload.canRedo || false;
    });
  },
});

export const {
  setPreview,
  clearPreview,
  togglePreview,
  setBatchProgress,
  resetBatchProgress,
  setOrganizedFiles,
  addOrganizedFile,
  addOrganizedFiles,
  removeOrganizedFile,
  markFilesAsProcessed,
  unmarkFilesAsProcessed,
  addFailedFile,
  clearOrganizationResults,
  setUndoRedoState,
  resetOrganize,
} = organizeSlice.actions;

// Selectors
export const selectOrganizedFiles = (state) => state.organize.organizedFiles;
export const selectNeedsReview = (state) => state.organize.needsReview;
export const selectFailedFiles = (state) => state.organize.failed;
export const selectProcessedFileIds = (state) =>
  state.organize.processedFileIds;
export const selectIsOrganizing = (state) => state.organize.isOrganizing;
export const selectBatchProgress = (state) => state.organize.batchProgress;
export const selectPreview = (state) => state.organize.preview;
export const selectIsPreviewVisible = (state) =>
  state.organize.isPreviewVisible;
export const selectCanUndo = (state) => state.organize.canUndo;
export const selectCanRedo = (state) => state.organize.canRedo;
export const selectOrganizeStats = (state) => state.organize.stats;
export const selectOrganizationError = (state) =>
  state.organize.organizationError;

export default organizeSlice.reducer;

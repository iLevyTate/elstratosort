/**
 * File Selectors
 * Memoized selectors for file-related state
 */
import { createSelector } from '@reduxjs/toolkit';
import type { RootState } from '../index';

/**
 * Base selectors
 */
export const selectFilesSlice = (state: RootState) => state.files;
export const selectAnalysisSlice = (state: RootState) => state.analysis;
export const selectOrganizeSlice = (state: RootState) => state.organize;

/**
 * Select files by state
 */
export const selectFilesByState = createSelector(
  [selectFilesSlice],
  (files) => {
    const byState: Record<string, typeof files.allFiles> = {
      pending: [],
      analyzing: [],
      analyzed: [],
      error: [],
      organized: [],
    };

    files.allFiles?.forEach((file) => {
      const state = files.fileStates?.[file.path];
      if (state && byState[state]) {
        byState[state].push(file);
      } else {
        byState.pending.push(file);
      }
    });

    return byState;
  },
);

/**
 * Select selected files with their analysis results
 */
export const selectSelectedFilesWithResults = createSelector(
  [
    (state: RootState) => state.files.selectedFiles,
    (state: RootState) => state.analysis.analysisResults,
  ],
  (selectedFiles, analysisResults) => {
    const resultsMap = new Map(
      analysisResults?.map((r: { filePath?: string }) => [r.filePath, r]) || [],
    );

    return selectedFiles?.map((file) => ({
      ...file,
      analysisResult: resultsMap.get(file.path),
    })) || [];
  },
);

/**
 * Select files that are currently being analyzed
 */
export const selectAnalyzingFiles = createSelector(
  [selectFilesSlice],
  (files) => {
    return files.allFiles?.filter(
      (file) => files.fileStates?.[file.path] === 'analyzing',
    ) || [];
  },
);

/**
 * Select files that have errors
 */
export const selectFilesWithErrors = createSelector(
  [selectFilesSlice],
  (files) => {
    const errorPaths = new Set(Object.keys(files.analysisErrors || {}));
    return files.allFiles?.filter((file) => errorPaths.has(file.path)) || [];
  },
);

/**
 * Select analysis progress as percentage
 */
export const selectAnalysisProgress = createSelector(
  [
    (state: RootState) => state.files.allFiles?.length || 0,
    (state: RootState) => state.analysis.analysisResults?.length || 0,
    (state: RootState) => state.analysis.isAnalyzing,
  ],
  (total, analyzed, isAnalyzing) => ({
    total,
    completed: analyzed,
    percentage: total > 0 ? Math.round((analyzed / total) * 100) : 0,
    isAnalyzing,
  }),
);

/**
 * Select files ready for organization (analyzed but not organized)
 */
export const selectFilesReadyToOrganize = createSelector(
  [
    (state: RootState) => state.analysis.analysisResults,
    (state: RootState) => state.organize.organizedFiles,
  ],
  (analysisResults, organizedFiles) => {
    const organizedPaths = new Set(
      organizedFiles?.map((f: { path?: string }) => f.path) || [],
    );

    return (
      analysisResults?.filter(
        (result: { filePath?: string; success?: boolean }) =>
          result.success !== false && !organizedPaths.has(result.filePath),
      ) || []
    );
  },
);

/**
 * Select current phase data
 */
export const selectCurrentPhase = createSelector(
  [(state: RootState) => state.ui.currentPhase, (state: RootState) => state.ui.phaseData],
  (currentPhase, phaseData) => ({
    phase: currentPhase,
    data: phaseData?.[currentPhase] || {},
  }),
);

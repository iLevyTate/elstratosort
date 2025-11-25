/**
 * Stats Selectors
 * Memoized selectors for computed statistics using reselect (built into RTK)
 * These derive stats from source data instead of storing duplicate state
 */
import { createSelector } from '@reduxjs/toolkit';
import type { RootState } from '../index';

/**
 * Base selectors (not memoized, just accessors)
 */
export const selectAllFiles = (state: RootState) => state.files.allFiles;
export const selectProcessedFiles = (state: RootState) => state.files.processedFiles;
export const selectAnalysisResults = (state: RootState) => state.analysis.analysisResults;
export const selectAnalysisErrors = (state: RootState) => state.files.analysisErrors;
export const selectOrganizedFiles = (state: RootState) => state.organize.organizedFiles;

/**
 * Computed file stats - derives stats from source arrays
 * Replaces the need for files.stats in slice state
 */
export const selectComputedFileStats = createSelector(
  [selectAllFiles, selectProcessedFiles, selectAnalysisResults, selectAnalysisErrors],
  (allFiles, processedFiles, analysisResults, analysisErrors) => ({
    total: allFiles?.length || 0,
    processed: processedFiles?.length || 0,
    analyzed: analysisResults?.length || 0,
    errors: Object.keys(analysisErrors || {}).length,
    pending: (allFiles?.length || 0) - (analysisResults?.length || 0),
    // Success rate calculation
    successRate:
      analysisResults?.length > 0
        ? ((analysisResults.length - Object.keys(analysisErrors || {}).length) /
            analysisResults.length) *
          100
        : 0,
  }),
);

/**
 * Computed analysis stats - derives stats from analysis results
 */
export const selectComputedAnalysisStats = createSelector(
  [selectAnalysisResults],
  (results) => {
    if (!results || results.length === 0) {
      return {
        totalAnalyzed: 0,
        successRate: 100,
        averageDuration: 0,
        averageConfidence: 0,
      };
    }

    const successful = results.filter(
      (r: { success?: boolean }) => r.success !== false,
    );
    const withDuration = results.filter(
      (r: { duration?: number }) => typeof r.duration === 'number',
    );
    const withConfidence = results.filter(
      (r: { confidence?: number }) => typeof r.confidence === 'number',
    );

    return {
      totalAnalyzed: results.length,
      successRate: (successful.length / results.length) * 100,
      averageDuration:
        withDuration.length > 0
          ? withDuration.reduce(
              (sum: number, r: { duration?: number }) => sum + (r.duration || 0),
              0,
            ) / withDuration.length
          : 0,
      averageConfidence:
        withConfidence.length > 0
          ? withConfidence.reduce(
              (sum: number, r: { confidence?: number }) => sum + (r.confidence || 0),
              0,
            ) / withConfidence.length
          : 0,
    };
  },
);

/**
 * Computed organize stats - derives stats from organized files
 */
export const selectComputedOrganizeStats = createSelector(
  [selectOrganizedFiles],
  (organizedFiles) => {
    if (!organizedFiles || organizedFiles.length === 0) {
      return {
        totalOrganized: 0,
        successRate: 100,
        averageConfidence: 0,
      };
    }

    const successful = organizedFiles.filter(
      (f: { success?: boolean }) => f.success !== false,
    );
    const withConfidence = organizedFiles.filter(
      (f: { confidence?: number }) => typeof f.confidence === 'number',
    );

    return {
      totalOrganized: organizedFiles.length,
      successRate: (successful.length / organizedFiles.length) * 100,
      averageConfidence:
        withConfidence.length > 0
          ? withConfidence.reduce(
              (sum: number, f: { confidence?: number }) => sum + (f.confidence || 0),
              0,
            ) / withConfidence.length
          : 0,
    };
  },
);

/**
 * Combined dashboard stats - aggregates all stats for display
 */
export const selectDashboardStats = createSelector(
  [selectComputedFileStats, selectComputedAnalysisStats, selectComputedOrganizeStats],
  (fileStats, analysisStats, organizeStats) => ({
    files: fileStats,
    analysis: analysisStats,
    organize: organizeStats,
    // Overall progress percentage
    overallProgress:
      fileStats.total > 0
        ? Math.round((fileStats.analyzed / fileStats.total) * 100)
        : 0,
  }),
);

/**
 * Selector for checking if there are files ready for organization
 */
export const selectHasFilesReadyToOrganize = createSelector(
  [selectAnalysisResults, selectOrganizedFiles],
  (analysisResults, organizedFiles) => {
    const organizedPaths = new Set(
      organizedFiles?.map((f: { path?: string }) => f.path) || [],
    );
    return (
      analysisResults?.some(
        (r: { filePath?: string; success?: boolean }) =>
          r.success !== false && !organizedPaths.has(r.filePath),
      ) || false
    );
  },
);

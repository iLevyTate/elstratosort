/**
 * OrganizePhase Component
 *
 * Review and organize analyzed files into smart folders.
 * Refactored to use decomposed hooks for better maintainability.
 *
 * @module phases/OrganizePhase
 */

import React, { useMemo, useCallback, useEffect, useRef } from 'react';
import { PHASES } from '../../shared/constants';
import { logger } from '../../shared/logger';
import { useNotification } from '../contexts/NotificationContext';
import { Collapsible, Button } from '../components/ui';
import {
  StatusOverview,
  TargetFolderList,
  BulkOperations,
  OrganizeProgress,
  VirtualizedFileGrid,
  VirtualizedProcessedFiles,
} from '../components/organize';
import { UndoRedoToolbar, useUndoRedo } from '../components/UndoRedoSystem';

// Import decomposed hooks
import {
  useOrganizeState,
  useLoadInitialData,
} from './organize/useOrganizeState';
import { useSmartFolderMatcher } from './organize/useSmartFolderMatcher';
import {
  useFileStateDisplay,
  useFileEditing,
  useFileSelection,
  useBulkOperations,
  useProcessedFiles,
} from './organize/useFileEditing';
import { useOrganization } from './organize/useOrganization';
import { setFileStates as setFileStatesAction } from '../store/slices/filesSlice';

logger.setContext('OrganizePhase');

function OrganizePhase() {
  const { addNotification } = useNotification();
  const { executeAction } = useUndoRedo();

  // Redux state management
  const {
    organizedFiles,
    filesWithAnalysis,
    analysisResults,
    smartFolders,
    fileStates,
    defaultLocation,
    failedCount,
    smartFoldersRef,
    dispatchRef,
    dispatch,
    setOrganizedFiles,
    setOrganizingState,
    phaseData,
    actions,
  } = useOrganizeState();

  // Load initial data
  const addNotificationRef = useRef(addNotification);
  useEffect(() => {
    addNotificationRef.current = addNotification;
  }, [addNotification]);

  useLoadInitialData(
    { smartFoldersRef, dispatchRef },
    addNotificationRef.current,
  );

  // File state display
  const { getFileStateDisplay } = useFileStateDisplay(fileStates);

  // File editing
  const { editingFiles, setEditingFiles, handleEditFile, getFileWithEdits } =
    useFileEditing();

  // Processed files tracking
  const {
    setProcessedFileIds,
    markFilesAsProcessed,
    unmarkFilesAsProcessed,
    getFilteredFiles,
  } = useProcessedFiles(organizedFiles);

  // Compute filtered files
  const { unprocessedFiles, processedFiles } = useMemo(
    () => getFilteredFiles(filesWithAnalysis),
    [getFilteredFiles, filesWithAnalysis],
  );

  // File selection
  const {
    selectedFiles,
    setSelectedFiles,
    toggleFileSelection,
    selectAllFiles,
  } = useFileSelection(unprocessedFiles.length);

  // Bulk operations
  const {
    bulkEditMode,
    setBulkEditMode,
    bulkCategory,
    setBulkCategory,
    applyBulkCategoryChange,
  } = useBulkOperations({
    selectedFiles,
    editingFiles,
    setEditingFiles,
    setSelectedFiles,
    addNotification,
  });

  // Smart folder matcher
  const findSmartFolderForCategory = useSmartFolderMatcher(smartFolders);

  // Organization logic
  const { isOrganizing, batchProgress, organizePreview, handleOrganizeFiles } =
    useOrganization({
      unprocessedFiles,
      editingFiles,
      getFileWithEdits,
      findSmartFolderForCategory,
      defaultLocation,
      smartFolders,
      analysisResults,
      markFilesAsProcessed,
      unmarkFilesAsProcessed,
      actions,
      phaseData,
      addNotification,
      executeAction,
      setOrganizedFiles,
      setOrganizingState,
    });

  // Load persisted data once on mount
  const hasLoadedPersistedDataRef = useRef(false);

  useEffect(() => {
    if (hasLoadedPersistedDataRef.current) {
      return;
    }
    hasLoadedPersistedDataRef.current = true;

    const loadPersistedData = () => {
      const persistedStates = fileStates || {};

      if (
        analysisResults.length === 0 &&
        Object.keys(persistedStates).length > 0
      ) {
        dispatch(setFileStatesAction({}));
      }
      if (
        Object.keys(persistedStates).length === 0 &&
        analysisResults.length > 0
      ) {
        const reconstructedStates = {};
        analysisResults.forEach((file) => {
          if (file.analysis && !file.error)
            reconstructedStates[file.path] = {
              state: 'ready',
              timestamp: file.analyzedAt || new Date().toISOString(),
              analysis: file.analysis,
              analyzedAt: file.analyzedAt,
            };
          else if (file.error)
            reconstructedStates[file.path] = {
              state: 'error',
              timestamp: file.analyzedAt || new Date().toISOString(),
              error: file.error,
              analyzedAt: file.analyzedAt,
            };
          else
            reconstructedStates[file.path] = {
              state: 'pending',
              timestamp: new Date().toISOString(),
            };
        });
        dispatch(setFileStatesAction(reconstructedStates));
      }
      const previouslyOrganized = organizedFiles || [];
      const processedIds = new Set(
        previouslyOrganized.map((file) => file.originalPath || file.path),
      );
      setProcessedFileIds(processedIds);
    };
    loadPersistedData();
  }, []);

  const isAnalysisRunning = phaseData.isAnalyzing || false;
  const analysisProgressFromDiscover = phaseData.analysisProgress || {
    current: 0,
    total: 0,
  };

  const readyFilesCount = useMemo(
    () => unprocessedFiles.filter((f) => f.analysis).length,
    [unprocessedFiles],
  );

  const approveSelectedFiles = useCallback(() => {
    if (selectedFiles.size === 0) return;
    const selectedIndices = Array.from(selectedFiles);
    const filesToProcess = selectedIndices
      .filter((index) => index >= 0 && index < unprocessedFiles.length)
      .map((index) => unprocessedFiles[index])
      .filter((f) => f && f.analysis);

    if (filesToProcess.length === 0) {
      addNotification('No valid files selected for organization', 'warning');
      return;
    }

    handleOrganizeFiles(filesToProcess);
    setSelectedFiles(new Set());
  }, [
    selectedFiles,
    unprocessedFiles,
    addNotification,
    handleOrganizeFiles,
    setSelectedFiles,
  ]);

  return (
    <div className="h-full w-full overflow-y-auto overflow-x-hidden modern-scrollbar">
      <div className="container-responsive gap-6 py-6 flex flex-col min-h-min">
        {/* Header */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between flex-shrink-0">
          <div className="space-y-3">
            <h1 className="heading-primary">📂 Review & Organize</h1>
            <p className="text-lg text-system-gray-600 leading-relaxed max-w-2xl">
              Inspect suggestions, fine-tune smart folders, and execute the
              batch once you&apos;re ready.
            </p>
            {isAnalysisRunning && (
              <div className="flex items-center gap-4 rounded-2xl border border-stratosort-blue/30 bg-stratosort-blue/5 px-5 py-4 text-sm text-stratosort-blue">
                <span className="loading-spinner h-5 w-5 border-t-transparent" />
                Analysis continuing in background:{' '}
                {analysisProgressFromDiscover.current}/
                {analysisProgressFromDiscover.total} files
              </div>
            )}
          </div>
          <UndoRedoToolbar className="flex-shrink-0" />
        </div>

        {/* Main Content */}
        <div className="flex flex-col gap-6">
          {smartFolders.length > 0 && (
            <Collapsible
              title="📁 Target Smart Folders"
              defaultOpen={false}
              persistKey="organize-target-folders"
              contentClassName="p-8"
              className="glass-panel"
            >
              <TargetFolderList
                folders={smartFolders}
                defaultLocation={defaultLocation}
              />
            </Collapsible>
          )}
          {(unprocessedFiles.length > 0 || processedFiles.length > 0) && (
            <Collapsible
              title="📊 File Status Overview"
              defaultOpen
              persistKey="organize-status"
              className="glass-panel"
            >
              <StatusOverview
                unprocessedCount={unprocessedFiles.length}
                processedCount={processedFiles.length}
                failedCount={failedCount}
              />
            </Collapsible>
          )}
          {unprocessedFiles.length > 0 && (
            <Collapsible
              title="Bulk Operations"
              defaultOpen
              persistKey="organize-bulk"
              className="glass-panel"
            >
              <BulkOperations
                total={unprocessedFiles.length}
                selectedCount={selectedFiles.size}
                onSelectAll={selectAllFiles}
                onApproveSelected={approveSelectedFiles}
                bulkEditMode={bulkEditMode}
                setBulkEditMode={setBulkEditMode}
                bulkCategory={bulkCategory}
                setBulkCategory={setBulkCategory}
                onApplyBulkCategory={applyBulkCategoryChange}
                smartFolders={smartFolders}
              />
            </Collapsible>
          )}
          {processedFiles.length > 0 && (
            <Collapsible
              title="Previously Organized Files"
              defaultOpen={false}
              persistKey="organize-history"
              contentClassName="p-8"
              className="glass-panel"
            >
              <VirtualizedProcessedFiles files={processedFiles} />
            </Collapsible>
          )}

          {/* Files Ready */}
          <Collapsible
            title="Files Ready for Organization"
            defaultOpen
            persistKey="organize-ready-list"
            className="glass-panel"
            contentClassName="p-6"
          >
            {unprocessedFiles.length === 0 ? (
              <div className="text-center py-21">
                <div className="text-4xl mb-13">
                  {processedFiles.length > 0 ? '✅' : '📭'}
                </div>
                <p className="text-system-gray-500 italic">
                  {processedFiles.length > 0
                    ? 'All files have been organized! Check the results below.'
                    : 'No files ready for organization yet.'}
                </p>
                {processedFiles.length === 0 && (
                  <Button
                    onClick={() => actions.advancePhase(PHASES.DISCOVER)}
                    variant="primary"
                    className="mt-13"
                  >
                    ← Go Back to Select Files
                  </Button>
                )}
              </div>
            ) : (
              <VirtualizedFileGrid
                files={unprocessedFiles}
                selectedFiles={selectedFiles}
                toggleFileSelection={toggleFileSelection}
                getFileWithEdits={getFileWithEdits}
                editingFiles={editingFiles}
                findSmartFolderForCategory={findSmartFolderForCategory}
                getFileStateDisplay={getFileStateDisplay}
                handleEditFile={handleEditFile}
                smartFolders={smartFolders}
                defaultLocation={defaultLocation}
              />
            )}
          </Collapsible>

          {/* Action Area */}
          {unprocessedFiles.length > 0 && (
            <div className="glass-panel p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-system-gray-600 font-medium">
                    Ready to move {readyFilesCount} files
                  </p>
                  <p className="text-xs text-system-gray-500">
                    You can undo this operation if needed
                  </p>
                </div>
                {isOrganizing ? (
                  <div className="w-1/2">
                    <OrganizeProgress
                      isOrganizing={isOrganizing}
                      batchProgress={batchProgress}
                      preview={organizePreview}
                    />
                  </div>
                ) : (
                  <Button
                    onClick={handleOrganizeFiles}
                    variant="success"
                    className="text-lg px-8 py-4"
                    disabled={readyFilesCount === 0 || isOrganizing}
                    isLoading={isOrganizing}
                  >
                    {isOrganizing ? 'Organizing...' : '✨ Organize Files Now'}
                  </Button>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Footer Buttons */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between flex-shrink-0 mt-2">
          <Button
            onClick={() => actions.advancePhase(PHASES.DISCOVER)}
            variant="secondary"
            disabled={isOrganizing}
            className="w-full sm:w-auto"
          >
            ← Back to Discovery
          </Button>
          <Button
            onClick={() => actions.advancePhase(PHASES.COMPLETE)}
            disabled={processedFiles.length === 0 || isOrganizing}
            className={`w-full sm:w-auto ${
              processedFiles.length === 0 || isOrganizing
                ? 'opacity-50 cursor-not-allowed'
                : ''
            }`}
          >
            View Results →
          </Button>
        </div>
      </div>
    </div>
  );
}

export default OrganizePhase;

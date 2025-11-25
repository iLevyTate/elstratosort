import React, { useCallback, useEffect } from 'react';
import { useDispatch, useSelector } from 'react-redux';import { PHASES } from '../../shared/constants';import { logger } from '../../shared/logger';
import { selectPhaseData, advancePhase, addNotification } from '../store/slices/uiSlice';
import { Collapsible, Button } from '../components/ui';
import {
  StatusOverview,
  TargetFolderList,
  BulkOperations,
  OrganizedHistoryList,
  ReadyFileList,
  OrganizeActionArea,
} from '../components/organize';
import { UndoRedoToolbar } from '../components/UndoRedoSystem';
import {
  useOrganizeData,
  useOrganizeSelection,
  useOrganizeOperations,
} from '../hooks';

// HIGH PRIORITY FIX: Removed module-level setContext call that overwrote other components' contexts

function OrganizePhase() {
  // Set logger context when component mounts (instead of at module level)
  useEffect(() => {
    logger.setContext('OrganizePhase');
  }, []);
  const dispatch = useDispatch();
  const discoverPhaseData = useSelector((state) => selectPhaseData(state, 'discover'));

  // 1. Data Hook
  const {
    analysisResults,
    smartFolders,
    setOrganizedFiles,
    defaultLocation,
    getFileStateDisplay,
    findSmartFolderForCategory,
    unprocessedFiles,
    processedFiles,
    markFilesAsProcessed,
    unmarkFilesAsProcessed,
  } = useOrganizeData();

  // 2. Selection Hook
  const {
    editingFiles,
    selectedFiles,
    setSelectedFiles,
    bulkEditMode,
    setBulkEditMode,
    bulkCategory,
    setBulkCategory,
    handleEditFile,
    getFileWithEdits,
    toggleFileSelection,
    selectAllFiles,
    applyBulkCategoryChange,
  } = useOrganizeSelection(unprocessedFiles);

  // 3. Operations Hook
  const {
    isOrganizing,
    batchProgress,
    organizePreview,
    handleOrganizeFiles,
  } = useOrganizeOperations({
    unprocessedFiles,
    editingFiles,
    getFileWithEdits,
    findSmartFolderForCategory,
    defaultLocation,
    smartFolders,
    analysisResults,
    markFilesAsProcessed,
    unmarkFilesAsProcessed,
    setOrganizedFiles,
  });

  // Local component logic
  const isAnalysisRunning = discoverPhaseData.isAnalyzing || false;
  const analysisProgressFromDiscover = discoverPhaseData.analysisProgress || {
    current: 0,
    total: 0,
  };

  const approveSelectedFiles = useCallback(() => {
    if (selectedFiles.size === 0) return;
    const selectedIndices = Array.from(selectedFiles);
    const filesToProcess = selectedIndices      .map((index) => unprocessedFiles[index])
      .filter((f) => f && f.analysis);

    if (filesToProcess.length === 0) {
      dispatch(addNotification({
        message: 'No valid files selected for organization',
        type: 'warning',
      }));
      return;
    }

    handleOrganizeFiles(filesToProcess);
    setSelectedFiles(new Set());
  }, [
    selectedFiles,
    unprocessedFiles,
    dispatch,
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
          {smartFolders.length > 0 && (            <Collapsible
              title="📁 Target Smart Folders"
              defaultOpen={false}
              persistKey="organize-target-folders"
              contentClassName="p-8"
              className="glass-panel"
            >
              <TargetFolderList                folders={smartFolders}
                defaultLocation={defaultLocation}
              />
            </Collapsible>
          )}
          {(unprocessedFiles.length > 0 || processedFiles.length > 0) && (            <Collapsible
              title="📊 File Status Overview"
              defaultOpen
              persistKey="organize-status"
              className="glass-panel"
            >
              <StatusOverview                unprocessedCount={unprocessedFiles.length}
                processedCount={processedFiles.length}
                failedCount={analysisResults.filter((f) => !f.analysis).length}
              />
            </Collapsible>
          )}
          {unprocessedFiles.length > 0 && (            <Collapsible
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
          {processedFiles.length > 0 && (            <Collapsible
              title="✅ Previously Organized Files"
              defaultOpen={false}
              persistKey="organize-history"
              contentClassName="p-8"
              className="glass-panel"
            >
              <OrganizedHistoryList processedFiles={processedFiles} />
            </Collapsible>
          )}

          {/* Files Ready */}          <Collapsible
            title="Files Ready for Organization"
            defaultOpen
            persistKey="organize-ready-list"
            className="glass-panel"
            contentClassName="p-6"
          >
            <ReadyFileList
              unprocessedFiles={unprocessedFiles}
              processedFiles={processedFiles}
              getFileWithEdits={getFileWithEdits}
              editingFiles={editingFiles}
              selectedFiles={selectedFiles}
              findSmartFolderForCategory={findSmartFolderForCategory}
              getFileStateDisplay={getFileStateDisplay}
              toggleFileSelection={toggleFileSelection}
              handleEditFile={handleEditFile}
              defaultLocation={defaultLocation}
              smartFolders={smartFolders}
              onGoBack={() => dispatch(advancePhase({ targetPhase: PHASES.DISCOVER }))}
            />
          </Collapsible>

          {/* Action Area */}
          {unprocessedFiles.length > 0 && (
            <OrganizeActionArea
              unprocessedFiles={unprocessedFiles}
              isOrganizing={isOrganizing}
              batchProgress={batchProgress}
              organizePreview={organizePreview}
              onOrganize={handleOrganizeFiles}
            />
          )}
        </div>

        {/* Footer Buttons */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between flex-shrink-0 mt-2">          <Button
            onClick={() => dispatch(advancePhase({ targetPhase: PHASES.DISCOVER }))}
            variant="secondary"
            disabled={isOrganizing}
            className="w-full sm:w-auto"
          >
            ← Back to Discovery
          </Button>          <Button
            onClick={() => dispatch(advancePhase({ targetPhase: PHASES.COMPLETE }))}
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

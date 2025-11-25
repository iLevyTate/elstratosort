import React, {
  useEffect,
  useRef,
  useCallback,
  Suspense,
  lazy,
} from 'react';
import { useDispatch } from 'react-redux';import { PHASES } from '../../shared/constants';import { logger } from '../../shared/logger';
import { addNotification, advancePhase } from '../store/slices/uiSlice';
import {
  useConfirmDialog,
  useDiscoverSettings,
  useFileSelection,
  useFileAnalysis
} from '../hooks';
import { Button } from '../components/ui';
import { ModalLoadingOverlay } from '../components/LoadingSkeleton';
const AnalysisHistoryModal = lazy(
  () => import('../components/AnalysisHistoryModal'),
);
import {
  NamingSettings,
  SelectionControls,
  DragAndDropZone,
  AnalysisResultsList,
  AnalysisProgress,
} from '../components/discover';

// HIGH PRIORITY FIX: Removed module-level setContext call that overwrote other components' contexts

function DiscoverPhase() {
  // Set logger context when component mounts (instead of at module level)
  useEffect(() => {
    logger.setContext('DiscoverPhase');
  }, []);
  const dispatch = useDispatch();
  const { showConfirm, ConfirmDialog } = useConfirmDialog();
  
  // Settings Hook
  const namingSettings = useDiscoverSettings();
  
  // Forwarding ref for circular dependency between selection and analysis
  const analyzeFilesRef = useRef(null);
  const handleFilesAdded = useCallback((files) => {
    if (analyzeFilesRef.current) {
      analyzeFilesRef.current(files);
    }
  }, []);

  // File Selection Hook
  const {
    selectedFiles,
    setSelectedFiles,
    setFileStates,
    updateFileState,
    getFileState,
    getFileStateDisplay,
    isScanning,
    handleFileSelection,
    handleFolderSelection,
    isDragging,
    dragProps
  } = useFileSelection(handleFilesAdded);

  // File Analysis Hook
  const {
    analysisResults,
    setAnalysisResults,
    isAnalyzing,
    currentAnalysisFile,
    analysisProgress,
    analyzeFiles,
    resetAnalysisState,
    stopAnalysis,
    showAnalysisHistory,
    setShowAnalysisHistory,
    analysisStats,
    setAnalysisStats
  } = useFileAnalysis(namingSettings, updateFileState);

  // Update ref when analyzeFiles changes
  useEffect(() => {
    analyzeFilesRef.current = analyzeFiles;
  }, [analyzeFiles]);

  const handleFileAction = useCallback(async (action, filePath) => {
      try {
        switch (action) {
          case 'open':            await window.electronAPI.files.open(filePath);
            break;
          case 'reveal':            await window.electronAPI.files.reveal(filePath);
            break;
          case 'delete': {
            const fileName = filePath.split(/[\\/]/).pop();
            const confirmDelete = await showConfirm({
              title: 'Delete File',
              message: 'Are you sure you want to permanently delete this file?',
              confirmText: 'Delete',
              variant: 'danger',
            });
            if (confirmDelete) {              const result = await window.electronAPI.files.delete(filePath);
              if (result.success) {
                setAnalysisResults((prev) => prev.filter((f) => f.path !== filePath));
                setSelectedFiles((prev) => prev.filter((f) => f.path !== filePath));
                setFileStates((prev) => {
                  const next = { ...prev };
                  delete next[filePath];
                  return next;
                });
                dispatch(addNotification({
                  message: `Deleted: ${fileName}`,
                  type: 'success',
                }));
              }
            }
            break;
          }
        }
      } catch (error) {
        dispatch(addNotification({
          message: `Action failed: ${error.message}`,
          type: 'error',
        }));
      }
    },
    [dispatch, showConfirm, setSelectedFiles, setAnalysisResults, setFileStates]
  );

  const clearAnalysisQueue = useCallback(() => {
    setSelectedFiles([]);
    setAnalysisResults([]);
    setFileStates({});
    resetAnalysisState('User cleared');

    dispatch(addNotification({
      message: 'Analysis queue cleared',
      type: 'info',
      duration: 2000,
    }));
  }, [dispatch, setSelectedFiles, setAnalysisResults, setFileStates, resetAnalysisState]);

  return (
    <div className="h-full w-full overflow-y-auto overflow-x-hidden modern-scrollbar">
      <div className="container-responsive gap-6 py-6 flex flex-col min-h-min">
        {/* Header Section */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 flex-shrink-0">
          <div className="space-y-1">
            <h1 className="heading-primary text-2xl md:text-3xl">
              Discover & Analyze
            </h1>
            <p className="text-base text-system-gray-600 max-w-2xl">
              Add your files and configure how StratoSort should name them.
            </p>
          </div>          <Button
            variant="secondary"
            className="text-sm gap-2"
            onClick={() => setShowAnalysisHistory(true)}
          >
            <span>📜</span> History
          </Button>
        </div>

        <div className="flex-1 min-h-0 flex flex-col gap-6 overflow-hidden">
          {/* Dashboard Grid - Top Section */}
          <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 flex-shrink-0 min-h-[350px]">
            {/* Input Source Card - Left Side */}
            <section className="xl:col-span-5 glass-panel p-6 flex flex-col gap-6 shadow-sm border border-white/50">
              <div className="flex items-center justify-between">
                <h3 className="heading-tertiary m-0 flex items-center gap-2">
                  <span className="text-lg">📂</span> Select Content
                </h3>
                {selectedFiles.length > 0 && (
                  <span className="text-xs font-medium px-2.5 py-1 bg-blue-50 text-blue-700 rounded-full">
                    {selectedFiles.length} file
                    {selectedFiles.length !== 1 ? 's' : ''} ready
                  </span>
                )}
              </div>

              <div className="flex-1 flex flex-col gap-4 min-h-0">
                <DragAndDropZone                  isDragging={isDragging}
                  dragProps={dragProps}
                  className="flex-1 flex flex-col justify-center items-center min-h-[140px] bg-white/50 hover:bg-white/80 transition-all border-system-gray-200"
                />
                <SelectionControls                  onSelectFiles={handleFileSelection}
                  onSelectFolder={handleFolderSelection}
                  isScanning={isScanning}
                  className="justify-center w-full pt-2"
                />
              </div>
            </section>

            {/* Settings Card - Right Side */}
            <section className="xl:col-span-7 glass-panel p-6 flex flex-col gap-6 shadow-sm border border-white/50">
              <div className="flex items-center justify-between">
                <h3 className="heading-tertiary m-0 flex items-center gap-2">
                  <span className="text-lg">⚙️</span> Naming Strategy
                </h3>
                <div className="text-xs text-system-gray-400">
                  Configure how files will be renamed
                </div>
              </div>

              <div className="flex-1 flex flex-col justify-center overflow-y-auto modern-scrollbar">
                <NamingSettings                  namingConvention={namingSettings.namingConvention}
                  setNamingConvention={namingSettings.setNamingConvention}
                  dateFormat={namingSettings.dateFormat}
                  setDateFormat={namingSettings.setDateFormat}
                  caseConvention={namingSettings.caseConvention}
                  setCaseConvention={namingSettings.setCaseConvention}
                  separator={namingSettings.separator}
                  setSeparator={namingSettings.setSeparator}
                />
              </div>
            </section>
          </div>

          {/* Middle Section - Queue & Status Actions */}
          {(selectedFiles.length > 0 || isAnalyzing) && (
            <div className="flex-shrink-0 glass-panel p-4 flex items-center justify-between gap-4 shadow-sm border border-white/50 bg-white/40 backdrop-blur-md animate-fade-in">
              <div className="flex items-center gap-4 flex-1">
                {/* Analysis Progress Bar or Status Text */}
                {isAnalyzing ? (
                  <div className="flex-1 max-w-2xl">
                    <AnalysisProgress                      progress={analysisProgress}
                      currentFile={currentAnalysisFile}
                    />
                  </div>
                ) : (
                  <div className="text-sm text-system-gray-600 flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></span>
                    Ready to analyze {selectedFiles.length} files
                  </div>
                )}
              </div>

              <div className="flex items-center gap-3">
                {isAnalyzing ? (
                  <button
                    onClick={stopAnalysis}
                    className="px-4 py-2 text-xs font-medium bg-red-50 text-red-600 rounded-md hover:bg-red-100 transition-colors border border-red-200"
                  >
                    Stop Analysis
                  </button>
                ) : (
                  <button
                    onClick={clearAnalysisQueue}
                    className="px-4 py-2 text-xs font-medium text-system-gray-500 hover:text-red-600 hover:bg-red-50 rounded-md transition-colors"
                  >
                    Clear Queue
                  </button>
                )}
              </div>
            </div>
          )}

          {/* Bottom Section - Results */}
          {analysisResults.length > 0 && (
            <div className="flex-1 min-h-0 glass-panel shadow-sm border border-white/50 flex flex-col overflow-hidden animate-slide-up">
              <div className="p-4 border-b border-system-gray-100 bg-white/30 flex items-center justify-between">
                <h3 className="heading-tertiary m-0 text-sm uppercase tracking-wider text-system-gray-500">
                  Analysis Results
                </h3>
                <div className="text-xs text-system-gray-400">
                  {analysisResults.filter((r) => r.analysis).length} successful,{' '}
                  {analysisResults.filter((r) => r.error).length} failed
                </div>
              </div>
              <div className="flex-1 overflow-y-auto p-0 modern-scrollbar bg-white/20">
                <AnalysisResultsList
                  results={analysisResults}
                  onFileAction={handleFileAction}
                  getFileStateDisplay={getFileStateDisplay}
                />
              </div>
            </div>
          )}
        </div>

        {/* Footer Navigation */}
        <div className="mt-auto pt-4 border-t border-system-gray-200/50 flex flex-col sm:flex-row items-center justify-between gap-4 flex-shrink-0">          <Button
            onClick={() => dispatch(advancePhase({ targetPhase: PHASES.SETUP }))}
            variant="secondary"
            className="w-full sm:w-auto"
          >
            ← Back to Setup
          </Button>          <Button
            onClick={() => {
              if (isAnalyzing) {
                dispatch(addNotification({
                  message: 'Please wait for analysis to complete',
                  type: 'warning',
                  duration: 3000,
                }));
                return;
              }
              const readyCount = analysisResults.filter(
                (r) => r.analysis && !r.error,
              ).length;
              if (readyCount === 0) {
                dispatch(addNotification({
                  message: analysisResults.length > 0
                    ? 'All files failed analysis'
                    : 'Please analyze files first',
                  type: 'warning',
                  duration: 4000,
                }));
                return;
              }
              dispatch(advancePhase({ targetPhase: PHASES.ORGANIZE }));
            }}
            variant="primary"
            className="w-full sm:w-auto shadow-lg shadow-blue-500/20"
            disabled={
              isAnalyzing ||
              (analysisResults.length === 0 &&
                selectedFiles.filter((f) => getFileState(f.path) === 'ready')
                  .length === 0)
            }
          >
            Continue to Organize →
          </Button>
        </div>

        <ConfirmDialog />
        {showAnalysisHistory && (
          <Suspense
            fallback={<ModalLoadingOverlay message="Loading History..." />}
          >
            <AnalysisHistoryModal
              onClose={() => setShowAnalysisHistory(false)}
              analysisStats={analysisStats}
              setAnalysisStats={setAnalysisStats}
            />
          </Suspense>
        )}
      </div>
    </div>
  );
}

export default DiscoverPhase;

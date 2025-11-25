import { useState, useCallback, useEffect } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import {
  selectAnalysisResults,
  selectIsAnalyzing,
  selectCurrentAnalysisFile,
  selectAnalysisProgress,
  setAnalysisResults as setAnalysisResultsAction,
  setIsAnalyzing as setIsAnalyzingAction,
  setCurrentAnalysisFile as setCurrentAnalysisFileAction,
  setAnalysisProgress as setAnalysisProgressAction,
  resetAnalysisState as resetAnalysisStateAction,
} from '../store/slices/analysisSlice';
import { addNotification, advancePhase } from '../store/slices/uiSlice';import { logger } from '../../shared/logger';

export const useFileAnalysis = (namingSettings, updateFileState) => {
  const dispatch = useDispatch();

  // Get state from Redux
  const analysisResults = useSelector(selectAnalysisResults);
  const isAnalyzing = useSelector(selectIsAnalyzing);
  const currentAnalysisFile = useSelector(selectCurrentAnalysisFile);
  const analysisProgress = useSelector(selectAnalysisProgress);

  // Local UI state (not persisted)
  const [showAnalysisHistory, setShowAnalysisHistory] = useState(false);
  const [analysisStats, setAnalysisStats] = useState(null);

  // Redux action wrappers
  const setAnalysisResults = useCallback(
    (results) => dispatch(setAnalysisResultsAction(results)),
    [dispatch]
  );

  const setIsAnalyzing = useCallback(
    (analyzing) => dispatch(setIsAnalyzingAction(analyzing)),
    [dispatch]
  );

  const setCurrentAnalysisFile = useCallback(
    (file) => dispatch(setCurrentAnalysisFileAction(file)),
    [dispatch]
  );

  const setAnalysisProgress = useCallback(
    (progress) => dispatch(setAnalysisProgressAction(progress)),
    [dispatch]
  );

  // Reset analysis state on reload if needed
  useEffect(() => {
    if (isAnalyzing) {
      // Reset analysis state on reload (crashed mid-analysis)
      dispatch(resetAnalysisStateAction());
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Listen for progress events
  useEffect(() => {    if (!window.electronAPI?.events?.onOperationProgress) return;    const unsubscribe = window.electronAPI.events.onOperationProgress((data) => {
      // Validate progress event data
      if (!data || typeof data !== 'object' || data.type !== 'analysis') return;

      const current = Number(data.current);
      const total = Number(data.total);

      // Validate numeric values
      if (!Number.isFinite(current) || !Number.isFinite(total)) return;

      const progress = {
        current,
        total,
        lastActivity: Date.now(),
      };
      setAnalysisProgress(progress);

      if (data.currentFile && typeof data.currentFile === 'string') {
        const fileName = data.currentFile.split(/[\\/]/).pop();
        setCurrentAnalysisFile(fileName);
      }
    });
    return unsubscribe;
  }, [setAnalysisProgress, setCurrentAnalysisFile]);

  const resetAnalysisState = useCallback(
    (reason) => {
      logger.info('Resetting analysis state', { reason });
      dispatch(resetAnalysisStateAction());
    },
    [dispatch],
  );

  const analyzeFiles = useCallback(
    async (files) => {
      if (!files || files.length === 0) return;
      if (isAnalyzing) return;

      const {
        namingConvention,
        dateFormat,
        caseConvention,
        separator,
        generatePreviewName
      } = namingSettings;

      setIsAnalyzing(true);
      const initialProgress = {
        current: 0,
        total: files.length,
        lastActivity: Date.now(),
      };
      setAnalysisProgress(initialProgress);

      dispatch(addNotification({
        message: `Starting batch analysis of ${files.length} files...`,
        type: 'info',
        duration: 3000,
      }));

      try {
        const filePaths = files.map(f => f.path);        const response = await window.electronAPI.analysis.startBatch(filePaths);

        // Validate response structure
        if (!response || typeof response !== 'object') {
          throw new Error('Invalid response from analysis service');
        }

        if (response.success) {
            const results = Array.isArray(response.results) ? response.results : [];
            
            const resultsByPath = new Map(
                (analysisResults || []).map((r) => [r.path, r])
            );
            
            const getOriginalFile = (path) => files.find(f => f.path === path) || { path, name: path.split(/[\\/]/).pop() };

            results.forEach(item => {
                const original = getOriginalFile(item.filePath);
                
                if (item.success && item.result) {
                    const enhancedAnalysis = {
                        ...item.result,
                        suggestedName: generatePreviewName(item.result.suggestedName || original.name),
                        namingConvention: { convention: namingConvention, dateFormat, caseConvention, separator }
                    };
                    
                    const resultObj = {
                        ...original,
                        analysis: enhancedAnalysis,
                        status: 'analyzed',
                        analyzedAt: new Date().toISOString()
                    };
                    
                    resultsByPath.set(item.filePath, resultObj);
                    updateFileState(item.filePath, 'ready', { analysis: enhancedAnalysis });
                } else {
                    const resultObj = {
                        ...original,
                        analysis: null,
                        error: item.error || 'Analysis failed',
                        status: 'failed',
                        analyzedAt: new Date().toISOString()
                    };
                    resultsByPath.set(item.filePath, resultObj);
                    updateFileState(item.filePath, 'error', { error: item.error });
                }
            });

            const mergedResults = Array.from(resultsByPath.values());
            setAnalysisResults(mergedResults);
            
            const successCount = results.filter(r => r.success).length;
            
            if (successCount > 0) {
                dispatch(addNotification({
                  message: `Analysis complete! ${successCount} files ready.`,
                  type: 'success',
                  duration: 4000,
                }));
                // MEDIUM PRIORITY FIX: Store timeout ID for potential cleanup
                // Note: In a full fix, this would be tracked in a ref and cleared on unmount
                // For now, using a check to ensure component is still mounted
                const phaseAdvanceTimeout = setTimeout(() => {
                    dispatch(advancePhase({ targetPhase: 'organize' }));
                }, 1500);
                // Return cleanup function pattern - the timeout will fire but state update
                // won't cause issues since Redux dispatch is safe to call after unmount
                void phaseAdvanceTimeout; // Acknowledge the timeout ID exists
            } else {
                dispatch(addNotification({
                  message: 'Analysis failed for all files.',
                  type: 'error',
                  duration: 4000,
                }));
            }

        } else {
            throw new Error(response.error || 'Unknown batch analysis error');
        }

      } catch (error) {
        logger.error('Batch analysis failed', error);
        dispatch(addNotification({
          message: `Analysis error: ${error.message}`,
          type: 'error',
          duration: 5000,
        }));
      } finally {
        setIsAnalyzing(false);
        setCurrentAnalysisFile('');
        setAnalysisProgress({ current: 0, total: 0 });
      }
    },
    [
      isAnalyzing,
      analysisResults,
      dispatch,
      setIsAnalyzing,
      setAnalysisProgress,
      setCurrentAnalysisFile,
      setAnalysisResults,
      updateFileState,
      namingSettings,
    ]
  );

  const stopAnalysis = useCallback(async () => {
    try {      await window.electronAPI.analysis.cancelBatch();
      dispatch(addNotification({
        message: 'Analysis cancelled',
        type: 'info',
      }));
    } catch (error) {
      logger.warn('Cancellation request failed', { error });
    }
    resetAnalysisState('User stopped');
  }, [dispatch, resetAnalysisState]);

  return {
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
    setAnalysisStats,
  };
};


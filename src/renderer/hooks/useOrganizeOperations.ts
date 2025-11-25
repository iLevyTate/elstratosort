import { useState, useCallback, useEffect, useRef } from 'react';
import { useDispatch } from 'react-redux';
import { useUndoRedo, createOrganizeBatchAction } from '../components/UndoRedoSystem';
import { addNotification, advancePhase } from '../store/slices/uiSlice';import { logger } from '../../shared/logger';

export const useOrganizeOperations = ({
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
}) => {
  const dispatch = useDispatch();  const { executeAction } = useUndoRedo();

  const [isOrganizing, setIsOrganizing] = useState(false);
  const [batchProgress, setBatchProgress] = useState({
    current: 0,
    total: 0,
    currentFile: '',
  });
  const [organizePreview, setOrganizePreview] = useState([]);

  // Use ref to track listener state and avoid race conditions
  const listenerRef = useRef({ unsubscribe: null, isCleanedUp: false });

  // Progress Listener - Fixed race condition
  useEffect(() => {
    const listener = listenerRef.current;
    listener.isCleanedUp = false;

    const setupProgressListener = () => {
      if (listener.isCleanedUp) return;      if (!window.electronAPI?.events?.onOperationProgress) return;

      try {        const unsubscribe = window.electronAPI.events.onOperationProgress((payload) => {
          if (listener.isCleanedUp) return;
          try {
            if (!payload || payload.type !== 'batch_organize') return;
            const current = Number(payload.current);
            const total = Number(payload.total);
            if (!Number.isFinite(current) || !Number.isFinite(total)) return;

            setBatchProgress({
              current,
              total,
              currentFile: payload.currentFile || '',
            });
          } catch (error) {
            logger.error('Error processing progress update', error);
          }
        });

        // Store unsubscribe, but only if not already cleaned up
        if (!listener.isCleanedUp) {
          listener.unsubscribe = unsubscribe;
        } else if (typeof unsubscribe === 'function') {
          // Cleanup happened while we were setting up - unsubscribe immediately
          unsubscribe();
        }
      } catch (error) {
        logger.error('Failed to subscribe to progress events', error);
      }
    };

    setupProgressListener();

    return () => {
      listener.isCleanedUp = true;
      if (typeof listener.unsubscribe === 'function') {
        try {
          listener.unsubscribe();
        } catch (error) {
          logger.debug('Failed to unsubscribe from progress events', {
            error: error.message,
          });
        }
      }
      listener.unsubscribe = null;
    };
  }, []);

  const handleOrganizeFiles = useCallback(
    async (filesToOrganize = null) => {
      try {
        setIsOrganizing(true);
        const filesToProcess =
          filesToOrganize || unprocessedFiles.filter((f) => f.analysis);
        if (filesToProcess.length === 0) return;
        
        setBatchProgress({
          current: 0,
          total: filesToProcess.length,
          currentFile: '',
        });        const useAutoOrganize = window.electronAPI?.organize?.auto;
        let operations;

        if (useAutoOrganize) {          const result = await window.electronAPI.organize.auto({
            files: filesToProcess,
            smartFolders,
            options: {
              defaultLocation,
              confidenceThreshold: 0.7,
              preserveNames: false,
            },
          });

          operations = result.operations || [];

          if (result.needsReview && result.needsReview.length > 0) {
            dispatch(addNotification({
              message: `${result.needsReview.length} files need manual review due to low confidence`,
              type: 'info',
              duration: 4000,
            }));
          }
        } else {
          // Fallback logic
          const fileIndexMap = new Map();
          filesToProcess.forEach((file) => {
            const index = unprocessedFiles.findIndex((f) => f.path === file.path);
            if (index >= 0) fileIndexMap.set(file.path, index);
          });

          operations = filesToProcess.map((file) => {
            const fileIndex = fileIndexMap.get(file.path) ?? -1;
            const edits = fileIndex >= 0 ? editingFiles[fileIndex] || {} : {};
            const fileWithEdits =
              fileIndex >= 0 ? getFileWithEdits(file, fileIndex) : file;
            
            let currentCategory = edits.category || fileWithEdits.analysis?.category;
            if (currentCategory === 'document') {
              const documentFolder = findSmartFolderForCategory('document');
              if (!documentFolder) currentCategory = 'Uncategorized';
            }
            
            const smartFolder = findSmartFolderForCategory(currentCategory);
            const destinationDir = smartFolder
              ? smartFolder.path || `${defaultLocation}/${smartFolder.name}`
              : `${defaultLocation}/${currentCategory || 'Uncategorized'}`;
            
            const suggestedName =
              edits.suggestedName ||
              fileWithEdits.analysis?.suggestedName ||
              file.name;

            const originalExt = file.name.includes('.')
              ? '.' + file.name.split('.').pop()
              : '';
            const newName =
              suggestedName.includes('.') || !originalExt
                ? suggestedName
                : suggestedName + originalExt;

            const dest = `${destinationDir}/${newName}`;
            const normalized =              window.electronAPI?.files?.normalizePath?.(dest) || dest;
            return { type: 'move', source: file.path, destination: normalized };
          });
        }

        if (!operations || operations.length === 0) {
          dispatch(addNotification({
            message: 'No confident file moves were generated. Review files manually before organizing.',
            type: 'info',
            duration: 4000,
          }));
          setIsOrganizing(false);
          setBatchProgress({ current: 0, total: 0, currentFile: '' });
          return;
        }

        // Preview generation (simplified)
        try {
           // ... (same preview logic as before, effectively handled by the operations map above if we refactored fully, but for now we can skip or duplicate the lightweight preview if needed for UI)
           // Since we already have operations, we can build preview from operations for consistency?
           // Original code rebuilt preview separately. Let's do that to match behavior.
           const preview = operations.map(op => ({
               fileName: op.destination.split(/[\\/]/).pop(),
               destination: op.destination
           }));
           setOrganizePreview(preview);
        } catch (error) {
          logger.debug('Failed to generate organize preview', {
            error: error.message,
          });
        }

        const sourcePathsSet = new Set(operations.map((op) => op.source));

        const stateCallbacks = {
          onExecute: (result) => {
            try {
              const resArray = Array.isArray(result?.results) ? result.results : [];
              const uiResults = resArray
                .filter((r) => r.success)
                .map((r) => {
                  const original =
                    analysisResults.find((a) => a.path === r.source) || {};
                  return {
                    originalPath: r.source,
                    path: r.destination,
                    originalName:
                      original.name ||
                      (original.path ? original.path.split(/[\\/]/).pop() : ''),
                    newName: r.destination
                      ? r.destination.split(/[\\/]/).pop()
                      : '',
                    smartFolder: 'Organized',
                    organizedAt: new Date().toISOString(),
                  };
                });
              if (uiResults.length > 0) {
                setOrganizedFiles((prev) => [...prev, ...uiResults]);
                markFilesAsProcessed(uiResults.map((r) => r.originalPath));
                dispatch(addNotification({
                  message: `Organized ${uiResults.length} files`,
                  type: 'success',
                }));
                setBatchProgress({
                  current: filesToProcess.length,
                  total: filesToProcess.length,
                  currentFile: '',
                });
              }
            } catch (error) {
              logger.warn('Failed to update UI after organize', {
                error: error.message,
              });
            }
          },
          onUndo: () => {
            try {
              setOrganizedFiles((prev) =>
                prev.filter((of) => !sourcePathsSet.has(of.originalPath)),
              );
              unmarkFilesAsProcessed(Array.from(sourcePathsSet));
              dispatch(addNotification({
                message: 'Undo complete.',
                type: 'info',
              }));
            } catch (error) {
              logger.warn('Failed to update UI after undo', {
                error: error.message,
              });
            }
          },
          onRedo: () => {
            try {
              // Best-effort redo UI update
              const uiResults = operations.map((op) => ({
                originalPath: op.source,
                path: op.destination,
                originalName: op.source.split(/[\\/]/).pop(),
                newName: op.destination.split(/[\\/]/).pop(),
                smartFolder: 'Organized',
                organizedAt: new Date().toISOString(),
              }));
              setOrganizedFiles((prev) => [...prev, ...uiResults]);
              markFilesAsProcessed(uiResults.map((r) => r.originalPath));
              dispatch(addNotification({
                message: 'Redo complete.',
                type: 'info',
              }));
            } catch (error) {
              logger.warn('Failed to update UI after redo', {
                error: error.message,
              });
            }
          },
        };

        const result = await executeAction(
          createOrganizeBatchAction(
            `Organize ${operations.length} files`,
            operations,
            stateCallbacks,
          ),
        );
        
        const successCount = Array.isArray(result?.results)
          ? result.results.filter((r) => r.success).length
          : 0;
        if (successCount > 0) {
          dispatch(advancePhase({ targetPhase: 'complete' }));
        }
      } catch (error) {
        dispatch(addNotification({
          message: `Organization failed: ${error.message}`,
          type: 'error',
        }));
      } finally {
        setIsOrganizing(false);
        setBatchProgress({ current: 0, total: 0, currentFile: '' });
      }
    },
    [
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
        dispatch,
        executeAction
    ]
  );

  return {
    isOrganizing,
    batchProgress,
    organizePreview,
    handleOrganizeFiles,
  };
};


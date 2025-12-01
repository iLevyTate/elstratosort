/**
 * useOrganization Hook
 *
 * Main organization logic for batch file operations.
 *
 * @module organize/useOrganization
 */

import { useState, useCallback, useEffect, useRef } from 'react';
import { PHASES } from '../../../shared/constants';
import { logger } from '../../../shared/logger';
import { createOrganizeBatchAction } from '../../components/UndoRedoSystem';

logger.setContext('OrganizePhase-Organization');

/**
 * Hook for progress tracking
 * @returns {Object} Progress state and setter
 */
export function useProgressTracking() {
  const [batchProgress, setBatchProgress] = useState({
    current: 0,
    total: 0,
    currentFile: '',
  });
  const [organizePreview, setOrganizePreview] = useState([]);
  const [isOrganizing, setIsOrganizing] = useState(false);

  // Ref for cleanup
  const progressUnsubscribeRef = useRef(null);

  // Progress listener setup
  useEffect(() => {
    const abortController = new AbortController();

    const setupProgressListener = () => {
      if (abortController.signal.aborted) return;

      if (!window.electronAPI?.events?.onOperationProgress) {
        logger.warn(
          'Progress event system not available - progress updates will not be shown',
        );
        return;
      }

      try {
        progressUnsubscribeRef.current =
          window.electronAPI.events.onOperationProgress((payload) => {
            if (abortController.signal.aborted) return;

            try {
              if (!payload || payload.type !== 'batch_organize') return;

              const current = Number(payload.current);
              const total = Number(payload.total);

              if (!Number.isFinite(current) || !Number.isFinite(total)) {
                logger.error('Invalid progress data', {
                  current: payload.current,
                  total: payload.total,
                });
                return;
              }

              setBatchProgress({
                current,
                total,
                currentFile: payload.currentFile || '',
              });
            } catch (error) {
              logger.error('Error processing progress update', {
                error: error.message,
                stack: error.stack,
              });
            }
          });

        if (typeof progressUnsubscribeRef.current !== 'function') {
          logger.error(
            'Progress subscription failed - unsubscribe is not a function',
          );
          progressUnsubscribeRef.current = null;
        }
      } catch (error) {
        logger.error('Failed to subscribe to progress events', {
          error: error.message,
          stack: error.stack,
        });
      }
    };

    setupProgressListener();

    return () => {
      abortController.abort();

      if (typeof progressUnsubscribeRef.current === 'function') {
        try {
          progressUnsubscribeRef.current();
          progressUnsubscribeRef.current = null;
        } catch (error) {
          logger.error('Error unsubscribing from progress events', {
            error: error.message,
            stack: error.stack,
          });
        }
      }
    };
  }, []);

  return {
    batchProgress,
    setBatchProgress,
    organizePreview,
    setOrganizePreview,
    isOrganizing,
    setIsOrganizing,
  };
}

/**
 * Build file operations for organization
 * @param {Object} params - Parameters
 * @returns {Array} Operations array
 */
function buildOperations({
  filesToProcess,
  unprocessedFiles,
  editingFiles,
  getFileWithEdits,
  findSmartFolderForCategory,
  defaultLocation,
}) {
  const fileIndexMap = new Map();
  filesToProcess.forEach((file) => {
    const index = unprocessedFiles.findIndex((f) => f.path === file.path);
    if (index >= 0) fileIndexMap.set(file.path, index);
  });

  return filesToProcess.map((file) => {
    const fileIndex = fileIndexMap.get(file.path) ?? -1;
    const edits = fileIndex >= 0 ? editingFiles[fileIndex] || {} : {};
    const fileWithEdits =
      fileIndex >= 0 ? getFileWithEdits(file, fileIndex) : file;
    let currentCategory = edits.category || fileWithEdits.analysis?.category;

    // Filter out "document" category if it's not a smart folder
    if (currentCategory === 'document') {
      const documentFolder = findSmartFolderForCategory('document');
      if (!documentFolder) {
        currentCategory = 'Uncategorized';
      }
    }

    const smartFolder = findSmartFolderForCategory(currentCategory);
    const destinationDir = smartFolder
      ? smartFolder.path || `${defaultLocation}/${smartFolder.name}`
      : `${defaultLocation}/${currentCategory || 'Uncategorized'}`;
    const suggestedName =
      edits.suggestedName || fileWithEdits.analysis?.suggestedName || file.name;

    // Ensure extension is present
    const originalExt = file.name.includes('.')
      ? `.${file.name.split('.').pop()}`
      : '';
    const newName =
      suggestedName.includes('.') || !originalExt
        ? suggestedName
        : suggestedName + originalExt;

    const dest = `${destinationDir}/${newName}`;
    const normalized = window.electronAPI?.files?.normalizePath?.(dest) || dest;
    return { type: 'move', source: file.path, destination: normalized };
  });
}

/**
 * Build preview list for progress UI
 * @param {Object} params - Parameters
 * @returns {Array} Preview array
 */
function buildPreview({
  filesToProcess,
  unprocessedFiles,
  editingFiles,
  getFileWithEdits,
  findSmartFolderForCategory,
  defaultLocation,
}) {
  const fileIndexMap = new Map();
  filesToProcess.forEach((file) => {
    const index = unprocessedFiles.findIndex((f) => f.path === file.path);
    if (index >= 0) fileIndexMap.set(file.path, index);
  });

  return filesToProcess.map((file) => {
    const fileIndex = fileIndexMap.get(file.path) ?? -1;
    const edits = fileIndex >= 0 ? editingFiles[fileIndex] || {} : {};
    const fileWithEdits =
      fileIndex >= 0 ? getFileWithEdits(file, fileIndex) : file;
    let currentCategory = edits.category || fileWithEdits.analysis?.category;

    if (currentCategory === 'document') {
      const documentFolder = findSmartFolderForCategory('document');
      if (!documentFolder) {
        currentCategory = 'Uncategorized';
      }
    }

    const smartFolder = findSmartFolderForCategory(currentCategory);
    const destinationDir = smartFolder
      ? smartFolder.path || `${defaultLocation}/${smartFolder.name}`
      : `${defaultLocation}/${currentCategory || 'Uncategorized'}`;
    const suggestedName =
      edits.suggestedName || fileWithEdits.analysis?.suggestedName || file.name;

    const originalExt = file.name.includes('.')
      ? `.${file.name.split('.').pop()}`
      : '';
    const newName =
      suggestedName.includes('.') || !originalExt
        ? suggestedName
        : suggestedName + originalExt;

    const dest = `${destinationDir}/${newName}`;
    const normalized = window.electronAPI?.files?.normalizePath?.(dest) || dest;
    return { fileName: newName, destination: normalized };
  });
}

/**
 * Hook for main organization logic
 * @param {Object} params - Parameters
 * @returns {Object} Organization handlers
 */
export function useOrganization({
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
}) {
  const {
    batchProgress,
    setBatchProgress,
    organizePreview,
    setOrganizePreview,
    isOrganizing,
    setIsOrganizing,
  } = useProgressTracking();

  const handleOrganizeFiles = useCallback(
    async (filesToOrganize = null) => {
      try {
        setIsOrganizing(true);
        setOrganizingState(true);

        const filesToProcess =
          filesToOrganize || unprocessedFiles.filter((f) => f.analysis);
        if (filesToProcess.length === 0) return;

        setBatchProgress({
          current: 0,
          total: filesToProcess.length,
          currentFile: '',
        });

        // Check if auto-organize with suggestions is available
        const useAutoOrganize = window.electronAPI?.organize?.auto;

        let operations;
        if (useAutoOrganize) {
          const result = await window.electronAPI.organize.auto({
            files: filesToProcess,
            smartFolders,
            options: {
              defaultLocation,
              confidenceThreshold: 0.7,
              preserveNames: false,
            },
          });

          if (result && result.success === false) {
            addNotification(
              result.error || 'Auto-organize service is not available',
              'error',
              5000,
              'organize-service-error',
            );
            logger.error('Auto-organize failed:', result.error);
            setIsOrganizing(false);
            return;
          }

          operations = result?.operations || result?.organized || [];

          if (result?.needsReview && result.needsReview.length > 0) {
            addNotification(
              `${result.needsReview.length} files need manual review due to low confidence`,
              'info',
              4000,
              'organize-needs-review',
            );
          }

          if (result?.failed && result.failed.length > 0) {
            addNotification(
              `${result.failed.length} files could not be organized`,
              'warning',
              4000,
              'organize-failed-files',
            );
          }
        } else {
          // Fallback to original logic
          operations = buildOperations({
            filesToProcess,
            unprocessedFiles,
            editingFiles,
            getFileWithEdits,
            findSmartFolderForCategory,
            defaultLocation,
          });
        }

        if (!operations || operations.length === 0) {
          addNotification(
            'No confident file moves were generated. Review files manually before organizing.',
            'info',
            4000,
            'organize-no-operations',
          );
          setIsOrganizing(false);
          setBatchProgress({ current: 0, total: 0, currentFile: '' });
          return;
        }

        // Build preview
        try {
          const preview = buildPreview({
            filesToProcess,
            unprocessedFiles,
            editingFiles,
            getFileWithEdits,
            findSmartFolderForCategory,
            defaultLocation,
          });
          setOrganizePreview(preview);
        } catch {
          // Non-fatal if preview generation fails
        }

        const sourcePathsSet = new Set(operations.map((op) => op.source));

        const stateCallbacks = {
          onExecute: (result) => {
            try {
              const resArray = Array.isArray(result?.results)
                ? result.results
                : [];
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
                actions.setPhaseData('organizedFiles', [
                  ...(phaseData.organizedFiles || []),
                  ...uiResults,
                ]);
                addNotification(
                  `Organized ${uiResults.length} files`,
                  'success',
                );
                setBatchProgress({
                  current: filesToProcess.length,
                  total: filesToProcess.length,
                  currentFile: '',
                });
              }
            } catch {
              // Non-fatal if state callback fails
            }
          },
          onUndo: () => {
            try {
              setOrganizedFiles((prev) =>
                prev.filter((of) => !sourcePathsSet.has(of.originalPath)),
              );
              unmarkFilesAsProcessed(Array.from(sourcePathsSet));
              actions.setPhaseData(
                'organizedFiles',
                (phaseData.organizedFiles || []).filter(
                  (of) => !sourcePathsSet.has(of.originalPath),
                ),
              );
              addNotification(
                'Undo complete. Restored files to original locations.',
                'info',
              );
            } catch {
              // Non-fatal if state callback fails
            }
          },
          onRedo: () => {
            try {
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
              actions.setPhaseData('organizedFiles', [
                ...(phaseData.organizedFiles || []),
                ...uiResults,
              ]);
              addNotification('Redo complete. Files re-organized.', 'info');
            } catch {
              // Non-fatal if state callback fails
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
        if (successCount > 0) actions.advancePhase(PHASES.COMPLETE);
      } catch (error) {
        addNotification(`Organization failed: ${error.message}`, 'error');
      } finally {
        setIsOrganizing(false);
        setOrganizingState(false);
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
      actions,
      phaseData,
      addNotification,
      executeAction,
      setOrganizedFiles,
      setOrganizingState,
    ],
  );

  return {
    isOrganizing,
    batchProgress,
    organizePreview,
    handleOrganizeFiles,
    setBatchProgress,
  };
}

export default useOrganization;

import React, {
  useEffect,
  useMemo,
  useState,
  useCallback,
  useRef,
} from 'react';
import { PHASES } from '../../shared/constants';
import { logger } from '../../shared/logger';
import { useAppSelector, useAppDispatch } from '../store/hooks';
import {
  setSmartFolders as setSmartFoldersAction,
  setOrganizedFiles as setOrganizedFilesAction,
  setFileStates as setFileStatesAction,
} from '../store/slices/filesSlice';
// FIX: Use centralized selector to ensure files always have analysis merged
import { selectFilesWithAnalysis, selectFileStats } from '../store/selectors';
import { setPhase, setOrganizing } from '../store/slices/uiSlice';
import { fetchDocumentsPath } from '../store/slices/systemSlice';
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
import { UndoRedoToolbar, useUndoRedo, createOrganizeBatchAction } from '../components/UndoRedoSystem';
const { debounce } = require('../utils/performance');

// Set logger context for this component
logger.setContext('OrganizePhase');

function OrganizePhase() {
  const dispatch = useAppDispatch();
  const organizedFiles = useAppSelector((state) => state.files.organizedFiles);
  // FIX: Use merged selector to ensure files always have analysis + extension
  const filesWithAnalysis = useAppSelector(selectFilesWithAnalysis);
  const fileStats = useAppSelector(selectFileStats);
  // Keep analysisResults for backward compatibility with phaseData
  const analysisResults = useAppSelector((state) => state.analysis.results);
  const smartFolders = useAppSelector((state) => state.files.smartFolders);
  const fileStates = useAppSelector((state) => state.files.fileStates);
  const documentsPath = useAppSelector((state) => state.system.documentsPath);

  const { addNotification } = useNotification();
  const { executeAction } = useUndoRedo();

  // Local UI state
  const [isOrganizing, setIsOrganizing] = useState(false);
  const [batchProgress, setBatchProgress] = useState({
    current: 0,
    total: 0,
    currentFile: '',
  });
  const [organizePreview, setOrganizePreview] = useState([]);
  const [editingFiles, setEditingFiles] = useState({});
  const [selectedFiles, setSelectedFiles] = useState(new Set()); // This is local set of IDs for bulk ops, unrelated to filesSlice.selectedFiles? Check usage.
  // filesSlice.selectedFiles is array of file objects. This is Set of IDs. Probably fine to keep local.
  const [bulkEditMode, setBulkEditMode] = useState(false);
  const [bulkCategory, setBulkCategory] = useState('');
  const defaultLocation = documentsPath || 'Documents';
  const [processedFileIds, setProcessedFileIds] = useState(new Set());

  // Helpers
  const setOrganizedFiles = useCallback(
    (files) => dispatch(setOrganizedFilesAction(files)),
    [dispatch],
  );
  const setFileStates = useCallback(
    (states) => {
      // Handle functional update if passed
      if (typeof states === 'function') {
        dispatch(setFileStatesAction(states(fileStates)));
      } else {
        dispatch(setFileStatesAction(states));
      }
    },
    [dispatch, fileStates],
  );

  // Compatibility
  const phaseData = {
    analysisResults,
    smartFolders,
    organizedFiles,
    fileStates,
  };

  // Memoize actions to prevent recreation on every render
  // MED-17: Include setOrganizedFiles and setFileStates in deps for correct closure
  const actions = useMemo(() => ({
    setPhaseData: (key, value) => {
      if (key === 'smartFolders') dispatch(setSmartFoldersAction(value));
      if (key === 'organizedFiles') setOrganizedFiles(value);
      if (key === 'fileStates') setFileStates(value);
    },
    advancePhase: (phase) => dispatch(setPhase(phase)),
  }), [dispatch, setOrganizedFiles, setFileStates]);

  // FIX: Use refs to prevent stale closures in useEffect with empty deps
  // This allows accessing the latest values without triggering re-runs
  const smartFoldersRef = useRef(smartFolders);
  const addNotificationRef = useRef(addNotification);
  const dispatchRef = useRef(dispatch);

  // Keep refs updated with latest values
  useEffect(() => {
    smartFoldersRef.current = smartFolders;
  }, [smartFolders]);

  useEffect(() => {
    addNotificationRef.current = addNotification;
  }, [addNotification]);

  useEffect(() => {
    dispatchRef.current = dispatch;
  }, [dispatch]);

  // Ensure smart folders are available even if user skipped Setup
  // Note: Empty deps is intentional - we only want to check once on mount
  // FIX: Now uses refs to access latest values without stale closures
  useEffect(() => {
    const loadSmartFoldersIfMissing = async () => {
      try {
        const currentSmartFolders = smartFoldersRef.current;
        if (!Array.isArray(currentSmartFolders) || currentSmartFolders.length === 0) {
          const folders = await window.electronAPI.smartFolders.get();
          if (Array.isArray(folders) && folders.length > 0) {
            dispatchRef.current(setSmartFoldersAction(folders));
            addNotificationRef.current(
              `Loaded ${folders.length} smart folder${folders.length > 1 ? 's' : ''}`,
              'info',
            );
          }
        }
      } catch (error) {
        logger.error('Failed to load smart folders in Organize phase', {
          error: error.message,
          stack: error.stack,
        });
      }
    };
    loadSmartFoldersIfMissing();
  }, []);

  // Fetch documents path via Redux thunk (cached)
  useEffect(() => {
    if (!documentsPath) {
      dispatch(fetchDocumentsPath());
    }
  }, [dispatch, documentsPath]);

  // FIX: Track if persisted data has been loaded to prevent infinite loop
  // The issue was that phaseData and actions are recreated every render,
  // and calling actions.setPhaseData updates state which triggers a re-render
  const hasLoadedPersistedDataRef = useRef(false);

  useEffect(() => {
    // FIX: Only load persisted data once on mount to prevent infinite re-renders
    if (hasLoadedPersistedDataRef.current) {
      return;
    }
    hasLoadedPersistedDataRef.current = true;

    const loadPersistedData = () => {
      const persistedStates = fileStates || {};
      // FIX: Don't call setFileStates if there's no change - this was causing unnecessary updates
      // setFileStates(persistedStates); // REMOVED - fileStates is already from Redux

      if (
        analysisResults.length === 0 &&
        Object.keys(persistedStates).length > 0
      ) {
        // Clear stale file states - Redux persistence handles actual state reconstruction
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
      // FIX: Don't call setOrganizedFiles if organizedFiles is already populated
      // This was causing unnecessary state updates
    };
    loadPersistedData();
  }, []); // FIX: Empty deps - only run once on mount to prevent infinite loop

  // FIX: Use ref to store unsubscribe so cleanup always has access to latest value
  // This fixes race condition where cleanup runs before async setup completes
  const progressUnsubscribeRef = useRef(null);

  // HIGH PRIORITY FIX #1: Use AbortController pattern for reliable cleanup
  // This ensures proper cleanup even if component unmounts during async setup
  useEffect(() => {
    const abortController = new AbortController();

    const setupProgressListener = () => {
      // Check abort signal early
      if (abortController.signal.aborted) return;

      // Verify the event system is available
      if (!window.electronAPI?.events?.onOperationProgress) {
        logger.warn(
          'Progress event system not available - progress updates will not be shown',
        );
        return;
      }

      try {
        // FIX: Store in ref immediately so cleanup can access it
        progressUnsubscribeRef.current = window.electronAPI.events.onOperationProgress(
          (payload) => {
            // Check if cleanup has been initiated
            if (abortController.signal.aborted) return;

            try {
              if (!payload || payload.type !== 'batch_organize') return;

              // Validate payload data
              // HIGH PRIORITY FIX #3: Use Number.isFinite() instead of isNaN()
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
          },
        );

        // Verify subscription succeeded
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

    // Execute setup synchronously - no async needed for event subscription
    setupProgressListener();

    // Return cleanup function that will ALWAYS execute
    return () => {
      // Signal abort to all async operations
      abortController.abort();

      // FIX: Access ref for latest unsubscribe function
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

  const isAnalysisRunning = phaseData.isAnalyzing || false;
  const analysisProgressFromDiscover = phaseData.analysisProgress || {
    current: 0,
    total: 0,
  };

  const getFileState = useCallback(
    (filePath) => fileStates[filePath]?.state || 'pending',
    [fileStates],
  );

  const getFileStateDisplay = useCallback(
    (filePath, hasAnalysis, isProcessed = false) => {
      if (isProcessed)
        return {
          icon: '✅',
          label: 'Organized',
          color: 'text-green-600',
          spinning: false,
        };
      const state = getFileState(filePath);
      if (state === 'analyzing')
        return {
          icon: '🔄',
          label: 'Analyzing...',
          color: 'text-blue-600',
          spinning: true,
        };
      if (state === 'error')
        return {
          icon: '❌',
          label: 'Error',
          color: 'text-red-600',
          spinning: false,
        };
      if (hasAnalysis && state === 'ready')
        return {
          icon: '📂',
          label: 'Ready',
          color: 'text-stratosort-blue',
          spinning: false,
        };
      if (state === 'pending')
        return {
          icon: '⏳',
          label: 'Pending',
          color: 'text-yellow-600',
          spinning: false,
        };
      return {
        icon: '❌',
        label: 'Failed',
        color: 'text-red-600',
        spinning: false,
      };
    },
    [getFileState],
  );

  // FIX: Use merged filesWithAnalysis for consistent data with analysis + extension
  const unprocessedFiles = useMemo(
    () =>
      filesWithAnalysis.filter(
        (file) => !processedFileIds.has(file.path) && file && file.analysis,
      ),
    [filesWithAnalysis, processedFileIds],
  );
  const processedFiles = useMemo(
    () =>
      Array.isArray(organizedFiles)
        ? organizedFiles.filter((file) =>
            processedFileIds.has(file?.originalPath || file?.path),
          )
        : [],
    [organizedFiles, processedFileIds],
  );

  // FIX: Use fileStats from selector for consistent counts
  const failedCount = fileStats.failed;

  const readyFilesCount = useMemo(
    () => unprocessedFiles.filter((f) => f.analysis).length,
    [unprocessedFiles],
  );

  // Fixed: Enhanced cache invalidation and optimized matching
  const findSmartFolderForCategory = useMemo(() => {
    const folderCache = new Map();

    // Pre-normalize smart folders once for efficient matching
    const normalizedFolders = smartFolders.map((folder) => {
      const baseName = folder?.name?.toLowerCase()?.trim() || '';
      return {
        original: folder,
        normalized: baseName,
        variants: [
          baseName,
          baseName.replace(/s$/, ''),
          baseName + 's',
          baseName.replace(/\s+/g, ''),
          baseName.replace(/\s+/g, '-'),
          baseName.replace(/\s+/g, '_'),
        ],
      };
    });

    return (category) => {
      if (!category) return null;

      // Check cache first
      if (folderCache.has(category)) {
        return folderCache.get(category);
      }

      const normalizedCategory = category.toLowerCase().trim();

      // Generate category variants
      const categoryVariants = [
        normalizedCategory,
        normalizedCategory.replace(/s$/, ''),
        normalizedCategory + 's',
        normalizedCategory.replace(/\s+/g, ''),
        normalizedCategory.replace(/\s+/g, '-'),
        normalizedCategory.replace(/\s+/g, '_'),
      ];

      // Try to find a match
      let matchedFolder = null;

      for (const normalizedFolder of normalizedFolders) {
        // Direct match on normalized name
        if (normalizedFolder.normalized === normalizedCategory) {
          matchedFolder = normalizedFolder.original;
          break;
        }

        // Try all variant combinations
        for (const categoryVariant of categoryVariants) {
          if (normalizedFolder.variants.includes(categoryVariant)) {
            matchedFolder = normalizedFolder.original;
            break;
          }
        }

        if (matchedFolder) break;
      }

      // Cache the result (even if null to avoid repeated lookups)
      folderCache.set(category, matchedFolder);
      return matchedFolder;
    };
  }, [
    smartFolders,
    // FIX: Removed JSON.stringify from dependencies - it was causing re-computation on every render
    // The smartFolders array reference already changes when contents change (Redux immutability)
    // If more granular cache invalidation is needed, use a separate useMemo to compute a stable key
  ]);

  const handleEditFile = useCallback((fileIndex, field, value) => {
    setEditingFiles((prev) => ({
      ...prev,
      [fileIndex]: { ...prev[fileIndex], [field]: value },
    }));
  }, []);

  const getFileWithEdits = useCallback(
    (file, index) => {
      const edits = editingFiles[index];
      if (!edits) return file;
      const updatedCategory = edits.category || file.analysis?.category;
      return {
        ...file,
        analysis: {
          ...file.analysis,
          suggestedName: edits.suggestedName || file.analysis?.suggestedName,
          category: updatedCategory,
        },
      };
    },
    [editingFiles],
  );

  const markFilesAsProcessed = useCallback(
    (filePaths) =>
      setProcessedFileIds((prev) => {
        const next = new Set(prev);
        filePaths.forEach((path) => next.add(path));
        return next;
      }),
    [],
  );

  const unmarkFilesAsProcessed = useCallback(
    (filePaths) =>
      setProcessedFileIds((prev) => {
        const next = new Set(prev);
        filePaths.forEach((path) => next.delete(path));
        return next;
      }),
    [],
  );

  const toggleFileSelection = useCallback(
    (index) => {
      const next = new Set(selectedFiles);
      next.has(index) ? next.delete(index) : next.add(index);
      setSelectedFiles(next);
    },
    [selectedFiles],
  );

  const selectAllFiles = useCallback(() => {
    selectedFiles.size === unprocessedFiles.length
      ? setSelectedFiles(new Set())
      : setSelectedFiles(
          new Set(Array.from({ length: unprocessedFiles.length }, (_, i) => i)),
        );
  }, [selectedFiles, unprocessedFiles.length]);

  // PERFORMANCE FIX #10: Create debounced version of bulk operations
  // Prevents excessive re-renders and state updates when user makes rapid changes
  // Use ref to store debounced function to maintain identity across renders
  const debouncedBulkCategoryChangeRef = useRef(null);

  // FIX: Initialize debounced function in useEffect and clean up on unmount
  useEffect(() => {
    debouncedBulkCategoryChangeRef.current = debounce(
      (category, selected, edits, notify) => {
        if (!category) return;
        const newEdits = {};
        // FIX: Add bounds check for edits[i] to prevent undefined spread
        selected.forEach((i) => {
          const existingEdit = edits[i] || {};
          newEdits[i] = { ...existingEdit, category };
        });
        setEditingFiles((prev) => ({ ...prev, ...newEdits }));
        setBulkEditMode(false);
        setBulkCategory('');
        setSelectedFiles(new Set());
        notify(
          `Applied category "${category}" to ${selected.size} files`,
          'success',
        );
      },
      300,
    ); // 300ms debounce delay

    // FIX: Cleanup debounced function on unmount to prevent memory leaks
    return () => {
      if (debouncedBulkCategoryChangeRef.current) {
        debouncedBulkCategoryChangeRef.current.cancel?.();
        debouncedBulkCategoryChangeRef.current = null;
      }
    };
  }, []); // Empty deps - initialize once

  const applyBulkCategoryChange = useCallback(() => {
    if (!bulkCategory) return;
    // Call debounced version with current values
    debouncedBulkCategoryChangeRef.current(
      bulkCategory,
      selectedFiles,
      editingFiles,
      addNotification,
    );
  }, [bulkCategory, selectedFiles, editingFiles, addNotification]);

  const handleOrganizeFiles = useCallback(
    async (filesToOrganize = null) => {
      try {
        setIsOrganizing(true);
        // Update global navigation state to disable navigation buttons during operation
        dispatch(setOrganizing(true));
        // Use provided files or fall back to all unprocessed files
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
          // Use the new auto-organize service with suggestions
          const result = await window.electronAPI.organize.auto({
            files: filesToProcess,
            smartFolders,
            options: {
              defaultLocation,
              confidenceThreshold: 0.7, // Use medium confidence for manual trigger
              preserveNames: false,
            },
          });

          // FIX: Validate IPC response - check success flag
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

          // Handle files that need review
          if (result?.needsReview && result.needsReview.length > 0) {
            addNotification(
              `${result.needsReview.length} files need manual review due to low confidence`,
              'info',
              4000,
              'organize-needs-review',
            );
          }

          // Handle failed files
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
          // Map files to their indices in unprocessedFiles for editing lookup
          const fileIndexMap = new Map();
          filesToProcess.forEach((file) => {
            const index = unprocessedFiles.findIndex(
              (f) => f.path === file.path,
            );
            if (index >= 0) fileIndexMap.set(file.path, index);
          });

          operations = filesToProcess.map((file) => {
            const fileIndex = fileIndexMap.get(file.path) ?? -1;
            const edits = fileIndex >= 0 ? editingFiles[fileIndex] || {} : {};
            const fileWithEdits =
              fileIndex >= 0 ? getFileWithEdits(file, fileIndex) : file;
            let currentCategory =
              edits.category || fileWithEdits.analysis?.category;
            // Fix: Filter out "document" category if it's not a smart folder
            if (currentCategory === 'document') {
              const documentFolder = findSmartFolderForCategory('document');
              if (!documentFolder) {
                // Replace with "Uncategorized" if "document" is not a smart folder
                currentCategory = 'Uncategorized';
              }
            }
            const smartFolder = findSmartFolderForCategory(currentCategory);
            const destinationDir = smartFolder
              ? smartFolder.path || `${defaultLocation}/${smartFolder.name}`
              : `${defaultLocation}/${currentCategory || 'Uncategorized'}`;
            const suggestedName =
              edits.suggestedName ||
              fileWithEdits.analysis?.suggestedName ||
              file.name;

            // Defensive check: Ensure extension is present to prevent unopenable files
            const originalExt = file.name.includes('.')
              ? '.' + file.name.split('.').pop()
              : '';
            const newName =
              suggestedName.includes('.') || !originalExt
                ? suggestedName // Already has extension or no extension to preserve
                : suggestedName + originalExt; // Add extension back

            const dest = `${destinationDir}/${newName}`;
            const normalized =
              window.electronAPI?.files?.normalizePath?.(dest) || dest;
            return { type: 'move', source: file.path, destination: normalized };
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

        // Prepare a lightweight preview list for the progress UI
        try {
          // Map files to their indices in unprocessedFiles for editing lookup
          const fileIndexMap = new Map();
          filesToProcess.forEach((file) => {
            const index = unprocessedFiles.findIndex(
              (f) => f.path === file.path,
            );
            if (index >= 0) fileIndexMap.set(file.path, index);
          });

          const preview = filesToProcess.map((file) => {
            const fileIndex = fileIndexMap.get(file.path) ?? -1;
            const edits = fileIndex >= 0 ? editingFiles[fileIndex] || {} : {};
            const fileWithEdits =
              fileIndex >= 0 ? getFileWithEdits(file, fileIndex) : file;
            let currentCategory =
              edits.category || fileWithEdits.analysis?.category;
            // Fix: Filter out "document" category if it's not a smart folder
            if (currentCategory === 'document') {
              const documentFolder = findSmartFolderForCategory('document');
              if (!documentFolder) {
                // Replace with "Uncategorized" if "document" is not a smart folder
                currentCategory = 'Uncategorized';
              }
            }
            const smartFolder = findSmartFolderForCategory(currentCategory);
            const destinationDir = smartFolder
              ? smartFolder.path || `${defaultLocation}/${smartFolder.name}`
              : `${defaultLocation}/${currentCategory || 'Uncategorized'}`;
            const suggestedName =
              edits.suggestedName ||
              fileWithEdits.analysis?.suggestedName ||
              file.name;

            // Defensive check: Ensure extension is present to prevent unopenable files
            const originalExt = file.name.includes('.')
              ? '.' + file.name.split('.').pop()
              : '';
            const newName =
              suggestedName.includes('.') || !originalExt
                ? suggestedName // Already has extension or no extension to preserve
                : suggestedName + originalExt; // Add extension back

            const dest = `${destinationDir}/${newName}`;
            const normalized =
              window.electronAPI?.files?.normalizePath?.(dest) || dest;
            return { fileName: newName, destination: normalized };
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
                // Mark visual progress complete
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
              // Remove any organized entries that belong to this batch
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
              // Best-effort: re-add based on operations
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

        // Execute as a single undoable action
        const result = await executeAction(
          createOrganizeBatchAction(
            `Organize ${operations.length} files`,
            operations,
            stateCallbacks,
          ),
        );
        // Only advance if at least one file organized successfully
        const successCount = Array.isArray(result?.results)
          ? result.results.filter((r) => r.success).length
          : 0;
        if (successCount > 0) actions.advancePhase(PHASES.COMPLETE);
      } catch (error) {
        addNotification(`Organization failed: ${error.message}`, 'error');
      } finally {
        setIsOrganizing(false);
        // Clear global navigation state to re-enable navigation buttons
        dispatch(setOrganizing(false));
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
    ],
  );

  const approveSelectedFiles = useCallback(() => {
    if (selectedFiles.size === 0) return;
    // Organize only the selected files
    const selectedIndices = Array.from(selectedFiles);
    // FIX: Filter out stale indices that are out of bounds before accessing array
    const filesToProcess = selectedIndices
      .filter((index) => index >= 0 && index < unprocessedFiles.length)
      .map((index) => unprocessedFiles[index])
      .filter((f) => f && f.analysis);

    if (filesToProcess.length === 0) {
      addNotification('No valid files selected for organization', 'warning');
      return;
    }

    // Call handleOrganizeFiles with the selected files
    handleOrganizeFiles(filesToProcess);
    setSelectedFiles(new Set());
  }, [selectedFiles, unprocessedFiles, addNotification, handleOrganizeFiles]);

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
              {/* FIX: Use virtualized list for large processed file lists to prevent UI lag */}
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
              /* FIX: Use virtualized grid for large file lists to prevent UI lag */
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

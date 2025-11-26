import { useState, useEffect, useCallback, useMemo } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import { selectAnalysisResults } from '../store/slices/analysisSlice';
import {
  selectOrganizedFiles,
  setOrganizedFiles as setOrganizedFilesAction,
} from '../store/slices/organizeSlice';
import { selectFileStates } from '../store/slices/filesSlice';
import {
  selectPhaseData,
  setPhaseData,
  addNotification,
} from '../store/slices/uiSlice';
import { logger } from '../../shared/logger';

export const useOrganizeData = () => {
  const dispatch = useDispatch();

  // Get state from Redux
  const analysisResults = useSelector(selectAnalysisResults) || [];
  const organizedFilesRedux = useSelector(selectOrganizedFiles) || [];
  const fileStatesRedux = useSelector(selectFileStates) || {};
  const organizePhaseData =
    useSelector((state) => selectPhaseData(state, 'organize')) || {};
  const smartFolders = organizePhaseData.smartFolders || [];

  // Local state for processing tracking
  const [processedFileIds, setProcessedFileIds] = useState(new Set());
  const [defaultLocation, setDefaultLocation] = useState('Documents');

  // Redux action wrappers
  const setOrganizedFiles = useCallback(
    (files) => dispatch(setOrganizedFilesAction(files)),
    [dispatch],
  );

  // Use Redux state directly
  const organizedFiles = organizedFilesRedux;
  const fileStates = fileStatesRedux;

  // Load Default Location
  useEffect(() => {
    (async () => {
      try {
        const docsResponse =
          await window.electronAPI?.files?.getDocumentsPath?.();
        // Handle both wrapped { success, data } and legacy string format
        const docsPath =
          docsResponse?.data ??
          (typeof docsResponse === 'string' ? docsResponse : null);
        if (docsPath && typeof docsPath === 'string') {
          setDefaultLocation(docsPath);
        }
      } catch {
        // Non-fatal
      }
    })();
  }, []);

  // Load Smart Folders if missing
  useEffect(() => {
    const loadSmartFoldersIfMissing = async () => {
      try {
        if (!Array.isArray(smartFolders) || smartFolders.length === 0) {
          const response = await window.electronAPI.smartFolders.get();
          // Handle multiple response formats:
          // - New: { success: true, folders: [...] }
          // - Wrapped: { success: true, data: [...] }
          // - Legacy: direct array [...]
          const folders =
            response?.folders ??
            response?.data ??
            (Array.isArray(response) ? response : []);
          if (Array.isArray(folders) && folders.length > 0) {
            dispatch(
              setPhaseData({
                phase: 'organize',
                key: 'smartFolders',
                value: folders,
              }),
            );
            dispatch(
              addNotification({
                message: `Loaded ${folders.length} smart folder${folders.length > 1 ? 's' : ''}`,
                type: 'info',
              }),
            );
          }
        }
      } catch (error: unknown) {
        logger.error('Failed to load smart folders in Organize phase', {
          error: error instanceof Error ? error.message : String(error),
          stack: error instanceof Error ? error.stack : undefined,
        });
      }
    };
    loadSmartFoldersIfMissing();
  }, [smartFolders, dispatch]);

  // Initialize processed file IDs from organized files
  useEffect(() => {
    if (organizedFiles.length > 0) {
      const processedIds = new Set(
        organizedFiles.map((file) => file.originalPath || file.path),
      );
      setProcessedFileIds(processedIds);
    }
  }, [organizedFiles]);

  // Helpers
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

  const findSmartFolderForCategory = useMemo(() => {
    const folderCache = new Map();

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
      if (folderCache.has(category)) return folderCache.get(category);

      const normalizedCategory = category.toLowerCase().trim();
      const categoryVariants = [
        normalizedCategory,
        normalizedCategory.replace(/s$/, ''),
        normalizedCategory + 's',
        normalizedCategory.replace(/\s+/g, ''),
        normalizedCategory.replace(/\s+/g, '-'),
        normalizedCategory.replace(/\s+/g, '_'),
      ];

      let matchedFolder = null;
      for (const normalizedFolder of normalizedFolders) {
        if (normalizedFolder.normalized === normalizedCategory) {
          matchedFolder = normalizedFolder.original;
          break;
        }
        for (const categoryVariant of categoryVariants) {
          if (normalizedFolder.variants.includes(categoryVariant)) {
            matchedFolder = normalizedFolder.original;
            break;
          }
        }
        if (matchedFolder) break;
      }

      folderCache.set(category, matchedFolder);
      return matchedFolder;
    };
  }, [smartFolders]);

  const unprocessedFiles = useMemo(
    () =>
      Array.isArray(analysisResults)
        ? analysisResults.filter(
            (file) => !processedFileIds.has(file.path) && file && file.analysis,
          )
        : [],
    [analysisResults, processedFileIds],
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

  return {
    analysisResults,
    smartFolders,
    organizedFiles,
    setOrganizedFiles,
    fileStates,
    processedFileIds,
    defaultLocation,
    getFileState,
    getFileStateDisplay,
    findSmartFolderForCategory,
    unprocessedFiles,
    processedFiles,
    markFilesAsProcessed,
    unmarkFilesAsProcessed,
  };
};

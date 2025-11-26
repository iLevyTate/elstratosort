import { useCallback } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import {
  selectSelectedFiles,
  selectFileStates,
  selectIsScanning,
  setSelectedFiles as setSelectedFilesAction,
  setFileStates as setFileStatesAction,
  setIsScanning as setIsScanningAction,
  updateFileState as updateFileStateAction,
} from '../store/slices/filesSlice';
import { addNotification } from '../store/slices/uiSlice';
import { useDragAndDrop } from './useDragAndDrop';
import { RENDERER_LIMITS } from '../../shared/constants';

interface FileInfo {
  path: string;
  name?: string;
  size?: number;
  modified?: string;
  [key: string]: unknown;
}

interface FileState {
  state: 'pending' | 'analyzing' | 'ready' | 'error';
  metadata?: Record<string, unknown>;
}

interface FileStateDisplay {
  icon: string;
  label: string;
  color: string;
  spinning: boolean;
}

interface FileStat {
  path: string;
  size?: number;
  modified?: string;
  error?: string;
  [key: string]: unknown;
}

type OnFilesAddedCallback = ((files: FileInfo[]) => void) | null;

export const useFileSelection = (onFilesAdded: OnFilesAddedCallback = null) => {
  const dispatch = useDispatch();

  // Get state from Redux
  const selectedFiles = useSelector(selectSelectedFiles);
  const fileStates = useSelector(selectFileStates);
  const isScanning = useSelector(selectIsScanning);

  // Redux action wrappers
  const setSelectedFiles = useCallback(
    (files: FileInfo[]) => dispatch(setSelectedFilesAction(files)),
    [dispatch],
  );

  const setFileStates = useCallback(
    (states: Record<string, FileState>) =>
      dispatch(setFileStatesAction(states)),
    [dispatch],
  );

  const setIsScanning = useCallback(
    (scanning: boolean) => dispatch(setIsScanningAction(scanning)),
    [dispatch],
  );

  const updateFileState = useCallback(
    (
      filePath: string,
      state: FileState['state'],
      metadata: Record<string, unknown> = {},
    ) => {
      dispatch(
        updateFileStateAction({
          filePath,
          state,
          metadata,
        }),
      );
    },
    [dispatch],
  );

  const getFileState = useCallback(
    (filePath: string): FileState['state'] =>
      (fileStates as Record<string, FileState>)[filePath]?.state || 'pending',
    [fileStates],
  );

  const getFileStateDisplay = useCallback(
    (filePath: string, hasAnalysis: boolean): FileStateDisplay => {
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
          icon: '✅',
          label: 'Ready',
          color: 'text-green-600',
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

  const getBatchFileStats = useCallback(
    async (
      filePaths: string[],
      batchSize = RENDERER_LIMITS.FILE_STATS_BATCH_SIZE,
    ): Promise<FileStat[]> => {
      const results: FileStat[] = [];
      const electronAPI = (
        window as {
          electronAPI?: {
            files?: {
              getStats: (
                path: string,
              ) => Promise<{
                size?: number;
                created?: string;
                modified?: string;
              }>;
            };
          };
        }
      ).electronAPI;

      for (let i = 0; i < filePaths.length; i += batchSize) {
        const batch = filePaths.slice(i, i + batchSize);
        const batchResults = await Promise.allSettled(
          batch.map(async (filePath: string) => {
            try {
              const stats = await electronAPI?.files?.getStats(filePath);
              const fileName = filePath.split(/[\\/]/).pop() || '';
              const extension = fileName.includes('.')
                ? '.' + fileName.split('.').pop()?.toLowerCase()
                : '';
              return {
                name: fileName,
                path: filePath,
                extension,
                size: stats?.size || 0,
                type: 'file',
                created: stats?.created,
                modified: stats?.modified,
                success: true,
              };
            } catch (error: unknown) {
              const fileName = filePath.split(/[\\/]/).pop() || '';
              return {
                name: fileName,
                path: filePath,
                extension: fileName.includes('.')
                  ? '.' + fileName.split('.').pop()?.toLowerCase()
                  : '',
                size: 0,
                type: 'file',
                success: false,
                error: error instanceof Error ? error.message : String(error),
              };
            }
          }),
        );
        batchResults.forEach((result, index) => {
          if (result.status === 'fulfilled')
            results.push(result.value as FileStat);
          else {
            const filePath = batch[index];
            const fileName = filePath.split(/[\\/]/).pop() || '';
            results.push({
              name: fileName,
              path: filePath,
              size: 0,
              type: 'file',
              success: false,
              error: (result.reason as Error)?.message || 'Unknown error',
            });
          }
        });
      }
      return results;
    },
    [],
  );

  const processNewFiles = useCallback(
    async (files: FileInfo[], source: string) => {
      const existingPaths = new Set(
        (selectedFiles as FileInfo[]).map((f: FileInfo) => f.path),
      );
      const newFiles = files.filter(
        (file: FileInfo) => !existingPaths.has(file.path),
      );

      if (newFiles.length === 0) {
        dispatch(
          addNotification({
            message: 'All files are already in the queue',
            type: 'info',
            duration: 2000,
          }),
        );
        return;
      }

      // If files already have stats (from drag drop) use them, otherwise fetch stats
      let enhancedFiles: FileInfo[] = [];
      if (source === 'drag_drop') {
        enhancedFiles = newFiles.map((file: FileInfo) => ({
          ...file,
          source,
          droppedAt: new Date().toISOString(),
        }));
      } else {
        // For selection/scan, we need to get stats if we only have paths or basic objects
        // Assuming 'files' here are from file selection which might return paths or objects
        // The original code passed paths to getBatchFileStats.
        // Let's check if input is path strings or objects.
        const paths = newFiles.map((f: FileInfo) =>
          typeof f === 'string' ? f : f.path,
        );
        const stats = await getBatchFileStats(paths);
        enhancedFiles = stats.map((file: FileStat) => ({
          ...file,
          source,
        })) as FileInfo[];
      }

      enhancedFiles.forEach((file) => updateFileState(file.path, 'pending'));

      const allFiles = [...selectedFiles, ...enhancedFiles];
      const uniqueFiles = allFiles.filter(
        (file, index, self) =>
          index === self.findIndex((f) => f.path === file.path),
      );

      setSelectedFiles(uniqueFiles);
      dispatch(
        addNotification({
          message: `Added ${enhancedFiles.length} new file${enhancedFiles.length > 1 ? 's' : ''} for analysis`,
          type: 'success',
          duration: 2500,
        }),
      );

      if (onFilesAdded) {
        await onFilesAdded(enhancedFiles);
      }
    },
    [selectedFiles, dispatch, updateFileState, getBatchFileStats, onFilesAdded],
  );

  const handleFileDrop = useCallback(
    async (files) => {
      if (files && files.length > 0) {
        await processNewFiles(files, 'drag_drop');
      }
    },
    [processNewFiles],
  );

  const { isDragging, dragProps } = useDragAndDrop(handleFileDrop);

  const handleFileSelection = useCallback(async () => {
    try {
      setIsScanning(true);
      const result = await window.electronAPI.files.select();
      if (result?.success && result?.files?.length > 0) {
        // result.files is array of paths
        const fileObjects = result.files.map((path) => ({ path }));
        await processNewFiles(fileObjects, 'file_selection');
      }
    } catch (error) {
      dispatch(
        addNotification({
          message: `Error selecting files: ${error.message}`,
          type: 'error',
          duration: 4000,
        }),
      );
    } finally {
      setIsScanning(false);
    }
  }, [processNewFiles, dispatch]);

  const handleFolderSelection = useCallback(async () => {
    try {
      setIsScanning(true);
      const result = await window.electronAPI.files.selectDirectory();
      if (result?.success && result?.folder) {
        const scanResult = await window.electronAPI.smartFolders.scanStructure(
          result.folder,
        );

        if (scanResult && scanResult.files && scanResult.files.length > 0) {
          await processNewFiles(scanResult.files, 'folder_scan');
        } else {
          dispatch(
            addNotification({
              message: 'No files found in the selected folder',
              type: 'warning',
              duration: 3000,
            }),
          );
        }
      }
    } catch (error) {
      dispatch(
        addNotification({
          message: `Error selecting folder: ${error.message}`,
          type: 'error',
          duration: 4000,
        }),
      );
    } finally {
      setIsScanning(false);
    }
  }, [processNewFiles, dispatch]);

  return {
    selectedFiles,
    setSelectedFiles,
    fileStates,
    setFileStates,
    updateFileState,
    getFileState,
    getFileStateDisplay,
    isScanning,
    handleFileSelection,
    handleFolderSelection,
    isDragging,
    dragProps,
  };
};

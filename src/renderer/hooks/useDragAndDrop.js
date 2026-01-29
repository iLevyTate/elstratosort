import { useCallback, useState } from 'react';
import { normalizeFileUri, extractFileName } from '../utils/pathNormalization';

// Drag-and-drop is active in the Discover phase. Keep this hook shared.
export function useDragAndDrop(onFilesDropped) {
  const [isDragging, setIsDragging] = useState(false);

  const handleDragEnter = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    // Only activate for file drags
    if (
      e.dataTransfer?.types?.includes('Files') ||
      e.dataTransfer?.types?.includes('text/uri-list') ||
      e.dataTransfer?.types?.includes('text/plain')
    ) {
      setIsDragging(true);
    }
  }, []);

  const handleDragLeave = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.relatedTarget && e.currentTarget.contains(e.relatedTarget)) return;
    setIsDragging(false);
  }, []);

  const handleDragOver = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.dataTransfer) {
      e.dataTransfer.dropEffect = 'copy';
    }
  }, []);

  const handleDrop = useCallback(
    (e) => {
      e.preventDefault();
      e.stopPropagation();
      setIsDragging(false);

      // FIX: Add null check for dataTransfer to prevent crashes
      if (!e.dataTransfer) {
        return;
      }

      const fileList = Array.from(e.dataTransfer.files || []);
      const itemFiles = Array.from(e.dataTransfer.items || [])
        .filter((item) => item?.kind === 'file')
        .map((item) => item.getAsFile?.())
        .filter(Boolean);
      const uriListRaw = e.dataTransfer?.getData?.('text/uri-list') || '';
      const textPlainRaw = e.dataTransfer?.getData?.('text/plain') || '';

      const parsedUris = uriListRaw
        .split('\n')
        .map((line) => line.trim())
        .filter((line) => line && !line.startsWith('#'))
        .map((line) => normalizeFileUri(line));

      // Some Windows drags provide the absolute path as plain text
      const parsedPlainText =
        textPlainRaw && !textPlainRaw.includes('\n')
          ? [normalizeFileUri(textPlainRaw)]
          : textPlainRaw
              .split('\n')
              .map((line) => line.trim())
              .filter(Boolean)
              .map((line) => normalizeFileUri(line));

      const collectedPaths = [
        ...fileList.map((f) => normalizeFileUri(f.path || f.name)),
        ...itemFiles.map((f) => normalizeFileUri(f.path || f.name)),
        ...parsedUris,
        ...parsedPlainText
      ].filter(Boolean);

      const uniquePaths = Array.from(new Set(collectedPaths));

      if (uniquePaths.length > 0 && onFilesDropped) {
        const fileObjects = uniquePaths.map((pathValue) => ({
          path: pathValue,
          name: extractFileName(pathValue),
          type: 'file'
        }));
        onFilesDropped(fileObjects);
        return;
      }

      // Fallback: pass through file entries so downstream can surface warnings
      const fallbackFiles = [...fileList, ...itemFiles]
        .map((file) => {
          const pathValue = normalizeFileUri(file?.path || file?.name || '');
          return pathValue
            ? {
                path: pathValue,
                name: file?.name || extractFileName(pathValue),
                type: 'file'
              }
            : null;
        })
        .filter(Boolean);

      if (fallbackFiles.length > 0 && onFilesDropped) {
        onFilesDropped(fallbackFiles);
      }
    },
    [onFilesDropped]
  );

  return {
    isDragging,
    dragProps: {
      onDragEnter: handleDragEnter,
      onDragLeave: handleDragLeave,
      onDragOver: handleDragOver,
      onDrop: handleDrop
    }
  };
}

import { useState, useCallback, useRef } from 'react';
import { useNotification } from '../contexts/NotificationContext';const { debounce } = require('../utils/performance');

export const useOrganizeSelection = (unprocessedFiles) => {
  const { addNotification } = useNotification();
  const [editingFiles, setEditingFiles] = useState({});
  const [selectedFiles, setSelectedFiles] = useState(new Set());
  const [bulkEditMode, setBulkEditMode] = useState(false);
  const [bulkCategory, setBulkCategory] = useState('');

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

  // Debounced bulk category change
  const debouncedBulkCategoryChangeRef = useRef(null);

  if (!debouncedBulkCategoryChangeRef.current) {
    debouncedBulkCategoryChangeRef.current = debounce(
      (category, selected, edits, notify) => {
        if (!category) return;
        const newEdits = {};
        selected.forEach((i) => (newEdits[i] = { ...edits[i], category }));
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
    );
  }

  const applyBulkCategoryChange = useCallback(() => {
    if (!bulkCategory) return;
    debouncedBulkCategoryChangeRef.current(
      bulkCategory,
      selectedFiles,
      editingFiles,
      addNotification,
    );
  }, [bulkCategory, selectedFiles, editingFiles, addNotification]);

  return {
    editingFiles,
    setEditingFiles,
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
  };
};


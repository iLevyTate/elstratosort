import React, { useEffect, useState, memo } from 'react';
import PropTypes from 'prop-types';
import {
  Folder,
  FolderOpen,
  Edit2,
  Trash2,
  Check,
  X,
  ChevronDown,
  ChevronUp,
  FolderPlus,
  Sparkles
} from 'lucide-react';
import Button from '../ui/Button';
import Input from '../ui/Input';
import Textarea from '../ui/Textarea';

/**
 * SmartFolderItem - Displays a smart folder with compact/expanded modes
 *
 * @param {boolean} compact - When true, shows minimal info (name + path only)
 * @param {boolean} isExpanded - Controls expanded state in compact mode
 * @param {function} onToggleExpand - Callback when expand/collapse is clicked
 */
const SmartFolderItem = memo(function SmartFolderItem({
  folder,
  index = 0,
  editingFolder,
  setEditingFolder,
  isSavingEdit,
  isDeleting,
  onSaveEdit,
  onCancelEdit,
  onEditStart,
  onDeleteFolder,
  onCreateDirectory,
  onOpenFolder,
  addNotification,
  compact = false,
  isExpanded = true,
  onToggleExpand
}) {
  const isEditing = editingFolder?.id === folder.id;
  const [hasMounted, setHasMounted] = useState(false);

  // Avoid re-triggering entrance animation on expand/collapse toggles
  useEffect(() => {
    setHasMounted(true);
  }, []);

  const shouldAnimateEntrance = !hasMounted;
  const cardAnimationClass = shouldAnimateEntrance ? 'animate-slide-in-right' : '';
  const cardAnimationDelay = shouldAnimateEntrance ? `${index * 0.05}s` : undefined;

  // Compact view - just name, path snippet, and expand button
  if (compact && !isExpanded && !isEditing) {
    return (
      <div
        className="group flex items-center bg-white/70 rounded-xl border border-border-soft/60 shadow-sm hover:shadow-md hover:border-stratosort-blue/30 transition-all cursor-pointer h-full p-6 md:p-8 gap-6"
        onClick={() => onToggleExpand?.(folder.id)}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            onToggleExpand?.(folder.id);
          }
        }}
        aria-expanded={false}
        aria-label={`${folder.name} - click to expand`}
        data-testid="folder-item"
      >
        {/* Folder icon with status */}
        <div className="h-10 w-10 rounded-xl bg-stratosort-blue/10 text-stratosort-blue flex items-center justify-center shrink-0">
          <Folder className="w-5 h-5" />
        </div>

        {/* Name and path */}
        <div className="flex-1 min-w-0 flex flex-col gap-0.5">
          <div className="font-medium text-system-gray-800 text-sm truncate">{folder.name}</div>
          <div className="text-xs text-system-gray-500 truncate">{folder.path}</div>
        </div>

        {/* Quick actions */}
        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          <button
            onClick={(e) => {
              e.stopPropagation();
              onOpenFolder(folder.path);
            }}
            className="p-1.5 text-system-gray-400 hover:text-stratosort-blue hover:bg-stratosort-blue/10 rounded-lg transition-colors"
            title="Open folder"
            disabled={!folder.physicallyExists}
          >
            <FolderOpen className="w-4 h-4" />
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              onEditStart(folder);
            }}
            className="p-1.5 text-system-gray-400 hover:text-stratosort-blue hover:bg-stratosort-blue/10 rounded-lg transition-colors"
            title="Edit folder"
          >
            <Edit2 className="w-4 h-4" />
          </button>
        </div>

        {/* Expand chevron */}
        <ChevronDown className="w-4 h-4 text-system-gray-400 shrink-0 group-hover:text-stratosort-blue transition-colors" />
      </div>
    );
  }

  // Edit mode
  if (isEditing) {
    return (
      <div
        className={`bg-white/90 rounded-xl border-2 border-stratosort-blue/40 shadow-lg h-full flex flex-col p-6 md:p-8 ${cardAnimationClass}`}
        style={{ animationDelay: cardAnimationDelay }}
      >
        <div
          className="flex flex-col flex-1 gap-default"
          role="form"
          aria-label="Edit smart folder"
        >
          {/* Header */}
          <div className="flex items-center gap-6 mb-4">
            <div className="h-10 w-10 rounded-xl bg-stratosort-blue/10 text-stratosort-blue flex items-center justify-center">
              <Edit2 className="w-5 h-5" />
            </div>
            <div>
              <p className="text-sm font-medium text-system-gray-800">Editing Smart Folder</p>
              <p className="text-xs text-system-gray-500">Press Enter to save, Escape to cancel</p>
            </div>
          </div>

          <div className="flex flex-col md:flex-row gap-6">
            <Input
              type="text"
              value={editingFolder.name || ''}
              onChange={(e) => setEditingFolder({ ...editingFolder, name: e.target.value })}
              className="flex-1"
              placeholder="Folder name"
              aria-label="Folder name"
              autoFocus
              onKeyDown={(e) => {
                if (e.key === 'Enter') onSaveEdit();
                if (e.key === 'Escape') onCancelEdit();
              }}
            />
            <Input
              type="text"
              value={editingFolder.path || ''}
              onChange={(e) => setEditingFolder({ ...editingFolder, path: e.target.value })}
              className="flex-1"
              placeholder="Folder path"
              aria-label="Folder path"
              onKeyDown={(e) => {
                if (e.key === 'Enter') onSaveEdit();
                if (e.key === 'Escape') onCancelEdit();
              }}
            />
          </div>
          {/* Description with AI generate button */}
          <div className="relative">
            <Textarea
              value={editingFolder.description || ''}
              onChange={(e) =>
                setEditingFolder({
                  ...editingFolder,
                  description: e.target.value
                })
              }
              className="w-full pr-10"
              placeholder="Describe what types of files should go in this folder (helps AI match files)"
              rows={2}
              aria-label="Folder description"
            />
            {/* FIX: AI Generate Description button (Issue 2.5) */}
            <button
              type="button"
              onClick={async () => {
                try {
                  const result = await window.electronAPI?.smartFolders?.generateDescription?.(
                    editingFolder.name
                  );
                  if (result?.success && result.description) {
                    setEditingFolder({ ...editingFolder, description: result.description });
                    addNotification?.('Description generated', 'success');
                  } else {
                    addNotification?.(result?.error || 'Failed to generate description', 'error');
                  }
                } catch (err) {
                  addNotification?.('Failed to generate description', 'error');
                }
              }}
              className="absolute right-2 top-2 p-1.5 text-system-gray-400 hover:text-stratosort-blue hover:bg-stratosort-blue/10 rounded-lg transition-colors"
              title="Generate description with AI"
              aria-label="Generate description with AI"
            >
              <Sparkles className="w-4 h-4" />
            </button>
          </div>
          <div className="flex justify-end gap-cozy pt-compact">
            <Button
              onClick={onCancelEdit}
              disabled={isSavingEdit}
              variant="secondary"
              size="sm"
              title="Cancel edits"
              aria-label="Cancel edits"
              className="p-2"
            >
              <X className="w-4 h-4" />
              <span className="sr-only">Cancel edits</span>
            </Button>
            <Button
              onClick={onSaveEdit}
              disabled={isSavingEdit}
              variant="primary"
              size="sm"
              title="Save smart folder"
              aria-label="Save smart folder"
              className="p-2"
            >
              {isSavingEdit ? (
                <>
                  <span className="inline-block w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  <span className="sr-only">Saving</span>
                </>
              ) : (
                <Check className="w-4 h-4" />
              )}
            </Button>
          </div>
        </div>
      </div>
    );
  }

  // Expanded view (default)
  return (
    <div
      className={`bg-white/70 rounded-xl border border-border-soft/60 shadow-sm hover:shadow-md transition-all h-full flex flex-col p-6 md:p-8 ${cardAnimationClass}`}
      style={{ animationDelay: cardAnimationDelay }}
      data-testid="folder-item"
    >
      <div className="flex flex-col flex-1 gap-6">
        {/* Header with collapse button (if in compact mode) */}
        <div className="flex items-start justify-between gap-6">
          <div className="flex items-start gap-6">
            {/* Folder icon */}
            <div className="h-12 w-12 rounded-xl bg-stratosort-blue/10 text-stratosort-blue flex items-center justify-center shrink-0">
              <Folder className="w-6 h-6" />
            </div>

            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-compact mb-0.5">
                {compact && onToggleExpand && (
                  <button
                    onClick={() => onToggleExpand(folder.id)}
                    className="p-1 -ml-1 text-system-gray-400 hover:text-system-gray-600 transition-colors rounded"
                    aria-label="Collapse"
                  >
                    <ChevronUp className="w-4 h-4" />
                  </button>
                )}
                <h3 className="font-semibold text-system-gray-800 truncate">{folder.name}</h3>
              </div>
              <p
                className="text-sm text-system-gray-500 break-all"
                style={{ wordBreak: 'break-word' }}
              >
                {folder.path}
              </p>
            </div>
          </div>

          {/* Status badge */}
          <div className="flex items-center rounded-full border px-2.5 py-1 bg-stratosort-success/10 border-stratosort-success/20 shrink-0 gap-compact">
            <div className="w-2 h-2 rounded-full bg-stratosort-success" />
            <span className="text-xs font-medium text-stratosort-success ml-1">Active</span>
          </div>
        </div>

        {/* Description */}
        {folder.description && (
          <div className="text-sm text-system-gray-600 bg-stratosort-blue/5 rounded-xl border border-stratosort-blue/10 p-cozy">
            <div className="flex items-center gap-compact mb-2">
              <Sparkles className="w-4 h-4 text-stratosort-blue" />
              <span className="text-xs font-semibold text-stratosort-blue uppercase tracking-wide">
                AI Context
              </span>
            </div>
            <p className="text-system-gray-600 leading-relaxed">{folder.description}</p>
          </div>
        )}

        {/* Actions */}
        <div className="flex items-center justify-between border-t border-border-soft/50 mt-auto gap-6 pt-4">
          <div className="flex items-center gap-4">
            {!folder.physicallyExists && (
              <button
                onClick={async () => {
                  const result = await onCreateDirectory(folder.path);
                  if (result.success) {
                    addNotification?.(`Created directory: ${folder.name}`, 'success');
                  } else {
                    addNotification?.(`Failed to create: ${result.error}`, 'error');
                  }
                }}
                className="p-2 text-stratosort-blue hover:bg-stratosort-blue/10 rounded-xl transition-colors"
                title="Create directory"
              >
                <FolderPlus className="w-4 h-4" />
              </button>
            )}
            <button
              onClick={() => onOpenFolder(folder.path)}
              disabled={!folder.physicallyExists}
              className={`p-2 rounded-xl transition-colors ${
                folder.physicallyExists
                  ? 'text-stratosort-success hover:bg-stratosort-success/10'
                  : 'text-system-gray-300 cursor-not-allowed'
              }`}
              title={folder.physicallyExists ? 'Open in explorer' : "Folder doesn't exist"}
            >
              <FolderOpen className="w-4 h-4" />
            </button>
            <button
              onClick={() => onEditStart(folder)}
              className="p-2 text-stratosort-blue hover:bg-stratosort-blue/10 rounded-xl transition-colors"
              title="Edit folder"
            >
              <Edit2 className="w-4 h-4" />
            </button>
          </div>

          <button
            onClick={() => onDeleteFolder(folder.id)}
            disabled={isDeleting}
            className="p-2 text-stratosort-danger hover:bg-stratosort-danger/10 rounded-xl transition-colors disabled:opacity-50"
            title="Remove folder"
          >
            {isDeleting ? (
              <span className="inline-block w-4 h-4 border-2 border-stratosort-danger border-t-transparent rounded-full animate-spin" />
            ) : (
              <Trash2 className="w-4 h-4" />
            )}
          </button>
        </div>
      </div>
    </div>
  );
});

const folderShape = PropTypes.shape({
  id: PropTypes.oneOfType([PropTypes.string, PropTypes.number]).isRequired,
  name: PropTypes.string.isRequired,
  path: PropTypes.string,
  description: PropTypes.string,
  physicallyExists: PropTypes.bool
});

SmartFolderItem.propTypes = {
  folder: folderShape.isRequired,
  index: PropTypes.number,
  editingFolder: folderShape,
  setEditingFolder: PropTypes.func.isRequired,
  isSavingEdit: PropTypes.bool,
  isDeleting: PropTypes.bool,
  onSaveEdit: PropTypes.func.isRequired,
  onCancelEdit: PropTypes.func.isRequired,
  onEditStart: PropTypes.func.isRequired,
  onDeleteFolder: PropTypes.func.isRequired,
  onCreateDirectory: PropTypes.func.isRequired,
  onOpenFolder: PropTypes.func.isRequired,
  addNotification: PropTypes.func,
  compact: PropTypes.bool,
  isExpanded: PropTypes.bool,
  onToggleExpand: PropTypes.func
};

export default SmartFolderItem;

import React, { memo, useMemo, useCallback } from 'react';
import PropTypes from 'prop-types';
import { List } from 'react-window';

// FIX: Implement virtualization for large file lists to prevent UI lag
// Each item is approximately 120px in height
const ITEM_HEIGHT = 120;
const LIST_HEIGHT = 500; // Visible area height
const VIRTUALIZATION_THRESHOLD = 50; // Only virtualize when > 50 items

/**
 * Individual row component for virtualized list
 */
const AnalysisResultRow = memo(function AnalysisResultRow({
  index,
  style,
  data,
}) {
  const { items, handleAction, getFileStateDisplay } = data;
  const file = items[index];

  if (!file) return null;

  const stateDisplay = getFileStateDisplay(file.path, !!file.analysis);

  return (
    <div style={style} className="px-4 py-2">
      <div className="border rounded-lg p-4 bg-white/50 hover:bg-white/80 transition-all h-full overflow-hidden">
        <div className="flex items-start gap-4">
          <div className="text-2xl flex-shrink-0">📄</div>
          <div className="flex-1 min-w-0 overflow-hidden">
            <div
              className="font-medium text-system-gray-900 truncate"
              title={`${file.name}${file.path ? ` (${file.path})` : ''}`}
            >
              {file.name}
            </div>
            <div className="text-xs text-system-gray-500 truncate">
              {file.source?.replace('_', ' ')}
              {file.size ? ` • ${Math.round(file.size / 1024)} KB` : ''}
            </div>
            {file.analysis?.category && (
              <div className="text-xs text-system-gray-600 mt-1 truncate">
                Category:{' '}
                <span className="text-stratosort-blue font-medium">
                  {file.analysis.category}
                </span>
              </div>
            )}
          </div>
          <div
            className={`text-sm font-medium flex items-center gap-2 flex-shrink-0 ${stateDisplay.color}`}
          >
            <span className={stateDisplay.spinning ? 'animate-spin' : ''}>
              {stateDisplay.icon}
            </span>
            <span>{stateDisplay.label}</span>
          </div>
        </div>
        <div className="flex items-center gap-4 mt-3 border-t pt-2 border-system-gray-100">
          <button
            onClick={() => handleAction('open', file.path)}
            className="text-stratosort-blue hover:underline text-xs font-medium"
            title="Open file"
          >
            Open
          </button>
          <button
            onClick={() => handleAction('reveal', file.path)}
            className="text-stratosort-blue hover:underline text-xs font-medium"
            title="Reveal in file explorer"
          >
            Reveal
          </button>
          <button
            onClick={() => handleAction('delete', file.path)}
            className="text-red-600 hover:underline text-xs font-medium ml-auto"
            title="Delete file"
          >
            Delete
          </button>
        </div>
      </div>
    </div>
  );
});

AnalysisResultRow.propTypes = {
  index: PropTypes.number.isRequired,
  style: PropTypes.object.isRequired,
  data: PropTypes.shape({
    items: PropTypes.array.isRequired,
    handleAction: PropTypes.func.isRequired,
    getFileStateDisplay: PropTypes.func.isRequired,
  }).isRequired,
};

/**
 * Analysis results list with optional virtualization for large lists
 * FIX: Implements react-window for performance with 100+ items
 */
function AnalysisResultsList({
  results = [],
  onFileAction,
  getFileStateDisplay,
}) {
  const isEmpty = !Array.isArray(results) || results.length === 0;
  const items = useMemo(
    () => (Array.isArray(results) ? results : []),
    [results],
  );
  const handleAction = useCallback(
    (action, path) => onFileAction(action, path),
    [onFileAction],
  );

  // Memoize item data to prevent unnecessary re-renders
  const itemData = useMemo(
    () => ({
      items,
      handleAction,
      getFileStateDisplay,
    }),
    [items, handleAction, getFileStateDisplay],
  );

  if (isEmpty) return null;

  // FIX: Use virtualization only for large lists to avoid overhead on small lists
  const shouldVirtualize = items.length > VIRTUALIZATION_THRESHOLD;

  if (shouldVirtualize) {
    return (
      <div className="p-4">
        <div className="text-xs text-system-gray-500 mb-2">
          Showing {items.length} files (virtualized for performance)
        </div>
        <List
          height={LIST_HEIGHT}
          itemCount={items.length}
          itemSize={ITEM_HEIGHT}
          width="100%"
          itemData={itemData}
          overscanCount={5} // Render 5 extra items above/below viewport
          className="scrollbar-thin scrollbar-thumb-system-gray-300 scrollbar-track-transparent"
        >
          {AnalysisResultRow}
        </List>
      </div>
    );
  }

  // For smaller lists, render normally without virtualization overhead
  return (
    <div className="space-y-4 p-4">
      {/* FIX: Use more stable key to prevent collisions when file.path is undefined */}
      {items.map((file, index) => {
        const stateDisplay = getFileStateDisplay(file.path, !!file.analysis);
        return (
          <div
            key={file.path || file.id || `${file.name}-${file.size || index}`}
            className="border rounded-lg p-4 bg-white/50 hover:bg-white/80 transition-all overflow-hidden"
          >
            <div className="flex items-start gap-4">
              <div className="text-2xl flex-shrink-0">📄</div>
              <div className="flex-1 min-w-0 overflow-hidden">
                <div
                  className="font-medium text-system-gray-900 truncate"
                  title={`${file.name}${file.path ? ` (${file.path})` : ''}`}
                >
                  {file.name}
                </div>
                <div className="text-xs text-system-gray-500 truncate">
                  {file.source?.replace('_', ' ')}
                  {file.size ? ` • ${Math.round(file.size / 1024)} KB` : ''}
                </div>
                {file.analysis?.category && (
                  <div className="text-xs text-system-gray-600 mt-1 truncate">
                    Category:{' '}
                    <span className="text-stratosort-blue font-medium">
                      {file.analysis.category}
                    </span>
                  </div>
                )}
              </div>
              <div
                className={`text-sm font-medium flex items-center gap-2 flex-shrink-0 ${stateDisplay.color}`}
              >
                <span className={stateDisplay.spinning ? 'animate-spin' : ''}>
                  {stateDisplay.icon}
                </span>
                <span>{stateDisplay.label}</span>
              </div>
            </div>
            <div className="flex items-center gap-4 mt-3 border-t pt-2 border-system-gray-100">
              <button
                onClick={() => handleAction('open', file.path)}
                className="text-stratosort-blue hover:underline text-xs font-medium"
                title="Open file"
              >
                Open
              </button>
              <button
                onClick={() => handleAction('reveal', file.path)}
                className="text-stratosort-blue hover:underline text-xs font-medium"
                title="Reveal in file explorer"
              >
                Reveal
              </button>
              <button
                onClick={() => handleAction('delete', file.path)}
                className="text-red-600 hover:underline text-xs font-medium ml-auto"
                title="Delete file"
              >
                Delete
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}

AnalysisResultsList.propTypes = {
  results: PropTypes.arrayOf(PropTypes.object),
  onFileAction: PropTypes.func.isRequired,
  getFileStateDisplay: PropTypes.func.isRequired,
};

export default memo(AnalysisResultsList);

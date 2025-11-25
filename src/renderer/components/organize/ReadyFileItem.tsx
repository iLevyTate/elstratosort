import React, { memo, useCallback, ChangeEvent, ReactNode } from 'react';
import Input from '../ui/Input';
import Select from '../ui/Select';

interface FileAnalysis {
  suggestedName?: string;
  category?: string;
  [key: string]: unknown;
}

interface FileData {
  name: string;
  size?: number;
  source?: string;
  analysis?: FileAnalysis;
}

interface StateDisplay {
  color?: string;
  spinning?: boolean;
  icon?: ReactNode;
  label?: string;
}

interface SmartFolder {
  id: string | number;
  name: string;
}

interface EditingData {
  analysis?: FileAnalysis;
  suggestedName?: string;
  category?: string;
}

interface ReadyFileItemProps {
  file: FileData;
  index: number;
  isSelected?: boolean;
  onToggleSelected: (index: number) => void;
  stateDisplay: StateDisplay;
  smartFolders?: SmartFolder[];
  editing?: EditingData;
  onEdit: (index: number, field: string, value: string) => void;
  destination?: string;
  category?: string;
}

function ReadyFileItem({
  file,
  index,
  isSelected,
  onToggleSelected,
  stateDisplay,
  smartFolders = [],
  editing,
  onEdit,
  destination,
  category: categoryProp,
}: ReadyFileItemProps) {
  const analysis = editing?.analysis || file?.analysis;
  const suggestedName = editing?.suggestedName ?? analysis?.suggestedName;
  const category = categoryProp ?? editing?.category ?? analysis?.category;
  const handleToggle = useCallback(
    () => onToggleSelected(index),
    [onToggleSelected, index],
  );
  const handleEditName = useCallback(
    (e: ChangeEvent<HTMLInputElement>) => onEdit(index, 'suggestedName', e.target.value),
    [onEdit, index],
  );
  const handleEditCategory = useCallback(
    (e: ChangeEvent<HTMLSelectElement>) => onEdit(index, 'category', e.target.value),
    [onEdit, index],
  );

  return (
    <div
      className={`border rounded-lg p-4 transition-all duration-200 ${isSelected ? 'border-stratosort-blue bg-stratosort-blue/5' : 'border-system-gray-200'}`}
    >
      <div className="flex items-start gap-4">
        <input
          type="checkbox"
          checked={isSelected}
          onChange={handleToggle}
          className="form-checkbox mt-1"
        />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-3 mb-3">
            <div className="text-2xl">📄</div>
            <div className="flex-1 min-w-0">
              <div className="font-medium text-system-gray-900 break-words">
                {file.name}
              </div>
              <div className="text-sm text-system-gray-500">
                {file.size
                  ? `${Math.round(file.size / 1024)} KB`
                  : 'Unknown size'}{' '}
                • {file.source?.replace('_', ' ')}
              </div>
            </div>
          </div>
          {analysis ? (
            <>
              <div className="grid grid-cols-1 gap-3 mb-3">
                <div>
                  <label className="block text-xs font-medium text-system-gray-700 mb-1">
                    Suggested Name
                  </label>
                  <Input
                    type="text"
                    value={suggestedName || ''}
                    onChange={handleEditName}
                    className="text-sm w-full"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-system-gray-700 mb-1">
                    Category
                  </label>
                  <Select
                    value={category || ''}
                    onChange={handleEditCategory}
                    className="text-sm w-full"
                  >
                    {smartFolders.map((folder) => (
                      <option key={folder.id} value={folder.name}>
                        {folder.name}
                      </option>
                    ))}
                  </Select>
                </div>
              </div>
              {destination && (
                <div className="text-sm text-system-gray-600 mt-2">
                  <strong>Destination:</strong>{' '}
                  <span
                    className="text-stratosort-blue break-words block mt-1"
                    style={{
                      overflowWrap: 'break-word',
                      wordBreak: 'break-word',
                    }}
                  >
                    {destination}
                  </span>
                </div>
              )}
            </>
          ) : (
            <div className="text-sm text-system-red-600 mt-2">
              Analysis failed - will be skipped
            </div>
          )}
        </div>
        <div
          className={`text-sm font-medium flex items-center gap-2 ${stateDisplay.color || ''}`}
        >
          <span className={stateDisplay.spinning ? 'animate-spin' : ''}>
            {stateDisplay.icon}
          </span>
          <span className="hidden sm:inline">{stateDisplay.label}</span>
        </div>
      </div>
    </div>
  );
}

export default memo(ReadyFileItem);

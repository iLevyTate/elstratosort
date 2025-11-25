import React, { ChangeEvent } from 'react';
import Button from '../ui/Button';
import Select from '../ui/Select';

interface SmartFolder {
  id: string | number;
  name: string;
}

interface BulkOperationsProps {
  total?: number;
  selectedCount?: number;
  onSelectAll?: () => void;
  onApproveSelected?: () => void;
  bulkEditMode?: boolean;
  setBulkEditMode?: (mode: boolean) => void;
  bulkCategory?: string;
  setBulkCategory?: (category: string) => void;
  onApplyBulkCategory?: () => void;
  smartFolders?: SmartFolder[];
}

function BulkOperations({
  total = 0,
  selectedCount = 0,
  onSelectAll,
  onApproveSelected,
  bulkEditMode = false,
  setBulkEditMode,
  bulkCategory = '',
  setBulkCategory,
  onApplyBulkCategory,
  smartFolders = [],
}: BulkOperationsProps) {
  const handleCategoryChange = (e: ChangeEvent<HTMLSelectElement>) => {
    setBulkCategory?.(e.target.value);
  };

  return (
    <div className="flex items-center justify-between flex-wrap gap-8">
      <div className="flex items-center gap-13">
        <input
          type="checkbox"
          checked={selectedCount === total && total > 0}
          onChange={onSelectAll}
          className="form-checkbox"
        />
        <span className="text-sm font-medium">
          {selectedCount > 0 ? `${selectedCount} selected` : 'Select all'}
        </span>
        {selectedCount > 0 && (
          <div className="flex items-center gap-8">
            <Button
              onClick={onApproveSelected}
              variant="primary"
              className="text-sm"
            >
              ✓ Approve Selected
            </Button>
            <Button
              onClick={() => setBulkEditMode?.(!bulkEditMode)}
              variant="secondary"
              className="text-sm"
            >
              ✏️ Bulk Edit
            </Button>
          </div>
        )}
      </div>
      {bulkEditMode && (
        <div className="flex items-center gap-5 flex-wrap">
          <Select
            value={bulkCategory}
            onChange={handleCategoryChange}
            className="text-sm"
          >
            <option value="">Select category...</option>
            {smartFolders.map((folder) => (
              <option key={folder.id} value={folder.name}>
                {folder.name}
              </option>
            ))}
          </Select>
          <Button
            onClick={onApplyBulkCategory}
            variant="primary"
            className="text-sm"
            disabled={!bulkCategory}
          >
            Apply
          </Button>
          <Button
            onClick={() => {
              setBulkEditMode?.(false);
              setBulkCategory?.('');
            }}
            variant="secondary"
            className="text-sm"
          >
            Cancel
          </Button>
        </div>
      )}
    </div>
  );
}

export default BulkOperations;

import React, { memo } from 'react';
import Button from '../ui/Button';

interface SelectionControlsProps {
  onSelectFiles: () => void;
  onSelectFolder: () => void;
  isScanning?: boolean;
  className?: string;
}

const SelectionControls = memo(function SelectionControls({
  onSelectFiles,
  onSelectFolder,
  isScanning,
  className = '',
}: SelectionControlsProps) {
  return (
    <div className={`flex items-center gap-4 flex-wrap ${className}`}>
      <Button onClick={onSelectFiles} variant="primary" disabled={isScanning}>
        Select Files
      </Button>
      <Button
        onClick={onSelectFolder}
        variant="secondary"
        disabled={isScanning}
      >
        Scan Folder
      </Button>
    </div>
  );
});

export default SelectionControls;

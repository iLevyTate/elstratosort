import React, { ReactNode } from 'react';
import { Button } from '../ui';
import ReadyFileItem from './ReadyFileItem';

interface FileAnalysis {
  category?: string;
  [key: string]: unknown;
}

interface FileData {
  path?: string;
  name?: string;
  analysis?: FileAnalysis;
  [key: string]: unknown;
}

interface SmartFolder {
  id: string | number;
  name: string;
  path?: string;
}

interface EditingData {
  category?: string;
  [key: string]: unknown;
}

interface StateDisplay {
  color?: string;
  spinning?: boolean;
  icon?: ReactNode;
  label?: string;
}

interface ReadyFileListProps {
  unprocessedFiles: FileData[];
  processedFiles: FileData[];
  getFileWithEdits: (file: FileData, index: number) => FileData;
  editingFiles: Record<number, EditingData>;
  selectedFiles: Set<number>;
  findSmartFolderForCategory: (category?: string) => SmartFolder | undefined;
  getFileStateDisplay: (path?: string, hasAnalysis?: boolean) => StateDisplay;
  toggleFileSelection: (index: number) => void;
  handleEditFile: (index: number, field: string, value: string) => void;
  defaultLocation: string;
  smartFolders: SmartFolder[];
  onGoBack: () => void;
}

function ReadyFileList({
  unprocessedFiles,
  processedFiles,
  getFileWithEdits,
  editingFiles,
  selectedFiles,
  findSmartFolderForCategory,
  getFileStateDisplay,
  toggleFileSelection,
  handleEditFile,
  defaultLocation,
  smartFolders,
  onGoBack,
}: ReadyFileListProps) {
  if (unprocessedFiles.length === 0) {
    return (
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
            onClick={onGoBack}
            variant="primary"
            className="mt-13"
          >
            ← Go Back to Select Files
          </Button>
        )}
      </div>
    );
  }

  return (
    <div className="grid gap-6 lg:grid-cols-2 xl:grid-cols-3">
      {unprocessedFiles.map((file, index) => {
        const fileWithEdits = getFileWithEdits(file, index);
        const currentCategory =
          editingFiles[index]?.category || fileWithEdits.analysis?.category;
        const smartFolder = findSmartFolderForCategory(currentCategory);
        const isSelected = selectedFiles.has(index);
        const stateDisplay = getFileStateDisplay(file.path, !!file.analysis);
        const destination = smartFolder
          ? smartFolder.path || `${defaultLocation}/${smartFolder.name}`
          : `${defaultLocation}/${currentCategory || 'Uncategorized'}`;
        return (
          <ReadyFileItem
            key={index}
            file={fileWithEdits as { name: string; size?: number; source?: string; analysis?: { suggestedName?: string; category?: string; [key: string]: unknown } }}
            index={index}
            isSelected={isSelected}
            onToggleSelected={toggleFileSelection}
            stateDisplay={stateDisplay}
            smartFolders={smartFolders}
            editing={editingFiles[index]}
            onEdit={handleEditFile}
            destination={destination}
            category={currentCategory}
          />
        );
      })}
    </div>
  );
}

export default ReadyFileList;

import React from 'react';
import { Button } from '../ui';
import OrganizeProgress from './OrganizeProgress';

interface FileData {
  path?: string;
  analysis?: Record<string, unknown>;
}

interface BatchProgress {
  current?: number;
  total?: number;
}

interface OrganizeActionAreaProps {
  unprocessedFiles: FileData[];
  isOrganizing: boolean;
  batchProgress?: BatchProgress;
  organizePreview?: Record<string, unknown>;
  onOrganize: () => void;
}

function OrganizeActionArea({
  unprocessedFiles,
  isOrganizing,
  batchProgress,
  organizePreview,
  onOrganize,
}: OrganizeActionAreaProps) {
  const filesToOrganizeCount = unprocessedFiles.filter((f) => f.analysis).length;

  return (
    <div className="glass-panel p-6">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-system-gray-600 font-medium">
            Ready to move {filesToOrganizeCount} files
          </p>
          <p className="text-xs text-system-gray-500">
            You can undo this operation if needed
          </p>
        </div>
        {isOrganizing ? (
          <div className="w-1/2">
            <OrganizeProgress
              isOrganizing={isOrganizing}
              batchProgress={batchProgress}
              preview={organizePreview ? Object.entries(organizePreview).map(([key, value]) => ({
                fileName: key,
                destination: String(value),
              })) : []}
            />
          </div>
        ) : (
          <Button
            onClick={() => onOrganize()}
            variant="success"
            className="text-lg px-8 py-4"
            disabled={filesToOrganizeCount === 0}
          >
            ✨ Organize Files Now
          </Button>
        )}
      </div>
    </div>
  );
}

export default OrganizeActionArea;

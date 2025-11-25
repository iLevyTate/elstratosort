import React from 'react';

interface ProcessedFile {
  originalName?: string;
  newName?: string;
  smartFolder?: string;
  organizedAt?: string | number;
}

interface OrganizedHistoryListProps {
  processedFiles: ProcessedFile[];
}

function OrganizedHistoryList({ processedFiles }: OrganizedHistoryListProps) {
  return (
    <div className="space-y-5">
      {processedFiles.map((file, index) => (
        <div
          key={index}
          className="flex items-center justify-between p-8 bg-green-50 rounded-lg border border-green-200"
        >
          <div className="flex items-center gap-8">
            <span className="text-green-600">✅</span>
            <div>
              <div className="text-sm font-medium text-system-gray-900">
                {file.originalName} → {file.newName}
              </div>
              <div className="text-xs text-system-gray-500">
                Moved to {file.smartFolder} •{' '}
                {file.organizedAt ? new Date(file.organizedAt).toLocaleDateString() : 'Unknown date'}
              </div>
            </div>
          </div>
          <div className="text-xs text-green-600 font-medium">Organized</div>
        </div>
      ))}
    </div>
  );
}

export default OrganizedHistoryList;

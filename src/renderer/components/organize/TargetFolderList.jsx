import React from 'react';
import PropTypes from 'prop-types';

function TargetFolderList({ folders = [], defaultLocation = 'Documents' }) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
      {folders.map((folder) => (
        <div
          key={folder.id}
          className="p-13 bg-surface-secondary rounded-lg border border-stratosort-blue/20"
        >
          <div className="font-medium text-system-gray-900 mb-2">
            {folder.name}
          </div>
          <div className="text-sm text-system-gray-600 mb-3">
            📂 {folder.path || `${defaultLocation}/${folder.name}`}
          </div>
          {folder.description && (
            <div className="text-xs text-system-gray-500 bg-stratosort-blue/5 p-5 rounded italic">
              &ldquo;{folder.description}&rdquo;
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

TargetFolderList.propTypes = {
  folders: PropTypes.arrayOf(
    PropTypes.shape({
      id: PropTypes.oneOfType([PropTypes.string, PropTypes.number]).isRequired,
      name: PropTypes.string.isRequired,
      path: PropTypes.string,
      description: PropTypes.string,
    }),
  ),
  defaultLocation: PropTypes.string,
};

export default TargetFolderList;

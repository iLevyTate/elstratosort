import React, { useCallback } from 'react';
import PropTypes from 'prop-types';
import Button from '../ui/Button';
import Input from '../ui/Input';

/**
 * Default locations section for smart folder configuration
 */
function DefaultLocationsSection({ settings, setSettings }) {
  const handleBrowse = useCallback(async () => {
    const res = await window.electronAPI.files.selectDirectory();
    if (res?.success && res.folder) {
      setSettings((prev) => ({
        ...prev,
        defaultSmartFolderLocation: res.folder,
      }));
    }
  }, [setSettings]);

  return (
    <div className="space-y-6">
      <div>
        <label className="block text-sm font-medium text-system-gray-700 mb-2">
          Default Smart Folder Location
        </label>
        <div className="flex gap-3">
          <Input
            type="text"
            value={settings.defaultSmartFolderLocation}
            onChange={(e) =>
              setSettings((prev) => ({
                ...prev,
                defaultSmartFolderLocation: e.target.value,
              }))
            }
            className="flex-1"
            placeholder="Documents"
          />
          <Button
            onClick={handleBrowse}
            variant="secondary"
            type="button"
            title="Browse"
            aria-label="Browse for default folder"
          >
            📁 Browse
          </Button>
        </div>
        <p className="text-xs text-system-gray-500 mt-3">
          Where new smart folders will be created by default
        </p>
      </div>
    </div>
  );
}

DefaultLocationsSection.propTypes = {
  settings: PropTypes.object.isRequired,
  setSettings: PropTypes.func.isRequired,
};

export default DefaultLocationsSection;

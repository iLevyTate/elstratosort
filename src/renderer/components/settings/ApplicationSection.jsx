import React from 'react';
import PropTypes from 'prop-types';
import Switch from '../ui/Switch';
import SettingRow from './SettingRow';
import Button from '../ui/Button';
import Card from '../ui/Card';
import { logger } from '../../../shared/logger';
import { Stack } from '../layout';
import { Text } from '../ui/Typography';

/**
 * Application settings section (launch on startup, etc.)
 */
function ApplicationSection({ settings, setSettings }) {
  const [isOpeningLogs, setIsOpeningLogs] = React.useState(false);

  const handleOpenLogsFolder = React.useCallback(async () => {
    if (isOpeningLogs) return;
    if (!window?.electronAPI?.settings?.openLogsFolder) return;

    setIsOpeningLogs(true);
    try {
      await window.electronAPI.settings.openLogsFolder();
    } catch (error) {
      logger.error('[Settings] Failed to open logs folder', { error });
    } finally {
      setIsOpeningLogs(false);
    }
  }, [isOpeningLogs]);

  return (
    <Card variant="default" className="space-y-5">
      <div>
        <Text variant="tiny" className="font-semibold uppercase tracking-wide text-system-gray-500">
          Application preferences
        </Text>
        <Text variant="small" className="text-system-gray-600">
          Startup behavior and diagnostic access.
        </Text>
      </div>

      <Stack gap="relaxed">
        {/* Launch on Startup */}
        <SettingRow
          label="Launch on Startup"
          description="Automatically start StratoSort when you log in to your computer."
        >
          <Switch
            checked={!!settings.launchOnStartup}
            onChange={(checked) =>
              setSettings((prev) => ({
                ...prev,
                launchOnStartup: checked
              }))
            }
          />
        </SettingRow>

        {/* Logs */}
        <SettingRow
          label="Troubleshooting Logs"
          description="Open the folder that contains StratoSort logs (useful for sharing with support)."
        >
          <Button
            variant="subtle"
            size="sm"
            onClick={handleOpenLogsFolder}
            disabled={!window?.electronAPI?.settings?.openLogsFolder}
            isLoading={isOpeningLogs}
          >
            Open Logs Folder
          </Button>
        </SettingRow>
      </Stack>
    </Card>
  );
}

ApplicationSection.propTypes = {
  settings: PropTypes.object.isRequired,
  setSettings: PropTypes.func.isRequired
};

export default ApplicationSection;

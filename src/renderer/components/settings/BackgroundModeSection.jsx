import React from 'react';
import PropTypes from 'prop-types';
import Switch from '../ui/Switch';
import Card from '../ui/Card';
import SettingRow from './SettingRow';
import { Text } from '../ui/Typography';

function BackgroundModeSection({ settings, setSettings }) {
  return (
    <Card variant="default" className="space-y-5">
      <div>
        <Text variant="tiny" className="font-semibold uppercase tracking-wide text-system-gray-500">
          Background mode
        </Text>
        <Text variant="small" className="text-system-gray-600">
          Keep StratoSort running in the tray when the window closes.
        </Text>
      </div>

      <SettingRow
        label="Background Mode"
        description="Keep running in the background when the window is closed."
      >
        <Switch
          checked={settings.backgroundMode}
          onChange={(checked) =>
            setSettings((prev) => ({
              ...prev,
              backgroundMode: checked
            }))
          }
        />
      </SettingRow>

      {settings.backgroundMode && !settings.autoOrganize && (
        <div className="rounded-lg border border-stratosort-warning/20 bg-stratosort-warning/5 p-3">
          <Text variant="tiny" className="text-stratosort-warning">
            Enable &quot;Auto-organize Downloads&quot; above to process files while running in
            background.
          </Text>
        </div>
      )}
    </Card>
  );
}

BackgroundModeSection.propTypes = {
  settings: PropTypes.object.isRequired,
  setSettings: PropTypes.func.isRequired
};

export default BackgroundModeSection;

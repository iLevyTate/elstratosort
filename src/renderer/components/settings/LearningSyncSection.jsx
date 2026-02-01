import React from 'react';
import PropTypes from 'prop-types';
import Switch from '../ui/Switch';
import Card from '../ui/Card';
import SettingRow from './SettingRow';
import { Text } from '../ui/Typography';

/**
 * LearningSyncSection - Settings section for ChromaDB learning sync
 * Controls dual-write behavior for feedback and patterns
 */
function LearningSyncSection({ settings, setSettings }) {
  const updateSetting = (key, value) => {
    setSettings((prev) => ({
      ...prev,
      [key]: value
    }));
  };

  const learningSyncEnabled = Boolean(settings.enableChromaLearningSync);
  const dryRunEnabled = Boolean(settings.enableChromaLearningDryRun);

  return (
    <Card variant="default" className="space-y-5">
      <div>
        <Text variant="tiny" className="font-semibold uppercase tracking-wide text-system-gray-500">
          Learning sync
        </Text>
        <Text variant="small" className="text-system-gray-600">
          Mirror learning feedback and patterns to ChromaDB for semantic retrieval.
        </Text>
      </div>

      <div className="space-y-6">
        <SettingRow
          label="Learning Sync to ChromaDB"
          description="Dual-write learning feedback and patterns to ChromaDB for future semantic retrieval. JSON remains the fallback."
        >
          <Switch
            checked={learningSyncEnabled}
            onChange={(checked) => updateSetting('enableChromaLearningSync', checked)}
          />
        </SettingRow>

        <SettingRow
          label="Dry Run (log only)"
          description="Log ChromaDB learning writes without executing them. Useful to validate sync volume."
        >
          <Switch
            checked={dryRunEnabled}
            disabled={!learningSyncEnabled}
            onChange={(checked) => updateSetting('enableChromaLearningDryRun', checked)}
          />
        </SettingRow>

        {!learningSyncEnabled && (
          <div className="rounded-lg border border-system-gray-100 bg-system-gray-50 p-3">
            <Text variant="small" className="text-system-gray-600">
              Enable learning sync to use ChromaDB-backed feedback persistence. This does not change
              existing JSON backups.
            </Text>
          </div>
        )}
      </div>
    </Card>
  );
}

LearningSyncSection.propTypes = {
  settings: PropTypes.object.isRequired,
  setSettings: PropTypes.func.isRequired
};

export default LearningSyncSection;

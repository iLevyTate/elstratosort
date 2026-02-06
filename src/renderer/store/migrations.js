/**
 * Redux State Migrations
 *
 * Handles migrating persisted Redux state between versions.
 * Ensure all migrations are idempotent and safe.
 */

import { logger } from '../../shared/logger';

// Current schema version
export const CURRENT_STATE_VERSION = 1;

/**
 * Migration functions map
 * Key: Version to migrate FROM (e.g., 1 means migrate from v1 to v2)
 * Value: Function(state) => newState
 */
const migrations = {
  // Example migration:
  // 1: (state) => {
  //   return {
  //     ...state,
  //     newFeature: { enabled: true }
  //   };
  // }
};

/**
 * Migrate state to the latest version
 * @param {Object} state - The persisted state object
 * @returns {Object} - Migrated state object
 */
export function migrateState(state) {
  if (!state) return state;

  let migratedState = { ...state };
  let currentVersion = migratedState._version || 0;

  // If no version tag, assume version 0 (legacy)
  if (typeof currentVersion !== 'number') {
    currentVersion = 0;
  }

  if (currentVersion >= CURRENT_STATE_VERSION) {
    return migratedState;
  }

  logger.info(
    `[StateMigration] Migrating state from v${currentVersion} to v${CURRENT_STATE_VERSION}`
  );

  try {
    while (currentVersion < CURRENT_STATE_VERSION) {
      const migrationFn = migrations[currentVersion];
      if (migrationFn) {
        logger.info(
          `[StateMigration] Applying migration v${currentVersion} -> v${currentVersion + 1}`
        );
        migratedState = migrationFn(migratedState);
      }
      currentVersion++;
    }

    // Update version tag
    migratedState._version = CURRENT_STATE_VERSION;
    logger.info('[StateMigration] Migration complete');

    return migratedState;
  } catch (error) {
    logger.error('[StateMigration] Migration failed:', error);
    // In case of fatal migration error, return null to force a state reset
    // rather than loading corrupted data
    return null;
  }
}

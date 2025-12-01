/**
 * Auto Organize Service
 *
 * Main export for the decomposed AutoOrganizeService.
 * Provides backward-compatible API.
 *
 * @module autoOrganize
 */

const AutoOrganizeServiceCore = require('./AutoOrganizeServiceCore');

/**
 * Create an AutoOrganizeService instance with default dependencies
 *
 * This factory function creates an AutoOrganizeService with the default
 * singleton services. Use for simple cases where manual DI is not needed.
 *
 * @returns {AutoOrganizeServiceCore} A new service instance
 */
function createWithDefaults() {
  const { getInstance: getChromaDB } = require('../chromadb');
  const FolderMatchingService = require('../FolderMatchingService');
  const { getService: getSettingsService } = require('../SettingsService');
  const OrganizationSuggestionService = require('../organization');
  const UndoRedoService = require('../UndoRedoService');

  const chromaDbService = getChromaDB();
  const settingsService = getSettingsService();
  const folderMatchingService = new FolderMatchingService(chromaDbService);
  const suggestionService = new OrganizationSuggestionService({
    chromaDbService,
    folderMatchingService,
    settingsService,
  });
  const undoRedoService = new UndoRedoService();

  return new AutoOrganizeServiceCore({
    suggestionService,
    settingsService,
    folderMatchingService,
    undoRedoService,
  });
}

// Export both the class and factory function for backward compatibility
module.exports = AutoOrganizeServiceCore;
module.exports.AutoOrganizeService = AutoOrganizeServiceCore;
module.exports.createWithDefaults = createWithDefaults;

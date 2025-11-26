/**
 * Service Registry - Configures all services in the container
 * Centralizes service dependencies and initialization
 */

/* eslint-disable no-unused-vars */
// Note: _deps parameters are part of the DI container pattern
// They indicate the function signature but may not be used in all services
const { container } = require('./ServiceContainer');
const { app } = require('electron');
const path = require('path');

// Helper to handle both default and named exports from require()
function getDefaultExport(mod: any) {
  return mod.default || mod;
}

/**
 * Register all application services with the container
 * @param {Object} options - Configuration options
 */
function registerServices(options = {}) {
  // ChromaDB Service (foundational)
  container.register(
    'chromaDb',
    async (_deps) => {
      const { ChromaDBService } = require('../services/ChromaDBService');
      const dbPath = path.join(app.getPath('userData'), 'chroma_db');
      return ChromaDBService.getInstance({ dbPath });
    },
    {
      dependencies: [],
      lazy: false, // Initialize early
      healthCheckInterval: 60000, // 1 minute
    },
  );

  // Ollama Service
  container.register(
    'ollama',
    async (_deps) => {
      const ollamaService = require('../services/OllamaService');
      return getDefaultExport(ollamaService); // Handle default export
    },
    {
      dependencies: [],
      lazy: false,
      healthCheckInterval: 60000,
    },
  );

  // Settings Service
  container.register(
    'settings',
    async (_deps) => {
      const SettingsServiceModule = require('../services/SettingsService');
      const SettingsService = getDefaultExport(SettingsServiceModule);
      return new SettingsService();
    },
    {
      dependencies: [],
      lazy: false,
    },
  );

  // Folder Matching Service
  container.register(
    'folderMatching',
    async (deps) => {
      const FolderMatchingServiceModule = require('../services/FolderMatchingService');
      const FolderMatchingService = getDefaultExport(
        FolderMatchingServiceModule,
      );
      const service = new FolderMatchingService(deps.chromaDb);
      service.initialize();
      return service;
    },
    {
      dependencies: ['chromaDb'],
      lazy: false,
      healthCheckInterval: 120000, // 2 minutes
    },
  );

  // Organization Suggestion Service
  container.register(
    'organizationSuggestion',
    async (deps) => {
      const OrganizationSuggestionServiceModule = require('../services/OrganizationSuggestionService');
      const OrganizationSuggestionService = getDefaultExport(
        OrganizationSuggestionServiceModule,
      );
      return new OrganizationSuggestionService({
        chromaDbService: deps.chromaDb,
        folderMatchingService: deps.folderMatching,
        settingsService: deps.settings,
      });
    },
    {
      dependencies: ['chromaDb', 'folderMatching', 'settings'],
      lazy: false,
      healthCheckInterval: 120000,
    },
  );

  // Undo/Redo Service
  container.register(
    'undoRedo',
    async (_deps) => {
      const UndoRedoServiceModule = require('../services/UndoRedoService');
      const UndoRedoService = getDefaultExport(UndoRedoServiceModule);
      return new UndoRedoService();
    },
    {
      dependencies: [],
      lazy: true,
    },
  );

  // Auto Organize Service
  container.register(
    'autoOrganize',
    async (deps) => {
      const AutoOrganizeServiceModule = require('../services/AutoOrganizeService');
      const AutoOrganizeService = getDefaultExport(AutoOrganizeServiceModule);
      return new AutoOrganizeService({
        suggestionService: deps.organizationSuggestion,
        settingsService: deps.settings,
        folderMatchingService: deps.folderMatching,
        undoRedoService: deps.undoRedo,
      });
    },
    {
      dependencies: [
        'organizationSuggestion',
        'settings',
        'folderMatching',
        'undoRedo',
      ],
      lazy: false,
      healthCheckInterval: 120000,
    },
  );

  // Batch Analysis Service
  container.register(
    'batchAnalysis',
    async (_deps) => {
      const BatchAnalysisServiceModule = require('../services/BatchAnalysisService');
      const BatchAnalysisService = getDefaultExport(BatchAnalysisServiceModule);
      return new BatchAnalysisService({
        concurrency: (options as any).batchConcurrency,
      });
    },
    {
      dependencies: [],
      lazy: true,
      healthCheckInterval: 60000,
    },
  );

  // File Organization Saga
  container.register(
    'fileOrganizationSaga',
    async (_deps) => {
      const { FileOrganizationSaga } = require('../services/transaction');
      const journalPath = path.join(
        app.getPath('userData'),
        'transaction-journal.db',
      );
      const saga = new FileOrganizationSaga(journalPath);

      // Recover incomplete transactions on startup
      await saga.recoverIncompleteTransactions();

      return saga;
    },
    {
      dependencies: [],
      lazy: false, // Initialize early for crash recovery
    },
  );

  // Model Manager
  container.register(
    'modelManager',
    async (deps) => {
      const ModelManagerModule = require('../services/ModelManager');
      const ModelManager = getDefaultExport(ModelManagerModule);
      return new ModelManager(deps.ollama);
    },
    {
      dependencies: ['ollama'],
      lazy: true,
    },
  );

  // Startup Manager
  container.register(
    'startup',
    async (deps) => {
      const { StartupManager } = require('../services/StartupManager');
      return new StartupManager({
        chromaDbService: deps.chromaDb,
        ollamaService: deps.ollama,
      });
    },
    {
      dependencies: ['chromaDb', 'ollama'],
      lazy: false,
    },
  );

  // Analysis History Service
  container.register(
    'analysisHistory',
    async (_deps) => {
      const AnalysisHistoryServiceModule = require('../services/AnalysisHistoryService');
      const AnalysisHistoryService = getDefaultExport(
        AnalysisHistoryServiceModule,
      );
      return new AnalysisHistoryService();
    },
    {
      dependencies: [],
      lazy: true,
    },
  );

  // Performance Service
  container.register(
    'performance',
    async (_deps) => {
      const PerformanceServiceModule = require('../services/PerformanceService');
      const PerformanceService = getDefaultExport(PerformanceServiceModule);
      return new PerformanceService();
    },
    {
      dependencies: [],
      lazy: true,
    },
  );
}

/**
 * Initialize all critical services on application startup
 * @returns {Promise<void>}
 */
async function initializeCriticalServices() {
  await container.initializeAll();
}

/**
 * Gracefully shutdown all services
 * @returns {Promise<void>}
 */
async function shutdownServices() {
  await container.shutdown();
}

export {
  registerServices,
  initializeCriticalServices,
  shutdownServices,
  container, // Re-export for convenience
};

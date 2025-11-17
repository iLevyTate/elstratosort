const AnalysisHistoryService = require('./AnalysisHistoryService');
const UndoRedoService = require('./UndoRedoService');
const ProcessingStateService = require('./ProcessingStateService');
const { getInstance: getChromaDB } = require('./ChromaDBService');
const FolderMatchingService = require('./FolderMatchingService');
const OrganizationSuggestionService = require('./OrganizationSuggestionService');
const AutoOrganizeService = require('./AutoOrganizeService');

class ServiceIntegration {
  constructor() {
    this.analysisHistory = null;
    this.undoRedo = null;
    this.processingState = null;
    this.chromaDbService = null;
    this.folderMatchingService = null;
    this.suggestionService = null;
    this.autoOrganizeService = null;
    this.initialized = false;
  }

  async initialize() {
    if (this.initialized) return;

    // Initialize core services
    this.analysisHistory = new AnalysisHistoryService();
    this.undoRedo = new UndoRedoService();
    this.processingState = new ProcessingStateService();

    // Initialize ChromaDB and folder matching
    this.chromaDbService = getChromaDB();
    this.folderMatchingService = new FolderMatchingService(
      this.chromaDbService,
    );

    // Initialize suggestion service
    const { getService: getSettingsService } = require('./SettingsService');
    this.suggestionService = new OrganizationSuggestionService({
      chromaDbService: this.chromaDbService,
      folderMatchingService: this.folderMatchingService,
      settingsService: getSettingsService(),
    });

    // Initialize auto-organize service
    this.autoOrganizeService = new AutoOrganizeService({
      suggestionService: this.suggestionService,
      settingsService: getSettingsService(),
      folderMatchingService: this.folderMatchingService,
      undoRedoService: this.undoRedo,
    });

    // Check ChromaDB availability before initializing
    const isChromaReady = await this.chromaDbService.isServerAvailable();
    if (!isChromaReady) {
      console.error(
        '[ChromaDB] ChromaDB server is not available. Please ensure ChromaDB is installed and running.',
      );
      // Optionally, you can decide how to handle this case, e.g., by disabling features that depend on ChromaDB
    }

    // Initialize all services
    await Promise.all([
      this.analysisHistory.initialize(),
      this.undoRedo.initialize(),
      this.processingState.initialize(),
      isChromaReady ? this.chromaDbService.initialize() : Promise.resolve(),
    ]);

    // Fixed: Initialize FolderMatchingService after ChromaDB is ready
    // This starts the embedding cache cleanup interval only after successful initialization
    if (this.folderMatchingService) {
      this.folderMatchingService.initialize();
    }

    this.initialized = true;
  }

  async shutdown() {
    if (!this.initialized) return;

    try {
      // Shutdown services that may have resources to clean up
      const shutdownPromises = [];

      // Shutdown ChromaDB service if it has a shutdown method
      if (this.chromaDbService?.shutdown) {
        shutdownPromises.push(this.chromaDbService.shutdown());
      }

      // Shutdown other services if they have cleanup methods
      if (this.processingState?.cleanup) {
        shutdownPromises.push(this.processingState.cleanup());
      }

      if (this.analysisHistory?.cleanup) {
        shutdownPromises.push(this.analysisHistory.cleanup());
      }

      if (this.undoRedo?.cleanup) {
        shutdownPromises.push(this.undoRedo.cleanup());
      }

      if (this.autoOrganizeService?.cleanup) {
        shutdownPromises.push(this.autoOrganizeService.cleanup());
      }

      // Shutdown FolderMatchingService to cleanup embedding cache
      if (this.folderMatchingService?.shutdown) {
        shutdownPromises.push(this.folderMatchingService.shutdown());
      }

      await Promise.allSettled(shutdownPromises);

      // Clear all service references
      this.analysisHistory = null;
      this.undoRedo = null;
      this.processingState = null;
      this.chromaDbService = null;
      this.folderMatchingService = null;
      this.suggestionService = null;
      this.autoOrganizeService = null;
      this.initialized = false;

      console.log('[ServiceIntegration] All services shut down successfully');
    } catch (error) {
      console.error('[ServiceIntegration] Error during shutdown:', error);
    }
  }
}

module.exports = ServiceIntegration;

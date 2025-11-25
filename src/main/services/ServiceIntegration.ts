import ProcessingStateService from './ProcessingStateService';
import { container } from '../core/ServiceContainer';
import { logger } from '../../shared/logger';

logger.setContext('ServiceIntegration');

class ServiceIntegration {
  analysisHistory: any;
  undoRedo: any;
  processingState: any;
  chromaDbService: any;
  folderMatchingService: any;
  suggestionService: any;
  autoOrganizeService: any;
  initialized: boolean;

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

    logger.info('[ServiceIntegration] Starting initialization (using ServiceContainer)...');

    try {
      // Get services from the container (already initialized by serviceRegistry)
      // This avoids duplicate service instances
      this.chromaDbService = await container.get('chromaDb');
      this.folderMatchingService = await container.get('folderMatching');
      this.suggestionService = await container.get('organizationSuggestion');
      this.autoOrganizeService = await container.get('autoOrganize');
      this.undoRedo = await container.get('undoRedo');
      this.analysisHistory = await container.get('analysisHistory');

      // ProcessingStateService is not in container, create locally
      this.processingState = new ProcessingStateService();
      await this.processingState.initialize();

      logger.info('[ServiceIntegration] All services retrieved from container');
    } catch (error: any) {
      logger.error('[ServiceIntegration] Failed to retrieve services from container:', error.message);
      // Fall back to degraded mode
      logger.warn('[ServiceIntegration] Running in degraded mode');
    }
    this.initialized = true;
  }

  async shutdown() {
    if (!this.initialized) return;

    try {
      // Only cleanup local services not managed by container
      // Container-managed services are cleaned up by container.shutdown()
      if (this.processingState?.cleanup) {
        await this.processingState.cleanup();
      }

      // Clear service references (container handles actual cleanup)
      this.analysisHistory = null;
      this.undoRedo = null;
      this.processingState = null;
      this.chromaDbService = null;
      this.folderMatchingService = null;
      this.suggestionService = null;
      this.autoOrganizeService = null;
      this.initialized = false;

      logger.info('[ServiceIntegration] Service references cleared (container manages actual cleanup)');
    } catch (error: any) {
      logger.error('[ServiceIntegration] Error during shutdown', {
        error: error.message,
      });
    }
  }
}

export default ServiceIntegration;

const { registerHandlers } = require('./ipcWrappers');
const { IpcServiceContext, createFromLegacyParams } = require('./IpcServiceContext');
const { schemas } = require('./validationSchemas');
const RelationshipIndexService = require('../services/RelationshipIndexService');
const { container, ServiceIds } = require('../services/ServiceContainer');

function registerKnowledgeIpc(servicesOrParams) {
  let context;
  if (servicesOrParams instanceof IpcServiceContext) {
    context = servicesOrParams;
  } else {
    context = createFromLegacyParams(servicesOrParams);
  }

  const { ipcMain, IPC_CHANNELS, logger } = context.core;
  const { getServiceIntegration } = context;

  let _cachedFallbackService = null;
  const getRelationshipService = () => {
    try {
      if (container?.has?.(ServiceIds.RELATIONSHIP_INDEX)) {
        return container.resolve(ServiceIds.RELATIONSHIP_INDEX);
      }
    } catch (error) {
      logger.debug('[Knowledge IPC] RelationshipIndexService not in container', {
        error: error?.message || String(error)
      });
    }

    const integration = getServiceIntegration && getServiceIntegration();
    if (integration?.relationshipIndex) {
      return integration.relationshipIndex;
    }

    // FIX 81: Cache fallback instance and guard against null analysisHistory
    const analysisHistoryService = integration?.analysisHistory;
    if (!analysisHistoryService) return null;
    if (!_cachedFallbackService) {
      _cachedFallbackService = new RelationshipIndexService({ analysisHistoryService });
    }
    return _cachedFallbackService;
  };

  registerHandlers({
    ipcMain,
    logger,
    context: 'Knowledge',
    handlers: {
      [IPC_CHANNELS.KNOWLEDGE.GET_RELATIONSHIP_EDGES]: {
        schema: schemas.relationshipEdges,
        handler: async (event, { fileIds, minWeight, maxEdges } = {}) => {
          const service = getRelationshipService();
          if (!service) return [];
          return service.getEdges(fileIds, { minWeight, maxEdges });
        }
      },
      [IPC_CHANNELS.KNOWLEDGE.GET_RELATIONSHIP_STATS]: {
        schema: schemas.relationshipStats,
        handler: async () => {
          const service = getRelationshipService();
          if (!service) return { totalEdges: 0, totalNodes: 0 };
          return service.getStats();
        }
      }
    }
  });
}

module.exports = registerKnowledgeIpc;

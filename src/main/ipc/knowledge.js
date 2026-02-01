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

    const analysisHistoryService = integration?.analysisHistory;
    return new RelationshipIndexService({ analysisHistoryService });
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
          return service.getEdges(fileIds, { minWeight, maxEdges });
        }
      },
      [IPC_CHANNELS.KNOWLEDGE.GET_RELATIONSHIP_STATS]: {
        schema: schemas.relationshipStats,
        handler: async () => {
          const service = getRelationshipService();
          return service.getStats();
        }
      }
    }
  });
}

module.exports = registerKnowledgeIpc;

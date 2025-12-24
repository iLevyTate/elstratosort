/**
 * ChromaDB Service Module
 *
 * Composed module that provides the ChromaDBService singleton.
 * Maintains backward compatibility with the original ChromaDBService.js.
 *
 * Structure:
 * - index.js - Main export with singleton pattern
 * - ChromaDBServiceCore.js - Core service class (~600 lines)
 * - ChromaQueryCache.js - LRU cache with TTL (~130 lines)
 * - ChromaHealthChecker.js - Health checking utilities (~200 lines)
 * - fileOperations.js - File embedding operations (~350 lines)
 * - folderEmbeddings.js - Folder embedding operations (~400 lines)
 *
 * @module services/chromadb
 */

const { ChromaDBServiceCore } = require('./ChromaDBServiceCore');
const { ChromaQueryCache } = require('./ChromaQueryCache');
const {
  checkHealthViaHttp,
  checkHealthViaClient,
  isServerAvailable,
  createHealthCheckInterval
} = require('./ChromaHealthChecker');
const { createSingletonHelpers } = require('../../../shared/singletonFactory');

// Export the core class as ChromaDBService for backward compatibility
const ChromaDBService = ChromaDBServiceCore;

// Use shared singleton factory for getInstance, registerWithContainer, resetInstance
const { getInstance, createInstance, registerWithContainer, resetInstance } =
  createSingletonHelpers({
    ServiceClass: ChromaDBService,
    serviceId: 'CHROMA_DB',
    serviceName: 'ChromaDB',
    containerPath: '../ServiceContainer',
    shutdownMethod: 'cleanup'
  });

module.exports = {
  // Main class export
  ChromaDBService,

  // Singleton pattern
  getInstance,
  createInstance,
  resetInstance,
  registerWithContainer,

  // Sub-modules for direct access if needed
  ChromaQueryCache,
  checkHealthViaHttp,
  checkHealthViaClient,
  isServerAvailable,
  createHealthCheckInterval
};

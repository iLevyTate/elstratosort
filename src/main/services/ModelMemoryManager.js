// src/main/services/ModelMemoryManager.js

const os = require('os');
const { createLogger } = require('../../shared/logger');

const logger = createLogger('ModelMemoryManager');

class ModelMemoryManager {
  /**
   * @param {Object} llamaService - LlamaService instance that provides model loading/unloading.
   *   The manager accesses _loadModel(type), _models, and _contexts through bound callbacks
   *   to keep the coupling explicit and auditable.
   */
  constructor(llamaService) {
    // Bind specific callbacks rather than holding the entire service reference.
    // This makes the contract between ModelMemoryManager and LlamaService explicit.
    this._loadModelFn = (type) => llamaService._loadModel(type);
    this._disposeModelFn = async (type) => {
      if (llamaService._models?.[type]) {
        await llamaService._models[type].dispose();
        llamaService._models[type] = null;
        llamaService._contexts[type] = null;
      }
    };
    this._loadedModels = new Map(); // type -> { model, context, lastUsed, sizeBytes }
    this._maxMemoryUsage = this._calculateMaxMemory();
    this._currentMemoryUsage = 0;

    // Model size estimates (in bytes)
    this._modelSizeEstimates = {
      embedding: 500 * 1024 * 1024, // ~500MB
      text: 4 * 1024 * 1024 * 1024, // ~4GB
      vision: 5 * 1024 * 1024 * 1024 // ~5GB
    };
  }

  /**
   * Calculate maximum memory we can use (70% of available)
   */
  _calculateMaxMemory() {
    const totalMemory = os.totalmem();
    const freeMemory = os.freemem();

    // Use 70% of free memory, but cap at 16GB
    const maxUsable = Math.min(freeMemory * 0.7, 16 * 1024 * 1024 * 1024);

    logger.info('[Memory] Calculated max memory usage', {
      totalGB: Math.round(totalMemory / 1024 / 1024 / 1024),
      freeGB: Math.round(freeMemory / 1024 / 1024 / 1024),
      maxUsableGB: Math.round(maxUsable / 1024 / 1024 / 1024)
    });

    return maxUsable;
  }

  /**
   * Check if we can load a model of given type
   */
  canLoadModel(modelType) {
    const estimatedSize = this._modelSizeEstimates[modelType] || 0;
    const projectedUsage = this._currentMemoryUsage + estimatedSize;
    return projectedUsage < this._maxMemoryUsage;
  }

  /**
   * Ensure model is loaded, unloading others if necessary
   */
  async ensureModelLoaded(modelType) {
    // Already loaded?
    if (this._loadedModels.has(modelType)) {
      const entry = this._loadedModels.get(modelType);
      entry.lastUsed = Date.now();
      return entry.context;
    }

    // Check if we need to free memory
    const estimatedSize = this._modelSizeEstimates[modelType] || 0;
    while (!this.canLoadModel(modelType) && this._loadedModels.size > 0) {
      await this._unloadLeastRecentlyUsed();
    }

    // Load the model via the bound callback
    const context = await this._loadModelFn(modelType);

    this._loadedModels.set(modelType, {
      context,
      lastUsed: Date.now(),
      sizeBytes: estimatedSize
    });
    this._currentMemoryUsage += estimatedSize;

    logger.info('[Memory] Model loaded', {
      type: modelType,
      currentUsageMB: Math.round(this._currentMemoryUsage / 1024 / 1024)
    });

    return context;
  }

  /**
   * Unload least recently used model
   */
  async _unloadLeastRecentlyUsed() {
    let oldest = null;
    let oldestTime = Infinity;

    for (const [type, entry] of this._loadedModels) {
      if (entry.lastUsed < oldestTime) {
        oldest = type;
        oldestTime = entry.lastUsed;
      }
    }

    if (oldest) {
      await this._unloadModel(oldest);
    }
  }

  /**
   * Unload a specific model
   */
  async _unloadModel(modelType) {
    const entry = this._loadedModels.get(modelType);
    if (!entry) return;

    // Remove from map FIRST to prevent double-dispose if called concurrently
    this._loadedModels.delete(modelType);
    this._currentMemoryUsage -= entry.sizeBytes;

    logger.info('[Memory] Unloading model', { type: modelType });

    try {
      if (entry.context?.dispose) {
        await entry.context.dispose();
      }
      await this._disposeModelFn(modelType);
    } catch (error) {
      logger.error('[Memory] Error unloading model', error);
    }
  }

  /**
   * Get current memory status
   */
  getMemoryStatus() {
    return {
      maxMemoryMB: Math.round(this._maxMemoryUsage / 1024 / 1024),
      currentUsageMB: Math.round(this._currentMemoryUsage / 1024 / 1024),
      loadedModels: Array.from(this._loadedModels.keys()),
      systemFreeMemoryMB: Math.round(os.freemem() / 1024 / 1024)
    };
  }

  /**
   * Unload all models
   */
  async unloadAll() {
    // Snapshot keys to avoid mutating Map during iteration
    const types = [...this._loadedModels.keys()];
    for (const type of types) {
      await this._unloadModel(type);
    }
  }

  /**
   * Unload a specific model (public helper)
   */
  async unloadModel(modelType) {
    await this._unloadModel(modelType);
  }
}

module.exports = { ModelMemoryManager };

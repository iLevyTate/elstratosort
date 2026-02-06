/**
 * LlamaUtils - Utilities for node-llama-cpp based LlamaService
 *
 * This module provides utility functions for working with the in-process
 * LlamaService.
 *
 * @module llamaUtils
 */

const { createLogger } = require('../shared/logger');
const { AI_DEFAULTS } = require('../shared/constants');

const logger = createLogger('llama-utils');

// Cached LlamaService instance
let llamaServiceInstance = null;

// Selected models - in-memory cache
let selectedTextModel = AI_DEFAULTS.TEXT?.MODEL || null;
let selectedVisionModel = AI_DEFAULTS.IMAGE?.MODEL || null;
let selectedEmbeddingModel = AI_DEFAULTS.EMBEDDING?.MODEL || null;

/**
 * Lazy load LlamaService to avoid circular dependencies
 */
function getLlamaService() {
  if (!llamaServiceInstance) {
    try {
      const { getInstance } = require('./services/LlamaService');
      llamaServiceInstance = getInstance();
    } catch (error) {
      logger.warn('[LlamaUtils] Failed to get LlamaService instance:', error.message);
      return null;
    }
  }
  return llamaServiceInstance;
}

/**
 * Get current text model name
 * @returns {string|null}
 */
function getTextModel() {
  const service = getLlamaService();
  if (service?._selectedModels?.text) {
    return service._selectedModels.text;
  }
  return selectedTextModel;
}

/**
 * Get current vision model name
 * @returns {string|null}
 */
function getVisionModel() {
  const service = getLlamaService();
  if (service?._selectedModels?.vision) {
    return service._selectedModels.vision;
  }
  return selectedVisionModel;
}

/**
 * Get current embedding model name
 * @returns {string|null}
 */
function getEmbeddingModel() {
  const service = getLlamaService();
  if (service?._selectedModels?.embedding) {
    return service._selectedModels.embedding;
  }
  return selectedEmbeddingModel;
}

/**
 * Set text model
 * @param {string} model - Model filename
 */
async function setTextModel(model) {
  selectedTextModel = model;
  const service = getLlamaService();
  if (service) {
    await service.updateConfig({ textModel: model });
  }
}

/**
 * Set vision model
 * @param {string} model - Model filename
 */
async function setVisionModel(model) {
  selectedVisionModel = model;
  const service = getLlamaService();
  if (service) {
    await service.updateConfig({ visionModel: model });
  }
}

/**
 * Set embedding model
 * @param {string} model - Model filename
 */
async function setEmbeddingModel(model) {
  selectedEmbeddingModel = model;
  const service = getLlamaService();
  if (service) {
    await service.updateConfig({ embeddingModel: model });
  }
}

/**
 * Load configuration from settings
 */
async function loadLlamaConfig() {
  try {
    const { getInstance: getSettings } = require('./services/SettingsService');
    const settings = getSettings();
    const allSettings = settings?.getAll?.() || {};

    // Load model names from settings or use defaults
    selectedTextModel =
      allSettings.textModel || AI_DEFAULTS.TEXT?.MODEL || 'Mistral-7B-Instruct-v0.3-Q4_K_M.gguf';
    selectedVisionModel =
      allSettings.visionModel || AI_DEFAULTS.IMAGE?.MODEL || 'llava-v1.6-mistral-7b-Q4_K_M.gguf';
    selectedEmbeddingModel =
      allSettings.embeddingModel ||
      AI_DEFAULTS.EMBEDDING?.MODEL ||
      'nomic-embed-text-v1.5-Q8_0.gguf';

    logger.info('[LlamaUtils] Config loaded', {
      textModel: selectedTextModel,
      visionModel: selectedVisionModel,
      embeddingModel: selectedEmbeddingModel
    });

    return {
      selectedTextModel,
      selectedVisionModel,
      selectedEmbeddingModel
    };
  } catch (error) {
    logger.warn('[LlamaUtils] Failed to load config:', error.message);
    return {
      selectedTextModel,
      selectedVisionModel,
      selectedEmbeddingModel
    };
  }
}

/**
 * Get embedding dimensions for current model
 * @returns {number}
 */
function getEmbeddingDimensions() {
  // nomic-embed-text v1.5 uses 768 dimensions
  return AI_DEFAULTS.EMBEDDING?.DIMENSIONS || 768;
}

/**
 * Clean up resources
 */
async function cleanup() {
  if (llamaServiceInstance) {
    await llamaServiceInstance.shutdown?.();
    llamaServiceInstance = null;
  }
}

// Backward compatibility aliases
const getLlamaModel = getTextModel;
const getLlamaVisionModel = getVisionModel;
const getLlamaEmbeddingModel = getEmbeddingModel;
const setLlamaModel = setTextModel;
const setLlamaVisionModel = setVisionModel;
const setLlamaEmbeddingModel = setEmbeddingModel;

module.exports = {
  // Primary exports
  getLlamaService,
  getTextModel,
  getVisionModel,
  getEmbeddingModel,
  setTextModel,
  setVisionModel,
  setEmbeddingModel,
  loadLlamaConfig,
  getEmbeddingDimensions,
  cleanup,

  // Aliases
  getLlamaModel,
  getLlamaVisionModel,
  getLlamaEmbeddingModel,
  setLlamaModel,
  setLlamaVisionModel,
  setLlamaEmbeddingModel
};

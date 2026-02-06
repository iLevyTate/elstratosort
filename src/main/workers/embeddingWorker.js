const path = require('path');
const { createLogger } = require('../../shared/logger');
const { ERROR_CODES } = require('../../shared/errorCodes');

const logger = createLogger('EmbeddingWorker');

let llamaModule = null;
let currentModelPath = null;
let currentGpuLayers = null;
let model = null;
let context = null;

const isOutOfMemoryError = (error) => {
  const message = String(error?.message || error || '').toLowerCase();
  return message.includes('out of memory') || message.includes('oom');
};

async function loadLlamaModule() {
  if (llamaModule) return llamaModule;
  llamaModule = await import('node-llama-cpp');
  return llamaModule;
}

async function ensureModelLoaded({ modelPath, gpuLayers }) {
  if (!modelPath) {
    const error = new Error('Embedding model path is required');
    error.code = ERROR_CODES.LLAMA_MODEL_NOT_FOUND;
    throw error;
  }

  if (model && context && currentModelPath === modelPath && currentGpuLayers === gpuLayers) {
    return context;
  }

  const llama = await loadLlamaModule();
  const resolvedPath = path.normalize(modelPath);
  logger.info('[EmbeddingWorker] Loading embedding model', { modelPath: resolvedPath });

  // Dispose previous model if exists
  if (context) {
    try {
      await context.dispose();
    } catch (e) {
      logger.warn('[EmbeddingWorker] Failed to dispose previous context', { error: e.message });
    }
    context = null;
  }
  if (model) {
    try {
      await model.dispose();
    } catch (e) {
      logger.warn('[EmbeddingWorker] Failed to dispose previous model', { error: e.message });
    }
    model = null;
    context = null;
  }

  try {
    model = await llama.loadModel({ modelPath: resolvedPath, gpuLayers });
    context = await model.createEmbeddingContext();
    currentModelPath = modelPath;
    currentGpuLayers = gpuLayers;
    return context;
  } catch (error) {
    logger.error('[EmbeddingWorker] Failed to load embedding model', { error: error.message });
    if (isOutOfMemoryError(error)) {
      error.code = ERROR_CODES.LLAMA_OOM;
    } else if (!error.code) {
      error.code = ERROR_CODES.LLAMA_MODEL_LOAD_FAILED;
    }
    throw error;
  }
}

module.exports = async function runEmbeddingTask(payload = {}) {
  const { text, modelPath, gpuLayers = -1 } = payload || {};
  if (typeof text !== 'string') {
    const error = new Error('Embedding text must be a string');
    error.code = ERROR_CODES.LLAMA_INFERENCE_FAILED;
    throw error;
  }

  try {
    const ctx = await ensureModelLoaded({ modelPath, gpuLayers });
    const embedding = await ctx.getEmbeddingFor(text);
    const vector = Array.from(embedding.vector);
    return { embedding: vector };
  } catch (error) {
    if (isOutOfMemoryError(error)) {
      error.code = ERROR_CODES.LLAMA_OOM;
    } else if (!error.code) {
      error.code = ERROR_CODES.LLAMA_INFERENCE_FAILED;
    }
    throw error;
  }
};

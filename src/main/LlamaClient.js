/**
 * LlamaClient - Legacy SDK-compatible adapter for LlamaService
 *
 * This class provides an interface compatible with a legacy LLM SDK client,
 * allowing existing code to work with the in-process LlamaService without modification.
 *
 * @module LlamaClient
 */

const { createLogger } = require('../shared/logger');
const { AI_DEFAULTS } = require('../shared/constants');

const logger = createLogger('LlamaClient');

// Lazy-loaded LlamaService reference
let llamaService = null;

/**
 * Get LlamaService instance (lazy load to avoid circular deps)
 */
function getLlamaService() {
  if (!llamaService) {
    try {
      const { getInstance } = require('./services/LlamaService');
      llamaService = getInstance();
    } catch (error) {
      logger.warn('[LlamaClient] LlamaService not available:', error.message);
      return null;
    }
  }
  return llamaService;
}

/**
 * LlamaClient - SDK-compatible interface for LlamaService
 */
class LlamaClient {
  constructor(options = {}) {
    // Options kept for API compatibility, but not used for in-process service
    this._options = options;
    this._initialized = false;
  }

  /**
   * Ensure LlamaService is initialized
   */
  async _ensureInitialized() {
    const service = getLlamaService();
    if (!service) {
      throw new Error('LlamaService not available');
    }
    if (!this._initialized) {
      await service.initialize();
      this._initialized = true;
    }
    return service;
  }

  /**
   * Generate text response - SDK compatible
   * @param {Object} options - Generate options
   * @param {string} options.model - Model name
   * @param {string} options.prompt - Input prompt
   * @param {string} [options.system] - System prompt
   * @param {Object} [options.options] - Model options (temperature, etc)
   * @param {AbortSignal} [options.signal] - Abort signal
   * @returns {Promise<{response: string, model: string, done: boolean}>}
   */
  async generate(options) {
    const service = await this._ensureInitialized();

    const { model, prompt, system, options: modelOptions, signal, tools, format } = options;

    try {
      logger.debug('[LlamaClient] generate called', {
        model,
        promptLength: prompt?.length,
        hasSystem: !!system,
        hasTools: !!tools
      });

      const result = await service.generateText({
        prompt,
        systemPrompt: system,
        temperature: modelOptions?.temperature ?? AI_DEFAULTS.TEXT.TEMPERATURE,
        maxTokens: modelOptions?.num_predict ?? AI_DEFAULTS.TEXT.MAX_TOKENS,
        signal,
        format
      });

      // Return SDK compatible response format
      return {
        response: result.text || result.response || result,
        model: model || service._config?.textModel,
        done: true,
        done_reason: 'stop',
        context: [],
        total_duration: result.duration || 0,
        load_duration: 0,
        prompt_eval_duration: 0,
        eval_duration: result.duration || 0,
        eval_count: result.tokenCount || 0
      };
    } catch (error) {
      logger.error('[LlamaClient] generate error:', error.message);
      throw error;
    }
  }

  /**
   * Generate chat response - SDK compatible
   * @param {Object} options - Chat options
   * @returns {Promise<Object>}
   */
  async chat(options) {
    const service = await this._ensureInitialized();

    const { model, messages, options: modelOptions, signal, format } = options;

    try {
      // Convert chat messages to a prompt
      let prompt = '';
      let system = '';

      for (const msg of messages || []) {
        if (msg.role === 'system') {
          system = msg.content;
        } else if (msg.role === 'user') {
          prompt += `User: ${msg.content}\n`;
        } else if (msg.role === 'assistant') {
          prompt += `Assistant: ${msg.content}\n`;
        }
      }

      prompt += 'Assistant: ';

      const result = await service.generateText({
        prompt,
        systemPrompt: system,
        temperature: modelOptions?.temperature ?? AI_DEFAULTS.TEXT.TEMPERATURE,
        maxTokens: modelOptions?.num_predict ?? AI_DEFAULTS.TEXT.MAX_TOKENS,
        signal,
        format
      });

      return {
        message: {
          role: 'assistant',
          content: result.text || result.response || result
        },
        model: model || service._config?.textModel,
        done: true
      };
    } catch (error) {
      logger.error('[LlamaClient] chat error:', error.message);
      throw error;
    }
  }

  /**
   * Generate embeddings - SDK compatible
   * @param {Object} options - Embed options
   * @param {string} options.model - Model name
   * @param {string|string[]} options.input - Text(s) to embed
   * @returns {Promise<{embeddings: number[][]}>}
   */
  async embed(options) {
    const service = await this._ensureInitialized();

    const { input } = options;

    try {
      const texts = Array.isArray(input) ? input : [input];

      if (texts.length === 1) {
        const result = await service.generateEmbedding(texts[0]);
        // Extract the raw vector from { embedding: [...] } shape
        const vector = result?.embedding || result;
        return { embeddings: [Array.isArray(vector) ? vector : []] };
      }

      const batchResult = await service.batchGenerateEmbeddings(texts);
      // batchGenerateEmbeddings returns { embeddings: [vector1, vector2, ...] }
      const rawEmbeddings = batchResult?.embeddings || [];
      const embeddings = rawEmbeddings.map((vec) => {
        return Array.isArray(vec) ? vec : [];
      });
      return { embeddings };
    } catch (error) {
      logger.error('[LlamaClient] embed error:', error.message);
      throw error;
    }
  }

  /**
   * Legacy embeddings method - SDK compatible
   * @deprecated Use embed() instead
   */
  async embeddings(options) {
    const result = await this.embed(options);
    return {
      embedding: result.embeddings[0]
    };
  }

  /**
   * List available models - SDK compatible
   * @returns {Promise<{models: Array}>}
   */
  async list() {
    const service = await this._ensureInitialized();

    try {
      const models = await service.listModels();
      return {
        models: models.map((m) => ({
          name: m.name || m.filename,
          model: m.name || m.filename,
          modified_at: m.modified || new Date().toISOString(),
          size: (m.sizeMB || 0) * 1024 * 1024,
          digest: '',
          details: {
            format: 'gguf',
            family: m.type || 'unknown',
            parameter_size: '',
            quantization_level: m.quantization || 'Q4_K_M'
          }
        }))
      };
    } catch (error) {
      logger.error('[LlamaClient] list error:', error.message);
      throw error;
    }
  }

  /**
   * Show model info - SDK compatible
   * @param {Object} options - Show options
   * @returns {Promise<Object>}
   */
  async show(options) {
    const service = await this._ensureInitialized();
    const models = await service.listModels();
    const model = models.find((m) => m.name === options.model || m.filename === options.model);

    if (!model) {
      throw new Error(`Model not found: ${options.model}`);
    }

    return {
      modelfile: '',
      parameters: '',
      template: '',
      details: {
        format: 'gguf',
        family: model.type || 'unknown',
        parameter_size: model.parameters || '',
        quantization_level: model.quantization || ''
      }
    };
  }

  /**
   * Pull model - SDK compatible (delegates to ModelDownloadManager)
   */
  async pull(_options) {
    logger.warn('[LlamaClient] pull() called - use ModelDownloadManager instead');
    throw new Error(
      'Model pulling not supported via LlamaClient. Use ModelDownloadManager.downloadModel() instead.'
    );
  }

  /**
   * Delete model - SDK compatible (delegates to ModelDownloadManager)
   */
  async delete(_options) {
    logger.warn('[LlamaClient] delete() called - use ModelDownloadManager instead');
    throw new Error(
      'Model deletion not supported via LlamaClient. Use ModelDownloadManager.deleteModel() instead.'
    );
  }

  /**
   * Copy model - Not supported for GGUF
   */
  async copy() {
    throw new Error('Model copying not supported for GGUF models');
  }

  /**
   * Create model - Not supported for GGUF
   */
  async create() {
    throw new Error('Model creation not supported for GGUF models');
  }

  /**
   * Push model - Not supported for local models
   */
  async push() {
    throw new Error('Model pushing not supported for local GGUF models');
  }
}

// Singleton instance
let clientInstance = null;

/**
 * Get singleton LlamaClient instance
 */
function getInstance() {
  if (!clientInstance) {
    clientInstance = new LlamaClient();
  }
  return clientInstance;
}

/**
 * Create new LlamaClient instance
 */
function createClient(options = {}) {
  return new LlamaClient(options);
}

module.exports = {
  LlamaClient,
  getInstance,
  createClient
};

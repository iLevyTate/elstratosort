/**
 * Unified Configuration Module
 *
 * Single source of truth for all application configuration.
 * Centralizes environment variables, defaults, and validation.
 *
 * @module config
 */

const { PORTS, SERVICE_URLS, TIMEOUTS: CONFIG_DEFAULT_TIMEOUTS, validateServiceUrl } = require('./configDefaults');
const { DEFAULT_SETTINGS } = require('./defaultSettings');
const { TIMEOUTS: PERF_TIMEOUTS, RETRY, CACHE, BATCH, THRESHOLDS, LIMITS } = require('./performanceConstants');
const { PROCESSING_LIMITS, AI_DEFAULTS, DEFAULT_AI_MODELS, FILE_SIZE_LIMITS } = require('./constants');

/**
 * Configuration Schema Definition
 * Defines all configuration categories with their properties, types, defaults, and validation rules.
 */
const CONFIG_SCHEMA = {
  /**
   * Server Configuration
   * External service URLs and connection settings
   */
  SERVER: {
    /** ChromaDB vector database URL */
    chromaUrl: {
      type: 'url',
      default: SERVICE_URLS.CHROMA_SERVER_URL,
      envVar: 'CHROMA_SERVER_URL',
      description: 'ChromaDB vector database server URL',
      required: false,
    },
    /** ChromaDB server host */
    chromaHost: {
      type: 'string',
      default: '127.0.0.1',
      envVar: 'CHROMA_SERVER_HOST',
      description: 'ChromaDB server hostname',
    },
    /** ChromaDB server port */
    chromaPort: {
      type: 'number',
      default: PORTS.CHROMA_DB,
      envVar: 'CHROMA_SERVER_PORT',
      min: 1,
      max: 65535,
      description: 'ChromaDB server port',
    },
    /** ChromaDB server protocol */
    chromaProtocol: {
      type: 'enum',
      default: 'http',
      envVar: 'CHROMA_SERVER_PROTOCOL',
      values: ['http', 'https'],
      description: 'ChromaDB server protocol',
    },
    /** Ollama LLM server URL */
    ollamaUrl: {
      type: 'url',
      default: SERVICE_URLS.OLLAMA_HOST,
      envVar: ['OLLAMA_BASE_URL', 'OLLAMA_HOST'],
      description: 'Ollama LLM server URL',
      required: false,
    },
    /** Ollama server port */
    ollamaPort: {
      type: 'number',
      default: PORTS.OLLAMA,
      envVar: 'OLLAMA_PORT',
      min: 1,
      max: 65535,
      description: 'Ollama server port',
    },
    /** Development server port */
    devServerPort: {
      type: 'number',
      default: PORTS.DEV_SERVER,
      envVar: 'DEV_SERVER_PORT',
      min: 1,
      max: 65535,
      description: 'Development server port for webpack',
    },
  },

  /**
   * AI Model Configuration
   * Model names and AI-related settings
   */
  MODELS: {
    /** Text analysis model */
    textModel: {
      type: 'string',
      default: DEFAULT_AI_MODELS.TEXT_ANALYSIS,
      envVar: 'OLLAMA_TEXT_MODEL',
      description: 'Ollama model for text analysis',
      pattern: /^[a-zA-Z0-9][a-zA-Z0-9\-_.:/]*$/,
    },
    /** Vision/image analysis model */
    visionModel: {
      type: 'string',
      default: DEFAULT_AI_MODELS.IMAGE_ANALYSIS,
      envVar: ['OLLAMA_VISION_MODEL', 'OLLAMA_MULTIMODAL_MODEL'],
      description: 'Ollama model for image/vision analysis',
      pattern: /^[a-zA-Z0-9][a-zA-Z0-9\-_.:/]*$/,
    },
    /** Embedding model */
    embeddingModel: {
      type: 'string',
      default: 'mxbai-embed-large',
      envVar: 'OLLAMA_EMBEDDING_MODEL',
      description: 'Ollama model for generating embeddings',
      pattern: /^[a-zA-Z0-9][a-zA-Z0-9\-_.:/]*$/,
    },
    /** Fallback models list */
    fallbackModels: {
      type: 'array',
      default: DEFAULT_AI_MODELS.FALLBACK_MODELS,
      description: 'List of fallback models to try if primary fails',
    },
    /** AI temperature for text analysis */
    textTemperature: {
      type: 'number',
      default: AI_DEFAULTS.TEXT.TEMPERATURE,
      min: 0,
      max: 2,
      description: 'Temperature setting for text generation',
    },
    /** AI temperature for image analysis */
    imageTemperature: {
      type: 'number',
      default: AI_DEFAULTS.IMAGE.TEMPERATURE,
      min: 0,
      max: 2,
      description: 'Temperature setting for image analysis',
    },
    /** Max tokens for text analysis */
    textMaxTokens: {
      type: 'number',
      default: AI_DEFAULTS.TEXT.MAX_TOKENS,
      min: 1,
      max: 32000,
      description: 'Maximum tokens for text analysis response',
    },
    /** Max tokens for image analysis */
    imageMaxTokens: {
      type: 'number',
      default: AI_DEFAULTS.IMAGE.MAX_TOKENS,
      min: 1,
      max: 32000,
      description: 'Maximum tokens for image analysis response',
    },
    /** Max content length for text processing */
    maxContentLength: {
      type: 'number',
      default: AI_DEFAULTS.TEXT.MAX_CONTENT_LENGTH,
      min: 1000,
      max: 100000,
      description: 'Maximum content length for text processing',
    },
  },

  /**
   * Analysis Configuration
   * Settings for file analysis and processing
   */
  ANALYSIS: {
    /** Maximum concurrent analysis operations */
    maxConcurrency: {
      type: 'number',
      default: PROCESSING_LIMITS.MAX_CONCURRENT_ANALYSIS,
      min: 1,
      max: 20,
      description: 'Maximum concurrent analysis operations',
    },
    /** Batch size for processing */
    batchSize: {
      type: 'number',
      default: BATCH.SIZE_MEDIUM,
      min: 1,
      max: 500,
      description: 'Batch size for file processing',
    },
    /** Analysis timeout in milliseconds */
    timeout: {
      type: 'number',
      default: PROCESSING_LIMITS.ANALYSIS_TIMEOUT,
      min: 5000,
      max: 600000,
      description: 'Analysis operation timeout (ms)',
    },
    /** Retry attempts for failed operations */
    retryAttempts: {
      type: 'number',
      default: RETRY.MAX_ATTEMPTS_MEDIUM,
      min: 0,
      max: 10,
      description: 'Number of retry attempts for failed operations',
    },
    /** Initial retry delay in milliseconds */
    retryDelay: {
      type: 'number',
      default: RETRY.INITIAL_DELAY,
      min: 100,
      max: 30000,
      description: 'Initial delay between retry attempts (ms)',
    },
    /** Image analysis timeout (longer for vision models) */
    imageAnalysisTimeout: {
      type: 'number',
      default: CONFIG_DEFAULT_TIMEOUTS.IMAGE_ANALYSIS,
      min: 10000,
      max: 600000,
      description: 'Image analysis timeout (ms)',
    },
  },

  /**
   * Performance Configuration
   * Caching, throttling, and optimization settings
   */
  PERFORMANCE: {
    /** Maximum cache size for file analysis */
    fileCacheSize: {
      type: 'number',
      default: CACHE.MAX_FILE_CACHE,
      min: 0,
      max: 10000,
      description: 'Maximum cached file analysis results',
    },
    /** Maximum cache size for embeddings */
    embeddingCacheSize: {
      type: 'number',
      default: CACHE.MAX_EMBEDDING_CACHE,
      min: 0,
      max: 50000,
      description: 'Maximum cached embeddings',
    },
    /** Cache TTL for short-lived entries (ms) */
    cacheTtlShort: {
      type: 'number',
      default: CACHE.TTL_SHORT,
      min: 1000,
      max: 3600000,
      description: 'Short cache TTL (ms)',
    },
    /** Cache TTL for medium-lived entries (ms) */
    cacheTtlMedium: {
      type: 'number',
      default: CACHE.TTL_MEDIUM,
      min: 1000,
      max: 86400000,
      description: 'Medium cache TTL (ms)',
    },
    /** Cache TTL for long-lived entries (ms) */
    cacheTtlLong: {
      type: 'number',
      default: CACHE.TTL_LONG,
      min: 1000,
      max: 604800000,
      description: 'Long cache TTL (ms)',
    },
    /** Debounce delay for UI input (ms) */
    debounceMs: {
      type: 'number',
      default: PERF_TIMEOUTS.DEBOUNCE_INPUT,
      min: 50,
      max: 2000,
      description: 'UI input debounce delay (ms)',
    },
    /** Throttle delay for frequent operations (ms) */
    throttleMs: {
      type: 'number',
      default: 100,
      min: 10,
      max: 5000,
      description: 'Operation throttle delay (ms)',
    },
    /** Health check interval (ms) */
    healthCheckInterval: {
      type: 'number',
      default: CONFIG_DEFAULT_TIMEOUTS.HEALTH_CHECK_INTERVAL,
      min: 10000,
      max: 600000,
      description: 'Health check interval (ms)',
    },
    /** Maximum concurrent network operations */
    maxConcurrentNetwork: {
      type: 'number',
      default: BATCH.MAX_CONCURRENT_NETWORK,
      min: 1,
      max: 50,
      description: 'Maximum concurrent network operations',
    },
  },

  /**
   * Circuit Breaker Configuration
   * Settings for ChromaDB circuit breaker fault tolerance
   */
  CIRCUIT_BREAKER: {
    /** Number of consecutive failures before opening the circuit */
    failureThreshold: {
      type: 'number',
      default: 5,
      envVar: 'CHROMADB_CIRCUIT_FAILURE_THRESHOLD',
      min: 1,
      max: 20,
      description: 'Failures before opening circuit',
    },
    /** Number of successes in half-open state before closing circuit */
    successThreshold: {
      type: 'number',
      default: 2,
      envVar: 'CHROMADB_CIRCUIT_SUCCESS_THRESHOLD',
      min: 1,
      max: 10,
      description: 'Successes needed to close circuit',
    },
    /** Time in ms before attempting recovery when circuit is open */
    timeout: {
      type: 'number',
      default: 30000,
      envVar: 'CHROMADB_CIRCUIT_TIMEOUT',
      min: 5000,
      max: 300000,
      description: 'Recovery timeout (ms)',
    },
    /** Time in ms before resetting failure count in closed state */
    resetTimeout: {
      type: 'number',
      default: 60000,
      envVar: 'CHROMADB_CIRCUIT_RESET_TIMEOUT',
      min: 10000,
      max: 600000,
      description: 'Failure count reset timeout (ms)',
    },
    /** Maximum operations to queue when circuit is open */
    maxQueueSize: {
      type: 'number',
      default: 1000,
      envVar: 'CHROMADB_MAX_QUEUE_SIZE',
      min: 100,
      max: 10000,
      description: 'Maximum queued operations',
    },
  },

  /**
   * File Limits Configuration
   * Size limits and constraints for file operations
   */
  FILE_LIMITS: {
    /** Maximum text file size (bytes) */
    maxTextFileSize: {
      type: 'number',
      default: FILE_SIZE_LIMITS.MAX_TEXT_FILE_SIZE,
      min: 1024,
      max: 1073741824, // 1GB
      description: 'Maximum text file size (bytes)',
    },
    /** Maximum image file size (bytes) */
    maxImageFileSize: {
      type: 'number',
      default: FILE_SIZE_LIMITS.MAX_IMAGE_FILE_SIZE,
      min: 1024,
      max: 1073741824,
      description: 'Maximum image file size (bytes)',
    },
    /** Maximum document file size (bytes) */
    maxDocumentFileSize: {
      type: 'number',
      default: FILE_SIZE_LIMITS.MAX_DOCUMENT_FILE_SIZE,
      min: 1024,
      max: 1073741824,
      description: 'Maximum document file size (bytes)',
    },
    /** Maximum path length */
    maxPathLength: {
      type: 'number',
      default: LIMITS.MAX_SEARCH_RESULTS,
      min: 100,
      max: 4096,
      description: 'Maximum file path length',
    },
  },

  /**
   * Thresholds Configuration
   * Confidence and scoring thresholds
   */
  THRESHOLDS: {
    /** Confidence threshold for auto-approval */
    autoApproveThreshold: {
      type: 'number',
      default: DEFAULT_SETTINGS.autoApproveThreshold,
      min: 0,
      max: 1,
      description: 'Minimum confidence for auto-approval',
    },
    /** Confidence threshold for review queue */
    reviewThreshold: {
      type: 'number',
      default: DEFAULT_SETTINGS.reviewThreshold,
      min: 0,
      max: 1,
      description: 'Minimum confidence for review queue',
    },
    /** Confidence threshold for downloads folder */
    downloadConfidenceThreshold: {
      type: 'number',
      default: DEFAULT_SETTINGS.downloadConfidenceThreshold,
      min: 0,
      max: 1,
      description: 'Confidence threshold for download folder items',
    },
    /** Minimum similarity score for matching */
    minSimilarityScore: {
      type: 'number',
      default: THRESHOLDS.MIN_SIMILARITY_SCORE,
      min: 0,
      max: 1,
      description: 'Minimum similarity score for folder matching',
    },
    /** High confidence threshold */
    confidenceHigh: {
      type: 'number',
      default: THRESHOLDS.CONFIDENCE_HIGH,
      min: 0,
      max: 1,
      description: 'High confidence threshold',
    },
    /** Medium confidence threshold */
    confidenceMedium: {
      type: 'number',
      default: THRESHOLDS.CONFIDENCE_MEDIUM,
      min: 0,
      max: 1,
      description: 'Medium confidence threshold',
    },
  },

  /**
   * Feature Flags Configuration
   * Enable/disable features
   */
  FEATURES: {
    /** Enable telemetry collection */
    enableTelemetry: {
      type: 'boolean',
      default: false,
      envVar: 'STRATOSORT_ENABLE_TELEMETRY',
      description: 'Enable anonymous telemetry collection',
    },
    /** Enable debug mode */
    debugMode: {
      type: 'boolean',
      default: false,
      envVar: 'STRATOSORT_DEBUG',
      description: 'Enable debug mode with verbose logging',
    },
    /** Disable ChromaDB entirely */
    disableChromaDB: {
      type: 'boolean',
      default: false,
      envVar: 'STRATOSORT_DISABLE_CHROMADB',
      description: 'Disable ChromaDB vector database',
    },
    /** Force DevTools open on start */
    forceDevTools: {
      type: 'boolean',
      default: false,
      envVar: 'FORCE_DEV_TOOLS',
      description: 'Force DevTools open on application start',
    },
    /** Enable auto-organize feature */
    autoOrganize: {
      type: 'boolean',
      default: DEFAULT_SETTINGS.autoOrganize,
      description: 'Enable automatic file organization',
    },
    /** Enable background mode */
    backgroundMode: {
      type: 'boolean',
      default: DEFAULT_SETTINGS.backgroundMode,
      description: 'Enable background processing mode',
    },
  },

  /**
   * UI Configuration
   * User interface settings
   */
  UI: {
    /** Application theme */
    theme: {
      type: 'enum',
      default: DEFAULT_SETTINGS.theme,
      values: ['light', 'dark', 'system'],
      description: 'Application color theme',
    },
    /** Enable notifications */
    notifications: {
      type: 'boolean',
      default: DEFAULT_SETTINGS.notifications,
      description: 'Enable desktop notifications',
    },
    /** Workflow restore max age (ms) */
    workflowRestoreMaxAge: {
      type: 'number',
      default: DEFAULT_SETTINGS.workflowRestoreMaxAge,
      min: 60000,
      max: 86400000,
      description: 'Maximum age for workflow state restoration (ms)',
    },
    /** Auto-save debounce delay (ms) */
    saveDebounceMs: {
      type: 'number',
      default: DEFAULT_SETTINGS.saveDebounceMs,
      min: 100,
      max: 10000,
      description: 'Debounce delay for auto-save operations (ms)',
    },
  },

  /**
   * Environment Configuration
   * Node.js and runtime environment settings
   */
  ENV: {
    /** Node environment */
    nodeEnv: {
      type: 'enum',
      default: 'production',
      envVar: 'NODE_ENV',
      values: ['development', 'production', 'test'],
      description: 'Node.js environment mode',
    },
    /** CI environment flag */
    isCI: {
      type: 'boolean',
      default: false,
      envVar: 'CI',
      description: 'Running in CI environment',
    },
  },
};

/**
 * Sensitive configuration keys that should be redacted in dumps
 */
const SENSITIVE_KEYS = [
  'password',
  'secret',
  'token',
  'apiKey',
  'api_key',
  'credentials',
];

/**
 * Deprecated configuration mappings
 * Maps old config keys to new keys for backward compatibility
 */
const DEPRECATED_MAPPINGS = {
  'OLLAMA_HOST': 'SERVER.ollamaUrl',
  'selectedModel': 'MODELS.textModel',
  'selectedVisionModel': 'MODELS.visionModel',
  'selectedEmbeddingModel': 'MODELS.embeddingModel',
};

/**
 * Configuration validation errors
 */
class ConfigValidationError extends Error {
  constructor(key, value, message) {
    super(`Configuration error for '${key}': ${message} (got: ${JSON.stringify(value)})`);
    this.name = 'ConfigValidationError';
    this.key = key;
    this.value = value;
  }
}

/**
 * Parse environment variable value based on type
 * @param {string} value - Raw environment variable value
 * @param {Object} schemaDef - Schema definition for the config key
 * @returns {*} Parsed value
 */
function parseEnvValue(value, schemaDef) {
  if (value === undefined || value === null || value === '') {
    return undefined;
  }

  switch (schemaDef.type) {
    case 'boolean':
      return ['true', '1', 'yes'].includes(String(value).toLowerCase().trim());
    case 'number': {
      const num = Number(value);
      return isNaN(num) ? undefined : num;
    }
    case 'url':
      return String(value).trim();
    case 'enum': {
      const enumVal = String(value).toLowerCase().trim();
      return schemaDef.values.includes(enumVal) ? enumVal : undefined;
    }
    case 'array':
      try {
        return JSON.parse(value);
      } catch {
        return value.split(',').map(s => s.trim()).filter(Boolean);
      }
    case 'string':
    default:
      return String(value).trim();
  }
}

/**
 * Get environment variable value, supporting array of env var names
 * @param {string|string[]} envVars - Environment variable name(s)
 * @returns {string|undefined} Environment variable value
 */
function getEnvVar(envVars) {
  if (!envVars) return undefined;

  const vars = Array.isArray(envVars) ? envVars : [envVars];
  for (const varName of vars) {
    const value = process.env[varName];
    if (value !== undefined && value !== null && value !== '') {
      return value;
    }
  }
  return undefined;
}

/**
 * Validate a configuration value against its schema
 * @param {string} key - Configuration key
 * @param {*} value - Value to validate
 * @param {Object} schemaDef - Schema definition
 * @returns {Object} Validation result { valid, value, error }
 */
function validateValue(key, value, schemaDef) {
  // Use default if value is undefined
  if (value === undefined || value === null) {
    if (schemaDef.required) {
      return { valid: false, error: 'Required value is missing' };
    }
    return { valid: true, value: schemaDef.default };
  }

  // Type validation
  switch (schemaDef.type) {
    case 'boolean':
      if (typeof value !== 'boolean') {
        return { valid: false, error: `Expected boolean, got ${typeof value}` };
      }
      break;

    case 'number':
      if (typeof value !== 'number' || isNaN(value)) {
        return { valid: false, error: `Expected number, got ${typeof value}` };
      }
      if (schemaDef.min !== undefined && value < schemaDef.min) {
        return { valid: false, error: `Value ${value} is below minimum ${schemaDef.min}` };
      }
      if (schemaDef.max !== undefined && value > schemaDef.max) {
        return { valid: false, error: `Value ${value} exceeds maximum ${schemaDef.max}` };
      }
      break;

    case 'string':
      if (typeof value !== 'string') {
        return { valid: false, error: `Expected string, got ${typeof value}` };
      }
      if (schemaDef.pattern && !schemaDef.pattern.test(value)) {
        return { valid: false, error: `Value does not match required pattern` };
      }
      break;

    case 'url': {
      if (typeof value !== 'string') {
        return { valid: false, error: `Expected URL string, got ${typeof value}` };
      }
      const urlValidation = validateServiceUrl(value);
      if (!urlValidation.valid) {
        return { valid: false, error: urlValidation.error };
      }
      break;
    }

    case 'enum':
      if (!schemaDef.values.includes(value)) {
        return { valid: false, error: `Value must be one of: ${schemaDef.values.join(', ')}` };
      }
      break;

    case 'array':
      if (!Array.isArray(value)) {
        return { valid: false, error: `Expected array, got ${typeof value}` };
      }
      break;
  }

  return { valid: true, value };
}

/**
 * Configuration Manager Class
 * Manages loading, validation, and access to configuration values.
 */
class ConfigurationManager {
  constructor() {
    this._config = {};
    this._loaded = false;
    this._validationErrors = [];
    this._deprecationWarnings = [];
  }

  /**
   * Load configuration from schema defaults and environment variables
   * @returns {Object} Loaded configuration
   */
  load() {
    this._config = {};
    this._validationErrors = [];
    this._deprecationWarnings = [];

    // Check for deprecated environment variables
    for (const [oldKey, newKey] of Object.entries(DEPRECATED_MAPPINGS)) {
      if (process.env[oldKey]) {
        this._deprecationWarnings.push(
          `Environment variable '${oldKey}' is deprecated. Use '${newKey}' instead.`
        );
      }
    }

    // Load each category
    for (const [category, properties] of Object.entries(CONFIG_SCHEMA)) {
      this._config[category] = {};

      for (const [propName, schemaDef] of Object.entries(properties)) {
        // Try to get value from environment
        const envValue = getEnvVar(schemaDef.envVar);
        let value;

        if (envValue !== undefined) {
          value = parseEnvValue(envValue, schemaDef);
        }

        // Validate and apply default if needed
        const validation = validateValue(`${category}.${propName}`, value, schemaDef);

        if (!validation.valid) {
          this._validationErrors.push({
            key: `${category}.${propName}`,
            value,
            error: validation.error,
          });
          // Use default on validation failure
          this._config[category][propName] = schemaDef.default;
        } else {
          this._config[category][propName] = validation.value;
        }
      }
    }

    this._loaded = true;
    return this._config;
  }

  /**
   * Get a configuration value by path
   * @param {string} path - Dot-separated path (e.g., 'SERVER.chromaUrl')
   * @param {*} [defaultValue] - Default value if not found
   * @returns {*} Configuration value
   */
  get(path, defaultValue = undefined) {
    if (!this._loaded) {
      this.load();
    }

    const parts = path.split('.');
    let current = this._config;

    for (const part of parts) {
      if (current === undefined || current === null) {
        return defaultValue;
      }
      current = current[part];
    }

    return current !== undefined ? current : defaultValue;
  }

  /**
   * Get entire configuration category
   * @param {string} category - Category name (e.g., 'SERVER')
   * @returns {Object} Category configuration
   */
  getCategory(category) {
    if (!this._loaded) {
      this.load();
    }
    return this._config[category] || {};
  }

  /**
   * Get all configuration
   * @returns {Object} Complete configuration object
   */
  getAll() {
    if (!this._loaded) {
      this.load();
    }
    return { ...this._config };
  }

  /**
   * Check if in development mode
   * @returns {boolean}
   */
  isDevelopment() {
    return this.get('ENV.nodeEnv') === 'development';
  }

  /**
   * Check if in production mode
   * @returns {boolean}
   */
  isProduction() {
    return this.get('ENV.nodeEnv') === 'production';
  }

  /**
   * Check if in test mode
   * @returns {boolean}
   */
  isTest() {
    return this.get('ENV.nodeEnv') === 'test';
  }

  /**
   * Check if running in CI
   * @returns {boolean}
   */
  isCI() {
    return this.get('ENV.isCI');
  }

  /**
   * Validate all configuration and return validation report
   * @returns {Object} Validation report
   */
  validate() {
    if (!this._loaded) {
      this.load();
    }

    return {
      valid: this._validationErrors.length === 0,
      errors: [...this._validationErrors],
      warnings: [...this._deprecationWarnings],
    };
  }

  /**
   * Dump configuration for debugging (with sensitive values redacted)
   * @param {Object} options - Dump options
   * @param {boolean} options.includeSensitive - Include sensitive values (default: false)
   * @returns {Object} Configuration dump
   */
  dump(options = {}) {
    const { includeSensitive = false } = options;

    if (!this._loaded) {
      this.load();
    }

    const redact = (obj, prefix = '') => {
      const result = {};
      for (const [key, value] of Object.entries(obj)) {
        const fullKey = prefix ? `${prefix}.${key}` : key;

        if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
          result[key] = redact(value, fullKey);
        } else if (!includeSensitive && SENSITIVE_KEYS.some(s => key.toLowerCase().includes(s))) {
          result[key] = '[REDACTED]';
        } else {
          result[key] = value;
        }
      }
      return result;
    };

    return {
      config: redact(this._config),
      metadata: {
        loadedAt: new Date().toISOString(),
        nodeEnv: this.get('ENV.nodeEnv'),
        validationErrors: this._validationErrors.length,
        deprecationWarnings: this._deprecationWarnings.length,
      },
    };
  }

  /**
   * Get configuration schema
   * @returns {Object} Configuration schema
   */
  getSchema() {
    return CONFIG_SCHEMA;
  }

  /**
   * Get validation errors
   * @returns {Array} Validation errors
   */
  getValidationErrors() {
    return [...this._validationErrors];
  }

  /**
   * Get deprecation warnings
   * @returns {Array} Deprecation warnings
   */
  getDeprecationWarnings() {
    return [...this._deprecationWarnings];
  }

  /**
   * Override a configuration value at runtime
   * Note: This does not persist and will be reset on next load()
   * @param {string} path - Configuration path
   * @param {*} value - New value
   */
  override(path, value) {
    if (!this._loaded) {
      this.load();
    }

    const parts = path.split('.');
    let current = this._config;

    for (let i = 0; i < parts.length - 1; i++) {
      if (!current[parts[i]]) {
        current[parts[i]] = {};
      }
      current = current[parts[i]];
    }

    current[parts[parts.length - 1]] = value;
  }

  /**
   * Reset configuration to defaults by reloading
   */
  reset() {
    this._loaded = false;
    this._config = {};
    this._validationErrors = [];
    this._deprecationWarnings = [];
    this.load();
  }
}

// Singleton instance
const configManager = new ConfigurationManager();

// Load configuration on module import
configManager.load();

// Log any warnings
if (configManager.getDeprecationWarnings().length > 0) {
  console.warn('[Config] Deprecation warnings:', configManager.getDeprecationWarnings());
}

if (configManager.getValidationErrors().length > 0) {
  console.warn('[Config] Validation errors (using defaults):', configManager.getValidationErrors());
}

// Export both the manager instance and convenience methods
module.exports = {
  // Configuration manager instance
  config: configManager,

  // Convenience methods
  get: (path, defaultValue) => configManager.get(path, defaultValue),
  getCategory: (category) => configManager.getCategory(category),
  getAll: () => configManager.getAll(),
  isDevelopment: () => configManager.isDevelopment(),
  isProduction: () => configManager.isProduction(),
  isTest: () => configManager.isTest(),
  isCI: () => configManager.isCI(),
  validate: () => configManager.validate(),
  dump: (options) => configManager.dump(options),
  getSchema: () => configManager.getSchema(),
  override: (path, value) => configManager.override(path, value),
  reset: () => configManager.reset(),

  // Schema and types for reference
  CONFIG_SCHEMA,
  ConfigValidationError,
  SENSITIVE_KEYS,
  DEPRECATED_MAPPINGS,
};

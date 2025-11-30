/**
 * Performance and Timing Constants
 * Centralized location for all timing-related magic numbers
 *
 * This file contains all performance-related constants used throughout the application.
 * Constants are organized by category and can be overridden via environment variables
 * where appropriate.
 */

/**
 * Environment variable helper - safely parse numeric env vars with validation
 * @param {string} envVar - Environment variable name
 * @param {number} defaultValue - Default value if env var is not set or invalid
 * @param {Object} options - Validation options
 * @returns {number} Parsed value or default
 */
function getEnvNumber(envVar, defaultValue, options = {}) {
  const value = process.env[envVar];
  if (value === undefined || value === null || value === "") {
    return defaultValue;
  }
  const parsed = parseInt(value, 10);
  if (isNaN(parsed)) {
    return defaultValue;
  }
  const { min = -Infinity, max = Infinity } = options;
  if (parsed < min || parsed > max) {
    return defaultValue;
  }
  return parsed;
}

/**
 * Timeout durations in milliseconds
 */
const TIMEOUTS = {
  DEBOUNCE_INPUT: 300,
  TOOLTIP_DELAY: 500,
  ANIMATION_SHORT: 200,
  ANIMATION_MEDIUM: 300,
  ANIMATION_LONG: 500,
  FILE_READ: 5000,
  FILE_WRITE: 10000,
  FILE_COPY: 30000,
  DIRECTORY_SCAN: 60000,
  AI_ANALYSIS_SHORT: 30000,
  AI_ANALYSIS_MEDIUM: 60000,
  AI_ANALYSIS_LONG: 120000,
  AI_ANALYSIS_BATCH: 300000,
  API_REQUEST: 10000,
  API_REQUEST_SLOW: 30000,
  HEALTH_CHECK: 5000,
  AXIOS_DEFAULT: 5000,
  SERVICE_STARTUP: 30000,
  DATABASE_INIT: 15000,
  MODEL_LOAD: 60000,
  DELAY_SHORT: 250,
  DELAY_MEDIUM: 500,
  DELAY_BATCH: 100,
  DELAY_NOTIFICATION: 1500,
  CLEANUP_MAX: 5000,
  SHUTDOWN_MAX: 10000,
  IPC_HANDLER_RETRY_BASE: 100,
  IPC_HANDLER_MAX_WAIT: 2000,
  SEMANTIC_QUERY: 30000,
  FLUSH_MAX_WAIT: 30000,
};

const RETRY = {
  MAX_ATTEMPTS_LOW: 2,
  MAX_ATTEMPTS_MEDIUM: 3,
  MAX_ATTEMPTS_HIGH: 5,
  MAX_ATTEMPTS_VERY_HIGH: 10,
  INITIAL_DELAY: 1000,
  MAX_DELAY: 10000,
  EXPONENTIAL_BASE: 2,
  FILE_OPERATION: { maxAttempts: 3, initialDelay: 500, maxDelay: 5000 },
  NETWORK_REQUEST: { maxAttempts: 5, initialDelay: 1000, maxDelay: 10000 },
  AI_ANALYSIS: { maxAttempts: 2, initialDelay: 2000, maxDelay: 10000 },
  IPC_HANDLER: { maxAttempts: 5, initialDelay: 100 },
  OLLAMA_API: { maxAttempts: 3, initialDelay: 1000, maxDelay: 4000 },
  CHROMADB: { maxAttempts: 3, initialDelay: 500, maxDelay: 5000 },
  DATABASE_OFFLINE_MAX: 10,
  ITEM_MAX_RETRIES: 3,
  BACKOFF_BASE_MS: 5000,
  BACKOFF_MAX_MS: 300000,
};

const CACHE = {
  MAX_FILE_CACHE: 500,
  MAX_IMAGE_CACHE: getEnvNumber("MAX_IMAGE_CACHE", 300, { min: 50, max: 1000 }),
  MAX_EMBEDDING_CACHE: 1000,
  MAX_ANALYSIS_CACHE: 200,
  MAX_LRU_CACHE: 100,
  CHROMADB_QUERY_CACHE_SIZE: 200,
  CHROMADB_QUERY_TTL_MS: 120000,
  TTL_SHORT: 5 * 60 * 1000,
  TTL_MEDIUM: 30 * 60 * 1000,
  TTL_LONG: 2 * 60 * 60 * 1000,
  TTL_DAY: 24 * 60 * 60 * 1000,
  CLEANUP_INTERVAL: 15 * 60 * 1000,
  ANALYSIS_HISTORY_TTL_MS: 5000,
  STATS_CACHE_TTL_MS: 30000,
  SEARCH_CACHE_TTL_MS: 10000,
};

const BATCH = {
  SIZE_SMALL: 10,
  SIZE_MEDIUM: 50,
  SIZE_LARGE: 100,
  SIZE_XLARGE: 1000,
  MAX_CONCURRENT_FILES: 5,
  MAX_CONCURRENT_ANALYSIS: 3,
  MAX_CONCURRENT_NETWORK: 10,
  PROGRESS_UPDATE_INTERVAL: 1000,
  EMBEDDING_BATCH_SIZE: 50,
  EMBEDDING_PARALLEL_SIZE: 10,
  EMBEDDING_FLUSH_DELAY_MS: 500,
  CHROMADB_INSERT_DELAY_MS: 100,
  SEMANTIC_BATCH_SIZE: 50,
  AUTO_ORGANIZE_BATCH_SIZE: getEnvNumber("AUTO_ORGANIZE_BATCH_SIZE", 10, { min: 1, max: 100 }),
};

const POLLING = {
  FAST: 100,
  NORMAL: 500,
  SLOW: 2000,
  VERY_SLOW: 5000,
  CHROMADB_HEALTH_CHECK: 30000,
  STARTUP_POLL_INITIAL: 50,
  STARTUP_POLL_SLOW: 200,
  STARTUP_POLL_SLOWER: 500,
  STARTUP_POLL_FINAL: 1000,
};

const FILE_SIZE = {
  MAX_INLINE_TEXT: 1024 * 1024,
  MAX_DOCUMENT_SIZE: 50 * 1024 * 1024,
  MAX_IMAGE_SIZE: 20 * 1024 * 1024,
  MAX_UPLOAD_SIZE: 100 * 1024 * 1024,
  MAX_TEXT_FOR_HASH: 50000,
  LARGE_FILE_THRESHOLD: 10 * 1024 * 1024,
  STREAM_THRESHOLD: 5 * 1024 * 1024,
};

const PAGINATION = {
  DEFAULT_PAGE_SIZE: 50,
  MAX_PAGE_SIZE: 1000,
  INFINITE_SCROLL_THRESHOLD: 100,
  DEFAULT_QUERY_LIMIT: 100,
};

const THRESHOLDS = {
  CONFIDENCE_LOW: 0.3,
  CONFIDENCE_MEDIUM: 0.6,
  CONFIDENCE_HIGH: 0.8,
  CONFIDENCE_VERY_HIGH: 0.9,
  DEFAULT_CONFIDENCE_PERCENT: 70,
  DEFAULT_IMAGE_CONFIDENCE_PERCENT: 75,
  MEMORY_WARNING_PERCENT: 80,
  DISK_WARNING_PERCENT: 90,
  CPU_WARNING_PERCENT: 85,
  MIN_SIMILARITY_SCORE: 0.5,
  MIN_MATCH_CONFIDENCE: 0.6,
  QUEUE_HIGH_WATERMARK: 0.75,
  QUEUE_CRITICAL_WATERMARK: 0.90,
};

const LIMITS = {
  MAX_SEARCH_RESULTS: 100,
  MAX_SUGGESTIONS: 10,
  MAX_HISTORY_ITEMS: 1000,
  MAX_LOG_ENTRIES: 5000,
  MAX_UNDO_STACK: 50,
  MAX_QUEUE_SIZE: 10000,
  MAX_DEAD_LETTER_SIZE: 1000,
  MAX_HISTORY_ENTRIES: 10000,
  MAX_TOP_K: 100,
  MAX_XLSX_ROWS: 10000,
  MAX_IPC_REQUESTS_PER_SECOND: 200,
  RATE_LIMIT_CLEANUP_THRESHOLD: 100,
  RATE_LIMIT_STALE_MS: 60000,
  MAX_NUMERIC_RETRIES: 5000,
  MAX_FILENAME_LENGTH: 200,
  MAX_SETTINGS_BACKUPS: 10,
  MAX_WATCHER_RESTARTS: 10,
  WATCHER_RESTART_WINDOW: 60000,
  FEEDBACK_RETENTION_DAYS: 90,
  PATTERN_STALE_DAYS: 180,
  MEMORY_CHECK_INTERVAL: 100,
  MAX_OVERLAP_ITERATIONS: 10000,
  MAX_OVERLAPS_REPORT: 100,
};

const IMAGE = { MAX_DIMENSION: 1536 };

const NETWORK = {
  OLLAMA_PORT: 11434,
  CHROMADB_PORT: 8000,
  DEV_SERVER_PORT: 3000,
  HTTPS_PORT: 443,
  HTTP_PORT: 80,
  MAX_PORT: 65535,
  MIN_PORT: 1,
  SERVER_CHECK_INTERVAL: 100,
  SERVER_MAX_WAIT: 30000,
};

const DEBOUNCE = {
  SETTINGS_SAVE: 1000,
  PATTERN_SAVE_THROTTLE: 5000,
  CACHE_BATCH_WAIT: 100,
  CACHE_BATCH_MAX_WAIT: 5000,
  REFRESH_INTERVAL: 60000,
  ERROR_RETRY_INTERVAL: 5000,
};

const CONCURRENCY = { FOLDER_SCAN: 50, EMBEDDING_FLUSH: 5 };

const GPU_TUNING = {
  NUM_BATCH_CPU_ONLY: 128,
  NUM_BATCH_LOW_MEMORY: 256,
  NUM_BATCH_MEDIUM_MEMORY: 384,
  NUM_BATCH_HIGH_MEMORY: 512,
  HIGH_MEMORY_THRESHOLD: 12000,
  MEDIUM_MEMORY_THRESHOLD: 8000,
};

function validateConfiguration() {
  const errors = [];
  const warnings = [];
  for (const [key, value] of Object.entries(TIMEOUTS)) {
    if (typeof value !== "number" || value <= 0) {
      errors.push("TIMEOUTS." + key + " must be a positive number");
    }
  }
  if (RETRY.MAX_ATTEMPTS_LOW > RETRY.MAX_ATTEMPTS_MEDIUM) {
    warnings.push("RETRY.MAX_ATTEMPTS_LOW should not exceed MAX_ATTEMPTS_MEDIUM");
  }
  for (const [key, value] of Object.entries(CACHE)) {
    if (typeof value === "number" && value <= 0) {
      errors.push("CACHE." + key + " must be a positive number");
    }
  }
  for (const [key, value] of Object.entries(BATCH)) {
    if (typeof value === "number" && value <= 0) {
      errors.push("BATCH." + key + " must be a positive number");
    }
  }
  if (THRESHOLDS.QUEUE_HIGH_WATERMARK >= THRESHOLDS.QUEUE_CRITICAL_WATERMARK) {
    errors.push("THRESHOLDS.QUEUE_HIGH_WATERMARK must be less than QUEUE_CRITICAL_WATERMARK");
  }
  if (NETWORK.OLLAMA_PORT < NETWORK.MIN_PORT || NETWORK.OLLAMA_PORT > NETWORK.MAX_PORT) {
    errors.push("NETWORK.OLLAMA_PORT must be between " + NETWORK.MIN_PORT + " and " + NETWORK.MAX_PORT);
  }
  return { valid: errors.length === 0, errors, warnings };
}

module.exports = {
  TIMEOUTS, RETRY, CACHE, BATCH, POLLING, FILE_SIZE, PAGINATION, THRESHOLDS, LIMITS,
  IMAGE, NETWORK, DEBOUNCE, CONCURRENCY, GPU_TUNING,
  validateConfiguration, getEnvNumber,
};

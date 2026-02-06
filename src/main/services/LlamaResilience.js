// src/main/services/LlamaResilience.js

const { createLogger } = require('../../shared/logger');
const { withRetry } = require('../../shared/errorHandlingUtils');

const logger = createLogger('LlamaResilience');

/**
 * Errors that indicate we should retry
 */
const RETRYABLE_LLAMA_ERRORS = [
  'context allocation failed',
  'memory allocation failed',
  'gpu memory',
  'vram',
  'cuda',
  'metal',
  'timeout',
  'busy'
];

/**
 * Errors that indicate we should fall back to CPU
 */
const GPU_FALLBACK_ERRORS = [
  'cuda out of memory',
  'metal error',
  'vulkan error',
  'gpu not available',
  'no metal device'
];

/**
 * Check if error is retryable
 */
function isRetryableLlamaError(error) {
  const message = (error.message || '').toLowerCase();
  return RETRYABLE_LLAMA_ERRORS.some((pattern) => message.includes(pattern));
}

/**
 * Check if error suggests GPU fallback
 */
function shouldFallbackToCPU(error) {
  const message = (error.message || '').toLowerCase();
  return GPU_FALLBACK_ERRORS.some((pattern) => message.includes(pattern));
}

/**
 * Wrap Llama operations with resilience
 */
async function withLlamaResilience(operation, options = {}) {
  const {
    maxRetries = 3,
    initialDelay = 1000,
    maxDelay = 5000,
    allowCPUFallback = true,
    onRetry = null,
    onFallback = null
  } = options;

  let lastError = null;
  let usedCPUFallback = false;

  // Try with current GPU setting
  try {
    return await withRetry(operation, {
      maxRetries,
      initialDelay,
      maxDelay,
      shouldRetry: isRetryableLlamaError,
      onRetry: (attempt, error) => {
        logger.warn(`[Resilience] Retry attempt ${attempt}`, { error: error.message });
        if (onRetry) onRetry(attempt, error);
      }
    })();
  } catch (error) {
    lastError = error;

    // Check if we should fall back to CPU
    if (allowCPUFallback && shouldFallbackToCPU(error)) {
      logger.warn('[Resilience] GPU error, falling back to CPU', { error: error.message });

      if (onFallback) onFallback(error);
      usedCPUFallback = true;

      // Retry with CPU
      try {
        return await withRetry(() => operation({ forceCPU: true }), {
          maxRetries: 2,
          initialDelay: 500,
          maxDelay: 2000
        })();
      } catch (cpuError) {
        lastError = cpuError;
      }
    }
  }

  // All retries exhausted
  const enrichedError = new Error(
    `Llama operation failed: ${lastError.message}` +
      (usedCPUFallback ? ' (including CPU fallback)' : '')
  );
  enrichedError.originalError = lastError;
  enrichedError.usedCPUFallback = usedCPUFallback;

  throw enrichedError;
}

/**
 * Wrap Orama persistence operations
 */
async function withOramaResilience(operation, options = {}) {
  const { maxRetries = 3 } = options;

  return withRetry(operation, {
    maxRetries,
    initialDelay: 100,
    maxDelay: 1000,
    shouldRetry: (error) => {
      const message = (error.message || '').toLowerCase();
      // Retry on disk I/O errors
      return (
        message.includes('ebusy') ||
        message.includes('eacces') ||
        message.includes('eperm') ||
        message.includes('enospc')
      );
    }
  })();
}

module.exports = {
  withLlamaResilience,
  withOramaResilience,
  isRetryableLlamaError,
  shouldFallbackToCPU
};

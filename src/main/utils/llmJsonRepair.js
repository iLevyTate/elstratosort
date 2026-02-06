/**
 * Unified JSON repair utility using the AI engine
 *
 * This module consolidates duplicate JSON repair logic from:
 * - documentLlm.js
 * - image analysis
 *
 * @module utils/llmJsonRepair
 */

const { getInstance: getLlamaService } = require('../services/LlamaService');
const { createLogger } = require('../../shared/logger');

const logger = createLogger('AiJsonRepair');
/**
 * Maximum characters to send to LLM for JSON repair
 * Prevents excessive token usage on large malformed responses
 */
const JSON_REPAIR_MAX_CHARS = 4000;

/**
 * Maximum tokens to request from LLM for repaired JSON output
 * Keeps repair responses concise
 */
const JSON_REPAIR_MAX_TOKENS = 400;

/**
 * Unified JSON repair using the AI engine
 *
 * Attempts to repair malformed JSON by sending it to the AI engine with a schema
 * reference. The LLM will output properly formatted JSON matching the schema.
 *
 * @param {Object} client - LlamaService instance (or null to use singleton)
 * @param {string} rawResponse - Malformed JSON string to repair
 * @param {Object} [options={}] - Configuration options
 * @param {Object} options.schema - JSON schema for the expected output format
 * @param {number} [options.maxTokens=400] - Maximum tokens for response
 * @param {string} [options.operation='JSON repair'] - Operation name for logging
 * @returns {Promise<string|null>} Repaired JSON string or null if repair failed
 */
async function attemptJsonRepairWithLlama(client, rawResponse, options = {}) {
  const { schema, maxTokens = JSON_REPAIR_MAX_TOKENS, operation = 'JSON repair' } = options;

  // Validate required inputs
  if (!rawResponse) {
    logger.debug('[JSON-REPAIR] Missing rawResponse, skipping repair');
    return null;
  }

  // If client is not provided, try to get singleton
  const llamaService = client || getLlamaService();

  // Truncate input to prevent excessive token usage
  const trimmed =
    rawResponse.length > JSON_REPAIR_MAX_CHARS
      ? rawResponse.slice(0, JSON_REPAIR_MAX_CHARS)
      : rawResponse;

  // Build repair prompt with schema reference if provided
  const schemaSection = schema
    ? `Schema (for structure reference only):\n${JSON.stringify(schema, null, 2)}\n\n`
    : '';

  const repairPrompt = `You are a JSON repair assistant. Fix the JSON below and output ONLY valid JSON.
Do NOT include any commentary, markdown, or extra text.
${schemaSection}JSON to repair:
${trimmed}`;

  try {
    const result = await llamaService.generateText({
      prompt: repairPrompt,
      maxTokens: Math.min(maxTokens, JSON_REPAIR_MAX_TOKENS),
      temperature: 0
    });

    if (result?.response) {
      logger.debug('[JSON-REPAIR] Successfully repaired JSON', {
        operation,
        inputLength: rawResponse.length,
        outputLength: result.response.length
      });
      return result.response;
    }

    logger.debug('[JSON-REPAIR] No response from repair attempt', { operation });
    return null;
  } catch (error) {
    logger.warn('[JSON-REPAIR] Repair attempt failed', {
      operation,
      error: error.message
    });
    return null;
  }
}

module.exports = {
  attemptJsonRepairWithLlama,
  JSON_REPAIR_MAX_CHARS,
  JSON_REPAIR_MAX_TOKENS
};

import { logger } from '../../../shared/logger';

/**
 * Handles parsing and validation of LLM responses
 */
class LLMResponseParser {
  /**
   * Clean and parse JSON from LLM response
   * @param {string} responseText - Raw text from LLM
   * @returns {Object|null} Parsed object or null if failed
   */
  parse(responseText) {
    if (!responseText) return null;

    try {
      // 1. Try direct parse
      return JSON.parse(responseText);
    } catch (e) {
      // 2. Try extracting JSON from code blocks
      try {
        const jsonMatch = responseText.match(/```json\s*([\s\S]*?)\s*```/) ||
                          responseText.match(/```\s*([\s\S]*?)\s*```/) ||
                          responseText.match(/\{[\s\S]*\}/); // Fallback to finding first brace pair

        if (jsonMatch) {
          const jsonStr = jsonMatch[0].replace(/```json|```/g, '').trim();
          return JSON.parse(jsonStr);
        }
      } catch (innerError) {
        logger.warn('Failed to parse extracted JSON from LLM response', { error: innerError.message });
      }
    }

    return null;
  }

  /**
   * Validate structure of suggestion response
   * @param {Object} data - Parsed data
   * @returns {boolean} True if valid
   */
  validateSuggestions(data) {
    if (!data || !Array.isArray(data.suggestions)) return false;

    // Normalize 'folder' to 'path' if needed to be lenient with LLM
    data.suggestions.forEach(s => {
        if (!s.path && s.folder) {
            s.path = s.folder;
        }
    });

    return data.suggestions.every(s =>
      typeof s.path === 'string' &&
      s.path.length > 0 &&
      (typeof s.confidence === 'number' || typeof s.confidence === 'string')
    );
  }
}

export default LLMResponseParser;

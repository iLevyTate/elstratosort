/**
 * Score formatting and manipulation utilities
 */

/**
 * Format a score (0-1) as a percentage string.
 *
 * @param {number} score - Score value between 0 and 1
 * @returns {string} Formatted percentage or empty string if invalid
 */
export function formatScore(score) {
  if (typeof score !== 'number' || Number.isNaN(score)) return '';
  return `${Math.round(score * 100)}%`;
}

/**
 * Clamp a value to the 0-1 range.
 *
 * @param {number} v - Value to clamp
 * @returns {number} Clamped value between 0 and 1
 */
export function clamp01(v) {
  if (typeof v !== 'number' || Number.isNaN(v)) return 0;
  return Math.max(0, Math.min(1, v));
}

/**
 * Convert a score to an opacity value for visual display.
 * Maps 0-1 score to 0.25-1 opacity range.
 *
 * @param {number} score - Score value between 0 and 1
 * @returns {number} Opacity value between 0.25 and 1
 */
export function scoreToOpacity(score) {
  const s = clamp01(score);
  return 0.25 + s * 0.75;
}

/**
 * Normalize confidence values to a consistent 0-100 percentage scale.
 * Handles both 0-1 scale and 0-100 scale inputs.
 *
 * @param {number} value - Confidence value (0-1 or 0-100)
 * @returns {number} Normalized confidence as integer 0-100
 */
export function normalizeConfidence(value) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return 0;
  // Values in [0, 1] are 0-1 scale (multiply by 100)
  // Values > 1 are assumed to be on 0-100 scale already
  // This avoids the ambiguity window of [1, 2) where a low 0-100 percentage
  // (e.g. 1.5%) would be misinterpreted as a 0-1 scale overflow
  const normalized = value > 1 ? value : value * 100;
  return Math.round(Math.min(100, Math.max(0, normalized)));
}

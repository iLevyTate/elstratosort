/**
 * ReactFlow graph utilities for node positioning and identification
 */

/**
 * Generate a unique ID for a query node.
 *
 * @param {string} query - The search query text
 * @param {string|number} salt - A unique salt value (e.g., timestamp)
 * @returns {string} Unique node ID
 */
export function makeQueryNodeId(query, salt) {
  const short = String(query || '')
    .trim()
    .slice(0, 64)
    .replace(/\s+/g, '_');
  return `query:${short}:${salt}`;
}

/**
 * Calculate default node position in a grid layout.
 *
 * @param {number} index - Node index in the list
 * @returns {{x: number, y: number}} Position coordinates
 */
export function defaultNodePosition(index) {
  const spacingX = 260;
  const spacingY = 90;
  const col = index % 3;
  const row = Math.floor(index / 3);
  return { x: 80 + col * spacingX, y: 80 + row * spacingY };
}

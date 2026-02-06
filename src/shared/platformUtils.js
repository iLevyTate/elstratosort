/**
 * Platform Utilities
 *
 * Centralized module for platform-specific logic to improve cross-platform reliability.
 * Consolidates scattered process.platform checks into reusable functions.
 *
 * This module re-exports utilities from crossPlatformUtils.js and provides
 * additional legacy-compatible APIs for existing code.
 *
 * @see crossPlatformUtils.js for the comprehensive cross-platform implementation
 */

// Import core utilities from crossPlatformUtils
const {
  // Platform Detection
  PLATFORM,
  isWindows,
  isMacOS,
  isLinux,
  isUnix,

  // Executable Resolution
  getExecutableName,
  getPythonCandidates,
  getNvidiaSmiExecutable,

  // Cross-Platform Spawn
  crossSpawn,

  // Accelerator Keys
  getModifierKey,
  getAccelerator,
  getQuitAccelerator: crossGetQuitAccelerator,
  getSettingsAccelerator,

  // Path Handling
  normalizePath: crossNormalizePath,
  joinPath,
  resolvePath,
  isUNCPath,
  safePathJoin,
  getHomeDirectory,
  getPathSeparator: crossGetPathSeparator,

  // Process Management
  getKillCommand: crossGetKillCommand,
  getSleepCommand: crossGetSleepCommand,
  getSpawnOptions: crossGetSpawnOptions,

  // Feature Detection
  isFeatureSupported,
  getFeatureDocumentation
} = require('./crossPlatformUtils');

// ============================================================================
// Legacy-Compatible APIs
// ============================================================================

/**
 * Get npm executable name for the current platform
 * @returns {string} npm executable
 */
function getNpmCommand() {
  return getExecutableName('npm');
}

/**
 * Get NVIDIA SMI executable for GPU detection
 * @returns {string} nvidia-smi executable
 */
function getNvidiaSmiCommand() {
  return getNvidiaSmiExecutable();
}

/**
 * Get sleep/delay command for the current platform
 * @param {number} seconds - Seconds to sleep
 * @returns {Object} Command configuration { cmd, args }
 */
function getSleepCommand(seconds) {
  const result = crossGetSleepCommand(seconds);
  return { cmd: result.command, args: result.args };
}

/**
 * Get process kill command for the current platform
 * @param {number} pid - Process ID to kill
 * @param {boolean} [force=false] - Force kill
 * @returns {Object} Command configuration { cmd, args }
 */
function getKillCommand(pid, force = false) {
  const result = crossGetKillCommand(pid, force);
  return { cmd: result.command, args: result.args };
}

/**
 * Get keyboard shortcut modifier for the current platform
 * @returns {string} 'Cmd' for macOS, 'Ctrl' for others
 */
function getShortcutModifier() {
  return getModifierKey();
}

/**
 * Get quit accelerator for the current platform
 * @returns {string} Keyboard accelerator string
 */
function getQuitAccelerator() {
  return crossGetQuitAccelerator();
}

/**
 * Get home directory for the current user
 * @returns {string} Home directory path
 */
function getHomeDir() {
  return getHomeDirectory();
}

/**
 * Get platform-specific path separator
 * @returns {string} Path separator
 */
function getPathSeparator() {
  return crossGetPathSeparator();
}

/**
 * Normalize a path for the current platform
 * @param {string} inputPath - Path to normalize
 * @returns {string} Normalized path
 */
function normalizePath(inputPath) {
  return crossNormalizePath(inputPath);
}

/**
 * Get spawn options with platform-appropriate defaults
 * @param {Object} [options={}] - Additional options
 * @returns {Object} Spawn options
 */
function getSpawnOptions(options = {}) {
  const { forceShell = false, ...rest } = options;
  return crossGetSpawnOptions({ useShell: forceShell, ...rest });
}

// ============================================================================
// Exports
// ============================================================================

module.exports = {
  // Platform detection
  PLATFORM,
  isWindows,
  isMacOS,
  isLinux,
  isUnix,

  // Command helpers (legacy API)
  getNpmCommand,
  getNvidiaSmiCommand,
  getSleepCommand,
  getKillCommand,

  // Process helpers
  getSpawnOptions,

  // UI helpers
  getShortcutModifier,
  getQuitAccelerator,

  // Path helpers
  getHomeDir,
  getPathSeparator,
  normalizePath,

  // New cross-platform utilities (recommended for new code)
  crossSpawn,
  getExecutableName,
  getPythonCandidates,
  getAccelerator,
  getSettingsAccelerator,
  getModifierKey,
  joinPath,
  resolvePath,
  isUNCPath,
  safePathJoin,
  isFeatureSupported,
  getFeatureDocumentation
};

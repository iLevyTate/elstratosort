/**
 * IPC Validator
 *
 * Provides event source and result validation helpers.
 */

function createIpcValidator({ log: _log } = {}) {
  /**
   * Validate event source to prevent spoofing.
   *
   * In the preload/renderer context, ipcRenderer.on() events are delivered
   * exclusively by the main process via webContents.send(). The event.sender
   * is the IpcRenderer instance (not a WebContents), so WebContents-specific
   * properties like .id (positive integer) and .getURL() do not exist.
   *
   * We perform structural validation appropriate for the renderer context:
   *   1. `event` must be a non-null object.
   *   2. `event.sender` must exist and be an object (the IpcRenderer instance).
   *   3. If `event.senderFrame` is present (Electron >= 22), its `url` must be
   *      a string (additional structural check).
   */
  const validateEventSource = (event) => {
    if (!event || typeof event !== 'object') {
      return false;
    }

    // Verify sender exists and is an object (IpcRenderer in renderer context)
    if (!event.sender || typeof event.sender !== 'object') {
      return false;
    }

    // If senderFrame is present, verify its url is a string (structural check)
    if (event.senderFrame && typeof event.senderFrame.url !== 'string') {
      return false;
    }

    return true;
  };

  /**
   * Validate system metrics data structure
   */
  const isValidSystemMetrics = (data) => {
    if (!data || typeof data !== 'object') return false;
    const hasUptime = typeof data.uptime === 'number' || typeof data.uptime === 'string';
    const hasMemory =
      (typeof data.memory === 'object' && data.memory !== null) ||
      typeof data.memory?.used === 'number';
    return hasUptime || hasMemory;
  };

  /**
   * Validate IPC results
   */
  const validateResult = (result, channel) => {
    switch (channel) {
      case 'system:get-metrics':
        return isValidSystemMetrics(result) ? result : null;
      case 'files:select-directory':
        return result && typeof result === 'object' && result.success !== undefined
          ? result
          : { success: false, path: null };
      case 'smart-folders:get-custom':
        return Array.isArray(result) ? result : [];
      default:
        return result;
    }
  };

  return {
    validateEventSource,
    validateResult,
    isValidSystemMetrics
  };
}

module.exports = {
  createIpcValidator
};

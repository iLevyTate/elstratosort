import { requireElectronAPI } from './electronApi';

/**
 * LlamaIpc - IPC interface for in-process LLM operations
 *
 * In-process node-llama-cpp based LlamaService.
 * No external server required - all operations are local.
 */
export const llamaIpc = {
  /**
   * Get list of downloaded GGUF models
   */
  getModels() {
    return requireElectronAPI().llama.getModels();
  },

  /**
   * Get current LlamaService configuration
   */
  getConfig() {
    return requireElectronAPI().llama.getConfig();
  },

  /**
   * Update LlamaService configuration
   */
  updateConfig(config) {
    return requireElectronAPI().llama.updateConfig(config);
  },

  /**
   * Test if LlamaService is ready (model loaded)
   */
  testConnection() {
    return requireElectronAPI().llama.testConnection();
  },

  /**
   * Download a GGUF model
   */
  downloadModel(modelName) {
    return requireElectronAPI().llama.downloadModel(modelName);
  },

  /**
   * Delete a downloaded model
   */
  deleteModel(modelName) {
    return requireElectronAPI().llama.deleteModel(modelName);
  },

  /**
   * Get download status for models
   */
  getDownloadStatus() {
    return requireElectronAPI().llama.getDownloadStatus();
  }
};

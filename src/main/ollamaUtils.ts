import { Ollama } from 'ollama';
import fs from 'fs/promises';
import path from 'path';
import { logger } from '../shared/logger';

// Optional: set context for clearer log origins
logger.setContext('ollama-utils');

let userDataPath: string | null = null;

// Initialize user data path - allows injection for worker threads
function initialize(customUserDataPath?: string) {
  if (customUserDataPath) {
    userDataPath = customUserDataPath;
  } else {
    try {
      // Try to get from Electron if available (Main process)
      const { app } = require('electron');
      userDataPath = app.getPath('userData');
    } catch (e) {
      // In worker thread without injection, this will remain null until set
      // or fail when used
    }
  }
}

// Try to initialize immediately if possible (main process)
initialize(undefined);

// Path for storing Ollama configuration, e.g., selected model
const getOllamaConfigPath = () => {
  if (!userDataPath) {
    // Try one last time if not set (e.g. lazy loading in main)
    initialize(undefined);
    if (!userDataPath) {
      throw new Error('UserData path not initialized in ollamaUtils');
    }
  }
  return path.join(userDataPath, 'ollama-config.json');
};

let ollamaInstance: Ollama | null = null;
let ollamaHost = 'http://127.0.0.1:11434';
let ollamaInstanceHost: string | null = null; // MEDIUM PRIORITY FIX (MED-13): Track host used to create instance
// Selected models persisted in userData config
let selectedTextModel: string | null = null;
let selectedVisionModel: string | null = null;
let selectedEmbeddingModel: string | null = null;

// Function to initialize or get the Ollama instance
function getOllama() {
  // MEDIUM PRIORITY FIX (MED-13): Invalidate instance if host has changed
  if (ollamaInstance && ollamaInstanceHost !== ollamaHost) {
    logger.info(
      `[OLLAMA] Host changed from ${ollamaInstanceHost} to ${ollamaHost}, recreating instance`,
    );
    ollamaInstance = null;
    ollamaInstanceHost = null;
  }

  if (!ollamaInstance) {
    // Host is configurable via environment variables or saved config
    // Reuse a single client and enable keep-alive where supported
    // The Ollama client uses node-fetch internally; when an agent is supported,
    // pass it here to keep connections warm.
    try {
      const http = require('http');
      const https = require('https');
      const isHttps = ollamaHost.startsWith('https://');
      const agent = isHttps
        ? new https.Agent({ keepAlive: true, maxSockets: 10 })
        : new http.Agent({ keepAlive: true, maxSockets: 10 });
      ollamaInstance = new Ollama({
        host: ollamaHost,
        fetch: (url: RequestInfo | URL, opts: RequestInit = {}) => {
          return (global.fetch || require('node-fetch'))(url, {
            agent,
            ...opts,
          } as RequestInit);
        },
      });
    } catch {
      ollamaInstance = new Ollama({ host: ollamaHost });
    }
    // MEDIUM PRIORITY FIX (MED-13): Remember the host used for this instance
    ollamaInstanceHost = ollamaHost;
  }
  return ollamaInstance;
}

// Function to get the currently configured Ollama text model
function getOllamaModel() {
  return selectedTextModel;
}

// Function to get the currently configured Ollama vision model
function getOllamaVisionModel() {
  return selectedVisionModel;
}

function getOllamaEmbeddingModel() {
  return selectedEmbeddingModel;
}

// Function to set/update the Ollama model
async function setOllamaModel(modelName: string): Promise<void> {
  selectedTextModel = modelName;
  try {
    const current = await loadOllamaConfig();
    await saveOllamaConfig({
      ...current,
      selectedTextModel: modelName,
      // Keep legacy field for backward compatibility
      selectedModel: modelName,
    });
    logger.info(`[OLLAMA] Text model set to: ${modelName} and saved.`);
  } catch (error) {
    logger.error('[OLLAMA] Error saving text model selection', { error });
  }
}

async function setOllamaVisionModel(modelName: string): Promise<void> {
  selectedVisionModel = modelName;
  try {
    const current = await loadOllamaConfig();
    await saveOllamaConfig({
      ...current,
      selectedVisionModel: modelName,
    });
    logger.info(`[OLLAMA] Vision model set to: ${modelName} and saved.`);
  } catch (error) {
    logger.error('[OLLAMA] Error saving vision model selection', { error });
  }
}

async function setOllamaEmbeddingModel(modelName: string): Promise<void> {
  selectedEmbeddingModel = modelName;
  try {
    const current = await loadOllamaConfig();
    await saveOllamaConfig({
      ...current,
      selectedEmbeddingModel: modelName,
    });
    logger.info(`[OLLAMA] Embedding model set to: ${modelName} and saved.`);
  } catch (error) {
    logger.error('[OLLAMA] Error saving embedding model selection', { error });
  }
}

function getOllamaHost() {
  return ollamaHost;
}

async function setOllamaHost(host: string): Promise<void> {
  try {
    if (typeof host === 'string' && host.trim()) {
      let normalizedHost = host.trim();

      // Fixed: Normalize URL - ensure it has protocol but don't double it
      // Remove any existing protocol
      normalizedHost = normalizedHost.replace(/^https?:\/\//i, '');
      // Add http:// if no protocol specified (default to http)
      if (
        !normalizedHost.startsWith('http://') &&
        !normalizedHost.startsWith('https://')
      ) {
        normalizedHost = `http://${normalizedHost}`;
      }

      ollamaHost = normalizedHost;
      // Recreate client with new host
      try {
        const http = require('http');
        const https = require('https');
        const isHttps = ollamaHost.startsWith('https://');
        const agent = isHttps
          ? new https.Agent({ keepAlive: true, maxSockets: 10 })
          : new http.Agent({ keepAlive: true, maxSockets: 10 });
        ollamaInstance = new Ollama({
          host: ollamaHost,
          fetch: (url: RequestInfo | URL, opts: RequestInit = {}) => {
            return (global.fetch || require('node-fetch'))(url, {
              agent,
              ...opts,
            } as RequestInit);
          },
        });
      } catch {
        ollamaInstance = new Ollama({ host: ollamaHost });
      }
      const current = await loadOllamaConfig();
      await saveOllamaConfig({ ...current, host: ollamaHost });
      logger.info(`[OLLAMA] Host set to: ${ollamaHost}`);
    }
  } catch (error: unknown) {
    logger.error('[OLLAMA] Error setting host', { error });
  }
}

// Load Ollama configuration (e.g., last selected model).
// If the config file contains invalid JSON, it is renamed to "*.bak" and
// defaults are returned so the app can recover on next launch.
async function loadOllamaConfig() {
  const filePath = getOllamaConfigPath();
  let config = null;

  try {
    const data = await fs.readFile(filePath, 'utf-8');
    try {
      config = JSON.parse(data);
    } catch (parseError) {
      logger.error(
        '[OLLAMA] Invalid JSON in Ollama config, backing up and using defaults',
        { error: parseError },
      );
      try {
        await fs.rename(filePath, `${filePath}.bak`);
      } catch (renameError) {
        logger.error('[OLLAMA] Error backing up corrupt Ollama config file', {
          error: renameError,
        });
      }
    }
  } catch (error: unknown) {
    // It's okay if the file doesn't exist on first run
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
      logger.error('[OLLAMA] Error loading Ollama config', { error });
    }
  }

  if (config) {
    // Support legacy and new keys
    if (config.selectedTextModel || config.selectedModel) {
      selectedTextModel = config.selectedTextModel || config.selectedModel;
      logger.info(`[OLLAMA] Loaded selected text model: ${selectedTextModel}`);
    }
    if (config.selectedVisionModel) {
      selectedVisionModel = config.selectedVisionModel;
      logger.info(
        `[OLLAMA] Loaded selected vision model: ${selectedVisionModel}`,
      );
    }
    if (config.selectedEmbeddingModel) {
      selectedEmbeddingModel = config.selectedEmbeddingModel;
      logger.info(
        `[OLLAMA] Loaded selected embedding model: ${selectedEmbeddingModel}`,
      );
    }
    if (config.host) {
      ollamaHost = config.host;
      // HIGH PRIORITY FIX: Invalidate existing instance so getOllama() recreates with keep-alive agent
      // Previously this created a new instance directly without the keep-alive configuration
      ollamaInstance = null;
      ollamaInstanceHost = null;
      logger.info(`[OLLAMA] Loaded host: ${ollamaHost}, instance will be recreated with keep-alive on next use`);
    }
    return config;
  }

  // Fallback to a default model or leave as null if no configuration is found
  // You might want to fetch available models and pick one if ollamaModel is still null
  // For now, let's assume a default if nothing is loaded.
  if (!selectedTextModel) {
    // Try to get the first available model or a known default
    try {
      const ollama = getOllama();
      const modelsResponse = await ollama.list();
      if (modelsResponse.models && modelsResponse.models.length > 0) {
        // Prioritize models like 'llama2', 'mistral', or common ones
        const preferredModels = ['llama3', 'llama2', 'mistral', 'phi'];
        let foundModel = null;
        for (const prefModel of preferredModels) {
          const model = modelsResponse.models.find((m) =>
            m.name.includes(prefModel),
          );
          if (model) {
            foundModel = model.name;
            break;
          }
        }
        if (!foundModel) {
          foundModel = modelsResponse.models[0].name; // Fallback to the first model
        }
        await setOllamaModel(foundModel);
        logger.info(
          `[OLLAMA] No saved text model found, defaulted to: ${selectedTextModel}`,
        );
      } else {
        logger.warn('[OLLAMA] No models available from Ollama server.');
      }
    } catch (listError) {
      logger.error('[OLLAMA] Error fetching model list during initial load', {
        error: listError,
      });
    }
  }
  return { selectedTextModel, selectedVisionModel, host: ollamaHost };
}

// Save Ollama configuration
async function saveOllamaConfig(config: Record<string, unknown>): Promise<void> {
  try {
    const filePath = getOllamaConfigPath();
    await fs.writeFile(filePath, JSON.stringify(config, null, 2));
  } catch (error: unknown) {
    logger.error('[OLLAMA] Error saving Ollama config', { error });
    throw error; // Re-throw to indicate save failure
  }
}

// Re-export buildOllamaOptions from PerformanceService for convenience
export { buildOllamaOptions } from './services/PerformanceService';

export {
  initialize,
  getOllama,
  getOllama as getOllamaClient,
  getOllamaModel,
  getOllamaVisionModel,
  getOllamaEmbeddingModel,
  setOllamaModel,
  setOllamaVisionModel,
  setOllamaEmbeddingModel,
  getOllamaHost,
  setOllamaHost,
  getOllamaConfigPath,
  loadOllamaConfig,
  saveOllamaConfig,
};

// src/main/services/ModelDownloadManager.js

const path = require('path');
const fs = require('fs').promises;
const { createWriteStream } = require('fs');
const { app } = require('electron');
const https = require('https');
const http = require('http');
const crypto = require('crypto');
const { createLogger } = require('../../shared/logger');
const { MODEL_CATALOG } = require('../../shared/modelRegistry');

const logger = createLogger('ModelDownloadManager');

class ModelDownloadManager {
  constructor() {
    this._modelPath = path.join(app.getPath('userData'), 'models');
    this._downloads = new Map(); // filename -> download state
    this._progressCallbacks = new Set();
  }

  async initialize() {
    await fs.mkdir(this._modelPath, { recursive: true });
  }

  /**
   * Get list of downloaded models
   */
  async getDownloadedModels() {
    try {
      const files = await fs.readdir(this._modelPath);
      const ggufFiles = files.filter((f) => f.endsWith('.gguf'));

      return Promise.all(
        ggufFiles.map(async (filename) => {
          const filePath = path.join(this._modelPath, filename);
          const stats = await fs.stat(filePath);
          const registryInfo = MODEL_CATALOG[filename] || {};

          return {
            filename,
            path: filePath,
            sizeBytes: stats.size,
            sizeMB: Math.round(stats.size / 1024 / 1024),
            type: registryInfo.type || 'unknown',
            displayName: registryInfo.displayName || filename,
            isComplete: !filename.endsWith('.partial')
          };
        })
      );
    } catch {
      return [];
    }
  }

  /**
   * Check available disk space
   */
  async checkDiskSpace(requiredBytes) {
    // Platform-specific disk space check
    const { execSync } = require('child_process');

    try {
      if (process.platform === 'win32') {
        const drive = this._modelPath.charAt(0);
        const output = execSync(
          `wmic logicaldisk where "DeviceID='${drive}:'" get FreeSpace`
        ).toString();
        const freeSpace = parseInt(output.split('\n')[1].trim());
        return { available: freeSpace, sufficient: freeSpace > requiredBytes * 1.1 };
      } else {
        const output = execSync(`df -k "${this._modelPath}"`).toString();
        const lines = output.trim().split('\n');
        const parts = lines[1].split(/\s+/);
        const freeSpace = parseInt(parts[3]) * 1024;
        return { available: freeSpace, sufficient: freeSpace > requiredBytes * 1.1 };
      }
    } catch (error) {
      logger.warn('[Download] Could not check disk space', error);
      return { available: null, sufficient: true }; // Assume OK if check fails
    }
  }

  /**
   * Download a model with progress tracking and resume support
   */
  async downloadModel(filename, options = {}) {
    const modelInfo = MODEL_CATALOG[filename];
    if (!modelInfo) {
      throw new Error(`Unknown model: ${filename}`);
    }

    const { onProgress, signal } = options;
    const filePath = path.join(this._modelPath, filename);
    const partialPath = filePath + '.partial';

    // Check disk space
    const spaceCheck = await this.checkDiskSpace(modelInfo.size);
    if (!spaceCheck.sufficient) {
      throw new Error(
        `Insufficient disk space. Need ${Math.round(modelInfo.size / 1024 / 1024 / 1024)}GB, ` +
          `have ${Math.round(spaceCheck.available / 1024 / 1024 / 1024)}GB`
      );
    }

    // Check for existing partial download
    let startByte = 0;
    try {
      const partialStats = await fs.stat(partialPath);
      startByte = partialStats.size;
      logger.info(`[Download] Resuming from byte ${startByte}`);
    } catch {
      // No partial file, start fresh
    }

    // Create an internal AbortController so cancelDownload() can work
    const internalAbortController = new AbortController();

    // Track download state
    const downloadState = {
      filename,
      url: modelInfo.url,
      totalBytes: modelInfo.size,
      downloadedBytes: startByte,
      startByte, // Track initial byte offset for accurate speed calculation
      startTime: Date.now(),
      status: 'downloading',
      abortController: internalAbortController
    };
    this._downloads.set(filename, downloadState);

    // Use redirect URL if provided (for following HTTP redirects), with a max redirect limit
    const downloadUrl = options._redirectUrl || modelInfo.url;
    const redirectCount = options._redirectCount || 0;
    const MAX_REDIRECTS = 5;

    return new Promise((resolve, reject) => {
      const url = new URL(downloadUrl);
      const protocol = url.protocol === 'https:' ? https : http;

      const requestOptions = {
        hostname: url.hostname,
        path: url.pathname + url.search,
        headers: {
          'User-Agent': 'StratoSort/2.0',
          ...(startByte > 0 ? { Range: `bytes=${startByte}-` } : {})
        }
      };

      const request = protocol.get(requestOptions, (response) => {
        // Handle redirects with loop protection
        if (response.statusCode === 301 || response.statusCode === 302) {
          if (redirectCount >= MAX_REDIRECTS) {
            reject(new Error(`Too many redirects (${MAX_REDIRECTS})`));
            return;
          }
          this.downloadModel(filename, {
            ...options,
            _redirectUrl: response.headers.location,
            _redirectCount: redirectCount + 1
          })
            .then(resolve)
            .catch(reject);
          return;
        }

        if (response.statusCode !== 200 && response.statusCode !== 206) {
          reject(new Error(`HTTP ${response.statusCode}: ${response.statusMessage}`));
          return;
        }

        const writeStream = createWriteStream(partialPath, {
          flags: startByte > 0 ? 'a' : 'w'
        });

        let downloaded = startByte;
        const total = modelInfo.size;

        response.on('data', (chunk) => {
          downloaded += chunk.length;
          downloadState.downloadedBytes = downloaded;

          const progress = {
            filename,
            downloadedBytes: downloaded,
            totalBytes: total,
            percent: Math.round((downloaded / total) * 100),
            speedBps: this._calculateSpeed(downloadState),
            etaSeconds: this._calculateETA(downloadState)
          };

          if (onProgress) onProgress(progress);
          this._notifyProgress(progress);
        });

        response.pipe(writeStream);

        writeStream.on('finish', async () => {
          // Verify file size
          const stats = await fs.stat(partialPath);
          if (stats.size !== modelInfo.size) {
            downloadState.status = 'incomplete';
            reject(new Error('Download incomplete - file size mismatch'));
            return;
          }

          // Verify checksum if available
          const expectedChecksum = modelInfo.checksum || modelInfo.sha256;
          if (expectedChecksum) {
            const isValid = await this._verifyChecksum(partialPath, expectedChecksum);
            if (!isValid) {
              downloadState.status = 'corrupted';
              await fs.unlink(partialPath);
              reject(new Error('Download corrupted - checksum mismatch'));
              return;
            }
          }

          // Rename to final filename
          await fs.rename(partialPath, filePath);
          downloadState.status = 'complete';
          this._downloads.delete(filename);

          logger.info(`[Download] Completed: ${filename}`);
          resolve({ success: true, path: filePath });
        });

        writeStream.on('error', (error) => {
          downloadState.status = 'error';
          reject(error);
        });

        // Handle abort signals: internal (from cancelDownload) + external (from caller)
        const onAbort = () => {
          request.destroy();
          writeStream.close();
          downloadState.status = 'cancelled';
          reject(new Error('Download cancelled'));
        };
        internalAbortController.signal.addEventListener('abort', onAbort);
        if (signal) {
          signal.addEventListener('abort', onAbort);
        }
      });

      request.on('error', (error) => {
        downloadState.status = 'error';
        reject(error);
      });

      request.setTimeout(30000, () => {
        request.destroy();
        reject(new Error('Download timeout'));
      });
    });
  }

  /**
   * Get current download status for all active downloads
   * @returns {{ active: number, downloads: Object[] }}
   */
  getStatus() {
    const downloads = [];
    for (const [filename, state] of this._downloads) {
      downloads.push({
        filename,
        status: state.status,
        progress: state.totalBytes
          ? Math.round((state.downloadedBytes / state.totalBytes) * 100)
          : 0,
        totalBytes: state.totalBytes || 0,
        downloadedBytes: state.downloadedBytes || 0
      });
    }
    return { active: downloads.length, downloads };
  }

  /**
   * Cancel an in-progress download
   */
  cancelDownload(filename) {
    const download = this._downloads.get(filename);
    if (download && download.abortController) {
      download.abortController.abort();
      return true;
    }
    return false;
  }

  /**
   * Delete a downloaded model
   */
  async deleteModel(filename) {
    const filePath = path.join(this._modelPath, filename);
    const partialPath = filePath + '.partial';

    try {
      await fs.unlink(filePath);
    } catch {
      /* ignore */
    }

    try {
      await fs.unlink(partialPath);
    } catch {
      /* ignore */
    }

    logger.info(`[Download] Deleted model: ${filename}`);
    return { success: true };
  }

  /**
   * Register progress callback
   */
  onProgress(callback) {
    this._progressCallbacks.add(callback);
    return () => this._progressCallbacks.delete(callback);
  }

  _notifyProgress(progress) {
    this._progressCallbacks.forEach((cb) => {
      try {
        cb(progress);
      } catch {
        /* ignore */
      }
    });
  }

  _calculateSpeed(state) {
    const elapsed = (Date.now() - state.startTime) / 1000;
    if (elapsed < 1) return 0;
    // Subtract startByte to only measure bytes downloaded in THIS session
    const sessionBytes = state.downloadedBytes - (state.startByte || 0);
    return Math.round(sessionBytes / elapsed);
  }

  _calculateETA(state) {
    const speed = this._calculateSpeed(state);
    if (speed === 0) return Infinity;
    const remaining = state.totalBytes - state.downloadedBytes;
    return Math.round(remaining / speed);
  }

  async _verifyChecksum(filePath, expectedHash) {
    return new Promise((resolve, reject) => {
      const hash = crypto.createHash('sha256');
      const stream = require('fs').createReadStream(filePath);

      stream.on('data', (chunk) => hash.update(chunk));
      stream.on('end', () => {
        const actualHash = hash.digest('hex');
        resolve(actualHash === expectedHash);
      });
      stream.on('error', reject);
    });
  }
}

// Singleton
let instance = null;
function getInstance() {
  if (!instance) {
    instance = new ModelDownloadManager();
  }
  return instance;
}

module.exports = { ModelDownloadManager, getInstance };

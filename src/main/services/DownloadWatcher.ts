import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import chokidar from 'chokidar';
import { logger } from '../../shared/logger';

logger.setContext('DownloadWatcher');

// Simple utility to determine if a path is an image based on extension
const IMAGE_EXTENSIONS = new Set([
  '.png',
  '.jpg',
  '.jpeg',
  '.gif',
  '.bmp',
  '.webp',
  '.tiff',
  '.svg',
  '.heic',
]);

class DownloadWatcher {
  watcher: any;
  analyzeDocumentFile: any;
  analyzeImageFile: any;
  getCustomFolders: any;
  autoOrganizeService: any;
  settingsService: any;

  constructor({
    analyzeDocumentFile,
    analyzeImageFile,
    getCustomFolders,
    autoOrganizeService,
    settingsService,
  }: any) {
    this.analyzeDocumentFile = analyzeDocumentFile;
    this.analyzeImageFile = analyzeImageFile;
    this.getCustomFolders = getCustomFolders;
    this.autoOrganizeService = autoOrganizeService;
    this.settingsService = settingsService;
    this.watcher = null;
  }

  start() {
    if (this.watcher) return;

    try {
      const downloadsPath = path.join(os.homedir(), 'Downloads');
      logger.info('[DOWNLOAD-WATCHER] Watching', downloadsPath);
      // PERFORMANCE FIX: Optimize chokidar watcher configuration
      // - ignoreInitial: Don't process existing files on startup
      // - ignored: Ignore common temp/system files to reduce overhead
      // - awaitWriteFinish: Wait for file writes to complete before processing
      this.watcher = chokidar.watch(downloadsPath, {
        ignoreInitial: true,
        ignored: [
          /(^|[\\/\\])\../, // Ignore dotfiles
          /\.tmp$/, // Ignore temp files
          /\.crdownload$/, // Chrome download temp files
          /\.part$/, // Firefox download temp files
          /\.!qB$/, // qBittorrent temp files
        ],
        awaitWriteFinish: {
          stabilityThreshold: 2000, // Wait 2s after last change
          pollInterval: 100, // Check every 100ms
        },
      });

      this.watcher.on('add', async (filePath: string) => {
        try {
          await this.handleFile(filePath);
        } catch (e: any) {
          logger.error('Failed processing file', {
            filePath,
            error: e.message,
            stack: e.stack,
          });
        }
      });

      this.watcher.on('error', (error: Error) => {
        logger.error('[DOWNLOAD-WATCHER] Watcher error:', error);
      });
    } catch (error) {
      logger.error('[DOWNLOAD-WATCHER] Failed to start watcher:', error);
      this.watcher = null;
    }
  }

  stop() {
    if (this.watcher) {
      try {
        // Remove all listeners before closing
        this.watcher.removeAllListeners();
        this.watcher.close();
        logger.info('[DOWNLOAD-WATCHER] Stopped watching downloads');
      } catch (error) {
        logger.error('[DOWNLOAD-WATCHER] Error stopping watcher:', error);
      } finally {
        this.watcher = null;
      }
    }
  }

  async handleFile(filePath: string) {
    const ext = path.extname(filePath).toLowerCase();
    // CRITICAL FIX: Skip temporary files, lock files, and git files
    if (
      ext === '' ||
      ext.endsWith('crdownload') ||
      ext.endsWith('tmp') ||
      ext === '.lock' ||
      filePath.includes('.git') ||
      filePath.includes('node_modules') ||
      path.basename(filePath).startsWith('.')
    ) {
      logger.debug(
        '[DOWNLOAD-WATCHER] Skipping system/temporary file:',
        filePath,
      );
      return;
    }

    // CRITICAL FIX: Verify file exists before processing
    // Files may be deleted quickly (e.g., git lock files)
    try {
      await fs.access(filePath);
    } catch (error: any) {
      if (error.code === 'ENOENT') {
        logger.debug(
          '[DOWNLOAD-WATCHER] File no longer exists, skipping:',
          filePath,
        );
        return;
      }
      throw error;
    }

    const folders = this.getCustomFolders().filter((f: any) => f && f.path);

    // Try to use the new auto-organize service if available
    if (this.autoOrganizeService && this.settingsService) {
      try {
        const settings = await this.settingsService.load();

        // Use the new auto-organize service with suggestions
        const result = await this.autoOrganizeService.processNewFile(
          filePath,
          folders,
          {
            autoOrganizeEnabled: settings.autoOrganize,
            confidenceThreshold: settings.downloadConfidenceThreshold || 0.9,
            defaultLocation: settings.defaultSmartFolderLocation || 'Documents',
          },
        );

        if (result && result.destination) {
          // CRITICAL FIX: Verify file still exists before renaming
          try {
            await fs.access(filePath);
          } catch (error: any) {
            if (error.code === 'ENOENT') {
              logger.debug(
                '[DOWNLOAD-WATCHER] File deleted before organization, skipping:',
                filePath,
              );
              return;
            }
            throw error;
          }

          await fs.mkdir(path.dirname(result.destination), { recursive: true });
          await fs.rename(filePath, result.destination);
          logger.info(
            '[DOWNLOAD-WATCHER] Auto-organized file',
            {
              confidence: Math.round(result.confidence * 100) + '%',
              from: filePath,
              to: result.destination,
            },
          );
          return;
        } else {
          logger.info(
            '[DOWNLOAD-WATCHER] File not auto-organized (low confidence or disabled)',
          );
          return;
        }
      } catch (e) {
        logger.warn(
          '[DOWNLOAD-WATCHER] Auto-organize service failed, falling back:',
          e,
        );
        // Fall through to original logic
      }
    }

    // Fallback to original logic
    // CRITICAL FIX: Verify file still exists before fallback processing
    try {
      await fs.access(filePath);
    } catch (error: any) {
      if (error.code === 'ENOENT') {
        logger.debug(
          '[DOWNLOAD-WATCHER] File no longer exists for fallback, skipping:',
          filePath,
        );
        return;
      }
      throw error;
    }

    const folderCategories = folders.map((f: any) => ({
      name: f.name,
      description: f.description || '',
      id: f.id,
    }));

    let result;
    try {
      if (IMAGE_EXTENSIONS.has(ext)) {
        result = await this.analyzeImageFile(filePath, folderCategories);
      } else {
        result = await this.analyzeDocumentFile(filePath, folderCategories);
      }
    } catch (e) {
      logger.error('[DOWNLOAD-WATCHER] Analysis failed', e);
      return;
    }

    const destFolder = this.resolveDestinationFolder(result, folders);
    if (!destFolder) return;
    try {
      // CRITICAL FIX: Verify file still exists before renaming in fallback
      try {
        await fs.access(filePath);
      } catch (error: any) {
        if (error.code === 'ENOENT') {
          logger.debug(
            '[DOWNLOAD-WATCHER] File deleted before fallback rename, skipping:',
            filePath,
          );
          return;
        }
        throw error;
      }

      await fs.mkdir(destFolder.path, { recursive: true });
      const baseName = path.basename(filePath);
      const extname = path.extname(baseName);
      const newName = result.suggestedName
        ? `${result.suggestedName}${extname}`
        : baseName;
      const destPath = path.join(destFolder.path, newName);
      await fs.rename(filePath, destPath);
      logger.info('[DOWNLOAD-WATCHER] Moved file (fallback)', {
        from: filePath,
        to: destPath,
      });
    } catch (e) {
      logger.error('[DOWNLOAD-WATCHER] Failed to move file', e);
    }
  }

  resolveDestinationFolder(result: any, folders: any[]) {
    if (!result) return null;
    // Prefer explicit smartFolder id
    if (result.smartFolder && result.smartFolder.id) {
      return folders.find((f) => f.id === result.smartFolder.id);
    }
    // Try folder match candidates
    if (Array.isArray(result.folderMatchCandidates)) {
      for (const cand of result.folderMatchCandidates) {
        const found = folders.find(
          (f: any) => f.id === cand.id || f.name === cand.name,
        );
        if (found) return found;
      }
    }
    // Fallback to category name match
    if (result.category) {
      return folders.find(
        (f: any) => f.name.toLowerCase() === result.category.toLowerCase(),
      );
    }
    return null;
  }
}

export default DownloadWatcher;

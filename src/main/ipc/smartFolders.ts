import path from 'path';
import { promises as fs } from 'fs';
import { app } from 'electron';
import { getOllama as getOllamaClient } from '../ollamaUtils';
import { enhanceSmartFolderWithLLM } from '../services/SmartFoldersLLMService';

import {
  validateIpc,
  withRequestId,
  withErrorHandling,
  compose,
} from './validation';
import {
  SmartFolderAddSchema,
  SmartFolderEditSchema,
  SmartFolderDeleteSchema,
} from './schemas';

/**
 * CRITICAL SECURITY FIX: Sanitize and validate folder paths to prevent path traversal attacks
 * @param {string} inputPath - User-provided path to validate
 * @returns {string} - Sanitized, validated path
 * @throws {Error} - If path is invalid or violates security constraints
 */
function sanitizeFolderPath(inputPath: string): string {
  if (!inputPath || typeof inputPath !== 'string') {
    throw new Error('Invalid path: must be non-empty string');
  }

  // Normalize and resolve path
  const normalized = path.normalize(path.resolve(inputPath));

  // Check for null bytes (path injection attack)
  if (normalized.includes('\0')) {
    throw new Error('Invalid path: contains null bytes');
  }

  // Define allowed base paths (user directories only)
  const ALLOWED_BASE_PATHS = [
    app.getPath('userData'), // App data directory
    app.getPath('documents'), // User documents
    app.getPath('downloads'), // Downloads
    app.getPath('desktop'), // Desktop
    app.getPath('pictures'), // Pictures
    app.getPath('videos'), // Videos
    app.getPath('music'), // Music
    app.getPath('home'), // Home directory
  ];

  // Check if path is within allowed directories
  const isAllowed = ALLOWED_BASE_PATHS.some((basePath) => {
    const normalizedBase = path.normalize(path.resolve(basePath));
    return (
      normalized.startsWith(normalizedBase + path.sep) ||
      normalized === normalizedBase
    );
  });

  if (!isAllowed) {
    throw new Error(
      'Invalid path: must be within allowed directories (Documents, Downloads, Desktop, Pictures, Videos, Music, or Home)',
    );
  }

  // Block access to system directories
  const dangerousPaths = [
    '/etc',
    '/sys',
    '/proc',
    '/dev',
    '/boot',
    'C:\\Windows',
    'C:\\Program Files',
    'C:\\Program Files (x86)',
    '/System',
    '/Library/System',
    '/private/etc',
    '/private/var',
  ];

  const normalizedLower = normalized.toLowerCase();
  const isDangerous = dangerousPaths.some((dangerous) =>
    normalizedLower.startsWith(dangerous.toLowerCase()),
  );

  if (isDangerous) {
    throw new Error('Invalid path: access to system directories not allowed');
  }

  return normalized;
}

interface SmartFolder {
  id: string;
  name: string;
  path: string;
  category?: string;
  description?: string;
  keywords?: string[];
  isDefault?: boolean;
}

interface SmartFolderIpcDependencies {
  ipcMain: Electron.IpcMain;
  IPC_CHANNELS: { SMART_FOLDERS: Record<string, string> };
  logger: {
    setContext: (ctx: string) => void;
    info: (...args: unknown[]) => void;
    warn: (...args: unknown[]) => void;
    error: (...args: unknown[]) => void;
    debug: (...args: unknown[]) => void;
  };
  getCustomFolders: () => SmartFolder[];
  setCustomFolders: (folders: SmartFolder[]) => void;
  saveCustomFolders: () => Promise<void>;
  buildOllamaOptions: () => unknown;
  getOllamaModel: () => string;
  scanDirectory: (path: string) => Promise<{ files: string[] }>;
}

function registerSmartFoldersIpc({
  ipcMain,
  IPC_CHANNELS,
  logger,
  getCustomFolders,
  setCustomFolders,
  saveCustomFolders,
  buildOllamaOptions,
  getOllamaModel,
  scanDirectory,
}: SmartFolderIpcDependencies): void {
  logger.setContext('IPC:SmartFolders');

  ipcMain.handle(
    IPC_CHANNELS.SMART_FOLDERS.GET,
    compose(
      withErrorHandling,
      withRequestId,
    )(async () => {
      try {
        const customFolders = getCustomFolders();
        logger.info(
          '[SMART-FOLDERS] Getting Smart Folders for UI:',
          customFolders?.length || 0,
          'folders',
        );

        if (!Array.isArray(customFolders)) {
          logger.warn(
            '[SMART-FOLDERS] getCustomFolders() returned non-array:',
            typeof customFolders,
          );
          return { success: true, folders: [] };
        }

        if (customFolders.length === 0) {
          logger.info(
            '[SMART-FOLDERS] No custom folders found, returning empty array',
          );
          return { success: true, folders: [] };
        }

        const foldersWithStatus = await Promise.all(
          customFolders.map(async (folder: SmartFolder) => {
            // Skip path check if path is null or empty (default folders)
            if (!folder || !folder.path || folder.path.trim() === '') {
              return { ...folder, physicallyExists: false };
            }
            try {
              const stats = await fs.stat(folder.path);
              return { ...folder, physicallyExists: stats.isDirectory() };
            } catch (error: unknown) {
              logger.debug(
                '[SMART-FOLDERS] Path check failed for:',
                folder.path,
                error instanceof Error ? error.message : String(error),
              );
              return { ...folder, physicallyExists: false };
            }
          }),
        );

        logger.info(
          '[SMART-FOLDERS] Returning',
          foldersWithStatus.length,
          'folders with status',
        );
        return { success: true, folders: foldersWithStatus };
      } catch (error) {
        logger.error('[SMART-FOLDERS] Error in GET handler:', error);
        throw error;
      }
    }),
  );

  ipcMain.handle(
    IPC_CHANNELS.SMART_FOLDERS.GET_CUSTOM,
    compose(
      withErrorHandling,
      withRequestId,
    )(async () => {
      const customFolders = getCustomFolders();
      logger.info(
        '[SMART-FOLDERS] Getting Custom Folders for UI:',
        customFolders.length,
      );
      return { success: true, folders: customFolders };
    }),
  );

  interface MatchPayload {
    text?: string;
    smartFolders?: Array<{ name: string; description?: string }>;
  }

  // Smart folder matching using embeddings/LLM with fallbacks
  ipcMain.handle(
    IPC_CHANNELS.SMART_FOLDERS.MATCH,
    compose(
      withErrorHandling,
      withRequestId,
    )(async (_event: Electron.IpcMainInvokeEvent, payload: MatchPayload) => {
      try {
        const { text, smartFolders = [] } = payload || {};
        if (
          !text ||
          !Array.isArray(smartFolders) ||
          smartFolders.length === 0
        ) {
          return {
            success: false,
            error: 'Invalid input for SMART_FOLDERS.MATCH',
          };
        }

        try {
          const ollama = getOllamaClient();
          const perfOptions = (await buildOllamaOptions()) as Record<
            string,
            unknown
          >;
          const queryEmbedding = await ollama.embeddings({
            model: 'mxbai-embed-large',
            prompt: text,
            options: { ...perfOptions },
          });
          const scored: Array<{
            folder: (typeof smartFolders)[0];
            score: number;
          }> = [];
          for (const folder of smartFolders) {
            const folderText = [folder.name, folder.description]
              .filter(Boolean)
              .join(' - ');
            const folderEmbedding = await ollama.embeddings({
              model: 'mxbai-embed-large',
              prompt: folderText,
              options: { ...perfOptions },
            });
            const score = cosineSimilarity(
              queryEmbedding.embedding,
              folderEmbedding.embedding,
            );
            scored.push({ folder, score });
          }
          scored.sort((a, b) => b.score - a.score);
          const best = scored[0];
          return {
            success: true,
            folder: best.folder,
            score: best.score,
            method: 'embeddings',
          };
        } catch (_e) {
          try {
            const ollama = getOllamaClient();
            const genPerf = (await buildOllamaOptions()) as Record<
              string,
              unknown
            >;
            const prompt = `You are ranking folders for organizing a file. Given this description:\n"""${text}"""\nFolders:\n${smartFolders.map((f: { name: string; description?: string }, i: number) => `${i + 1}. ${f.name} - ${f.description || ''}`).join('\n')}\nReturn JSON: { "index": <1-based best folder index>, "reason": "..." }`;
            const resp = await ollama.generate({
              model: getOllamaModel() || 'llama3.2:latest',
              prompt,
              format: 'json',
              options: { ...genPerf, temperature: 0.1, num_predict: 200 },
            });
            const parsed = JSON.parse(resp.response);
            const idx = Math.max(
              1,
              Math.min(smartFolders.length, parseInt(parsed.index, 10)),
            );
            return {
              success: true,
              folder: smartFolders[idx - 1],
              reason: parsed.reason,
              method: 'llm',
            };
          } catch (_llmErr) {
            const scored = smartFolders
              .map((f: { name: string; description?: string }) => {
                const textLower = text.toLowerCase();
                const hay = [f.name, f.description]
                  .filter(Boolean)
                  .join(' ')
                  .toLowerCase();
                let score = 0;
                textLower.split(/\W+/).forEach((w: string) => {
                  if (w && hay.includes(w)) score += 1;
                });
                return { folder: f, score };
              })
              .sort(
                (a: { score: number }, b: { score: number }) =>
                  b.score - a.score,
              );
            return {
              success: true,
              folder: scored[0]?.folder || smartFolders[0],
              method: 'fallback',
            };
          }
        }
      } catch (error: unknown) {
        logger.error('[SMART_FOLDERS.MATCH] Failed:', error);
        return {
          success: false,
          error: error instanceof Error ? error.message : String(error),
        };
      }
    }),
  );

  ipcMain.handle(
    IPC_CHANNELS.SMART_FOLDERS.SAVE,
    compose(
      withErrorHandling,
      withRequestId,
    )(async (_event: Electron.IpcMainInvokeEvent, folders: SmartFolder[]) => {
      try {
        if (!Array.isArray(folders))
          return {
            success: false,
            error: 'Folders must be an array',
            errorCode: 'INVALID_INPUT',
          };

        // Ensure all folder paths exist as physical directories
        for (const folder of folders) {
          if (folder.path) {
            try {
              const stats = await fs.stat(folder.path);
              if (!stats.isDirectory()) {
                return {
                  success: false,
                  error: `Path "${folder.path}" exists but is not a directory`,
                  errorCode: 'INVALID_PATH',
                };
              }
            } catch (error: unknown) {
              const errObj = error as NodeJS.ErrnoException;
              if (errObj.code === 'ENOENT') {
                // Directory doesn't exist, create it
                try {
                  await fs.mkdir(folder.path, { recursive: true });
                  logger.info(
                    '[SMART-FOLDERS] Created directory:',
                    folder.path,
                  );
                } catch (createError: unknown) {
                  return {
                    success: false,
                    error: `Failed to create directory "${folder.path}": ${createError instanceof Error ? createError.message : String(createError)}`,
                    errorCode: 'DIRECTORY_CREATION_FAILED',
                  };
                }
              } else {
                throw error;
              }
            }
          }
        }

        const originalFolders = [...getCustomFolders()];
        try {
          setCustomFolders(folders);
          await saveCustomFolders();
          logger.info('[SMART-FOLDERS] Saved Smart Folders:', folders.length);
          return { success: true, folders: getCustomFolders() };
        } catch (saveError) {
          setCustomFolders(originalFolders);
          throw saveError;
        }
      } catch (error: unknown) {
        logger.error('[ERROR] Failed to save smart folders:', error);
        return {
          success: false,
          error: error instanceof Error ? error.message : String(error),
          errorCode: 'SAVE_FAILED',
        };
      }
    }),
  );

  ipcMain.handle(
    IPC_CHANNELS.SMART_FOLDERS.UPDATE_CUSTOM,
    compose(
      withErrorHandling,
      withRequestId,
    )(async (_event: Electron.IpcMainInvokeEvent, folders: SmartFolder[]) => {
      try {
        if (!Array.isArray(folders))
          return {
            success: false,
            error: 'Folders must be an array',
            errorCode: 'INVALID_INPUT',
          };

        // Ensure all folder paths exist as physical directories
        for (const folder of folders) {
          if (folder.path) {
            try {
              const stats = await fs.stat(folder.path);
              if (!stats.isDirectory()) {
                return {
                  success: false,
                  error: `Path "${folder.path}" exists but is not a directory`,
                  errorCode: 'INVALID_PATH',
                };
              }
            } catch (error: unknown) {
              const errObj = error as NodeJS.ErrnoException;
              if (errObj.code === 'ENOENT') {
                // Directory doesn't exist, create it
                try {
                  await fs.mkdir(folder.path, { recursive: true });
                  logger.info(
                    '[SMART-FOLDERS] Created directory:',
                    folder.path,
                  );
                } catch (createError: unknown) {
                  return {
                    success: false,
                    error: `Failed to create directory "${folder.path}": ${createError instanceof Error ? createError.message : String(createError)}`,
                    errorCode: 'DIRECTORY_CREATION_FAILED',
                  };
                }
              } else {
                throw error;
              }
            }
          }
        }

        const originalFolders = [...getCustomFolders()];
        try {
          setCustomFolders(folders);
          await saveCustomFolders();
          logger.info(
            '[SMART-FOLDERS] Updated Custom Folders:',
            folders.length,
          );
          return { success: true, folders: getCustomFolders() };
        } catch (saveError) {
          setCustomFolders(originalFolders);
          throw saveError;
        }
      } catch (error: unknown) {
        logger.error('[ERROR] Failed to update custom folders:', error);
        return {
          success: false,
          error: error instanceof Error ? error.message : String(error),
          errorCode: 'UPDATE_FAILED',
        };
      }
    }),
  );

  interface SmartFolderEditData {
    id: string;
    updates: Partial<SmartFolder>;
  }

  // Edit Smart Folder Handler - with full validation stack
  ipcMain.handle(
    IPC_CHANNELS.SMART_FOLDERS.EDIT,
    compose(
      withErrorHandling,
      withRequestId,
      validateIpc(SmartFolderEditSchema),
    )(
      async (
        _event: Electron.IpcMainInvokeEvent,
        data: SmartFolderEditData,
      ) => {
        const folderId = data.id;
        const updatedFolder = data.updates;
        try {
          if (!folderId || typeof folderId !== 'string')
            return {
              success: false,
              error: 'Valid folder ID is required',
              errorCode: 'INVALID_FOLDER_ID',
            };
          if (!updatedFolder || typeof updatedFolder !== 'object')
            return {
              success: false,
              error: 'Valid folder data is required',
              errorCode: 'INVALID_FOLDER_DATA',
            };
          const customFolders = getCustomFolders();
          const folderIndex = customFolders.findIndex(
            (f: SmartFolder) => f.id === folderId,
          );
          if (folderIndex === -1)
            return {
              success: false,
              error: 'Folder not found',
              errorCode: 'FOLDER_NOT_FOUND',
            };
          if (updatedFolder.name) {
            // Fix for issue where " > Subfolder" might be appended
            if (updatedFolder.name.includes(' > ')) {
              updatedFolder.name = updatedFolder.name.split(' > ')[0].trim();
            }

            const illegalChars = /([<>:"|?*])/g;
            if (illegalChars.test(updatedFolder.name)) {
              return {
                success: false,
                error:
                  'Folder name contains invalid characters. Please avoid: < > : " | ? *',
                errorCode: 'INVALID_FOLDER_NAME_CHARS',
              };
            }
            const existingFolder = customFolders.find(
              (f: SmartFolder) =>
                f.id !== folderId &&
                f.name.toLowerCase() ===
                  updatedFolder.name!.trim().toLowerCase(),
            );
            if (existingFolder)
              return {
                success: false,
                error: `A smart folder with name "${updatedFolder.name}" already exists`,
                errorCode: 'FOLDER_NAME_EXISTS',
              };
          }
          if (updatedFolder.path) {
            try {
              // CRITICAL SECURITY FIX: Sanitize path before any operations
              const normalizedPath = sanitizeFolderPath(updatedFolder.path);
              const parentDir = path.dirname(normalizedPath);
              const parentStats = await fs.stat(parentDir);
              if (!parentStats.isDirectory()) {
                return {
                  success: false,
                  error: `Parent directory "${parentDir}" is not a directory`,
                  errorCode: 'PARENT_NOT_DIRECTORY',
                };
              }
              updatedFolder.path = normalizedPath;
            } catch (pathError: unknown) {
              return {
                success: false,
                error: `Invalid path: ${pathError instanceof Error ? pathError.message : String(pathError)}`,
                errorCode: 'INVALID_PATH',
              };
            }
          }
          const originalFolder = { ...customFolders[folderIndex] };
          if (
            updatedFolder.path &&
            updatedFolder.path !== originalFolder.path
          ) {
            try {
              const oldPath = originalFolder.path;
              const newPath = updatedFolder.path;
              const oldStats = await fs.stat(oldPath);
              if (!oldStats.isDirectory())
                return {
                  success: false,
                  error: 'Original path is not a directory',
                  errorCode: 'ORIGINAL_NOT_DIRECTORY',
                };
              await fs.rename(oldPath, newPath);
              logger.info(
                `[SMART-FOLDERS] Renamed directory "${oldPath}" -> "${newPath}"`,
              );
            } catch (renameErr: unknown) {
              logger.error(
                '[SMART-FOLDERS] Directory rename failed:',
                renameErr instanceof Error
                  ? renameErr.message
                  : String(renameErr),
              );
              return {
                success: false,
                error: 'Failed to rename directory',
                errorCode: 'RENAME_FAILED',
                details:
                  renameErr instanceof Error
                    ? renameErr.message
                    : String(renameErr),
              };
            }
          }
          try {
            customFolders[folderIndex] = {
              ...customFolders[folderIndex],
              ...updatedFolder,
              updatedAt: new Date().toISOString(),
            };
            setCustomFolders(customFolders);
            await saveCustomFolders();
            logger.info('[SMART-FOLDERS] Edited Smart Folder:', folderId);
            return {
              success: true,
              folder: customFolders[folderIndex],
              message: 'Smart folder updated successfully',
            };
          } catch (saveError) {
            customFolders[folderIndex] = originalFolder;
            throw saveError;
          }
        } catch (error: unknown) {
          logger.error('[ERROR] Failed to edit smart folder:', error);
          return {
            success: false,
            error: error instanceof Error ? error.message : String(error),
            errorCode: 'EDIT_FAILED',
          };
        }
      },
    ),
  );

  // Delete Smart Folder Handler - with full validation stack
  ipcMain.handle(
    IPC_CHANNELS.SMART_FOLDERS.DELETE,
    compose(
      withErrorHandling,
      withRequestId,
      validateIpc(SmartFolderDeleteSchema),
    )(async (_event: Electron.IpcMainInvokeEvent, data: { id: string }) => {
      const folderId = data.id;
      try {
        if (!folderId || typeof folderId !== 'string')
          return {
            success: false,
            error: 'Valid folder ID is required',
            errorCode: 'INVALID_FOLDER_ID',
          };
        const customFolders = getCustomFolders();
        const folderIndex = customFolders.findIndex(
          (f: SmartFolder) => f.id === folderId,
        );
        if (folderIndex === -1)
          return {
            success: false,
            error: 'Folder not found',
            errorCode: 'FOLDER_NOT_FOUND',
          };
        const originalFolders = [...customFolders];
        const deletedFolder = customFolders[folderIndex];
        try {
          const updated = customFolders.filter(
            (f: SmartFolder) => f.id !== folderId,
          );
          setCustomFolders(updated);
          await saveCustomFolders();
          logger.info('[SMART-FOLDERS] Deleted Smart Folder:', folderId);
          let directoryRemoved = false;
          let removalError: string | null = null;
          try {
            if (deletedFolder.path) {
              const stats = await fs.stat(deletedFolder.path);
              if (stats.isDirectory()) {
                const contents = await fs.readdir(deletedFolder.path);
                if (contents.length === 0) {
                  await fs.rmdir(deletedFolder.path);
                  directoryRemoved = true;
                }
              }
            }
          } catch (dirErr: unknown) {
            const errObj = dirErr as NodeJS.ErrnoException;
            if (errObj.code !== 'ENOENT') {
              logger.warn(
                '[SMART-FOLDERS] Directory removal failed:',
                errObj.message,
              );
              removalError = errObj.message;
            }
          }
          return {
            success: true,
            folders: updated,
            deletedFolder,
            directoryRemoved,
            removalError,
            message:
              `Smart folder "${deletedFolder.name}" deleted successfully` +
              (directoryRemoved ? ' and its empty directory was removed.' : ''),
          };
        } catch (saveError) {
          setCustomFolders(originalFolders);
          throw saveError;
        }
      } catch (error: unknown) {
        logger.error('[ERROR] Failed to delete smart folder:', error);
        return {
          success: false,
          error: error instanceof Error ? error.message : String(error),
          errorCode: 'DELETE_FAILED',
        };
      }
    }),
  );

  interface SmartFolderInput {
    name: string;
    path: string;
    category?: string;
    description?: string;
    keywords?: string[];
  }

  // Create/add new smart folder with LLM enhancement
  // Add Smart Folder Handler - with full validation stack
  ipcMain.handle(
    IPC_CHANNELS.SMART_FOLDERS.ADD,
    compose(
      withErrorHandling,
      withRequestId,
      validateIpc(SmartFolderAddSchema),
    )(async (_event: Electron.IpcMainInvokeEvent, folder: SmartFolderInput) => {
      try {
        if (!folder || typeof folder !== 'object')
          return {
            success: false,
            error: 'Invalid folder data provided',
            errorCode: 'INVALID_FOLDER_DATA',
          };
        if (
          !folder.name ||
          typeof folder.name !== 'string' ||
          !folder.name.trim()
        )
          return {
            success: false,
            error: 'Folder name is required and must be a non-empty string',
            errorCode: 'INVALID_FOLDER_NAME',
          };
        if (
          !folder.path ||
          typeof folder.path !== 'string' ||
          !folder.path.trim()
        )
          return {
            success: false,
            error: 'Folder path is required and must be a non-empty string',
            errorCode: 'INVALID_FOLDER_PATH',
          };

        // CRITICAL FIX: Sanitize folder name to remove any accidental path separators or suffixes
        // This addresses an issue where names like "Work > Project Management Templates" were being created
        let sanitizedName = folder.name.trim();
        if (sanitizedName.includes(' > ')) {
          sanitizedName = sanitizedName.split(' > ')[0].trim();
        }

        const illegalChars = /([<>:"|?*])/g;
        if (illegalChars.test(sanitizedName))
          return {
            success: false,
            error:
              'Folder name contains invalid characters. Please avoid: < > : " | ? *',
            errorCode: 'INVALID_FOLDER_NAME_CHARS',
          };

        const customFolders = getCustomFolders();

        // CRITICAL SECURITY FIX: Sanitize path before any operations
        let normalizedPath: string;
        try {
          normalizedPath = sanitizeFolderPath(folder.path);
        } catch (securityError: unknown) {
          return {
            success: false,
            error:
              securityError instanceof Error
                ? securityError.message
                : String(securityError),
            errorCode: 'SECURITY_PATH_VIOLATION',
          };
        }

        const existingFolder = customFolders.find(
          (f: SmartFolder) =>
            f.name.toLowerCase() === sanitizedName.toLowerCase() ||
            f.path === normalizedPath,
        );
        if (existingFolder)
          return {
            success: false,
            error: `A smart folder with name "${existingFolder.name}" or path "${existingFolder.path}" already exists`,
            errorCode: 'FOLDER_ALREADY_EXISTS',
          };
        const parentDir = path.dirname(normalizedPath);
        try {
          const parentStats = await fs.stat(parentDir);
          if (!parentStats.isDirectory())
            return {
              success: false,
              error: `Parent directory "${parentDir}" is not a directory`,
              errorCode: 'PARENT_NOT_DIRECTORY',
            };
          const tempFile = path.join(parentDir, `.stratotest_${Date.now()}`);
          try {
            await fs.writeFile(tempFile, 'test');
            await fs.unlink(tempFile);
          } catch {
            return {
              success: false,
              error: `No write permission in parent directory "${parentDir}"`,
              errorCode: 'PARENT_NOT_WRITABLE',
            };
          }
        } catch {
          return {
            success: false,
            error: `Parent directory "${parentDir}" does not exist or is not accessible`,
            errorCode: 'PARENT_NOT_ACCESSIBLE',
          };
        }

        let llmEnhancedData: {
          enhancedDescription?: string;
          suggestedKeywords?: string[];
          suggestedCategory?: string;
          semanticTags?: string[];
          relatedFolders?: string[];
          confidence?: number;
          error?: string;
        } = {};
        try {
          const llmAnalysis = await enhanceSmartFolderWithLLM(
            folder,
            customFolders,
            getOllamaModel,
          );
          if (llmAnalysis && !llmEnhancedData.error)
            llmEnhancedData = llmAnalysis;
        } catch (e: unknown) {
          logger.warn(
            '[SMART-FOLDERS] LLM enhancement failed, continuing with basic data:',
            e instanceof Error ? e.message : String(e),
          );
        }

        const newFolder = {
          id: Date.now().toString(),
          name: sanitizedName,
          path: normalizedPath,
          description:
            llmEnhancedData.enhancedDescription ||
            folder.description?.trim() ||
            `Smart folder for ${sanitizedName}`,
          keywords: llmEnhancedData.suggestedKeywords || [],
          category: llmEnhancedData.suggestedCategory || 'general',
          isDefault: folder.isDefault || false,
          createdAt: new Date().toISOString(),
          semanticTags: llmEnhancedData.semanticTags || [],
          relatedFolders: llmEnhancedData.relatedFolders || [],
          confidenceScore: llmEnhancedData.confidence || 0.8,
          usageCount: 0,
          lastUsed: null,
        };

        let directoryCreated = false;
        let directoryExisted = false;
        try {
          const existingStats = await fs.stat(normalizedPath);
          if (existingStats.isDirectory()) {
            directoryExisted = true;
          } else {
            return {
              success: false,
              error: 'Path exists but is not a directory',
              errorCode: 'PATH_NOT_DIRECTORY',
            };
          }
        } catch (statError: unknown) {
          const errObj = statError as NodeJS.ErrnoException;
          if (errObj.code === 'ENOENT') {
            try {
              await fs.mkdir(normalizedPath, { recursive: true });
              const stats = await fs.stat(normalizedPath);
              if (!stats.isDirectory())
                throw new Error('Created path is not a directory');
              directoryCreated = true;
            } catch (dirError: unknown) {
              return {
                success: false,
                error: 'Failed to create directory',
                errorCode: 'DIRECTORY_CREATION_FAILED',
                details:
                  dirError instanceof Error
                    ? dirError.message
                    : String(dirError),
              };
            }
          } else {
            return {
              success: false,
              error: 'Failed to access directory path',
              errorCode: 'PATH_ACCESS_FAILED',
              details: errObj.message,
            };
          }
        }

        const originalFolders = [...customFolders];
        try {
          customFolders.push(newFolder);
          setCustomFolders(customFolders);
          await saveCustomFolders();
          return {
            success: true,
            folder: newFolder,
            folders: customFolders,
            message: directoryCreated
              ? 'Smart folder created successfully'
              : 'Smart folder added (directory already existed)',
            directoryCreated,
            directoryExisted,
            llmEnhanced: !!llmEnhancedData.enhancedDescription,
          };
        } catch (saveError: unknown) {
          setCustomFolders(originalFolders);
          if (directoryCreated && !directoryExisted) {
            try {
              await fs.rmdir(normalizedPath);
            } catch {
              // Non-fatal if rollback cleanup fails
            }
          }
          return {
            success: false,
            error: 'Failed to save configuration, changes rolled back',
            errorCode: 'CONFIG_SAVE_FAILED',
            details:
              saveError instanceof Error
                ? saveError.message
                : String(saveError),
          };
        }
      } catch (error: unknown) {
        logger.error('[ERROR] Failed to add smart folder:', error);
        return {
          success: false,
          error: 'Failed to add smart folder',
          errorCode: 'ADD_FOLDER_FAILED',
          details: error instanceof Error ? error.message : String(error),
        };
      }
    }),
  );

  interface ScanNode {
    type: string;
    name: string;
    path: string;
    size?: number;
    children?: ScanNode[];
  }

  // Scan folder structure
  ipcMain.handle(
    IPC_CHANNELS.SMART_FOLDERS.SCAN_STRUCTURE,
    compose(
      withErrorHandling,
      withRequestId,
    )(async (_event: Electron.IpcMainInvokeEvent, rootPath: string) => {
      try {
        // CRITICAL SECURITY FIX: Sanitize path to prevent directory traversal
        let sanitizedPath: string;
        try {
          sanitizedPath = sanitizeFolderPath(rootPath);
        } catch (securityError: unknown) {
          return {
            success: false,
            error:
              securityError instanceof Error
                ? securityError.message
                : String(securityError),
            errorCode: 'SECURITY_PATH_VIOLATION',
          };
        }

        logger.info('[FOLDER-SCAN] Scanning folder structure:', sanitizedPath);
        // Reuse existing scanner (shallow aggregation is done in renderer today)
        const items = await scanDirectory(sanitizedPath);
        // Flatten file-like items with basic filtering similar to prior inline implementation
        const flatten = (
          nodes: ScanNode[],
        ): Array<{
          name: string;
          path: string;
          type: string;
          size?: number;
        }> => {
          const out: Array<{
            name: string;
            path: string;
            type: string;
            size?: number;
          }> = [];
          for (const n of nodes) {
            if (n.type === 'file')
              out.push({
                name: n.name,
                path: n.path,
                type: 'file',
                size: n.size,
              });
            if (Array.isArray(n.children)) out.push(...flatten(n.children));
          }
          return out;
        };
        const files = flatten(items as unknown as ScanNode[]);
        logger.info('[FOLDER-SCAN] Found', files.length, 'supported files');
        return { success: true, files };
      } catch (error: unknown) {
        logger.error('[FOLDER-SCAN] Error scanning folder structure:', error);
        return {
          success: false,
          error: error instanceof Error ? error.message : String(error),
        };
      }
    }),
  );
}
export default registerSmartFoldersIpc;

// Local utility
function cosineSimilarity(a: number[], b: number[]): number {
  if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return 0;
  let dot = 0,
    na = 0,
    nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

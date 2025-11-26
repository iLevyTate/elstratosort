import { getOllama, getOllamaEmbeddingModel } from '../ollamaUtils';
import crypto from 'crypto';
import { logger } from '../../shared/logger';
logger.setContext('FolderMatchingService');
import EmbeddingCache from './EmbeddingCache';

interface SmartFolder {
  id?: string;
  name: string;
  description?: string;
  path?: string;
}

interface EmbeddingResult {
  vector: number[];
  model: string;
}

interface FolderPayload {
  id: string;
  name: string;
  description: string;
  path: string;
  vector: number[];
  model: string;
  updatedAt: string;
}

interface ChromaDbService {
  initialize: () => Promise<void>;
  upsertFolder: (payload: FolderPayload) => Promise<void>;
  batchUpsertFolders: (payloads: FolderPayload[]) => Promise<void>;
  upsertFile: (payload: { id: string; vector: number[]; model: string; meta: Record<string, unknown>; updatedAt: string }) => Promise<void>;
  queryFolders: (fileId: string, topK: number) => Promise<Array<{ score?: number; [key: string]: unknown }>>;
  batchQueryFolders: (fileIds: string[], topK: number) => Promise<Record<string, unknown[]>>;
  queryFoldersByEmbedding: (vector: number[], topK: number) => Promise<unknown[]>;
  querySimilarFiles: (embedding: number[], topK: number) => Promise<unknown[]>;
  getStats: () => Promise<{ folderCount: number; fileCount: number; lastUpdate: string | null }>;
  healthCheck: () => Promise<boolean>;
  fileCollection: { get: (params: { ids: string[] }) => Promise<{ embeddings?: number[][] }> };
}

interface CacheOptions {
  maxSize?: number;
  ttl?: number;
}

interface SkippedFolder {
  folder: SmartFolder;
  error: string;
}

class FolderMatchingService {
  chromaDbService: ChromaDbService | null;
  ollama: unknown;
  modelName: string;
  embeddingCache: EmbeddingCache;

  constructor(chromaDbService: ChromaDbService | null, cacheOptions: CacheOptions = {}) {
    this.chromaDbService = chromaDbService;
    this.ollama = null;
    this.modelName = '';

    // Initialize embedding cache for performance optimization
    this.embeddingCache = new EmbeddingCache(cacheOptions);
  }

  /**
   * Initialize the service and its resources
   * Should be called after construction and successful service setup
   */
  initialize() {
    // Fixed: Initialize the embedding cache after construction to prevent orphaned intervals
    if (this.embeddingCache && !this.embeddingCache.initialized) {
      this.embeddingCache.initialize();
      logger.info('[FolderMatchingService] Initialized successfully');
    }
  }

  async embedText(text: string): Promise<EmbeddingResult> {
    const startTime = Date.now();

    try {
      const ollama = getOllama();
      const model = getOllamaEmbeddingModel();

      // Check cache first
      const cachedResult = this.embeddingCache.get(text, model);
      if (cachedResult) {
        const duration = Date.now() - startTime;
        logger.debug(
          `[FolderMatchingService] Embedding retrieved in ${duration}ms (cache: HIT)`,
        );
        return cachedResult;
      }

      // Cache miss - generate embedding via API
      const response = await ollama.embeddings({
        model,
        prompt: text || '',
      });

      const result = { vector: response.embedding, model };

      // Store in cache for future use
      this.embeddingCache.set(text, model, response.embedding);

      const duration = Date.now() - startTime;
      logger.debug(
        `[FolderMatchingService] Embedding generated in ${duration}ms (cache: MISS)`,
      );

      return result;
    } catch (error) {
      logger.error(
        '[FolderMatchingService] Failed to generate embedding:',
        error,
      );
      // Return a zero vector as fallback
      return { vector: new Array(1024).fill(0), model: 'fallback' };
    }
  }

  /**
   * Generate a unique ID for a folder based on its properties
   */
  generateFolderId(folder: SmartFolder): string {
    const uniqueString = `${folder.name}|${folder.path || ''}|${folder.description || ''}`;
    return `folder:${crypto.createHash('md5').update(uniqueString).digest('hex')}`;
  }

  async upsertFolderEmbedding(folder: SmartFolder): Promise<FolderPayload> {
    try {
      // CRITICAL FIX: Ensure ChromaDB is initialized before upserting
      if (!this.chromaDbService) {
        throw new Error('ChromaDB service not available');
      }
      await this.chromaDbService.initialize();

      const folderText = [folder.name, folder.description]
        .filter(Boolean)
        .join(' - ');

      const { vector, model } = await this.embedText(folderText);
      const folderId = folder.id || this.generateFolderId(folder);

      const payload: FolderPayload = {
        id: folderId,
        name: folder.name,
        description: folder.description || '',
        path: folder.path || '',
        vector,
        model,
        updatedAt: new Date().toISOString(),
      };
      await this.chromaDbService.upsertFolder(payload);
      logger.debug('[FolderMatchingService] Upserted folder embedding', {
        id: folderId,
        name: folder.name,
      });

      return payload;
    } catch (error: unknown) {
      const errObj = error instanceof Error ? error : new Error(String(error));
      logger.error(
        '[FolderMatchingService] Failed to upsert folder embedding:',
        {
          folderId: folder.id,
          folderName: folder.name,
          error: errObj.message,
          errorStack: errObj.stack,
        },
      );
      throw error;
    }
  }

  /**
   * Batch upsert multiple folder embeddings
   * @param folders - Array of folders to upsert
   * @returns Result with count and skipped items
   */
  async batchUpsertFolders(folders: SmartFolder[]): Promise<{ count: number; skipped: SkippedFolder[] }> {
    try {
      if (!folders || folders.length === 0) {
        return { count: 0, skipped: [] };
      }

      // CRITICAL FIX: Ensure ChromaDB is initialized before upserting
      if (!this.chromaDbService) {
        throw new Error('ChromaDB service not available');
      }
      await this.chromaDbService.initialize();

      // Process embeddings in parallel with concurrency limit
      // We use a limit to avoid overwhelming Ollama
      const CONCURRENCY_LIMIT = 3;
      const payloads: FolderPayload[] = [];
      const skipped: SkippedFolder[] = [];

      // Helper for batched processing
      const processBatch = async (batch: SmartFolder[]): Promise<(FolderPayload | null)[]> => {
        const promises = batch.map(async (folder: SmartFolder): Promise<FolderPayload | null> => {
          try {
            const folderText = [folder.name, folder.description]
              .filter(Boolean)
              .join(' - ');

            const { vector, model } = await this.embedText(folderText);
            const folderId = folder.id || this.generateFolderId(folder);

            return {
              id: folderId,
              name: folder.name,
              description: folder.description || '',
              path: folder.path || '',
              vector,
              model,
              updatedAt: new Date().toISOString(),
            };
          } catch (error: unknown) {
            const errMsg = error instanceof Error ? error.message : String(error);
            logger.warn(
              `[FolderMatchingService] Failed to generate embedding for folder: ${folder.name}`,
              { error: errMsg },
            );
            skipped.push({ folder, error: errMsg });
            return null;
          }
        });
        return Promise.all(promises);
      };

      // Process in chunks
      for (let i = 0; i < folders.length; i += CONCURRENCY_LIMIT) {
        const batch = folders.slice(i, i + CONCURRENCY_LIMIT);
        const results = await processBatch(batch);
        payloads.push(...(results.filter(Boolean) as FolderPayload[]));
      }

      if (payloads.length > 0) {
        await this.chromaDbService.batchUpsertFolders(payloads);
        logger.debug(
          '[FolderMatchingService] Batch upserted folder embeddings',
          {
            count: payloads.length,
            skipped: skipped.length,
          },
        );
      }

      return { count: payloads.length, skipped };
    } catch (error: unknown) {
      const errObj = error instanceof Error ? error : new Error(String(error));
      logger.error(
        '[FolderMatchingService] Failed to batch upsert folder embeddings:',
        {
          totalFolders: folders.length,
          error: errObj.message,
          errorStack: errObj.stack,
        },
      );
      throw error;
    }
  }

  async upsertFileEmbedding(fileId: string, contentSummary: string, fileMeta: Record<string, unknown> = {}): Promise<void> {
    try {
      // CRITICAL FIX: Ensure ChromaDB is initialized before upserting
      if (!this.chromaDbService) {
        throw new Error('ChromaDB service not available');
      }
      await this.chromaDbService.initialize();

      const { vector, model } = await this.embedText(contentSummary || '');
      await this.chromaDbService.upsertFile({
        id: fileId,
        vector,
        model,
        meta: fileMeta,
        updatedAt: new Date().toISOString(),
      });

      logger.debug('[FolderMatchingService] Upserted file embedding', {
        id: fileId,
        path: fileMeta.path,
        vectorLength: vector.length,
      });
    } catch (error: unknown) {
      const errObj = error instanceof Error ? error : new Error(String(error));
      logger.error('[FolderMatchingService] Failed to upsert file embedding:', {
        fileId,
        filePath: fileMeta.path,
        error: errObj.message,
        errorStack: errObj.stack,
      });
      throw error;
    }
  }

  async matchFileToFolders(fileId: string, topK = 5): Promise<Array<{ score?: number; [key: string]: unknown }>> {
    try {
      // CRITICAL FIX: Ensure ChromaDB is initialized before querying
      if (!this.chromaDbService) {
        logger.error('[FolderMatchingService] ChromaDB service not available');
        return [];
      }

      // Ensure ChromaDB is initialized
      await this.chromaDbService.initialize();

      logger.debug('[FolderMatchingService] Querying folder matches', {
        fileId,
        topK,
      });
      const results = await this.chromaDbService.queryFolders(fileId, topK);

      if (!Array.isArray(results)) {
        logger.warn('[FolderMatchingService] Invalid results format', {
          fileId,
          resultsType: typeof results,
        });
        return [];
      }

      logger.debug('[FolderMatchingService] Folder matching results', {
        fileId,
        resultCount: results.length,
        topScore: results[0]?.score,
      });

      return results;
    } catch (error: unknown) {
      const errObj = error instanceof Error ? error : new Error(String(error));
      logger.error('[FolderMatchingService] Failed to match file to folders:', {
        fileId,
        topK,
        error: errObj.message,
        errorStack: errObj.stack,
      });
      return [];
    }
  }

  /**
   * Batch match multiple files to folders
   * @param fileIds - Array of file IDs to match
   * @param topK - Number of matches per file
   * @returns Map of fileId -> Array of folder matches
   */
  async batchMatchFilesToFolders(fileIds: string[], topK = 5): Promise<Record<string, unknown[]>> {
    try {
      if (!this.chromaDbService) {
        logger.error('[FolderMatchingService] ChromaDB service not available');
        return {};
      }
      await this.chromaDbService.initialize();

      logger.debug('[FolderMatchingService] Batch querying folder matches', {
        fileCount: fileIds.length,
        topK,
      });
      return await this.chromaDbService.batchQueryFolders(fileIds, topK);
    } catch (error: unknown) {
      const errMsg = error instanceof Error ? error.message : String(error);
      logger.error('[FolderMatchingService] Failed to batch match files:', {
        fileCount: fileIds.length,
        error: errMsg,
      });
      return {};
    }
  }

  /**
   * Match a raw embedding vector to folders
   * @param vector - Embedding vector
   * @param topK - Number of matches
   * @returns Array of folder matches
   */
  async matchVectorToFolders(vector: number[], topK = 5): Promise<unknown[]> {
    try {
      if (!this.chromaDbService) {
        logger.error('[FolderMatchingService] ChromaDB service not available');
        return [];
      }
      await this.chromaDbService.initialize();
      return await this.chromaDbService.queryFoldersByEmbedding(vector, topK);
    } catch (error: unknown) {
      logger.error(
        '[FolderMatchingService] Failed to match vector to folders:',
        {
          error: error instanceof Error ? error.message : String(error),
        },
      );
      return [];
    }
  }

  /**
   * Find similar files to a given file
   */
  async findSimilarFiles(fileId: string, topK = 10): Promise<unknown[]> {
    try {
      // Get the file's embedding first
      const fileResult = await this.chromaDbService.fileCollection.get({
        ids: [fileId],
      });

      if (!fileResult.embeddings || fileResult.embeddings.length === 0) {
        logger.warn(
          '[FolderMatchingService] File not found for similarity search:',
          fileId,
        );
        return [];
      }

      const fileEmbedding = fileResult.embeddings[0];
      return await this.chromaDbService.querySimilarFiles(fileEmbedding, topK);
    } catch (error: unknown) {
      logger.error(
        '[FolderMatchingService] Failed to find similar files:',
        error,
      );
      return [];
    }
  }

  /**
   * Get database statistics
   */
  async getStats(): Promise<{ folderCount: number; fileCount: number; lastUpdate: string | null; error?: string }> {
    try {
      return await this.chromaDbService!.getStats();
    } catch (error: unknown) {
      const errMsg = error instanceof Error ? error.message : String(error);
      logger.error('[FolderMatchingService] Failed to get stats:', error);
      return {
        error: errMsg,
        folderCount: 0,
        fileCount: 0,
        lastUpdate: null,
      };
    }
  }

  /**
   * Get cache statistics
   * @returns {Object} - Cache metrics including hit rate and memory usage
   */
  getCacheStats() {
    return this.embeddingCache.getStats();
  }

  /**
   * Shutdown service and cleanup resources
   * Should be called when the application is closing
   */
  shutdown() {
    if (this.embeddingCache) {
      logger.info('[FolderMatchingService] Shutting down embedding cache');
      this.embeddingCache.shutdown();
    }
  }

  /**
   * Health check for service monitoring
   * @returns {Promise<boolean>} True if service is healthy
   */
  async healthCheck() {
    try {
      // Check ChromaDB service availability
      if (!this.chromaDbService) {
        logger.error('[FolderMatchingService] Health check failed: no ChromaDB service');
        return false;
      }

      // Check ChromaDB is initialized and healthy
      const chromaHealthy = await this.chromaDbService.healthCheck();
      if (!chromaHealthy) {
        logger.warn('[FolderMatchingService] Health check warning: ChromaDB not healthy');
        // Continue checking other components
      }

      // Check embedding cache
      if (!this.embeddingCache) {
        logger.error('[FolderMatchingService] Health check failed: no embedding cache');
        return false;
      }

      // Check if embedding cache is initialized
      if (!this.embeddingCache.initialized) {
        logger.warn('[FolderMatchingService] Health check warning: embedding cache not initialized');
        // Try to initialize it
        try {
          this.embeddingCache.initialize();
        } catch (error: unknown) {
          logger.error('[FolderMatchingService] Failed to initialize embedding cache', {
            error: error instanceof Error ? error.message : String(error),
          });
          return false;
        }
      }

      // Verify we can access Ollama
      try {
        const ollama = getOllama();
        const model = getOllamaEmbeddingModel();

        if (!ollama) {
          logger.warn('[FolderMatchingService] Health check warning: Ollama not available');
          // This might be OK if service is not yet initialized
        }

        if (!model) {
          logger.warn('[FolderMatchingService] Health check warning: no embedding model configured');
        }
      } catch (error: unknown) {
        logger.error('[FolderMatchingService] Health check error accessing Ollama', {
          error: error instanceof Error ? error.message : String(error),
        });
        return false;
      }

      logger.debug('[FolderMatchingService] Health check passed', {
        chromaHealthy,
        cacheInitialized: this.embeddingCache.initialized,
      });
      return true;
    } catch (error: unknown) {
      const errObj = error instanceof Error ? error : new Error(String(error));
      logger.error('[FolderMatchingService] Health check error', {
        error: errObj.message,
        stack: errObj.stack,
      });
      return false;
    }
  }

  /**
   * Get service state for monitoring
   * @returns {Object} Service state information
   */
  getState() {
    return {
      hasChromaDb: !!this.chromaDbService,
      hasEmbeddingCache: !!this.embeddingCache,
      cacheInitialized: this.embeddingCache?.initialized || false,
      cacheStats: this.embeddingCache ? this.getCacheStats() : null,
    };
  }
}

export default FolderMatchingService;

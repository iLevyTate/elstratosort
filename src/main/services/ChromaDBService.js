const { app } = require('electron');
const { ChromaClient } = require('chromadb');
const path = require('path');
const fs = require('fs').promises;
const { logger } = require('../../shared/logger');
const { sanitizeMetadata } = require('../../shared/pathSanitization');

/**
 * ChromaDB-based Vector Database Service
 * Replaces the JSON-based EmbeddingIndexService with a proper vector database
 */
class ChromaDBService {
  constructor() {
    this.dbPath = path.join(app.getPath('userData'), 'chromadb');
    this.client = null;
    this.fileCollection = null;
    this.folderCollection = null;
    this.initialized = false;

    // Fixed: Add initialization mutex to prevent race conditions
    this._initPromise = null;
    this._isInitializing = false; // Lock flag to prevent concurrent init attempts

    this.serverProtocol = 'http';
    this.serverHost = '127.0.0.1';
    this.serverPort = 8000;
    this.serverUrl = 'http://127.0.0.1:8000';

    const envUrl = process.env.CHROMA_SERVER_URL;
    if (envUrl) {
      try {
        const parsed = new URL(envUrl);
        this.serverProtocol = parsed.protocol?.replace(':', '') || 'http';
        this.serverHost = parsed.hostname || '127.0.0.1';
        this.serverPort =
          Number(parsed.port) || (this.serverProtocol === 'https' ? 443 : 80);
        this.serverUrl = `${parsed.protocol}//${parsed.host}`;
      } catch (error) {
        logger.warn(
          '[ChromaDB] Invalid CHROMA_SERVER_URL provided, falling back to defaults',
          { url: envUrl, message: error?.message },
        );
      }
    } else {
      this.serverProtocol = process.env.CHROMA_SERVER_PROTOCOL || 'http';
      this.serverHost = process.env.CHROMA_SERVER_HOST || '127.0.0.1';
      this.serverPort = Number(process.env.CHROMA_SERVER_PORT || 8000);
      this.serverUrl = `${this.serverProtocol}://${this.serverHost}:${this.serverPort}`;
    }
  }

  async ensureDbDirectory() {
    try {
      await fs.mkdir(this.dbPath, { recursive: true });
    } catch (error) {
      logger.error('[ChromaDB] Failed to create database directory:', error);
      throw error;
    }
  }

  async initialize() {
    // Fixed: Use initialization promise to prevent race conditions
    // If initialization is already in progress, wait for it
    if (this._initPromise) {
      return this._initPromise;
    }

    // If already initialized, return immediately
    if (this.initialized) {
      return Promise.resolve();
    }

    // Fixed: Use lock flag to prevent concurrent initialization after failure
    if (this._isInitializing) {
      // Another initialization attempt is in progress, wait for it
      return new Promise((resolve, reject) => {
        const checkInterval = setInterval(() => {
          if (!this._isInitializing) {
            clearInterval(checkInterval);
            if (this.initialized) {
              resolve();
            } else {
              reject(new Error('Previous initialization attempt failed'));
            }
          }
        }, 100);
      });
    }

    // Set lock flag
    this._isInitializing = true;

    // Create initialization promise that concurrent calls can wait on
    this._initPromise = (async () => {
      try {
        await this.ensureDbDirectory();

        // Initialize ChromaDB client with configured server
        this.client = new ChromaClient({
          path: this.serverUrl,
        });

        // Create or get collections for files and folders
        // Files collection stores document embeddings
        this.fileCollection = await this.client.getOrCreateCollection({
          name: 'file_embeddings',
          metadata: {
            description:
              'Document and image file embeddings for semantic search',
            hnsw_space: 'cosine',
          },
        });

        // Folders collection stores smart folder embeddings
        this.folderCollection = await this.client.getOrCreateCollection({
          name: 'folder_embeddings',
          metadata: {
            description: 'Smart folder embeddings for categorization',
            hnsw_space: 'cosine',
          },
        });

        this.initialized = true;
        this._isInitializing = false; // Clear lock flag on success
        logger.info('[ChromaDB] Successfully initialized vector database', {
          dbPath: this.dbPath,
          serverUrl: this.serverUrl,
          fileCount: await this.fileCollection.count(),
          folderCount: await this.folderCollection.count(),
        });
      } catch (error) {
        // Clear the promise and lock on failure so retry is possible
        this._initPromise = null;
        this._isInitializing = false; // Clear lock flag on failure
        logger.error('[ChromaDB] Initialization failed:', error);
        throw new Error(`Failed to initialize ChromaDB: ${error.message}`);
      }
    })();

    return this._initPromise;
  }

  /**
   * Upsert a folder embedding into the database
   * @param {Object} folder - Folder object with id, name, vector, etc.
   */
  async upsertFolder(folder) {
    await this.initialize();

    try {
      if (!folder.id || !folder.vector || !Array.isArray(folder.vector)) {
        throw new Error('Invalid folder data: missing id or vector');
      }

      // Fixed: Sanitize folder metadata
      const metadata = {
        name: folder.name || '',
        description: folder.description || '',
        path: folder.path || '',
        model: folder.model || '',
        updatedAt: folder.updatedAt || new Date().toISOString(),
      };

      const sanitized = sanitizeMetadata(metadata);

      // ChromaDB expects embeddings as arrays
      await this.folderCollection.upsert({
        ids: [folder.id],
        embeddings: [folder.vector],
        metadatas: [sanitized],
        documents: [folder.name || folder.id], // Store name as document for reference
      });

      logger.debug('[ChromaDB] Upserted folder embedding', {
        id: folder.id,
        name: folder.name,
      });
    } catch (error) {
      logger.error('[ChromaDB] Failed to upsert folder:', error);
      throw error;
    }
  }

  /**
   * Upsert a file embedding into the database
   * @param {Object} file - File object with id, vector, meta, etc.
   */
  async upsertFile(file) {
    await this.initialize();

    try {
      if (!file.id || !file.vector || !Array.isArray(file.vector)) {
        throw new Error('Invalid file data: missing id or vector');
      }

      // Fixed: Sanitize metadata to prevent injection and bloat
      const baseMetadata = {
        path: file.meta?.path || '',
        name: file.meta?.name || '',
        model: file.model || '',
        updatedAt: file.updatedAt || new Date().toISOString(),
      };

      // Merge with sanitized additional metadata (filters dangerous fields)
      const sanitized = sanitizeMetadata({ ...baseMetadata, ...file.meta });

      // ChromaDB expects embeddings as arrays
      await this.fileCollection.upsert({
        ids: [file.id],
        embeddings: [file.vector],
        metadatas: [sanitized],
        documents: [sanitized.path || file.id], // Store sanitized path as document
      });

      logger.debug('[ChromaDB] Upserted file embedding', {
        id: file.id,
        path: sanitized.path,
      });
    } catch (error) {
      logger.error('[ChromaDB] Failed to upsert file:', error);
      throw error;
    }
  }

  /**
   * Query folders to find the best matches for a given file
   * @param {string} fileId - The file ID to query
   * @param {number} topK - Number of top results to return
   * @returns {Array} Sorted array of folder matches with scores
   */
  async queryFolders(fileId, topK = 5) {
    await this.initialize();

    try {
      // First get the file's embedding
      const fileResult = await this.fileCollection.get({
        ids: [fileId],
      });

      if (!fileResult.embeddings || fileResult.embeddings.length === 0) {
        logger.warn('[ChromaDB] File not found for querying:', fileId);
        return [];
      }

      const fileEmbedding = fileResult.embeddings[0];

      // Query the folder collection for similar embeddings
      const results = await this.folderCollection.query({
        queryEmbeddings: [fileEmbedding],
        nResults: topK,
      });

      if (!results.ids || results.ids[0].length === 0) {
        return [];
      }

      // Format results to match expected interface
      const matches = [];
      for (let i = 0; i < results.ids[0].length; i++) {
        const folderId = results.ids[0][i];
        const distance = results.distances[0][i];
        const metadata = results.metadatas[0][i];

        // Convert distance to similarity score (1 - distance for cosine)
        // ChromaDB returns distances where 0 = identical, 2 = opposite
        const score = Math.max(0, 1 - distance / 2);

        matches.push({
          folderId,
          name: metadata.name || folderId,
          score,
          description: metadata.description,
          path: metadata.path,
        });
      }

      return matches.sort((a, b) => b.score - a.score);
    } catch (error) {
      logger.error('[ChromaDB] Failed to query folders:', error);
      return [];
    }
  }

  /**
   * Query files for similarity search
   * @param {Array} queryEmbedding - The embedding vector to search for
   * @param {number} topK - Number of results to return
   * @returns {Array} Similar files with scores
   */
  async querySimilarFiles(queryEmbedding, topK = 10) {
    await this.initialize();

    try {
      const results = await this.fileCollection.query({
        queryEmbeddings: [queryEmbedding],
        nResults: topK,
      });

      if (!results.ids || results.ids[0].length === 0) {
        return [];
      }

      const matches = [];
      for (let i = 0; i < results.ids[0].length; i++) {
        const distance = results.distances[0][i];
        const metadata = results.metadatas[0][i];

        // Convert distance to similarity score
        const score = Math.max(0, 1 - distance / 2);

        matches.push({
          id: results.ids[0][i],
          score,
          metadata,
          document: results.documents[0][i],
        });
      }

      return matches.sort((a, b) => b.score - a.score);
    } catch (error) {
      logger.error('[ChromaDB] Failed to query similar files:', error);
      return [];
    }
  }

  /**
   * Get all folder embeddings
   */
  async getAllFolders() {
    await this.initialize();

    try {
      // ChromaDB's get() without parameters returns all items
      const result = await this.folderCollection.get({});

      const folders = [];
      if (result.ids) {
        for (let i = 0; i < result.ids.length; i++) {
          folders.push({
            id: result.ids[i],
            name: result.metadatas[i]?.name || result.ids[i],
            vector: result.embeddings[i],
            metadata: result.metadatas[i],
          });
        }
      }

      return folders;
    } catch (error) {
      logger.error('[ChromaDB] Failed to get all folders:', error);
      return [];
    }
  }

  /**
   * Reset all file embeddings
   */
  async resetFiles() {
    await this.initialize();

    try {
      // Delete and recreate the collection
      await this.client.deleteCollection({ name: 'file_embeddings' });

      this.fileCollection = await this.client.createCollection({
        name: 'file_embeddings',
        metadata: {
          description: 'Document and image file embeddings for semantic search',
          hnsw_space: 'cosine',
        },
      });

      logger.info('[ChromaDB] Reset file embeddings collection');
    } catch (error) {
      logger.error('[ChromaDB] Failed to reset files:', error);
      throw error;
    }
  }

  /**
   * Reset all folder embeddings
   */
  async resetFolders() {
    await this.initialize();

    try {
      // Delete and recreate the collection
      await this.client.deleteCollection({ name: 'folder_embeddings' });

      this.folderCollection = await this.client.createCollection({
        name: 'folder_embeddings',
        metadata: {
          description: 'Smart folder embeddings for categorization',
          hnsw_space: 'cosine',
        },
      });

      logger.info('[ChromaDB] Reset folder embeddings collection');
    } catch (error) {
      logger.error('[ChromaDB] Failed to reset folders:', error);
      throw error;
    }
  }

  /**
   * Reset all embeddings (both files and folders)
   */
  async resetAll() {
    await this.resetFiles();
    await this.resetFolders();
  }

  /**
   * Migrate from old JSONL format to ChromaDB
   * @param {string} jsonlPath - Path to JSONL file
   * @param {string} type - 'file' or 'folder'
   */
  async migrateFromJsonl(jsonlPath, type = 'file') {
    await this.initialize();

    try {
      const data = await fs.readFile(jsonlPath, 'utf8');
      const lines = data.split(/\r?\n/).filter(Boolean);
      console.log(`Found ${lines.length} lines in JSONL file.`);

      let migrated = 0;
      for (const line of lines) {
        try {
          const obj = JSON.parse(line);
          console.log('Parsed object:', obj);
          if (obj && obj.id && obj.vector) {
            if (type === 'folder') {
              await this.upsertFolder(obj);
            } else {
              // Correctly pass the file object to upsertFile
              await this.upsertFile({
                id: obj.id,
                vector: obj.vector,
                meta: obj.meta || {},
              });
            }
            migrated++;
            console.log('Migrated entry:', obj.id);
          }
        } catch (error) {
          logger.warn('[ChromaDB] Failed to migrate line:', error.message);
        }
      }

      logger.info(
        `[ChromaDB] Migrated ${migrated} ${type} embeddings from JSONL`,
      );
      return migrated;
    } catch (error) {
      if (error.code === 'ENOENT') {
        logger.info(
          `[ChromaDB] No existing JSONL file to migrate: ${jsonlPath}`,
        );
        return 0;
      }
      logger.error('[ChromaDB] Migration failed:', error);
      throw error;
    }
  }

  /**
   * Get collection statistics
   */
  async getStats() {
    await this.initialize();

    try {
      const fileCount = await this.fileCollection.count();
      const folderCount = await this.folderCollection.count();

      return {
        files: fileCount,
        folders: folderCount,
        dbPath: this.dbPath,
        serverUrl: this.serverUrl,
        initialized: this.initialized,
      };
    } catch (error) {
      logger.error('[ChromaDB] Failed to get stats:', error);
      return {
        files: 0,
        folders: 0,
        dbPath: this.dbPath,
        serverUrl: this.serverUrl,
        initialized: false,
        error: error.message,
      };
    }
  }

  /**
   * Cleanup and close connections
   */
  async cleanup() {
    if (this.client) {
      // ChromaDB client doesn't require explicit cleanup in JS
      // but we'll reset our references
      this.fileCollection = null;
      this.folderCollection = null;
      this.client = null;
      this.initialized = false;
      logger.info('[ChromaDB] Cleaned up connections');
    }
  }

  /**
   * Check if ChromaDB server is running and available
   * @param {number} timeoutMs - Timeout in milliseconds (default: 10000)
   * @returns {Promise<boolean>}
   */
  async isServerAvailable(timeoutMs = 10000) {
    try {
      // Always create a lightweight client for heartbeat checks
      const client = new ChromaClient({
        path: this.serverUrl,
      });

      // Wrap heartbeat in Promise.race with timeout
      const heartbeatPromise = client.heartbeat();
      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => {
          reject(new Error(`Heartbeat timeout after ${timeoutMs}ms`));
        }, timeoutMs);
      });

      const hb = await Promise.race([heartbeatPromise, timeoutPromise]);

      logger.info('[ChromaDB] Server heartbeat successful:', {
        hb,
        serverUrl: this.serverUrl,
      });
      return true;
    } catch (error) {
      // Distinguish between timeout and connection failures
      const isTimeout = error.message && error.message.includes('timeout');
      if (isTimeout) {
        logger.warn('[ChromaDB] Server heartbeat timed out:', {
          timeoutMs,
          serverUrl: this.serverUrl,
        });
      } else {
        logger.warn('[ChromaDB] Server heartbeat failed:', {
          message: error.message,
          serverUrl: this.serverUrl,
        });
      }
      return false;
    }
  }

  getServerConfig() {
    return {
      host: this.serverHost,
      port: this.serverPort,
      protocol: this.serverProtocol,
      url: this.serverUrl,
      dbPath: this.dbPath,
    };
  }
}

// Export as singleton to maintain single database connection
let instance = null;

module.exports = {
  ChromaDBService,
  getInstance: () => {
    if (!instance) {
      instance = new ChromaDBService();
    }
    return instance;
  },
};

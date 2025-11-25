import { logger } from '../../../shared/logger';
import { withRetry } from '../../../shared/errorHandlingUtils';
import { sanitizeMetadata } from '../../../shared/pathSanitization';

interface FolderData {
  id: string;
  vector: number[];
  name?: string;
  description?: string;
  path?: string;
  model?: string;
  updatedAt?: string;
  typicalContents?: string;
  exampleKeywords?: string;
  fileCount?: number;
  matchSuccessRate?: number;
}

interface FileData {
  id: string;
  vector: number[];
  model?: string;
  updatedAt?: string;
  meta?: {
    path?: string;
    name?: string;
    extension?: string;
    fileHash?: string;
    category?: string;
    confidence?: number;
    promptVersion?: string;
    processingTimeMs?: number;
    analyzedAt?: string;
    analysis?: {
      category?: string;
      project?: string;
      purpose?: string;
      documentType?: string;
      keywords?: string | string[];
      summary?: string;
      language?: string;
      hasHeadings?: boolean;
      hasTables?: boolean;
      wordCount?: number;
      content_type?: string;
      contentType?: string;
      has_text?: boolean;
      hasText?: boolean;
      text_content?: string;
      textContent?: string;
      confidence?: number;
      confidenceBreakdown?: any;
    };
  };
}

class ChromaCollectionManager {
  private client: any;
  private fileCollection: any;
  private folderCollection: any;

  constructor(client: any) {
    this.client = client;
    this.fileCollection = null;
    this.folderCollection = null;
  }

  async initialize(): Promise<{ fileCount: number; folderCount: number }> {
    try {
      // Create or get collections for files and folders
      this.fileCollection = await this.client.getOrCreateCollection({
        name: 'file_embeddings',
        metadata: {
          description: 'Document and image file embeddings for semantic search',
          hnsw_space: 'cosine',
        },
      });

      this.folderCollection = await this.client.getOrCreateCollection({
        name: 'folder_embeddings',
        metadata: {
          description: 'Smart folder embeddings for categorization',
          hnsw_space: 'cosine',
        },
      });

      return {
        fileCount: await this.fileCollection.count(),
        folderCount: await this.folderCollection.count(),
      };
    } catch (error) {
      logger.error('[ChromaCollectionManager] Initialization failed:', error);
      throw error;
    }
  }

  async resetFiles(): Promise<void> {
    try {
      await this.client.deleteCollection({ name: 'file_embeddings' });
      this.fileCollection = await this.client.createCollection({
        name: 'file_embeddings',
        metadata: {
          description: 'Document and image file embeddings for semantic search',
          hnsw_space: 'cosine',
        },
      });
      logger.info('[ChromaCollectionManager] Reset file embeddings collection');
    } catch (error) {
      logger.error('[ChromaCollectionManager] Failed to reset files:', error);
      throw error;
    }
  }

  async resetFolders(): Promise<void> {
    try {
      await this.client.deleteCollection({ name: 'folder_embeddings' });
      this.folderCollection = await this.client.createCollection({
        name: 'folder_embeddings',
        metadata: {
          description: 'Smart folder embeddings for categorization',
          hnsw_space: 'cosine',
        },
      });
      logger.info('[ChromaCollectionManager] Reset folder embeddings collection');
    } catch (error) {
      logger.error('[ChromaCollectionManager] Failed to reset folders:', error);
      throw error;
    }
  }

  async upsertFolder(folder: FolderData): Promise<void> {
    if (!folder.id || !folder.vector || !Array.isArray(folder.vector)) {
      throw new Error('Invalid folder data: missing id or vector');
    }
    return withRetry(async () => {
      const metadata = {
        // Basic fields
        name: folder.name || '',
        description: folder.description || '',
        path: folder.path || '',
        model: folder.model || '',
        updatedAt: folder.updatedAt || new Date().toISOString(),
        // Enhanced folder metadata (NEW - backward compatible with defaults)
        typicalContents: folder.typicalContents || '',
        exampleKeywords: folder.exampleKeywords || '',
        fileCount: folder.fileCount || 0,
        matchSuccessRate: folder.matchSuccessRate || 0,
      };

      const sanitized = sanitizeMetadata(metadata);

      await this.folderCollection.upsert({
        ids: [folder.id],
        embeddings: [folder.vector],
        metadatas: [sanitized],
        documents: [folder.name || folder.id],
      });
    }, { maxRetries: 3, initialDelay: 500 })();
  }

  async upsertFile(file: FileData): Promise<void> {
    if (!file.id || !file.vector || !Array.isArray(file.vector)) {
      throw new Error('Invalid file data: missing id or vector');
    }
    return withRetry(async () => {
      const meta = file.meta || {};
      const analysis = meta.analysis || {};

      // Build enhanced metadata (backward compatible - all new fields have defaults)
      const enhancedMetadata = {
        // Basic identification
        path: meta.path || '',
        name: meta.name || '',
        extension: meta.extension || '',
        fileHash: meta.fileHash || '',
        // Analysis results
        category: analysis.category || meta.category || '',
        project: analysis.project || '',
        purpose: analysis.purpose || '',
        documentType: analysis.documentType || '',
        keywords: Array.isArray(analysis.keywords)
          ? analysis.keywords.join(',')
          : (analysis.keywords || ''),
        summary: (analysis.summary || '').slice(0, 200),
        language: analysis.language || '',
        // Document structure
        hasHeadings: analysis.hasHeadings || false,
        hasTables: analysis.hasTables || false,
        wordCount: analysis.wordCount || 0,
        // Image-specific
        contentType: analysis.content_type || analysis.contentType || '',
        hasText: analysis.has_text || analysis.hasText || false,
        textContent: (analysis.text_content || analysis.textContent || '').slice(0, 200),
        // Confidence tracking
        confidence: analysis.confidence || meta.confidence || 0,
        confidenceBreakdown: typeof analysis.confidenceBreakdown === 'object'
          ? JSON.stringify(analysis.confidenceBreakdown)
          : (analysis.confidenceBreakdown || ''),
        // Processing metadata
        model: file.model || '',
        promptVersion: meta.promptVersion || 'v1.0',
        processingTimeMs: meta.processingTimeMs || 0,
        analyzedAt: meta.analyzedAt || new Date().toISOString(),
        updatedAt: file.updatedAt || new Date().toISOString(),
      };

      const sanitized = sanitizeMetadata(enhancedMetadata);

      await this.fileCollection.upsert({
        ids: [file.id],
        embeddings: [file.vector],
        metadatas: [sanitized],
        documents: [(sanitized as any).path || file.id],
      });
    }, { maxRetries: 3, initialDelay: 500 })();
  }

  async batchUpsertFiles(
    ids: string[],
    embeddings: number[][],
    metadatas: any[],
    documents: string[]
  ): Promise<void> {
    return withRetry(async () => {
      await this.fileCollection.upsert({
        ids,
        embeddings,
        metadatas,
        documents
      });
    }, { maxRetries: 3, initialDelay: 500 })();
  }

  async batchUpsertFolders(
    ids: string[],
    embeddings: number[][],
    metadatas: any[],
    documents: string[]
  ): Promise<void> {
    return withRetry(async () => {
      await this.folderCollection.upsert({
        ids,
        embeddings,
        metadatas,
        documents
      });
    }, { maxRetries: 3, initialDelay: 500 })();
  }

  async deleteFile(id: string): Promise<void> {
    await this.fileCollection.delete({ ids: [id] });
  }

  async deleteFiles(ids: string[]): Promise<void> {
    await this.fileCollection.delete({ ids });
  }

  async getFile(id: string): Promise<any> {
    return await this.fileCollection.get({
      ids: [id],
      include: ['embeddings', 'metadatas', 'documents']
    });
  }

  async getFiles(ids: string[]): Promise<any> {
    return await this.fileCollection.get({
      ids,
      include: ['embeddings']
    });
  }

  async getAllFolders(): Promise<any> {
    return await this.folderCollection.get({});
  }
}

export default ChromaCollectionManager;

import { logger } from '../../../shared/logger';

interface QueryMatch {
  folderId: string;
  name: string;
  score: number;
  description?: string;
  path?: string;
}

interface QueryResults {
  ids?: string[][];
  distances?: number[][];
  metadatas?: Array<Array<{
    name?: string;
    description?: string;
    path?: string;
  }>>;
}

interface CachedQuery {
  data: QueryMatch[];
  timestamp: number;
}

class ChromaQueryBuilder {
  private collectionManager: any;
  private queryCache: Map<string, CachedQuery>;
  private readonly queryCacheTTL: number;
  private readonly maxCacheSize: number;
  private inflightQueries: Map<string, Promise<QueryMatch[]>>;

  constructor(collectionManager: any) {
    this.collectionManager = collectionManager;

    // Cache settings
    this.queryCache = new Map();
    this.queryCacheTTL = 120000; // 2 minutes
    this.maxCacheSize = 200;
    this.inflightQueries = new Map();
  }

  private _getCachedQuery(key: string): QueryMatch[] | null {
    const cached = this.queryCache.get(key);
    if (!cached) return null;
    if (Date.now() - cached.timestamp > this.queryCacheTTL) {
      this.queryCache.delete(key);
      return null;
    }
    return cached.data;
  }

  private _setCachedQuery(key: string, data: QueryMatch[]): void {
    if (this.queryCache.has(key)) this.queryCache.delete(key);
    if (this.queryCache.size >= this.maxCacheSize) {
      const oldestKey = this.queryCache.keys().next().value;
      if (oldestKey) this.queryCache.delete(oldestKey);
    }
    this.queryCache.set(key, { data, timestamp: Date.now() });
  }

  private _invalidateCacheForFile(fileId: string): void {
    for (const key of Array.from(this.queryCache.keys())) {
      if (key.includes(fileId)) this.queryCache.delete(key);
    }
  }

  private _invalidateCacheForFolder(): void {
    for (const key of Array.from(this.queryCache.keys())) {
      if (key.startsWith('query:folders:')) this.queryCache.delete(key);
    }
  }

  clearQueryCache(): void {
    const size = this.queryCache.size;
    this.queryCache.clear();
    logger.info('[ChromaQueryBuilder] Query cache cleared', { entriesCleared: size });
  }

  async queryFoldersByEmbedding(embedding: number[], topK: number = 5): Promise<QueryMatch[]> {
    try {
      if (!Array.isArray(embedding) || embedding.length === 0) return [];

      const results = await this.collectionManager.folderCollection.query({
        queryEmbeddings: [embedding],
        nResults: topK
      });

      return this._processResults(results);
    } catch (error) {
      logger.error('[ChromaQueryBuilder] Failed to query folders by embedding:', error);
      return [];
    }
  }

  async queryFolders(fileId: string, topK: number = 5): Promise<QueryMatch[]> {
    const cacheKey = `query:folders:${fileId}:${topK}`;
    const cached = this._getCachedQuery(cacheKey);
    if (cached) return cached;

    if (this.inflightQueries.has(cacheKey)) {
      return this.inflightQueries.get(cacheKey)!;
    }

    const queryPromise = this._executeQueryFolders(fileId, topK);
    this.inflightQueries.set(cacheKey, queryPromise);

    try {
      const results = await queryPromise;
      this._setCachedQuery(cacheKey, results);
      return results;
    } finally {
      this.inflightQueries.delete(cacheKey);
    }
  }

  private async _executeQueryFolders(fileId: string, topK: number): Promise<QueryMatch[]> {
    try {
      // Retry logic for file retrieval
      let fileResult: any = null;
      for (let attempt = 0; attempt < 3; attempt++) {
        try {
          fileResult = await this.collectionManager.fileCollection.get({
            ids: [fileId],
            include: ['embeddings', 'metadatas', 'documents']
          });
          if (fileResult?.embeddings?.length > 0) break;
          await new Promise(r => setTimeout(r, 100 * (attempt + 1)));
        } catch (e) {
          if (attempt === 2) throw e;
          await new Promise(r => setTimeout(r, 100 * (attempt + 1)));
        }
      }

      if (!fileResult?.embeddings?.length) return [];

      const fileEmbedding = fileResult.embeddings[0];
      if (!fileEmbedding || fileEmbedding.length === 0) return [];

      const results = await this.collectionManager.folderCollection.query({
        queryEmbeddings: [fileEmbedding],
        nResults: topK
      });

      return this._processResults(results);
    } catch (error) {
      logger.error('[ChromaQueryBuilder] Failed to query folders:', error);
      return [];
    }
  }

  private _processResults(results: QueryResults): QueryMatch[] {
    if (!results?.ids?.[0] || !results?.distances?.[0]) return [];

    const matches: QueryMatch[] = [];
    const ids = results.ids[0];
    const distances = results.distances[0];
    const metadatas = results.metadatas?.[0] || [];

    const count = Math.min(ids.length, distances.length);
    for (let i = 0; i < count; i++) {
      const score = Math.max(0, 1 - distances[i] / 2);
      matches.push({
        folderId: ids[i],
        name: metadatas[i]?.name || ids[i],
        score,
        description: metadatas[i]?.description,
        path: metadatas[i]?.path
      });
    }

    return matches.sort((a, b) => b.score - a.score);
  }

  async cleanup(): Promise<void> {
    if (this.inflightQueries.size > 0) {
      await Promise.allSettled(Array.from(this.inflightQueries.values()));
    }
    this.queryCache.clear();
    this.inflightQueries.clear();
  }
}

export default ChromaQueryBuilder;

const path = require('path');
const os = require('os');
const fs = require('fs').promises;

// Global state for mock collections (prefixed with 'mock' for jest.mock scoping)
let mockFileCollectionData;
let mockFolderCollectionData;

// Mock the ChromaDB sub-modules that ChromaDBService uses
jest.mock('../src/main/services/chroma/ChromaProcessManager', () => {
  return jest.fn().mockImplementation(() => ({
    isOnline: true,
    initializeClient: jest.fn().mockResolvedValue({}),
    checkHealth: jest.fn().mockResolvedValue(true),
    startHealthCheck: jest.fn(),
    shutdown: jest.fn().mockResolvedValue(),
    cleanup: jest.fn(),
  }));
});

jest.mock('../src/main/services/chroma/ChromaCollectionManager', () => {
  return jest.fn().mockImplementation(() => {
    // Initialize fresh data stores
    mockFileCollectionData = new Map();
    mockFolderCollectionData = new Map();

    // Create collections using the data stores
    const fileCol = {
      upsert: jest
        .fn()
        .mockImplementation(
          async ({ ids, embeddings, metadatas, documents }) => {
            for (let i = 0; i < ids.length; i++) {
              mockFileCollectionData.set(ids[i], {
                id: ids[i],
                embedding: embeddings[i],
                metadata: metadatas[i],
                document: documents[i],
              });
            }
          },
        ),
      get: jest.fn().mockImplementation(async (params) => {
        const result = {
          ids: [],
          embeddings: [],
          metadatas: [],
          documents: [],
        };
        if (params && params.ids && params.ids.length > 0) {
          for (const id of params.ids) {
            const item = mockFileCollectionData.get(id);
            if (item) {
              result.ids.push(item.id);
              result.embeddings.push(item.embedding);
              result.metadatas.push(item.metadata);
              result.documents.push(item.document);
            }
          }
        }
        return result;
      }),
      delete: jest.fn().mockImplementation(async ({ ids }) => {
        for (const id of ids) {
          mockFileCollectionData.delete(id);
        }
      }),
      count: jest
        .fn()
        .mockImplementation(async () => mockFileCollectionData.size),
    };

    const folderCol = {
      upsert: jest
        .fn()
        .mockImplementation(
          async ({ ids, embeddings, metadatas, documents }) => {
            for (let i = 0; i < ids.length; i++) {
              mockFolderCollectionData.set(ids[i], {
                id: ids[i],
                embedding: embeddings[i],
                metadata: metadatas[i],
                document: documents[i],
              });
            }
          },
        ),
      get: jest.fn().mockImplementation(async (params) => {
        const result = {
          ids: [],
          embeddings: [],
          metadatas: [],
          documents: [],
        };
        if (params && params.ids && params.ids.length > 0) {
          for (const id of params.ids) {
            const item = mockFolderCollectionData.get(id);
            if (item) {
              result.ids.push(item.id);
              result.embeddings.push(item.embedding);
              result.metadatas.push(item.metadata);
              result.documents.push(item.document);
            }
          }
        }
        return result;
      }),
      count: jest
        .fn()
        .mockImplementation(async () => mockFolderCollectionData.size),
    };

    return {
      client: null,
      fileCollection: fileCol,
      folderCollection: folderCol,
      initialize: jest.fn().mockResolvedValue(),
      upsertFolder: jest.fn().mockImplementation(async (folder) => {
        await folderCol.upsert({
          ids: [folder.id],
          embeddings: [folder.vector],
          metadatas: [{ name: folder.name, path: folder.path }],
          documents: [folder.name || folder.id],
        });
      }),
      upsertFile: jest.fn().mockImplementation(async (file) => {
        await fileCol.upsert({
          ids: [file.id],
          embeddings: [file.vector],
          metadatas: [file.meta || {}],
          documents: [file.meta?.name || file.id],
        });
      }),
      getFile: jest.fn().mockImplementation(async (id) => {
        const result = await fileCol.get({ ids: [id] });
        return result;
      }),
      deleteFile: jest.fn().mockImplementation(async (id) => {
        await fileCol.delete({ ids: [id] });
      }),
      batchUpsertFolders: jest
        .fn()
        .mockImplementation(async (ids, embeddings, metadatas, documents) => {
          await folderCol.upsert({ ids, embeddings, metadatas, documents });
        }),
      batchUpsertFiles: jest
        .fn()
        .mockImplementation(async (ids, embeddings, metadatas, documents) => {
          await fileCol.upsert({ ids, embeddings, metadatas, documents });
        }),
    };
  });
});

jest.mock('../src/main/services/chroma/ChromaQueryBuilder', () => {
  return jest.fn().mockImplementation(() => ({
    _invalidateCacheForFolder: jest.fn(),
    _invalidateCacheForFile: jest.fn(),
    cleanup: jest.fn().mockResolvedValue(),
    queryCache: new Map(),
    maxCacheSize: 100,
    queryCacheTTL: 60000,
    inflightQueries: new Map(),
  }));
});

// Mock logger
jest.mock('../src/shared/logger', () => ({
  logger: {
    setContext: jest.fn(),
    info: jest.fn(),
    debug: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

describe('ChromaDBService Batch Operations', () => {
  let tmpDir;
  let chromaDbService;

  beforeEach(async () => {
    // Clear module cache for fresh state
    jest.resetModules();

    // Reset data stores
    mockFileCollectionData = new Map();
    mockFolderCollectionData = new Map();

    tmpDir = path.join(os.tmpdir(), `chromadb-batch-${Date.now()}`);
    await fs.mkdir(tmpDir, { recursive: true });

    // Mock electron app
    const electron = require('electron');
    if (!electron.app) {
      electron.app = { getPath: jest.fn() };
    }
    electron.app.getPath = jest.fn().mockReturnValue(tmpDir);

    const { ChromaDBService } = require('../src/main/services/ChromaDBService');
    chromaDbService = new ChromaDBService();
    await chromaDbService.initialize();
  });

  afterEach(async () => {
    if (chromaDbService && chromaDbService.cleanup) {
      await chromaDbService.cleanup();
    }
    try {
      await fs.rm(tmpDir, { recursive: true, force: true });
    } catch (_e) {
      // Ignore cleanup errors
    }
  });

  test('batchUpsertFolders inserts multiple folders', async () => {
    const folders = [
      { id: 'f1', name: 'Folder 1', vector: [0.1, 0.1], description: 'Desc 1' },
      { id: 'f2', name: 'Folder 2', vector: [0.2, 0.2], description: 'Desc 2' },
    ];

    const result = await chromaDbService.batchUpsertFolders(folders);
    expect(result.count).toBe(2);
    expect(result.skipped).toHaveLength(0);

    const stats = await chromaDbService.getStats();
    expect(stats.folders).toBe(2);
  });

  test('batchUpsertFiles inserts multiple files', async () => {
    const files = [
      { id: 'file1', vector: [0.1, 0.1], meta: { path: '/p1', name: 'f1' } },
      { id: 'file2', vector: [0.2, 0.2], meta: { path: '/p2', name: 'f2' } },
    ];

    const count = await chromaDbService.batchUpsertFiles(files);
    expect(count).toBe(2);

    const stats = await chromaDbService.getStats();
    expect(stats.files).toBe(2);
  });

  test('updateFilePaths updates metadata and ids', async () => {
    // Setup initial file
    await chromaDbService.upsertFile({
      id: 'file:/old/path.txt',
      vector: [0.5, 0.5],
      meta: { path: '/old/path.txt', name: 'path.txt' },
    });

    // Update path
    const updates = [
      {
        oldId: 'file:/old/path.txt',
        newId: 'file:/new/path.txt',
        newMeta: { path: '/new/path.txt', name: 'path.txt' },
      },
    ];

    const updatedCount = await chromaDbService.updateFilePaths(updates);
    expect(updatedCount).toBe(1);

    // Verify old is gone and new exists
    const oldExists = await chromaDbService.fileCollection.get({
      ids: ['file:/old/path.txt'],
    });
    expect(oldExists.ids).toHaveLength(0);

    const newExists = await chromaDbService.fileCollection.get({
      ids: ['file:/new/path.txt'],
    });
    expect(newExists.ids).toHaveLength(1);
    // Normalize path separators for cross-platform compatibility
    expect(newExists.metadatas[0].path.replace(/\\/g, '/')).toBe(
      '/new/path.txt',
    );
  });

  test('updateFilePaths handles non-existent old files gracefully', async () => {
    const updates = [
      {
        oldId: 'file:nonexistent',
        newId: 'file:new',
        newMeta: { path: '/new' },
      },
    ];

    const count = await chromaDbService.updateFilePaths(updates);
    expect(count).toBe(0);
  });
});

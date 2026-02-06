const fs = require('fs');
const path = require('path');
const { createLogger } = require('../../shared/logger');

const logger = createLogger('SqliteStore');

const dbCache = new Map();
const storeCache = new Map();

const SQLITE_TRANSIENT_ERRORS = new Set([
  'SQLITE_BUSY',
  'SQLITE_LOCKED',
  'SQLITE_IOERR',
  'SQLITE_CANTOPEN',
  'SQLITE_PROTOCOL',
  'SQLITE_CORRUPT'
]);

function shouldUseSqliteBackend(backendName) {
  const normalized = String(backendName || '')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '_');
  const explicit = process.env[`STRATOSORT_${normalized}_BACKEND`];
  if (explicit) {
    return explicit.toLowerCase() === 'sqlite';
  }
  const global = process.env.STRATOSORT_PERSISTENCE_BACKEND;
  if (global) {
    return global.toLowerCase() === 'sqlite';
  }
  if (process.env.JEST_WORKER_ID || process.env.NODE_ENV === 'test') {
    return false;
  }
  return true;
}

function isSqliteTransientError(error) {
  return Boolean(error?.code && SQLITE_TRANSIENT_ERRORS.has(error.code));
}

function getDatabase(dbPath, options = {}) {
  if (dbCache.has(dbPath)) {
    const cached = dbCache.get(dbPath);
    cached.refCount += 1;
    return cached.db;
  }

  const dir = path.dirname(dbPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  let Database;
  try {
    Database = require('better-sqlite3');
  } catch (error) {
    logger.error('[SqliteStore] Failed to load better-sqlite3', { error: error.message });
    throw error;
  }

  const db = new Database(dbPath, {
    timeout: options.timeoutMs || 5000
  });

  try {
    db.pragma('journal_mode = WAL');
    db.pragma('synchronous = NORMAL');
    db.pragma(`busy_timeout = ${options.busyTimeoutMs || 5000}`);
    db.pragma('foreign_keys = ON');
  } catch (pragmaError) {
    logger.debug('[SqliteStore] Failed to apply pragmas', { error: pragmaError.message });
  }

  dbCache.set(dbPath, { db, refCount: 1 });
  return db;
}

function releaseDatabase(dbPath) {
  const cached = dbCache.get(dbPath);
  if (!cached) return;
  cached.refCount -= 1;
  if (cached.refCount <= 0) {
    try {
      cached.db.close();
    } catch (error) {
      logger.debug('[SqliteStore] Failed to close database', { error: error.message });
    }
    dbCache.delete(dbPath);
  }
}

function createKeyValueStore(options = {}) {
  const {
    dbPath,
    tableName = 'kv',
    timeoutMs = 5000,
    busyTimeoutMs = 5000,
    serialize,
    deserialize
  } = options;

  if (!dbPath) {
    throw new Error('SqliteStore: dbPath is required');
  }

  const cacheKey = `${dbPath}::${tableName}`;
  if (storeCache.has(cacheKey)) {
    return storeCache.get(cacheKey);
  }

  const db = getDatabase(dbPath, { timeoutMs, busyTimeoutMs });

  db.prepare(
    `CREATE TABLE IF NOT EXISTS ${tableName} (
      key TEXT PRIMARY KEY,
      value BLOB NOT NULL,
      updatedAt TEXT NOT NULL
    )`
  ).run();

  let getStmt = db.prepare(`SELECT value FROM ${tableName} WHERE key = ?`);
  let setStmt = db.prepare(
    `INSERT INTO ${tableName} (key, value, updatedAt)
     VALUES (@key, @value, @updatedAt)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value, updatedAt = excluded.updatedAt`
  );
  let deleteStmt = db.prepare(`DELETE FROM ${tableName} WHERE key = ?`);

  const encode = serialize ? serialize : (value) => Buffer.from(JSON.stringify(value), 'utf8');
  const decode = deserialize
    ? deserialize
    : (raw) => {
        if (raw === null || raw === undefined) return undefined;
        const text = Buffer.isBuffer(raw) ? raw.toString('utf8') : String(raw);
        return JSON.parse(text);
      };

  let closed = false;

  const store = {
    get(key) {
      if (closed) throw new Error('Store is closed');
      const row = getStmt.get(key);
      if (!row) return undefined;
      return decode(row.value);
    },
    set(key, value, updatedAt = new Date().toISOString()) {
      if (closed) throw new Error('Store is closed');
      const payload = encode(value);
      setStmt.run({ key, value: payload, updatedAt });
    },
    delete(key) {
      if (closed) throw new Error('Store is closed');
      deleteStmt.run(key);
    },
    close() {
      if (closed) return;
      closed = true;
      releaseDatabase(dbPath);
      storeCache.delete(cacheKey);
      // Release references to help GC
      getStmt = null;
      setStmt = null;
      deleteStmt = null;
    }
  };

  storeCache.set(cacheKey, store);
  return store;
}

module.exports = {
  createKeyValueStore,
  shouldUseSqliteBackend,
  isSqliteTransientError
};

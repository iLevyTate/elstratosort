# StratoSort Architectural Improvements

## Design Proposals for Long-Term Sustainability

**Date:** 2025-11-23
**Purpose:** Detailed architectural designs addressing systemic issues
**Audience:** Development team, technical stakeholders

---

## Table of Contents

1. [Transactional File Operations](#1-transactional-file-operations)
2. [Service Lifecycle Management](#2-service-lifecycle-management)
3. [Centralized State Management](#3-centralized-state-management)
4. [Error Handling Strategy](#4-error-handling-strategy)
5. [Clean Architecture Implementation](#5-clean-architecture-implementation)
6. [Resource Management Patterns](#6-resource-management-patterns)
7. [Monitoring & Observability](#7-monitoring--observability)

---

## 1. Transactional File Operations

### Problem

Multi-step file operations (organize, batch move, rename) can fail partway through, leaving the file system in an inconsistent state with no rollback mechanism.

### Solution: Saga Pattern with Journal

Implement a transaction coordinator that tracks all operations in a journal and can roll back on failure.

### Architecture Diagram

```
┌─────────────────────────────────────────┐
│    FileOrganizationSaga                 │
│    - Coordinates multi-step operations  │
└───────────┬─────────────────────────────┘
            │
            │ uses
            ▼
┌─────────────────────────────────────────┐
│    TransactionJournal                   │
│    - Records each step                  │
│    - Provides rollback capability       │
└───────────┬─────────────────────────────┘
            │
            │ writes to
            ▼
┌─────────────────────────────────────────┐
│    Journal File (SQLite)                │
│    - Persistent operation log           │
│    - Recovery after crashes             │
└─────────────────────────────────────────┘
```

### Detailed Design

#### 1.1 TransactionJournal Class

```javascript
// src/main/services/transaction/TransactionJournal.js
const Database = require('better-sqlite3');

class TransactionJournal {
  constructor(journalPath) {
    this.db = new Database(journalPath);
    this._initializeTables();
  }

  _initializeTables() {
    this.db.exec(`
            CREATE TABLE IF NOT EXISTS transactions (
                id TEXT PRIMARY KEY,
                status TEXT CHECK(status IN ('active', 'committed', 'rolled_back')),
                created_at INTEGER,
                completed_at INTEGER
            );

            CREATE TABLE IF NOT EXISTS operations (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                transaction_id TEXT,
                step_number INTEGER,
                operation_type TEXT,
                source_path TEXT,
                destination_path TEXT,
                status TEXT CHECK(status IN ('pending', 'completed', 'rolled_back')),
                executed_at INTEGER,
                FOREIGN KEY(transaction_id) REFERENCES transactions(id)
            );
        `);
  }

  beginTransaction() {
    const txId = `tx_${Date.now()}_${Math.random().toString(36)}`;

    this.db
      .prepare(
        `
            INSERT INTO transactions (id, status, created_at)
            VALUES (?, 'active', ?)
        `,
      )
      .run(txId, Date.now());

    return txId;
  }

  recordOperation(txId, stepNumber, operation) {
    this.db
      .prepare(
        `
            INSERT INTO operations (
                transaction_id, step_number, operation_type,
                source_path, destination_path, status, executed_at
            ) VALUES (?, ?, ?, ?, ?, 'completed', ?)
        `,
      )
      .run(
        txId,
        stepNumber,
        operation.type,
        operation.source,
        operation.destination,
        Date.now(),
      );
  }

  commitTransaction(txId) {
    this.db
      .prepare(
        `
            UPDATE transactions
            SET status = 'committed', completed_at = ?
            WHERE id = ?
        `,
      )
      .run(Date.now(), txId);

    // Clean up old committed transactions (keep for 7 days)
    this._cleanupOldTransactions();
  }

  rollbackTransaction(txId) {
    // Get all completed operations in reverse order
    const operations = this.db
      .prepare(
        `
            SELECT * FROM operations
            WHERE transaction_id = ? AND status = 'completed'
            ORDER BY step_number DESC
        `,
      )
      .all(txId);

    return operations;
  }

  markTransactionRolledBack(txId) {
    this.db
      .prepare(
        `
            UPDATE transactions
            SET status = 'rolled_back', completed_at = ?
            WHERE id = ?
        `,
      )
      .run(Date.now(), txId);
  }

  _cleanupOldTransactions() {
    const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;

    this.db
      .prepare(
        `
            DELETE FROM operations
            WHERE transaction_id IN (
                SELECT id FROM transactions
                WHERE completed_at < ? AND status IN ('committed', 'rolled_back')
            )
        `,
      )
      .run(sevenDaysAgo);

    this.db
      .prepare(
        `
            DELETE FROM transactions
            WHERE completed_at < ? AND status IN ('committed', 'rolled_back')
        `,
      )
      .run(sevenDaysAgo);
  }

  // Recovery: Find incomplete transactions
  findIncompleteTransactions() {
    return this.db
      .prepare(
        `
            SELECT * FROM transactions
            WHERE status = 'active'
            ORDER BY created_at ASC
        `,
      )
      .all();
  }
}

module.exports = TransactionJournal;
```

#### 1.2 FileOrganizationSaga Class

```javascript
// src/main/services/transaction/FileOrganizationSaga.js
const fs = require('fs').promises;
const path = require('path');
const TransactionJournal = require('./TransactionJournal');
const { logger } = require('../../shared/logger');

class FileOrganizationSaga {
  constructor(journalPath) {
    this.journal = new TransactionJournal(journalPath);
  }

  async execute(operations) {
    const txId = this.journal.beginTransaction();
    logger.info(
      `[Saga] Started transaction ${txId} with ${operations.length} operations`,
    );

    const results = [];
    let stepNumber = 0;

    try {
      for (const op of operations) {
        stepNumber++;

        // Execute the operation
        await this._executeOperation(op);

        // Record in journal
        this.journal.recordOperation(txId, stepNumber, op);

        results.push({
          success: true,
          operation: op,
          step: stepNumber,
        });

        logger.debug(
          `[Saga] Completed step ${stepNumber}/${operations.length}`,
        );
      }

      // All operations succeeded - commit
      this.journal.commitTransaction(txId);
      logger.info(`[Saga] Transaction ${txId} committed successfully`);

      return {
        success: true,
        transactionId: txId,
        results,
      };
    } catch (error) {
      // Critical error occurred - rollback
      logger.error(
        `[Saga] Transaction ${txId} failed at step ${stepNumber}`,
        error,
      );

      const rollbackResults = await this._rollback(txId);

      return {
        success: false,
        transactionId: txId,
        failedStep: stepNumber,
        error: error.message,
        results,
        rollbackResults,
      };
    }
  }

  async _executeOperation(op) {
    const { type, source, destination } = op;

    switch (type) {
      case 'move':
        // Ensure destination directory exists
        await fs.mkdir(path.dirname(destination), { recursive: true });

        // Atomic rename
        await fs.rename(source, destination);
        break;

      case 'copy':
        await fs.mkdir(path.dirname(destination), { recursive: true });
        await fs.copyFile(source, destination);
        break;

      default:
        throw new Error(`Unknown operation type: ${type}`);
    }
  }

  async _rollback(txId) {
    logger.warn(`[Saga] Rolling back transaction ${txId}`);

    const operations = this.journal.rollbackTransaction(txId);
    const rollbackResults = [];

    for (const op of operations) {
      try {
        // Reverse the operation
        if (op.operation_type === 'move') {
          // Move back to original location
          await fs.rename(op.destination_path, op.source_path);
          rollbackResults.push({
            success: true,
            operation: op,
            message: 'Rolled back successfully',
          });
        } else if (op.operation_type === 'copy') {
          // Delete the copy
          await fs.unlink(op.destination_path);
          rollbackResults.push({
            success: true,
            operation: op,
            message: 'Copy removed successfully',
          });
        }

        logger.debug(`[Saga] Rolled back step ${op.step_number}`);
      } catch (rollbackError) {
        logger.error(
          `[Saga] Rollback failed for step ${op.step_number}`,
          rollbackError,
        );

        rollbackResults.push({
          success: false,
          operation: op,
          error: rollbackError.message,
        });
      }
    }

    this.journal.markTransactionRolledBack(txId);

    const successCount = rollbackResults.filter((r) => r.success).length;
    logger.warn(
      `[Saga] Rollback complete: ${successCount}/${operations.length} succeeded`,
    );

    return rollbackResults;
  }

  // Recovery method - call on app startup
  async recoverIncompleteTransactions() {
    const incomplete = this.journal.findIncompleteTransactions();

    logger.info(`[Saga] Found ${incomplete.length} incomplete transactions`);

    for (const tx of incomplete) {
      logger.warn(`[Saga] Rolling back incomplete transaction ${tx.id}`);
      await this._rollback(tx.id);
    }
  }
}

module.exports = FileOrganizationSaga;
```

#### 1.3 Integration with Existing Code

```javascript
// src/main/ipc/files.js - Updated batch organize handler
const FileOrganizationSaga = require('../services/transaction/FileOrganizationSaga');
const path = require('path');
const { app } = require('electron');

let saga;

function initializeSaga() {
  const journalPath = path.join(
    app.getPath('userData'),
    'transaction-journal.db',
  );
  saga = new FileOrganizationSaga(journalPath);

  // Recover any incomplete transactions from previous crashes
  saga.recoverIncompleteTransactions();
}

async function handleBatchOrganize({
  operation,
  logger,
  getServiceIntegration,
  getMainWindow,
}) {
  if (!saga) {
    initializeSaga();
  }

  // Convert to saga operations
  const operations = operation.operations.map((op) => ({
    type: 'move',
    source: op.source,
    destination: op.destination,
  }));

  // Execute with transaction support
  const result = await saga.execute(operations);

  if (result.success) {
    // Update ChromaDB paths
    try {
      const {
        getInstance: getChromaDB,
      } = require('../services/ChromaDBService');
      const chromaDbService = getChromaDB();

      if (chromaDbService) {
        const pathUpdates = result.results.map((r) => ({
          oldId: `file:${r.operation.source}`,
          newId: `file:${r.operation.destination}`,
          newMeta: {
            path: r.operation.destination,
            name: path.basename(r.operation.destination),
          },
        }));

        await chromaDbService.updateFilePaths(pathUpdates);
      }
    } catch (dbError) {
      logger.warn('[FileOps] Database update failed (non-fatal)', {
        error: dbError.message,
      });
    }

    return {
      success: true,
      results: result.results,
      transactionId: result.transactionId,
      successCount: result.results.length,
      failCount: 0,
    };
  } else {
    return {
      success: false,
      error: result.error,
      transactionId: result.transactionId,
      rolledBack: true,
      rollbackResults: result.rollbackResults,
      failedStep: result.failedStep,
    };
  }
}
```

### Benefits

✅ **Atomicity:** All operations succeed or all are rolled back
✅ **Durability:** Journal survives crashes
✅ **Recovery:** Incomplete transactions detected and rolled back on restart
✅ **Auditability:** Full history of operations for debugging
✅ **User Trust:** Clear communication about rollback status

---

## 2. Service Lifecycle Management

### Problem

Services are initialized ad-hoc without dependency resolution, causing race conditions and null pointer errors.

### Solution: Dependency Injection Container

Implement a service container that manages initialization order, resolves dependencies, and provides health monitoring.

### Architecture Diagram

```
┌─────────────────────────────────────────┐
│    ServiceContainer                     │
│    - Manages service lifecycle          │
│    - Resolves dependencies              │
│    - Health monitoring                  │
└───────────┬─────────────────────────────┘
            │
            │ manages
            ▼
┌─────────────────────────────────────────┐
│    Services (as singletons)             │
├─────────────────────────────────────────┤
│ ChromaDBService                         │
│ OllamaService                           │
│ AutoOrganizeService                     │
│ BatchAnalysisService                    │
└─────────────────────────────────────────┘
```

### Detailed Design

#### 2.1 ServiceContainer Class

```javascript
// src/main/core/ServiceContainer.js
const { EventEmitter } = require('events');
const { logger } = require('../../shared/logger');

class ServiceContainer extends EventEmitter {
  constructor() {
    super();
    this.services = new Map(); // name -> { factory, dependencies, options }
    this.instances = new Map(); // name -> instance
    this.states = new Map(); // name -> state
    this.initPromises = new Map(); // name -> Promise
    this.health = new Map(); // name -> health status
  }

  /**
   * Register a service
   *
   * @param {string} name - Service name
   * @param {Function} factory - Factory function that returns service instance
   * @param {string[]} dependencies - Array of dependency names
   * @param {Object} options - Service options
   */
  register(name, factory, dependencies = [], options = {}) {
    if (this.services.has(name)) {
      throw new Error(`Service '${name}' already registered`);
    }

    this.services.set(name, {
      factory,
      dependencies,
      options: {
        singleton: true,
        timeout: 30000,
        healthCheck: true,
        ...options,
      },
    });

    this.states.set(name, 'registered');
    logger.debug(`[ServiceContainer] Registered service: ${name}`);
  }

  /**
   * Get a service instance
   *
   * @param {string} name - Service name
   * @returns {Promise<any>} Service instance
   */
  async get(name) {
    // Check if service is registered
    if (!this.services.has(name)) {
      throw new Error(`Service '${name}' not registered`);
    }

    const { options } = this.services.get(name);

    // Return existing instance for singletons
    if (options.singleton && this.states.get(name) === 'ready') {
      return this.instances.get(name);
    }

    // Wait for in-progress initialization
    if (this.initPromises.has(name)) {
      return await this.initPromises.get(name);
    }

    // Start initialization
    const initPromise = this._initialize(name);
    this.initPromises.set(name, initPromise);

    try {
      const instance = await initPromise;
      return instance;
    } finally {
      this.initPromises.delete(name);
    }
  }

  async _initialize(name) {
    const { factory, dependencies, options } = this.services.get(name);

    logger.info(`[ServiceContainer] Initializing service: ${name}`);
    this.states.set(name, 'initializing');
    this.emit('service:initializing', { name });

    try {
      // Resolve dependencies first
      const resolvedDeps = await Promise.all(
        dependencies.map((dep) => this.get(dep)),
      );

      // Create instance with timeout
      const instance = await this._withTimeout(
        factory(...resolvedDeps),
        options.timeout,
        `Service '${name}' initialization timed out`,
      );

      // Health check
      if (options.healthCheck && instance.healthCheck) {
        const healthy = await instance.healthCheck();
        if (!healthy) {
          throw new Error(`Service '${name}' health check failed`);
        }
        this.health.set(name, { healthy: true, lastCheck: Date.now() });
      }

      // Store instance
      this.instances.set(name, instance);
      this.states.set(name, 'ready');
      this.emit('service:ready', { name });

      logger.info(`[ServiceContainer] Service ready: ${name}`);
      return instance;
    } catch (error) {
      this.states.set(name, 'failed');
      this.emit('service:failed', { name, error });

      logger.error(
        `[ServiceContainer] Service initialization failed: ${name}`,
        error,
      );
      throw new Error(
        `Failed to initialize service '${name}': ${error.message}`,
      );
    }
  }

  _withTimeout(promise, timeout, errorMessage) {
    return Promise.race([
      promise,
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error(errorMessage)), timeout),
      ),
    ]);
  }

  /**
   * Get service state
   */
  getState(name) {
    return this.states.get(name) || 'unknown';
  }

  /**
   * Check service health
   */
  async checkHealth(name) {
    if (this.states.get(name) !== 'ready') {
      return { healthy: false, reason: `State: ${this.states.get(name)}` };
    }

    const instance = this.instances.get(name);
    if (!instance || !instance.healthCheck) {
      return { healthy: true, reason: 'No health check' };
    }

    try {
      const healthy = await instance.healthCheck();
      const result = { healthy, lastCheck: Date.now() };
      this.health.set(name, result);
      return result;
    } catch (error) {
      return { healthy: false, error: error.message };
    }
  }

  /**
   * Get all service states
   */
  getAllStates() {
    const states = {};
    for (const [name, state] of this.states.entries()) {
      states[name] = {
        state,
        health: this.health.get(name),
      };
    }
    return states;
  }

  /**
   * Shutdown all services
   */
  async shutdown() {
    logger.info('[ServiceContainer] Shutting down all services');

    const shutdownPromises = [];

    for (const [name, instance] of this.instances.entries()) {
      if (instance.shutdown) {
        shutdownPromises.push(
          instance.shutdown().catch((error) => {
            logger.error(
              `[ServiceContainer] Error shutting down ${name}`,
              error,
            );
          }),
        );
      }
    }

    await Promise.all(shutdownPromises);
    this.instances.clear();
    this.states.clear();
    this.health.clear();

    logger.info('[ServiceContainer] Shutdown complete');
  }
}

module.exports = ServiceContainer;
```

#### 2.2 Service Registration

```javascript
// src/main/core/registerServices.js
const ServiceContainer = require('./ServiceContainer');
const ChromaDBService = require('../services/ChromaDBService');
const OllamaService = require('../services/OllamaService');
const AutoOrganizeService = require('../services/AutoOrganizeService');
const BatchAnalysisService = require('../services/BatchAnalysisService');

async function registerServices() {
  const container = new ServiceContainer();

  // Register services with dependencies

  // No dependencies
  container.register(
    'ollama',
    async () => {
      const service = new OllamaService();
      await service.initialize();
      return service;
    },
    [], // No dependencies
    { timeout: 10000 },
  );

  // Depends on nothing
  container.register(
    'chromadb',
    async () => {
      const service = new ChromaDBService();
      await service.initialize();
      return service;
    },
    [],
    { timeout: 30000 },
  );

  // Depends on ollama and chromadb
  container.register(
    'batchAnalysis',
    async (ollama) => {
      return new BatchAnalysisService(ollama);
    },
    ['ollama'], // Dependencies
    { timeout: 5000 },
  );

  // Depends on chromadb, ollama
  container.register(
    'autoOrganize',
    async (chromadb, ollama, batchAnalysis) => {
      return new AutoOrganizeService(chromadb, ollama, batchAnalysis);
    },
    ['chromadb', 'ollama', 'batchAnalysis'],
    { timeout: 5000 },
  );

  return container;
}

module.exports = { registerServices };
```

#### 2.3 Integration with App Lifecycle

```javascript
// src/main/core/AppLifecycle.js (updated)
const { registerServices } = require('./registerServices');
const { logger } = require('../../shared/logger');

class AppLifecycle {
  constructor() {
    this.container = null;
    this.initialized = false;
  }

  async initialize() {
    logger.info('[AppLifecycle] Initializing application');

    // Register all services
    this.container = await registerServices();

    // Listen to service events
    this.container.on('service:failed', ({ name, error }) => {
      logger.error(`[AppLifecycle] Service failed: ${name}`, error);
    });

    // Pre-initialize critical services
    await this.container.get('chromadb');
    await this.container.get('ollama');

    this.initialized = true;
    logger.info('[AppLifecycle] Application initialized');
  }

  async getService(name) {
    if (!this.initialized) {
      throw new Error('Application not initialized');
    }
    return await this.container.get(name);
  }

  async checkAllServicesHealth() {
    const states = this.container.getAllStates();
    const healthChecks = {};

    for (const name of Object.keys(states)) {
      healthChecks[name] = await this.container.checkHealth(name);
    }

    return healthChecks;
  }

  async shutdown() {
    logger.info('[AppLifecycle] Shutting down application');

    if (this.container) {
      await this.container.shutdown();
    }

    this.initialized = false;
    logger.info('[AppLifecycle] Shutdown complete');
  }
}

module.exports = new AppLifecycle(); // Singleton
```

#### 2.4 Usage in IPC Handlers

```javascript
// src/main/ipc/analysis.js (updated)
const appLifecycle = require('../core/AppLifecycle');

async function analyzeFile(filePath) {
  // Get service from container (always initialized)
  const batchAnalysis = await appLifecycle.getService('batchAnalysis');

  // Use service
  const result = await batchAnalysis.analyzeFile(filePath);
  return result;
}
```

### Benefits

✅ **No Race Conditions:** Services initialized in correct order
✅ **No Null Pointers:** Services always ready when accessed
✅ **Health Monitoring:** Can detect unhealthy services
✅ **Testability:** Easy to mock services for testing
✅ **Graceful Shutdown:** Proper cleanup on app exit

---

## 3. Centralized State Management

### Problem

State is duplicated across React hooks, PhaseContext, localStorage, and main process services, causing synchronization bugs.

### Solution: Redux with Middleware

Implement Redux for single source of truth with middleware for persistence and IPC synchronization.

### Architecture Diagram

```
┌─────────────────────────────────────────┐
│    React Components                     │
│    - Dispatch actions                   │
│    - Subscribe to state                 │
└───────────┬─────────────────────────────┘
            │
            ▼
┌─────────────────────────────────────────┐
│    Redux Store (Single Source of Truth) │
├─────────────────────────────────────────┤
│  State:                                 │
│  - files                                │
│  - analysis                             │
│  - settings                             │
│  - ui                                   │
└───────────┬─────────────────────────────┘
            │
            ├──> Persist Middleware (localStorage)
            ├──> IPC Sync Middleware (main process)
            └──> Logger Middleware (debugging)
```

### Detailed Design

#### 3.1 Redux Store Setup

```javascript
// src/renderer/store/index.js
import { configureStore } from '@reduxjs/toolkit';
import filesReducer from './slices/filesSlice';
import analysisReducer from './slices/analysisSlice';
import settingsReducer from './slices/settingsSlice';
import uiReducer from './slices/uiSlice';
import { persistMiddleware } from './middleware/persistMiddleware';
import { ipcSyncMiddleware } from './middleware/ipcSyncMiddleware';
import { loggerMiddleware } from './middleware/loggerMiddleware';

// Load persisted state
const loadPersistedState = () => {
    try {
        const serialized = localStorage.getItem('app-state');
        if (serialized === null) {
            return undefined;
        }
        return JSON.parse(serialized);
    } catch (error) {
        console.error('Failed to load persisted state', error);
        return undefined;
    }
};

export const store = configureStore({
    reducer: {
        files: filesReducer,
        analysis: analysisReducer,
        settings: settingsReducer,
        ui: uiReducer
    },
    preloadedState: loadPersistedState(),
    middleware: (getDefaultMiddleware) =>
        getDefaultMiddleware({
            serializableCheck: {
                // Ignore these action types
                ignoredActions: ['files/setSelectedFiles'],
                // Ignore these field paths in all actions
                ignoredActionPaths: ['payload.timestamp'],
                // Ignore these paths in the state
                ignoredPaths: ['files.selectedFiles']
            }
        }).concat(persistMiddleware, ipcSyncMiddleware, loggerMiddleware)
});

export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;
```

#### 3.2 Redux Slices

```javascript
// src/renderer/store/slices/filesSlice.js
import { createSlice, PayloadAction } from '@reduxjs/toolkit';

const filesSlice = createSlice({
  name: 'files',
  initialState: {
    selectedFiles: [],
    analyzedFiles: [],
    organizedFiles: [],
    currentOperation: null,
    lastUpdated: null,
  },
  reducers: {
    setSelectedFiles: (state, action) => {
      state.selectedFiles = action.payload;
      state.lastUpdated = Date.now();
    },

    addSelectedFiles: (state, action) => {
      state.selectedFiles.push(...action.payload);
      state.lastUpdated = Date.now();
    },

    removeSelectedFile: (state, action) => {
      state.selectedFiles = state.selectedFiles.filter(
        (f) => f.path !== action.payload,
      );
      state.lastUpdated = Date.now();
    },

    clearSelectedFiles: (state) => {
      state.selectedFiles = [];
      state.lastUpdated = Date.now();
    },

    setAnalyzedFiles: (state, action) => {
      state.analyzedFiles = action.payload;
      state.lastUpdated = Date.now();
    },

    updateFileAnalysis: (state, action) => {
      const { path, analysis } = action.payload;
      const file = state.analyzedFiles.find((f) => f.path === path);
      if (file) {
        file.analysis = analysis;
      } else {
        state.analyzedFiles.push({ path, analysis });
      }
      state.lastUpdated = Date.now();
    },

    setCurrentOperation: (state, action) => {
      state.currentOperation = action.payload;
    },
  },
});

export const {
  setSelectedFiles,
  addSelectedFiles,
  removeSelectedFile,
  clearSelectedFiles,
  setAnalyzedFiles,
  updateFileAnalysis,
  setCurrentOperation,
} = filesSlice.actions;

export default filesSlice.reducer;
```

#### 3.3 Middleware for Persistence

```javascript
// src/renderer/store/middleware/persistMiddleware.js
export const persistMiddleware = (store) => (next) => (action) => {
  const result = next(action);

  // Get current state
  const state = store.getState();

  // Persist to localStorage
  try {
    const serialized = JSON.stringify({
      files: state.files,
      analysis: state.analysis,
      settings: state.settings,
      // Don't persist UI state
    });
    localStorage.setItem('app-state', serialized);
  } catch (error) {
    console.error('Failed to persist state', error);
  }

  return result;
};
```

#### 3.4 Middleware for IPC Sync

```javascript
// src/renderer/store/middleware/ipcSyncMiddleware.js
export const ipcSyncMiddleware = (store) => (next) => (action) => {
  const result = next(action);

  // Actions that should sync to main process
  const syncActions = [
    'files/setSelectedFiles',
    'files/addSelectedFiles',
    'analysis/setResults',
    'settings/update',
  ];

  if (syncActions.includes(action.type)) {
    // Send to main process
    window.electronAPI.state.sync({
      type: action.type,
      payload: action.payload,
      timestamp: Date.now(),
    });
  }

  return result;
};
```

#### 3.5 Component Usage

```javascript
// src/renderer/components/FileList.jsx
import { useSelector, useDispatch } from 'react-redux';
import {
  setSelectedFiles,
  removeSelectedFile,
} from '../store/slices/filesSlice';

function FileList() {
  // Subscribe to state
  const selectedFiles = useSelector((state) => state.files.selectedFiles);
  const dispatch = useDispatch();

  const handleRemoveFile = (filePath) => {
    dispatch(removeSelectedFile(filePath));
  };

  const handleAddFiles = (newFiles) => {
    dispatch(setSelectedFiles([...selectedFiles, ...newFiles]));
  };

  return (
    <div>
      {selectedFiles.map((file) => (
        <FileItem
          key={file.path}
          file={file}
          onRemove={() => handleRemoveFile(file.path)}
        />
      ))}
    </div>
  );
}
```

### Benefits

✅ **Single Source of Truth:** No state duplication
✅ **Predictable Updates:** All changes through actions
✅ **Persistence:** Auto-save to localStorage
✅ **IPC Sync:** Main process always in sync
✅ **DevTools:** Time-travel debugging
✅ **Testability:** Easy to test reducers

---

## 4. Error Handling Strategy

### Problem

Errors are handled reactively with empty catch blocks, generic messages, and no user guidance.

### Solution: Typed Error System

Implement a hierarchical error system with context, user messages, and recovery actions.

### Architecture Diagram

```
┌─────────────────────────────────────────┐
│    StratoSortError (Base)               │
│    - code                               │
│    - context                            │
│    - userMessage                        │
│    - recoveryActions                    │
└───────────┬─────────────────────────────┘
            │
            ├──> FileOperationError
            ├──> AnalysisError
            ├──> ServiceError
            ├──> ValidationError
            └──> NetworkError
```

### Detailed Design

#### 4.1 Base Error Class

```javascript
// src/shared/errors/StratoSortError.js
class StratoSortError extends Error {
  constructor(
    message,
    code,
    context = {},
    userMessage = null,
    recoveryActions = [],
  ) {
    super(message);
    this.name = this.constructor.name;
    this.code = code;
    this.context = context;
    this.userMessage = userMessage || message;
    this.recoveryActions = recoveryActions;
    this.timestamp = new Date().toISOString();

    // Capture stack trace
    Error.captureStackTrace(this, this.constructor);
  }

  toJSON() {
    return {
      name: this.name,
      message: this.message,
      code: this.code,
      context: this.context,
      userMessage: this.userMessage,
      recoveryActions: this.recoveryActions,
      timestamp: this.timestamp,
      stack: this.stack,
    };
  }

  toUserDisplay() {
    return {
      title: this.userMessage,
      details: this.message,
      code: this.code,
      actions: this.recoveryActions,
    };
  }

  toLogEntry(level = 'error') {
    return {
      level,
      name: this.name,
      message: this.message,
      code: this.code,
      context: this.context,
      timestamp: this.timestamp,
      stack: this.stack,
    };
  }
}

module.exports = StratoSortError;
```

#### 4.2 Specific Error Types

```javascript
// src/shared/errors/FileOperationError.js
const StratoSortError = require('./StratoSortError');
const path = require('path');

class FileOperationError extends StratoSortError {
  constructor(operation, filePath, originalError) {
    const fileName = path.basename(filePath);

    super(
      `File operation '${operation}' failed for ${filePath}: ${originalError.message}`,
      `FILE_${operation.toUpperCase()}_FAILED`,
      {
        operation,
        filePath,
        fileName,
        errorCode: originalError.code,
        originalError: originalError.message,
      },
      `Unable to ${operation} file: ${fileName}`,
      FileOperationError._getRecoveryActions(operation, originalError),
    );
  }

  static _getRecoveryActions(operation, error) {
    const actions = [];

    if (error.code === 'EACCES' || error.code === 'EPERM') {
      actions.push({
        label: 'Check file permissions',
        action: 'checkPermissions',
        description: 'Ensure you have permission to access this file',
      });
    }

    if (error.code === 'ENOSPC') {
      actions.push({
        label: 'Free up disk space',
        action: 'checkDiskSpace',
        description: 'Your disk is full. Delete some files and try again',
      });
    }

    if (error.code === 'ENOENT') {
      actions.push({
        label: 'Refresh file list',
        action: 'refresh',
        description: 'The file may have been moved or deleted',
      });
    }

    actions.push({
      label: 'Try again',
      action: 'retry',
      description: 'Retry the operation',
    });

    return actions;
  }
}

module.exports = FileOperationError;
```

```javascript
// src/shared/errors/AnalysisError.js
const StratoSortError = require('./StratoSortError');

class AnalysisError extends StratoSortError {
  constructor(filePath, stage, originalError) {
    super(
      `Analysis failed at ${stage} for ${filePath}: ${originalError.message}`,
      `ANALYSIS_${stage.toUpperCase()}_FAILED`,
      {
        filePath,
        stage,
        originalError: originalError.message,
      },
      `Unable to analyze file at ${stage} stage`,
      [
        {
          label: 'Skip this file',
          action: 'skip',
          description: 'Continue with other files',
        },
        {
          label: 'Try again',
          action: 'retry',
          description: 'Retry analysis for this file',
        },
        {
          label: 'View details',
          action: 'viewDetails',
          description: 'See technical error details',
        },
      ],
    );
  }
}

module.exports = AnalysisError;
```

#### 4.3 Error Handler Utility

```javascript
// src/shared/errors/errorHandler.js
const { logger } = require('../logger');

class ErrorHandler {
  static handle(error, context = {}) {
    // Log the error
    if (error.toLogEntry) {
      logger.error(error.toLogEntry());
    } else {
      logger.error('Unhandled error', {
        message: error.message,
        stack: error.stack,
        context,
      });
    }

    // Return user-facing error
    if (error.toUserDisplay) {
      return error.toUserDisplay();
    }

    // Fallback for unknown errors
    return {
      title: 'An unexpected error occurred',
      details: error.message,
      code: 'UNKNOWN_ERROR',
      actions: [
        {
          label: 'Report bug',
          action: 'reportBug',
          description: 'Help us fix this issue',
        },
      ],
    };
  }

  static wrap(fn, errorFactory) {
    return async (...args) => {
      try {
        return await fn(...args);
      } catch (error) {
        if (error instanceof StratoSortError) {
          throw error;
        }
        throw errorFactory(error, ...args);
      }
    };
  }
}

module.exports = ErrorHandler;
```

#### 4.4 Usage Example

```javascript
// src/main/ipc/files.js
const FileOperationError = require('../../shared/errors/FileOperationError');
const ErrorHandler = require('../../shared/errors/errorHandler');

async function moveFile(source, destination) {
  try {
    await fs.rename(source, destination);
  } catch (error) {
    throw new FileOperationError('move', source, error);
  }
}

// In IPC handler
ipcMain.handle('files:move', async (event, source, destination) => {
  try {
    await moveFile(source, destination);
    return { success: true };
  } catch (error) {
    const userError = ErrorHandler.handle(error, { source, destination });
    return {
      success: false,
      error: userError,
    };
  }
});
```

#### 4.5 UI Error Display

```javascript
// src/renderer/components/ErrorDialog.jsx
function ErrorDialog({ error, onClose }) {
  const handleAction = (action) => {
    switch (action.action) {
      case 'retry':
        // Retry logic
        break;
      case 'checkPermissions':
        // Show permissions guide
        break;
      case 'reportBug':
        // Open bug report
        break;
    }
  };

  return (
    <div className="error-dialog">
      <h2>{error.title}</h2>
      <p>{error.details}</p>
      <code>{error.code}</code>

      <div className="actions">
        {error.actions.map((action) => (
          <button
            key={action.action}
            onClick={() => handleAction(action)}
            title={action.description}
          >
            {action.label}
          </button>
        ))}
      </div>

      <button onClick={onClose}>Close</button>
    </div>
  );
}
```

### Benefits

✅ **Rich Context:** All errors include relevant details
✅ **User-Friendly:** Clear messages and recovery actions
✅ **Debuggable:** Full stack traces and context logged
✅ **Actionable:** Users know what to do next
✅ **Consistent:** Same error handling everywhere

---

## 5. Clean Architecture Implementation

### Problem

Business logic is mixed with infrastructure concerns across all layers, making code hard to test and maintain.

### Solution: Layered Architecture

Implement clean architecture with clear separation between domain, application, and infrastructure layers.

### Architecture Diagram

```
┌──────────────────────────────────────────┐
│   Presentation Layer (React UI)          │
│   - Components, Hooks                    │
│   - Calls use cases via IPC              │
└────────────┬─────────────────────────────┘
             │
┌────────────▼─────────────────────────────┐
│   Application Layer (Use Cases)          │
│   - AnalyzeFileUseCase                   │
│   - OrganizeFilesUseCase                 │
│   - Orchestrates domain + infrastructure │
└────────────┬─────────────────────────────┘
             │
┌────────────▼─────────────────────────────┐
│   Domain Layer (Business Logic)          │
│   - File (entity)                        │
│   - Analysis (value object)              │
│   - Business rules                       │
└────────────┬─────────────────────────────┘
             │
┌────────────▼─────────────────────────────┐
│   Infrastructure Layer (I/O)             │
│   - FileSystemRepository                 │
│   - ChromaDBRepository                   │
│   - OllamaService                        │
└──────────────────────────────────────────┘
```

### Detailed Design

See comprehensive implementation details in REFACTORING_ROADMAP.md Week 7-10.

### Key Principles

1. **Dependency Rule:** Dependencies point inward
2. **Domain Independence:** Core business logic has no external dependencies
3. **Interface Segregation:** Infrastructure implements domain interfaces
4. **Testability:** Each layer testable in isolation

### Benefits

✅ **Maintainability:** Clear responsibilities
✅ **Testability:** Easy to mock dependencies
✅ **Flexibility:** Easy to swap implementations
✅ **Understandability:** Clear structure

---

## 6. Resource Management Patterns

### Problem

Resources (workers, connections, timers) are not properly cleaned up, causing memory leaks and performance degradation.

### Solution: RAII Pattern with Dispose

Implement resource management using dispose pattern and automatic cleanup.

### Example Implementation

```javascript
// src/main/utils/Disposable.js
class Disposable {
  constructor(resource, disposeCallback) {
    this.resource = resource;
    this.disposeCallback = disposeCallback;
    this.disposed = false;
  }

  [Symbol.dispose]() {
    if (!this.disposed) {
      this.disposeCallback(this.resource);
      this.disposed = true;
    }
  }

  get value() {
    if (this.disposed) {
      throw new Error('Resource has been disposed');
    }
    return this.resource;
  }
}

// Usage with explicit using (when available)
async function processFile(filePath) {
  using worker = new Disposable(await createWorker(), (w) => w.terminate());

  return await worker.value.process(filePath);
  // Worker automatically terminated when scope ends
}
```

### Benefits

✅ **No Leaks:** Guaranteed cleanup
✅ **Explicit Ownership:** Clear resource lifecycle
✅ **Exception Safe:** Cleanup even on errors

---

## 7. Monitoring & Observability

### Problem

Cannot diagnose production issues due to insufficient logging and metrics.

### Solution: Structured Logging + Metrics

Implement structured logging with log levels and metrics collection.

### Example Implementation

```javascript
// src/shared/observability/metrics.js
class Metrics {
  constructor() {
    this.counters = new Map();
    this.timers = new Map();
  }

  increment(name, value = 1, tags = {}) {
    const key = this._key(name, tags);
    this.counters.set(key, (this.counters.get(key) || 0) + value);
  }

  timing(name, duration, tags = {}) {
    const key = this._key(name, tags);
    if (!this.timers.has(key)) {
      this.timers.set(key, []);
    }
    this.timers.get(key).push(duration);
  }

  async measure(name, fn, tags = {}) {
    const start = Date.now();
    try {
      const result = await fn();
      this.timing(name, Date.now() - start, { ...tags, status: 'success' });
      return result;
    } catch (error) {
      this.timing(name, Date.now() - start, { ...tags, status: 'error' });
      throw error;
    }
  }

  getMetrics() {
    return {
      counters: Object.fromEntries(this.counters),
      timers: Object.fromEntries(this.timers),
    };
  }

  _key(name, tags) {
    const tagString = Object.entries(tags)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => `${k}:${v}`)
      .join(',');
    return tagString ? `${name}{${tagString}}` : name;
  }
}

module.exports = new Metrics(); // Singleton
```

### Benefits

✅ **Production Visibility:** Know what's happening
✅ **Performance Tracking:** Measure everything
✅ **Proactive Monitoring:** Catch issues early
✅ **Data-Driven Decisions:** Optimize based on metrics

---

## Conclusion

These architectural improvements address the 5 systemic issues identified:

1. **Transactional Boundaries** → Saga pattern with journal
2. **Service Lifecycle** → DI container with health checks
3. **State Management** → Redux single source of truth
4. **Error Handling** → Typed error system
5. **Abstraction** → Clean architecture layers

Implementing these designs will create a solid foundation for long-term maintainability and growth.

---

**Document Status:** Design Proposal
**Next Steps:** Review with team, prioritize implementations
**Related Documents:** REFACTORING_ROADMAP.md, SYSTEMIC_ISSUES_REPORT.md

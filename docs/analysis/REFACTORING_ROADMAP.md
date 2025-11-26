# StratoSort Refactoring Roadmap

## 3-Month Action Plan to Address Systemic Issues

**Date:** 2025-11-23
**Timeline:** 3 months
**Team Size Assumption:** 2-3 developers
**Focus:** High-impact architectural improvements

---

## Executive Summary

This roadmap addresses the 5 systemic issues identified in the analysis over a 3-month period. The plan is divided into 3 phases, each building on the previous:

- **Phase 1 (Weeks 1-2):** Stop the bleeding - Critical fixes
- **Phase 2 (Weeks 3-6):** Build safety nets - Infrastructure improvements
- **Phase 3 (Weeks 7-12):** Refactor architecture - Long-term solutions

**Expected Outcomes:**

- 60% reduction in production bugs
- 40% faster feature development
- 80% improvement in debuggability
- Solid foundation for future growth

---

## Phase 1: Critical Fixes (Weeks 1-2)

**Goal:** Fix critical bugs and implement immediate safety measures

### Week 1: Error Handling & Context

**Priority:** 🔴 CRITICAL
**Time:** 5 days
**Owner:** Backend Team

#### Tasks:

**1.1 Replace All Empty Catch Blocks (72 locations)**

```javascript
// BEFORE:
try {
  await operation();
} catch {
  // Silent failure
}

// AFTER:
try {
  await operation();
} catch (error) {
  logger.error('[Context] Operation failed', {
    error: error.message,
    stack: error.stack,
    context: {
      /* relevant data */
    },
  });
  throw new DetailedError('User-friendly message', error);
}
```

**Files to Update:**

- [ ] `src/main/analysis/ollamaDocumentAnalysis.js` (18 instances)
- [ ] `src/main/services/AutoOrganizeService.js` (12 instances)
- [ ] `src/main/ipc/*.js` (24 instances)
- [ ] `src/renderer/hooks/*.js` (18 instances)

**Checklist:**

- [ ] Create `StratoSortError` base class
- [ ] Create specific error types (FileOperationError, AnalysisError, etc.)
- [ ] Add error context helper function
- [ ] Update all catch blocks to use new error system
- [ ] Add error boundaries in React components
- [ ] Test error propagation end-to-end

**Acceptance Criteria:**

- ✅ No empty catch blocks remain
- ✅ All errors have context (file path, operation, timestamp)
- ✅ All errors have user-facing messages
- ✅ Errors logged with full stack traces

---

**1.2 Implement Service Health Checks**

```javascript
// Add to all services:
class Service {
  async healthCheck() {
    if (!this.isReady()) {
      throw new ServiceNotReadyError(this.name);
    }
    return { healthy: true, uptime: this.uptime };
  }

  isReady() {
    return this.initialized && !this.failed;
  }
}
```

**Files to Update:**

- [ ] `src/main/services/ChromaDBService.js`
- [ ] `src/main/services/BatchAnalysisService.js`
- [ ] `src/main/services/AutoOrganizeService.js`
- [ ] `src/main/services/OrganizationSuggestionService.js`

**Checklist:**

- [ ] Add `healthCheck()` method to each service
- [ ] Add `isReady()` check before operations
- [ ] Add startup health verification
- [ ] Add health check endpoint for monitoring
- [ ] Log health check failures

**Acceptance Criteria:**

- ✅ All services have health checks
- ✅ Services fail fast when unhealthy
- ✅ Health status visible in logs
- ✅ No operations on uninitialized services

---

### Week 2: ChromaDB Initialization & Race Conditions

**Priority:** 🔴 CRITICAL
**Time:** 5 days
**Owner:** Backend Team

#### Tasks:

**2.1 Fix ChromaDB Initialization Race**

```javascript
class ChromaDBService {
  constructor() {
    this._initMutex = new Mutex();
    this._initPromise = null;
    this.state = 'uninitialized'; // state machine
  }

  async initialize() {
    // Acquire mutex
    const release = await this._initMutex.acquire();

    try {
      if (this.state === 'initialized') {
        return; // Already done
      }

      if (this.state === 'initializing') {
        // Wait for in-progress initialization
        return await this._initPromise;
      }

      this.state = 'initializing';
      this._initPromise = this._doInitialize();
      await this._initPromise;
      this.state = 'initialized';
    } finally {
      release();
    }
  }

  async _doInitialize() {
    // Actual initialization logic
  }
}
```

**Files to Update:**

- [ ] `src/main/services/ChromaDBService.js`
- [ ] All files that use ChromaDB

**Checklist:**

- [ ] Install `async-mutex` package
- [ ] Implement initialization mutex
- [ ] Add state machine (uninitialized → initializing → initialized → failed)
- [ ] Update all ChromaDB usages to await initialization
- [ ] Add initialization timeout (30 seconds)
- [ ] Add initialization retry logic (3 attempts)
- [ ] Test concurrent initialization attempts
- [ ] Add integration tests for race conditions

**Acceptance Criteria:**

- ✅ No concurrent initialization possible
- ✅ Multiple callers wait for single initialization
- ✅ Initialization timeout prevents hangs
- ✅ Failed initialization can be retried
- ✅ State visible in logs and health checks

---

**2.2 Implement Batch Operation Rollback**

```javascript
class FileOrganizationSaga {
  async execute(operations) {
    const journal = [];

    try {
      for (const op of operations) {
        // Execute with journaling
        const result = await this.executeStep(op);
        journal.push({
          operation: op,
          result,
          rollback: () => this.rollbackStep(op, result),
        });
      }

      return { success: true, results: journal };
    } catch (error) {
      // Rollback in reverse order
      await this.rollback(journal);
      throw new BatchOperationError('Batch failed and was rolled back', error);
    }
  }

  async rollback(journal) {
    for (const entry of [...journal].reverse()) {
      try {
        await entry.rollback();
      } catch (rollbackError) {
        logger.error('Rollback failed', rollbackError);
      }
    }
  }
}
```

**Files to Update:**

- [ ] `src/main/ipc/files.js`
- [ ] `src/main/services/AutoOrganizeService.js`

**Checklist:**

- [ ] Create FileOrganizationSaga class
- [ ] Implement journal-based rollback
- [ ] Add critical vs non-critical error classification
- [ ] Update batch organize handler
- [ ] Add rollback status to response
- [ ] Test rollback scenarios
- [ ] Add rollback metrics

**Acceptance Criteria:**

- ✅ Critical errors trigger rollback
- ✅ All completed operations undone on failure
- ✅ Rollback status reported to user
- ✅ Rollback failures logged
- ✅ System left in consistent state

---

## Phase 2: Safety Nets (Weeks 3-6)

**Goal:** Build infrastructure for reliability and monitoring

### Week 3-4: Service Container & Lifecycle

**Priority:** 🟠 HIGH
**Time:** 10 days
**Owner:** Backend Team

#### Tasks:

**3.1 Implement Dependency Injection Container**

```javascript
// src/main/core/ServiceContainer.js
class ServiceContainer {
  constructor() {
    this.factories = new Map();
    this.instances = new Map();
    this.states = new Map();
  }

  register(name, factory, dependencies = []) {
    this.factories.set(name, { factory, dependencies });
  }

  async resolve(name) {
    // Check if already initialized
    if (this.states.get(name) === 'ready') {
      return this.instances.get(name);
    }

    // Resolve dependencies first
    const factory = this.factories.get(name);
    const deps = await Promise.all(
      factory.dependencies.map((dep) => this.resolve(dep)),
    );

    // Initialize service
    this.states.set(name, 'initializing');
    const instance = await factory.factory(...deps);

    // Health check
    if (instance.healthCheck) {
      await instance.healthCheck();
    }

    this.instances.set(name, instance);
    this.states.set(name, 'ready');
    return instance;
  }
}
```

**Implementation Steps:**

- [ ] Create ServiceContainer class
- [ ] Register all services with dependencies
- [ ] Update AppLifecycle to use container
- [ ] Add service graph visualization
- [ ] Add circular dependency detection
- [ ] Test service startup order
- [ ] Add startup timeout per service

**Acceptance Criteria:**

- ✅ All services initialized through container
- ✅ Dependencies resolved automatically
- ✅ Circular dependencies detected
- ✅ Services initialized in correct order
- ✅ Failed services don't break container

---

**3.2 Implement Worker Pool with Lifecycle**

```javascript
class WorkerPool {
  constructor(workerPath, options = {}) {
    this.workerPath = workerPath;
    this.maxWorkers = options.maxWorkers || 4;
    this.maxTasksPerWorker = options.maxTasksPerWorker || 50;
    this.workers = [];
    this.taskQueue = [];
  }

  async execute(task) {
    const worker = await this.getAvailableWorker();

    try {
      const result = await worker.execute(task);
      worker.taskCount++;

      // Recycle if limit reached
      if (worker.taskCount >= this.maxTasksPerWorker) {
        await this.recycleWorker(worker);
      } else {
        this.releaseWorker(worker);
      }

      return result;
    } catch (error) {
      // Worker might be corrupt - recycle it
      await this.recycleWorker(worker);
      throw error;
    }
  }

  async recycleWorker(worker) {
    worker.terminate();
    const index = this.workers.indexOf(worker);
    this.workers.splice(index, 1);

    // Create replacement
    const newWorker = await this.createWorker();
    this.workers.push(newWorker);
  }
}
```

**Implementation Steps:**

- [ ] Create WorkerPool class
- [ ] Implement worker recycling
- [ ] Add task queue for backpressure
- [ ] Add worker health monitoring
- [ ] Update BatchAnalysisService to use pool
- [ ] Add pool metrics (utilization, task count)
- [ ] Test worker recycling

**Acceptance Criteria:**

- ✅ Workers recycled after N tasks
- ✅ Failed workers replaced automatically
- ✅ Task queue prevents overload
- ✅ Pool metrics visible
- ✅ Graceful shutdown implemented

---

### Week 5-6: State Management & Persistence

**Priority:** 🟠 HIGH
**Time:** 10 days
**Owner:** Frontend Team

#### Tasks:

**4.1 Implement Redux Store**

```javascript
// src/renderer/store/index.js
import { configureStore } from '@reduxjs/toolkit';
import filesSlice from './slices/filesSlice';
import analysisSlice from './slices/analysisSlice';
import settingsSlice from './slices/settingsSlice';

const store = configureStore({
  reducer: {
    files: filesSlice,
    analysis: analysisSlice,
    settings: settingsSlice,
  },
  middleware: (getDefaultMiddleware) =>
    getDefaultMiddleware().concat(
      persistMiddleware, // Save to localStorage
      syncMiddleware, // Sync to main process
    ),
});

// Middleware for persistence
const persistMiddleware = (store) => (next) => (action) => {
  const result = next(action);
  const state = store.getState();
  localStorage.setItem('app-state', JSON.stringify(state));
  return result;
};

// Middleware for main process sync
const syncMiddleware = (store) => (next) => (action) => {
  const result = next(action);
  window.electronAPI.state.sync(store.getState());
  return result;
};
```

**Implementation Steps:**

- [ ] Install @reduxjs/toolkit
- [ ] Create store slices (files, analysis, settings)
- [ ] Implement persistence middleware
- [ ] Implement IPC sync middleware
- [ ] Migrate hooks to use Redux
- [ ] Remove PhaseContext (replaced by Redux)
- [ ] Add Redux DevTools
- [ ] Test state persistence

**Acceptance Criteria:**

- ✅ Single source of truth for all state
- ✅ State persists across app restarts
- ✅ State synced with main process
- ✅ No state duplication
- ✅ DevTools working for debugging

---

**4.2 Remove State Duplication**

**Implementation Steps:**

- [ ] Audit all useState calls in hooks
- [ ] Move to Redux where appropriate
- [ ] Keep only local UI state in useState
- [ ] Remove state from PhaseContext
- [ ] Update all components to use Redux selectors
- [ ] Remove manual sync code
- [ ] Add state validation

**Files to Update:**

- [ ] `src/renderer/hooks/useFileSelection.js` → Redux
- [ ] `src/renderer/hooks/useFileAnalysis.js` → Redux
- [ ] `src/renderer/hooks/useOrganizeOperations.js` → Redux
- [ ] `src/renderer/hooks/useDiscoverSettings.js` → Redux
- [ ] `src/renderer/contexts/PhaseContext.jsx` → Remove

**Acceptance Criteria:**

- ✅ No duplicate state storage
- ✅ All business state in Redux
- ✅ Only UI state in local useState
- ✅ No manual synchronization code
- ✅ Tests updated for Redux

---

## Phase 3: Architectural Refactoring (Weeks 7-12)

**Goal:** Long-term improvements for maintainability

### Week 7-8: Clean Architecture - Domain Layer

**Priority:** 🟡 MEDIUM
**Time:** 10 days
**Owner:** Backend Team

#### Tasks:

**5.1 Create Domain Models**

```javascript
// src/main/domain/File.js
class File {
  constructor(path, content, metadata) {
    this._path = path;
    this._content = content;
    this._metadata = metadata;
    this._analysis = null;
  }

  get path() {
    return this._path;
  }

  get extension() {
    return path.extname(this._path);
  }

  get basename() {
    return path.basename(this._path);
  }

  setAnalysis(analysis) {
    if (!analysis.category || !analysis.suggestedPath) {
      throw new InvalidAnalysisError('Analysis missing required fields');
    }
    this._analysis = analysis;
  }

  get suggestedPath() {
    if (!this._analysis) {
      throw new FileNotAnalyzedError(this._path);
    }
    return this._analysis.suggestedPath;
  }

  canBeOrganized() {
    return this._analysis !== null && !this._analysis.error;
  }
}
```

**Domain Models to Create:**

- [ ] File (entity)
- [ ] Analysis (value object)
- [ ] OrganizationSuggestion (value object)
- [ ] Batch (aggregate)
- [ ] User Pattern (entity)

**Checklist:**

- [ ] Create domain folder structure
- [ ] Implement domain models with behavior
- [ ] Add validation in domain models
- [ ] Write domain model tests (100% coverage)
- [ ] Document domain rules

**Acceptance Criteria:**

- ✅ All business logic in domain models
- ✅ Models encapsulate data and behavior
- ✅ Validation at model boundaries
- ✅ No anemic domain models
- ✅ Tests for all domain rules

---

**5.2 Create Use Cases**

```javascript
// src/main/application/AnalyzeFileUseCase.js
class AnalyzeFileUseCase {
  constructor(fileRepository, analysisService, progressReporter) {
    this.fileRepository = fileRepository;
    this.analysisService = analysisService;
    this.progressReporter = progressReporter;
  }

  async execute(filePath) {
    // Validate input
    if (!filePath) {
      throw new ValidationError('File path required');
    }

    // Load file
    const file = await this.fileRepository.load(filePath);

    // Execute business logic
    this.progressReporter.start(file.path);

    try {
      const analysis = await this.analysisService.analyze(file);
      file.setAnalysis(analysis);

      // Persist
      await this.fileRepository.saveAnalysis(file);

      this.progressReporter.complete(file.path);
      return analysis;
    } catch (error) {
      this.progressReporter.fail(file.path, error);
      throw error;
    }
  }
}
```

**Use Cases to Create:**

- [ ] AnalyzeFileUseCase
- [ ] OrganizeFilesUseCase
- [ ] GetSuggestionsUseCase
- [ ] SearchFilesUseCase
- [ ] UpdateSettingsUseCase

**Checklist:**

- [ ] Create application folder
- [ ] Implement use cases
- [ ] Inject dependencies
- [ ] Update IPC handlers to call use cases
- [ ] Write use case tests

**Acceptance Criteria:**

- ✅ All business flows in use cases
- ✅ Use cases orchestrate domain + infrastructure
- ✅ No business logic in IPC handlers
- ✅ Dependencies injected
- ✅ Tests for all use cases

---

### Week 9-10: Clean Architecture - Infrastructure Layer

**Priority:** 🟡 MEDIUM
**Time:** 10 days
**Owner:** Backend Team

#### Tasks:

**6.1 Implement Repository Pattern**

```javascript
// src/main/infrastructure/FileRepository.js
class FileSystemRepository {
  async load(filePath) {
    const content = await fs.readFile(filePath, 'utf8');
    const stats = await fs.stat(filePath);
    return new File(filePath, content, {
      size: stats.size,
      modified: stats.mtime,
      created: stats.birthtime,
    });
  }

  async move(file, destination) {
    await fs.rename(file.path, destination);
    // Update internal path
    file._path = destination;
  }

  async saveAnalysis(file) {
    if (!file._analysis) {
      throw new Error('No analysis to save');
    }

    // Save to database
    await this.chromaDb.upsert(file.path, file._analysis);
  }
}
```

**Repositories to Create:**

- [ ] FileSystemRepository
- [ ] AnalysisCacheRepository
- [ ] SettingsRepository
- [ ] UserPatternRepository
- [ ] ChromaDBRepository

**Checklist:**

- [ ] Create infrastructure folder
- [ ] Implement repositories
- [ ] Abstract away external dependencies
- [ ] Create interfaces for repositories
- [ ] Test repositories with mocks

**Acceptance Criteria:**

- ✅ All I/O through repositories
- ✅ Domain isolated from infrastructure
- ✅ Easy to swap implementations
- ✅ Tests use in-memory repositories
- ✅ No direct fs/db calls in domain/application

---

**6.2 Extract Service Adapters**

```javascript
// src/main/infrastructure/OllamaAdapter.js
class OllamaAdapter {
  constructor(baseUrl, model) {
    this.client = axios.create({ baseURL: baseUrl });
    this.model = model;
  }

  async generateText(prompt) {
    const response = await this.client.post('/api/generate', {
      model: this.model,
      prompt,
      stream: false,
    });

    return response.data.response;
  }

  async healthCheck() {
    try {
      await this.client.get('/api/tags');
      return true;
    } catch {
      return false;
    }
  }
}
```

**Adapters to Create:**

- [ ] OllamaAdapter (LLM service)
- [ ] ChromaDBAdapter (vector database)
- [ ] IPCAdapter (electron communication)
- [ ] FileSystemAdapter (file operations)

**Checklist:**

- [ ] Extract external service calls to adapters
- [ ] Create interfaces for adapters
- [ ] Add retry logic in adapters
- [ ] Add circuit breakers
- [ ] Test adapters independently

**Acceptance Criteria:**

- ✅ All external calls through adapters
- ✅ Adapters implement interfaces
- ✅ Easy to mock for testing
- ✅ Retry and circuit breaker logic
- ✅ Health checks for external services

---

### Week 11-12: Testing & Documentation

**Priority:** 🟡 MEDIUM
**Time:** 10 days
**Owner:** Full Team

#### Tasks:

**7.1 Increase Test Coverage to 70%**

**Test Strategy:**

```
Unit Tests (60% coverage target):
├─ Domain models (100%)
├─ Use cases (90%)
├─ Repositories (80%)
└─ Adapters (70%)

Integration Tests (new):
├─ File organization end-to-end
├─ Analysis pipeline
├─ Database synchronization
└─ Error scenarios

E2E Tests (new):
├─ Happy path workflows
├─ Error recovery
└─ Performance benchmarks
```

**Implementation Steps:**

- [ ] Write missing unit tests
- [ ] Create integration test suite
- [ ] Set up E2E test framework
- [ ] Add test coverage reporting
- [ ] Add pre-commit test hooks
- [ ] Set up CI/CD for tests

**Acceptance Criteria:**

- ✅ 70% code coverage minimum
- ✅ All critical paths tested
- ✅ Integration tests for workflows
- ✅ E2E tests for user journeys
- ✅ Tests run in CI/CD

---

**7.2 Update Documentation**

**Documentation to Create:**

- [ ] Architecture Decision Records (ADRs)
- [ ] API documentation
- [ ] Developer onboarding guide
- [ ] Deployment guide
- [ ] Troubleshooting guide

**Checklist:**

- [ ] Document new architecture
- [ ] Create diagrams (architecture, data flow)
- [ ] Write ADRs for major decisions
- [ ] Update README with new structure
- [ ] Create contribution guidelines
- [ ] Document error codes and recovery

**Acceptance Criteria:**

- ✅ Architecture fully documented
- ✅ All public APIs documented
- ✅ Onboarding guide complete
- ✅ Troubleshooting common issues
- ✅ ADRs for all major decisions

---

## Metrics & Monitoring

### KPIs to Track

**Bug Metrics:**

```
Before Refactoring:
├─ Critical bugs per month: ~3-5
├─ Total bugs per month: ~15-20
├─ Mean time to resolution: 3-5 days
└─ Recurring bug rate: 40%

Target After Refactoring:
├─ Critical bugs per month: <1
├─ Total bugs per month: <5
├─ Mean time to resolution: 1-2 days
└─ Recurring bug rate: <10%
```

**Performance Metrics:**

```
Before:
├─ Test coverage: 25-30%
├─ Build time: ~45 seconds
├─ Startup time: ~3-5 seconds
└─ Memory usage (1hr): ~400MB

Target:
├─ Test coverage: >70%
├─ Build time: <30 seconds
├─ Startup time: <2 seconds
└─ Memory usage (1hr): <250MB
```

**Developer Experience:**

```
Before:
├─ Time to fix bug: 3-5 days
├─ Time to add feature: 5-10 days
├─ Lines changed per feature: 500-1000
└─ Confidence in refactoring: Low

Target:
├─ Time to fix bug: 1-2 days
├─ Time to add feature: 2-5 days
├─ Lines changed per feature: 200-400
└─ Confidence in refactoring: High
```

---

## Risk Management

### Identified Risks

**Risk 1: Breaking Changes**

- **Likelihood:** High
- **Impact:** High
- **Mitigation:**
  - Comprehensive test suite before refactoring
  - Feature flags for new code paths
  - Gradual rollout
  - Keep old code until new code proven

**Risk 2: Schedule Overrun**

- **Likelihood:** Medium
- **Impact:** Medium
- **Mitigation:**
  - Prioritize by phase
  - Ship Phase 1 even if Phase 2/3 delayed
  - Regular progress reviews
  - Cut scope if needed

**Risk 3: User Disruption**

- **Likelihood:** Low
- **Impact:** High
- **Mitigation:**
  - Maintain backward compatibility
  - Migration path for user data
  - Beta testing period
  - Rollback plan

**Risk 4: Team Burnout**

- **Likelihood:** Medium
- **Impact:** High
- **Mitigation:**
  - Sustainable pace (no crunch)
  - Celebrate Phase completions
  - Pair programming to share knowledge
  - Regular breaks

---

## Success Criteria

### Phase 1 Success (Week 2)

- ✅ All empty catches replaced
- ✅ All services have health checks
- ✅ ChromaDB initialization race fixed
- ✅ Batch rollback implemented
- ✅ Zero critical bugs introduced
- ✅ All tests passing

### Phase 2 Success (Week 6)

- ✅ Service container operational
- ✅ All services use DI
- ✅ Redux store implemented
- ✅ State duplication eliminated
- ✅ Worker pool with recycling
- ✅ Integration tests added

### Phase 3 Success (Week 12)

- ✅ Clean architecture implemented
- ✅ Domain models created
- ✅ Use cases extracted
- ✅ Repositories pattern in use
- ✅ 70% test coverage achieved
- ✅ Documentation complete

### Overall Success

- ✅ 60% reduction in bugs
- ✅ 40% faster development
- ✅ 80% better debuggability
- ✅ Team confidence high
- ✅ Architecture sustainable

---

## Timeline Gantt Chart

```
Week 1  [=Error Handling=]
Week 2  [=ChromaDB Race=] [=Rollback=]
Week 3  [===Service Container===]
Week 4  [===Service Container===]
Week 5  [====Redux Store====]
Week 6  [====Redux Store====]
Week 7  [===Domain Models===]
Week 8  [===Use Cases===]
Week 9  [===Repositories===]
Week 10 [===Adapters===]
Week 11 [==Testing==]
Week 12 [==Docs==] [Celebration🎉]
```

---

## Next Steps

1. **Review this roadmap with team** (1 day)
2. **Get stakeholder buy-in** (2 days)
3. **Set up project tracking** (1 day)
4. **Start Phase 1** (Week 1)

---

## Appendix: Code Review Checklist

Use this checklist for all PRs during refactoring:

### General

- [ ] Changes align with roadmap phase
- [ ] Tests added for new code
- [ ] Documentation updated
- [ ] No new technical debt introduced

### Architecture

- [ ] Follows clean architecture layers
- [ ] Dependencies point inward
- [ ] No business logic in infrastructure
- [ ] No infrastructure in domain

### Error Handling

- [ ] No empty catch blocks
- [ ] Errors have context
- [ ] User-facing messages present
- [ ] Errors logged with stack traces

### State Management

- [ ] No state duplication
- [ ] State changes through Redux
- [ ] No direct mutation
- [ ] Selectors used for derived state

### Services

- [ ] Health check implemented
- [ ] Dependencies injected
- [ ] Lifecycle managed
- [ ] Errors propagated correctly

---

**Roadmap Version:** 1.0
**Last Updated:** 2025-11-23
**Owner:** Development Team
**Review Cadence:** Weekly

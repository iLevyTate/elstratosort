# Codebase Cleanup Plan

## Overview
This plan addresses unused code, dead code, duplicate implementations, and redundant patterns identified in the codebase. The cleanup is organized into phases by risk level.

---

## Phase 1: Remove Unused Files (Low Risk)

### 1.1 Delete Completely Unused File
- **File**: `src/main/utils/ProgressTracker.js`
- **Reason**: No imports found anywhere in the codebase
- **Action**: Delete file

---

## Phase 2: Fix Lint Errors - Unused Imports/Variables (Low Risk)

### 2.1 Source Files (`src/`)

| File | Line | Issue | Fix |
|------|------|-------|-----|
| `src/main/ipc/files.js` | 737, 753 | `dbSyncWarning` scope issue | Fix variable scoping |
| `src/main/ipc/files.js` | 1126, 1249 | Lexical declarations in case blocks | Wrap in braces |
| `src/main/ipc/suggestions.js` | 102 | Unused `options` parameter | Remove or prefix with `_` |
| `src/main/ipc/system.js` | 7 | Unused `getAllConfig` import | Remove import |
| `src/main/services/StartupManager.js` | 13, 16 | Unused `ServiceIds`, `getPythonLauncherConfigs` | Remove imports |
| `src/main/simple-main.js` | 60, 62, 1865-1867 | Unused `isLinux`, `isFeatureSupported`, `getQuitAccelerator` | Remove imports |
| `src/main/utils/OfflineQueue.js` | 412, 416, 420 | Lexical declarations in case blocks | Wrap in braces |
| `src/main/utils/chromaSpawnUtils.js` | 10 | Unused `isWindows` | Remove import |
| `src/main/utils/safeAccess.js` | 13 | Unused `safeArray` | Remove import |
| `src/shared/config.js` | 598, 603, 684 | Lexical declarations in case blocks | Wrap in braces |
| `src/shared/platformUtils.js` | 14, 32, 54 | Unused `os`, `crossGetSpawnOptions`, `crossGetTrayIconConfig` | Remove unused |
| `src/shared/promiseUtils.js` | 314 | Unused `lastInvokeTime` | Remove variable |
| `src/renderer/components/NavigationBar.jsx` | 10 | Unused `NAVIGATION_RULES` | Remove import |
| `src/renderer/components/organize/SmartOrganizer.jsx` | 98, 133 | Unused `isRecordingFeedback`, `rejectedSuggestions` | Remove variables |
| `src/renderer/components/organize/TargetFolderList.jsx` | 1 | Unused `useCallback` | Remove from import |
| `src/renderer/components/organize/VirtualizedFileGrid.jsx` | 1 | Unused `useCallback` | Remove from import |

### 2.2 Test Files (`test/`)
Lower priority - these don't affect production but should be cleaned:

| File | Issues |
|------|--------|
| `test/e2e/*.spec.js` | Multiple unused imports from test fixtures |
| `test/unit/*.test.js` | Unused mock variables, conditional expects |
| `test/stress/*.test.js` | Unused utility imports, timeout issues |
| `test/mocks/*.js` | Unused parameters |
| `test/utils/testUtilities.js` | Multiple unused variables |

---

## Phase 3: Remove Unused Exports (Medium Risk)

### 3.1 React Utilities (`src/renderer/utils/`)

**File: `src/renderer/utils/reactEdgeCaseUtils.js`**
Remove these unused exports:
- `ComponentErrorBoundary` - Explicitly marked as removed in SystemMonitoring.jsx
- `useRenderTracker` - No usage found

**File: `src/renderer/utils/performance.js`**
Remove these unused exports:
- `deepEqual` - Not used in any React components
- `createSelector` - Not used (Redux Toolkit has its own)

### 3.2 Shared Utilities (`src/shared/`)

**File: `src/shared/edgeCaseUtils.js`**
Remove these unused exports:
- `createBoundedCache` - Never called
- `createRateLimiter` - Never called
- `safeNonEmptyArray` - Never called externally
- `safeNonEmptyString` - Never called externally
- `safePositiveNumber` - Never called externally

### 3.3 Main Process Utilities (`src/main/utils/`)

**File: `src/main/utils/llmOptimization.js`**
- `PromptCombiner` class - Exported but never instantiated
- **Decision needed**: Remove or implement usage

**File: `src/main/utils/ollamaApiRetry.js`**
- `fetchWithRetry` - Exported but never imported
- **Decision needed**: Remove or document as public API

---

## Phase 4: Consolidate Duplicate Implementations (Medium Risk)

### 4.1 LRU Cache Consolidation

**Current state**: 3 different implementations
1. `src/main/utils/cacheManager.js` - Full-featured (TTL, onEvict, stats)
2. `src/renderer/utils/performance.js` - Basic implementation
3. `src/shared/edgeCaseUtils.js` - `createBoundedCache` variant

**Action**:
1. Keep `src/main/utils/cacheManager.js` as canonical implementation
2. Export it from `src/shared/` for cross-process use
3. Update `src/renderer/utils/performance.js` to re-export from shared
4. Remove `createBoundedCache` from edgeCaseUtils.js

### 4.2 Error Response Consolidation

**Current state**: 2 implementations
1. `src/shared/errorHandlingUtils.js::createErrorResponse`
2. `src/main/ipc/ipcWrappers.js::createErrorResponse`

**Action**:
1. Keep shared version as base
2. Update IPC wrapper to extend/use shared version
3. Remove duplicate logic

---

## Phase 5: Clean Up Re-export Chains (Low Risk)

### 5.1 Simplify Import Paths

Current chain example:
```
promiseUtils.js → edgeCaseUtils.js → safeAccess.js → component
```

**Action**: Update imports to use canonical source directly:
- `debounce`, `throttle` → import from `src/shared/promiseUtils.js`
- `withRetry`, `withTimeout` → import from `src/shared/promiseUtils.js`
- `safeGet`, `safeCall` → import from `src/shared/edgeCaseUtils.js`

### 5.2 Review Wrapper Modules

These modules are mostly re-exports - consider deprecating:
- `src/main/utils/safeAccess.js` - Wrapper around edgeCaseUtils
- Could be replaced with direct imports

---

## Phase 6: Fix Code Quality Issues (Low Risk)

### 6.1 Lexical Declarations in Switch Cases

Files with `no-case-declarations` errors:
- `src/main/ipc/files.js` (lines 1126, 1249)
- `src/main/utils/OfflineQueue.js` (lines 412, 416, 420)
- `src/shared/config.js` (lines 598, 603, 684)

**Fix**: Wrap case blocks in braces:
```javascript
// Before
case 'foo':
  const x = 1;
  break;

// After
case 'foo': {
  const x = 1;
  break;
}
```

---

## Execution Order

1. **Phase 1** - Delete unused file (1 file)
2. **Phase 2.1** - Fix source file lint errors (16 files)
3. **Phase 6** - Fix case declaration issues (3 files)
4. **Phase 3** - Remove unused exports (5 files)
5. **Phase 4** - Consolidate duplicates (4 files)
6. **Phase 5** - Simplify imports (multiple files)
7. **Phase 2.2** - Fix test file lint errors (optional, lower priority)

---

## Expected Outcomes

- **Lines removed**: ~500+ lines of dead code
- **Files removed**: 1 completely unused file
- **Lint errors fixed**: ~70 in source files
- **Duplicate implementations**: 3 consolidated to 1 each
- **Cleaner import paths**: Simplified dependency chains

---

## Risk Mitigation

1. Run `npm run build` after each phase
2. Run `npm test` after phases 3-5
3. Commit after each phase for easy rollback
4. Test app manually after phase 4 (consolidation)

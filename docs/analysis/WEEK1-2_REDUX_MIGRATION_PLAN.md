# Week 1-2: Redux Migration Plan
## Removing PhaseContext Duplication

**Status:** Ready to execute
**Priority:** HIGH
**Effort:** 3-5 days
**Risk:** Medium (state bugs)

---

## Current Situation Analysis

### ✅ Good News: Redux Infrastructure Complete

**Redux Store Setup:**
- Location: `src/renderer/store/index.js`
- 6 slices implemented:
  - `filesSlice` - File selection and management
  - `analysisSlice` - File analysis state
  - `organizeSlice` - Organization operations
  - `settingsSlice` - App settings
  - `systemSlice` - System state
  - `uiSlice` - UI state **including currentPhase**

**Middleware:**
- `persistenceMiddleware` - Auto-save to localStorage
- `ipcMiddleware` - Sync with main process

**Infrastructure:**
- @reduxjs/toolkit v2.10.1 installed
- Hot module replacement configured
- DevTools enabled in development

### ⚠️ Problem: PhaseContext Still In Use

**Files Using PhaseContext:** 18 files
- 5 Phase components (Discover, Organize, Welcome, Setup, Complete)
- 6 Hook files (useOrganizeOperations, useFileAnalysis, etc.)
- 5 UI components (PhaseRenderer, SettingsPanel, NavigationBar, etc.)
- 2 Context files (PhaseContext.jsx, PhaseErrorBoundary.jsx)

**State Duplication:**
- `PhaseContext.currentPhase` ⚔️ `uiSlice.currentPhase`
- `PhaseContext.phaseData` ⚔️ Multiple Redux slices
- `PhaseContext.isLoading` ⚔️ `uiSlice.globalLoading`
- `PhaseContext.showSettings` ⚔️ `uiSlice.activeModal`

**Risk:** State synchronization bugs when both systems try to manage the same state

---

## Migration Plan

### Phase 1: Preparation (Day 1)

#### Step 1.1: Map PhaseContext State to Redux
Create mapping document showing exact equivalents:

| PhaseContext | Redux Equivalent | Notes |
|--------------|-----------------|-------|
| `currentPhase` | `ui.currentPhase` | Already exists in uiSlice |
| `phaseData` | Various slices | Distribute to files/analysis/organize slices |
| `isLoading` | `ui.globalLoading` | Already exists |
| `showSettings` | `ui.activeModal === 'settings'` | Use modal system |
| `advancePhase()` | `dispatch(nextPhase())` | Already exists |
| `setPhaseData()` | Slice-specific actions | Use appropriate slice |

#### Step 1.2: Create Migration Checklist
For each of 18 files, document:
- Current PhaseContext usage
- Required Redux hooks
- Required imports
- Test requirements

---

### Phase 2: Hook Migration (Days 2-3)

#### Step 2.1: Migrate Custom Hooks (6 files)

**Priority Order:**
1. `useDiscoverSettings.js` - Simplest, fewest dependencies
2. `useFileSelection.js` - Core functionality
3. `useFileAnalysis.js` - Analysis state
4. `useOrganizeData.js` - Organization state
5. `useOrganizeOperations.js` - Complex operations
6. `useKeyboardShortcuts.js` - UI interactions

**Pattern for Each Hook:**
```javascript
// BEFORE (PhaseContext)
import { usePhase } from '../contexts/PhaseContext';

export function useFileSelection() {
  const { phaseData, setPhaseData } = usePhase();
  const selectedFiles = phaseData.selectedFiles || [];

  const setSelectedFiles = (files) => {
    setPhaseData('selectedFiles', files);
  };

  return { selectedFiles, setSelectedFiles };
}

// AFTER (Redux)
import { useSelector, useDispatch } from 'react-redux';
import { selectSelectedFiles, setSelectedFiles } from '../store/slices/filesSlice';

export function useFileSelection() {
  const selectedFiles = useSelector(selectSelectedFiles);
  const dispatch = useDispatch();

  const handleSetSelectedFiles = (files) => {
    dispatch(setSelectedFiles(files));
  };

  return { selectedFiles, setSelectedFiles: handleSetSelectedFiles };
}
```

**Testing After Each Hook:**
```bash
# Component tests that use the hook
npm test -- <hook-name>.test.js

# Manual testing
npm run dev
# Test hook functionality in UI
```

---

### Phase 3: Component Migration (Days 3-4)

#### Step 3.1: Migrate Phase Components (5 files)

**Order:**
1. `WelcomePhase.jsx` - Simplest
2. `SetupPhase.jsx` - Minimal state
3. `CompletePhase.jsx` - Read-only state
4. `DiscoverPhase.jsx` - Complex state
5. `OrganizePhase.jsx` - Most complex

**Pattern:**
```javascript
// BEFORE
import { usePhase } from '../contexts/PhaseContext';

function DiscoverPhase() {
  const { currentPhase, advancePhase, phaseData, setPhaseData, isLoading } = usePhase();

  // ...
}

// AFTER
import { useSelector, useDispatch } from 'react-redux';
import { selectCurrentPhase } from '../store/slices/uiSlice';
import { nextPhase } from '../store/slices/uiSlice';
import { selectGlobalLoading } from '../store/slices/uiSlice';
// Import from appropriate slices for phaseData

function DiscoverPhase() {
  const currentPhase = useSelector(selectCurrentPhase);
  const { loading: isLoading } = useSelector(selectGlobalLoading);
  const dispatch = useDispatch();

  const advancePhase = () => dispatch(nextPhase());

  // ...
}
```

#### Step 3.2: Migrate UI Components (5 files)

**Order:**
1. `ProgressIndicator.jsx` - Simple read-only
2. `NavigationBar.jsx` - Phase navigation
3. `SettingsPanel.jsx` - Settings modal
4. `PhaseErrorBoundary.jsx` - Error handling
5. `PhaseRenderer.jsx` - Phase orchestration

---

### Phase 4: Remove PhaseContext (Day 4)

#### Step 4.1: Update AppProviders.jsx
```javascript
// BEFORE
import { PhaseProvider } from './contexts/PhaseContext';

function AppProviders({ children }) {
  return (
    <Provider store={store}>
      <PhaseProvider>
        <NotificationProvider>
          {children}
        </NotificationProvider>
      </PhaseProvider>
    </Provider>
  );
}

// AFTER
import { Provider } from 'react-redux';
import store from './store';

function AppProviders({ children }) {
  return (
    <Provider store={store}>
      <NotificationProvider>
        {children}
      </NotificationProvider>
    </Provider>
  );
}
```

#### Step 4.2: Delete PhaseContext.jsx
```bash
rm src/renderer/contexts/PhaseContext.jsx
```

#### Step 4.3: Verify No Imports Remain
```bash
grep -r "PhaseContext" src/renderer/
# Should return no results
```

---

### Phase 5: Verification & Testing (Day 5)

#### Step 5.1: Automated Tests
```bash
# Run all tests
npm test

# Run specific test suites
npm test -- --testPathPattern=phases
npm test -- --testPathPattern=hooks
npm test -- --testPathPattern=components
```

#### Step 5.2: Manual Testing Checklist

**Navigation:**
- [ ] Welcome → Setup → Discover → Organize → Complete
- [ ] Back navigation works
- [ ] Refresh browser maintains phase
- [ ] Phase transitions are smooth

**State Persistence:**
- [ ] Selected files persist across refresh
- [ ] Analysis results persist
- [ ] Settings persist
- [ ] Organization state persists

**IPC Synchronization:**
- [ ] File operations sync to main process
- [ ] Analysis results sync from main process
- [ ] Settings sync bi-directionally
- [ ] No IPC errors in console

**Performance:**
- [ ] No unnecessary re-renders
- [ ] State updates are fast
- [ ] No memory leaks (DevTools profiler)

**Error Handling:**
- [ ] Errors display correctly
- [ ] Error boundaries work
- [ ] Invalid state handled gracefully

---

## Redux Slice Enhancements Needed

### uiSlice Additions
```javascript
// Add phase data that doesn't fit other slices
const initialState = {
  currentPhase: 'discover',

  // Add missing phase data
  phaseHistory: [], // Track phase navigation
  phaseData: {
    // Generic phase-specific data
    discover: {},
    organize: {},
    complete: {},
  },

  // ... existing state
};

// Add actions
reducers: {
  setPhaseData: (state, action) => {
    const { phase, key, value } = action.payload;
    if (!state.phaseData[phase]) {
      state.phaseData[phase] = {};
    }
    state.phaseData[phase][key] = value;
  },

  clearPhaseData: (state, action) => {
    const phase = action.payload;
    state.phaseData[phase] = {};
  },

  // ... existing reducers
}
```

### filesSlice Additions
Ensure these exist:
- `selectedFiles` - Array of selected file paths
- `fileStates` - Map of file path to state (analyzing, analyzed, etc.)
- `filePreview` - Currently previewed file

### analysisSlice Additions
Ensure these exist:
- `analysisResults` - Map of file path to analysis result
- `analysisProgress` - Map of file path to progress %
- `analysisErrors` - Map of file path to error

### organizeSlice Additions
Ensure these exist:
- `operations` - Pending organization operations
- `operationResults` - Completed operations
- `readyFiles` - Files ready to organize
- `organizedFiles` - Successfully organized files

---

## Rollback Plan

If migration causes critical bugs:

### Step 1: Revert Code Changes
```bash
git revert <migration-commit-hash>
# Or restore from backup
```

### Step 2: Restore PhaseContext
```bash
git checkout main -- src/renderer/contexts/PhaseContext.jsx
```

### Step 3: Restore Component Imports
```bash
# Use git to restore all modified files
git checkout main -- src/renderer/phases/
git checkout main -- src/renderer/hooks/
git checkout main -- src/renderer/components/
```

### Step 4: Test Rollback
```bash
npm test
npm run dev
# Verify app works
```

---

## Success Criteria

### Must Have (Blockers):
- ✅ PhaseContext.jsx deleted
- ✅ All components using Redux hooks
- ✅ All tests passing
- ✅ No `PhaseContext` imports remain
- ✅ State persists across refreshes
- ✅ IPC synchronization working

### Should Have:
- ✅ No unnecessary re-renders (React DevTools profiler)
- ✅ No memory leaks
- ✅ Performance same or better than before
- ✅ Error handling maintained

### Nice to Have:
- Redux DevTools working
- Time-travel debugging enabled
- State logged for debugging

---

## Risk Mitigation

### Risk 1: State Synchronization Bugs
**Mitigation:**
- Migrate one component at a time
- Test thoroughly after each component
- Keep git commits small and focused
- Add console.log for state changes during migration

### Risk 2: Breaking Production
**Mitigation:**
- Do migration on feature branch
- Run full test suite before merge
- Deploy to staging first
- Have rollback plan ready

### Risk 3: Performance Regression
**Mitigation:**
- Profile before and after
- Monitor re-renders with React DevTools
- Use Redux DevTools to track state changes
- Optimize selectors with `reselect` if needed

---

## Implementation Order Summary

**Day 1: Preparation**
- Map PhaseContext → Redux
- Create migration checklist
- Enhance Redux slices as needed

**Day 2-3: Hooks**
- Migrate 6 custom hooks
- Test each hook after migration
- Update hook consumers incrementally

**Day 3-4: Components**
- Migrate 5 phase components
- Migrate 5 UI components
- Test each component after migration

**Day 4: Cleanup**
- Update AppProviders.jsx
- Delete PhaseContext.jsx
- Verify no imports remain

**Day 5: Testing**
- Automated tests
- Manual testing checklist
- Performance profiling
- Final verification

---

## Next Steps After Migration

Once Redux migration is complete:

1. **Write Redux Store Tests** (Task 5)
   - Reducer tests
   - Middleware tests
   - Selector tests
   - Integration tests

2. **Optimize Performance** (if needed)
   - Add `reselect` for memoized selectors
   - Use `React.memo` for components
   - Profile and optimize hot paths

3. **Document Redux Architecture**
   - State shape documentation
   - Action flow diagrams
   - Middleware explanation
   - Best practices guide

---

## Conclusion

This migration will:
- ✅ Eliminate state duplication
- ✅ Reduce state synchronization bugs
- ✅ Improve testability (Redux DevTools)
- ✅ Enable time-travel debugging
- ✅ Simplify state management
- ✅ Improve performance (optimized selectors)

**Estimated Effort:** 3-5 days
**Risk Level:** Medium (with mitigation strategies)
**Impact:** High (cleaner architecture, better DX)

**Ready to proceed!** 🚀

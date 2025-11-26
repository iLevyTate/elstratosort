<!-- 1cf50c6e-f3da-4cda-bc70-d25f41edb4d6 b2caf969-eccb-4198-8b53-87273d023293 -->

# Refactor OrganizePhase.jsx

I have identified `src/renderer/phases/OrganizePhase.jsx` (1079 lines) as the next high-priority target. It contains massive `useEffect` blocks for data loading and a complex `handleOrganizeFiles` function that handles both manual and automatic organization flows.

## Proposed Changes

### 1. Extract Logic into Custom Hooks

We will create specialized hooks in `src/renderer/hooks/` to segregate concerns:

- **`useOrganizeData`**: Manages the phase data, smart folders, file states, and persistence.
  - **State**: `fileStates`, `processedFileIds`, `organizedFiles`, `smartFolders`.
  - **Effects**: Loading persisted data, syncing with `PhaseContext`.
  - **Helpers**: `getFileState`, `getFileStateDisplay`, `findSmartFolderForCategory`.

- **`useOrganizeSelection`**: Manages file selection, bulk editing, and filtering.
  - **State**: `selectedFiles`, `editingFiles`, `bulkEditMode`, `bulkCategory`.
  - **Actions**: `toggleFileSelection`, `selectAllFiles`, `handleEditFile`, `applyBulkCategoryChange`.

- **`useOrganizeOperations`**: Manages the actual organization process (the massive `handleOrganizeFiles` logic).
  - **State**: `isOrganizing`, `batchProgress`, `organizePreview`.
  - **Actions**: `handleOrganizeFiles`, `approveSelectedFiles`.
  - **Dependencies**: Uses `useUndoRedo` and `electronAPI`.

### 2. Refactor Component

Update `src/renderer/phases/OrganizePhase.jsx` to become a cleaner view component that composes these hooks.

## Implementation Steps

1.  Create `src/renderer/hooks/useOrganizeData.js`.
2.  Create `src/renderer/hooks/useOrganizeSelection.js`.
3.  Create `src/renderer/hooks/useOrganizeOperations.js`.
4.  Export new hooks from `src/renderer/hooks/index.js`.
5.  Refactor `src/renderer/phases/OrganizePhase.jsx` to implement the new hooks.
6.  Verify functionality (persistence, bulk editing, organization flow).

## Other Candidates Identified (For Future)

- `src/main/services/ChromaDBService.js` (1876 lines) - Backend: Needs splitting into Cache, Health, and Query managers.
- `src/main/services/AutoOrganizeService.js` (1132 lines) - Backend: Needs splitting into Batch and DefaultFolder managers.
- `src/main/services/SettingsService.js` (833 lines) - Backend: Needs BackupManager extraction.

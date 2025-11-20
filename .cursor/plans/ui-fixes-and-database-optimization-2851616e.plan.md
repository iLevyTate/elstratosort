<!-- 2851616e-6520-478e-a56d-ba77f130b83c 0cb63584-ab2f-4ded-bfc6-41862be76080 -->

# UI Fixes and Database Optimization Plan

## Issues Identified

1. **Smart Folder Skeleton Shape Mismatch**: Skeleton uses grid cards but actual folders are vertical list items
2. **File Display Clipping**: Destination paths in ReadyFileItem may overflow
3. **Database Not Updated After Organization**: File paths in ChromaDB remain stale after files are moved
4. **Inefficient Database Calls**: Individual `upsertFileEmbedding` calls during analysis instead of batching

## Implementation Tasks

### Task 1: Fix Smart Folder Skeleton Shape

**File**: `src/renderer/components/LoadingSkeleton.jsx`

- Create new `SmartFolderListSkeleton` component matching `SmartFolderItem` structure
- Match vertical list layout (`space-y-8`) instead of grid
- Include skeleton for: folder name, path, description area, and action buttons row
- Update `SmartFolderSkeleton` export to use new component
- Ensure skeleton matches `p-13 bg-surface-secondary rounded-lg` styling

### Task 2: Fix File Display Clipping in ReadyFileItem

**File**: `src/renderer/components/organize/ReadyFileItem.jsx`

- Replace `break-all` with `break-words` on destination path
- Add `overflow-wrap: break-word` and `word-break: break-word` classes
- Ensure `min-w-0` is present on parent containers to allow text wrapping
- Test with long paths to verify no clipping

### Task 3: Batch File Embedding Upserts During Analysis

**Files**:

- `src/main/analysis/ollamaDocumentAnalysis.js`
- `src/main/analysis/ollamaImageAnalysis.js`
- `src/main/services/FolderMatchingService.js`

- Create batch accumulator in analysis functions
- Collect file embeddings during analysis instead of immediate upsert
- After analysis batch completes, call `batchUpsertFiles` with accumulated embeddings
- Maintain individual upsert as fallback for single-file operations
- Add batch size limit (e.g., 50 files per batch)

### Task 4: Update Database After File Organization

**Files**:

- `src/main/ipc/files.js` (handleBatchOrganize)
- `src/main/services/ChromaDBService.js`

- Add method `updateFilePaths` to ChromaDBService for batch path updates
- After successful file organization, collect old/new path pairs
- Batch update metadata in ChromaDB with new paths
- Update file IDs if needed (file:path format)
- Handle errors gracefully (non-blocking)

### Task 5: Optimize Database Call Frequency

**Files**:

- `src/main/analysis/ollamaDocumentAnalysis.js`
- `src/main/analysis/ollamaImageAnalysis.js`

- Remove immediate `upsertFileEmbedding` calls during analysis
- Queue embeddings for batch processing
- Process queue when batch size reached or analysis completes
- Add debouncing for rapid file analysis

### Task 6: Review Similar UI Issues

**Files**: Review all skeleton components and file display components

- Check `FileListSkeleton` matches actual file list structure
- Verify `AnalysisResultsList` has proper overflow handling
- Ensure all file path displays use proper text wrapping
- Check for other skeleton/actual component mismatches

## Technical Details

### Smart Folder Skeleton Structure

- Vertical list: `space-y-8` container
- Each item: `p-13 bg-surface-secondary rounded-lg`
- Content: name skeleton (w-3/4), path skeleton (w-full), description skeleton (w-2/3), button row skeleton

### Database Batch Update Pattern

```javascript
// Collect during analysis
const embeddingQueue = [];

// Batch upsert after analysis
if (embeddingQueue.length > 0) {
  await chromaDbService.batchUpsertFiles(embeddingQueue);
}
```

### Path Update Pattern

```javascript
// After organization
const pathUpdates = organizedFiles.map((f) => ({
  oldId: `file:${f.originalPath}`,
  newId: `file:${f.path}`,
  newMeta: { path: f.path, name: f.newName },
}));
await chromaDbService.updateFilePaths(pathUpdates);
```

## Testing Considerations

- Verify skeleton matches actual component during loading
- Test with very long file paths (200+ characters)
- Test batch upsert with 100+ files
- Verify database updates after organization
- Check performance improvement metrics

### To-dos

- [x] Fix SmartFolderSkeleton to match SmartFolderItem vertical list structure
- [x] Fix ReadyFileItem destination path clipping with proper text wrapping
- [x] Implement batch file embedding upserts during analysis instead of individual calls
- [x] Add database path updates after file organization completes
- [x] Remove unnecessary individual database calls and implement batching queue
- [x] Review all skeleton components and file displays for similar issues

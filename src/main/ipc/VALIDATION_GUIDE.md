# IPC Validation Guide

This guide shows how to use the new Zod-based IPC validation system.

## Overview

We now have:
- ✅ **Zod schemas** (`src/main/ipc/schemas.js`) - Pre-defined validation schemas
- ✅ **Validation middleware** (`src/main/ipc/validation.js`) - Wrapper functions
- ✅ **Structured errors** (`src/shared/errors/`) - Consistent error handling
- ✅ **electron-log** - Production logging

## Quick Start

### 1. Basic Validation

```javascript
const { validateIpc } = require('./validation');
const { AnalysisRequestSchema } = require('./schemas');

// Wrap your handler with validation
ipcMain.handle('analysis:start',
  validateIpc(AnalysisRequestSchema)(async (event, data) => {
    // data is guaranteed to match the schema
    const { files, options } = data;
    return await analyzeFiles(files, options);
  })
);
```

### 2. With Request ID Tracking

```javascript
const { validateIpc, withRequestId, compose } = require('./validation');
const { FileOpenSchema } = require('./schemas');

ipcMain.handle('files:open',
  compose(
    withRequestId,
    validateIpc(FileOpenSchema)
  )(async (event, data) => {
    return await openFile(data.path);
  })
);
```

### 3. With Error Handling

```javascript
const { validateIpc, withErrorHandling, compose } = require('./validation');
const { SmartFolderAddSchema } = require('./schemas');

ipcMain.handle('smartFolders:add',
  compose(
    withErrorHandling,
    validateIpc(SmartFolderAddSchema)
  )(async (event, folder) => {
    return await addSmartFolder(folder);
  })
);
```

### 4. Full Stack (Recommended)

```javascript
const { validateIpc, withRequestId, withErrorHandling, compose } = require('./validation');
const { BatchMoveSchema } = require('./schemas');

ipcMain.handle('files:batchMove',
  compose(
    withErrorHandling,      // Catches errors and formats response
    withRequestId,          // Adds request tracking
    validateIpc(BatchMoveSchema)  // Validates input
  )(async (event, data) => {
    return await batchMoveFiles(data.operations);
  })
);
```

## Available Schemas

See `src/main/ipc/schemas.js` for all available schemas:

### Common
- `FileSchema` - Single file object
- `FileStateSchema` - File processing state
- `NamingConventionSchema` - Naming options
- `SmartFolderSchema` - Smart folder object

### Analysis
- `AnalysisRequestSchema` - Batch analysis request
- `SingleFileAnalysisSchema` - Single file analysis

### File Operations
- `FileOpenSchema` - Open file
- `FileDeleteSchema` - Delete file
- `FileMoveSchema` - Move file
- `BatchMoveSchema` - Batch move operations
- `FolderScanSchema` - Scan folder

### Smart Folders
- `SmartFolderAddSchema` - Add smart folder
- `SmartFolderEditSchema` - Edit smart folder
- `SmartFolderDeleteSchema` - Delete smart folder

### Organization
- `AutoOrganizeSchema` - Auto-organize files
- `OrganizeSuggestionSchema` - Get organization suggestion

### Settings
- `SettingsGetSchema` - Get settings
- `SettingsSetSchema` - Set settings

### Ollama
- `OllamaModelCheckSchema` - Check model
- `OllamaModelPullSchema` - Pull model

## Creating Custom Schemas

```javascript
const { z } = require('zod');

// Simple schema
const MySchema = z.object({
  name: z.string().min(1),
  count: z.number().positive(),
});

// Complex schema with validation
const ComplexSchema = z.object({
  files: z.array(z.string()).min(1).max(100),
  options: z.object({
    recursive: z.boolean().default(false),
    maxDepth: z.number().int().positive().optional(),
  }).optional(),
}).refine((data) => {
  // Custom validation
  if (data.options?.maxDepth && !data.options?.recursive) {
    throw new z.ZodError([{
      code: 'custom',
      message: 'maxDepth requires recursive to be true',
      path: ['options', 'maxDepth'],
    }]);
  }
  return true;
});
```

## Error Handling

The validation system throws `ValidationError` when validation fails:

```javascript
try {
  await window.electronAPI.analysis.start({ files: null });
} catch (error) {
  // error.code === 'VALIDATION_ERROR'
  // error.details.errors contains Zod error details
  console.error('Validation failed:', error.details);
}
```

## Logging

All validated requests are automatically logged with:
- Request ID
- Channel name
- Duration
- Success/failure
- Validation errors (if any)

Logs are saved to:
- Windows: `%APPDATA%/stratosort/logs/main.log`
- Mac: `~/Library/Logs/stratosort/main.log`
- Linux: `~/.config/stratosort/logs/main.log`

## Migration Guide

### Old Way (No Validation)

```javascript
ipcMain.handle('analysis:start', async (event, files, options) => {
  // No validation, can crash if files is null
  return analyzeFiles(files, options);
});
```

### New Way (With Validation)

```javascript
const { validateIpc } = require('./validation');
const { AnalysisRequestSchema } = require('./schemas');

ipcMain.handle('analysis:start',
  validateIpc(AnalysisRequestSchema)(async (event, data) => {
    // Guaranteed valid data
    return analyzeFiles(data.files, data.options);
  })
);
```

## Testing

Test your schemas with Zod's parse method:

```javascript
const { AnalysisRequestSchema } = require('./schemas');

try {
  const data = AnalysisRequestSchema.parse({
    files: ['/path/to/file.txt'],
    options: { force: true },
  });
  console.log('Valid!', data);
} catch (error) {
  console.error('Invalid!', error.errors);
}
```

## Best Practices

1. **Always validate IPC inputs** - Use `validateIpc()` for all handlers
2. **Use composed middleware** - Combine validation, request ID, and error handling
3. **Add custom schemas** - Create schemas for your specific use cases
4. **Log everything** - Request IDs help track issues in production
5. **Handle errors gracefully** - Use `withErrorHandling` to format errors consistently

## Performance

- Validation adds ~0.1-1ms overhead per request
- Schemas are compiled once and reused
- Logging is asynchronous and non-blocking

## Next Steps

1. Migrate existing IPC handlers to use validation
2. Add schemas for custom endpoints
3. Monitor logs for validation errors
4. Update frontend to handle ValidationError responses

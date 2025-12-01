# Dependency Injection Patterns

This document describes the dependency injection (DI) patterns used in the StratoSort codebase.

## Overview

The codebase uses a centralized DI container (`ServiceContainer`) for managing service dependencies. All services should be accessed through the container rather than direct instantiation or `getInstance()` calls.

## ServiceContainer

The `ServiceContainer` class (`src/main/services/ServiceContainer.js`) provides:

- **Singleton services**: Created once and reused
- **Transient services**: Created fresh each time
- **Lazy initialization**: Services created on first request
- **Circular dependency detection**
- **Graceful shutdown**

## Service IDs

All services are registered with unique identifiers in `ServiceIds`:

```javascript
const { container, ServiceIds } = require('./ServiceContainer');

// Available service IDs:
ServiceIds.CHROMA_DB; // ChromaDB vector database
ServiceIds.SETTINGS; // Application settings
ServiceIds.OLLAMA_SERVICE; // Ollama LLM service
ServiceIds.OLLAMA_CLIENT; // Ollama API client
ServiceIds.PARALLEL_EMBEDDING; // Parallel embedding processor
ServiceIds.EMBEDDING_CACHE; // Embedding cache
ServiceIds.FOLDER_MATCHING; // Folder matching service
ServiceIds.ORGANIZATION_SUGGESTION; // Organization suggestions
ServiceIds.AUTO_ORGANIZE; // Auto-organize service
ServiceIds.ANALYSIS_HISTORY; // Analysis history
ServiceIds.UNDO_REDO; // Undo/redo service
ServiceIds.PROCESSING_STATE; // Processing state tracker
```

## Usage Patterns

### Recommended: Container Resolution

```javascript
const { container, ServiceIds } = require('./services/ServiceContainer');

// Resolve a service
const chromaDb = container.resolve(ServiceIds.CHROMA_DB);
const ollama = container.resolve(ServiceIds.OLLAMA_SERVICE);
```

### Legacy: getInstance() (Deprecated)

Some services still export `getInstance()` for backward compatibility. **Do not use in new code**:

```javascript
// DEPRECATED - avoid in new code
const { getInstance } = require('./OllamaService');
const ollama = getInstance();
```

## Registering New Services

### Singleton Services

```javascript
container.registerSingleton(ServiceIds.MY_SERVICE, (c) => {
  // c is the container - use it to resolve dependencies
  return new MyService({
    chromaDb: c.resolve(ServiceIds.CHROMA_DB),
    settings: c.resolve(ServiceIds.SETTINGS),
  });
});
```

### Transient Services

```javascript
container.registerTransient('myTransient', () => {
  return new TransientService();
});
```

## Service Integration

The `ServiceIntegration` class (`src/main/services/ServiceIntegration.js`) handles:

1. Registering all core services with the container
2. Initializing services in dependency order
3. Providing backward-compatible property access
4. Coordinating service shutdown

### Initialization

```javascript
const ServiceIntegration = require('./services/ServiceIntegration');

const integration = new ServiceIntegration();
await integration.initialize();

// Access via container (recommended)
const chromaDb = container.resolve(ServiceIds.CHROMA_DB);

// Or via integration properties (backward compatible)
const chromaDb = integration.chromaDbService;
```

## Testing

The DI container makes testing easier by allowing mock injection:

```javascript
// In tests, register mocks before resolving
container.registerInstance(ServiceIds.CHROMA_DB, mockChromaDb);

// Your service will receive the mock
const folderMatching = container.resolve(ServiceIds.FOLDER_MATCHING);
```

## Migration Guide

When migrating from `getInstance()` to container resolution:

1. Import the container and ServiceIds
2. Replace `getInstance()` calls with `container.resolve()`
3. Ensure the service is registered in `ServiceIntegration._registerCoreServices()`

### Before

```javascript
const { getInstance } = require('./OllamaService');
const ollama = getInstance();
await ollama.generateEmbedding(text);
```

### After

```javascript
const { container, ServiceIds } = require('./ServiceContainer');
const ollama = container.resolve(ServiceIds.OLLAMA_SERVICE);
await ollama.generateEmbedding(text);
```

## Best Practices

1. **Always use the container** for service access in new code
2. **Accept dependencies via constructor** rather than grabbing singletons
3. **Register services in ServiceIntegration** for proper lifecycle management
4. **Use ServiceIds** constants instead of string literals
5. **Mock services in tests** by registering test instances

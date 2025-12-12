> **[HISTORICAL REPORT]**
>
> This document is a historical development report capturing work completed during a specific
> session. For current documentation, see the main [README.md](../../README.md) or [docs/](../)
> directory.
>
> ---

# StratoSort Startup System Documentation

## Overview

The StratoSort startup system has been enhanced with a robust, production-ready startup manager that
ensures all necessary services (ChromaDB, Ollama) are properly initialized before the application
becomes available to users.

## Key Features

### 1. **Startup Manager Service** (`src/main/services/StartupManager.js`)

The centralized startup orchestrator that handles:

- **Retry Logic with Exponential Backoff**: Automatically retries failed service startups with
  increasing delays
- **Pre-flight Checks**: Validates system requirements before attempting to start services
- **Health Monitoring**: Continuously monitors service health and attempts recovery
- **Graceful Degradation**: Allows app to function with reduced features when services fail
- **Timeout Protection**: Prevents indefinite hanging during startup
- **Progress Reporting**: Real-time updates to the UI about startup status

### 2. **Startup Splash Screen** (`src/main/core/startupSplash.js`)

A beautiful, informative splash screen that:

- Shows real-time startup progress
- Displays service status (ChromaDB, Ollama)
- Reports errors with options to continue or quit
- Indicates when running in degraded mode
- Automatically closes when startup is complete

### 3. **Integration with Main Process** (`src/main/simple-main.js`)

Seamlessly integrated into the existing codebase with:

- Backward compatibility with existing startup code
- Graceful shutdown handling
- Service process lifecycle management

## Architecture

### Startup Sequence

```
1. App Ready Event
   ↓
2. Create Splash Screen
   ↓
3. Initialize StartupManager
   ↓
4. Pre-flight Checks
   ├── Data directory writable?
   ├── Python installed?
   ├── Ollama installed?
   ├── Ports available?
   └── Sufficient disk space?
   ↓
5. Service Initialization
   ├── Start ChromaDB (with retry)
   └── Start Ollama (with retry)
   ↓
6. Application Services
   ├── Load custom folders
   ├── Initialize ServiceIntegration
   ├── Load settings
   └── Verify AI models
   ↓
7. Create Main Window
   ↓
8. Close Splash Screen
   ↓
9. Start Health Monitoring
```

### Health Monitoring

After successful startup, the system continuously monitors service health:

- **Check Interval**: Every 30 seconds (configurable)
- **Failure Threshold**: 3 consecutive failures trigger auto-restart
- **Monitored Services**: ChromaDB, Ollama
- **Recovery**: Automatic service restart on persistent failures

## Configuration

### Environment Variables

All existing environment variables are still supported:

#### ChromaDB Configuration

```bash
STRATOSORT_DISABLE_CHROMADB=1          # Disable ChromaDB entirely
CHROMA_SERVER_URL=http://host:port     # Override full URL
CHROMA_SERVER_HOST=127.0.0.1           # Override host
CHROMA_SERVER_PORT=8000                # Override port
CHROMA_SERVER_PROTOCOL=http            # Override protocol
CHROMA_SERVER_COMMAND="custom cmd"     # Custom startup command
```

#### Ollama Configuration

```bash
OLLAMA_BASE_URL=http://127.0.0.1:11434
OLLAMA_TEXT_MODEL=llama3.2:latest
OLLAMA_VISION_MODEL=llava:latest
OLLAMA_EMBEDDING_MODEL=mxbai-embed-large
```

### StartupManager Configuration

The StartupManager can be configured by modifying `src/main/services/StartupManager.js`:

```javascript
this.config = {
  startupTimeout: 60000, // Overall startup timeout (ms)
  healthCheckInterval: 30000, // Health check interval (ms)
  maxRetries: 3, // Max service start attempts
  baseRetryDelay: 1000 // Base delay for exponential backoff (ms)
};
```

## Graceful Degradation

When services fail to start, the application enters **degraded mode**:

### What Happens

- Application continues to load instead of crashing
- `global.degradedMode` object is set with failure details
- User is notified via splash screen
- App functions with reduced features

### Degraded Mode Features

#### ChromaDB Failed

- ❌ Semantic search disabled
- ❌ Smart folder matching limited
- ✅ Basic file operations work
- ✅ Manual organization works

#### Ollama Failed

- ❌ AI analysis disabled
- ❌ Automatic categorization unavailable
- ✅ File browsing works
- ✅ Manual organization works

### Accessing Degraded Mode Status

```javascript
// Check if in degraded mode
if (global.degradedMode?.enabled) {
  console.log('Missing services:', global.degradedMode.missingServices);
  console.log('Limitations:', global.degradedMode.limitations);
}
```

## Service Startup Details

### ChromaDB Startup

**Startup Methods** (tried in order):

1. Custom command (`CHROMA_SERVER_COMMAND` env var)
2. Local CLI (`node_modules/.bin/chromadb`)
3. Python module (`python -m chromadb run`)

**Verification**:

- HTTP GET to `http://host:port/api/v2/heartbeat`
- Retry with exponential backoff
- Timeout: 15 seconds

**Failure Handling**:

- Logs error details
- Marks service as failed
- Continues startup in degraded mode (ChromaDB is not required)

### Ollama Startup

**Startup Method**:

- Execute `ollama serve`
- Detached process with stderr capture

**Verification**:

- HTTP GET to `http://host:port/api/tags`
- Retry with exponential backoff
- Timeout: 15 seconds

**Failure Handling**:

- Logs error details
- Marks service as failed
- Continues startup in degraded mode (Ollama is not required)

## Error Handling

### Startup Errors

The system handles errors at multiple levels:

1. **Pre-flight Check Failures**
   - Non-critical: Warning logged, startup continues
   - Critical (e.g., data directory not writable): Error shown, option to quit

2. **Service Startup Failures**
   - Retry with exponential backoff
   - After max retries: Log warning, enable degraded mode
   - User notified via splash screen

3. **Timeout Protection**
   - Overall startup timeout: 60 seconds
   - Individual service timeout: 15 seconds per attempt
   - Timeout triggers graceful degradation

### Runtime Errors

Health monitoring detects and recovers from runtime failures:

- **3 consecutive health check failures** → Attempt service restart
- Restart uses same retry logic as initial startup
- User is not blocked during recovery attempts

## Monitoring and Debugging

### Logs

All startup activities are logged with appropriate levels:

```
[STARTUP] Application starting...
[SPLASH] Startup splash screen created
[STARTUP] [preflight] Running pre-flight checks...
[STARTUP] [preflight] Pre-flight checks completed
[STARTUP] [services] Initializing services...
[STARTUP] Starting chromadb... (attempt 1/3)
[STARTUP] chromadb started successfully
[STARTUP] Starting ollama... (attempt 1/3)
[STARTUP] ollama started successfully
[STARTUP] [ready] Application ready
[HEALTH] Starting health monitoring...
```

### Service Status API

Get current service status programmatically:

```javascript
const startupManager = require('./services/StartupManager').getStartupManager();
const status = startupManager.getServiceStatus();

console.log(status);
// {
//   startup: 'completed',
//   phase: 'ready',
//   services: {
//     chromadb: { status: 'running', health: 'healthy', required: false },
//     ollama: { status: 'running', health: 'healthy', required: false }
//   },
//   errors: [],
//   degraded: false
// }
```

## Shutdown Process

The StartupManager handles graceful shutdown:

1. **Stop Health Monitoring**: Clear health check interval
2. **Terminate Services**: Send SIGTERM to all spawned processes
3. **Wait for Graceful Shutdown**: 5-second timeout
4. **Force Kill if Necessary**: SIGKILL after timeout
5. **Cleanup Resources**: Clear process references

### Shutdown Logs

```
[STARTUP] Shutting down services...
[STARTUP] Stopping chromadb...
[STARTUP] Stopping ollama...
[SHUTDOWN] StartupManager cleanup completed
```

## Best Practices

### For Developers

1. **Don't Modify `simple-main.js` Directly**
   - Use StartupManager for service management
   - Extend StartupManager for new services

2. **Add New Services**

   ```javascript
   // In StartupManager.js
   async startMyService() {
     const startFunc = async () => { /* start logic */ };
     const checkFunc = async () => { /* health check */ };

     return await this.startServiceWithRetry('myservice', startFunc, checkFunc, {
       required: false,
       verifyTimeout: 10000
     });
   }
   ```

3. **Monitor Service Health**
   - Add service to `serviceStatus` in constructor
   - Implement health check in `checkServicesHealth()`

4. **Handle Degraded Mode**
   - Check `global.degradedMode` before using AI features
   - Provide fallback behavior when services unavailable

### For Users

1. **Installation Requirements**
   - Install Python 3.10+ for ChromaDB: `pip install chromadb`
   - Install Ollama from https://ollama.ai

2. **Startup Issues**
   - Check logs for detailed error messages
   - Verify Python and Ollama are in PATH
   - Check firewall settings for ports 8000 and 11434

3. **Performance Tuning**
   - Adjust `healthCheckInterval` if checks are too frequent
   - Increase `maxRetries` for slow/unreliable systems
   - Set `startupTimeout` higher for slower machines

## Troubleshooting

### Common Issues

#### "ChromaDB failed to start"

**Possible Causes**:

- Python not installed or not in PATH
- `chromadb` package not installed
- Port 8000 already in use
- Insufficient permissions

**Solutions**:

1. Install Python 3.10+: `python --version`
2. Install ChromaDB: `pip install chromadb`
3. Check port: `netstat -an | findstr :8000` (Windows) or `lsof -i :8000` (Mac/Linux)
4. Run as administrator if permission denied

#### "Ollama failed to start"

**Possible Causes**:

- Ollama not installed
- Ollama not in PATH
- Port 11434 already in use
- Service already running elsewhere

**Solutions**:

1. Install Ollama: https://ollama.ai
2. Verify installation: `ollama --version`
3. Check if already running: `ollama list`
4. Kill existing process if needed

#### "Startup timeout exceeded"

**Possible Causes**:

- Slow system or network
- Large AI model downloads in progress
- Services hanging during startup

**Solutions**:

1. Increase `startupTimeout` in StartupManager config
2. Start services manually before launching app
3. Check system resources (CPU, memory, disk)

#### "Application runs in degraded mode"

**Symptoms**:

- Warning message on splash screen
- Limited AI features
- Semantic search disabled

**Solutions**:

1. Check service status in logs
2. Manually start failed services
3. Restart application
4. Verify service requirements (Python, Ollama)

## Migration Guide

### From Old Startup System

The new startup system is **backward compatible**. No changes required for existing installations.

### Changes Made

1. ✅ **No Breaking Changes**: All existing environment variables work
2. ✅ **Graceful Fallback**: Old startup code still exists as fallback
3. ✅ **Enhanced Reliability**: Retry logic and error handling added
4. ✅ **Better UX**: Splash screen shows progress
5. ✅ **Health Monitoring**: Services are now continuously monitored

### What's New

- `src/main/services/StartupManager.js` - New service manager
- `src/main/core/startupSplash.js` - New splash screen
- Enhanced `simple-main.js` with StartupManager integration
- `global.degradedMode` - New degraded mode indicator

## Future Enhancements

Potential improvements for future versions:

1. **Service Dependency Graph**: Define service dependencies and start in correct order
2. **Parallel Service Startup**: Start independent services simultaneously
3. **Custom Pre-flight Checks**: Allow plugins to register custom checks
4. **Service Restart Policies**: Configurable restart behavior per service
5. **Metrics Collection**: Track startup times and failure rates
6. **User Notifications**: In-app notifications for service recovery
7. **Service Status UI**: Real-time service status in settings panel

## API Reference

### StartupManager

#### Methods

##### `startup(): Promise<object>`

Main startup sequence. Returns startup result with service statuses.

##### `shutdown(): Promise<void>`

Gracefully shutdown all services.

##### `getServiceStatus(): object`

Get current status of all services and startup process.

##### `setProgressCallback(callback: function): void`

Set callback for startup progress updates.

##### `startServiceWithRetry(name, startFunc, checkFunc, config): Promise<object>`

Start a service with retry logic.

##### `checkServicesHealth(): Promise<void>`

Manually trigger health check for all services.

#### Events

Progress callback receives:

```javascript
{
  phase: 'preflight' | 'services' | 'models' | 'ready' | 'degraded',
  message: 'Human-readable status message',
  progress: 0-100,
  serviceStatus: { chromadb: {...}, ollama: {...} },
  errors: [{ service, error, critical }]
}
```

### StartupSplash

#### Methods

##### `create(): BrowserWindow`

Create and show the splash window.

##### `updateProgress(data: object): void`

Update progress display.

##### `close(): void`

Close the splash window.

##### `showError(error: string, canContinue: boolean): void`

Show error with option to continue or quit.

## Support

For issues or questions:

1. Check logs in `%APPDATA%/stratosort/logs` (Windows) or `~/Library/Logs/stratosort` (Mac)
2. Review this documentation
3. Open an issue on GitHub with logs and system info

## License

Same as StratoSort application license.

---

**Last Updated**: 2025-11-15 **Version**: 1.1.0

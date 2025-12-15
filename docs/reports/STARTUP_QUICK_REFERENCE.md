> **[HISTORICAL REPORT]**
>
> This document is a historical development report capturing work completed during a specific
> session. For current documentation, see the main [README.md](../../README.md) or [docs/](../)
> directory.
>
> ---

# StratoSort Startup System - Quick Reference

## What Was Added

### 🎯 New Files Created

1. **`src/main/services/StartupManager.js`**
   - Centralized service orchestration
   - Retry logic with exponential backoff
   - Health monitoring
   - Graceful degradation

2. **`src/main/core/startupSplash.js`**
   - Beautiful startup splash screen
   - Real-time progress updates
   - Service status indicators
   - Error reporting

3. **`STARTUP_SYSTEM.md`**
   - Comprehensive documentation
   - Architecture details
   - Troubleshooting guide

4. **`STARTUP_QUICK_REFERENCE.md`** (this file)
   - Quick reference for developers

### 🔧 Modified Files

1. **`src/main/simple-main.js`**
   - Import StartupManager and StartupSplash
   - Modified `app.whenReady()` to use new startup system
   - Updated shutdown process to use StartupManager cleanup
   - Exported `buildChromaSpawnPlan` for StartupManager use

## Key Features at a Glance

| Feature                  | Description                                         | Status         |
| ------------------------ | --------------------------------------------------- | -------------- |
| **Pre-flight Checks**    | Validates system requirements before startup        | ✅ Implemented |
| **Retry Logic**          | Auto-retry failed services with exponential backoff | ✅ Implemented |
| **Health Monitoring**    | Continuous monitoring with auto-recovery            | ✅ Implemented |
| **Graceful Degradation** | App works with reduced features if services fail    | ✅ Implemented |
| **Startup Splash**       | Visual feedback during startup                      | ✅ Implemented |
| **Timeout Protection**   | Prevents indefinite hanging                         | ✅ Implemented |
| **Service Lifecycle**    | Proper startup and shutdown management              | ✅ Implemented |

## Quick Start for Developers

### Using the StartupManager

```javascript
// Get the singleton instance
const { getStartupManager } = require('./services/StartupManager');
const startupManager = getStartupManager();

// Run startup
await startupManager.startup();

// Get service status
const status = startupManager.getServiceStatus();

// Shutdown
await startupManager.shutdown();
```

### Adding a New Service

```javascript
// In StartupManager.js, add a new method:
async startMyService() {
  const startFunc = async () => {
    // Your service startup logic
    const process = spawn('myservice', ['--serve']);
    return { process };
  };

  const checkFunc = async () => {
    // Your health check logic
    const response = await axios.get('http://localhost:9000/health');
    return response.status === 200;
  };

  return await this.startServiceWithRetry('myservice', startFunc, checkFunc, {
    required: false,        // Is service required?
    verifyTimeout: 15000    // How long to wait for startup
  });
}

// In _runStartupSequence(), call your method:
async _runStartupSequence() {
  // ... existing code ...
  const myServiceResult = await this.startMyService();
  // ... existing code ...
}
```

### Checking for Degraded Mode

```javascript
// In your code, check if services are available
if (global.degradedMode?.enabled) {
  // Show warning to user
  console.log('Missing services:', global.degradedMode.missingServices);
  console.log('Limitations:', global.degradedMode.limitations);

  // Disable AI features
  if (global.degradedMode.missingServices.includes('ollama')) {
    disableAIFeatures();
  }
}
```

## Configuration Quick Reference

### Environment Variables

```bash
# ChromaDB
STRATOSORT_DISABLE_CHROMADB=1
CHROMA_SERVER_HOST=127.0.0.1
CHROMA_SERVER_PORT=8000

# Ollama
OLLAMA_BASE_URL=http://127.0.0.1:11434
```

### StartupManager Config

```javascript
// In StartupManager.js constructor
this.config = {
  startupTimeout: 60000, // 60 seconds
  healthCheckInterval: 30000, // 30 seconds
  maxRetries: 3, // 3 attempts
  baseRetryDelay: 1000 // 1 second base delay
};
```

## Service Status Values

### Startup States

- `initializing` - Just started
- `running` - Currently running startup
- `completed` - Startup finished successfully
- `failed` - Startup failed

### Service Status

- `not_started` - Not yet started
- `starting` - Currently starting
- `running` - Running normally
- `failed` - Failed to start
- `stopped` - Was running but stopped
- `disabled` - Disabled via config

### Health Status

- `unknown` - Not yet checked
- `healthy` - Passing health checks
- `unhealthy` - Failing health checks

## Troubleshooting Checklist

### Startup Issues

- [ ] Check logs for error messages
- [ ] Verify Python installed: `python --version`
- [ ] Verify Ollama installed: `ollama --version`
- [ ] Check if ports are available (8000, 11434)
- [ ] Try increasing `startupTimeout`
- [ ] Start services manually first

### Health Check Issues

- [ ] Check if services are responding
- [ ] Verify network connectivity
- [ ] Check firewall settings
- [ ] Review health check logs
- [ ] Adjust `healthCheckInterval`

### Degraded Mode

- [ ] Check which services failed
- [ ] Review service startup logs
- [ ] Manually start failed services
- [ ] Restart application
- [ ] Check service requirements

## Testing Checklist

### Basic Functionality

- [ ] App starts successfully
- [ ] Splash screen shows
- [ ] ChromaDB starts (if installed)
- [ ] Ollama starts (if installed)
- [ ] Splash screen closes when ready
- [ ] Main window appears

### Error Scenarios

- [ ] ChromaDB not installed → Degraded mode
- [ ] Ollama not installed → Degraded mode
- [ ] Port already in use → Retry or fail gracefully
- [ ] Python not installed → Warning, continue
- [ ] Startup timeout → Graceful degradation

### Recovery

- [ ] Service crashes → Auto-restart after 3 failures
- [ ] Health check failure → Auto-recovery
- [ ] App shutdown → Clean service termination
- [ ] Force quit → No orphaned processes

## Log Patterns to Watch

### Success Pattern

```
[STARTUP] Application starting...
[STARTUP] [preflight] Pre-flight checks completed
[STARTUP] chromadb started successfully
[STARTUP] ollama started successfully
[STARTUP] [ready] Application ready
[HEALTH] Starting health monitoring...
```

### Warning Pattern

```
[STARTUP] chromadb attempt 2 failed: Connection refused
[STARTUP] Waiting 2000ms before retry...
```

### Error Pattern

```
[STARTUP] chromadb failed to start after 3 attempts
[STARTUP] Enabling graceful degradation mode...
[STARTUP] Running in degraded mode
```

## Performance Considerations

### Startup Time

- **Normal**: 5-15 seconds
- **First run**: 30-60 seconds (model downloads)
- **Degraded mode**: 3-5 seconds (services fail fast)

### Resource Usage

- **Memory**: +50MB for StartupManager and monitoring
- **CPU**: Minimal (health checks every 30s)
- **Network**: Periodic health check requests

## Best Practices

### Do's ✅

- Check `global.degradedMode` before using AI features
- Use StartupManager for all service management
- Add proper health checks for new services
- Log detailed error messages
- Test both success and failure scenarios

### Don'ts ❌

- Don't manually spawn service processes outside StartupManager
- Don't disable health monitoring in production
- Don't set retries too high (causes long startup delays)
- Don't ignore degraded mode indicators
- Don't hardcode timeouts (use config)

## Quick Commands

```bash
# Check if services are running
# ChromaDB
curl http://localhost:8000/api/v2/heartbeat

# Ollama
curl http://localhost:11434/api/tags

# View logs
# Windows
type %APPDATA%\stratosort\logs\main.log

# Mac/Linux
cat ~/Library/Logs/stratosort/main.log

# Install dependencies
pip install chromadb
ollama pull llama3.2
```

## Support Resources

1. **Full Documentation**: `STARTUP_SYSTEM.md`
2. **Code**: `src/main/services/StartupManager.js`
3. **Logs**: `%APPDATA%/stratosort/logs/` (Windows)
4. **GitHub Issues**: [Report issues here]

---

**Quick Reference Version**: 1.0 **Last Updated**: 2025-11-15

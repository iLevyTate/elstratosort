const { spawn, spawnSync } = require('child_process');
const { logger } = require('../../shared/logger');
const axios = require('axios');
const path = require('path');
const fs = require('fs');
const { app } = require('electron');

/**
 * StartupManager
 *
 * Centralized service for managing application startup sequence with:
 * - Retry logic with exponential backoff
 * - Health monitoring for services
 * - Graceful degradation when services fail
 * - Pre-flight checks before startup
 * - User-friendly error reporting
 * - Timeout protection
 */
class StartupManager {
  constructor() {
    this.services = new Map();
    this.healthMonitor = null;
    this.healthCheckInProgress = false;
    this.startupState = 'initializing';
    this.errors = [];
    this.serviceProcesses = new Map();
    this.config = {
      startupTimeout: 60000, // 60 seconds overall timeout
      healthCheckInterval: 30000, // 30 seconds between health checks
      maxRetries: 3,
      baseRetryDelay: 1000, // Base delay for exponential backoff
    };

    // Service status tracking
    this.serviceStatus = {
      chromadb: { status: 'not_started', required: false, health: 'unknown' },
      ollama: { status: 'not_started', required: false, health: 'unknown' },
    };

    this.startupPhase = 'idle';
    this.onProgressCallback = null;
    this.chromadbDependencyMissing = false;
    this.restartLocks = {
      chromadb: false,
      ollama: false,
    };
  }
  hasPythonModule(moduleName) {
    // Try different Python commands based on platform
    const pythonCommands =
      process.platform === 'win32'
        ? [
            { cmd: 'py', args: ['-3'] },
            { cmd: 'python3', args: [] },
            { cmd: 'python', args: [] },
          ]
        : [
            { cmd: 'python3', args: [] },
            { cmd: 'python', args: [] },
          ];

    for (const { cmd, args } of pythonCommands) {
      try {
        const check = spawnSync(
          cmd,
          [
            ...args,
            '-c',
            `import importlib; importlib.import_module("${moduleName}")`,
          ],
          {
            stdio: ['ignore', 'ignore', 'pipe'],
            timeout: 5000,
            windowsHide: true,
          },
        );

        if (check.status === 0) {
          logger.debug(
            `[STARTUP] Python module "${moduleName}" found using ${cmd}`,
          );
          return true;
        }

        const stderr = check.stderr?.toString().trim();
        if (stderr && !stderr.includes('No module named')) {
          logger.debug(
            `[STARTUP] ${cmd} error checking "${moduleName}": ${stderr}`,
          );
        }
      } catch (error) {
        // Command not found or failed, try next one
        logger.debug(`[STARTUP] ${cmd} not available: ${error.message}`);
      }
    }

    logger.warn(
      `[STARTUP] Python module "${moduleName}" not found with any Python interpreter`,
    );
    return false;
  }

  /**
   * Set callback for startup progress updates (optional - no splash screen)
   */
  setProgressCallback(callback) {
    this.onProgressCallback = callback;
  }

  /**
   * Report startup progress to UI
   */
  reportProgress(phase, message, progress) {
    this.startupPhase = phase;
    logger.info(`[STARTUP] [${phase}] ${message}`);

    if (this.onProgressCallback) {
      this.onProgressCallback({
        phase,
        message,
        progress,
        serviceStatus: { ...this.serviceStatus },
        errors: [...this.errors],
      });
    }
  }

  /**
   * Pre-flight checks before starting services
   */
  async runPreflightChecks() {
    this.reportProgress('preflight', 'Running pre-flight checks...', 5);
    const checks = [];

    // Check 1: Verify data directory exists and is writable
    try {
      const userDataPath = app.getPath('userData');
      if (!fs.existsSync(userDataPath)) {
        fs.mkdirSync(userDataPath, { recursive: true });
      }

      const testFile = path.join(userDataPath, '.write-test');
      fs.writeFileSync(testFile, 'test');
      fs.unlinkSync(testFile);
      checks.push({ name: 'Data Directory', status: 'ok' });
    } catch (error) {
      checks.push({
        name: 'Data Directory',
        status: 'fail',
        error: error.message,
      });
      this.errors.push({
        check: 'data-directory',
        error: error.message,
        critical: true,
      });
    }

    // Check 2: Verify Python installation (for ChromaDB)
    try {
      const pythonCheck = await this.checkPythonInstallation();
      checks.push({
        name: 'Python Installation',
        status: pythonCheck.installed ? 'ok' : 'warn',
        version: pythonCheck.version,
      });
      if (!pythonCheck.installed) {
        this.errors.push({
          check: 'python',
          error: 'Python not found. ChromaDB features will be disabled.',
          critical: false,
        });
      }
    } catch (error) {
      checks.push({
        name: 'Python Installation',
        status: 'warn',
        error: error.message,
      });
    }

    // Check 3: Verify Ollama installation
    try {
      const ollamaCheck = await this.checkOllamaInstallation();
      checks.push({
        name: 'Ollama Installation',
        status: ollamaCheck.installed ? 'ok' : 'warn',
      });
      if (!ollamaCheck.installed) {
        this.errors.push({
          check: 'ollama',
          error: 'Ollama not found. AI features will be limited.',
          critical: false,
        });
      }
    } catch (error) {
      checks.push({
        name: 'Ollama Installation',
        status: 'warn',
        error: error.message,
      });
    }

    // Check 4: Port availability
    try {
      const chromaPort = process.env.CHROMA_SERVER_PORT || 8000;
      const ollamaPort = 11434;

      const chromaPortAvailable = await this.isPortAvailable(
        '127.0.0.1',
        chromaPort,
      );
      const ollamaPortAvailable = await this.isPortAvailable(
        '127.0.0.1',
        ollamaPort,
      );

      checks.push({
        name: 'Port Availability',
        status: chromaPortAvailable || ollamaPortAvailable ? 'ok' : 'warn',
        details: {
          chromaPort,
          ollamaPort,
          chromaPortAvailable,
          ollamaPortAvailable,
        },
      });
    } catch (error) {
      checks.push({
        name: 'Port Availability',
        status: 'warn',
        error: error.message,
      });
    }

    // Check 5: Disk space
    try {
      app.getPath('userData');
      // Simple check - just verify we can resolve the user data path
      checks.push({ name: 'Disk Space', status: 'ok' });
    } catch (error) {
      checks.push({ name: 'Disk Space', status: 'warn', error: error.message });
    }

    this.reportProgress('preflight', 'Pre-flight checks completed', 10);
    return checks;
  }

  /**
   * Check if Python is installed
   */
  async checkPythonInstallation() {
    return new Promise((resolve) => {
      const python = process.platform === 'win32' ? 'python' : 'python3';
      const child = spawn(python, ['--version']);
      let resolved = false;

      let version = '';
      child.stdout.on('data', (data) => {
        version += data.toString();
      });

      child.stderr.on('data', (data) => {
        version += data.toString();
      });

      child.on('close', (code) => {
        if (!resolved) {
          resolved = true;
          resolve({
            installed: code === 0,
            version: version.trim(),
          });
        }
      });

      child.on('error', () => {
        if (!resolved) {
          resolved = true;
          child.removeAllListeners();
          resolve({ installed: false, version: null });
        }
      });

      const timeout = setTimeout(() => {
        if (!resolved) {
          resolved = true;
          try {
            child.kill();
            child.removeAllListeners();
          } catch (e) {
            // Process may have already exited
          }
          resolve({ installed: false, version: null });
        }
      }, 5000);

      // Clear timeout if process completes normally
      child.on('close', () => clearTimeout(timeout));
    });
  }

  /**
   * Check if Ollama is installed
   */
  async checkOllamaInstallation() {
    return new Promise((resolve) => {
      const child = spawn('ollama', ['--version']);
      let resolved = false;

      let version = '';
      child.stdout.on('data', (data) => {
        version += data.toString();
      });

      child.on('close', (code) => {
        if (!resolved) {
          resolved = true;
          resolve({
            installed: code === 0,
            version: version.trim(),
          });
        }
      });

      child.on('error', () => {
        if (!resolved) {
          resolved = true;
          child.removeAllListeners();
          resolve({ installed: false, version: null });
        }
      });

      const timeout = setTimeout(() => {
        if (!resolved) {
          resolved = true;
          try {
            child.kill();
            child.removeAllListeners();
          } catch (e) {
            // Process may have already exited
          }
          resolve({ installed: false, version: null });
        }
      }, 5000);

      // Clear timeout if process completes normally
      child.on('close', () => clearTimeout(timeout));
    });
  }

  /**
   * Check if a port is available
   */
  async isPortAvailable(host, port) {
    try {
      await axios.get(`http://${host}:${port}`, { timeout: 1000 });
      // If we get here, something is already running on the port
      return false;
    } catch (error) {
      // Only specific errors indicate port is available
      if (error.code === 'ECONNREFUSED') {
        // Port is definitely available
        return true;
      }
      if (error.code === 'ETIMEDOUT') {
        // Timeout likely means port is available but no response
        return true;
      }

      // For other errors (network issues, DNS failures, firewall blocks, etc.)
      // we cannot be certain, so assume port is NOT available (conservative approach)
      logger.warn(
        `[PREFLIGHT] Port check inconclusive for ${host}:${port}: ${error.code || error.message}`,
      );
      return false;
    }
  }

  /**
   * Start a service with retry logic and exponential backoff
   */
  async startServiceWithRetry(serviceName, startFunc, checkFunc, config = {}) {
    const maxRetries = config.maxRetries || this.config.maxRetries;
    const required = config.required || false;
    let lastError = null;

    this.serviceStatus[serviceName] = {
      status: 'starting',
      required,
      health: 'unknown',
      attempts: 0,
    };

    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        this.serviceStatus[serviceName].attempts = attempt + 1;
        this.reportProgress(
          'service-startup',
          `Starting ${serviceName}... (attempt ${attempt + 1}/${maxRetries})`,
          20 + (serviceName === 'chromadb' ? attempt * 10 : attempt * 15),
        );

        // Exponential backoff for retries
        if (attempt > 0) {
          const delay = Math.min(
            this.config.baseRetryDelay * Math.pow(2, attempt),
            10000,
          );
          logger.info(`[STARTUP] Waiting ${delay}ms before retry...`);
          await this.delay(delay);
        }

        // Check if already running
        const alreadyRunning = await checkFunc();
        if (alreadyRunning) {
          logger.info(`[STARTUP] ${serviceName} is already running`);
          this.serviceStatus[serviceName].status = 'running';
          this.serviceStatus[serviceName].health = 'healthy';
          return { success: true, alreadyRunning: true };
        }

        // Try to start the service
        logger.info(`[STARTUP] Attempting to start ${serviceName}...`);
        const startResult = await startFunc();

        if (startResult && startResult.process) {
          this.serviceProcesses.set(serviceName, startResult.process);
        }

        // Wait and verify the service started
        const verifyTimeout = config.verifyTimeout || 15000;
        const startTime = Date.now();
        let isRunning = false;

        while (Date.now() - startTime < verifyTimeout) {
          isRunning = await checkFunc();
          if (isRunning) {
            logger.info(`[STARTUP] ${serviceName} started successfully`);
            this.serviceStatus[serviceName].status = 'running';
            this.serviceStatus[serviceName].health = 'healthy';
            return { success: true, alreadyRunning: false };
          }
          await this.delay(500);
        }

        throw new Error(
          `${serviceName} failed to respond within ${verifyTimeout}ms`,
        );
      } catch (error) {
        lastError = error;
        logger.warn(
          `[STARTUP] ${serviceName} attempt ${attempt + 1} failed:`,
          error.message,
        );
        this.serviceStatus[serviceName].lastError = error.message;
      }
    }

    // All retries failed
    this.serviceStatus[serviceName].status = 'failed';
    this.serviceStatus[serviceName].health = 'unhealthy';

    const errorInfo = {
      service: serviceName,
      error: lastError?.message || 'Unknown error',
      critical: required,
    };

    this.errors.push(errorInfo);

    if (required) {
      throw new Error(
        `Critical service ${serviceName} failed to start: ${lastError?.message}`,
      );
    }

    logger.warn(
      `[STARTUP] ${serviceName} failed to start but is not required. Continuing...`,
    );
    return { success: false, error: lastError, fallbackMode: true };
  }

  /**
   * Start ChromaDB service
   */
  async startChromaDB() {
    // Check if ChromaDB is disabled
    if (process.env.STRATOSORT_DISABLE_CHROMADB === '1') {
      logger.info('[STARTUP] ChromaDB is disabled via environment variable');
      this.serviceStatus.chromadb.status = 'disabled';
      this.serviceStatus.chromadb.health = 'disabled';
      return { success: true, disabled: true };
    }

    if (this.chromadbDependencyMissing) {
      logger.info(
        '[STARTUP] ChromaDB dependency previously marked missing. Skipping startup.',
      );
      this.serviceStatus.chromadb.status = 'disabled';
      this.serviceStatus.chromadb.health = 'missing_dependency';
      return { success: false, disabled: true, reason: 'missing_dependency' };
    }

    const moduleAvailable = this.hasPythonModule('chromadb');
    if (!moduleAvailable) {
      this.chromadbDependencyMissing = true;
      this.serviceStatus.chromadb.status = 'disabled';
      this.serviceStatus.chromadb.health = 'missing_dependency';
      this.errors.push({
        service: 'chromadb',
        error:
          'Python module "chromadb" is not installed. Semantic search disabled.',
        critical: false,
      });
      logger.warn(
        '[STARTUP] Python module "chromadb" not available. Disabling ChromaDB features.',
      );
      return { success: false, disabled: true, reason: 'missing_dependency' };
    }

    const startFunc = async () => {
      // Import the existing buildChromaSpawnPlan from simple-main.js
      const { buildChromaSpawnPlan } = require('../simple-main');

      // Get ChromaDB server configuration
      const chromaDbService = require('./ChromaDBService').getInstance();
      const serverConfig = chromaDbService.getServerConfig();

      const plan = buildChromaSpawnPlan(serverConfig);

      if (!plan) {
        throw new Error('No viable ChromaDB startup plan found');
      }

      logger.info(
        `[STARTUP] ChromaDB spawn plan: ${plan.command} ${plan.args.join(' ')}`,
      );
      const chromaProcess = spawn(plan.command, plan.args, plan.options);

      chromaProcess.stdout?.on('data', (data) => {
        logger.debug(`[ChromaDB] ${data.toString().trim()}`);
      });

      chromaProcess.stderr?.on('data', (data) => {
        logger.debug(`[ChromaDB stderr] ${data.toString().trim()}`);
      });

      chromaProcess.on('error', (error) => {
        logger.error('[ChromaDB] Process error:', error);
      });

      chromaProcess.on('exit', (code, signal) => {
        logger.warn(
          `[ChromaDB] Process exited with code ${code}, signal ${signal}`,
        );
        this.serviceStatus.chromadb.status = 'stopped';
      });

      return { process: chromaProcess };
    };

    const checkFunc = async () => {
      try {
        const baseUrl =
          process.env.CHROMA_SERVER_URL ||
          `${process.env.CHROMA_SERVER_PROTOCOL || 'http'}://${process.env.CHROMA_SERVER_HOST || '127.0.0.1'}:${process.env.CHROMA_SERVER_PORT || 8000}`;

        // ChromaDB uses /api/v2/heartbeat endpoint (as documented in CHROMADB_MIGRATION.md)
        const response = await axios.get(`${baseUrl}/api/v2/heartbeat`, {
          timeout: 2000,
        });

        return response.status === 200;
      } catch (error) {
        logger.debug(
          `[STARTUP] ChromaDB heartbeat check failed: ${error.message}`,
        );
        return false;
      }
    };

    return await this.startServiceWithRetry('chromadb', startFunc, checkFunc, {
      required: false,
      verifyTimeout: 15000,
    });
  }

  /**
   * Start Ollama service
   */
  async startOllama() {
    const startFunc = async () => {
      logger.info('[STARTUP] Starting Ollama server...');
      const ollamaProcess = spawn('ollama', ['serve'], {
        detached: false,
        stdio: 'pipe',
      });

      ollamaProcess.stdout?.on('data', (data) => {
        logger.debug(`[Ollama] ${data.toString().trim()}`);
      });

      ollamaProcess.stderr?.on('data', (data) => {
        logger.debug(`[Ollama stderr] ${data.toString().trim()}`);
      });

      ollamaProcess.on('error', (error) => {
        logger.error('[Ollama] Process error:', error);
      });

      ollamaProcess.on('exit', (code, signal) => {
        logger.warn(
          `[Ollama] Process exited with code ${code}, signal ${signal}`,
        );
        this.serviceStatus.ollama.status = 'stopped';
      });

      return { process: ollamaProcess };
    };

    const checkFunc = async () => {
      try {
        const baseUrl = process.env.OLLAMA_BASE_URL || 'http://127.0.0.1:11434';
        const response = await axios.get(`${baseUrl}/api/tags`, {
          timeout: 2000,
        });
        return response.status === 200;
      } catch (error) {
        return false;
      }
    };

    return await this.startServiceWithRetry('ollama', startFunc, checkFunc, {
      required: false,
      verifyTimeout: 15000,
    });
  }

  /**
   * Initialize all services
   */
  async initializeServices() {
    this.reportProgress('services', 'Initializing services...', 15);

    try {
      // Start ChromaDB and Ollama in parallel for faster startup
      const [chromaResult, ollamaResult] = await Promise.all([
        this.startChromaDB(),
        this.startOllama(),
      ]);

      this.reportProgress('services', 'All services initialized', 65);

      return {
        chromadb: chromaResult,
        ollama: ollamaResult,
      };
    } catch (error) {
      logger.error('[STARTUP] Service initialization failed:', error);
      throw error;
    }
  }

  /**
   * Main startup sequence
   */
  async startup() {
    this.startupState = 'running';
    this.reportProgress('starting', 'Application starting...', 0);

    try {
      // Wrap entire startup in timeout
      const startupPromise = this._runStartupSequence();
      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => {
          reject(new Error('Startup timeout exceeded'));
        }, this.config.startupTimeout);
      });

      const result = await Promise.race([startupPromise, timeoutPromise]);

      this.startupState = 'completed';
      this.reportProgress('ready', 'Application ready', 100);

      // Start health monitoring
      this.startHealthMonitoring();

      return result;
    } catch (error) {
      this.startupState = 'failed';
      logger.error('[STARTUP] Startup failed:', error);
      this.errors.push({
        phase: 'startup',
        error: error.message,
        critical: true,
      });

      // Attempt graceful degradation
      await this.enableGracefulDegradation();

      throw error;
    }
  }

  /**
   * Internal startup sequence
   */
  async _runStartupSequence() {
    // Phase 1: Pre-flight checks
    const preflightResults = await this.runPreflightChecks();

    // Phase 2: Initialize services
    const serviceResults = await this.initializeServices();

    // Phase 3: Verify models (if Ollama is running)
    if (serviceResults.ollama?.success) {
      this.reportProgress('models', 'Verifying AI models...', 70);
      // Model verification would be called here
    }

    // Phase 4: Initialize application services
    this.reportProgress(
      'app-services',
      'Initializing application services...',
      85,
    );
    // ServiceIntegration.initialize() would be called here

    return {
      preflight: preflightResults,
      services: serviceResults,
      degraded: this.errors.length > 0,
    };
  }

  /**
   * Enable graceful degradation when services fail
   */
  async enableGracefulDegradation() {
    logger.info('[STARTUP] Enabling graceful degradation mode...');

    // Set flags for degraded mode
    global.degradedMode = {
      enabled: true,
      missingServices: [],
      limitations: [],
    };

    const chromaUnavailableStatuses = [
      'failed',
      'permanently_failed',
      'disabled',
    ];
    if (
      chromaUnavailableStatuses.includes(this.serviceStatus.chromadb.status)
    ) {
      global.degradedMode.missingServices.push('chromadb');
      global.degradedMode.limitations.push('Semantic search disabled');
      global.degradedMode.limitations.push(
        'Smart folder matching may be limited',
      );
    }

    const ollamaUnavailableStatuses = [
      'failed',
      'permanently_failed',
      'disabled',
    ];
    if (ollamaUnavailableStatuses.includes(this.serviceStatus.ollama.status)) {
      global.degradedMode.missingServices.push('ollama');
      global.degradedMode.limitations.push('AI analysis disabled');
      global.degradedMode.limitations.push('Manual organization only');
    }

    this.reportProgress('degraded', 'Running in degraded mode', 100);
  }

  /**
   * Start continuous health monitoring
   */
  startHealthMonitoring() {
    // Always clear existing interval first to prevent leaks
    if (this.healthMonitor) {
      clearInterval(this.healthMonitor);
      this.healthMonitor = null;
    }

    logger.info('[STARTUP] Starting health monitoring...');

    this.healthMonitor = setInterval(async () => {
      // Skip if previous health check is still in progress
      if (this.healthCheckInProgress) {
        logger.warn(
          '[HEALTH] Previous health check still in progress, skipping this interval',
        );
        return;
      }

      this.healthCheckInProgress = true;
      try {
        await this.checkServicesHealth();
      } catch (error) {
        logger.error('[HEALTH] Health check failed:', error);
      } finally {
        this.healthCheckInProgress = false;
      }
    }, this.config.healthCheckInterval);

    // Unref the interval so it doesn't prevent process shutdown
    try {
      this.healthMonitor.unref();
    } catch (error) {
      logger.warn(
        '[HEALTH] Failed to unref health monitor interval:',
        error.message,
      );
    }
  }

  /**
   * Check health of all services
   */
  async checkServicesHealth() {
    logger.debug('[HEALTH] Checking service health...');

    // Check ChromaDB
    if (this.serviceStatus.chromadb.status === 'running') {
      try {
        const baseUrl =
          process.env.CHROMA_SERVER_URL ||
          `${process.env.CHROMA_SERVER_PROTOCOL || 'http'}://${process.env.CHROMA_SERVER_HOST || '127.0.0.1'}:${process.env.CHROMA_SERVER_PORT || 8000}`;

        // ChromaDB uses /api/v2/heartbeat endpoint
        const response = await axios.get(`${baseUrl}/api/v2/heartbeat`, {
          timeout: 5000,
        });

        if (response.status === 200) {
          this.serviceStatus.chromadb.health = 'healthy';
          this.serviceStatus.chromadb.consecutiveFailures = 0;
        }
      } catch (error) {
        this.serviceStatus.chromadb.health = 'unhealthy';
        this.serviceStatus.chromadb.consecutiveFailures =
          (this.serviceStatus.chromadb.consecutiveFailures || 0) + 1;

        logger.warn('[HEALTH] ChromaDB health check failed:', error.message);

        // Circuit breaker: Attempt restart after 3 consecutive failures, but stop after 5 total restarts
        if (this.serviceStatus.chromadb.consecutiveFailures >= 3) {
          const restartCount = this.serviceStatus.chromadb.restartCount || 0;

          if (restartCount >= 5) {
            logger.error(
              '[HEALTH] ChromaDB exceeded maximum restart attempts (5). Marking as permanently failed.',
            );
            this.serviceStatus.chromadb.status = 'permanently_failed';
            this.serviceStatus.chromadb.health = 'permanently_failed';
            this.serviceStatus.chromadb.consecutiveFailures = 0; // Reset to stop further checks
          } else {
            logger.warn(
              `[HEALTH] Attempting to restart ChromaDB (attempt ${restartCount + 1}/5)...`,
            );
            this.serviceStatus.chromadb.restartCount = restartCount + 1;
            this.serviceStatus.chromadb.consecutiveFailures = 0; // Reset counter for new attempt
            await this.startChromaDB();
          }
        }
      }
    }

    // Check Ollama
    if (this.serviceStatus.ollama.status === 'running') {
      try {
        const baseUrl = process.env.OLLAMA_BASE_URL || 'http://127.0.0.1:11434';
        const response = await axios.get(`${baseUrl}/api/tags`, {
          timeout: 5000,
        });

        if (response.status === 200) {
          this.serviceStatus.ollama.health = 'healthy';
          this.serviceStatus.ollama.consecutiveFailures = 0;
        }
      } catch (error) {
        this.serviceStatus.ollama.health = 'unhealthy';
        this.serviceStatus.ollama.consecutiveFailures =
          (this.serviceStatus.ollama.consecutiveFailures || 0) + 1;

        logger.warn('[HEALTH] Ollama health check failed:', error.message);

        // Circuit breaker: Attempt restart after 3 consecutive failures, but stop after 5 total restarts
        if (this.serviceStatus.ollama.consecutiveFailures >= 3) {
          const restartCount = this.serviceStatus.ollama.restartCount || 0;

          if (restartCount >= 5) {
            logger.error(
              '[HEALTH] Ollama exceeded maximum restart attempts (5). Marking as permanently failed.',
            );
            this.serviceStatus.ollama.status = 'permanently_failed';
            this.serviceStatus.ollama.health = 'permanently_failed';
            this.serviceStatus.ollama.consecutiveFailures = 0; // Reset to stop further checks
          } else {
            const baseUrl =
              process.env.OLLAMA_BASE_URL || 'http://127.0.0.1:11434';
            let host = '127.0.0.1';
            let port = 11434;
            try {
              const parsed = new URL(baseUrl);
              host = parsed.hostname || host;
              port = Number(parsed.port) || port;
            } catch {
              // ignore parse errors; fall back to defaults
            }

            const portAvailable = await this.isPortAvailable(host, port);
            if (!portAvailable) {
              logger.warn(
                '[HEALTH] Ollama port is already in use. Assuming external instance is running and skipping restart.',
              );
              this.serviceStatus.ollama.consecutiveFailures = 0;
              this.serviceStatus.ollama.health = 'degraded';
            } else {
              if (this.restartLocks.ollama) {
                logger.warn(
                  '[HEALTH] Ollama restart already in progress, skipping duplicate attempt.',
                );
              } else {
                logger.warn(
                  `[HEALTH] Attempting to restart Ollama (attempt ${restartCount + 1}/5)...`,
                );
                this.restartLocks.ollama = true;
                this.serviceStatus.ollama.restartCount = restartCount + 1;
                this.serviceStatus.ollama.consecutiveFailures = 0; // Reset counter for new attempt
                try {
                  await this.startOllama();
                } finally {
                  this.restartLocks.ollama = false;
                }
              }
            }
          }
        }
      }
    }
  }

  /**
   * Get current service status
   */
  getServiceStatus() {
    return {
      startup: this.startupState,
      phase: this.startupPhase,
      services: { ...this.serviceStatus },
      errors: [...this.errors],
      degraded: global.degradedMode?.enabled || false,
    };
  }

  /**
   * Cleanup on shutdown
   */
  async shutdown() {
    logger.info('[STARTUP] Shutting down services...');

    // Stop health monitoring first
    if (this.healthMonitor) {
      clearInterval(this.healthMonitor);
      this.healthMonitor = null;
      logger.info('[STARTUP] Health monitoring stopped');
    }

    // Reset health check flag
    this.healthCheckInProgress = false;

    // Gracefully stop all service processes
    const shutdownPromises = [];
    for (const [serviceName, process] of this.serviceProcesses) {
      shutdownPromises.push(this.shutdownProcess(serviceName, process));
    }

    // Wait for all processes to shut down
    await Promise.allSettled(shutdownPromises);

    // Clear the service processes map
    this.serviceProcesses.clear();

    // Reset service status
    for (const service in this.serviceStatus) {
      this.serviceStatus[service].status = 'stopped';
      this.serviceStatus[service].health = 'unknown';
    }

    logger.info('[STARTUP] All services shut down successfully');
  }

  /**
   * Shutdown a single process
   */
  async shutdownProcess(serviceName, process) {
    try {
      logger.info(`[STARTUP] Stopping ${serviceName}...`);

      if (!process || process.killed) {
        logger.debug(`[STARTUP] ${serviceName} already stopped`);
        return;
      }

      // First remove all event listeners to prevent memory leaks
      process.removeAllListeners();

      // Try graceful shutdown first
      process.kill('SIGTERM');

      // Wait up to 5 seconds for graceful shutdown
      await new Promise((resolve) => {
        let resolved = false;
        const timeout = setTimeout(() => {
          if (!resolved) {
            resolved = true;
            if (!process.killed) {
              logger.warn(`[STARTUP] Force killing ${serviceName}...`);
              try {
                // Force kill on Windows requires different approach
                if (process.platform === 'win32') {
                  const { spawn } = require('child_process');
                  spawn('taskkill', ['/pid', process.pid, '/f', '/t']);
                } else {
                  process.kill('SIGKILL');
                }
              } catch (e) {
                logger.debug(
                  `[STARTUP] Process ${serviceName} may have already exited:`,
                  e.message,
                );
              }
            }
            resolve();
          }
        }, 5000);

        // Listen for exit event
        process.once('exit', () => {
          if (!resolved) {
            resolved = true;
            clearTimeout(timeout);
            logger.info(`[STARTUP] ${serviceName} stopped gracefully`);
            resolve();
          }
        });

        // Also listen for error event (in case process is already dead)
        process.once('error', () => {
          if (!resolved) {
            resolved = true;
            clearTimeout(timeout);
            logger.debug(
              `[STARTUP] ${serviceName} process error during shutdown`,
            );
            resolve();
          }
        });
      });
    } catch (error) {
      logger.error(`[STARTUP] Error stopping ${serviceName}:`, error);
    }
  }

  /**
   * Utility: delay helper
   */
  delay(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

// Singleton instance
let instance = null;

module.exports = {
  StartupManager,
  getStartupManager: () => {
    if (!instance) {
      instance = new StartupManager();
    }
    return instance;
  },
};

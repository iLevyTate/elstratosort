/**
 * Unified Logging System for StratoSort
 * Provides structured logging across main and renderer processes using Pino
 */

const pino = require('pino');
const { getCorrelationId } = require('./correlationId');

// Legacy level mapping for compatibility
const LOG_LEVELS = {
  ERROR: 'error',
  WARN: 'warn',
  INFO: 'info',
  DEBUG: 'debug',
  TRACE: 'trace'
};

const LOG_LEVEL_NAMES = ['ERROR', 'WARN', 'INFO', 'DEBUG', 'TRACE'];

// pino.transport() is only available in the Node.js build (main process).
// The preload (target: 'web') and renderer use pino/browser.js which lacks it.
const _hasPinoTransport = typeof pino.transport === 'function';

// FIX: Share a single pino-pretty transport across all Logger instances.
// Previously, every createLogger() call spawned a new pino transport worker,
// each registering its own process.on('exit') handler. With 100+ loggers in
// the main process, this caused MaxListenersExceededWarning at startup.
let _sharedDevTransport = null;
function _getSharedDevTransport() {
  if (!_sharedDevTransport && _hasPinoTransport) {
    _sharedDevTransport = pino.transport({
      target: 'pino-pretty',
      options: { colorize: true }
    });
  }
  return _sharedDevTransport;
}

/**
 * Best-effort redaction for production logs.
 * We keep this lightweight and dependency-free since it runs in both main/renderer.
 * @param {string|object} data
 * @returns {string|object}
 */
function sanitizeLogData(data) {
  // Strings: redact common absolute path patterns
  if (typeof data === 'string') {
    let sanitized = data.replace(
      /[A-Za-z]:\\(?:[^\\/:*?"<>|\r\n]+\\)*([^\\/:*?"<>|\r\n]+)/g,
      (_match, filename) => `[REDACTED_PATH]\\${filename}`
    );
    sanitized = sanitized.replace(
      /\/(?:[^/\s]+\/)+([^/\s]+)/g,
      (_match, filename) => `[REDACTED_PATH]/${filename}`
    );
    return sanitized;
  }

  if (typeof data === 'object' && data !== null) {
    // FIX: Error objects have non-enumerable properties — convert to plain object
    // so message, stack, and code are preserved in log output
    if (data instanceof Error) {
      return sanitizeLogData({
        name: data.name,
        message: data.message,
        stack: data.stack,
        ...(data.code ? { code: data.code } : {})
      });
    }
    const sanitized = Array.isArray(data) ? [] : {};
    for (const [key, value] of Object.entries(data)) {
      // Special handling for common path-ish keys
      if (
        (key === 'path' || key === 'filePath' || key === 'source' || key === 'destination') &&
        typeof value === 'string'
      ) {
        // Keep only trailing segment (works for both Win/Unix)
        const parts = value.split(/[/\\]/);
        sanitized[key] = parts[parts.length - 1] || value;
      } else if (key === 'stack' && typeof value === 'string') {
        sanitized[key] = sanitizeLogData(value);
      } else if (typeof value === 'object' && value !== null) {
        sanitized[key] = sanitizeLogData(value);
      } else if (typeof value === 'string') {
        sanitized[key] = sanitizeLogData(value);
      } else {
        sanitized[key] = value;
      }
    }
    return sanitized;
  }

  return data;
}

class Logger {
  constructor(context = '', options = {}) {
    this.context = context;
    this.enableFile = false;
    this.logFile = null;
    this.level = process.env.NODE_ENV === 'development' ? 'debug' : 'info';

    // Initialize Pino instance
    this._initPino(options);
  }

  _initPino(options = {}) {
    const isDev = process.env.NODE_ENV === 'development';
    // Detect non-main contexts: renderer (process.type === 'renderer'),
    // preload (no process.type but window exists), or browser pino build.
    const isRenderer =
      (typeof process !== 'undefined' && process.type === 'renderer') || !_hasPinoTransport;

    const pinoOptions = {
      level: this.level,
      base: {
        pid: typeof process !== 'undefined' ? process.pid : undefined,
        context: this.context
      },
      timestamp: pino.stdTimeFunctions.isoTime,
      formatters: {
        level: (label) => ({ level: label })
      },
      mixin: () => {
        const correlationId = getCorrelationId();
        return correlationId ? { correlationId } : {};
      },
      // Use built-in redaction for simple keys, but we rely on sanitizeLogData for complex logic
      redact: {
        paths: ['*.password', '*.token', '*.secret', '*.key'],
        remove: true
      },
      ...options
    };

    if (isRenderer) {
      // Browser/Renderer configuration
      this.pino = pino({
        ...pinoOptions,
        browser: {
          asObject: true,
          transmit: {
            level: this.level,
            send: (level, logEvent) => {
              if (typeof window !== 'undefined' && window.electronAPI?.system?.log) {
                // Ensure messages property is serialized correctly
                const messages = logEvent.messages || [];
                const message = messages[0] || '';
                const data = messages[1] || {};

                // Use non-blocking fire-and-forget for logs
                window.electronAPI.system.log(level, message, data).catch(() => {
                  // Silently fail if log transmission fails to avoid loops
                });
              }
            }
          }
        }
      });
    } else {
      // Main process configuration
      let transport;

      if (this.logFile && this.enableFile && _hasPinoTransport) {
        // Multi-stream: Console + File
        const targets = [
          {
            target: 'pino/file',
            options: { destination: this.logFile, mkdir: true }
          }
        ];

        // Add pretty print for console in dev
        if (isDev && this.enableConsole !== false) {
          targets.push({
            target: 'pino-pretty',
            options: { colorize: true }
          });
        } else if (this.enableConsole !== false) {
          // Basic console in prod (if enabled)
          targets.push({
            target: 'pino/file', // stdout (descriptor 1)
            options: { destination: 1 }
          });
        }

        transport = pino.transport({ targets });
      } else {
        // Console only — reuse module-level shared transport in dev
        if (isDev) {
          transport = _getSharedDevTransport();
        }
      }

      // FIX: Use the shared transport for the common dev-console-only case
      // to avoid spawning a separate pino worker per logger instance.
      // Only custom transports (e.g. file logging) get their own stream.
      this.pino = pino(pinoOptions, transport || undefined);
    }
  }

  setLevel(level) {
    // Map legacy numeric/string levels to Pino strings
    const allowed = ['error', 'warn', 'info', 'debug', 'trace'];
    if (typeof level === 'number') {
      this.level = allowed[level] || 'info';
    } else if (typeof level === 'string') {
      const normalized = level.toLowerCase();
      this.level = allowed.includes(normalized) ? normalized : 'info';
    } else {
      this.level = 'info';
    }
    if (this.pino) {
      this.pino.level = this.level;
    }
  }

  setContext(context) {
    this.context = context;
    // Re-bind pino child with new context
    this.pino = this.pino.child({ context });
  }

  enableFileLogging(logFile, _options = {}) {
    this.enableFile = true;
    this.logFile = logFile;
    // Re-initialize to add file transport
    this._initPino();
  }

  disableConsoleLogging() {
    this.enableConsole = false;
    this._initPino();
  }

  // API Compatibility methods
  log(level, message, data) {
    // Legacy generic log method
    const lvl = typeof level === 'number' ? LOG_LEVEL_NAMES[level]?.toLowerCase() : level;
    if (this[lvl]) {
      this[lvl](message, data);
    } else {
      this.info(message, data);
    }
  }

  // Core logging methods
  error(message, data) {
    const sanitized = data ? sanitizeLogData(data) : undefined;
    if (sanitized) this.pino.error(sanitized, message);
    else this.pino.error(message);
  }

  warn(message, data) {
    const sanitized = data ? sanitizeLogData(data) : undefined;
    if (sanitized) this.pino.warn(sanitized, message);
    else this.pino.warn(message);
  }

  info(message, data) {
    const sanitized = data ? sanitizeLogData(data) : undefined;
    if (sanitized) this.pino.info(sanitized, message);
    else this.pino.info(message);
  }

  debug(message, data) {
    const sanitized = data ? sanitizeLogData(data) : undefined;
    if (sanitized) this.pino.debug(sanitized, message);
    else this.pino.debug(message);
  }

  trace(message, data) {
    const sanitized = data ? sanitizeLogData(data) : undefined;
    if (sanitized) this.pino.trace(sanitized, message);
    else this.pino.trace(message);
  }

  // Convenience methods
  fileOperation(operation, filePath, result = 'success') {
    this.info(`File ${operation}`, { filePath, result });
  }

  aiAnalysis(filePath, model, duration, confidence) {
    this.info('AI Analysis completed', {
      filePath,
      model,
      duration: `${duration}ms`,
      confidence: `${confidence}%`
    });
  }

  phaseTransition(fromPhase, toPhase, data = {}) {
    this.info(`Phase transition: ${fromPhase} → ${toPhase}`, data);
  }

  performance(operation, duration, metadata = {}) {
    this.debug(`Performance: ${operation}`, {
      duration: `${duration}ms`,
      ...metadata
    });
  }

  terminal(level, message, data = {}) {
    // Force write to stdout/file by bypassing level check if possible?
    // Pino respects configured level. We'll just log at 'info' or 'error'.
    // And assume transport handles stdout.
    const lvl = (typeof level === 'string' ? level : 'info').toLowerCase();
    const sanitized = data ? sanitizeLogData(data) : undefined;
    if (this.pino[lvl]) {
      if (sanitized) this.pino[lvl](sanitized, message);
      else this.pino[lvl](message);
    }
  }

  terminalRaw(text) {
    // Direct write for raw output (legacy support)
    // Pino doesn't support raw text bypass easily.
    // We'll log as info message.
    this.info(text);
  }
}

// Create singleton instance
const logger = new Logger();

// Factory functions
function createLogger(context) {
  const contextLogger = new Logger(context);
  // Inherit settings from singleton
  contextLogger.level = logger.level;
  contextLogger.enableFile = logger.enableFile;
  contextLogger.logFile = logger.logFile;
  contextLogger.enableConsole = logger.enableConsole;
  contextLogger._initPino(); // Re-init with inherited settings
  return contextLogger;
}

function getLogger(context) {
  return createLogger(context);
}

module.exports = {
  Logger,
  logger,
  LOG_LEVELS,
  LOG_LEVEL_NAMES,
  createLogger,
  getLogger,
  sanitizeLogData
};

/**
 * Unified Logging System for StratoSort
 * Provides structured logging across main and renderer processes
 */

const LOG_LEVELS = {
  ERROR: 0,
  WARN: 1,
  INFO: 2,
  DEBUG: 3,
  TRACE: 4
};

const LOG_LEVEL_NAMES = ['ERROR', 'WARN', 'INFO', 'DEBUG', 'TRACE'];

/**
 * Best-effort redaction for production logs.
 * We keep this lightweight and dependency-free since it runs in both main/renderer.
 * @param {string|object} data
 * @returns {string|object}
 */
function sanitizeLogData(data) {
  // Skip sanitization in development mode
  if (typeof process !== 'undefined' && process.env?.NODE_ENV === 'development') {
    return data;
  }

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
  constructor() {
    this.level = LOG_LEVELS.INFO; // Default log level
    this.enableConsole = true;
    this.enableFile = false;
    this.logFile = null;
    this.context = '';
    this.fileFormat = 'jsonl'; // 'jsonl' | 'text'
    this._fileWriteFailed = false;
  }

  setLevel(level) {
    if (typeof level === 'string') {
      this.level = LOG_LEVELS[level.toUpperCase()] ?? LOG_LEVELS.INFO;
    } else {
      this.level = level;
    }
  }

  setContext(context) {
    this.context = context;
  }

  enableFileLogging(logFile, options = {}) {
    this.enableFile = true;
    this.logFile = logFile;
    this.fileFormat = options.format === 'text' ? 'text' : 'jsonl';
    this._fileWriteFailed = false;
  }

  disableConsoleLogging() {
    this.enableConsole = false;
  }

  /**
   * Normalize a level to the numeric LOG_LEVELS form.
   * Accepts numbers or common strings ("error", "warn", "critical", etc).
   * @private
   */
  normalizeLevel(level) {
    if (typeof level === 'number') return level;
    if (typeof level !== 'string') return LOG_LEVELS.INFO;

    const key = level.toUpperCase();
    if (key === 'CRITICAL') return LOG_LEVELS.ERROR;
    if (key === 'WARNING') return LOG_LEVELS.WARN;
    return LOG_LEVELS[key] ?? LOG_LEVELS.INFO;
  }

  /**
   * Safe JSON stringifier that handles circular references
   * @private
   */
  safeStringify(obj) {
    const seen = new WeakSet();
    return JSON.stringify(
      obj,
      (key, value) => {
        // Fixed: Handle circular references
        if (typeof value === 'object' && value !== null) {
          if (seen.has(value)) {
            return '[Circular Reference]';
          }
          seen.add(value);
        }

        // Fixed: Handle Error objects
        if (value instanceof Error) {
          return {
            name: value.name,
            message: value.message,
            stack: value.stack
          };
        }

        // Fixed: Handle functions (convert to string)
        if (typeof value === 'function') {
          return `[Function: ${value.name || 'anonymous'}]`;
        }

        return value;
      },
      2
    );
  }

  formatMessage(level, message, data) {
    const timestamp = new Date().toISOString();
    const levelName = LOG_LEVEL_NAMES[level] || 'UNKNOWN';
    const contextStr = this.context ? ` [${this.context}]` : '';

    let formattedMessage = `${timestamp} ${levelName}${contextStr}: ${message}`;

    if (data && Object.keys(data).length > 0) {
      try {
        // Fixed: Use safe stringify to handle circular references
        formattedMessage += `\n  Data: ${this.safeStringify(data)}`;
      } catch (error) {
        formattedMessage += `\n  Data: [Error stringifying data: ${error.message}]`;
      }
    }

    return formattedMessage;
  }

  buildLogEntry(level, message, data) {
    const timestamp = new Date().toISOString();
    const levelName = LOG_LEVEL_NAMES[level] || 'UNKNOWN';

    const safeData = sanitizeLogData(data);
    const safeMessage = sanitizeLogData(message);

    return {
      timestamp,
      level: levelName,
      context: this.context || undefined,
      message: safeMessage,
      data: safeData && Object.keys(safeData).length > 0 ? safeData : undefined,
      pid: typeof process !== 'undefined' ? process.pid : undefined,
      processType: typeof process !== 'undefined' ? process.type || 'node' : undefined
    };
  }

  shouldWriteSync(level) {
    // Sync write on higher-severity logs to maximize chance it lands on disk before exit/crash.
    return level <= LOG_LEVELS.WARN;
  }

  writeToFile(level, entryOrText) {
    if (!this.enableFile || !this.logFile) return;
    if (this._fileWriteFailed) return;

    try {
      const fsSync = require('fs');
      const line =
        this.fileFormat === 'text'
          ? `${String(entryOrText)}\n`
          : `${JSON.stringify(entryOrText)}\n`;

      if (this.shouldWriteSync(level)) {
        fsSync.appendFileSync(this.logFile, line);
      } else {
        // Best-effort async for low-severity logs to reduce impact
        fsSync.promises.appendFile(this.logFile, line).catch(() => {
          this._fileWriteFailed = true;
        });
      }
    } catch (error) {
      // Avoid recursive logging loops; disable file logging after first failure.
      this._fileWriteFailed = true;
      // In dev, this is helpful; in prod we keep it silent.
      if (typeof process !== 'undefined' && process.env?.NODE_ENV === 'development') {
        try {
          // eslint-disable-next-line no-console
          console.error('Failed to write to log file:', error?.message || error);
        } catch {
          // ignore
        }
      }
    }
  }

  log(level, message, data = {}) {
    const normalizedLevel = this.normalizeLevel(level);
    if (normalizedLevel > this.level) return;

    const sanitizedData = sanitizeLogData(data);
    const sanitizedMessage = sanitizeLogData(message);

    const formattedMessage = this.formatMessage(normalizedLevel, sanitizedMessage, sanitizedData);

    if (this.enableConsole) {
      try {
        const consoleMethod = this.getConsoleMethod(normalizedLevel);
        consoleMethod(formattedMessage);
      } catch (error) {
        // Handle EPIPE errors gracefully (broken console pipe)
        // This can happen when stdout/stderr pipe is closed
        if (error.code !== 'EPIPE') {
          // Re-throw non-EPIPE errors, but disable console to prevent loops
          this.enableConsole = false;
          throw error;
        }
        // Silently ignore EPIPE - console is gone, continue with file logging
        this.enableConsole = false;
      }
    }

    if (this.enableFile) {
      const entry =
        this.fileFormat === 'text'
          ? formattedMessage
          : this.buildLogEntry(normalizedLevel, sanitizedMessage, sanitizedData);
      this.writeToFile(normalizedLevel, entry);
    }
  }

  getConsoleMethod(level) {
    switch (level) {
      case LOG_LEVELS.ERROR:
        return console.error;
      case LOG_LEVELS.WARN:
        return console.warn;
      case LOG_LEVELS.INFO:
        return console.info;
      case LOG_LEVELS.DEBUG:
      case LOG_LEVELS.TRACE:
        return console.debug;
      default:
        return console.log;
    }
  }

  error(message, data) {
    this.log(LOG_LEVELS.ERROR, message, data);
  }

  warn(message, data) {
    this.log(LOG_LEVELS.WARN, message, data);
  }

  info(message, data) {
    this.log(LOG_LEVELS.INFO, message, data);
  }

  debug(message, data) {
    this.log(LOG_LEVELS.DEBUG, message, data);
  }

  trace(message, data) {
    this.log(LOG_LEVELS.TRACE, message, data);
  }

  // Convenience methods for common logging patterns
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
}

// Create singleton instance
const logger = new Logger();

// Set log level based on environment
if (typeof process !== 'undefined' && process.env.NODE_ENV === 'development') {
  logger.setLevel(LOG_LEVELS.DEBUG);
} else {
  logger.setLevel(LOG_LEVELS.INFO);
}

/**
 * DUP-5: Logger factory function to reduce boilerplate
 * Creates a logger instance with context already set
 *
 * Instead of:
 *   const { logger } = require('../../shared/logger');
 *   logger.setContext('ServiceName');
 *
 * Use:
 *   const { createLogger } = require('../../shared/logger');
 *   const logger = createLogger('ServiceName');
 *
 * @param {string} context - The context name for this logger
 * @returns {Logger} Logger instance with context set
 */
function createLogger(context) {
  // Create a new logger instance for this context
  // This allows different modules to have independent log levels if needed
  const contextLogger = new Logger();
  // Inherit configuration from singleton so context loggers behave consistently
  contextLogger.setLevel(logger.level);
  contextLogger.enableConsole = logger.enableConsole;
  contextLogger.enableFile = logger.enableFile;
  contextLogger.logFile = logger.logFile;
  contextLogger.fileFormat = logger.fileFormat;
  contextLogger.setContext(context);
  return contextLogger;
}

/**
 * Get the singleton logger with context already set
 * Use this when you want all modules to share the same logger instance
 *
 * @param {string} context - The context name for this logger
 * @returns {Logger} The singleton logger with context set
 */
function getLogger(context) {
  logger.setContext(context);
  return logger;
}

// Export both the class and singleton
module.exports = {
  Logger,
  logger,
  LOG_LEVELS,
  LOG_LEVEL_NAMES,
  // DUP-5: Factory functions
  createLogger,
  getLogger
};

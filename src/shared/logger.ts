/**
 * Unified Logging System for StratoSort
 * Uses electron-log for cross-process logging with file rotation
 */
import log from 'electron-log';
import type { LogContext } from './types/ipc';

// Configure electron-log
// File transport is only available in main process
if (log.transports.file) {
  log.transports.file.maxSize = 10 * 1024 * 1024; // 10MB file rotation
  log.transports.file.format = '[{y}-{m}-{d} {h}:{i}:{s}.{ms}] [{level}] {text}';
}

if (log.transports.console) {
  log.transports.console.format = '[{h}:{i}:{s}] [{level}] {text}';
}

// In development, show debug logs
if (process.env.NODE_ENV === 'development') {
  if (log.transports.console) {
    log.transports.console.level = 'debug';
  }
  if (log.transports.file) {
    log.transports.file.level = 'debug';
  }
} else {
  if (log.transports.console) {
    log.transports.console.level = 'info';
  }
  if (log.transports.file) {
    log.transports.file.level = 'info';
  }
}

export const LOG_LEVELS = {
  ERROR: 0,
  WARN: 1,
  INFO: 2,
  DEBUG: 3,
  TRACE: 4,
} as const;

export const LOG_LEVEL_NAMES = ['ERROR', 'WARN', 'INFO', 'DEBUG', 'TRACE'] as const;

/**
 * Logger class that wraps electron-log
 * Maintains backward compatibility with existing code
 */
export class Logger {
  private level: number;
  private enableConsole: boolean;
  private enableFile: boolean;
  private logFile: string | null;
  private context: string;

  constructor() {
    this.level = LOG_LEVELS.INFO;
    this.enableConsole = true;
    this.enableFile = true; // Enabled by default now with electron-log
    this.logFile = null;
    this.context = '';
  }

  setLevel(level: string | number): void {
    if (typeof level === 'string') {
      this.level = LOG_LEVELS[level.toUpperCase() as keyof typeof LOG_LEVELS] ?? LOG_LEVELS.INFO;
    } else {
      this.level = level;
    }

    // Map to electron-log levels
    const levelMap: Record<number, 'error' | 'warn' | 'info' | 'debug' | 'silly'> = {
      [LOG_LEVELS.ERROR]: 'error',
      [LOG_LEVELS.WARN]: 'warn',
      [LOG_LEVELS.INFO]: 'info',
      [LOG_LEVELS.DEBUG]: 'debug',
      [LOG_LEVELS.TRACE]: 'silly',
    };
    const electronLevel = levelMap[this.level] || 'info';
    if (log.transports.console) {
      log.transports.console.level = electronLevel;
    }
    if (log.transports.file) {
      log.transports.file.level = electronLevel;
    }
  }

  setContext(context: string): void {
    this.context = context;
  }

  enableFileLogging(logFile: string): void {
    this.enableFile = true;
    this.logFile = logFile;
    // electron-log handles file path automatically
  }

  disableConsoleLogging(): void {
    this.enableConsole = false;
    log.transports.console.level = false;
  }

  /**
   * Safe JSON stringifier that handles circular references
   */
  private safeStringify(obj: unknown): string {
    const seen = new WeakSet();
    return JSON.stringify(
      obj,
      (key, value) => {
        if (typeof value === 'object' && value !== null) {
          if (seen.has(value)) {
            return '[Circular Reference]';
          }
          seen.add(value);
        }

        if (value instanceof Error) {
          return {
            name: value.name,
            message: value.message,
            stack: value.stack,
          };
        }

        if (typeof value === 'function') {
          return `[Function: ${value.name || 'anonymous'}]`;
        }

        return value;
      },
      2,
    );
  }

  private formatData(data?: unknown): string {
    if (!data) return '';
    if (typeof data === 'object' && Object.keys(data as object).length === 0) return '';

    try {
      return ` | ${this.safeStringify(data)}`;
    } catch (error) {
      return ` | [Error stringifying data: ${(error as Error).message}]`;
    }
  }

  private formatMessage(message: string, data?: unknown): string {
    const contextStr = this.context ? `[${this.context}] ` : '';
    return `${contextStr}${message}${this.formatData(data)}`;
  }

  log(level: number, message: string, data: unknown = {}): void {
    if (level > this.level) return;

    const formattedMessage = this.formatMessage(message, data);

    switch (level) {
      case LOG_LEVELS.ERROR:
        log.error(formattedMessage);
        break;
      case LOG_LEVELS.WARN:
        log.warn(formattedMessage);
        break;
      case LOG_LEVELS.INFO:
        log.info(formattedMessage);
        break;
      case LOG_LEVELS.DEBUG:
        log.debug(formattedMessage);
        break;
      case LOG_LEVELS.TRACE:
        log.silly(formattedMessage);
        break;
      default:
        log.info(formattedMessage);
    }
  }

  error(message: string, data?: unknown): void {
    this.log(LOG_LEVELS.ERROR, message, data);
  }

  warn(message: string, data?: unknown): void {
    this.log(LOG_LEVELS.WARN, message, data);
  }

  info(message: string, data?: unknown): void {
    this.log(LOG_LEVELS.INFO, message, data);
  }

  debug(message: string, data?: unknown): void {
    this.log(LOG_LEVELS.DEBUG, message, data);
  }

  trace(message: string, data?: unknown): void {
    this.log(LOG_LEVELS.TRACE, message, data);
  }

  // Convenience methods for common logging patterns
  fileOperation(operation: string, filePath: string, result = 'success'): void {
    this.info(`File ${operation}`, { filePath, result });
  }

  aiAnalysis(filePath: string, model: string, duration: number, confidence: number): void {
    this.info('AI Analysis completed', {
      filePath,
      model,
      duration: `${duration}ms`,
      confidence: `${confidence}%`,
    });
  }

  phaseTransition(fromPhase: string, toPhase: string, data: unknown = {}): void {
    this.info(`Phase transition: ${fromPhase} → ${toPhase}`, data);
  }

  performance(operation: string, duration: number, metadata: Record<string, unknown> = {}): void {
    this.debug(`Performance: ${operation}`, {
      duration: `${duration}ms`,
      ...metadata,
    });
  }

  /**
   * Log with correlation ID for request tracing
   */
  withCorrelation(correlationId: string, level: 'info' | 'warn' | 'error' | 'debug', message: string, data?: unknown): void {
    const context: LogContext = {
      correlationId,
      component: this.context,
      ...((data && typeof data === 'object') ? data : { data }),
    };
    this[level](`[${correlationId}] ${message}`, context);
  }
}

// Create singleton instance
export const logger = new Logger();

// Set log level based on environment
if (typeof process !== 'undefined' && process.env.NODE_ENV === 'development') {
  logger.setLevel(LOG_LEVELS.DEBUG);
} else {
  logger.setLevel(LOG_LEVELS.INFO);
}

// Also export the raw electron-log for advanced usage
export { log as electronLog };

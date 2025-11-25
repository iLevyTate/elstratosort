const { contextBridge, ipcRenderer } = require('electron');
const { Logger, LOG_LEVELS } = require('../shared/logger');
const { nanoid } = require('nanoid');

const preloadLogger = new Logger();
preloadLogger.setContext('Preload');
preloadLogger.setLevel(
  process?.env?.NODE_ENV === 'development' ? LOG_LEVELS.DEBUG : LOG_LEVELS.INFO,
);

const log = {
  info: (message: string, data?: unknown) => preloadLogger.info(message, data),
  warn: (message: string, data?: unknown) => preloadLogger.warn(message, data),
  error: (message: string, error?: unknown) => {
    let errorPayload = error;
    if (error instanceof Error) {
      errorPayload = {
        name: error.name,
        message: error.message,
        stack: error.stack,
      };
    } else if (typeof error === 'string') {
      errorPayload = { detail: error };
    }
    preloadLogger.error(message, errorPayload);
  },
};

log.info('Secure preload script loaded');

// Hardcoded IPC_CHANNELS to avoid requiring Node.js path module in sandboxed environment
// This is copied from src/shared/constants.js and must be kept in sync
const IPC_CHANNELS = {
  // File Operations
  FILES: {
    SELECT: 'handle-file-selection',
    SELECT_DIRECTORY: 'select-directory',
    GET_DOCUMENTS_PATH: 'get-documents-path',
    CREATE_FOLDER_DIRECT: 'create-folder-direct',
    GET_FILE_STATS: 'get-file-stats',
    GET_FILES_IN_DIRECTORY: 'get-files-in-directory',
    DELETE_FOLDER: 'delete-folder',
    DELETE_FILE: 'delete-file',
    OPEN_FILE: 'open-file',
    REVEAL_FILE: 'reveal-file',
    COPY_FILE: 'copy-file',
    OPEN_FOLDER: 'open-folder',
    PERFORM_OPERATION: 'perform-file-operation',
  },

  // Smart Folders
  SMART_FOLDERS: {
    GET: 'get-smart-folders',
    GET_CUSTOM: 'get-custom-folders',
    SAVE: 'save-smart-folders',
    UPDATE_CUSTOM: 'update-custom-folders',
    SCAN_STRUCTURE: 'scan-folder-structure',
    ADD: 'add-smart-folder',
    EDIT: 'edit-smart-folder',
    DELETE: 'delete-smart-folder',
    MATCH: 'match-smart-folder',
  },

  // Analysis
  ANALYSIS: {
    ANALYZE_DOCUMENT: 'analyze-document',
    ANALYZE_IMAGE: 'analyze-image',
    EXTRACT_IMAGE_TEXT: 'extract-text-from-image',
    START_BATCH: 'analysis-start-batch',
    CANCEL_BATCH: 'analysis-cancel-batch',
  },

  // Organization Suggestions
  SUGGESTIONS: {
    GET_FILE_SUGGESTIONS: 'get-file-suggestions',
    GET_BATCH_SUGGESTIONS: 'get-batch-suggestions',
    RECORD_FEEDBACK: 'record-suggestion-feedback',
    GET_STRATEGIES: 'get-organization-strategies',
    APPLY_STRATEGY: 'apply-organization-strategy',
    GET_USER_PATTERNS: 'get-user-patterns',
    CLEAR_PATTERNS: 'clear-user-patterns',
    ANALYZE_FOLDER_STRUCTURE: 'analyze-folder-structure',
    SUGGEST_NEW_FOLDER: 'suggest-new-folder',
  },

  // Auto-Organize
  ORGANIZE: {
    AUTO: 'auto-organize-files',
    BATCH: 'batch-organize-files',
    PROCESS_NEW: 'process-new-file',
    GET_STATS: 'get-organize-stats',
    UPDATE_THRESHOLDS: 'update-organize-thresholds',
  },

  // Settings
  SETTINGS: {
    GET: 'get-settings',
    SAVE: 'save-settings',
  },

  // Embeddings / Semantic Matching
  EMBEDDINGS: {
    REBUILD_FOLDERS: 'embeddings-rebuild-folders',
    REBUILD_FILES: 'embeddings-rebuild-files',
    CLEAR_STORE: 'embeddings-clear-store',
    GET_STATS: 'embeddings-get-stats',
    FIND_SIMILAR: 'embeddings-find-similar',
  },

  // Ollama
  OLLAMA: {
    GET_MODELS: 'get-ollama-models',
    TEST_CONNECTION: 'test-ollama-connection',
    PULL_MODELS: 'ollama-pull-models',
    DELETE_MODEL: 'ollama-delete-model',
  },

  // Undo/Redo
  UNDO_REDO: {
    CAN_UNDO: 'can-undo',
    CAN_REDO: 'can-redo',
    UNDO: 'undo-action',
    REDO: 'redo-action',
    GET_HISTORY: 'get-action-history',
    CLEAR_HISTORY: 'clear-action-history',
  },

  // Analysis History
  ANALYSIS_HISTORY: {
    GET: 'get-analysis-history',
    SEARCH: 'search-analysis-history',
    GET_STATISTICS: 'get-analysis-statistics',
    GET_FILE_HISTORY: 'get-file-analysis-history',
    CLEAR: 'clear-analysis-history',
    EXPORT: 'export-analysis-history',
  },

  // System Monitoring
  SYSTEM: {
    GET_APPLICATION_STATISTICS: 'get-application-statistics',
    GET_METRICS: 'get-system-metrics',
    APPLY_UPDATE: 'apply-update',
    SERVICE_HEALTH_ALL: 'service:health:all',
    SERVICE_HEALTH_GET: 'service:health:get',
    SERVICE_STATS: 'service:stats',
  },

  // Window Controls
  WINDOW: {
    MINIMIZE: 'window-minimize',
    MAXIMIZE: 'window-maximize',
    UNMAXIMIZE: 'window-unmaximize',
    TOGGLE_MAXIMIZE: 'window-toggle-maximize',
    IS_MAXIMIZED: 'window-is-maximized',
    CLOSE: 'window-close',
  },

  // Menu Actions
  MENU: {
    NEW_ANALYSIS: 'menu-new-analysis',
    UNDO: 'menu-undo',
    REDO: 'menu-redo',
  },
};

// Dynamically derive allowed send channels from centralized IPC_CHANNELS to prevent drift
const ALLOWED_CHANNELS = {
  FILES: Object.values(IPC_CHANNELS.FILES),
  SMART_FOLDERS: Object.values(IPC_CHANNELS.SMART_FOLDERS),
  ANALYSIS: Object.values(IPC_CHANNELS.ANALYSIS),
  SETTINGS: Object.values(IPC_CHANNELS.SETTINGS),
  OLLAMA: Object.values(IPC_CHANNELS.OLLAMA),
  UNDO_REDO: Object.values(IPC_CHANNELS.UNDO_REDO),
  ANALYSIS_HISTORY: Object.values(IPC_CHANNELS.ANALYSIS_HISTORY),
  EMBEDDINGS: Object.values(IPC_CHANNELS.EMBEDDINGS),
  SYSTEM: Object.values(IPC_CHANNELS.SYSTEM),
  WINDOW: Object.values(IPC_CHANNELS.WINDOW || {}),
  SUGGESTIONS: Object.values(IPC_CHANNELS.SUGGESTIONS || {}),
  ORGANIZE: Object.values(IPC_CHANNELS.ORGANIZE || {}),
  // Fixed: Add new settings-related channels
  SETTINGS_EXTENDED: [
    'get-configurable-limits',
    'export-settings',
    'import-settings',
    'settings-create-backup',
    'settings-list-backups',
    'settings-restore-backup',
    'settings-delete-backup',
  ],
};

const ALLOWED_RECEIVE_CHANNELS = [
  'system-metrics',
  'operation-progress',
  'app:error',
  'app:update',
  'startup-progress',
  'startup-error',
  'menu-action',
  'settings-changed-external',
  'operation-error',
  'operation-complete',
  'operation-failed',
];

// Allowed send channels (for ipcRenderer.send, not invoke)
// These are fire-and-forget messages that don't need handlers
const ALLOWED_SEND_CHANNELS = [
  'renderer-error-report', // Error reporting from renderer to main
  'startup-continue', // Startup flow control
  'startup-quit', // Startup flow control
];

// Flatten allowed send channels for validation
const ALL_SEND_CHANNELS = Object.values(ALLOWED_CHANNELS).flat();

interface RateLimitData {
  count: number;
  resetTime: number;
}

interface ListenerData {
  channel: string;
  callback: (...args: unknown[]) => void;
}

/**
 * Enhanced IPC validation with security checks and correlation ID tracing
 */
class SecureIPCManager {
  private activeListeners: Map<string, ListenerData>;
  private rateLimiter: Map<string, RateLimitData>;
  private maxRequestsPerSecond: number;

  constructor() {
    this.activeListeners = new Map();
    this.rateLimiter = new Map();
    this.maxRequestsPerSecond = 200; // Increased from 100 to handle large file selections
  }

  /**
   * Rate limiting to prevent IPC abuse
   * Fixed: Add cleanup to prevent memory leaks
   */
  checkRateLimit(channel: string): boolean {
    const now = Date.now();
    const channelData = this.rateLimiter.get(channel) || {
      count: 0,
      resetTime: now + 1000,
    };

    if (now > channelData.resetTime) {
      channelData.count = 1;
      channelData.resetTime = now + 1000;
    } else {
      channelData.count++;
    }
    this.rateLimiter.set(channel, channelData);

    // Fixed: Cleanup old rate limit entries to prevent memory leak
    if (this.rateLimiter.size > 100) {
      const staleEntries: string[] = [];
      for (const [ch, data] of this.rateLimiter.entries()) {
        // Remove entries that are more than 1 minute old
        if (now > data.resetTime + 60000) {
          staleEntries.push(ch);
        }
      }
      staleEntries.forEach((ch) => this.rateLimiter.delete(ch));
    }

    if (channelData.count > this.maxRequestsPerSecond) {
      const resetIn = Math.ceil((channelData.resetTime - now) / 1000);
      throw new Error(
        `Rate limit exceeded for channel: ${channel}. Please wait ${resetIn}s before retrying. Consider reducing concurrent requests.`,
      );
    }

    return true;
  }

  /**
   * Secure invoke with validation, error handling, and correlation ID tracing
   */
  async safeInvoke(channel: string, ...args: unknown[]): Promise<unknown> {
    // Generate correlation ID for request tracing
    const correlationId = nanoid(12);
    const startTime = performance.now();

    try {
      // Channel validation
      if (!ALL_SEND_CHANNELS.includes(channel)) {
        log.warn(`[${correlationId}] Blocked invoke to unauthorized channel: ${channel}`);
        throw new Error(`Unauthorized IPC channel: ${channel}`);
      }

      // Rate limiting
      this.checkRateLimit(channel);

      // Argument sanitization
      const sanitizedArgs = this.sanitizeArguments(args);
      log.info(
        `[IPC:${correlationId}] -> ${channel}${sanitizedArgs.length > 0 ? ' [with args]' : ''}`,
      );

      // Add retry logic for handler not registered errors (reduced to 2 attempts as fallback)
      let lastError: Error | undefined;
      for (let attempt = 0; attempt < 2; attempt++) {
        try {
          // Include correlation ID in the request for main process tracing
          const result = await ipcRenderer.invoke(channel, {
            _correlationId: correlationId,
            _timestamp: Date.now(),
            ...((sanitizedArgs.length === 1 && typeof sanitizedArgs[0] === 'object' && sanitizedArgs[0] !== null)
              ? sanitizedArgs[0]
              : { _args: sanitizedArgs }),
          });

          const durationMs = performance.now() - startTime;
          log.info(`[IPC:${correlationId}] <- ${channel} (${durationMs.toFixed(0)}ms)`);

          // Result validation
          return this.validateResult(result, channel);
        } catch (error) {
          lastError = error as Error;
          // Check if it's a "No handler registered" error
          if (
            lastError.message &&
            lastError.message.includes('No handler registered')
          ) {
            log.warn(
              `[${correlationId}] Handler not ready for ${channel}, attempt ${attempt + 1}/2`,
            );
            // Wait before retrying (exponential backoff)
            const RETRY_BASE_DELAY_MS = 100;
            await new Promise((resolve) =>
              setTimeout(resolve, RETRY_BASE_DELAY_MS * Math.pow(2, attempt)),
            );
            continue;
          }
          // For other errors, throw immediately
          throw error;
        }
      }

      // If we exhausted retries, throw the last error
      throw lastError;
    } catch (error) {
      const durationMs = performance.now() - startTime;
      log.error(`[IPC:${correlationId}] ERROR ${channel} (${durationMs.toFixed(0)}ms): ${(error as Error).message}`);
      throw new Error(`IPC Error: ${(error as Error).message}`);
    }
  }

  /**
   * Secure event listener with cleanup tracking
   */
  safeOn(channel: string, callback: (...args: unknown[]) => void): () => void {
    if (!ALLOWED_RECEIVE_CHANNELS.includes(channel)) {
      log.warn(`Blocked listener on unauthorized channel: ${channel}`);
      return () => {};
    }

    const wrappedCallback = (event: Electron.IpcRendererEvent, ...args: unknown[]) => {
      try {
        // Validate event source
        if (!this.validateEventSource(event)) {
          log.warn(`Rejected event from invalid source on channel: ${channel}`);
          return;
        }

        // Sanitize incoming data
        const sanitizedArgs = this.sanitizeArguments(args);

        // Special handling for different event types
        if (channel === 'system-metrics' && sanitizedArgs.length === 1) {
          const data = sanitizedArgs[0];
          if (this.isValidSystemMetrics(data)) {
            callback(data);
          } else {
            log.warn('Invalid system-metrics data rejected');
          }
        } else {
          callback(...sanitizedArgs);
        }
      } catch (error) {
        log.error(`Error in ${channel} event handler:`, error);
      }
    };

    ipcRenderer.on(channel, wrappedCallback);

    // Track listener for cleanup
    const listenerKey = `${channel}_${Date.now()}`;
    this.activeListeners.set(listenerKey, {
      channel,
      callback: wrappedCallback,
    });

    // Return cleanup function
    return () => {
      ipcRenderer.removeListener(channel, wrappedCallback);
      this.activeListeners.delete(listenerKey);
    };
  }

  /**
   * Validate event source to prevent spoofing
   */
  validateEventSource(event: Electron.IpcRendererEvent): boolean {
    // Basic validation - in production, implement more sophisticated checks
    return event && event.sender && typeof event.sender === 'object';
  }

  /**
   * Sanitize arguments to prevent injection attacks
   * Fixed: Detect file path arguments and skip HTML sanitization for them
   */
  sanitizeArguments(args: unknown[]): unknown[] {
    return args.map((arg) => {
      // Check if this argument looks like a file path
      const isFilePath = typeof arg === 'string' && this.looksLikeFilePath(arg);
      return this.sanitizeObject(arg, isFilePath);
    });
  }

  /**
   * Deep sanitization for objects
   * Fixed: Added prototype pollution protection
   * Fixed: File paths should NOT be HTML sanitized (breaks file system operations)
   */
  sanitizeObject(obj: unknown, isFilePath = false): unknown {
    if (typeof obj === 'string') {
      // File paths should NOT be HTML sanitized - they need to remain valid file system paths
      if (isFilePath || this.looksLikeFilePath(obj)) {
        // Only remove null bytes and dangerous characters, but preserve path structure
        return this.stripControlChars(obj).replace(/[<>"|?*]/g, '');
      }
      // Basic HTML sanitization for non-file-path strings
      return this.basicSanitizeHtml(obj);
    }

    if (Array.isArray(obj)) {
      return obj.map((item) => this.sanitizeObject(item, isFilePath));
    }

    if (obj && typeof obj === 'object') {
      const sanitized: Record<string, unknown> = {};
      // Dangerous keys that could lead to prototype pollution
      const dangerousKeys = ['__proto__', 'constructor', 'prototype'];

      for (const [key, value] of Object.entries(obj)) {
        // Skip dangerous keys
        if (dangerousKeys.includes(key)) {
          log.warn(`Blocked dangerous object key: ${key}`);
          continue;
        }

        // Check if this key/value pair represents a file path
        const isPathKey =
          key.toLowerCase().includes('path') ||
          key.toLowerCase().includes('file');
        const cleanKey = isPathKey ? key : this.basicSanitizeHtml(key);

        // Double-check the cleaned key isn't dangerous
        if (dangerousKeys.includes(cleanKey)) {
          log.warn(`Blocked dangerous sanitized key: ${cleanKey}`);
          continue;
        }

        sanitized[cleanKey] = this.sanitizeObject(value, isPathKey);
      }
      return sanitized;
    }

    return obj;
  }

  /**
   * Remove ASCII control characters from a string without using control-char regexes
   */
  stripControlChars(str: string): string {
    if (typeof str !== 'string') return str;
    let output = '';
    for (let i = 0; i < str.length; i += 1) {
      const code = str.charCodeAt(i);
      if (code >= 32) {
        output += str[i];
      }
    }
    return output;
  }

  /**
   * Check if a string looks like a file path
   * File paths typically contain drive letters (Windows) or start with / (Unix)
   */
  looksLikeFilePath(str: string): boolean {
    if (typeof str !== 'string' || str.length === 0) return false;

    // Check for HTML tags first - if it contains < or >, it's likely HTML, not a file path
    if (str.includes('<') || str.includes('>')) {
      return false;
    }

    // Windows path: C:\ or C:/ (drive letter can be any letter)
    if (/^[A-Za-z]:[\\/]/.test(str)) return true;

    // Unix absolute path: starts with /
    // Support Unicode characters and spaces in path names
    if (/^\/[\p{L}\p{N}\p{M}\s._-]/u.test(str)) return true;

    // UNC paths: \\server\share or //server/share
    if (/^[\\/]{2}[\p{L}\p{N}\p{M}\s._-]/u.test(str)) return true;

    // Relative path with typical file extensions
    if (
      /^[\p{L}\p{N}\p{M}\s_.-]+\/[\p{L}\p{N}\p{M}\s_./-]+\.[\p{L}\p{N}]+$/u.test(
        str,
      )
    ) {
      return true;
    }

    // If it contains backslash (Windows path separator), it's likely a path
    if (str.includes('\\')) {
      // But not if it also contains HTML-like content
      if (!str.includes('=') && !str.includes('"')) {
        return true;
      }
    }

    return false;
  }

  /**
   * Basic HTML sanitization without external library
   * Removes HTML tags and dangerous characters
   */
  basicSanitizeHtml(str: string): string {
    if (typeof str !== 'string') return str;

    let cleaned = str;

    // First, remove script tags and their contents entirely
    cleaned = cleaned.replace(
      /<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi,
      '',
    );
    // Handle unclosed script tags
    cleaned = cleaned.replace(/<script\b[^>]*>[\s\S]*$/gi, '');

    // Remove style tags and their contents
    cleaned = cleaned.replace(
      /<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi,
      '',
    );
    // Handle unclosed style tags
    cleaned = cleaned.replace(/<style\b[^>]*>[\s\S]*$/gi, '');

    // Remove iframe tags and their contents
    cleaned = cleaned.replace(
      /<iframe\b[^<]*(?:(?!<\/iframe>)<[^<]*)*<\/iframe>/gi,
      '',
    );

    // Now remove all remaining HTML tags (but keep the text content between them)
    cleaned = cleaned.replace(/<[^>]*>?/g, '');

    // If there are still < characters, remove everything from them to the end
    while (cleaned.includes('<')) {
      const index = cleaned.indexOf('<');
      cleaned = cleaned.substring(0, index);
    }

    // Escape remaining dangerous characters to prevent XSS
    cleaned = cleaned
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#x27;')
      .replace(/\//g, '&#x2F;');

    return cleaned;
  }

  /**
   * Validate system metrics data structure
   */
  isValidSystemMetrics(data: unknown): boolean {
    if (!data || typeof data !== 'object') return false;
    const d = data as Record<string, unknown>;
    const hasUptime =
      typeof d.uptime === 'number' || typeof d.uptime === 'string';
    const hasMemory =
      typeof d.memory === 'object' || typeof (d.memory as Record<string, unknown>)?.used === 'number';
    return hasUptime || hasMemory;
  }

  /**
   * Validate IPC results
   * All IPC handlers now return standardized envelope format:
   * Success: { success: true, data: T, timestamp: string }
   * Error: { success: false, error: { code, message, details? }, timestamp: string }
   */
  validateResult(result: unknown, channel: string): unknown {
    // Handle null/undefined results
    if (result === null || result === undefined) {
      return { success: false, error: { code: 'NULL_RESPONSE', message: 'No response from handler' } };
    }

    // If result is in standard envelope format, validate and return
    if (typeof result === 'object' && typeof (result as Record<string, unknown>).success === 'boolean') {
      const r = result as Record<string, unknown>;
      // Channel-specific validation for wrapped data
      if (r.success && r.data !== undefined) {
        switch (channel) {
          case 'get-system-metrics':
            if (!this.isValidSystemMetrics(r.data)) {
              return { success: false, error: { code: 'INVALID_DATA', message: 'Invalid system metrics format' } };
            }
            break;
          case 'get-custom-folders':
            if (!Array.isArray(r.data)) {
              return { success: true, data: [] };
            }
            break;
        }
      }
      return result;
    }

    // Legacy: handle raw returns that haven't been wrapped yet
    switch (channel) {
      case 'get-system-metrics':
        return this.isValidSystemMetrics(result)
          ? { success: true, data: result }
          : { success: false, error: { code: 'INVALID_DATA', message: 'Invalid system metrics format' } };
      case 'select-directory':
        return result && typeof result === 'object'
          ? result
          : { success: false, folder: null };
      case 'get-custom-folders':
        return Array.isArray(result)
          ? { success: true, data: result }
          : { success: true, data: [] };
      default:
        return { success: true, data: result };
    }
  }

  /**
   * Cleanup all active listeners
   */
  cleanup(): void {
    for (const { channel, callback } of this.activeListeners.values()) {
      ipcRenderer.removeListener(channel, callback);
    }
    this.activeListeners.clear();
    log.info('All IPC listeners cleaned up');
  }
}

// Initialize secure IPC manager
const secureIPC = new SecureIPCManager();

// Cleanup on window unload
window.addEventListener('beforeunload', () => {
  secureIPC.cleanup();
});

// Expose secure, typed API through context bridge
contextBridge.exposeInMainWorld('electronAPI', {
  // File Operations
  files: {
    select: () => secureIPC.safeInvoke(IPC_CHANNELS.FILES.SELECT),
    selectDirectory: () =>
      secureIPC.safeInvoke(IPC_CHANNELS.FILES.SELECT_DIRECTORY),
    getDocumentsPath: () =>
      secureIPC.safeInvoke(IPC_CHANNELS.FILES.GET_DOCUMENTS_PATH),
    createFolder: (fullPath: string) =>
      secureIPC.safeInvoke(IPC_CHANNELS.FILES.CREATE_FOLDER_DIRECT, { path: fullPath }),
    normalizePath: (p: string) => {
      try {
        if (typeof p !== 'string') return p;
        // Only remove duplicate slashes (keeping backslash or forward slash as-is)
        let normalized = p.replace(/([\\/])+/g, '$1');

        // Remove trailing slash unless it's the root
        if (
          normalized.length > 3 &&
          (normalized.endsWith('/') || normalized.endsWith('\\'))
        ) {
          if (!(normalized.match(/^[A-Za-z]:[\\/]$/) || normalized === '/')) {
            normalized = normalized.slice(0, -1);
          }
        }
        return normalized;
      } catch {
        return p;
      }
    },
    getStats: (filePath: string) =>
      secureIPC.safeInvoke(IPC_CHANNELS.FILES.GET_FILE_STATS, { path: filePath }),
    getDirectoryContents: (dirPath: string) =>
      secureIPC.safeInvoke(IPC_CHANNELS.FILES.GET_FILES_IN_DIRECTORY, dirPath),
    organize: (operations: unknown) =>
      secureIPC.safeInvoke(IPC_CHANNELS.FILES.PERFORM_OPERATION, {
        type: 'batch_organize',
        operations,
      }),
    performOperation: (operations: unknown) =>
      secureIPC.safeInvoke(IPC_CHANNELS.FILES.PERFORM_OPERATION, operations),
    delete: (filePath: string) =>
      secureIPC.safeInvoke(IPC_CHANNELS.FILES.DELETE_FILE, { path: filePath }),
    open: (filePath: string) =>
      secureIPC.safeInvoke(IPC_CHANNELS.FILES.OPEN_FILE, { path: filePath }),
    reveal: (filePath: string) =>
      secureIPC.safeInvoke(IPC_CHANNELS.FILES.REVEAL_FILE, { path: filePath }),
    copy: (sourcePath: string, destinationPath: string) =>
      secureIPC.safeInvoke(
        IPC_CHANNELS.FILES.COPY_FILE,
        { source: sourcePath, destination: destinationPath },
      ),
    openFolder: (folderPath: string) =>
      secureIPC.safeInvoke(IPC_CHANNELS.FILES.OPEN_FOLDER, { path: folderPath }),
    analyze: (filePath: string) => {
      try {
        // Basic security checks
        const isAbsolute =
          filePath &&
          typeof filePath === 'string' &&
          (filePath.match(/^[A-Za-z]:[\\/]/) || filePath.startsWith('/'));

        if (!isAbsolute) {
          throw new Error('Invalid file path: must be absolute path');
        }

        if (filePath.includes('..')) {
          throw new Error('Invalid file path: path traversal detected');
        }

        const dangerousPaths = [
          '/etc', '/sys', '/proc', '/dev', '/boot',
          'C:/Windows/System32', 'C:\\Windows\\System32',
          'C:/Windows/SysWOW64', 'C:\\Windows\\SysWOW64',
          'C:/Windows/Boot', 'C:\\Windows\\Boot',
          'C:/Windows/WinSxS', 'C:\\Windows\\WinSxS',
          '/System/Library/CoreServices', '/Library/System',
          '/private/etc', '/private/var/root',
        ];

        const allowedWindowsPaths = [
          'C:/Windows/Temp', 'C:\\Windows\\Temp',
          'C:/Windows/Fonts', 'C:\\Windows\\Fonts',
          'C:/Windows/Downloaded Program Files', 'C:\\Windows\\Downloaded Program Files',
        ];

        const normalizedPath = filePath.toLowerCase();
        const isExplicitlyAllowed = allowedWindowsPaths.some((allowed) =>
          normalizedPath.startsWith(allowed.toLowerCase()),
        );

        const isDangerous =
          !isExplicitlyAllowed &&
          dangerousPaths.some((dangerous) =>
            normalizedPath.startsWith(dangerous.toLowerCase()),
          );

        if (isDangerous) {
          throw new Error('Invalid file path: access to system directories not allowed');
        }

        // Extract file extension
        const lastDot = filePath.lastIndexOf('.');
        const lastForwardSlash = filePath.lastIndexOf('/');
        const lastBackSlash = filePath.lastIndexOf('\\');
        const lastSlash = Math.max(lastForwardSlash, lastBackSlash);
        let ext = '';

        if (lastDot > lastSlash && lastDot > 0) {
          ext = filePath.slice(lastDot + 1).toLowerCase();
        }

        const imageExts = ['jpg', 'jpeg', 'png', 'gif', 'bmp', 'webp', 'svg', 'tiff'];

        if (imageExts.includes(ext)) {
          return secureIPC.safeInvoke(IPC_CHANNELS.ANALYSIS.ANALYZE_IMAGE, { filePath });
        } else {
          return secureIPC.safeInvoke(IPC_CHANNELS.ANALYSIS.ANALYZE_DOCUMENT, { filePath });
        }
      } catch (error) {
        log.error('File analysis security check failed:', error);
        return Promise.reject(error);
      }
    },
  },

  // Smart Folders
  smartFolders: {
    get: () => secureIPC.safeInvoke(IPC_CHANNELS.SMART_FOLDERS.GET),
    save: (folders: unknown) =>
      secureIPC.safeInvoke(IPC_CHANNELS.SMART_FOLDERS.SAVE, folders),
    updateCustom: (folders: unknown) =>
      secureIPC.safeInvoke(IPC_CHANNELS.SMART_FOLDERS.UPDATE_CUSTOM, folders),
    getCustom: () =>
      secureIPC.safeInvoke(IPC_CHANNELS.SMART_FOLDERS.GET_CUSTOM),
    scanStructure: (rootPath: string) =>
      secureIPC.safeInvoke(IPC_CHANNELS.SMART_FOLDERS.SCAN_STRUCTURE, rootPath),
    add: (folder: unknown) =>
      secureIPC.safeInvoke(IPC_CHANNELS.SMART_FOLDERS.ADD, folder),
    edit: (folderId: string, updatedFolder: unknown) =>
      secureIPC.safeInvoke(
        IPC_CHANNELS.SMART_FOLDERS.EDIT,
        { id: folderId, updates: updatedFolder },
      ),
    delete: (folderId: string) =>
      secureIPC.safeInvoke(IPC_CHANNELS.SMART_FOLDERS.DELETE, { id: folderId }),
    match: (text: string, folders: unknown) =>
      secureIPC.safeInvoke(IPC_CHANNELS.SMART_FOLDERS.MATCH, {
        text,
        smartFolders: folders,
      }),
  },

  // Analysis
  analysis: {
    document: (filePath: string) =>
      secureIPC.safeInvoke(IPC_CHANNELS.ANALYSIS.ANALYZE_DOCUMENT, { filePath }),
    image: (filePath: string) =>
      secureIPC.safeInvoke(IPC_CHANNELS.ANALYSIS.ANALYZE_IMAGE, { filePath }),
    extractText: (filePath: string) =>
      secureIPC.safeInvoke(IPC_CHANNELS.ANALYSIS.EXTRACT_IMAGE_TEXT, { filePath }),
    startBatch: (filePaths: string[]) =>
      secureIPC.safeInvoke(IPC_CHANNELS.ANALYSIS.START_BATCH, { files: filePaths }),
    cancelBatch: () =>
      secureIPC.safeInvoke(IPC_CHANNELS.ANALYSIS.CANCEL_BATCH),
  },

  // Analysis History
  analysisHistory: {
    get: (options: unknown) =>
      secureIPC.safeInvoke(IPC_CHANNELS.ANALYSIS_HISTORY.GET, options),
    search: (query: string, options: unknown) =>
      secureIPC.safeInvoke(IPC_CHANNELS.ANALYSIS_HISTORY.SEARCH, query, options),
    getStatistics: () =>
      secureIPC.safeInvoke(IPC_CHANNELS.ANALYSIS_HISTORY.GET_STATISTICS),
    getFileHistory: (filePath: string) =>
      secureIPC.safeInvoke(IPC_CHANNELS.ANALYSIS_HISTORY.GET_FILE_HISTORY, filePath),
    clear: () => secureIPC.safeInvoke(IPC_CHANNELS.ANALYSIS_HISTORY.CLEAR),
    export: (format: string) =>
      secureIPC.safeInvoke(IPC_CHANNELS.ANALYSIS_HISTORY.EXPORT, format),
  },

  // Embeddings / Semantic
  embeddings: {
    rebuildFolders: () =>
      secureIPC.safeInvoke(IPC_CHANNELS.EMBEDDINGS.REBUILD_FOLDERS),
    rebuildFiles: () =>
      secureIPC.safeInvoke(IPC_CHANNELS.EMBEDDINGS.REBUILD_FILES),
    clearStore: () => secureIPC.safeInvoke(IPC_CHANNELS.EMBEDDINGS.CLEAR_STORE),
    getStats: () => secureIPC.safeInvoke(IPC_CHANNELS.EMBEDDINGS.GET_STATS),
    findSimilar: (fileId: string, topK = 10) =>
      secureIPC.safeInvoke(IPC_CHANNELS.EMBEDDINGS.FIND_SIMILAR, { fileId, topK }),
  },

  // Organization Suggestions
  suggestions: {
    getFileSuggestions: (file: unknown, options: unknown) =>
      secureIPC.safeInvoke(IPC_CHANNELS.SUGGESTIONS.GET_FILE_SUGGESTIONS, { file, options }),
    getBatchSuggestions: (files: unknown, options: unknown) =>
      secureIPC.safeInvoke(IPC_CHANNELS.SUGGESTIONS.GET_BATCH_SUGGESTIONS, { files, options }),
    recordFeedback: (file: unknown, suggestion: unknown, accepted: boolean) =>
      secureIPC.safeInvoke(IPC_CHANNELS.SUGGESTIONS.RECORD_FEEDBACK, { file, suggestion, accepted }),
    getStrategies: () =>
      secureIPC.safeInvoke(IPC_CHANNELS.SUGGESTIONS.GET_STRATEGIES),
    applyStrategy: (files: unknown, strategyId: string) =>
      secureIPC.safeInvoke(IPC_CHANNELS.SUGGESTIONS.APPLY_STRATEGY, { files, strategyId }),
    getUserPatterns: () =>
      secureIPC.safeInvoke(IPC_CHANNELS.SUGGESTIONS.GET_USER_PATTERNS),
    clearPatterns: () =>
      secureIPC.safeInvoke(IPC_CHANNELS.SUGGESTIONS.CLEAR_PATTERNS),
    analyzeFolderStructure: (files: unknown) =>
      secureIPC.safeInvoke(IPC_CHANNELS.SUGGESTIONS.ANALYZE_FOLDER_STRUCTURE, { files }),
    suggestNewFolder: (file: unknown) =>
      secureIPC.safeInvoke(IPC_CHANNELS.SUGGESTIONS.SUGGEST_NEW_FOLDER, { file }),
  },

  // Auto-Organize
  organize: {
    auto: (params: unknown) => secureIPC.safeInvoke(IPC_CHANNELS.ORGANIZE.AUTO, params),
    batch: (params: unknown) =>
      secureIPC.safeInvoke(IPC_CHANNELS.ORGANIZE.BATCH, params),
    processNew: (params: unknown) =>
      secureIPC.safeInvoke(IPC_CHANNELS.ORGANIZE.PROCESS_NEW, params),
    getStats: () => secureIPC.safeInvoke(IPC_CHANNELS.ORGANIZE.GET_STATS),
    updateThresholds: (thresholds: unknown) =>
      secureIPC.safeInvoke(IPC_CHANNELS.ORGANIZE.UPDATE_THRESHOLDS, { thresholds }),
  },

  // Undo/Redo System
  undoRedo: {
    undo: () => secureIPC.safeInvoke(IPC_CHANNELS.UNDO_REDO.UNDO),
    redo: () => secureIPC.safeInvoke(IPC_CHANNELS.UNDO_REDO.REDO),
    getHistory: (limit: number) =>
      secureIPC.safeInvoke(IPC_CHANNELS.UNDO_REDO.GET_HISTORY, limit),
    clear: () => secureIPC.safeInvoke(IPC_CHANNELS.UNDO_REDO.CLEAR_HISTORY),
    canUndo: () => secureIPC.safeInvoke(IPC_CHANNELS.UNDO_REDO.CAN_UNDO),
    canRedo: () => secureIPC.safeInvoke(IPC_CHANNELS.UNDO_REDO.CAN_REDO),
  },

  // System Monitoring
  system: {
    getMetrics: () => secureIPC.safeInvoke(IPC_CHANNELS.SYSTEM.GET_METRICS),
    getApplicationStatistics: () =>
      secureIPC.safeInvoke(IPC_CHANNELS.SYSTEM.GET_APPLICATION_STATISTICS),
    applyUpdate: () =>
      IPC_CHANNELS.SYSTEM.APPLY_UPDATE
        ? secureIPC.safeInvoke(IPC_CHANNELS.SYSTEM.APPLY_UPDATE)
        : undefined,
    serviceHealth: () =>
      secureIPC.safeInvoke(IPC_CHANNELS.SYSTEM.SERVICE_HEALTH_ALL),
    getServiceHealth: (serviceName: string) =>
      secureIPC.safeInvoke(IPC_CHANNELS.SYSTEM.SERVICE_HEALTH_GET, serviceName),
    getServiceStats: () =>
      secureIPC.safeInvoke(IPC_CHANNELS.SYSTEM.SERVICE_STATS),
  },

  // Window controls
  window: {
    minimize: () =>
      IPC_CHANNELS.WINDOW?.MINIMIZE
        ? secureIPC.safeInvoke(IPC_CHANNELS.WINDOW.MINIMIZE)
        : undefined,
    maximize: () =>
      IPC_CHANNELS.WINDOW?.MAXIMIZE
        ? secureIPC.safeInvoke(IPC_CHANNELS.WINDOW.MAXIMIZE)
        : undefined,
    unmaximize: () =>
      IPC_CHANNELS.WINDOW?.UNMAXIMIZE
        ? secureIPC.safeInvoke(IPC_CHANNELS.WINDOW.UNMAXIMIZE)
        : undefined,
    toggleMaximize: () =>
      IPC_CHANNELS.WINDOW?.TOGGLE_MAXIMIZE
        ? secureIPC.safeInvoke(IPC_CHANNELS.WINDOW.TOGGLE_MAXIMIZE)
        : undefined,
    isMaximized: () =>
      IPC_CHANNELS.WINDOW?.IS_MAXIMIZED
        ? secureIPC.safeInvoke(IPC_CHANNELS.WINDOW.IS_MAXIMIZED)
        : undefined,
    close: () =>
      IPC_CHANNELS.WINDOW?.CLOSE
        ? secureIPC.safeInvoke(IPC_CHANNELS.WINDOW.CLOSE)
        : undefined,
  },

  // Ollama
  ollama: {
    getModels: () => secureIPC.safeInvoke(IPC_CHANNELS.OLLAMA.GET_MODELS),
    testConnection: (hostUrl: string) =>
      secureIPC.safeInvoke(IPC_CHANNELS.OLLAMA.TEST_CONNECTION, hostUrl),
    pullModels: (models: string) =>
      secureIPC.safeInvoke(IPC_CHANNELS.OLLAMA.PULL_MODELS, { modelName: models }),
    deleteModel: (model: string) =>
      secureIPC.safeInvoke(IPC_CHANNELS.OLLAMA.DELETE_MODEL, { modelName: model }),
  },

  // Event Listeners (with automatic cleanup)
  events: {
    onOperationProgress: (callback: (data: unknown) => void) =>
      secureIPC.safeOn('operation-progress', callback),
    onAppError: (callback: (data: unknown) => void) =>
      secureIPC.safeOn('app:error', callback),
    onAppUpdate: (callback: (data: unknown) => void) =>
      secureIPC.safeOn('app:update', callback),
    onStartupProgress: (callback: (data: unknown) => void) =>
      secureIPC.safeOn('startup-progress', callback),
    onStartupError: (callback: (data: unknown) => void) =>
      secureIPC.safeOn('startup-error', callback),
    onSystemMetrics: (callback: (data: unknown) => void) =>
      secureIPC.safeOn('system-metrics', callback),
    onMenuAction: (callback: (data: unknown) => void) =>
      secureIPC.safeOn('menu-action', callback),
    onSettingsChanged: (callback: (data: unknown) => void) =>
      secureIPC.safeOn('settings-changed-external', callback),
    onOperationError: (callback: (data: unknown) => void) =>
      secureIPC.safeOn('operation-error', callback),
    onOperationComplete: (callback: (data: unknown) => void) =>
      secureIPC.safeOn('operation-complete', callback),
    onOperationFailed: (callback: (data: unknown) => void) =>
      secureIPC.safeOn('operation-failed', callback),
    sendError: (errorData: { message: string; [key: string]: unknown }) => {
      try {
        if (!errorData || typeof errorData !== 'object' || !errorData.message) {
          log.warn('[events.sendError] Invalid error data structure');
          return;
        }
        const channel = 'renderer-error-report';
        if (!ALLOWED_SEND_CHANNELS.includes(channel)) {
          log.warn(`[events.sendError] Blocked send to unauthorized channel: ${channel}`);
          return;
        }
        ipcRenderer.send(channel, errorData);
      } catch (error) {
        log.error('[events.sendError] Failed to send error report:', error);
      }
    },
  },

  // Settings
  settings: {
    get: () => secureIPC.safeInvoke(IPC_CHANNELS.SETTINGS.GET),
    save: (settings: unknown) =>
      secureIPC.safeInvoke(IPC_CHANNELS.SETTINGS.SAVE, settings),
    getConfigurableLimits: () =>
      secureIPC.safeInvoke('get-configurable-limits'),
    export: (exportPath: string) => secureIPC.safeInvoke('export-settings', exportPath),
    import: (importPath: string) => secureIPC.safeInvoke('import-settings', importPath),
    createBackup: () => secureIPC.safeInvoke('settings-create-backup'),
    listBackups: () => secureIPC.safeInvoke('settings-list-backups'),
    restoreBackup: (backupPath: string) =>
      secureIPC.safeInvoke('settings-restore-backup', backupPath),
    deleteBackup: (backupPath: string) =>
      secureIPC.safeInvoke('settings-delete-backup', backupPath),
  },
});

log.info('Secure context bridge exposed with structured API');

module.exports = { SecureIPCManager };

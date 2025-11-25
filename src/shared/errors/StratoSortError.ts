/**
 * Base error class for all StratoSort errors
 * Provides rich context, user messages, and recovery actions
 */
class StratoSortError extends Error {
  code: string;
  context: Record<string, any>;
  userMessage: string;
  recoveryActions: Array<{
    label: string;
    action: string;
    description: string;
  }>;
  timestamp: string;

  /**
   * @param message - Technical error message for developers
   * @param code - Error code (e.g., 'FILE_MOVE_FAILED')
   * @param context - Additional context (file paths, operations, etc.)
   * @param userMessage - User-friendly message
   * @param recoveryActions - Suggested actions for user
   */
  constructor(
    message: string,
    code: string,
    context: Record<string, any> = {},
    userMessage: string | null = null,
    recoveryActions: Array<{
      label: string;
      action: string;
      description: string;
    }> = []
  ) {
    super(message);
    this.name = this.constructor.name;
    this.code = code;
    this.context = context;
    this.userMessage = userMessage || message;
    this.recoveryActions = recoveryActions;
    this.timestamp = new Date().toISOString();

    // Capture stack trace
    Error.captureStackTrace(this, this.constructor);
  }

  /**
   * Convert to JSON for serialization
   */
  toJSON() {
    return {
      name: this.name,
      message: this.message,
      code: this.code,
      context: this.context,
      userMessage: this.userMessage,
      recoveryActions: this.recoveryActions,
      timestamp: this.timestamp,
      stack: this.stack,
    };
  }

  /**
   * Get user-facing error display object
   */
  toUserDisplay() {
    return {
      title: this.userMessage,
      details: this.message,
      code: this.code,
      actions: this.recoveryActions,
      timestamp: this.timestamp,
    };
  }

  /**
   * Get structured log entry
   */
  toLogEntry(level: string = 'error') {
    return {
      level,
      name: this.name,
      message: this.message,
      code: this.code,
      context: this.context,
      timestamp: this.timestamp,
      stack: this.stack,
    };
  }
}

export default StratoSortError;

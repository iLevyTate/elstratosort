/**
 * Fixed: Create standardized error response
 */
function createErrorResponse(error, context = {}) {
  return {
    success: false,
    error: error.message || String(error),
    errorType: error.name || 'Error',
    ...context,
    // Include validation errors/warnings if present
    ...(error.validationErrors && { validationErrors: error.validationErrors }),
    ...(error.validationWarnings && {
      validationWarnings: error.validationWarnings,
    }),
  };
}

/**
 * Fixed: Create standardized success response
 */
function createSuccessResponse(data = {}) {
  return {
    success: true,
    ...data,
  };
}

function withErrorLogging(logger, fn) {
  return async (...args) => {
    try {
      return await fn(...args);
    } catch (error) {
      try {
        logger?.error?.('[IPC] Handler error:', error);
      } catch (logError) {
        // eslint-disable-next-line no-console
        console.error('Failed to log IPC error:', logError);
      }
      throw error;
    }
  };
}

/**
 * Wrap an IPC handler with validation using a provided schema.
 * schema should have a safeParse method (e.g., zod). If validation fails, a structured error is returned.
 */
function withValidation(logger, schema, handler) {
  return withErrorLogging(logger, async (...args) => {
    try {
      // Electron ipcMain.handle args: (event, ...payloadArgs)
      const payload = args.slice(1);
      const parsed = schema.safeParse(
        payload.length <= 1 ? payload[0] : payload,
      );
      if (!parsed.success) {
        return createErrorResponse(
          { message: 'Invalid input', name: 'ValidationError' },
          {
            details: parsed.error.flatten
              ? parsed.error.flatten()
              : String(parsed.error),
          },
        );
      }
      const normalized = parsed.data;
      // Reconstruct the args: keep event as first, then validated payload
      const nextArgs = [
        args[0],
        ...(Array.isArray(normalized) ? normalized : [normalized]),
      ];
      return await handler(...nextArgs);
    } catch (e) {
      logger?.error?.('[IPC] Validation wrapper failed:', e);
      throw e;
    }
  });
}

module.exports = {
  withErrorLogging,
  withValidation,
  createErrorResponse,
  createSuccessResponse,
};

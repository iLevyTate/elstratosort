/**
 * Legacy IPC Error Logging Wrapper
 *
 * @deprecated Use `createHandler` from './ipcWrappers.js' instead.
 * This module is kept for backwards compatibility with existing handlers
 * that haven't been migrated yet.
 *
 * Migration guide:
 * Old pattern:
 *   ipcMain.handle(channel, withErrorLogging(logger, async (event, data) => {
 *     // handler code
 *   }));
 *
 * New pattern:
 *   ipcMain.handle(channel, createHandler({
 *     logger,
 *     context: 'MyHandler',
 *     schema: optionalZodSchema,
 *     serviceName: 'optionalServiceName',
 *     getService: () => optionalService,
 *     handler: async (event, data, service) => {
 *       // handler code
 *     }
 *   }));
 */

// Re-export from the new centralized module for backwards compatibility
const {
  withErrorLogging,
  withValidation,
  createErrorResponse,
  createSuccessResponse,
} = require('./ipcWrappers');

module.exports = {
  withErrorLogging,
  withValidation,
  createErrorResponse,
  createSuccessResponse,
};

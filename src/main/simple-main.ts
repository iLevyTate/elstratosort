import { logger } from '../shared/logger';
import * as AppLifecycle from './core/AppLifecycle';

// Initialize Logger Context
logger.setContext('Main');

// Global Error Handling (fail-safe)
process.on('uncaughtException', (error: Error) => {
  // Check if logger is available/working
  try {
    logger.error('UNCAUGHT EXCEPTION:', {
      message: error.message,
      stack: error.stack,
    });
  } catch (e) {
    console.error('UNCAUGHT EXCEPTION (Logger failed):', error);
  }
});

process.on('unhandledRejection', (reason: any, promise: Promise<any>) => {
  try {
    logger.error('UNHANDLED REJECTION', { reason, promise: String(promise) });
  } catch (e) {
    console.error('UNHANDLED REJECTION (Logger failed):', reason);
  }
});

// Start App Lifecycle
const appLifecycle = new AppLifecycle.default();
appLifecycle.initialize().catch((err: Error) => {
  console.error('Fatal initialization error:', err);
  if (logger) logger.error('Fatal initialization error:', err);
  process.exit(1);
});

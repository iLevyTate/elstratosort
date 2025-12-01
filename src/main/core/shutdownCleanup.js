/**
 * Shutdown Cleanup
 *
 * Cleanup logic for application shutdown.
 * Extracted from simple-main.js for better maintainability.
 *
 * @module core/shutdownCleanup
 */

const { ipcMain } = require('electron');
const { isWindows } = require('../../shared/platformUtils');
const { logger } = require('../../shared/logger');

logger.setContext('Shutdown');

const CLEANUP_TIMEOUT = 5000; // 5 seconds max for all cleanup

/**
 * Verify that all resources are properly released after shutdown
 * @param {Object} state - Application state references
 * @returns {Promise<void>}
 */
async function verifyShutdownCleanup(state) {
  const issues = [];

  // 1. Verify intervals are cleared
  if (state.metricsInterval !== null) {
    issues.push('metricsInterval is not null');
  }

  // 2. Verify child process listeners are cleared
  if (state.childProcessListeners.length > 0) {
    issues.push(
      `childProcessListeners still has ${state.childProcessListeners.length} entries`,
    );
  }

  // 3. Verify global process listeners are cleared
  if (state.globalProcessListeners.length > 0) {
    issues.push(
      `globalProcessListeners still has ${state.globalProcessListeners.length} entries`,
    );
  }

  // 4. Verify app event listeners are cleared
  if (state.eventListeners.length > 0) {
    issues.push(
      `eventListeners still has ${state.eventListeners.length} entries`,
    );
  }

  // 5. Verify ChromaDB process is terminated
  if (state.chromaDbProcess !== null) {
    issues.push('chromaDbProcess is not null');
    try {
      if (state.chromaDbProcess.pid) {
        process.kill(state.chromaDbProcess.pid, 0);
        issues.push(
          `ChromaDB process ${state.chromaDbProcess.pid} may still be running`,
        );
      }
    } catch (e) {
      if (e.code !== 'ESRCH') {
        issues.push(`ChromaDB process check failed: ${e.message}`);
      }
    }
  }

  // 6. Verify service integration is nullified
  if (
    state.serviceIntegration &&
    state.serviceIntegration.initialized !== false
  ) {
    issues.push('ServiceIntegration may not be fully shut down');
  }

  // 7. Verify download watcher is cleared
  if (state.downloadWatcher !== null) {
    issues.push('downloadWatcher is not null');
  }

  // 8. Verify tray is destroyed
  if (state.tray !== null) {
    issues.push('tray is not null');
  }

  // Log verification results
  if (issues.length === 0) {
    logger.info('[SHUTDOWN-VERIFY] All resources verified as released');
  } else {
    logger.warn(
      `[SHUTDOWN-VERIFY] Found ${issues.length} potential resource leaks:`,
    );
    issues.forEach((issue) => logger.warn(`[SHUTDOWN-VERIFY]   - ${issue}`));
  }
}

/**
 * Kill ChromaDB process with platform-specific handling
 * @param {Object} chromaDbProcess - ChromaDB process reference
 * @returns {Promise<void>}
 */
async function killChromaDbProcess(chromaDbProcess) {
  if (!chromaDbProcess) return;

  logger.info(
    `[ChromaDB] Stopping ChromaDB server process (PID: ${chromaDbProcess.pid})`,
  );

  try {
    // Remove all listeners first
    chromaDbProcess.removeAllListeners();

    if (isWindows) {
      const { asyncSpawn } = require('../utils/asyncSpawnUtils');
      const result = await asyncSpawn(
        'taskkill',
        ['/pid', chromaDbProcess.pid, '/f', '/t'],
        {
          windowsHide: true,
          timeout: 5000,
          encoding: 'utf8',
        },
      );

      if (result.status === 0) {
        logger.info('[ChromaDB] Process terminated successfully (taskkill)');
      } else if (result.error) {
        logger.error('[ChromaDB] Taskkill error:', result.error.message);
      } else {
        logger.warn('[ChromaDB] Taskkill exited with code:', result.status);
      }
    } else {
      const { execSync } = require('child_process');
      try {
        execSync(`kill -TERM -${chromaDbProcess.pid}`, { timeout: 100 });
        logger.info('[ChromaDB] Sent SIGTERM to process group');

        try {
          execSync('sleep 2', { timeout: 3000 });
        } catch {
          // Timeout is fine
        }

        try {
          execSync(`kill -KILL -${chromaDbProcess.pid}`, { timeout: 100 });
          logger.info('[ChromaDB] Sent SIGKILL to process group');
        } catch {
          logger.info('[ChromaDB] Process already terminated');
        }
      } catch {
        logger.info('[ChromaDB] Process already terminated or not found');
      }
    }

    // Verify process is terminated
    try {
      process.kill(chromaDbProcess.pid, 0);
      logger.warn(
        '[ChromaDB] Process may still be running after kill attempt!',
      );
    } catch (e) {
      if (e.code === 'ESRCH') {
        logger.info('[ChromaDB] Process confirmed terminated');
      } else {
        logger.warn('[ChromaDB] Process check error:', e.message);
      }
    }
  } catch (e) {
    logger.error('[ChromaDB] Error stopping ChromaDB process:', e);
  }
}

/**
 * Run all cleanup operations with timeout
 * @param {Object} state - Application state references
 * @param {Object} services - Service references
 * @returns {Promise<void>}
 */
async function runCleanup(state, services) {
  const cleanupStartTime = Date.now();
  logger.info('[SHUTDOWN] Starting cleanup with 5-second timeout...');

  const cleanupPromise = (async () => {
    // Clean up all intervals first
    if (state.metricsInterval) {
      clearInterval(state.metricsInterval);
      state.metricsInterval = null;
      logger.info('[CLEANUP] Metrics interval cleared');
    }

    // Clean up download watcher
    if (state.downloadWatcher) {
      try {
        state.downloadWatcher.stop();
        state.downloadWatcher = null;
        logger.info('[CLEANUP] Download watcher stopped');
      } catch (error) {
        logger.error('[CLEANUP] Failed to stop download watcher:', error);
      }
    }

    // Clean up child process listeners
    for (const cleanup of state.childProcessListeners) {
      try {
        cleanup();
      } catch (error) {
        logger.error(
          '[CLEANUP] Failed to clean up child process listener:',
          error,
        );
      }
    }
    state.childProcessListeners = [];

    // Clean up global process listeners
    for (const cleanup of state.globalProcessListeners) {
      try {
        cleanup();
      } catch (error) {
        logger.error(
          '[CLEANUP] Failed to clean up global process listener:',
          error,
        );
      }
    }
    state.globalProcessListeners = [];

    // Clean up app event listeners
    for (const cleanup of state.eventListeners) {
      try {
        cleanup();
      } catch (error) {
        logger.error('[CLEANUP] Failed to clean up app event listener:', error);
      }
    }
    state.eventListeners = [];

    // Clean up IPC listeners
    try {
      ipcMain.removeAllListeners();
      logger.info('[CLEANUP] All IPC listeners removed');
    } catch (error) {
      logger.error('[CLEANUP] Failed to remove IPC listeners:', error);
    }

    // Clean up tray
    if (services.destroyTray) {
      services.destroyTray();
    }

    // Use StartupManager for graceful shutdown
    try {
      const { getStartupManager } = require('../services/startup');
      const startupManager = getStartupManager();
      await startupManager.shutdown();
      logger.info('[SHUTDOWN] StartupManager cleanup completed');
    } catch (error) {
      logger.error('[SHUTDOWN] StartupManager cleanup failed:', error);
    }

    // Legacy chromaDbProcess cleanup
    if (state.chromaDbProcess) {
      await killChromaDbProcess(state.chromaDbProcess);
      state.chromaDbProcess = null;
    }

    // Clean up service integration
    if (state.serviceIntegration) {
      try {
        await state.serviceIntegration.shutdown?.();
        logger.info('[CLEANUP] Service integration shut down');
      } catch (error) {
        logger.error(
          '[CLEANUP] Failed to shut down service integration:',
          error,
        );
      }
    }

    // Clean up settings service
    if (state.settingsService) {
      try {
        state.settingsService.shutdown?.();
        logger.info('[CLEANUP] Settings service shut down');
      } catch (error) {
        logger.error('[CLEANUP] Failed to shut down settings service:', error);
      }
    }

    // Clean up system analytics
    try {
      const systemAnalytics = require('./systemAnalytics');
      systemAnalytics.destroy();
      logger.info('[CLEANUP] System analytics destroyed');
    } catch {
      // Silently ignore destroy errors
    }

    // Post-shutdown verification
    const shutdownTimeout = 10000;
    try {
      await Promise.race([
        verifyShutdownCleanup(state),
        new Promise((_, reject) =>
          setTimeout(
            () => reject(new Error('Shutdown verification timeout')),
            shutdownTimeout,
          ),
        ),
      ]);
    } catch (error) {
      logger.warn(
        '[SHUTDOWN-VERIFY] Verification failed or timed out:',
        error.message,
      );
    }
  })();

  // Race cleanup against timeout
  const timeoutPromise = new Promise((_, reject) =>
    setTimeout(
      () => reject(new Error('Cleanup timeout exceeded')),
      CLEANUP_TIMEOUT,
    ),
  );

  try {
    await Promise.race([cleanupPromise, timeoutPromise]);
    const elapsed = Date.now() - cleanupStartTime;
    logger.info(`[SHUTDOWN] Cleanup completed successfully in ${elapsed}ms`);
  } catch (error) {
    const elapsed = Date.now() - cleanupStartTime;
    if (error.message === 'Cleanup timeout exceeded') {
      logger.error(
        `[SHUTDOWN] Cleanup timed out after ${elapsed}ms (max: ${CLEANUP_TIMEOUT}ms)`,
      );
      logger.error(
        '[SHUTDOWN] Forcing app quit. Some resources may not be properly released.',
      );
    } else {
      logger.error(
        `[SHUTDOWN] Cleanup failed after ${elapsed}ms:`,
        error.message,
      );
    }
  }
}

module.exports = {
  verifyShutdownCleanup,
  killChromaDbProcess,
  runCleanup,
  CLEANUP_TIMEOUT,
};

/**
 * IPC handlers for service health monitoring
 */
import { ipcMain } from 'electron';
import { logger } from '../../shared/logger';
import { container } from '../core/ServiceContainer';
import { withRequestId, withErrorHandling, compose } from './validation';

logger.setContext('IPC:ServiceHealth');

/**
 * Register service health IPC handlers
 */
export function registerServiceHealthHandlers() {
  // Get health status for all services - with middleware
  ipcMain.handle(
    'service:health:all',
    compose(
      withErrorHandling,
      withRequestId
    )(async () => {
      const states = container.getAllServiceStates();
      return {
        success: true,
        services: states,
        timestamp: Date.now(),
      };
    })
  );

  // Get health status for a specific service - with middleware
  ipcMain.handle(
    'service:health:get',
    compose(
      withErrorHandling,
      withRequestId
    )(async (event, serviceName) => {
      const state = container.getServiceState(serviceName);

      if (!state) {
        return {
          success: false,
          error: `Service '${serviceName}' not found`,
        };
      }

      // If service has a health check method, run it
      if (container.isReady(serviceName)) {
        try {
          const service = await container.get(serviceName);
          if (service && typeof (service as any).healthCheck === 'function') {
            const healthy = await (service as any).healthCheck();
            (state as any).healthy = healthy;
          }
        } catch (error) {
          logger.warn(`[ServiceHealth] Health check failed for ${serviceName}`, {
            error: (error as Error).message,
          });
          (state as any).healthy = false;
          (state as any).healthError = (error as Error).message;
        }
      }

      return {
        success: true,
        state,
        timestamp: Date.now(),
      };
    })
  );

  // Get service statistics - with middleware
  ipcMain.handle(
    'service:stats',
    compose(
      withErrorHandling,
      withRequestId
    )(async () => {
      const stats: any = {
        total: 0,
        ready: 0,
        initializing: 0,
        failed: 0,
        stopped: 0,
        services: {},
      };

      const states = container.getAllServiceStates();

      for (const state of states) {
        stats.total++;
        stats[(state as any).state] = (stats[(state as any).state] || 0) + 1;

        // Try to get additional stats from services that support it
        if ((state as any).state === 'ready') {
          try {
            const service = await container.get((state as any).name);
            if (service && typeof (service as any).getStats === 'function') {
              stats.services[(state as any).name] = await (service as any).getStats();
            } else if (service && typeof (service as any).getState === 'function') {
              stats.services[(state as any).name] = (service as any).getState();
            }
          } catch (error) {
            logger.debug(`[ServiceHealth] Could not get stats for ${(state as any).name}`, {
              error: (error as Error).message,
            });
          }
        }
      }

      return {
        success: true,
        stats,
        timestamp: Date.now(),
      };
    })
  );

  logger.info('[ServiceHealth] IPC handlers registered');
}

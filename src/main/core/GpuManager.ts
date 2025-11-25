import { app } from 'electron';
import { logger } from '../../shared/logger';

class GpuManager {
  GPU_FAILURE_RESET_WINDOW: number;
  cleanupHandlers: any[];
  gpuFailureCount: number;
  lastGpuFailureTime: number;

  constructor() {
    this.gpuFailureCount = 0;
    this.lastGpuFailureTime = 0;
    this.GPU_FAILURE_RESET_WINDOW = 60 * 60 * 1000; // 1 hour
    this.cleanupHandlers = [];
  }

  setup() {
    this.applyGpuFlags();
    this.monitorGpuProcess();
  }

  applyGpuFlags() {
    const forceSoftwareRenderer =
      process.env.STRATOSORT_FORCE_SOFTWARE_GPU === '1' ||
      process.env.ELECTRON_FORCE_SOFTWARE === '1';

    try {
      if (forceSoftwareRenderer) {
        app.disableHardwareAcceleration();
        logger.warn(
          '[GPU] Hardware acceleration disabled via STRATOSORT_FORCE_SOFTWARE_GPU',
        );
      } else {
        // Use ANGLE with D3D11 backend for better Windows compatibility
        const angleBackend = process.env.ANGLE_BACKEND || 'd3d11';
        app.commandLine.appendSwitch('use-angle', angleBackend);

        // Only set use-gl if explicitly requested
        const glImplementation = process.env.STRATOSORT_GL_IMPLEMENTATION;
        if (glImplementation) {
          app.commandLine.appendSwitch('use-gl', glImplementation);
          logger.info(`[GPU] Custom GL implementation set: ${glImplementation}`);
        }

        // Safer GPU settings
        app.commandLine.appendSwitch('ignore-gpu-blocklist');

        // Production/Dev specific optimizations (moved from main)
        const isDev = process.env.NODE_ENV === 'development';
        if (!forceSoftwareRenderer) {
             app.commandLine.appendSwitch('enable-gpu-rasterization');
             app.commandLine.appendSwitch('enable-zero-copy');
             logger.info(`[GPU] Acceleration flags enabled (${isDev ? 'Development' : 'Production'})`);
        }

        logger.info(`[GPU] Flags set: ANGLE=${angleBackend}`);
      }
    } catch (e) {
      logger.warn(
        '[GPU] Failed to apply GPU flags:',
        e?.message || 'Unknown error',
      );
    }
  }

  monitorGpuProcess() {
    const gpuProcessHandler = (event, details) => {
      if (details?.type === 'GPU') {
        const now = Date.now();

        // Reset counter if last failure was more than 1 hour ago
        if (now - this.lastGpuFailureTime > this.GPU_FAILURE_RESET_WINDOW) {
          this.gpuFailureCount = 0;
          logger.debug('[GPU] Failure counter reset after stability window');
        }

        this.gpuFailureCount += 1;
        this.lastGpuFailureTime = now;

        logger.error('[GPU] Process exited', {
          reason: details?.reason,
          exitCode: details?.exitCode,
          crashCount: this.gpuFailureCount,
          lastFailure: new Date(this.lastGpuFailureTime).toISOString(),
        });

        if (
          this.gpuFailureCount >= 2 &&
          process.env.STRATOSORT_FORCE_SOFTWARE_GPU !== '1'
        ) {
          logger.warn(
            '[GPU] Repeated GPU failures detected. Set STRATOSORT_FORCE_SOFTWARE_GPU=1 to force software rendering.',
          );
        }
      }
    };

    app.on('child-process-gone', gpuProcessHandler);

    // Return cleanup function
    return () => app.removeListener('child-process-gone', gpuProcessHandler);
  }
}

export default new GpuManager();

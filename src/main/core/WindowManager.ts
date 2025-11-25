import { screen } from 'electron';
import { logger } from '../../shared/logger';
import createMainWindow from './createWindow';

class WindowManager {
  currentSettings: any;
  isQuitting: any;
  mainWindow: any;
  windowEventHandlers: any;
  constructor() {
    this.mainWindow = null;
    this.windowEventHandlers = new Map();
    this.isQuitting = false;
    this.currentSettings = {};
  }

  setQuitting(value) {
    this.isQuitting = value;
  }

  updateSettings(settings) {
    this.currentSettings = settings;
  }

  getMainWindow() {
    return this.mainWindow;
  }

  createOrRestore() {
    logger.debug('[DEBUG] WindowManager.createOrRestore() called');

    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      this.restoreExistingWindow();
      return this.mainWindow;
    }

    // No existing window, create a new one
    this.mainWindow = createMainWindow();
    this.setupEventHandlers();

    return this.mainWindow;
  }

  restoreExistingWindow() {
    logger.debug('[DEBUG] Window already exists, restoring state...');

    // Prevent dangling pointer issues by deferring state changes
    setImmediate(() => {
      if (!this.mainWindow || this.mainWindow.isDestroyed()) return;

      try {
        // 1. Fullscreen state
        if (this.mainWindow.isFullScreen()) {
          logger.debug('[WINDOW] Window is fullscreen, focusing');
          this.mainWindow.focus();
          return;
        }

        // 2. Minimized state
        if (this.mainWindow.isMinimized()) {
          logger.debug('[WINDOW] Window is minimized, restoring...');
          setTimeout(() => {
            if (!this.mainWindow || this.mainWindow.isDestroyed()) return;
            this.mainWindow.restore();
            setTimeout(() => {
              if (!this.mainWindow || this.mainWindow.isDestroyed()) return;
              if (!this.mainWindow.isVisible()) {
                this.mainWindow.show();
              }
              this.mainWindow.focus();
            }, 50);
          }, 0);
          return;
        }

        // 3. Maximized state
        if (this.mainWindow.isMaximized()) {
          if (!this.mainWindow.isVisible()) {
            this.mainWindow.show();
          }
          this.mainWindow.focus();
          return;
        }

        // 4. Hidden state
        if (!this.mainWindow.isVisible()) {
          this.mainWindow.show();
          this.mainWindow.focus();
          return;
        }

        // 5. Normal visible state
        this.mainWindow.focus();
      } catch (error) {
        logger.error('[WINDOW] Error during window state restoration:', error);
      }
    });

    // 6. Ensure window is on screen
    if (this.mainWindow.isVisible() && !this.mainWindow.isMinimized()) {
        this.ensureOnScreen();
    }

    // 7. Force foreground on Windows
    if (process.platform === 'win32' && this.mainWindow.isVisible()) {
      this.mainWindow.setAlwaysOnTop(true);
      setTimeout(() => {
        if (this.mainWindow && !this.mainWindow.isDestroyed()) {
          this.mainWindow.setAlwaysOnTop(false);
        }
      }, 100);
    }
  }

  ensureOnScreen() {
      try {
        const bounds = this.mainWindow.getBounds();
        const displays = screen.getAllDisplays();

        const windowCenter = {
          x: bounds.x + bounds.width / 2,
          y: bounds.y + bounds.height / 2,
        };

        const isOnScreen = displays.some((display) => {
          const { x, y, width, height } = display.bounds;
          return (
            windowCenter.x >= x &&
            windowCenter.x <= x + width &&
            windowCenter.y >= y &&
            windowCenter.y <= y + height
          );
        });

        if (!isOnScreen) {
          logger.warn('[WINDOW] Window was off-screen, centering on primary display');
          this.mainWindow.center();
        }
      } catch (error) {
        logger.debug('[WINDOW] Could not check screen bounds:', error.message);
      }
  }

  setupEventHandlers() {
    const handlers = {
      minimize: () => logger.debug('[WINDOW] Window minimized'),
      restore: () => logger.debug('[WINDOW] Window restored'),
      show: () => logger.debug('[WINDOW] Window shown'),
      hide: () => logger.debug('[WINDOW] Window hidden'),
      focus: () => logger.debug('[WINDOW] Window focused'),
      blur: () => logger.debug('[WINDOW] Window lost focus'),
      close: (e) => {
        if (!this.isQuitting && this.currentSettings?.backgroundMode) {
          e.preventDefault();
          this.mainWindow.hide();
        }
      },
      closed: () => this.cleanup()
    };

    // Register and track handlers
    Object.entries(handlers).forEach(([event, handler]) => {
        this.windowEventHandlers.set(event, handler);
        this.mainWindow.on(event, handler);
    });

    // Handle destroy
    const destroyHandler = () => {
        logger.warn('[WINDOW] Window destroyed - forcing cleanup');
        this.cleanup();
    };
    this.mainWindow.once('destroy', destroyHandler);
  }

  cleanup() {
    if (this.windowEventHandlers.size > 0) {
      for (const [event, handler] of this.windowEventHandlers) {
        try {
          if (this.mainWindow && !this.mainWindow.isDestroyed()) {
            this.mainWindow.removeListener(event, handler);
          }
        } catch (e) {
          logger.error(`[WINDOW] Failed to remove ${event} listener:`, e);
        }
      }
      this.windowEventHandlers.clear();
    }
    this.mainWindow = null;
  }
}

export default new WindowManager();

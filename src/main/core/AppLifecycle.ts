import { app, ipcMain, shell, dialog, BrowserWindow } from 'electron';
import { autoUpdater } from 'electron-updater';
import { logger } from '../../shared/logger';
import { IPC_CHANNELS } from '../../shared/constants';

// Core Managers
import GpuManager from './GpuManager';
import WindowManager from './WindowManager';
import TrayManager from './TrayManager';
import MenuManager from './MenuManager';
import { verifyIpcHandlersRegistered } from './ipcVerification';
import { loadCustomFolders, saveCustomFolders } from './customFolders';
import systemAnalytics from './systemAnalytics';

// Services
import { getStartupManager } from '../services/StartupManager';
import ServiceIntegration from '../services/ServiceIntegration';
import { getService as getSettingsService } from '../services/SettingsService';
import DownloadWatcher from '../services/DownloadWatcher';
import { resumeIncompleteBatches } from '../services/OrganizeResumeService';
import { registerServices, initializeCriticalServices, shutdownServices } from './serviceRegistry';

// Utils
import {
  loadOllamaConfig,
  setOllamaModel,
  setOllamaVisionModel,
  setOllamaEmbeddingModel,
  getOllama,
  getOllamaModel,
  getOllamaVisionModel,
  getOllamaEmbeddingModel,
  getOllamaHost,
  setOllamaHost,
  buildOllamaOptions
} from '../ollamaUtils';
import { registerAllIpc } from '../ipc/index';
import { analyzeDocumentFile } from '../analysis/ollamaDocumentAnalysis';
import { analyzeImageFile } from '../analysis/ollamaImageAnalysis';
import { scanDirectory } from '../folderScanner';
import tesseract from 'node-tesseract-ocr';

const isDev = process.env.NODE_ENV === 'development';

class AppLifecycle {
    currentSettings: any;
    customFolders: any;
    downloadWatcher: any;
    gpuManager: any;
    isQuitting: any;
    menuManager: any;
    metricsInterval: any;
    serviceIntegration: any;
    settingsService: any;
    trayManager: any;
    windowManager: any;

    constructor() {
      this.gpuManager = GpuManager;
      this.windowManager = WindowManager;
      this.menuManager = new MenuManager(() => this.windowManager.getMainWindow());
      this.trayManager = new TrayManager({
        getMainWindow: () => this.windowManager.getMainWindow(),
        getDownloadWatcher: () => this.downloadWatcher,
        onToggleAutoSort: async (enable) => this.toggleAutoSort(enable)
      });

      this.serviceIntegration = null;
      this.settingsService = null;
      this.downloadWatcher = null;
      this.metricsInterval = null;
      this.customFolders = [];
      this.isQuitting = false;
      this.currentSettings = {};

      // Bind methods
      this.handleSettingsChanged = this.handleSettingsChanged.bind(this);
    }

    async initialize() {
      logger.info('[STARTUP] Organizer AI App - Main Process Started');

      // GPU Setup
      this.gpuManager.setup();

      // Single Instance Lock
      const gotTheLock = app.requestSingleInstanceLock();
      if (!gotTheLock) {
        app.quit();
        return;
      }

      app.on('second-instance', () => this.handleSecondInstance());
      app.on('window-all-closed', () => {
        if (process.platform !== 'darwin') app.quit();
      });
      app.on('activate', () => {
          if (!BrowserWindow.getAllWindows().length) this.windowManager.createOrRestore();
      });
      app.on('before-quit', () => this.shutdown());

      // Ready Handler
      await app.whenReady();
      await this.onReady();
    }

    async onReady() {
      try {
        // Register all services in the container
        logger.info('[STARTUP] Registering services in container');
        registerServices();

        // Initialize critical services (non-lazy services)
        logger.info('[STARTUP] Initializing critical services');
        await initializeCriticalServices();

        const startupManager = getStartupManager();

        // Run Startup Manager
        let startupResult;
        try {
          const { TIMEOUTS } = await import('../../shared/performanceConstants.js');
          const startupPromise = startupManager.startup();
          const timeoutPromise = new Promise((_, reject) =>
            setTimeout(() => reject(new Error('Startup manager timeout')), TIMEOUTS.SERVICE_STARTUP || 30000)
          );
          startupResult = await Promise.race([startupPromise, timeoutPromise]);
          logger.info('[STARTUP] Startup manager completed successfully');
        } catch (error) {
          logger.error('[STARTUP] Startup manager failed:', error);
          startupResult = { degraded: true, error: error.message };
        }

        // Windows integration
        this.handleCommandLineArgs();
        this.setupJumpList();

        // DevTools
        if (isDev) await this.installDevTools();

        // Load Custom Folders
        try {
          this.customFolders = await loadCustomFolders();
          logger.info(`[STARTUP] Loaded ${this.customFolders.length} custom folders`);
        } catch (error) {
          logger.error('[STARTUP] Failed to load custom folders:', error);
          this.customFolders = [];
        }

        // Initialize Services
        this.serviceIntegration = new ServiceIntegration();
        await this.serviceIntegration.initialize();

        this.settingsService = getSettingsService();
        this.currentSettings = await this.settingsService.load();

        // Resume Batches
        this.checkIncompleteBatches();

        // Verify Models
        if (startupResult?.services?.ollama?.success) {
           this.verifyModels();
        }

        // Register IPC
        this.registerIpc();

        // Menu & Tray
        this.menuManager.createApplicationMenu();
        this.trayManager.initialize();

        // Verify IPC Handlers
        await verifyIpcHandlersRegistered();

        // Create Window
        this.windowManager.createOrRestore();
        this.handleSettingsChanged(this.currentSettings); // Initialize watcher

        // Background Tasks
        this.runBackgroundTasks();

      } catch (error) {
        logger.error('[STARTUP] Initialization failed:', error);
        this.windowManager.createOrRestore(); // Degraded mode
      }
    }

    handleCommandLineArgs() {
        const args = process.argv.slice(1);
        if (args.includes('--open-documents')) {
            try {
                shell.openPath(app.getPath('documents'));
            } catch (e) { logger.error('Failed to open documents', e); }
        }
        if (args.includes('--analyze-folder')) {
            const win = this.windowManager.getMainWindow();
            if (win) {
                win.focus();
                win.webContents.send('operation-progress', { type: 'hint', message: 'Use Select Directory to analyze a folder' });
            }
        }
    }

    setupJumpList() {
        if (process.platform === 'win32') {
            try {
                app.setAppUserModelId('com.stratosort.app');
                app.setJumpList([
                    {
                        type: 'tasks',
                        items: [
                            { type: 'task', title: 'Analyze Folder...', program: process.execPath, args: '--analyze-folder', iconPath: process.execPath, iconIndex: 0 },
                            { type: 'task', title: 'Open Documents Folder', program: process.execPath, args: '--open-documents', iconPath: process.execPath, iconIndex: 0 }
                        ]
                    }
                ]);
            } catch (e) { logger.error('Failed to set Jump List', e); }
        }
    }

    async installDevTools() {
        if (process.env.REACT_DEVTOOLS === 'true') {
            try {
                const { default: installExtension, REACT_DEVELOPER_TOOLS } = await import('electron-devtools-installer');
                await installExtension(REACT_DEVELOPER_TOOLS);
            } catch (e) { logger.warn('Failed to install React DevTools', e); }
        }
    }

    registerIpc() {
      const getMainWindow = () => this.windowManager.getMainWindow();
      const getServiceIntegration = () => this.serviceIntegration;
      const getCustomFolders = () => this.customFolders;
      const setCustomFolders = (folders) => { this.customFolders = folders; };

      registerAllIpc({
        ipcMain,
        IPC_CHANNELS,
        logger,
        dialog,
        shell,
        systemAnalytics,
        getMainWindow,
        getServiceIntegration,
        getCustomFolders,
        setCustomFolders,
        saveCustomFolders,
        analyzeDocumentFile,
        analyzeImageFile,
        tesseract,
        getOllama,
        getOllamaModel,
        getOllamaVisionModel,
        getOllamaEmbeddingModel,
        getOllamaHost,
        buildOllamaOptions,
        scanDirectory,
        settingsService: this.settingsService,
        setOllamaHost,
        setOllamaModel,
        setOllamaVisionModel,
        setOllamaEmbeddingModel,
        onSettingsChanged: this.handleSettingsChanged,
      });

      // Error reporting
      ipcMain.on('renderer-error-report', (event, errorData) => {
        logger.error('[RENDERER ERROR]', errorData);
      });
    }

    handleSecondInstance() {
      const mainWindow = this.windowManager.getMainWindow();
      if (mainWindow && !mainWindow.isDestroyed()) {
        if (mainWindow.isMinimized()) mainWindow.restore();
        mainWindow.focus();
      } else {
        this.windowManager.createOrRestore();
      }
    }

    handleSettingsChanged(settings) {
        if (!settings || typeof settings !== 'object') return;
        this.currentSettings = settings;
        this.windowManager.updateSettings(settings);

        // Update Download Watcher
        const enabled = settings.autoOrganize;
        if (enabled) {
          if (!this.downloadWatcher) {
            this.downloadWatcher = new DownloadWatcher({
              analyzeDocumentFile,
              analyzeImageFile,
              getCustomFolders: () => this.customFolders,
              autoOrganizeService: this.serviceIntegration?.autoOrganizeService,
              settingsService: this.settingsService,
            });
            this.downloadWatcher.start();
          }
        } else if (this.downloadWatcher) {
          this.downloadWatcher.stop();
          this.downloadWatcher = null;
        }

        this.trayManager.updateMenu();
    }

    async toggleAutoSort(enable) {
        if (this.settingsService) {
          const merged = await this.settingsService.save({ autoOrganize: enable });
          this.handleSettingsChanged(merged);
        } else {
          this.handleSettingsChanged({ ...this.currentSettings, autoOrganize: enable });
        }
    }

    async checkIncompleteBatches() {
        // Fire and forget resume
        setTimeout(() => {
            try {
                resumeIncompleteBatches(
                    this.serviceIntegration,
                    logger,
                    () => this.windowManager.getMainWindow()
                );
            } catch (e) {
                logger.warn('[RESUME] Failed to schedule resume:', e);
            }
        }, 1000);
    }

    async verifyModels() {
        const { default: ModelVerifier } = await import('../services/ModelVerifier.js');
        const verifier = new ModelVerifier();
        const status = await verifier.verifyEssentialModels();
        if (!status.success) {
            logger.warn('[STARTUP] Missing AI models:', status.missingModels);
        } else {
            logger.info('[STARTUP] Models verified');
        }
    }

    runBackgroundTasks() {
        // Metrics Interval
        this.metricsInterval = setInterval(async () => {
          try {
            const win = this.windowManager.getMainWindow();
            if (win && !win.isDestroyed()) {
               const metrics = await systemAnalytics.collectMetrics();
               win.webContents.send('system-metrics', metrics);
            }
          } catch (e) {
               logger.error('[METRICS] Failed:', e);
          }
        }, 30000);

        // Auto Updater
        if (!isDev) {
            this.setupAutoUpdater();
        }

        // Ollama config load (fire and forget)
        (async () => {
          try {
            const cfg = await loadOllamaConfig();
            if (cfg.selectedTextModel) setOllamaModel(cfg.selectedTextModel);
            if (cfg.selectedVisionModel) setOllamaVisionModel(cfg.selectedVisionModel);
            if (cfg.selectedEmbeddingModel) setOllamaEmbeddingModel(cfg.selectedEmbeddingModel);
          } catch (error) {
            logger.warn('[STARTUP] Failed to load Ollama config:', error.message);
          }
        })();
    }

    setupAutoUpdater() {
        autoUpdater.autoDownload = true;
        autoUpdater.on('update-available', () => {
            const win = this.windowManager.getMainWindow();
            if (win) win.webContents.send('app:update', { status: 'available' });
        });
        autoUpdater.on('update-not-available', () => {
            const win = this.windowManager.getMainWindow();
            if (win) win.webContents.send('app:update', { status: 'none' });
        });
        autoUpdater.on('update-downloaded', () => {
            const win = this.windowManager.getMainWindow();
            if (win) win.webContents.send('app:update', { status: 'ready' });
        });
        autoUpdater.checkForUpdatesAndNotify().catch(e => logger.error('Update check failed', e));
    }

    async shutdown() {
      this.isQuitting = true;
      this.windowManager.setQuitting(true);
      logger.info('[SHUTDOWN] Starting cleanup...');

      if (this.metricsInterval) clearInterval(this.metricsInterval);
      if (this.downloadWatcher) this.downloadWatcher.stop();

      this.trayManager.destroy();

      if (this.serviceIntegration) await this.serviceIntegration.shutdown();

      // StartupManager shutdown
      try {
          const startupManager = getStartupManager();
          await startupManager.shutdown();
      } catch (e) {
          logger.error('StartupManager shutdown failed', e);
      }

      // Shutdown ServiceContainer (gracefully stops all managed services)
      logger.info('[SHUTDOWN] Shutting down service container');
      await shutdownServices();
    }
}

export default AppLifecycle;

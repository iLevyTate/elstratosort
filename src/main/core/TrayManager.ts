import { Tray, Menu, app, nativeImage } from 'electron';
import path from 'path';
import { logger } from '../../shared/logger';

class TrayManager {
  getDownloadWatcher: any;
  getMainWindow: any;
  isQuitting: any;
  onToggleAutoSort: any;
  tray: any;
  constructor({ getMainWindow, getDownloadWatcher, onToggleAutoSort }) {
    this.getMainWindow = getMainWindow;
    this.getDownloadWatcher = getDownloadWatcher;
    this.onToggleAutoSort = onToggleAutoSort;
    this.tray = null;
    this.isQuitting = false;
  }

  initialize() {
    try {
      const iconPath = path.join(
        __dirname,
        process.platform === 'win32'
          ? '../../../assets/icons/icons/win/icon.ico'
          : process.platform === 'darwin'
            ? '../../../assets/icons/icons/png/24x24.png'
            : '../../../assets/icons/icons/png/16x16.png',
      );
      // Check if path resolves correctly - __dirname is src/main/core
      // Assets are likely in root/assets

      const trayIcon = nativeImage.createFromPath(iconPath);
      if (process.platform === 'darwin') {
        trayIcon.setTemplateImage(true);
      }
      this.tray = new Tray(trayIcon);
      this.tray.setToolTip('StratoSort');
      this.updateMenu();
    } catch (e) {
      logger.warn('[TRAY] initialization failed', e);
    }
  }

  updateMenu() {
    if (!this.tray) return;

    const downloadWatcher = this.getDownloadWatcher();
    const contextMenu = Menu.buildFromTemplate([
      {
        label: 'Open StratoSort',
        click: () => {
          const win = this.getMainWindow();
          // Note: Window creation/restoration should be handled by WindowManager,
          // but if we don't have a window, we might need to request one.
          // For now, we assume getMainWindow returns one or null.
          // If null, we might need a callback to create it.
          if (win) {
             if (win.isMinimized()) win.restore();
             win.show();
             win.focus();
          } else {
              // Fallback if window is destroyed/null - notify main process?
              // In simple-main logic, it called createWindow().
              // We'll leave this for now, or pass 'createWindow' callback.
          }
        },
      },
      {
        label: downloadWatcher ? 'Pause Auto-Sort' : 'Resume Auto-Sort',
        click: async () => {
          if (this.onToggleAutoSort) {
              await this.onToggleAutoSort(!downloadWatcher);
              this.updateMenu();
          }
        },
      },
      { type: 'separator' },
      {
        label: 'Quit',
        click: () => {
          this.isQuitting = true;
          app.quit();
        },
      },
    ]);
    this.tray.setContextMenu(contextMenu);
  }

  destroy() {
      if (this.tray) {
          this.tray.destroy();
          this.tray = null;
      }
  }
}

export default TrayManager;

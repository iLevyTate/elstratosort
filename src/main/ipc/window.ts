import { withRequestId, withErrorHandling, compose } from './validation';

export function registerWindowIpc({ ipcMain, IPC_CHANNELS, getMainWindow }) {
  // Minimize Handler - with middleware
  ipcMain.handle(
    IPC_CHANNELS.WINDOW.MINIMIZE,
    compose(
      withErrorHandling,
      withRequestId
    )(async () => {
      const win = getMainWindow();
      if (win && !win.isDestroyed()) win.minimize();
      return true;
    }),
  );

  // Maximize Handler - with middleware
  ipcMain.handle(
    IPC_CHANNELS.WINDOW.MAXIMIZE,
    compose(
      withErrorHandling,
      withRequestId
    )(async () => {
      const win = getMainWindow();
      if (win && !win.isDestroyed()) win.maximize();
      return true;
    }),
  );

  // Unmaximize Handler - with middleware
  ipcMain.handle(
    IPC_CHANNELS.WINDOW.UNMAXIMIZE,
    compose(
      withErrorHandling,
      withRequestId
    )(async () => {
      const win = getMainWindow();
      if (win && !win.isDestroyed()) win.unmaximize();
      return true;
    }),
  );

  // Toggle Maximize Handler - with middleware
  ipcMain.handle(
    IPC_CHANNELS.WINDOW.TOGGLE_MAXIMIZE,
    compose(
      withErrorHandling,
      withRequestId
    )(async () => {
      const win = getMainWindow();
      if (win && !win.isDestroyed()) {
        if (win.isMaximized()) win.unmaximize();
        else win.maximize();
        return win.isMaximized();
      }
      return false;
    }),
  );

  // Is Maximized Handler - with middleware
  ipcMain.handle(
    IPC_CHANNELS.WINDOW.IS_MAXIMIZED,
    compose(
      withErrorHandling,
      withRequestId
    )(async () => {
      const win = getMainWindow();
      return win && !win.isDestroyed() ? win.isMaximized() : false;
    }),
  );

  // Close Handler - with middleware
  ipcMain.handle(
    IPC_CHANNELS.WINDOW.CLOSE,
    compose(
      withErrorHandling,
      withRequestId
    )(async () => {
      const win = getMainWindow();
      if (win && !win.isDestroyed()) win.close();
      return true;
    }),
  );
}

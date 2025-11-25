import { Menu, app, shell } from 'electron';

const isDev = process.env.NODE_ENV === 'development';

class MenuManager {
  getMainWindow: () => any;

  constructor(getMainWindow: () => any) {
    this.getMainWindow = getMainWindow;
  }

  createApplicationMenu() {
    const template = [
      {
        label: 'File',
        submenu: [
          {
            label: 'Select Files',
            accelerator: 'CmdOrCtrl+O',
            click: () => {
              const mainWindow = this.getMainWindow();
              if (mainWindow) {
                mainWindow.webContents.send('menu-action', 'select-files');
              }
            },
          },
          {
            label: 'Select Folder',
            accelerator: 'CmdOrCtrl+Shift+O',
            click: () => {
                const mainWindow = this.getMainWindow();
                if (mainWindow) {
                mainWindow.webContents.send('menu-action', 'select-folder');
              }
            },
          },
          { type: 'separator' },
          {
            label: 'Settings',
            accelerator: 'CmdOrCtrl+,',
            click: () => {
                const mainWindow = this.getMainWindow();
                if (mainWindow) {
                mainWindow.webContents.send('menu-action', 'open-settings');
              }
            },
          },
          { type: 'separator' },
          {
            label: 'Exit',
            accelerator: process.platform === 'darwin' ? 'Cmd+Q' : 'Ctrl+Q',
            click: () => {
              app.quit();
            },
          },
        ],
      },
      {
        label: 'Edit',
        submenu: [
          { label: 'Undo', accelerator: 'CmdOrCtrl+Z', role: 'undo' },
          { label: 'Redo', accelerator: 'CmdOrCtrl+Y', role: 'redo' },
          { type: 'separator' },
          { label: 'Cut', accelerator: 'CmdOrCtrl+X', role: 'cut' },
          { label: 'Copy', accelerator: 'CmdOrCtrl+C', role: 'copy' },
          { label: 'Paste', accelerator: 'CmdOrCtrl+V', role: 'paste' },
          { label: 'Select All', accelerator: 'CmdOrCtrl+A', role: 'selectAll' },
        ],
      },
      {
        label: 'View',
        submenu: [
          { label: 'Reload', accelerator: 'CmdOrCtrl+R', role: 'reload' },
          {
            label: 'Force Reload',
            accelerator: 'CmdOrCtrl+Shift+R',
            role: 'forceReload',
          },
          { type: 'separator' },
          {
            label: 'Toggle Fullscreen',
            accelerator: 'F11',
            role: 'togglefullscreen',
          },
          ...(isDev
            ? [
                { type: 'separator' },
                {
                  label: 'Toggle Developer Tools',
                  accelerator: 'F12',
                  role: 'toggleDevTools',
                },
              ]
            : []),
        ],
      },
      {
        label: 'Window',
        submenu: [
          { label: 'Minimize', accelerator: 'CmdOrCtrl+M', role: 'minimize' },
          { label: 'Close', accelerator: 'CmdOrCtrl+W', role: 'close' },
        ],
      },
      {
        label: 'Help',
        submenu: [
          {
            label: 'About StratoSort',
            click: () => {
                const mainWindow = this.getMainWindow();
                if (mainWindow) {
                mainWindow.webContents.send('menu-action', 'show-about');
              }
            },
          },
          { type: 'separator' },
          {
            label: 'Documentation',
            click: () => {
              shell.openExternal('https://github.com');
            },
          },
        ],
      },
    ];

    const menu = Menu.buildFromTemplate(template as any);
    Menu.setApplicationMenu(menu);
  }
}

export default MenuManager;

/**
 * File Selection Handlers
 *
 * Handlers for file selection dialogs.
 *
 * @module ipc/files/fileSelectionHandlers
 */

const path = require('path');
const fs = require('fs').promises;
const {
  SUPPORTED_DOCUMENT_EXTENSIONS,
  SUPPORTED_IMAGE_EXTENSIONS,
  SUPPORTED_ARCHIVE_EXTENSIONS,
} = require('../../../shared/constants');
const { withErrorLogging } = require('../withErrorLogging');
const { logger } = require('../../../shared/logger');

logger.setContext('IPC:Files:Selection');

/**
 * Build file filters for dialog
 */
function buildFileFilters() {
  const stripDot = (exts) =>
    exts.map((e) => (e.startsWith('.') ? e.slice(1) : e));

  const docs = stripDot([
    ...SUPPORTED_DOCUMENT_EXTENSIONS,
    '.txt',
    '.md',
    '.rtf',
  ]);
  const images = stripDot(SUPPORTED_IMAGE_EXTENSIONS);
  const archives = stripDot(SUPPORTED_ARCHIVE_EXTENSIONS);
  const allSupported = Array.from(new Set([...docs, ...images, ...archives]));

  return [
    { name: 'All Supported Files', extensions: allSupported },
    { name: 'Documents', extensions: docs },
    { name: 'Images', extensions: images },
    { name: 'Archives', extensions: archives },
    { name: 'All Files', extensions: ['*'] },
  ];
}

/**
 * Recursively scan folder for supported files
 */
async function scanFolder(
  folderPath,
  supportedExts,
  log,
  depth = 0,
  maxDepth = 3,
) {
  if (depth > maxDepth) return [];

  try {
    const items = await fs.readdir(folderPath, { withFileTypes: true });
    const foundFiles = [];

    for (const item of items) {
      const itemPath = path.join(folderPath, item.name);

      if (item.isFile()) {
        const ext = path.extname(item.name).toLowerCase();
        if (supportedExts.includes(ext)) {
          foundFiles.push(itemPath);
        }
      } else if (
        item.isDirectory() &&
        !item.name.startsWith('.') &&
        !item.name.startsWith('node_modules')
      ) {
        const subFiles = await scanFolder(
          itemPath,
          supportedExts,
          log,
          depth + 1,
          maxDepth,
        );
        foundFiles.push(...subFiles);
      }
    }

    return foundFiles;
  } catch (error) {
    log.warn(
      `[FILE-SELECTION] Error scanning folder ${folderPath}:`,
      error.message,
    );
    return [];
  }
}

/**
 * Get supported extensions list
 */
function getSupportedExtensions() {
  return Array.from(
    new Set([
      ...SUPPORTED_DOCUMENT_EXTENSIONS,
      ...SUPPORTED_IMAGE_EXTENSIONS,
      ...SUPPORTED_ARCHIVE_EXTENSIONS,
      '.txt',
      '.md',
      '.rtf',
    ]),
  );
}

/**
 * Register file selection IPC handlers
 */
function registerFileSelectionHandlers({
  ipcMain,
  IPC_CHANNELS,
  logger: handlerLogger,
  dialog,
  getMainWindow,
}) {
  const log = handlerLogger || logger;
  const supportedExts = getSupportedExtensions();

  // Select files handler
  ipcMain.handle(
    IPC_CHANNELS.FILES.SELECT,
    withErrorLogging(log, async () => {
      log.info('[MAIN-FILE-SELECT] ===== FILE SELECTION HANDLER CALLED =====');

      const mainWindow = getMainWindow();
      log.info('[MAIN-FILE-SELECT] mainWindow exists?', !!mainWindow);

      try {
        // Focus window before dialog
        if (mainWindow) {
          if (!mainWindow.isFocused()) {
            log.info('[MAIN-FILE-SELECT] Focusing window before dialog...');
            mainWindow.focus();
          }
          if (mainWindow.isMinimized()) mainWindow.restore();
          if (!mainWindow.isVisible()) mainWindow.show();
          if (!mainWindow.isFocused()) mainWindow.focus();

          const { TIMEOUTS } = require('../../../shared/performanceConstants');
          await new Promise((resolve) => {
            const t = setTimeout(resolve, TIMEOUTS.DELAY_BATCH);
            try {
              t.unref();
            } catch {
              // Non-fatal
            }
          });
        }

        const result = await dialog.showOpenDialog(mainWindow || null, {
          properties: ['openFile', 'multiSelections', 'dontAddToRecent'],
          title: 'Select Files to Organize',
          buttonLabel: 'Select Files',
          filters: buildFileFilters(),
        });

        log.info('[MAIN-FILE-SELECT] Dialog closed, result:', result);

        if (result.canceled || !result.filePaths.length) {
          return { success: false, files: [] };
        }

        log.info(`[FILE-SELECTION] Selected ${result.filePaths.length} items`);

        const allFiles = [];

        for (const selectedPath of result.filePaths) {
          try {
            const stats = await fs.stat(selectedPath);

            if (stats.isFile()) {
              const ext = path.extname(selectedPath).toLowerCase();
              if (supportedExts.includes(ext)) {
                allFiles.push(selectedPath);
              }
            } else if (stats.isDirectory()) {
              const folderFiles = await scanFolder(
                selectedPath,
                supportedExts,
                log,
              );
              allFiles.push(...folderFiles);
            }
          } catch (err) {
            log.warn(
              `[FILE-SELECTION] Error checking path ${selectedPath}:`,
              err.message,
            );
          }
        }

        log.info(
          `[FILE-SELECTION] Total files after expansion: ${allFiles.length}`,
        );

        return {
          success: true,
          files: allFiles.map((filePath) => ({
            path: filePath,
            name: path.basename(filePath),
          })),
          count: allFiles.length,
        };
      } catch (error) {
        log.error('[FILE-SELECTION] Error in file selection:', error);
        return { success: false, error: error.message, files: [] };
      }
    }),
  );
}

module.exports = { registerFileSelectionHandlers };

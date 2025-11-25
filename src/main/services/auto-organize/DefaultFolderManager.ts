import { logger } from '../../../shared/logger';
import path from 'path';
import { promises as fs } from 'fs';
import { app } from 'electron';

interface SmartFolder {
  id?: string;
  name: string;
  path: string;
  description?: string;
  keywords?: string[];
  isDefault?: boolean;
  createdAt?: string;
}

class DefaultFolderManager {
  logger: typeof logger;

  constructor() {
    this.logger = logger;
  }

  /**
   * Find or create default folder for unanalyzed files
   */
  async ensureDefaultFolder(smartFolders: SmartFolder[]): Promise<SmartFolder | null> {
    // Find existing default folder
    const defaultFolder = smartFolders.find(
      (f) => f.isDefault || f.name.toLowerCase() === 'uncategorized'
    );

    if (defaultFolder) {
      return defaultFolder;
    }

    // Create new one
    return await this._createDefaultFolder(smartFolders);
  }

  /**
   * Create default folder for unanalyzed files
   * PRIVATE - Use ensureDefaultFolder instead
   */
  async _createDefaultFolder(smartFolders: SmartFolder[]): Promise<SmartFolder | null> {
    this.logger.warn(
      '[DefaultFolderManager] No default folder found, creating emergency fallback'
    );

    try {
      // CRITICAL FIX: Validate documentsDir exists and is accessible
      const documentsDir = app.getPath('documents');

      if (!documentsDir || typeof documentsDir !== 'string') {
        throw new Error('Invalid documents directory path from Electron');
      }

      // CRITICAL FIX (BUG #4): Enhanced path validation with UNC path detection
      // Prevent path traversal attacks including UNC paths on Windows (\\server\share)

      // Step 1: Check for UNC paths which can bypass security checks on Windows
      // UNC paths start with \\ or // followed by server name
      const isUNCPath = (p: string): boolean => {
        if (!p || typeof p !== 'string') return false;
        return p.startsWith('\\\\') || p.startsWith('//');
      };

      if (isUNCPath(documentsDir)) {
        throw new Error(
          `Security violation: UNC paths not allowed in documents directory. ` +
            `Detected UNC path: ${documentsDir}`
        );
      }

      // Step 2: Sanitize folder path components to prevent directory traversal
      const sanitizedBaseName = 'StratoSort'.replace(/[^a-zA-Z0-9_-]/g, '_');
      const sanitizedFolderName = 'Uncategorized'.replace(
        /[^a-zA-Z0-9_-]/g,
        '_'
      );

      // Step 3: Use path.resolve to normalize path and prevent traversal
      const defaultFolderPath = path.resolve(
        documentsDir,
        sanitizedBaseName,
        sanitizedFolderName
      );

      // Step 4: Additional UNC path check on resolved path
      if (isUNCPath(defaultFolderPath)) {
        throw new Error(
          `Security violation: UNC path detected after resolution. ` +
            `Path ${defaultFolderPath} is a UNC path which is not allowed`
        );
      }

      // Step 5: Verify the resolved path is actually inside documents directory
      // This prevents path traversal even if path components contain ".."
      const resolvedDocumentsDir = path.resolve(documentsDir);

      // On Windows, normalize path separators for consistent comparison
      const normalizedDefaultPath = defaultFolderPath
        .replace(/\\/g, '/')
        .toLowerCase();
      const normalizedDocumentsDir = resolvedDocumentsDir
        .replace(/\\/g, '/')
        .toLowerCase();

      if (!normalizedDefaultPath.startsWith(normalizedDocumentsDir)) {
        throw new Error(
          `Security violation: Attempted path traversal detected. ` +
            `Path ${defaultFolderPath} is outside documents directory ${resolvedDocumentsDir}`
        );
      }

      // Step 6: Additional validation - check for suspicious path patterns
      const suspiciousPatterns = [
        /\.\./, // Parent directory reference
        /\.\.[\\/]/, // Parent with separator
        /[\\/]\.\./, // Separator with parent
        /^[a-zA-Z]:/, // Different drive letter (if not expected)
        /\0/, // Null bytes
        /[<>:"|?*]/, // Invalid Windows filename chars in unexpected positions
      ];

      for (const pattern of suspiciousPatterns) {
        if (
          pattern.test(defaultFolderPath.substring(resolvedDocumentsDir.length))
        ) {
          throw new Error(
            `Security violation: Suspicious path pattern detected. ` +
              `Path contains potentially dangerous characters or sequences`
          );
        }
      }

      this.logger.info(
        '[DefaultFolderManager] Path validation passed for emergency default folder',
        {
          documentsDir: resolvedDocumentsDir,
          defaultFolderPath,
          sanitized: true,
          uncPathCheck: 'passed',
          traversalCheck: 'passed',
        }
      );

      // HIGH PRIORITY FIX #6: Add fs.lstat check to detect and reject symbolic links
      // Check if directory already exists before creating
      // This prevents race conditions and permission errors
      let dirExists = false;
      let isSymbolicLink = false;
      try {
        // Use lstat instead of stat to detect symbolic links
        const stats = await fs.lstat(defaultFolderPath);
        dirExists = stats.isDirectory();
        isSymbolicLink = stats.isSymbolicLink();

        // HIGH PRIORITY FIX #6: Reject symbolic links for security
        if (isSymbolicLink) {
          throw new Error(
            `Security violation: Symbolic links are not allowed for safety reasons. ` +
              `Path ${defaultFolderPath} is a symbolic link.`
          );
        }
      } catch (error: any) {
        // Directory doesn't exist, which is fine - we'll create it
        if (error.code !== 'ENOENT') {
          // Some other error (permission denied, symbolic link rejection, etc.)
          throw error;
        }
      }

      if (!dirExists) {
        // Ensure directory exists with proper error handling
        await fs.mkdir(defaultFolderPath, { recursive: true });
        this.logger.info(
          '[DefaultFolderManager] Created emergency default folder at:',
          defaultFolderPath
        );
      } else {
        this.logger.info(
          '[DefaultFolderManager] Emergency default folder already exists at:',
          defaultFolderPath
        );
      }

      // Create default folder object
      const defaultFolder: SmartFolder = {
        id: 'emergency-default-' + Date.now(),
        name: 'Uncategorized',
        path: defaultFolderPath,
        description: 'Emergency fallback folder for files without analysis',
        keywords: [],
        isDefault: true,
        createdAt: new Date().toISOString(),
      };

      // Add to smartFolders array for this session
      smartFolders.push(defaultFolder);

      this.logger.info(
        '[DefaultFolderManager] Emergency default folder configured at:',
        defaultFolderPath
      );

      return defaultFolder;
    } catch (error: any) {
      this.logger.error(
        '[DefaultFolderManager] Failed to create emergency default folder:',
        {
          error: error.message,
          stack: error.stack,
        }
      );

      return null;
    }
  }
}

export default DefaultFolderManager;

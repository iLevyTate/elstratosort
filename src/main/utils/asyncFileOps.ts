/**
 * Asynchronous file operations utilities
 * Provides async alternatives to synchronous Node.js fs operations
 */
import { promises as fs } from 'fs';
import * as path from 'path';
import type { Stats } from 'fs';
import { logger } from '../../shared/logger';

logger.setContext('AsyncFileOps');

/**
 * Check if a file or directory exists asynchronously
 *
 * @param filePath - Path to check
 * @returns True if exists, false otherwise
 */
export async function exists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

/**
 * Safely read a file with error handling
 *
 * @param filePath - Path to file
 * @param options - Encoding or options object
 * @returns File contents or null on error
 */
export async function safeReadFile(
  filePath: string,
  options: BufferEncoding | { encoding: BufferEncoding } = 'utf8'
): Promise<string | Buffer | null> {
  try {
    return await fs.readFile(filePath, options);
  } catch (error) {
    logger.warn(`Failed to read file ${filePath}:`, (error as Error).message);
    return null;
  }
}

/**
 * Safely write a file with directory creation
 *
 * @param filePath - Path to file
 * @param data - Data to write
 * @param options - Encoding or options object
 * @returns True on success, false on error
 */
export async function safeWriteFile(
  filePath: string,
  data: string | Buffer,
  options: BufferEncoding | { encoding: BufferEncoding } = 'utf8'
): Promise<boolean> {
  try {
    // Ensure directory exists
    const dir = path.dirname(filePath);
    await ensureDirectory(dir);

    await fs.writeFile(filePath, data, options);
    return true;
  } catch (error) {
    logger.error(`Failed to write file ${filePath}:`, (error as Error).message);
    return false;
  }
}

/**
 * Ensure a directory exists, creating it if necessary
 *
 * @param dirPath - Directory path
 * @returns True if directory exists or was created
 */
export async function ensureDirectory(dirPath: string): Promise<boolean> {
  try {
    await fs.mkdir(dirPath, { recursive: true });
    return true;
  } catch (error) {
    // Check if it already exists
    if ((error as NodeJS.ErrnoException).code === 'EEXIST') {
      return true;
    }
    logger.error(`Failed to create directory ${dirPath}:`, (error as Error).message);
    return false;
  }
}

/**
 * Get file stats asynchronously
 *
 * @param filePath - Path to file
 * @returns File stats or null on error
 */
export async function safeStat(filePath: string): Promise<Stats | null> {
  try {
    return await fs.stat(filePath);
  } catch (error) {
    logger.warn(`Failed to get stats for ${filePath}:`, (error as Error).message);
    return null;
  }
}

interface ListFilesOptions {
  filter?: (fullPath: string, entry: any) => boolean;
  recursive?: boolean;
  withStats?: boolean;
}

interface FileWithStats {
  path: string;
  stats: Stats | null;
}

/**
 * List files in a directory with optional filtering
 *
 * @param dirPath - Directory path
 * @param options - Options for listing
 * @returns Array of file paths or objects with stats
 */
export async function listFiles(
  dirPath: string,
  options: ListFilesOptions = {}
): Promise<string[] | FileWithStats[]> {
  const { filter, recursive = false, withStats = false } = options;
  const results: any[] = [];

  try {
    const entries = await fs.readdir(dirPath, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(dirPath, entry.name);

      if (entry.isDirectory() && recursive) {
        const subFiles = await listFiles(fullPath, options);
        results.push(...subFiles);
      } else if (entry.isFile()) {
        if (!filter || filter(fullPath, entry)) {
          if (withStats) {
            const stats = await safeStat(fullPath);
            results.push({ path: fullPath, stats });
          } else {
            results.push(fullPath);
          }
        }
      }
    }
  } catch (error) {
    logger.error(`Failed to list files in ${dirPath}:`, (error as Error).message);
  }

  return results;
}

/**
 * Copy a file asynchronously
 *
 * @param src - Source file path
 * @param dest - Destination file path
 * @param overwrite - Whether to overwrite existing file
 * @returns True on success
 */
export async function copyFile(
  src: string,
  dest: string,
  overwrite = false
): Promise<boolean> {
  try {
    // Check if destination exists
    if (!overwrite && (await exists(dest))) {
      logger.warn(`Destination file already exists: ${dest}`);
      return false;
    }

    // Ensure destination directory exists
    await ensureDirectory(path.dirname(dest));

    await fs.copyFile(src, dest);
    return true;
  } catch (error) {
    logger.error(`Failed to copy ${src} to ${dest}:`, (error as Error).message);
    return false;
  }
}

/**
 * Move/rename a file asynchronously
 *
 * @param src - Source file path
 * @param dest - Destination file path
 * @param overwrite - Whether to overwrite existing file
 * @returns True on success
 */
export async function moveFile(
  src: string,
  dest: string,
  overwrite = false
): Promise<boolean> {
  try {
    // Check if destination exists
    if (!overwrite && (await exists(dest))) {
      logger.warn(`Destination file already exists: ${dest}`);
      return false;
    }

    // Ensure destination directory exists
    await ensureDirectory(path.dirname(dest));

    await fs.rename(src, dest);
    return true;
  } catch (error) {
    // If rename fails (cross-device), try copy and delete
    if ((error as NodeJS.ErrnoException).code === 'EXDEV') {
      const copied = await copyFile(src, dest, overwrite);
      if (copied) {
        await safeDelete(src);
        return true;
      }
    }
    logger.error(`Failed to move ${src} to ${dest}:`, (error as Error).message);
    return false;
  }
}

/**
 * Delete a file or directory safely
 *
 * @param targetPath - Path to delete
 * @param recursive - Delete directories recursively
 * @returns True on success
 */
export async function safeDelete(
  targetPath: string,
  recursive = false
): Promise<boolean> {
  try {
    const stats = await safeStat(targetPath);
    if (!stats) {
      return true; // Already doesn't exist
    }

    if (stats.isDirectory()) {
      await fs.rmdir(targetPath, { recursive });
    } else {
      await fs.unlink(targetPath);
    }
    return true;
  } catch (error) {
    logger.error(`Failed to delete ${targetPath}:`, (error as Error).message);
    return false;
  }
}

/**
 * Read JSON file asynchronously with error handling
 *
 * @param filePath - Path to JSON file
 * @param defaultValue - Default value on error or missing file
 * @returns Parsed JSON or default value
 */
export async function readJSON<T = any>(
  filePath: string,
  defaultValue: T | null = null
): Promise<T | null> {
  try {
    const content = await fs.readFile(filePath, 'utf8');
    return JSON.parse(content) as T;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
      logger.warn(`Failed to read JSON file ${filePath}:`, (error as Error).message);
    }
    return defaultValue;
  }
}

/**
 * Write JSON file asynchronously with formatting
 *
 * @param filePath - Path to JSON file
 * @param data - Data to write
 * @param spaces - Number of spaces for indentation
 * @returns True on success
 */
export async function writeJSON(
  filePath: string,
  data: any,
  spaces = 2
): Promise<boolean> {
  try {
    const json = JSON.stringify(data, null, spaces);
    return await safeWriteFile(filePath, json);
  } catch (error) {
    logger.error(`Failed to write JSON file ${filePath}:`, (error as Error).message);
    return false;
  }
}

/**
 * Process files in batches to avoid overwhelming the system
 *
 * @param files - Array of file paths
 * @param processor - Async function to process each file
 * @param batchSize - Number of files to process concurrently
 * @returns Results of processing
 */
export async function processBatch<T>(
  files: string[],
  processor: (file: string) => Promise<T>,
  batchSize = 5
): Promise<(T | null)[]> {
  const results: (T | null)[] = [];

  for (let i = 0; i < files.length; i += batchSize) {
    const batch = files.slice(i, i + batchSize);
    const batchResults = await Promise.all(
      batch.map((file) =>
        processor(file).catch((err) => {
          logger.error(`Error processing ${file}:`, (err as Error).message);
          return null;
        })
      )
    );
    results.push(...batchResults);
  }

  return results;
}

interface WatchOptions {
  persistent?: boolean;
  recursive?: boolean;
}

/**
 * Watch a file or directory for changes
 *
 * @param targetPath - Path to watch
 * @param callback - Callback on change
 * @param options - Watch options
 * @returns Function to stop watching
 */
export async function watchPath(
  targetPath: string,
  callback: (eventType: string, filename: string | null) => void,
  options: WatchOptions = {}
): Promise<() => void> {
  const { persistent = true, recursive = false } = options;

  try {
    const fsSync = await import('fs');
    const watcher = fsSync.watch(
      targetPath,
      { persistent, recursive },
      (eventType, filename) => {
        callback(eventType, filename);
      }
    );

    return () => watcher.close();
  } catch (error) {
    logger.error(`Failed to watch ${targetPath}:`, (error as Error).message);
    return () => {};
  }
}

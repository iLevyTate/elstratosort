/**
 * File Type Definitions
 * Shared file-related types for main and renderer processes
 */

import type { AnalysisResult } from './analysis';

/**
 * Processing states for files in the workflow
 */
export type ProcessingState =
  | 'pending'
  | 'analyzing'
  | 'ready'
  | 'organizing'
  | 'organized'
  | 'error';

/**
 * Source of how a file was added to the system
 */
export type FileSource =
  | 'file_selection'
  | 'folder_scan'
  | 'drag_drop'
  | 'download_watcher'
  | 'unknown';

/**
 * File metadata - basic file system information
 */
export interface FileMetadata {
  /** Full path to the file */
  path: string;
  /** File name including extension */
  name: string;
  /** File extension with leading dot (e.g., '.pdf') */
  extension: string;
  /** File size in bytes */
  size: number;
  /** Creation timestamp (ISO string) */
  created?: string;
  /** Last modified timestamp (ISO string) */
  modified?: string;
  /** MIME type if available */
  mimeType?: string | null;
}

/**
 * File object used throughout the application
 */
export interface FileObject {
  /** File name including extension */
  name: string;
  /** Full path to the file */
  path: string;
  /** File size in bytes */
  size?: number;
  /** File extension with leading dot */
  extension?: string;
  /** MIME type */
  type?: string;
  /** Analysis result if analyzed */
  analysis?: AnalysisResult | null;
  /** Current processing state */
  processingState?: ProcessingState;
  /** Error message if in error state */
  error?: string | null;
  /** How the file was added */
  source?: FileSource;
  /** When the file was added to the system */
  addedAt?: string;
}

/**
 * Sanitized file object for safe IPC transfer
 * Strips potentially circular references and functions
 */
export interface SanitizedFile {
  name: string;
  path: string;
  size?: number;
  extension?: string;
  type?: string;
  analysis?: {
    category?: string;
    suggestedName?: string;
    confidence?: number;
    summary?: string;
  } | null;
}

/**
 * File operation types
 */
export type FileOperationType = 'move' | 'copy' | 'rename' | 'delete';

/**
 * File operation request
 */
export interface FileOperation {
  type: FileOperationType;
  source: string;
  destination?: string;
  confidence?: number;
  method?: string;
}

/**
 * File stats from the file system
 */
export interface FileStats {
  size: number;
  created: Date | string;
  modified: Date | string;
  isFile: boolean;
  isDirectory: boolean;
}

/**
 * File type categories for organization
 */
export type FileTypeCategory =
  | 'Documents'
  | 'Images'
  | 'Videos'
  | 'Audio'
  | 'Archives'
  | 'Code'
  | 'Data'
  | 'Files';

/**
 * File with analysis ready for organization
 */
export interface FileWithAnalysis extends FileObject {
  analysis: AnalysisResult;
}

/**
 * Batch file selection result
 */
export interface FileSelectionResult {
  files: FileObject[];
  totalSize: number;
  canceled: boolean;
}

/**
 * Suggestion and Organization Type Definitions
 * Types for file organization suggestions and operations
 */

import type { FileObject, SanitizedFile, FileOperation } from './file';

/**
 * Folder suggestion for a file
 */
export interface FolderSuggestion {
  /** Target folder name */
  folder: string;
  /** Target folder path */
  path?: string;
  /** Suggestion confidence (0-1) */
  confidence?: number;
  /** Explanation of why this folder was suggested */
  reason?: string;
}

/**
 * File suggestion result
 */
export interface FileSuggestionResult {
  /** Whether suggestion was successful */
  success: boolean;
  /** Primary suggestion */
  primary?: FolderSuggestion;
  /** Alternative suggestions */
  alternatives?: FolderSuggestion[];
  /** Overall confidence score */
  confidence?: number;
  /** Explanation text */
  explanation?: string;
  /** Error message if failed */
  error?: string;
}

/**
 * Batch suggestion group
 */
export interface BatchSuggestionGroup {
  /** Target folder name */
  folder: string;
  /** Target folder path */
  path?: string;
  /** Group confidence (0-1) */
  confidence: number;
  /** Files in this group */
  files: Array<
    FileObject & {
      suggestion?: FolderSuggestion;
      alternatives?: FolderSuggestion[];
    }
  >;
}

/**
 * Batch suggestions result
 */
export interface BatchSuggestionsResult {
  /** Whether batch suggestion was successful */
  success: boolean;
  /** Grouped suggestions */
  groups: BatchSuggestionGroup[];
  /** Error message if failed */
  error?: string;
}

/**
 * Confidence thresholds for organization
 */
export interface ConfidenceThresholds {
  /** Threshold for automatic approval (default: 0.8) */
  autoApprove: number;
  /** Threshold for requiring review (default: 0.5) */
  requireReview: number;
  /** Threshold for rejection (default: 0.3) */
  reject: number;
}

/**
 * Organization options
 */
export interface OrganizeOptions {
  /** Custom confidence threshold */
  confidenceThreshold?: number;
  /** Default location for unmatched files */
  defaultLocation?: string;
  /** Preserve original file names */
  preserveNames?: boolean;
  /** Batch size for processing */
  batchSize?: number;
  /** Enable auto-organize for new files */
  autoOrganizeEnabled?: boolean;
}

/**
 * Organized file result
 */
export interface OrganizedFile {
  /** The file that was organized */
  file: SanitizedFile;
  /** Applied suggestion */
  suggestion?: FolderSuggestion;
  /** Final destination path */
  destination: string;
  /** Confidence score */
  confidence: number;
  /** Organization method used */
  method: OrganizationMethod;
  /** Alternative suggestions */
  alternatives?: FolderSuggestion[];
  /** Explanation */
  explanation?: string;
}

/**
 * File requiring manual review
 */
export interface ReviewFile {
  /** The file needing review */
  file: SanitizedFile;
  /** Suggested folder */
  suggestion: FolderSuggestion;
  /** Final destination path */
  destination: string;
  /** Confidence score */
  confidence: number;
  /** Organization method */
  method: string;
  /** Alternative suggestions */
  alternatives?: FolderSuggestion[];
  /** Explanation for review */
  explanation?: string;
}

/**
 * Failed file result
 */
export interface FailedFile {
  /** The file that failed */
  file: SanitizedFile;
  /** Failure reason */
  reason: string;
  /** File path */
  filePath: string;
  /** When the failure occurred */
  timestamp: string;
  /** Batch ID for tracking */
  batchId: string;
}

/**
 * Organization method used
 */
export type OrganizationMethod =
  | 'automatic'
  | 'batch-automatic'
  | 'fallback'
  | 'batch-fallback'
  | 'low-confidence-fallback'
  | 'batch-low-confidence-fallback'
  | 'no-analysis-default'
  | 'suggestion-error-fallback'
  | 'manual';

/**
 * Organization results
 */
export interface OrganizeResults {
  /** Successfully organized files */
  organized: OrganizedFile[];
  /** Files requiring review */
  needsReview: ReviewFile[];
  /** Failed files */
  failed: FailedFile[];
  /** File operations to execute */
  operations: FileOperation[];
}

/**
 * Batch organization results
 */
export interface BatchOrganizeResult {
  /** File operations */
  operations: FileOperation[];
  /** Organized groups */
  groups: Array<{
    folder: string;
    files: FileObject[];
    confidence: number;
    autoApproved: boolean;
    partialSuccess?: boolean;
  }>;
  /** Skipped groups */
  skipped: Array<{
    folder: string;
    files: FileObject[];
    confidence: number;
    reason: string;
  }>;
  /** Failed files */
  failed: Array<{
    file?: FileObject;
    error: string;
    filePath?: string;
    timestamp: string;
    batchId?: string;
    group?: string;
    files?: FileObject[];
  }>;
}

/**
 * Auto-organize result for single file
 */
export interface AutoOrganizeResult {
  source: string;
  destination: string;
  confidence: number;
  suggestion: FolderSuggestion;
}

/**
 * Organization statistics
 */
export interface OrganizationStatistics {
  /** Number of user patterns learned */
  userPatterns: number;
  /** Feedback history count */
  feedbackHistory: number;
  /** Folder usage statistics */
  folderUsageStats: Array<[string, number]>;
  /** Current thresholds */
  thresholds: ConfidenceThresholds;
}

/**
 * Feedback record for learning
 */
export interface SuggestionFeedback {
  /** File that was organized */
  file: FileObject;
  /** Suggestion that was used */
  suggestion: FolderSuggestion;
  /** Whether the user accepted the suggestion */
  accepted: boolean;
  /** Timestamp */
  timestamp: string;
}

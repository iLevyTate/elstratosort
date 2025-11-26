/**
 * Typed API Definitions
 *
 * This file provides type-safe definitions for the IPC API,
 * ensuring type consistency between main and renderer processes.
 *
 * Types are derived from Zod schemas where applicable, providing
 * runtime validation and compile-time type safety.
 */

import type {
  FileInput,
  NamingConvention,
  SmartFolderInput,
  AnalysisRequest,
  SingleFileAnalysis,
  FileOpenRequest,
  FileDeleteRequest,
  FileMoveRequest,
  SmartFolderAddRequest,
  SmartFolderEditRequest,
  SmartFolderDeleteRequestInput,
  AutoOrganizeRequest,
  OllamaModelCheckRequest,
  OllamaModelPullRequest,
  FindSimilarRequest,
} from '../../main/ipc/schemas';

import type {
  SuccessResponse,
  ErrorResponse,
  IPCResponseEnvelope,
} from '../../main/ipc/responseHelpers';

// Re-export schema types for convenience
export type {
  FileInput,
  NamingConvention,
  SmartFolderInput,
  AnalysisRequest,
  SingleFileAnalysis,
  FileOpenRequest,
  FileDeleteRequest,
  FileMoveRequest,
  SmartFolderAddRequest,
  SmartFolderEditRequest,
  SmartFolderDeleteRequestInput,
  AutoOrganizeRequest,
  OllamaModelCheckRequest,
  OllamaModelPullRequest,
  FindSimilarRequest,
};

// Re-export response types
export type { SuccessResponse, ErrorResponse, IPCResponseEnvelope };

// ==================== File API Types ====================

/**
 * Result of file selection dialog
 */
export interface FileSelectionResult {
  files: FileInput[];
  canceled: boolean;
}

/**
 * Result of directory selection
 */
export interface DirectorySelectionResult {
  path: string | null;
  canceled: boolean;
}

/**
 * File operation result
 */
export interface FileOperationResult {
  success: boolean;
  source?: string;
  destination?: string;
  error?: string;
}

// ==================== Analysis API Types ====================

/**
 * Analysis result for a single file
 */
export interface AnalysisResultData {
  category: string;
  suggestedName: string;
  confidence: number;
  summary?: string;
  keywords?: string[];
  metadata?: Record<string, unknown>;
  model?: string | null;
}

/**
 * Batch analysis result
 */
export interface BatchAnalysisResultData {
  successful: Array<{
    path: string;
    analysis: AnalysisResultData;
  }>;
  failed: Array<{
    path: string;
    error: string;
  }>;
  duration: number;
}

// ==================== Smart Folder API Types ====================

/**
 * Smart folder with all properties
 */
export interface SmartFolderData {
  id: string;
  name: string;
  path: string;
  description?: string;
  isDefault?: boolean;
  tags?: string[];
  createdAt?: string;
  updatedAt?: string;
}

/**
 * Smart folder match result
 */
export interface SmartFolderMatchResult {
  folder: SmartFolderData | null;
  confidence: number;
  matchType?: string;
}

// ==================== Organization API Types ====================

/**
 * Organization suggestion
 */
export interface OrganizationSuggestion {
  folder: string;
  path: string;
  confidence: number;
  reason?: string;
}

/**
 * Organization result for a single file
 */
export interface OrganizedFileResult {
  file: FileInput;
  destination: string;
  confidence: number;
  method: string;
  suggestion?: OrganizationSuggestion;
}

/**
 * Auto-organize result
 */
export interface AutoOrganizeResultData {
  organized: OrganizedFileResult[];
  needsReview: OrganizedFileResult[];
  failed: Array<{
    file: FileInput;
    reason: string;
  }>;
}

// ==================== Ollama API Types ====================

/**
 * Ollama model information
 */
export interface OllamaModelInfo {
  name: string;
  size: number;
  digest: string;
  modifiedAt: string;
  details?: {
    format?: string;
    family?: string;
    parameterSize?: string;
    quantizationLevel?: string;
  };
}

/**
 * Ollama connection test result
 */
export interface OllamaConnectionResult {
  connected: boolean;
  version?: string;
  error?: string;
}

/**
 * Model pull progress
 */
export interface ModelPullProgress {
  status: string;
  completed: number;
  total: number;
  percent: number;
}

// ==================== Settings API Types ====================

/**
 * Application settings
 */
export interface AppSettings {
  theme?: 'light' | 'dark' | 'system';
  defaultLocation?: string;
  autoOrganize?: boolean;
  confidenceThreshold?: number;
  namingConvention?: NamingConvention;
  [key: string]: unknown;
}

// ==================== Undo/Redo API Types ====================

/**
 * Undoable action
 */
export interface UndoableActionData {
  type: string;
  data: {
    originalPath?: string;
    newPath?: string;
    [key: string]: unknown;
  };
  timestamp: number;
  description: string;
}

// ==================== API Method Signatures ====================

/**
 * Type-safe API interface for the electron bridge.
 * This interface documents all available IPC methods and their types.
 */
export interface TypedElectronAPI {
  // File Operations
  files: {
    select(): Promise<IPCResponseEnvelope<FileSelectionResult>>;
    selectDirectory(): Promise<IPCResponseEnvelope<DirectorySelectionResult>>;
    getDocumentsPath(): Promise<IPCResponseEnvelope<string>>;
    open(request: FileOpenRequest): Promise<IPCResponseEnvelope<void>>;
    delete(request: FileDeleteRequest): Promise<IPCResponseEnvelope<void>>;
    move(
      request: FileMoveRequest,
    ): Promise<IPCResponseEnvelope<FileOperationResult>>;
    getStats(
      path: string,
    ): Promise<
      IPCResponseEnvelope<{ size: number; created: string; modified: string }>
    >;
  };

  // Smart Folders
  smartFolders: {
    getAll(): Promise<IPCResponseEnvelope<SmartFolderData[]>>;
    add(
      request: SmartFolderAddRequest,
    ): Promise<IPCResponseEnvelope<SmartFolderData>>;
    edit(
      request: SmartFolderEditRequest,
    ): Promise<IPCResponseEnvelope<SmartFolderData>>;
    delete(
      request: SmartFolderDeleteRequestInput,
    ): Promise<IPCResponseEnvelope<void>>;
    match(
      file: FileInput,
      folders: SmartFolderInput[],
    ): Promise<IPCResponseEnvelope<SmartFolderMatchResult>>;
  };

  // Analysis
  analysis: {
    analyzeDocument(
      request: SingleFileAnalysis,
    ): Promise<IPCResponseEnvelope<AnalysisResultData>>;
    analyzeImage(
      request: SingleFileAnalysis,
    ): Promise<IPCResponseEnvelope<AnalysisResultData>>;
    startBatch(
      request: AnalysisRequest,
    ): Promise<IPCResponseEnvelope<BatchAnalysisResultData>>;
    cancelBatch(): Promise<IPCResponseEnvelope<void>>;
  };

  // Organization
  organize: {
    auto(
      request: AutoOrganizeRequest,
    ): Promise<IPCResponseEnvelope<AutoOrganizeResultData>>;
    getStats(): Promise<
      IPCResponseEnvelope<{ filesOrganized: number; patterns: number }>
    >;
  };

  // Ollama
  ollama: {
    testConnection(): Promise<IPCResponseEnvelope<OllamaConnectionResult>>;
    getModels(): Promise<IPCResponseEnvelope<OllamaModelInfo[]>>;
    checkModel(
      request: OllamaModelCheckRequest,
    ): Promise<IPCResponseEnvelope<{ exists: boolean }>>;
    pullModel(
      request: OllamaModelPullRequest,
    ): Promise<IPCResponseEnvelope<void>>;
  };

  // Settings
  settings: {
    get(): Promise<IPCResponseEnvelope<AppSettings>>;
    save(settings: AppSettings): Promise<IPCResponseEnvelope<void>>;
  };

  // Undo/Redo
  undoRedo: {
    canUndo(): Promise<IPCResponseEnvelope<boolean>>;
    canRedo(): Promise<IPCResponseEnvelope<boolean>>;
    undo(): Promise<IPCResponseEnvelope<UndoableActionData | null>>;
    redo(): Promise<IPCResponseEnvelope<UndoableActionData | null>>;
    getHistory(): Promise<IPCResponseEnvelope<UndoableActionData[]>>;
  };
}

/**
 * Type guard to check if a response is successful
 */
export function isSuccessResponse<T>(
  response: IPCResponseEnvelope<T>,
): response is SuccessResponse<T> {
  return response.success === true;
}

/**
 * Type guard to check if a response is an error
 */
export function isErrorResponse(
  response: IPCResponseEnvelope,
): response is ErrorResponse {
  return response.success === false;
}

/**
 * Helper to extract data from a success response or throw on error
 */
export function unwrapResponse<T>(response: IPCResponseEnvelope<T>): T {
  if (isSuccessResponse(response)) {
    return response.data;
  }
  throw new Error(response.error.message);
}

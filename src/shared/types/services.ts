/**
 * Service Type Definitions
 * Types for service dependencies and interfaces
 */

import type { FileObject } from './file';
import type { SmartFolder } from './smartFolder';
import type {
  FileSuggestionResult,
  BatchSuggestionsResult,
  FolderSuggestion,
  ConfidenceThresholds,
} from './suggestion';
import type { AnalysisResult } from './analysis';

/**
 * Logger interface used throughout services
 */
export interface Logger {
  info(message: string, context?: Record<string, unknown>): void;
  error(message: string, context?: Record<string, unknown>): void;
  warn(message: string, context?: Record<string, unknown>): void;
  debug(message: string, context?: Record<string, unknown>): void;
  setContext(context: string): void;
}

/**
 * Suggestion service interface
 */
export interface ISuggestionService {
  /** Get suggestions for a single file */
  getSuggestionsForFile(
    file: FileObject,
    smartFolders: SmartFolder[],
    options?: { includeAlternatives?: boolean },
  ): Promise<FileSuggestionResult>;

  /** Get batch suggestions for multiple files */
  getBatchSuggestions(
    files: FileObject[],
    smartFolders: SmartFolder[],
    options?: {
      includeStructureAnalysis?: boolean;
      includeAlternatives?: boolean;
    },
  ): Promise<BatchSuggestionsResult>;

  /** Record user feedback for learning */
  recordFeedback(
    file: FileObject,
    suggestion: FolderSuggestion,
    accepted: boolean,
  ): Promise<void>;

  /** User-learned patterns */
  userPatterns?: Map<string, unknown>;
  /** Feedback history */
  feedbackHistory?: unknown[];
  /** Folder usage statistics */
  folderUsageStats?: Map<string, number>;
}

/**
 * Settings service interface
 */
export interface ISettingsService {
  /** Get a setting value */
  get<T = unknown>(key: string): T;
  /** Set a setting value */
  set(key: string, value: unknown): Promise<void>;
  /** Get all settings */
  getAll(): Record<string, unknown>;
  /** Save all settings */
  save(): Promise<void>;
  /** Reset to defaults */
  reset(): Promise<void>;
}

/**
 * Folder matching service interface
 */
export interface IFolderMatchingService {
  /** Match a file to the best folder */
  matchFile(
    file: FileObject,
    folders: SmartFolder[],
  ): Promise<{ folder: SmartFolder; confidence: number } | null>;

  /** Initialize service */
  initialize(): Promise<void>;
}

/**
 * Undo/Redo service interface
 */
export interface IUndoRedoService {
  /** Record an action */
  recordAction(action: UndoableAction): Promise<void>;
  /** Undo last action */
  undo(): Promise<UndoableAction | null>;
  /** Redo last undone action */
  redo(): Promise<UndoableAction | null>;
  /** Check if can undo */
  canUndo(): boolean;
  /** Check if can redo */
  canRedo(): boolean;
  /** Get action history */
  getHistory(): UndoableAction[];
  /** Clear history */
  clearHistory(): void;
}

/**
 * Undoable action record
 */
export interface UndoableAction {
  /** Action type */
  type: string;
  /** Action data */
  data: {
    originalPath?: string;
    newPath?: string;
    [key: string]: unknown;
  };
  /** When the action occurred */
  timestamp: number;
  /** Human-readable description */
  description: string;
}

/**
 * Analysis service interface
 */
export interface IAnalysisService {
  /** Analyze a document file */
  analyzeDocument(
    filePath: string,
    smartFolders?: SmartFolder[],
  ): Promise<AnalysisResult>;
  /** Analyze an image file */
  analyzeImage(
    filePath: string,
    smartFolders?: SmartFolder[],
  ): Promise<AnalysisResult>;
  /** Batch analyze files */
  analyzeBatch(
    filePaths: string[],
    options?: { concurrency?: number },
  ): Promise<{
    results: Map<string, AnalysisResult>;
    failed: Map<string, string>;
  }>;
}

/**
 * Ollama service interface
 */
export interface IOllamaService {
  /** Check if Ollama is available */
  isAvailable(): Promise<boolean>;
  /** Get available models */
  listModels(): Promise<OllamaModel[]>;
  /** Pull a model */
  pullModel(
    name: string,
    onProgress?: (progress: number) => void,
  ): Promise<void>;
  /** Generate text */
  generate(
    model: string,
    prompt: string,
    options?: OllamaGenerateOptions,
  ): Promise<string>;
  /** Generate with images */
  generateWithImages(
    model: string,
    prompt: string,
    images: string[],
    options?: OllamaGenerateOptions,
  ): Promise<string>;
}

/**
 * Ollama model info
 */
export interface OllamaModel {
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
 * Ollama generate options
 */
export interface OllamaGenerateOptions {
  temperature?: number;
  maxTokens?: number;
  topP?: number;
  topK?: number;
  seed?: number;
  timeout?: number;
}

/**
 * ChromaDB service interface
 */
export interface IChromaDBService {
  /** Initialize the service */
  initialize(): Promise<void>;
  /** Add documents */
  addDocuments(
    collectionName: string,
    documents: Array<{
      id: string;
      content: string;
      metadata?: Record<string, unknown>;
    }>,
  ): Promise<void>;
  /** Query similar documents */
  query(
    collectionName: string,
    queryText: string,
    topK?: number,
  ): Promise<Array<{ id: string; content: string; score: number }>>;
  /** Delete collection */
  deleteCollection(collectionName: string): Promise<void>;
}

/**
 * Service health status
 */
export interface ServiceHealth {
  /** Service name */
  service: string;
  /** Whether the service is healthy */
  healthy: boolean;
  /** Status message */
  message?: string;
  /** Last check timestamp */
  lastCheck: string;
  /** Additional details */
  details?: Record<string, unknown>;
}

/**
 * Auto-organize service dependencies
 */
export interface AutoOrganizeServiceDependencies {
  suggestionService: ISuggestionService;
  settingsService: ISettingsService;
  folderMatchingService: IFolderMatchingService;
  undoRedoService?: IUndoRedoService;
}

/**
 * Service state for monitoring
 */
export interface ServiceState {
  thresholds: ConfidenceThresholds;
  hasSuggestionService: boolean;
  hasSettingsService: boolean;
  hasFolderMatcher: boolean;
  hasUndoRedo: boolean;
  hasBatchOrganizer: boolean;
  hasDefaultFolderManager: boolean;
}

/**
 * Performance metrics
 */
export interface PerformanceMetrics {
  /** Operation name */
  operation: string;
  /** Duration in milliseconds */
  duration: number;
  /** Memory usage */
  memoryUsage?: number;
  /** Items processed */
  itemsProcessed?: number;
  /** Timestamp */
  timestamp: string;
}

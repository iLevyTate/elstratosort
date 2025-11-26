/**
 * Shared Type Definitions
 * Central export point for all shared types
 */

// File types
export type {
  ProcessingState,
  FileSource,
  FileMetadata,
  FileObject,
  SanitizedFile,
  FileOperationType,
  FileOperation,
  FileStats,
  FileTypeCategory,
  FileWithAnalysis,
  FileSelectionResult,
} from './file';

// Analysis types
export type {
  AnalysisResult,
  AnalysisOptions,
  BatchAnalysisRequest,
  BatchAnalysisResult,
  AnalysisProgress,
  AnalysisHistoryEntry,
  AnalysisStatistics,
  LLMAnalysisResponse,
  ConfidenceLevel,
} from './analysis';

export { getConfidenceLevel, getConfidenceColor } from './analysis';

// Smart folder types
export type {
  SmartFolder,
  SmartFolderRule,
  SmartFolderMatch,
  SmartFolderCreateRequest,
  SmartFolderUpdateRequest,
  SmartFolderDeleteRequest,
  FolderStructure,
  SmartFolderStats,
  DefaultFolderConfig,
} from './smartFolder';

// Suggestion and organization types
export type {
  FolderSuggestion,
  FileSuggestionResult,
  BatchSuggestionGroup,
  BatchSuggestionsResult,
  ConfidenceThresholds,
  OrganizeOptions,
  OrganizedFile,
  ReviewFile,
  FailedFile,
  OrganizationMethod,
  OrganizeResults,
  BatchOrganizeResult,
  AutoOrganizeResult,
  OrganizationStatistics,
  SuggestionFeedback,
} from './suggestion';

// Service types
export type {
  Logger,
  ISuggestionService,
  ISettingsService,
  IFolderMatchingService,
  IUndoRedoService,
  UndoableAction,
  IAnalysisService,
  IOllamaService,
  OllamaModel,
  OllamaGenerateOptions,
  IChromaDBService,
  ServiceHealth,
  AutoOrganizeServiceDependencies,
  ServiceState,
  PerformanceMetrics,
} from './services';

// IPC types
export type {
  IPCRequest,
  IPCResponse,
  IPCError,
  LogContext,
  IPCErrorCode,
} from './ipc';

export { IPC_ERROR_CODES } from './ipc';

// API types (Zod-inferred and typed bridge)
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
  SuccessResponse,
  ErrorResponse,
  IPCResponseEnvelope,
  FileSelectionResult as ApiFileSelectionResult,
  DirectorySelectionResult,
  FileOperationResult,
  AnalysisResultData,
  BatchAnalysisResultData,
  SmartFolderData,
  SmartFolderMatchResult,
  OrganizationSuggestion,
  OrganizedFileResult,
  AutoOrganizeResultData,
  OllamaModelInfo,
  OllamaConnectionResult,
  ModelPullProgress,
  AppSettings,
  UndoableActionData,
  TypedElectronAPI,
} from './api';

export { isSuccessResponse, isErrorResponse, unwrapResponse } from './api';

import { logger } from '../../../shared/logger';
import path from 'path';
import FileOrganizationUtils from './FileOrganizationUtils';

interface FileWithAnalysis {
  path: string;
  name: string;
  extension?: string;
  size?: number;
  analysis?: {
    category?: string;
    suggestedName?: string;
    confidence?: number;
    summary?: string;
  } | null;
  suggestion?: FolderSuggestion;
}

interface FolderSuggestion {
  folder: string;
  path?: string;
  confidence?: number;
}

interface SmartFolder {
  id?: string;
  name: string;
  path: string;
  description?: string;
  keywords?: string[];
  isDefault?: boolean;
  createdAt?: string;
}

interface BatchOrganizeOptions {
  autoApproveThreshold?: number;
  confidenceThreshold?: number;
  defaultLocation?: string;
  preserveNames?: boolean;
}

interface OrganizationOperation {
  type: 'move';
  source: string;
  destination: string;
  confidence?: number;
  method?: string;
}

interface SanitizedFile {
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

interface OrganizedFile {
  file: SanitizedFile;
  suggestion?: FolderSuggestion;
  destination: string;
  confidence: number;
  method: string;
  alternatives?: FolderSuggestion[];
  explanation?: string;
}

interface ReviewFile {
  file: SanitizedFile;
  suggestion: FolderSuggestion;
  alternatives?: FolderSuggestion[];
  confidence: number;
  explanation?: string;
}

interface BatchOrganizeResult {
  operations: OrganizationOperation[];
  groups: {
    folder: string;
    files: FileWithAnalysis[];
    confidence: number;
    autoApproved: boolean;
    partialSuccess?: boolean;
  }[];
  skipped: {
    folder: string;
    files: FileWithAnalysis[];
    confidence: number;
    reason: string;
  }[];
  failed: Array<{
    file?: FileWithAnalysis;
    error: string;
    filePath?: string;
    timestamp: string;
    batchId?: string;
    group?: string;
    files?: FileWithAnalysis[];
  }>;
}

interface ProcessFilesResult {
  organized: OrganizedFile[];
  needsReview: ReviewFile[];
  failed: Array<{
    file: SanitizedFile;
    reason: string;
    filePath: string;
    timestamp: string;
    batchId: string;
  }>;
  operations: OrganizationOperation[];
}

interface FileWithSuggestion extends FileWithAnalysis {
  alternatives?: FolderSuggestion[];
}

interface BatchSuggestionGroup {
  folder: string;
  path?: string;
  confidence: number;
  files: FileWithSuggestion[];
}

interface BatchSuggestions {
  success: boolean;
  groups: BatchSuggestionGroup[];
}

interface SuggestionService {
  getBatchSuggestions(
    files: FileWithAnalysis[],
    smartFolders: SmartFolder[],
    options: { includeStructureAnalysis: boolean; includeAlternatives: boolean }
  ): Promise<BatchSuggestions>;
  getSuggestionsForFile(
    file: FileWithAnalysis,
    smartFolders: SmartFolder[],
    options: { includeAlternatives: boolean }
  ): Promise<{
    success: boolean;
    primary?: FolderSuggestion;
    alternatives?: FolderSuggestion[];
    confidence?: number;
    explanation?: string;
  }>;
  recordFeedback(
    file: FileWithAnalysis,
    suggestion: FolderSuggestion,
    accepted: boolean
  ): Promise<void>;
}

interface BatchThresholds {
  autoApprove: number;
  requireReview: number;
}

interface FileUtilsInterface {
  buildDestinationPath(
    file: FileWithAnalysis,
    suggestion: FolderSuggestion,
    defaultLocation: string,
    preserveNames?: boolean
  ): string;
  getFallbackDestination(
    file: FileWithAnalysis,
    smartFolders: SmartFolder[],
    defaultLocation: string
  ): string;
  sanitizeFile(file: FileWithAnalysis): SanitizedFile;
}

class BatchOrganizer {
  fileUtils: FileUtilsInterface;
  logger: typeof logger;
  suggestionService: SuggestionService;
  thresholds: BatchThresholds;

  constructor(
    suggestionService: SuggestionService,
    thresholds: BatchThresholds,
    fileUtils: FileUtilsInterface = FileOrganizationUtils
  ) {
    this.suggestionService = suggestionService;
    this.thresholds = thresholds;
    this.logger = logger;
    this.fileUtils = fileUtils;
  }

  /**
   * Batch organize with automatic confidence-based filtering
   */
  async batchOrganize(
    files: FileWithAnalysis[],
    smartFolders: SmartFolder[],
    options: BatchOrganizeOptions = {}
  ): Promise<BatchOrganizeResult> {
    const { autoApproveThreshold = this.thresholds.autoApprove } = options;

    this.logger.info('[BatchOrganizer] Starting batch organization', {
      fileCount: files.length,
    });

    // Get batch suggestions
    const batchSuggestions = await this.suggestionService.getBatchSuggestions(
      files,
      smartFolders,
      {
        includeStructureAnalysis: false,
        includeAlternatives: false,
      }
    );

    if (!batchSuggestions.success) {
      throw new Error('Failed to get batch suggestions');
    }

    const results: BatchOrganizeResult = {
      operations: [],
      groups: [],
      skipped: [],
      failed: [], // Fixed: Track failed operations for resilient batch processing
    };

    // Fixed: Process groups with error handling to prevent one failure from stopping the batch
    for (const group of batchSuggestions.groups) {
      try {
        if (group.confidence >= autoApproveThreshold) {
          // Auto-approve high confidence groups
          const groupOperations: OrganizationOperation[] = [];
          const groupFailures: Array<{
            file: FileWithAnalysis;
            error: string;
            filePath: string;
            timestamp: string;
          }> = [];

          for (const file of group.files) {
            try {
              const destination = this.fileUtils.buildDestinationPath(
                file,
                { folder: group.folder, path: group.path },
                options.defaultLocation || 'Documents',
                options.preserveNames
              );

              groupOperations.push({
                type: 'move',
                source: file.path,
                destination,
              });

              // CRITICAL FIX: Await recordFeedback to prevent floating promises
              // This ensures feedback is recorded before continuing with batch operations
              // and allows proper error handling if feedback recording fails
              if (file.suggestion) {
                try {
                  await this.suggestionService.recordFeedback(
                    file,
                    file.suggestion,
                    true
                  );
                } catch (feedbackError: any) {
                  // Log feedback errors but don't fail the operation
                  this.logger.warn(
                    '[BatchOrganizer] Failed to record feedback for file:',
                    {
                      file: file.path,
                      error: feedbackError.message,
                    }
                  );
                  // Continue with file operation even if feedback fails
                }
              }
            } catch (fileError: any) {
              // Bug #33: Include file path, batch ID, timestamp in error messages
              const errorDetails = {
                filePath: file.path,
                fileName: file.name || path.basename(file.path),
                batchId: `batch-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
                timestamp: new Date().toISOString(),
                error: fileError.message,
                errorStack: fileError.stack,
              };

              this.logger.error(
                '[BatchOrganizer] Failed to process file in batch:',
                errorDetails
              );

              groupFailures.push({
                file,
                error: fileError.message,
                filePath: file.path,
                timestamp: errorDetails.timestamp,
              });
            }
          }

          // Add successful operations
          results.operations.push(...groupOperations);

          // Track failed files
          if (groupFailures.length > 0) {
            results.failed.push(...groupFailures);
          }

          // Only add group if at least some files succeeded
          if (groupOperations.length > 0) {
            results.groups.push({
              folder: group.folder,
              files: group.files.filter(
                (f) => !groupFailures.find((failure) => failure.file === f)
              ),
              confidence: group.confidence,
              autoApproved: true,
              partialSuccess: groupFailures.length > 0,
            });
          }
        } else {
          // Skip low confidence groups for manual review
          results.skipped.push({
            folder: group.folder,
            files: group.files,
            confidence: group.confidence,
            reason: 'Low confidence',
          });
        }
      } catch (groupError: any) {
        // Bug #33: Include batch ID, timestamp, and detailed context in error messages
        const groupErrorDetails = {
          folder: group.folder,
          folderPath: group.path,
          fileCount: group.files ? group.files.length : 0,
          batchId: `batch-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
          timestamp: new Date().toISOString(),
          error: groupError.message,
          errorStack: groupError.stack,
        };

        this.logger.error(
          '[BatchOrganizer] Failed to process group in batch:',
          groupErrorDetails
        );

        results.failed.push({
          group: group.folder,
          files: group.files,
          error: groupError.message,
          timestamp: groupErrorDetails.timestamp,
          batchId: groupErrorDetails.batchId,
        });
      }
    }

    this.logger.info('[BatchOrganizer] Batch organization complete', {
      operationCount: results.operations.length,
      groupCount: results.groups.length,
      skippedCount: results.skipped.length,
    });

    return results;
  }

  /**
   * Process files individually as fallback
   */
  async _processFilesIndividually(
    files: FileWithAnalysis[],
    smartFolders: SmartFolder[],
    options: BatchOrganizeOptions,
    results: ProcessFilesResult
  ): Promise<void> {
    const { confidenceThreshold, defaultLocation, preserveNames } = options;

    for (const file of files) {
      try {
        // Get suggestion for the file
        let suggestion;
        try {
          suggestion = await this.suggestionService.getSuggestionsForFile(
            file,
            smartFolders,
            { includeAlternatives: false }
          );
        } catch (suggestionError: any) {
          this.logger.error('[BatchOrganizer] Failed to get suggestion for file:', {
            file: file.name,
            error: suggestionError.message,
          });

          // Use fallback logic on suggestion failure
          const fallbackDestination = this.fileUtils.getFallbackDestination(
            file,
            smartFolders,
            defaultLocation || 'Documents'
          );

          results.organized.push({
            file: this.fileUtils.sanitizeFile(file),
            destination: fallbackDestination,
            confidence: 0.2,
            method: 'suggestion-error-fallback',
          });

          results.operations.push({
            type: 'move',
            source: file.path,
            destination: fallbackDestination,
          });
          continue;
        }

        if (!suggestion || !suggestion.success || !suggestion.primary) {
          // Use fallback logic from original system
          const fallbackDestination = this.fileUtils.getFallbackDestination(
            file,
            smartFolders,
            defaultLocation || 'Documents'
          );

          results.organized.push({
            file: this.fileUtils.sanitizeFile(file),
            destination: fallbackDestination,
            confidence: 0.3,
            method: 'fallback',
          });

          results.operations.push({
            type: 'move',
            source: file.path,
            destination: fallbackDestination,
            confidence: 0.3,
            method: 'fallback',
          });

          results.operations.push({
            type: 'move',
            source: file.path,
            destination: fallbackDestination,
          });
          continue;
        }

        const { primary } = suggestion;
        const confidence = suggestion.confidence || 0;

        // Determine action based on confidence
        if (confidenceThreshold !== undefined && confidence >= confidenceThreshold) {
          // High confidence - organize automatically
          const destination = this.fileUtils.buildDestinationPath(
            file,
            primary,
            defaultLocation || 'Documents',
            preserveNames
          );

          results.organized.push({
            file: this.fileUtils.sanitizeFile(file),
            suggestion: primary,
            destination,
            confidence,
            method: 'automatic',
          });

          results.operations.push({
            type: 'move',
            source: file.path,
            destination,
          });

          // CRITICAL FIX #3b: Wrap recordFeedback in try-catch to prevent batch failure
          // Record feedback for learning with proper error handling
          try {
            await this.suggestionService.recordFeedback(file, primary, true);
          } catch (feedbackError: any) {
            // Log error but continue processing - feedback recording is non-critical
            this.logger.warn(
              '[BatchOrganizer] Failed to record feedback (non-critical):',
              {
                file: file.path,
                error: feedbackError.message,
              }
            );
          }
        } else if (confidence >= this.thresholds.requireReview) {
          // Medium confidence - needs review
          results.needsReview.push({
            file: this.fileUtils.sanitizeFile(file),
            suggestion: primary,
            alternatives: suggestion.alternatives,
            confidence,
            explanation: suggestion.explanation,
          });
        } else {
          // Low confidence - use fallback
          const fallbackDestination = this.fileUtils.getFallbackDestination(
            file,
            smartFolders,
            defaultLocation || 'Documents'
          );

          results.organized.push({
            file: this.fileUtils.sanitizeFile(file),
            destination: fallbackDestination,
            confidence,
            method: 'low-confidence-fallback',
          });

          results.operations.push({
            type: 'move',
            source: file.path,
            destination: fallbackDestination,
          });
        }
      } catch (error: any) {
        // Bug #33: Include file path, batch ID, timestamp in error messages
        const fileErrorDetails = {
          fileName: file.name,
          filePath: file.path,
          fileSize: file.size,
          batchId: `organize-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
          timestamp: new Date().toISOString(),
          error: error.message,
          errorStack: error.stack,
        };

        this.logger.error(
          '[BatchOrganizer] Failed to process file:',
          fileErrorDetails
        );

        results.failed.push({
          file: this.fileUtils.sanitizeFile(file),
          reason: error.message,
          filePath: file.path,
          timestamp: fileErrorDetails.timestamp,
          batchId: fileErrorDetails.batchId,
        });
      }
    }
  }

  /**
   * Process batch suggestion results from AutoOrganize flow
   */
  async processBatchResults(
    batchSuggestions: BatchSuggestions,
    files: FileWithAnalysis[],
    options: BatchOrganizeOptions,
    results: ProcessFilesResult
  ): Promise<void> {
    const { confidenceThreshold, defaultLocation, preserveNames } = options;

    // Create a map of files by name for quick lookup
    const fileMap = new Map(files.map((f) => [f.name, f]));

    for (const group of batchSuggestions.groups) {
      for (const fileWithSuggestion of group.files) {
        const file = fileMap.get(fileWithSuggestion.name) || fileWithSuggestion;
        const suggestion = fileWithSuggestion.suggestion;
        const confidence = group.confidence || 0;

        if (!suggestion) {
          // Use fallback if no suggestion
          const fallbackDestination = this.fileUtils.getFallbackDestination(
            file,
            [],
            defaultLocation || 'Documents'
          );

          results.organized.push({
            file,
            destination: fallbackDestination,
            confidence: 0.3,
            method: 'batch-fallback',
          });

          results.operations.push({
            type: 'move',
            source: file.path,
            destination: fallbackDestination,
          });
          continue;
        }

        // Determine action based on confidence
        if (confidenceThreshold !== undefined && confidence >= confidenceThreshold) {
          // High confidence - organize automatically
          const destination = this.fileUtils.buildDestinationPath(
            file,
            suggestion,
            defaultLocation || 'Documents',
            preserveNames
          );

          results.organized.push({
            file: this.fileUtils.sanitizeFile(file),
            suggestion,
            destination,
            confidence,
            method: 'batch-automatic',
          });

          results.operations.push({
            type: 'move',
            source: file.path,
            destination,
          });

          // CRITICAL FIX #3a: Record feedback with proper error handling
          // Record feedback for learning (non-blocking but with proper error handling)
          Promise.resolve(this.suggestionService.recordFeedback(file, suggestion, true))
            .catch((err: any) => {
              // Log error but don't fail the operation - batch processing continues
              this.logger.warn(
                '[BatchOrganizer] Failed to record feedback (non-critical):',
                {
                  file: file.path,
                  error: err.message,
                }
              );
            });
        } else if (confidence >= this.thresholds.requireReview) {
          // Medium confidence - needs review
          results.needsReview.push({
            file: this.fileUtils.sanitizeFile(file),
            suggestion,
            alternatives: fileWithSuggestion.alternatives,
            confidence,
            explanation: `Batch suggestion with ${Math.round(confidence * 100)}% confidence`,
          });
        } else {
          // Low confidence - use fallback
          const fallbackDestination = this.fileUtils.getFallbackDestination(
            file,
            [],
            defaultLocation || 'Documents'
          );

          results.organized.push({
            file: this.fileUtils.sanitizeFile(file),
            destination: fallbackDestination,
            confidence,
            method: 'batch-low-confidence-fallback',
          });

          results.operations.push({
            type: 'move',
            source: file.path,
            destination: fallbackDestination,
          });
        }
      }
    }
  }
}

export default BatchOrganizer;

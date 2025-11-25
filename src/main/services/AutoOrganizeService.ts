import { logger } from '../../shared/logger';
import path from 'path';
import DefaultFolderManager from './auto-organize/DefaultFolderManager';
import BatchOrganizer from './auto-organize/BatchOrganizer';
import FileOrganizationUtils from './auto-organize/FileOrganizationUtils';

logger.setContext('AutoOrganizeService');

// LOW PRIORITY FIX (LOW-8): Make batch size configurable via constant
const DEFAULT_BATCH_SIZE = 10; // Default number of files to process per batch

// Type definitions
interface FileAnalysis {
  category?: string;
  suggestedName?: string;
  confidence?: number;
  summary?: string;
  error?: string;
}

interface FileObject {
  name: string;
  path: string;
  size?: number;
  extension?: string;
  type?: string;
  analysis?: FileAnalysis | null;
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

interface Suggestion {
  folder: string;
  path?: string;
  confidence?: number;
}

interface OrganizeOptions {
  confidenceThreshold?: number;
  defaultLocation?: string;
  preserveNames?: boolean;
  batchSize?: number;
  autoOrganizeEnabled?: boolean;
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
  suggestion?: Suggestion;
  destination: string;
  confidence: number;
  method: string;
  alternatives?: Suggestion[];
  explanation?: string;
}

interface ReviewFile {
  file: SanitizedFile;
  suggestion: Suggestion;
  destination: string;
  confidence: number;
  method: string;
  alternatives?: Suggestion[];
  explanation?: string;
}

interface FailedFile {
  file: SanitizedFile;
  reason: string;
  filePath: string;
  timestamp: string;
  batchId: string;
}

interface OrganizationOperation {
  type: 'move';
  source: string;
  destination: string;
  confidence?: number;
  method?: string;
}

interface OrganizeResults {
  organized: OrganizedFile[];
  needsReview: ReviewFile[];
  failed: FailedFile[];
  operations: OrganizationOperation[];
}

interface ConfidenceThresholds {
  autoApprove: number;
  requireReview: number;
  reject: number;
}

interface AutoOrganizeServiceDependencies {
  suggestionService: any;
  settingsService: any;
  folderMatchingService: any;
  undoRedoService?: any;
}

interface AutoOrganizeResult {
  source: string;
  destination: string;
  confidence: number;
  suggestion: Suggestion;
}

interface StatisticsResult {
  userPatterns: number;
  feedbackHistory: number;
  folderUsageStats: Array<[string, any]>;
  thresholds: ConfidenceThresholds;
}

interface ServiceState {
  thresholds: ConfidenceThresholds;
  hasSuggestionService: boolean;
  hasSettingsService: boolean;
  hasFolderMatcher: boolean;
  hasUndoRedo: boolean;
  hasBatchOrganizer: boolean;
  hasDefaultFolderManager: boolean;
}

/**
 * AutoOrganizeService - Handles automatic file organization
 * Uses the suggestion system behind the scenes for better accuracy
 * Only requires user intervention for low-confidence matches
 */
class AutoOrganizeService {
  private suggestionService: any;
  private settings: any;
  private folderMatcher: any;
  private undoRedo?: any;
  private thresholds: ConfidenceThresholds;
  private defaultFolderManager: DefaultFolderManager;
  private batchOrganizer: BatchOrganizer;

  constructor({
    suggestionService,
    settingsService,
    folderMatchingService,
    undoRedoService,
  }: AutoOrganizeServiceDependencies) {
    this.suggestionService = suggestionService;
    this.settings = settingsService;
    this.folderMatcher = folderMatchingService;
    this.undoRedo = undoRedoService;

    // Confidence thresholds for automatic organization
    this.thresholds = {
      autoApprove: 0.8, // Automatically approve >= 80% confidence
      requireReview: 0.5, // Require review for 50-79% confidence
      reject: 0.3, // Reject below 30% confidence
    };

    // Initialize helpers
    this.defaultFolderManager = new DefaultFolderManager();
    // Pass 'this' as fileUtils so BatchOrganizer calls service methods (which are now delegates or overrides)
    // This maintains testability via service instance mocking
    this.batchOrganizer = new BatchOrganizer(suggestionService, this.thresholds, this);
  }

  /**
   * Automatically organize files based on their analysis
   * Uses batched suggestions for improved performance
   */
  async organizeFiles(files: FileObject[], smartFolders: SmartFolder[], options: OrganizeOptions = {}): Promise<OrganizeResults> {
    const {
      confidenceThreshold = this.thresholds.autoApprove,
      defaultLocation = 'Documents',
      preserveNames = false,
      batchSize = DEFAULT_BATCH_SIZE, // LOW PRIORITY FIX (LOW-8): Use configurable constant
    } = options;

    logger.info('[AutoOrganize] Starting automatic organization', {
      fileCount: files.length,
      smartFolderCount: smartFolders.length,
      confidenceThreshold,
      batchSize,
    });

    const results: OrganizeResults = {
      organized: [],
      needsReview: [],
      failed: [],
      operations: [],
    };

    // Separate files with and without analysis
    const filesWithAnalysis: FileObject[] = [];
    const filesWithoutAnalysis: FileObject[] = [];

    for (const file of files) {
      if (!file.analysis) {
        filesWithoutAnalysis.push(file);
      } else {
        filesWithAnalysis.push(file);
      }
    }

    // Process files without analysis first (they use the default folder)
    if (filesWithoutAnalysis.length > 0) {
      await this._processFilesWithoutAnalysis(
        filesWithoutAnalysis,
        smartFolders,
        defaultLocation,
        results,
      );
    }

    // Process files with analysis in batches
    if (filesWithAnalysis.length > 0) {
      // Split into batches for efficient processing
      const batches: FileObject[][] = [];
      for (let i = 0; i < filesWithAnalysis.length; i += batchSize) {
        batches.push(filesWithAnalysis.slice(i, i + batchSize));
      }

      logger.info('[AutoOrganize] Processing files in batches', {
        totalFiles: filesWithAnalysis.length,
        batchCount: batches.length,
        batchSize,
      });

      // Process each batch
      for (let batchIndex = 0; batchIndex < batches.length; batchIndex++) {
        const batch = batches[batchIndex];

        logger.debug('[AutoOrganize] Processing batch', {
          batchIndex: batchIndex + 1,
          totalBatches: batches.length,
          filesInBatch: batch.length,
        });

        try {
          // Get batch suggestions
          const batchSuggestions = await this.suggestionService.getBatchSuggestions(
            batch,
            smartFolders,
            {
              includeStructureAnalysis: false,
              includeAlternatives: false,
            },
          );

          if (
            !batchSuggestions.success ||
            !batchSuggestions.groups ||
            batchSuggestions.groups.length === 0
          ) {
            // Fallback to individual processing if batch fails
            logger.warn(
              '[AutoOrganize] Batch suggestions failed or empty, falling back to individual processing',
            );
            await this.batchOrganizer._processFilesIndividually(
              batch,
              smartFolders,
              {
                confidenceThreshold,
                defaultLocation,
                preserveNames,
              },
              results,
            );
            continue;
          }

          // Process batch results
          await this.batchOrganizer.processBatchResults(
            batchSuggestions,
            batch,
            {
              confidenceThreshold,
              defaultLocation,
              preserveNames,
            },
            results,
          );

          // Check if any files from the batch weren't processed
          // This can happen if batch results don't include all files
          const processedFileNames = new Set<string>();
          for (const group of batchSuggestions.groups) {
            for (const fileWithSuggestion of group.files) {
              processedFileNames.add(fileWithSuggestion.name);
            }
          }

          // Process any unprocessed files individually as fallback
          const unprocessedFiles = batch.filter(
            (f) => !processedFileNames.has(f.name),
          );
          if (unprocessedFiles.length > 0) {
            logger.debug(
              '[AutoOrganize] Some files not in batch results, processing individually',
              { count: unprocessedFiles.length },
            );
            await this.batchOrganizer._processFilesIndividually(
              unprocessedFiles,
              smartFolders,
              {
                confidenceThreshold,
                defaultLocation,
                preserveNames,
              },
              results,
            );
          }
        } catch (error: any) {
          logger.error('[AutoOrganize] Batch processing failed', {
            batchIndex: batchIndex + 1,
            error: error.message,
          });

          // Fallback to individual processing for this batch
          await this.batchOrganizer._processFilesIndividually(
            batch,
            smartFolders,
            {
              confidenceThreshold,
              defaultLocation,
              preserveNames,
            },
            results,
          );
        }
      }
    }

    logger.info('[AutoOrganize] Organization complete', {
      organized: results.organized.length,
      needsReview: results.needsReview.length,
      failed: results.failed.length,
    });

    return results;
  }

  /**
   * Process files without analysis (use default folder)
   */
  private async _processFilesWithoutAnalysis(
    files: FileObject[],
    smartFolders: SmartFolder[],
    defaultLocation: string,
    results: OrganizeResults,
  ): Promise<void> {
    logger.info('[AutoOrganize] Processing files without analysis', {
      count: files.length,
    });

    // Find or create default folder once for all files
    const defaultFolder = await this.defaultFolderManager.ensureDefaultFolder(smartFolders);

      if (!defaultFolder) {
        // Could not create default folder, mark all files as failed
        for (const file of files) {
          results.failed.push({
          file: FileOrganizationUtils.sanitizeFile(file as any),
            reason: 'No analysis available and failed to create default folder',
            filePath: file.path,
            timestamp: new Date().toISOString(),
            batchId: `process-no-analysis-${Date.now()}`,
          });
        }
        return;
    }

    // Process all files without analysis in batch
    for (const file of files) {
      const destination = path.join(
        defaultFolder.path || `${defaultLocation}/${defaultFolder.name}`,
        file.name,
      );

      results.organized.push({
        file: FileOrganizationUtils.sanitizeFile(file),
        destination,
        confidence: 0.1,
        method: 'no-analysis-default',
      });

      results.operations.push({
        type: 'move',
        source: file.path,
        destination,
      });
    }
  }

  /**
   * Batch organize with automatic confidence-based filtering
   * Delegates to BatchOrganizer
   */
  async batchOrganize(files: FileObject[], smartFolders: SmartFolder[], options: OrganizeOptions = {}): Promise<any> {
      // The BatchOrganizer.batchOrganize returns a different result structure than what might be expected if it was used internally by organizeFiles
      // But this method is likely exposed as public API.
      // Let's check usage of AutoOrganizeService.batchOrganize.
      // It seems it was used for testing or specific batch operations.
      return this.batchOrganizer.batchOrganize(files, smartFolders, options);
  }

  /**
   * Monitor and auto-organize new files (for Downloads folder watching)
   */
  async processNewFile(filePath: string, smartFolders: SmartFolder[], options: OrganizeOptions = {}): Promise<AutoOrganizeResult | null> {
    const {
      autoOrganizeEnabled = false,
      confidenceThreshold = 0.9, // Higher threshold for automatic processing
    } = options;

    if (!autoOrganizeEnabled) {
      logger.info(
        '[AutoOrganize] Auto-organize disabled, skipping file:',
        filePath,
      );
      return null;
    }

    try {
      // Analyze the file first
      const {
        analyzeDocumentFile,
        analyzeImageFile,
      } = require('../analysis/ollamaDocumentAnalysis');
      const extension = path.extname(filePath).toLowerCase();

      let analysis: FileAnalysis | undefined;
      if (['.jpg', '.jpeg', '.png', '.gif', '.bmp'].includes(extension)) {
        analysis = await analyzeImageFile(filePath, smartFolders);
      } else {
        analysis = await analyzeDocumentFile(filePath, smartFolders);
      }

      if (!analysis || analysis.error) {
        logger.warn('[AutoOrganize] Could not analyze file:', filePath);
        return null;
      }

      // Create file object
      const file: FileObject = {
        name: path.basename(filePath),
        path: filePath,
        extension,
        analysis,
      };

      // Get suggestion
      const suggestion = await this.suggestionService.getSuggestionsForFile(
        file,
        smartFolders,
        { includeAlternatives: false },
      );

      // Only auto-organize if confidence is very high
      if (
        suggestion.success &&
        suggestion.primary &&
        suggestion.confidence >= confidenceThreshold
      ) {
        const destination = FileOrganizationUtils.buildDestinationPath(
          file,
          suggestion.primary,
          options.defaultLocation || 'Documents',
          false,
        );

        logger.info('[AutoOrganize] Auto-organizing new file', {
          file: filePath,
          destination,
          confidence: suggestion.confidence,
        });

        // Record the action for undo
        const action = {
          type: 'FILE_MOVE',
          data: {
            originalPath: filePath,
            newPath: destination,
          },
          timestamp: Date.now(),
          description: `Auto-organized ${file.name}`,
        };
        if (this.undoRedo) {
          await this.undoRedo.recordAction(action);
        }

        return {
          source: filePath,
          destination,
          confidence: suggestion.confidence,
          suggestion: suggestion.primary,
        };
      }

      logger.info(
        '[AutoOrganize] File confidence too low for auto-organization',
        {
          file: filePath,
          confidence: suggestion.confidence || 0,
          threshold: confidenceThreshold,
        },
      );

      return null;
    } catch (error: any) {
      logger.error('[AutoOrganize] Error processing new file:', {
        file: filePath,
        error: error.message,
      });
      return null;
    }
  }

  /**
   * Get organization statistics
   */
  async getStatistics(): Promise<StatisticsResult> {
    // CRITICAL FIX: Safely access properties that may not exist on suggestionService
    const userPatterns = this.suggestionService?.userPatterns;
    const feedbackHistory = this.suggestionService?.feedbackHistory;
    const folderUsageStats = this.suggestionService?.folderUsageStats;

    return {
      userPatterns: userPatterns instanceof Map ? userPatterns.size : 0,
      feedbackHistory: Array.isArray(feedbackHistory) ? feedbackHistory.length : 0,
      folderUsageStats: folderUsageStats instanceof Map
        ? Array.from(folderUsageStats.entries())
        : [],
      thresholds: this.thresholds,
    };
  }

  /**
   * Update confidence thresholds
   */
  updateThresholds(newThresholds: Partial<ConfidenceThresholds>): void {
    this.thresholds = {
      ...this.thresholds,
      ...newThresholds,
    };
    logger.info('[AutoOrganize] Updated thresholds:', this.thresholds);
  }

  // =========================================================================
  // Delegate methods for backward compatibility and testing
  // =========================================================================

  getFallbackDestination(file: FileObject, smartFolders: SmartFolder[], defaultLocation: string): string {
    return FileOrganizationUtils.getFallbackDestination(
      file as any,
      smartFolders as any,
      defaultLocation
    );
  }

  buildDestinationPath(file: FileObject, suggestion: Suggestion, defaultLocation: string, preserveNames: boolean): string {
    return FileOrganizationUtils.buildDestinationPath(
      file as any,
      suggestion as any,
      defaultLocation,
      preserveNames
    );
  }

  getFileTypeCategory(extension: string): string {
    return FileOrganizationUtils.getFileTypeCategory(extension);
  }

  sanitizeFile(file: FileObject): SanitizedFile {
    return FileOrganizationUtils.sanitizeFile(file as any);
  }

  _sanitizeFile(file: FileObject): SanitizedFile {
    return FileOrganizationUtils.sanitizeFile(file as any);
  }

  /**
   * Health check for service monitoring
   * @returns {Promise<boolean>} True if service is healthy
   */
  async healthCheck(): Promise<boolean> {
    try {
      // Check required dependencies
      if (!this.suggestionService) {
        logger.error('[AutoOrganizeService] Health check failed: no suggestion service');
        return false;
      }
      if (!this.settings) {
        logger.warn('[AutoOrganizeService] Health check warning: no settings service');
        // Warning but not critical
      }
      if (!this.folderMatcher) {
        logger.error('[AutoOrganizeService] Health check failed: no folder matcher');
        return false;
      }

      // Check batch organizer is initialized
      if (!this.batchOrganizer) {
        logger.error('[AutoOrganizeService] Health check failed: batch organizer not initialized');
        return false;
      }

      // Check default folder manager
      if (!this.defaultFolderManager) {
        logger.error('[AutoOrganizeService] Health check failed: default folder manager not initialized');
        return false;
      }

      // Verify thresholds are valid
      if (!this.thresholds ||
          typeof this.thresholds.autoApprove !== 'number' ||
          typeof this.thresholds.requireReview !== 'number' ||
          typeof this.thresholds.reject !== 'number') {
        logger.error('[AutoOrganizeService] Health check failed: invalid thresholds', {
          thresholds: this.thresholds,
        });
        return false;
      }

      logger.debug('[AutoOrganizeService] Health check passed', {
        thresholds: this.thresholds,
      });
      return true;
    } catch (error: any) {
      logger.error('[AutoOrganizeService] Health check error', {
        error: error.message,
        stack: error.stack,
      });
      return false;
    }
  }

  /**
   * Get service state for monitoring
   * @returns {Object} Service state information
   */
  getState(): ServiceState {
    return {
      thresholds: this.thresholds,
      hasSuggestionService: !!this.suggestionService,
      hasSettingsService: !!this.settings,
      hasFolderMatcher: !!this.folderMatcher,
      hasUndoRedo: !!this.undoRedo,
      hasBatchOrganizer: !!this.batchOrganizer,
      hasDefaultFolderManager: !!this.defaultFolderManager,
    };
  }
}

export default AutoOrganizeService;

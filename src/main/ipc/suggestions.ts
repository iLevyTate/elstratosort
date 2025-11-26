import {
  validateIpc,
  withRequestId,
  withErrorHandling,
  compose,
  createError,
  ERROR_CODES,
} from './validation';
import { z } from 'zod';
import { logger } from '../../shared/logger';
import { container } from '../core/ServiceContainer';

logger.setContext('IPC:Suggestions');

/**
 * Helper to get suggestion service from container, ensuring it's ready
 */
async function getSuggestionService(): Promise<any> {
  try {
    const service = await container.get('organizationSuggestion');
    return service;
  } catch (error) {
    logger.warn(
      '[SUGGESTIONS] Failed to get suggestion service from container:',
      (error as Error).message,
    );
    return null;
  }
}

// Validation schemas for suggestions handlers
const FileSchema = z.object({
  path: z.string().min(1),
  name: z.string().min(1),
  size: z.number().nonnegative().optional(),
  type: z.string().optional(),
  extension: z.string().optional(),
  analysis: z.any().optional(),
});

const GetFileSuggestionsSchema = z.object({
  file: FileSchema,
});

const GetBatchSuggestionsSchema = z.object({
  files: z.array(FileSchema).min(1).max(1000),
});

const RecordFeedbackSchema = z.object({
  file: FileSchema,
  suggestion: z
    .object({
      folder: z.string().optional(),
      confidence: z.number().min(0).max(1).optional(),
    })
    .nullable()
    .optional(),
  accepted: z.boolean(),
});

const ApplyStrategySchema = z.object({
  files: z.array(FileSchema).min(1).max(1000),
  strategyId: z.string().min(1),
});

const AnalyzeFolderStructureSchema = z.object({
  files: z.array(FileSchema).optional().default([]),
});

const SuggestNewFolderSchema = z.object({
  file: FileSchema,
});
function registerSuggestionsIpc({ ipcMain, IPC_CHANNELS, getCustomFolders }) {
  // Note: We no longer create our own service instance.
  // Instead, we get it from the container on demand for each request.
  // This ensures we use the properly initialized singleton from serviceRegistry.
  logger.info(
    '[SUGGESTIONS] Registering suggestion IPC handlers (using container service)',
  );

  // Get File Suggestions Handler - with middleware and validation
  ipcMain.handle(
    IPC_CHANNELS.SUGGESTIONS.GET_FILE_SUGGESTIONS,
    compose(
      withErrorHandling,
      withRequestId,
      validateIpc(GetFileSuggestionsSchema),
    )(async (_event, data) => {
      const { file } = data;
      try {
        // Get service from container (ensures proper initialization)
        const suggestionService = await getSuggestionService();
        if (!suggestionService) {
          logger.warn('[SUGGESTIONS] Suggestion service not available');
          return {
            success: false,
            error:
              'Suggestion service unavailable (ChromaDB may not be running)',
            primary: null,
            alternatives: [],
            confidence: 0,
          };
        }

        logger.info('[SUGGESTIONS] Getting suggestions for file:', file.name);

        const smartFolders = getCustomFolders();
        const suggestions = await suggestionService.getSuggestionsForFile(
          file,
          smartFolders,
          {},
        );

        logger.info('[SUGGESTIONS] Generated suggestions:', {
          file: file.name,
          primary: suggestions.primary?.folder,
          alternatives: suggestions.alternatives?.length || 0,
          confidence: suggestions.confidence,
        });

        return {
          success: true,
          ...suggestions,
        };
      } catch (error) {
        logger.error('[SUGGESTIONS] Failed to get file suggestions:', error);
        return {
          success: false,
          error: (error as Error).message,
        };
      }
    }),
  );

  // Get Batch Suggestions Handler - with middleware and validation
  ipcMain.handle(
    IPC_CHANNELS.SUGGESTIONS.GET_BATCH_SUGGESTIONS,
    compose(
      withErrorHandling,
      withRequestId,
      validateIpc(GetBatchSuggestionsSchema),
    )(async (event, data) => {
      const { files } = data;
      void event;
      try {
        // Get service from container
        const suggestionService = await getSuggestionService();
        if (!suggestionService) {
          logger.warn(
            '[SUGGESTIONS] Suggestion service not available for batch suggestions',
          );
          return {
            success: false,
            error:
              'Suggestion service unavailable (ChromaDB may not be running)',
            groups: [],
            recommendations: [],
          };
        }

        logger.info('[SUGGESTIONS] Getting batch suggestions', {
          fileCount: files.length,
        });

        const smartFolders = getCustomFolders();
        const batchSuggestions = await suggestionService.getBatchSuggestions(
          files,
          smartFolders,
        );

        logger.info('[SUGGESTIONS] Generated batch suggestions:', {
          fileCount: files.length,
          groups: batchSuggestions.groups?.length || 0,
          recommendations: batchSuggestions.recommendations?.length || 0,
        });

        return {
          success: true,
          ...batchSuggestions,
        };
      } catch (error) {
        logger.error('[SUGGESTIONS] Failed to get batch suggestions:', error);
        return {
          success: false,
          error: (error as Error).message,
          groups: [],
        };
      }
    }),
  );

  // Record Feedback Handler - with middleware and validation
  ipcMain.handle(
    IPC_CHANNELS.SUGGESTIONS.RECORD_FEEDBACK,
    compose(
      withErrorHandling,
      withRequestId,
      validateIpc(RecordFeedbackSchema),
    )(async (event, data) => {
      const { file, suggestion, accepted } = data;
      void event;
      try {
        // Get service from container
        const suggestionService = await getSuggestionService();
        if (!suggestionService) {
          logger.warn(
            '[SUGGESTIONS] Cannot record feedback - service not available',
          );
          return {
            success: false,
            error: 'Suggestion service unavailable',
          };
        }

        logger.info('[SUGGESTIONS] Recording feedback:', {
          file: file.name,
          suggestion: suggestion?.folder,
          accepted,
        });

        suggestionService.recordFeedback(file, suggestion, accepted);

        return {
          success: true,
        };
      } catch (error) {
        logger.error('[SUGGESTIONS] Failed to record feedback:', error);
        return {
          success: false,
          error: (error as Error).message,
        };
      }
    }),
  );

  // Get Strategies Handler - with middleware
  ipcMain.handle(
    IPC_CHANNELS.SUGGESTIONS.GET_STRATEGIES,
    compose(
      withErrorHandling,
      withRequestId,
    )(async (event) => {
      void event;
      try {
        logger.info('[SUGGESTIONS] Getting organization strategies');

        // Get service from container
        const suggestionService = await getSuggestionService();
        if (!suggestionService) {
          logger.warn(
            '[SUGGESTIONS] Cannot get strategies - service not available',
          );
          return {
            success: false,
            error: 'Suggestion service is not available',
            strategies: [],
          };
        }

        return {
          success: true,
          strategies: Object.entries(suggestionService.strategies || {}).map(
            ([id, strategy]) => ({
              id,
              ...(strategy as object),
            }),
          ),
        };
      } catch (error) {
        logger.error('[SUGGESTIONS] Failed to get strategies:', error);
        return {
          success: false,
          error: (error as Error).message,
          strategies: [],
        };
      }
    }),
  );

  // Apply Strategy Handler - with middleware and validation
  ipcMain.handle(
    IPC_CHANNELS.SUGGESTIONS.APPLY_STRATEGY,
    compose(
      withErrorHandling,
      withRequestId,
      validateIpc(ApplyStrategySchema),
    )(async (event, data) => {
      const { files, strategyId } = data;
      void event;
      try {
        logger.info('[SUGGESTIONS] Applying strategy:', {
          strategy: strategyId,
          fileCount: files.length,
        });

        // Get service from container
        const suggestionService = await getSuggestionService();
        if (!suggestionService) {
          logger.warn(
            '[SUGGESTIONS] Cannot apply strategy - service not available',
          );
          return {
            success: false,
            error: 'Suggestion service is not available',
            results: [],
          };
        }

        const strategy = suggestionService.strategies?.[strategyId];
        if (!strategy) {
          throw new Error(`Unknown strategy: ${strategyId}`);
        }

        const smartFolders = getCustomFolders();
        const results = [];

        for (const file of files) {
          const folder = suggestionService.mapFileToStrategy(
            file,
            strategy,
            smartFolders,
          );
          results.push({
            file,
            folder,
            strategy: strategyId,
          });
        }

        return {
          success: true,
          results,
        };
      } catch (error) {
        logger.error('[SUGGESTIONS] Failed to apply strategy:', error);
        return {
          success: false,
          error: (error as Error).message,
        };
      }
    }),
  );

  // Get User Patterns Handler - with middleware
  ipcMain.handle(
    IPC_CHANNELS.SUGGESTIONS.GET_USER_PATTERNS,
    compose(
      withErrorHandling,
      withRequestId,
    )(async (event) => {
      void event;
      try {
        logger.info('[SUGGESTIONS] Getting user patterns');

        // Get service from container
        const suggestionService = await getSuggestionService();
        if (!suggestionService) {
          logger.warn(
            '[SUGGESTIONS] Cannot get patterns - service not available',
          );
          return {
            success: false,
            error: 'Suggestion service is not available',
            patterns: [],
          };
        }

        const patterns = Array.from(
          (suggestionService.userPatterns || new Map()).entries(),
        ).map(([pattern, data]) => ({
          pattern,
          ...data,
        }));

        return {
          success: true,
          patterns,
        };
      } catch (error) {
        logger.error('[SUGGESTIONS] Failed to get user patterns:', error);
        return {
          success: false,
          error: (error as Error).message,
          patterns: [],
        };
      }
    }),
  );

  // Clear Patterns Handler - with middleware
  ipcMain.handle(
    IPC_CHANNELS.SUGGESTIONS.CLEAR_PATTERNS,
    compose(
      withErrorHandling,
      withRequestId,
    )(async (event) => {
      void event;
      try {
        logger.info('[SUGGESTIONS] Clearing user patterns');

        // Get service from container
        const suggestionService = await getSuggestionService();
        if (!suggestionService) {
          logger.warn(
            '[SUGGESTIONS] Cannot clear patterns - service not available',
          );
          return {
            success: false,
            error: 'Suggestion service is not available',
          };
        }

        if (suggestionService.userPatterns) {
          suggestionService.userPatterns.clear();
        }
        if (suggestionService.feedbackHistory) {
          suggestionService.feedbackHistory = [];
        }

        return {
          success: true,
        };
      } catch (error) {
        logger.error('[SUGGESTIONS] Failed to clear patterns:', error);
        return {
          success: false,
          error: (error as Error).message,
        };
      }
    }),
  );

  // Analyze Folder Structure Handler - with middleware and validation
  ipcMain.handle(
    IPC_CHANNELS.SUGGESTIONS.ANALYZE_FOLDER_STRUCTURE,
    compose(
      withErrorHandling,
      withRequestId,
      validateIpc(AnalyzeFolderStructureSchema),
    )(async (event, data) => {
      const { files = [] } = data;
      void event;
      try {
        logger.info('[SUGGESTIONS] Analyzing folder structure');

        // Get service from container
        const suggestionService = await getSuggestionService();
        if (!suggestionService) {
          logger.warn(
            '[SUGGESTIONS] Cannot analyze folder structure - service not available',
          );
          return {
            success: false,
            error: 'Suggestion service is not available',
            improvements: [],
            smartFolders: getCustomFolders(),
          };
        }

        const smartFolders = getCustomFolders();
        const improvements = await suggestionService.analyzeFolderStructure(
          smartFolders,
          files,
        );

        logger.info('[SUGGESTIONS] Folder analysis complete:', {
          improvementCount: improvements?.length || 0,
          smartFolderCount: smartFolders?.length || 0,
        });

        return {
          success: true,
          improvements: improvements || [],
          smartFolders: smartFolders || [],
        };
      } catch (error) {
        logger.error(
          '[SUGGESTIONS] Failed to analyze folder structure:',
          error,
        );
        return {
          success: false,
          error: (error as Error).message,
          improvements: [],
        };
      }
    }),
  );

  // Suggest New Folder Handler - with middleware and validation
  ipcMain.handle(
    IPC_CHANNELS.SUGGESTIONS.SUGGEST_NEW_FOLDER,
    compose(
      withErrorHandling,
      withRequestId,
      validateIpc(SuggestNewFolderSchema),
    )(async (event, data) => {
      const { file } = data;
      void event;
      try {
        logger.info('[SUGGESTIONS] Suggesting new folder for:', file.name);

        // Get service from container
        const suggestionService = await getSuggestionService();
        if (!suggestionService) {
          logger.warn(
            '[SUGGESTIONS] Cannot suggest new folder - service not available',
          );
          return {
            success: false,
            error: 'Suggestion service is not available',
            suggestion: null,
          };
        }

        const smartFolders = getCustomFolders();
        const suggestion = await suggestionService.suggestNewSmartFolder(
          file,
          smartFolders,
        );

        return {
          success: true,
          suggestion,
        };
      } catch (error) {
        logger.error('[SUGGESTIONS] Failed to suggest new folder:', error);
        return {
          success: false,
          error: (error as Error).message,
        };
      }
    }),
  );

  logger.info('[IPC] Suggestions handlers registered');
}
export { registerSuggestionsIpc };

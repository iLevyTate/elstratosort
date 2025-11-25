import { parentPort, workerData, isMainThread } from 'worker_threads';
import * as path from 'path';
import { logger } from '../../shared/logger';
import { initialize as initOllama } from '../ollamaUtils';
import { getInstance as getChromaDB } from '../services/ChromaDBService';
// Pre-import analysis modules but they will lazily use services
import { analyzeDocumentFile } from '../analysis/ollamaDocumentAnalysis';
import { analyzeImageFile } from '../analysis/ollamaImageAnalysis';
import embeddingQueue from '../analysis/EmbeddingQueue';

// Set context for worker logger
logger.setContext(`Worker-${process.pid}`);

// Error Codes
const ERROR_CODES = {
  MODEL_TIMEOUT: 'MODEL_TIMEOUT',
  FILE_ACCESS_ERROR: 'FILE_ACCESS_ERROR',
  OLLAMA_ERROR: 'OLLAMA_ERROR',
  INVALID_INPUT: 'INVALID_INPUT',
  UNKNOWN_ERROR: 'UNKNOWN_ERROR',
} as const;

/**
 * Worker message interface
 */
interface WorkerMessage {
  type: 'ping' | 'analyze';
  filePath?: string;
  smartFolders?: any[];
  id?: string | number;
}

/**
 * Worker data interface
 */
interface WorkerInitData {
  userDataPath?: string;
  logLevel?: string;
  logFile?: string;
}

/**
 * Analysis result interface
 */
interface AnalysisResult {
  type: 'result' | 'pong';
  id?: string | number;
  success: boolean;
  filePath?: string;
  result?: any;
  embeddings?: any[];
  error?: {
    code: string;
    message: string;
    stack?: string;
  };
}

/**
 * Structured error interface
 */
interface StructuredError extends Error {
  code?: string;
}

if (!isMainThread && parentPort) {
  // Initialize services with injected paths from main process
  if (workerData) {
    const data = workerData as WorkerInitData;
    const { userDataPath, logLevel, logFile } = data;

    // Sync log level
    if (logLevel !== undefined) {
      logger.setLevel(logLevel as any);
    }

    // Enable file logging if path provided
    if (logFile) {
      logger.enableFileLogging(logFile);
    }

    if (userDataPath) {
      logger.info(`Initializing worker services with userDataPath: ${userDataPath}`);

      // 1. Initialize Ollama Utils
      initOllama(userDataPath);

      // 2. Initialize ChromaDB Service (Singleton)
      getChromaDB({ userDataPath });

      // 3. Initialize Embedding Queue
      embeddingQueue.initialize({ userDataPath }).catch((err: Error) => {
        logger.error('Failed to initialize embedding queue in worker', { error: err.message });
      });
    } else {
      logger.warn('Worker started without userDataPath in workerData - services may fail');
    }
  }

  parentPort.on('message', async (message: WorkerMessage) => {
    const { type, filePath, smartFolders, id } = message;

    try {
      if (type === 'ping') {
        parentPort!.postMessage({ type: 'pong', id } as AnalysisResult);
        return;
      }

      if (type === 'analyze') {
        if (!filePath) {
          throw new Error('No file path provided');
        }

        const extension = path.extname(filePath).toLowerCase();
        const isImage = ['.jpg', '.jpeg', '.png', '.gif', '.bmp', '.webp', '.svg', '.tiff', '.tif'].includes(extension);

        logger.debug(`Starting analysis for ${filePath} (Image: ${isImage})`);

        let result: any;
        try {
          if (isImage) {
            result = await analyzeImageFile(filePath, smartFolders || []);
          } else {
            result = await analyzeDocumentFile(filePath, smartFolders || []);
          }
        } catch (analysisError: any) {
          // Map specific errors if possible
          const code = analysisError.message?.includes('ENOENT') ? ERROR_CODES.FILE_ACCESS_ERROR :
                       analysisError.message?.includes('timeout') ? ERROR_CODES.MODEL_TIMEOUT :
                       ERROR_CODES.UNKNOWN_ERROR;
          const structuredError: StructuredError = new Error(analysisError.message);
          structuredError.code = code;
          structuredError.stack = analysisError.stack;
          throw structuredError;
        }

        // Drain any embeddings generated during analysis
        const embeddings = embeddingQueue.drainQueue();

        parentPort!.postMessage({
          type: 'result',
          id,
          success: true,
          filePath,
          result,
          embeddings, // Send back embeddings to main process for persistence/DB
        } as AnalysisResult);
      }
    } catch (error: any) {
      // Handle structured or raw errors
      const errorResponse: AnalysisResult = {
        type: 'result',
        id,
        success: false,
        filePath,
        error: {
          code: error.code || ERROR_CODES.UNKNOWN_ERROR,
          message: error.message || String(error),
          stack: error.stack,
        },
      };

      logger.error(`Worker analysis failed for ${filePath}`, errorResponse.error);

      parentPort!.postMessage(errorResponse);
    }
  });
}

/**
 * Analyze File Use Case
 * Business logic for analyzing a file and extracting metadata
 */

import { Analysis } from '../models/Analysis';
import { File } from '../models/File';
import type { IFileRepository } from '../repositories/IFileRepository';
import { StratoSortError, ErrorCodes, getErrorMessage } from '../../shared/errors';

/**
 * Analysis service interface for file analysis operations
 */
interface IAnalysisService {
  analyzeImage(path: string, options?: AnalysisOptions): Promise<RawAnalysisResponse>;
  analyzeDocument(path: string, options?: AnalysisOptions): Promise<RawAnalysisResponse>;
}

/**
 * Options for file analysis
 */
interface AnalysisOptions {
  forceReanalyze?: boolean;
  model?: string;
  namingConvention?: NamingConvention;
}

/**
 * Naming convention settings
 */
interface NamingConvention {
  caseConvention?: 'lowercase' | 'uppercase' | 'sentence' | 'title';
  separator?: string;
}

/**
 * Raw analysis response from LLM
 */
interface RawAnalysisResponse {
  category?: string;
  suggestedName?: string;
  suggested_name?: string;
  confidence?: number;
  summary?: string;
  description?: string;
  keywords?: string[];
  metadata?: Record<string, unknown>;
}

/**
 * Dependencies for the use case
 */
interface AnalyzeFileUseCaseDeps {
  analysisService: IAnalysisService;
  fileRepository: IFileRepository;
}

export class AnalyzeFileUseCase {
  private analysisService: IAnalysisService;
  private fileRepository: IFileRepository;

  constructor({ analysisService, fileRepository }: AnalyzeFileUseCaseDeps) {
    this.analysisService = analysisService;
    this.fileRepository = fileRepository;
  }

  /**
   * Execute the use case
   * @param file - The file domain model to analyze
   * @param options - Analysis options
   * @returns The analysis result
   */
  async execute(file: File, options: AnalysisOptions = {}): Promise<Analysis> {
    try {
      // Validate input
      this.validateInput(file);

      // Check if file is already analyzed
      if (file.isAnalyzed() && !options.forceReanalyze) {
        return file.analysis!;
      }

      // Update file state
      file.updateState('analyzing');
      await this.fileRepository.update(file);

      // Perform analysis based on file type
      let rawAnalysis: RawAnalysisResponse;
      if (file.metadata.isImage()) {
        rawAnalysis = await this.analysisService.analyzeImage(
          file.path,
          options,
        );
      } else {
        rawAnalysis = await this.analysisService.analyzeDocument(
          file.path,
          options,
        );
      }

      // Create Analysis domain model from raw response
      const analysis = Analysis.fromLLMResponse(
        rawAnalysis,
        options.model || 'default',
      );

      // Validate analysis result
      if (!analysis.isValid()) {
        throw new StratoSortError(
          'Analysis result is invalid',
          ErrorCodes.ANALYSIS_VALIDATION_ERROR,
          { errors: analysis.getValidationErrors() },
        );
      }

      // Apply naming conventions if provided
      if (options.namingConvention) {
        analysis.updateSuggestedName(
          this.applyNamingConvention(
            analysis.suggestedName,
            options.namingConvention,
          ),
        );
      }

      // Update file with analysis
      file.setAnalysis(analysis);
      await this.fileRepository.update(file);

      return analysis;
    } catch (error) {
      // Handle errors
      const errorMsg = getErrorMessage(error);
      file.setError(errorMsg);
      await this.fileRepository.update(file);

      if (error instanceof StratoSortError) {
        throw error;
      }

      throw new StratoSortError(
        'Failed to analyze file',
        ErrorCodes.ANALYSIS_ERROR,
        { originalError: errorMsg, filePath: file.path },
      );
    }
  }

  /**
   * Validate input
   */
  private validateInput(file: File): void {
    if (!file) {
      throw new StratoSortError(
        'File is required',
        ErrorCodes.VALIDATION_ERROR,
      );
    }

    if (!file.metadata || !file.metadata.path) {
      throw new StratoSortError(
        'File path is required',
        ErrorCodes.VALIDATION_ERROR,
      );
    }

    if (file.hasError()) {
      throw new StratoSortError(
        'Cannot analyze file with existing error',
        ErrorCodes.VALIDATION_ERROR,
        { error: file.error },
      );
    }
  }

  /**
   * Apply naming convention
   */
  private applyNamingConvention(name: string, convention: NamingConvention): string {
    if (!name) return '';

    let result = name;

    // Apply case convention
    switch (convention.caseConvention) {
      case 'lowercase':
        result = result.toLowerCase();
        break;
      case 'uppercase':
        result = result.toUpperCase();
        break;
      case 'sentence':
        result = result.charAt(0).toUpperCase() + result.slice(1).toLowerCase();
        break;
      case 'title':
        result = result
          .split(' ')
          .map(
            (word: string) =>
              word.charAt(0).toUpperCase() + word.slice(1).toLowerCase(),
          )
          .join(' ');
        break;
      default:
        break;
    }

    // Apply separator
    if (convention.separator) {
      result = result.replace(/\s+/g, convention.separator);
    }

    return result;
  }
}

export default AnalyzeFileUseCase;

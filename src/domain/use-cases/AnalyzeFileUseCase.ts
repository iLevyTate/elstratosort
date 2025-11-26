/**
 * Analyze File Use Case
 * Business logic for analyzing a file and extracting metadata
 */

import { Analysis } from '../models/Analysis';
import {
  StratoSortError,
  ErrorCodes,
} from '../../shared/errors/StratoSortError';
import { getErrorMessage } from '../../shared/errors';

export class AnalyzeFileUseCase {
  constructor({ analysisService, fileRepository }) {
    this.analysisService = analysisService;
    this.fileRepository = fileRepository;
  }

  /**
   * Execute the use case
   * @param {File} file - The file domain model to analyze
   * @param {Object} options - Analysis options
   * @returns {Promise<Analysis>} - The analysis result
   */
  async execute(file, options = {}) {
    try {
      // Validate input
      this.validateInput(file);

      // Check if file is already analyzed
      if (file.isAnalyzed() && !options.forceReanalyze) {
        return file.analysis;
      }

      // Update file state
      file.updateState('analyzing');
      await this.fileRepository.update(file);

      // Perform analysis based on file type
      let rawAnalysis;
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
          ErrorCodes.ANALYSIS_VALIDATION_ERROR,
          'Analysis result is invalid',
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
        ErrorCodes.ANALYSIS_ERROR,
        'Failed to analyze file',
        { originalError: errorMsg, filePath: file.path },
      );
    }
  }

  /**
   * Validate input
   */
  validateInput(file) {
    if (!file) {
      throw new StratoSortError(
        ErrorCodes.VALIDATION_ERROR,
        'File is required',
      );
    }

    if (!file.metadata || !file.metadata.path) {
      throw new StratoSortError(
        ErrorCodes.VALIDATION_ERROR,
        'File path is required',
      );
    }

    if (file.hasError()) {
      throw new StratoSortError(
        ErrorCodes.VALIDATION_ERROR,
        'Cannot analyze file with existing error',
        { error: file.error },
      );
    }
  }

  /**
   * Apply naming convention
   */
  applyNamingConvention(name, convention) {
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
            (word) =>
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

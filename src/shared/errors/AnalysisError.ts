/**
 * Error for file analysis failures
 */
import StratoSortError from './StratoSortError';
import path from 'path';

class AnalysisError extends StratoSortError {
  filePath: string;
  stage: string;
  originalError: Error;

  /**
   * @param filePath - Path to file being analyzed
   * @param stage - Stage where analysis failed (extraction, llm, embedding, etc.)
   * @param originalError - The original error
   */
  constructor(filePath: string, stage: string, originalError: Error) {
    const fileName = path.basename(filePath);

    super(
      `Analysis failed at ${stage} stage for ${filePath}: ${originalError.message}`,
      `ANALYSIS_${stage.toUpperCase()}_FAILED`,
      {
        filePath,
        fileName,
        fileExtension: path.extname(filePath),
        stage,
        originalError: originalError.message,
        errorCode: (originalError as any).code,
      },
      `Unable to analyze file "${fileName}" at ${stage} stage`,
      [
        {
          label: 'Skip this file',
          action: 'skip',
          description: 'Continue analyzing other files and skip this one',
        },
        {
          label: 'Try again',
          action: 'retry',
          description: 'Retry analysis for this file',
        },
        {
          label: 'View error details',
          action: 'viewDetails',
          description: 'See technical error details for troubleshooting',
        },
      ]
    );

    this.filePath = filePath;
    this.stage = stage;
    this.originalError = originalError;
  }
}

export default AnalysisError;

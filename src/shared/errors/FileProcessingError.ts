/**
 * Error for file processing failures during analysis
 * Used for document extraction, PDF processing, etc.
 */
import StratoSortError from './StratoSortError';
import path from 'path';

/**
 * Error code to message mapping
 */
const ERROR_MESSAGES: Record<string, string> = {
  FILE_TOO_LARGE: 'File size exceeds processing limits',
  FILE_READ_ERROR: 'Failed to read file',
  PDF_PROCESSING_FAILURE: 'Failed to extract text from PDF document',
  PDF_NO_TEXT_CONTENT: 'PDF contains no extractable text',
  XLSX_EXTRACTION_FAILURE: 'Failed to extract data from spreadsheet',
  PPTX_EXTRACTION_FAILURE: 'Failed to extract text from presentation',
  IMAGE_ANALYSIS_FAILURE: 'Failed to analyze image content',
  AUDIO_ANALYSIS_FAILURE: 'Failed to process audio file',
  DOCUMENT_ANALYSIS_FAILURE: 'Document analysis failed',
  FILE_TYPE_UNSUPPORTED: 'Unsupported file type',
};

/**
 * Error code to user-friendly message mapping
 */
const USER_MESSAGES: Record<string, string> = {
  FILE_TOO_LARGE: 'This file is too large for processing. Please use a smaller file.',
  FILE_READ_ERROR: 'Unable to read this file. It may be corrupted or in use.',
  PDF_PROCESSING_FAILURE: "This PDF couldn't be processed. It may be corrupted or password-protected.",
  PDF_NO_TEXT_CONTENT: 'This PDF appears to be image-based or has no extractable text.',
  XLSX_EXTRACTION_FAILURE: "This spreadsheet couldn't be processed. It may be corrupted or password-protected.",
  PPTX_EXTRACTION_FAILURE: "This presentation couldn't be processed. It may be corrupted or password-protected.",
  IMAGE_ANALYSIS_FAILURE: "This image couldn't be analyzed. Please check the file format.",
  AUDIO_ANALYSIS_FAILURE: "This audio file couldn't be processed. Please verify the format is supported.",
  DOCUMENT_ANALYSIS_FAILURE: 'Failed to analyze this document. Please check the file format.',
  FILE_TYPE_UNSUPPORTED: 'This file type is not supported for analysis.',
};

class FileProcessingError extends StratoSortError {
  fileName: string;
  fileExtension: string;

  /**
   * @param code - Error code (e.g., 'FILE_TOO_LARGE', 'PDF_PROCESSING_FAILURE')
   * @param fileName - Name or path of the file that failed
   * @param additionalMetadata - Additional context (suggestion, fileSize, etc.)
   */
  constructor(code: string, fileName: string, additionalMetadata: Record<string, unknown> = {}) {
    const baseName = path.basename(fileName);
    const extension = path.extname(fileName);
    const message = ERROR_MESSAGES[code] || 'File processing failed';
    const userMessage = USER_MESSAGES[code] || 'An error occurred while processing this file.';

    super(
      `${message}: ${baseName}`,
      code,
      {
        fileName: baseName,
        filePath: fileName,
        fileExtension: extension,
        ...additionalMetadata,
      },
      userMessage,
      FileProcessingError._getRecoveryActions(code)
    );

    this.fileName = baseName;
    this.fileExtension = extension;
  }

  /**
   * Get recovery actions based on error code
   */
  static _getRecoveryActions(code: string): Array<{
    label: string;
    action: string;
    description: string;
  }> {
    const actions: Array<{
      label: string;
      action: string;
      description: string;
    }> = [];

    switch (code) {
      case 'FILE_TOO_LARGE':
        actions.push({
          label: 'Skip this file',
          action: 'skip',
          description: 'Continue without processing this file',
        });
        break;

      case 'PDF_NO_TEXT_CONTENT':
        actions.push({
          label: 'Try OCR extraction',
          action: 'ocr',
          description: 'Attempt to extract text using optical character recognition',
        });
        break;

      case 'PDF_PROCESSING_FAILURE':
      case 'XLSX_EXTRACTION_FAILURE':
      case 'PPTX_EXTRACTION_FAILURE':
        actions.push({
          label: 'Skip this file',
          action: 'skip',
          description: 'Continue analyzing other files',
        });
        actions.push({
          label: 'View error details',
          action: 'viewDetails',
          description: 'See technical error details for troubleshooting',
        });
        break;

      case 'FILE_TYPE_UNSUPPORTED':
        actions.push({
          label: 'Skip this file',
          action: 'skip',
          description: 'Continue analyzing supported files only',
        });
        break;

      default:
        break;
    }

    // Always offer retry
    actions.push({
      label: 'Try again',
      action: 'retry',
      description: 'Retry processing this file',
    });

    return actions;
  }
}

export default FileProcessingError;


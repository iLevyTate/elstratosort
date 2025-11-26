/**
 * Analysis Type Definitions
 * Types for file analysis results and operations
 */

/**
 * Analysis result from LLM processing
 */
export interface AnalysisResult {
  /** Primary category for the file */
  category?: string;
  /** Suggested new filename */
  suggestedName?: string;
  /** Confidence score (0-1) */
  confidence?: number;
  /** Brief summary of file contents */
  summary?: string;
  /** Extracted keywords */
  keywords?: string[];
  /** Additional metadata from analysis */
  metadata?: Record<string, unknown>;
  /** When the analysis was performed */
  analyzedAt?: string;
  /** Model used for analysis */
  model?: string | null;
  /** Error message if analysis failed */
  error?: string;
}

/**
 * Analysis request options
 */
export interface AnalysisOptions {
  /** Extract text content from files */
  extractText?: boolean;
  /** Perform AI content analysis */
  analyzeContent?: boolean;
  /** Force re-analysis even if cached */
  force?: boolean;
  /** Custom model to use */
  model?: string;
  /** Timeout in milliseconds */
  timeout?: number;
}

/**
 * Batch analysis request
 */
export interface BatchAnalysisRequest {
  /** File paths to analyze */
  files: string[];
  /** Analysis options */
  options?: AnalysisOptions;
}

/**
 * Batch analysis result
 */
export interface BatchAnalysisResult {
  /** Successfully analyzed files */
  successful: Array<{
    path: string;
    analysis: AnalysisResult;
  }>;
  /** Failed analyses */
  failed: Array<{
    path: string;
    error: string;
  }>;
  /** Total duration in milliseconds */
  duration: number;
}

/**
 * Analysis progress event
 */
export interface AnalysisProgress {
  /** Current file being analyzed */
  currentFile: string;
  /** Index of current file (1-based) */
  current: number;
  /** Total files to analyze */
  total: number;
  /** Percentage complete (0-100) */
  percentage: number;
  /** Status message */
  status: string;
}

/**
 * Analysis history entry
 */
export interface AnalysisHistoryEntry {
  /** Unique identifier */
  id: string;
  /** Original file path */
  filePath: string;
  /** File name */
  fileName: string;
  /** Analysis result */
  result: AnalysisResult;
  /** When the analysis was performed */
  timestamp: string;
  /** Duration in milliseconds */
  duration?: number;
}

/**
 * Analysis statistics
 */
export interface AnalysisStatistics {
  /** Total files analyzed */
  totalAnalyzed: number;
  /** Successful analyses */
  successful: number;
  /** Failed analyses */
  failed: number;
  /** Average confidence score */
  averageConfidence: number;
  /** Most common categories */
  topCategories: Array<{ category: string; count: number }>;
  /** Analysis by date */
  byDate: Record<string, number>;
}

/**
 * LLM response from Ollama
 */
export interface LLMAnalysisResponse {
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
 * Confidence levels for display
 */
export type ConfidenceLevel =
  | 'very_high'
  | 'high'
  | 'medium'
  | 'low'
  | 'very_low';

/**
 * Get confidence level from score
 */
export function getConfidenceLevel(confidence: number): ConfidenceLevel {
  if (confidence >= 0.9) return 'very_high';
  if (confidence >= 0.7) return 'high';
  if (confidence >= 0.5) return 'medium';
  if (confidence >= 0.3) return 'low';
  return 'very_low';
}

/**
 * Get confidence color for UI
 */
export function getConfidenceColor(confidence: number): string {
  if (confidence >= 0.7) return 'green';
  if (confidence >= 0.5) return 'yellow';
  return 'red';
}

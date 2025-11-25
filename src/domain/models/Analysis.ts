/**
 * Analysis Domain Model
 * Represents the analysis result of a file
 */

export interface AnalysisData {
  category: string;
  suggestedName: string;
  confidence: number;
  summary?: string;
  keywords?: string[];
  metadata?: Record<string, unknown>;
  analyzedAt?: string;
  model?: string | null;
}

export class Analysis {
  category: string;
  suggestedName: string;
  confidence: number;
  summary: string;
  keywords: string[];
  metadata: Record<string, unknown>;
  analyzedAt: string;
  model: string | null;

  constructor({
    category,
    suggestedName,
    confidence,
    summary = '',
    keywords = [],
    metadata = {},
    analyzedAt = new Date().toISOString(),
    model = null,
  }: AnalysisData) {
    this.category = category;
    this.suggestedName = suggestedName;
    this.confidence = confidence;
    this.summary = summary;
    this.keywords = keywords;
    this.metadata = metadata;
    this.analyzedAt = analyzedAt;
    this.model = model;

    // Validate confidence
    if (this.confidence < 0 || this.confidence > 1) {
      throw new Error('Confidence must be between 0 and 1');
    }
  }

  /**
   * Check if confidence is high enough
   */
  isConfident(threshold = 0.7): boolean {
    return this.confidence >= threshold;
  }

  /**
   * Check if analysis needs review
   */
  needsReview(threshold = 0.7): boolean {
    return !this.isConfident(threshold);
  }

  /**
   * Get confidence level description
   */
  getConfidenceLevel(): string {
    if (this.confidence >= 0.9) return 'very high';
    if (this.confidence >= 0.7) return 'high';
    if (this.confidence >= 0.5) return 'medium';
    if (this.confidence >= 0.3) return 'low';
    return 'very low';
  }

  /**
   * Get confidence color for UI
   */
  getConfidenceColor(): string {
    if (this.confidence >= 0.7) return 'green';
    if (this.confidence >= 0.5) return 'yellow';
    return 'red';
  }

  /**
   * Validate category
   */
  hasValidCategory(): boolean {
    return Boolean(this.category && this.category.trim().length > 0);
  }

  /**
   * Validate suggested name
   */
  hasValidSuggestedName(): boolean {
    return Boolean(this.suggestedName && this.suggestedName.trim().length > 0);
  }

  /**
   * Check if analysis is complete and valid
   */
  isValid(): boolean {
    return Boolean(
      this.hasValidCategory() &&
        this.hasValidSuggestedName() &&
        this.confidence >= 0 &&
        this.confidence <= 1,
    );
  }

  /**
   * Get validation errors
   */
  getValidationErrors(): string[] {
    const errors: string[] = [];

    if (!this.hasValidCategory()) {
      errors.push('Missing or invalid category');
    }

    if (!this.hasValidSuggestedName()) {
      errors.push('Missing or invalid suggested name');
    }

    if (this.confidence < 0 || this.confidence > 1) {
      errors.push('Invalid confidence value');
    }

    return errors;
  }

  /**
   * Update category
   */
  updateCategory(newCategory: string): void {
    this.category = newCategory;
  }

  /**
   * Update suggested name
   */
  updateSuggestedName(newName: string): void {
    this.suggestedName = newName;
  }

  /**
   * Add keyword
   */
  addKeyword(keyword: string): void {
    if (!this.keywords.includes(keyword)) {
      this.keywords.push(keyword);
    }
  }

  /**
   * Remove keyword
   */
  removeKeyword(keyword: string): void {
    this.keywords = this.keywords.filter((k) => k !== keyword);
  }

  /**
   * Update metadata
   */
  updateMetadata(key: string, value: unknown): void {
    this.metadata[key] = value;
  }

  /**
   * Get time since analysis
   */
  getTimeSinceAnalysis(): string {
    const now = new Date();
    const analyzed = new Date(this.analyzedAt);
    const diffMs = now.getTime() - analyzed.getTime();
    const diffMins = Math.floor(diffMs / 60000);

    if (diffMins < 1) return 'just now';
    if (diffMins < 60) return `${diffMins} minute${diffMins > 1 ? 's' : ''} ago`;

    const diffHours = Math.floor(diffMins / 60);
    if (diffHours < 24)
      return `${diffHours} hour${diffHours > 1 ? 's' : ''} ago`;

    const diffDays = Math.floor(diffHours / 24);
    return `${diffDays} day${diffDays > 1 ? 's' : ''} ago`;
  }

  /**
   * Clone analysis with modifications
   */
  clone(modifications: Partial<AnalysisData> = {}): Analysis {
    return new Analysis({
      category: modifications.category ?? this.category,
      suggestedName: modifications.suggestedName ?? this.suggestedName,
      confidence: modifications.confidence ?? this.confidence,
      summary: modifications.summary ?? this.summary,
      keywords: modifications.keywords ?? [...this.keywords],
      metadata: modifications.metadata ?? { ...this.metadata },
      analyzedAt: this.analyzedAt,
      model: modifications.model ?? this.model,
    });
  }

  /**
   * Convert to plain object for serialization
   */
  toJSON(): AnalysisData {
    return {
      category: this.category,
      suggestedName: this.suggestedName,
      confidence: this.confidence,
      summary: this.summary,
      keywords: this.keywords,
      metadata: this.metadata,
      analyzedAt: this.analyzedAt,
      model: this.model,
    };
  }

  /**
   * Create from plain object
   */
  static fromJSON(data: AnalysisData): Analysis {
    return new Analysis(data);
  }

  /**
   * Create from raw LLM response
   */
  static fromLLMResponse(
    response: {
      category?: string;
      suggestedName?: string;
      suggested_name?: string;
      confidence?: number;
      summary?: string;
      description?: string;
      keywords?: string[];
      metadata?: Record<string, unknown>;
    },
    model: string | null = null,
  ): Analysis {
    return new Analysis({
      category: response.category || 'Uncategorized',
      suggestedName: response.suggestedName || response.suggested_name || '',
      confidence: response.confidence || 0.5,
      summary: response.summary || response.description || '',
      keywords: response.keywords || [],
      metadata: response.metadata || {},
      model,
    });
  }
}

export default Analysis;

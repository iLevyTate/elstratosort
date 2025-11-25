/**
 * File Domain Model
 * Represents a file in the system with its metadata and business logic
 */

import type { Analysis } from './Analysis';

export interface FileMetadataData {
  path: string;
  name: string;
  extension: string;
  size: number;
  created?: string;
  modified?: string;
  mimeType?: string | null;
}

export type ProcessingState = 'pending' | 'analyzing' | 'ready' | 'organizing' | 'organized' | 'error';
export type FileSource = 'file_selection' | 'folder_scan' | 'drag_drop' | 'unknown';

export interface FileData {
  metadata: FileMetadataData;
  analysis?: Analysis | null;
  processingState?: ProcessingState;
  error?: string | null;
  source?: FileSource;
  addedAt?: string;
}

export class FileMetadata {
  path: string;
  name: string;
  extension: string;
  size: number;
  created?: string;
  modified?: string;
  mimeType: string | null;

  constructor({
    path,
    name,
    extension,
    size,
    created,
    modified,
    mimeType = null,
  }: FileMetadataData) {
    this.path = path;
    this.name = name;
    this.extension = extension;
    this.size = size;
    this.created = created;
    this.modified = modified;
    this.mimeType = mimeType;
  }

  /**
   * Check if file is an image
   */
  isImage(): boolean {
    const imageExtensions = [
      '.jpg',
      '.jpeg',
      '.png',
      '.gif',
      '.bmp',
      '.webp',
      '.svg',
      '.tiff',
    ];
    return imageExtensions.includes(this.extension.toLowerCase());
  }

  /**
   * Check if file is a document
   */
  isDocument(): boolean {
    const docExtensions = [
      '.pdf',
      '.doc',
      '.docx',
      '.txt',
      '.rtf',
      '.odt',
      '.md',
    ];
    return docExtensions.includes(this.extension.toLowerCase());
  }

  /**
   * Check if file is a spreadsheet
   */
  isSpreadsheet(): boolean {
    const spreadsheetExtensions = ['.xls', '.xlsx', '.csv', '.ods'];
    return spreadsheetExtensions.includes(this.extension.toLowerCase());
  }

  /**
   * Get human-readable file size
   */
  getFormattedSize(): string {
    const units = ['B', 'KB', 'MB', 'GB', 'TB'];
    let size = this.size;
    let unitIndex = 0;

    while (size >= 1024 && unitIndex < units.length - 1) {
      size /= 1024;
      unitIndex++;
    }

    return `${size.toFixed(2)} ${units[unitIndex]}`;
  }

  /**
   * Get file type category
   */
  getCategory(): string {
    if (this.isImage()) return 'image';
    if (this.isDocument()) return 'document';
    if (this.isSpreadsheet()) return 'spreadsheet';
    return 'other';
  }
}

export class File {
  metadata: FileMetadata;
  analysis: Analysis | null;
  processingState: ProcessingState;
  error: string | null;
  source: FileSource;
  addedAt: string;

  constructor({
    metadata,
    analysis = null,
    processingState = 'pending',
    error = null,
    source = 'unknown',
    addedAt = new Date().toISOString(),
  }: FileData & { metadata: FileMetadata }) {
    this.metadata = metadata;
    this.analysis = analysis;
    this.processingState = processingState;
    this.error = error;
    this.source = source;
    this.addedAt = addedAt;
  }

  /**
   * Get file path
   */
  get path(): string {
    return this.metadata.path;
  }

  /**
   * Get file name
   */
  get name(): string {
    return this.metadata.name;
  }

  /**
   * Check if file is analyzed
   */
  isAnalyzed(): boolean {
    return this.analysis !== null && this.processingState === 'ready';
  }

  /**
   * Check if file is ready for organization
   */
  isReadyForOrganization(): boolean {
    return this.isAnalyzed() && this.processingState === 'ready';
  }

  /**
   * Check if file has error
   */
  hasError(): boolean {
    return this.error !== null || this.processingState === 'error';
  }

  /**
   * Check if file is being processed
   */
  isProcessing(): boolean {
    return (
      this.processingState === 'analyzing' ||
      this.processingState === 'organizing'
    );
  }

  /**
   * Update processing state
   */
  updateState(newState: ProcessingState): void {
    this.processingState = newState;
  }

  /**
   * Set analysis result
   */
  setAnalysis(analysis: Analysis): void {
    this.analysis = analysis;
    this.processingState = 'ready';
    this.error = null;
  }

  /**
   * Set error
   */
  setError(error: string): void {
    this.error = error;
    this.processingState = 'error';
  }

  /**
   * Mark as organized
   */
  markAsOrganized(): void {
    this.processingState = 'organized';
  }

  /**
   * Get suggested destination from analysis
   */
  getSuggestedDestination(defaultLocation: string): { category: string; suggestedName: string; fullPath: string } | null {
    if (!this.analysis) return null;
    const category = this.analysis.category || 'Uncategorized';
    const suggestedName = this.analysis.suggestedName || this.name;

    return {
      category,
      suggestedName,
      fullPath: `${defaultLocation}/${category}/${suggestedName}`,
    };
  }

  /**
   * Validate file can be organized
   */
  canBeOrganized(): { valid: boolean; reason?: string } {
    if (!this.isReadyForOrganization()) {
      return {
        valid: false,
        reason: 'File is not analyzed or not ready',
      };
    }
    if (!this.analysis?.category) {
      return {
        valid: false,
        reason: 'File has no category assigned',
      };
    }
    if (!this.analysis?.suggestedName) {
      return {
        valid: false,
        reason: 'File has no suggested name',
      };
    }

    return { valid: true };
  }

  /**
   * Convert to plain object for serialization
   */
  toJSON(): FileData {
    return {
      metadata: this.metadata,
      analysis: this.analysis,
      processingState: this.processingState,
      error: this.error,
      source: this.source,
      addedAt: this.addedAt,
    };
  }

  /**
   * Create from plain object
   */
  static fromJSON(data: FileData): File {
    return new File({
      metadata: new FileMetadata(data.metadata),
      analysis: data.analysis,
      processingState: data.processingState,
      error: data.error,
      source: data.source,
      addedAt: data.addedAt,
    });
  }

  /**
   * Create from file path and stats
   */
  static async fromPath(filePath: string, stats?: { size?: number; created?: string; modified?: string }): Promise<File> {
    const fileName = filePath.split(/[\\/]/).pop() || '';
    const extension = fileName.includes('.')
      ? '.' + (fileName.split('.').pop()?.toLowerCase() || '')
      : '';

    const metadata = new FileMetadata({
      path: filePath,
      name: fileName,
      extension,
      size: stats?.size || 0,
      created: stats?.created,
      modified: stats?.modified,
    });

    return new File({
      metadata,
      source: 'file_selection',
    });
  }
}

export default File;

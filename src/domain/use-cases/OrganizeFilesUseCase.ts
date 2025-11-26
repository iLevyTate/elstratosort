/**
 * Organize Files Use Case
 * Business logic for organizing files into folders
 */

import { OrganizationBatch, OrganizationOperation } from '../models/Organization';
import { File } from '../models/File';
import type { IFileRepository } from '../repositories/IFileRepository';
import type { ISmartFolderRepository } from '../repositories/ISmartFolderRepository';
import type { SmartFolder } from '../../shared/types/smartFolder';
import { StratoSortError, ErrorCodes, getErrorMessage } from '../../shared/errors';

/**
 * Organization service interface for file move operations
 */
interface IOrganizationService {
  moveFile(
    sourcePath: string,
    destPath: string,
    options: { createDirectories?: boolean; overwrite?: boolean }
  ): Promise<void>;
}

/**
 * Transaction journal interface for tracking operations
 */
interface ITransactionJournal {
  begin(data: { type: string; source: string; destination: string }): Promise<string>;
  commit(transactionId: string): Promise<void>;
  rollback(transactionId: string): Promise<void>;
}

/**
 * Organization options
 */
interface OrganizeOptions {
  defaultLocation: string;
  confidenceThreshold?: number;
  failFast?: boolean;
  overwrite?: boolean;
}

/**
 * Dependencies for the use case
 */
interface OrganizeFilesUseCaseDeps {
  fileRepository: IFileRepository;
  organizationService: IOrganizationService;
  smartFolderRepository: ISmartFolderRepository;
  transactionJournal: ITransactionJournal;
}

/**
 * Batch execution result
 */
interface BatchExecutionResult {
  success: boolean;
  operation: OrganizationOperation;
  error?: string;
}

export class OrganizeFilesUseCase {
  private fileRepository: IFileRepository;
  private organizationService: IOrganizationService;
  private smartFolderRepository: ISmartFolderRepository;
  private transactionJournal: ITransactionJournal;

  constructor({
    fileRepository,
    organizationService,
    smartFolderRepository,
    transactionJournal,
  }: OrganizeFilesUseCaseDeps) {
    this.fileRepository = fileRepository;
    this.organizationService = organizationService;
    this.smartFolderRepository = smartFolderRepository;
    this.transactionJournal = transactionJournal;
  }

  /**
   * Execute the use case
   * @param files - Array of File domain models
   * @param options - Organization options
   * @returns The batch operation result
   */
  async execute(files: File[], options: OrganizeOptions): Promise<OrganizationBatch> {
    try {
      // Validate input
      this.validateInput(files, options);

      // Filter files that can be organized
      const organizableFiles = this.filterOrganizableFiles(files, options);

      if (organizableFiles.length === 0) {
        throw new StratoSortError(
          'No files can be organized',
          ErrorCodes.VALIDATION_ERROR,
          { reason: 'All files failed validation' },
        );
      }

      // Get smart folders
      const smartFolders = await this.smartFolderRepository.getAll();

      // Create organization batch
      const batch = OrganizationBatch.fromFiles(organizableFiles, {
        defaultLocation: options.defaultLocation,
        smartFolderMatcher: (category: string) =>
          this.matchSmartFolder(category, smartFolders),
      });

      // Mark batch as started
      batch.markAsStarted();

      // Execute batch operations
      await this.executeBatch(batch, options);

      // Mark batch as completed
      batch.markAsCompleted();

      // Update file states
      await this.updateFileStates(batch);

      return batch;
    } catch (error) {
      if (error instanceof StratoSortError) {
        throw error;
      }

      throw new StratoSortError(
        'Failed to organize files',
        ErrorCodes.ORGANIZATION_ERROR,
        { originalError: getErrorMessage(error) },
      );
    }
  }

  /**
   * Validate input
   */
  private validateInput(files: File[], options: OrganizeOptions): void {
    if (!Array.isArray(files) || files.length === 0) {
      throw new StratoSortError(
        'Files array is required and must not be empty',
        ErrorCodes.VALIDATION_ERROR,
      );
    }

    if (!options.defaultLocation) {
      throw new StratoSortError(
        'Default location is required',
        ErrorCodes.VALIDATION_ERROR,
      );
    }
  }

  /**
   * Filter files that can be organized
   */
  private filterOrganizableFiles(files: File[], options: OrganizeOptions): File[] {
    const { confidenceThreshold = 0.7 } = options;

    return files.filter((file: File) => {
      // Check if file can be organized
      const validation = file.canBeOrganized();
      if (!validation.valid) {
        return false;
      }

      // Check confidence threshold
      if (file.analysis && file.analysis.confidence < confidenceThreshold) {
        return false;
      }

      return true;
    });
  }

  /**
   * Match smart folder for category
   */
  private matchSmartFolder(category: string, smartFolders: SmartFolder[]): SmartFolder | null {
    if (!category) return null;

    const normalizedCategory = category.toLowerCase().trim();

    for (const folder of smartFolders) {
      const folderName = folder.name.toLowerCase().trim();

      // Exact match
      if (folderName === normalizedCategory) {
        return folder;
      }

      // Plural/singular match
      if (
        folderName === normalizedCategory + 's' ||
        folderName + 's' === normalizedCategory
      ) {
        return folder;
      }

      // Check folder keywords/tags
      if (folder.keywords && folder.keywords.length > 0) {
        const normalizedKeywords = folder.keywords.map((k: string) =>
          k.toLowerCase().trim(),
        );
        if (normalizedKeywords.includes(normalizedCategory)) {
          return folder;
        }
      }
    }

    return null;
  }

  /**
   * Execute batch operations
   */
  private async executeBatch(
    batch: OrganizationBatch,
    options: OrganizeOptions
  ): Promise<BatchExecutionResult[]> {
    const results: BatchExecutionResult[] = [];

    for (let i = 0; i < batch.operations.length; i++) {
      const operation = batch.operations[i];

      try {
        // Mark operation as executing
        operation.markAsExecuting();
        batch.updateProgress(i + 1);

        // Execute operation
        await this.executeOperation(operation, options);

        // Mark operation as completed
        operation.markAsCompleted();
        results.push({ success: true, operation });
      } catch (error) {
        // Mark operation as failed
        const errorMsg = getErrorMessage(error);
        operation.markAsFailed(errorMsg);
        results.push({ success: false, operation, error: errorMsg });

        // Continue or fail fast based on options
        if (options.failFast) {
          throw error;
        }
      }
    }

    return results;
  }

  /**
   * Execute single operation
   */
  private async executeOperation(
    operation: OrganizationOperation,
    options: OrganizeOptions
  ): Promise<void> {
    const { sourceFile, destinationPath } = operation;

    // Create transaction
    const transactionId = await this.transactionJournal.begin({
      type: 'file_organization',
      source: sourceFile.path,
      destination: destinationPath,
    });

    try {
      // Update file state
      sourceFile.updateState('organizing');
      await this.fileRepository.update(sourceFile);

      // Perform file operation
      await this.organizationService.moveFile(
        sourceFile.path,
        destinationPath,
        {
          createDirectories: true,
          overwrite: options.overwrite || false,
        },
      );

      // Commit transaction
      await this.transactionJournal.commit(transactionId);

      // Update file state
      sourceFile.markAsOrganized();
      await this.fileRepository.update(sourceFile);
    } catch (error) {
      // Rollback transaction
      await this.transactionJournal.rollback(transactionId);

      // Update file state
      sourceFile.setError(getErrorMessage(error));
      await this.fileRepository.update(sourceFile);

      throw error;
    }
  }

  /**
   * Update file states after batch completion
   */
  private async updateFileStates(batch: OrganizationBatch): Promise<void> {
    const updates = batch.operations.map((operation: OrganizationOperation) => {
      const file = operation.sourceFile;

      if (operation.status === 'completed') {
        file.markAsOrganized();
      } else if (operation.status === 'failed') {
        file.setError(operation.error || 'Unknown error');
      }
      return this.fileRepository.update(file);
    });

    await Promise.allSettled(updates);
  }

  /**
   * Get files that need review (low confidence)
   */
  getNeedsReview(files: File[], options: { confidenceThreshold?: number } = {}): File[] {
    const { confidenceThreshold = 0.7 } = options;

    return files.filter((file: File) => {
      if (!file.isReadyForOrganization()) return false;
      return file.analysis?.needsReview(confidenceThreshold) ?? false;
    });
  }
}

export default OrganizeFilesUseCase;

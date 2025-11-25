/**
 * Organize Files Use Case
 * Business logic for organizing files into folders
 */

import { OrganizationBatch } from '../models/Organization';import { StratoSortError, ErrorCodes } from '../../shared/errors/StratoSortError';

export class OrganizeFilesUseCase {
  constructor({
    fileRepository,
    organizationService,
    smartFolderRepository,
    transactionJournal,
  }) {    this.fileRepository = fileRepository;    this.organizationService = organizationService;    this.smartFolderRepository = smartFolderRepository;    this.transactionJournal = transactionJournal;
  }

  /**
   * Execute the use case
   * @param {File[]} files - Array of File domain models
   * @param {Object} options - Organization options
   * @returns {Promise<OrganizationBatch>} - The batch operation result
   */
  async execute(files, options = {}) {
    try {
      // Validate input
      this.validateInput(files, options);

      // Filter files that can be organized
      const organizableFiles = this.filterOrganizableFiles(files, options);

      if (organizableFiles.length === 0) {
        throw new StratoSortError(
          ErrorCodes.VALIDATION_ERROR,
          'No files can be organized',
          { reason: 'All files failed validation' }
        );
      }

      // Get smart folders      const smartFolders = await this.smartFolderRepository.getAll();

      // Create organization batch
      const batch = OrganizationBatch.fromFiles(organizableFiles, {        defaultLocation: options.defaultLocation,
        smartFolderMatcher: (category) => this.matchSmartFolder(category, smartFolders),
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
        ErrorCodes.ORGANIZATION_ERROR,
        'Failed to organize files',
        { originalError: error.message }
      );
    }
  }

  /**
   * Validate input
   */
  validateInput(files, options) {
    if (!Array.isArray(files) || files.length === 0) {
      throw new StratoSortError(
        ErrorCodes.VALIDATION_ERROR,
        'Files array is required and must not be empty'
      );
    }

    if (!options.defaultLocation) {
      throw new StratoSortError(
        ErrorCodes.VALIDATION_ERROR,
        'Default location is required'
      );
    }
  }

  /**
   * Filter files that can be organized
   */
  filterOrganizableFiles(files, options) {
    const { confidenceThreshold = 0.7 } = options;

    return files.filter((file) => {
      // Check if file can be organized
      const validation = file.canBeOrganized();
      if (!validation.valid) {
        return false;
      }

      // Check confidence threshold
      if (file.analysis.confidence < confidenceThreshold) {
        return false;
      }

      return true;
    });
  }

  /**
   * Match smart folder for category
   */
  matchSmartFolder(category, smartFolders) {
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
        const normalizedKeywords = folder.keywords.map((k) =>
          k.toLowerCase().trim()
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
  async executeBatch(batch, options) {
    const results = [];

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
        operation.markAsFailed(error.message);
        results.push({ success: false, operation, error: error.message });

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
  async executeOperation(operation, options) {
    const { sourceFile, destinationPath } = operation;

    // Create transaction    const transactionId = await this.transactionJournal.begin({
      type: 'file_organization',
      source: sourceFile.path,
      destination: destinationPath,
    });

    try {
      // Update file state
      sourceFile.updateState('organizing');      await this.fileRepository.update(sourceFile);

      // Perform file operation      await this.organizationService.moveFile(
        sourceFile.path,
        destinationPath,
        {
          createDirectories: true,
          overwrite: options.overwrite || false,
        }
      );

      // Commit transaction      await this.transactionJournal.commit(transactionId);

      // Update file state
      sourceFile.markAsOrganized();      await this.fileRepository.update(sourceFile);
    } catch (error) {
      // Rollback transaction      await this.transactionJournal.rollback(transactionId);

      // Update file state
      sourceFile.setError(error.message);      await this.fileRepository.update(sourceFile);

      throw error;
    }
  }

  /**
   * Update file states after batch completion
   */
  async updateFileStates(batch) {
    const updates = batch.operations.map((operation) => {
      const file = operation.sourceFile;

      if (operation.status === 'completed') {
        file.markAsOrganized();
      } else if (operation.status === 'failed') {
        file.setError(operation.error);
      }      return this.fileRepository.update(file);
    });

    await Promise.allSettled(updates);
  }

  /**
   * Get files that need review (low confidence)
   */
  getNeedsReview(files, options = {}) {    const { confidenceThreshold = 0.7 } = options;

    return files.filter((file) => {
      if (!file.isReadyForOrganization()) return false;
      return file.analysis.needsReview(confidenceThreshold);
    });
  }
}

export default OrganizeFilesUseCase;

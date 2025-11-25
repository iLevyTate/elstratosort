/**
 * Redux File Repository
 * Concrete implementation of IFileRepository using Redux store
 */import { IFileRepository } from '../../domain/repositories/IFileRepository';import { File, FileMetadata } from '../../domain/models/File';

export class ReduxFileRepository extends IFileRepository {
  constructor(store) {
    super();    this.store = store;
  }

  /**
   * Get Redux state
   */
  getState() {    return this.store.getState().files;
  }

  /**
   * Dispatch Redux action
   */
  dispatch(action) {    return this.store.dispatch(action);
  }

  /**
   * Convert Redux file to domain File model
   */
  toDomainModel(reduxFile) {
    if (!reduxFile) return null;

    const metadata = new FileMetadata({
      path: reduxFile.path,
      name: reduxFile.name,
      extension: reduxFile.extension,
      size: reduxFile.size,
      created: reduxFile.created,
      modified: reduxFile.modified,
      mimeType: reduxFile.mimeType,
    });

    return new File({
      metadata,
      analysis: reduxFile.analysis,
      processingState: reduxFile.processingState || 'pending',
      error: reduxFile.error,
      source: reduxFile.source || 'unknown',
      addedAt: reduxFile.addedAt,
    });
  }

  /**
   * Convert domain File model to Redux format
   */
  fromDomainModel(file) {
    return {
      ...file.metadata,
      analysis: file.analysis,
      processingState: file.processingState,
      error: file.error,
      source: file.source,
      addedAt: file.addedAt,
    };
  }

  /**
   * Get file by path
   */  async getByPath(path) {
    const state = this.getState();
    const reduxFile = state.allFiles.find((f) => f.path === path);
    return this.toDomainModel(reduxFile);
  }

  /**
   * Get all files
   */
  async getAll() {
    const state = this.getState();
    return state.allFiles.map((f) => this.toDomainModel(f));
  }

  /**
   * Get files by state
   */
  async getByState(processingState) {
    const state = this.getState();
    return state.allFiles
      .filter((f) => f.processingState === processingState)
      .map((f) => this.toDomainModel(f));
  }

  /**
   * Save or update file
   */
  async save(file) {
    const { addFiles } =      require('../../renderer/store/slices/filesSlice');

    const existingFile = await this.getByPath(file.path);

    if (existingFile) {
      // Update existing file
      return this.update(file);
    } else {
      // Add new file
      const reduxFile = this.fromDomainModel(file);
      this.dispatch(addFiles([reduxFile]));
      return file;
    }
  }

  /**
   * Update file
   */
  async update(file) {
    const { updateFileAnalysis, updateFileState, updateFileError } =      require('../../renderer/store/slices/filesSlice');

    // Update analysis if present
    if (file.analysis) {
      this.dispatch(
        updateFileAnalysis({
          filePath: file.path,
          analysis: file.analysis,
        })
      );
    }

    // Update state
    this.dispatch(
      updateFileState({
        filePath: file.path,
        state: file.processingState,
        metadata: {
          error: file.error,
          source: file.source,
          addedAt: file.addedAt,
        },
      })
    );

    // Update error if present
    if (file.error) {
      this.dispatch(
        updateFileError({
          filePath: file.path,
          error: file.error,
        })
      );
    }

    return file;
  }

  /**
   * Delete file
   */  async delete(path) {    const { setSelectedFiles } = require('../../renderer/store/slices/filesSlice');

    const state = this.getState();
    const updatedFiles = state.allFiles.filter((f) => f.path !== path);

    this.dispatch(setSelectedFiles(updatedFiles));
    return true;
  }

  /**
   * Get files ready for organization
   */
  async getReadyForOrganization() {
    const allFiles = await this.getAll();
    return allFiles.filter((file) => file.isReadyForOrganization());
  }

  /**
   * Get analyzed files
   */
  async getAnalyzed() {
    const allFiles = await this.getAll();
    return allFiles.filter((file) => file.isAnalyzed());
  }

  /**
   * Clear all files
   */
  async clear() {    const { resetFiles } = require('../../renderer/store/slices/filesSlice');
    this.dispatch(resetFiles());
  }
}

export default ReduxFileRepository;

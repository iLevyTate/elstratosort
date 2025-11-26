/**
 * Redux File Repository
 * Concrete implementation of IFileRepository using Redux store
 */
import type { IFileRepository } from '../../domain/repositories/IFileRepository';
import { File, FileMetadata, ProcessingState } from '../../domain/models/File';
import type { Analysis } from '../../domain/models/Analysis';

/**
 * Redux file format (how files are stored in Redux state)
 */
interface ReduxFile {
  path: string;
  name: string;
  extension: string;
  size: number;
  created?: string;
  modified?: string;
  mimeType?: string | null;
  analysis?: Analysis | null;
  processingState?: ProcessingState;
  error?: string | null;
  source?: string;
  addedAt?: string;
}

/**
 * Redux files state shape
 */
interface FilesState {
  allFiles: ReduxFile[];
  selectedFiles: string[];
}

/**
 * Redux store interface
 */
interface ReduxStore {
  getState(): { files: FilesState };
  dispatch(action: unknown): void;
}

/**
 * Redux action type
 */
interface ReduxAction {
  type: string;
  payload?: unknown;
}

export class ReduxFileRepository implements IFileRepository {
  private store: ReduxStore;

  constructor(store: ReduxStore) {
    this.store = store;
  }

  /**
   * Get Redux state
   */
  private getState(): FilesState {
    return this.store.getState().files;
  }

  /**
   * Dispatch Redux action
   */
  private dispatch(action: ReduxAction): void {
    this.store.dispatch(action);
  }

  /**
   * Convert Redux file to domain File model
   */
  private toDomainModel(reduxFile: ReduxFile | undefined): File | null {
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
      source: (reduxFile.source as 'file_selection' | 'folder_scan' | 'drag_drop' | 'unknown') || 'unknown',
      addedAt: reduxFile.addedAt,
    });
  }

  /**
   * Convert domain File model to Redux format
   */
  private fromDomainModel(file: File): ReduxFile {
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
   */
  async getByPath(path: string): Promise<File | null> {
    const state = this.getState();
    const reduxFile = state.allFiles.find((f: ReduxFile) => f.path === path);
    return this.toDomainModel(reduxFile);
  }

  /**
   * Get all files
   */
  async getAll(): Promise<File[]> {
    const state = this.getState();
    return state.allFiles
      .map((f: ReduxFile) => this.toDomainModel(f))
      .filter((f): f is File => f !== null);
  }

  /**
   * Get files by state
   */
  async getByState(processingState: ProcessingState): Promise<File[]> {
    const state = this.getState();
    return state.allFiles
      .filter((f: ReduxFile) => f.processingState === processingState)
      .map((f: ReduxFile) => this.toDomainModel(f))
      .filter((f): f is File => f !== null);
  }

  /**
   * Save or update file
   */
  async save(file: File): Promise<File> {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { addFiles } = require('../../renderer/store/slices/filesSlice');

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
  async update(file: File): Promise<File> {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { updateFileAnalysis, updateFileState, updateFileError } =
      require('../../renderer/store/slices/filesSlice');

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
   */
  async delete(path: string): Promise<boolean> {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { setSelectedFiles } = require('../../renderer/store/slices/filesSlice');

    const state = this.getState();
    const updatedFiles = state.allFiles.filter((f: ReduxFile) => f.path !== path);

    this.dispatch(setSelectedFiles(updatedFiles));
    return true;
  }

  /**
   * Get files ready for organization
   */
  async getReadyForOrganization(): Promise<File[]> {
    const allFiles = await this.getAll();
    return allFiles.filter((file: File) => file.isReadyForOrganization());
  }

  /**
   * Get analyzed files
   */
  async getAnalyzed(): Promise<File[]> {
    const allFiles = await this.getAll();
    return allFiles.filter((file: File) => file.isAnalyzed());
  }

  /**
   * Clear all files
   */
  async clear(): Promise<void> {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { resetFiles } = require('../../renderer/store/slices/filesSlice');
    this.dispatch(resetFiles());
  }
}

export default ReduxFileRepository;

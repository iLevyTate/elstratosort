/**
 * File Repository Interface
 * Defines the contract for file persistence operations
 */

import type { File, ProcessingState } from '../models/File';

/**
 * File repository interface for file persistence operations
 */
export interface IFileRepository {
  /**
   * Get file by path
   * @param path - File path
   * @returns Promise resolving to File or null if not found
   */
  getByPath(path: string): Promise<File | null>;

  /**
   * Get all files
   * @returns Promise resolving to array of Files
   */
  getAll(): Promise<File[]>;

  /**
   * Get files by processing state
   * @param state - Processing state to filter by
   * @returns Promise resolving to array of Files with matching state
   */
  getByState(state: ProcessingState): Promise<File[]>;

  /**
   * Save or update file
   * @param file - File domain model to save
   * @returns Promise resolving to saved File
   */
  save(file: File): Promise<File>;

  /**
   * Update existing file
   * @param file - File domain model to update
   * @returns Promise resolving to updated File
   */
  update(file: File): Promise<File>;

  /**
   * Delete file by path
   * @param path - Path of file to delete
   * @returns Promise resolving to true if deleted, false otherwise
   */
  delete(path: string): Promise<boolean>;

  /**
   * Get files ready for organization
   * @returns Promise resolving to array of Files ready to organize
   */
  getReadyForOrganization(): Promise<File[]>;

  /**
   * Get analyzed files
   * @returns Promise resolving to array of analyzed Files
   */
  getAnalyzed(): Promise<File[]>;

  /**
   * Clear all files
   * @returns Promise resolving when all files are cleared
   */
  clear(): Promise<void>;
}

export default IFileRepository;

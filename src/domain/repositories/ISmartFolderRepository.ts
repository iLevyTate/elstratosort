/**
 * Smart Folder Repository Interface
 * Defines the contract for smart folder persistence operations
 */

import type { SmartFolder } from '../../shared/types/smartFolder';

/**
 * Smart folder repository interface for folder persistence operations
 */
export interface ISmartFolderRepository {
  /**
   * Get all smart folders
   * @returns Promise resolving to array of SmartFolders
   */
  getAll(): Promise<SmartFolder[]>;

  /**
   * Get smart folder by ID
   * @param id - Folder ID
   * @returns Promise resolving to SmartFolder or null if not found
   */
  getById(id: string): Promise<SmartFolder | null>;

  /**
   * Save smart folder
   * @param folder - Smart folder object to save
   * @returns Promise resolving to saved SmartFolder
   */
  save(folder: SmartFolder): Promise<SmartFolder>;

  /**
   * Update smart folder
   * @param id - Folder ID to update
   * @param updates - Partial updates to apply
   * @returns Promise resolving to updated SmartFolder
   */
  update(id: string, updates: Partial<SmartFolder>): Promise<SmartFolder>;

  /**
   * Delete smart folder
   * @param id - Folder ID to delete
   * @returns Promise resolving to true if deleted, false otherwise
   */
  delete(id: string): Promise<boolean>;

  /**
   * Find folders matching category
   * @param category - Category to match
   * @returns Promise resolving to array of matching SmartFolders
   */
  findByCategory(category: string): Promise<SmartFolder[]>;
}

export default ISmartFolderRepository;

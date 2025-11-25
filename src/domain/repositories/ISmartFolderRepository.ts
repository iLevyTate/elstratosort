/**
 * Smart Folder Repository Interface
 * Defines the contract for smart folder persistence operations
 */

/* eslint-disable no-unused-vars */
export class ISmartFolderRepository {
  /**
   * Get all smart folders
   * @returns {Promise<Array>}
   */
  async getAll() {
    throw new Error('Method not implemented');
  }

  /**
   * Get smart folder by ID
   * @param {string} _id - Folder ID
   * @returns {Promise<Object|null>}
   */
  async getById(_id) {
    throw new Error('Method not implemented');
  }

  /**
   * Save smart folder
   * @param {Object} _folder - Smart folder object
   * @returns {Promise<Object>}
   */
  async save(_folder) {
    throw new Error('Method not implemented');
  }

  /**
   * Update smart folder
   * @param {string} _id - Folder ID
   * @param {Object} _updates - Updates to apply
   * @returns {Promise<Object>}
   */
  async update(_id, _updates) {
    throw new Error('Method not implemented');
  }

  /**
   * Delete smart folder
   * @param {string} _id - Folder ID
   * @returns {Promise<boolean>}
   */
  async delete(_id) {
    throw new Error('Method not implemented');
  }

  /**
   * Find folders matching category
   * @param {string} _category - Category to match
   * @returns {Promise<Array>}
   */
  async findByCategory(_category) {
    throw new Error('Method not implemented');
  }
}

export default ISmartFolderRepository;

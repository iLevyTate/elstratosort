/**
 * File Repository Interface
 * Defines the contract for file persistence operations
 */

/* eslint-disable no-unused-vars */
export class IFileRepository {
  /**
   * Get file by path
   * @param {string} _path - File path
   * @returns {Promise<File|null>}
   */
  async getByPath(_path) {
    throw new Error('Method not implemented');
  }

  /**
   * Get all files
   * @returns {Promise<File[]>}
   */
  async getAll() {
    throw new Error('Method not implemented');
  }

  /**
   * Get files by state
   * @param {string} _state - Processing state
   * @returns {Promise<File[]>}
   */
  async getByState(_state) {
    throw new Error('Method not implemented');
  }

  /**
   * Save or update file
   * @param {File} _file - File domain model
   * @returns {Promise<File>}
   */
  async save(_file) {
    throw new Error('Method not implemented');
  }

  /**
   * Update file
   * @param {File} _file - File domain model
   * @returns {Promise<File>}
   */
  async update(_file) {
    throw new Error('Method not implemented');
  }

  /**
   * Delete file
   * @param {string} _path - File path
   * @returns {Promise<boolean>}
   */
  async delete(_path) {
    throw new Error('Method not implemented');
  }

  /**
   * Get files ready for organization
   * @returns {Promise<File[]>}
   */
  async getReadyForOrganization() {
    throw new Error('Method not implemented');
  }

  /**
   * Get analyzed files
   * @returns {Promise<File[]>}
   */
  async getAnalyzed() {
    throw new Error('Method not implemented');
  }

  /**
   * Clear all files
   * @returns {Promise<void>}
   */
  async clear() {
    throw new Error('Method not implemented');
  }
}

export default IFileRepository;

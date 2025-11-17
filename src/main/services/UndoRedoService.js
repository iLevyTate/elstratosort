const fs = require('fs').promises;
const path = require('path');
const { app } = require('electron');

class UndoRedoService {
  constructor(options = {}) {
    this.userDataPath = app.getPath('userData');
    this.actionsPath = path.join(this.userDataPath, 'undo-actions.json');

    // Fixed: Configurable limits to prevent unbounded growth
    this.maxActions = options.maxActions || 50; // Reduced from 100 to 50
    this.maxMemoryMB = options.maxMemoryMB || 10; // 10MB max memory for undo history
    this.maxBatchSize = options.maxBatchSize || 1000; // Limit individual batch operation size

    this.actions = [];
    this.currentIndex = -1; // Points to the last executed action
    this.initialized = false;
    this.currentMemoryEstimate = 0; // Track estimated memory usage
  }

  async ensureParentDirectory(filePath) {
    const parentDirectory = path.dirname(filePath);
    await fs.mkdir(parentDirectory, { recursive: true });
  }

  async safeMove(sourcePath, destinationPath) {
    await this.ensureParentDirectory(destinationPath);
    try {
      // Use copy + unlink instead of rename for more robustness, especially with memfs
      await fs.copyFile(sourcePath, destinationPath);
      await fs.unlink(sourcePath);
      return;
    } catch (error) {
      if (error && error.code === 'EXDEV') {
        // Cross-device move: copy then verify then remove
        await fs.copyFile(sourcePath, destinationPath);
        const [sourceStats, destStats] = await Promise.all([
          fs.stat(sourcePath),
          fs.stat(destinationPath),
        ]);
        if (sourceStats.size !== destStats.size) {
          throw new Error('File copy verification failed - size mismatch');
        }
        await fs.unlink(sourcePath);
        return;
      }
      throw error;
    }
  }

  async initialize() {
    if (this.initialized) return;

    try {
      await this.loadActions();
      this.initialized = true;
      console.log('UndoRedoService initialized successfully');
    } catch (error) {
      console.error('Failed to initialize UndoRedoService:', error);
      this.actions = [];
      this.currentIndex = -1;
      this.initialized = true;
    }
  }

  async loadActions() {
    try {
      const actionsData = await fs.readFile(this.actionsPath, 'utf8');
      const data = JSON.parse(actionsData);
      this.actions = Array.isArray(data.actions) ? data.actions : [];
      this.currentIndex = data.currentIndex ?? -1;

      // Fixed: Recalculate memory estimate after loading
      this._recalculateMemoryEstimate();
    } catch (error) {
      // File doesn't exist or is corrupted, start fresh
      this.actions = [];
      this.currentIndex = -1;
      this.currentMemoryEstimate = 0;
      await this.saveActions();
    }
  }

  /**
   * Estimate memory usage of an action in bytes
   * @private
   */
  _estimateActionSize(action) {
    // Rough estimate: JSON.stringify length * 2 (for UTF-16 encoding)
    return JSON.stringify(action).length * 2;
  }

  /**
   * Recalculate total memory estimate for all actions
   * @private
   */
  _recalculateMemoryEstimate() {
    this.currentMemoryEstimate = this.actions.reduce((total, action) => {
      return total + this._estimateActionSize(action);
    }, 0);
  }

  async saveActions() {
    const data = {
      actions: this.actions,
      currentIndex: this.currentIndex,
      lastSaved: new Date().toISOString(),
    };
    await this.ensureParentDirectory(this.actionsPath);
    await fs.writeFile(this.actionsPath, JSON.stringify(data, null, 2));
  }

  async recordAction(actionType, actionData) {
    await this.initialize();

    // Fixed: Limit batch operation sizes to prevent memory issues
    if (
      (actionType === 'BATCH_ORGANIZE' || actionType === 'BATCH_OPERATION') &&
      actionData.operations &&
      actionData.operations.length > this.maxBatchSize
    ) {
      console.warn(
        `[UNDO] Batch operation has ${actionData.operations.length} items, limiting to ${this.maxBatchSize}`,
      );
      actionData.operations = actionData.operations.slice(0, this.maxBatchSize);
    }

    const action = {
      id: this.generateId(),
      type: actionType,
      timestamp: new Date().toISOString(),
      data: actionData,
      description: this.getActionDescription(actionType, actionData),
    };

    const actionSize = this._estimateActionSize(action);

    // Remove any actions after the current index (if we're not at the end)
    if (this.currentIndex < this.actions.length - 1) {
      const removedActions = this.actions.slice(this.currentIndex + 1);
      this.actions = this.actions.slice(0, this.currentIndex + 1);

      // Update memory estimate for removed actions
      removedActions.forEach((a) => {
        this.currentMemoryEstimate -= this._estimateActionSize(a);
      });
    }

    // Add the new action
    this.actions.push(action);
    this.currentIndex = this.actions.length - 1;
    this.currentMemoryEstimate += actionSize;

    // Fixed: Trim actions if we exceed count OR memory limits
    const maxMemoryBytes = this.maxMemoryMB * 1024 * 1024;
    while (
      this.actions.length > 1 && // Must have more than 1 to remove
      (this.actions.length > this.maxActions ||
        this.currentMemoryEstimate > maxMemoryBytes)
    ) {
      const removedAction = this.actions.shift();
      this.currentIndex--;
      this.currentMemoryEstimate -= this._estimateActionSize(removedAction);
    }

    // Fixed: If still over memory limit with only 1 action, truncate that action
    if (
      this.currentMemoryEstimate > maxMemoryBytes &&
      this.actions.length === 1
    ) {
      console.warn(
        `[UNDO] Single action exceeds memory limit (${(this.currentMemoryEstimate / 1024 / 1024).toFixed(2)}MB > ${this.maxMemoryMB}MB), truncating data`,
      );

      // Truncate the action's data to prevent unbounded memory growth
      const largeAction = this.actions[0];
      const operationCount = largeAction.data?.operations?.length || 0;

      largeAction.data = {
        truncated: true,
        originalType: largeAction.type,
        originalOperationCount: operationCount,
        message: `Action data truncated due to size (${(this.currentMemoryEstimate / 1024 / 1024).toFixed(2)}MB)`,
        timestamp: largeAction.timestamp,
      };

      // Recalculate memory estimate
      this._recalculateMemoryEstimate();
    }

    await this.saveActions();
    return action.id;
  }

  async undo() {
    await this.initialize();

    if (!this.canUndo()) {
      throw new Error('No actions to undo');
    }

    const action = this.actions[this.currentIndex];

    try {
      await this.executeReverseAction(action);
      this.currentIndex--;
      await this.saveActions();
      return {
        success: true,
        action: action,
        message: `Undid: ${action.description}`,
      };
    } catch (error) {
      console.error('Failed to undo action:', error);
      throw new Error(`Failed to undo action: ${error.message}`);
    }
  }

  async redo() {
    await this.initialize();

    if (!this.canRedo()) {
      throw new Error('No actions to redo');
    }

    const action = this.actions[this.currentIndex + 1];

    try {
      await this.executeForwardAction(action);
      this.currentIndex++;
      await this.saveActions();
      return {
        success: true,
        action: action,
        message: `Redid: ${action.description}`,
      };
    } catch (error) {
      console.error('Failed to redo action:', error);
      throw new Error(`Failed to redo action: ${error.message}`);
    }
  }

  canUndo() {
    return this.currentIndex >= 0;
  }

  canRedo() {
    return this.currentIndex < this.actions.length - 1;
  }

  async executeReverseAction(action) {
    switch (action.type) {
      case 'FILE_MOVE':
        // Move file back to original location
        await this.safeMove(action.data.newPath, action.data.originalPath);
        break;

      case 'FILE_RENAME':
        // Rename file back to original name
        await this.safeMove(action.data.newPath, action.data.originalPath);
        break;

      case 'FILE_DELETE':
        // Restore file from backup (if we have one)
        if (
          action.data.backupPath &&
          (await this.fileExists(action.data.backupPath))
        ) {
          await this.safeMove(action.data.backupPath, action.data.originalPath);
        } else {
          throw new Error('Cannot restore deleted file - backup not found');
        }
        break;

      case 'FOLDER_CREATE':
        // Remove the created folder (if empty)
        try {
          await fs.rmdir(action.data.folderPath);
        } catch (error) {
          // Folder might not be empty, try to restore to original state
          console.warn(
            'Could not remove folder, might contain files:',
            error.message,
          );
        }
        break;

      case 'BATCH_ORGANIZE':
      case 'BATCH_OPERATION': // Backwards/forwards compatibility with shared ACTION_TYPES
        // Reverse each file operation in the batch
        for (const operation of [...action.data.operations].reverse()) {
          await this.reverseFileOperation(operation);
        }
        break;

      default:
        throw new Error(`Unknown action type: ${action.type}`);
    }
  }

  async executeForwardAction(action) {
    switch (action.type) {
      case 'FILE_MOVE':
        // Move file to new location
        await this.safeMove(action.data.originalPath, action.data.newPath);
        break;

      case 'FILE_RENAME':
        // Rename file to new name
        await this.safeMove(action.data.originalPath, action.data.newPath);
        break;

      case 'FILE_DELETE':
        // Delete file again (move to backup if configured)
        if (action.data.createBackup) {
          await this.safeMove(action.data.originalPath, action.data.backupPath);
        } else {
          await fs.unlink(action.data.originalPath);
        }
        break;

      case 'FOLDER_CREATE':
        // Create the folder again
        await fs.mkdir(action.data.folderPath, { recursive: true });
        break;

      case 'BATCH_ORGANIZE':
      case 'BATCH_OPERATION': // Backwards/forwards compatibility with shared ACTION_TYPES
        // Re-execute each file operation in the batch
        for (const operation of action.data.operations) {
          await this.executeFileOperation(operation);
        }
        break;

      default:
        throw new Error(`Unknown action type: ${action.type}`);
    }
  }

  async reverseFileOperation(operation) {
    switch (operation.type) {
      case 'move':
        await this.safeMove(operation.newPath, operation.originalPath);
        break;
      case 'rename':
        await this.safeMove(operation.newPath, operation.originalPath);
        break;
      case 'delete':
        if (
          operation.backupPath &&
          (await this.fileExists(operation.backupPath))
        ) {
          await this.safeMove(operation.backupPath, operation.originalPath);
        }
        break;
    }
  }

  async executeFileOperation(operation) {
    switch (operation.type) {
      case 'move':
        await this.safeMove(operation.originalPath, operation.newPath);
        break;
      case 'rename':
        await this.safeMove(operation.originalPath, operation.newPath);
        break;
      case 'delete':
        if (operation.createBackup) {
          await this.safeMove(operation.originalPath, operation.backupPath);
        } else {
          await fs.unlink(operation.originalPath);
        }
        break;
    }
  }

  async fileExists(filePath) {
    try {
      await fs.access(filePath);
      return true;
    } catch {
      return false;
    }
  }

  getActionDescription(actionType, actionData) {
    switch (actionType) {
      case 'FILE_MOVE':
        return `Move ${path.basename(actionData.originalPath)} to ${path.dirname(actionData.newPath)}`;
      case 'FILE_RENAME':
        return `Rename ${path.basename(actionData.originalPath)} to ${path.basename(actionData.newPath)}`;
      case 'FILE_DELETE':
        return `Delete ${path.basename(actionData.originalPath)}`;
      case 'FOLDER_CREATE':
        return `Create folder ${path.basename(actionData.folderPath)}`;
      case 'BATCH_ORGANIZE':
      case 'BATCH_OPERATION':
        return `Organize ${actionData.operations.length} files`;
      default:
        return `Unknown action: ${actionType}`;
    }
  }

  generateId() {
    return Date.now().toString(36) + Math.random().toString(36).substr(2);
  }

  getActionHistory(limit = 10) {
    const history = this.actions.slice(
      Math.max(0, this.currentIndex - limit + 1),
      this.currentIndex + 1,
    );
    return history.map((action) => ({
      id: action.id,
      description: action.description,
      timestamp: action.timestamp,
      type: action.type,
    }));
  }

  getRedoHistory(limit = 10) {
    const history = this.actions.slice(
      this.currentIndex + 1,
      this.currentIndex + 1 + limit,
    );
    return history.map((action) => ({
      id: action.id,
      description: action.description,
      timestamp: action.timestamp,
      type: action.type,
    }));
  }

  async clearHistory() {
    this.actions = [];
    this.currentIndex = -1;
    this.currentMemoryEstimate = 0; // Fixed: Reset memory estimate
    await this.saveActions();
  }

  /**
   * Get memory and usage statistics
   * @returns {Object} Statistics about undo/redo usage
   */
  getStats() {
    return {
      totalActions: this.actions.length,
      currentIndex: this.currentIndex,
      canUndo: this.canUndo(),
      canRedo: this.canRedo(),
      memoryUsageMB: (this.currentMemoryEstimate / (1024 * 1024)).toFixed(2),
      memoryLimitMB: this.maxMemoryMB,
      actionLimit: this.maxActions,
      batchSizeLimit: this.maxBatchSize,
    };
  }
}

module.exports = UndoRedoService;

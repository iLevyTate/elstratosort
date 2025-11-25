/**
 * Organization Domain Model Tests
 */

const { OrganizationOperation, OrganizationBatch } = require('../../../src/domain/models/Organization');
const { File, FileMetadata } = require('../../../src/domain/models/File');

describe('OrganizationOperation', () => {
  let sampleFile;

  beforeEach(() => {
    const metadata = new FileMetadata({
      path: '/source/document.pdf',
      name: 'document.pdf',
      extension: '.pdf',
      size: 1024,
    });

    sampleFile = new File({
      metadata,
      analysis: {
        category: 'Reports',
        suggestedName: 'Q1_Report.pdf',
        confidence: 0.85,
      },
      processingState: 'ready',
    });
  });

  describe('Constructor', () => {
    test('should create operation with required fields', () => {
      const operation = new OrganizationOperation({
        sourceFile: sampleFile,
        destinationPath: '/dest/Q1_Report.pdf',
        category: 'Reports',
        confidence: 0.85,
      });

      expect(operation.sourceFile).toBe(sampleFile);
      expect(operation.destinationPath).toBe('/dest/Q1_Report.pdf');
      expect(operation.category).toBe('Reports');
      expect(operation.confidence).toBe(0.85);
      expect(operation.status).toBe('pending');
      expect(operation.undoable).toBe(true);
    });

    test('should generate unique ID', () => {
      const op1 = new OrganizationOperation({
        sourceFile: sampleFile,
        destinationPath: '/dest/file1.pdf',
        category: 'Reports',
        confidence: 0.8,
      });

      const op2 = new OrganizationOperation({
        sourceFile: sampleFile,
        destinationPath: '/dest/file2.pdf',
        category: 'Reports',
        confidence: 0.8,
      });

      expect(op1.id).not.toBe(op2.id);
      expect(op1.id).toMatch(/^org_/);
    });
  });

  describe('canExecute', () => {
    test('should return valid for pending operation', () => {
      const operation = new OrganizationOperation({
        sourceFile: sampleFile,
        destinationPath: '/dest/Q1_Report.pdf',
        category: 'Reports',
        confidence: 0.85,
      });

      const result = operation.canExecute();
      expect(result.valid).toBe(true);
    });

    test('should return invalid for non-pending operation', () => {
      const operation = new OrganizationOperation({
        sourceFile: sampleFile,
        destinationPath: '/dest/Q1_Report.pdf',
        category: 'Reports',
        confidence: 0.85,
        status: 'completed',
      });

      const result = operation.canExecute();
      expect(result.valid).toBe(false);
      expect(result.reason).toContain('not in pending state');
    });

    test('should return invalid when missing source file', () => {
      const operation = new OrganizationOperation({
        sourceFile: null,
        destinationPath: '/dest/Q1_Report.pdf',
        category: 'Reports',
        confidence: 0.85,
      });

      const result = operation.canExecute();
      expect(result.valid).toBe(false);
      expect(result.reason).toContain('Source file is missing');
    });

    test('should return invalid when missing destination', () => {
      const operation = new OrganizationOperation({
        sourceFile: sampleFile,
        destinationPath: null,
        category: 'Reports',
        confidence: 0.85,
      });

      const result = operation.canExecute();
      expect(result.valid).toBe(false);
      expect(result.reason).toContain('Destination path is missing');
    });
  });

  describe('canUndo', () => {
    test('should return valid for completed undoable operation', () => {
      const operation = new OrganizationOperation({
        sourceFile: sampleFile,
        destinationPath: '/dest/Q1_Report.pdf',
        category: 'Reports',
        confidence: 0.85,
        status: 'completed',
        undoable: true,
      });

      const result = operation.canUndo();
      expect(result.valid).toBe(true);
    });

    test('should return invalid for non-undoable operation', () => {
      const operation = new OrganizationOperation({
        sourceFile: sampleFile,
        destinationPath: '/dest/Q1_Report.pdf',
        category: 'Reports',
        confidence: 0.85,
        status: 'completed',
        undoable: false,
      });

      const result = operation.canUndo();
      expect(result.valid).toBe(false);
      expect(result.reason).toContain('not undoable');
    });

    test('should return invalid for non-completed operation', () => {
      const operation = new OrganizationOperation({
        sourceFile: sampleFile,
        destinationPath: '/dest/Q1_Report.pdf',
        category: 'Reports',
        confidence: 0.85,
        status: 'pending',
      });

      const result = operation.canUndo();
      expect(result.valid).toBe(false);
      expect(result.reason).toContain('not in completed state');
    });
  });

  describe('State Transitions', () => {
    let operation;

    beforeEach(() => {
      operation = new OrganizationOperation({
        sourceFile: sampleFile,
        destinationPath: '/dest/Q1_Report.pdf',
        category: 'Reports',
        confidence: 0.85,
      });
    });

    test('markAsExecuting should update status', () => {
      operation.markAsExecuting();
      expect(operation.status).toBe('executing');
    });

    test('markAsCompleted should update status and timestamp', () => {
      operation.markAsCompleted();
      expect(operation.status).toBe('completed');
      expect(operation.executedAt).toBeTruthy();
    });

    test('markAsFailed should update status, error, and timestamp', () => {
      operation.markAsFailed('File not found');
      expect(operation.status).toBe('failed');
      expect(operation.error).toBe('File not found');
      expect(operation.executedAt).toBeTruthy();
    });

    test('markAsUndone should update status', () => {
      operation.markAsUndone();
      expect(operation.status).toBe('undone');
    });
  });

  describe('toFileOperation', () => {
    test('should convert to file operation format', () => {
      const operation = new OrganizationOperation({
        sourceFile: sampleFile,
        destinationPath: '/dest/Q1_Report.pdf',
        category: 'Reports',
        confidence: 0.85,
      });

      const fileOp = operation.toFileOperation();

      expect(fileOp.type).toBe('move');
      expect(fileOp.source).toBe('/source/document.pdf');
      expect(fileOp.destination).toBe('/dest/Q1_Report.pdf');
    });
  });
});

describe('OrganizationBatch', () => {
  let sampleOperations;

  beforeEach(() => {
    const createOperation = (index) => {
      const metadata = new FileMetadata({
        path: `/source/file${index}.pdf`,
        name: `file${index}.pdf`,
        extension: '.pdf',
        size: 1024,
      });

      const file = new File({
        metadata,
        analysis: {
          category: 'Reports',
          suggestedName: `Report_${index}.pdf`,
          confidence: 0.85,
        },
        processingState: 'ready',
      });

      return new OrganizationOperation({
        sourceFile: file,
        destinationPath: `/dest/Report_${index}.pdf`,
        category: 'Reports',
        confidence: 0.85,
      });
    };

    sampleOperations = [createOperation(1), createOperation(2), createOperation(3)];
  });

  describe('Constructor', () => {
    test('should create batch with operations', () => {
      const batch = new OrganizationBatch({
        operations: sampleOperations,
      });

      expect(batch.operations.length).toBe(3);
      expect(batch.status).toBe('pending');
      expect(batch.progress.total).toBe(0);
    });

    test('should generate unique ID', () => {
      const batch1 = new OrganizationBatch({});
      const batch2 = new OrganizationBatch({});

      expect(batch1.id).not.toBe(batch2.id);
      expect(batch1.id).toMatch(/^batch_/);
    });
  });

  describe('addOperation', () => {
    test('should add operation and update total', () => {
      const batch = new OrganizationBatch({});
      const operation = sampleOperations[0];

      batch.addOperation(operation);

      expect(batch.operations.length).toBe(1);
      expect(batch.progress.total).toBe(1);
    });
  });

  describe('Filtering Methods', () => {
    let batch;

    beforeEach(() => {
      batch = new OrganizationBatch({
        operations: sampleOperations,
      });

      // Set different statuses
      batch.operations[0].markAsCompleted();
      batch.operations[1].markAsFailed('Error');
      // operations[2] stays pending
    });

    test('getSuccessful should return completed operations', () => {
      const successful = batch.getSuccessful();
      expect(successful.length).toBe(1);
      expect(successful[0].status).toBe('completed');
    });

    test('getFailed should return failed operations', () => {
      const failed = batch.getFailed();
      expect(failed.length).toBe(1);
      expect(failed[0].status).toBe('failed');
    });

    test('getPending should return pending operations', () => {
      const pending = batch.getPending();
      expect(pending.length).toBe(1);
      expect(pending[0].status).toBe('pending');
    });
  });

  describe('Progress Tracking', () => {
    test('updateProgress should update current progress', () => {
      const batch = new OrganizationBatch({
        operations: sampleOperations,
      });

      batch.updateProgress(2);
      expect(batch.progress.current).toBe(2);
    });
  });

  describe('Batch Lifecycle', () => {
    let batch;

    beforeEach(() => {
      batch = new OrganizationBatch({
        operations: sampleOperations,
      });
    });

    test('markAsStarted should update status and timestamp', () => {
      batch.markAsStarted();

      expect(batch.status).toBe('executing');
      expect(batch.startedAt).toBeTruthy();
    });

    test('markAsCompleted should set status to completed when all succeed', () => {
      batch.operations.forEach((op) => op.markAsCompleted());
      batch.markAsCompleted();

      expect(batch.status).toBe('completed');
      expect(batch.completedAt).toBeTruthy();
      expect(batch.summary).toBeTruthy();
    });

    test('markAsCompleted should set status to partial when some fail', () => {
      batch.operations[0].markAsCompleted();
      batch.operations[1].markAsFailed('Error');
      batch.operations[2].markAsCompleted();
      batch.markAsCompleted();

      expect(batch.status).toBe('partial');
    });

    test('markAsCompleted should set status to failed when all fail', () => {
      batch.operations.forEach((op) => op.markAsFailed('Error'));
      batch.markAsCompleted();

      expect(batch.status).toBe('failed');
    });
  });

  describe('generateSummary', () => {
    test('should generate correct summary', () => {
      const batch = new OrganizationBatch({
        operations: sampleOperations,
      });

      batch.operations[0].markAsCompleted();
      batch.operations[1].markAsCompleted();
      batch.operations[2].markAsFailed('Error');

      const summary = batch.generateSummary();

      expect(summary.total).toBe(3);
      expect(summary.successful).toBe(2);
      expect(summary.failed).toBe(1);
      expect(summary.successRate).toBeCloseTo(66.67, 1);
    });
  });

  describe('canUndo', () => {
    test('should return true when all completed operations are undoable', () => {
      const batch = new OrganizationBatch({
        operations: sampleOperations,
      });

      batch.operations.forEach((op) => op.markAsCompleted());

      expect(batch.canUndo()).toBe(true);
    });

    test('should return false when no operations completed', () => {
      const batch = new OrganizationBatch({
        operations: sampleOperations,
      });

      expect(batch.canUndo()).toBe(false);
    });

    test('should return false when some operations not undoable', () => {
      const batch = new OrganizationBatch({
        operations: sampleOperations,
      });

      batch.operations[0].markAsCompleted();
      batch.operations[0].undoable = false;

      expect(batch.canUndo()).toBe(false);
    });
  });
});

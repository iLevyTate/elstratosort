/**
 * IPC Validation System Tests
 * Tests the new Zod-based IPC validation infrastructure
 */

const { validateIpc, withRequestId, withErrorHandling, compose, generateRequestId } = require('../src/main/ipc/validation');
const { SingleFileAnalysisSchema, AnalysisRequestSchema, FileOpenSchema } = require('../src/main/ipc/schemas');
const { ValidationError } = require('../src/shared/errors');

describe('IPC Validation System', () => {
  describe('generateRequestId', () => {
    it('should generate unique request IDs', () => {
      const id1 = generateRequestId();
      const id2 = generateRequestId();

      expect(id1).toMatch(/^req_\d+_[a-z0-9]+$/);
      expect(id2).toMatch(/^req_\d+_[a-z0-9]+$/);
      expect(id1).not.toBe(id2);
    });
  });

  describe('SingleFileAnalysisSchema', () => {
    it('should validate correct file analysis data', () => {
      const validData = {
        filePath: '/path/to/file.txt',
        options: {
          extractText: true,
          analyzeContent: true,
        },
      };

      const result = SingleFileAnalysisSchema.parse(validData);
      expect(result.filePath).toBe('/path/to/file.txt');
      expect(result.options.extractText).toBe(true);
    });

    it('should reject missing filePath', () => {
      const invalidData = {
        options: {
          extractText: true,
        },
      };

      expect(() => SingleFileAnalysisSchema.parse(invalidData)).toThrow();
    });

    it('should reject empty filePath', () => {
      const invalidData = {
        filePath: '',
      };

      expect(() => SingleFileAnalysisSchema.parse(invalidData)).toThrow();
    });
  });

  describe('AnalysisRequestSchema', () => {
    it('should validate correct batch analysis data', () => {
      const validData = {
        files: ['/path/to/file1.txt', '/path/to/file2.txt'],
        options: {
          force: true,
        },
      };

      const result = AnalysisRequestSchema.parse(validData);
      expect(result.files).toHaveLength(2);
      expect(result.options.force).toBe(true);
    });

    it('should reject empty files array', () => {
      const invalidData = {
        files: [],
      };

      expect(() => AnalysisRequestSchema.parse(invalidData)).toThrow();
    });

    it('should reject files array over 100 items', () => {
      const invalidData = {
        files: Array(101).fill('/path/to/file.txt'),
      };

      expect(() => AnalysisRequestSchema.parse(invalidData)).toThrow();
    });

    it('should reject files array with empty strings', () => {
      const invalidData = {
        files: ['/path/to/file1.txt', ''],
      };

      expect(() => AnalysisRequestSchema.parse(invalidData)).toThrow();
    });
  });

  describe('FileOpenSchema', () => {
    it('should validate correct file path', () => {
      const validData = {
        path: '/path/to/file.txt',
      };

      const result = FileOpenSchema.parse(validData);
      expect(result.path).toBe('/path/to/file.txt');
    });

    it('should reject missing path', () => {
      const invalidData = {};

      expect(() => FileOpenSchema.parse(invalidData)).toThrow();
    });

    it('should reject empty path', () => {
      const invalidData = {
        path: '',
      };

      expect(() => FileOpenSchema.parse(invalidData)).toThrow();
    });
  });

  describe('validateIpc middleware', () => {
    it('should pass validated data to handler', async () => {
      const mockHandler = jest.fn(async (event, data) => {
        return { success: true, data };
      });

      const validatedHandler = validateIpc(SingleFileAnalysisSchema)(mockHandler);
      const mockEvent = {};
      const inputData = { filePath: '/path/to/file.txt' };

      const result = await validatedHandler(mockEvent, inputData);

      expect(mockHandler).toHaveBeenCalledWith(mockEvent, inputData);
      expect(result.success).toBe(true);
      expect(result.data.filePath).toBe('/path/to/file.txt');
    });

    it('should throw ValidationError for invalid data', async () => {
      const mockHandler = jest.fn();

      const validatedHandler = validateIpc(SingleFileAnalysisSchema)(mockHandler);
      const mockEvent = {};
      const invalidData = { filePath: '' };

      await expect(validatedHandler(mockEvent, invalidData)).rejects.toThrow(ValidationError);
      expect(mockHandler).not.toHaveBeenCalled();
    });
  });

  describe('withErrorHandling middleware', () => {
    it('should return structured error response for errors', async () => {
      const mockHandler = jest.fn(async () => {
        throw new Error('Test error');
      });

      const errorHandler = withErrorHandling(mockHandler);
      const mockEvent = {};

      const result = await errorHandler(mockEvent);

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
      expect(result.error.code).toBe('OPERATION_FAILED');
    });

    it('should return data for successful operations', async () => {
      const mockHandler = jest.fn(async () => {
        return { success: true, message: 'OK' };
      });

      const errorHandler = withErrorHandling(mockHandler);
      const mockEvent = {};

      const result = await errorHandler(mockEvent);

      // Handler returns already-standardized format, so it passes through
      expect(result.success).toBe(true);
      // The data field contains the original response since it was already in standard format
      expect(result.data || result.message).toBeTruthy();
    });
  });

  describe('compose middleware', () => {
    it('should apply middleware in correct order', async () => {
      const executionOrder = [];

      const middleware1 = (handler) => async (...args) => {
        executionOrder.push('middleware1-before');
        const result = await handler(...args);
        executionOrder.push('middleware1-after');
        return result;
      };

      const middleware2 = (handler) => async (...args) => {
        executionOrder.push('middleware2-before');
        const result = await handler(...args);
        executionOrder.push('middleware2-after');
        return result;
      };

      const mockHandler = jest.fn(async () => {
        executionOrder.push('handler');
        return { success: true };
      });

      const composedHandler = compose(middleware1, middleware2)(mockHandler);

      await composedHandler();

      expect(executionOrder).toEqual([
        'middleware1-before',
        'middleware2-before',
        'handler',
        'middleware2-after',
        'middleware1-after',
      ]);
    });
  });

  describe('Full validation stack', () => {
    it('should validate and handle requests with full stack', async () => {
      const mockHandler = jest.fn(async (event, data) => {
        return { analyzed: true, file: data.filePath };
      });

      const fullStackHandler = compose(
        withErrorHandling,
        withRequestId,
        validateIpc(SingleFileAnalysisSchema)
      )(mockHandler);

      const mockEvent = {};
      const validData = { filePath: '/path/to/file.txt' };

      const result = await fullStackHandler(mockEvent, validData);

      expect(mockHandler).toHaveBeenCalled();
      // Results are now wrapped in standard envelope: { success: true, data: { ... } }
      expect(result.success).toBe(true);
      expect(result.data.analyzed).toBe(true);
      expect(result.data.file).toBe('/path/to/file.txt');
    });

    it('should handle validation errors with full stack', async () => {
      const mockHandler = jest.fn();

      const fullStackHandler = compose(
        withErrorHandling,
        withRequestId,
        validateIpc(SingleFileAnalysisSchema)
      )(mockHandler);

      const mockEvent = {};
      const invalidData = { filePath: '' };

      const result = await fullStackHandler(mockEvent, invalidData);

      expect(mockHandler).not.toHaveBeenCalled();
      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
      expect(result.error.code).toBe('VALIDATION_FAILED');
    });
  });
});

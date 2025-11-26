/**
 * IPC Response Helpers Integration Tests
 *
 * Tests that response helpers create properly formatted
 * response envelopes for IPC communication.
 */

import {
  createSuccess,
  createError,
  createErrorFromException,
  isStandardResponse,
  ensureStandardResponse,
  ERROR_CODES,
} from '../../src/main/ipc/responseHelpers';

describe('IPC Response Helpers', () => {
  describe('createSuccess', () => {
    it('should create a success response with data', () => {
      const data = { files: ['file1.txt', 'file2.txt'] };
      const response = createSuccess(data);

      expect(response.success).toBe(true);
      expect(response.data).toEqual(data);
      expect(response.timestamp).toBeDefined();
      expect(typeof response.timestamp).toBe('string');
    });

    it('should include requestId when provided', () => {
      const data = { result: 'ok' };
      const response = createSuccess(data, 'req-123');

      expect(response.success).toBe(true);
      expect(response.requestId).toBe('req-123');
    });

    it('should not include requestId when null', () => {
      const response = createSuccess({ data: 'test' });
      expect(response.requestId).toBeUndefined();
    });

    it('should handle null data', () => {
      const response = createSuccess(null);
      expect(response.success).toBe(true);
      expect(response.data).toBeNull();
    });

    it('should handle undefined data', () => {
      const response = createSuccess(undefined);
      expect(response.success).toBe(true);
      expect(response.data).toBeUndefined();
    });

    it('should generate valid ISO timestamp', () => {
      const response = createSuccess({});
      const timestamp = new Date(response.timestamp);
      expect(timestamp.getTime()).not.toBeNaN();
    });
  });

  describe('createError', () => {
    it('should create an error response with code and message', () => {
      const response = createError(
        ERROR_CODES.FILE_NOT_FOUND,
        'The requested file does not exist',
      );

      expect(response.success).toBe(false);
      expect(response.error.code).toBe(ERROR_CODES.FILE_NOT_FOUND);
      expect(response.error.message).toBe('The requested file does not exist');
      expect(response.timestamp).toBeDefined();
    });

    it('should include details when provided', () => {
      const details = { path: '/missing/file.txt', attempted: true };
      const response = createError(
        ERROR_CODES.FILE_NOT_FOUND,
        'File not found',
        details,
      );

      expect(response.error.details).toEqual(details);
    });

    it('should not include details when null', () => {
      const response = createError(
        ERROR_CODES.VALIDATION_ERROR,
        'Invalid input',
      );
      expect(response.error.details).toBeUndefined();
    });

    it('should include requestId when provided', () => {
      const response = createError(
        ERROR_CODES.OPERATION_FAILED,
        'Operation failed',
        null,
        'req-456',
      );

      expect(response.requestId).toBe('req-456');
    });

    it('should use UNKNOWN_ERROR when code is empty', () => {
      const response = createError('', 'Something went wrong');
      expect(response.error.code).toBe(ERROR_CODES.UNKNOWN_ERROR);
    });

    it('should use default message when message is empty', () => {
      const response = createError(ERROR_CODES.OPERATION_FAILED, '');
      expect(response.error.message).toBe('An unknown error occurred');
    });
  });

  describe('createErrorFromException', () => {
    it('should create error response from Error object', () => {
      const error = new Error('Something went wrong');
      const response = createErrorFromException(error);

      expect(response.success).toBe(false);
      expect(response.error.message).toBe('Something went wrong');
      expect(response.error.code).toBe(ERROR_CODES.OPERATION_FAILED);
    });

    it('should extract code from custom error', () => {
      const customError = Object.assign(new Error('Custom error'), {
        code: 'CUSTOM_ERROR_CODE',
      });
      const response = createErrorFromException(customError);

      expect(response.error.code).toBe('CUSTOM_ERROR_CODE');
    });

    it('should extract details from custom error', () => {
      const customError = Object.assign(new Error('Error with details'), {
        details: { field: 'username', reason: 'too short' },
      });
      const response = createErrorFromException(customError);

      expect(response.error.details).toEqual({
        field: 'username',
        reason: 'too short',
      });
    });

    it('should include requestId when provided', () => {
      const error = new Error('Test error');
      const response = createErrorFromException(error, 'req-789');

      expect(response.requestId).toBe('req-789');
    });
  });

  describe('isStandardResponse', () => {
    it('should return true for success responses', () => {
      const successResponse = createSuccess({ data: 'test' });
      expect(isStandardResponse(successResponse)).toBe(true);
    });

    it('should return true for error responses', () => {
      const errorResponse = createError(
        ERROR_CODES.VALIDATION_ERROR,
        'Invalid',
      );
      expect(isStandardResponse(errorResponse)).toBe(true);
    });

    it('should return true for legacy format with success property', () => {
      const legacyResponse = { success: true, files: [], count: 0 };
      expect(isStandardResponse(legacyResponse)).toBe(true);
    });

    it('should return false for null', () => {
      expect(isStandardResponse(null)).toBe(false);
    });

    it('should return false for undefined', () => {
      expect(isStandardResponse(undefined)).toBe(false);
    });

    it('should return false for primitives', () => {
      expect(isStandardResponse('string')).toBe(false);
      expect(isStandardResponse(123)).toBe(false);
      expect(isStandardResponse(true)).toBe(false);
    });

    it('should return false for objects without success property', () => {
      expect(isStandardResponse({ data: 'test' })).toBe(false);
      expect(isStandardResponse({ files: [] })).toBe(false);
    });

    it('should return false for objects with non-boolean success', () => {
      expect(isStandardResponse({ success: 'yes' })).toBe(false);
      expect(isStandardResponse({ success: 1 })).toBe(false);
    });
  });

  describe('ensureStandardResponse', () => {
    it('should wrap raw data in success response', () => {
      const rawData = { files: ['file1.txt', 'file2.txt'] };
      const response = ensureStandardResponse(rawData);

      expect(response.success).toBe(true);
      if (response.success) {
        expect(response.data).toEqual(rawData);
      }
    });

    it('should pass through existing success responses', () => {
      const existingResponse = createSuccess({ result: 'ok' });
      const response = ensureStandardResponse(existingResponse);

      expect(response).toEqual(existingResponse);
    });

    it('should pass through existing error responses', () => {
      const existingError = createError(
        ERROR_CODES.VALIDATION_ERROR,
        'Invalid',
      );
      const response = ensureStandardResponse(existingError);

      expect(response).toEqual(existingError);
    });

    it('should add requestId to wrapped response', () => {
      const rawData = { count: 5 };
      const response = ensureStandardResponse(rawData, 'req-abc');

      expect(response.requestId).toBe('req-abc');
    });

    it('should add requestId to existing response without one', () => {
      const existingResponse = { success: true, data: {} };
      const response = ensureStandardResponse(existingResponse, 'req-def');

      expect(response.requestId).toBe('req-def');
    });

    it('should not override existing requestId', () => {
      const existingResponse = createSuccess({}, 'original-id');
      const response = ensureStandardResponse(existingResponse, 'new-id');

      expect(response.requestId).toBe('original-id');
    });

    it('should handle arrays as raw data', () => {
      const rawArray = ['item1', 'item2'];
      const response = ensureStandardResponse(rawArray);

      expect(response.success).toBe(true);
      if (response.success) {
        expect(response.data).toEqual(rawArray);
      }
    });

    it('should handle primitive values as raw data', () => {
      const stringResponse = ensureStandardResponse('test string');
      expect(stringResponse.success).toBe(true);
      if (stringResponse.success) {
        expect(stringResponse.data).toBe('test string');
      }

      const numberResponse = ensureStandardResponse(42);
      expect(numberResponse.success).toBe(true);
      if (numberResponse.success) {
        expect(numberResponse.data).toBe(42);
      }
    });
  });

  describe('ERROR_CODES', () => {
    it('should have all expected validation error codes', () => {
      expect(ERROR_CODES.VALIDATION_ERROR).toBe('VALIDATION_ERROR');
      expect(ERROR_CODES.INVALID_PATH).toBe('INVALID_PATH');
      expect(ERROR_CODES.INVALID_INPUT).toBe('INVALID_INPUT');
    });

    it('should have all expected file operation error codes', () => {
      expect(ERROR_CODES.FILE_NOT_FOUND).toBe('FILE_NOT_FOUND');
      expect(ERROR_CODES.FILE_EXISTS).toBe('FILE_EXISTS');
      expect(ERROR_CODES.PERMISSION_DENIED).toBe('PERMISSION_DENIED');
      expect(ERROR_CODES.FILE_TOO_LARGE).toBe('FILE_TOO_LARGE');
    });

    it('should have all expected service error codes', () => {
      expect(ERROR_CODES.SERVICE_UNAVAILABLE).toBe('SERVICE_UNAVAILABLE');
      expect(ERROR_CODES.SERVICE_NOT_INITIALIZED).toBe(
        'SERVICE_NOT_INITIALIZED',
      );
    });

    it('should have all expected operation error codes', () => {
      expect(ERROR_CODES.OPERATION_FAILED).toBe('OPERATION_FAILED');
      expect(ERROR_CODES.OPERATION_CANCELLED).toBe('OPERATION_CANCELLED');
      expect(ERROR_CODES.TIMEOUT).toBe('TIMEOUT');
    });

    it('should have all expected batch error codes', () => {
      expect(ERROR_CODES.BATCH_TOO_LARGE).toBe('BATCH_TOO_LARGE');
      expect(ERROR_CODES.EMPTY_BATCH).toBe('EMPTY_BATCH');
      expect(ERROR_CODES.PARTIAL_FAILURE).toBe('PARTIAL_FAILURE');
    });

    it('should have all expected AI error codes', () => {
      expect(ERROR_CODES.AI_UNAVAILABLE).toBe('AI_UNAVAILABLE');
      expect(ERROR_CODES.MODEL_NOT_FOUND).toBe('MODEL_NOT_FOUND');
      expect(ERROR_CODES.ANALYSIS_FAILED).toBe('ANALYSIS_FAILED');
    });

    it('should have unknown error code', () => {
      expect(ERROR_CODES.UNKNOWN_ERROR).toBe('UNKNOWN_ERROR');
    });
  });
});

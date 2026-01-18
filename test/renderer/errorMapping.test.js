const { mapErrorToNotification } = require('../../src/renderer/utils/errorMapping');

describe('errorMapping', () => {
  test('maps known error types to friendly messages', () => {
    const result = mapErrorToNotification({
      error: 'Timeout occurred',
      errorType: 'TIMEOUT',
      operationType: 'Search'
    });
    expect(result.severity).toBe('warning');
    expect(result.message).toContain('Search failed');
  });

  test('falls back to raw error message when type is unknown', () => {
    const result = mapErrorToNotification({
      error: 'Something broke',
      errorType: 'UNKNOWN_ERROR',
      operationType: 'Analyze'
    });
    expect(result.message).toContain('Analyze failed');
    expect(result.message).toContain('Something broke');
  });

  test('uses generic message when no error string provided', () => {
    const result = mapErrorToNotification({});
    expect(result.message).toContain('Operation failed');
  });
});

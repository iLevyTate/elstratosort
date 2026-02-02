/**
 * Tests for createStableSelector
 * Tests the WeakMap-based caching to prevent race conditions
 */

import {
  selectReadyFiles,
  selectFileStats,
  LARGE_ARRAY_THRESHOLD
} from '../src/renderer/store/selectors';

describe('createStableSelector', () => {
  describe('Reference Stability', () => {
    test('returns same reference when array contents are unchanged', () => {
      const state = {
        files: {
          selectedFiles: [
            { path: '/file1.pdf', name: 'file1.pdf' },
            { path: '/file2.pdf', name: 'file2.pdf' }
          ],
          fileStates: {}
        },
        analysis: {
          results: [
            { path: '/file1.pdf', analysis: { category: 'docs' } },
            { path: '/file2.pdf', analysis: { category: 'images' } }
          ]
        }
      };

      const result1 = selectReadyFiles(state);
      const result2 = selectReadyFiles(state);

      // Same input should return same reference
      expect(result1).toBe(result2);
    });

    test('returns new reference when array contents change', () => {
      const state1 = {
        files: {
          selectedFiles: [{ path: '/file1.pdf', name: 'file1.pdf' }],
          fileStates: {}
        },
        analysis: {
          results: [{ path: '/file1.pdf', analysis: { category: 'docs' } }]
        }
      };

      const state2 = {
        files: {
          selectedFiles: [
            { path: '/file1.pdf', name: 'file1.pdf' },
            { path: '/file2.pdf', name: 'file2.pdf' }
          ],
          fileStates: {}
        },
        analysis: {
          results: [
            { path: '/file1.pdf', analysis: { category: 'docs' } },
            { path: '/file2.pdf', analysis: { category: 'images' } }
          ]
        }
      };

      const result1 = selectReadyFiles(state1);
      const result2 = selectReadyFiles(state2);

      // Different input should return different reference
      expect(result1).not.toBe(result2);
    });

    test('returns same object reference when object properties unchanged', () => {
      const state = {
        files: {
          selectedFiles: [{ path: '/file1.pdf' }],
          fileStates: {}
        },
        analysis: {
          results: [{ path: '/file1.pdf', analysis: { category: 'docs' } }]
        }
      };

      const result1 = selectFileStats(state);
      const result2 = selectFileStats(state);

      // Same input should return same reference for object results
      expect(result1).toBe(result2);
    });
  });

  describe('WeakMap Cache Isolation', () => {
    test('different state objects get independent caches', () => {
      // State A with 1 ready file
      const stateA = {
        files: {
          selectedFiles: [{ path: '/a.pdf' }],
          fileStates: {}
        },
        analysis: {
          results: [{ path: '/a.pdf', analysis: { category: 'docs' } }]
        }
      };

      // State B with 2 ready files
      const stateB = {
        files: {
          selectedFiles: [{ path: '/b1.pdf' }, { path: '/b2.pdf' }],
          fileStates: {}
        },
        analysis: {
          results: [
            { path: '/b1.pdf', analysis: { category: 'docs' } },
            { path: '/b2.pdf', analysis: { category: 'images' } }
          ]
        }
      };

      // Call selector with both states
      const resultA1 = selectReadyFiles(stateA);
      const resultB1 = selectReadyFiles(stateB);
      const resultA2 = selectReadyFiles(stateA);
      const resultB2 = selectReadyFiles(stateB);

      // Each state should get its own cached result
      expect(resultA1.length).toBe(1);
      expect(resultB1.length).toBe(2);
      expect(resultA1).toBe(resultA2);
      expect(resultB1).toBe(resultB2);
    });

    test('concurrent calls with same state return same reference', async () => {
      const state = {
        files: {
          selectedFiles: [{ path: '/file.pdf' }],
          fileStates: {}
        },
        analysis: {
          results: [{ path: '/file.pdf', analysis: { category: 'docs' } }]
        }
      };

      // Simulate concurrent calls
      const results = await Promise.all([
        Promise.resolve(selectReadyFiles(state)),
        Promise.resolve(selectReadyFiles(state)),
        Promise.resolve(selectReadyFiles(state))
      ]);

      // All should return the same reference
      expect(results[0]).toBe(results[1]);
      expect(results[1]).toBe(results[2]);
    });
  });

  describe('Shallow Comparison', () => {
    test('array with same items returns cached reference', () => {
      const file1 = { path: '/file1.pdf', analysis: { category: 'a' } };
      const file2 = { path: '/file2.pdf', analysis: { category: 'b' } };

      const state = {
        files: {
          selectedFiles: [file1, file2],
          fileStates: {}
        },
        analysis: {
          results: [
            { path: '/file1.pdf', analysis: { category: 'a' } },
            { path: '/file2.pdf', analysis: { category: 'b' } }
          ]
        }
      };

      const result1 = selectReadyFiles(state);
      const result2 = selectReadyFiles(state);

      expect(result1).toBe(result2);
    });

    test('object with same values returns cached reference', () => {
      const state = {
        files: {
          selectedFiles: [{ path: '/file.pdf' }],
          fileStates: {}
        },
        analysis: {
          results: [{ path: '/file.pdf', analysis: { category: 'docs' } }]
        }
      };

      const stats1 = selectFileStats(state);
      const stats2 = selectFileStats(state);

      expect(stats1).toBe(stats2);
      expect(stats1.total).toBe(1);
      expect(stats1.ready).toBe(1);
    });
  });

  describe('Edge Cases', () => {
    test('handles empty arrays', () => {
      const state = {
        files: {
          selectedFiles: [],
          fileStates: {}
        },
        analysis: { results: [] }
      };

      const result1 = selectReadyFiles(state);
      const result2 = selectReadyFiles(state);

      expect(result1).toEqual([]);
      expect(result1).toBe(result2);
    });

    test('handles null/undefined gracefully', () => {
      const state = {
        files: {
          selectedFiles: null,
          fileStates: {}
        },
        analysis: { results: null }
      };

      // Should not throw
      expect(() => selectReadyFiles(state)).not.toThrow();
    });

    test('handles rapid state changes', () => {
      const states = Array.from({ length: 10 }, (_, i) => ({
        files: {
          selectedFiles: [{ path: `/file${i}.pdf` }],
          fileStates: {}
        },
        analysis: {
          results: [{ path: `/file${i}.pdf`, analysis: { category: `cat${i}` } }]
        }
      }));

      // Rapidly switch between states
      const results = states.map((s) => selectReadyFiles(s));

      // Each state should get correct result
      results.forEach((result, i) => {
        expect(result.length).toBe(1);
        expect(result[0].path).toBe(`/file${i}.pdf`);
      });
    });
  });

  describe('Large Array Memory Protection (C12)', () => {
    test('LARGE_ARRAY_THRESHOLD is exported and equals 1000', () => {
      expect(LARGE_ARRAY_THRESHOLD).toBe(1000);
    });

    test('does not cache arrays exceeding LARGE_ARRAY_THRESHOLD', () => {
      // Build a state with more than LARGE_ARRAY_THRESHOLD ready files.
      // We need two different state object references that produce equivalent
      // large output arrays -- this simulates Redux creating new state on dispatch
      // while the underlying data stays the same.
      const count = LARGE_ARRAY_THRESHOLD + 1;
      const makeState = () => {
        const selectedFiles = Array.from({ length: count }, (_, i) => ({
          path: `/file${i}.pdf`,
          name: `file${i}.pdf`
        }));
        const results = selectedFiles.map((f) => ({
          path: f.path,
          analysis: { category: 'docs' }
        }));
        return {
          files: { selectedFiles, fileStates: {} },
          analysis: { results }
        };
      };

      const state1 = makeState();
      const state2 = makeState();

      const result1 = selectReadyFiles(state1);
      const result2 = selectReadyFiles(state2);

      // Both calls should return correct data
      expect(result1.length).toBe(count);
      expect(result2.length).toBe(count);

      // They should NOT be the same reference (cache was skipped)
      // because the array exceeds the threshold and should not be pinned
      expect(result1).not.toBe(result2);
    });

    test('still caches arrays at or below LARGE_ARRAY_THRESHOLD', () => {
      const count = LARGE_ARRAY_THRESHOLD;
      const selectedFiles = Array.from({ length: count }, (_, i) => ({
        path: `/cached${i}.pdf`,
        name: `cached${i}.pdf`
      }));
      const results = selectedFiles.map((f) => ({
        path: f.path,
        analysis: { category: 'docs' }
      }));

      const state = {
        files: { selectedFiles, fileStates: {} },
        analysis: { results }
      };

      const result1 = selectReadyFiles(state);
      const result2 = selectReadyFiles(state);

      // At the threshold boundary, caching should still work
      expect(result1.length).toBe(count);
      expect(result1).toBe(result2);
    });

    test('clears lastResult when large array is encountered', () => {
      // First, call with a small array to populate lastResult
      const smallState = {
        files: {
          selectedFiles: [{ path: '/small.pdf', name: 'small.pdf' }],
          fileStates: {}
        },
        analysis: {
          results: [{ path: '/small.pdf', analysis: { category: 'docs' } }]
        }
      };

      const smallResult = selectReadyFiles(smallState);
      expect(smallResult.length).toBe(1);

      // Now call with a large array -- this should clear the cache
      const count = LARGE_ARRAY_THRESHOLD + 5;
      const selectedFiles = Array.from({ length: count }, (_, i) => ({
        path: `/large${i}.pdf`,
        name: `large${i}.pdf`
      }));
      const results = selectedFiles.map((f) => ({
        path: f.path,
        analysis: { category: 'docs' }
      }));

      const largeState = {
        files: { selectedFiles, fileStates: {} },
        analysis: { results }
      };

      const largeResult = selectReadyFiles(largeState);
      expect(largeResult.length).toBe(count);

      // Go back to small state -- should still work correctly
      const smallResult2 = selectReadyFiles(smallState);
      expect(smallResult2.length).toBe(1);
    });
  });
});

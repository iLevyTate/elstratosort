/**
 * Test for file extension bug fix
 *
 * This test verifies that the collision handling logic
 * correctly preserves file extensions when generating unique filenames.
 */
const path = require('path');

describe('File Extension Preservation', () => {
  test('should preserve file extension using path.basename', () => {
    const testCases = [
      {
        input: 'C:\\Documents\\document.pdf',
        expectedExt: '.pdf',
        expectedName: 'document',
      },
      {
        input: 'C:\\Documents\\document',
        expectedExt: '',
        expectedName: 'document',
      },
      {
        input: 'C:\\Documents\\file.with.dots.txt',
        expectedExt: '.txt',
        expectedName: 'file.with.dots',
      },
      {
        input: '/home/user/photo.jpg',
        expectedExt: '.jpg',
        expectedName: 'photo',
      },
    ];

    testCases.forEach(({ input, expectedExt, expectedName }) => {
      const ext = path.extname(input);
      const baseName = path.join(
        path.dirname(input),
        path.basename(input, ext)
      );
      const nameOnly = path.basename(baseName);

      expect(ext).toBe(expectedExt);
      expect(nameOnly).toBe(expectedName);

      // Test the unique filename generation pattern
      const counter = 1;
      const uniqueDestination = path.join(
        path.dirname(input),
        `${nameOnly}_${counter}${ext}`
      );

      // Verify the result has the right structure
      expect(uniqueDestination).toContain(`${expectedName}_${counter}`);
      // Always check extension matches expected (empty string if no extension)
      expect(path.extname(uniqueDestination)).toBe(expectedExt || '');
    });
  });

  test('should handle edge case with empty extension correctly', () => {
    const destination = 'C:\\Documents\\noextension';
    const ext = path.extname(destination); // Returns ''

    // Old buggy approach (would fail)
    // const baseName = destination.slice(0, -ext.length); // slice(0, -0) returns ''

    // New correct approach
    const baseName = path.join(
      path.dirname(destination),
      path.basename(destination, ext)
    );
    const nameOnly = path.basename(baseName);

    expect(nameOnly).toBe('noextension');
    expect(ext).toBe('');

    // Generate unique filename
    const uniqueDestination = path.join(
      path.dirname(destination),
      `${nameOnly}_1${ext}`
    );

    expect(uniqueDestination).toBe('C:\\Documents\\noextension_1');
  });

  test('should demonstrate the bug with slice approach', () => {
    const destination = 'C:\\Documents\\test.pdf';
    const ext = path.extname(destination); // '.pdf'

    // Old buggy approach with file having no extension
    const destNoExt = 'C:\\Documents\\noext';
    const extNoExt = path.extname(destNoExt); // ''
    const buggyBaseName = destNoExt.slice(0, -extNoExt.length); // slice(0, -0) = slice(0, 0) = ''

    // This would be empty string, causing the bug!
    expect(buggyBaseName).toBe('');

    // With files that have extensions, the old approach worked
    const baseNameWithExt = destination.slice(0, -ext.length);
    expect(baseNameWithExt).toBe('C:\\Documents\\test');
  });

  test('should use correct approach for all cases', () => {
    const testPaths = [
      'C:\\Documents\\file.pdf',
      'C:\\Documents\\noext',
      '/home/user/archive.tar.gz',
      '/home/user/script',
    ];

    testPaths.forEach((testPath) => {
      const ext = path.extname(testPath);
      const baseName = path.join(
        path.dirname(testPath),
        path.basename(testPath, ext)
      );
      const nameOnly = path.basename(baseName);

      // Should never be empty
      expect(nameOnly).not.toBe('');
      expect(nameOnly.length).toBeGreaterThan(0);

      // Generate a numbered version
      const numberedPath = path.join(
        path.dirname(testPath),
        `${nameOnly}_1${ext}`
      );

      // Should contain the original filename
      expect(numberedPath).toContain(nameOnly);
    });
  });
});

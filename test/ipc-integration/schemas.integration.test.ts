/**
 * IPC Schema Integration Tests
 *
 * Tests that Zod schemas correctly validate inputs and provide
 * meaningful error messages for invalid data.
 */

import {
  FileSchema,
  NamingConventionSchema,
  SmartFolderSchema,
  AnalysisRequestSchema,
  SingleFileAnalysisSchema,
  FileOpenSchema,
  FileDeleteSchema,
  FileMoveSchema,
  SmartFolderAddSchema,
  SmartFolderEditSchema,
  SmartFolderDeleteSchema,
  AutoOrganizeSchema,
  OllamaModelCheckSchema,
  OllamaModelPullSchema,
  FindSimilarSchema,
} from '../../src/main/ipc/schemas';

describe('IPC Schema Validation', () => {
  describe('FileSchema', () => {
    it('should accept valid file objects', () => {
      const validFile = {
        path: '/path/to/file.txt',
        name: 'file.txt',
        size: 1024,
        type: 'text/plain',
        extension: '.txt',
      };

      const result = FileSchema.safeParse(validFile);
      expect(result.success).toBe(true);
    });

    it('should reject files with empty path', () => {
      const invalidFile = {
        path: '',
        name: 'file.txt',
      };

      const result = FileSchema.safeParse(invalidFile);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0].message).toContain(
          'File path is required',
        );
      }
    });

    it('should reject files with empty name', () => {
      const invalidFile = {
        path: '/path/to/file.txt',
        name: '',
      };

      const result = FileSchema.safeParse(invalidFile);
      expect(result.success).toBe(false);
    });

    it('should accept files with optional fields omitted', () => {
      const minimalFile = {
        path: '/path/to/file.txt',
        name: 'file.txt',
      };

      const result = FileSchema.safeParse(minimalFile);
      expect(result.success).toBe(true);
    });
  });

  describe('NamingConventionSchema', () => {
    it('should accept valid naming conventions', () => {
      const validConvention = {
        convention: 'subject-date',
        dateFormat: 'YYYY-MM-DD',
        caseConvention: 'kebab-case',
        separator: '-',
      };

      const result = NamingConventionSchema.safeParse(validConvention);
      expect(result.success).toBe(true);
    });

    it('should reject invalid convention type', () => {
      const invalidConvention = {
        convention: 'invalid-convention',
      };

      const result = NamingConventionSchema.safeParse(invalidConvention);
      expect(result.success).toBe(false);
    });

    it('should accept all valid case conventions', () => {
      const caseConventions = [
        'kebab-case',
        'snake_case',
        'camelCase',
        'PascalCase',
        'lowercase',
        'UPPERCASE',
      ];

      for (const caseConv of caseConventions) {
        const result = NamingConventionSchema.safeParse({
          convention: 'custom',
          caseConvention: caseConv,
        });
        expect(result.success).toBe(true);
      }
    });
  });

  describe('SmartFolderSchema', () => {
    it('should accept valid smart folders', () => {
      const validFolder = {
        id: 'folder-123',
        name: 'Documents',
        path: '/home/user/Documents',
        description: 'Personal documents',
        isDefault: true,
        tags: ['personal', 'documents'],
      };

      const result = SmartFolderSchema.safeParse(validFolder);
      expect(result.success).toBe(true);
    });

    it('should reject smart folders with empty name', () => {
      const invalidFolder = {
        name: '',
        path: '/home/user/Documents',
      };

      const result = SmartFolderSchema.safeParse(invalidFolder);
      expect(result.success).toBe(false);
    });

    it('should reject smart folders with empty path', () => {
      const invalidFolder = {
        name: 'Documents',
        path: '',
      };

      const result = SmartFolderSchema.safeParse(invalidFolder);
      expect(result.success).toBe(false);
    });
  });

  describe('AnalysisRequestSchema', () => {
    it('should accept valid analysis requests', () => {
      const validRequest = {
        files: ['/path/to/file1.txt', '/path/to/file2.txt'],
        options: {
          force: true,
        },
      };

      const result = AnalysisRequestSchema.safeParse(validRequest);
      expect(result.success).toBe(true);
    });

    it('should reject empty file arrays', () => {
      const invalidRequest = {
        files: [],
      };

      const result = AnalysisRequestSchema.safeParse(invalidRequest);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0].message).toContain(
          'At least one file path is required',
        );
      }
    });

    it('should reject requests with more than 100 files', () => {
      const tooManyFiles = Array(101).fill('/path/to/file.txt');
      const invalidRequest = {
        files: tooManyFiles,
      };

      const result = AnalysisRequestSchema.safeParse(invalidRequest);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0].message).toContain('Maximum 100 files');
      }
    });
  });

  describe('SingleFileAnalysisSchema', () => {
    it('should accept valid single file analysis requests', () => {
      const validRequest = {
        filePath: '/path/to/file.txt',
        options: {
          extractText: true,
          analyzeContent: true,
        },
      };

      const result = SingleFileAnalysisSchema.safeParse(validRequest);
      expect(result.success).toBe(true);
    });

    it('should reject requests with empty file path', () => {
      const invalidRequest = {
        filePath: '',
      };

      const result = SingleFileAnalysisSchema.safeParse(invalidRequest);
      expect(result.success).toBe(false);
    });
  });

  describe('File Operation Schemas', () => {
    describe('FileOpenSchema', () => {
      it('should accept valid file open requests', () => {
        const result = FileOpenSchema.safeParse({ path: '/path/to/file.txt' });
        expect(result.success).toBe(true);
      });

      it('should reject empty paths', () => {
        const result = FileOpenSchema.safeParse({ path: '' });
        expect(result.success).toBe(false);
      });
    });

    describe('FileDeleteSchema', () => {
      it('should accept valid delete requests', () => {
        const result = FileDeleteSchema.safeParse({
          path: '/path/to/file.txt',
          permanent: true,
        });
        expect(result.success).toBe(true);
      });
    });

    describe('FileMoveSchema', () => {
      it('should accept valid move requests', () => {
        const result = FileMoveSchema.safeParse({
          source: '/source/file.txt',
          destination: '/dest/file.txt',
          overwrite: false,
        });
        expect(result.success).toBe(true);
      });

      it('should reject missing source', () => {
        const result = FileMoveSchema.safeParse({
          destination: '/dest/file.txt',
        });
        expect(result.success).toBe(false);
      });

      it('should reject missing destination', () => {
        const result = FileMoveSchema.safeParse({
          source: '/source/file.txt',
        });
        expect(result.success).toBe(false);
      });
    });
  });

  describe('Smart Folder Operation Schemas', () => {
    describe('SmartFolderAddSchema', () => {
      it('should accept valid add requests', () => {
        const result = SmartFolderAddSchema.safeParse({
          name: 'New Folder',
          path: '/path/to/folder',
          description: 'A new smart folder',
        });
        expect(result.success).toBe(true);
      });

      it('should reject names longer than 100 characters', () => {
        const longName = 'a'.repeat(101);
        const result = SmartFolderAddSchema.safeParse({
          name: longName,
          path: '/path/to/folder',
        });
        expect(result.success).toBe(false);
      });

      it('should reject descriptions longer than 500 characters', () => {
        const longDescription = 'a'.repeat(501);
        const result = SmartFolderAddSchema.safeParse({
          name: 'Folder',
          path: '/path',
          description: longDescription,
        });
        expect(result.success).toBe(false);
      });
    });

    describe('SmartFolderEditSchema', () => {
      it('should accept valid edit requests', () => {
        const result = SmartFolderEditSchema.safeParse({
          id: 'folder-123',
          updates: {
            name: 'Updated Name',
          },
        });
        expect(result.success).toBe(true);
      });

      it('should require folder ID', () => {
        const result = SmartFolderEditSchema.safeParse({
          updates: { name: 'Updated' },
        });
        expect(result.success).toBe(false);
      });
    });

    describe('SmartFolderDeleteSchema', () => {
      it('should accept valid delete requests', () => {
        const result = SmartFolderDeleteSchema.safeParse({
          id: 'folder-123',
        });
        expect(result.success).toBe(true);
      });

      it('should reject empty IDs', () => {
        const result = SmartFolderDeleteSchema.safeParse({
          id: '',
        });
        expect(result.success).toBe(false);
      });
    });
  });

  describe('AutoOrganizeSchema', () => {
    it('should accept valid auto-organize requests', () => {
      const validRequest = {
        files: [{ path: '/path/file.txt', name: 'file.txt' }],
        smartFolders: [{ name: 'Documents', path: '/docs' }],
        options: {
          confidenceThreshold: 0.8,
          preserveNames: true,
        },
      };

      const result = AutoOrganizeSchema.safeParse(validRequest);
      expect(result.success).toBe(true);
    });

    it('should reject empty file arrays', () => {
      const result = AutoOrganizeSchema.safeParse({
        files: [],
        smartFolders: [],
      });
      expect(result.success).toBe(false);
    });

    it('should validate confidence threshold range', () => {
      const invalidThreshold = {
        files: [{ path: '/path', name: 'file.txt' }],
        smartFolders: [],
        options: { confidenceThreshold: 1.5 }, // Invalid: > 1
      };

      const result = AutoOrganizeSchema.safeParse(invalidThreshold);
      expect(result.success).toBe(false);
    });
  });

  describe('Ollama Schemas', () => {
    describe('OllamaModelCheckSchema', () => {
      it('should accept valid model check requests', () => {
        const result = OllamaModelCheckSchema.safeParse({
          modelName: 'llama3.2:latest',
        });
        expect(result.success).toBe(true);
      });

      it('should reject empty model names', () => {
        const result = OllamaModelCheckSchema.safeParse({
          modelName: '',
        });
        expect(result.success).toBe(false);
      });
    });

    describe('OllamaModelPullSchema', () => {
      it('should accept valid model pull requests', () => {
        const result = OllamaModelPullSchema.safeParse({
          modelName: 'llama3.2:latest',
          insecure: false,
        });
        expect(result.success).toBe(true);
      });
    });
  });

  describe('FindSimilarSchema', () => {
    it('should accept valid find similar requests', () => {
      const result = FindSimilarSchema.safeParse({
        fileId: 'file-123',
        topK: 10,
      });
      expect(result.success).toBe(true);
    });

    it('should use default topK when not provided', () => {
      const result = FindSimilarSchema.safeParse({
        fileId: 'file-123',
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.topK).toBe(10);
      }
    });

    it('should reject topK values outside range', () => {
      const tooSmall = FindSimilarSchema.safeParse({
        fileId: 'file-123',
        topK: 0,
      });
      expect(tooSmall.success).toBe(false);

      const tooLarge = FindSimilarSchema.safeParse({
        fileId: 'file-123',
        topK: 101,
      });
      expect(tooLarge.success).toBe(false);
    });
  });
});

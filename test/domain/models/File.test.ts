/**
 * File Domain Model Tests
 */
const { File, FileMetadata } = require('../../../src/domain/models/File');

describe('FileMetadata', () => {
  describe('Constructor', () => {
    test('should create FileMetadata with valid data', () => {
      const metadata = new FileMetadata({
        path: '/test/document.pdf',
        name: 'document.pdf',
        extension: '.pdf',
        size: 1024,
        created: new Date('2024-01-01'),
        modified: new Date('2024-01-02'),
        mimeType: 'application/pdf',
      });

      expect(metadata.path).toBe('/test/document.pdf');
      expect(metadata.name).toBe('document.pdf');
      expect(metadata.extension).toBe('.pdf');
      expect(metadata.size).toBe(1024);
      expect(metadata.mimeType).toBe('application/pdf');
    });
  });

  describe('File Type Detection', () => {
    test('should identify image files', () => {
      const imageMetadata = new FileMetadata({
        path: '/test/photo.jpg',
        name: 'photo.jpg',
        extension: '.jpg',
        size: 2048,
      });

      expect(imageMetadata.isImage()).toBe(true);
      expect(imageMetadata.isDocument()).toBe(false);
      expect(imageMetadata.isSpreadsheet()).toBe(false);
    });

    test('should identify document files', () => {
      const docMetadata = new FileMetadata({
        path: '/test/report.pdf',
        name: 'report.pdf',
        extension: '.pdf',
        size: 3072,
      });

      expect(docMetadata.isDocument()).toBe(true);
      expect(docMetadata.isImage()).toBe(false);
      expect(docMetadata.isSpreadsheet()).toBe(false);
    });

    test('should identify spreadsheet files', () => {
      const xlsMetadata = new FileMetadata({
        path: '/test/data.xlsx',
        name: 'data.xlsx',
        extension: '.xlsx',
        size: 4096,
      });

      expect(xlsMetadata.isSpreadsheet()).toBe(true);
      expect(xlsMetadata.isImage()).toBe(false);
      expect(xlsMetadata.isDocument()).toBe(false);
    });

    test('should handle case-insensitive extensions', () => {
      const metadata = new FileMetadata({
        path: '/test/PHOTO.JPG',
        name: 'PHOTO.JPG',
        extension: '.JPG',
        size: 1024,
      });

      expect(metadata.isImage()).toBe(true);
    });
  });

  describe('getFormattedSize', () => {
    test('should format bytes', () => {
      const metadata = new FileMetadata({
        path: '/test/small.txt',
        name: 'small.txt',
        extension: '.txt',
        size: 512,
      });

      expect(metadata.getFormattedSize()).toBe('512.00 B');
    });

    test('should format kilobytes', () => {
      const metadata = new FileMetadata({
        path: '/test/medium.txt',
        name: 'medium.txt',
        extension: '.txt',
        size: 2048,
      });

      expect(metadata.getFormattedSize()).toBe('2.00 KB');
    });

    test('should format megabytes', () => {
      const metadata = new FileMetadata({
        path: '/test/large.zip',
        name: 'large.zip',
        extension: '.zip',
        size: 5242880, // 5 MB
      });

      expect(metadata.getFormattedSize()).toBe('5.00 MB');
    });
  });

  describe('getCategory', () => {
    test('should return correct category for images', () => {
      const metadata = new FileMetadata({
        path: '/test/photo.png',
        name: 'photo.png',
        extension: '.png',
        size: 1024,
      });

      expect(metadata.getCategory()).toBe('image');
    });

    test('should return correct category for documents', () => {
      const metadata = new FileMetadata({
        path: '/test/doc.pdf',
        name: 'doc.pdf',
        extension: '.pdf',
        size: 1024,
      });

      expect(metadata.getCategory()).toBe('document');
    });

    test('should return other for unknown types', () => {
      const metadata = new FileMetadata({
        path: '/test/archive.zip',
        name: 'archive.zip',
        extension: '.zip',
        size: 1024,
      });

      expect(metadata.getCategory()).toBe('other');
    });
  });
});

describe('File', () => {
  let sampleMetadata;
  let sampleAnalysis;

  beforeEach(() => {
    sampleMetadata = new FileMetadata({
      path: '/test/document.pdf',
      name: 'document.pdf',
      extension: '.pdf',
      size: 1024,
      created: new Date('2024-01-01'),
      modified: new Date('2024-01-02'),
    });

    sampleAnalysis = {
      category: 'Reports',
      suggestedName: 'Q1_Report_2024.pdf',
      confidence: 0.85,
      summary: 'Quarterly financial report',
      keywords: ['finance', 'report', 'Q1'],
    };
  });

  describe('Constructor', () => {
    test('should create File with minimal data', () => {
      const file = new File({ metadata: sampleMetadata });

      expect(file.metadata).toBe(sampleMetadata);
      expect(file.analysis).toBeNull();
      expect(file.processingState).toBe('pending');
      expect(file.error).toBeNull();
      expect(file.source).toBe('unknown');
    });

    test('should create File with full data', () => {
      const file = new File({
        metadata: sampleMetadata,
        analysis: sampleAnalysis,
        processingState: 'ready',
        source: 'file_selection',
      });

      expect(file.metadata).toBe(sampleMetadata);
      expect(file.analysis).toEqual(sampleAnalysis);
      expect(file.processingState).toBe('ready');
      expect(file.source).toBe('file_selection');
    });
  });

  describe('Getters', () => {
    test('should return file path', () => {
      const file = new File({ metadata: sampleMetadata });
      expect(file.path).toBe('/test/document.pdf');
    });

    test('should return file name', () => {
      const file = new File({ metadata: sampleMetadata });
      expect(file.name).toBe('document.pdf');
    });
  });

  describe('State Checks', () => {
    test('isAnalyzed should return true when analyzed', () => {
      const file = new File({
        metadata: sampleMetadata,
        analysis: sampleAnalysis,
        processingState: 'ready',
      });

      expect(file.isAnalyzed()).toBe(true);
    });

    test('isAnalyzed should return false when not analyzed', () => {
      const file = new File({ metadata: sampleMetadata });
      expect(file.isAnalyzed()).toBe(false);
    });

    test('isReadyForOrganization should return true when ready', () => {
      const file = new File({
        metadata: sampleMetadata,
        analysis: sampleAnalysis,
        processingState: 'ready',
      });

      expect(file.isReadyForOrganization()).toBe(true);
    });

    test('hasError should return true when error exists', () => {
      const file = new File({
        metadata: sampleMetadata,
        error: 'Analysis failed',
        processingState: 'error',
      });

      expect(file.hasError()).toBe(true);
    });

    test('isProcessing should return true when analyzing', () => {
      const file = new File({
        metadata: sampleMetadata,
        processingState: 'analyzing',
      });

      expect(file.isProcessing()).toBe(true);
    });
  });

  describe('State Mutations', () => {
    test('updateState should change processing state', () => {
      const file = new File({ metadata: sampleMetadata });
      file.updateState('analyzing');

      expect(file.processingState).toBe('analyzing');
    });

    test('setAnalysis should update analysis and state', () => {
      const file = new File({ metadata: sampleMetadata });
      file.setAnalysis(sampleAnalysis);

      expect(file.analysis).toEqual(sampleAnalysis);
      expect(file.processingState).toBe('ready');
      expect(file.error).toBeNull();
    });

    test('setError should update error and state', () => {
      const file = new File({ metadata: sampleMetadata });
      file.setError('Analysis failed');

      expect(file.error).toBe('Analysis failed');
      expect(file.processingState).toBe('error');
    });

    test('markAsOrganized should update state', () => {
      const file = new File({ metadata: sampleMetadata });
      file.markAsOrganized();

      expect(file.processingState).toBe('organized');
    });
  });

  describe('getSuggestedDestination', () => {
    test('should return null when no analysis', () => {
      const file = new File({ metadata: sampleMetadata });
      const destination = file.getSuggestedDestination('/Documents');

      expect(destination).toBeNull();
    });

    test('should return correct destination with analysis', () => {
      const file = new File({
        metadata: sampleMetadata,
        analysis: sampleAnalysis,
        processingState: 'ready',
      });

      const destination = file.getSuggestedDestination('/Documents');

      expect(destination.category).toBe('Reports');
      expect(destination.suggestedName).toBe('Q1_Report_2024.pdf');
      expect(destination.fullPath).toBe('/Documents/Reports/Q1_Report_2024.pdf');
    });
  });

  describe('canBeOrganized', () => {
    test('should return invalid when not ready', () => {
      const file = new File({ metadata: sampleMetadata });
      const result = file.canBeOrganized();

      expect(result.valid).toBe(false);
      expect(result.reason).toContain('not analyzed');
    });

    test('should return invalid when no category', () => {
      const file = new File({
        metadata: sampleMetadata,
        analysis: { ...sampleAnalysis, category: null },
        processingState: 'ready',
      });

      const result = file.canBeOrganized();

      expect(result.valid).toBe(false);
      expect(result.reason).toContain('no category');
    });

    test('should return invalid when no suggested name', () => {
      const file = new File({
        metadata: sampleMetadata,
        analysis: { ...sampleAnalysis, suggestedName: null },
        processingState: 'ready',
      });

      const result = file.canBeOrganized();

      expect(result.valid).toBe(false);
      expect(result.reason).toContain('no suggested name');
    });

    test('should return valid when all conditions met', () => {
      const file = new File({
        metadata: sampleMetadata,
        analysis: sampleAnalysis,
        processingState: 'ready',
      });

      const result = file.canBeOrganized();

      expect(result.valid).toBe(true);
    });
  });

  describe('Serialization', () => {
    test('toJSON should convert to plain object', () => {
      const file = new File({
        metadata: sampleMetadata,
        analysis: sampleAnalysis,
        processingState: 'ready',
        source: 'file_selection',
      });

      const json = file.toJSON();

      expect(json.metadata).toBe(sampleMetadata);
      expect(json.analysis).toEqual(sampleAnalysis);
      expect(json.processingState).toBe('ready');
      expect(json.source).toBe('file_selection');
    });

    test('fromJSON should create File from plain object', () => {
      const data = {
        metadata: {
          path: '/test/doc.pdf',
          name: 'doc.pdf',
          extension: '.pdf',
          size: 2048,
        },
        analysis: sampleAnalysis,
        processingState: 'ready',
        source: 'drag_drop',
      };

      const file = File.fromJSON(data);

      expect(file.path).toBe('/test/doc.pdf');
      expect(file.analysis).toEqual(sampleAnalysis);
      expect(file.processingState).toBe('ready');
      expect(file.source).toBe('drag_drop');
    });
  });

  describe('fromPath', () => {
    test('should create File from path and stats', async () => {
      const stats = {
        size: 4096,
        created: new Date('2024-01-01'),
        modified: new Date('2024-01-02'),
      };

      const file = await File.fromPath('/test/report.pdf', stats);

      expect(file.path).toBe('/test/report.pdf');
      expect(file.name).toBe('report.pdf');
      expect(file.metadata.extension).toBe('.pdf');
      expect(file.metadata.size).toBe(4096);
      expect(file.source).toBe('file_selection');
    });
  });
});

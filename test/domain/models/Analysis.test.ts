/**
 * Analysis Domain Model Tests
 */

const { Analysis } = require('../../../src/domain/models/Analysis');

describe('Analysis', () => {
  let sampleData;

  beforeEach(() => {
    sampleData = {
      category: 'Reports',
      suggestedName: 'Q1_Financial_Report_2024.pdf',
      confidence: 0.85,
      summary: 'Quarterly financial report for Q1 2024',
      keywords: ['finance', 'report', 'Q1', '2024'],
      metadata: { source: 'llama3.2' },
      model: 'llama3.2:3b',
    };
  });

  describe('Constructor', () => {
    test('should create Analysis with valid data', () => {
      const analysis = new Analysis(sampleData);

      expect(analysis.category).toBe('Reports');
      expect(analysis.suggestedName).toBe('Q1_Financial_Report_2024.pdf');
      expect(analysis.confidence).toBe(0.85);
      expect(analysis.summary).toBe('Quarterly financial report for Q1 2024');
      expect(analysis.keywords).toEqual(['finance', 'report', 'Q1', '2024']);
      expect(analysis.model).toBe('llama3.2:3b');
    });

    test('should throw error for invalid confidence', () => {
      const invalidData = { ...sampleData, confidence: 1.5 };

      expect(() => new Analysis(invalidData)).toThrow('Confidence must be between 0 and 1');
    });

    test('should throw error for negative confidence', () => {
      const invalidData = { ...sampleData, confidence: -0.1 };

      expect(() => new Analysis(invalidData)).toThrow('Confidence must be between 0 and 1');
    });

    test('should use default values for optional fields', () => {
      const minimalData = {
        category: 'Documents',
        suggestedName: 'document.pdf',
        confidence: 0.7,
      };

      const analysis = new Analysis(minimalData);

      expect(analysis.summary).toBe('');
      expect(analysis.keywords).toEqual([]);
      expect(analysis.metadata).toEqual({});
    });
  });

  describe('Confidence Methods', () => {
    test('isConfident should return true for high confidence', () => {
      const analysis = new Analysis({ ...sampleData, confidence: 0.85 });
      expect(analysis.isConfident(0.7)).toBe(true);
    });

    test('isConfident should return false for low confidence', () => {
      const analysis = new Analysis({ ...sampleData, confidence: 0.6 });
      expect(analysis.isConfident(0.7)).toBe(false);
    });

    test('needsReview should return false for high confidence', () => {
      const analysis = new Analysis({ ...sampleData, confidence: 0.85 });
      expect(analysis.needsReview(0.7)).toBe(false);
    });

    test('needsReview should return true for low confidence', () => {
      const analysis = new Analysis({ ...sampleData, confidence: 0.6 });
      expect(analysis.needsReview(0.7)).toBe(true);
    });
  });

  describe('Confidence Level Description', () => {
    test('should return "very high" for confidence >= 0.9', () => {
      const analysis = new Analysis({ ...sampleData, confidence: 0.95 });
      expect(analysis.getConfidenceLevel()).toBe('very high');
    });

    test('should return "high" for confidence >= 0.7', () => {
      const analysis = new Analysis({ ...sampleData, confidence: 0.75 });
      expect(analysis.getConfidenceLevel()).toBe('high');
    });

    test('should return "medium" for confidence >= 0.5', () => {
      const analysis = new Analysis({ ...sampleData, confidence: 0.6 });
      expect(analysis.getConfidenceLevel()).toBe('medium');
    });

    test('should return "low" for confidence >= 0.3', () => {
      const analysis = new Analysis({ ...sampleData, confidence: 0.4 });
      expect(analysis.getConfidenceLevel()).toBe('low');
    });

    test('should return "very low" for confidence < 0.3', () => {
      const analysis = new Analysis({ ...sampleData, confidence: 0.2 });
      expect(analysis.getConfidenceLevel()).toBe('very low');
    });
  });

  describe('Confidence Color', () => {
    test('should return green for high confidence', () => {
      const analysis = new Analysis({ ...sampleData, confidence: 0.8 });
      expect(analysis.getConfidenceColor()).toBe('green');
    });

    test('should return yellow for medium confidence', () => {
      const analysis = new Analysis({ ...sampleData, confidence: 0.6 });
      expect(analysis.getConfidenceColor()).toBe('yellow');
    });

    test('should return red for low confidence', () => {
      const analysis = new Analysis({ ...sampleData, confidence: 0.4 });
      expect(analysis.getConfidenceColor()).toBe('red');
    });
  });

  describe('Validation', () => {
    test('hasValidCategory should return true for non-empty category', () => {
      const analysis = new Analysis(sampleData);
      expect(analysis.hasValidCategory()).toBe(true);
    });

    test('hasValidCategory should return false for empty category', () => {
      const analysis = new Analysis({ ...sampleData, category: '' });
      expect(analysis.hasValidCategory()).toBe(false);
    });

    test('hasValidSuggestedName should return true for non-empty name', () => {
      const analysis = new Analysis(sampleData);
      expect(analysis.hasValidSuggestedName()).toBe(true);
    });

    test('hasValidSuggestedName should return false for empty name', () => {
      const analysis = new Analysis({ ...sampleData, suggestedName: '' });
      expect(analysis.hasValidSuggestedName()).toBe(false);
    });

    test('isValid should return true for valid analysis', () => {
      const analysis = new Analysis(sampleData);
      expect(analysis.isValid()).toBe(true);
    });

    test('isValid should return false for invalid analysis', () => {
      const analysis = new Analysis({ ...sampleData, category: '' });
      expect(analysis.isValid()).toBe(false);
    });

    test('getValidationErrors should return errors for invalid analysis', () => {
      const analysis = new Analysis({
        ...sampleData,
        category: '',
        suggestedName: '',
      });

      const errors = analysis.getValidationErrors();

      expect(errors).toContain('Missing or invalid category');
      expect(errors).toContain('Missing or invalid suggested name');
    });

    test('getValidationErrors should return empty array for valid analysis', () => {
      const analysis = new Analysis(sampleData);
      const errors = analysis.getValidationErrors();

      expect(errors).toEqual([]);
    });
  });

  describe('Mutations', () => {
    test('updateCategory should change category', () => {
      const analysis = new Analysis(sampleData);
      analysis.updateCategory('Documents');

      expect(analysis.category).toBe('Documents');
    });

    test('updateSuggestedName should change suggested name', () => {
      const analysis = new Analysis(sampleData);
      analysis.updateSuggestedName('New_Name.pdf');

      expect(analysis.suggestedName).toBe('New_Name.pdf');
    });

    test('addKeyword should add new keyword', () => {
      const analysis = new Analysis(sampleData);
      analysis.addKeyword('new-keyword');

      expect(analysis.keywords).toContain('new-keyword');
    });

    test('addKeyword should not add duplicate keyword', () => {
      const analysis = new Analysis(sampleData);
      const initialLength = analysis.keywords.length;

      analysis.addKeyword('finance'); // Already exists

      expect(analysis.keywords.length).toBe(initialLength);
    });

    test('removeKeyword should remove existing keyword', () => {
      const analysis = new Analysis(sampleData);
      analysis.removeKeyword('finance');

      expect(analysis.keywords).not.toContain('finance');
    });

    test('updateMetadata should update metadata key', () => {
      const analysis = new Analysis(sampleData);
      analysis.updateMetadata('newKey', 'newValue');

      expect(analysis.metadata.newKey).toBe('newValue');
    });
  });

  describe('Time Methods', () => {
    test('getTimeSinceAnalysis should return "just now" for recent analysis', () => {
      const analysis = new Analysis(sampleData);
      expect(analysis.getTimeSinceAnalysis()).toBe('just now');
    });

    test('getTimeSinceAnalysis should return minutes for older analysis', () => {
      const pastDate = new Date(Date.now() - 5 * 60 * 1000); // 5 minutes ago
      const analysis = new Analysis({ ...sampleData, analyzedAt: pastDate.toISOString() });

      expect(analysis.getTimeSinceAnalysis()).toBe('5 minutes ago');
    });

    test('getTimeSinceAnalysis should return hours for older analysis', () => {
      const pastDate = new Date(Date.now() - 3 * 60 * 60 * 1000); // 3 hours ago
      const analysis = new Analysis({ ...sampleData, analyzedAt: pastDate.toISOString() });

      expect(analysis.getTimeSinceAnalysis()).toBe('3 hours ago');
    });
  });

  describe('clone', () => {
    test('should create a copy with same values', () => {
      const analysis = new Analysis(sampleData);
      const cloned = analysis.clone();

      expect(cloned.category).toBe(analysis.category);
      expect(cloned.suggestedName).toBe(analysis.suggestedName);
      expect(cloned.confidence).toBe(analysis.confidence);
    });

    test('should create a copy with modifications', () => {
      const analysis = new Analysis(sampleData);
      const cloned = analysis.clone({ category: 'NewCategory' });

      expect(cloned.category).toBe('NewCategory');
      expect(cloned.suggestedName).toBe(analysis.suggestedName);
    });

    test('should not modify original when cloning', () => {
      const analysis = new Analysis(sampleData);
      const cloned = analysis.clone({ category: 'NewCategory' });

      expect(analysis.category).toBe('Reports');
      expect(cloned.category).toBe('NewCategory');
    });
  });

  describe('Serialization', () => {
    test('toJSON should convert to plain object', () => {
      const analysis = new Analysis(sampleData);
      const json = analysis.toJSON();

      expect(json.category).toBe('Reports');
      expect(json.suggestedName).toBe('Q1_Financial_Report_2024.pdf');
      expect(json.confidence).toBe(0.85);
      expect(json.keywords).toEqual(['finance', 'report', 'Q1', '2024']);
    });

    test('fromJSON should create Analysis from plain object', () => {
      const data = {
        category: 'Documents',
        suggestedName: 'doc.pdf',
        confidence: 0.75,
        summary: 'Test document',
        keywords: ['test'],
      };

      const analysis = Analysis.fromJSON(data);

      expect(analysis.category).toBe('Documents');
      expect(analysis.suggestedName).toBe('doc.pdf');
      expect(analysis.confidence).toBe(0.75);
    });
  });

  describe('fromLLMResponse', () => {
    test('should create Analysis from LLM response', () => {
      const llmResponse = {
        category: 'Reports',
        suggestedName: 'report.pdf',
        confidence: 0.8,
        summary: 'Test report',
        keywords: ['test'],
        metadata: { source: 'llm' },
      };

      const analysis = Analysis.fromLLMResponse(llmResponse, 'llama3.2');

      expect(analysis.category).toBe('Reports');
      expect(analysis.model).toBe('llama3.2');
    });

    test('should handle alternative field names', () => {
      const llmResponse = {
        category: 'Documents',
        suggested_name: 'doc.pdf', // Snake case
        confidence: 0.7,
        description: 'Test description', // Alternative to summary
      };

      const analysis = Analysis.fromLLMResponse(llmResponse);

      expect(analysis.suggestedName).toBe('doc.pdf');
      expect(analysis.summary).toBe('Test description');
    });

    test('should use defaults for missing fields', () => {
      const llmResponse = {};

      const analysis = Analysis.fromLLMResponse(llmResponse);

      expect(analysis.category).toBe('Uncategorized');
      expect(analysis.suggestedName).toBe('');
      expect(analysis.confidence).toBe(0.5);
    });
  });
});

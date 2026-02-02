/**
 * Verifies long-running extraction steps use appropriate timeout handling.
 * PDF and OCR extractors have built-in timeouts (120s and 180s respectively),
 * so they should NOT be double-wrapped. Office extraction still uses withTimeout.
 */

jest.mock('../src/main/utils/ollamaDetection', () => ({
  isOllamaRunningWithRetry: jest.fn().mockResolvedValue(true)
}));

jest.mock('../src/main/ollamaUtils', () => ({
  getOllamaHost: jest.fn(() => 'http://localhost:11434'),
  getOllamaModel: jest.fn(() => 'test-model'),
  loadOllamaConfig: jest.fn().mockResolvedValue({ selectedTextModel: 'test-model' })
}));

jest.mock('../src/main/analysis/documentExtractors', () => ({
  extractTextFromPdf: jest.fn(),
  ocrPdfIfNeeded: jest.fn(),
  extractTextFromDoc: jest.fn(),
  extractTextFromDocx: jest.fn(),
  extractTextFromCsv: jest.fn(),
  extractTextFromXlsx: jest.fn(),
  extractTextFromPptx: jest.fn(),
  extractTextFromXls: jest.fn(),
  extractTextFromPpt: jest.fn(),
  extractTextFromOdfZip: jest.fn(),
  extractTextFromEpub: jest.fn(),
  extractTextFromEml: jest.fn(),
  extractTextFromMsg: jest.fn(),
  extractTextFromKml: jest.fn(),
  extractTextFromKmz: jest.fn(),
  extractPlainTextFromRtf: jest.fn(),
  extractPlainTextFromXml: jest.fn(),
  extractPlainTextFromHtml: jest.fn()
}));

jest.mock('../src/main/analysis/documentLlm', () => ({
  analyzeTextWithOllama: jest.fn().mockResolvedValue({
    category: 'doc',
    keywords: [],
    purpose: 'test',
    confidence: 0.8
  }),
  normalizeCategoryToSmartFolders: jest.fn((category) => category),
  AppConfig: { ai: { textAnalysis: { defaultModel: 'test-model' } } }
}));

jest.mock('../src/main/analysis/semanticFolderMatcher', () => ({
  applySemanticFolderMatching: jest.fn(),
  getServices: jest.fn(() => ({ matcher: null }))
}));

jest.mock('../src/main/analysis/embeddingQueue', () => ({
  flush: jest.fn().mockResolvedValue()
}));

let withTimeout;
let extractTextFromPdf;
let ocrPdfIfNeeded;
let extractTextFromDocx;

describe('ollamaDocumentAnalysis timeouts', () => {
  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();

    const promiseUtils = require('../src/shared/promiseUtils');
    withTimeout = jest.spyOn(promiseUtils, 'withTimeout').mockImplementation((promise) => promise);

    const documentExtractors = require('../src/main/analysis/documentExtractors');
    extractTextFromPdf = documentExtractors.extractTextFromPdf;
    ocrPdfIfNeeded = documentExtractors.ocrPdfIfNeeded;
    extractTextFromDocx = documentExtractors.extractTextFromDocx;
  });

  test('does NOT double-wrap PDF extraction with withTimeout (extractors have built-in timeouts)', async () => {
    extractTextFromPdf.mockResolvedValue('pdf body');
    const { analyzeDocumentFile } = require('../src/main/analysis/ollamaDocumentAnalysis');

    await analyzeDocumentFile('/tmp/file.pdf', []);

    // PDF extraction should NOT be wrapped with withTimeout since extractTextFromPdf
    // already has a 120s internal timeout. Double-wrapping with 60s would kill it prematurely.
    const pdfTimeoutCalls = withTimeout.mock.calls.filter(
      (call) => call[2] && String(call[2]).includes('PDF extraction')
    );
    expect(pdfTimeoutCalls).toHaveLength(0);
  });

  test('does NOT double-wrap OCR with withTimeout (extractors have built-in timeouts)', async () => {
    extractTextFromPdf.mockResolvedValue('');
    ocrPdfIfNeeded.mockResolvedValue('ocr text');
    const { analyzeDocumentFile } = require('../src/main/analysis/ollamaDocumentAnalysis');

    await analyzeDocumentFile('/tmp/file.pdf', []);

    // OCR should NOT be wrapped with withTimeout since ocrPdfIfNeeded
    // already has a 180s internal timeout.
    const ocrTimeoutCalls = withTimeout.mock.calls.filter(
      (call) => call[2] && String(call[2]).includes('OCR')
    );
    expect(ocrTimeoutCalls).toHaveLength(0);
  });

  test('wraps office extraction with withTimeout using AI_ANALYSIS_LONG', async () => {
    extractTextFromDocx.mockResolvedValue('docx body');
    const { analyzeDocumentFile } = require('../src/main/analysis/ollamaDocumentAnalysis');

    await analyzeDocumentFile('/tmp/file.docx', []);

    expect(withTimeout).toHaveBeenCalledWith(
      expect.any(Promise),
      expect.any(Number),
      expect.stringContaining('Office extraction')
    );
    // Verify the timeout is AI_ANALYSIS_LONG (180s) not AI_ANALYSIS_MEDIUM (60s)
    const officeCall = withTimeout.mock.calls.find(
      (call) => call[2] && String(call[2]).includes('Office extraction')
    );
    expect(officeCall[1]).toBeGreaterThanOrEqual(120000);
  });
});

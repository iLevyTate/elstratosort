/**
 * Mock for pdf-parse package
 * Provides test-friendly mocks for PDF text extraction
 */

const mockPdfParse = jest.fn(async (dataBuffer) => {
  // Simulate PDF parsing result
  return {
    numpages: 1,
    numrender: 1,
    info: {
      PDFFormatVersion: '1.7',
      IsAcroFormPresent: false,
      IsXFAPresent: false,
      Title: 'Mock PDF Document',
      Author: 'Test Author',
      Creator: 'Mock Creator',
      Producer: 'Mock Producer',
      CreationDate: "D:20230101120000Z'00'",
      ModDate: "D:20230101120000Z'00'",
    },
    metadata: null,
    text: 'Mock PDF text content for testing purposes.\nThis is a second line of text.',
    version: '1.10.100',
  };
});

module.exports = mockPdfParse;

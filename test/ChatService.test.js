const ChatService = require('../src/main/services/ChatService');

describe('ChatService', () => {
  test('filters citations to known sources and normalizes output', () => {
    const service = new ChatService({
      searchService: {},
      chromaDbService: {},
      embeddingService: {},
      ollamaService: {}
    });

    const sources = [{ id: 'doc-1' }, { id: 'doc-2' }];
    const raw = JSON.stringify({
      documentAnswer: [
        {
          text: 'This is supported by docs.',
          citations: ['doc-1', 'doc-3']
        }
      ],
      modelAnswer: [
        {
          text: 'This is model knowledge.'
        }
      ],
      followUps: ['What else should I review?']
    });

    const parsed = service._parseResponse(raw, sources);

    expect(parsed.documentAnswer).toHaveLength(1);
    expect(parsed.documentAnswer[0].citations).toEqual(['doc-1']);
    expect(parsed.modelAnswer).toHaveLength(1);
    expect(parsed.modelAnswer[0].text).toBe('This is model knowledge.');
    expect(parsed.followUps).toEqual(['What else should I review?']);
  });
});

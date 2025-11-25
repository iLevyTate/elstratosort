/**
 * Handles scoring and ranking of organization suggestions
 */
class SuggestionScorer {
  config: any;

  constructor(config: any = {}) {
    this.config = {
      semanticMatchThreshold: config.semanticMatchThreshold || 0.4,
      patternSimilarityThreshold: config.patternSimilarityThreshold || 0.5,
      ...config
    };
  }

  /**
   * Calculate confidence score for a suggestion
   * @param {Object} suggestion - The suggestion object
   * @param {Object} fileData - Metadata about the file
   * @returns {Object} Suggestion with normalized confidence score
   */
  scoreSuggestion(suggestion, fileData) {
    let baseScore = parseFloat(suggestion.confidence) || 0.5;

    // 1. Boost if path matches file extension category (e.g. "Documents" for .pdf)
    const ext = fileData.fileExtension || fileData.extension;
    if (ext && this._matchesCategory(suggestion.path, ext)) {
      baseScore += 0.1;
    }

    // 2. Boost if path contains keywords from analysis
    if (fileData.analysis && fileData.analysis.keywords) {
      const pathLower = suggestion.path.toLowerCase();
      const keywordMatches = fileData.analysis.keywords.filter(k =>
        pathLower.includes(k.toLowerCase())
      ).length;

      if (keywordMatches > 0) {
        baseScore += Math.min(0.2, keywordMatches * 0.05);
      }
    }

    // 3. Penalize very deep paths
    const depth = suggestion.path.split(/[/\\]/).length;
    if (depth > 4) {
      baseScore -= 0.1;
    }

    return {
      ...suggestion,
      confidence: Math.min(0.99, Math.max(0.1, baseScore))
    };
  }

  _matchesCategory(path, extension) {
    const ext = extension.toLowerCase().replace('.', '');
    const pathLower = path.toLowerCase();

    const map = {
      'pdf': ['document', 'paper', 'report'],
      'doc': ['document', 'word'],
      'docx': ['document', 'word'],
      'jpg': ['image', 'photo', 'picture'],
      'png': ['image', 'photo', 'picture', 'screenshot'],
      'mp3': ['audio', 'music', 'sound'],
      'mp4': ['video', 'movie']
    };

    const keywords = map[ext] || [];
    return keywords.some(k => pathLower.includes(k));
  }
}

export default SuggestionScorer;

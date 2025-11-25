/**
 * Handles construction of prompts for the LLM
 */
class SuggestionPromptBuilder {
  strategies: any;

  constructor(strategies) {
    this.strategies = strategies || this._getDefaultStrategies();
  }

  _getDefaultStrategies() {
    return {
      'project-based': {
        name: 'Project-Based',
        description: 'Organize files by project or client',
        pattern: 'Projects/{project_name}/{file_type}',
        priority: ['project', 'client', 'task'],
      },
      'date-based': {
        name: 'Date-Based',
        description: 'Organize files by year/month',
        pattern: '{year}/{month}/{file_type}',
        priority: ['date', 'year', 'month'],
      },
      'file-type': {
        name: 'File-Type',
        description: 'Organize by document type',
        pattern: 'Documents/{extension}/{category}',
        priority: ['type', 'extension', 'category'],
      },
      'semantic': {
        name: 'Semantic',
        description: 'Organize by content topic',
        pattern: 'Topics/{topic}/{subtopic}',
        priority: ['topic', 'content', 'subject'],
      },
    };
  }

  buildSystemPrompt() {
    return `You are an intelligent file organization assistant. Your goal is to analyze file metadata and content to suggest the best folder structure.
You must output strictly valid JSON.
Focus on creating a clean, logical hierarchy.
Do not be conversational.`;
  }

  buildSuggestionPrompt(fileData, existingStructure = [], customInstructions = '', smartFolders = []) {
    const {
      fileName,
      fileExtension,
      analysis,
      metadata
    } = fileData;

    // Build folder context with descriptions (enhanced v2.0)
    const folderContext = this._buildFolderContext(smartFolders, existingStructure);

    const context = {
      fileName,
      type: fileExtension,
      content_summary: analysis ? (analysis.summary || analysis.purpose || analysis.text || '').substring(0, 500) : 'No content analysis',
      keywords: analysis ? (analysis.keywords || []).join(', ') : '',
      category: analysis?.category || '',
      project: analysis?.project || '',
      documentType: analysis?.documentType || '',
      entities: analysis?.entities ? JSON.stringify(analysis.entities) : '',
      dates: metadata ? `Created: ${metadata.created}, Modified: ${metadata.modified}` : '',
      strategies: Object.keys(this.strategies).join(', ')
    };

    return `Suggest folder for file organization. Output valid JSON only.

FILE:
- Name: ${context.fileName}
- Type: ${context.type}
- Category: ${context.category}
- Project: ${context.project}
- Keywords: ${context.keywords}
- Summary: ${context.content_summary}
${context.entities ? `- Entities: ${context.entities}\n` : ''}${context.dates ? `- Dates: ${context.dates}\n` : ''}
FOLDERS:
${folderContext}
${customInstructions ? `\nINSTRUCTIONS: ${customInstructions}\n` : ''}
Suggest 3 folder paths. Match file content to folder descriptions.

Output:
{
  "suggestions": [
    {"path": "FolderName", "reason": "why this matches", "confidence": 0.8, "strategy": "semantic|pattern|content"}
  ]
}`;
  }

  /**
   * Build folder context with descriptions for better matching
   * @param {Array} smartFolders - Smart folder configurations
   * @param {Array} existingStructure - Existing folder names
   * @returns {string} - Formatted folder context
   */
  _buildFolderContext(smartFolders = [], existingStructure = []) {
    // Prefer smart folders with descriptions
    if (smartFolders && smartFolders.length > 0) {
      return smartFolders
        .slice(0, 15)
        .map((f, i) => {
          const desc = f.description || 'General storage';
          const typical = f.typicalContents || '';
          return `${i + 1}. "${f.name}" - ${desc}${typical ? ` (Typical: ${typical})` : ''}`;
        })
        .join('\n');
    }

    // Fallback to existing structure names
    if (existingStructure && existingStructure.length > 0) {
      return existingStructure.slice(0, 20).map((f, i) => `${i + 1}. "${f}"`).join('\n');
    }

    return 'No folders defined';
  }
}

export default SuggestionPromptBuilder;

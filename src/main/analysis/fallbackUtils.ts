/**
 * Fallback utilities for file categorization and name generation
 */

/**
 * Smart folder interface for category matching
 */
interface SmartFolderInfo {
  name: string;
  path?: string;
  description?: string;
  category?: string;
  keywords?: string[];
  semanticTags?: string[];
  relatedFolders?: string[];
  confidenceScore?: number;
}

/**
 * Category patterns for file classification
 */
const CATEGORY_PATTERNS: Record<string, string[]> = {
  financial: [
    'invoice', 'receipt', 'tax', 'financial', 'payment', 'bank', 'budget',
    'expense', 'income', 'billing', 'statement', 'transaction', 'payroll',
    'accounting', 'audit', 'revenue', 'profit', 'loss', 'balance',
  ],
  legal: [
    'contract', 'agreement', 'legal', 'terms', 'policy', 'license', 'patent',
    'trademark', 'copyright', 'compliance', 'regulation', 'law', 'court',
    'litigation', 'settlement', 'clause', 'liability', 'warranty',
  ],
  project: [
    'project', 'spec', 'requirement', 'proposal', 'plan', 'design', 'scope',
    'milestone', 'deliverable', 'timeline', 'roadmap', 'charter', 'brief',
    'kickoff', 'retrospective', 'sprint', 'agile', 'scrum',
  ],
  personal: [
    'resume', 'cv', 'personal', 'letter', 'diary', 'journal', 'notes',
    'family', 'vacation', 'travel', 'health', 'medical', 'insurance',
    'passport', 'certificate', 'diploma', 'education',
  ],
  technical: [
    'manual', 'guide', 'technical', 'instruction', 'documentation', 'api',
    'code', 'software', 'hardware', 'system', 'architecture', 'database',
    'server', 'network', 'security', 'backup', 'config', 'setup',
  ],
  research: [
    'research', 'study', 'analysis', 'report', 'findings', 'data', 'survey',
    'experiment', 'hypothesis', 'methodology', 'results', 'conclusion',
    'whitepaper', 'thesis', 'dissertation', 'publication',
  ],
  marketing: [
    'marketing', 'campaign', 'advertisement', 'promotion', 'brand', 'logo',
    'social', 'media', 'content', 'strategy', 'analytics', 'metrics',
    'conversion', 'lead', 'customer', 'segment', 'target',
  ],
  hr: [
    'employee', 'staff', 'hiring', 'recruitment', 'onboarding', 'training',
    'performance', 'review', 'evaluation', 'benefits', 'policy', 'handbook',
    'job', 'position', 'salary', 'compensation', 'leave',
  ],
};

/**
 * Extension to category mapping
 */
const EXTENSION_CATEGORIES: Record<string, string> = {
  '.pdf': 'document',
  '.doc': 'document',
  '.docx': 'document',
  '.txt': 'text',
  '.md': 'documentation',
  '.png': 'image',
  '.jpg': 'image',
  '.jpeg': 'image',
  '.gif': 'image',
  '.svg': 'image',
  '.mp4': 'video',
  '.avi': 'video',
  '.xlsx': 'spreadsheet',
  '.xls': 'spreadsheet',
  '.csv': 'data',
  '.json': 'data',
  '.xml': 'data',
  '.zip': 'archive',
  '.rar': 'archive',
  '.7z': 'archive',
};

/**
 * Base keywords per category
 */
const BASE_KEYWORDS: Record<string, string[]> = {
  financial: ['financial', 'money', 'business'],
  legal: ['legal', 'official', 'formal'],
  project: ['project', 'work', 'development'],
  personal: ['personal', 'individual', 'private'],
  technical: ['technical', 'manual', 'guide'],
  document: ['document', 'file', 'text'],
  image: ['image', 'visual', 'graphic'],
};

/**
 * Get intelligent category based on filename, extension, and smart folders
 */
function getIntelligentCategory(
  fileName: string,
  extension: string,
  smartFolders: SmartFolderInfo[] = []
): string {
  const lowerFileName = fileName.toLowerCase();

  // Try to match against smart folders first
  if (smartFolders && smartFolders.length > 0) {
    const validFolders = smartFolders.filter(
      (f: SmartFolderInfo) =>
        f && f.name && typeof f.name === 'string' && f.name.trim().length > 0,
    );
    let bestMatch: string | null = null;
    let bestScore = 0;

    for (const folder of validFolders) {
      const folderNameLower = folder.name.toLowerCase();
      let score = 0;

      if (lowerFileName.includes(folderNameLower)) score += 10;

      const folderWords = folderNameLower
        .split(/[\s_-]+/)
        .filter((w: string) => w.length > 2);
      for (const word of folderWords) {
        if (lowerFileName.includes(word)) score += 8;
      }

      if (folder.description) {
        const descWords = folder.description
          .toLowerCase()
          .split(/[\s,.-]+/)
          .filter((w: string) => w.length > 3);
        for (const word of descWords) {
          if (lowerFileName.includes(word)) score += 6;
        }
      }

      if (Array.isArray(folder.semanticTags)) {
        for (const tag of folder.semanticTags) {
          if (lowerFileName.includes(String(tag).toLowerCase())) score += 5;
        }
      }

      if (Array.isArray(folder.keywords)) {
        for (const kw of folder.keywords) {
          if (lowerFileName.includes(String(kw).toLowerCase())) score += 4;
        }
      }

      // FIXED Bug #25: Validate split() result before access to prevent crashes
      if (folder.path && typeof folder.path === 'string') {
        const pathParts = folder.path.toLowerCase().split(/[\\/]/);
        if (Array.isArray(pathParts)) {
          const parts = pathParts.filter((p: string) => p && p.length > 2);
          for (const part of parts) {
            if (lowerFileName.includes(part)) score += 3;
          }
        }
      }

      if (folder.category) {
        for (const word of folder.category.toLowerCase().split(/[\s_-]+/)) {
          if (word.length > 2 && lowerFileName.includes(word)) score += 2;
        }
      }

      if (Array.isArray(folder.relatedFolders)) {
        for (const relatedName of folder.relatedFolders) {
          if (lowerFileName.includes(String(relatedName).toLowerCase())) {
            score += 1;
          }
        }
      }

      if (folder.confidenceScore && folder.confidenceScore > 0.8) score *= 1.2;

      if (score > bestScore) {
        bestScore = score;
        bestMatch = folder.name;
      }
    }

    // HIGH PRIORITY FIX (HIGH-6): Only return bestMatch if it's not null
    if (bestScore >= 5 && bestMatch) return bestMatch;
  }

  // Fall back to pattern matching
  const categoryScores: Record<string, number> = {};
  let maxScore = 0;
  let bestCategory: string | null = null;

  for (const [category, keywords] of Object.entries(CATEGORY_PATTERNS)) {
    let score = 0;
    for (const keyword of keywords) {
      if (lowerFileName.includes(keyword)) {
        score += keyword.length;
      }
    }
    if (score > 0) {
      categoryScores[category] = score;
      if (score > maxScore) {
        maxScore = score;
        bestCategory = category;
      }
    }
  }

  // Early exit: if we found a category, return it
  if (bestCategory) {
    return bestCategory;
  }

  // Fall back to extension-based category
  return EXTENSION_CATEGORIES[extension] || 'document';
}

/**
 * Get intelligent keywords based on filename and extension
 */
function getIntelligentKeywords(fileName: string, extension: string): string[] {
  const category = getIntelligentCategory(fileName, extension);
  const lowerFileName = fileName.toLowerCase();
  const keywords: string[] = [...(BASE_KEYWORDS[category] || ['file', 'document'])];

  if (lowerFileName.includes('report')) keywords.push('report');
  if (lowerFileName.includes('summary')) keywords.push('summary');
  if (lowerFileName.includes('analysis')) keywords.push('analysis');
  if (lowerFileName.includes('proposal')) keywords.push('proposal');
  if (lowerFileName.includes('presentation')) keywords.push('presentation');
  if (extension) keywords.push(extension.replace('.', ''));

  return keywords.slice(0, 7);
}

/**
 * Reserved Windows file names
 */
const RESERVED_WINDOWS_NAMES = [
  'CON', 'PRN', 'AUX', 'NUL',
  'COM1', 'COM2', 'COM3', 'COM4', 'COM5', 'COM6', 'COM7', 'COM8', 'COM9',
  'LPT1', 'LPT2', 'LPT3', 'LPT4', 'LPT5', 'LPT6', 'LPT7', 'LPT8', 'LPT9',
];

/**
 * Sanitize filename for safe filesystem usage
 */
function safeSuggestedName(fileName: string, extension: string): string {
  // Strip extension, sanitize the base name, then add extension back
  let nameWithoutExt = fileName.replace(extension, '');

  // Handle reserved Windows file names
  const upperName = nameWithoutExt.toUpperCase().trim();
  if (RESERVED_WINDOWS_NAMES.includes(upperName)) {
    nameWithoutExt = nameWithoutExt + '_file';
  }

  // Handle leading dots (hidden files on Unix-like systems) and prevent empty names
  if (!nameWithoutExt || nameWithoutExt.trim().length === 0) {
    nameWithoutExt = 'unnamed_file';
  }

  // Remove leading/trailing dots and spaces
  nameWithoutExt = nameWithoutExt
    .trim()
    .replace(/^\.+/, '')
    .replace(/\.+$/, '');

  // If stripping dots results in empty name, use default
  if (!nameWithoutExt || nameWithoutExt.length === 0) {
    nameWithoutExt = 'unnamed_file';
  }

  // Sanitize invalid characters (comprehensive)
  // Windows: < > : " / \ | ? *
  // Unix: /
  // Also remove control characters
  const sanitized = nameWithoutExt
    // eslint-disable-next-line no-control-regex
    .replace(/[<>:"/\\|?*\u0000-\u001F]/g, '_')
    .replace(/\s+/g, '_') // Replace spaces with underscores
    .replace(/_+/g, '_') // Collapse multiple underscores
    .replace(/^_+/, '') // Remove leading underscores
    .replace(/_+$/, ''); // Remove trailing underscores

  // Final fallback if name is empty after sanitization
  const finalName = sanitized || 'unnamed_file';

  // Ensure name doesn't exceed filesystem limits (255 chars typical)
  const maxLength = 200; // Leave room for extension and path components
  const truncatedName =
    finalName.length > maxLength
      ? finalName.substring(0, maxLength)
      : finalName;

  // Always include extension to prevent files from becoming unopenable
  return truncatedName + extension;
}

export {
  getIntelligentCategory,
  getIntelligentKeywords,
  safeSuggestedName,
};

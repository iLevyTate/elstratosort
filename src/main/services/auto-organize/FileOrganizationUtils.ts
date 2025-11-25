import path from 'path';

interface FileWithAnalysis {
  path: string;
  name: string;
  extension?: string;
  size?: number;
  type?: string;
  analysis?: {
    category?: string;
    suggestedName?: string;
    confidence?: number;
    summary?: string;
  } | null;
}

interface FolderSuggestion {
  folder: string;
  path?: string;
  confidence?: number;
}

interface SmartFolder {
  name: string;
  path?: string;
}

interface SanitizedFile {
  name: string;
  path: string;
  size?: number;
  extension?: string;
  type?: string;
  analysis?: {
    category?: string;
    suggestedName?: string;
    confidence?: number;
    summary?: string;
  } | null;
}

class FileOrganizationUtils {
  /**
   * Build destination path for a file
   */
  static buildDestinationPath(
    file: FileWithAnalysis,
    suggestion: FolderSuggestion,
    defaultLocation: string,
    preserveNames?: boolean
  ): string {
    const folderPath =
      suggestion.path || path.join(defaultLocation, suggestion.folder);

    const fileName = preserveNames
      ? file.name
      : file.analysis?.suggestedName || file.name;

    return path.join(folderPath, fileName);
  }

  /**
   * Get file type category
   */
  static getFileTypeCategory(extension: string): string {
    const categories: Record<string, string[]> = {
      documents: ['pdf', 'doc', 'docx', 'txt', 'rtf', 'odt'],
      spreadsheets: ['xls', 'xlsx', 'csv', 'ods'],
      presentations: ['ppt', 'pptx', 'odp'],
      images: ['jpg', 'jpeg', 'png', 'gif', 'svg', 'bmp'],
      videos: ['mp4', 'avi', 'mov', 'wmv', 'flv'],
      audio: ['mp3', 'wav', 'flac', 'aac', 'm4a'],
      code: ['js', 'py', 'java', 'cpp', 'html', 'css'],
      archives: ['zip', 'rar', '7z', 'tar', 'gz'],
    };

    const ext = extension.toLowerCase().replace('.', '');

    for (const [category, extensions] of Object.entries(categories)) {
      if (extensions.includes(ext)) {
        return category.charAt(0).toUpperCase() + category.slice(1);
      }
    }

    return 'Files';
  }

  /**
   * Get fallback destination for files with no good match
   */
  static getFallbackDestination(
    file: FileWithAnalysis,
    smartFolders: SmartFolder[],
    defaultLocation: string
  ): string {
    // Try to match based on file type
    const fileType = this.getFileTypeCategory(file.extension || '');

    // Look for a smart folder that matches the file type
    const typeFolder = smartFolders.find((f) =>
      f.name.toLowerCase().includes(fileType.toLowerCase())
    );

    if (typeFolder) {
      return path.join(
        typeFolder.path || `${defaultLocation}/${typeFolder.name}`,
        file.name
      );
    }

    // Use category from analysis if available
    if (file.analysis?.category) {
      const categoryFolder = smartFolders.find(
        (f) => f.name.toLowerCase() === file.analysis?.category?.toLowerCase()
      );

      if (categoryFolder) {
        return path.join(
          categoryFolder.path || `${defaultLocation}/${categoryFolder.name}`,
          file.name
        );
      }

      // Create new folder based on category
      return path.join(defaultLocation, file.analysis.category, file.name);
    }

    // Ultimate fallback - organize by file type
    return path.join(defaultLocation, fileType, file.name);
  }

  /**
   * Sanitize file object for IPC transmission
   * Removes large data and circular references
   */
  static sanitizeFile(file: FileWithAnalysis): SanitizedFile {
    // Create a clean lightweight copy
    return {
      name: file.name,
      path: file.path,
      size: file.size,
      extension: file.extension,
      type: file.type,
      // Only include essential analysis data if present
      analysis: file.analysis
        ? {
            category: file.analysis.category,
            suggestedName: file.analysis.suggestedName,
            confidence: file.analysis.confidence,
            summary: file.analysis.summary,
          }
        : null,
    };
  }
}

export default FileOrganizationUtils;

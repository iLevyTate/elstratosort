import path from 'path';
import { logger } from '../../shared/logger';
import { analyzeDocumentFile } from '../analysis/ollamaDocumentAnalysis';
import { analyzeImageFile } from '../analysis/ollamaImageAnalysis';

logger.setContext('FileAnalysisService');

interface AnalysisResult {
  [key: string]: any;
}

interface SmartFolder {
  [key: string]: any;
}

class FileAnalysisService {
  private ollamaService: any;
  private fileAnalysisCache: Map<string, any>;
  private MAX_FILE_CACHE: number;

  constructor(ollamaService: any = null) {
    this.ollamaService = ollamaService;
    this.fileAnalysisCache = new Map();
    this.MAX_FILE_CACHE = 500;
  }

  setFileCache(signature: string, value: any): void {
    if (!signature) return;
    this.fileAnalysisCache.set(signature, value);
    if (this.fileAnalysisCache.size > this.MAX_FILE_CACHE) {
      const firstKey = this.fileAnalysisCache.keys().next().value;
      this.fileAnalysisCache.delete(firstKey);
    }
  }

  async analyze(filePath: string): Promise<AnalysisResult> {
    const extension = path.extname(filePath).toLowerCase();
    const imageExtensions = [
      '.jpg',
      '.jpeg',
      '.png',
      '.gif',
      '.bmp',
      '.webp',
      '.svg',
      '.tiff',
    ];
    if (imageExtensions.includes(extension)) {
      return this.analyzeImage(filePath);
    } else {
      return this.analyzeDocument(filePath);
    }
  }

  async analyzeDocument(filePath: string, smartFolders: SmartFolder[] = []): Promise<AnalysisResult> {
    return await analyzeDocumentFile(filePath, smartFolders);
  }

  async analyzeImage(filePath: string, smartFolders: SmartFolder[] = []): Promise<AnalysisResult> {
    return await analyzeImageFile(filePath, smartFolders);
  }
}

export { FileAnalysisService };

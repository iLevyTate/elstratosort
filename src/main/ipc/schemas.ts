/**
 * Zod Schemas for IPC Validation
 * Defines validation schemas for all IPC endpoints
 */
import { z } from 'zod';

// ==================== Common Schemas ====================

/**
 * File object schema
 */
export const FileSchema = z.object({
  path: z.string().min(1, 'File path is required'),
  name: z.string().min(1, 'File name is required'),
  size: z.number().nonnegative().optional(),
  type: z.string().optional(),
  extension: z.string().optional(),
});

/**
 * Naming convention options
 */
export const NamingConventionSchema = z.object({
  convention: z.enum(['subject-date', 'date-subject', 'original', 'custom']),
  dateFormat: z.string().optional(),
  caseConvention: z.enum(['kebab-case', 'snake_case', 'camelCase', 'PascalCase', 'lowercase', 'UPPERCASE']).optional(),
  separator: z.string().optional(),
});

/**
 * Smart folder schema
 */
export const SmartFolderSchema = z.object({
  id: z.string().optional(),
  name: z.string().min(1, 'Folder name is required'),
  path: z.string().min(1, 'Folder path is required'),
  description: z.string().optional(),
  isDefault: z.boolean().optional(),
  tags: z.array(z.string()).optional(),
});

// ==================== Analysis Schemas ====================

/**
 * Analysis request schema
 */
export const AnalysisRequestSchema = z.object({
  files: z.array(z.string().min(1)).min(1, 'At least one file path is required').max(100, 'Maximum 100 files per batch'),
  options: z.object({
    namingConvention: NamingConventionSchema.optional(),
    force: z.boolean().optional(),
  }).optional(),
});

/**
 * Single file analysis request
 */
export const SingleFileAnalysisSchema = z.object({
  filePath: z.string().min(1, 'File path is required'),
  options: z.object({
    extractText: z.boolean().optional(),
    analyzeContent: z.boolean().optional(),
  }).optional(),
});

// ==================== File Operation Schemas ====================

/**
 * File open request
 */
export const FileOpenSchema = z.object({
  path: z.string().min(1, 'File path is required'),
});

/**
 * File delete request
 */
export const FileDeleteSchema = z.object({
  path: z.string().min(1, 'File path is required'),
  permanent: z.boolean().optional(),
});

/**
 * File move request
 */
export const FileMoveSchema = z.object({
  source: z.string().min(1, 'Source path is required'),
  destination: z.string().min(1, 'Destination path is required'),
  overwrite: z.boolean().optional(),
});

// ==================== Smart Folder Schemas ====================

/**
 * Smart folder add request
 */
export const SmartFolderAddSchema = z.object({
  name: z.string().min(1, 'Folder name is required').max(100, 'Name too long'),
  path: z.string().min(1, 'Folder path is required'),
  description: z.string().max(500, 'Description too long').optional(),
  isDefault: z.boolean().optional(),
});

/**
 * Smart folder edit request
 */
export const SmartFolderEditSchema = z.object({
  id: z.string().min(1, 'Folder ID is required'),
  updates: z.object({
    name: z.string().min(1).max(100).optional(),
    path: z.string().min(1).optional(),
    description: z.string().max(500).optional(),
    isDefault: z.boolean().optional(),
  }),
});

/**
 * Smart folder delete request
 */
export const SmartFolderDeleteSchema = z.object({
  id: z.string().min(1, 'Folder ID is required'),
});

// ==================== Organization Schemas ====================

/**
 * Auto-organize request
 */
export const AutoOrganizeSchema = z.object({
  files: z.array(FileSchema).min(1, 'At least one file is required').max(100, 'Maximum 100 files per batch'),
  smartFolders: z.array(SmartFolderSchema),
  options: z.object({
    defaultLocation: z.string().optional(),
    confidenceThreshold: z.number().min(0).max(1).optional(),
    preserveNames: z.boolean().optional(),
  }).optional(),
});

// ==================== Ollama Schemas ====================

/**
 * Ollama model check request
 */
export const OllamaModelCheckSchema = z.object({
  modelName: z.string().min(1, 'Model name is required'),
});

/**
 * Ollama model pull request
 */
export const OllamaModelPullSchema = z.object({
  modelName: z.string().min(1, 'Model name is required'),
  insecure: z.boolean().optional(),
});

// ==================== Semantic Schemas ====================

/**
 * Find similar files request
 */
export const FindSimilarSchema = z.object({
  fileId: z.string().min(1, 'File ID is required'),
  topK: z.number().int().min(1).max(100).default(10),
});

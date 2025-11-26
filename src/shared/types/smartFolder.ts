/**
 * Smart Folder Type Definitions
 * Types for smart folder configuration and management
 */

/**
 * Smart folder definition
 */
export interface SmartFolder {
  /** Unique identifier */
  id?: string;
  /** Display name */
  name: string;
  /** Full path on disk */
  path: string;
  /** Description of folder purpose */
  description?: string;
  /** Keywords for semantic matching */
  keywords?: string[];
  /** Whether this is the default folder */
  isDefault?: boolean;
  /** File type filters */
  fileTypes?: string[];
  /** Custom rules for matching */
  rules?: SmartFolderRule[];
  /** When the folder was created */
  createdAt?: string;
  /** When the folder was last modified */
  updatedAt?: string;
}

/**
 * Smart folder matching rule
 */
export interface SmartFolderRule {
  /** Rule type */
  type: 'extension' | 'category' | 'keyword' | 'pattern';
  /** Rule value */
  value: string;
  /** Whether to include or exclude matches */
  include: boolean;
}

/**
 * Smart folder match result
 */
export interface SmartFolderMatch {
  /** Matched folder */
  folder: SmartFolder;
  /** Match confidence (0-1) */
  confidence: number;
  /** How the match was made */
  matchType: 'semantic' | 'keyword' | 'extension' | 'category' | 'rule';
  /** Explanation of match */
  reason?: string;
}

/**
 * Smart folder creation request
 */
export interface SmartFolderCreateRequest {
  name: string;
  path: string;
  description?: string;
  keywords?: string[];
  isDefault?: boolean;
}

/**
 * Smart folder update request
 */
export interface SmartFolderUpdateRequest {
  id: string;
  updates: Partial<Omit<SmartFolder, 'id' | 'createdAt'>>;
}

/**
 * Smart folder delete request
 */
export interface SmartFolderDeleteRequest {
  id: string;
  /** Also delete the physical folder */
  deletePhysical?: boolean;
}

/**
 * Folder structure scan result
 */
export interface FolderStructure {
  /** Root path that was scanned */
  root: string;
  /** Discovered folders */
  folders: Array<{
    path: string;
    name: string;
    depth: number;
    fileCount: number;
    totalSize: number;
  }>;
  /** Total file count */
  totalFiles: number;
  /** Total size in bytes */
  totalSize: number;
}

/**
 * Smart folder statistics
 */
export interface SmartFolderStats {
  /** Folder ID */
  id: string;
  /** Number of files organized to this folder */
  filesOrganized: number;
  /** Last time a file was organized here */
  lastUsed?: string;
  /** Usage frequency score */
  usageScore: number;
}

/**
 * Default folder configuration
 */
export interface DefaultFolderConfig {
  /** Base path for default folders */
  basePath: string;
  /** Default folder structure */
  structure: Array<{
    name: string;
    description: string;
    keywords: string[];
  }>;
}

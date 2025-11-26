/**
 * Global type declarations for StratoSort
 * This file provides types for the Electron preload API and other global interfaces
 */

// Permissive electronAPI type - allows any method calls without strict checking
// This enables development while the full TypeScript migration is in progress
// eslint-disable-next-line @typescript-eslint/no-explicit-any
interface ElectronAPI {
  files: any;
  smartFolders: any;
  analysis: any;
  suggestions: any;
  organize: any;
  settings: any;
  embeddings: any;
  ollama: any;
  undoRedo: any;
  analysisHistory: any;
  system: any;
  window: any;
  events: any;
  [key: string]: any;
}

declare global {
  interface Window {
    electronAPI: ElectronAPI;
  }
}

export {};

const fs = require('fs');
const glob = require('glob');

// Services that use export default
const defaultExportServices = [
  'ModelVerifier',
  'ModelManager',
  'FolderMatchingService',
  'AutoOrganizeService',
  'SettingsService',
  'EmbeddingCache',
  'OrganizationSuggestionService',
  'UndoRedoService',
  'ProcessingStateService',
  'BatchAnalysisService',
  'DownloadWatcher',
  'AnalysisHistoryService',
  'ServiceIntegration',
];

const files = glob.sync('test/**/*.ts');
let totalFixes = 0;

for (const file of files) {
  let content = fs.readFileSync(file, 'utf8');
  let modified = false;

  for (const svc of defaultExportServices) {
    // Pattern: jest.mock('...ServiceName', () => { return jest.fn()... })
    // Should become: jest.mock('...ServiceName', () => ({ default: jest.fn()... }))

    // Fix pattern: () => { return jest.fn().mockImplementation(...)
    const returnPattern = new RegExp(
      `(jest\\.mock\\([^)]*${svc}[^)]*,\\s*\\(\\)\\s*=>\\s*\\{\\s*)return\\s+(jest\\.fn\\(\\))`,
      'g',
    );
    let newContent = content.replace(returnPattern, '$1return { default: $2');

    // Fix pattern: () => { return { checkOllamaConnection...
    const returnObjPattern = new RegExp(
      `(jest\\.mock\\([^)]*${svc}[^)]*,\\s*\\(\\)\\s*=>\\s*\\{\\s*)return\\s+\\{`,
      'g',
    );
    newContent = newContent.replace(returnObjPattern, '$1return { default: {');

    if (newContent !== content) {
      content = newContent;
      modified = true;
    }
  }

  if (modified) {
    fs.writeFileSync(file, content);
    totalFixes++;
    console.log('Fixed:', file);
  }
}

console.log('\nTotal files fixed:', totalFixes);

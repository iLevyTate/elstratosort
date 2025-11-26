const fs = require('fs');
const glob = require('glob');

// Services that use export default (need .default)
const defaultExportServices = [
  'ModelManager',
  'SettingsService',
  'AutoOrganizeService',
  'FolderMatchingService',
  'EmbeddingCache',
  'OrganizationSuggestionService',
  'ModelVerifier',
  'UndoRedoService',
  'ProcessingStateService',
  'BatchAnalysisService',
  'DownloadWatcher',
  'AnalysisHistoryService',
  'ServiceIntegration',
];

// Files to process
const files = glob.sync('src/main/**/*.ts');

let totalFixes = 0;

for (const file of files) {
  let content = fs.readFileSync(file, 'utf8');
  let modified = false;

  // Fix carriage returns first
  if (content.includes('\r')) {
    content = content.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
    modified = true;
  }

  // Fix concatenated lines (semicolon followed by const/let/var/import/require without newline)
  const origContent = content;
  content = content.replace(/;(const |let |var |import |require\()/g, ';\n$1');
  content = content.replace(/,\}( from)/g, ',\n}$1');
  if (content !== origContent) modified = true;

  // Fix require statements for default export services
  for (const svc of defaultExportServices) {
    const regex = new RegExp(
      `(const\\s+${svc}\\s*=\\s*require\\(['"][^'"]+['"]\\))(?!\\.default)`,
      'g',
    );
    const newContent = content.replace(regex, '$1.default');
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

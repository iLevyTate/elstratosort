const fs = require('fs');
const path = require('path');

// Files to convert
const filesToConvert = [
  'src/main/services/ModelVerifier.ts',
  'src/main/services/StartupManager.ts',
  'src/main/services/SettingsService.ts',
  'src/main/services/ProcessingStateService.ts',
  'src/main/services/chroma/ChromaProcessManager.ts',
  'src/main/services/chroma/ChromaCollectionManager.ts',
  'src/main/services/chroma/ChromaQueryBuilder.ts',
  'src/main/services/AnalysisHistoryService.ts',
  'src/shared/pathSanitization.ts',
];

function convertRequireToImport(content) {
  // Handle special cases first

  // Convert require('fs').promises
  content = content.replace(
    /const\s+fs\s*=\s*require\(['"]fs['"]\)\.promises;?/g,
    "import fs from 'fs/promises';",
  );

  // Convert require('child_process')
  content = content.replace(
    /const\s+\{\s*spawn,\s*spawnSync\s*\}\s*=\s*require\(['"]child_process['"]\);?/g,
    "import { spawn, spawnSync } from 'child_process';",
  );

  // Convert fs = require('fs') (sync version)
  content = content.replace(
    /const\s+fsSync\s*=\s*require\(['"]fs['"]\);?/g,
    "import fsSync from 'fs';",
  );

  // Convert const { x, y } = require('...')
  content = content.replace(
    /const\s+\{\s*([^}]+)\s*\}\s*=\s*require\(['"]([^'"]+)['"]\);?/g,
    (match, imports, module) => {
      return `import { ${imports.trim()} } from '${module}.js';`;
    },
  );

  // Convert const x = require('...') for local modules
  content = content.replace(
    /const\s+(\w+)\s*=\s*require\(['"](\.\.?\/[^'"]+)['"]\);?/g,
    (match, varName, module) => {
      return `import ${varName} from '${module}.js';`;
    },
  );

  // Convert const x = require('...') for node_modules (no .js extension)
  content = content.replace(
    /const\s+(\w+)\s*=\s*require\(['"]([^./'][^'"]+)['"]\);?/g,
    (match, varName, module) => {
      return `import ${varName} from '${module}';`;
    },
  );

  return content;
}

function convertModuleExports(content) {
  // Convert module.exports = { ... } (multi-line)
  content = content.replace(
    /module\.exports\s*=\s*\{\s*\n([^}]*)\n\s*\};?/g,
    (match, exports) => {
      const items = exports
        .split(',')
        .map((item) => item.trim())
        .filter(Boolean);
      if (items.length === 0) return 'export {};';
      return `export { ${items.join(', ')} };`;
    },
  );

  // Convert module.exports = { ... } (single-line)
  content = content.replace(
    /module\.exports\s*=\s*\{([^}]+)\};?/g,
    (match, exports) => {
      const items = exports
        .split(',')
        .map((item) => item.trim())
        .filter(Boolean);
      return `export { ${items.join(', ')} };`;
    },
  );

  // Convert module.exports = ClassName
  content = content.replace(
    /module\.exports\s*=\s*(\w+);?$/gm,
    (match, className) => {
      return `export default ${className};`;
    },
  );

  // Convert module.exports.funcName = ...
  content = content.replace(
    /module\.exports\.(\w+)\s*=\s*/g,
    'export const $1 = ',
  );

  return content;
}

async function convertFile(filePath) {
  try {
    console.log(`Converting ${filePath}...`);

    const fullPath = path.join(__dirname, filePath);
    let content = fs.readFileSync(fullPath, 'utf8');

    // Apply conversions
    content = convertRequireToImport(content);
    content = convertModuleExports(content);

    // Write back
    fs.writeFileSync(fullPath, content, 'utf8');

    console.log(`✓ Converted ${filePath}`);
  } catch (error) {
    console.error(`✗ Error converting ${filePath}:`, error.message);
  }
}

async function main() {
  console.log('Converting CommonJS to ES modules...\n');

  for (const file of filesToConvert) {
    await convertFile(file);
  }

  console.log('\n✓ Conversion complete!');
}

main().catch(console.error);

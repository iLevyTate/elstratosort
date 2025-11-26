const fs = require('fs');
const path = require('path');

const filesToFix = [
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

function fixBrokenImports(content) {
  // Fix fs.js.promises -> fs/promises
  content = content.replace(
    /import\s+fs\s+from\s+'fs\.js';\.promises;/g,
    "import fs from 'fs/promises';",
  );

  // Fix path.js -> path
  content = content.replace(
    /import\s+path\s+from\s+'path\.js';/g,
    "import path from 'path';",
  );

  // Fix electron.js -> electron
  content = content.replace(
    /import\s+\{([^}]+)\}\s+from\s+'electron\.js';/g,
    "import { $1 } from 'electron';",
  );

  // Fix crypto.js -> crypto
  content = content.replace(
    /import\s+crypto\s+from\s+'crypto\.js';/g,
    "import crypto from 'crypto';",
  );

  // Fix os.js -> os
  content = content.replace(
    /import\s+os\s+from\s+'os\.js';/g,
    "import os from 'os';",
  );

  // Fix child_process.js -> child_process
  content = content.replace(
    /import\s+\{([^}]+)\}\s+from\s+'child_process\.js';/g,
    "import { $1 } from 'child_process';",
  );

  // Fix other node builtins (add .js incorrectly added)
  const builtins = ['axios', 'chokidar', 'ollama', 'async-mutex'];
  builtins.forEach((builtin) => {
    const regex = new RegExp(
      `import\\s+([\\w{}\\s,]+)\\s+from\\s+'${builtin}\\.js';`,
      'g',
    );
    content = content.replace(regex, `import $1 from '${builtin}';`);
  });

  // Split multiple imports on one line
  const multiImportRegex = /^(import .*?;)(import .*)/gm;
  while (multiImportRegex.test(content)) {
    content = content.replace(multiImportRegex, '$1\n$2');
  }

  return content;
}

function fixFile(filePath) {
  try {
    console.log(`Fixing ${filePath}...`);

    const fullPath = path.join(__dirname, filePath);
    let content = fs.readFileSync(fullPath, 'utf8');

    content = fixBrokenImports(content);

    fs.writeFileSync(fullPath, content, 'utf8');

    console.log(`✓ Fixed ${filePath}`);
  } catch (error) {
    console.error(`✗ Error fixing ${filePath}:`, error.message);
  }
}

function main() {
  console.log('Fixing broken imports...\n');

  for (const file of filesToFix) {
    fixFile(file);
  }

  console.log('\n✓ Fix complete!');
}

main();

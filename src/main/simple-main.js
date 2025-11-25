/**
 * Simple Main Entry Point
 * This JS wrapper loads ts-node and runs the TypeScript main file
 */

// Register ts-node for TypeScript support in main process
require('ts-node').register({
  transpileOnly: true,
  compilerOptions: {
    module: 'commonjs',
    target: 'es2020',
    esModuleInterop: true,
    allowSyntheticDefaultImports: true,
    strict: false,
    skipLibCheck: true,
  },
});

// Load the TypeScript main file
require('./simple-main.ts');

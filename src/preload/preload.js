/**
 * Preload Script Entry Point
 * This JS wrapper loads ts-node and runs the TypeScript preload file
 */

// Register ts-node for TypeScript support
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

// Load the TypeScript preload file
require('./preload.ts');

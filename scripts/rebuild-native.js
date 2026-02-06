// scripts/rebuild-native.js

const { rebuild } = require('@electron/rebuild');
const path = require('path');

async function rebuildNativeModules() {
  const electronVersion = require('electron/package.json').version;

  console.log(`Rebuilding native modules for Electron ${electronVersion}...`);

  await rebuild({
    buildPath: path.resolve(__dirname, '..'),
    electronVersion,
    arch: process.arch,
    // Force rebuild specific modules
    onlyModules: ['node-llama-cpp', 'sharp', 'better-sqlite3'],
    // Use prebuilds if available
    useElectronClang: true
  });

  console.log('Native module rebuild complete!');
}

rebuildNativeModules().catch(console.error);

const { spawnSync } = require('child_process');

function parseBool(value) {
  return String(value).toLowerCase() === 'true';
}

function main(
  { env = process.env, platform = process.platform, spawnSyncImpl = spawnSync, log = console } = {
    env: process.env,
    platform: process.platform,
    spawnSyncImpl: spawnSync,
    log: console
  }
) {
  const isCI = parseBool(env.CI);
  const skipAppDeps = parseBool(env.SKIP_APP_DEPS);

  // Rebuild native modules (including node-llama-cpp and sharp)
  if (!isCI && !skipAppDeps) {
    log.log('[postinstall] Rebuilding native modules for Electron...');
    const result = spawnSyncImpl('npx', ['--no', 'electron-builder', 'install-app-deps'], {
      stdio: 'inherit',
      shell: platform === 'win32'
    });

    if (result.status !== 0) {
      log.warn('[postinstall] Native module rebuild had issues (non-fatal)');
    } else {
      log.log('[postinstall] Native modules ready');
    }
  }

  // Run remaining setup scripts (best-effort)
  // In-process AI stack (node-llama-cpp + Orama) requires no external runtime setup.
  // Only model bootstrap remains (GGUF downloads/registry initialization).
  const setupScripts = ['scripts/setup-models.js'];
  for (const script of setupScripts) {
    try {
      // Use node to run the script
      const result = spawnSyncImpl(process.execPath, [script], {
        stdio: 'inherit',
        env: { ...env, FORCE_COLOR: '1' }
      });
      if (result.status !== 0) {
        log.warn(`[postinstall] ${script} failed (non-fatal)`);
      }
    } catch (e) {
      log.warn(`[postinstall] Failed to run ${script}: ${e.message}`);
    }
  }

  log.log('\n[StratoSort] Setup complete!');
  log.log('  Run: npm run dev');
  log.log('  The app will use local AI engine (node-llama-cpp + Orama).\n');

  return 0;
}

if (require.main === module) {
  process.exit(main());
}

module.exports = { main };

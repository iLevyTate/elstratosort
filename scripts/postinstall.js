/* eslint-disable no-console */
const { spawnSync } = require('child_process');

function run(cmd, args, opts = {}, { spawnSyncImpl = spawnSync } = {}) {
  const result = spawnSyncImpl(cmd, args, {
    stdio: 'inherit',
    shell: process.platform === 'win32',
    ...opts
  });
  return {
    status: result?.status ?? null,
    error: result?.error ?? null
  };
}

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

  // Postinstall should be best-effort: do not block installs when optional dependencies
  // (Ollama, ChromaDB) are not available yet. The app can guide users via the dependency wizard.
  const runSafe = (cmd, args, opts) => {
    const result = run(cmd, args, opts, { spawnSyncImpl });
    if (result.status !== 0) {
      log.warn?.(`[postinstall] Command failed (ignored): ${cmd} ${args.join(' ')}`, {
        status: result.status,
        error: result.error?.message
      });
    }
    return result;
  };

  // Best practice:
  // - Keep package install scripts enabled so native deps (e.g. sharp) install correctly.
  // - Skip electron-builder's install-app-deps during CI runs (not packaging, saves time).
  if (!isCI && !skipAppDeps) {
    runSafe('npx', ['--no', 'electron-builder', 'install-app-deps'], {
      shell: platform === 'win32'
    });
  }

  // Keep these best-effort; they already support --ci-skip to avoid doing heavy work on CI.
  runSafe('node', ['scripts/setup-ollama.js', '--auto', '--ci-skip'], {
    shell: platform === 'win32'
  });
  runSafe('node', ['scripts/setup-chromadb.js', '--auto', '--ci-skip'], {
    shell: platform === 'win32'
  });

  return 0;
}

if (require.main === module) {
  // eslint-disable-next-line no-process-exit
  process.exit(main());
}

module.exports = { main };

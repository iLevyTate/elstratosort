/* eslint-disable no-console */
const { spawnSync } = require('child_process');

function run(cmd, args, opts = {}) {
  const result = spawnSync(cmd, args, {
    stdio: 'inherit',
    shell: process.platform === 'win32',
    ...opts
  });
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

const isCI = String(process.env.CI).toLowerCase() === 'true';
const skipAppDeps = String(process.env.SKIP_APP_DEPS).toLowerCase() === 'true';

// Best practice:
// - Keep package install scripts enabled so native deps (e.g. sharp) install correctly.
// - Skip electron-builder's install-app-deps during CI runs (not packaging, saves time).
if (!isCI && !skipAppDeps) {
  run('npx', ['--no', 'electron-builder', 'install-app-deps']);
}

// Keep these best-effort; they already support --ci-skip to avoid doing heavy work on CI.
run('node', ['scripts/setup-ollama.js', '--auto', '--ci-skip']);
run('node', ['scripts/setup-chromadb.js', '--auto', '--ci-skip']);

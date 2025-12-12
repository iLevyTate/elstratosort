#!/usr/bin/env node
'use strict';

/**
 * Developer helper: ensure ChromaDB (Python module) is installed.
 *
 * Goals:
 * - Best-effort in postinstall (should not fail npm install)
 * - Non-interactive and cross-platform
 *
 * Usage:
 * - node scripts/setup-chromadb.js --auto --ci-skip
 * - node scripts/setup-chromadb.js --check
 */

const { asyncSpawn } = require('../src/main/utils/asyncSpawnUtils');
const http = require('http');
const https = require('https');

// Simple color output without external dependencies
const colors = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m',
  gray: '\x1b[90m'
};

const chalk = {
  red: (text) => `${colors.red}${text}${colors.reset}`,
  green: (text) => `${colors.green}${text}${colors.reset}`,
  yellow: (text) => `${colors.yellow}${text}${colors.reset}`,
  cyan: (text) => `${colors.cyan}${text}${colors.reset}`,
  gray: (text) => `${colors.gray}${text}${colors.reset}`,
  bold: {
    green: (text) => `${colors.bold}${colors.green}${text}${colors.reset}`,
    cyan: (text) => `${colors.bold}${colors.cyan}${text}${colors.reset}`,
    red: (text) => `${colors.bold}${colors.red}${text}${colors.reset}`
  }
};

function parseArgs(argv) {
  const args = new Set(argv.slice(2));
  return {
    auto: args.has('--auto'),
    check: args.has('--check'),
    ciSkip: args.has('--ci-skip')
  };
}

async function tryCmd(cmd, args, timeout = 5000) {
  const res = await asyncSpawn(cmd, args, {
    timeout,
    windowsHide: true,
    shell: process.platform === 'win32'
  });
  return res;
}

async function findPythonLauncher() {
  const candidates =
    process.platform === 'win32'
      ? [
          { command: 'py', args: ['-3'] },
          { command: 'python3', args: [] },
          { command: 'python', args: [] }
        ]
      : [
          { command: 'python3', args: [] },
          { command: 'python', args: [] }
        ];

  for (const c of candidates) {
    const res = await tryCmd(c.command, [...c.args, '--version'], 3000);
    if (res.status === 0) return c;
  }
  return null;
}

async function isChromaInstalled(python) {
  const res = await tryCmd(
    python.command,
    [
      ...python.args,
      '-c',
      "import chromadb; import sys; sys.stdout.write(getattr(chromadb,'__version__','unknown'))"
    ],
    5000
  );
  if (res.status === 0) {
    return { installed: true, version: (res.stdout || '').trim() || 'unknown' };
  }
  return { installed: false, version: null };
}

async function pipInstallChroma(python, { upgradePip = true, userInstall = true } = {}) {
  if (upgradePip) {
    await tryCmd(
      python.command,
      [...python.args, '-m', 'pip', 'install', '--upgrade', 'pip'],
      5 * 60 * 1000
    )
      .then(() => {})
      .catch(() => {});
  }

  const args = [
    ...python.args,
    '-m',
    'pip',
    'install',
    ...(userInstall ? ['--user'] : []),
    'chromadb'
  ];
  const res = await tryCmd(python.command, args, 10 * 60 * 1000);
  return res.status === 0;
}

async function checkExternalChroma(url) {
  let baseUrl;
  try {
    baseUrl = new URL(url);
  } catch {
    return false;
  }
  const client = baseUrl.protocol === 'https:' ? https : http;
  const endpoints = ['/api/v2/heartbeat', '/api/v1/heartbeat', '/api/v1'];

  for (const endpoint of endpoints) {
    // eslint-disable-next-line no-await-in-loop
    const ok = await new Promise((resolve) => {
      const req = client.get(new URL(endpoint, baseUrl), (res) => {
        res.resume();
        resolve(res.statusCode === 200);
      });
      req.on('error', () => resolve(false));
      req.setTimeout(1500, () => {
        try {
          req.destroy();
        } catch {
          // ignore
        }
        resolve(false);
      });
    });
    if (ok) return true;
  }
  return false;
}

async function main() {
  const { auto, check, ciSkip } = parseArgs(process.argv);

  if (ciSkip && process.env.CI) {
    console.log(chalk.gray('[chromadb] CI detected, skipping'));
    process.exit(0);
  }

  console.log(chalk.bold.cyan('\nChromaDB Setup (Developer)'));

  // If an external ChromaDB is configured (e.g. Docker), just verify reachability.
  if (process.env.CHROMA_SERVER_URL) {
    const reachable = await checkExternalChroma(process.env.CHROMA_SERVER_URL);
    if (reachable) {
      console.log(chalk.green(`✓ External ChromaDB reachable — ${process.env.CHROMA_SERVER_URL}`));
      process.exit(0);
    }

    console.log(
      chalk.yellow(`⚠ External ChromaDB not reachable — ${process.env.CHROMA_SERVER_URL}`)
    );
    // In check mode we should signal failure; in auto mode we keep best-effort behavior.
    process.exit(check && !auto ? 1 : 0);
  }

  const python = await findPythonLauncher();
  if (!python) {
    const msg =
      'Python 3 not found. ChromaDB features will be unavailable.\n' +
      'Install Python 3 and ensure `py -3` (Windows) or `python3` is available on PATH.';
    console.log(chalk.yellow(`[chromadb] ${msg}`));
    // Best-effort: do not fail npm install
    process.exit(check && !auto ? 1 : 0);
  }

  const pre = await isChromaInstalled(python);
  if (pre.installed) {
    console.log(chalk.green(`✓ ChromaDB installed (python module) — version: ${pre.version}`));
    process.exit(0);
  }

  if (check && !auto) {
    console.log(chalk.red('✗ ChromaDB is not installed'));
    process.exit(1);
  }

  if (!auto) {
    console.log(
      chalk.yellow(
        '[chromadb] Not installed. Run `node scripts/setup-chromadb.js --auto` (or `npm run setup:chromadb`).'
      )
    );
    process.exit(0);
  }

  console.log(chalk.cyan('[chromadb] Installing via pip (user install)…'));
  const ok = await pipInstallChroma(python, { upgradePip: true, userInstall: true });
  if (!ok) {
    console.log(
      chalk.yellow(
        '[chromadb] pip install failed. You may need to install Python/pip or run with elevated permissions.'
      )
    );
    process.exit(0);
  }

  const post = await isChromaInstalled(python);
  if (post.installed) {
    console.log(chalk.bold.green(`✓ ChromaDB installed — version: ${post.version}`));
    process.exit(0);
  }

  console.log(
    chalk.yellow(
      '[chromadb] Install completed but import still failed. Try restarting your shell or verify your Python environment.'
    )
  );
  process.exit(0);
}

main().catch((err) => {
  console.error(chalk.red(`[chromadb] Unexpected error: ${err?.message || err}`));
  // Best-effort: don't fail developer install
  process.exit(0);
});

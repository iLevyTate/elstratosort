/**
 * setup-chromadb.js tests
 *
 * Focus on exit-code semantics and key branches used by postinstall / Windows flow.
 */

const { main } = require('../scripts/setup-chromadb');

describe('scripts/setup-chromadb.js', () => {
  test('CI skip: returns 0 when --ci-skip and CI=true', async () => {
    const code = await main({
      argv: ['node', 'setup-chromadb.js', '--ci-skip'],
      env: { CI: 'true' },
      deps: {
        checkExternalChroma: jest.fn(),
        findPythonLauncher: jest.fn(),
        isChromaInstalled: jest.fn(),
        pipInstallChroma: jest.fn()
      },
      log: { log: jest.fn() }
    });

    expect(code).toBe(0);
  });

  test('external server: returns 0 when reachable', async () => {
    const code = await main({
      argv: ['node', 'setup-chromadb.js', '--check'],
      env: { CHROMA_SERVER_URL: 'http://example:8000' },
      deps: {
        checkExternalChroma: jest.fn().mockResolvedValue(true),
        findPythonLauncher: jest.fn(),
        isChromaInstalled: jest.fn(),
        pipInstallChroma: jest.fn()
      },
      log: { log: jest.fn() }
    });

    expect(code).toBe(0);
  });

  test('external server: returns 1 in check mode when unreachable', async () => {
    const code = await main({
      argv: ['node', 'setup-chromadb.js', '--check'],
      env: { CHROMA_SERVER_URL: 'http://example:8000' },
      deps: {
        checkExternalChroma: jest.fn().mockResolvedValue(false),
        findPythonLauncher: jest.fn(),
        isChromaInstalled: jest.fn(),
        pipInstallChroma: jest.fn()
      },
      log: { log: jest.fn() }
    });

    expect(code).toBe(1);
  });

  test('missing python: returns 1 in check mode (no auto)', async () => {
    const code = await main({
      argv: ['node', 'setup-chromadb.js', '--check'],
      env: {},
      deps: {
        checkExternalChroma: jest.fn(),
        findPythonLauncher: jest.fn().mockResolvedValue(null),
        isChromaInstalled: jest.fn(),
        pipInstallChroma: jest.fn()
      },
      log: { log: jest.fn() }
    });

    expect(code).toBe(1);
  });

  test('missing python: returns 0 in auto mode (best-effort)', async () => {
    const code = await main({
      argv: ['node', 'setup-chromadb.js', '--auto'],
      env: {},
      deps: {
        checkExternalChroma: jest.fn(),
        findPythonLauncher: jest.fn().mockResolvedValue(null),
        isChromaInstalled: jest.fn(),
        pipInstallChroma: jest.fn()
      },
      log: { log: jest.fn() }
    });

    expect(code).toBe(0);
  });

  test('module missing: returns 1 in check mode (no auto)', async () => {
    const code = await main({
      argv: ['node', 'setup-chromadb.js', '--check'],
      env: {},
      deps: {
        checkExternalChroma: jest.fn(),
        findPythonLauncher: jest.fn().mockResolvedValue({ command: 'py', args: ['-3'] }),
        isChromaInstalled: jest.fn().mockResolvedValue({ installed: false, version: null }),
        pipInstallChroma: jest.fn()
      },
      log: { log: jest.fn() }
    });

    expect(code).toBe(1);
  });

  test('auto install: pip failure still returns 0 (best-effort)', async () => {
    const code = await main({
      argv: ['node', 'setup-chromadb.js', '--auto'],
      env: {},
      deps: {
        checkExternalChroma: jest.fn(),
        findPythonLauncher: jest.fn().mockResolvedValue({ command: 'py', args: ['-3'] }),
        isChromaInstalled: jest
          .fn()
          .mockResolvedValueOnce({ installed: false, version: null })
          .mockResolvedValueOnce({ installed: false, version: null }),
        pipInstallChroma: jest.fn().mockResolvedValue(false)
      },
      log: { log: jest.fn() }
    });

    expect(code).toBe(0);
  });
});

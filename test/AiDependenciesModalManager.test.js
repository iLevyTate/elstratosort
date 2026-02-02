/**
 * AiDependenciesModalManager tests
 *
 * Verifies:
 * - first-run prompt when deps missing
 * - periodic prompt on cadence
 * - no prompt when within interval
 * - close marks wizard as shown
 */
import React from 'react';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

import uiReducer from '../src/renderer/store/slices/uiSlice';

jest.mock('../src/shared/logger', () => {
  const logger = {
    setContext: jest.fn(),
    info: jest.fn(),
    debug: jest.fn(),
    warn: jest.fn(),
    error: jest.fn()
  };
  return { logger, createLogger: jest.fn(() => logger) };
});

// Render a minimal testable modal
jest.mock('../src/renderer/components/AiDependenciesModal', () => {
  return function MockAiDependenciesModal({ isOpen, onClose }) {
    if (!isOpen) return null;
    return (
      <div data-testid="ai-deps-modal">
        <button data-testid="close-ai-deps" onClick={onClose}>
          Close
        </button>
      </div>
    );
  };
});

import AiDependenciesModalManager from '../src/renderer/components/AiDependenciesModalManager';

function makeStore() {
  return configureStore({
    reducer: { ui: uiReducer }
  });
}

describe('AiDependenciesModalManager', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Ensure electronAPI exists for manager
    window.electronAPI = window.electronAPI || {};
    window.electronAPI.dependencies = {
      getStatus: jest.fn()
    };
    window.electronAPI.settings = {
      get: jest.fn(),
      save: jest.fn().mockResolvedValue({ success: true })
    };
  });

  test('first run: opens modal when dependencies are missing and records lastPromptAt', async () => {
    const store = makeStore();

    window.electronAPI.settings.get.mockResolvedValue({
      dependencyWizardShown: false,
      dependencyWizardPromptIntervalDays: 7,
      dependencyWizardLastPromptAt: null
    });

    window.electronAPI.dependencies.getStatus.mockResolvedValue({
      status: {
        python: { installed: false },
        ollama: { installed: false },
        chromadb: { pythonModuleInstalled: false }
      }
    });

    render(
      <Provider store={store}>
        <AiDependenciesModalManager />
      </Provider>
    );

    await waitFor(() => {
      expect(screen.getByTestId('ai-deps-modal')).toBeDefined();
    });

    expect(window.electronAPI.settings.save).toHaveBeenCalled();
    const saved = window.electronAPI.settings.save.mock.calls[0][0];
    expect(saved.dependencyWizardLastPromptAt).toBeTruthy();
  });

  test('does not open modal when within interval', async () => {
    const store = makeStore();

    const now = Date.now();
    window.electronAPI.settings.get.mockResolvedValue({
      dependencyWizardShown: true,
      dependencyWizardPromptIntervalDays: 7,
      dependencyWizardLastPromptAt: new Date(now - 2 * 24 * 60 * 60 * 1000).toISOString()
    });

    window.electronAPI.dependencies.getStatus.mockResolvedValue({
      status: {
        python: { installed: false },
        ollama: { installed: false },
        chromadb: { pythonModuleInstalled: false }
      }
    });

    render(
      <Provider store={store}>
        <AiDependenciesModalManager />
      </Provider>
    );

    // give effect a tick
    await new Promise((r) => setTimeout(r, 0));

    expect(screen.queryByTestId('ai-deps-modal')).toBeNull();
  });

  test('periodic: opens modal when interval has elapsed', async () => {
    const store = makeStore();
    const now = 1_800_000_000_000;
    jest.spyOn(Date, 'now').mockReturnValue(now);

    window.electronAPI.settings.get.mockResolvedValue({
      dependencyWizardShown: true,
      dependencyWizardPromptIntervalDays: 7,
      dependencyWizardLastPromptAt: new Date(now - 8 * 24 * 60 * 60 * 1000).toISOString()
    });

    window.electronAPI.dependencies.getStatus.mockResolvedValue({
      status: {
        python: { installed: false },
        ollama: { installed: false },
        chromadb: { pythonModuleInstalled: false }
      }
    });

    render(
      <Provider store={store}>
        <AiDependenciesModalManager />
      </Provider>
    );

    await waitFor(() => {
      expect(screen.getByTestId('ai-deps-modal')).toBeDefined();
    });

    // clean up Date.now mock
    Date.now.mockRestore();
  });

  test('close marks wizard as shown when it was first-run', async () => {
    const store = makeStore();

    window.electronAPI.settings.get
      .mockResolvedValueOnce({
        dependencyWizardShown: false,
        dependencyWizardPromptIntervalDays: 7,
        dependencyWizardLastPromptAt: null
      })
      .mockResolvedValueOnce({
        dependencyWizardShown: false,
        dependencyWizardPromptIntervalDays: 7,
        dependencyWizardLastPromptAt: null
      });

    window.electronAPI.dependencies.getStatus.mockResolvedValue({
      status: {
        python: { installed: false },
        ollama: { installed: false },
        chromadb: { pythonModuleInstalled: false }
      }
    });

    render(
      <Provider store={store}>
        <AiDependenciesModalManager />
      </Provider>
    );

    await waitFor(() => {
      expect(screen.getByTestId('ai-deps-modal')).toBeDefined();
    });

    fireEvent.click(screen.getByTestId('close-ai-deps'));

    await waitFor(() => {
      // last save call should include dependencyWizardShown true
      const calls = window.electronAPI.settings.save.mock.calls;
      const lastSaved = calls[calls.length - 1][0];
      expect(lastSaved.dependencyWizardShown).toBe(true);
    });
  });
});

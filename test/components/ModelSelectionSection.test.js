/**
 * @jest-environment jsdom
 */
import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';

jest.mock('../../src/renderer/components/ui/Select', () => ({
  __esModule: true,
  default: ({ children, ...props }) => <select {...props}>{children}</select>
}));
jest.mock('../../src/renderer/components/settings/SettingRow', () => ({
  __esModule: true,
  default: ({ children }) => <div>{children}</div>
}));
jest.mock('../../src/renderer/components/settings/SettingsCard', () => ({
  __esModule: true,
  default: ({ children }) => <div>{children}</div>
}));
jest.mock('../../src/renderer/components/ui/Modal', () => ({
  __esModule: true,
  default: ({ isOpen, children }) => (isOpen ? <div>{children}</div> : null)
}));
jest.mock('../../src/renderer/components/ui/Button', () => ({
  __esModule: true,
  default: ({ children, ...props }) => <button {...props}>{children}</button>
}));
jest.mock('../../src/renderer/components/ui/StatusBadge', () => ({
  __esModule: true,
  default: ({ children }) => <div>{children}</div>
}));
jest.mock('../../src/renderer/components/ui/StateMessage', () => ({
  __esModule: true,
  default: ({ title }) => <div>{title}</div>
}));
jest.mock('../../src/renderer/components/ui/Typography', () => ({
  Text: ({ children }) => <span>{children}</span>
}));
jest.mock('../../src/shared/logger', () => ({
  logger: { error: jest.fn() }
}));
jest.mock('../../src/shared/modelRegistry', () => ({
  getModel: jest.fn(() => ({ dimensions: 768 }))
}));

import ModelSelectionSection from '../../src/renderer/components/settings/ModelSelectionSection';

describe('ModelSelectionSection', () => {
  afterEach(() => {
    delete window.electronAPI;
  });

  test('does not commit embedding model when rebuild fails', async () => {
    const setSettings = jest.fn();
    window.electronAPI = {
      embeddings: {
        getStats: jest.fn().mockResolvedValue({ totalDocuments: 10 }),
        fullRebuild: jest.fn().mockRejectedValue(new Error('rebuild failed'))
      }
    };

    render(
      <ModelSelectionSection
        settings={{ textModel: 't.gguf', visionModel: 'v.gguf', embeddingModel: 'old.gguf' }}
        setSettings={setSettings}
        textModelOptions={['t.gguf']}
        visionModelOptions={['v.gguf']}
        embeddingModelOptions={['old.gguf', 'new.gguf']}
      />
    );

    const embeddingSelect = screen.getAllByRole('combobox')[2];
    fireEvent.change(embeddingSelect, { target: { value: 'new.gguf' } });
    fireEvent.click(screen.getByRole('button', { name: /change & rebuild now/i }));

    await waitFor(() => {
      expect(window.electronAPI.embeddings.fullRebuild).toHaveBeenCalled();
    });
    expect(window.electronAPI.embeddings.fullRebuild).toHaveBeenCalledWith({
      modelOverride: 'new.gguf'
    });
    expect(setSettings).not.toHaveBeenCalledWith(expect.any(Function));
  });

  test('does not commit embedding model when rebuild returns structured failure', async () => {
    const setSettings = jest.fn();
    window.electronAPI = {
      embeddings: {
        getStats: jest.fn().mockResolvedValue({ totalDocuments: 10 }),
        fullRebuild: jest.fn().mockResolvedValue({
          success: false,
          error: 'Model unavailable'
        })
      }
    };

    render(
      <ModelSelectionSection
        settings={{ textModel: 't.gguf', visionModel: 'v.gguf', embeddingModel: 'old.gguf' }}
        setSettings={setSettings}
        textModelOptions={['t.gguf']}
        visionModelOptions={['v.gguf']}
        embeddingModelOptions={['old.gguf', 'new.gguf']}
      />
    );

    const embeddingSelect = screen.getAllByRole('combobox')[2];
    fireEvent.change(embeddingSelect, { target: { value: 'new.gguf' } });
    fireEvent.click(screen.getByRole('button', { name: /change & rebuild now/i }));

    await waitFor(() => {
      expect(window.electronAPI.embeddings.fullRebuild).toHaveBeenCalledWith({
        modelOverride: 'new.gguf'
      });
    });
    expect(setSettings).not.toHaveBeenCalledWith(expect.any(Function));
  });

  test('does not commit embedding model when rebuild response lacks success=true', async () => {
    const setSettings = jest.fn();
    window.electronAPI = {
      embeddings: {
        getStats: jest.fn().mockResolvedValue({ totalDocuments: 10 }),
        fullRebuild: jest.fn().mockResolvedValue({ model: 'new.gguf' })
      }
    };

    render(
      <ModelSelectionSection
        settings={{ textModel: 't.gguf', visionModel: 'v.gguf', embeddingModel: 'old.gguf' }}
        setSettings={setSettings}
        textModelOptions={['t.gguf']}
        visionModelOptions={['v.gguf']}
        embeddingModelOptions={['old.gguf', 'new.gguf']}
      />
    );

    const embeddingSelect = screen.getAllByRole('combobox')[2];
    fireEvent.change(embeddingSelect, { target: { value: 'new.gguf' } });
    fireEvent.click(screen.getByRole('button', { name: /change & rebuild now/i }));

    await waitFor(() => {
      expect(window.electronAPI.embeddings.fullRebuild).toHaveBeenCalledWith({
        modelOverride: 'new.gguf'
      });
    });
    expect(setSettings).not.toHaveBeenCalledWith(expect.any(Function));
  });
});

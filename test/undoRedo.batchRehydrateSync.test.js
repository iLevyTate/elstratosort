/**
 * @jest-environment jsdom
 */
import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react';

const mockDispatch = jest.fn();
const mockShowSuccess = jest.fn();
const mockShowError = jest.fn();
const mockShowInfo = jest.fn();

jest.mock('react-redux', () => ({
  useDispatch: () => mockDispatch
}));

jest.mock('../src/renderer/contexts/NotificationContext', () => ({
  useNotification: () => ({
    showSuccess: mockShowSuccess,
    showError: mockShowError,
    showInfo: mockShowInfo
  })
}));

jest.mock('../src/renderer/components/ui/Modal', () => {
  const Modal = ({ children }) => <div>{children}</div>;
  const ConfirmModal = () => null;
  return {
    __esModule: true,
    default: Modal,
    ConfirmModal
  };
});

jest.mock('../src/renderer/components/ui/Button', () => ({
  __esModule: true,
  default: ({ children, ...props }) => <button {...props}>{children}</button>
}));

jest.mock('../src/renderer/components/ui/StateMessage', () => ({
  __esModule: true,
  default: () => null
}));

jest.mock('../src/renderer/components/ui/Typography', () => ({
  Text: ({ children }) => <span>{children}</span>
}));

import {
  UndoRedoProvider,
  createOrganizeBatchAction,
  useUndoRedo
} from '../src/renderer/components/UndoRedoSystem';

function UndoProbe() {
  const { undo, executeAction, currentIndex } = useUndoRedo();
  return (
    <>
      <button
        onClick={() =>
          executeAction({
            type: 'CUSTOM_ACTION',
            description: 'Custom action',
            execute: async () => ({ success: true }),
            undo: async () => ({ success: false, message: 'Main undo failed' }),
            redo: async () => ({ success: true })
          })
        }
      >
        add-action
      </button>
      <button onClick={undo}>trigger-undo</button>
      <div data-testid="current-index">{String(currentIndex)}</div>
    </>
  );
}

describe('UndoRedo batch rehydrated sync', () => {
  beforeEach(() => {
    mockDispatch.mockClear();
    mockShowSuccess.mockClear();
    mockShowError.mockClear();
    mockShowInfo.mockClear();
    localStorage.clear();
    window.electronAPI = {
      undoRedo: {
        getState: jest
          .fn()
          .mockResolvedValue({ stack: [], pointer: -1, canUndo: false, canRedo: false }),
        onStateChanged: jest.fn(() => () => {}),
        undo: jest.fn().mockResolvedValue({
          results: [{ success: true, source: '/old.txt', destination: '/new.txt' }]
        }),
        redo: jest.fn().mockResolvedValue({
          results: [{ success: true, source: '/old.txt', destination: '/new.txt' }]
        })
      },
      files: {
        performOperation: jest.fn().mockResolvedValue({ success: true })
      }
    };
  });

  test('applies global path sync for batch undo/redo without local callbacks', async () => {
    render(
      <UndoRedoProvider>
        <div>child</div>
      </UndoRedoProvider>
    );

    const action = createOrganizeBatchAction('Organize files', [
      { source: '/old.txt', destination: '/new.txt' }
    ]);

    await action.undo();
    await action.redo();

    expect(mockDispatch).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'analysis/updateResultPathsAfterMove' })
    );
    expect(mockDispatch).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'files/updateFilePathsAfterMove' })
    );
    expect(mockDispatch).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'files/removeOrganizedFiles' })
    );
  });

  test('clamps invalid pointer when rehydration drops entries', async () => {
    window.electronAPI.undoRedo.getState.mockResolvedValueOnce({
      stack: [
        {
          id: 'bad-batch-1',
          type: 'BATCH_OPERATION',
          description: 'Broken serialized batch',
          timestamp: new Date().toISOString(),
          metadata: { operationCount: 1 }
        }
      ],
      pointer: 0,
      canUndo: true,
      canRedo: false
    });

    const { getByText } = render(
      <UndoRedoProvider>
        <UndoProbe />
      </UndoRedoProvider>
    );

    fireEvent.click(getByText('trigger-undo'));
    await waitFor(() => {
      expect(window.electronAPI.undoRedo.undo).not.toHaveBeenCalled();
    });
  });

  test('reverts local pointer when main undo returns success false', async () => {
    window.electronAPI.undoRedo.getState = undefined;
    window.electronAPI.undoRedo.onStateChanged = undefined;
    const onDone = jest.fn();

    function UndoFailureScenario() {
      const { executeAction, undo, getCurrentIndex } = useUndoRedo();
      React.useEffect(() => {
        let active = true;
        const run = async () => {
          await executeAction({
            type: 'CUSTOM_ACTION',
            description: 'Custom action',
            execute: async () => ({ success: true }),
            undo: async () => ({ success: false, message: 'Main undo failed' }),
            redo: async () => ({ success: true })
          });
          const afterExecute = getCurrentIndex();
          await undo();
          const afterUndo = getCurrentIndex();
          if (active) {
            onDone({ afterExecute, afterUndo });
          }
        };
        run();
        return () => {
          active = false;
        };
      }, [executeAction, undo, getCurrentIndex]);
      return null;
    }

    render(
      <UndoRedoProvider>
        <UndoFailureScenario />
      </UndoRedoProvider>
    );

    await waitFor(() => {
      expect(onDone).toHaveBeenCalledWith({ afterExecute: 0, afterUndo: 0 });
      expect(mockShowError).toHaveBeenCalled();
    });
  });
});

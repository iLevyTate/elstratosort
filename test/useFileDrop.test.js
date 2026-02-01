/**
 * @jest-environment jsdom
 */

import { renderHook, act } from '@testing-library/react';
import { useFileDrop } from '../src/renderer/hooks/useFileDrop';

const buildEvent = ({
  types = [],
  files = [],
  uriList = '',
  textPlain = '',
  currentTargetContains = false,
  relatedTarget = null
} = {}) => ({
  preventDefault: jest.fn(),
  stopPropagation: jest.fn(),
  dataTransfer: {
    types,
    files,
    dropEffect: '',
    getData: jest.fn((type) => {
      if (type === 'text/uri-list') return uriList;
      if (type === 'text/plain') return textPlain;
      return '';
    })
  },
  currentTarget: {
    contains: jest.fn(() => currentTargetContains)
  },
  relatedTarget
});

describe('useFileDrop', () => {
  test('toggles dragging state on drag enter/leave', () => {
    const { result } = renderHook(() => useFileDrop());

    act(() => {
      result.current.dropProps.onDragEnter(buildEvent({ types: ['Files'] }));
    });
    expect(result.current.isDragging).toBe(true);

    act(() => {
      result.current.dropProps.onDragLeave(buildEvent({ currentTargetContains: false }));
    });
    expect(result.current.isDragging).toBe(false);
  });

  test('does not clear drag state when leaving to a child element', () => {
    const { result } = renderHook(() => useFileDrop());

    act(() => {
      result.current.dropProps.onDragEnter(buildEvent({ types: ['Files'] }));
    });
    expect(result.current.isDragging).toBe(true);

    act(() => {
      result.current.dropProps.onDragLeave(
        buildEvent({ currentTargetContains: true, relatedTarget: {} })
      );
    });
    expect(result.current.isDragging).toBe(true);
  });

  test('collects unique absolute paths from files, URI list, and text', () => {
    const onFilesDropped = jest.fn();
    const { result } = renderHook(() => useFileDrop(onFilesDropped));

    const fileList = [
      { path: '/tmp/a.txt', name: 'a.txt' },
      { path: '/tmp/a.txt', name: 'a.txt' }
    ];

    const uriList = ['file:///tmp/b.txt', '#comment', 'file:///tmp/a.txt'].join('\n');
    const textPlain = ['/tmp/c.txt', 'relative.txt'].join('\n');

    act(() => {
      result.current.dropProps.onDrop(
        buildEvent({ files: fileList, uriList, textPlain, types: ['Files'] })
      );
    });

    expect(onFilesDropped).toHaveBeenCalledTimes(1);
    expect(onFilesDropped).toHaveBeenCalledWith(
      expect.arrayContaining([
        { path: '/tmp/a.txt', name: 'a.txt', type: 'file' },
        { path: '/tmp/b.txt', name: 'b.txt', type: 'file' },
        { path: '/tmp/c.txt', name: 'c.txt', type: 'file' }
      ])
    );
  });

  test('sets drop effect on drag over', () => {
    const { result } = renderHook(() => useFileDrop());
    const event = buildEvent({ types: ['Files'] });

    act(() => {
      result.current.dropProps.onDragOver(event);
    });

    expect(event.dataTransfer.dropEffect).toBe('copy');
  });
});

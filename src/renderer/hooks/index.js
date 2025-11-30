export { useConfirmDialog } from './useConfirmDialog';
export { useDragAndDrop } from './useDragAndDrop';
export { useKeyboardShortcuts } from './useKeyboardShortcuts';
export { useViewport } from './useViewport';
export { useSettingsSubscription, useSettingsSync } from './useSettingsSubscription';
// FIX: Export performance hooks for consistent imports
export {
  useDebounce,
  useDebouncedCallback,
  useThrottledCallback,
  useLRUCache,
} from './usePerformance';

/**
 * Typed Redux Hooks
 * Use these throughout the app instead of plain useDispatch/useSelector
 * for full TypeScript type safety.
 */
import { TypedUseSelectorHook, useDispatch, useSelector } from 'react-redux';
import type { RootState, AppDispatch } from './index';

/**
 * Typed useDispatch hook
 * Provides type-safe dispatch for async thunks and actions
 */
export const useAppDispatch = () => useDispatch<AppDispatch>();

/**
 * Typed useSelector hook
 * Provides autocomplete for state properties
 */
export const useAppSelector: TypedUseSelectorHook<RootState> = useSelector;

import React, { useEffect, useRef } from 'react';
import { useAppDispatch, useAppSelector } from '../store/hooks';
import { setActiveModal } from '../store/slices/uiSlice';
import AiDependenciesModal from './AiDependenciesModal';
import { createLogger } from '../../shared/logger';

const logger = createLogger('AiDependenciesModalManager');
const MODAL_ID = 'ai-deps';

function parseIsoToMs(value) {
  if (!value || typeof value !== 'string') return null;
  const ms = Date.parse(value);
  return Number.isFinite(ms) ? ms : null;
}

export default function AiDependenciesModalManager() {
  const dispatch = useAppDispatch();
  const activeModal = useAppSelector((state) => state.ui.activeModal);
  const isOpen = activeModal === MODAL_ID;

  const autoPromptAttemptedRef = useRef(false);

  useEffect(() => {
    if (autoPromptAttemptedRef.current) return;
    autoPromptAttemptedRef.current = true;

    (async () => {
      try {
        const settings = await window.electronAPI?.settings?.get?.();
        const depRes = await window.electronAPI?.dependencies?.getStatus?.();
        const status = depRes?.status;

        if (!settings || !status) return;

        const pythonOk = Boolean(status?.python?.installed);
        const ollamaOk = Boolean(status?.ollama?.installed);
        const chromaOk = Boolean(
          status?.chromadb?.external
            ? status?.chromadb?.running
            : status?.chromadb?.pythonModuleInstalled
        );

        const depsMissing = !ollamaOk || !pythonOk || !chromaOk;
        if (!depsMissing) return;

        const intervalDays = Number(settings.dependencyWizardPromptIntervalDays || 7);
        const intervalMs = Math.max(1, intervalDays) * 24 * 60 * 60 * 1000;
        const lastPromptMs = parseIsoToMs(settings.dependencyWizardLastPromptAt);
        const shouldPromptAgain =
          lastPromptMs == null ? true : Date.now() - lastPromptMs >= intervalMs;

        // First run: always show (if missing), otherwise show only after interval.
        const isFirstRunPrompt = settings.dependencyWizardShown === false;
        if (!isFirstRunPrompt && !shouldPromptAgain) return;

        // Record prompt time immediately to avoid repeated prompts if the app re-renders quickly.
        const nowIso = new Date().toISOString();
        const patch = {
          ...settings,
          dependencyWizardLastPromptAt: nowIso
        };
        await window.electronAPI?.settings?.save?.(patch);

        dispatch(setActiveModal(MODAL_ID));
      } catch (e) {
        logger.warn('Auto-prompt check failed', { error: e?.message });
      }
    })();
  }, [dispatch]);

  return (
    <AiDependenciesModal
      isOpen={isOpen}
      onClose={async () => {
        dispatch(setActiveModal(null));
        try {
          const s = await window.electronAPI?.settings?.get?.();
          if (s && s.dependencyWizardShown === false) {
            await window.electronAPI?.settings?.save?.({
              ...s,
              dependencyWizardShown: true,
              dependencyWizardLastPromptAt: new Date().toISOString()
            });
          }
        } catch {
          // ignore
        }
      }}
    />
  );
}

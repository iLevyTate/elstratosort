import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useReducer,
  useMemo,
} from 'react';
import PropTypes from 'prop-types';
import {
  PHASES,
  PHASE_TRANSITIONS,
  PHASE_METADATA,
  UI_WORKFLOW,
} from '../../shared/constants';

function phaseReducer(state, action) {
  switch (action.type) {
    case 'ADVANCE_PHASE': {
      const { targetPhase, data = {} } = action.payload;
      const allowedTransitions = PHASE_TRANSITIONS[state.currentPhase] || [];
      if (
        targetPhase !== state.currentPhase &&
        !allowedTransitions.includes(targetPhase)
      ) {
        console.warn(
          `Invalid transition from ${state.currentPhase} to ${targetPhase}`,
        );
        return state;
      }
      return {
        ...state,
        currentPhase: targetPhase,
        phaseData: { ...state.phaseData, ...data },
      };
    }
    case 'SET_PHASE_DATA':
      return {
        ...state,
        phaseData: {
          ...state.phaseData,
          [action.payload.key]: action.payload.value,
        },
      };
    case 'SET_LOADING':
      return { ...state, isLoading: action.payload.isLoading };
    case 'TOGGLE_SETTINGS':
      return { ...state, showSettings: !state.showSettings };
    case 'RESTORE_STATE':
      return {
        ...state,
        currentPhase: action.payload.currentPhase,
        phaseData: action.payload.phaseData,
      };
    case 'RESET_WORKFLOW':
      return {
        ...state,
        currentPhase: PHASES.WELCOME,
        phaseData: {
          smartFolders: [],
          selectedFiles: [],
          analysisResults: [],
          organizedFiles: [],
        },
      };
    default:
      return state;
  }
}

const PhaseContext = createContext(null);

export function PhaseProvider({ children }) {
  const [state, dispatch] = useReducer(phaseReducer, {
    currentPhase: PHASES.WELCOME,
    phaseData: {
      smartFolders: [],
      selectedFiles: [],
      analysisResults: [],
      organizedFiles: [],
    },
    isLoading: false,
    showSettings: false,
  });

  useEffect(() => {
    try {
      const savedState = localStorage.getItem('stratosort_workflow_state');
      if (savedState) {
        const parsed = JSON.parse(savedState);
        const age = Date.now() - parsed.timestamp;
        if (age < UI_WORKFLOW.RESTORE_MAX_AGE_MS) {
          dispatch({ type: 'RESTORE_STATE', payload: parsed });
        }
      }
    } catch (error) {
      console.error('Failed to load workflow state:', error);
      // Fixed: Clear corrupt localStorage data to prevent reload loops
      try {
        localStorage.removeItem('stratosort_workflow_state');
      } catch {
        // Non-fatal if removal fails
      }
    }
  }, []);

  useEffect(() => {
    const save = () => {
      try {
        if (state.currentPhase !== PHASES.WELCOME) {
          // Fixed: Prune large data to prevent localStorage quota exceeded
          const prunedPhaseData = { ...state.phaseData };

          // Limit analysis results to prevent quota issues (max 200 most recent)
          if (
            Array.isArray(prunedPhaseData.analysisResults) &&
            prunedPhaseData.analysisResults.length > 200
          ) {
            prunedPhaseData.analysisResults = prunedPhaseData.analysisResults
              .slice(0, 200)
              .map((r) => ({
                path: r.path,
                name: r.name,
                size: r.size,
                type: r.type,
                status: r.status,
                analysis: r.analysis
                  ? {
                      category: r.analysis.category,
                      confidence: r.analysis.confidence,
                      suggestedName: r.analysis.suggestedName,
                      // Omit large text content to save space
                    }
                  : null,
                error: r.error,
                analyzedAt: r.analyzedAt,
              }));
          }

          // Limit selected files list
          if (
            Array.isArray(prunedPhaseData.selectedFiles) &&
            prunedPhaseData.selectedFiles.length > 200
          ) {
            prunedPhaseData.selectedFiles = prunedPhaseData.selectedFiles.slice(
              0,
              200,
            );
          }

          const workflowState = {
            currentPhase: state.currentPhase,
            phaseData: prunedPhaseData,
            timestamp: Date.now(),
          };

          localStorage.setItem(
            'stratosort_workflow_state',
            JSON.stringify(workflowState),
          );
        }
      } catch (error) {
        // Fixed: Handle QuotaExceededError specifically
        if (error.name === 'QuotaExceededError') {
          console.warn(
            '[PHASE] LocalStorage quota exceeded, clearing old state',
          );
          try {
            // Clear the old state and try saving minimal data
            localStorage.removeItem('stratosort_workflow_state');
            const minimalState = {
              currentPhase: state.currentPhase,
              phaseData: {
                smartFolders: state.phaseData.smartFolders || [],
                // Only save essential data
              },
              timestamp: Date.now(),
            };
            localStorage.setItem(
              'stratosort_workflow_state',
              JSON.stringify(minimalState),
            );
          } catch {
            console.error(
              '[PHASE] Cannot save even minimal state, continuing without persistence',
            );
          }
        } else {
          console.error('Failed to save workflow state:', error);
        }
      }
    };
    const timeoutId = setTimeout(save, UI_WORKFLOW.SAVE_DEBOUNCE_MS);
    return () => clearTimeout(timeoutId);
  }, [state.currentPhase, state.phaseData]);

  const advancePhase = useCallback(
    (targetPhase, data) =>
      dispatch({ type: 'ADVANCE_PHASE', payload: { targetPhase, data } }),
    [dispatch],
  );
  const setPhaseData = useCallback(
    (key, value) =>
      dispatch({ type: 'SET_PHASE_DATA', payload: { key, value } }),
    [dispatch],
  );
  const setLoading = useCallback(
    (isLoading) => dispatch({ type: 'SET_LOADING', payload: { isLoading } }),
    [dispatch],
  );
  const toggleSettings = useCallback(
    () => dispatch({ type: 'TOGGLE_SETTINGS' }),
    [dispatch],
  );
  const resetWorkflow = useCallback(() => {
    try {
      localStorage.removeItem('stratosort_workflow_state');
    } catch (error) {
      // Fixed: Log localStorage errors instead of silently swallowing
      console.warn(
        '[PHASE] Failed to clear workflow state from localStorage:',
        error,
      );
    }
    dispatch({ type: 'RESET_WORKFLOW' });
  }, [dispatch]);

  const actions = useMemo(
    () => ({
      advancePhase,
      setPhaseData,
      setLoading,
      toggleSettings,
      resetWorkflow,
    }),
    [advancePhase, setPhaseData, setLoading, toggleSettings, resetWorkflow],
  );

  return (
    <PhaseContext.Provider
      value={useMemo(() => {
        const getCurrentMetadata = () => PHASE_METADATA[state.currentPhase];
        return { ...state, actions, getCurrentMetadata };
      }, [state, actions])}
    >
      {children}
    </PhaseContext.Provider>
  );
}

PhaseProvider.propTypes = {
  children: PropTypes.node.isRequired,
};

export function usePhase() {
  const context = useContext(PhaseContext);
  if (!context) throw new Error('usePhase must be used within a PhaseProvider');
  return context;
}

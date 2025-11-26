/**
 * Redux Migration Verification Tests
 * Tests to verify the PhaseContext → Redux migration is working correctly
 */

const { configureStore } = require('@reduxjs/toolkit');
const uiSlice = require('../src/renderer/store/slices/uiSlice');
const filesSlice = require('../src/renderer/store/slices/filesSlice');
const analysisSlice = require('../src/renderer/store/slices/analysisSlice');
const organizeSlice = require('../src/renderer/store/slices/organizeSlice');
const { PHASES } = require('../src/shared/constants');

describe('Redux Migration - Store Initialization', () => {
  let store;

  beforeEach(() => {
    store = configureStore({
      reducer: {
        ui: uiSlice.default,
        files: filesSlice.default,
        analysis: analysisSlice.default,
        organize: organizeSlice.default,
      },
    });
  });

  test('Store initializes with correct default state', () => {
    const state = store.getState();

    expect(state.ui).toBeDefined();
    expect(state.files).toBeDefined();
    expect(state.analysis).toBeDefined();
    expect(state.organize).toBeDefined();
  });

  test('uiSlice has correct initial state', () => {
    const state = store.getState();

    expect(state.ui.currentPhase).toBe(PHASES.DISCOVER);
    expect(state.ui.phaseHistory).toEqual([]);
    expect(state.ui.phaseData).toEqual({
      setup: {},
      discover: {},
      organize: {},
      complete: {},
    });
    expect(state.ui.activeModal).toBe(null);
    expect(state.ui.notifications).toEqual([]);
  });

  test('filesSlice has correct initial state', () => {
    const state = store.getState();

    expect(state.files.selectedFiles).toEqual([]);
    expect(state.files.fileStates).toEqual({});
    expect(state.files.isScanning).toBe(false);
  });

  test('analysisSlice has correct initial state', () => {
    const state = store.getState();

    expect(state.analysis.analysisResults).toEqual([]);
    expect(state.analysis.isAnalyzing).toBe(false);
    expect(state.analysis.currentAnalysisFile).toBe('');
    expect(state.analysis.analysisProgress).toEqual({
      current: 0,
      total: 0,
      lastActivity: null,
    });
  });

  test('organizeSlice has correct initial state', () => {
    const state = store.getState();

    expect(state.organize.organizedFiles).toEqual([]);
  });
});

describe('Redux Migration - Phase Transitions', () => {
  let store;

  beforeEach(() => {
    store = configureStore({
      reducer: {
        ui: uiSlice.default,
        files: filesSlice.default,
        analysis: analysisSlice.default,
        organize: organizeSlice.default,
      },
    });
  });

  test('advancePhase updates currentPhase', () => {
    store.dispatch(uiSlice.advancePhase({ targetPhase: PHASES.SETUP }));

    const state = store.getState();
    expect(state.ui.currentPhase).toBe(PHASES.SETUP);
  });

  test('advancePhase adds to phaseHistory', () => {
    store.dispatch(uiSlice.advancePhase({ targetPhase: PHASES.SETUP }));
    store.dispatch(uiSlice.advancePhase({ targetPhase: PHASES.DISCOVER }));

    const state = store.getState();
    expect(state.ui.phaseHistory).toContain(PHASES.SETUP);
    expect(state.ui.phaseHistory).toContain(PHASES.DISCOVER);
  });

  test('advancePhase with data merges phase data', () => {
    store.dispatch(
      uiSlice.advancePhase({
        targetPhase: PHASES.SETUP,
        data: { smartFolders: [{ name: 'Test' }] },
      }),
    );

    const state = store.getState();
    expect(state.ui.phaseData[PHASES.SETUP]).toBeDefined();
    expect(state.ui.phaseData[PHASES.SETUP].smartFolders).toHaveLength(1);
  });

  test('setPhaseData updates phase-specific data', () => {
    store.dispatch(
      uiSlice.setPhaseData({
        phase: PHASES.DISCOVER,
        key: 'namingConvention',
        value: { convention: 'subject-date' },
      }),
    );

    const state = store.getState();
    expect(state.ui.phaseData[PHASES.DISCOVER]).toBeDefined();
    expect(state.ui.phaseData[PHASES.DISCOVER].namingConvention).toBeDefined();
    expect(
      state.ui.phaseData[PHASES.DISCOVER].namingConvention.convention,
    ).toBe('subject-date');
  });

  test('resetWorkflow resets to initial state', () => {
    // Add some data
    store.dispatch(uiSlice.advancePhase({ targetPhase: PHASES.SETUP }));
    store.dispatch(
      uiSlice.setPhaseData({
        phase: PHASES.SETUP,
        key: 'test',
        value: 'data',
      }),
    );

    // Reset
    store.dispatch(uiSlice.resetWorkflow());

    const state = store.getState();
    expect(state.ui.currentPhase).toBe(PHASES.DISCOVER);
    expect(state.ui.phaseHistory).toEqual([]);
    expect(state.ui.phaseData).toEqual({
      setup: {},
      discover: {},
      organize: {},
      complete: {},
    });
  });
});

describe('Redux Migration - File Selection', () => {
  let store;

  beforeEach(() => {
    store = configureStore({
      reducer: {
        ui: uiSlice.default,
        files: filesSlice.default,
        analysis: analysisSlice.default,
        organize: organizeSlice.default,
      },
    });
  });

  test('setSelectedFiles updates selected files', () => {
    const files = [
      { path: '/path/to/file1.txt', name: 'file1.txt' },
      { path: '/path/to/file2.txt', name: 'file2.txt' },
    ];

    store.dispatch(filesSlice.setSelectedFiles(files));

    const state = store.getState();
    expect(state.files.selectedFiles).toHaveLength(2);
    expect(state.files.selectedFiles[0].name).toBe('file1.txt');
  });

  test('updateFileState updates file state', () => {
    store.dispatch(
      filesSlice.updateFileState({
        filePath: '/path/to/file.txt',
        state: 'analyzing',
        metadata: { startTime: Date.now() },
      }),
    );

    const state = store.getState();
    expect(state.files.fileStates['/path/to/file.txt']).toBeDefined();
    expect(state.files.fileStates['/path/to/file.txt'].state).toBe('analyzing');
  });

  test('setIsScanning updates scanning state', () => {
    store.dispatch(filesSlice.setIsScanning(true));

    const state = store.getState();
    expect(state.files.isScanning).toBe(true);
  });
});

describe('Redux Migration - Analysis', () => {
  let store;

  beforeEach(() => {
    store = configureStore({
      reducer: {
        ui: uiSlice.default,
        files: filesSlice.default,
        analysis: analysisSlice.default,
        organize: organizeSlice.default,
      },
    });
  });

  test('setAnalysisResults updates results', () => {
    const results = [
      { path: '/file1.txt', analysis: { category: 'document' } },
      { path: '/file2.txt', analysis: { category: 'image' } },
    ];

    store.dispatch(analysisSlice.setAnalysisResults(results));

    const state = store.getState();
    expect(state.analysis.analysisResults).toHaveLength(2);
  });

  test('setIsAnalyzing updates analyzing state', () => {
    store.dispatch(analysisSlice.setIsAnalyzing(true));

    const state = store.getState();
    expect(state.analysis.isAnalyzing).toBe(true);
  });

  test('setAnalysisProgress updates progress', () => {
    store.dispatch(
      analysisSlice.setAnalysisProgress({
        current: 5,
        total: 10,
        lastActivity: Date.now(),
      }),
    );

    const state = store.getState();
    expect(state.analysis.analysisProgress.current).toBe(5);
    expect(state.analysis.analysisProgress.total).toBe(10);
  });

  test('resetAnalysisState resets to initial state', () => {
    store.dispatch(analysisSlice.setIsAnalyzing(true));
    store.dispatch(analysisSlice.resetAnalysisState());

    const state = store.getState();
    expect(state.analysis.isAnalyzing).toBe(false);
    expect(state.analysis.currentAnalysisFile).toBe('');
  });
});

describe('Redux Migration - Notifications', () => {
  let store;

  beforeEach(() => {
    store = configureStore({
      reducer: {
        ui: uiSlice.default,
        files: filesSlice.default,
        analysis: analysisSlice.default,
        organize: organizeSlice.default,
      },
    });
  });

  test('addNotification adds notification', () => {
    store.dispatch(
      uiSlice.addNotification({
        message: 'Test notification',
        type: 'success',
        duration: 3000,
      }),
    );

    const state = store.getState();
    expect(state.ui.notifications).toHaveLength(1);
    expect(state.ui.notifications[0].message).toBe('Test notification');
    expect(state.ui.notifications[0].type).toBe('success');
  });

  test('removeNotification removes notification by id', () => {
    store.dispatch(
      uiSlice.addNotification({
        message: 'Test',
        type: 'info',
      }),
    );

    const state1 = store.getState();
    const notificationId = state1.ui.notifications[0].id;

    store.dispatch(uiSlice.removeNotification(notificationId));

    const state2 = store.getState();
    expect(state2.ui.notifications).toHaveLength(0);
  });
});

describe('Redux Migration - Selectors', () => {
  let store;

  beforeEach(() => {
    store = configureStore({
      reducer: {
        ui: uiSlice.default,
        files: filesSlice.default,
        analysis: analysisSlice.default,
        organize: organizeSlice.default,
      },
    });
  });

  test('selectCurrentPhase returns current phase', () => {
    const phase = uiSlice.selectCurrentPhase(store.getState());
    expect(phase).toBe(PHASES.DISCOVER);
  });

  test('selectPhaseData returns phase-specific data', () => {
    store.dispatch(
      uiSlice.setPhaseData({
        phase: PHASES.DISCOVER,
        key: 'test',
        value: 'value',
      }),
    );

    const phaseData = uiSlice.selectPhaseData(
      store.getState(),
      PHASES.DISCOVER,
    );
    expect(phaseData.test).toBe('value');
  });

  test('selectSelectedFiles returns selected files', () => {
    const files = [{ path: '/test.txt' }];
    store.dispatch(filesSlice.setSelectedFiles(files));

    const selectedFiles = filesSlice.selectSelectedFiles(store.getState());
    expect(selectedFiles).toHaveLength(1);
  });

  test('selectAnalysisResults returns analysis results', () => {
    const results = [{ path: '/test.txt', analysis: {} }];
    store.dispatch(analysisSlice.setAnalysisResults(results));

    const analysisResults = analysisSlice.selectAnalysisResults(
      store.getState(),
    );
    expect(analysisResults).toHaveLength(1);
  });

  test('selectOrganizedFiles returns organized files', () => {
    const files = [{ path: '/organized.txt' }];
    store.dispatch(organizeSlice.setOrganizedFiles(files));

    const organizedFiles = organizeSlice.selectOrganizedFiles(store.getState());
    expect(organizedFiles).toHaveLength(1);
  });
});

describe('Redux Migration - Modal Management', () => {
  let store;

  beforeEach(() => {
    store = configureStore({
      reducer: {
        ui: uiSlice.default,
        files: filesSlice.default,
        analysis: analysisSlice.default,
        organize: organizeSlice.default,
      },
    });
  });

  test('openModal sets active modal', () => {
    store.dispatch(uiSlice.openModal({ modal: 'settings' }));

    const state = store.getState();
    expect(state.ui.activeModal).toBe('settings');
  });

  test('closeModal clears active modal', () => {
    store.dispatch(uiSlice.openModal({ modal: 'settings' }));
    store.dispatch(uiSlice.closeModal());

    const state = store.getState();
    expect(state.ui.activeModal).toBe(null);
  });

  test('selectActiveModal returns active modal', () => {
    store.dispatch(uiSlice.openModal({ modal: 'settings' }));

    const activeModal = uiSlice.selectActiveModal(store.getState());
    expect(activeModal).toBe('settings');
  });
});

describe('Redux Migration - Organize', () => {
  let store;

  beforeEach(() => {
    store = configureStore({
      reducer: {
        ui: uiSlice.default,
        files: filesSlice.default,
        analysis: analysisSlice.default,
        organize: organizeSlice.default,
      },
    });
  });

  test('setOrganizedFiles updates organized files', () => {
    const files = [{ originalPath: '/old/file.txt', path: '/new/file.txt' }];

    store.dispatch(organizeSlice.setOrganizedFiles(files));

    const state = store.getState();
    expect(state.organize.organizedFiles).toHaveLength(1);
    expect(state.organize.organizedFiles[0].originalPath).toBe('/old/file.txt');
  });
});

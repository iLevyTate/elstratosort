import React from 'react';

import PhaseRenderer from './components/PhaseRenderer';
import NavigationBar from './components/NavigationBar';
import TooltipManager from './components/TooltipManager';
// FIX: ChromaDB status subscription - keeps Redux store in sync with service status
import ChromaDBStatusManager from './components/ChromaDBStatusManager';

import AppProviders from './components/AppProviders';
import ErrorBoundary from './components/ErrorBoundary';

function App() {
  return (
    <ErrorBoundary>
      <AppProviders>
        {/* FIX: Subscribe to ChromaDB status changes and update Redux store */}
        <ChromaDBStatusManager />
        <a href="#main-content" className="skip-link">
          Skip to main content
        </a>
        <div className="app-surface flex min-h-screen flex-col overflow-hidden">
          <NavigationBar />
          <main
            id="main-content"
            className="flex flex-1 flex-col pt-[var(--app-nav-height)] overflow-hidden"
            tabIndex={-1}
          >
            <div className="flex-1 overflow-y-auto relative">
              <PhaseRenderer />
            </div>
          </main>
        </div>
        <TooltipManager />
      </AppProviders>
    </ErrorBoundary>
  );
}

export default App;

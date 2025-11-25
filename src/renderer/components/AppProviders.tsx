import React from 'react';
import { Provider } from 'react-redux';
import { PersistGate } from 'redux-persist/integration/react';
import { store, persistor } from '../store';
import { NotificationProvider } from '../contexts/NotificationContext';
import { UndoRedoProvider } from './UndoRedoSystem';

interface AppProvidersProps {
  children: React.ReactNode;
}

function AppProviders({ children }: AppProvidersProps) {
  return (
    <Provider store={store}>
      <PersistGate loading={null} persistor={persistor}>
        <NotificationProvider>
          <UndoRedoProvider>{children}</UndoRedoProvider>
        </NotificationProvider>
      </PersistGate>
    </Provider>
  );
}

export default AppProviders;

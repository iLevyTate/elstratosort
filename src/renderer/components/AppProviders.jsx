import React from 'react';
import PropTypes from 'prop-types';
import { NotificationProvider } from '../contexts/NotificationContext';
import { PhaseProvider } from '../contexts/PhaseContext';
import { UndoRedoProvider } from './UndoRedoSystem';

function AppProviders({ children }) {
  return (
    <NotificationProvider>
      <UndoRedoProvider>
        <PhaseProvider>{children}</PhaseProvider>
      </UndoRedoProvider>
    </NotificationProvider>
  );
}

AppProviders.propTypes = {
  children: PropTypes.node.isRequired,
};

export default AppProviders;

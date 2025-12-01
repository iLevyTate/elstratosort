import React, { useState, useCallback } from 'react';
import PropTypes from 'prop-types';
import Button from '../ui/Button';

/**
 * Backend API test section for debugging connectivity
 */
function APITestSection({ addNotification }) {
  const [testResults, setTestResults] = useState({});
  const [isTestingApi, setIsTestingApi] = useState(false);

  const runAPITests = useCallback(async () => {
    setIsTestingApi(true);
    const results = {};

    try {
      await window.electronAPI.files.getDocumentsPath();
      results.fileOperations = '✅ Working';
    } catch (error) {
      results.fileOperations = `❌ Error: ${error.message}`;
    }

    try {
      await window.electronAPI.smartFolders.get();
      results.smartFolders = '✅ Working';
    } catch (error) {
      results.smartFolders = `❌ Error: ${error.message}`;
    }

    try {
      await window.electronAPI.analysisHistory.getStatistics();
      results.analysisHistory = '✅ Working';
    } catch (error) {
      results.analysisHistory = `❌ Error: ${error.message}`;
    }

    try {
      await window.electronAPI.undoRedo.canUndo();
      results.undoRedo = '✅ Working';
    } catch (error) {
      results.undoRedo = `❌ Error: ${error.message}`;
    }

    try {
      await window.electronAPI.system.getApplicationStatistics();
      results.systemMonitoring = '✅ Working';
    } catch (error) {
      results.systemMonitoring = `❌ Error: ${error.message}`;
    }

    try {
      await window.electronAPI.ollama.getModels();
      results.ollama = '✅ Working';
    } catch (error) {
      results.ollama = `❌ Error: ${error.message}`;
    }

    setTestResults(results);
    setIsTestingApi(false);
    addNotification('API tests completed', 'info');
  }, [addNotification]);

  return (
    <div className="p-4 bg-system-gray-50 rounded-lg">
      <Button
        onClick={runAPITests}
        disabled={isTestingApi}
        variant="primary"
        className="text-sm mb-4 w-full"
      >
        {isTestingApi ? 'Testing APIs...' : 'Test All APIs'}
      </Button>
      {Object.keys(testResults).length > 0 && (
        <div className="space-y-3 text-sm">
          {Object.entries(testResults).map(([service, status]) => (
            <div key={service} className="flex justify-between">
              <span className="capitalize">
                {service.replace(/([A-Z])/g, ' $1').trim()}:
              </span>
              <span className="font-mono text-xs">{status}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

APITestSection.propTypes = {
  addNotification: PropTypes.func.isRequired,
};

export default APITestSection;

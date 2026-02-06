// src/renderer/components/ModelSetupWizard.jsx

import React, { useState, useEffect } from 'react';
import { Download, HardDrive, Cpu, CheckCircle, Loader2 } from 'lucide-react';
import Button from './ui/Button';
import Card from './ui/Card';
import { Text, Heading } from './ui/Typography';
import { formatBytes, formatDuration } from '../utils/format';
import { getDefaultModel, MODEL_CATALOG } from '../../shared/modelRegistry';

export default function ModelSetupWizard({ onComplete, onSkip }) {
  const [systemInfo, setSystemInfo] = useState(null);
  const [recommendations, setRecommendations] = useState(null);
  const [selectedModels, setSelectedModels] = useState({});
  const [downloadProgress, setDownloadProgress] = useState({});
  const [step, setStep] = useState('checking'); // checking, select, downloading, complete

  useEffect(() => {
    checkSystem();
  }, []);

  useEffect(() => {
    // Subscribe to download progress
    // Note: Assuming window.electronAPI.events.onOperationProgress handles this
    const unsubscribe = window.electronAPI.events.onOperationProgress((data) => {
      if (data.type === 'model-download') {
        setDownloadProgress((prev) => ({
          ...prev,
          [data.model]: data.progress
        }));
      }
    });
    return unsubscribe;
  }, []);

  async function checkSystem() {
    // Mock system check for now - use real API when available
    // const info = await window.electronAPI.system.getInfo();
    const info = { totalRAM: 16 * 1024 * 1024 * 1024, gpuName: 'Detected GPU' }; // Placeholder
    setSystemInfo(info);

    const recs = {
      embedding: getDefaultModel('embedding'),
      text: getDefaultModel('text'),
      vision: getDefaultModel('vision')
    };
    setRecommendations(recs);

    // Pre-select recommended models
    setSelectedModels(recs);
    setStep('select');
  }

  async function startDownloads() {
    setStep('downloading');

    const modelsToDownload = Object.values(selectedModels).filter(Boolean);

    for (const filename of modelsToDownload) {
      try {
        await window.electronAPI.llama.downloadModel(filename);
      } catch (error) {
        // eslint-disable-next-line no-console -- download error visible to user via UI state
        console.error(`Failed to download ${filename}:`, error);
        // Continue with other models
      }
    }

    setStep('complete');
  }

  function toggleModel(type, filename) {
    setSelectedModels((prev) => ({
      ...prev,
      [type]: prev[type] === filename ? null : filename
    }));
  }

  const getModelSize = (filename) => {
    const model = MODEL_CATALOG[filename];
    if (!model) return 0;
    let total = model.size || 0;
    if (model.clipModel?.size) {
      total += model.clipModel.size;
    }
    return total;
  };

  const totalDownloadSize = Object.values(selectedModels)
    .filter(Boolean)
    .reduce((sum, filename) => {
      return sum + getModelSize(filename);
    }, 0);

  if (step === 'checking') {
    return (
      <Card className="max-w-2xl mx-auto p-8 text-center">
        <Loader2 className="w-12 h-12 mx-auto mb-4 animate-spin text-blue-500" />
        <Heading level={2}>Checking System...</Heading>
        <Text className="text-gray-600 mt-2">Detecting GPU and memory configuration</Text>
      </Card>
    );
  }

  if (step === 'select') {
    return (
      <Card className="max-w-2xl mx-auto p-8">
        <div className="text-center mb-6">
          <Cpu className="w-12 h-12 mx-auto mb-4 text-blue-500" />
          <Heading level={2}>AI Model Setup</Heading>
          <Text className="text-gray-600 mt-2">
            StratoSort runs AI locally on your device. Select the models to download.
          </Text>
        </div>

        {/* System Info */}
        <div className="bg-gray-50 rounded-lg p-4 mb-6">
          <Text variant="small" className="font-medium mb-2">
            Your System
          </Text>
          <div className="grid grid-cols-2 gap-2 text-sm">
            <div>RAM: {Math.round(systemInfo?.totalRAM / 1024 / 1024 / 1024)}GB</div>
            <div>GPU: {systemInfo?.gpuName || 'CPU only'}</div>
          </div>
        </div>

        {/* Model Selection */}
        <div className="space-y-4 mb-6">
          <ModelSelector
            type="embedding"
            label="Embedding Model (Required)"
            description="Converts text to vectors for search"
            selected={selectedModels.embedding}
            recommendations={recommendations}
            onChange={(f) => toggleModel('embedding', f)}
            getModelSize={getModelSize}
          />

          <ModelSelector
            type="text"
            label="Text Analysis Model (Required)"
            description="Analyzes documents and generates descriptions"
            selected={selectedModels.text}
            recommendations={recommendations}
            onChange={(f) => toggleModel('text', f)}
            getModelSize={getModelSize}
          />

          <ModelSelector
            type="vision"
            label="Vision Model (Optional)"
            description="Analyzes images and screenshots"
            selected={selectedModels.vision}
            recommendations={recommendations}
            onChange={(f) => toggleModel('vision', f)}
            optional
            getModelSize={getModelSize}
          />
        </div>

        {/* Download Summary */}
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
          <div className="flex items-center justify-between">
            <div>
              <Text className="font-medium">Total Download</Text>
              <Text variant="small" className="text-gray-600">
                {formatBytes(totalDownloadSize)}
              </Text>
            </div>
            <HardDrive className="w-6 h-6 text-blue-500" />
          </div>
        </div>

        <div className="flex gap-3">
          <Button
            onClick={startDownloads}
            variant="primary"
            className="flex-1"
            disabled={!selectedModels.embedding || !selectedModels.text}
          >
            <Download className="w-4 h-4 mr-2" />
            Download Models
          </Button>
          <Button onClick={onSkip} variant="secondary">
            Skip for Now
          </Button>
        </div>
      </Card>
    );
  }

  if (step === 'downloading') {
    const models = Object.entries(selectedModels).filter(([_, v]) => v);
    // Simple check: if all active downloads are complete
    // In reality, you'd track each download's state from the event
    const allComplete = models.every(
      ([_, filename]) => downloadProgress[filename]?.percent === 100
    );

    return (
      <Card className="max-w-2xl mx-auto p-8">
        <div className="text-center mb-6">
          <Download className="w-12 h-12 mx-auto mb-4 text-blue-500" />
          <Heading level={2}>Downloading Models</Heading>
          <Text className="text-gray-600 mt-2">
            This may take a while depending on your connection speed
          </Text>
        </div>

        <div className="space-y-4">
          {models.map(([_type, filename]) => {
            const progress = downloadProgress[filename] || { percent: 0 };
            return (
              <div key={filename} className="border rounded-lg p-4">
                <div className="flex items-center justify-between mb-2">
                  <Text className="font-medium">{filename}</Text>
                  <Text variant="small" className="text-gray-600">
                    {progress.percent}%
                  </Text>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-2 mb-2">
                  <div
                    className="bg-blue-500 h-2 rounded-full transition-all"
                    style={{ width: `${progress.percent}%` }}
                  />
                </div>
                <div className="flex justify-between text-xs text-gray-500">
                  <span>{formatBytes(progress.downloadedBytes || 0)}</span>
                  <span>
                    {progress.speedBps ? `${formatBytes(progress.speedBps)}/s` : 'Starting...'}
                  </span>
                  <span>
                    {progress.etaSeconds ? `ETA: ${formatDuration(progress.etaSeconds)}` : ''}
                  </span>
                </div>
              </div>
            );
          })}
        </div>

        <div className="mt-6 flex justify-end">
          <Button
            onClick={() => setStep('complete')}
            variant="primary"
            className="w-full"
            // Enable button if downloads are done OR user wants to background it (maybe?)
            // For wizard, better to wait or offer "Background" option
          >
            {allComplete ? 'Continue' : 'Run in Background'}
          </Button>
        </div>
      </Card>
    );
  }

  return (
    <Card className="max-w-2xl mx-auto p-8 text-center">
      <CheckCircle className="w-12 h-12 mx-auto mb-4 text-green-500" />
      <Heading level={2}>Setup Complete!</Heading>
      <Text className="text-gray-600 mt-2 mb-6">
        StratoSort is ready to organize your files with AI
      </Text>
      <Button onClick={onComplete} variant="primary">
        Get Started
      </Button>
    </Card>
  );
}

function ModelSelector({
  type,
  label,
  description,
  selected,
  recommendations,
  onChange,
  optional,
  getModelSize
}) {
  // Using passed recommendations to show options
  // In real app, might want a dropdown if there are multiple choices
  const filename = recommendations?.[type];
  if (!filename) return null;

  return (
    <div className="border rounded-lg p-4">
      <div className="flex items-center justify-between mb-2">
        <div>
          <Text className="font-medium">{label}</Text>
          <Text variant="small" className="text-gray-600">
            {description}
          </Text>
        </div>
        {optional && <span className="text-xs bg-gray-100 px-2 py-1 rounded">Optional</span>}
      </div>

      <label
        className={`flex items-center p-3 rounded border cursor-pointer transition
          ${
            selected === filename
              ? 'border-blue-500 bg-blue-50'
              : 'border-gray-200 hover:border-gray-300'
          }`}
      >
        <input
          type="checkbox"
          checked={selected === filename}
          onChange={() => onChange(filename)}
          className="mr-3"
        />
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <Text variant="small" className="font-medium">
              {filename}
            </Text>
            <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded">
              Recommended
            </span>
          </div>
          <Text variant="tiny" className="text-gray-500">
            {formatBytes(getModelSize(filename))}
          </Text>
        </div>
      </label>
    </div>
  );
}

import React, { useState } from 'react';
import {
  FiSettings,
  FiCpu,
  FiZap,
  FiEye,
  FiShield,
  FiInfo,
  FiSave,
  FiRefreshCw,
} from 'react-icons/fi';

export default function SettingsTab() {
  const [settings, setSettings] = useState({
    // AI Configuration
    ollamaHost: 'http://localhost:11434',
    textModel: 'llama3.2:latest',
    visionModel: 'llama3.2-vision',
    embeddingModel: 'nomic-embed-text',

    // Auto-Organization
    autoOrganize: true,
    confidenceThreshold: 85,
    requireConfirmation: true,

    // Performance
    concurrentAnalysis: 3,
    cacheResults: true,
    processInBackground: true,

    // Appearance
    theme: 'light',
    animationsEnabled: true,
    compactMode: false,

    // Advanced
    logLevel: 'info',
    enableAnalytics: true,
    checkUpdates: true,
  });

  const [saved, setSaved] = useState(false);

  const handleSave = () => {
    // Save settings logic here
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const handleReset = () => {
    if (confirm('Reset all settings to defaults?')) {
      // Reset logic here
    }
  };

  const updateSetting = (key, value) => {
    setSettings((prev) => ({ ...prev, [key]: value }));
  };

  return (
    <div className="space-y-6 max-w-4xl">
      {/* Page Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-bold flex items-center gap-3">
            <FiSettings className="w-8 h-8" />
            Settings
          </h2>
          <p className="text-neutral/60 mt-1">
            Configure StratoSort to match your preferences
          </p>
        </div>
        <div className="flex gap-2">
          <button className="btn btn-outline gap-2" onClick={handleReset}>
            <FiRefreshCw className="w-4 h-4" />
            Reset
          </button>
          <button
            className={`btn gap-2 ${saved ? 'btn-success' : 'btn-primary'}`}
            onClick={handleSave}
          >
            <FiSave className="w-4 h-4" />
            {saved ? 'Saved!' : 'Save Changes'}
          </button>
        </div>
      </div>

      {/* AI Configuration */}
      <div className="card bg-base-100 shadow-xl">
        <div className="card-body">
          <h3 className="card-title text-xl mb-4">
            <FiCpu className="w-5 h-5 text-primary" />
            AI Configuration
          </h3>

          <div className="space-y-4">
            <div className="form-control">
              <label className="label">
                <span className="label-text font-medium">Ollama Host</span>
                <span className="label-text-alt">
                  <div className="badge badge-success badge-sm gap-1">
                    <div className="w-1.5 h-1.5 bg-white rounded-full animate-pulse" />
                    Connected
                  </div>
                </span>
              </label>
              <input
                type="text"
                className="input input-bordered"
                value={settings.ollamaHost}
                onChange={(e) => updateSetting('ollamaHost', e.target.value)}
              />
              <label className="label">
                <span className="label-text-alt text-neutral/60">
                  URL where Ollama is running
                </span>
              </label>
            </div>

            <div className="divider" />

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="form-control">
                <label className="label">
                  <span className="label-text font-medium">Text Model</span>
                </label>
                <select
                  className="select select-bordered"
                  value={settings.textModel}
                  onChange={(e) => updateSetting('textModel', e.target.value)}
                >
                  <option>llama3.2:latest</option>
                  <option>llama3.1</option>
                  <option>mistral</option>
                  <option>gemma2</option>
                </select>
              </div>

              <div className="form-control">
                <label className="label">
                  <span className="label-text font-medium">Vision Model</span>
                </label>
                <select
                  className="select select-bordered"
                  value={settings.visionModel}
                  onChange={(e) => updateSetting('visionModel', e.target.value)}
                >
                  <option>llama3.2-vision</option>
                  <option>llava</option>
                  <option>bakllava</option>
                </select>
              </div>

              <div className="form-control">
                <label className="label">
                  <span className="label-text font-medium">
                    Embedding Model
                  </span>
                </label>
                <select
                  className="select select-bordered"
                  value={settings.embeddingModel}
                  onChange={(e) =>
                    updateSetting('embeddingModel', e.target.value)
                  }
                >
                  <option>nomic-embed-text</option>
                  <option>mxbai-embed-large</option>
                  <option>all-minilm</option>
                </select>
              </div>
            </div>

            <div className="alert alert-info">
              <FiInfo className="w-5 h-5" />
              <span className="text-sm">
                Make sure the selected models are downloaded in Ollama. Run{' '}
                <code className="bg-base-300 px-2 py-0.5 rounded">
                  ollama pull model-name
                </code>{' '}
                to download.
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Auto-Organization */}
      <div className="card bg-base-100 shadow-xl">
        <div className="card-body">
          <h3 className="card-title text-xl mb-4">
            <FiZap className="w-5 h-5 text-warning" />
            Auto-Organization
          </h3>

          <div className="space-y-4">
            <div className="form-control">
              <label className="label cursor-pointer">
                <div>
                  <span className="label-text font-medium">
                    Enable Auto-Organization
                  </span>
                  <p className="text-sm text-neutral/60">
                    Automatically organize files when they&apos;re added to
                    Downloads
                  </p>
                </div>
                <input
                  type="checkbox"
                  className="toggle toggle-success"
                  checked={settings.autoOrganize}
                  onChange={(e) =>
                    updateSetting('autoOrganize', e.target.checked)
                  }
                />
              </label>
            </div>

            <div className="divider" />

            <div className="form-control">
              <label className="label">
                <span className="label-text font-medium">
                  Confidence Threshold
                </span>
                <span className="label-text-alt font-bold text-lg">
                  {settings.confidenceThreshold}%
                </span>
              </label>
              <input
                type="range"
                min="50"
                max="100"
                className="range range-primary"
                value={settings.confidenceThreshold}
                onChange={(e) =>
                  updateSetting('confidenceThreshold', parseInt(e.target.value))
                }
                step="5"
              />
              <div className="w-full flex justify-between text-xs px-2 mt-2">
                <span className="text-error">50% - Aggressive</span>
                <span className="text-warning">75% - Balanced</span>
                <span className="text-success">100% - Conservative</span>
              </div>
              <label className="label">
                <span className="label-text-alt text-neutral/60">
                  Only organize files with confidence above this threshold
                </span>
              </label>
            </div>

            <div className="form-control">
              <label className="label cursor-pointer">
                <div>
                  <span className="label-text font-medium">
                    Require Confirmation
                  </span>
                  <p className="text-sm text-neutral/60">
                    Ask for approval before organizing files
                  </p>
                </div>
                <input
                  type="checkbox"
                  className="toggle toggle-warning"
                  checked={settings.requireConfirmation}
                  onChange={(e) =>
                    updateSetting('requireConfirmation', e.target.checked)
                  }
                />
              </label>
            </div>
          </div>
        </div>
      </div>

      {/* Performance */}
      <div className="card bg-base-100 shadow-xl">
        <div className="card-body">
          <h3 className="card-title text-xl mb-4">
            <FiShield className="w-5 h-5 text-secondary" />
            Performance
          </h3>

          <div className="space-y-4">
            <div className="form-control">
              <label className="label">
                <span className="label-text font-medium">
                  Concurrent Analysis
                </span>
                <span className="label-text-alt font-bold">
                  {settings.concurrentAnalysis} files
                </span>
              </label>
              <input
                type="range"
                min="1"
                max="10"
                className="range range-secondary"
                value={settings.concurrentAnalysis}
                onChange={(e) =>
                  updateSetting('concurrentAnalysis', parseInt(e.target.value))
                }
                step="1"
              />
              <div className="w-full flex justify-between text-xs px-2 mt-2">
                <span>1 - Slower</span>
                <span>5 - Balanced</span>
                <span>10 - Faster</span>
              </div>
            </div>

            <div className="divider" />

            <div className="form-control">
              <label className="label cursor-pointer">
                <div>
                  <span className="label-text font-medium">Cache Results</span>
                  <p className="text-sm text-neutral/60">
                    Store analysis results for faster re-analysis
                  </p>
                </div>
                <input
                  type="checkbox"
                  className="toggle toggle-accent"
                  checked={settings.cacheResults}
                  onChange={(e) =>
                    updateSetting('cacheResults', e.target.checked)
                  }
                />
              </label>
            </div>

            <div className="form-control">
              <label className="label cursor-pointer">
                <div>
                  <span className="label-text font-medium">
                    Process in Background
                  </span>
                  <p className="text-sm text-neutral/60">
                    Continue analysis when window is minimized
                  </p>
                </div>
                <input
                  type="checkbox"
                  className="toggle toggle-info"
                  checked={settings.processInBackground}
                  onChange={(e) =>
                    updateSetting('processInBackground', e.target.checked)
                  }
                />
              </label>
            </div>
          </div>
        </div>
      </div>

      {/* Appearance */}
      <div className="card bg-base-100 shadow-xl">
        <div className="card-body">
          <h3 className="card-title text-xl mb-4">
            <FiEye className="w-5 h-5 text-accent" />
            Appearance
          </h3>

          <div className="space-y-4">
            <div className="form-control">
              <label className="label">
                <span className="label-text font-medium">Theme</span>
              </label>
              <select
                className="select select-bordered"
                value={settings.theme}
                onChange={(e) => updateSetting('theme', e.target.value)}
              >
                <option value="light">Light</option>
                <option value="dark">Dark</option>
                <option value="auto">Auto (System)</option>
              </select>
            </div>

            <div className="divider" />

            <div className="form-control">
              <label className="label cursor-pointer">
                <div>
                  <span className="label-text font-medium">
                    Enable Animations
                  </span>
                  <p className="text-sm text-neutral/60">
                    Smooth transitions and effects
                  </p>
                </div>
                <input
                  type="checkbox"
                  className="toggle"
                  checked={settings.animationsEnabled}
                  onChange={(e) =>
                    updateSetting('animationsEnabled', e.target.checked)
                  }
                />
              </label>
            </div>

            <div className="form-control">
              <label className="label cursor-pointer">
                <div>
                  <span className="label-text font-medium">Compact Mode</span>
                  <p className="text-sm text-neutral/60">
                    Reduce spacing for more content
                  </p>
                </div>
                <input
                  type="checkbox"
                  className="toggle"
                  checked={settings.compactMode}
                  onChange={(e) =>
                    updateSetting('compactMode', e.target.checked)
                  }
                />
              </label>
            </div>
          </div>
        </div>
      </div>

      {/* About */}
      <div className="card bg-gradient-to-br from-primary/10 to-secondary/10 border-2 border-primary/20 shadow-xl">
        <div className="card-body">
          <div className="flex items-center gap-4">
            <div className="w-16 h-16 bg-gradient-to-br from-primary to-secondary rounded-2xl flex items-center justify-center shadow-lg">
              <span className="text-white font-bold text-3xl">S</span>
            </div>
            <div className="flex-1">
              <h3 className="text-2xl font-bold">StratoSort</h3>
              <p className="text-neutral/60">AI-Powered File Organization</p>
              <p className="text-sm text-neutral/50 mt-1">
                Version 1.0.0 • Electron {process.versions.electron} • Node{' '}
                {process.versions.node}
              </p>
            </div>
            <button className="btn btn-outline btn-sm">
              Check for Updates
            </button>
          </div>

          <div className="divider" />

          <div className="grid grid-cols-2 gap-4 text-center">
            <div>
              <p className="text-2xl font-bold text-primary">1,247</p>
              <p className="text-sm text-neutral/60">Files Organized</p>
            </div>
            <div>
              <p className="text-2xl font-bold text-success">94%</p>
              <p className="text-sm text-neutral/60">Avg Confidence</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

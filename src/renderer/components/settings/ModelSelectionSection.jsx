import React, { useState, useEffect, useRef } from 'react';
import PropTypes from 'prop-types';
import { AlertTriangle, Database, Info } from 'lucide-react';
import Select from '../ui/Select';
import Card from '../ui/Card';
import StatusBadge from '../ui/StatusBadge';
import SettingRow from './SettingRow';

// Embedding model dimensions - used for dimension change warnings
const EMBEDDING_DIMENSIONS = {
  embeddinggemma: 768,
  'mxbai-embed-large': 1024,
  'nomic-embed-text': 768,
  'all-minilm': 384,
  'bge-large': 1024
};

/**
 * Model selection section for text, vision, and embedding models
 * Displays categorized model dropdowns with helpful messages when categories are empty
 */
function ModelSelectionSection({
  settings,
  setSettings,
  textModelOptions,
  visionModelOptions,
  embeddingModelOptions
}) {
  // Show the "model changed -> rebuild required" message only when the user explicitly changes
  // the dropdown (avoids confusing banners during initial settings/model hydration).
  const [embeddingModelChanged, setEmbeddingModelChanged] = useState(false);
  const didMountRef = useRef(false);

  useEffect(() => {
    if (!didMountRef.current) {
      didMountRef.current = true;
      return;
    }
    // If the model gets reset programmatically (rare), keep the banner visible only if it was
    // explicitly triggered by user interaction.
  }, [settings.embeddingModel]);
  const hasTextModels = textModelOptions.length > 0;
  const hasVisionModels = visionModelOptions.length > 0;
  const hasEmbeddingModels = embeddingModelOptions.length > 0;

  return (
    <Card className="p-5 border border-system-gray-200 shadow-sm space-y-5">
      <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-system-gray-500">
            Default AI models
          </p>
          <p className="text-sm text-system-gray-600">
            Choose which Ollama models StratoSort uses for analysis, vision, and embeddings.
          </p>
        </div>
        <StatusBadge variant="info" className="whitespace-nowrap">
          <span className="flex items-center gap-2">
            <Database className="w-4 h-4" />
            Pulled from Ollama
          </span>
        </StatusBadge>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
        {/* Text Model Selection */}
        <SettingRow
          layout="col"
          label="Text Model"
          description={`${textModelOptions.length} available`}
          className="h-full"
        >
          {hasTextModels ? (
            <Select
              value={settings.textModel}
              onChange={(e) =>
                setSettings((prev) => ({
                  ...prev,
                  textModel: e.target.value
                }))
              }
              className="w-full"
            >
              {textModelOptions.map((model) => (
                <option key={model} value={model}>
                  {model}
                </option>
              ))}
            </Select>
          ) : (
            <div className="text-sm text-system-gray-500 italic p-3 bg-system-gray-50 rounded-lg border border-system-gray-100">
              No text models found. Pull a model like llama3.2 or mistral.
            </div>
          )}
        </SettingRow>

        {/* Vision Model Selection */}
        <SettingRow
          layout="col"
          label="Vision Model"
          description={`${visionModelOptions.length} available`}
          className="h-full"
        >
          {hasVisionModels ? (
            <Select
              value={settings.visionModel}
              onChange={(e) =>
                setSettings((prev) => ({
                  ...prev,
                  visionModel: e.target.value
                }))
              }
              className="w-full"
            >
              {visionModelOptions.map((model) => (
                <option key={model} value={model}>
                  {model}
                </option>
              ))}
            </Select>
          ) : (
            <div className="text-sm text-system-gray-500 italic p-3 bg-system-gray-50 rounded-lg border border-system-gray-100">
              No vision models found. Pull a model like llava or moondream for image analysis.
            </div>
          )}
        </SettingRow>

        {/* Embedding Model Selection */}
        <SettingRow
          layout="col"
          label="Embedding Model"
          description={`${embeddingModelOptions.length} available`}
          className="h-full"
        >
          {hasEmbeddingModels ? (
            <div className="space-y-3">
              <Select
                value={settings.embeddingModel}
                onChange={(e) => {
                  setEmbeddingModelChanged(true);
                  setSettings((prev) => ({
                    ...prev,
                    embeddingModel: e.target.value
                  }));
                }}
                className="w-full"
              >
                {embeddingModelOptions.map((model) => (
                  <option key={model} value={model}>
                    {model} ({EMBEDDING_DIMENSIONS[model] || '?'} dims)
                  </option>
                ))}
              </Select>

              <div className="flex items-start gap-2 p-2 bg-system-blue/5 rounded-md border border-system-blue/10">
                <Info className="w-3.5 h-3.5 text-system-blue/70 mt-0.5 flex-shrink-0" />
                <p className="text-[11px] text-system-gray-600 leading-tight">
                  Different models use different vector dimensions. Changing the model requires
                  rebuilding your embeddings database.
                </p>
              </div>

              {embeddingModelChanged && (
                <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg flex items-start gap-2">
                  <AlertTriangle className="w-4 h-4 text-amber-500 flex-shrink-0 mt-0.5" />
                  <div className="text-xs text-amber-700">
                    <span className="font-medium">Model changed.</span> Rebuild embeddings in AI
                    Configuration to apply.
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="text-sm text-system-gray-500 italic p-3 bg-system-gray-50 rounded-lg border border-system-gray-100">
              No embedding models available. Pull embeddinggemma (recommended) or mxbai-embed-large.
            </div>
          )}
        </SettingRow>
      </div>
    </Card>
  );
}

ModelSelectionSection.propTypes = {
  settings: PropTypes.object.isRequired,
  setSettings: PropTypes.func.isRequired,
  textModelOptions: PropTypes.array.isRequired,
  visionModelOptions: PropTypes.array.isRequired,
  embeddingModelOptions: PropTypes.array.isRequired
};

export default ModelSelectionSection;

import React, { useState } from 'react';
import {
  FiFolder,
  FiCheck,
  FiX,
  FiEdit2,
  FiPlay,
  FiRotateCcw,
  FiAlertTriangle,
} from 'react-icons/fi';

export default function OrganizeTab() {
  const [suggestions, setSuggestions] = useState([
    {
      id: 1,
      fileName: 'Project_Proposal.pdf',
      currentPath: 'C:\\Users\\Downloads',
      suggestedFolder: 'Work Documents',
      suggestedPath: 'C:\\Users\\Documents\\Work Documents',
      confidence: 95,
      reason: 'Document contains project plan and business proposal keywords',
      status: 'pending',
    },
    {
      id: 2,
      fileName: 'invoice_oct_2025.xlsx',
      currentPath: 'C:\\Users\\Downloads',
      suggestedFolder: 'Finances',
      suggestedPath: 'C:\\Users\\Documents\\Finances',
      confidence: 98,
      reason: 'Financial document with invoice structure detected',
      status: 'pending',
    },
    {
      id: 3,
      fileName: 'family_photo_2025.jpg',
      currentPath: 'C:\\Users\\Downloads',
      suggestedFolder: 'Photos/Family',
      suggestedPath: 'C:\\Users\\Pictures\\Photos\\Family',
      confidence: 92,
      reason: 'Image analysis detected family group photo',
      status: 'pending',
    },
  ]);

  const stats = {
    total: suggestions.length,
    highConfidence: suggestions.filter((s) => s.confidence >= 90).length,
    mediumConfidence: suggestions.filter(
      (s) => s.confidence >= 70 && s.confidence < 90,
    ).length,
    lowConfidence: suggestions.filter((s) => s.confidence < 70).length,
  };

  const handleOrganize = (id) => {
    setSuggestions((prev) =>
      prev.map((s) => (s.id === id ? { ...s, status: 'organizing' } : s)),
    );
    // Simulate organization
    setTimeout(() => {
      setSuggestions((prev) =>
        prev.map((s) => (s.id === id ? { ...s, status: 'completed' } : s)),
      );
    }, 1500);
  };

  const handleOrganizeAll = () => {
    suggestions.forEach((s) => {
      if (s.status === 'pending') {
        handleOrganize(s.id);
      }
    });
  };

  const getConfidenceBadge = (confidence) => {
    if (confidence >= 90) {
      return <div className="badge badge-success">High</div>;
    }
    if (confidence >= 70) {
      return <div className="badge badge-warning">Medium</div>;
    }
    return <div className="badge badge-error">Low</div>;
  };

  return (
    <div className="space-y-6">
      {/* Stats Overview */}
      <div className="stats stats-vertical lg:stats-horizontal shadow-lg w-full bg-base-100">
        <div className="stat">
          <div className="stat-figure text-primary">
            <FiFolder className="w-8 h-8" />
          </div>
          <div className="stat-title">Files Ready</div>
          <div className="stat-value text-primary">{stats.total}</div>
          <div className="stat-desc">To organize</div>
        </div>

        <div className="stat">
          <div className="stat-figure text-success">
            <FiCheck className="w-8 h-8" />
          </div>
          <div className="stat-title">High Confidence</div>
          <div className="stat-value text-success">{stats.highConfidence}</div>
          <div className="stat-desc">≥90% accurate</div>
        </div>

        <div className="stat">
          <div className="stat-figure text-warning">
            <FiAlertTriangle className="w-8 h-8" />
          </div>
          <div className="stat-title">Need Review</div>
          <div className="stat-value text-warning">
            {stats.mediumConfidence + stats.lowConfidence}
          </div>
          <div className="stat-desc">&lt;90% confidence</div>
        </div>
      </div>

      {/* Actions Bar */}
      <div className="card bg-base-100 shadow-lg">
        <div className="card-body">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="card-title text-xl">Quick Actions</h2>
              <p className="text-sm text-neutral/60 mt-1">
                Organize files based on AI suggestions
              </p>
            </div>
            <div className="flex gap-2">
              <button
                className="btn btn-primary gap-2"
                onClick={handleOrganizeAll}
                disabled={suggestions.length === 0}
              >
                <FiPlay className="w-4 h-4" />
                Organize All
              </button>
              <button className="btn btn-outline gap-2">
                <FiRotateCcw className="w-4 h-4" />
                Undo Last
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Suggestions List */}
      <div className="space-y-4">
        {suggestions.map((suggestion) => (
          <div
            key={suggestion.id}
            className={`card bg-base-100 shadow-lg transition-all ${
              suggestion.status === 'completed'
                ? 'opacity-50 border-2 border-success'
                : ''
            }`}
          >
            <div className="card-body">
              <div className="flex items-start justify-between gap-4">
                {/* File Info */}
                <div className="flex-1">
                  <div className="flex items-center gap-3 mb-2">
                    <h3 className="font-bold text-lg">{suggestion.fileName}</h3>
                    <div className="flex items-center gap-2">
                      {getConfidenceBadge(suggestion.confidence)}
                      <div className="badge badge-outline">
                        {suggestion.confidence}% confident
                      </div>
                    </div>
                    {suggestion.status === 'completed' && (
                      <div className="badge badge-success gap-1">
                        <FiCheck className="w-3 h-3" />
                        Organized
                      </div>
                    )}
                  </div>

                  {/* Path Info */}
                  <div className="space-y-2 text-sm">
                    <div className="flex items-center gap-2 text-neutral/70">
                      <span className="font-medium">From:</span>
                      <code className="bg-base-200 px-2 py-1 rounded">
                        {suggestion.currentPath}
                      </code>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-success">To:</span>
                      <code className="bg-success/10 px-2 py-1 rounded border border-success/20">
                        {suggestion.suggestedPath}
                      </code>
                    </div>
                  </div>

                  {/* Reason */}
                  <div className="alert alert-info mt-3">
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      fill="none"
                      viewBox="0 0 24 24"
                      className="stroke-current shrink-0 w-5 h-5"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth="2"
                        d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                      />
                    </svg>
                    <span className="text-sm">{suggestion.reason}</span>
                  </div>
                </div>

                {/* Actions */}
                <div className="flex flex-col gap-2">
                  {suggestion.status === 'pending' && (
                    <>
                      <button
                        className="btn btn-success btn-sm gap-2"
                        onClick={() => handleOrganize(suggestion.id)}
                      >
                        <FiCheck className="w-4 h-4" />
                        Organize
                      </button>
                      <button className="btn btn-ghost btn-sm gap-2">
                        <FiEdit2 className="w-4 h-4" />
                        Edit
                      </button>
                      <button className="btn btn-ghost btn-sm gap-2 text-error">
                        <FiX className="w-4 h-4" />
                        Skip
                      </button>
                    </>
                  )}
                  {suggestion.status === 'organizing' && (
                    <button className="btn btn-sm loading">Processing</button>
                  )}
                  {suggestion.status === 'completed' && (
                    <button className="btn btn-outline btn-sm gap-2">
                      <FiRotateCcw className="w-4 h-4" />
                      Undo
                    </button>
                  )}
                </div>
              </div>

              {/* Confidence Progress Bar */}
              <div className="mt-4">
                <div className="flex items-center justify-between text-xs mb-1">
                  <span className="text-neutral/60">Confidence Level</span>
                  <span className="font-medium">{suggestion.confidence}%</span>
                </div>
                <progress
                  className={`progress ${
                    suggestion.confidence >= 90
                      ? 'progress-success'
                      : suggestion.confidence >= 70
                        ? 'progress-warning'
                        : 'progress-error'
                  } w-full`}
                  value={suggestion.confidence}
                  max="100"
                />
              </div>
            </div>
          </div>
        ))}
      </div>

      {suggestions.length === 0 && (
        <div className="card bg-base-100 shadow-lg">
          <div className="card-body items-center text-center py-16">
            <FiFolder className="w-20 h-20 text-neutral/20 mb-4" />
            <h3 className="text-2xl font-bold mb-2">No Files to Organize</h3>
            <p className="text-neutral/60">
              Analyze some files first to see organization suggestions here
            </p>
            <button className="btn btn-primary mt-4">Go to Files</button>
          </div>
        </div>
      )}
    </div>
  );
}

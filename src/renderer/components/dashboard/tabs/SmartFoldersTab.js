import React, { useState } from 'react';
import {
  FiFolder,
  FiPlus,
  FiEdit2,
  FiTrash2,
  FiRefreshCw,
  FiCheck,
  FiBarChart,
} from 'react-icons/fi';

// Helper function to get color classes
const getColorClasses = (color) => {
  const colorMap = {
    primary: {
      border: 'border-primary',
      bg: 'bg-primary/10',
      text: 'text-primary',
    },
    secondary: {
      border: 'border-secondary',
      bg: 'bg-secondary/10',
      text: 'text-secondary',
    },
    success: {
      border: 'border-success',
      bg: 'bg-success/10',
      text: 'text-success',
    },
    accent: {
      border: 'border-accent',
      bg: 'bg-accent/10',
      text: 'text-accent',
    },
    warning: {
      border: 'border-warning',
      bg: 'bg-warning/10',
      text: 'text-warning',
    },
    info: {
      border: 'border-info',
      bg: 'bg-info/10',
      text: 'text-info',
    },
    neutral: {
      border: 'border-neutral',
      bg: 'bg-neutral/10',
      text: 'text-neutral',
    },
  };
  return colorMap[color] || colorMap.neutral;
};

export default function SmartFoldersTab() {
  const [folders, setFolders] = useState([
    {
      id: 1,
      name: 'Work Documents',
      path: 'C:\\Users\\Documents\\Work Documents',
      description: 'Work-related PDFs, proposals, and reports',
      filesCount: 127,
      lastUsed: '2 hours ago',
      color: 'primary',
      enabled: true,
    },
    {
      id: 2,
      name: 'Finances',
      path: 'C:\\Users\\Documents\\Finances',
      description: 'Invoices, receipts, and financial documents',
      filesCount: 89,
      lastUsed: '1 day ago',
      color: 'success',
      enabled: true,
    },
    {
      id: 3,
      name: 'Photos',
      path: 'C:\\Users\\Pictures\\Photos',
      description: 'Personal photos and images',
      filesCount: 543,
      lastUsed: '5 hours ago',
      color: 'secondary',
      enabled: true,
    },
    {
      id: 4,
      name: 'Music',
      path: 'C:\\Users\\Music',
      description: 'Audio files and music',
      filesCount: 234,
      lastUsed: '3 days ago',
      color: 'accent',
      enabled: false,
    },
  ]);

  const [showAddModal, setShowAddModal] = useState(false);
  const [newFolder, setNewFolder] = useState({
    name: '',
    path: '',
    description: '',
  });

  const totalFiles = folders.reduce((sum, f) => sum + f.filesCount, 0);
  const activeCount = folders.filter((f) => f.enabled).length;

  const handleAddFolder = () => {
    if (newFolder.name && newFolder.path) {
      setFolders([
        ...folders,
        {
          id: Date.now(),
          ...newFolder,
          filesCount: 0,
          lastUsed: 'Never',
          color: 'neutral',
          enabled: true,
        },
      ]);
      setNewFolder({ name: '', path: '', description: '' });
      setShowAddModal(false);
    }
  };

  const handleToggle = (id) => {
    setFolders((prev) =>
      prev.map((f) => (f.id === id ? { ...f, enabled: !f.enabled } : f)),
    );
  };

  const handleDelete = (id) => {
    if (confirm('Are you sure you want to delete this folder?')) {
      setFolders((prev) => prev.filter((f) => f.id !== id));
    }
  };

  return (
    <div className="space-y-6">
      {/* Stats */}
      <div className="stats shadow-lg w-full bg-base-100">
        <div className="stat">
          <div className="stat-figure text-primary">
            <FiFolder className="w-8 h-8" />
          </div>
          <div className="stat-title">Total Folders</div>
          <div className="stat-value text-primary">{folders.length}</div>
          <div className="stat-desc">{activeCount} active</div>
        </div>

        <div className="stat">
          <div className="stat-figure text-success">
            <FiCheck className="w-8 h-8" />
          </div>
          <div className="stat-title">Files Organized</div>
          <div className="stat-value text-success">{totalFiles}</div>
          <div className="stat-desc">Across all folders</div>
        </div>

        <div className="stat">
          <div className="stat-figure text-secondary">
            <FiBarChart className="w-8 h-8" />
          </div>
          <div className="stat-title">Most Active</div>
          <div className="stat-value text-lg">
            {folders.sort((a, b) => b.filesCount - a.filesCount)[0]?.name ||
              'None'}
          </div>
          <div className="stat-desc">
            {folders.sort((a, b) => b.filesCount - a.filesCount)[0]
              ?.filesCount || 0}{' '}
            files
          </div>
        </div>
      </div>

      {/* Action Bar */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">Smart Folders</h2>
          <p className="text-sm text-neutral/60 mt-1">
            Configure destination folders for automatic organization
          </p>
        </div>
        <div className="flex gap-2">
          <button className="btn btn-outline gap-2">
            <FiRefreshCw className="w-4 h-4" />
            Rebuild Embeddings
          </button>
          <button
            className="btn btn-primary gap-2"
            onClick={() => setShowAddModal(true)}
          >
            <FiPlus className="w-4 h-4" />
            Add Folder
          </button>
        </div>
      </div>

      {/* Folders Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {folders.map((folder) => {
          const colors = getColorClasses(folder.color);
          return (
            <div
              key={folder.id}
              className={`card bg-base-100 shadow-lg border-l-4 ${
                folder.enabled ? colors.border : 'border-neutral opacity-60'
              }`}
            >
              <div className="card-body">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-2">
                      <div
                        className={`w-12 h-12 rounded-lg ${colors.bg} flex items-center justify-center`}
                      >
                        <FiFolder className={`w-6 h-6 ${colors.text}`} />
                      </div>
                      <div>
                        <h3 className="font-bold text-lg">{folder.name}</h3>
                        <p className="text-xs text-neutral/60">
                          {folder.description}
                        </p>
                      </div>
                    </div>

                    <div className="space-y-2 mt-4">
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-neutral/60">Location:</span>
                        <code className="text-xs bg-base-200 px-2 py-1 rounded">
                          {folder.path}
                        </code>
                      </div>
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-neutral/60">Files:</span>
                        <span className="font-medium">{folder.filesCount}</span>
                      </div>
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-neutral/60">Last Used:</span>
                        <span className="font-medium">{folder.lastUsed}</span>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="card-actions justify-between mt-4 pt-4 border-t border-base-200">
                  <div className="form-control">
                    <label className="label cursor-pointer gap-2">
                      <span className="label-text font-medium">Active</span>
                      <input
                        type="checkbox"
                        className="toggle toggle-success"
                        checked={folder.enabled}
                        onChange={() => handleToggle(folder.id)}
                      />
                    </label>
                  </div>
                  <div className="flex gap-1">
                    <button className="btn btn-sm btn-ghost gap-2">
                      <FiEdit2 className="w-4 h-4" />
                      Edit
                    </button>
                    <button
                      className="btn btn-sm btn-ghost text-error gap-2"
                      onClick={() => handleDelete(folder.id)}
                    >
                      <FiTrash2 className="w-4 h-4" />
                      Delete
                    </button>
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Add Folder Modal */}
      {showAddModal && (
        <div className="modal modal-open">
          <div className="modal-box">
            <h3 className="font-bold text-lg mb-4">Add New Smart Folder</h3>

            <div className="space-y-4">
              <div className="form-control">
                <label className="label">
                  <span className="label-text">Folder Name</span>
                </label>
                <input
                  type="text"
                  placeholder="e.g., Work Documents"
                  className="input input-bordered"
                  value={newFolder.name}
                  onChange={(e) =>
                    setNewFolder({ ...newFolder, name: e.target.value })
                  }
                />
              </div>

              <div className="form-control">
                <label className="label">
                  <span className="label-text">Path</span>
                </label>
                <div className="input-group">
                  <input
                    type="text"
                    placeholder="C:\Users\Documents\Folder"
                    className="input input-bordered flex-1"
                    value={newFolder.path}
                    onChange={(e) =>
                      setNewFolder({ ...newFolder, path: e.target.value })
                    }
                  />
                  <button className="btn btn-square">
                    <FiFolder className="w-4 h-4" />
                  </button>
                </div>
              </div>

              <div className="form-control">
                <label className="label">
                  <span className="label-text">Description (optional)</span>
                </label>
                <textarea
                  placeholder="What types of files should go here?"
                  className="textarea textarea-bordered"
                  value={newFolder.description}
                  onChange={(e) =>
                    setNewFolder({ ...newFolder, description: e.target.value })
                  }
                />
              </div>
            </div>

            <div className="modal-action">
              <button
                className="btn btn-ghost"
                onClick={() => setShowAddModal(false)}
              >
                Cancel
              </button>
              <button
                className="btn btn-primary"
                onClick={handleAddFolder}
                disabled={!newFolder.name || !newFolder.path}
              >
                Add Folder
              </button>
            </div>
          </div>
          <div
            className="modal-backdrop"
            onClick={() => setShowAddModal(false)}
          />
        </div>
      )}

      {folders.length === 0 && (
        <div className="card bg-base-100 shadow-lg">
          <div className="card-body items-center text-center py-16">
            <FiFolder className="w-20 h-20 text-neutral/20 mb-4" />
            <h3 className="text-2xl font-bold mb-2">No Folders Yet</h3>
            <p className="text-neutral/60 mb-4">
              Add your first smart folder to start organizing files
            </p>
            <button
              className="btn btn-primary gap-2"
              onClick={() => setShowAddModal(true)}
            >
              <FiPlus className="w-4 h-4" />
              Add Your First Folder
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

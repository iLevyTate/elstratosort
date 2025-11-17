import React, { useState } from 'react';
import {
  FiUpload,
  FiFile,
  FiFolder,
  FiClock,
  FiCheck,
  FiAlertCircle,
  FiEye,
  FiTrash2,
  FiSearch,
} from 'react-icons/fi';

export default function FilesTab() {
  const [files] = useState([
    {
      id: 1,
      name: 'Project_Proposal.pdf',
      type: 'PDF',
      size: '2.4 MB',
      status: 'analyzed',
      confidence: 95,
      suggestedFolder: 'Work Documents',
      date: '2025-10-28',
    },
    {
      id: 2,
      name: 'vacation_photos.zip',
      type: 'Archive',
      size: '145 MB',
      status: 'pending',
      confidence: null,
      suggestedFolder: null,
      date: '2025-10-27',
    },
    {
      id: 3,
      name: 'invoice_oct_2025.xlsx',
      type: 'Excel',
      size: '156 KB',
      status: 'analyzed',
      confidence: 98,
      suggestedFolder: 'Finances',
      date: '2025-10-26',
    },
  ]);

  const [filter, setFilter] = useState('all');

  const stats = {
    total: files.length,
    analyzed: files.filter((f) => f.status === 'analyzed').length,
    pending: files.filter((f) => f.status === 'pending').length,
    errors: files.filter((f) => f.status === 'error').length,
  };

  const filteredFiles =
    filter === 'all' ? files : files.filter((f) => f.status === filter);

  const getStatusBadge = (status, confidence) => {
    if (status === 'analyzed') {
      return (
        <div className="badge badge-success gap-1">
          <FiCheck className="w-3 h-3" />
          {confidence}% confident
        </div>
      );
    }
    if (status === 'pending') {
      return (
        <div className="badge badge-warning gap-1">
          <FiClock className="w-3 h-3" />
          Pending
        </div>
      );
    }
    if (status === 'error') {
      return (
        <div className="badge badge-error gap-1">
          <FiAlertCircle className="w-3 h-3" />
          Error
        </div>
      );
    }
  };

  return (
    <div className="space-y-6">
      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="stats shadow-lg bg-base-100">
          <div className="stat">
            <div className="stat-figure text-primary">
              <FiFile className="w-8 h-8" />
            </div>
            <div className="stat-title">Total Files</div>
            <div className="stat-value text-primary">{stats.total}</div>
            <div className="stat-desc">Ready to organize</div>
          </div>
        </div>

        <div className="stats shadow-lg bg-base-100">
          <div className="stat">
            <div className="stat-figure text-success">
              <FiCheck className="w-8 h-8" />
            </div>
            <div className="stat-title">Analyzed</div>
            <div className="stat-value text-success">{stats.analyzed}</div>
            <div className="stat-desc">AI processed</div>
          </div>
        </div>

        <div className="stats shadow-lg bg-base-100">
          <div className="stat">
            <div className="stat-figure text-warning">
              <FiClock className="w-8 h-8" />
            </div>
            <div className="stat-title">Pending</div>
            <div className="stat-value text-warning">{stats.pending}</div>
            <div className="stat-desc">Awaiting analysis</div>
          </div>
        </div>

        <div className="stats shadow-lg bg-base-100">
          <div className="stat">
            <div className="stat-figure text-error">
              <FiAlertCircle className="w-8 h-8" />
            </div>
            <div className="stat-title">Errors</div>
            <div className="stat-value text-error">{stats.errors}</div>
            <div className="stat-desc">Need attention</div>
          </div>
        </div>
      </div>

      {/* Upload Zone */}
      <div className="card bg-gradient-to-br from-primary/10 to-secondary/10 border-2 border-dashed border-primary/30 shadow-lg">
        <div className="card-body items-center text-center">
          <FiUpload className="w-16 h-16 text-primary mb-4" />
          <h2 className="card-title text-2xl">Drag & Drop Files Here</h2>
          <p className="text-neutral/70">or click to browse your computer</p>
          <div className="card-actions mt-4">
            <button className="btn btn-primary gap-2">
              <FiFolder className="w-4 h-4" />
              Browse Files
            </button>
            <button className="btn btn-outline btn-primary gap-2">
              <FiFolder className="w-4 h-4" />
              Browse Folders
            </button>
          </div>
          <div className="mt-4 text-sm text-neutral/50">
            Supports: PDF, Images, Documents, Archives, and more
          </div>
        </div>
      </div>

      {/* Files List */}
      <div className="card bg-base-100 shadow-xl">
        <div className="card-body">
          <div className="flex items-center justify-between mb-4">
            <h2 className="card-title text-2xl">
              <FiFile className="w-6 h-6" />
              Files
            </h2>

            {/* Search and Filters */}
            <div className="flex items-center gap-2">
              <div className="form-control">
                <div className="input-group input-group-sm">
                  <input
                    type="text"
                    placeholder="Search files..."
                    className="input input-sm input-bordered"
                  />
                  <button className="btn btn-sm btn-square">
                    <FiSearch />
                  </button>
                </div>
              </div>

              <div className="btn-group">
                <button
                  className={`btn btn-sm ${filter === 'all' ? 'btn-active' : ''}`}
                  onClick={() => setFilter('all')}
                >
                  All
                </button>
                <button
                  className={`btn btn-sm ${filter === 'analyzed' ? 'btn-active' : ''}`}
                  onClick={() => setFilter('analyzed')}
                >
                  Analyzed
                </button>
                <button
                  className={`btn btn-sm ${filter === 'pending' ? 'btn-active' : ''}`}
                  onClick={() => setFilter('pending')}
                >
                  Pending
                </button>
              </div>
            </div>
          </div>

          {/* Files Table */}
          <div className="overflow-x-auto">
            <table className="table table-zebra">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Type</th>
                  <th>Size</th>
                  <th>Status</th>
                  <th>Suggested Folder</th>
                  <th>Date</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredFiles.map((file) => (
                  <tr key={file.id} className="hover">
                    <td>
                      <div className="flex items-center gap-2">
                        <FiFile className="w-4 h-4 text-primary" />
                        <span className="font-medium">{file.name}</span>
                      </div>
                    </td>
                    <td>
                      <div className="badge badge-outline">{file.type}</div>
                    </td>
                    <td className="text-neutral/70">{file.size}</td>
                    <td>{getStatusBadge(file.status, file.confidence)}</td>
                    <td>
                      {file.suggestedFolder ? (
                        <div className="flex items-center gap-2">
                          <FiFolder className="w-4 h-4 text-success" />
                          <span className="font-medium">
                            {file.suggestedFolder}
                          </span>
                        </div>
                      ) : (
                        <span className="text-neutral/50">-</span>
                      )}
                    </td>
                    <td className="text-neutral/70">{file.date}</td>
                    <td>
                      <div className="flex gap-1">
                        <button
                          className="btn btn-xs btn-ghost"
                          title="Preview"
                        >
                          <FiEye className="w-4 h-4" />
                        </button>
                        <button
                          className="btn btn-xs btn-ghost text-error"
                          title="Delete"
                        >
                          <FiTrash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {filteredFiles.length === 0 && (
            <div className="text-center py-12 text-neutral/50">
              <FiFile className="w-16 h-16 mx-auto mb-4 opacity-30" />
              <p className="text-lg">
                No files found. Drop some files to get started!
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

import React, { memo } from 'react';
import PropTypes from 'prop-types';
import { FolderCheck, CheckCircle2, AlertTriangle } from 'lucide-react';

const StatusOverview = memo(function StatusOverview({
  unprocessedCount = 0,
  processedCount = 0,
  failedCount = 0
}) {
  return (
    <div className="stats-grid">
      <div className="surface-card text-center p-4 flex flex-col items-center gap-2">
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center justify-center w-8 h-8 rounded-full bg-stratosort-blue/10 text-stratosort-blue">
            <FolderCheck className="w-4 h-4" aria-hidden />
          </span>
          <div className="text-xs font-semibold text-stratosort-blue/80 uppercase tracking-wide">
            Ready to Organize
          </div>
        </div>
        <div className="text-xl font-bold text-stratosort-blue">{unprocessedCount}</div>
      </div>

      <div className="surface-card text-center p-4 flex flex-col items-center gap-2">
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center justify-center w-8 h-8 rounded-full bg-stratosort-success/10 text-stratosort-success">
            <CheckCircle2 className="w-4 h-4" aria-hidden />
          </span>
          <div className="text-xs font-semibold text-stratosort-success/90 uppercase tracking-wide">
            Already Organized
          </div>
        </div>
        <div className="text-xl font-bold text-stratosort-success">{processedCount}</div>
      </div>

      <div className="surface-card text-center p-4 flex flex-col items-center gap-2">
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center justify-center w-8 h-8 rounded-full bg-stratosort-danger/10 text-stratosort-danger">
            <AlertTriangle className="w-4 h-4" aria-hidden />
          </span>
          <div className="text-xs font-semibold text-stratosort-danger/80 uppercase tracking-wide">
            Failed Analysis
          </div>
        </div>
        <div className="text-xl font-bold text-stratosort-danger">{failedCount}</div>
      </div>
    </div>
  );
});

StatusOverview.propTypes = {
  unprocessedCount: PropTypes.number,
  processedCount: PropTypes.number,
  failedCount: PropTypes.number
};

export default StatusOverview;

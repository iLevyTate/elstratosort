import React, { memo } from 'react';

interface StatusOverviewProps {
  unprocessedCount?: number;
  processedCount?: number;
  failedCount?: number;
}

const StatusOverview = memo(function StatusOverview({
  unprocessedCount = 0,
  processedCount = 0,
  failedCount = 0,
}: StatusOverviewProps) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-13">
      <div className="text-center p-13 bg-stratosort-blue/10 rounded-lg border border-stratosort-blue/20">
        <div className="text-2xl font-bold text-stratosort-blue">
          {unprocessedCount}
        </div>
        <div className="text-sm text-system-blue">Ready to Organize</div>
      </div>
      <div className="text-center p-13 bg-stratosort-success/10 rounded-lg border border-stratosort-success/20">
        <div className="text-2xl font-bold text-stratosort-success">
          {processedCount}
        </div>
        <div className="text-sm text-system-green">Already Organized</div>
      </div>
      <div className="text-center p-13 bg-system-gray-100 rounded-lg border border-system-gray-200">
        <div className="text-2xl font-bold text-system-gray-600">
          {failedCount}
        </div>
        <div className="text-sm text-system-gray-700">Failed Analysis</div>
      </div>
    </div>
  );
});

export default StatusOverview;

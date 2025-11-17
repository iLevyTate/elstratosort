import React from 'react';
import {
  FiTrendingUp,
  FiFolder,
  FiFile,
  FiClock,
  FiAward,
  FiActivity,
} from 'react-icons/fi';

// Helper function to get color classes
const getColorClasses = (color) => {
  const colorMap = {
    primary: {
      bg: 'bg-primary',
      progress: 'progress-primary',
      text: 'text-primary',
    },
    secondary: {
      bg: 'bg-secondary',
      progress: 'progress-secondary',
      text: 'text-secondary',
    },
    success: {
      bg: 'bg-success',
      progress: 'progress-success',
      text: 'text-success',
    },
    accent: {
      bg: 'bg-accent',
      progress: 'progress-accent',
      text: 'text-accent',
    },
    warning: {
      bg: 'bg-warning',
      progress: 'progress-warning',
      text: 'text-warning',
    },
    info: { bg: 'bg-info', progress: 'progress-info', text: 'text-info' },
    error: { bg: 'bg-error', progress: 'progress-error', text: 'text-error' },
  };
  return colorMap[color] || colorMap.primary;
};

export default function AnalyticsTab() {
  // Mock data for demonstration
  const stats = {
    totalOrganized: 1247,
    thisWeek: 89,
    avgConfidence: 94,
    timesSaved: '12.4 hours',
    topFolder: 'Work Documents',
    accuracy: 96,
  };

  const weeklyData = [
    { day: 'Mon', files: 15 },
    { day: 'Tue', files: 23 },
    { day: 'Wed', files: 18 },
    { day: 'Thu', files: 31 },
    { day: 'Fri', files: 27 },
    { day: 'Sat', files: 8 },
    { day: 'Sun', files: 12 },
  ];

  const folderDistribution = [
    { name: 'Work Documents', count: 342, percentage: 27, color: 'primary' },
    { name: 'Photos', count: 298, percentage: 24, color: 'secondary' },
    { name: 'Finances', count: 187, percentage: 15, color: 'success' },
    { name: 'Music', count: 156, percentage: 13, color: 'accent' },
    { name: 'Videos', count: 134, percentage: 11, color: 'warning' },
    { name: 'Other', count: 130, percentage: 10, color: 'info' },
  ];

  const recentActivity = [
    {
      id: 1,
      action: 'Organized 23 files',
      folder: 'Work Documents',
      time: '2 hours ago',
      type: 'success',
    },
    {
      id: 2,
      action: 'Added new folder',
      folder: 'Tax Documents',
      time: '5 hours ago',
      type: 'info',
    },
    {
      id: 3,
      action: 'Organized 15 files',
      folder: 'Photos',
      time: '1 day ago',
      type: 'success',
    },
    {
      id: 4,
      action: 'Rebuilt embeddings',
      folder: 'All Folders',
      time: '2 days ago',
      type: 'info',
    },
  ];

  const maxFiles = Math.max(...weeklyData.map((d) => d.files));

  return (
    <div className="space-y-6">
      {/* Key Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="card bg-gradient-to-br from-primary to-primary/70 text-white shadow-xl">
          <div className="card-body">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-white/80 text-sm font-medium">
                  Total Organized
                </p>
                <p className="text-4xl font-bold mt-2">
                  {stats.totalOrganized.toLocaleString()}
                </p>
                <p className="text-white/70 text-xs mt-1">
                  +{stats.thisWeek} this week
                </p>
              </div>
              <FiFile className="w-16 h-16 opacity-20" />
            </div>
          </div>
        </div>

        <div className="card bg-gradient-to-br from-success to-success/70 text-white shadow-xl">
          <div className="card-body">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-white/80 text-sm font-medium">
                  Avg Confidence
                </p>
                <p className="text-4xl font-bold mt-2">
                  {stats.avgConfidence}%
                </p>
                <p className="text-white/70 text-xs mt-1">
                  {stats.accuracy}% accuracy
                </p>
              </div>
              <FiAward className="w-16 h-16 opacity-20" />
            </div>
          </div>
        </div>

        <div className="card bg-gradient-to-br from-secondary to-secondary/70 text-white shadow-xl">
          <div className="card-body">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-white/80 text-sm font-medium">Time Saved</p>
                <p className="text-4xl font-bold mt-2">{stats.timesSaved}</p>
                <p className="text-white/70 text-xs mt-1">This month</p>
              </div>
              <FiClock className="w-16 h-16 opacity-20" />
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Weekly Activity Chart */}
        <div className="card bg-base-100 shadow-xl">
          <div className="card-body">
            <div className="flex items-center justify-between mb-4">
              <h2 className="card-title">
                <FiActivity className="w-5 h-5" />
                Weekly Activity
              </h2>
              <div className="badge badge-primary">Last 7 Days</div>
            </div>

            <div className="space-y-3">
              {weeklyData.map((item) => (
                <div key={item.day} className="space-y-1">
                  <div className="flex items-center justify-between text-sm">
                    <span className="font-medium">{item.day}</span>
                    <span className="text-neutral/60">{item.files} files</span>
                  </div>
                  <div className="relative w-full h-8 bg-base-200 rounded-lg overflow-hidden">
                    <div
                      className="absolute inset-y-0 left-0 bg-gradient-to-r from-primary to-secondary rounded-lg transition-all duration-500"
                      style={{
                        width: `${(item.files / maxFiles) * 100}%`,
                      }}
                    />
                    <div className="absolute inset-0 flex items-center px-3">
                      <span className="text-xs font-semibold text-white mix-blend-difference">
                        {item.files}
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <div className="flex items-center gap-2 mt-4 pt-4 border-t border-base-200">
              <FiTrendingUp className="w-4 h-4 text-success" />
              <span className="text-sm text-success font-medium">
                +23% from last week
              </span>
            </div>
          </div>
        </div>

        {/* Folder Distribution */}
        <div className="card bg-base-100 shadow-xl">
          <div className="card-body">
            <h2 className="card-title mb-4">
              <FiFolder className="w-5 h-5" />
              Folder Distribution
            </h2>

            <div className="space-y-4">
              {folderDistribution.map((folder) => {
                const colors = getColorClasses(folder.color);
                return (
                  <div key={folder.name} className="space-y-2">
                    <div className="flex items-center justify-between text-sm">
                      <div className="flex items-center gap-2">
                        <div className={`w-3 h-3 rounded-full ${colors.bg}`} />
                        <span className="font-medium">{folder.name}</span>
                      </div>
                      <div className="text-right">
                        <span className="font-bold">{folder.count}</span>
                        <span className="text-neutral/60 ml-1">
                          ({folder.percentage}%)
                        </span>
                      </div>
                    </div>
                    <progress
                      className={`progress ${colors.progress} w-full`}
                      value={folder.percentage}
                      max="100"
                    />
                  </div>
                );
              })}
            </div>

            <div className="alert alert-info mt-4">
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
              <span className="text-sm">
                Most active: <strong>{stats.topFolder}</strong>
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Recent Activity */}
      <div className="card bg-base-100 shadow-xl">
        <div className="card-body">
          <h2 className="card-title mb-4">
            <FiClock className="w-5 h-5" />
            Recent Activity
          </h2>

          <div className="space-y-3">
            {recentActivity.map((activity) => {
              const colors = getColorClasses(activity.type);
              return (
                <div
                  key={activity.id}
                  className="flex items-center gap-4 p-3 bg-base-200 rounded-lg hover:bg-base-300 transition-colors"
                >
                  <div
                    className={`w-10 h-10 rounded-full ${colors.bg}/10 flex items-center justify-center`}
                  >
                    {activity.type === 'success' ? (
                      <FiFile className={`w-5 h-5 ${colors.text}`} />
                    ) : (
                      <FiFolder className={`w-5 h-5 ${colors.text}`} />
                    )}
                  </div>
                  <div className="flex-1">
                    <p className="font-medium">{activity.action}</p>
                    <p className="text-sm text-neutral/60">{activity.folder}</p>
                  </div>
                  <div className="text-sm text-neutral/60">{activity.time}</div>
                </div>
              );
            })}
          </div>

          <button className="btn btn-outline btn-block mt-4">
            View All Activity
          </button>
        </div>
      </div>

      {/* Performance Insights */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="alert alert-success">
          <FiTrendingUp className="w-6 h-6" />
          <div>
            <h3 className="font-bold">Great Job!</h3>
            <div className="text-sm">
              You&apos;ve organized {stats.avgConfidence}% more files than last
              month
            </div>
          </div>
        </div>

        <div className="alert alert-info">
          <FiAward className="w-6 h-6" />
          <div>
            <h3 className="font-bold">High Accuracy</h3>
            <div className="text-sm">
              Your organization accuracy is at {stats.accuracy}%
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

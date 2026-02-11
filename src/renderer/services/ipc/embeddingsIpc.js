import { requireElectronAPI } from './electronApi';

const EMBEDDINGS_STATS_CACHE_MS = 15000;
let cachedStats = null;
let cacheExpiresAt = 0;
let inFlightStatsPromise = null;
let latestStatsRequestId = 0;
let latestAppliedStatsRequestId = 0;

function shouldUseCachedStats() {
  return cachedStats !== null && Date.now() < cacheExpiresAt;
}

export const embeddingsIpc = {
  getStats() {
    return requireElectronAPI().embeddings.getStats();
  },
  async getStatsCached({ forceRefresh = false } = {}) {
    if (!forceRefresh && shouldUseCachedStats()) {
      return cachedStats;
    }
    if (!forceRefresh && inFlightStatsPromise) {
      return inFlightStatsPromise;
    }

    const requestId = ++latestStatsRequestId;
    const request = requireElectronAPI()
      .embeddings.getStats()
      .then((result) => {
        // Prevent older, slower responses from overwriting newer cache values.
        if (requestId >= latestAppliedStatsRequestId) {
          latestAppliedStatsRequestId = requestId;
          cachedStats = result;
          cacheExpiresAt = Date.now() + EMBEDDINGS_STATS_CACHE_MS;
        }
        return result;
      })
      .finally(() => {
        if (inFlightStatsPromise === request) {
          inFlightStatsPromise = null;
        }
      });

    inFlightStatsPromise = request;
    return request;
  },
  invalidateStatsCache() {
    cachedStats = null;
    cacheExpiresAt = 0;
    latestAppliedStatsRequestId = 0;
  },
  rebuildFiles() {
    return requireElectronAPI().embeddings.rebuildFiles();
  }
};

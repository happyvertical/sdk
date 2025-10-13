import { __require as requireSymbols } from "./index53.js";
var stats;
var hasRequiredStats;
function requireStats() {
  if (hasRequiredStats) return stats;
  hasRequiredStats = 1;
  const {
    kConnected,
    kPending,
    kRunning,
    kSize,
    kFree,
    kQueued
  } = requireSymbols();
  class ClientStats {
    constructor(client) {
      this.connected = client[kConnected];
      this.pending = client[kPending];
      this.running = client[kRunning];
      this.size = client[kSize];
    }
  }
  class PoolStats {
    constructor(pool) {
      this.connected = pool[kConnected];
      this.free = pool[kFree];
      this.pending = pool[kPending];
      this.queued = pool[kQueued];
      this.running = pool[kRunning];
      this.size = pool[kSize];
    }
  }
  stats = { ClientStats, PoolStats };
  return stats;
}
export {
  requireStats as __require
};
//# sourceMappingURL=index61.js.map

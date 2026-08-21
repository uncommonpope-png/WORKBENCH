/**
 * Temporal Memory Engine
 * Tracks real-time agent state evolution across execution cycles.
 */
class TemporalMemoryEngine {
  constructor(options = {}) {
    this.maxHistory = options.maxHistory || 1000;
    this.snapshots = [];
  }

  recordCycle(cycleId, stateDelta, metadata = {}) {
    const snapshot = {
      cycleId,
      timestamp: Date.now(),
      stateDelta,
      metadata,
    };
    this.snapshots.push(snapshot);
    if (this.snapshots.length > this.maxHistory) {
      this.snapshots.shift();
    }
    return snapshot;
  }

  getTimeline(limit = 50) {
    return this.snapshots.slice(-limit);
  }
}

module.exports = TemporalMemoryEngine;

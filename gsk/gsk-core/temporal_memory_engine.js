/**
 * Temporal Memory Synthesis Engine
 * Synthesizes agent self-reflection logs and tracks PLT yield over temporal cycles.
 */
class TemporalMemoryEngine {
  constructor(options = {}) {
    this.history = [];
    this.distillationThreshold = options.distillationThreshold || 0.7;
  }

  recordReflection(entry) {
    const timestamp = Date.now();
    const pltYield = (entry.profit || 0) + (entry.love || 0) - (entry.tax || 0);
    const record = {
      id: `mem_${timestamp}_${Math.random().toString(36).substr(2, 5)}`,
      timestamp,
      cycle: entry.cycle || this.history.length + 1,
      valence: entry.valence || 0,
      arousal: entry.arousal || 0,
      reflectionText: entry.text || '',
      pltYield,
      profit: entry.profit || 0,
      love: entry.love || 0,
      tax: entry.tax || 0,
      distilled: false
    };
    this.history.push(record);
    return record;
  }

  synthesizeTrajectory(horizon = 10) {
    const recent = this.history.slice(-horizon);
    if (recent.length === 0) return { avgPltYield: 0, trajectory: 'neutral', distilledInsights: [] };
    const totalYield = recent.reduce((sum, r) => sum + r.pltYield, 0);
    const avgPltYield = totalYield / recent.length;
    const trend = recent.length > 1 ? recent[recent.length - 1].pltYield - recent[0].pltYield : 0;
    const distilledInsights = recent.filter(r => r.pltYield >= this.distillationThreshold).map(r => r.reflectionText);
    return {
      avgPltYield,
      trend: trend > 0 ? 'improving' : trend < 0 ? 'decaying' : 'stable',
      distilledInsights,
      count: recent.length
    };
  }
}

module.exports = { TemporalMemoryEngine };

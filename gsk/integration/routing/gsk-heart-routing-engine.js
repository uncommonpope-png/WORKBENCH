/**
 * GSK-HEART Routing Engine
 * Ported from OmniRoute src/lib/routerEval/index.ts
 * CommonJS format for GSK fusion-loader integration
 * 
 * Features:
 * - AIQ Scoring (Artificial Intelligence Quotient)
 * - Pareto Frontier Optimization
 * - Multi-metric routing (latency, cost, success rate)
 */

const providerCatalog = require('../catalogs/provider-catalog');

/**
 * Compute AIQ score for a model configuration
 * Formula: AIQ = (successRate * 100) - (latencyMs / 1000) - (costUsd * 1000)
 * 
 * @param {number} successRate - 0.0 to 1.0
 * @param {number} avgLatencyMs - Average latency in milliseconds
 * @param {number} avgCostUsd - Average cost in USD
 * @returns {number} AIQ score (higher is better)
 */
function computeAIQ(successRate, avgLatencyMs, avgCostUsd) {
  const latencyPenalty = avgLatencyMs / 1000;
  const costPenalty = avgCostUsd * 1000;
  const aiq = (successRate * 100) - latencyPenalty - costPenalty;
  return Number(aiq.toFixed(3));
}

/**
 * Calculate percentile from sorted array
 * @param {number[]} sortedValues - Sorted array of numbers
 * @param {number} p - Percentile (0.0 to 1.0)
 * @returns {number} Percentile value
 */
function percentile(sortedValues, p) {
  if (sortedValues.length === 0) return 0;
  if (sortedValues.length === 1) return sortedValues[0];
  const bounded = Math.min(1, Math.max(0, p));
  const index = Math.floor((sortedValues.length - 1) * bounded);
  return sortedValues[index] ?? 0;
}

/**
 * Aggregate latency/cost values
 * @param {number[]} values - Array of numeric values
 * @returns {{avg: number, p50: number, p95: number}}
 */
function aggregateValues(values) {
  if (values.length === 0) return { avg: 0, p50: 0, p95: 0 };
  const sorted = [...values].sort((a, b) => a - b);
  const sum = sorted.reduce((acc, value) => acc + value, 0);
  return {
    avg: sum / sorted.length,
    p50: percentile(sorted, 0.5),
    p95: percentile(sorted, 0.95),
  };
}

/**
 * Configuration aggregate structure
 * @typedef {Object} RouterConfigAggregate
 * @property {string} configId
 * @property {number} samples
 * @property {number} successRate
 * @property {number} avgLatencyMs
 * @property {number} p50LatencyMs
 * @property {number} p95LatencyMs
 * @property {number} avgCostUsd
 * @property {number} aiq
 */

/**
 * Compute Pareto Frontier for multi-objective optimization
 * Finds configurations that are not dominated by any other
 * (better in at least one metric, not worse in any)
 * 
 * @param {RouterConfigAggregate[]} configs - Array of config aggregates
 * @returns {RouterConfigAggregate[]} Pareto frontier configs
 */
function computeParetoFrontier(configs) {
  const ordered = [...configs].sort(
    (a, b) => a.avgCostUsd - b.avgCostUsd || a.avgLatencyMs - b.avgLatencyMs
  );
  const frontier = [];

  for (const config of ordered) {
    const dominated = frontier.some(
      (candidate) =>
        candidate.aiq >= config.aiq &&
        candidate.avgCostUsd <= config.avgCostUsd &&
        candidate.avgLatencyMs <= config.avgLatencyMs
    );
    if (!dominated) frontier.push(config);
  }

  return frontier.sort((a, b) => b.aiq - a.aiq || a.avgCostUsd - b.avgCostUsd);
}

/**
 * Summarize observations into config aggregates
 * @param {Array} observations - Raw observation data
 * @returns {{configurations: RouterConfigAggregate[], frontier: RouterConfigAggregate[], top: RouterConfigAggregate[]}}
 */
function summarizeObservations(observations) {
  const byConfig = new Map();
  
  for (const obs of observations) {
    if (!byConfig.has(obs.configId)) byConfig.set(obs.configId, []);
    byConfig.get(obs.configId).push(obs);
  }

  const configurations = [];
  for (const [configId, rows] of byConfig) {
    const latencies = rows.map((row) => Math.max(0, row.latencyMs));
    const costs = rows.map((row) => Math.max(0, row.costUsd));
    const latencyStats = aggregateValues(latencies);
    const costStats = aggregateValues(costs);
    const successCount = rows.filter((row) => row.success).length;
    const successRate = rows.length === 0 ? 0 : successCount / rows.length;
    
    configurations.push({
      configId,
      samples: rows.length,
      successRate,
      avgLatencyMs: latencyStats.avg,
      p50LatencyMs: latencyStats.p50,
      p95LatencyMs: latencyStats.p95,
      avgCostUsd: costStats.avg,
      aiq: computeAIQ(successRate, latencyStats.avg, costStats.avg),
    });
  }

  const top = [...configurations].sort(
    (a, b) =>
      b.aiq - a.aiq ||
      b.successRate - a.successRate ||
      a.avgLatencyMs - b.avgLatencyMs ||
      a.avgCostUsd - b.avgCostUsd
  );
  
  const frontier = computeParetoFrontier(configurations);

  return {
    configurations: configurations.sort((a, b) => b.aiq - a.aiq),
    frontier,
    top,
  };
}

/**
 * GSK Heart Router Class
 * Main interface for model selection and routing
 */
class GSKHeartRouter {
  constructor(options = {}) {
    this.metricsCache = new Map(); // configId -> metrics
    this.defaultWeights = options.weights || {
      aiq: 0.5,
      latency: 0.3,
      cost: 0.2,
    };
  }

  /**
   * Record an observation for a model/config
   * @param {string} configId 
   * @param {number} latencyMs 
   * @param {number} costUsd 
   * @param {boolean} success 
   */
  recordObservation(configId, latencyMs, costUsd, success) {
    if (!this.metricsCache.has(configId)) {
      this.metricsCache.set(configId, []);
    }
    const observations = this.metricsCache.get(configId);
    observations.push({
      configId,
      latencyMs,
      costUsd,
      success,
      timestamp: Date.now(),
    });
    
    // Keep only last 100 observations per config
    if (observations.length > 100) {
      observations.shift();
    }
  }

  /**
   * Get aggregated metrics for a config
   * @param {string} configId 
   * @returns {RouterConfigAggregate|null}
   */
  getConfigMetrics(configId) {
    const observations = this.metricsCache.get(configId);
    if (!observations || observations.length === 0) return null;

    const latencies = observations.map((o) => o.latencyMs);
    const costs = observations.map((o) => o.costUsd);
    const latencyStats = aggregateValues(latencies);
    const costStats = aggregateValues(costs);
    const successCount = observations.filter((o) => o.success).length;
    const successRate = successCount / observations.length;

    return {
      configId,
      samples: observations.length,
      successRate,
      avgLatencyMs: latencyStats.avg,
      p50LatencyMs: latencyStats.p50,
      p95LatencyMs: latencyStats.p95,
      avgCostUsd: costStats.avg,
      aiq: computeAIQ(successRate, latencyStats.avg, costStats.avg),
    };
  }

  /**
   * Select best model using AIQ scoring and Pareto optimization
   * @param {Object} request - Request context
   * @param {string[]} candidates - List of candidate model IDs
   * @returns {string|null} Best model ID
   */
  selectBestModel(request, candidates) {
    if (!candidates || candidates.length === 0) return null;

    // Get metrics for all candidates
    const candidateMetrics = candidates
      .map((modelId) => this.getConfigMetrics(modelId))
      .filter((m) => m !== null);

    if (candidateMetrics.length === 0) {
      // No historical data, return first candidate
      return candidates[0];
    }

    // Compute Pareto frontier
    const frontier = computeParetoFrontier(candidateMetrics);

    if (frontier.length === 0) {
      return candidateMetrics[0].configId;
    }

    // Select highest AIQ from frontier
    return frontier[0].configId;
  }

  /**
   * Route a request to the optimal model
   * @param {Object} prompt - Prompt data
   * @param {Object} options - Routing options
   * @returns {Promise<{model: string, provider: string, confidence: number}>}
   */
  async route(prompt, options = {}) {
    const { preferredProviders = [], maxCost = Infinity, maxLatency = Infinity } = options;
    
    // Get available providers from catalog
    const allProviders = Object.keys(providerCatalog.providers || {});
    
    // Filter by preferences
    let candidates = preferredProviders.length > 0
      ? allProviders.filter(p => preferredProviders.includes(p))
      : allProviders;

    // Apply cost/latency constraints based on historical data
    candidates = candidates.filter(modelId => {
      const metrics = this.getConfigMetrics(modelId);
      if (!metrics) return true; // No data, allow it
      return metrics.avgCostUsd <= maxCost && metrics.avgLatencyMs <= maxLatency;
    });

    if (candidates.length === 0) {
      candidates = allProviders; // Fallback to all
    }

    // Select best using AIQ
    const bestModel = this.selectBestModel(prompt, candidates);
    
    if (!bestModel) {
      return null;
    }

    const providerInfo = providerCatalog.providers?.[bestModel];
    const metrics = this.getConfigMetrics(bestModel);

    return {
      model: bestModel,
      provider: providerInfo?.id || bestModel,
      confidence: metrics ? metrics.aiq / 100 : 0.5,
      metrics: metrics,
    };
  }

  /**
   * Get routing report with all config stats
   * @returns {Object} Routing evaluation report
   */
  getReport() {
    const allObservations = [];
    for (const [, observations] of this.metricsCache) {
      allObservations.push(...observations);
    }

    const summary = summarizeObservations(allObservations);

    return {
      evaluatedAt: new Date().toISOString(),
      summary: {
        totalConfigs: this.metricsCache.size,
        totalSamples: allObservations.length,
      },
      configurations: summary.configurations,
      frontier: summary.frontier,
      top: summary.top.slice(0, 10),
    };
  }

  /**
   * Clear metrics cache
   */
  clearCache() {
    this.metricsCache.clear();
  }
}

module.exports = {
  computeAIQ,
  percentile,
  aggregateValues,
  computeParetoFrontier,
  summarizeObservations,
  GSKHeartRouter,
};

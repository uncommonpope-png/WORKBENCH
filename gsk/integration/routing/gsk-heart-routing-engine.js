'use strict';

/**
 * GSK-HEART — Phase 2: AIQ Routing Engine
 *
 * Ports the OmniRoute router-eval scoring + Pareto optimization from
 * omniroute/src/lib/routerEval/index.ts (computeAiq, computeParetoFrontier,
 * summarizeRouterObservations). Runs entirely INSIDE GSK — no OmniRoute service.
 *
 * Implements:
 *   - calculateAIQ(model, metrics)  → scalar "AIQ" score (higher = better)
 *   - selectBestModel(request, candidates) → best candidate via Pareto frontier
 *   - class GSKHeartRouter with route(prompt, options)
 *
 * AIQ formula (from routerEval.computeAiq):
 *   aiq = successRate*100 - (avgLatencyMs/1000) - (avgCostUsd*1000)
 */

// ---------------------------------------------------------------------------
// Utility helpers (ported from routerEval helpers)
// ---------------------------------------------------------------------------

function asNumber(value, fallback) {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const parsed = Number.parseFloat(value);
    return Number.isFinite(parsed) ? parsed : fallback;
  }
  return fallback != null ? fallback : 0;
}

function percentile(sortedValues, p) {
  if (sortedValues.length === 0) return 0;
  if (sortedValues.length === 1) return sortedValues[0];
  const bounded = Math.min(1, Math.max(0, p));
  const index = Math.floor((sortedValues.length - 1) * bounded);
  return sortedValues[index] != null ? sortedValues[index] : 0;
}

function aggregateValues(values) {
  if (values.length === 0) return { avg: 0, p50: 0, p95: 0 };
  const sorted = [...values].sort((a, b) => a - b);
  const sum = sorted.reduce((acc, v) => acc + v, 0);
  return {
    avg: sum / sorted.length,
    p50: percentile(sorted, 0.5),
    p95: percentile(sorted, 0.95),
  };
}

// ---------------------------------------------------------------------------
// Core AIQ computation
// ---------------------------------------------------------------------------

function computeAiq(successRate, avgLatencyMs, avgCostUsd) {
  const latencyPenalty = avgLatencyMs / 1000;
  const costPenalty = avgCostUsd * 1000;
  return Number((successRate * 100 - latencyPenalty - costPenalty).toFixed(3));
}

/**
 * calculateAIQ(model, metrics)
 * @param {string} model — model id (for traceability)
 * @param {object} metrics — { successRate (0..1), avgLatencyMs, avgCostUsd (number), latencyMs, costUsd, samples }
 * @returns {{aiq:number, model:string, successRate:number, avgLatencyMs:number, avgCostUsd:number}}
 */
function calculateAIQ(model, metrics) {
  const successRate = asNumber(metrics.successRate, 0);
  const avgLatencyMs = asNumber(metrics.avgLatencyMs != null ? metrics.avgLatencyMs : metrics.latencyMs, 0);
  const avgCostUsd = asNumber(metrics.avgCostUsd != null ? metrics.avgCostUsd : metrics.costUsd, 0);
  const aiq = computeAiq(successRate, avgLatencyMs, avgCostUsd);
  return {
    aiq,
    model,
    successRate,
    avgLatencyMs,
    avgCostUsd,
  };
}

// ---------------------------------------------------------------------------
// Pareto frontier (ported from routerEval.computeParetoFrontier)
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Default model metric table (seed knowledge; GSK learns live stats over time)
// Weights can be tuned per request via request.weights = {latency, cost, success}
// ---------------------------------------------------------------------------

const DEFAULT_METRICS = {
  'auto/best-fast': { successRate: 0.98, avgLatencyMs: 800, avgCostUsd: 0.000002 },
  'auto/best-chat': { successRate: 0.99, avgLatencyMs: 1500, avgCostUsd: 0.000004 },
  'auto/best-reasoning': { successRate: 0.99, avgLatencyMs: 4000, avgCostUsd: 0.00002 },
  'auto/best-coding': { successRate: 0.99, avgLatencyMs: 2000, avgCostUsd: 0.000006 },
  'auto/best-free': { successRate: 0.95, avgLatencyMs: 2500, avgCostUsd: 0.0 },
  'gpt-4o': { successRate: 0.995, avgLatencyMs: 1200, avgCostUsd: 0.000005 },
  'claude-3-5-sonnet': { successRate: 0.995, avgLatencyMs: 1400, avgCostUsd: 0.000009 },
  'gemini-flash': { successRate: 0.98, avgLatencyMs: 700, avgCostUsd: 0.000001 },
  'deepseek-chat': { successRate: 0.97, avgLatencyMs: 900, avgCostUsd: 0.0000003 },
  'llama-3.3-70b': { successRate: 0.96, avgLatencyMs: 1100, avgCostUsd: 0.000001 },
};

/**
 * selectBestModel(request, candidates)
 * @param {object} request — { prompt, weights?, taskType?, requiredProvider? }
 * @param {string[]|object[]} candidates — list of model ids or {model, metrics}
 * @returns {{model:string, aiq:number, all:Array, frontier:Array}}
 */
function selectBestModel(request, candidates) {
  const weights = request && request.weights ? request.weights : {};
  const latencyW = weights.latency != null ? weights.latency : 1;
  const costW = weights.cost != null ? weights.cost : 1;
  const successW = weights.success != null ? weights.success : 1;

  const requiredProvider = request ? request.requiredProvider : null;
  const taskType = request ? request.taskType : null;

  const evaluated = [];
  for (const cand of candidates || []) {
    let model;
    let metrics;
    if (typeof cand === 'string') {
      model = cand;
      metrics = DEFAULT_METRICS[model] || DEFAULT_METRICS[cand] || { successRate: 0.9, avgLatencyMs: 2000, avgCostUsd: 0.00001 };
    } else {
      model = cand.model;
      metrics = cand.metrics || DEFAULT_METRICS[model] || { successRate: 0.9, avgLatencyMs: 2000, avgCostUsd: 0.00001 };
    }

    if (requiredProvider && !model.startsWith(requiredProvider + '/') && model !== requiredProvider) {
      continue;
    }

    const base = calculateAIQ(model, metrics);
    // Apply per-dimension weighting to produce a request-tuned ranking score.
    const tunedAiq = Number(
      (
        base.aiq * successW -
        (base.avgLatencyMs / 1000) * (latencyW - 1) -
        (base.avgCostUsd * 1000) * (costW - 1)
      ).toFixed(3)
    );
    evaluated.push({ ...base, tunedAiq });
  }

  if (evaluated.length === 0) {
    return { model: null, aiq: 0, all: [], frontier: [] };
  }

  // Determine best by tuned AIQ, falling back to raw AIQ.
  const ranked = [...evaluated].sort((a, b) => b.tunedAiq - a.tunedAiq || b.aiq - a.aiq);
  const frontier = computeParetoFrontier(evaluated);

  return {
    model: ranked[0].model,
    aiq: ranked[0].aiq,
    tunedAiq: ranked[0].tunedAiq,
    all: ranked,
    frontier,
  };
}

// ---------------------------------------------------------------------------
// GSKHeartRouter — unified router class with route(prompt, options)
// ---------------------------------------------------------------------------

class GSKHeartRouter {
  constructor(options) {
    this.options = options || {};
    this.metrics = Object.assign({}, DEFAULT_METRICS);
    this.observations = [];
    this.taskProfiles = {
      coding: ['auto/best-coding', 'auto/best-fast', 'gpt-4o', 'claude-3-5-sonnet', 'deepseek-chat'],
      chat: ['auto/best-chat', 'auto/best-fast', 'gemini-flash', 'gpt-4o'],
      reasoning: ['auto/best-reasoning', 'auto/best-chat', 'claude-3-5-sonnet'],
      free: ['auto/best-free', 'llama-3.3-70b', 'deepseek-chat'],
      search: ['auto/best-fast', 'perplexity', 'gemini-flash'],
    };
  }

  /**
   * Record a live observation so the router's internal stats improve over time.
   */
  recordObservation(obs) {
    this.observations.push(obs);
    if (this.observations.length > 5000) this.observations.shift();
    const m = this.metrics[obs.model];
    if (m) {
      // Exponential moving average of latency/success.
      const alpha = 0.2;
      m.avgLatencyMs = m.avgLatencyMs * (1 - alpha) + asNumber(obs.latencyMs, m.avgLatencyMs) * alpha;
      m.successRate = m.successRate * (1 - alpha) + (obs.success ? 1 : 0) * alpha;
      if (obs.costUsd != null) m.avgCostUsd = m.avgCostUsd * (1 - alpha) + obs.costUsd * alpha;
    }
  }

  inferTaskType(prompt, options) {
    if (options && options.taskType) return options.taskType;
    const p = String(prompt || '').toLowerCase();
    if (/\b(write|fix|debug|code|function|class|implement|refactor|bug|typescript|python|javascript)\b/.test(p)) return 'coding';
    if (/\b(why|explain|reason|prove|analyze|think step by step|logic)\b/.test(p)) return 'reasoning';
    if (/\b(search|find|lookup|latest|news|current)\b/.test(p)) return 'search';
    if (/\b(free|cheap|no api)\b/.test(p)) return 'free';
    return 'chat';
  }

  /**
   * route(prompt, options) → resolves the best model for THIS prompt using
   * internal AIQ scoring + Pareto frontier. options: { taskType, weights,
   * requiredProvider, candidates, fallbackModels }
   */
  route(prompt, options) {
    options = options || {};
    const taskType = this.inferTaskType(prompt, options);
    const candidates =
      options.candidates ||
      this.taskProfiles[taskType] ||
      this.taskProfiles.chat;

    const fallbacks =
      options.fallbackModels ||
      (options.fallback ? options.fallback.split(',').map((s) => s.trim()).filter(Boolean) : []);

    const allCandidates = [...candidates, ...fallbacks];
    const selected = selectBestModel(
      { prompt, weights: options.weights, requiredProvider: options.requiredProvider, taskType },
      allCandidates
    );

    return {
      model: selected.model,
      aiq: selected.aiq,
      taskType,
      frontier: selected.frontier,
      candidates: allCandidates,
      ranked: selected.all,
    };
  }
}

module.exports = {
  GSKHeartRouter,
  calculateAIQ,
  computeAiq,
  computeParetoFrontier,
  selectBestModel,
  aggregateValues,
  DEFAULT_METRICS,
};

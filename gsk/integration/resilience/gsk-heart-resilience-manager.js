'use strict';

/**
 * GSK-HEART — Phase 5: Resilience Manager
 *
 * Ports omniroute/src/shared/utils/circuitBreaker.ts (CircuitBreaker class:
 * CLOSED → DEGRADED → OPEN → HALF_OPEN) into a dependency-free CommonJS module.
 * Tracks per-provider quotas and trips the circuit on repeated failures.
 *
 * Requirement: fail 3x in 1 min → stop traffic 5 min.
 * Implemented with failureThreshold=3, resetTimeout=300000 (5 min), and a
 * 60s sliding failure window so only failures within the last minute count.
 *
 * Exposes: canUse(providerId), recordSuccess(providerId), recordFailure(providerId)
 */

const STATE = {
  CLOSED: 'CLOSED',
  DEGRADED: 'DEGRADED',
  OPEN: 'OPEN',
  HALF_OPEN: 'HALF_OPEN',
};

const FAILURE_THRESHOLD = 3;
const RESET_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes
const FAILURE_WINDOW_MS = 60 * 1000; // only failures within last minute count

class ResilienceManager {
  constructor(options) {
    const opts = options || {};
    this.options = opts;
    this.providers = new Map(); // providerId -> state record
    this.globalQuota = opts.globalQuota != null ? opts.globalQuota : null; // { used, limit, windowStart }
    this.quotaLimit = opts.quotaLimit != null ? opts.quotaLimit : null;
  }

  _getOrCreate(providerId) {
    let rec = this.providers.get(providerId);
    if (!rec) {
      rec = {
        state: STATE.CLOSED,
        failures: [], // timestamps of recent failures
        lastFailureTime: null,
        halfOpenProbes: 0,
      };
      this.providers.set(providerId, rec);
    }
    return rec;
  }

  _pruneFailures(rec, now) {
    rec.failures = rec.failures.filter((t) => now - t <= FAILURE_WINDOW_MS);
  }

  _refreshOpen(rec, now) {
    if (rec.state === STATE.OPEN && rec.lastFailureTime != null && now - rec.lastFailureTime >= RESET_TIMEOUT_MS) {
      rec.state = STATE.HALF_OPEN;
      rec.halfOpenProbes = 0;
    }
  }

  /**
   * @returns {boolean} true if traffic may be sent to this provider now.
   */
  canUse(providerId) {
    const rec = this._getOrCreate(providerId);
    const now = Date.now();
    this._pruneFailures(rec, now);
    this._refreshOpen(rec, now);

    if (this.quotaLimit != null && this.globalQuota != null) {
      if (this.globalQuota.used >= this.quotaLimit) return false;
    }

    if (rec.state === STATE.OPEN) return false;
    if (rec.state === STATE.HALF_OPEN) {
      return rec.halfOpenProbes < 1; // allow a single probe
    }
    return true;
  }

  recordSuccess(providerId) {
    const rec = this._getOrCreate(providerId);
    const now = Date.now();
    this._pruneFailures(rec, now);
    this._refreshOpen(rec, now);

    if (rec.state === STATE.OPEN || rec.state === STATE.HALF_OPEN) {
      rec.state = STATE.CLOSED;
    }
    rec.failures = [];
    rec.lastFailureTime = null;
    rec.halfOpenProbes = 0;

    if (this.globalQuota) this.globalQuota.used = Math.max(0, this.globalQuota.used - 0); // no-op; success doesn't decrement
  }

  recordFailure(providerId, kind) {
    const rec = this._getOrCreate(providerId);
    const now = Date.now();
    rec.failures.push(now);
    rec.lastFailureTime = now;
    this._pruneFailures(rec, now);

    if (rec.state === STATE.HALF_OPEN) {
      rec.state = STATE.OPEN;
      return { tripped: true, state: rec.state };
    }

    const count = rec.failures.length;
    if (count >= FAILURE_THRESHOLD) {
      rec.state = STATE.OPEN;
      return { tripped: true, state: rec.state };
    }
    if (count >= Math.ceil((FAILURE_THRESHOLD * 60) / 100)) {
      rec.state = STATE.DEGRADED;
    }
    return { tripped: false, state: rec.state };
  }

  getStatus(providerId) {
    const rec = this._getOrCreate(providerId);
    const now = Date.now();
    this._pruneFailures(rec, now);
    this._refreshOpen(rec, now);
    return {
      provider: providerId,
      state: rec.state,
      recentFailures: rec.failures.length,
      lastFailureTime: rec.lastFailureTime,
      retryAfterMs: rec.state === STATE.OPEN && rec.lastFailureTime != null
        ? Math.max(0, RESET_TIMEOUT_MS - (now - rec.lastFailureTime))
        : 0,
    };
  }

  reset(providerId) {
    if (providerId) {
      this.providers.delete(providerId);
    } else {
      this.providers.clear();
    }
  }

  // ---- Quota helpers (compatible with omniroute quota preflight) ----

  setQuota(used, limit, windowStart) {
    this.globalQuota = { used, limit, windowStart: windowStart || Date.now() };
    this.quotaLimit = limit;
  }

  recordQuotaUsage(amount) {
    if (!this.globalQuota) return;
    this.globalQuota.used += amount;
  }

  quotaRemaining() {
    if (this.globalQuota == null || this.quotaLimit == null) return Infinity;
    return Math.max(0, this.quotaLimit - this.globalQuota.used);
  }
}

class CircuitBreakerOpenError extends Error {
  constructor(message, name, retryAfterMs) {
    super(message);
    this.name = 'CircuitBreakerOpenError';
    this.circuitName = name;
    this.retryAfterMs = retryAfterMs;
  }
}

module.exports = {
  ResilienceManager,
  CircuitBreakerOpenError,
  STATE,
  FAILURE_THRESHOLD,
  RESET_TIMEOUT_MS,
  FAILURE_WINDOW_MS,
};

/**
 * GSK-HEART Resilience Manager
 * Ported from OmniRoute src/shared/utils/circuitBreaker.ts and quota systems
 * CommonJS format for GSK fusion-loader integration
 * 
 * Features:
 * - Circuit Breaker pattern (CLOSED → DEGRADED → OPEN → HALF_OPEN)
 * - Quota tracking per provider
 * - Rate limiting
 * - Failure kind classification
 */

// Circuit breaker states
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

/**
 * Circuit breaker configuration
 * @typedef {Object} CircuitBreakerConfig
 * @property {number} failureThreshold - Failures before opening
 * @property {number} resetTimeout - Ms before attempting reset
 * @property {number} halfOpenRequests - Requests allowed in half-open state
 */

/**
 * Circuit breaker instance
 * @typedef {Object} CircuitBreaker
 * @property {string} name - Breaker name
 * @property {string} state - Current state
 * @property {number} failures - Failure count
 * @property {number} successes - Success count
 * @property {number} lastFailureTime - Last failure timestamp
 * @property {number} openUntil - Timestamp when breaker can transition to half-open
 * @property {number} halfOpenRequests - Requests made in half-open state
 */

class CircuitBreakerManager {
  constructor(options = {}) {
    this.breakers = new Map();
    this.defaultFailureThreshold = options.failureThreshold || 5;
    this.defaultResetTimeout = options.resetTimeout || 60000; // 1 minute
    this.defaultHalfOpenRequests = options.halfOpenRequests || 3;
    this.onStateChange = options.onStateChange || null;
  }

  /**
   * Get or create a circuit breaker
   * @param {string} name - Breaker name (usually provider ID)
   * @returns {CircuitBreaker}
   */
  getBreaker(name) {
    if (!this.breakers.has(name)) {
      this.breakers.set(name, {
        name,
        state: STATE.CLOSED,
        failures: 0,
        successes: 0,
        lastFailureTime: 0,
        openUntil: 0,
        halfOpenRequests: 0,
      });
    }
    return this.breakers.get(name);
  }

  /**
   * Check if request should be allowed
   * @param {string} name - Breaker name
   * @returns {{allowed: boolean, reason?: string}}
   */
  canExecute(name) {
    const breaker = this.getBreaker(name);
    const now = Date.now();

    switch (breaker.state) {
      case STATE.CLOSED:
      case STATE.DEGRADED:
        return { allowed: true };

      case STATE.OPEN:
        if (now >= breaker.openUntil) {
          // Transition to half-open
          breaker.state = STATE.HALF_OPEN;
          breaker.halfOpenRequests = 0;
          console.log(`[GSK-HEART] Circuit breaker ${name} transitioning to HALF_OPEN`);
          if (this.onStateChange) {
            this.onStateChange(name, STATE.OPEN, STATE.HALF_OPEN);
          }
          return { allowed: true };
        }
        return {
          allowed: false,
          reason: `Circuit breaker OPEN until ${new Date(breaker.openUntil).toISOString()}`,
        };

      case STATE.HALF_OPEN:
        if (breaker.halfOpenRequests < this.defaultHalfOpenRequests) {
          breaker.halfOpenRequests++;
          return { allowed: true };
        }
        return {
          allowed: false,
          reason: 'Circuit breaker HALF_OPEN: max probe requests reached',
        };

      default:
        return { allowed: true };
    }
  }

  /**
   * Record a successful execution
   * @param {string} name - Breaker name
   */
  recordSuccess(name) {
    const breaker = this.getBreaker(name);
    breaker.successes++;

    if (breaker.state === STATE.HALF_OPEN) {
      // Successful probe, close the breaker
      const oldState = breaker.state;
      breaker.state = STATE.CLOSED;
      breaker.failures = 0;
      breaker.halfOpenRequests = 0;
      console.log(`[GSK-HEART] Circuit breaker ${name} CLOSED after successful probe`);
      if (this.onStateChange) {
        this.onStateChange(name, oldState, STATE.CLOSED);
      }
    } else if (breaker.state === STATE.DEGRADED && breaker.successes > 10) {
      // Enough successes to recover from degraded
      const oldState = breaker.state;
      breaker.state = STATE.CLOSED;
      breaker.failures = 0;
      console.log(`[GSK-HEART] Circuit breaker ${name} recovered from DEGRADED to CLOSED`);
      if (this.onStateChange) {
        this.onStateChange(name, oldState, STATE.CLOSED);
      }
    }
  }

  /**
   * Record a failed execution
   * @param {string} name - Breaker name
   * @param {Error|string} error - Error that occurred
   */
  recordFailure(name, error) {
    const breaker = this.getBreaker(name);
    breaker.failures++;
    breaker.lastFailureTime = Date.now();

    const threshold = this.defaultFailureThreshold;
    const now = Date.now();

    if (breaker.state === STATE.HALF_OPEN) {
      // Probe failed, reopen with escalated timeout
      const escalationFactor = Math.min(8, Math.pow(2, Math.floor(breaker.failures / threshold)));
      breaker.openUntil = now + (this.defaultResetTimeout * escalationFactor);
      breaker.state = STATE.OPEN;
      breaker.halfOpenRequests = 0;
      console.warn(`[GSK-HEART] Circuit breaker ${name} re-OPENED after failed probe. Escalated timeout.`);
      if (this.onStateChange) {
        this.onStateChange(name, STATE.HALF_OPEN, STATE.OPEN);
      }
    } else if (breaker.state === STATE.CLOSED || breaker.state === STATE.DEGRADED) {
      if (breaker.failures >= threshold) {
        // Open the breaker
        const oldState = breaker.state;
        breaker.state = STATE.OPEN;
        breaker.openUntil = now + this.defaultResetTimeout;
        console.warn(`[GSK-HEART] Circuit breaker ${name} OPENED after ${breaker.failures} failures`);
        if (this.onStateChange) {
          this.onStateChange(name, oldState, STATE.OPEN);
        }
      } else if (breaker.failures >= Math.floor(threshold / 2)) {
        // Enter degraded state
        const oldState = breaker.state;
        breaker.state = STATE.DEGRADED;
        console.warn(`[GSK-HEART] Circuit breaker ${name} DEGRADED (${breaker.failures}/${threshold} failures)`);
        if (this.onStateChange) {
          this.onStateChange(name, oldState, STATE.DEGRADED);
        }
      }
    }
  }

  /**
   * Get breaker status
   * @param {string} name - Breaker name
   * @returns {Object} Status info
   */
  getStatus(name) {
    const breaker = this.getBreaker(name);
    const now = Date.now();
    
    return {
      name: breaker.name,
      state: breaker.state,
      failures: breaker.failures,
      successes: breaker.successes,
      canExecute: this.canExecute(name).allowed,
      timeUntilReset: breaker.state === STATE.OPEN ? Math.max(0, breaker.openUntil - now) : 0,
    };
  }

  /**
   * Reset a breaker manually
   * @param {string} name - Breaker name
   */
  reset(name) {
    const breaker = this.getBreaker(name);
    const oldState = breaker.state;
    breaker.state = STATE.CLOSED;
    breaker.failures = 0;
    breaker.successes = 0;
    breaker.openUntil = 0;
    breaker.halfOpenRequests = 0;
    console.log(`[GSK-HEART] Circuit breaker ${name} manually reset`);
    if (this.onStateChange) {
      this.onStateChange(name, oldState, STATE.CLOSED);
    }
  }

  /**
   * Get all breaker statuses
   * @returns {Array}
   */
  getAllStatuses() {
    return Array.from(this.breakers.keys()).map(name => this.getStatus(name));
  }
}

/**
 * Quota tracker for rate limiting
 */
class QuotaTracker {
  constructor(options = {}) {
    this.quotas = new Map(); // providerId -> { used, limit, windowStart }
    this.defaultLimit = options.defaultLimit || 1000;
    this.windowMs = options.windowMs || 3600000; // 1 hour
  }

  /**
   * Check if quota allows execution
   * @param {string} providerId - Provider ID
   * @param {number} [cost=1] - Cost of this operation
   * @returns {{allowed: boolean, remaining?: number, resetAt?: number}}
   */
  checkQuota(providerId, cost = 1) {
    const now = Date.now();
    let quota = this.quotas.get(providerId);

    // Initialize or reset expired quota
    if (!quota || now >= quota.windowStart + this.windowMs) {
      quota = {
        used: 0,
        limit: this.defaultLimit,
        windowStart: now,
      };
      this.quotas.set(providerId, quota);
    }

    const remaining = quota.limit - quota.used;
    const allowed = remaining >= cost;

    return {
      allowed,
      remaining: Math.max(0, remaining),
      limit: quota.limit,
      used: quota.used,
      resetAt: quota.windowStart + this.windowMs,
    };
  }

  /**
   * Record quota usage
   * @param {string} providerId - Provider ID
   * @param {number} [cost=1] - Cost of operation
   */
  recordUsage(providerId, cost = 1) {
    const quota = this.quotas.get(providerId);
    if (quota) {
      quota.used += cost;
    }
  }

  /**
   * Set custom quota limit
   * @param {string} providerId - Provider ID
   * @param {number} limit - New limit
   */
  setLimit(providerId, limit) {
    let quota = this.quotas.get(providerId);
    if (!quota) {
      quota = { used: 0, limit, windowStart: Date.now() };
      this.quotas.set(providerId, quota);
    } else {
      quota.limit = limit;
    }
  }

  /**
   * Get quota status
   * @param {string} providerId - Provider ID
   * @returns {Object}
   */
  getStatus(providerId) {
    const result = this.checkQuota(providerId, 0);
    return {
      providerId,
      ...result,
      utilization: result.limit > 0 ? (result.used / result.limit) * 100 : 0,
    };
  }
}

/**
 * GSK Heart Resilience Manager
 * Combines circuit breakers and quota tracking
 */
class GSKHeartResilienceManager {
  constructor(options = {}) {
    this.circuitBreakers = new CircuitBreakerManager(options.circuitBreaker);
    this.quotas = new QuotaTracker(options.quota);
  }

  /**
   * Check if provider is available
   * @param {string} providerId - Provider ID
   * @returns {{available: boolean, reason?: string, quota?: Object, circuit?: Object}}
   */
  checkAvailability(providerId) {
    const quotaResult = this.quotas.checkQuota(providerId);
    const circuitResult = this.circuitBreakers.canExecute(providerId);

    if (!circuitResult.allowed) {
      return {
        available: false,
        reason: circuitResult.reason,
        circuit: this.circuitBreakers.getStatus(providerId),
      };
    }

    if (!quotaResult.allowed) {
      return {
        available: false,
        reason: `Quota exceeded. ${quotaResult.remaining}/${quotaResult.limit} remaining`,
        quota: quotaResult,
      };
    }

    return {
      available: true,
      quota: quotaResult,
      circuit: this.circuitBreakers.getStatus(providerId),
    };
  }

  /**
   * Record successful operation
   * @param {string} providerId - Provider ID
   * @param {number} [quotaCost=1] - Quota cost
   */
  recordSuccess(providerId, quotaCost = 1) {
    this.circuitBreakers.recordSuccess(providerId);
    this.quotas.recordUsage(providerId, quotaCost);
  }

  /**
   * Record failed operation
   * @param {string} providerId - Provider ID
   * @param {Error|string} error - Error
   */
  recordFailure(providerId, error) {
    this.circuitBreakers.recordFailure(providerId, error);
  }

  /**
   * Get full resilience status
   * @returns {Object}
   */
  getStatus() {
    return {
      circuitBreakers: this.circuitBreakers.getAllStatuses(),
      quotas: Array.from(this.quotas.quotas.keys()).map(id => 
        this.quotas.getStatus(id)
      ),
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
  STATE,
  CircuitBreakerManager,
  QuotaTracker,
  GSKHeartResilienceManager,
  ResilienceManager,
  CircuitBreakerOpenError,
  STATE,
  FAILURE_THRESHOLD,
  RESET_TIMEOUT_MS,
  FAILURE_WINDOW_MS,
};

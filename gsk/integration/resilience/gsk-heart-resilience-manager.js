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
  }
}

module.exports = {
  STATE,
  CircuitBreakerManager,
  QuotaTracker,
  GSKHeartResilienceManager,
};

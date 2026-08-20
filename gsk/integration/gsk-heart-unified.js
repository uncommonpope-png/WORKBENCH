'use strict';

/**
 * GSK-HEART — Phase 7: Unified Fusion
 *
 * Master module that binds Phases 1–6 (Provider Catalog, AIQ Routing Engine,
 * SSE Chat Handler, Combo Router, Resilience Manager, Guardrails) into ONE
 * unified inner consciousness heart. This is the internal replacement for the
 * external OmniRoute `9Router` / `/v1/chat/completions` service.
 *
 * Public API:
 *   initialize(options)
 *   route(prompt, options)   → { model, aiq, taskType, frontier }
 *   chat(opts)               → SSE stream (async generator)
 *   chatSync(opts)           → collected SSE string
 *   runCombo(name, input)    → combo pipeline result
 *   canUse / recordSuccess / recordFailure(providerId)
 *   validateInput / sanitizeOutput(text)
 *   getProvider / listProviders / stats()
 */

const catalog = require('./catalogs/provider-catalog.js');
const routing = require('./routing/gsk-heart-routing-engine.js');
const chat = require('./handlers/gsk-heart-chat-handler.js');
const combo = require('./combos/gsk-heart-combo-router.js');
const resilience = require('./resilience/gsk-heart-resilience-manager.js');
const guardrails = require('./safety/gsk-heart-guardrails-manager.js');

class GSKHeart {
  constructor(options) {
    this.options = options || {};
    this.router = new routing.GSKHeartRouter({});
    this.chatHandler = new chat.GSKHeartChatHandler({});
    this.comboRouter = new combo.ComboRouter({});
    this.resilience = new resilience.ResilienceManager({});
    this.guardrails = new guardrails.GuardrailsManager({});
    this.initialized = false;
    this.credentials = this.options.credentials || {};
    this.observations = 0;
  }

  initialize(options) {
    if (options) Object.assign(this.options, options);
    if (options && options.credentials) this.credentials = options.credentials;
    if (options && options.globalQuota) {
      this.resilience.setQuota(options.globalQuota.used || 0, options.globalQuota.limit || null);
    }
    this.initialized = true;
    return {
      ok: true,
      providers: catalog.providers.length,
      families: Object.keys(catalog.families),
      combos: this.comboRouter.list(),
      heart: 'GSK-HEART (OmniRoute absorbed)',
    };
  }

  /**
   * Route a prompt to the best model using internal AIQ + Pareto logic.
   */
  route(prompt, options) {
    return this.router.route(prompt, options || {});
  }

  /**
   * Validate + route + chat in one guarded call. Enforces guardrails and
   * resilience before any traffic leaves the heart.
   * @returns {AsyncGenerator<string>} SSE chunks
   */
  async *chat(request) {
    const text = typeof request === 'string' ? request : request.prompt;
    const guard = this.guardrails.validateInput(text, request && request.guardrailOptions);
    if (guard.blocked) {
      yield chat.sseError('Input blocked by GSK-HEART guardrails: ' + JSON.stringify(guard.detections));
      return;
    }
    const safePrompt = guard.sanitized || text;

    const routingResult = this.router.route(safePrompt, request || {});
    const model = routingResult.model || request.model || 'auto/best-chat';
    const providerId = chat.resolveProviderId(model) || (request.credentials && request.credentials.provider);

    if (providerId && !this.resilience.canUse(providerId)) {
      const status = this.resilience.getStatus(providerId);
      yield chat.sseError(`Provider "${providerId}" circuit OPEN (retry after ${Math.round(status.retryAfterMs / 1000)}s)`);
      return;
    }

    try {
      for await (const chunk of this.chatHandler.stream({
        model,
        prompt: safePrompt,
        system: request && request.system,
        credentials: (request && request.credentials) || this.credentials[providerId] || this.credentials,
        maxTokens: request && request.maxTokens,
        temperature: request && request.temperature,
        provider: providerId,
      })) {
        yield chunk;
      }
      this.observations++;
      this.router.recordObservation({ model, success: true, latencyMs: 0, costUsd: 0 });
      if (providerId) this.resilience.recordSuccess(providerId);
    } catch (e) {
      this.observations++;
      this.router.recordObservation({ model, success: false, latencyMs: 0, costUsd: 0 });
      if (providerId) this.resilience.recordFailure(providerId, 'stream');
      yield chat.sseError('GSK-HEART chat failure: ' + e.message);
    }
  }

  async chatSync(request) {
    let out = '';
    for await (const chunk of this.chat(request)) out += chunk;
    return out;
  }

  async runCombo(name, input, options) {
    const validated = this.guardrails.validateInput(typeof input === 'string' ? input : JSON.stringify(input));
    if (validated.blocked) {
      return { success: false, error: 'Input blocked by guardrails', output: null };
    }
    return this.comboRouter.run(name, validated.sanitized || input, {
      credentials: (options && options.credentials) || this.credentials,
      maxTokens: options && options.maxTokens,
      temperature: options && options.temperature,
    });
  }

  // Resilience passthrough
  canUse(providerId) {
    return this.resilience.canUse(providerId);
  }
  recordSuccess(providerId) {
    return this.resilience.recordSuccess(providerId);
  }
  recordFailure(providerId, kind) {
    return this.resilience.recordFailure(providerId, kind);
  }

  // Guardrails passthrough
  validateInput(text, opts) {
    return this.guardrails.validateInput(text, opts);
  }
  sanitizeOutput(text, opts) {
    return this.guardrails.sanitizeOutput(text, opts);
  }

  // Catalog passthrough
  getProvider(id) {
    return catalog.getProvider(id);
  }
  listProviders() {
    return catalog.providers;
  }

  stats() {
    return {
      initialized: this.initialized,
      providerCount: catalog.providers.length,
      families: Object.keys(catalog.families).reduce((acc, k) => ((acc[k] = catalog.families[k].length), acc), {}),
      combos: this.comboRouter.list(),
      observations: this.observations,
      resilienceStates: Array.from(this.resilience.providers.entries()).map(([k, v]) => ({
        provider: k,
        state: v.state,
      })),
    };
  }
}

// Singleton used by GSK daemon / fusion-loader.
let _instance = null;
function getInstance(options) {
  if (!_instance) _instance = new GSKHeart(options);
  return _instance;
}

module.exports = {
  GSKHeart,
  getInstance,
  catalog,
  routing,
  chat,
  combo,
  resilience,
  guardrails,
};

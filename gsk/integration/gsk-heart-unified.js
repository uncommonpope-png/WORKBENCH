/**
 * GSK-HEART Unified Module
 * Master integration module that combines all GSK-HEART components
 *
 * Public API:
 *   new GSKHeartUnified(options)
 *   getHealthReport()
 *   complete({ prompt, messages, model, options })
 *   route(prompt, options)
 *   chat(request)  → async generator (SSE)
 *   chatSync(request)
 *   runCombo(name, input, options)
 *   canUse / recordSuccess / recordFailure(providerId)
 *   validateInput / sanitizeOutput(text)
 *   getProvider / listProviders / stats()
 */

const providerCatalog = require('./catalogs/provider-catalog');
const { GSKHeartRouter } = require('./routing/gsk-heart-routing-engine');
const { GSKHeartChatHandler, executeWithFallback, gskHeartChat } = require('./handlers/gsk-heart-chat-handler');
const { GSKHeartComboRouter } = require('./combos/gsk-heart-combo-router');
const { GSKHeartResilienceManager } = require('./resilience/gsk-heart-resilience-manager');
const { GSKHeartGuardrailsManager } = require('./safety/gsk-heart-guardrails-manager');

const providers = providerCatalog.ALL_PROVIDERS || providerCatalog.providers || {};

class GSKHeartUnified {
  constructor(options = {}) {
    this.options = options || {};
    this.credentials = {};
    if (process.env.OPENAI_API_KEY) this.credentials.openai = process.env.OPENAI_API_KEY;
    if (process.env.GEMINI_API_KEY) this.credentials.gemini = process.env.GEMINI_API_KEY;
    if (process.env.GROQ_API_KEY) this.credentials.groq = process.env.GROQ_API_KEY;
    if (process.env.NVIDIA_API_KEY) this.credentials.nvidia = process.env.NVIDIA_API_KEY;
    if (process.env.ANTHROPIC_API_KEY) this.credentials.anthropic = process.env.ANTHROPIC_API_KEY;

    this.router = new GSKHeartRouter(options.router);
    this.chatHandler = new GSKHeartChatHandler(options.chatHandler);
    this.comboRouter = new GSKHeartComboRouter({ handler: this.chatHandler, ...options.comboRouter });
    this.resilience = new GSKHeartResilienceManager(options.resilience);
    this.guardrails = new GSKHeartGuardrailsManager(options.guardrails);

    this.config = {
      enableGuardrails: options.enableGuardrails !== false,
      enableResilience: options.enableResilience !== false,
      enableCombos: options.enableCombos !== false,
      defaultProviderChain: options.defaultProviderChain || [],
      autoPromoteModels: options.autoPromoteModels ?? true,
    };

    this.initialized = false;
    this.observations = 0;

    console.log('[GSK-HEART] Unified module initialized');
    console.log(`[GSK-HEART] Providers loaded: ${Object.keys(providers).length}`);
    console.log(`[GSK-HEART] Built-in combos: ${Object.keys(this.comboRouter.list()).length}`);
  }

  initialize(options) {
    if (options) Object.assign(this.options, options);
    if (options && options.credentials) this.credentials = { ...this.credentials, ...options.credentials };
    this.initialized = true;

    // Non-blocking: pull OmniRoute's live catalog (346 providers) so the
    // router decides over real availability. Static catalog stays as fallback.
    if (typeof this.router.refreshLiveCatalog === 'function') {
      this.router
        .refreshLiveCatalog()
        .then((n) => {
          if (n > 0) console.log(`[GSK-HEART] Live catalog synced from OmniRoute: ${n} models`);
        })
        .catch(() => {});
    }

    return {
      ok: true,
      providers: Object.keys(providers).length,
      families: Object.keys(providerCatalog.families || {}),
      combos: Object.keys(this.comboRouter.list()),
      heart: 'GSK-HEART (OmniRoute absorbed)',
    };
  }

  _buildProviderChain(selectedModel) {
    const chain = [];
    // Exact routed model first (e.g. "openai/gpt-4o-mini") so OmniRoute
    // executes precisely what GSK's router decided.
    if (typeof selectedModel === 'string' && selectedModel.includes('/')) {
      const slash = selectedModel.indexOf('/');
      chain.push({ id: selectedModel.slice(0, slash), defaultModel: selectedModel.slice(slash + 1) });
    }
    const providerInfo = providers[selectedModel];
    if (providerInfo) {
      chain.push(providerInfo);
      const family = providerInfo.authType;
      const fallbacks = Object.values(providers)
        .filter((p) => p.authType === family && p.id !== selectedModel)
        .slice(0, 3);
      chain.push(...fallbacks);
    }
    if (chain.length === 0 && this.config.defaultProviderChain.length > 0) {
      return this.config.defaultProviderChain;
    }
    if (chain.length === 0) {
      const availableProviders = Object.values(providers).slice(0, 5);
      chain.push(...availableProviders);
    }
    return chain;
  }

  async complete(request) {
    const result = await this.chat({ ...request, stream: false });
    if (!result.success) {
      throw new Error(result.error || 'Completion failed');
    }
    return result;
  }

  async chat(request) {
    const {
      prompt,
      messages,
      model: requestedModel,
      stream = false,
      onChunk,
      options = {},
    } = request || {};

    let inputText = prompt || (messages && messages.length > 0 ? messages[messages.length - 1].content : '') || '';

    try {
      let selectedModel = requestedModel;
      let routingDecision = null;

      if (!selectedModel) {
        // Ensure the live catalog is present before the first routing decision
        // (initialize() refreshes it non-blocking; this closes the race).
        if (this.router.liveProviderIds && this.router.liveProviderIds.size === 0 && typeof this.router.refreshLiveCatalog === 'function') {
          await this.router.refreshLiveCatalog();
        }
        routingDecision = await this.router.route({ prompt: inputText }, options.routing || {});
        if (!routingDecision || !routingDecision.model) {
          return { success: false, error: 'No suitable model found for request' };
        }
        selectedModel = routingDecision.model;
        console.log(`[GSK-HEART] Routed to: ${selectedModel}`);
      }

      let providerChain;
      if (this.config.enableResilience) {
        providerChain = this._buildProviderChain(selectedModel);
      } else {
        providerChain = Array.isArray(selectedModel) ? selectedModel : [selectedModel];
      }

      const chatOptions = {
        providerChain,
        messages: messages && messages.length > 0 ? messages : [{ role: 'user', content: inputText }],
        onChunk: stream && typeof onChunk === 'function' ? onChunk : null,
      };

      const result = await executeWithFallback(chatOptions);

      this.observations++;

      if (routingDecision && result.provider) {
        const latency = result.usage && result.usage.totalTime || 1000;
        const cost = result.usage && result.usage.estimatedCost || 0.001;
        if (typeof this.router.recordObservation === 'function') {
          this.router.recordObservation(result.provider, latency, cost, result.success);
        }
      }

      if (result.success && this.config.enableGuardrails) {
        result.content = this.guardrails.sanitizeOutput(result.content);
      }

      return {
        success: result.success,
        content: result.content,
        model: selectedModel,
        provider: result.provider,
        usage: result.usage,
        routing: routingDecision,
        viaOmniRoute: result.viaOmniRoute === true,
        stream,
      };
    } catch (e) {
      return { success: false, error: e.message || 'GSK-HEART chat failure' };
    }
  }

  async *chatStream(request) {
    const text = typeof request === 'string' ? request : (request && request.prompt) || '';
    if (this.config.enableGuardrails) {
      const guard = this.guardrails.validateInput(text);
      if (guard.blocked) {
        yield { success: false, error: 'Input blocked by guardrails', blocked: true };
        return;
      }
    }

    let routingResult = null;
    try {
      routingResult = await this.router.route(text, request || {});
    } catch (e) {
      routingResult = null;
    }
    const model = (routingResult && routingResult.model) || (request && request.model) || 'auto/best-chat';

    try {
      const chunks = await this.chatHandler.stream({
        model,
        prompt: text,
        messages: (request && request.messages) || [{ role: 'user', content: text }],
        credentials: (request && request.credentials) || this.credentials,
        maxTokens: request && request.maxTokens,
        temperature: request && request.temperature,
      });

      for await (const chunk of chunks) {
        yield chunk;
      }
    } catch (e) {
      yield { success: false, error: 'GSK-HEART chat failure: ' + e.message };
    }
  }

  async chatSync(request) {
    let out = '';
    for await (const chunk of this.chatStream(request)) {
      out += typeof chunk === 'string' ? chunk : (chunk.content || JSON.stringify(chunk));
    }
    return out;
  }

  async runCombo(name, input, options = {}) {
    if (!this.config.enableCombos) {
      return { success: false, error: 'Combos are disabled in this configuration' };
    }

    if (this.config.enableGuardrails) {
      const validation = this.guardrails.validateInput(input);
      if (!validation.allowed && !validation.blocked) {
        return { success: false, error: 'Input blocked by guardrails', reasons: validation.reasons };
      }
      input = validation.sanitized || validation.text || input;
    }

    return this.comboRouter.run(name, input, options);
  }

  listCombos() {
    return this.comboRouter.list();
  }

  getRoutingReport() {
    return this.router.getReport();
  }

  getResilienceStatus() {
    return this.resilience.getStatus();
  }

  getGuardrailsStats() {
    return this.guardrails.getStats();
  }

  canUse(providerId) {
    return this.resilience.canUse(providerId);
  }

  recordSuccess(providerId) {
    return this.resilience.recordSuccess(providerId);
  }

  recordFailure(providerId, kind) {
    return this.resilience.recordFailure(providerId, kind);
  }

  validateInput(text, opts) {
    return this.guardrails.validateInput(text, opts);
  }

  sanitizeOutput(text, opts) {
    return this.guardrails.sanitizeOutput(text, opts);
  }

  getProvider(id) {
    return providerCatalog.getProvider(id);
  }

  listProviders() {
    return providers;
  }

  stats() {
    return {
      initialized: this.initialized,
      providerCount: Object.keys(providers).length,
      families: Object.keys(providerCatalog.families || {}).reduce((acc, k) => {
        acc[k] = (providerCatalog.families[k] || []).length;
        return acc;
      }, {}),
      combos: Object.keys(this.comboRouter.list()),
      observations: this.observations,
    };
  }

  getHealthReport() {
    return {
      status: 'healthy',
      initialized: this.initialized,
      timestamp: new Date().toISOString(),
      providers: Object.keys(providers).length,
      routing: this.getRoutingReport(),
      resilience: this.getResilienceStatus(),
      guardrails: this.getGuardrailsStats(),
      combos: Object.keys(this.comboRouter.list()).length,
      observations: this.observations,
    };
  }

  registerCombo(name, config) {
    this.comboRouter.registerCombo(name, config);
  }
}

let _instance = null;
function getInstance(options) {
  if (!_instance) _instance = new GSKHeartUnified(options);
  return _instance;
}

module.exports = {
  GSKHeartUnified,
  getInstance,
  providerCatalog,
  GSKHeartRouter,
  GSKHeartChatHandler,
  GSKHeartComboRouter,
  GSKHeartResilienceManager,
  GSKHeartGuardrailsManager,
};

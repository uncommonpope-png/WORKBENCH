'use strict';

/**
 * GSK-HEART — Phase 3: SSE Chat Handler
 *
 * Ports omniroute/src/sse/handlers/chat.ts + chatHelpers.ts streaming semantics
 * into a self-contained CommonJS module that lives INSIDE GSK. It replaces the
 * external OmniRoute `/v1/chat/completions` dependency. Given a prompt + selected
 * model + provider credentials, it calls the provider's OpenAI-compatible (or
 * native) endpoint and streams SSE chunks in the exact format GSK's existing
 * stream parser expects (data: {"choices":[{"delta":{"content":"..."}}]} ... [DONE]).
 *
 * Implements:
 *   - gskHeartChat({ prompt, model, system, credentials, ... }) → SSE string (or async iterable)
 *   - ChatHandler class with retry logic (exponential backoff, 3 attempts)
 *   - Compatible with GSK mega_brain SSE parser.
 */

const http = require('http');
const https = require('https');
const { URL } = require('url');

// Provider endpoint templates. Most providers are OpenAI-compatible; a few need
// special URL shapes (handled in resolveEndpoint).
const PROVIDER_BASE = {
  openai: 'https://api.openai.com/v1/chat/completions',
  anthropic: 'https://api.anthropic.com/v1/messages',
  gemini: 'https://generativelanguage.googleapis.com/v1beta/models',
  deepseek: 'https://api.deepseek.com/v1/chat/completions',
  groq: 'https://api.groq.com/openai/v1/chat/completions',
  xai: 'https://api.x.ai/v1/chat/completions',
  mistral: 'https://api.mistral.ai/v1/chat/completions',
  together: 'https://api.together.xyz/v1/chat/completions',
  fireworks: 'https://api.fireworks.ai/inference/v1/chat/completions',
  cerebras: 'https://api.cerebras.ai/v1/chat/completions',
  cohere: 'https://api.cohere.ai/v2/chat',
  nvidia: 'https://integrate.api.nvidia.com/v1/chat/completions',
  perplexity: 'https://api.perplexity.ai/chat/completions',
  openrouter: 'https://openrouter.ai/api/v1/chat/completions',
  ollama: 'http://127.0.0.1:11434/api/chat',
  'claude-web': 'https://claude.ai/api/organizations',
};

function resolveProviderId(model) {
  if (typeof model !== 'string') return null;
  const idx = model.indexOf('/');
  if (idx <= 0) return null;
  return model.slice(0, idx);
}

function resolveModelName(model) {
  if (typeof model !== 'string') return model;
  const idx = model.indexOf('/');
  if (idx <= 0) return model;
  return model.slice(idx + 1);
}

function resolveEndpoint(provider, modelName, credentials) {
  if (credentials && credentials.baseUrl) return credentials.baseUrl;
  if (provider === 'gemini') {
    return `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:streamGenerateContent?alt=sse`;
  }
  if (provider === 'ollama') return 'http://127.0.0.1:11434/api/chat';
  return PROVIDER_BASE[provider] || null;
}

function buildHeaders(provider, credentials) {
  const headers = { 'Content-Type': 'application/json' };
  const key = credentials && credentials.apiKey ? credentials.apiKey : process.env[providerKeyEnv(provider)];
  if (provider === 'anthropic') {
    if (key) headers['x-api-key'] = key;
    headers['anthropic-version'] = '2023-06-01';
  } else if (key) {
    headers['Authorization'] = `Bearer ${key}`;
  }
  return headers;
}

function providerKeyEnv(provider) {
  const map = {
    openai: 'OPENAI_API_KEY',
    anthropic: 'ANTHROPIC_API_KEY',
    gemini: 'GEMINI_API_KEY',
    deepseek: 'DEEPSEEK_API_KEY',
    groq: 'GROQ_API_KEY',
    xai: 'XAI_API_KEY',
    mistral: 'MISTRAL_API_KEY',
    together: 'TOGETHER_API_KEY',
    fireworks: 'FIREWORKS_API_KEY',
    cerebras: 'CEREBRAS_API_KEY',
    cohere: 'COHERE_API_KEY',
    nvidia: 'NVIDIA_API_KEY',
    perplexity: 'PERPLEXITY_API_KEY',
    openrouter: 'OPENROUTER_API_KEY',
  };
  return map[provider] || `${provider.toUpperCase().replace(/-/g, '_')}_API_KEY`;
}

function buildBody(provider, modelName, system, prompt, options) {
  const messages = [
    ...(system ? [{ role: 'system', content: system }] : []),
    { role: 'user', content: prompt },
  ];
  if (provider === 'anthropic') {
    return {
      model: modelName,
      system: system || undefined,
      messages: [{ role: 'user', content: prompt }],
      max_tokens: options.maxTokens || 1024,
      temperature: options.temperature != null ? options.temperature : 0.7,
      stream: true,
    };
  }
  if (provider === 'gemini') {
    return {
      contents: [{ parts: [{ text: prompt }] }],
      systemInstruction: system ? { parts: [{ text: system }] } : undefined,
      generationConfig: {
        maxOutputTokens: options.maxTokens || 1024,
        temperature: options.temperature != null ? options.temperature : 0.7,
      },
    };
  }
  if (provider === 'ollama') {
    return {
      model: modelName,
      messages,
      stream: true,
      options: { num_predict: options.maxTokens || 1024, temperature: options.temperature != null ? options.temperature : 0.7 },
    };
  }
  // Default OpenAI-compatible
  return {
    model: modelName,
    messages,
    max_tokens: options.maxTokens || 1024,
    temperature: options.temperature != null ? options.temperature : 0.7,
    stream: true,
  };
}

// ---------------------------------------------------------------------------
// Low-level HTTP POST that returns the raw response body (string) — used by retry
// ---------------------------------------------------------------------------

function postRequest(endpoint, headers, bodyStr, timeoutMs) {
  return new Promise((resolve, reject) => {
    let u;
    try {
      u = new URL(endpoint);
    } catch (e) {
      return reject(new Error('Invalid endpoint: ' + endpoint));
    }
    const mod = u.protocol === 'https:' ? https : http;
    const req = mod.request(
      u,
      {
        method: 'POST',
        headers: { ...headers, 'Content-Length': Buffer.byteLength(bodyStr) },
        timeout: timeoutMs || 60000,
      },
      (res) => {
        let data = '';
        res.on('data', (c) => {
          data += c;
          if (data.length > 5e6) {
            req.destroy();
            reject(new Error('Response too large'));
          }
        });
        res.on('end', () => resolve({ status: res.statusCode, data }));
      }
    );
    req.on('error', reject);
    req.on('timeout', () => {
      req.destroy();
      reject(new Error('Request timeout'));
    });
    req.write(bodyStr);
    req.end();
  });
}

// ---------------------------------------------------------------------------
// SSE chunk helper — exactly what GSK's mega_brain parser consumes
// ---------------------------------------------------------------------------

function sseDelta(content) {
  return `data: ${JSON.stringify({ choices: [{ delta: { content } }] })}\n\n`;
}
function sseDone() {
  return 'data: [DONE]\n\n';
}
function sseError(message) {
  return `data: ${JSON.stringify({ error: { message } })}\n\n`;
}

// ---------------------------------------------------------------------------
// Translate non-OpenAI streaming responses into OpenAI SSE deltas
// ---------------------------------------------------------------------------

function extractContentFromChunk(provider, chunkObj) {
  if (!chunkObj || typeof chunkObj !== 'object') return null;
  if (provider === 'ollama') return chunkObj.message?.content || chunkObj.response || null;
  if (provider === 'anthropic') {
    const delta = chunkObj.delta;
    if (delta && delta.type === 'content_block_delta' && delta.text) return delta.text;
    return null;
  }
  if (provider === 'gemini') {
    const part = chunkObj.candidates?.[0]?.content?.parts?.[0];
    return part?.text || null;
  }
  const choice = chunkObj.choices && chunkObj.choices[0];
  if (!choice) return null;
  return choice.delta?.content || choice.message?.content || null;
}

// ---------------------------------------------------------------------------
// Main streaming function. Returns an async generator yielding SSE strings.
// ---------------------------------------------------------------------------

async function* streamChat(opts) {
  const model = opts.model;
  const provider = opts.provider || resolveProviderId(model);
  const modelName = resolveModelName(model);
  const endpoint = resolveEndpoint(provider, modelName, opts.credentials);
  if (!endpoint) {
    yield sseError(`No endpoint configured for provider "${provider}"`);
    return;
  }

  const headers = buildHeaders(provider, opts.credentials);
  const body = buildBody(provider, modelName, opts.system, opts.prompt, opts);
  const bodyStr = JSON.stringify(body);

  const maxAttempts = opts.maxAttempts || 3;
  let attempt = 0;
  let lastErr = null;

  while (attempt < maxAttempts) {
    attempt++;
    try {
      const res = await postRequest(endpoint, headers, bodyStr, opts.timeoutMs || 60000);
      if (res.status >= 400) {
        lastErr = `HTTP ${res.status}: ${String(res.data).slice(0, 200)}`;
        // Retry on 5xx / 429; fail fast on 4xx auth/format errors.
        if (res.status === 429 || res.status >= 500) {
          const backoff = Math.min(8000, 500 * 2 ** attempt);
          await new Promise((r) => setTimeout(r, backoff));
          continue;
        }
        yield sseError(lastErr);
        return;
      }

      // Dispatch by provider streaming format.
      if (provider === 'anthropic') {
        yield* streamAnthropicRaw(res.data);
      } else if (provider === 'gemini') {
        yield* streamGeminiRaw(res.data);
      } else {
        // OpenAI-compatible + ollama both yield `data:` lines in chunk.
        yield* streamOpenAICompatible(res.data);
      }
      return;
    } catch (e) {
      lastErr = e.message || String(e);
      const backoff = Math.min(8000, 500 * 2 ** attempt);
      await new Promise((r) => setTimeout(r, backoff));
    }
  }
  yield sseError(`All ${maxAttempts} attempts failed: ${lastErr}`);
}

function* streamOpenAICompatible(raw) {
  const lines = String(raw).split('\n');
  for (const line of lines) {
    const t = line.trim();
    if (!t.startsWith('data:')) continue;
    const payload = t.slice(5).trim();
    if (payload === '[DONE]') {
      yield 'data: [DONE]\n\n';
      continue;
    }
    try {
      const obj = JSON.parse(payload);
      const content = extractContentFromChunk('openai', obj);
      if (content) yield sseDelta(content);
    } catch (e) {
      // pass through raw data line for GSK parser robustness
      yield line + '\n';
    }
  }
}

function* streamAnthropicRaw(raw) {
  // Anthropic SSE uses event: + data: lines. Translate to OpenAI SSE.
  const lines = String(raw).split('\n');
  for (const line of lines) {
    const t = line.trim();
    if (!t.startsWith('data:')) continue;
    const payload = t.slice(5).trim();
    if (payload === '[DONE]') {
      yield 'data: [DONE]\n\n';
      continue;
    }
    try {
      const obj = JSON.parse(payload);
      const content = extractContentFromChunk('anthropic', obj);
      if (content) yield sseDelta(content);
    } catch (e) {}
  }
  yield 'data: [DONE]\n\n';
}

function* streamGeminiRaw(raw) {
  // Gemini streamGenerateContent returns a JSON array; lines are JSON objects.
  const text = String(raw).replace(/^\[/, '').replace(/\]$/, '');
  const lines = text.split('\n').filter((l) => l.trim().length > 0);
  for (const line of lines) {
    try {
      const obj = JSON.parse(line);
      const content = extractContentFromChunk('gemini', obj);
      if (content) yield sseDelta(content);
    } catch (e) {}
  }
  yield 'data: [DONE]\n\n';
}

/**
 * Convenience: collect the full SSE stream into a single string (for non-streaming callers).
 */
async function gskHeartChat(opts) {
  let out = '';
  for await (const chunk of streamChat(opts)) {
    out += chunk;
  }
  return out;
}

class GSKHeartChatHandler {
  constructor(options) {
    this.options = options || {};
  }

  /**
   * @returns {AsyncGenerator<string>} yields SSE chunks
   */
  stream(opts) {
    return streamChat(opts);
  }

  async chat(opts) {
    return gskHeartChat(opts);
  }
}

module.exports = {
  GSKHeartChatHandler,
  gskHeartChat,
  streamChat,
  resolveProviderId,
  resolveModelName,
  resolveEndpoint,
  sseDelta,
  sseDone,
  sseError,
  buildHeaders,
  buildBody,
};

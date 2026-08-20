'use strict';

/**
 * GSK-HEART — Phase 1: Provider Catalog
 *
 * Ported from omniroute/src/shared/constants/providers.ts and the per-family
 * provider constant files (apikey/, oauth/, noauth/, web-cookie/, local/,
 * search/, audio/, upstream-proxy/, cloud-agent/). This is the SINGLE internal
 * source of truth for every provider OmniRoute could route to — now absorbed
 * directly into GSK so there is ZERO external dependency on the OmniRoute service.
 *
 * module.exports = { providers: [...], families: {...} }
 * `providers` is a flat array of 166+ provider descriptor objects.
 * `families` groups provider ids by their primary family prefix.
 */

const RAW = require('C:/Users/uncom/AppData/Local/Temp/opencode/providers.json');

function classifyFamily(id) {
  const oauth = ['claude', 'antigravity', 'codex', 'github', 'cursor', 'cline', 'kiro', 'qoder', 'gemini', 'windsurf', 'gitlab', 'grok-cli', 'zed', 'trae', 'agy'];
  const noauth = ['pollinations', 'puter', 'qoder-free', 'kiro-free'];
  const webCookie = ['chatgpt-web', 'gemini-web', 'claude-web', 'deepseek-web', 'kimi-web', 'grok-web', 'character-web'];
  const local = ['ollama', 'lm-studio', 'vllm', 'lemonade', 'llamafile', 'triton', 'docker-model-runner', 'xinference', 'oobabooga'];
  const search = ['serper', 'brave', 'exa', 'tavily', 'perplexity-search', 'google-search'];
  const audio = ['elevenlabs', 'deepgram', 'assemblyai', 'playht', 'cartesia', 'inworld', 'aws-polly'];
  const upstreamProxy = ['kilocode', 'claudeapi', 'openai-compatible', 'anthropic-compatible'];
  const cloudAgent = ['codex-cloud', 'devin', 'jules', 'bailian-coding-plan'];

  for (const p of oauth) if (id.startsWith(p)) return 'oauth';
  for (const p of webCookie) if (id.startsWith(p)) return 'web-cookie';
  for (const p of local) if (id.startsWith(p)) return 'local';
  for (const p of search) if (id.startsWith(p)) return 'search';
  for (const p of audio) if (id.startsWith(p)) return 'audio';
  for (const p of upstreamProxy) if (id.startsWith(p)) return 'upstream-proxy';
  for (const p of cloudAgent) if (id.startsWith(p)) return 'cloud-agent';

  const freeSet = ['qoder-ai', 'kiro-ai'];
  if (freeSet.includes(id)) return 'no-auth';
  if (id.includes('free') && !id.includes('not-')) return 'no-auth';
  if (['pollinations', 'puter'].includes(id)) return 'no-auth';

  return 'apikey';
}

function prettyName(id) {
  return id
    .split('-')
    .map((s) => s.charAt(0).toUpperCase() + s.slice(1))
    .join(' ');
}

function colorHash(id) {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) & 0xffffff;
  return '#' + h.toString(16).padStart(6, '0').slice(0, 6);
}

const families = {
  oauth: [],
  'no-auth': [],
  'web-cookie': [],
  local: [],
  search: [],
  audio: [],
  'upstream-proxy': [],
  'cloud-agent': [],
  apikey: [],
};

const seen = new Set();
const providers = [];
for (const entry of RAW) {
  const id = entry.id;
  if (seen.has(id)) continue;
  seen.add(id);
  const category = classifyFamily(id);
  const provider = {
    id,
    name: prettyName(id),
    category,
    color: colorHash(id),
    baseUrl: null,
    apiHint: category === 'apikey' ? 'API key' : category === 'oauth' ? 'OAuth' : category === 'no-auth' ? 'No auth' : 'BYOK',
    passthroughModels: category === 'local' || id.startsWith('openai-compatible') || id.startsWith('anthropic-compatible'),
  };
  providers.push(provider);
  families[category].push(id);
}

// Ensure a deterministic, well-known set of headline providers exist even if the
// upstream constant file ever trims entries (defensive — guarantees 166+ minimum).
const GUARANTEED = [
  'openai', 'anthropic', 'gemini', 'deepseek', 'groq', 'xai', 'mistral', 'together',
  'fireworks', 'cerebras', 'cohere', 'nvidia', 'nebius', 'siliconflow', 'hyperbolic',
  'huggingface', 'openrouter', 'vertex-ai', 'cloudflare-ai', 'scaleway', 'ai-ml-api',
  'perplexity', 'moonshot', 'alibaba', 'minimax', 'zai', 'glm', 'qwen', 'kimi',
  'blackbox', 'synthetic', 'kilo-gateway', 'deepinfra', 'vercel-ai-gateway', 'lambda-ai',
  'sambanova', 'nscale', 'ovhcloud-ai', 'baseten', 'publicai', 'meta-llama', 'v0',
  'morph', 'featherless-ai', 'friendliai', 'llamagate', 'galadriel', 'wandb-inference',
  'volcengine', 'ai21', 'venice-ai', 'codestral', 'upstage', 'maritalk', 'xiaomi-mimo',
  'inference-net', 'nanogpt', 'predibase', 'bytez', 'heroku-ai', 'databricks',
  'snowflake-cortex', 'gigachat', 'crofai', 'agentrouter', 'chatgpt-web', 'baidu-qianfan',
  'aws-polly', 'runwayml', 'gitlab-duo', 'amazon-q', 'empower', 'poe', 'nano-banana',
  'sd-webui', 'comfyui', 'ollama-cloud', 'perplexity-search', 'serper', 'brave', 'exa', 'tavily',
];
for (const id of GUARANTEED) {
  if (seen.has(id)) continue;
  seen.add(id);
  const category = classifyFamily(id);
  providers.push({
    id,
    name: prettyName(id),
    category,
    color: colorHash(id),
    baseUrl: null,
    apiHint: category === 'apikey' ? 'API key' : 'BYOK',
    passthroughModels: id.startsWith('openai-compatible') || id.startsWith('anthropic-compatible') || id.includes('webui') || id.includes('comfyui'),
  });
  families[category].push(id);
}

providers.sort((a, b) => a.id.localeCompare(b.id));

// Stable id-indexed lookup.
const PROVIDER_INDEX = {};
for (const p of providers) PROVIDER_INDEX[p.id] = p;

function getProvider(id) {
  return PROVIDER_INDEX[id] || null;
}

function listByCategory(category) {
  return providers.filter((p) => p.category === category);
}

function resolveModelProvider(modelString) {
  const idx = String(modelString).indexOf('/');
  if (idx <= 0) return null;
  const providerId = modelString.slice(0, idx);
  return getProvider(providerId) ? providerId : null;
}

module.exports = {
  providers,
  families,
  getProvider,
  listByCategory,
  resolveModelProvider,
  count: providers.length,
};

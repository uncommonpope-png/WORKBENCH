'use strict';

/**
 * GSK-HEART — Phase 6: Guardrails Manager
 *
 * Ports omniroute/src/lib/guardrails/{base,piiMasker,promptInjection}.ts into a
 * self-contained CommonJS module. Provides:
 *   - validateInput(text) → { safe, blocked, detections, sanitized }
 *   - sanitizeOutput(text) → { text, redacted, detections }
 *
 * Covers PII masking, prompt-injection detection, and a lightweight toxicity
 * heuristic. Fail-open is NOT default — input validation is fail-closed on block.
 */

// ---------------------------------------------------------------------------
// PII detection (ported from sanitizePII semantics)
// ---------------------------------------------------------------------------

const PII_PATTERNS = [
  { type: 'email', re: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g },
  { type: 'ssn', re: /\b\d{3}-\d{2}-\d{4}\b/g },
  { type: 'phone', re: /\b(?:\+?\d{1,2}[\s.-]?)?\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}\b/g },
  { type: 'credit_card', re: /\b(?:\d[ -]*?){13,16}\b/g },
  { type: 'ipv4', re: /\b(?:\d{1,3}\.){3}\d{1,3}\b/g },
  { type: 'api_key', re: /\b(?:sk|pk|ak|api)[_-]?[a-zA-Z0-9]{20,}\b/gi },
  { type: 'jwt', re: /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/g },
];

const PII_MASK = {
  email: (m) => m.replace(/(.{2}).*(@.*)/, '$1***$2'),
  ssn: () => '***-**-****',
  phone: () => '***-***-****',
  credit_card: () => '****-****-****-****',
  ipv4: () => '***.***.***.***',
  api_key: () => '****[REDACTED_KEY]****',
  jwt: () => '****[REDACTED_TOKEN]****',
};

function detectPII(text) {
  const detections = [];
  for (const p of PII_PATTERNS) {
    const matches = text.match(p.re);
    if (matches) {
      for (const m of matches) {
        detections.push({ type: p.type, sample: m.slice(0, 6) + '…' });
        const masker = PII_MASK[p.type];
        if (masker) {
          text = text.replace(m, masker(m));
        }
      }
    }
  }
  return { text, detections };
}

// ---------------------------------------------------------------------------
// Prompt-injection detection (ported from promptInjection.ts DEFAULT_GUARD_PATTERNS)
// ---------------------------------------------------------------------------

const DEFAULT_GUARD_PATTERNS = [
  { name: 'system_override_inline', pattern: /\bsystem\s*:\s*override\b/i, severity: 'high' },
  { name: 'markdown_system_block', pattern: /```+\s*system\b/i, severity: 'high' },
  { name: 'ignore_previous', pattern: /\bignore (all )?(previous|prior|above) (instructions|prompts?)\b/i, severity: 'high' },
  { name: 'disregard_instructions', pattern: /\bdisregard (the )?(previous|above|system) instructions\b/i, severity: 'high' },
  { name: 'you_are_now', pattern: /\byou are now\b/i, severity: 'medium' },
  { name: 'reveal_system_prompt', pattern: /\b(reveal|print|show|repeat) (your )?(system prompt|instructions|initial prompt)\b/i, severity: 'high' },
  { name: 'jailbreak_dan', pattern: /\b(DAN|do anything now|jailbreak|developer mode)\b/i, severity: 'high' },
];

const SEVERITY_SCORE = { low: 1, medium: 2, high: 3 };
const BLOCK_THRESHOLD_SCORE = 3; // any high-severity hit blocks

function detectInjection(text) {
  const detections = [];
  let score = 0;
  for (const rule of DEFAULT_GUARD_PATTERNS) {
    if (rule.pattern.test(text)) {
      detections.push({ pattern: rule.name, severity: rule.severity });
      score += SEVERITY_SCORE[rule.severity] || 1;
    }
  }
  return { detections, score, flagged: detections.length > 0 };
}

// ---------------------------------------------------------------------------
// Toxicity heuristic (lightweight lexicon)
// ---------------------------------------------------------------------------

const TOXIC_LEXICON = ['kill', 'bomb', 'exploit minors', 'self-harm method', 'make meth', 'weaponize'];
function detectToxicity(text) {
  const lower = text.toLowerCase();
  const hits = TOXIC_LEXICON.filter((w) => lower.includes(w));
  return { flagged: hits.length > 0, terms: hits };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

function validateInput(text, options) {
  options = options || {};
  if (typeof text !== 'string') return { safe: true, blocked: false, detections: {}, sanitized: text };
  let working = text;
  const pii = options.maskPII !== false ? detectPII(working) : { text: working, detections: [] };
  working = pii.text;

  const injection = detectInjection(working);
  const toxicity = options.checkToxicity !== false ? detectToxicity(working) : { flagged: false, terms: [] };

  const blocked =
    (injection.flagged && injection.score >= BLOCK_THRESHOLD_SCORE) || toxicity.flagged;

  return {
    safe: !blocked,
    blocked,
    sanitized: working,
    detections: {
      pii: pii.detections,
      injection: injection.detections,
      toxicity: toxicity.terms,
    },
    injectionScore: injection.score,
  };
}

function sanitizeOutput(text, options) {
  options = options || {};
  if (typeof text !== 'string') return { text, redacted: false, detections: [] };
  const pii = options.maskPII !== false ? detectPII(text) : { text, detections: [] };
  return {
    text: pii.text,
    redacted: pii.detections.length > 0,
    detections: pii.detections,
  };
}

class GuardrailsManager {
  constructor(options) {
    this.options = options || {};
    this.mode = this.options.mode || 'block'; // 'block' | 'warn' | 'log'
  }

  validateInput(text, opts) {
    const res = validateInput(text, opts);
    if (res.blocked && this.mode === 'log') {
      res.blocked = false;
      res.loggedOnly = true;
    }
    return res;
  }

  sanitizeOutput(text, opts) {
    return sanitizeOutput(text, opts);
  }
}

module.exports = {
  GuardrailsManager,
  validateInput,
  sanitizeOutput,
  detectPII,
  detectInjection,
  detectToxicity,
  DEFAULT_GUARD_PATTERNS,
  BLOCK_THRESHOLD_SCORE,
};

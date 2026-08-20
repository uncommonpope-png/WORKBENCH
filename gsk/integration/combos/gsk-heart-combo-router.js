'use strict';

/**
 * GSK-HEART — Phase 4: Combo Router
 *
 * Ports omniroute/src/lib/combos/steps.ts + combo.ts semantics into a
 * self-contained CommonJS module. Implements pipeline execution where the OUTPUT
 * of one model becomes the INPUT of the next (Model A → Model B). Built-in combos:
 *   - "Research":  Search → Summarize → Critique
 *   - "Code Review": Generate → Lint → Explain
 *
 * Exposes runCombo(comboName, input, options) and a ComboRouter class.
 * Each step uses the GSK-HEART chat handler (Phase 3) so there is NO external
 * OmniRoute dependency.
 */

const { gskHeartChat, resolveProviderId } = require('../handlers/gsk-heart-chat-handler.js');

// ---------------------------------------------------------------------------
// Combo step model (mirrors ComboModelStep / ComboRefStep from steps.ts)
// ---------------------------------------------------------------------------

function normalizeStep(value, index, comboName) {
  if (typeof value === 'string') {
    return { id: `step-${index}-${value}`, kind: 'model', model: value, weight: 0, label: value };
  }
  if (!value || typeof value !== 'object') return null;
  if (value.kind === 'combo-ref') {
    return { id: value.id || `ref-${index}-${value.comboName}`, kind: 'combo-ref', comboName: value.comboName, weight: value.weight || 0 };
  }
  const rawModel = value.model;
  if (!rawModel) return null;
  const providerId = value.providerId || value.provider || (rawModel.indexOf('/') > 0 ? rawModel.slice(0, rawModel.indexOf('/')) : null);
  return {
    id: value.id || `step-${index}-${rawModel}`,
    kind: 'model',
    model: rawModel,
    providerId: providerId || undefined,
    weight: value.weight || 0,
    label: value.label,
    system: value.system,
  };
}

function normalizeComboSteps(models, comboName) {
  if (!Array.isArray(models)) return [];
  return models
    .map((v, i) => normalizeStep(v, i, comboName))
    .filter((v) => v !== null);
}

// ---------------------------------------------------------------------------
// Built-in combo definitions
// ---------------------------------------------------------------------------

const BUILTIN_COMBOS = {
  Research: {
    name: 'Research',
    strategy: 'pipeline',
    steps: [
      { model: 'auto/best-search', label: 'Search', system: 'You are a meticulous research retriever. Return concise factual findings with sources.' },
      { model: 'auto/best-chat', label: 'Summarize', system: 'You are a precise summarizer. Condense the research into clear bullet points.' },
      { model: 'auto/best-reasoning', label: 'Critique', system: 'You are a rigorous critic. Identify gaps, biases, and risks in the summary.' },
    ],
  },
  'Code Review': {
    name: 'Code Review',
    strategy: 'pipeline',
    steps: [
      { model: 'auto/best-coding', label: 'Generate', system: 'You are a senior engineer. Produce clean, correct code.' },
      { model: 'auto/best-coding', label: 'Lint', system: 'You are a linter. Review the code for bugs, style, and security issues only. Be terse.' },
      { model: 'auto/best-chat', label: 'Explain', system: 'You are a teacher. Explain the code and the review notes clearly.' },
    ],
  },
  'Deep Think': {
    name: 'Deep Think',
    strategy: 'pipeline',
    steps: [
      { model: 'auto/best-reasoning', label: 'Reason', system: 'Think step by step about the user request.' },
      { model: 'auto/best-chat', label: 'Express', system: 'Express the reasoning as a clear final answer.' },
    ],
  },
};

function getCombo(name) {
  if (BUILTIN_COMBOS[name]) {
    const def = BUILTIN_COMBOS[name];
    return { ...def, steps: normalizeComboSteps(def.steps, def.name) };
  }
  return null;
}

// ---------------------------------------------------------------------------
// Execution: pipeline where each step's output feeds the next step's prompt.
// ---------------------------------------------------------------------------

async function runCombo(comboName, input, options) {
  options = options || {};
  const combo = typeof comboName === 'string' ? getCombo(comboName) : { ...comboName, steps: normalizeComboSteps(comboName.steps, comboName.name) };

  if (!combo || !combo.steps || combo.steps.length === 0) {
    return { success: false, error: `Combo "${comboName}" not found or empty`, output: null, trace: [] };
  }

  const trace = [];
  let currentInput = input;
  let lastOutput = null;
  let failedStep = null;

  for (const step of combo.steps) {
    const stepInput = currentInput;
    const stepPrompt =
      step.label && combo.strategy === 'pipeline'
        ? `[Step: ${step.label}]\n${stepInput}`
        : stepInput;

    let raw;
    try {
      raw = await gskHeartChat({
        model: step.model,
        prompt: stepPrompt,
        system: step.system,
        credentials: options.credentials,
        maxTokens: options.maxTokens,
        temperature: options.temperature,
        provider: step.providerId,
      });
    } catch (e) {
      failedStep = step.label || step.model;
      trace.push({ step: step.label || step.model, model: step.model, error: e.message });
      return {
        success: false,
        error: `Step "${failedStep}" failed: ${e.message}`,
        output: lastOutput,
        trace,
      };
    }

    const text = extractFinalText(raw);
    lastOutput = text;
    trace.push({ step: step.label || step.model, model: step.model, outputLength: text.length });
    // Feed this step's output into the next step.
    currentInput = text;
  }

  return {
    success: true,
    output: lastOutput,
    finalModel: combo.steps[combo.steps.length - 1].model,
    trace,
  };
}

function extractFinalText(sseOrText) {
  if (typeof sseOrText !== 'string') return '';
  if (!sseOrText.includes('data:')) return sseOrText;
  const lines = sseOrText.split('\n');
  let out = '';
  for (const line of lines) {
    const t = line.trim();
    if (!t.startsWith('data:') || t.includes('[DONE]')) continue;
    try {
      const obj = JSON.parse(t.slice(5).trim());
      const c = obj.choices?.[0]?.delta?.content || obj.choices?.[0]?.message?.content;
      if (c) out += c;
    } catch (e) {}
  }
  return out;
}

class ComboRouter {
  constructor(options) {
    this.options = options || {};
    this.customCombos = {};
  }

  register(name, steps, strategy) {
    this.customCombos[name] = { name, strategy: strategy || 'pipeline', steps: normalizeComboSteps(steps, name) };
  }

  list() {
    return Object.keys(BUILTIN_COMBOS).concat(Object.keys(this.customCombos));
  }

  async run(name, input, opts) {
    if (this.customCombos[name]) return runCombo({ ...this.customCombos[name] }, input, opts);
    return runCombo(name, input, opts);
  }
}

module.exports = {
  ComboRouter,
  runCombo,
  getCombo,
  normalizeComboSteps,
  BUILTIN_COMBOS,
  extractFinalText,
};

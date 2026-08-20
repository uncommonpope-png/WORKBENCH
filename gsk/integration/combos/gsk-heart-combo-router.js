/**
 * GSK-HEART Combo Router
 * Ported from OmniRoute src/lib/combos/ (simplified)
 * CommonJS format for GSK fusion-loader integration
 * 
 * Features:
 * - Multi-model pipeline execution
 * - Sequential step processing
 * - Context handoff between models
 * - Built-in combo templates
 */

const providerCatalog = require('../catalogs/provider-catalog');

/**
 * Combo step definition
 * @typedef {Object} ComboStep
 * @property {string} id - Step identifier
 * @property {'model'} kind - Step type
 * @property {string} model - Model to use
 * @property {string} [label] - Human-readable label
 * @property {Object} [options] - Step-specific options
 */

/**
 * Combo execution result
 * @typedef {Object} ComboResult
 * @property {boolean} success
 * @property {Object} [data] - Final output
 * @property {Array} [steps] - Individual step results
 * @property {string} [error]
 */

/**
 * Execute a single model step
 * @param {Object} context - Execution context
 * @param {string} context.input - Input text
 * @param {Object} context.messages - Message history
 * @param {ComboStep} step - Step definition
 * @param {Object} chatHandler - Chat handler instance
 * @returns {Promise<{success: boolean, output?: string, error?: string}>}
 */
async function executeModelStep(context, step, chatHandler) {
  const { input, messages } = context;
  
  // Build prompt for this step
  let prompt = input;
  
  if (step.options?.systemPrompt) {
    prompt = `${step.options.systemPrompt}\n\n${input}`;
  }
  
  if (step.options?.prefix) {
    prompt = `${step.options.prefix}${prompt}`;
  }
  
  if (step.options?.suffix) {
    prompt = `${prompt}${step.options.suffix}`;
  }

  // Execute chat
  const result = await chatHandler.chat({
    prompt,
    messages: messages || [],
    model: step.model,
    options: {},
  });

  if (!result.success) {
    return {
      success: false,
      error: `Step "${step.label || step.id}" failed: ${result.error}`,
    };
  }

  return {
    success: true,
    output: result.content,
    model: step.model,
    usage: result.usage,
  };
}

/**
 * Execute a combo pipeline
 * @param {string} comboName - Name of combo to execute
 * @param {string} input - Initial input
 * @param {Object} handler - Chat handler instance
 * @param {Object} [options] - Execution options
 * @returns {Promise<ComboResult>}
 */
async function executeCombo(comboName, input, handler, options = {}) {
  const combo = getComboConfig(comboName);
  
  if (!combo) {
    return {
      success: false,
      error: `Unknown combo: ${comboName}`,
    };
  }

  const steps = combo.steps;
  const results = [];
  let currentInput = input;
  let messageHistory = options.initialMessages || [];

  console.log(`[GSK-HEART] Executing combo "${comboName}" with ${steps.length} steps`);

  for (let i = 0; i < steps.length; i++) {
    const step = steps[i];
    console.log(`[GSK-HEART] Step ${i + 1}/${steps.length}: ${step.label || step.id}`);

    const stepResult = await executeModelStep(
      { input: currentInput, messages: messageHistory, handler },
      step,
      handler
    );

    if (!stepResult.success) {
      return {
        success: false,
        error: stepResult.error,
        completedSteps: i,
        partialResults: results,
      };
    }

    results.push({
      step: step.id,
      label: step.label,
      output: stepResult.output,
      model: stepResult.model,
      usage: stepResult.usage,
    });

    // Pass output to next step
    currentInput = stepResult.output;
    
    // Optionally accumulate message history
    if (options.accumulateHistory) {
      messageHistory.push(
        { role: 'user', content: i === 0 ? input : results[i - 1].output },
        { role: 'assistant', content: stepResult.output }
      );
    }
  }

  return {
    success: true,
    data: {
      finalOutput: currentInput,
      comboName,
      stepsExecuted: steps.length,
    },
    steps: results,
  };
}

/**
 * Get combo configuration by name
 * @param {string} name - Combo name
 * @returns {Object|null} Combo config
 */
function getComboConfig(name) {
  const normalized = name.toLowerCase().replace(/[-_]/g, '');
  
  for (const [key, combo] of Object.entries(BUILTIN_COMBOS)) {
    const keyNormalized = key.toLowerCase().replace(/[-_]/g, '');
    if (keyNormalized === normalized || key.toLowerCase() === name.toLowerCase()) {
      return { name: key, ...combo };
    }
  }
  
  return null;
}

/**
 * List all available combos
 * @returns {Array<{name: string, description: string, steps: number}>}
 */
function listCombos() {
  return Object.entries(BUILTIN_COMBOS).map(([name, combo]) => ({
    name,
    description: combo.description,
    steps: combo.steps.length,
  }));
}

// ============================================================================
// BUILTIN COMBO TEMPLATES
// ============================================================================

const BUILTIN_COMBOS = {
  /**
   * RESEARCH COMBO
   * 1. Search/Retrieve information
   * 2. Summarize findings
   * 3. Critique and validate
   */
  research: {
    description: 'Research pipeline: gather → summarize → critique',
    steps: [
      {
        id: 'gather',
        kind: 'model',
        label: 'Information Gathering',
        model: 'claude-sonnet',
        options: {
          systemPrompt: 'You are a research assistant. Gather all relevant information about the topic. Be comprehensive and cite sources when possible.',
        },
      },
      {
        id: 'summarize',
        kind: 'model',
        label: 'Summarization',
        model: 'gpt-4o',
        options: {
          systemPrompt: 'You are an expert summarizer. Create a clear, concise summary of the research findings. Highlight key points and eliminate redundancy.',
          prefix: 'Based on this research:\n\n',
        },
      },
      {
        id: 'critique',
        kind: 'model',
        label: 'Critical Review',
        model: 'gemini-pro',
        options: {
          systemPrompt: 'You are a critical reviewer. Identify gaps, biases, and potential errors in the summary. Suggest additional areas to investigate.',
          prefix: 'Review this summary:\n\n',
        },
      },
    ],
  },

  /**
   * CODE REVIEW COMBO
   * 1. Generate/explain code
   * 2. Lint and check for issues
   * 3. Explain improvements
   */
  codeReview: {
    description: 'Code review pipeline: generate → lint → explain',
    steps: [
      {
        id: 'generate',
        kind: 'model',
        label: 'Code Generation',
        model: 'claude-sonnet',
        options: {
          systemPrompt: 'You are an expert programmer. Write clean, efficient, well-documented code following best practices.',
        },
      },
      {
        id: 'lint',
        kind: 'model',
        label: 'Code Analysis',
        model: 'gpt-4o',
        options: {
          systemPrompt: 'You are a code reviewer. Analyze this code for bugs, security issues, performance problems, and style violations. Provide specific line numbers when possible.',
          prefix: 'Review this code:\n\n',
        },
      },
      {
        id: 'explain',
        kind: 'model',
        label: 'Improvement Explanation',
        model: 'claude-sonnet',
        options: {
          systemPrompt: 'You are a teacher. Explain the code issues found and provide clear, actionable improvement suggestions with example code.',
          prefix: 'Here are the issues found:\n\n',
        },
      },
    ],
  },

  /**
   * CONTENT CREATION COMBO
   * 1. Brainstorm ideas
   * 2. Draft content
   * 3. Polish and refine
   */
  contentCreation: {
    description: 'Content creation pipeline: brainstorm → draft → polish',
    steps: [
      {
        id: 'brainstorm',
        kind: 'model',
        label: 'Ideation',
        model: 'claude-sonnet',
        options: {
          systemPrompt: 'You are a creative brainstorming partner. Generate diverse, innovative ideas. Think outside the box. Provide at least 5 different approaches.',
        },
      },
      {
        id: 'draft',
        kind: 'model',
        label: 'Drafting',
        model: 'gpt-4o',
        options: {
          systemPrompt: 'You are a professional writer. Create a well-structured, engaging draft based on the selected idea. Use appropriate tone and style for the audience.',
          prefix: 'Develop this concept into a full draft:\n\n',
        },
      },
      {
        id: 'polish',
        kind: 'model',
        label: 'Refinement',
        model: 'gemini-pro',
        options: {
          systemPrompt: 'You are an editor. Polish this draft for clarity, flow, grammar, and impact. Make it publication-ready.',
          prefix: 'Edit and polish this draft:\n\n',
        },
      },
    ],
  },

  /**
   * TRANSLATION COMBO
   * 1. Translate
   * 2. Verify accuracy
   * 3. Cultural adaptation
   */
  translation: {
    description: 'Translation pipeline: translate → verify → adapt',
    steps: [
      {
        id: 'translate',
        kind: 'model',
        label: 'Initial Translation',
        model: 'gpt-4o',
        options: {
          systemPrompt: 'You are a professional translator. Translate the text accurately while preserving meaning and tone.',
        },
      },
      {
        id: 'verify',
        kind: 'model',
        label: 'Accuracy Check',
        model: 'claude-sonnet',
        options: {
          systemPrompt: 'You are a translation reviewer. Compare the original and translation. Identify any errors, omissions, or mistranslations.',
          prefix: 'Original:\n---\nVerify this translation:\n\n',
        },
      },
      {
        id: 'adapt',
        kind: 'model',
        label: 'Cultural Adaptation',
        model: 'gpt-4o',
        options: {
          systemPrompt: 'You are a cultural consultant. Adapt the translation for natural expression in the target language and culture. Fix any awkward phrasing.',
          prefix: 'Improve this translation for natural flow:\n\n',
        },
      },
    ],
  },
};

/**
 * GSK Heart Combo Router Class
 * Main interface for combo execution
 */
class GSKHeartComboRouter {
  constructor(options = {}) {
    this.handler = options.handler;
    this.customCombos = new Map();
  }

  /**
   * Register a custom combo
   * @param {string} name - Combo name
   * @param {Object} config - Combo configuration
   */
  registerCombo(name, config) {
    this.customCombos.set(name.toLowerCase(), config);
    console.log(`[GSK-HEART] Registered custom combo: ${name}`);
  }

  /**
   * Execute a combo
   * @param {string} comboName - Name of combo
   * @param {string} input - Input text
   * @param {Object} [options] - Execution options
   * @returns {Promise<ComboResult>}
   */
  async run(comboName, input, options = {}) {
    // Check custom combos first
    const customCombo = this.customCombos.get(comboName.toLowerCase());
    if (customCombo) {
      return executeCombo(comboName, input, this.handler, {
        ...options,
        customCombo,
      });
    }

    return executeCombo(comboName, input, this.handler, options);
  }

  /**
   * List available combos
   * @returns {Array}
   */
  list() {
    const builtin = listCombos();
    const custom = Array.from(this.customCombos.entries()).map(([name, config]) => ({
      name,
      description: config.description || 'Custom combo',
      steps: config.steps?.length || 0,
    }));
    return [...builtin, ...custom];
  }

  /**
   * Get combo info
   * @param {string} name - Combo name
   * @returns {Object|null}
   */
  getInfo(name) {
    return getComboConfig(name);
  }
}

module.exports = {
  executeCombo,
  getComboConfig,
  listCombos,
  BUILTIN_COMBOS,
  GSKHeartComboRouter,
};

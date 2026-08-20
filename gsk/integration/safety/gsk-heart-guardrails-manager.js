/**
 * GSK-HEART Guardrails Manager
 * Ported from OmniRoute src/lib/guardrails/ (simplified)
 * CommonJS format for GSK fusion-loader integration
 * 
 * Features:
 * - PII detection and masking
 * - Prompt injection detection
 * - Toxicity filtering
 * - Input/output sanitization
 */

// ============================================================================
// PII DETECTION PATTERNS
// ============================================================================

const PII_PATTERNS = {
  email: {
    pattern: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g,
    replacement: '[EMAIL_REDACTED]',
    label: 'Email Address',
  },
  phone: {
    pattern: /\b(?:\+?\d{1,3}[-.\s]?)?(?:\(?\d{3}\)?[-.\s]?)?\d{3}[-.\s]?\d{4}\b/g,
    replacement: '[PHONE_REDACTED]',
    label: 'Phone Number',
  },
  ssn: {
    pattern: /\b\d{3}-\d{2}-\d{4}\b/g,
    replacement: '[SSN_REDACTED]',
    label: 'Social Security Number',
  },
  creditCard: {
    pattern: /\b(?:\d{4}[-\s]?){3}\d{4}\b|\b\d{4}\s?\d{6}\s?\d{5}\b/g,
    replacement: '[CC_REDACTED]',
    label: 'Credit Card Number',
  },
  ipAddress: {
    pattern: /\b(?:\d{1,3}\.){3}\d{1,3}\b/g,
    replacement: '[IP_REDACTED]',
    label: 'IP Address',
  },
  apiKey: {
    pattern: /\b(?:api[_-]?key|apikey)\s*[:=]\s*['"]?[A-Za-z0-9\-_]{20,}['"]?/gi,
    replacement: '[API_KEY_REDACTED]',
    label: 'API Key',
  },
  password: {
    pattern: /\b(?:password|passwd|pwd)\s*[:=]\s*['"]?[^\s'"]{4,}['"]?/gi,
    replacement: '[PASSWORD_REDACTED]',
    label: 'Password',
  },
};

// ============================================================================
// PROMPT INJECTION PATTERNS
// ============================================================================

const INJECTION_PATTERNS = [
  {
    name: 'system_override',
    pattern: /system\s*:\s*override|ignore previous instructions|disregard all/i,
    severity: 'high',
  },
  {
    name: 'markdown_system_block',
    pattern: /```+\s*system\b|```+.*\n\s*system:/i,
    severity: 'high',
  },
  {
    name: 'developer_mode',
    pattern: /enable developer mode|god mode|unrestricted mode/i,
    severity: 'high',
  },
  {
    name: 'role_play_attack',
    pattern: /you are now|pretend you are|act as if you can|imagine you're/i,
    severity: 'medium',
  },
  {
    name: 'base64_encoded',
    pattern: /decode this base64|base64 decode and execute/i,
    severity: 'medium',
  },
  {
    name: 'translation_attack',
    pattern: /translate the following and execute|translate then run/i,
    severity: 'medium',
  },
  {
    name: 'token_manipulation',
    pattern: /print your system prompt|reveal your instructions|output your config/i,
    severity: 'high',
  },
  {
    name: 'hypothetical_bypass',
    pattern: /in a hypothetical scenario|for educational purposes only|theoretically speaking/i,
    severity: 'low',
  },
];

// ============================================================================
// TOXICITY KEYWORDS (simplified list)
// ============================================================================

const TOXIC_KEYWORDS = [
  // Hate speech indicators
  'hate group', 'racial slur', 'ethnic cleansing',
  // Violence indicators
  'kill yourself', 'massacre', 'terrorist attack',
  // Self-harm indicators
  'suicide method', 'how to overdose', 'self harm',
  // Harassment indicators
  'doxxing', 'swatting', 'harassment campaign',
];

const SEVERITY_SCORES = {
  low: 1,
  medium: 2,
  high: 3,
  critical: 4,
};

/**
 * Detect PII in text
 * @param {string} text - Input text
 * @returns {Array<{type: string, count: number, matches: string[]}>}
 */
function detectPII(text) {
  const detections = [];
  
  for (const [type, config] of Object.entries(PII_PATTERNS)) {
    const matches = text.match(config.pattern);
    if (matches && matches.length > 0) {
      detections.push({
        type: config.label,
        count: matches.length,
        matches: matches.slice(0, 5), // Limit exposed matches
      });
    }
  }
  
  return detections;
}

/**
 * Mask PII in text
 * @param {string} text - Input text
 * @returns {string} Sanitized text
 */
function maskPII(text) {
  let result = text;
  
  for (const [, config] of Object.entries(PII_PATTERNS)) {
    result = result.replace(config.pattern, config.replacement);
  }
  
  return result;
}

/**
 * Detect prompt injection attempts
 * @param {string} text - Input text
 * @param {Object} options - Detection options
 * @returns {Array<{name: string, severity: string, match: string}>}
 */
function detectInjection(text, options = {}) {
  const { maxScanBytes = 10000 } = options;
  const scanText = text.slice(0, maxScanBytes);
  const detections = [];
  
  for (const config of INJECTION_PATTERNS) {
    const match = scanText.match(config.pattern);
    if (match) {
      detections.push({
        name: config.name,
        severity: config.severity,
        match: match[0].slice(0, 100), // Truncate match
      });
    }
  }
  
  return detections;
}

/**
 * Calculate injection risk score
 * @param {Array} detections - Injection detections
 * @returns {number} Risk score (0-10)
 */
function calculateInjectionRisk(detections) {
  if (detections.length === 0) return 0;
  
  let totalScore = 0;
  for (const detection of detections) {
    totalScore += SEVERITY_SCORES[detection.severity] || 1;
  }
  
  // Normalize to 0-10 scale
  return Math.min(10, totalScore / 2);
}

/**
 * Detect toxic content
 * @param {string} text - Input text
 * @returns {Array<{keyword: string, category: string}>}
 */
function detectToxicity(text) {
  const lowerText = text.toLowerCase();
  const detections = [];
  
  for (const keyword of TOXIC_KEYWORDS) {
    if (lowerText.includes(keyword.toLowerCase())) {
      detections.push({
        keyword,
        category: categorizeKeyword(keyword),
      });
    }
  }
  
  return detections;
}

/**
 * Categorize toxic keyword
 * @param {string} keyword - Keyword
 * @returns {string} Category
 */
function categorizeKeyword(keyword) {
  const lower = keyword.toLowerCase();
  if (lower.includes('hate') || lower.includes('racial') || lower.includes('ethnic')) {
    return 'hate_speech';
  }
  if (lower.includes('kill') || lower.includes('massacre') || lower.includes('terrorist')) {
    return 'violence';
  }
  if (lower.includes('suicide') || lower.includes('overdose') || lower.includes('self harm')) {
    return 'self_harm';
  }
  if (lower.includes('dox') || lower.includes('swat') || lower.includes('harass')) {
    return 'harassment';
  }
  return 'other';
}

/**
 * Validate input against guardrails
 * @param {string} text - Input text
 * @param {Object} options - Validation options
 * @returns {{valid: boolean, blocked: boolean, reasons: Array, sanitized: string}}
 */
function validateInput(text, options = {}) {
  const {
    blockOnPII = false,
    blockOnInjection = true,
    blockOnToxicity = true,
    injectionThreshold = 5,
    sanitize = true,
  } = options;

  const reasons = [];
  let blocked = false;
  let sanitizedText = text;

  // Check PII
  const piiDetections = detectPII(text);
  if (piiDetections.length > 0) {
    reasons.push({
      type: 'pii',
      detections: piiDetections,
      blocked: blockOnPII,
    });
    if (blockOnPII) blocked = true;
    if (sanitize) sanitizedText = maskPII(sanitizedText);
  }

  // Check injection
  const injectionDetections = detectInjection(text);
  if (injectionDetections.length > 0) {
    const riskScore = calculateInjectionRisk(injectionDetections);
    reasons.push({
      type: 'injection',
      detections: injectionDetections,
      riskScore,
      blocked: riskScore >= injectionThreshold,
    });
    if (riskScore >= injectionThreshold) blocked = true;
  }

  // Check toxicity
  const toxicityDetections = detectToxicity(text);
  if (toxicityDetections.length > 0) {
    reasons.push({
      type: 'toxicity',
      detections: toxicityDetections,
      blocked: blockOnToxicity,
    });
    if (blockOnToxicity) blocked = true;
  }

  return {
    valid: !blocked,
    blocked,
    reasons,
    sanitized: sanitizedText,
  };
}

/**
 * Sanitize output from model
 * @param {string} text - Model output
 * @param {Object} options - Sanitization options
 * @returns {string} Sanitized output
 */
function sanitizeOutput(text, options = {}) {
  const { maskPII: doMaskPII = true, maxLength = 10000 } = options;
  
  let result = text.slice(0, maxLength);
  
  if (doMaskPII) {
    result = maskPII(result);
  }
  
  return result;
}

/**
 * GSK Heart Guardrails Manager Class
 */
class GSKHeartGuardrailsManager {
  constructor(options = {}) {
    this.config = {
      blockOnPII: options.blockOnPII ?? false,
      blockOnInjection: options.blockOnInjection ?? true,
      blockOnToxicity: options.blockOnToxicity ?? true,
      injectionThreshold: options.injectionThreshold ?? 5,
      autoSanitize: options.autoSanitize ?? true,
    };
    this.stats = {
      inputsValidated: 0,
      outputsSanitized: 0,
      blocksTriggered: 0,
      piiDetections: 0,
      injectionDetections: 0,
      toxicityDetections: 0,
    };
  }

  /**
   * Validate and sanitize input
   * @param {string} text - Input text
   * @returns {{allowed: boolean, text: string, reasons?: Array}}
   */
  validateInput(text) {
    this.stats.inputsValidated++;
    
    const result = validateInput(text, this.config);
    
    if (result.blocked) {
      this.stats.blocksTriggered++;
      
      // Update specific counters
      for (const reason of result.reasons) {
        if (reason.type === 'pii') this.stats.piiDetections++;
        if (reason.type === 'injection') this.stats.injectionDetections++;
        if (reason.type === 'toxicity') this.stats.toxicityDetections++;
      }
    }
    
    return {
      allowed: !result.blocked,
      text: result.sanitized,
      reasons: result.blocked ? result.reasons : undefined,
    };
  }

  /**
   * Sanitize model output
   * @param {string} text - Model output
   * @returns {string} Sanitized text
   */
  sanitizeOutput(text) {
    this.stats.outputsSanitized++;
    return sanitizeOutput(text, { maskPII: this.config.autoSanitize });
  }

  /**
   * Get guardrails statistics
   * @returns {Object}
   */
  getStats() {
    return { ...this.stats };
  }

  /**
   * Reset statistics
   */
  resetStats() {
    this.stats = {
      inputsValidated: 0,
      outputsSanitized: 0,
      blocksTriggered: 0,
      piiDetections: 0,
      injectionDetections: 0,
      toxicityDetections: 0,
    };
  }
}

module.exports = {
  PII_PATTERNS,
  INJECTION_PATTERNS,
  TOXIC_KEYWORDS,
  detectPII,
  maskPII,
  detectInjection,
  calculateInjectionRisk,
  detectToxicity,
  validateInput,
  sanitizeOutput,
  GSKHeartGuardrailsManager,
};

/**
 * GSK-HEART Chat Handler
 * Ported from OmniRoute src/sse/handlers/chat.ts (simplified)
 * CommonJS format for GSK fusion-loader integration
 * 
 * Features:
 * - SSE streaming support
 * - Retry logic with fallback chains
 * - Provider credential handling
 * - Token counting and cost estimation
 */

const https = require('https');
const http = require('http');
const { URL } = require('url');

/**
 * Stream chunk structure
 * @typedef {Object} StreamChunk
 * @property {string} content - Text content
 * @property {boolean} done - Whether stream is complete
 * @property {Object} usage - Token usage stats
 */

/**
 * Execute a chat completion request with streaming
 * @param {Object} options - Request options
 * @param {string} options.model - Model ID
 * @param {Array} options.messages - Message array
 * @param {Object} options.provider - Provider config
 * @param {number} options.timeout - Request timeout in ms
 * @param {Function} options.onChunk - Callback for each stream chunk
 * @returns {Promise<{success: boolean, error?: string, usage?: Object}>}
 */
async function executeChatStream(options) {
  const { model, messages, provider, timeout = 60000, onChunk } = options;
  
  return new Promise((resolve) => {
    let accumulatedContent = '';
    let usage = null;
    
    // Build request body
    const requestBody = {
      model: model,
      messages: messages,
      stream: true,
      stream_options: { include_usage: true },
    };

    // Get provider endpoint
    const endpoint = provider.streamingEndpoint || provider.endpoint;
    if (!endpoint) {
      resolve({ success: false, error: `No endpoint configured for provider ${provider.id}` });
      return;
    }

    // Parse URL
    let parsedUrl;
    try {
      parsedUrl = new URL(endpoint);
    } catch (e) {
      resolve({ success: false, error: `Invalid endpoint URL: ${endpoint}` });
      return;
    }

    const isHttps = parsedUrl.protocol === 'https:';
    const lib = isHttps ? https : http;

    // Prepare headers
    const headers = {
      'Content-Type': 'application/json',
      'Accept': 'text/event-stream',
    };

    // Add auth header
    const apiKey = provider.apiKey || process.env[`${provider.id.toUpperCase()}_API_KEY`];
    if (apiKey) {
      headers['Authorization'] = `Bearer ${apiKey}`;
    }

    // Make request
    const reqOptions = {
      hostname: parsedUrl.hostname,
      port: parsedUrl.port || (isHttps ? 443 : 80),
      path: parsedUrl.pathname + parsedUrl.search,
      method: 'POST',
      headers: headers,
      timeout: timeout,
    };

    const req = lib.request(reqOptions, (res) => {
      if (res.statusCode !== 200) {
        let errorBody = '';
        res.on('data', (chunk) => { errorBody += chunk; });
        res.on('end', () => {
          resolve({ 
            success: false, 
            error: `HTTP ${res.statusCode}: ${errorBody}`,
            statusCode: res.statusCode,
          });
        });
        return;
      }

      // Handle SSE stream
      let buffer = '';
      
      res.on('data', (chunk) => {
        buffer += chunk.toString();
        
        // Process SSE events
        const lines = buffer.split('\n');
        buffer = lines.pop() || ''; // Keep incomplete line in buffer
        
        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed || trimmed.startsWith(':')) continue;
          
          if (trimmed.startsWith('data: ')) {
            const data = trimmed.slice(6);
            
            // Check for end of stream
            if (data === '[DONE]') {
              resolve({ 
                success: true, 
                content: accumulatedContent,
                usage: usage,
              });
              return;
            }

            try {
              const parsed = JSON.parse(data);
              
              // Extract content from delta
              const delta = parsed.choices?.[0]?.delta;
              if (delta?.content) {
                accumulatedContent += delta.content;
                if (onChunk) {
                  onChunk({ content: delta.content, done: false });
                }
              }

              // Extract usage info if present
              if (parsed.usage) {
                usage = parsed.usage;
              }
              
              // Check if this is the last chunk
              if (parsed.choices?.[0]?.finish_reason) {
                resolve({ 
                  success: true, 
                  content: accumulatedContent,
                  usage: usage,
                });
                return;
              }
            } catch (e) {
              // Ignore parse errors for non-JSON chunks
            }
          }
        }
      });

      res.on('error', (err) => {
        resolve({ success: false, error: `Stream error: ${err.message}` });
      });

      res.on('end', () => {
        if (accumulatedContent) {
          resolve({ 
            success: true, 
            content: accumulatedContent,
            usage: usage,
          });
        } else {
          resolve({ success: false, error: 'Stream ended without content' });
        }
      });
    });

    req.on('error', (err) => {
      resolve({ success: false, error: `Request error: ${err.message}` });
    });

    req.on('timeout', () => {
      req.destroy();
      resolve({ success: false, error: `Request timed out after ${timeout}ms` });
    });

    // Send request body
    req.write(JSON.stringify(requestBody));
    req.end();
  });
}

/**
 * Execute chat with retry and fallback chain
 * @param {Object} options - Request options
 * @param {Array} options.providerChain - Ordered list of providers to try
 * @param {Array} options.messages - Message array
 * @param {Function} options.onChunk - Callback for stream chunks
 * @returns {Promise<{success: boolean, content?: string, model?: string, error?: string}>}
 */
async function executeWithFallback(options) {
  const { providerChain, messages, onChunk } = options;
  
  if (!providerChain || providerChain.length === 0) {
    return { success: false, error: 'No providers in fallback chain' };
  }

  const results = [];
  
  for (let i = 0; i < providerChain.length; i++) {
    const provider = providerChain[i];
    const model = provider.defaultModel || provider.id;
    
    console.log(`[GSK-HEART] Attempting provider ${i + 1}/${providerChain.length}: ${provider.id}`);
    
    const result = await executeChatStream({
      model,
      messages,
      provider,
      timeout: provider.timeout || 60000,
      onChunk: i === 0 ? onChunk : null, // Only stream chunks from first successful provider
    });

    if (result.success) {
      return {
        success: true,
        content: result.content,
        model: model,
        provider: provider.id,
        usage: result.usage,
        attempts: i + 1,
      };
    }

    results.push({ provider: provider.id, error: result.error });
    console.warn(`[GSK-HEART] Provider ${provider.id} failed: ${result.error}`);
  }

  return {
    success: false,
    error: `All ${providerChain.length} providers failed`,
    attempts: providerChain.length,
    failures: results,
  };
}

/**
 * Estimate token count for a message array
 * Rough approximation: 4 chars ≈ 1 token
 * @param {Array} messages - Message array
 * @returns {number} Estimated token count
 */
function estimateTokens(messages) {
  const totalChars = messages.reduce((sum, msg) => {
    return sum + (msg.content?.length || 0) + (msg.role?.length || 0);
  }, 0);
  return Math.ceil(totalChars / 4);
}

/**
 * Estimate cost based on token count and provider pricing
 * @param {number} tokens - Token count
 * @param {Object} provider - Provider config
 * @returns {number} Estimated cost in USD
 */
function estimateCost(tokens, provider) {
  const inputPrice = provider.pricing?.inputPer1K || 0.0001;
  const outputPrice = provider.pricing?.outputPer1K || 0.0003;
  
  // Rough split: 60% input, 40% output
  const inputTokens = tokens * 0.6;
  const outputTokens = tokens * 0.4;
  
  return (inputTokens / 1000 * inputPrice) + (outputTokens / 1000 * outputPrice);
}

/**
 * GSK Heart Chat Handler Class
 * Main interface for chat completions
 */
class GSKHeartChatHandler {
  constructor(options = {}) {
    this.defaultTimeout = options.timeout || 60000;
    this.maxRetries = options.maxRetries || 3;
    this.enableStreaming = options.enableStreaming !== false;
  }

  /**
   * Execute a chat request
   * @param {Object} request - Chat request
   * @param {string} request.prompt - User prompt
   * @param {Array} [request.messages] - Optional message history
   * @param {string} [request.model] - Optional specific model
   * @param {Object} [request.options] - Additional options
   * @returns {Promise<Object>} Chat response
   */
  async chat(request) {
    const { prompt, messages: existingMessages, model, options = {} } = request;
    
    // Build messages array
    const messages = existingMessages || [
      { role: 'user', content: prompt }
    ];

    // Get provider from model or use default chain
    let providerChain = options.providerChain;
    
    if (!providerChain) {
      // Will be populated by router in unified module
      providerChain = [];
    }

    // Execute with fallback
    const result = await executeWithFallback({
      providerChain,
      messages,
      onChunk: options.onChunk,
    });

    return result;
  }

  /**
   * Non-streaming completion
   * @param {Object} request - Completion request
   * @returns {Promise<string>} Response text
   */
  async complete(request) {
    const result = await this.chat(request);
    
    if (!result.success) {
      throw new Error(result.error || 'Completion failed');
    }
    
    return result.content;
  }

  /**
   * Streaming completion with callback
   * @param {Object} request - Completion request
   * @param {Function} onChunk - Callback for each chunk
   * @returns {Promise<Object>} Result metadata
   */
  async stream(request, onChunk) {
    return this.chat({ ...request, options: { ...request.options, onChunk } });
  }
}

module.exports = {
  executeChatStream,
  executeWithFallback,
  estimateTokens,
  estimateCost,
  GSKHeartChatHandler,
};

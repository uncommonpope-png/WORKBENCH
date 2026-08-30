const crypto = require('crypto');

/**
 * Calculates cosine similarity between two vector embeddings.
 */
function cosineSimilarity(vecA, vecB) {
  if (!vecA || !vecB || vecA.length !== vecB.length) return 0;
  let dotProduct = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < vecA.length; i++) {
    dotProduct += vecA[i] * vecB[i];
    normA += vecA[i] * vecA[i];
    normB += vecB[i] * vecB[i];
  }
  if (normA === 0 || normB === 0) return 0;
  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}

/**
 * Generates a normalized deterministic feature vector from input text.
 */
function generateDeterministicVector(text, dimensions = 64) {
  const hash = crypto.createHash('sha256').update(text).digest();
  const vector = new Array(dimensions);
  for (let i = 0; i < dimensions; i++) {
    const val = hash[i % hash.length];
    vector[i] = (val / 255.0) * 2 - 1;
  }
  return vector;
}

/**
 * Dynamic Prompt Compiler for Cognitive Spatial Agents.
 */
class SpatialPromptCompiler {
  constructor(agentId = 'Spatial-Agent-Alpha') {
    this.agentId = agentId;
  }

  compile(context) {
    return `[SYSTEM: SPATIAL COGNITIVE AGENT ${this.agentId}]\n` +
      `Protocol: Model Context Protocol (MCP) v1.0\n` +
      `Target Engine: WebGPU Compute Engine\n` +
      `Active Context: ${JSON.stringify(context)}\n`;
  }
}

/**
 * WGSL Compute Shader generator for WebGPU spatial visualizers.
 */
function generateWebGPUComputeShader(workgroupSize = 64) {
  return `
@group(0) @binding(0) var<storage, read> inputPositions : array<vec4<f32>>;
@group(0) @binding(1) var<storage, read_write> outputPositions : array<vec4<f32>>;
@group(0) @binding(2) var<uniform> params : vec4<f32>;

@compute @workgroup_size(${workgroupSize}, 1, 1)
fn main(@builtin(global_invocation_id) global_id : vec3<u32>) {
    let index = global_id.x;
    if (index >= arrayLength(&inputPositions)) {
        return;
    }
    var pos = inputPositions[index];
    let dt = params.x;
    let speed = params.y;
    
    pos.x += sin(pos.y + params.w) * speed * dt;
    pos.y += cos(pos.x + params.w) * speed * dt;
    pos.z += sin(params.w) * speed * dt;
    
    outputPositions[index] = pos;
}
  `.trim();
}

/**
 * MCP Tool Invocation Standard Handler
 */
function handleMCPToolExecution(toolName, params) {
  const timestamp = new Date().toISOString();
  switch (toolName) {
    case 'spatial_query':
      return {
        status: 'success',
        mcp_version: '1.0',
        timestamp,
        query: params.query,
        matchedNodes: [
          { id: 'node_1', distance: 1.25, confidence: 0.94 },
          { id: 'node_4', distance: 3.12, confidence: 0.81 }
        ]
      };
    case 'compile_wgsl':
      return {
        status: 'success',
        mcp_version: '1.0',
        timestamp,
        wgsl: generateWebGPUComputeShader(params.workgroupSize || 64)
      };
    default:
      return {
        status: 'error',
        mcp_version: '1.0',
        timestamp,
        message: `Unknown MCP tool target: ${toolName}`
      };
  }
}

/**
 * Main module entry point expected by runtime environment.
 * @param {string|object} input - Input prompt or JSON configuration object
 * @returns {string} Textual result or JSON payload response string.
 */
function execute(input) {
  let parsedInput = {};
  if (typeof input === 'string') {
    try {
      parsedInput = JSON.parse(input);
    } catch (e) {
      parsedInput = { prompt: input };
    }
  } else if (typeof input === 'object' && input !== null) {
    parsedInput = input;
  }

  const queryText = parsedInput.prompt || parsedInput.query || 'Spatial agent state query';
  const queryVector = generateDeterministicVector(queryText);

  const sampleNodes = [
    { id: 'vector_mcp_spec', text: 'Model Context Protocol MCP tool execution standard for autonomous spatial agents' },
    { id: 'vector_dynamic_prompt', text: 'Dynamic prompt compilation pipeline for context-aware cognitive agents' },
    { id: 'vector_indexing', text: 'High dimensional vector memory indexing and spatial nearest neighbor search' },
    { id: 'vector_webgpu', text: 'WebGPU compute shaders for spatial 3D physics engines and particle visualizers' }
  ];

  const searchResults = sampleNodes.map(node => {
    const nodeVector = generateDeterministicVector(node.text);
    const score = cosineSimilarity(queryVector, nodeVector);
    return { id: node.id, text: node.text, similarityScore: score.toFixed(4) };
  }).sort((a, b) => parseFloat(b.similarityScore) - parseFloat(a.similarityScore));

  const compiler = new SpatialPromptCompiler(parsedInput.agentId || 'GSK-Spatial-Node');
  const compiledPrompt = compiler.compile({ query: queryText, topMatch: searchResults[0] });

  const mcpExecution = handleMCPToolExecution(parsedInput.action || 'compile_wgsl', {
    query: queryText,
    workgroupSize: parsedInput.workgroupSize || 128
  });

  const responsePayload = {
    skillId: 'auto_1787942899652',
    timestamp: new Date().toISOString(),
    status: 'ACTIVE',
    cognitiveContext: {
      compiledPrompt,
      vectorSearchResults: searchResults
    },
    mcpExecutionResult: mcpExecution,
    webGPUShaderSample: generateWebGPUComputeShader(64)
  };

  return JSON.stringify(responsePayload, null, 2);
}

module.exports = { execute };
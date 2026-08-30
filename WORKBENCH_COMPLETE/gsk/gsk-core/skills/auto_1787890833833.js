const fs = require('fs');
const path = require('path');

/**
 * GSK Skill: Knowledge Synthesis Engine
 * Encapsulates learnings from: Logseq integration, WebGPU compute, MCP standards,
 * WebSocket sync, Three.js instancing, PLT governance, vector memory indexing
 */

const PLT_WEIGHTS = {
  profit: 0.4,
  love: 0.3,
  tax: 0.3
};

const TOPIC_CLUSTERS = {
  'knowledge-graph': ['logseq', 'markdown', 'graph', 'linking', 'bidirectional', 'query'],
  'webgpu-compute': ['webgpu', 'compute', 'shader', 'spatial', '3d', 'gpu', 'parallel'],
  'mcp-protocol': ['mcp', 'model context protocol', 'tool', 'execution', 'standard', 'schema'],
  'websocket-sync': ['websocket', 'state', 'synchronization', 'game', 'engine', 'realtime'],
  'threejs-instancing': ['three.js', 'instanced', 'rendering', 'mesh', 'performance', 'batch'],
  'plt-governance': ['plt', 'profit', 'love', 'tax', 'governance', 'alignment', 'council'],
  'vector-memory': ['vector', 'memory', 'indexing', 'autonomous', 'agent', 'embedding', 'search']
};

function scoreTopicRelevance(input, cluster) {
  const words = input.toLowerCase().split(/\W+/);
  let matches = 0;
  for (const keyword of cluster) {
    if (words.some(w => w.includes(keyword) || keyword.includes(w))) matches++;
  }
  return matches / cluster.length;
}

function calculatePLT(input) {
  const scores = {};
  for (const [topic, cluster] of Object.entries(TOPIC_CLUSTERS)) {
    scores[topic] = scoreTopicRelevance(input, cluster);
  }
  
  const profit = scores['webgpu-compute'] * 0.3 + scores['threejs-instancing'] * 0.3 + scores['vector-memory'] * 0.4;
  const love = scores['knowledge-graph'] * 0.4 + scores['mcp-protocol'] * 0.3 + scores['websocket-sync'] * 0.3;
  const tax = scores['plt-governance'] * 0.5 + (1 - Math.max(...Object.values(scores))) * 0.5;
  
  return {
    profit: Math.min(1, profit),
    love: Math.min(1, love),
    tax: Math.min(1, tax),
    trueValue: (profit * PLT_WEIGHTS.profit) + (love * PLT_WEIGHTS.love) - (tax * PLT_WEIGHTS.tax)
  };
}

function generateInsight(input, plt) {
  const dominant = Object.entries(TOPIC_CLUSTERS).reduce((a, b) => 
    scoreTopicRelevance(input, a[1]) > scoreTopicRelevance(input, b[1]) ? a : b
  )[0];
  
  const insights = {
    'knowledge-graph': 'Graph structure enables emergent understanding — nodes gain meaning through connection density.',
    'webgpu-compute': 'Compute shaders move spatial reasoning to GPU — 1000x parallelism for agent world simulation.',
    'mcp-protocol': 'Standardized tool schemas make agent capabilities composable and auditable across runtimes.',
    'websocket-sync': 'Deterministic state sync via CRDTs or operational transforms prevents divergence in multi-agent worlds.',
    'threejs-instancing': 'InstancedMesh reduces draw calls from O(n) to O(1) — critical for 10k+ entity visualization.',
    'plt-governance': 'Every decision must survive the Council: Profit asks "does it multiply?", Love asks "does it serve?", Tax asks "what does it cost?".',
    'vector-memory': 'Semantic search over embedded memories lets agents retrieve relevant context without explicit indexing.'
  };
  
  return insights[dominant] || 'Synthesis requires crossing domain boundaries — the insight lives in the intersection.';
}

function buildArtifactPlan(input, plt) {
  const steps = [];
  
  if (plt.profit > 0.5) {
    steps.push('Prototype WebGPU compute shader for spatial partitioning');
    steps.push('Benchmark instanced rendering at 50k entities');
  }
  if (plt.love > 0.4) {
    steps.push('Design MCP tool schema for knowledge graph queries');
    steps.push('Implement WebSocket state sync with conflict resolution');
  }
  if (plt.tax > 0.3) {
    steps.push('Add PLT scoring gate to agent decision loop');
    steps.push('Implement vector memory with HNSW indexing');
  }
  
  return steps;
}

function execute(input) {
  if (!input || typeof input !== 'string') {
    return JSON.stringify({ error: 'Input must be a non-empty string' }, null, 2);
  }
  
  const plt = calculatePLT(input);
  const insight = generateInsight(input, plt);
  const plan = buildArtifactPlan(input, plt);
  
  const result = {
    input: input.slice(0, 200),
    plt: {
      profit: Math.round(plt.profit * 1000) / 1000,
      love: Math.round(plt.love * 1000) / 1000,
      tax: Math.round(plt.tax * 1000) / 1000,
      trueValue: Math.round(plt.trueValue * 1000) / 1000,
      verdict: plt.trueValue > 0 ? 'PROCEED' : 'REVISE'
    },
    dominantDomain: Object.entries(TOPIC_CLUSTERS).reduce((a, b) => 
      scoreTopicRelevance(input, a[1]) > scoreTopicRelevance(input, b[1]) ? a : b
    )[0],
    insight,
    artifactPlan: plan,
    timestamp: new Date().toISOString(),
    skill: 'auto_1787890128951'
  };
  
  return JSON.stringify(result, null, 2);
}

module.exports = { execute, calculatePLT, generateInsight, buildArtifactPlan, TOPIC_CLUSTERS, PLT_WEIGHTS };
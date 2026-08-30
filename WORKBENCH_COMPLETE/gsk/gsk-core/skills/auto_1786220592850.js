// auto_1786220569251 — Integrative Skill: Logseq / Three.js / Vector Memory / MCP / WebGPU
const KNOWLEDGE = {
  logseq: [
    'Logseq pages are markdown files with [[links]] and block properties.',
    'Graph traversal can be done via page references and tag queries.',
    'Bi-directional linking means nodes can be discovered from backlinks.',
    'For ingestion, parse markdown headings, bullets, and block-level metadata.',
    'Block properties (e.g. tags::) can be extracted with regex or a markdown AST.'
  ],
  three: [
    'InstancedMesh allows rendering many objects with one draw call.',
    'Use matrix composition for per-instance position/rotation/scale.',
    'Precompute matrices on CPU or use vertex shader with attributes.',
    'For large starfields, InstancedBufferGeometry with dynamic attributes is fast.',
    'Keep draw calls low; batch static geometry and update only transformed instances.'
  ],
  vectorMemory: [
    'Embeddings map knowledge to high-dimensional vectors.',
    'Cosine similarity and dot product index for retrieval.',
    'Use HNSW or flat L2 search for autonomous agent memory.',
    'Prune vectors based on relevance decay and temporal weight.',
    'Store provenance metadata alongside each vector for auditability.'
  ],
  mcp: [
    'MCP (Model Context Protocol) standardizes tool calling across agents.',
    'Tools define JSON Schema for inputs; outputs can be structured JSON.',
    'Context managers keep track of tool execution history for agent reasoning.',
    'Errors should be returned as structured error codes, not thrown strings.',
    'Every MCP request must include a context id for traceability.'
  ],
  webgpu: [
    'Compute shaders in WGSL run on GPU for parallel data processing.',
    'Storage buffers allow reading/writing positions and velocities.',
    'Spatial grids can be updated in compute pass for 3D engines.',
    'WebGPU is the modern successor to WebGL with lower overhead.',
    'Use render bundles and pipeline caches for high-frequency spatial updates.'
  ]
};

function execute(input) {
  const query = String(input || '').toLowerCase();
  const parts = [];
  const topics = [
    ['logseq', 'logseq', 'knowledge graph', 'markdown', 'graph'],
    ['three', 'three.js', 'threejs', 'instanced', 'render'],
    ['vectorMemory', 'vector', 'embedding', 'memory', 'index'],
    ['mcp', 'mcp', 'protocol', 'tool execution', 'model context'],
    ['webgpu', 'webgpu', 'compute', 'shader', 'wgsl']
  ];
  let matched = false;
  for (const [key, ...keywords] of topics) {
    if (keywords.some(k => query.includes(k))) {
      parts.push(`## ${key.toUpperCase()} LEARNINGS`);
      parts.push(...KNOWLEDGE[key].map(line => '- ' + line));
      matched = true;
    }
  }
  if (!matched) {
    parts.push('## INTEGRATED KNOWLEDGE SUMMARY');
    for (const key of Object.keys(KNOWLEDGE)) {
      parts.push(`### ${key.toUpperCase()}`);
      parts.push(...KNOWLEDGE[key].map(line => '- ' + line));
    }
  }
  parts.push('');
  parts.push('[skill: auto_1786220569251 | provenance: autonomous learning]');
  return parts.join('\n');
}

module.exports = { execute };

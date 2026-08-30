const { EventEmitter } = require('events');

class SpatialEngine extends EventEmitter {
  constructor() {
    super();
    this.instances = new Map();
    this.vectorIndex = new Map();
    this.mcpRegistry = new Map();
  }

  registerInstance(id, geometry, material, count = 1) {
    const instance = {
      id,
      geometry,
      material,
      count,
      matrices: new Float32Array(count * 16),
      colors: new Float32Array(count * 4),
      active: true
    };
    this.instances.set(id, instance);
    this.emit('instance:registered', instance);
    return instance;
  }

  updateInstanceTransform(id, index, matrix) {
    const instance = this.instances.get(id);
    if (!instance || index >= instance.count) return false;
    const offset = index * 16;
    instance.matrices.set(matrix, offset);
    this.emit('instance:updated', { id, index, matrix });
    return true;
  }

  indexVector(id, vector, metadata = {}) {
    const key = `${id}:${vector.join(',')}`;
    this.vectorIndex.set(key, { id, vector, metadata, timestamp: Date.now() });
    this.emit('vector:indexed', { key, vector, metadata });
    return key;
  }

  queryNearest(vector, k = 5, threshold = 0.8) {
    const results = [];
    for (const [key, entry] of this.vectorIndex) {
      const similarity = this.cosineSimilarity(vector, entry.vector);
      if (similarity >= threshold) {
        results.push({ ...entry, similarity });
      }
    }
    return results
      .sort((a, b) => b.similarity - a.similarity)
      .slice(0, k);
  }

  cosineSimilarity(a, b) {
    let dot = 0, normA = 0, normB = 0;
    for (let i = 0; i < a.length; i++) {
      dot += a[i] * b[i];
      normA += a[i] * a[i];
      normB += b[i] * b[i];
    }
    return dot / (Math.sqrt(normA) * Math.sqrt(normB) || 1);
  }

  registerMCPTool(name, schema, handler) {
    this.mcpRegistry.set(name, { name, schema, handler });
    this.emit('mcp:registered', { name, schema });
  }

  async executeMCPTool(name, params) {
    const tool = this.mcpRegistry.get(name);
    if (!tool) throw new Error(`MCP tool not found: ${name}`);
    const validated = this.validateParams(params, tool.schema);
    return await tool.handler(validated);
  }

  validateParams(params, schema) {
    if (!schema) return params;
    const result = {};
    for (const [key, def] of Object.entries(schema)) {
      if (params[key] === undefined) {
        if (def.required) throw new Error(`Missing required param: ${key}`);
        result[key] = def.default;
      } else {
        result[key] = params[key];
      }
    }
    return result;
  }

  getStats() {
    return {
      instances: this.instances.size,
      vectors: this.vectorIndex.size,
      mcpTools: this.mcpRegistry.size
    };
  }
}

const engine = new SpatialEngine();

engine.registerMCPTool('spatial.spawn', {
  type: { type: 'string', required: true },
  position: { type: 'array', required: true },
  count: { type: 'number', required: false, default: 1 }
}, async ({ type, position, count }) => {
  const id = `${type}_${Date.now()}`;
  engine.registerInstance(id, { type }, { color: 0xffffff }, count);
  for (let i = 0; i < count; i++) {
    const matrix = new Float32Array(16);
    matrix[0] = matrix[5] = matrix[10] = matrix[15] = 1;
    matrix[12] = position[0] + (Math.random() - 0.5) * 2;
    matrix[13] = position[1] + (Math.random() - 0.5) * 2;
    matrix[14] = position[2] + (Math.random() - 0.5) * 2;
    engine.updateInstanceTransform(id, i, matrix);
    engine.indexVector(`${id}_${i}`, position, { type, instance: id });
  }
  return { id, count };
});

engine.registerMCPTool('spatial.query', {
  vector: { type: 'array', required: true },
  k: { type: 'number', required: false, default: 5 },
  threshold: { type: 'number', required: false, default: 0.8 }
}, async ({ vector, k, threshold }) => {
  return engine.queryNearest(vector, k, threshold);
});

engine.registerMCPTool('spatial.stats', {}, async () => {
  return engine.getStats();
});

async function execute(input) {
  const { action, params } = input || {};
  try {
    switch (action) {
      case 'spawn':
        return JSON.stringify(await engine.executeMCPTool('spatial.spawn', params));
      case 'query':
        return JSON.stringify(await engine.executeMCPTool('spatial.query', params));
      case 'stats':
        return JSON.stringify(await engine.executeMCPTool('spatial.stats', params));
      default:
        return JSON.stringify({ error: `Unknown action: ${action}`, available: ['spawn', 'query', 'stats'] });
    }
  } catch (e) {
    return JSON.stringify({ error: e.message });
  }
}

module.exports = { execute, SpatialEngine };

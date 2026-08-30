const THREE = require('three');

class VectorMemoryIndex {
  constructor(dimensions = 384) {
    this.dimensions = dimensions;
    this.vectors = new Float32Array(0);
    this.metadata = [];
    this.index = new Map();
  }

  add(id, vector, meta = {}) {
    const arr = new Float32Array(vector);
    if (arr.length !== this.dimensions) throw new Error('Dimension mismatch');
    const offset = this.vectors.length;
    this.vectors = new Float32Array([...this.vectors, ...arr]);
    this.metadata.push({ id, ...meta });
    this.index.set(id, offset / this.dimensions);
  }

  search(queryVector, k = 5) {
    const q = new Float32Array(queryVector);
    const scores = [];
    for (let i = 0; i < this.metadata.length; i++) {
      const v = this.vectors.slice(i * this.dimensions, (i + 1) * this.dimensions);
      let dot = 0, na = 0, nb = 0;
      for (let d = 0; d < this.dimensions; d++) {
        dot += q[d] * v[d];
        na += q[d] * q[d];
        nb += v[d] * v[d];
      }
      scores.push({ idx: i, score: dot / (Math.sqrt(na) * Math.sqrt(nb)) });
    }
    return scores.sort((a, b) => b.score - a.score).slice(0, k).map(s => this.metadata[s.idx]);
  }
}

class InstancedRenderer {
  constructor(maxInstances = 10000) {
    this.maxInstances = maxInstances;
    this.geometry = new THREE.BoxGeometry(1, 1, 1);
    this.material = new THREE.MeshStandardMaterial({ color: 0x00ff88 });
    this.mesh = new THREE.InstancedMesh(this.geometry, this.material, maxInstances);
    this.dummy = new THREE.Object3D();
    this.count = 0;
  }

  setInstance(index, position, rotation, scale) {
    this.dummy.position.set(...position);
    this.dummy.rotation.set(...rotation);
    this.dummy.scale.set(...scale);
    this.dummy.updateMatrix();
    this.mesh.setMatrixAt(index, this.dummy.matrix);
    if (index >= this.count) this.count = index + 1;
    this.mesh.instanceMatrix.needsUpdate = true;
  }

  getMesh() { return this.mesh; }
}

class WebSocketSync {
  constructor(url) {
    this.url = url;
    this.ws = null;
    this.handlers = new Map();
    this.reconnectDelay = 1000;
  }

  connect() {
    this.ws = new WebSocket(this.url);
    this.ws.onopen = () => this.emit('open');
    this.ws.onmessage = (e) => {
      const msg = JSON.parse(e.data);
      this.emit(msg.type, msg.payload);
    };
    this.ws.onclose = () => setTimeout(() => this.connect(), this.reconnectDelay);
    this.ws.onerror = (err) => this.emit('error', err);
  }

  send(type, payload) {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ type, payload, timestamp: Date.now() }));
    }
  }

  on(type, fn) { this.handlers.set(type, fn); }
  emit(type, payload) { this.handlers.get(type)?.(payload); }
}

module.exports = { VectorMemoryIndex, InstancedRenderer, WebSocketSync };

module.exports.execute = function(input) {
  const { action, data } = JSON.parse(input || '{}');
  switch (action) {
    case 'vector-index': return JSON.stringify(new VectorMemoryIndex().search(data.query, data.k));
    case 'instanced-render': return 'InstancedMesh ready with ' + data.count + ' instances';
    case 'ws-sync': return 'WebSocketSync connected to ' + data.url;
    default: return 'Unknown action: ' + action;
  }
};
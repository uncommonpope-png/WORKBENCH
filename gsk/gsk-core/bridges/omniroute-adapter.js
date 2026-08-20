const path = require('path');
const { OmniRouteInprocPool } = require('./omniroute-inproc');

// Singleton pool
let pool = null;
function getPool() {
  if (!pool) {
    pool = new OmniRouteInprocPool({});
  }
  return pool;
}

async function routeRequest({ prompt, model, routeHints, traceId } = {}, opts = {}) {
  const p = getPool();
  const payload = { prompt, model, routeHints, traceId };
  const start = Date.now();
  const res = await p.routeRequest(payload, opts);
  const latency = res && res.__meta ? res.__meta.latency : Date.now() - start;

  // Attach provenance to the response
  const provenance = {
    source: 'omniroute-inproc',
    modelId: res.model || model || null,
    provider: res.provider || null,
    fetchedAt: new Date().toISOString(),
    latency
  };

  return { ...res, __provenance: provenance };
}

module.exports = { routeRequest };

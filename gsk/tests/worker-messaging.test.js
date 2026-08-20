const assert = require('assert');
const { OmniRouteInprocPool } = require('../gsk-core/bridges/omniroute-inproc');

async function run() {
  console.log('worker-messaging.test: starting');
  const pool = new OmniRouteInprocPool({ workerCount: 1 });
  try {
    const res = await pool.routeRequest({ prompt: 'hello', model: 'mock' }, { timeoutMs: 2000 });
    assert(res, 'no response');
    console.log('worker-messaging.test: got response', res);
  } finally {
    console.log('worker-messaging.test: done');
  }
}

run().catch((err) => { console.error(err); process.exit(1); });

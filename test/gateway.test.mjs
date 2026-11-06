import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { once } from 'node:events';
import { setTimeout as delay } from 'node:timers/promises';
import { createGateway } from '../lib/gateway.mjs';
import { createCollector } from '../lib/collector.mjs';
import { createAggregator } from '../lib/aggregator.mjs';
import { initialTrace, makeRoute } from './fixtures/trace.mjs';

async function stub(t, handler) {
  const server = http.createServer(handler);
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  t.after(() => new Promise(resolve => { server.closeAllConnections(); server.close(resolve); }));
  return `127.0.0.1:${server.address().port}`;
}
function json(res, body) { res.writeHead(200, { 'content-type': 'application/json' }); res.end(JSON.stringify(body)); }
async function until(predicate) {
  for (let i = 0; i < 200; i++) { if (predicate()) return; await delay(5); }
  assert.fail('Condition did not become true.');
}

test('transport uses fixed local GETs with no browser credentials or ambient proxy', async t => {
  const calls = [];
  const address = await stub(t, (req, res) => {
    calls.push({ url: req.url, method: req.method, headers: req.headers });
    if (req.url === '/api/hello') json(res, { name: 'magpie', version: '0.1.3124', private: 'DROP' });
    else json(res, { object: 'trace', rows: [] });
  });
  const prior = process.env.HTTP_PROXY; process.env.HTTP_PROXY = 'http://127.0.0.1:1';
  t.after(() => { if (prior === undefined) delete process.env.HTTP_PROXY; else process.env.HTTP_PROXY = prior; });
  const gateway = createGateway({ address });
  assert.deepEqual(await gateway.hello(), { name: 'magpie', version: '0.1.3124' });
  await gateway.trace({ after: 42, wait: true });
  await gateway.usage({ period: '7d', offset: 2, limit: 3 });
  assert.deepEqual(calls.map(call => call.url), ['/api/hello', '/v1/magpie/trace?after=42&wait=1',
    '/v1/magpie/usage/requests?period=7d&offset=2&limit=3&via=through&computer=this']);
  for (const call of calls) { assert.equal(call.method, 'GET'); assert.equal(call.headers.authorization, undefined); assert.equal(call.headers.cookie, undefined); }
});

test('invalid destinations, redirects, malformed and oversized responses fail closed', async t => {
  for (const address of ['https://127.0.0.1:3425', 'example.com:3425', '127.0.0.1:3425@evil.invalid', '2130706433:3425', '127.0.0.1:3425/path', '127.0.0.1:65536']) {
    assert.throws(() => createGateway({ address }), error => error.code === 'invalid_gateway');
  }
  const servers = [
    [(req, res) => { res.writeHead(302, { location: 'http://example.invalid/PRIVATE' }); res.end('PRIVATE'); }, 'gateway_incompatible'],
    [(req, res) => { res.writeHead(403); res.end('PRIVATE'); }, 'gateway_denied'],
    [(req, res) => { res.writeHead(200, { 'content-type': 'application/json' }); res.end('not json PRIVATE'); }, 'gateway_malformed'],
    [(req, res) => json(res, { text: 'a'.repeat(200) }), 'payload_limit'],
  ];
  for (const [handler, code] of servers) {
    const address = await stub(t, handler);
    await assert.rejects(createGateway({ address, limits: { responseBytes: 100 } }).trace(), error => error.code === code && !error.message.includes('PRIVATE'));
  }
});

test('requests abort and enforce an absolute timeout, long polls allow over 25 seconds', async t => {
  const address = await stub(t, () => {});
  const gateway = createGateway({ address, timeoutMs: 20 });
  await assert.rejects(gateway.hello(), error => error.code === 'gateway_timeout');
  const controller = new AbortController();
  const scheduled = [], originalTimer = globalThis.setTimeout;
  const timerSpy = t.mock.method(globalThis, 'setTimeout', (fn, ms, ...args) => { scheduled.push(ms); return originalTimer(fn, ms, ...args); });
  const pending = gateway.trace({ wait: true, signal: controller.signal });
  timerSpy.mock.restore();
  assert.ok(scheduled.some(ms => ms > 25_000 && ms <= 60_000));
  // The short ordinary-request timeout must not cancel the long poll.
  let settled = false; pending.finally(() => { settled = true; }).catch(() => {});
  await delay(40); assert.equal(settled, false);
  controller.abort(); await assert.rejects(pending, { name: 'AbortError' });
});

test('collector is single-flight, does full reconnect snapshots and aborts/awaits stop', async () => {
  const aggregator = createAggregator();
  const requests = []; let active = 0, peak = 0, hellos = 0;
  const gateway = {
    async hello() { hellos++; return { name: 'magpie', version: '0.1.3124' }; },
    async trace(options) {
      requests.push(options); active++; peak = Math.max(peak, active);
      try {
        if (requests.length === 1) return initialTrace();
        if (requests.length === 2) throw new Error('PRIVATE-ERROR');
        if (requests.length === 3) return initialTrace();
        return await new Promise((resolve, reject) => options.signal.addEventListener('abort', () => reject(options.signal.reason), { once: true }));
      } finally { active--; }
    },
  };
  const collector = createCollector({ gateway, aggregator, backoffMs: 10 });
  collector.start(); collector.start();
  await until(() => requests.length >= 4);
  assert.equal(peak, 1); assert.equal(hellos, 2);
  assert.deepEqual(requests.slice(0, 4).map(({ after, wait }) => [after, wait]), [[0, false], [5, true], [0, false], [5, true]]);
  await collector.stop(); assert.equal(active, 0);
  assert.equal(aggregator.snapshot({ kind: 'all', period: 'live', sessionKey: null, includeChildren: false }).connection.status, 'stopped');
});

test('collector resynchronizes a changed PID without applying its incremental delta', async () => {
  const aggregator = createAggregator(); let count = 0;
  const calls = [];
  const gateway = { async hello() { return { version: '0.1.3124' }; }, async trace(options) {
    calls.push([options.after, options.wait]); count++;
    if (count === 1) return initialTrace();
    if (count === 2) return { ...initialTrace(), pid: 88888, routes: [] };
    if (count === 3) return { ...initialTrace(), pid: 88888, routes: [makeRoute(1)], ids: [1], seq: 1 };
    await new Promise((resolve, reject) => options.signal.addEventListener('abort', () => reject(options.signal.reason), { once: true }));
  } };
  const collector = createCollector({ gateway, aggregator }); collector.start();
  await until(() => count === 4);
  assert.deepEqual(calls.slice(0, 3), [[0, false], [5, true], [0, false]]);
  assert.equal(aggregator.generation, 2); await collector.stop();
});

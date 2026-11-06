import test from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { createServer as httpServer } from 'node:http';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { setTimeout as delay } from 'node:timers/promises';
import { createGateway } from '../lib/gateway.mjs';
import { createCollector } from '../lib/collector.mjs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createAggregator } from '../lib/aggregator.mjs';
import { createConfig, createInstallationAuthorizer } from '../lib/config.mjs';
import { createServer } from '../lib/server.mjs';
import { parseScope, sessionKey } from '../lib/contracts.mjs';
import { initialTrace, makeRoute } from './fixtures/trace.mjs';
import { assertContained, sandboxArgs } from './magpie/sandbox.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const scope = (selected = null) => parseScope(new URLSearchParams(selected ? { session: selected } : {}));

async function reservePort() {
  const server = httpServer();
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  await new Promise(resolve => server.close(resolve));
  return port;
}
async function fixture(t, { history, gateway } = {}) {
  const directory = await mkdtemp(join(tmpdir(), 'session-routing-integration-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const options = { port: await reservePort(), installationId: randomBytes(16).toString('base64url'), apiToken: randomBytes(32).toString('base64url') };
  const config = createConfig({ directory }, options, { env: { MAGPIE_ADDR: '127.0.0.1:3425' } });
  const persist = entry => writeFile(join(directory, 'plugins.json'), JSON.stringify({ plugins: [entry] }));
  const entry = { spec: root, options };
  await persist(entry);
  const aggregator = createAggregator();
  if (!gateway) aggregator.applyTrace(initialTrace(), { full: true });
  const collector = gateway ? createCollector({ gateway, aggregator, backoffMs: 10 }) : null;
  if (collector) t.after(() => collector.stop());
  let collectorStarts = 0;
  const service = createServer({ config, aggregator,
    history: history ?? { snapshot: async () => { throw new Error('History must not be queried by Live viewers'); } },
    authorizeInstallation: createInstallationAuthorizer(config),
    startCollector: () => { collectorStarts++; collector?.start(); }, loadStatic: async () => Buffer.from('fixed public asset') });
  await service.listen();
  t.after(() => service.stop());
  const request = async (path, { auth = true, ...headers } = {}) => {
    const response = await fetch(`http://127.0.0.1:${options.port}${path}`, { redirect: 'error', signal: AbortSignal.timeout(3000),
      headers: { ...(auth ? { Authorization: `Bearer ${options.apiToken}` } : {}), ...headers } });
    return { status: response.status, body: await response.json(), headers: response.headers };
  };
  return { aggregator, request, persist, entry, get starts() { return collectorStarts; } };
}

test('contained harness has no network/credential bypass and writes only to a fresh artifact run', () => {
  const runDirectory = join(root, 'artifacts/integration/run-unit');
  const args = sandboxArgs({ root, runDirectory, script: join(root, 'test/magpie/scenario.mjs') });
  for (const flag of ['--unshare-net', '--unshare-pid', '--die-with-parent', '--clearenv']) assert.ok(args.includes(flag));
  assert.ok(!args.includes('--share-net'));
  for (const home of ['/home', '/root']) {
    const position = args.indexOf(home);
    assert.equal(args[position - 1], '--tmpfs');
  }
  const bind = args.indexOf('--bind');
  assert.equal(args[bind + 1], runDirectory); assert.equal(args[bind + 2], runDirectory);
  assert.equal(args.filter(value => value === '--bind').length, 1);
  assert.throws(() => sandboxArgs({ root, runDirectory: '/tmp', script: 'unused' }), /fresh integration/);
  assert.throws(() => sandboxArgs({ root, runDirectory: join(root, 'artifacts/integration-escape'), script: 'unused' }), /fresh integration/);
});

test('real-Magpie scenario rejects ordinary uncontained execution', async () => {
  // Default unit runner is not allowed to start Magpie at all. The explicit
  // test:magpie launcher establishes the OS boundary before starting it.
  if (process.env.MAGPIE_TEST_RUN) return;
  await assert.rejects(assertContained(), /direct execution is refused/);
});

test('independent HTTP viewers share one collector and scope graph, timeline and metrics together', async t => {
  const f = await fixture(t);
  assert.equal((await f.request('/healthz', { auth: false })).status, 200);
  assert.equal((await f.request('/api/state', { auth: false })).status, 401);
  assert.equal(f.starts, 0);
  const alpha = sessionKey('claude-code', 'session-alpha');
  const bravo = sessionKey('claude-code', 'session-bravo');
  const codex = sessionKey('codex', 'session-alpha');
  const [a, b, c, unknown, all] = await Promise.all([alpha, bravo, codex, 'unknown', null]
    .map(key => f.request('/api/state' + (key ? '?session=' + key : ''), { Origin: 'null' })));
  assert.equal(f.starts, 1);
  for (const response of [a, b, c, unknown, all]) {
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('cache-control'), 'no-store');
    assert.equal(response.headers.get('access-control-allow-origin'), 'null');
    assert.deepEqual(new Set(response.body.graph.requestKeys), new Set(response.body.requests.map(route => route.key)));
    assert.equal(response.body.metrics.requests, response.body.requests.length);
  }
  assert.deepEqual(a.body.requests.map(route => route.id).sort(), [101, 103]);
  assert.equal(a.body.metrics.inFlight, 2); assert.equal(a.body.metrics.fallbacks, 1);
  assert.deepEqual(b.body.requests.map(route => route.id), [102]);
  assert.equal(b.body.metrics.fallbacks, 0);
  assert.deepEqual(c.body.requests.map(route => route.id), [104]);
  assert.deepEqual(unknown.body.requests.map(route => route.id), [105]);
  assert.equal(all.body.metrics.requests, 5);
  assert.equal(all.body.metrics.cost, null);
  assert.ok(!JSON.stringify(all.body).includes('DO-NOT-EXPOSE'));
  const discovery = await f.request('/api/sessions');
  assert.equal(discovery.body.sessions.length, 3); assert.equal(discovery.body.unknownRequests, 1);
  assert.equal(discovery.body.requests, undefined);
  assert.equal(f.starts, 1);
});

test('scope switching cannot mutate cached records and gateway reset drops prior activity', () => {
  const aggregator = createAggregator();
  aggregator.applyTrace(initialTrace(), { full: true });
  const alpha = scope(sessionKey('claude-code', 'session-alpha'));
  const a = aggregator.snapshot(alpha);
  a.requests[0].attempts.length = 0; a.sessions.length = 0; a.metrics.requests = 9000;
  const fresh = aggregator.snapshot(alpha);
  assert.equal(fresh.metrics.requests, 2); assert.equal(fresh.sessions.length, 3);
  assert.ok(fresh.requests.every(record => record.attempts.length > 0));
  const oldKeys = new Set(aggregator.snapshot(scope()).graph.requestKeys);
  const envelope = { object: 'trace', pid: 99999, seq: 1, ids: [101], routes: [makeRoute(101, { done: true, seq: 1 })] };
  assert.equal(aggregator.applyTrace(envelope).resync, true);
  assert.equal(aggregator.snapshot(scope()).connection.status, 'stale');
  aggregator.applyTrace(envelope, { full: true });
  const restart = aggregator.snapshot(scope());
  assert.equal(restart.metrics.inFlight, 0); assert.equal(restart.metrics.requests, 1);
  assert.ok(restart.graph.requestKeys.every(key => !oldKeys.has(key)));
});

test('disk revocation prevents an already-running historical response from leaking data', async t => {
  let release;
  let began;
  const started = new Promise(resolve => { began = resolve; });
  const scan = new Promise(resolve => { release = resolve; });
  const f = await fixture(t, { history: { snapshot: async () => { began(); return scan; } } });
  const response = f.request('/api/history?period=today');
  await started;
  await f.persist({ ...f.entry, off: true });
  release({ requests: [{ session: 'historical-private-session' }], metrics: { requests: 999 } });
  const ended = await response;
  assert.equal(ended.status, 403);
  assert.equal(ended.body.error.code, 'installation_revoked');
  assert.ok(!JSON.stringify(ended.body).includes('historical-private-session'));
});

test('real gateway client and collector share one incremental poll across concurrent API viewers', async t => {
  const seen = [];
  const waiting = new Set();
  let livePolls = 0;
  let maxPolls = 0;
  const gatewayServer = httpServer((request, response) => {
    seen.push({ url: request.url, headers: request.headers });
    response.setHeader('Content-Type', 'application/json');
    if (request.url === '/api/hello') return response.end(JSON.stringify({ name: 'magpie', version: '0.1.3124' }));
    if (request.url === '/v1/magpie/trace') return response.end(JSON.stringify(initialTrace()));
    assert.equal(request.url, '/v1/magpie/trace?after=5&wait=1');
    livePolls++; maxPolls = Math.max(maxPolls, livePolls); waiting.add(response);
    response.once('close', () => { livePolls--; waiting.delete(response); });
  });
  await new Promise(resolve => gatewayServer.listen(0, '127.0.0.1', resolve));
  t.after(() => { gatewayServer.closeAllConnections(); return new Promise(resolve => gatewayServer.close(resolve)); });
  const gateway = createGateway({ address: `127.0.0.1:${gatewayServer.address().port}` });
  const f = await fixture(t, { gateway });
  await f.request('/api/state');
  for (let attempts = 0; attempts < 100 && waiting.size !== 1; attempts++) await delay(10);
  assert.equal(waiting.size, 1);
  const a = '/api/state?session=' + sessionKey('claude-code', 'session-alpha');
  const b = '/api/state?session=' + sessionKey('claude-code', 'session-bravo');
  const results = await Promise.all(Array.from({ length: 16 }, (_, index) => f.request(index % 2 ? a : b)));
  assert.ok(results.every(response => response.status === 200));
  assert.equal(f.starts, 1); assert.equal(maxPolls, 1); assert.equal(waiting.size, 1);
  assert.equal(seen.length, 3, 'Viewer refreshes must not open additional gateway polls');
  assert.ok(seen.every(request => !request.headers.authorization && !request.headers.cookie && !request.headers.origin));
});

test('rotation revokes old API token even when the previous Bun host remains alive', async t => {
  const f = await fixture(t);
  assert.equal((await f.request('/api/state')).status, 200);
  await f.persist({ ...f.entry, options: { ...f.entry.options, apiToken: randomBytes(32).toString('base64url') } });
  const response = await f.request('/api/state');
  assert.equal(response.status, 403);
  assert.equal(response.body.error.code, 'installation_revoked');
  assert.equal(response.body.requests, undefined);
});

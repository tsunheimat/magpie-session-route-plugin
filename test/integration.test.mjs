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
async function fixture(t, { history, gateway, options: settings = {}, trace = initialTrace() } = {}) {
  const directory = await mkdtemp(join(tmpdir(), 'session-routing-integration-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const options = { port: await reservePort(), installationId: randomBytes(16).toString('base64url'), apiToken: randomBytes(32).toString('base64url'), ...settings };
  const config = createConfig({ directory }, options, { env: { MAGPIE_ADDR: '127.0.0.1:3425' } });
  const persist = entry => writeFile(join(directory, 'plugins.json'), JSON.stringify({ plugins: [entry] }));
  const entry = { spec: root, options };
  await persist(entry);
  const aggregator = createAggregator({ showFolders: config.showFolders, showProjectNames: config.showProjectNames });
  if (!gateway) aggregator.applyTrace(trace, { full: true });
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

test('native HTTP viewers share the projector, stable seats and exact recorded sessions without raw identities', async t => {
  const f = await fixture(t);
  assert.equal((await f.request('/api/native-routing', { auth: false })).status, 401);
  const [a, b] = await Promise.all([f.request('/api/native-routing', { Origin: 'null' }), f.request('/api/native-routing', { Origin: 'null' })]);
  assert.equal(a.status, 200); assert.deepEqual(a.body, b.body); assert.equal(f.starts, 1);
  assert.equal(a.body.object, 'trace'); assert.equal(a.body.routes.length, 5);
  const routes = new Map(a.body.routes.map(r => [r.id, r]));
  assert.equal(routes.get(101).session, routes.get(103).session);
  assert.notEqual(routes.get(101).session, routes.get(102).session);
  assert.notEqual(routes.get(101).agent, routes.get(104).agent);
  assert.equal(routes.get(105).session, null);
  assert.equal(routes.get(101).order[0].id, routes.get(102).order[0].id);
  assert.equal(routes.get(101).tries[0].id, routes.get(101).order[0].id);
  assert.doesNotMatch(JSON.stringify(a.body), /DO-NOT-EXPOSE|private-a@example|secret-token|prompt|archive/);
  assert.equal(a.body.coverage.inventory, 'unavailable');
  const oldSeat = routes.get(101).order[0].id;
  f.aggregator.clear('stopped');
  assert.equal((await f.request('/api/native-routing')).body.routes.length, 0);
  f.aggregator.applyTrace(initialTrace(), { full: true });
  const reset = (await f.request('/api/native-routing')).body;
  assert.notEqual(reset.routes[0].order[0].id, oldSeat);
  await f.persist({ ...f.entry, off: true });
  const revoked = await f.request('/api/native-routing');
  assert.equal(revoked.status, 403); assert.equal(revoked.body.routes, undefined);
});

test('protected native HTTP preserves configured brands, project basenames and opaque actor evidence', async t => {
  const names = ['Gemini CLI', 'Antigravity', 'Kiro', 'StepFun', '团队 — Custom (EU)'];
  const icons = ['geminicli-color', 'antigravity-color', 'kiro-color', 'stepfun-color', 'generic'];
  const routes = names.map((name, index) => makeRoute(index + 1, { folder: '/PRIVATE-PARENT/PROJECT-CANARY',
    sub: 'PRIVATE-ACTOR@example.invalid', parentSession: 'TITLE-PARENT-CANARY',
    order: [{ id: 'PRIVATE-SEAT@example.invalid', provider: 'private-configured-provider', name, who: 'PRIVATE-ACCOUNT-CANARY',
      model: 'model-a', routing: 'order', kind: 'account',
      ...(index === 2 ? { preset: icons[index] } : index === 4 ? { icon: 'file:/PRIVATE-ICON-CANARY', preset: 'openai' } : { icon: icons[index] }) }],
    tries: [{ id: 'PRIVATE-SEAT@example.invalid', model: 'model-a', start: '2026-11-06T12:00:00.000Z', done: false }],
    ...(index === 1 ? { subagentId: 'PRIVATE-ACTOR@example.invalid' } : index === 2 ? { subagentId: 'CONFLICT-CANARY' } : {}) }));
  const f = await fixture(t, { trace: { ...initialTrace(), routes, ids: routes.map(route => route.id) } });
  assert.equal((await f.request('/api/native-routing', { auth: false })).status, 401);
  const response = await f.request('/api/native-routing', { Origin: 'null' });
  assert.equal(response.status, 200);
  assert.equal(f.starts, 1);
  for (const route of response.body.routes) {
    const index = route.id - 1;
    assert.equal(route.order[0].name, names[index]);
    assert.equal(route.order[0].icon, icons[index]);
    assert.match(route.order[0].provider, /^provider_/u);
    assert.equal(route.projectName, 'PROJECT-CANARY');
    assert.equal(route.folder, undefined);
    assert.equal(route.isSubagent, true);
    assert.equal(route.parentSession, undefined);
    if (index === 2) {
      assert.equal(route.actorId, undefined);
      assert.ok(route.evidence.reasons.includes('actor_identity_conflict'));
    } else assert.match(route.actorId, /^actor_[A-Za-z0-9_-]{22}$/u);
    if (index === 0) assert.equal(route.subagentId, undefined, 'tool-less header is not a turn marker');
    if (index === 1) assert.equal(route.subagentId, route.actorId);
  }
  assert.equal(new Set(response.body.routes.filter(route => route.actorId).map(route => route.actorId)).size, 1);
  assert.equal(new Set(response.body.routes.map(route => route.order[0].id)).size, 1);
  assert.doesNotMatch(JSON.stringify(response.body), /PRIVATE-|private-configured-provider|TITLE-PARENT-CANARY|CONFLICT-CANARY|DO-NOT-EXPOSE/);
  const legacy = await f.request('/api/state');
  assert.equal(legacy.body.requests.some(route => Object.hasOwn(route, 'projectName') || Object.hasOwn(route, 'actorId')), false);
});

test('protected APIs with both disclosure options off contain neither folder nor project canaries', async t => {
  const route = makeRoute(1, { folder: '/PARENT-CANARY/PROJECT-CANARY', rule: { folder: '/RULE-PARENT-CANARY/RULE-PROJECT-CANARY' } });
  const f = await fixture(t, { options: { showFolders: false, showProjectNames: false },
    trace: { ...initialTrace(), routes: [route], ids: [route.id] } });
  for (const path of ['/api/native-routing', '/api/state', '/api/sessions']) {
    const response = await f.request(path);
    assert.equal(response.status, 200);
    assert.doesNotMatch(JSON.stringify(response.body), /PARENT-CANARY|PROJECT-CANARY|"projectName"/);
    assert.ok((response.body.sessions ?? []).every(session => session.folder == null));
    assert.ok((response.body.routes ?? response.body.requests ?? []).every(route => !Object.hasOwn(route, 'folder')));
  }
  await f.persist({ ...f.entry, options: { ...f.entry.options, showProjectNames: true } });
  const revoked = await f.request('/api/native-routing');
  assert.equal(revoked.status, 403);
  assert.equal(revoked.body.routes, undefined);
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
  const results = await Promise.all(Array.from({ length: 18 }, (_, index) => f.request([a, b, '/api/native-routing'][index % 3])));
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

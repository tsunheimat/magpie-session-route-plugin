import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer as httpServer, request } from 'node:http';
import { createServer as tcpServer } from 'node:net';
import { randomBytes } from 'node:crypto';
import { mkdtemp, readFile, writeFile, rename, rm, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { setTimeout as sleep } from 'node:timers/promises';
import { createConfig, createInstallationAuthorizer, inspectInstallation,
  parseGatewayAddress, validateOptions, ConfigurationError } from '../lib/config.mjs';
import { startService, probeOwnership, STANDBY_MS, ServiceError } from '../lib/lifecycle.mjs';
import { createServer, ownershipProof } from '../lib/server.mjs';
import plugin from '../index.mjs';
import { initialTrace } from './fixtures/trace.mjs';
import { sessionKey } from '../lib/contracts.mjs';

const cleanups = new WeakMap();
function cleanup(t, action) {
  if (!cleanups.has(t)) {
    const actions = [];
    cleanups.set(t, actions);
    t.after(async () => { for (const dispose of actions.reverse()) await dispose(); });
  }
  cleanups.get(t).push(action);
}

function credentials() {
  return { installationId: randomBytes(16).toString('base64url'), apiToken: randomBytes(32).toString('base64url') };
}

async function unusedPort() {
  const server = tcpServer();
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  await new Promise((resolve) => server.close(resolve));
  return port;
}

async function eventually(check) {
  const deadline = Date.now() + 3000;
  while (!check()) {
    if (Date.now() > deadline) assert.fail('Condition did not become true');
    await sleep(5);
  }
}

function deferred() {
  let resolve;
  const promise = new Promise((done) => { resolve = done; });
  return { promise, resolve };
}

function call(port, path = '/api/state', headers = {}) {
  return new Promise((resolve, reject) => {
    const req = request({ hostname: '127.0.0.1', port, path, agent: false, headers }, (res) => {
      const data = [];
      res.on('data', (chunk) => data.push(chunk));
      res.on('end', () => resolve({ status: res.statusCode, text: Buffer.concat(data).toString('utf8') }));
      res.on('error', reject);
    });
    req.setTimeout(3000, () => req.destroy(new Error('test timeout')));
    req.on('error', reject);
    req.end();
  });
}

async function fixture(t, { port, options = {} } = {}) {
  const directory = await mkdtemp(join(tmpdir(), 'session-routing-lifecycle-'));
  const settings = { port: port ?? await unusedPort(), ...credentials(), ...options };
  const input = { directory, serverUrl: new URL('https://must-not-be-used.invalid:4096') };
  const file = join(directory, 'plugins.json');
  const entry = { spec: '/synthetic/plugin', options: settings };
  const write = async (value) => {
    await writeFile(`${file}.next`, typeof value === 'string' ? value : JSON.stringify(value));
    await rename(`${file}.next`, file);
  };
  await write({ plugins: [entry] });
  cleanup(t, () => rm(directory, { recursive: true, force: true }));
  return { input, options: settings, entry, file, write,
    config: createConfig(input, settings, { env: {} }) };
}

function stubs(overrides = {}) {
  const events = [];
  const counters = { starts: 0, stops: 0, historyStops: 0, clears: 0, constructs: 0, gatewayAddress: null };
  const aggregator = { snapshot: (scope) => ({ apiVersion: 1, instanceId: 'safe', generation: 0, revision: 0,
    seq: 0, scope, connection: { status: 'starting' }, coverage: { source: 'trace', period: 'live' },
    sessions: [], unknownRequests: 0, requests: [], metrics: {}, graph: { requestKeys: [] } }),
    clear() { events.push('clear'); counters.clears += 1; } };
  const collector = { start() { events.push('start'); counters.starts += 1; },
    async stop() { events.push('collector-stop'); counters.stops += 1; } };
  const history = { snapshot: async (scope) => aggregator.snapshot(scope),
    clear() { events.push('history-clear'); }, async stop() { events.push('history-stop'); counters.historyStops += 1; } };
  return { events, counters, aggregator, collector, history, deps: { env: {}, watchdogMs: 10, retryMs: 10,
    createAggregator: () => { counters.constructs += 1; return aggregator; },
    createGateway: ({ address }) => { counters.gatewayAddress = address; return {}; },
    createCollector: () => collector, createHistory: () => history, ...overrides } };
}

function own(t, handle) { cleanup(t, () => handle.stop()); return handle; }

test('options validate independent canonical secrets and local gateway addresses', () => {
  assert.deepEqual(validateOptions(), { port: 3496, showFolders: false, showProjectNames: true, installationId: undefined, apiToken: undefined, provisioned: false });
  const pair = credentials();
  const options = validateOptions({ ...pair, port: '3497', showFolders: true, showProjectNames: false });
  assert.equal(options.showProjectNames, false);
  assert.equal(options.showFolders, true);
  assert.equal(options.port, 3497);
  assert.equal(options.provisioned, true);
  for (const bad of [null, [], { unknown: true }, { port: 0 }, { port: 65536 }, { port: 1.5 },
    { port: '03496' }, { showFolders: 'yes' }, { showProjectNames: 'yes' }, { showProjectNames: null }, { showProjectNames: 0 }, { installationId: pair.installationId }, { apiToken: pair.apiToken },
    { ...pair, apiToken: pair.apiToken + '=' }, { ...pair, installationId: pair.apiToken },
    { ...pair, apiToken: pair.installationId }, { ...pair, apiToken: 'not-a-token' }]) {
    assert.throws(() => validateOptions(bad), ConfigurationError);
  }
  for (const address of ['0.0.0.0:3425', 'localhost:3425', ':3425', '[::]:3425', '127.0.0.1:3425']) {
    assert.equal(parseGatewayAddress(address).address, '127.0.0.1:3425');
  }
  assert.equal(parseGatewayAddress('[::1]:1234').address, '[::1]:1234');
  for (const address of ['https://127.0.0.1:3425', 'evil.test:3425', '127.0.0.2:3425', '127.1:3425',
    '2130706433:3425', '127.0.0.1:3425/path', 'user@127.0.0.1:3425', '[::ffff:127.0.0.1]:3425', 'localhost:0']) {
    assert.throws(() => parseGatewayAddress(address), ConfigurationError);
  }
  assert.throws(() => createConfig({ directory: '.' }, pair), ConfigurationError);
  assert.throws(() => createConfig({ directory: '/tmp/test' }, { ...pair, port: 3425 }, { env: {} }), ConfigurationError);
  assert.equal(createConfig({ directory: '/tmp/test', serverUrl: 'https://evil.test' }, pair,
    { env: { MAGPIE_ADDR: '0.0.0.0:4234' } }).gatewayAddress, '127.0.0.1:4234');
});

test('saved configuration authorization is fail-closed and never uses last-good data', async (t) => {
  const fx = await fixture(t);
  const initial = await inspectInstallation(fx.config);
  assert.deepEqual(initial, { spec: fx.entry.spec, port: fx.options.port });
  const authorize = createInstallationAuthorizer(fx.config, { installation: initial });
  assert.equal(await authorize(), true);
  for (const value of ['{', 'null', '{}', { plugins: [] }, { plugins: [fx.entry, fx.entry] },
    { plugins: [{ ...fx.entry, off: true }] }, { plugins: [{ ...fx.entry, off: 'false' }] },
    { plugins: [{ ...fx.entry, spec: '/different/plugin' }] },
    { plugins: [{ ...fx.entry, options: { ...fx.options, apiToken: credentials().apiToken } }] },
    { plugins: [{ ...fx.entry, options: { ...fx.options, installationId: credentials().installationId } }] },
    { plugins: [{ ...fx.entry, options: { ...fx.options, port: fx.options.port === 65535 ? 65534 : fx.options.port + 1 } }] },
    { plugins: [{ ...fx.entry, options: { ...fx.options, showFolders: true } }] },
    { plugins: [{ ...fx.entry, options: { ...fx.options, showProjectNames: false } }] },
    ' '.repeat(1024 * 1024 + 1)]) {
    await fx.write(value);
    assert.equal(await authorize(), false);
  }
  await fx.write({ plugins: [fx.entry, { spec: '/unrelated', options: { whatever: 'untouched' } }] });
  assert.equal(await authorize(), true);
  assert.equal(await createInstallationAuthorizer(fx.config, { read: async () => { throw new Error('private path'); } })(), false);
  await rm(fx.file);
  assert.equal(await authorize(), false);
  await mkdir(fx.file);
  assert.equal(await authorize(), false);
});

test('unprovisioned initializer returns empty hooks without listener, modules, or disk reads', async (t) => {
  const fx = await fixture(t);
  let invoked = 0;
  const fail = () => { invoked += 1; throw new Error('must not run'); };
  const handle = await startService(fx.input, {}, { env: {}, readConfig: fail,
    createServer: fail, createAggregator: fail, createGateway: fail, createCollector: fail, createHistory: fail });
  assert.equal(handle.status, 'unprovisioned');
  assert.equal(handle.address(), null);
  assert.equal(await handle.ready, false);
  await handle.stop();
  assert.equal(invoked, 0);
  assert.equal(plugin.id, 'magpie-session-routing');
  assert.deepEqual(await plugin.server(fx.input, {}), {});
});

test('startup rejects revoked saved installation before constructing services', async (t) => {
  const fx = await fixture(t);
  await fx.write({ plugins: [{ ...fx.entry, off: true }] });
  const stub = stubs();
  await assert.rejects(startService(fx.input, fx.options, stub.deps), { code: 'installation_revoked' });
  assert.equal(stub.counters.constructs, 0);
});

test('single-flight initialization binds once and waits for authorized use before collection', async (t) => {
  const fx = await fixture(t);
  const stub = stubs();
  const one = startService(fx.input, fx.options, stub.deps);
  const two = startService(fx.input, fx.options, stub.deps);
  assert.equal(one, two);
  const [a, b] = await Promise.all([one, two]);
  own(t, a);
  assert.equal(a, b);
  assert.equal(a.status, 'serving');
  assert.equal(await a.ready, true);
  assert.equal(a.address().address, '127.0.0.1');
  assert.equal(stub.counters.constructs, 1);
  assert.equal(stub.counters.gatewayAddress, '127.0.0.1:3425');
  assert.equal(stub.counters.starts, 0);
  assert.equal((await call(fx.options.port, '/healthz')).status, 200);
  assert.equal((await call(fx.options.port)).status, 401);
  assert.equal(await probeOwnership(fx.config), 'owned');
  assert.equal(stub.counters.starts, 0);
  const headers = { Authorization: `Bearer ${fx.options.apiToken}`, Origin: 'null' };
  const replies = await Promise.all([call(fx.options.port, '/api/state', headers), call(fx.options.port, '/api/sessions', headers)]);
  assert.deepEqual(replies.map((reply) => reply.status), [200, 200]);
  assert.equal(stub.counters.starts, 1);
  await Promise.all([a.stop(), a.stop()]);
  assert.equal(a.status, 'stopped');
  assert.equal(a.address(), null);
  assert.equal(stub.counters.stops, 1);
  assert.equal(stub.counters.clears, 1);
});

test('CLI-remapped service honors its effective Host and never collects or scans history', async (t) => {
  const fx = await fixture(t);
  const temporaryPort = await unusedPort();
  const stub = stubs();
  let historyReads = 0;
  stub.history.snapshot = async () => { historyReads += 1; return {}; };
  const handle = own(t, await startService(fx.input, { ...fx.options, port: temporaryPort }, stub.deps));
  assert.equal(handle.status, 'remapped');
  assert.equal(handle.collectorEligible, false);
  assert.equal(handle.address().port, temporaryPort);
  assert.equal((await call(temporaryPort, '/healthz')).status, 200);
  const headers = { Authorization: `Bearer ${fx.options.apiToken}` };
  assert.equal((await call(temporaryPort, '/api/state', headers)).status, 503);
  assert.equal((await call(temporaryPort, '/api/history', headers)).status, 503);
  assert.equal((await call(temporaryPort, '/healthz', { Host: `127.0.0.1:${fx.options.port}` })).status, 403);
  assert.equal(stub.counters.starts, 0);
  assert.equal(historyReads, 0);
  await fx.write({ plugins: [{ ...fx.entry, off: true }] });
  await eventually(() => handle.address() === null);
  assert.equal(handle.status, 'revoked');
});

test('disable, removal, token/ID/port changes, malformed files and privacy changes revoke idle collection', async (t) => {
  const variants = [
    (fx) => ({ plugins: [{ ...fx.entry, off: true }] }),
    () => ({ plugins: [] }),
    (fx) => ({ plugins: [{ ...fx.entry, options: { ...fx.options, apiToken: credentials().apiToken } }] }),
    (fx) => ({ plugins: [{ ...fx.entry, options: { ...fx.options, installationId: credentials().installationId } }] }),
    (fx) => ({ plugins: [{ ...fx.entry, options: { ...fx.options, showFolders: true } }] }),
    (fx) => ({ plugins: [{ ...fx.entry, options: { ...fx.options, showProjectNames: false } }] }),
    (fx) => ({ plugins: [{ ...fx.entry, options: { ...fx.options, port: fx.options.port === 65535 ? 65534 : fx.options.port + 1 } }] }),
    () => '{',
  ];
  for (const value of variants) {
    const fx = await fixture(t);
    const stub = stubs();
    const handle = own(t, await startService(fx.input, fx.options, stub.deps));
    assert.equal((await call(fx.options.port, '/api/state', { Authorization: `Bearer ${fx.options.apiToken}` })).status, 200);
    assert.equal(stub.counters.starts, 1);
    await fx.write(value(fx));
    await eventually(() => handle.address() === null);
    assert.equal(handle.status, 'revoked');
    assert.equal(stub.counters.stops, 1);
    assert.equal(stub.counters.historyStops, 1);
    assert.equal(stub.counters.clears, 1);
  }
});

test('sensitive responses check saved options even before the watchdog tick', async (t) => {
  const fx = await fixture(t);
  const stub = stubs({ watchdogMs: 60_000 });
  const handle = own(t, await startService(fx.input, fx.options, stub.deps));
  await fx.write({ plugins: [{ ...fx.entry, off: true }] });
  const res = await call(fx.options.port, '/api/state', { Authorization: `Bearer ${fx.options.apiToken}` });
  assert.equal(res.status, 403);
  assert.equal(JSON.parse(res.text).error.code, 'installation_revoked');
  assert.equal(stub.counters.starts, 0);
  await eventually(() => handle.address() === null);
});

test('stop aborts and awaits collector and history before relinquishing the exclusive listener', async (t) => {
  const fx = await fixture(t);
  const stub = stubs();
  const held = deferred();
  const stopping = deferred();
  stub.collector.stop = async () => { stopping.resolve(); await held.promise; stub.events.push('joined'); };
  const handle = own(t, await startService(fx.input, fx.options, stub.deps));
  const stopped = handle.stop();
  await stopping.promise;
  const contender = createServer({ config: fx.config });
  t.after(() => contender.stop());
  try { await assert.rejects(contender.listen(), { code: 'EADDRINUSE' }); }
  finally { held.resolve(); }
  await stopped;
  assert(stub.events.indexOf('clear') > stub.events.indexOf('joined'));
  await contender.listen();
  assert.equal(contender.address().port, fx.options.port);
});

test('watchdog aborts an in-progress history response and clears its cached projection', async (t) => {
  const fx = await fixture(t);
  const stub = stubs();
  const begun = deferred();
  let requestSignal;
  stub.history.snapshot = (_scope, { signal }) => {
    requestSignal = signal;
    begun.resolve();
    return new Promise((resolve) => signal.addEventListener('abort', () => resolve({ secret: 'late data' }), { once: true }));
  };
  const handle = own(t, await startService(fx.input, fx.options, stub.deps));
  const reply = call(fx.options.port, '/api/history', { Authorization: `Bearer ${fx.options.apiToken}` })
    .catch(() => ({ status: 0, text: '' }));
  await begun.promise;
  await fx.write({ plugins: [] });
  const res = await reply;
  await eventually(() => handle.address() === null);
  assert(requestSignal.aborted);
  assert.notEqual(res.status, 200);
  assert(!res.text.includes('late data'));
  assert.equal(stub.counters.clears, 1);
});

test('occupied foreign port is never sent bearer data, taken over or terminated', async (t) => {
  const seen = [];
  const foreign = httpServer((req, res) => { seen.push({ path: req.url, headers: req.headers }); res.end('{"apiVersion":1,"proof":"wrong"}'); });
  await new Promise((resolve) => foreign.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise((resolve) => foreign.close(resolve)));
  const fx = await fixture(t, { port: foreign.address().port });
  let now = 0;
  const waits = [];
  const stub = stubs({ clock: () => now, conflictGraceMs: 30,
    wait: async (duration) => { waits.push(duration); now += duration; } });
  await assert.rejects(startService(fx.input, fx.options, stub.deps), (error) => {
    assert(error instanceof ServiceError);
    assert.equal(error.code, 'port_conflict');
    assert(!error.message.includes(fx.options.apiToken));
    return true;
  });
  assert.equal(stub.counters.starts, 0);
  assert.equal(stub.counters.stops, 1);
  assert(waits.length > 0 && waits.length <= 4, 'unrecognized listeners get only a few exclusive-bind retries');
  assert.equal(now, 30, 'the conflict grace is bounded independently of long standby');
  assert.equal(seen.length, 1);
  assert.match(seen[0].path, /^\/ownership\?nonce=[A-Za-z0-9_-]{43}$/u);
  assert.equal(seen[0].headers.authorization, undefined);
  assert.equal(seen[0].headers.cookie, undefined);
  assert(!JSON.stringify(seen).includes(fx.options.apiToken));
  assert(!JSON.stringify(seen).includes(fx.options.installationId));
  assert.equal((await call(foreign.address().port, '/still-alive')).status, 200);
});

test('rotation permits a short exclusive-bind retry while an unrecognized old owner self-revokes', async (t) => {
  for (const change of [{ apiToken: credentials().apiToken }, { showFolders: true }, { showProjectNames: false }]) {
    const fx = await fixture(t);
    const join = deferred();
    let revoking = false;
    let oldCollectorActive = true;
    let shutdown;
    const previous = createServer({ config: fx.config,
      authorizeInstallation: createInstallationAuthorizer(fx.config),
      stop: () => {
        revoking = true;
        previous.revoke();
        shutdown ??= (async () => {
          await join.promise;
          oldCollectorActive = false;
          await previous.stop();
        })();
        return shutdown;
      } });
    await previous.listen();
    cleanup(t, async () => { join.resolve(); await shutdown; await previous.stop(); });
    const rotated = { ...fx.options, ...change };
    await fx.write({ plugins: [{ ...fx.entry, options: rotated }] });
    let waits = 0;
    const owners = [];
    const stub = stubs({ watchdogMs: 60_000,
      probeOwnership: async (...args) => { const owner = await probeOwnership(...args); owners.push(owner); return owner; },
      wait: async () => {
        waits += 1;
        assert(revoking, 'the old server revokes itself; the replacement does not signal it');
        assert(previous.listening, 'the listener remains exclusive until its old collector joins');
        join.resolve();
        await shutdown;
      } });
    stub.collector.start = () => {
      assert.equal(oldCollectorActive, false, 'collection must not overlap during rotation');
      stub.counters.starts += 1;
    };
    const next = own(t, await startService(fx.input, rotated, stub.deps));
    assert.deepEqual(owners, ['unknown']);
    assert.equal(waits, 1);
    assert.equal(next.status, 'serving');
    assert.equal(stub.counters.starts, 0);
    assert.equal((await call(rotated.port, '/api/state', { Authorization: `Bearer ${rotated.apiToken}` })).status, 200);
    assert.equal(stub.counters.starts, 1);
  }
});

test('revocation during the unrecognized-owner grace prevents any subsequent bind', async (t) => {
  const fx = await fixture(t);
  let attempts = 0;
  let probes = 0;
  let stopped = 0;
  const stub = stubs({
    createServer: () => ({
      listen: async () => { attempts += 1; throw Object.assign(new Error(), { code: 'EADDRINUSE' }); },
      stop: async () => { stopped += 1; }, address: () => null,
    }),
    probeOwnership: async () => { probes += 1; return 'unknown'; },
    wait: async () => { await fx.write({ plugins: [] }); },
  });
  await assert.rejects(startService(fx.input, fx.options, stub.deps), { code: 'installation_revoked' });
  assert.equal(attempts, 1);
  assert.equal(probes, 1);
  assert.equal(stopped, 1);
  assert.equal(stub.counters.starts, 0);
  assert.equal(stub.counters.stops, 1);
});

test('ownership probe rejects redirects, wrong signatures, replay, oversized and hanging replies', async (t) => {
  let requests = 0;
  let mode = 'valid';
  let oldProof;
  const pair = credentials();
  const foreign = httpServer((req, res) => {
    requests += 1;
    const nonce = new URL(req.url, 'http://127.0.0.1').searchParams.get('nonce');
    if (mode === 'hang') return;
    if (mode === 'redirect') { res.writeHead(302, { Location: 'http://127.0.0.1:1/never-follow' }); res.end(); return; }
    if (mode === 'oversized') { res.end('x'.repeat(4096)); return; }
    const proof = ownershipProof(pair, nonce);
    res.end(JSON.stringify({ apiVersion: 1, proof: mode === 'replay' ? oldProof : mode === 'wrong' ? credentials().apiToken : proof }));
    oldProof = proof;
  });
  await new Promise((resolve) => foreign.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise((resolve) => { foreign.closeAllConnections(); foreign.close(resolve); }));
  const config = { ...pair, port: foreign.address().port };
  assert.equal(await probeOwnership(config), 'owned');
  for (mode of ['replay', 'redirect', 'oversized', 'wrong', 'hang']) {
    assert.equal(await probeOwnership(config, { timeoutMs: 40 }), 'unknown', mode);
  }
  assert.equal(requests, 6);
  const controller = new AbortController();
  controller.abort();
  assert.equal(await probeOwnership(config, { signal: controller.signal }), 'unknown');
  assert.equal(requests, 6);
});

test('recognized old host yields nonblocking standby and lazy collection after takeover', async (t) => {
  const fx = await fixture(t);
  const previous = createServer({ config: fx.config, authorizeInstallation: async () => true });
  await previous.listen();
  cleanup(t, () => previous.stop());
  const stub = stubs({ standbyMs: 2000 });
  const handle = own(t, await startService(fx.input, fx.options, stub.deps));
  assert.equal(handle.status, 'standby');
  assert.equal(handle.address(), null);
  assert.equal(stub.counters.starts, 0);
  assert.equal(previous.listening, true);
  await previous.stop();
  // Keep a test timer alive while the deliberately unref'ed standby waits.
  await eventually(() => handle.status === 'serving');
  assert.equal(await handle.ready, true);
  assert.equal(stub.counters.starts, 0);
  assert.equal((await call(fx.options.port, '/api/state', { Authorization: `Bearer ${fx.options.apiToken}` })).status, 200);
  assert.equal(stub.counters.starts, 1);
});

test('standby covers the old ten-minute drain plus grace and stops at its bound', async (t) => {
  assert.equal(STANDBY_MS, 660_000);
  const fx = await fixture(t);
  const stub = stubs();
  let now = 0;
  let attempts = 0;
  let stops = 0;
  const gate = deferred();
  const handle = own(t, await startService(fx.input, fx.options, { ...stub.deps,
    clock: () => now, retryMs: 60_000, watchdogMs: 60_000,
    wait: async (duration) => { await gate.promise; now += duration; },
    probeOwnership: async () => 'owned',
    createServer: () => ({ listen: async () => { attempts += 1; throw Object.assign(new Error(), { code: 'EADDRINUSE' }); },
      address: () => null, stop: async () => { stops += 1; } }),
  }));
  assert.equal(handle.status, 'standby');
  gate.resolve();
  await assert.rejects(handle.ready, { code: 'standby_expired' });
  await handle.stop();
  assert.equal(now, STANDBY_MS);
  assert.equal(attempts, 11);
  assert.equal(handle.status, 'failed');
  assert.equal(stub.counters.starts, 0);
  assert.equal(stops, 1);
});

test('standby cancellation and revocation cannot later claim the released port', async (t) => {
  for (const revoke of [false, true]) {
    const fx = await fixture(t);
    const previous = createServer({ config: fx.config, authorizeInstallation: async () => true });
    await previous.listen();
    cleanup(t, () => previous.stop());
    const stub = stubs();
    const handle = own(t, await startService(fx.input, fx.options, stub.deps));
    assert.equal(handle.status, 'standby');
    if (revoke) {
      await fx.write({ plugins: [] });
      await eventually(() => handle.status === 'revoked');
    }
    await handle.stop();
    await previous.stop();
    const replacement = createServer({ config: fx.config });
    t.after(() => replacement.stop());
    await replacement.listen();
    assert.equal(stub.counters.starts, 0);
    assert.equal(handle.address(), null);
  }
});

test('stopping standby cancels an in-progress unrecognized-owner grace', async (t) => {
  const fx = await fixture(t);
  const retry = deferred();
  const grace = deferred();
  let attempts = 0;
  let probes = 0;
  let waits = 0;
  let graceSignal;
  let cancelled = false;
  const stub = stubs({ watchdogMs: 60_000,
    createServer: () => ({
      listen: async () => { attempts += 1; throw Object.assign(new Error(), { code: 'EADDRINUSE' }); },
      stop: async () => {}, address: () => null,
    }),
    probeOwnership: async () => ++probes === 1 ? 'owned' : 'unknown',
    wait: (_duration, signal) => {
      if (++waits === 1) return retry.promise;
      graceSignal = signal;
      grace.resolve();
      return new Promise((resolve) => signal.addEventListener('abort', () => { cancelled = true; resolve(); }, { once: true }));
    },
  });
  const handle = own(t, await startService(fx.input, fx.options, stub.deps));
  assert.equal(handle.status, 'standby');
  retry.resolve();
  await grace.promise;
  await handle.stop();
  assert(graceSignal.aborted);
  assert(cancelled);
  assert.equal(attempts, 2);
  assert.equal(probes, 2);
  assert.equal(stub.counters.starts, 0);
});

test('a new foreign owner during standby stops retries without killing it', async (t) => {
  const fx = await fixture(t);
  const previous = createServer({ config: fx.config, authorizeInstallation: async () => true });
  await previous.listen();
  cleanup(t, () => previous.stop());
  const gate = deferred();
  let now = 0;
  const stub = stubs({ clock: () => now, conflictGraceMs: 30,
    wait: async (duration) => { await gate.promise; now += duration; }, watchdogMs: 60_000 });
  const handle = own(t, await startService(fx.input, fx.options, stub.deps));
  assert.equal(handle.status, 'standby');
  await previous.stop();
  const foreign = httpServer((_req, res) => res.end('not this plugin'));
  await new Promise((resolve) => foreign.listen(fx.options.port, '127.0.0.1', resolve));
  t.after(() => new Promise((resolve) => foreign.close(resolve)));
  gate.resolve();
  await assert.rejects(handle.ready, { code: 'port_conflict' });
  await handle.stop();
  assert.equal(handle.status, 'failed');
  assert.equal((await call(fx.options.port, '/unrelated')).status, 200);
});

test('real constructors integrate with loopback telemetry and shared history, without forwarding credentials', async (t) => {
  const seen = [];
  let pendingPolls = 0;
  const gateway = httpServer((req, res) => {
    seen.push({ path: req.url, headers: req.headers });
    res.setHeader('Content-Type', 'application/json');
    if (req.url === '/api/hello') return res.end(JSON.stringify({ name: 'magpie', version: '0.1.3124' }));
    if (req.url === '/v1/magpie/trace') return res.end(JSON.stringify(initialTrace()));
    if (req.url === '/v1/magpie/trace?after=5&wait=1') {
      pendingPolls += 1;
      res.once('close', () => { pendingPolls -= 1; });
      return;
    }
    if (req.url === '/v1/magpie/usage/requests?period=today&offset=0&limit=200&via=through&computer=this') {
      return res.end(JSON.stringify({ period: 'today', offset: 0, total: 0, rows: [] }));
    }
    res.writeHead(404); res.end('{}');
  });
  await new Promise((resolve) => gateway.listen(0, '127.0.0.1', resolve));
  cleanup(t, () => new Promise((resolve) => { gateway.closeAllConnections(); gateway.close(resolve); }));
  const fx = await fixture(t);
  const handle = own(t, await startService(fx.input, fx.options,
    { env: { MAGPIE_ADDR: `127.0.0.1:${gateway.address().port}` }, watchdogMs: 20 }));
  assert.equal((await call(fx.options.port, '/healthz')).status, 200);
  assert.equal((await call(fx.options.port)).status, 401);
  assert.equal(seen.length, 0);
  const headers = { Authorization: `Bearer ${fx.options.apiToken}`, Cookie: 'browser-secret', Origin: 'null' };
  await call(fx.options.port, '/api/state', headers);
  await eventually(() => pendingPolls === 1);
  const a = sessionKey('claude-code', 'session-alpha');
  const b = sessionKey('claude-code', 'session-bravo');
  const [left, right] = await Promise.all([call(fx.options.port, `/api/state?session=${a}`, headers),
    call(fx.options.port, `/api/state?session=${b}`, headers)]);
  assert.equal(JSON.parse(left.text).metrics.requests, 2);
  assert.equal(JSON.parse(left.text).metrics.fallbacks, 1);
  assert.equal(JSON.parse(right.text).metrics.requests, 1);
  assert.equal(seen.length, 3);
  const historical = await Promise.all([call(fx.options.port, '/api/history?period=today', headers),
    call(fx.options.port, '/api/state?period=today', headers)]);
  assert.deepEqual(historical.map((res) => res.status), [200, 200]);
  assert.equal(JSON.parse(historical[0].text).pagination.snapshotId, JSON.parse(historical[1].text).pagination.snapshotId);
  assert.equal(seen.length, 4);
  assert(seen.every(({ headers: sent }) => !sent.authorization && !sent.cookie && !sent.origin));
  await handle.stop();
  await eventually(() => pendingPolls === 0);
  assert.equal(handle.address(), null);
});

test('same-process canonical port change joins the old owner before constructing its replacement', async (t) => {
  const fx = await fixture(t);
  const oldStub = stubs({ watchdogMs: 60_000 });
  let active = false;
  oldStub.collector.start = () => { active = true; };
  const joined = deferred();
  const stopping = deferred();
  oldStub.collector.stop = async () => {
    stopping.resolve();
    await joined.promise;
    active = false;
    oldStub.events.push('joined');
  };
  const first = own(t, await startService(fx.input, fx.options, oldStub.deps));
  // Always let held cleanup complete if an assertion fails.
  cleanup(t, () => joined.resolve());
  assert.equal((await call(fx.options.port, '/api/state', { Authorization: `Bearer ${fx.options.apiToken}` })).status, 200);
  const remapped = stubs({ watchdogMs: 60_000 });
  const temporary = own(t, await startService(fx.input, { ...fx.options, port: await unusedPort() }, remapped.deps));
  assert.equal(temporary.collectorEligible, false);
  assert(active, 'starting a CLI-remapped service must leave the canonical collector alone');
  assert.equal((await call(temporary.address().port, '/api/state', { Authorization: `Bearer ${fx.options.apiToken}` })).status, 503);
  assert.equal(first.status, 'serving');
  await assert.rejects(startService(fx.input, { ...fx.options, apiToken: credentials().apiToken }, stubs().deps),
    { code: 'installation_revoked' });
  assert.equal(await startService(fx.input, fx.options, oldStub.deps), first,
    'a failed replacement must not hide an owner that still needs to be joined');
  const nextOptions = { ...fx.options, port: await unusedPort() };
  await fx.write({ plugins: [{ ...fx.entry, options: nextOptions }] });
  const nextStub = stubs({ watchdogMs: 60_000 });
  nextStub.collector.start = () => {
    assert.equal(active, false, 'two canonical collectors may never overlap');
    nextStub.counters.starts += 1;
  };
  let settled = false;
  const pending = startService(fx.input, nextOptions, nextStub.deps).finally(() => { settled = true; });
  cleanup(t, async () => { joined.resolve(); try { await (await pending).stop(); } catch {} });
  try {
    await eventually(() => first.status === 'stopped' || settled);
    assert.equal(settled, false, 'replacement waits for old collector cleanup, even on another port');
    await stopping.promise;
    assert.equal(nextStub.counters.constructs, 0);
    assert.equal(temporary.collectorEligible, false);
  } finally { joined.resolve(); }
  const next = own(t, await pending);
  assert.equal(first.address(), null);
  assert(oldStub.events.indexOf('clear') > oldStub.events.indexOf('joined'));
  assert.equal(next.status, 'serving');
  assert.equal(next.collectorEligible, true);
  assert.equal((await call(nextOptions.port, '/api/state', { Authorization: `Bearer ${nextOptions.apiToken}` })).status, 200);
  assert.equal(nextStub.counters.starts, 1);
  assert.equal(remapped.counters.starts, 0);
});

test('project disclosure defaults and opt-out are passed through without rewriting saved settings', async t => {
  for (const options of [{}, { showProjectNames: false }, { showProjectNames: true, showFolders: true }]) {
    const fx = await fixture(t, { options });
    const before = await readFile(fx.file, 'utf8');
    let passed;
    const stub = stubs({ createAggregator: value => { passed = value; return stub.aggregator; } });
    const handle = own(t, await startService(fx.input, fx.options, stub.deps));
    assert.deepEqual(passed, { showFolders: options.showFolders ?? false, showProjectNames: options.showProjectNames ?? true });
    assert.equal(await readFile(fx.file, 'utf8'), before);
    await handle.stop();
    assert.equal(await readFile(fx.file, 'utf8'), before);
  }
});

test('same-process project disclosure changes replace the service and join the old collector', async t => {
  const fx = await fixture(t);
  const oldStub = stubs({ watchdogMs: 60_000 });
  const first = own(t, await startService(fx.input, fx.options, oldStub.deps));
  assert.equal(await startService(fx.input, { ...fx.options, showProjectNames: true }, oldStub.deps), first,
    'default and explicit true have the same effective fingerprint');
  const optedOut = { ...fx.options, showProjectNames: false };
  await fx.write({ plugins: [{ ...fx.entry, options: optedOut }] });
  const saved = await readFile(fx.file, 'utf8');
  let passed;
  const nextStub = stubs({ createAggregator: options => {
    assert.equal(oldStub.counters.stops, 1);
    assert.equal(oldStub.counters.clears, 1);
    passed = options;
    return nextStub.aggregator;
  } });
  const next = own(t, await startService(fx.input, optedOut, nextStub.deps));
  assert.notEqual(next, first);
  assert.equal(first.status, 'stopped');
  assert.equal(first.address(), null);
  assert.equal(next.status, 'serving');
  assert.deepEqual(passed, { showFolders: false, showProjectNames: false });
  assert.equal(await readFile(fx.file, 'utf8'), saved);
  // Removing an explicit false re-enables the default and revokes its projection.
  await fx.write({ plugins: [fx.entry] });
  await eventually(() => next.status === 'revoked');
});

test('same-process credential rotation joins old collector before new startup', async (t) => {
  const fx = await fixture(t);
  const oldStub = stubs({ watchdogMs: 60_000 });
  const first = own(t, await startService(fx.input, fx.options, oldStub.deps));
  await call(fx.options.port, '/api/state', { Authorization: `Bearer ${fx.options.apiToken}` });
  const rotated = { ...fx.options, apiToken: credentials().apiToken };
  await fx.write({ plugins: [{ ...fx.entry, options: rotated }] });
  const nextStub = stubs();
  const next = own(t, await startService(fx.input, rotated, nextStub.deps));
  assert.equal(first.status, 'stopped');
  assert.equal(oldStub.counters.stops, 1);
  assert.equal(oldStub.counters.clears, 1);
  assert.equal(next.status, 'serving');
  assert.equal((await call(fx.options.port, '/api/state', { Authorization: `Bearer ${fx.options.apiToken}` })).status, 401);
  assert.equal(nextStub.counters.starts, 0);
  assert.equal((await call(fx.options.port, '/api/state', { Authorization: `Bearer ${rotated.apiToken}` })).status, 200);
  assert.equal(nextStub.counters.starts, 1);
});

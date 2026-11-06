import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer as httpServer, request } from 'node:http';
import { createServer as tcpServer, connect } from 'node:net';
import { randomBytes } from 'node:crypto';
import { EventEmitter } from 'node:events';
import { Writable } from 'node:stream';
import { setImmediate as nextTurn } from 'node:timers/promises';
import { createServer, ownershipProof, verifyOwnershipProof } from '../lib/server.mjs';
import { ApiError, sessionKey } from '../lib/contracts.mjs';

async function unusedPort() {
  const server = tcpServer();
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  await new Promise((resolve) => server.close(resolve));
  return port;
}

function call(config, path, { headers = {}, method = 'GET' } = {}) {
  return new Promise((resolve, reject) => {
    const req = request({ hostname: '127.0.0.1', port: config.port, path, method, agent: false,
      headers: { Host: `127.0.0.1:${config.port}`, ...headers } }, (res) => {
      const chunks = [];
      res.on('data', (chunk) => chunks.push(chunk));
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers,
        text: Buffer.concat(chunks).toString('utf8') }));
      res.on('error', reject);
    });
    req.on('error', reject);
    req.end();
  });
}

function raw(config, lines) {
  return new Promise((resolve, reject) => {
    let output = '';
    const socket = connect(config.port, '127.0.0.1', () => socket.end(`${lines.join('\r\n')}\r\n\r\n`));
    socket.setTimeout(3000, () => socket.destroy(new Error('test timeout')));
    socket.on('data', (data) => { output += data; });
    socket.on('end', () => resolve(output));
    socket.on('error', reject);
  });
}

function snapshot(scope) {
  return { apiVersion: 1, instanceId: 'safe-instance', generation: 1, revision: 2, seq: 3,
    scope, connection: { status: 'live', lastUpdated: null, reason: null, gatewayVersion: null },
    coverage: { source: scope.period === 'live' ? 'trace' : 'ledger', period: scope.period },
    sessions: [], unknownRequests: 0, requests: [{ key: scope.sessionKey ?? scope.kind }],
    metrics: { requests: 1 }, graph: { requestKeys: [scope.sessionKey ?? scope.kind] } };
}

async function fixture(t, overrides = {}) {
  const config = { provisioned: true, host: '127.0.0.1', port: await unusedPort(),
    installationId: randomBytes(16).toString('base64url'), apiToken: randomBytes(32).toString('base64url') };
  let starts = 0;
  let authorizations = 0;
  const server = createServer({ config, aggregator: { snapshot },
    history: { snapshot: async (scope) => snapshot(scope) },
    startCollector: () => { starts += 1; },
    authorizeInstallation: async () => { authorizations += 1; return true; },
    loadStatic: async (name) => Buffer.from(name), ...overrides });
  t.after(() => server.stop());
  await server.listen();
  return { config, server, get starts() { return starts; }, get authorizations() { return authorizations; },
    get: (path, options = {}) => call(config, path, { ...options,
      headers: { Authorization: `Bearer ${config.apiToken}`, ...options.headers } }) };
}

test('fixed assets and health are public, inert, and carry protective headers', async (t) => {
  const fx = await fixture(t);
  for (const path of ['/', '/index.html', '/bridge.js', '/app.js', '/style.css', '/healthz']) {
    const res = await call(fx.config, path);
    assert.equal(res.status, 200, path);
    assert.equal(res.headers['cache-control'], 'no-store');
    assert.equal(res.headers['referrer-policy'], 'no-referrer');
    assert.equal(res.headers['x-content-type-options'], 'nosniff');
    assert.match(res.headers['content-security-policy'], /default-src 'none'/u);
    assert.match(res.headers['content-security-policy'], /sandbox allow-scripts/u);
    assert.equal(res.headers['access-control-allow-origin'], undefined);
    assert(!res.text.includes(fx.config.apiToken));
    assert(!res.text.includes(fx.config.installationId));
  }
  assert.deepEqual(JSON.parse((await call(fx.config, '/healthz')).text), { apiVersion: 1, status: 'ready' });
  assert.equal((await call(fx.config, '/', { method: 'HEAD' })).text, '');
  assert.equal(fx.starts, 0);
  assert.equal(fx.authorizations, 0);
  for (const path of ['/lib/config.mjs', '/package.json', '/../lib/config.mjs', '/%2e%2e/lib/config.mjs',
    '//healthz', '/app.js/extra', '/bridge.js.map', '/constructor', '/toString']) {
    assert.equal((await call(fx.config, path)).status, 404, path);
  }
});

test('exact Host and absent-or-single-null Origin apply even to public requests', async (t) => {
  const fx = await fixture(t);
  for (const Host of ['evil.test', `localhost:${fx.config.port}`, '127.0.0.1',
    `127.0.0.1:${fx.config.port + 1}`, `127.0.0.1:${fx.config.port},evil.test`, '[::1]:3496']) {
    assert.equal((await fx.get('/api/state', { headers: { Host } })).status, 403, Host);
    assert.equal((await call(fx.config, '/healthz', { headers: { Host } })).status, 403, Host);
  }
  for (const Origin of ['https://evil.test', 'http://127.0.0.1', 'file://', '', 'NULL', 'null, null', 'null null']) {
    const res = await fx.get('/api/state', { headers: { Origin } });
    assert.equal(res.status, 403, Origin);
    assert.equal(res.headers['access-control-allow-origin'], undefined);
  }
  const valid = await fx.get('/api/state', { headers: { Origin: 'null' } });
  assert.equal(valid.status, 200);
  assert.equal(valid.headers['access-control-allow-origin'], 'null');
  assert.equal(valid.headers['access-control-allow-credentials'], undefined);
  assert.equal((await fx.get('/api/state')).status, 200);
  assert.equal(fx.starts, 1);
});

test('bearer authorization is exact and is never accepted from cookies or queries', async (t) => {
  const fx = await fixture(t);
  for (const path of ['/api/state', '/api/sessions', '/api/history']) {
    for (const Authorization of [undefined, 'Bearer wrong', `bearer ${fx.config.apiToken}`, fx.config.apiToken,
      `Basic ${fx.config.apiToken}`, `Bearer ${fx.config.apiToken}, Bearer ${fx.config.apiToken}`]) {
      const res = await call(fx.config, path, { headers: Authorization ? { Authorization } : {} });
      assert.equal(res.status, 401);
      assert.equal(res.headers['www-authenticate'], 'Bearer');
      assert(!res.text.includes(fx.config.apiToken));
    }
  }
  assert.equal((await call(fx.config, `/api/state?token=${fx.config.apiToken}`,
    { headers: { Cookie: `apiToken=${fx.config.apiToken}`, Origin: 'null' } })).status, 401);
  assert.equal(fx.starts, 0);
  assert.equal(fx.authorizations, 0);
});

test('duplicate security headers, body framing and unnormalized targets are rejected', async (t) => {
  const fx = await fixture(t);
  const host = `Host: 127.0.0.1:${fx.config.port}`;
  const bearer = `Authorization: Bearer ${fx.config.apiToken}`;
  for (const extra of [[host], ['Origin: null', 'Origin: null'], [bearer, bearer],
    ['Content-Length: 1'], ['Transfer-Encoding: chunked']]) {
    const res = await raw(fx.config, ['GET /api/state HTTP/1.1', host, 'Connection: close', ...extra]);
    assert.match(res, /^HTTP\/1\.1 400 /u);
  }
  for (const target of ['http://127.0.0.1/api/state', '/api/state#fragment', '/api\\state']) {
    assert.match(await raw(fx.config, [`GET ${target} HTTP/1.1`, host, bearer, 'Connection: close']), /^HTTP\/1\.1 400 /u);
  }
  assert.equal(fx.starts, 0);
});

test('narrow preflight allows only sandbox API GET with Authorization', async (t) => {
  const fx = await fixture(t);
  const headers = { Origin: 'null', 'Access-Control-Request-Method': 'GET',
    'Access-Control-Request-Headers': 'authorization' };
  const res = await call(fx.config, '/api/state', { method: 'OPTIONS', headers });
  assert.equal(res.status, 204);
  assert.equal(res.headers['access-control-allow-origin'], 'null');
  assert.equal(res.headers['access-control-allow-methods'], 'GET');
  assert.equal(res.headers['access-control-allow-headers'], 'Authorization');
  for (const changed of [{ Origin: 'https://evil.test' }, { 'Access-Control-Request-Method': 'POST' },
    { 'Access-Control-Request-Headers': 'authorization, x-extra' }, { 'Access-Control-Request-Headers': '*' }]) {
    assert.equal((await call(fx.config, '/api/state', { method: 'OPTIONS', headers: { ...headers, ...changed } })).status, 403);
  }
  assert.equal((await call(fx.config, '/api/state', { method: 'OPTIONS' })).status, 403);
  assert.equal((await call(fx.config, '/ownership', { method: 'OPTIONS', headers })).status, 405);
  assert.equal((await call(fx.config, '/app.js', { method: 'OPTIONS', headers })).status, 405);
  assert.equal((await call(fx.config, '/api/state?extra=1', { method: 'OPTIONS', headers })).status, 400);
  assert.equal(fx.starts, 0);
  assert.equal(fx.authorizations, 0);
});

test('only fixed read methods and bounded unique query parameters are allowed', async (t) => {
  const fx = await fixture(t);
  for (const method of ['POST', 'PUT', 'DELETE', 'PATCH', 'HEAD']) {
    assert.equal((await fx.get('/api/state', { method })).status, 405);
  }
  const invalid = ['/api/state?session=', '/api/state?session=nope', '/api/state?period=year',
    '/api/state?period=live&period=live', '/api/state?includeChildren=true', '/api/state?includeChildren=2',
    '/api/state?unknown=1', '/api/state?session=%', '/api/state?x=' + 'a'.repeat(4096),
    '/api/state?offset=0', '/api/state?snapshot=x', '/api/history?period=live',
    '/api/history?offset=-1', '/api/history?offset=1e2', '/api/history?offset=4001',
    '/api/history?offset=01', '/api/history?offset=1.5', '/api/history?limit=0',
    '/api/history?limit=201', '/api/history?limit=100&limit=100', '/api/history?snapshot=',
    '/api/history?snapshot=../../file', '/healthz?apiToken=bad', '/app.js?token=bad'];
  for (const path of invalid) assert.equal((await fx.get(path)).status, 400, path.slice(0, 100));
  assert.equal(fx.starts, 0);
});

test('concurrent session scopes and history pagination are passed without shared selection', async (t) => {
  const seen = [];
  const fx = await fixture(t, { history: { snapshot: async (scope, options) => {
    seen.push({ scope, options });
    return { ...snapshot(scope), pagination: { snapshotId: 'immutable_1', offset: options.offset ?? 0 } };
  } } });
  const a = sessionKey('claude', 'same');
  const b = sessionKey('codex', 'same');
  const [left, right] = await Promise.all([fx.get(`/api/state?session=${a}`), fx.get(`/api/state?session=${b}&includeChildren=1`)]);
  assert.equal(JSON.parse(left.text).requests[0].key, a);
  assert.equal(JSON.parse(right.text).requests[0].key, b);
  assert.equal(JSON.parse(left.text).scope.includeChildren, false);
  assert.equal(JSON.parse(right.text).scope.includeChildren, true);
  assert.equal(fx.starts, 1);
  const listed = JSON.parse((await fx.get('/api/sessions')).text);
  assert.deepEqual(Object.keys(listed).sort(), ['apiVersion', 'connection', 'coverage', 'generation', 'instanceId', 'revision', 'sessions', 'unknownRequests']);
  assert.equal((await fx.get('/api/state?period=7d&session=unknown')).status, 200);
  assert.equal((await fx.get('/api/history?period=30d&offset=2&limit=5&snapshot=immutable_1')).status, 200);
  assert.equal(seen[0].scope.kind, 'unknown');
  assert.equal(seen[0].scope.period, '7d');
  assert.equal(seen[1].options.offset, 2);
  assert.equal(seen[1].options.limit, 5);
  assert.equal(seen[1].options.snapshotId, 'immutable_1');
  assert(seen[1].options.signal instanceof AbortSignal);
});

test('installation is checked again after async work and errors never echo raw data', async (t) => {
  let allowed = true;
  let revoked = 0;
  const fx = await fixture(t, { authorizeInstallation: async () => allowed,
    history: { snapshot: async (scope) => { allowed = false; return { ...snapshot(scope), secret: 'do not expose' }; } },
    stop: () => { revoked += 1; } });
  const res = await fx.get('/api/history');
  assert.equal(res.status, 403);
  assert.equal(JSON.parse(res.text).error.code, 'installation_revoked');
  assert(!res.text.includes('do not expose'));
  assert.equal(revoked, 1);
  for (const failure of [new Error('Authorization: Bearer SECRET /home/private'),
    new ApiError(200, 'invalid_query', 'SECRET'), new ApiError(401, 'unrecognized', 'SECRET')]) {
    const failing = await fixture(t, { aggregator: { snapshot() { throw failure; } } });
    const reply = await failing.get('/api/state');
    assert.equal(reply.status, failure.code === 'invalid_query' ? 400 : 503);
    assert(!reply.text.includes('SECRET'));
  }
});

test('missing, throwing, or nonboolean authorization fails closed without collector start', async (t) => {
  for (const authorizeInstallation of [async () => false, async () => ({ enabled: true }), async () => { throw new Error('secret'); }]) {
    const fx = await fixture(t, { authorizeInstallation });
    assert.equal((await fx.get('/api/state')).status, 403);
    assert.equal(fx.starts, 0);
  }
});

test('nonce ownership proof is domain separated, fresh and never starts collection', async (t) => {
  const fx = await fixture(t);
  const nonce = randomBytes(32).toString('base64url');
  const res = await call(fx.config, `/ownership?nonce=${nonce}`);
  const payload = JSON.parse(res.text);
  assert.equal(res.status, 200);
  assert(verifyOwnershipProof(fx.config, nonce, payload));
  assert.equal(payload.proof, ownershipProof(fx.config, nonce));
  assert(!verifyOwnershipProof(fx.config, randomBytes(32).toString('base64url'), payload));
  assert(!verifyOwnershipProof({ ...fx.config, installationId: randomBytes(16).toString('base64url') }, nonce, payload));
  assert(!verifyOwnershipProof({ ...fx.config, apiToken: randomBytes(32).toString('base64url') }, nonce, payload));
  assert(!verifyOwnershipProof(fx.config, nonce, { ...payload, apiVersion: 2 }));
  assert(!res.text.includes(fx.config.apiToken));
  assert(!res.text.includes(fx.config.installationId));
  assert.equal((await call(fx.config, `/ownership?nonce=${nonce}`, { headers: { Origin: 'null' } })).status, 403);
  for (const query of ['', '?nonce=bad', `?nonce=${nonce}&nonce=${nonce}`, `?nonce=${nonce}&token=bad`]) {
    assert.equal((await call(fx.config, `/ownership${query}`)).status, 400);
  }
  assert.equal(fx.starts, 0);
});

test('collector startup is single-flight and async rejection is contained', async (t) => {
  let attempts = 0;
  let release;
  const pending = new Promise((resolve) => { release = resolve; });
  const fx = await fixture(t, { startCollector: async () => { attempts += 1; await pending; } });
  const responses = [fx.get('/api/state'), fx.get('/api/sessions')];
  release();
  assert.deepEqual((await Promise.all(responses)).map((res) => res.status), [200, 200]);
  assert.equal(attempts, 1);
  const failed = await fixture(t, { startCollector: async () => { throw new Error('SECRET'); } });
  const res = await failed.get('/api/state');
  assert.equal(res.status, 503);
  assert(!res.text.includes('SECRET'));
});

test('timeouts abort history; concurrency and response size are bounded', async (t) => {
  let started;
  let signal;
  const begun = new Promise((resolve) => { started = resolve; });
  const fx = await fixture(t, { maxConcurrent: 1, requestTimeoutMs: 100,
    history: { snapshot: (_scope, options) => {
      signal = options.signal;
      started();
      return new Promise((_resolve, reject) => options.signal.addEventListener('abort', () => reject(new Error('aborted')), { once: true }));
    } } });
  const first = fx.get('/api/history');
  await begun;
  assert.equal((await fx.get('/api/state')).status, 429);
  assert.equal((await first).status, 503);
  assert(signal.aborted);
  assert.equal((await fx.get('/api/state')).status, 200);
  const huge = await fixture(t, { maxResponseBytes: 2048, aggregator: { snapshot: () => ({ value: 'x'.repeat(2049) }) } });
  assert.equal((await huge.get('/api/state')).status, 503);
});

// Tiny in-memory writes exercise HTTP response backpressure without filling a
// real socket or relying on platform-specific TCP buffer sizes.
class HeldResponse extends Writable {
  constructor() {
    super({ highWaterMark: 1 });
    this.headers = {};
    this.headersSent = false;
    this.body = '';
    this.queued = new Promise((resolve) => { this.didQueue = resolve; });
  }
  setHeader(name, value) { this.headers[name.toLowerCase()] = value; }
  _write(chunk, _encoding, done) {
    this.headersSent = true;
    this.body += chunk.toString();
    this.releaseWrite = done;
    this.didQueue();
  }
  _final(done) {
    if (this.headersSent) { done(); return; }
    this.headersSent = true;
    this.releaseWrite = done;
    this.didQueue();
  }
  flush() { const done = this.releaseWrite; this.releaseWrite = null; done?.(); }
}

function eventWithin(emitter, name) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => { emitter.off(name, done); reject(new Error(`Missing ${name} event`)); }, 2000);
    function done() { clearTimeout(timer); resolve(); }
    emitter.once(name, done);
  });
}

async function heldFixture(t, overrides = {}) {
  const config = { provisioned: true, host: '127.0.0.1', port: 3496,
    installationId: randomBytes(16).toString('base64url'), apiToken: randomBytes(32).toString('base64url') };
  const transport = new EventEmitter();
  let dispatch;
  transport.setTimeout = () => {};
  transport.listen = () => queueMicrotask(() => transport.emit('listening'));
  transport.close = (done) => done();
  transport.address = () => ({ address: config.host, port: config.port });
  const responses = [];
  const server = createServer({ config, aggregator: { snapshot }, authorizeInstallation: async () => true,
    loadStatic: async () => Buffer.from('small asset'), maxConcurrent: 1,
    createHttpServer: (_options, listener) => { dispatch = listener; return transport; }, ...overrides });
  t.after(async () => { for (const response of responses) response.destroy(); await server.stop(); });
  await server.listen();
  return { server, send(path, { method = 'GET', headers = {} } = {}) {
    const fields = { host: `127.0.0.1:${config.port}`, ...headers };
    const response = new HeldResponse();
    responses.push(response);
    dispatch({ url: path, method, headers: fields, rawHeaders: Object.entries(fields).flat(), resume() {} }, response);
    return response;
  } };
}

test('admission includes queued writes and bounds backpressured rejection responses', async (t) => {
  // Invalid requests and preflights must use the same budget as public assets.
  for (const [path, options, status] of [
    ['/app.js', {}, 200], ['/missing', {}, 404],
    ['/api/state', { method: 'OPTIONS', headers: { origin: 'null',
      'access-control-request-method': 'GET', 'access-control-request-headers': 'authorization' } }, 204],
  ]) {
    const fx = await heldFixture(t);
    const first = fx.send(path, options);
    await first.queued;
    await nextTurn(); // let the handler's finally run, not the pending write
    assert.equal(first.statusCode, status);
    assert.equal(first.writableEnded, true);
    assert.equal(first.writableFinished, false);
    const rejected = fx.send('/healthz');
    await rejected.queued;
    assert.equal(rejected.statusCode, 429);
    assert.equal(rejected.headers.connection, 'close');
    const excess = fx.send('/healthz');
    await nextTurn();
    assert.equal(excess.destroyed, true, 'a full rejection budget must not queue another body');
    assert.equal(excess.body, '');
    const completed = eventWithin(first, 'finish');
    first.flush();
    await completed;
    const admitted = fx.send('/healthz');
    await admitted.queued;
    assert.equal(admitted.statusCode, 200, 'finish releases the admission slot');
    const closed = eventWithin(admitted, 'close');
    admitted.destroy();
    await closed;
    const afterClose = fx.send('/healthz');
    await afterClose.queued;
    assert.equal(afterClose.statusCode, 200, 'close also releases the admission slot');
  }
});

test('queued writes retain their deadline and timeout error writes have a bounded drain', async (t) => {
  const fx = await heldFixture(t, { requestTimeoutMs: 20, responseDrainMs: 20 });
  const held = fx.send('/app.js');
  const closed = eventWithin(held, 'close');
  await held.queued;
  await closed;
  assert.equal(held.destroyed, true, 'end must not cancel the write deadline');
  const next = fx.send('/healthz');
  await next.queued;
  assert.equal(next.statusCode, 200);

  const slow = await heldFixture(t, { requestTimeoutMs: 20, responseDrainMs: 20,
    loadStatic: () => new Promise(() => {}) });
  const waiting = slow.send('/app.js');
  const timedOut = eventWithin(waiting, 'close');
  await waiting.queued;
  assert.equal(waiting.statusCode, 503);
  await timedOut;
  assert.equal(waiting.destroyed, true, 'even a timeout error cannot stay buffered forever');
});

test('backpressured 429 writes expire independently of the admitted request deadline', async (t) => {
  const fx = await heldFixture(t, { requestTimeoutMs: 10_000, responseDrainMs: 20 });
  const first = fx.send('/app.js');
  await first.queued;
  const rejected = fx.send('/healthz');
  const closed = eventWithin(rejected, 'close');
  await rejected.queued;
  assert.equal(rejected.statusCode, 429);
  await closed;
  const retry = fx.send('/healthz');
  await retry.queued;
  assert.equal(retry.statusCode, 429, 'expired rejection releases only the rejection slot');
});

test('work created just before cancellation always has its rejection consumed', async (t) => {
  const work = Promise.reject(new Error('synthetic cancellation rejection'));
  const then = work.then.bind(work);
  // Observe it independently so the regression asserts handling, not a process
  // crash or node:test's unhandled-rejection machinery.
  then(undefined, () => {});
  let rejectionObservers = 0;
  work.then = (resolve, reject) => {
    if (typeof reject === 'function') rejectionObservers += 1;
    return then(resolve, reject);
  };
  const fx = await heldFixture(t, { loadStatic: () => { fx.server.revoke(); return work; } });
  const response = fx.send('/app.js');
  await response.queued;
  assert.equal(response.statusCode, 503);
  assert.equal(rejectionObservers, 1);
});

test('bind is exclusive, stop is idempotent, and address reports actual loopback listener', async (t) => {
  let bindings = 0;
  const fx = await fixture(t, { createHttpServer: (...args) => {
    const server = httpServer(...args);
    const listen = server.listen.bind(server);
    server.listen = (options) => { bindings += 1; assert.equal(options.exclusive, true); assert.equal(options.host, '127.0.0.1'); return listen(options); };
    return server;
  } });
  await Promise.all([fx.server.listen(), fx.server.listen()]);
  assert.equal(bindings, 1);
  assert.equal(fx.server.address().address, '127.0.0.1');
  assert.equal(fx.server.address().port, fx.config.port);
  const other = createServer({ config: fx.config });
  t.after(() => other.stop());
  await assert.rejects(other.listen(), { code: 'EADDRINUSE' });
  await Promise.all([fx.server.stop(), fx.server.stop()]);
  assert.equal(fx.server.address(), null);
  await other.listen();
  assert.equal(other.listening, true);
  await assert.rejects(fx.server.listen());
});

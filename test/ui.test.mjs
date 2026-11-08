import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { webcrypto } from 'node:crypto';
import vm from 'node:vm';

const root = new URL('../', import.meta.url);
const [appSource, bridgeSource, bootSource] = await Promise.all(['ui/app.js', 'ui/bridge.js', 'page/boot.js'].map(path => readFile(new URL(path, root), 'utf8')));
const context = vm.createContext({ window: {}, document: { getElementById: () => null }, URLSearchParams,
  AbortController, setTimeout, clearTimeout });
vm.runInContext(appSource, context);
const ui = context.window.SessionRouting;
const plain = value => JSON.parse(JSON.stringify(value));
const tick = () => new Promise(resolve => setImmediate(resolve));
const credentials = { apiToken: 'A'.repeat(43), installationId: 'A'.repeat(22) };
const apiError = (status, code) => Object.assign(new Error('test'), { status, code });
const row = (key, session = 'A') => ({ key, session, sessionKey: session, candidates: [], attempts: [] });
function snapshot(scope, changes = {}) {
  return { apiVersion: 1, instanceId: 'instance', generation: 1, revision: 1, scope: plain(scope),
    connection: { status: 'live', lastUpdated: '2026-11-06T12:00:00Z', reason: null },
    coverage: { source: scope.period === 'live' ? 'trace' : 'ledger', period: scope.period, label: 'Test coverage' },
    sessions: [], requests: [row('request-1', scope.sessionKey)], metrics: { requests: 1 }, ...changes };
}
function harness(options = {}) {
  const states = [], resets = [], statuses = [], notices = [], timers = new Map();
  let next = 0;
  const controller = ui.createController({ readOptions: async () => credentials,
    onState: value => states.push(plain(value)), onReset: value => resets.push(plain(value)),
    onStatus: value => statuses.push(value), onNotice: value => notices.push(value),
    setTimer(fn, delay) { const key = ++next; timers.set(key, { fn: () => { timers.delete(key); fn(); }, delay }); return key; },
    clearTimer(key) { timers.delete(key); }, ...options });
  return { controller, states, resets, statuses, notices, timers };
}

test('scope encoding is exact, direct by default and uses only relative API URLs', () => {
  assert.deepEqual(plain(ui.makeScope()), { kind: 'all', sessionKey: null, period: 'live', includeChildren: false });
  const selected = ui.makeScope('Case_Sensitive', '7d', true);
  assert.equal(ui.queryFor(selected), 'api/history?period=7d&includeChildren=1&session=Case_Sensitive&limit=100');
  assert.equal(ui.queryFor(ui.makeScope('unknown', 'live', true)), 'api/state?period=live&includeChildren=0&session=unknown');
  assert.equal(ui.makeScope('', 'today', true).includeChildren, false);
  assert.equal(ui.scopeEquals(selected, ui.makeScope('case_sensitive', '7d', true)), false);
  assert.equal(ui.queryFor(selected, { snapshotId: 's1', nextOffset: 100 }).endsWith('&snapshot=s1&offset=100'), true);
});

test('unknown measurements stay unknown; recorded zero stays zero', () => {
  for (const value of [null, undefined, NaN, Infinity, -1, '0']) {
    assert.equal(ui.number(value), '—'); assert.equal(ui.money(value), '—'); assert.equal(ui.duration(value), '—');
  }
  assert.equal(ui.number(0), '0'); assert.equal(ui.money(0), '$0.00');
  assert.equal(ui.duration(1250), '1.25 s'); assert.equal(ui.duration(125), '125 ms');
});

test('picker sorts active first and searches reliable display metadata without changing selection', () => {
  const sessions = [
    { key: 'b', agent: 'codex', displayId: 'same-id', lastActivity: '2026-11-06T13:00:00Z', activeRequests: 0 },
    { key: 'a', agent: 'claude-code', displayId: 'same-id', lastActivity: '2026-11-06T11:00:00Z', activeRequests: 2, folder: '/sample/project' },
    { key: 'c', agent: 'claude-code', displayId: 'long-session', lastActivity: '2026-11-06T14:00:00Z', activeRequests: 1 },
  ];
  assert.deepEqual(plain(ui.selectSessions(sessions).map(value => value.key)), ['c', 'a', 'b']);
  assert.deepEqual(plain(ui.selectSessions(sessions, ' CODEX ').map(value => value.key)), ['b']);
  assert.deepEqual(plain(ui.selectSessions(sessions, 'project').map(value => value.key)), ['a']);
  assert.deepEqual(plain(ui.selectSessions(sessions, 'missing', true, 'b').map(value => value.key)), ['b']);
});

test('selected session metadata follows direct-only scope, not all-actor discovery', () => {
  const session = { key: 'parent', activeRequests: 1, requestCount: 2, lastModel: 'worker-model', lastProvider: 'worker-provider' };
  const data = snapshot(ui.makeScope('parent'), { metrics: { requests: 1, inFlight: 0 }, requests: [{
    key: 'parent-request', time: '2026-11-06T12:00:00Z', model: 'parent-model', provider: 'parent-provider', reasons: [],
  }] });
  const selected = ui.selectedSummary(session, data);
  assert.equal(selected.activeRequests, 0); assert.equal(selected.requestCount, 1);
  assert.equal(selected.lastModel, 'parent-model'); assert.equal(selected.lastProvider, 'parent-provider');
  assert.equal(ui.selectedSummary(session, snapshot(ui.makeScope('other'))), null);
  assert.equal(session.activeRequests, 1, 'discovery itself is not mutated');
});

test('billable orphan evidence is not labelled as another request', () => {
  assert.equal(ui.requestName({ id: 888, reasons: ['handed_on_only'] }), 'Billable attempt for request 888');
  assert.equal(ui.requestName({ id: 888, reasons: [] }), 'Request 888');
  assert.equal(ui.attemptEvidence({ reasons: [] }), false);
});

test('sandbox storage failures fall back to frame-local selection without credentials', () => {
  const blocked = ui.selectionStore(() => { throw new Error('SecurityError'); });
  assert.equal(blocked.read(), ''); blocked.write('A'); assert.equal(blocked.available, false);
  let stored = '';
  const available = ui.selectionStore(() => ({ getItem: () => stored, setItem: (_key, value) => { stored = value; } }));
  available.write('A'); assert.equal(available.read(), 'A'); assert.deepEqual(JSON.parse(stored), { selection: 'A' });
  stored = '{"selection":"<img>"}'; assert.equal(available.read(), '');
});

test('rejects noncanonical credentials and mismatched, duplicate or malformed snapshots', () => {
  assert.equal(ui.validOptions(credentials), true);
  assert.equal(ui.validOptions({ ...credentials, apiToken: 'B'.repeat(43) }), false);
  assert.equal(ui.validOptions({ ...credentials, installationId: 'B'.repeat(22) }), false);
  const scope = ui.makeScope('A');
  assert.equal(ui.validateSnapshot(snapshot(scope), scope).apiVersion, 1);
  for (const data of [snapshot(ui.makeScope('B')), snapshot(scope, { apiVersion: 2 }), snapshot(scope, { requests: [row('x'), row('x')] }), snapshot(scope, { requests: [{}] })]) {
    assert.throws(() => ui.validateSnapshot(data, scope), /Invalid snapshot/);
  }
});

test('scope change clears old content immediately and late A cannot repaint B even if abort is ignored', async () => {
  const calls = [];
  const h = harness({ initialScope: ui.makeScope('A'), request(path, options) {
    return new Promise(resolve => calls.push({ path, ...options, resolve }));
  } });
  h.controller.refresh(); await tick();
  assert.equal(calls.length, 1);
  h.controller.setScope(ui.makeScope('B'));
  assert.equal(h.resets.at(-1).sessionKey, 'B'); assert.equal(calls[0].signal.aborted, true);
  await tick(); assert.equal(calls.length, 1, 'new scope waits for the old promise to settle');
  calls[0].resolve(snapshot(ui.makeScope('A'))); await tick();
  assert.equal(h.states.length, 0); assert.equal(calls.length, 2);
  calls[1].resolve(snapshot(ui.makeScope('B'))); await tick();
  assert.equal(h.states.length, 1); assert.equal(h.states[0].scope.sessionKey, 'B'); h.controller.stop();
});

test('refresh and poll requests never overlap and queued refreshes coalesce', async () => {
  const calls = [];
  const h = harness({ request: () => new Promise(resolve => calls.push(resolve)) });
  h.controller.refresh(); await tick();
  h.controller.refresh(); h.controller.refresh(); h.controller.refresh();
  assert.equal(calls.length, 1);
  calls[0](snapshot(ui.makeScope())); await tick(); assert.equal(calls.length, 2);
  calls[1](snapshot(ui.makeScope())); await tick();
  assert.equal(h.timers.size, 1); assert.equal([...h.timers.values()][0].delay, 1000); h.controller.stop();
  assert.equal(h.timers.size, 0);
});

test('parent/document hiding aborts polling and resuming revalidates the same scope', async () => {
  const calls = [];
  const h = harness({ initialScope: ui.makeScope('A'), request: (_path, options) => new Promise(resolve => calls.push({ ...options, resolve })) });
  h.controller.refresh(); await tick(); h.controller.setVisible(false);
  assert.equal(calls[0].signal.aborted, true); assert.equal(h.statuses.at(-1).status, 'paused');
  calls[0].resolve(snapshot(ui.makeScope('A'))); await tick();
  assert.equal(h.states.length, 0); assert.equal(h.timers.size, 0);
  h.controller.setVisible(true); await tick(); assert.equal(calls.length, 2);
  calls[1].resolve(snapshot(ui.makeScope('A'))); await tick();
  assert.equal(h.states[0].scope.sessionKey, 'A'); h.controller.stop();
});

test('401 re-reads authoritative options once, never writes or rotates them', async () => {
  let reads = 0;
  const tokens = [];
  const nextToken = `${'C'.repeat(42)}A`;
  const h = harness({ readOptions: async () => ({ ...credentials, apiToken: ++reads === 1 ? credentials.apiToken : nextToken }),
    async request(_path, { token }) { tokens.push(token); if (tokens.length === 1) throw apiError(401, 'unauthorized'); return snapshot(ui.makeScope()); } });
  await h.controller.refresh();
  assert.equal(reads, 2); assert.deepEqual(tokens, [credentials.apiToken, nextToken]); assert.equal(h.states.length, 1); h.controller.stop();
});

test('repeated 401 fails closed, erases snapshot and stops automatic retries', async () => {
  let calls = 0;
  const h = harness({ request: async () => { calls++; throw apiError(401, 'unauthorized'); } });
  await h.controller.refresh(); assert.equal(calls, 2); assert.equal(h.controller.snapshot, null);
  assert.equal(h.statuses.findLast(value => value.status)?.status, 'stopped'); assert.equal(h.timers.size, 0); h.controller.stop();
});

test('revocation clears sensitive cached data, but transient failure only marks it stale', async () => {
  let failure = null;
  const h = harness({ initialScope: ui.makeScope('A'), request: async () => { if (failure) throw failure; return snapshot(ui.makeScope('A')); } });
  await h.controller.refresh(); failure = new Error('network'); await h.controller.refresh();
  assert.equal(h.controller.snapshot.scope.sessionKey, 'A'); assert.equal(h.controller.scope.sessionKey, 'A');
  assert.equal(h.statuses.findLast(value => value.status).status, 'stale');
  assert.equal(h.statuses.findLast(value => value.status).lastUpdated, '2026-11-06T12:00:00Z');
  failure = apiError(403, 'installation_revoked'); await h.controller.refresh();
  assert.equal(h.controller.snapshot, null); assert.equal(h.timers.size, 0); h.controller.stop();
});

test('empty/stale session lists never implicitly expire a selection; authoritative 410 does', async () => {
  let expired = false;
  const h = harness({ initialScope: ui.makeScope('A'), request: async path => {
    const selected = new URL(path, 'https://fixture.invalid/').searchParams.get('session');
    if (expired && selected) throw apiError(410, 'session_expired');
    return snapshot(ui.makeScope(selected), { sessions: [], connection: { status: path.startsWith('api/sessions') ? 'live' : 'stale' } });
  } });
  await h.controller.refresh(); assert.equal(h.controller.scope.sessionKey, 'A');
  expired = true; await h.controller.refresh(); await tick();
  assert.equal(h.controller.scope.kind, 'all'); assert.equal(h.states.at(-1).scope.kind, 'all');
  assert.match(h.notices[0], /Returned to All/); h.controller.stop();
});

test('410 while discovery is starting does not expire a saved session', async () => {
  const h = harness({ initialScope: ui.makeScope('A'), request: async path => {
    if (path.startsWith('api/state')) throw apiError(410, 'session_expired');
    return { apiVersion: 1, connection: { status: 'starting' }, sessions: [] };
  } });
  await h.controller.refresh();
  assert.equal(h.controller.scope.sessionKey, 'A'); assert.equal(h.resets.length, 0);
  assert.equal(h.notices.length, 0); assert.equal(h.statuses.findLast(value => value.status).status, 'stale'); h.controller.stop();
});

test('history pagination keeps snapshot identity and full-scope metrics, then expiry resets it', async () => {
  const scope = ui.makeScope('A', 'today');
  const paths = [];
  let expire = false;
  const h = harness({ initialScope: scope, request: async path => {
    paths.push(path); const params = new URL(path, 'https://fixture.invalid/').searchParams;
    const offset = Number(params.get('offset') || 0);
    if (expire && offset) throw apiError(409, 'history_expired');
    return snapshot(scope, { requests: [row(`request-${offset}`)], metrics: { requests: 20 },
      pagination: { snapshotId: 'immutable', offset, nextOffset: offset ? null : 100, total: 20, limit: 100 } });
  } });
  await h.controller.refresh(); assert.equal(h.timers.size, 1, 'history schedules a cheap connection/access heartbeat, not another ledger scan');
  await h.controller.loadMore(); assert.match(paths[1], /snapshot=immutable&offset=100/);
  assert.equal(h.controller.snapshot.requests.length, 2); assert.equal(h.controller.snapshot.metrics.requests, 20);
  await h.controller.refresh(); expire = true; await h.controller.loadMore(); await tick();
  assert.equal(h.controller.snapshot.requests.length, 1); assert.match(h.notices[0], /Pagination was reset/); h.controller.stop();
});

test('history heartbeat checks current connection and revocation without rescanning or changing the snapshot', async () => {
  const scope = ui.makeScope('A', 'today');
  const paths = []; let revoked = false;
  const h = harness({ initialScope: scope, request: async path => {
    paths.push(path);
    if (path.startsWith('api/sessions')) {
      if (revoked) throw apiError(403, 'installation_revoked');
      return { apiVersion: 1, connection: { status: 'stale', reason: 'gateway_unavailable' } };
    }
    return snapshot(scope);
  } });
  await h.controller.refresh();
  [...h.timers.values()][0].fn(); await tick();
  assert.equal(paths[1], 'api/sessions?period=live&includeChildren=0');
  assert.equal(h.states.length, 1); assert.equal(h.controller.snapshot.scope.period, 'today');
  assert.equal(h.statuses.findLast(value => value.status).status, 'stale');
  revoked = true; [...h.timers.values()].at(-1).fn(); await tick();
  assert.equal(h.controller.snapshot, null); assert.equal(h.statuses.findLast(value => value.status).status, 'stopped');
  h.controller.stop();
});

test('history visibility resume preserves loaded pages and only rechecks access', async () => {
  const scope = ui.makeScope('A', 'today'), paths = [];
  const h = harness({ initialScope: scope, request: async path => {
    paths.push(path);
    if (path.startsWith('api/sessions')) return { apiVersion: 1, instanceId: 'instance', connection: { status: 'live' } };
    const offset = Number(new URL(path, 'https://fixture.invalid').searchParams.get('offset') || 0);
    return snapshot(scope, { requests: [row(`row-${offset}`)], pagination: { snapshotId: 'fixed', offset,
      nextOffset: offset ? null : 100, total: 2, limit: 100 } });
  } });
  await h.controller.refresh(); await h.controller.loadMore();
  h.controller.setVisible(false); await h.controller.setVisible(true);
  assert.equal(h.controller.snapshot.requests.length, 2);
  assert.equal(paths.at(-1), 'api/sessions?period=live&includeChildren=0');
  assert.equal(paths.filter(path => path.startsWith('api/history')).length, 2);
  h.controller.stop();
});

test('history heartbeat resets stale interaction state on backend replacement', async () => {
  const scope = ui.makeScope('A', 'today');
  const h = harness({ initialScope: scope, request: async path => path.startsWith('api/sessions') ?
    { apiVersion: 1, instanceId: 'replacement', connection: { status: 'live' } } : snapshot(scope) });
  await h.controller.refresh(); [...h.timers.values()][0].fn(); await tick();
  assert.equal(h.resets.length, 1); assert.match(h.notices[0], /backend restarted/i);
  h.controller.stop();
});

function bridgeHarness() {
  const sent = [], events = {}, properties = {};
  const parent = { postMessage(message, target) { sent.push({ message, target }); } };
  const document = { documentElement: { dataset: {}, style: { setProperty(name, value) { properties[name] = value; } } } };
  const sandbox = { window: {}, parent, document, crypto: webcrypto, URL,
    location: { href: 'https://magpie.invalid/_magpie/plugin/test/_magpie/service/' }, setTimeout, clearTimeout,
    addEventListener(name, fn) { events[name] = fn; } };
  vm.runInNewContext(bridgeSource, sandbox);
  const reply = (message, source = parent) => events.message({ source, data: { magpie: 1, ...message } });
  return { api: sandbox.window.magpie, sent, reply, parent, document, properties };
}

test('service bridge checks parent source, preserves service root and never echoes raw errors', async () => {
  const h = bridgeHarness(); const hello = h.sent[0].message;
  h.reply({ id: hello.id, result: { dark: true, visible: true, service: '../wrong/', tokens: { bg: '#123456', evil: 'x' } } }, {});
  assert.equal(h.api.theme, null);
  h.reply({ id: hello.id, result: { dark: true, visible: true, service: '../wrong/', tokens: { bg: '#123456', evil: 'x' } } });
  await h.api.ready;
  assert.equal(h.api.service, 'https://magpie.invalid/_magpie/plugin/test/_magpie/service/');
  assert.equal(h.document.documentElement.dataset.theme, 'dark'); assert.equal(h.properties['--magpie-bg'], '#123456');
  assert.equal(h.properties['--magpie-evil'], undefined);
  let visible; h.api.onVisibility(value => { visible = value; });
  h.reply({ event: 'visibility', data: { visible: false } }, {}); assert.equal(visible, undefined);
  h.reply({ event: 'visibility', data: { visible: false } }); assert.equal(visible, false);
  const options = h.api.options.get(); const call = h.sent.at(-1).message;
  h.reply({ id: call.id, error: 'secret-token should not appear' });
  await assert.rejects(options, error => error.message === 'Magpie refused the page bridge request.');
});

test('a rejected service handshake can be retried without reloading or leaking credentials', async () => {
  const h = bridgeHarness();
  const initial = h.sent[0].message;
  h.reply({ id: initial.id, error: 'temporary bridge failure' });
  await assert.rejects(h.api.ready);
  const retried = h.api.reconnect();
  const hello = h.sent.at(-1).message;
  assert.notEqual(hello.id, initial.id); assert.equal(hello.method, 'hello');
  h.reply({ id: hello.id, result: { dark: false, visible: true, tokens: {} } });
  assert.equal((await retried).visible, true);
});

function launcherHarness({ options = { port: 3496, showFolders: true }, service, filename = 'index.html', set } = {}) {
  const elements = new Map(['launch-status', 'launch-retry', 'launch-setup'].map(id => [id, { hidden: true, textContent: '', events: {}, addEventListener(name, fn) { this.events[name] = fn; } }]));
  const href = `https://magpie.invalid/_magpie/plugin/test/${filename}`;
  let stored = options, writes = 0, navigated = null;
  const bridge = { ready: Promise.resolve(), service: service ?? 'https://magpie.invalid/_magpie/plugin/test/_magpie/service/',
    options: { get: async () => stored, set: async value => { writes++; stored = set ? await set(value) : value; return stored; } } };
  const sandbox = { window: { magpie: bridge, parent: {} }, document: { getElementById: id => elements.get(id) },
    crypto: webcrypto, btoa, URL, setTimeout, clearTimeout,
    location: { href, pathname: new URL(href).pathname, replace(value) { navigated = value; } } };
  vm.runInNewContext(bootSource, sandbox);
  return { elements, get writes() { return writes; }, get options() { return stored; }, get navigated() { return navigated; },
    click: name => elements.get(name).events.click() };
}

test('launcher provisions only on explicit setup, preserves options and navigates without the API token', async () => {
  const h = launcherHarness(); await tick();
  assert.equal(h.writes, 0); assert.equal(h.navigated, null); assert.equal(h.elements.get('launch-setup').hidden, false);
  await h.click('launch-setup');
  assert.equal(h.writes, 1); assert.equal(h.options.port, 3496); assert.equal(h.options.showFolders, true);
  assert.equal(ui.validOptions(h.options), true);
  assert.equal(h.navigated, 'https://magpie.invalid/_magpie/plugin/test/_magpie/service/');
  assert(!h.navigated.includes(h.options.apiToken));
});

test('provisioned launcher supports root and nested entry documents without another options write', async () => {
  for (const filename of ['index.html', 'page/index.html']) {
    const h = launcherHarness({ options: credentials, filename }); await tick();
    assert.equal(h.writes, 0); assert.equal(h.navigated, 'https://magpie.invalid/_magpie/plugin/test/_magpie/service/');
  }
});

test('launcher rejects missing service, cross-origin fallback and partial credentials without rotation', async () => {
  for (const service of ['', 'http://127.0.0.1:3496/', 'https://magpie.invalid/_magpie/plugin/other/_magpie/service/']) {
    const h = launcherHarness({ options: credentials, service }); await tick();
    assert.equal(h.navigated, null); assert.equal(h.writes, 0); assert.equal(h.elements.get('launch-retry').hidden, false);
  }
  const h = launcherHarness({ options: { apiToken: credentials.apiToken } }); await tick(); await h.click('launch-retry');
  assert.equal(h.writes, 0); assert.equal(h.navigated, null); assert.match(h.elements.get('launch-status').textContent, /never silently replaced/);
});

test('a concurrent setup winner is authoritative rather than the locally generated token', async () => {
  const h = launcherHarness({ set: async () => ({ ...credentials, port: 3500 }) }); await tick(); await h.click('launch-setup');
  assert.equal(h.writes, 1); assert.equal(h.options.apiToken, credentials.apiToken); assert(h.navigated);
});

test('fallback text and status markers meet contrast in both selected themes', () => {
  const luminance = hex => {
    const rgb = [1, 3, 5].map(offset => parseInt(hex.slice(offset, offset + 2), 16) / 255)
      .map(value => value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4);
    return rgb[0] * 0.2126 + rgb[1] * 0.7152 + rgb[2] * 0.0722;
  };
  const contrast = (a, b) => (Math.max(luminance(a), luminance(b)) + 0.05) / (Math.min(luminance(a), luminance(b)) + 0.05);
  for (const theme of [
    { surfaces: ['#fcfcfb', '#ffffff'], text: ['#0b0b0b', '#52514e'], marks: ['#16723f', '#b83131', '#8a5900', '#4f46e5'] },
    { surfaces: ['#1a1a19', '#242423'], text: ['#f0efec', '#c3c2b7'], marks: ['#6fd99b', '#f28b82', '#f2b544', '#a5b4fc'] },
  ]) for (const surface of theme.surfaces) {
    for (const color of theme.text) assert(contrast(color, surface) >= 4.5, `${color} text on ${surface}`);
    for (const color of theme.marks) assert(contrast(color, surface) >= 3, `${color} mark on ${surface}`);
  }
});

const candidate = (key = 'seat', changes = {}) => ({ key, provider: 'provider', label: 'Key 1', model: 'model', state: 'candidate', ...changes });
const attempt = (index = 1, candidateKey = 'seat', changes = {}) => ({ index, candidateKey, outcome: 'in-flight', transition: index === 1 ? 'initial' : 'retry', ...changes });
const route = (key, changes = {}) => ({ ...row(key), time: '2026-11-06T12:00:00Z', outcome: 'in-flight',
  candidates: [candidate()], attempts: [attempt()], ...changes });
const sceneData = (requests, changes = {}) => snapshot(ui.makeScope(), { requests, ...changes });

test('scene retains concurrent request-qualified routes despite identical labels and candidate IDs', () => {
  const data = sceneData([route('request:a'), route('request:b')]);
  const before = plain(data), scene = ui.projectScene(data);
  assert.equal(scene.sources.length, 2); assert.equal(scene.destinations.length, 2);
  assert.equal(new Set(scene.destinations.map(item => item.key)).size, 2);
  assert.notEqual(ui.sceneKey('a,b', 'c'), ui.sceneKey('a', 'b,c'));
  assert.deepEqual(plain(scene.destinations.map(item => item.requestKey)), ['request:a', 'request:b']);
  for (const item of scene.destinations) assert.equal(item.active, true);
  assert.deepEqual(plain(data), before, 'projection never mutates the input snapshot');
});

test('scene consumes only selected evidence, preserves unknown/child actor identity and never uses discovery routes', () => {
  const scope = ui.makeScope('A', 'live', true);
  const data = snapshot(scope, { sessions: [{ key: 'B', lastModel: 'not-in-scope' }], requests: [
    route('parent', { sessionKey: 'A' }), route('child', { sessionKey: 'child', parentSessionKey: 'A', isSubagent: true }),
  ] });
  const scene = ui.projectScene(ui.validateSnapshot(data, scope));
  assert.deepEqual(plain(scene.sources.map(item => item.key)), ['child', 'parent']);
  assert.equal(scene.sources.find(item => item.key === 'child').row.isSubagent, true);
  const unknown = ui.projectScene(snapshot(ui.makeScope('unknown'), { requests: [route('no-id', { sessionKey: null, session: null, agent: null })] }));
  assert.equal(unknown.sources[0].row.agent, null); assert.equal(unknown.sources[0].row.session, null);
  assert(!JSON.stringify(scene).includes('not-in-scope'));
});

test('scene caps active lanes/destinations, prioritizes every current match and counts omitted evidence', () => {
  const requests = Array.from({ length: 8 }, (_, index) => route(`r${index}`, {
    candidates: Array.from({ length: 20 }, (_, i) => candidate(`c${i}`)), attempts: [attempt(1, 'c19')],
  }));
  const scene = ui.projectScene(sceneData(requests));
  assert.equal(scene.sources.length, 6); assert.equal(scene.destinations.length, 12);
  assert.equal(scene.active, 8); assert.equal(scene.omittedActive, 2); assert.equal(scene.omittedRequests, 2);
  assert.equal(scene.omittedDestinations, 148); assert.equal(scene.omittedShownDestinations, 108);
  assert.equal(scene.destinations.filter(item => item.active).length, 6);
  assert(scene.destinations.slice(0, 6).every(item => item.candidate.key === 'c19'));
  const focused = ui.projectScene(sceneData(requests), { focusKey: 'r7' });
  assert.equal(focused.sources[0].key, 'r7'); assert.equal(focused.omittedActive, 7);
  assert.equal(focused.destinations[0].candidate.key, 'c19');
  assert.equal(ui.projectScene(sceneData(requests), { maxRequests: 999, maxDestinations: 999 }).sources.length, 6);
});

test('candidate order is current match, earlier attempts, then unattempted; state comes from actual attempts', () => {
  const record = route('r', { candidates: [candidate('never', { state: 'success' }), candidate('previous'), candidate('current')],
    attempts: [attempt(1, 'previous', { outcome: 'failed' }), attempt(2, 'previous', { outcome: 'failed' }),
      attempt(3, 'current', { transition: 'fallback' })] });
  const scene = ui.projectScene(sceneData([record]));
  assert.deepEqual(plain(scene.destinations.map(item => item.candidate.key)), ['current', 'previous', 'never']);
  assert.deepEqual(plain(scene.destinations.map(item => item.state)), ['attempting', 'failed', 'candidate']);
  assert.equal(scene.destinations[1].attempts.length, 2);
  assert.equal(scene.destinations[0].attempts[0].transition, 'fallback');
  const revised = ui.projectScene(sceneData([{ ...record, partial: true, updatedAt: '2026-11-06T12:01:00Z' }]));
  assert.deepEqual(plain(revised.destinations.map(item => item.key)), plain(scene.destinations.map(item => item.key)));
});

test('idle retains latest per session in All but only one latest route in a selected scope', () => {
  const records = [route('old-a', { outcome: 'success', time: '2026-11-05T12:00:00Z' }),
    route('new-a', { outcome: 'success' }), route('b', { outcome: 'failed', sessionKey: 'B' })];
  const data = sceneData(records);
  const scene = ui.projectScene(data);
  assert.equal(scene.mode, 'recent'); assert.equal(scene.active, 0);
  assert.deepEqual(plain(scene.sources.map(item => item.key)), ['b', 'new-a']);
  assert(scene.destinations.every(item => !item.active));
  const selected = ui.projectScene({ ...data, scope: ui.makeScope('A', 'live', true) });
  assert.equal(selected.sources.length, 1);
  const focused = ui.projectScene(data, { focusKey: 'old-a' });
  assert.equal(focused.sources[0].key, 'old-a'); assert.equal(focused.mode, 'focused');
  assert.equal(ui.projectScene(data, { focusKey: 'expired', replayIndex: 0 }).focusKey, null);
});

test('recorded replay shows only the attempt prefix, not later success or fallback; scope totals stay unchanged', () => {
  const data = sceneData([route('r', { candidates: [candidate('a', { state: 'failed' }), candidate('b', { state: 'success' })],
    outcome: 'success', attempts: [attempt(1, 'a', { outcome: 'failed' }), attempt(2, 'a', { outcome: 'failed' }),
      attempt(3, 'b', { outcome: 'success', transition: 'fallback' })] })]);
  const scene = ui.projectScene(data, { focusKey: 'r', replayIndex: 1 });
  assert.equal(scene.mode, 'replay'); assert.equal(scene.sources[0].attempts.length, 2);
  assert.deepEqual(plain(scene.destinations.map(item => item.state)), ['failed', 'candidate']);
  assert(scene.destinations.every(item => !item.active));
  assert.equal(data.requests[0].attempts.length, 3); assert.equal(data.metrics.requests, 1);
});

test('zero candidates, historical topology and orphan billing never create an eligible or active destination', () => {
  const waiting = ui.projectScene(sceneData([route('waiting', { candidates: [], attempts: [] })]));
  assert.equal(waiting.destinations[0].candidate, null); assert.match(waiting.destinations[0].message, /No candidates/);
  assert.equal(waiting.destinations[0].state, 'unavailable'); assert.equal(waiting.destinations[0].active, false);
  const history = ui.projectScene(snapshot(ui.makeScope('A', 'today'), { requests: [route('ledger', { outcome: 'success', candidates: [], attempts: [] })] }));
  assert.match(history.destinations[0].message, /Historical topology/);
  const orphan = ui.projectScene(sceneData([route('bill', { reasons: ['handed_on_only'] })]));
  assert.equal(orphan.sources[0].orphan, true); assert.equal(orphan.active, 0);
  assert.equal(orphan.destinations[0].candidate, null); assert.match(orphan.destinations[0].message, /Billable evidence only/);
  assert.equal(ui.projectScene(sceneData([])).sources.length, 0);
});

test('unmatched attempts stay explicit and cannot light a similarly labelled candidate', () => {
  const scene = ui.projectScene(sceneData([route('r', { candidates: [candidate('known')], attempts: [attempt(1, null)] })]));
  assert.equal(scene.unmatched, 1); assert.equal(scene.sources[0].unmatched, 1);
  assert.equal(scene.destinations[0].state, 'candidate'); assert.equal(scene.destinations[0].active, false);
  assert.equal(scene.destinations[0].attempts.length, 0);
});

test('motion starts with a baseline, sends once per new actual active attempt, never on revisions or outcomes', () => {
  let data = sceneData([route('r')]), motion = ui.advanceMotion(null, data);
  assert.equal(motion.enabled, true); assert.equal(motion.baseline, true); assert.equal(motion.flights.length, 0);
  motion = ui.advanceMotion(motion, { ...data, revision: 2 });
  assert.equal(motion.baseline, false); assert.equal(motion.flights.length, 0);
  data = sceneData([route('r', { attempts: [attempt(1, 'seat', { outcome: 'failed' }), attempt(2)] })]);
  motion = ui.advanceMotion(motion, data);
  assert.equal(motion.flights.length, 1); assert.equal(motion.flights[0].index, 2);
  const emitted = motion.flights[0].key;
  motion = ui.advanceMotion(motion, data); assert.equal(motion.flights.length, 0);
  data = sceneData([route('r', { outcome: 'success', attempts: [attempt(1, 'seat', { outcome: 'failed' }), attempt(2, 'seat', { outcome: 'success' })] })]);
  motion = ui.advanceMotion(motion, data); assert.equal(motion.flights.length, 0);
  data = sceneData([data.requests[0], route('other')]);
  motion = ui.advanceMotion(motion, data);
  assert.equal(motion.flights.length, 1); assert.notEqual(motion.flights[0].key, emitted);
  assert.equal(motion.flights[0].destinationKey, ui.sceneKey('other', 'seat'));
});

test('newly seen completed traffic is static; unmatched late joins and duplicate attempt indices never resend', () => {
  let motion = ui.advanceMotion(null, sceneData([]));
  motion = ui.advanceMotion(motion, sceneData([route('done', { outcome: 'success' })]));
  assert.equal(motion.flights.length, 0);
  motion = ui.advanceMotion(motion, sceneData([route('unmatched', { attempts: [attempt(1, null)] })]));
  assert.equal(motion.flights.length, 0);
  motion = ui.advanceMotion(motion, sceneData([route('unmatched')]));
  assert.equal(motion.flights.length, 0, 'later candidate matching is not a new send');
  motion = ui.advanceMotion(motion, sceneData([route('new', { attempts: [attempt(1), attempt(1)] })]));
  assert.equal(motion.flights.length, 1);
});

test('all cancellation gates establish a resume baseline even with identical record arrays', () => {
  const data = sceneData([route('r')]);
  for (const gate of [{ visible: false }, { reducedMotion: true }, { replaying: true }, { reset: true },
    ...['stale', 'disconnected', 'paused', 'stopped', 'starting'].map(connectionStatus => ({ connectionStatus }))]) {
    let motion = ui.advanceMotion(null, data);
    motion = ui.advanceMotion(motion, data, gate);
    assert.equal(motion.enabled, false); assert.equal(motion.baseline, true); assert.equal(motion.flights.length, 0);
    const updated = sceneData([route('r', { attempts: [attempt(1), attempt(2)] })]);
    motion = ui.advanceMotion(motion, updated);
    assert.equal(motion.enabled, true); assert.equal(motion.baseline, true); assert.equal(motion.flights.length, 0);
    motion = ui.advanceMotion(motion, sceneData([route('r', { attempts: [attempt(1), attempt(2), attempt(3)] })]));
    assert.equal(motion.flights.length, 1);
  }
});

test('scope, generation, instance and history changes cannot replay sends; flight count and watermarks are bounded', () => {
  const data = sceneData([route('r')]);
  const initial = ui.advanceMotion(null, data);
  for (const change of [{ generation: 2 }, { instanceId: 'replacement' }, { scope: ui.makeScope('B') },
    { scope: ui.makeScope('A', 'today') }, { scope: ui.makeScope('A', 'live', true) }]) {
    const next = ui.advanceMotion(initial, { ...data, ...change });
    assert.equal(next.baseline, true); assert.equal(next.flights.length, 0);
    if (change.scope?.period === 'today') assert.equal(next.enabled, false);
  }
  const many = sceneData(Array.from({ length: 40 }, (_, i) => route(`new-${i}`)));
  const next = ui.advanceMotion(initial, many);
  assert.equal(next.flights.length, 12);
  assert.equal(ui.advanceMotion(next, many).flights.length, 0, 'bounded-away flights are also consumed');
  const reappeared = ui.advanceMotion(ui.advanceMotion(next, sceneData([])), many);
  assert.equal(reappeared.flights.length, 0, 'eviction/reappearance inside a generation is not a send');
  const full = { ...initial, watermarks: new Map(Array.from({ length: 8192 }, (_, i) => [`seen-${i}`, 1])) };
  const saturated = ui.advanceMotion(full, many);
  assert.equal(saturated.saturated, true); assert.equal(saturated.watermarks.size, 0);
  assert.equal(saturated.enabled, true, 'active paths can still pulse after the identity cap');
  assert.equal(ui.advanceMotion(saturated, sceneData([route('seen-0')])).flights.length, 0, 'forgotten attempts never replay after saturation');
});

test('one persistent stage, closed evidence disclosure and intrinsic-width constraints replace request-card diagrams', async () => {
  const html = await readFile(new URL('ui/index.html', root), 'utf8');
  const css = await readFile(new URL('ui/style.css', root), 'utf8');
  const ids = [...html.matchAll(/\bid="([^"]+)"/g)].map(match => match[1]);
  assert.equal(new Set(ids).size, ids.length);
  assert.equal(ids.filter(id => id === 'route-graph').length, 1);
  assert.match(html, /<details id="evidence-details" data-testid="evidence-details">/);
  assert(html.indexOf('id="route-graph"') < html.indexOf('id="metrics"'));
  assert.match(html, /id="route-sources"/); assert.match(html, /id="route-hub"/); assert.match(html, /id="route-destinations"/);
  assert.doesNotMatch(html, /路由沒有可選|Smart|quota/i);
  assert.match(css, /min-inline-size: 0/); assert.match(css, /grid-template-columns: minmax\(0, 1fr\)/);
  assert.match(css, /select\s*\{\s*contain:\s*inline-size layout;\s*white-space:\s*nowrap;/,
    'native selected-option layout is contained without wrapping or clipping the page');
  assert.doesNotMatch(css, /(?:body|main)[^{]*\{[^}]*overflow[^:]*:\s*(?:hidden|clip)/);
  assert.doesNotMatch(appSource, /\$\('route-graph'\)\.replaceChildren/);
  assert.match(appSource, /new ResizeObserver\(scheduleGeometry\)/);
});

test('local HTML uses classic local scripts and offers labelled stable test hooks', async () => {
  const launcher = await readFile(new URL('page/index.html', root), 'utf8');
  const hostBridge = launcher.match(/<script src="([^"]*_magpie\/bridge\.js)"/)[1];
  assert.equal(new URL(hostBridge, 'https://host.invalid/_magpie/plugin/token/index.html').pathname,
    '/_magpie/plugin/token/_magpie/bridge.js', 'Magpie serves the launcher relative to its page directory, not the package directory');
  const html = await readFile(new URL('ui/index.html', root), 'utf8');
  assert.match(html, /src="bridge\.js" defer/); assert.match(html, /src="app\.js" defer/);
  assert.doesNotMatch(html, /type="module"|https?:\/\//);
  assert.match(html, /data-testid="connection-status"/); assert.match(html, /data-testid="coverage"/);
  assert.doesNotMatch(appSource, /\.innerHTML\s*=|insertAdjacentHTML|console\.(?:log|error)/);
});

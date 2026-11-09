import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { webcrypto } from 'node:crypto';
import vm from 'node:vm';
import { createAggregator } from '../lib/aggregator.mjs';
import { sessionKey, decodeSessionKey, parseScope, scopeEquals } from '../lib/contracts.mjs';
import { initialTrace } from './fixtures/trace.mjs';

const root = new URL('../', import.meta.url);
const [appSource, bridgeSource, bootSource] = await Promise.all(['ui/app.js', 'ui/bridge.js', 'page/boot.js'].map(path => readFile(new URL(path, root), 'utf8')));
// No dummy DOM or substitute renderer: load the adapter's exported pure helpers
// without document. Actual vendor DOM/animation runs in native-copy/browser tests.
const context = vm.createContext({ AbortController, TextDecoder, Uint8Array, setTimeout, clearTimeout });
vm.runInContext(appSource, context);
const ui = context.SessionRouting;
const tick = () => new Promise(resolve => setImmediate(resolve));
const credentials = { apiToken: 'A'.repeat(43), installationId: 'A'.repeat(22) };
const apiError = status => Object.assign(new Error('private diagnostic'), { status });
function snapshot() {
  const aggregator = createAggregator();
  aggregator.applyTrace(initialTrace(), { full: true });
  return aggregator.nativeSnapshot();
}
function harness(options = {}) {
  const states = [], resets = [], timers = new Map();
  let next = 0;
  const controller = ui.createController({ readOptions: async () => credentials,
    onState: value => states.push(value), onReset: value => resets.push(value),
    setTimer(fn, delay) { const key = ++next; timers.set(key, { fn: () => { timers.delete(key); fn(); }, delay }); return key; },
    clearTimer(key) { timers.delete(key); }, ...options });
  return { controller, states, resets, timers };
}

// Scope/history APIs still exist for read clients. Their contract belongs to the
// backend, not the removed custom renderer's session picker or history controls.
test('retained public scope contract keeps exact agent/session tuples and direct defaults', () => {
  const a = sessionKey('claude', 'same'), b = sessionKey('codex', 'same');
  assert.notEqual(a, b);
  assert.deepEqual(decodeSessionKey(a), { agent: 'claude', session: 'same' });
  const scoped = parseScope(new URLSearchParams({ session: a, period: '7d' }));
  assert.equal(scoped.includeChildren, false);
  assert.equal(scopeEquals(scoped, { ...scoped, sessionKey: b }), false);
  assert.equal(scopeEquals(scoped, { ...scoped, includeChildren: true }), false);
  assert.equal(parseScope(new URLSearchParams()).kind, 'all');
});

test('adapter accepts the actual native projection and rejects malformed envelopes', () => {
  const d = snapshot();
  assert.equal(ui.validOptions(credentials), true);
  for (const field of ['apiToken', 'installationId']) assert.equal(ui.validOptions({ ...credentials, [field]: 'B'.repeat(credentials[field].length) }), false);
  assert.equal(ui.validateSnapshot(d), d);
  for (const invalid of [{ ...d, apiVersion: 2 }, { ...d, ids: [101, 101] }, { ...d, routes: [{}] },
    { ...d, routes: [d.routes[0], d.routes[0]] }, { ...d, connection: { status: 'invented' } }]) {
    assert.throws(() => ui.validateSnapshot(invalid), /invalid_snapshot/);
  }
});

test('refreshes coalesce without overlap and canceled late responses cannot repaint', async () => {
  const calls = [];
  const h = harness({ request: options => new Promise(resolve => calls.push({ ...options, resolve })) });
  h.controller.refresh(); await tick();
  h.controller.refresh(); h.controller.refresh();
  assert.equal(calls.length, 1); assert.equal(calls[0].signal.aborted, true);
  calls[0].resolve(snapshot()); await tick();
  assert.equal(h.states.length, 0); assert.equal(calls.length, 2);
  calls[1].resolve(snapshot()); await tick();
  assert.equal(h.states.length, 1); assert.equal(h.timers.size, 1);
  assert.equal([...h.timers.values()][0].delay, 1000);
  h.controller.stop(); assert.equal(h.timers.size, 0);
});

test('visibility aborts reads and resume revalidates credentials before reading again', async () => {
  const calls = []; let reads = 0, visibility = 0;
  const h = harness({ readOptions: async () => { reads++; return credentials; },
    onVisibility: () => visibility++, request: options => new Promise(resolve => calls.push({ ...options, resolve })) });
  h.controller.refresh(); await tick(); h.controller.setVisible(false);
  assert.equal(calls[0].signal.aborted, true);
  calls[0].resolve(snapshot()); await tick();
  assert.equal(h.states.length, 0); assert.equal(h.timers.size, 0);
  h.controller.setVisible(true); await tick();
  assert.equal(reads, 2); assert.equal(visibility, 2);
  calls[1].resolve(snapshot()); await tick();
  assert.equal(h.states.length, 1); h.controller.stop();
});

test('401 re-reads authoritative options once without writing or rotating them', async () => {
  let reads = 0;
  const tokens = [], nextToken = `${'C'.repeat(42)}A`;
  const h = harness({ readOptions: async () => ({ ...credentials, apiToken: ++reads === 1 ? credentials.apiToken : nextToken }),
    async request({ token }) { tokens.push(token); if (tokens.length === 1) throw apiError(401); return snapshot(); } });
  await h.controller.refresh();
  assert.equal(reads, 2); assert.deepEqual(tokens, [credentials.apiToken, nextToken]);
  assert.equal(h.states.length, 1); h.controller.stop();
});

test('repeated 401 or revocation clears presentation and stops automatic retries', async () => {
  for (const status of [401, 403]) {
    let calls = 0;
    const h = harness({ request: async () => { calls++; throw apiError(status); } });
    await h.controller.refresh();
    assert.equal(calls, status === 401 ? 2 : 1);
    assert.equal(h.states.length, 0); assert.equal(h.timers.size, 0);
    assert.match(h.resets.at(-1), /Access is unavailable or was revoked/);
    assert.doesNotMatch(h.resets.at(-1), /private diagnostic/); h.controller.stop();
  }
});

test('transient failure also clears native live claims, but schedules a bounded retry', async () => {
  let failure = false;
  const h = harness({ request: async () => { if (failure) throw new Error('private URL'); return snapshot(); } });
  await h.controller.refresh(); failure = true; await h.controller.refresh();
  assert.equal(h.states.length, 1); assert.match(h.resets.at(-1), /no cached activity is shown as live/);
  assert.equal(h.timers.size, 1); h.controller.stop();
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
  const h = bridgeHarness(), initial = h.sent[0].message;
  h.reply({ id: initial.id, error: 'temporary bridge failure' });
  await assert.rejects(h.api.ready);
  const retried = h.api.reconnect(), hello = h.sent.at(-1).message;
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

test('minimal shell loads the actual local native code in order, not the removed custom stage', async () => {
  const html = await readFile(new URL('ui/index.html', root), 'utf8');
  const scripts = [...html.matchAll(/<script src="([^"]+)" defer/g)].map(m => m[1]);
  assert.deepEqual(scripts, ['bridge.js', 'vendor/magpie/native-helpers.js', 'vendor/magpie/client.js', 'app.js']);
  assert.doesNotMatch(html, /type="module"|https?:\/\/|session-select|route-graph|evidence-details/);
  assert.doesNotMatch(appSource, /projectScene|advanceMotion|console\.(?:log|error)|api\/(?:state|history|sessions)/);
  const launcher = await readFile(new URL('page/index.html', root), 'utf8');
  const hostBridge = launcher.match(/<script src="([^"]*_magpie\/bridge\.js)"/)[1];
  assert.equal(new URL(hostBridge, 'https://host.invalid/_magpie/plugin/token/index.html').pathname, '/_magpie/plugin/token/_magpie/bridge.js');
});

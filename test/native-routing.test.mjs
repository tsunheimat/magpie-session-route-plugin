import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createNativeProjector } from '../lib/native-routing.mjs';
import { createAggregator } from '../lib/aggregator.mjs';
import { DEFAULT_LIMITS } from '../lib/contracts.mjs';
import { makeRoute } from './fixtures/trace.mjs';

const time = '2026-11-06T12:00:00.000Z';
const later = '2026-11-06T12:01:00.000Z';
const clock = () => Date.parse('2026-11-06T13:00:00.000Z');
const all = { kind: 'all', sessionKey: null, includeChildren: false, period: 'live' };
const envelope = (routes, extra = {}) => ({ object: 'trace', pid: 123, serves: 'web', now: later,
  seq: Math.max(0, ...routes.map(row => row.seq)), routes, ids: routes.map(row => row.id), ...extra });
const seat = (id = 'private@example.invalid', extra = {}) => ({ id, provider: 'openai', name: 'sk-ant-PRIVATE-NAME-CREDENTIAL', who: 'PRIVATE-USER',
  kind: 'account', model: 'gpt-model', routing: 'order', ...extra });
const attempt = (id = 'private@example.invalid', extra = {}) => ({ id, model: 'gpt-model', start: time, done: false, ...extra });
const row = (id, extra = {}) => makeRoute(id, { provider: 'openai', model: 'gpt-model', group: undefined,
  order: [seat()], tries: [attempt()], ...extra });
const byteSize = value => Buffer.byteLength(JSON.stringify(value));
const nativeSeat = value => `${value.id}\0${value.model || ''}${value.fixed ? ':' + value.fixed : ''}`;
const find = (state, id) => state.routes.find(route => route.id === id);

function start(rows, options = {}, meta = {}) {
  const aggregator = createAggregator({ clock, ...options });
  aggregator.applyTrace(envelope(rows, meta), { full: true });
  return aggregator;
}

test('native shared destinations are stable across sessions, requests, polls, and display-label changes', () => {
  const aggregator = start([row(1), row(2, { session: 'session-bravo' })]);
  const state = aggregator.nativeSnapshot(), a = find(state, 1), b = find(state, 2);
  assert.equal(a.order[0].id, b.order[0].id);
  assert.equal(nativeSeat(a.order[0]), nativeSeat(b.order[0]));
  assert.equal(a.order[0].who, b.order[0].who);
  assert.notEqual(a.session, b.session);
  assert.ok(!a.order[0].id.includes('private'));
  assert.ok(!a.order[0].id.includes(String(a.id) + ':candidate:'));
  aggregator.applyTrace(envelope([row(1, { seq: 3, order: [seat(undefined, { who: 'RENAMED', name: 'RENAMED' })] })], { seq: 3, ids: [1, 2] }));
  assert.equal(find(aggregator.nativeSnapshot(), 1).order[0].id, a.order[0].id);
  assert.equal(find(aggregator.nativeSnapshot(), 1).order[0].who, a.order[0].who);
  assert.notEqual(start([row(1)]).nativeSnapshot().routes[0].order[0].id, a.order[0].id, 'backend-local namespace');
});

test('native model and configured effort distinguish seats without request-qualifying account IDs', () => {
  const orders = [seat('same', { model: 'model-a', fixed: 'high' }), seat('same', { model: 'model-a', fixed: 'low' }),
    seat('same', { model: 'model-b', fixed: 'high' }), seat('different', { model: 'model-a', fixed: 'high' })];
  const tries = orders.map(value => attempt(value.id, { model: value.model, fixed: value.fixed }));
  const state = start([row(1, { order: orders, tries }), row(2, { order: orders, tries })]).nativeSnapshot();
  const a = find(state, 1), b = find(state, 2);
  assert.equal(new Set(a.order.map(nativeSeat)).size, 4);
  assert.equal(new Set(a.order.slice(0, 3).map(value => value.id)).size, 1);
  assert.deepEqual(a.order.map(nativeSeat), b.order.map(nativeSeat));
  assert.deepEqual(a.tries.map(nativeSeat), a.order.map(nativeSeat));
  assert.notEqual(a.order[0].id, a.order[3].id, 'same raw display label cannot merge two accounts');
});

test('all retained seat/rest/affinity/pin references use the same domain-separated opaque identity', () => {
  const rawID = 'same-raw-id', restKey = `${rawID}/gpt-model`;
  const rest = { key: restKey, model: 'gpt-model', until: later, why: 'rate', by: 'retry-after', status: 429,
    failures: 2, rate: true, probed: false, error: 'private error', link: 'https://private.invalid' };
  const aggregator = start([row(1, { order: [seat(rawID, { provider: rawID, rest, via: [rawID] })],
    tries: [attempt(rawID, { rest })], left: [seat(rawID, { provider: rawID, capped: 90, rest })],
    affinity: { mode: 'strict', why: 'strict', last: rawID, main: seat(rawID, { provider: rawID }), turn: 2, kept: true },
    pinned: rawID, compaction: rawID, leadAccount: rawID, sealedTask: true,
    group: { id: rawID, name: 'private group', routing: 'order', members: [`${rawID}/gpt-model`],
      via: [rawID], subs: [{ id: rawID, in: rawID, routing: 'rotate', name: 'private subgroup' }] },
  })], {}, { lifted: { [restKey]: later, unused: later } });
  const state = aggregator.nativeSnapshot(), projected = state.routes[0], id = projected.order[0].id;
  for (const value of [projected.tries[0].id, projected.left[0].id, projected.affinity.last, projected.affinity.main.id,
    projected.pinned, projected.compaction, projected.leadAccount]) assert.equal(value, id);
  assert.notEqual(projected.order[0].provider, id);
  assert.notEqual(projected.group.id, id);
  assert.notEqual(projected.group.id, projected.order[0].provider);
  assert.equal(projected.group.members[0], `${projected.order[0].provider}/gpt-model`);
  assert.equal(projected.order[0].via[0], projected.group.id);
  assert.equal(projected.group.via[0], projected.group.id);
  assert.equal(projected.group.subs[0].in, projected.group.id);
  assert.equal(projected.left[0].rest.key, projected.order[0].rest.key);
  assert.equal(projected.tries[0].rest.key, projected.order[0].rest.key);
  assert.deepEqual(state.lifted, { [projected.order[0].rest.key]: later });
  assert.equal(projected.order[0].rest.error, 'Rate limited.');
  assert.equal(projected.order[0].rest.link, undefined);
  assert.equal(JSON.stringify(state).includes(rawID), false);
});

test('exact recorded session and agent survive without parent folding; folders are opt-in', () => {
  const raw = row(1, { session: 'Child-SESSION', parentSession: 'parent', parentMatched: true, folder: '/workspace/project',
    rule: { n: 1, folder: '/workspace/project', tokens: 1000 } });
  const projected = start([raw, row(2, { agent: 'codex', session: 'Child-SESSION' }), row(3, { session: null })]).nativeSnapshot();
  assert.equal(find(projected, 1).agent, 'claude-code');
  assert.equal(find(projected, 1).session, 'Child-SESSION');
  assert.equal(find(projected, 2).agent, 'codex');
  assert.equal(find(projected, 2).session, 'Child-SESSION');
  assert.equal(find(projected, 3).session, null);
  assert.equal(find(projected, 1).parentSession, undefined);
  assert.equal(find(projected, 1).parentMatched, undefined);
  assert.equal(find(projected, 1).folder, undefined);
  assert.equal(find(projected, 1).rule.folder, undefined);
  const shown = start([raw], { showFolders: true }).nativeSnapshot().routes[0];
  assert.equal(shown.folder, raw.folder);
  assert.equal(shown.rule.folder, raw.folder);
});

test('project names are native-only basenames with separate disclosure switches and no folder backfill', () => {
  const raw = row(1, { folder: '/PARENT-PATH-CANARY/PROJECT-CANARY', rule: { folder: '/RULE-PARENT/RULE-PROJECT' },
    nested: [{ group: 'g', rule: { folder: '/NESTED-PARENT/NESTED-PROJECT' } }] });
  for (const showFolders of [false, true]) for (const showProjectNames of [false, true]) {
    const aggregator = start([raw, row(2, { session: 'second', folder: 'C:\\OTHER-PARENT\\PROJECT-CANARY\\' }),
      row(3, { session: 'third', projectName: 'INVENTED', rule: { folder: '/RULE-ONLY/NOT-RECORDED' } })], { showFolders, showProjectNames });
    const native = aggregator.nativeSnapshot(), projected = find(native, 1), legacy = aggregator.snapshot(all);
    assert.equal(projected.projectName, showProjectNames ? 'PROJECT-CANARY' : undefined);
    assert.equal(projected.folder, showFolders ? raw.folder : undefined);
    assert.equal(projected.rule.folder, showFolders ? raw.rule.folder : undefined);
    assert.equal(projected.nested[0].rule.folder, showFolders ? raw.nested[0].rule.folder : undefined);
    assert.equal(projected.rule.projectName, undefined);
    assert.equal(find(native, 3).projectName, undefined, 'never trust a raw label or rule folder as the recorded project');
    assert.equal(find(native, 2).projectName, projected.projectName);
    assert.notEqual(find(native, 2).session, projected.session, 'a basename is never source identity');
    assert.equal(legacy.requests.some(record => Object.hasOwn(record, 'projectName')), false);
    if (!showFolders) assert.doesNotMatch(JSON.stringify([native, legacy]), /PARENT-PATH-CANARY|OTHER-PARENT|RULE-PARENT|NESTED-PARENT/);
    if (!showFolders && !showProjectNames) assert.doesNotMatch(JSON.stringify([native, legacy]), /PROJECT-CANARY|RULE-PROJECT|NESTED-PROJECT/);
  }
  const enabled = start([raw]).nativeSnapshot().routes[0];
  assert.equal(enabled.projectName, 'PROJECT-CANARY');
  assert.equal(enabled.folder, undefined);
  for (const folder of ['/', '.', '..', '~', 'C:\\', '/parent/..', '/unsafe@example.invalid/project', '/parent/' + 'x'.repeat(250)]) {
    const projected = start([row(1, { folder })]).nativeSnapshot().routes[0];
    assert.equal(projected.projectName, undefined, folder);
    assert.ok(projected.evidence.reasons.includes('project_name_unavailable'));
  }
});

test('native actors reconcile header evidence without changing turn-marker or source identity semantics', () => {
  const actor = 'PRIVATE-ACTOR@example.invalid';
  const raws = [row(1, { subagentId: actor }), row(2, { sub: actor }), row(3, { subagentId: actor, sub: actor }),
    row(4, { sub: actor, agent: 'codex' }), row(5, { sub: actor, session: 'independent', parentSession: 'session-alpha' }),
    row(6, { sub: 'another-private-actor' }), row(7, { subagentId: actor, sub: 'CONFLICT-CANARY' }),
    row(8, { kind: 'collab_spawn' }), row(9, { kind: 'thread_spawn' }), row(10, { kind: 'agent_job' }),
    row(11, { subagent: { asked: 'model-a', to: 'model-b', lead: true } }),
    row(12, { kind: 'thread_title', parentSession: 'session-alpha' }), row(13, { kind: 'review' }),
    row(14), row(15, { subagentId: 'x'.repeat(2049), sub: 'valid-but-conflicting' })];
  const native = start(raws).nativeSnapshot();
  const id = find(native, 1).actorId;
  assert.match(id, /^actor_[A-Za-z0-9_-]{22}$/u);
  for (const n of [1, 2, 3, 4, 5]) assert.equal(find(native, n).actorId, id);
  for (const n of [1, 3, 7]) assert.equal(find(native, n).subagentId, id);
  for (const n of [2, 4, 5, 8, 9, 10, 11, 12]) assert.equal(find(native, n).subagentId, undefined);
  assert.notEqual(find(native, 6).actorId, id);
  for (const n of [7, 15]) {
    assert.equal(find(native, n).actorId, undefined);
    assert.ok(find(native, n).evidence.reasons.includes('actor_identity_conflict'));
  }
  for (const n of [8, 9, 10, 11]) assert.equal(find(native, n).actorId, undefined);
  for (const n of [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 15]) assert.equal(find(native, n).isSubagent, true);
  for (const n of [12, 13, 14]) assert.equal(find(native, n).isSubagent, false);
  const displayKey = route => JSON.stringify([route.agent, route.session, route.actorId]);
  assert.equal(new Set([1, 4, 5].map(n => displayKey(find(native, n)))).size, 3, 'full actor IDs require exact agent/session scoping');
  assert.equal(find(native, 5).session, 'independent');
  for (const route of native.routes) {
    assert.equal(route.parentSession, undefined);
    assert.equal(route.sub, undefined);
  }
  assert.doesNotMatch(JSON.stringify(native), /PRIVATE-ACTOR|another-private-actor|CONFLICT-CANARY/);
});

test('actor activity follows retained routes and rotates on reset while disclosure options persist', () => {
  for (const showProjectNames of [false, true]) {
    const raw = row(1, { sub: 'private-worker', folder: '/private/PROJECT-CANARY' });
    const aggregator = start([raw, row(2, { sub: 'private-worker' })], { showProjectNames });
    const original = find(aggregator.nativeSnapshot(), 1);
    aggregator.applyTrace(envelope([row(1, { ...raw, seq: 3, done: true })], { seq: 3, ids: [1] }));
    const completed = aggregator.nativeSnapshot();
    assert.equal(completed.routes.length, 1);
    assert.equal(completed.routes[0].done, true);
    assert.equal(completed.routes[0].actorId, original.actorId);
    const reset = envelope([raw], { pid: 999 });
    assert.equal(aggregator.applyTrace(reset).resync, true);
    aggregator.applyTrace(reset, { full: true });
    const afterReset = aggregator.nativeSnapshot().routes[0];
    assert.notEqual(afterReset.actorId, original.actorId);
    assert.equal(afterReset.projectName, showProjectNames ? 'PROJECT-CANARY' : undefined);
    aggregator.clear();
    assert.deepEqual(aggregator.nativeSnapshot().routes, []);
    aggregator.applyTrace(envelope([raw]), { full: true });
    const fresh = aggregator.nativeSnapshot().routes[0];
    assert.notEqual(fresh.actorId, afterReset.actorId);
    assert.equal(fresh.projectName, showProjectNames ? 'PROJECT-CANARY' : undefined);
  }
});

test('nested privacy canaries and unknown object keys never enter the native cache', () => {
  const canary = 'PRIVATE-CANARY@example.invalid', nested = { text: canary, token: canary, deep: { secret: canary } };
  const rest = { key: canary, until: later, why: canary, by: canary, error: canary, link: canary, headers: nested };
  const raw = row(1, {
    sessionTitle: canary, titleLink: nested, prompt: nested, context: nested, bodies: nested, headers: nested,
    toolargs: nested, archive: canary, callerKey: canary, callerKeyName: canary, error: canary, fail: canary,
    order: [seat(canary, { name: canary, who: canary, provider: canary, icon: canary, preset: canary, plan: canary,
      rest, price: { input: 0, output: 2, cacheRead: 0, secret: nested }, extra: nested, unit: canary, unread: canary })],
    tries: [attempt(canary, { error: canary, fail: canary, rest, net: nested, reset: nested, auto: [nested], pin: canary, upstream: canary })],
    group: { id: canary, name: canary, routing: canary, members: [], subs: [nested], paused: [nested], credentials: nested },
    affinity: { last: canary, why: canary, main: seat(canary), extra: nested },
    rule: { n: 1, classified: nested, when: [canary], folder: canary, tokens: 300, secret: nested },
    nested: [{ group: canary, name: canary, rule: { n: 2, when: [canary], classified: nested }, extra: nested }],
  });
  const aggregator = start([raw], {}, { mine: true, by: nested, totals: { requests: 1, errors: 0, secret: nested }, lifted: { [canary]: later } });
  const state = aggregator.nativeSnapshot(), projected = state.routes[0];
  assert.equal(JSON.stringify(state).includes(canary), false);
  assert.equal(JSON.stringify(state).includes('PRIVATE-CANARY'), false);
  for (const key of ['sessionTitle', 'titleLink', 'prompt', 'context', 'bodies', 'headers', 'toolargs', 'archive', 'callerKey', 'callerKeyName']) {
    assert.equal(Object.hasOwn(projected, key), false, key);
  }
  assert.equal(state.mine, undefined); assert.equal(state.by, undefined);
  assert.equal(projected.tries[0].fail, 'other');
  assert.equal(projected.tries[0].error, 'Upstream request failed.');
  assert.deepEqual(projected.order[0].price, { input: 0, output: 2, cacheRead: 0 });
  assert.equal(projected.order[0].icon, 'generic');
  assert.ok(projected.evidence.partial);
  assert.match(projected.evidence.label, /unavailable|withheld/);
  raw.order[0].price.output = 999;
  assert.equal(aggregator.nativeSnapshot().routes[0].order[0].price.output, 2, 'raw references were never cached');
});

test('configured safe provider names are independent of opaque identity and native icon precedence', () => {
  const projected = start([row(1, { order: [seat('a', { provider: 'openai', name: 'Gemini CLI', icon: 'geminicli-color', preset: 'openai' }),
    seat('b', { provider: 'custom-provider', name: 'Antigravity', icon: 'antigravity-color' }),
    seat('c', { provider: 'custom-provider', name: 'Kiro', preset: 'kiro-color' }),
    seat('d', { provider: 'google', name: 'StepFun', icon: '', preset: 'stepfun-color' }),
    seat('e', { provider: 'custom-provider', name: '团队 — API (EU)', icon: '../../escape', preset: 'anthropic' }),
    seat('f', { provider: 'openai', name: 'Custom: API + staging!' })] })]).nativeSnapshot().routes[0];
  assert.deepEqual(projected.order.map(item => item.name), ['Gemini CLI', 'Antigravity', 'Kiro', 'StepFun', '团队 — API (EU)', 'Custom: API + staging!']);
  assert.deepEqual(projected.order.map(item => item.icon), ['geminicli-color', 'antigravity-color', 'kiro-color', 'stepfun-color', 'generic', 'generic']);
  assert.equal(projected.order[0].provider, 'openai', 'existing raw identity handling is unchanged');
  assert.match(projected.order[1].provider, /^provider_/);
  assert.equal(projected.order[1].provider, projected.order[2].provider, 'names cannot create separate destinations');
  assert.equal(projected.order[4].preset, 'anthropic');
  assert.equal(projected.order[0].preset, 'openai');
  assert.ok(projected.evidence.reasons.includes('provider_icon_unsupported'));
});

test('every bundled artwork identifier is available through the existing static manifest', () => {
  const manifest = JSON.parse(readFileSync(new URL('../ui/vendor/magpie/static-manifest.json', import.meta.url), 'utf8'));
  const icons = manifest.files.filter(path => path.startsWith('vendor/magpie/icons/')).map(path => path.split('/').at(-1).replace(/\.(svg|png)$/u, ''));
  assert.ok(icons.length > 150);
  const projector = createNativeProjector();
  for (const icon of icons) {
    for (const metadata of [{ icon }, { preset: icon }]) {
      const projected = projector.route(row(1, { order: [seat('a', { name: 'Configured provider', ...metadata })] }));
      assert.equal(projected.order[0].icon, icon);
    }
  }
});

test('unsafe or missing provider names use stable neutral labels with explicit evidence', () => {
  const projector = createNativeProjector();
  for (const name of [undefined, null, '', 'private@example.invalid', 'https://private.invalid', 'sk-ant-privatecredential',
    'Bearer privatecredential', 'unsafe‮name', 'unsafe\nname', 'n'.repeat(257)]) {
    const projected = projector.route(row(1, { order: [seat('a', { provider: 'openai', name, icon: 'openai' }),
      seat('b', { provider: 'openai', name }), seat('c', { provider: 'google', name })] }));
    assert.match(projected.order[0].name, /^Provider [A-Za-z0-9_-]{8}$/u);
    assert.equal(projected.order[0].name, projected.order[1].name);
    assert.notEqual(projected.order[0].name, projected.order[2].name);
    assert.ok(projected.evidence.reasons.includes(name == null || name === '' ? 'provider_name_unavailable' : 'provider_name_withheld'));
    if (name) assert.equal(JSON.stringify(projected).includes(name), false);
  }
});

test('unsupported explicit artwork never falls back to another brand or exposes paths', () => {
  const projector = createNativeProjector();
  for (const icon of ['file:/private/icon.svg', 'https://private.invalid/icon', '../../escape', '/openai', 'openai.svg',
    'private@example.invalid', 'not-bundled', {}, false, 1]) {
    const projected = projector.route(row(1, { order: [seat('a', { name: 'Configured provider', icon, preset: 'geminicli-color' })] }));
    assert.equal(projected.order[0].icon, 'generic');
    assert.equal(projected.order[0].preset, 'geminicli-color');
    assert.ok(projected.evidence.reasons.includes('provider_icon_unsupported'));
  }
  for (const preset of ['file:/private/icon.svg', 'https://private.invalid/icon', '../escape', 'private@example.invalid', 'sk-ant-privatecredential']) {
    const projected = projector.route(row(1, { order: [seat('a', { preset })] }));
    assert.equal(projected.order[0].preset, undefined);
    assert.equal(projected.order[0].icon, 'generic');
    assert.ok(projected.evidence.reasons.includes('provider_preset_unsupported'));
    assert.equal(JSON.stringify(projected).includes(preset), false);
  }
  const projected = projector.route(row(1, { order: [seat('a', { preset: 'safe-custom-preset' })] }));
  assert.equal(projected.order[0].preset, 'safe-custom-preset');
  assert.equal(projected.order[0].icon, 'generic');
});

test('native snapshots are deeply detached, including quota, groups, lift maps, and connection', () => {
  const raw = row(1, { order: [seat('a', { price: { input: 0, output: 2 }, renews: [later], rest: { key: 'a', until: later } })],
    group: { id: 'g', members: ['openai/gpt-model'], routing: 'order', subs: [{ id: 's', in: 'g' }] } });
  const aggregator = start([raw], {}, { lifted: { a: later }, totals: { requests: 1 } });
  const first = aggregator.nativeSnapshot(), expected = structuredClone(first);
  first.routes[0].order[0].price.output = 999;
  first.routes[0].order[0].renews[0] = 'changed';
  first.routes[0].group.members.length = 0;
  first.routes[0].group.subs[0].id = 'changed';
  first.routes[0].evidence.reasons.push('changed');
  first.ids.push(999); first.connection.status = 'changed'; first.coverage.retained = 0;
  first.totals.requests = 999; first.lifted = {};
  assert.deepEqual(aggregator.nativeSnapshot(), expected);
});

test('incremental replacement retains unchanged native routes and removes unavailable requests', () => {
  const aggregator = start([row(1), row(2)]);
  const original = find(aggregator.nativeSnapshot(), 2);
  aggregator.applyTrace(envelope([row(1, { seq: 3, done: true, served: 'new-model', status: 200 })], { seq: 3, ids: [1, 2] }));
  assert.deepEqual(find(aggregator.nativeSnapshot(), 2), original);
  assert.equal(find(aggregator.nativeSnapshot(), 1).served, 'new-model');
  aggregator.applyTrace(envelope([row(1, { seq: 4, done: true })], { seq: 4, ids: [1] }));
  const state = aggregator.nativeSnapshot();
  assert.deepEqual(state.ids, [1]);
  assert.equal(state.routes[0].served, undefined, 'whole record replacement');
  assert.equal(aggregator.snapshot(all).requests.find(request => request.id === 2).outcome, 'unavailable');
  aggregator.applyTrace(envelope([], { seq: 5 }));
  assert.equal(aggregator.nativeSnapshot().routes.length, 0);
});

test('lift-only incremental updates match cached rests and stop when their route is evicted', () => {
  const aggregator = start([row(1, { order: [seat('a', { rest: { key: 'a', until: later, why: 'rate' } })] })]);
  const key = aggregator.nativeSnapshot().routes[0].order[0].rest.key;
  aggregator.applyTrace(envelope([], { seq: 2, ids: [1], lifted: { a: later, unrelated: later } }));
  assert.deepEqual(aggregator.nativeSnapshot().lifted, { [key]: later });
  aggregator.applyTrace(envelope([], { seq: 3, ids: [1] }));
  assert.deepEqual(aggregator.nativeSnapshot().lifted, { [key]: later });
  aggregator.applyTrace(envelope([], { seq: 4 }));
  assert.deepEqual(aggregator.nativeSnapshot().lifted, {});
});

test('PID and sequence resets rotate the native namespace only after a validated full resync', () => {
  for (const reset of [{ pid: 999, seq: 3 }, { seq: 1 }]) {
    const aggregator = start([row(1, { seq: 2 })]);
    const old = aggregator.nativeSnapshot(), update = envelope([row(1, { seq: reset.seq })], reset);
    assert.equal(aggregator.applyTrace(update).resync, true);
    assert.equal(aggregator.nativeSnapshot().routes[0].order[0].id, old.routes[0].order[0].id);
    assert.equal(aggregator.nativeSnapshot().connection.reason, 'resynchronizing');
    aggregator.applyTrace(update, { full: true });
    const fresh = aggregator.nativeSnapshot();
    assert.equal(fresh.generation, old.generation + 1);
    assert.notEqual(fresh.routes[0].order[0].id, old.routes[0].order[0].id);
    assert.equal(fresh.pid, reset.pid ?? old.pid);
  }
});

test('reused IDs and pending resets never inherit the prior native namespace', () => {
  const aggregator = start([row(1, { done: true, seq: 20 })]);
  const old = aggregator.nativeSnapshot().routes[0].order[0].id;
  assert.equal(aggregator.applyTrace(envelope([], { seq: 1 })).resync, true);
  aggregator.applyTrace(envelope([row(1, { seq: 21, time: later })], { seq: 21 }), { full: true });
  assert.equal(aggregator.nativeSnapshot().generation, 2);
  assert.notEqual(aggregator.nativeSnapshot().routes[0].order[0].id, old);
});

test('clear/revocation erases every native field and rotates opaque identities', () => {
  const raw = row(1, { order: [seat('a', { rest: { key: 'a', until: later } })] });
  const aggregator = start([raw], {}, { lifted: { a: later }, totals: { requests: 99 } });
  const before = aggregator.nativeSnapshot();
  aggregator.clear();
  const after = aggregator.nativeSnapshot();
  assert.deepEqual(after.routes, []); assert.deepEqual(after.ids, []); assert.deepEqual(after.lifted, {});
  assert.equal(after.now, null); assert.equal(after.pid, null); assert.equal(after.serves, null); assert.equal(after.totals, null);
  assert.equal(after.connection.status, 'stopped');
  assert.equal(after.generation, before.generation + 1);
  aggregator.applyTrace(envelope([raw]), { full: true });
  assert.notEqual(aggregator.nativeSnapshot().routes[0].order[0].id, before.routes[0].order[0].id);
});

test('latest connection status is never cached in a previously live native envelope', () => {
  const aggregator = start([row(1)]);
  const before = aggregator.nativeSnapshot();
  aggregator.setConnection({ status: 'disconnected', reason: 'gateway_unavailable' });
  const after = aggregator.nativeSnapshot();
  assert.equal(after.connection.status, 'stale');
  assert.equal(after.connection.reason, 'gateway_unavailable');
  assert.ok(after.coverage.reasons.includes('stale_or_unavailable'));
  assert.equal(after.revision, before.revision + 1);
  assert.deepEqual(after.routes, before.routes);
});

test('native source time, identity and process-lifetime totals are source evidence, not local derived counters', () => {
  const aggregator = start([row(1)], {}, { now: later, pid: 321, serves: 'tui', mine: true, by: { pid: 999 },
    totals: { requests: 99999, rerouted: 8888, errors: 7777, other: 'secret' } });
  const state = aggregator.nativeSnapshot();
  assert.equal(state.now, later);
  assert.notEqual(state.now, state.connection.lastUpdated);
  assert.equal(state.pid, 321); assert.equal(state.serves, 'tui');
  assert.deepEqual(state.totals, { requests: 99999, rerouted: 8888, errors: 7777 });
  assert.equal(state.coverage.totalsScope, 'gateway_since_start');
  assert.equal(state.coverage.retained, 1);
  assert.equal(state.mine, undefined); assert.equal(state.by, undefined);
  aggregator.applyTrace(envelope([], { pid: 321, seq: 2, ids: [1], now: 'bad', serves: 'secret', totals: { requests: -1, errors: {} } }));
  const unknown = aggregator.nativeSnapshot();
  assert.equal(unknown.now, null); assert.equal(unknown.serves, null); assert.equal(unknown.totals, null);
  assert.equal(unknown.coverage.totalsScope, 'unavailable');
  assert.ok(unknown.coverage.reasons.includes('source_time_unavailable'));
  assert.equal(unknown.coverage.inventory, 'unavailable');
});

test('zero measurements stay zero while missing, malformed, and unknown measurements are not invented', () => {
  const state = start([row(1, { ms: 0, ttft: 0, tokens: 0, out: 0, order: [seat('a', { known: true, used: 0,
    amount: 0, limit: 0, balance: 0, price: { input: 0, output: 0 }, pace: 0 })], tries: [attempt('a', { ms: 0, ttft: 0 })] }),
  row(2, { order: [seat('b', { known: true, used: 'private', balance: null, price: { input: 0 } })], tries: [attempt('b', { ms: '0' })] }),
  row(3, { order: null, tries: null, model: null })], {}, { totals: { requests: 0, errors: 0 } }).nativeSnapshot();
  const a = find(state, 1), b = find(state, 2), c = find(state, 3);
  for (const key of ['ms', 'ttft', 'tokens', 'out']) assert.equal(a[key], 0);
  for (const key of ['used', 'amount', 'limit', 'balance', 'pace']) assert.equal(a.order[0][key], 0);
  assert.deepEqual(a.order[0].price, { input: 0, output: 0 });
  assert.equal(a.tries[0].ms, 0); assert.equal(a.tries[0].ttft, 0);
  assert.equal(b.ms, undefined); assert.equal(b.order[0].used, undefined);
  assert.equal(b.order[0].known, undefined); assert.equal(b.order[0].balance, undefined);
  assert.equal(b.order[0].price, undefined); assert.equal(b.tries[0].ms, undefined);
  assert.ok(b.evidence.reasons.includes('quota_unavailable'));
  assert.deepEqual(c.order, []); assert.deepEqual(c.tries, []);
  assert.ok(c.evidence.reasons.includes('candidate_history_unavailable'));
  assert.ok(c.evidence.reasons.includes('attempt_history_unavailable'));
  assert.deepEqual(state.totals, { requests: 0, errors: 0 });
  assert.equal(state.totals.rerouted, undefined);
});

test('native model moves and billed usage keep only the documented safe shape', () => {
  const raw = row(1, { subagentId: 'private-worker-id', subagent: { asked: 'model-a', to: 'model-b', lead: true,
    kept: 'private reason', task: { text: 'private task' } }, moved: { to: 'model-c', why: 'stand-in', context: 'private context' },
    usage: [{ provider: 'openai', model: 'gpt-model', in: 0, out: 12, cache_read: 0, cache_write: 10, reasoning: 2,
      cache_unknown: true, credits: 0, prompt: 'private prompt', secret: 'private secret' }], priced: true, cost: 0, unpriced: 0 });
  const projected = start([raw]).nativeSnapshot().routes[0];
  assert.deepEqual(projected.moved, { to: 'model-c', why: 'stand-in' });
  assert.deepEqual(projected.subagent, { asked: 'model-a', to: 'model-b', lead: true, kept: 'Routing reason unavailable.' });
  assert.match(projected.subagentId, /^actor_/);
  assert.equal(projected.usage[0].in, 0); assert.equal(projected.usage[0].cache_read, 0);
  assert.equal(projected.usage[0].cache_write, 10); assert.equal(projected.usage[0].credits, 0);
  assert.equal(projected.usage[0].cache_unknown, true);
  assert.equal(projected.cost, 0); assert.equal(projected.priced, true); assert.equal(projected.unpriced, 0);
  assert.equal(JSON.stringify(projected).includes('private'), false);
});

test('malformed optional fields are withheld without poisoning valid records', () => {
  const aggregator = start([row(1, { order: [seat('a', { fixed: 'INVALID' }), seat('b', { used: {}, routing: 'plugin/private', rest: { until: 'bad' } })],
    tries: [attempt('b', { done: 'yes' }), attempt('b', { model: 'https://private.invalid' }), attempt('b')],
    left: { secret: true }, group: [], affinity: { why: 'secret', last: 'b' }, nested: 'secret', tokens: {}, status: 999 })]);
  const state = aggregator.nativeSnapshot().routes[0];
  assert.equal(state.order.length, 1); assert.equal(state.tries.length, 1);
  assert.equal(state.order[0].used, undefined); assert.equal(state.order[0].routing, undefined);
  assert.equal(state.order[0].rest, undefined); assert.equal(state.group, undefined);
  assert.equal(state.tokens, undefined); assert.equal(state.status, undefined);
  assert.equal(state.affinity.why, undefined);
  assert.ok(state.evidence.partial);
});

test('malformed required envelopes leave both projections and their cursors atomically unchanged', () => {
  const aggregator = start([row(1)]), native = aggregator.nativeSnapshot(), legacy = aggregator.snapshot(all);
  for (const input of [envelope([row(2), { id: 3 }], { seq: 3 }), envelope([row(2)], { ids: [2, 3] }),
    envelope([row(2)], { ids: [2, 2] }), envelope([row(2, { time: 'bad' })]), envelope([row(2, { done: 'yes' })]),
    envelope([row(2)], { pid: 0 }), envelope([row(2)], { object: 'anything' })]) {
    assert.throws(() => aggregator.applyTrace(input, { full: true }), error => error.code === 'gateway_malformed' && error.status === 502);
    assert.deepEqual(aggregator.nativeSnapshot(), native);
    assert.deepEqual(aggregator.snapshot(all), legacy);
  }
});

test('native retention is coordinated with existing route/session limits and prioritizes unfinished requests', () => {
  const aggregator = start([row(1), row(2, { done: true }), row(3, { session: 'other' })], { limits: { routes: 2, sessions: 1 } });
  const legacy = aggregator.snapshot(all), native = aggregator.nativeSnapshot();
  assert.ok(native.routes.length <= 2);
  assert.deepEqual(new Set(native.ids), new Set(legacy.requests.filter(request => request.outcome !== 'unavailable').map(request => request.id)));
  assert.equal(new Set(native.routes.map(route => route.session)).size, 1);
  assert.ok(native.coverage.reasons.includes('session_limit'));
  assert.ok(native.routes.some(route => !route.done));
});

test('candidate budgets include left and affinity.main; attempts and nested arrays are independently bounded', () => {
  const orders = Array.from({ length: 4 }, (_, index) => seat(`a${index}`));
  const aggregator = start([row(1, { order: orders, left: orders, tries: orders.map(value => attempt(value.id)),
    affinity: { main: seat('another') }, group: { id: 'g', members: Array.from({ length: 10 }, (_, index) => `openai/model-${index}`) } }),
  row(2, { order: [seat('a')], left: orders, tries: [] })], { limits: { candidates: 2, attempts: 2 } });
  for (const route of aggregator.nativeSnapshot().routes) {
    assert.ok(route.order.length + route.left.length + Number(!!route.affinity?.main) <= 2);
    assert.ok(route.tries.length <= 2);
    assert.ok((route.group?.members.length ?? 0) <= 2);
    assert.ok(route.evidence.reasons.includes('candidate_limit'));
  }
  assert.ok(find(aggregator.nativeSnapshot(), 1).evidence.reasons.includes('attempt_limit'));
});

test('raw byte/route limits reject the entire envelope before changing native cache state', () => {
  const aggregator = start([row(1)], { limits: { responseBytes: 12_000 } });
  const before = aggregator.nativeSnapshot();
  assert.throws(() => aggregator.applyTrace(envelope([row(2, { prompt: { text: 'x'.repeat(12_001) } })]), { full: true }),
    error => error.code === 'payload_limit');
  assert.throws(() => aggregator.applyTrace(envelope([], { ids: Array.from({ length: DEFAULT_LIMITS.routes + 1 }, (_, index) => index) }), { full: true }),
    error => error.code === 'payload_limit');
  assert.deepEqual(aggregator.nativeSnapshot(), before);
});

test('the full native envelope, including metadata and lifted references, stays within its byte budget', () => {
  const responseBytes = 8_000, aggregator = createAggregator({ clock, instanceId: 'native-budget', limits: { responseBytes } });
  const ids = [];
  for (let id = 1; id <= 12; id++) {
    ids.push(id);
    const order = Array.from({ length: 6 }, (_, index) => seat(`${id}-${index}`, { known: true, used: 0, renews: [later],
      price: { input: 0, output: 0 }, rest: { key: `${id}-${index}`, until: later, why: 'rate', by: 'cooldown' } }));
    const lifted = Object.fromEntries(order.map(value => [value.id, later]));
    aggregator.applyTrace(envelope([row(id, { session: `session-${id}`, order, tries: [], done: id % 2 === 0 })],
      { seq: id, ids: [...ids], lifted }), { full: id === 1 });
    const state = aggregator.nativeSnapshot();
    assert.ok(byteSize(state) <= responseBytes);
    assert.deepEqual(state.ids, state.routes.map(route => route.id));
    assert.equal(state.coverage.retained, state.routes.length);
    for (const route of state.routes) assert.equal(route.order.length, 6, 'byte pressure retains complete projected routes');
    const refs = new Set(state.routes.flatMap(route => route.order.map(value => value.rest.key)));
    assert.ok(Object.keys(state.lifted).every(key => refs.has(key)));
  }
  const state = aggregator.nativeSnapshot();
  assert.ok(state.routes.length > 0); assert.ok(state.routes.length < 12);
  assert.ok(state.coverage.reasons.includes('projection_byte_limit'));
  aggregator.setConnection({ status: 'disconnected', gatewayVersion: `1.2.3-${'x'.repeat(80)}` });
  assert.ok(byteSize(aggregator.nativeSnapshot()) <= responseBytes);
});

test('native metadata-only responses fail closed when even the envelope cannot fit', () => {
  const aggregator = createAggregator({ limits: { responseBytes: 128 } });
  assert.throws(() => aggregator.nativeSnapshot(), error => error.status === 502 && error.code === 'payload_limit');
});

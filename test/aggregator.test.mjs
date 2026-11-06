import test from 'node:test';
import assert from 'node:assert/strict';
import { createAggregator } from '../lib/aggregator.mjs';
import { sessionKey } from '../lib/contracts.mjs';
import { buildSessions, calculateMetrics, selectRequests } from '../lib/metrics.mjs';
import { normalizeTrace } from '../lib/privacy.mjs';
import { makeRoute, initialTrace } from './fixtures/trace.mjs';

const all = { kind: 'all', sessionKey: null, includeChildren: false, period: 'live' };
const selected = (agent, session, includeChildren = false) => ({ ...all, kind: 'session', sessionKey: sessionKey(agent, session), includeChildren });
const envelope = (routes, seq = Math.max(0, ...routes.map(row => row.seq)), extra = {}) => ({ object: 'trace', pid: 123,
  serves: 'web', routes, ids: routes.map(row => row.id), seq, ...extra });

test('all surfaces use exact case-sensitive agent/session scope and keep unknown unassigned', () => {
  const aggregator = createAggregator();
  aggregator.applyTrace(initialTrace(), { full: true });
  const a = aggregator.snapshot(selected('claude-code', 'session-alpha'));
  const b = aggregator.snapshot(selected('claude-code', 'session-bravo'));
  const codex = aggregator.snapshot(selected('codex', 'session-alpha'));
  const unknown = aggregator.snapshot({ ...all, kind: 'unknown' });
  assert.deepEqual(a.requests.map(row => row.id).sort(), [101, 103]);
  assert.equal(a.metrics.inFlight, 2);
  assert.deepEqual(a.graph.requestKeys, a.requests.map(row => row.key));
  assert.deepEqual(b.requests.map(row => row.id), [102]);
  assert.deepEqual(codex.requests.map(row => row.id), [104]);
  assert.equal(unknown.requests.length, 1); assert.equal(unknown.requests[0].sessionKey, null);
  assert.equal(aggregator.listSessions().length, 3);
  assert.throws(() => aggregator.snapshot(selected('Claude-Code', 'session-alpha')), error => error.code === 'session_expired');
  a.requests[0].model = 'mutated'; a.sessions[0].agent = 'mutated'; a.connection.status = 'mutated';
  assert.notEqual(aggregator.snapshot(all).requests[0].model, 'mutated');
  assert.notEqual(aggregator.listSessions()[0].agent, 'mutated');
});

test('changed routes replace whole records; retained IDs evict without inventing completion', () => {
  const aggregator = createAggregator();
  const first = makeRoute(1, { seq: 1, folder: 'private', served: 'served-model' });
  aggregator.applyTrace(envelope([first]), { full: true });
  aggregator.applyTrace(envelope([makeRoute(1, { seq: 2, done: true })], 2));
  assert.equal(aggregator.snapshot(all).requests[0].servedModel, null);
  aggregator.applyTrace(envelope([makeRoute(2, { seq: 3 })], 3));
  assert.equal(aggregator.snapshot(all).requests.length, 1);
  aggregator.applyTrace(envelope([], 4));
  const lost = aggregator.snapshot(all);
  assert.equal(lost.requests[0].outcome, 'unavailable');
  assert.equal(lost.requests[0].done, false); assert.equal(lost.metrics.inFlight, 0);
  assert.equal(lost.sessions[0].activeRequests, 0);
  assert.ok(lost.coverage.reasons.includes('trace_evicted'));
});

test('PID, sequence regression and conflicting request identity require atomic full resync', () => {
  for (const update of [
    envelope([makeRoute(1, { seq: 1 })], 1, { pid: 999 }),
    envelope([makeRoute(1, { seq: 1 })], 1),
    envelope([makeRoute(1, { seq: 3, session: 'different' })], 3),
  ]) {
    const aggregator = createAggregator();
    aggregator.applyTrace(envelope([makeRoute(1, { seq: 2 })], 2), { full: true });
    const old = aggregator.snapshot(all);
    assert.equal(aggregator.applyTrace(update).resync, true);
    assert.equal(aggregator.seq, 2);
    assert.equal(aggregator.snapshot(all).requests[0].session, old.requests[0].session);
    aggregator.applyTrace(update, { full: true });
    assert.equal(aggregator.generation, 2);
    assert.notEqual(aggregator.snapshot(all).requests[0].key, old.requests[0].key);
  }
});

test('serves is only a launch mode, unknown retained IDs trigger full resnapshot', () => {
  const aggregator = createAggregator();
  aggregator.applyTrace(envelope([makeRoute(1)]), { full: true });
  aggregator.applyTrace(envelope([], 1, { ids: [1], serves: 'gateway' }));
  assert.equal(aggregator.generation, 1);
  assert.equal(aggregator.applyTrace(envelope([], 2, { ids: [1, 2] })).resync, true);
  assert.equal(aggregator.seq, 1);
});

test('malformed envelopes cannot advance cursor or partially poison cached data', () => {
  const aggregator = createAggregator();
  aggregator.applyTrace(envelope([makeRoute(1)]), { full: true });
  for (const raw of [envelope([makeRoute(2)], 2, { ids: [2, 2] }), envelope([makeRoute(2), { id: 3 }], 3),
    envelope([makeRoute(2)], 2, { ids: [2, 3] }), { object: 'trace', seq: 3 }]) {
    assert.throws(() => aggregator.applyTrace(raw, { full: true }));
    assert.equal(aggregator.seq, 1); assert.equal(aggregator.snapshot(all).requests[0].id, 1);
  }
});

test('child inclusion is explicit, same-agent, cycle-safe and excludes inferred relationships', () => {
  const aggregator = createAggregator();
  const routes = [
    makeRoute(1, { session: 'parent' }),
    makeRoute(2, { session: 'parent', subagentId: 'shared-header-worker' }),
    makeRoute(3, { session: 'child', parentSession: 'parent', subagentId: 'child-worker' }),
    makeRoute(4, { session: 'grandchild', parentSession: 'child' }),
    makeRoute(5, { session: 'inferred', parentSession: 'parent', parentMatched: true }),
    makeRoute(6, { agent: 'codex', session: 'cross-agent', parentSession: 'parent' }),
    makeRoute(7, { session: 'cycle-a', parentSession: 'cycle-b' }),
    makeRoute(8, { session: 'cycle-b', parentSession: 'cycle-a' }),
  ];
  aggregator.applyTrace(envelope(routes), { full: true });
  assert.deepEqual(aggregator.snapshot(selected('claude-code', 'parent')).requests.map(row => row.id), [1]);
  assert.deepEqual(aggregator.snapshot(selected('claude-code', 'parent', true)).requests.map(row => row.id).sort(), [1, 2, 3, 4]);
  assert.equal(aggregator.snapshot(selected('claude-code', 'child')).requests.length, 1);
  const sessions = aggregator.listSessions();
  assert.equal(sessions.find(row => row.key === sessionKey('claude-code', 'cycle-a')).parentKey, null);
  assert.equal(sessions.find(row => row.key === sessionKey('claude-code', 'cycle-b')).parentKey, null);
  assert.equal(sessions.find(row => row.key === sessionKey('codex', 'cross-agent')).parentKey, null);
});

test('Codex kind-only subagents sharing a header are excluded from direct parent traffic', () => {
  const aggregator = createAggregator();
  aggregator.applyTrace(envelope([
    makeRoute(1, { agent: 'codex', session: 'parent' }),
    ...['collab_spawn', 'thread_spawn', 'agent_job'].map((kind, index) => makeRoute(index + 2, { agent: 'codex', session: 'parent', kind })),
  ]), { full: true });
  assert.deepEqual(aggregator.snapshot(selected('codex', 'parent')).requests.map(row => row.id), [1]);
  assert.equal(aggregator.snapshot(selected('codex', 'parent')).metrics.inFlight, 1);
  assert.equal(aggregator.snapshot(selected('codex', 'parent', true)).requests.length, 4);
  assert.equal(aggregator.snapshot(all).requests.length, 4);
});

test('verified independent native children are selectable without inventing direct unknown actors', () => {
  const records = [
    { ...normalizeTrace(makeRoute(1, { session: 'child', subagentId: 'worker' })), isIndependentSubagent: true },
    normalizeTrace(makeRoute(2, { session: 'child', subagentId: 'shared-header-worker' })),
    { ...normalizeTrace(makeRoute(3, { session: 'child' })), isIndependentSubagent: true, reasons: ['actor_unknown'] },
  ];
  const sessions = buildSessions(records);
  assert.deepEqual(selectRequests(records, sessions, selected('claude-code', 'child')).map(row => row.id), [1]);
  assert.equal(selectRequests(records, sessions, selected('claude-code', 'child', true)).length, 3);
  assert.equal(records[0].isSubagent, true);
});

test('session latest metadata resolves ingestion ties by source time then numeric ID regardless of order', () => {
  const at = '2026-11-06T13:00:00.000Z';
  const rows = [
    makeRoute(1, { model: 'older', provider: 'older-provider', folder: '/older', order: [], tries: [] }),
    makeRoute(2, { time: '2026-11-06T12:01:00.000Z', model: 'newer', provider: 'newer-provider', folder: '/newer', order: [], tries: [] }),
  ];
  for (const routes of [rows, [...rows].reverse()]) {
    const aggregator = createAggregator({ clock: () => Date.parse(at), showFolders: true });
    aggregator.applyTrace(envelope(routes), { full: true });
    const session = aggregator.listSessions()[0];
    assert.equal(session.lastActivity, at);
    assert.equal(session.lastModel, 'newer');
    assert.equal(session.lastProvider, 'newer-provider');
    assert.equal(session.folder, '/newer');
  }
  const tied = [2, 10].map(id => normalizeTrace(makeRoute(id, { model: `model-${id}` }), { updatedAt: at }));
  assert.equal(buildSessions(tied)[0].lastModel, 'model-10');
  assert.equal(buildSessions([...tied].reverse())[0].lastModel, 'model-10');
  const keys = tied.map((row, index) => ({ ...row, id: null, key: `ledger:${index}` }));
  assert.equal(buildSessions(keys)[0].lastModel, buildSessions([...keys].reverse())[0].lastModel);
});

test('handed-on-only usage never increments request, failure or active counters', () => {
  const direct = normalizeTrace(makeRoute(1, { done: true }));
  const orphan = { ...normalizeTrace(makeRoute(2)), reasons: ['handed_on_only'], tokens: 40, cost: 0.2, priced: true };
  for (const outcome of ['in-flight', 'failed']) {
    const records = [direct, { ...orphan, outcome }];
    const metrics = calculateMetrics(records);
    const sessions = buildSessions(records);
    assert.equal(metrics.requests, 1);
    assert.equal(metrics.inFlight, 0);
    assert.equal(metrics.failed, 0);
    assert.equal(metrics.pricedRequests, 0);
    assert.equal(metrics.unpricedRequests, 1);
    assert.equal(metrics.tokens, 140);
    assert.equal(metrics.cost, 0.2);
    assert.equal(sessions[0].requestCount, 1);
    assert.equal(sessions[0].activeRequests, 0);
  }
});

test('evicted IDs reused after a hidden reset get a new local generation', () => {
  const aggregator = createAggregator();
  aggregator.applyTrace(envelope([makeRoute(1, { done: true })]), { full: true });
  const key = aggregator.snapshot(all).requests[0].key;
  aggregator.applyTrace(envelope([], 2));
  const reused = envelope([makeRoute(1, { seq: 3, time: '2026-11-06T13:00:00Z' })], 3);
  assert.equal(aggregator.applyTrace(reused).resync, true);
  aggregator.applyTrace(reused, { full: true });
  assert.equal(aggregator.generation, 2); assert.notEqual(aggregator.snapshot(all).requests[0].key, key);
});

test('detected reset remains pending even when the subsequent full sequence overtakes the old one', () => {
  const aggregator = createAggregator();
  aggregator.applyTrace(envelope([makeRoute(1, { seq: 20 })], 20), { full: true });
  assert.equal(aggregator.applyTrace(envelope([], 1)).resync, true);
  aggregator.applyTrace(envelope([makeRoute(2, { seq: 21 })], 21), { full: true });
  assert.equal(aggregator.generation, 2);
  assert.equal(aggregator.snapshot(all).requests.some(row => row.id === 1), false);
});

test('unavailable attempts are not left attempting and tombstones expire', () => {
  let now = Date.parse('2026-11-06T12:00:00Z');
  const aggregator = createAggregator({ clock: () => now });
  aggregator.applyTrace(envelope([makeRoute(1)]), { full: true });
  aggregator.applyTrace(envelope([], 2));
  const state = aggregator.snapshot(all);
  assert.equal(state.requests[0].attempts[0].outcome, 'unavailable');
  assert.equal(state.requests[0].candidates.some(row => row.state === 'attempting'), false);
  now += 300_001; aggregator.applyTrace(envelope([], 2));
  assert.equal(aggregator.snapshot(all).requests.length, 0);
});

const byteSize = value => Buffer.byteLength(JSON.stringify(value));
const fixedClock = () => Date.parse('2026-11-06T12:02:00Z');
const compactRoute = id => ({ id, seq: id, time: '2026-11-06T12:00:00Z', done: true, status: 200,
  agent: 'codex', session: `session-${id}-${'界'.repeat(90)}`, model: `model-${'x'.repeat(80)}`, provider: 'provider-a', order: [], tries: [] });

test('response budget includes sessions, graph, metrics and envelope, not just record bytes', () => {
  const responseBytes = 6_000;
  const aggregator = createAggregator({ limits: { responseBytes }, clock: fixedClock, instanceId: 'budget-test' });
  const rows = Array.from({ length: 5 }, (_, index) => compactRoute(index + 1));
  assert.ok(byteSize(envelope(rows)) < responseBytes);
  aggregator.applyTrace(envelope(rows), { full: true });
  const state = aggregator.snapshot(all);
  assert.ok(byteSize(state) <= responseBytes, `${byteSize(state)} exceeds ${responseBytes}`);
  assert.ok(state.requests.length > 0);
  assert.ok(state.requests.length < rows.length);
  assert.ok(state.coverage.reasons.includes('projection_byte_limit'));
  assert.equal(state.metrics.requests, state.requests.length);
  assert.equal(state.coverage.retained, state.requests.length);
  assert.deepEqual(state.graph.requestKeys, state.requests.map(row => row.key));
  for (const session of state.sessions) {
    assert.equal(session.requestCount, state.requests.filter(row => row.sessionKey === session.key).length);
  }
  for (const row of state.requests) {
    assert.deepEqual(row, normalizeTrace(rows.find(raw => raw.id === row.id), { updatedAt: new Date(fixedClock()).toISOString() }));
  }
  // Selecting a session outside the reduced All view is still authoritative;
  // budget truncation must not turn it into an expired selection.
  const omitted = aggregator.listSessions().find(session => !state.sessions.some(shown => shown.key === session.key));
  assert.ok(omitted);
  const own = aggregator.snapshot({ ...all, kind: 'session', sessionKey: omitted.key });
  assert.ok(byteSize(own) <= responseBytes);
  assert.equal(own.requests[0].sessionKey, omitted.key);
  assert.ok(own.sessions.some(row => row.key === own.scope.sessionKey));
  aggregator.setConnection({ status: 'disconnected', reason: 'gateway_unavailable', gatewayVersion: `1.2.3-${'x'.repeat(80)}` });
  assert.ok(byteSize(aggregator.snapshot(all)) <= responseBytes);
});

test('a small response budget preserves one complete request when its complete state fits', () => {
  const row = compactRoute(1);
  const baseline = createAggregator({ clock: fixedClock, instanceId: 'one-record' });
  baseline.applyTrace(envelope([row]), { full: true });
  const responseBytes = byteSize(baseline.snapshot(all)) + 100;
  const aggregator = createAggregator({ clock: fixedClock, instanceId: 'one-record', limits: { responseBytes } });
  aggregator.applyTrace(envelope([row]), { full: true });
  aggregator.applyTrace(envelope([compactRoute(2)], 2, { ids: [1, 2] }));
  const state = aggregator.snapshot(all);
  assert.equal(state.requests.length, 1);
  assert.equal(state.sessions.length, 1);
  assert.equal(state.graph.requestKeys.length, 1);
  assert.ok(byteSize(state) <= responseBytes);
});

test('an oversized first representation does not displace a smaller complete request from the cache', () => {
  const responseBytes = 3_500;
  const small = { id: 1, seq: 1, time: '2026-11-06T12:00:00Z', agent: 'codex', session: 'small', done: true, order: [], tries: [] };
  const big = { ...small, id: 2, seq: 2, done: false, agent: 'a'.repeat(256), session: 's'.repeat(512),
    model: 'm'.repeat(256), provider: 'p'.repeat(256) };
  const aggregator = createAggregator({ clock: fixedClock, instanceId: 't', limits: { responseBytes } });
  aggregator.applyTrace(envelope([small, big]), { full: true });
  const state = aggregator.snapshot(all);
  assert.deepEqual(state.requests.map(row => row.id), [1]);
  assert.equal(state.sessions.length, 1);
  assert.ok(byteSize(state) <= responseBytes);
  assert.ok(state.coverage.reasons.includes('projection_byte_limit'));
});

test('limits below even an empty snapshot envelope fail closed with an explicit payload error', () => {
  const aggregator = createAggregator({ limits: { responseBytes: 128 } });
  assert.throws(() => aggregator.snapshot(all), error => error.code === 'payload_limit' && error.status === 502);
});

test('representative multi-candidate incremental responses stay within their full serialized byte limit', () => {
  const responseBytes = 12_000;
  const aggregator = createAggregator({ clock: fixedClock, instanceId: 'topology-budget', limits: { responseBytes } });
  const ids = [];
  for (let id = 1; id <= 8; id++) {
    ids.push(id);
    const row = makeRoute(id, { session: `session-${id}`, done: id % 2 === 0, fallback: true });
    aggregator.applyTrace(envelope([row], id, { ids: [...ids] }), { full: id === 1 });
  }
  const state = aggregator.snapshot(all);
  assert.ok(state.requests.length > 0);
  assert.ok(state.requests.length < 8);
  assert.ok(byteSize(state) <= responseBytes, `${byteSize(state)} exceeds ${responseBytes}`);
  assert.equal(state.requests.some(row => row.attempts.length !== 2 || row.candidates.length !== 2), false);
  assert.equal(state.metrics.inFlight, 4);
  assert.equal(state.metrics.requests, state.requests.length);
  assert.equal(state.unknownRequests, 0);
});

test('capacity is bounded, unfinished traffic has priority and disconnection marks cached data stale', () => {
  const aggregator = createAggregator({ limits: { routes: 2, sessions: 1 } });
  aggregator.applyTrace(envelope([makeRoute(1), makeRoute(2, { done: true }), makeRoute(3, { session: 'b' })]), { full: true });
  const state = aggregator.snapshot(all);
  assert.ok(state.requests.length <= 2); assert.equal(state.sessions.length, 1);
  assert.ok(state.coverage.reasons.includes('session_limit'));
  aggregator.setConnection({ status: 'disconnected', reason: 'raw error private-account@example.invalid' });
  assert.equal(aggregator.snapshot(all).connection.status, 'stale');
  assert.equal(aggregator.snapshot(all).connection.reason, null);
  assert.ok(aggregator.snapshot(all).connection.lastUpdated);
  aggregator.clear(); assert.equal(aggregator.snapshot(all).requests.length, 0);
});

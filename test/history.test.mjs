import test from 'node:test';
import assert from 'node:assert/strict';
import { setTimeout as delay } from 'node:timers/promises';
import { createHistory } from '../lib/history.mjs';
import { createAggregator } from '../lib/aggregator.mjs';
import { sessionKey } from '../lib/contracts.mjs';
import { makeRoute } from './fixtures/trace.mjs';

const all = { kind: 'all', sessionKey: null, includeChildren: false, period: 'today' };
const selected = (agent, session, includeChildren = false) => ({ ...all, kind: 'session', sessionKey: sessionKey(agent, session), includeChildren });
const row = (id, extra = {}) => ({ route_id: id, t: `2026-11-06T12:00:${String(id % 60).padStart(2, '0')}.000Z`,
  agent: 'claude-code', session: 'a', provider: 'provider', model: 'model-a', req: 'group/team',
  in: 10, out: 20, cache_read: 30, cache_write: 40, ms: 1000, ttft_ms: 40,
  status: 200, cost: 0.5, priced: true, ...extra });
function fixture(rows, options = {}) {
  const calls = [];
  const gateway = { async usage({ period, offset, limit }) {
    calls.push({ period, offset, limit });
    return { period, rows: rows.slice(offset, offset + limit), offset, total: rows.length,
      cost: 999999, through: { requests: 999999 }, tokens: 999999 };
  } };
  const aggregator = createAggregator();
  const history = createHistory({ gateway, aggregator, ...options });
  return { calls, gateway, aggregator, history };
}

test('shared scan is scope-independent; metrics never reuse envelope totals', async () => {
  const { calls, history } = fixture([row(1), row(2, { session: 'b' }), row(3, { agent: 'codex' }), row(4, { session: '' })]);
  const [a, b, codex, unknown] = await Promise.all([
    history.snapshot(selected('claude-code', 'a')), history.snapshot(selected('claude-code', 'b')),
    history.snapshot(selected('codex', 'a')), history.snapshot({ ...all, kind: 'unknown' }),
  ]);
  assert.equal(calls.length, 1);
  for (const state of [a, b, codex, unknown]) {
    assert.equal(state.metrics.requests, 1); assert.equal(state.metrics.tokens, 100); assert.equal(state.metrics.cost, 0.5);
    assert.deepEqual(state.graph.requestKeys, state.requests.map(request => request.key));
  }
  assert.equal(a.requests[0].session, 'a'); assert.equal(b.requests[0].session, 'b');
  assert.equal(unknown.requests[0].sessionKey, null);
  assert.equal(a.requests[0].attempts.length, 0); assert.equal(a.metrics.retries, null);
  assert.ok(a.coverage.label.includes('gateway-local calendar days'));
  assert.ok(a.coverage.reasons.includes('local_rejections_and_probes_excluded'));
  await history.stop();
});

test('pagination uses detached immutable snapshots and explicitly expires', async () => {
  let now = Date.parse('2026-11-06T13:00:00Z');
  const rows = [row(1), row(2), row(3)];
  const { history, calls } = fixture(rows, { clock: () => now, limits: { historyTTL: 100 } });
  const first = await history.snapshot(all, { limit: 1 });
  const id = first.pagination.snapshotId;
  rows.unshift(row(4)); first.requests[0].session = 'MUTATED';
  const second = await history.snapshot(all, { limit: 1, offset: 1, snapshotId: id });
  const sameFirst = await history.snapshot(all, { limit: 1, snapshotId: id });
  assert.equal(first.metrics.requests, 3); assert.equal(second.metrics.requests, 3);
  assert.notEqual(second.requests[0].key, first.requests[0].key);
  assert.equal(sameFirst.requests[0].session, 'a'); assert.equal(calls.length, 1);
  await assert.rejects(history.snapshot(all, { offset: 1 }), error => error.code === 'history_expired');
  await assert.rejects(history.snapshot({ ...all, period: '7d' }, { snapshotId: id }), error => error.code === 'history_expired');
  now += 101;
  await assert.rejects(history.snapshot(all, { offset: 1, snapshotId: id }), error => error.code === 'history_expired');
  assert.equal((await history.snapshot(all)).metrics.requests, 4);
  assert.equal(calls.length, 2); await history.stop();
});

test('handed-on usage is counted without double-counting requests or inventing attempt order', async () => {
  const final = row(1, { t: '2026-11-06T12:00:00Z', ms: 1000, tries: 3 });
  const { history } = fixture([
    row(1, { ...final, t: '2026-11-06T12:00:00.500Z', status: 429, handed_on: true, cost: 0.2, priced: true }),
    final,
    row(1, { ...final, t: '2026-11-06T12:00:00.100Z', status: 500, handed_on: true, cost: 0, priced: false }),
  ]);
  const state = await history.snapshot(selected('claude-code', 'a'));
  assert.equal(state.metrics.requests, 1); assert.equal(state.metrics.failed, 0); assert.equal(state.metrics.tokens, 300);
  assert.equal(state.metrics.cost, 0.7); assert.equal(state.metrics.pricedRequests, 0); assert.equal(state.metrics.unpricedRequests, 1);
  assert.equal(state.requests[0].status, 200); assert.equal(state.requests[0].priced, false);
  assert.equal(state.requests[0].attempts.length, 0); assert.equal(state.metrics.retries, null); assert.equal(state.metrics.fallbacks, null);
  assert.ok(state.metrics.partial); await history.stop();
});

test('orphaned billable tries keep cost/tokens but are not completed or failed requests', async () => {
  const { history } = fixture([row(1, { handed_on: true, status: 429 })]);
  const state = await history.snapshot(all);
  assert.equal(state.metrics.requests, 0); assert.equal(state.metrics.failed, 0); assert.equal(state.metrics.inFlight, 0);
  assert.equal(state.metrics.tokens, 100); assert.equal(state.metrics.cost, 0.5);
  assert.equal(state.requests[0].outcome, 'unknown'); assert.ok(state.coverage.partial); await history.stop();
});

test('retained trace joins require ID, exact start, original client and native session evidence', async () => {
  const { history, aggregator } = fixture([
    row(1, { t: '2026-11-06T12:00:00Z', agent: 'alias', client: 'claude-code' }),
    row(2, { t: '2026-11-06T12:00:00Z', session: 'wrong-session' }),
    row(3, { t: '2026-11-06T12:00:01Z' }),
    row(4, { t: '2026-11-06T12:00:00Z', agent: 'codex', session_role: 'subagent', session: 'canonical-root', native_session: 'native-child', subagent: 'worker' }),
    row(5, { t: '2026-11-06T12:00:00Z', agent: 'codex', session_role: 'subagent', session: 'canonical-root', subagent: 'worker' }),
  ]);
  const routes = [1, 2, 3, 4, 5].map(id => makeRoute(id, { session: id < 4 ? 'a' : 'native-child', agent: id < 4 ? 'claude-code' : 'codex', done: true, fallback: true }));
  aggregator.applyTrace({ object: 'trace', seq: 5, pid: 1, ids: routes.map(route => route.id), routes }, { full: true });
  const state = await history.snapshot(all);
  const byId = new Map(state.requests.map(request => [request.id, request]));
  assert.equal(byId.get(1).attempts.length, 2); assert.equal(byId.get(1).fallbacks, 1); assert.equal(byId.get(1).ttft, 40);
  assert.equal(byId.get(2).attempts.length, 0); assert.equal(byId.get(3).attempts.length, 0);
  assert.equal(byId.get(4).session, 'native-child'); assert.equal(byId.get(4).attempts.length, 2);
  assert.equal(byId.get(5).sessionKey, null); assert.equal(byId.get(5).attempts.length, 0);
  assert.equal(state.sessions.some(session => session.key === sessionKey('codex', 'canonical-root')), false);
  await history.stop();
});

test('subordinate ledger actors are opt-in, and canonical unknown actors remain unassigned', async () => {
  const { history } = fixture([row(1), row(2, { subagent: 'worker' }), row(3, { agent: 'codex', session_role: 'unknown' })]);
  assert.equal((await history.snapshot(selected('claude-code', 'a'))).metrics.requests, 1);
  assert.equal((await history.snapshot(selected('claude-code', 'a', true))).metrics.requests, 2);
  const unknown = await history.snapshot({ ...all, kind: 'unknown' });
  assert.equal(unknown.metrics.requests, 1); await history.stop();
});

test('bounded partial scans disclose changing pages, dropped sources and missing measurements', async () => {
  const { history, gateway, calls } = fixture([], { limits: { historyPageSize: 2, historyPages: 2 } });
  let page = 0;
  gateway.usage = async ({ period, offset, limit }) => {
    calls.push({ offset, limit }); page++;
    return { period, offset, total: page === 1 ? 10 : 11, rows: page === 1 ? [row(1), row(2)] : [row(2), row(3, { source: 'log' })] };
  };
  const state = await history.snapshot(all);
  assert.equal(calls.length, 2); assert.equal(state.metrics.requests, 2);
  for (const reason of ['changing_pages', 'non_atomic_pages', 'scan_page_limit', 'rows_withheld']) assert.ok(state.coverage.reasons.includes(reason), reason);
  assert.equal(state.coverage.scanned, 4); assert.equal(state.coverage.available, 11);
  await history.stop();
});

test('all periods share one scan slot; one browser abort does not cancel other users', async () => {
  let active = 0, peak = 0, calls = 0;
  const gateway = { async usage({ period, offset }) { calls++; active++; peak = Math.max(peak, active);
    try { await delay(15); return { period, offset, total: 1, rows: [row(1)] }; } finally { active--; }
  } };
  const history = createHistory({ gateway, aggregator: createAggregator() });
  const controller = new AbortController();
  const first = history.snapshot(all, { signal: controller.signal });
  const other = history.snapshot(all);
  const week = history.snapshot({ ...all, period: '7d' });
  const month = history.snapshot({ ...all, period: '30d' });
  controller.abort(); await assert.rejects(first, { name: 'AbortError' });
  const states = await Promise.all([other, week, month]);
  assert.equal(states.length, 3); assert.equal(calls, 3); assert.equal(peak, 1); await history.stop();
});

test('history scan caps rows, response bytes, duration and cached snapshot count', async () => {
  const limited = fixture([row(1), row(2), row(3)], { limits: { historyRows: 2 } });
  const state = await limited.history.snapshot(all);
  assert.equal(state.coverage.scanned, 2); assert.ok(state.coverage.reasons.includes('scan_row_limit'));
  await limited.history.stop();
  const bytes = fixture([row(1, { body: 'PRIVATE'.repeat(1000) })], { limits: { responseBytes: 3000 } });
  const partial = await bytes.history.snapshot(all);
  assert.equal(partial.requests.length, 0); assert.ok(partial.coverage.reasons.includes('scan_byte_limit'));
  await bytes.history.stop();
  const cached = fixture([row(1)], { limits: { historySnapshots: 1 } });
  const today = await cached.history.snapshot(all);
  await cached.history.snapshot({ ...all, period: '7d' });
  await assert.rejects(cached.history.snapshot(all, { snapshotId: today.pagination.snapshotId }), error => error.code === 'history_expired');
  await cached.history.stop();
  let calls = 0;
  const gateway = { async usage({ period, offset, signal }) {
    if (++calls === 1) return { period, offset, total: 2, rows: [row(1)] };
    await delay(10_000, undefined, { signal });
  } };
  const history = createHistory({ gateway, aggregator: createAggregator(), limits: { historyTimeout: 20, historyPageSize: 1 } });
  const timed = await history.snapshot(all);
  assert.equal(timed.requests.length, 1); assert.ok(timed.coverage.reasons.includes('scan_timeout'));
  await history.stop();
});

test('changing prices on an overlapping page cannot double-count a request', async () => {
  let calls = 0;
  const gateway = { async usage({ period, offset }) { calls++;
    return { period, offset, total: 2, rows: [row(1, { cost: calls === 1 ? 0.5 : 0.9 })] };
  } };
  const history = createHistory({ gateway, aggregator: createAggregator(), limits: { historyPageSize: 1 } });
  const state = await history.snapshot(all);
  assert.equal(state.metrics.requests, 1); assert.equal(state.metrics.cost, 0.5);
  assert.ok(state.coverage.reasons.includes('changing_pages')); await history.stop();
});

test('shifted pages coalesce query-time actor enrichment without charging the source entry twice', async t => {
  const native = 'native-child';
  const unknown = row(1, { agent: 'codex', t: '2026-11-06T12:00:00Z', session: native, native_session: native, session_role: 'unknown' });
  for (const role of ['main', 'subagent']) for (const reverse of [false, true]) {
    await t.test(`${role}, known annotation ${reverse ? 'first' : 'last'}`, async t => {
      const known = { ...unknown, session_role: role, session: role === 'subagent' ? 'canonical-root' : native,
        ...(role === 'subagent' ? { subagent: native } : {}) };
      const rows = reverse ? [known, unknown] : [unknown, known];
      const { history, aggregator } = fixture(rows, { limits: { historyPageSize: 1 } });
      t.after(() => history.stop());
      const trace = makeRoute(1, { agent: 'codex', session: native, done: true });
      aggregator.applyTrace({ object: 'trace', seq: 1, pid: 1, ids: [1], routes: [trace] }, { full: true });
      const state = await history.snapshot(all);
      assert.equal(state.metrics.requests, 1); assert.equal(state.metrics.tokens, 100); assert.equal(state.metrics.cost, 0.5);
      assert.equal(state.requests[0].session, native);
      assert.equal(state.requests[0].reasons.includes('actor_unknown'), false);
      assert.equal(state.requests[0].isSubagent, role === 'subagent');
      assert.ok(state.coverage.reasons.includes('changing_pages'));
      assert.equal((await history.snapshot(selected('codex', native))).metrics.requests, 1);
    });
  }
});

test('query-time annotation changes on a handed-on entry do not bill the failed attempt twice', async t => {
  const time = '2026-11-06T12:00:00Z';
  const shared = { t: time, agent: 'codex', session: 'a', native_session: 'a', providerAccount: 'PRIVATE-account@example.invalid' };
  const f = fixture([
    row(1, { ...shared, handed_on: true, status: 429, session_role: 'unknown' }),
    row(1, { ...shared, handed_on: true, status: 429, session_role: 'main' }),
    row(1, { ...shared, tries: 2, session_role: 'main' }),
  ], { limits: { historyPageSize: 1 } });
  t.after(() => f.history.stop());
  f.aggregator.applyTrace({ object: 'trace', seq: 1, pid: 1, ids: [1],
    routes: [makeRoute(1, { agent: 'codex', session: 'a', done: true, fallback: true })] }, { full: true });
  const state = await f.history.snapshot(selected('codex', 'a'));
  assert.equal(state.metrics.requests, 1); assert.equal(state.metrics.failed, 0);
  assert.equal(state.metrics.tokens, 200); assert.equal(state.metrics.cost, 1); assert.equal(state.metrics.fallbacks, 1);
  assert.ok(state.coverage.reasons.includes('changing_pages')); assert.equal(JSON.stringify(state).includes('PRIVATE'), false);
});

test('dedup preserves distinct billable attempts and account/key IDs without exposing private fields', async t => {
  const final = row(1, { t: '2026-11-06T12:00:00Z', tries: 7 });
  const attempts = [
    { providerAccount: 'PRIVATE-account-a@example.invalid' }, { providerAccount: 'PRIVATE-account-b@example.invalid' },
    { providerKeyId: 'PRIVATE-key-a' }, { providerKeyId: 'PRIVATE-key-b' },
    { providerKeyId: 'PRIVATE-key-b', rid: 'PRIVATE-try-one' }, { providerKeyId: 'PRIVATE-key-b', rid: 'PRIVATE-try-two' },
  ].map(account => ({ ...final, ...account, t: '2026-11-06T12:00:00.100Z', handed_on: true, status: 429 }));
  const f = fixture([final, ...attempts, ...attempts], { limits: { historyPageSize: 2 } });
  t.after(() => f.history.stop());
  const state = await f.history.snapshot(all);
  assert.equal(state.metrics.requests, 1); assert.equal(state.metrics.tokens, 700); assert.equal(state.metrics.cost, 3.5);
  assert.equal(JSON.stringify(state).includes('PRIVATE'), false);

  // Distinct upstream request IDs/accounts are not the same source entry even
  // when gateway IDs, timestamps and display-safe provider fields coincide.
  const distinct = fixture([
    { ...final, providerAccount: 'PRIVATE-a@example.invalid', rid: 'PRIVATE-request-a' },
    { ...final, providerAccount: 'PRIVATE-b@example.invalid', rid: 'PRIVATE-request-b' },
    { ...final, session: 'other-session', providerAccount: 'PRIVATE-a@example.invalid', rid: 'PRIVATE-request-a' },
  ]);
  t.after(() => distinct.history.stop());
  const separated = await distinct.history.snapshot(all);
  assert.equal(separated.metrics.requests, 3); assert.equal(separated.metrics.cost, 1.5);
  assert.equal(JSON.stringify(separated).includes('PRIVATE'), false);
});

test('ambiguous changing annotations withhold duplicate charges without choosing a session', async t => {
  for (const [firstRole, secondRole] of [['main', 'main'], ['unknown', 'main'], ['unknown', 'subagent']]) {
    await t.test(`${firstRole} to ${secondRole} without retained native evidence`, async t => {
      const f = fixture([
        row(1, { agent: 'codex', session_role: firstRole, session: 'one' }),
        row(1, { agent: 'codex', session_role: secondRole, session: 'two', ...(secondRole === 'subagent' ? { subagent: 'child' } : {}) }),
      ], { limits: { historyPageSize: 1 } });
      t.after(() => f.history.stop());
      const state = await f.history.snapshot(all);
      assert.equal(state.metrics.requests, 1); assert.equal(state.metrics.tokens, 100); assert.equal(state.metrics.cost, 0.5);
      assert.equal(state.requests[0].sessionKey, null); assert.equal(state.sessions.length, 0);
      assert.ok(state.coverage.reasons.includes('ambiguous_duplicate_usage_withheld'));
      assert.ok(state.coverage.partial);
    });
  }
});

test('exact unique trace identity joins internal group references to public auto references without guessing models', async t => {
  // provider.PublicRef publishes auto/<vendor-spelling>; usage keeps the
  // internal group/auto-<slug>. The spelling depends on the live catalog.
  const f = fixture([row(1, { t: '2026-11-06T12:00:00Z', req: 'group/auto-model-1-2', agent: 'codex',
    session_role: 'main', session: 'a', native_session: 'a' })]);
  t.after(() => f.history.stop());
  const route = makeRoute(1, { agent: 'codex', session: 'a', done: true, fallback: true, model: 'auto/model-1.2' });
  f.aggregator.applyTrace({ object: 'trace', seq: 1, pid: 1, ids: [1], routes: [route] }, { full: true });
  const state = await f.history.snapshot(selected('codex', 'a'));
  assert.equal(state.requests[0].model, 'group/auto-model-1-2');
  assert.equal(state.requests[0].attempts.length, 2); assert.equal(state.metrics.fallbacks, 1);

  const trace = f.aggregator.snapshot({ ...all, period: 'live' }).requests[0];
  const ambiguous = fixture([row(1, { t: route.time })], { aggregator: { snapshot: () => ({ ...state,
    requests: [{ ...trace, agent: 'claude-code', key: 'one', model: 'group/team' },
      { ...trace, agent: 'claude-code', key: 'two', model: 'auto/model-1.2' }] }) } });
  t.after(() => ambiguous.history.stop());
  assert.equal((await ambiguous.history.snapshot(all)).requests[0].attempts.length, 0,
    'model spelling must not disambiguate two otherwise identical trace identities');
});

test('unknown actor evidence follows the effective override session and never proves a main actor', async t => {
  const f = fixture([row(1, { t: '2026-11-06T12:00:00Z', agent: 'codex', session_role: 'unknown',
    session: 'effective-override', native_session: 'original-header' }),
    row(2, { t: '2026-11-06T12:00:00Z', agent: 'codex', session_role: 'unknown',
      session: 'different-override', native_session: 'original-header' })]);
  t.after(() => f.history.stop());
  const routes = [makeRoute(1, { agent: 'codex', session: 'effective-override', done: true }),
    makeRoute(2, { agent: 'codex', session: 'original-header', done: true })];
  f.aggregator.applyTrace({ object: 'trace', seq: 2, pid: 1, ids: [1, 2], routes }, { full: true });
  const state = await f.history.snapshot(all), byId = new Map(state.requests.map(request => [request.id, request]));
  assert.equal(byId.get(1).session, 'effective-override'); assert.equal(byId.get(1).attempts.length, 1);
  assert.ok(byId.get(1).reasons.includes('actor_unknown'));
  assert.equal(byId.get(2).sessionKey, null); assert.equal(byId.get(2).attempts.length, 0);
  assert.equal(state.sessions.some(session => session.key === sessionKey('codex', 'original-header')), false);
  assert.equal((await f.history.snapshot(selected('codex', 'effective-override'))).metrics.requests, 0);
  assert.equal((await f.history.snapshot(selected('codex', 'effective-override', true))).metrics.requests, 1);
});

test('only validated native-child ownership enables independent subagent inspection', async t => {
  const f = fixture([
    row(1, { t: '2026-11-06T12:00:00Z', agent: 'codex', session_role: 'subagent', session: 'root', native_session: 'child', subagent: 'child' }),
    row(2, { t: '2026-11-06T12:00:00Z', agent: 'codex', session_role: 'subagent', session: 'root', native_session: 'root', subagent: 'shared-worker' }),
    row(3, { t: '2026-11-06T12:00:00Z', agent: 'codex', session_role: 'subagent', session: 'root', native_session: 'unconfirmed', subagent: 'unconfirmed' }),
  ]);
  t.after(() => f.history.stop());
  const routes = [makeRoute(1, { agent: 'codex', session: 'child', done: true }), makeRoute(2, { agent: 'codex', session: 'root', done: true })];
  f.aggregator.applyTrace({ object: 'trace', seq: 2, pid: 1, ids: [1, 2], routes }, { full: true });
  const state = await f.history.snapshot(all), byId = new Map(state.requests.map(request => [request.id, request]));
  assert.equal(byId.get(1).isSubagent, true); assert.equal(byId.get(1).isIndependentSubagent, true);
  assert.equal(byId.get(1).parentSessionKey, null);
  assert.notEqual(byId.get(2).isIndependentSubagent, true); assert.notEqual(byId.get(3).isIndependentSubagent, true);
  assert.equal(byId.get(3).sessionKey, null);
  assert.equal((await f.history.snapshot(selected('codex', 'child'))).metrics.requests, 1);
  assert.equal((await f.history.snapshot(selected('codex', 'root'))).metrics.requests, 0);
  assert.equal((await f.history.snapshot(selected('codex', 'root', true))).metrics.requests, 1);
});

test('conflicting actor annotations cannot reuse a validated trace to promote direct traffic', async t => {
  const shared = { t: '2026-11-06T12:00:00Z', agent: 'codex', session: 'root', native_session: 'child' };
  const f = fixture([
    row(1, { ...shared, session_role: 'subagent', subagent: 'child' }),
    row(1, { ...shared, session_role: 'main' }),
    row(1, { ...shared, session_role: 'subagent', subagent: 'child' }),
  ], { limits: { historyPageSize: 1 } });
  t.after(() => f.history.stop());
  f.aggregator.applyTrace({ object: 'trace', seq: 1, pid: 1, ids: [1],
    routes: [makeRoute(1, { agent: 'codex', session: 'child', done: true })] }, { full: true });
  const state = await f.history.snapshot(all);
  assert.equal(state.metrics.requests, 1); assert.equal(state.metrics.cost, 0.5);
  assert.equal(state.requests[0].sessionKey, null); assert.equal(state.requests[0].attempts.length, 0);
  assert.notEqual(state.requests[0].isIndependentSubagent, true); assert.equal(state.sessions.length, 0);
  assert.ok(state.coverage.reasons.includes('ambiguous_duplicate_usage_withheld'));
});

test('unknown request count excludes orphaned handed-on evidence while retaining usage', async t => {
  const f = fixture([row(1, { session: '', handed_on: true, status: 429 }), row(2, { session: '' })]);
  t.after(() => f.history.stop());
  const state = await f.history.snapshot({ ...all, kind: 'unknown' });
  assert.equal(state.unknownRequests, 1); assert.equal(state.metrics.requests, 1);
  assert.equal(state.requests.length, 2); assert.equal(state.metrics.tokens, 200); assert.equal(state.metrics.cost, 1);
});

test('full history envelopes fit the byte budget with immutable, consistent trimmed totals and pages', async t => {
  const rows = Array.from({ length: 8 }, (_, i) => row(i + 1, { session: `session-${i}-${'界'.repeat(80)}` }));
  const unlimited = fixture(rows); t.after(() => unlimited.history.stop());
  const original = await unlimited.history.snapshot(all, { limit: 200 });
  const responseBytes = Buffer.byteLength(JSON.stringify(original)) - 1;
  assert.ok(Buffer.byteLength(JSON.stringify(original.requests)) < responseBytes, 'record-only budgeting misses the envelope');
  const f = fixture(rows, { limits: { responseBytes } }); t.after(() => f.history.stop());
  const first = await f.history.snapshot(all, { limit: 200 });
  assert.ok(Buffer.byteLength(JSON.stringify(first)) <= responseBytes);
  assert.ok(first.coverage.reasons.includes('response_byte_limit'));
  assert.ok(first.coverage.partial && first.metrics.partial);
  assert.ok(first.pagination.total > 1 && first.pagination.total < rows.length);
  assert.equal(first.metrics.requests, first.pagination.total);
  assert.equal(first.metrics.tokens, first.pagination.total * 100); assert.equal(first.metrics.cost, first.pagination.total * 0.5);
  assert.equal(first.sessions.reduce((sum, session) => sum + session.requestCount, 0), first.metrics.requests);
  const retained = [];
  for (let offset = 0; offset !== null;) {
    const page = await f.history.snapshot(all, { offset, limit: 1, snapshotId: first.pagination.snapshotId });
    assert.ok(Buffer.byteLength(JSON.stringify(page)) <= responseBytes);
    assert.deepEqual(page.metrics, first.metrics); assert.equal(page.pagination.total, first.pagination.total);
    assert.deepEqual(page.graph.requestKeys, page.requests.map(request => request.key));
    retained.push(...page.requests.map(request => request.key)); offset = page.pagination.nextOffset;
  }
  assert.deepEqual(retained, first.requests.map(request => request.key)); assert.equal(f.calls.length, 1);
  f.aggregator.setConnection({ status: 'disconnected', reason: 'gateway_unavailable', gatewayVersion: `1.2.3-${'v'.repeat(80)}` });
  const scoped = await f.history.snapshot({ ...all, kind: 'session', sessionKey: first.sessions[0].key }, { snapshotId: first.pagination.snapshotId });
  assert.ok(Buffer.byteLength(JSON.stringify(scoped)) <= responseBytes);
});

test('a byte budget smaller than the empty API envelope fails closed', async t => {
  const f = fixture([], { limits: { responseBytes: 100 } }); t.after(() => f.history.stop());
  await assert.rejects(f.history.snapshot(all), error => error.code === 'payload_limit');
});

test('failed scans back off without caching raw errors or scanning on every refresh', async () => {
  let now = 1000, calls = 0;
  const gateway = { async usage() { calls++; throw new Error('PRIVATE-ERROR'); } };
  const history = createHistory({ gateway, aggregator: createAggregator(), clock: () => now });
  for (let i = 0; i < 4; i++) await assert.rejects(history.snapshot(all), error => error.code === 'history_unavailable' && !error.message.includes('PRIVATE'));
  assert.equal(calls, 1); now += 5001;
  await assert.rejects(history.snapshot(all)); assert.equal(calls, 2); await history.stop();
});

test('clear/stop abort and await shared work without restoring revoked snapshots', async () => {
  let began; const started = new Promise(resolve => { began = resolve; });
  let active = 0;
  const gateway = { async usage({ signal }) { active++; began();
    try { await delay(10_000, undefined, { signal }); } finally { active--; }
  } };
  const history = createHistory({ gateway, aggregator: createAggregator() });
  const pending = history.snapshot(all); await started;
  const rejected = assert.rejects(pending);
  await history.stop(); await rejected;
  assert.equal(active, 0); await assert.rejects(history.snapshot(all), error => error.code === 'history_unavailable');
});

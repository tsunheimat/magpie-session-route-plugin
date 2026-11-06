import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeTrace, normalizeUsage } from '../lib/privacy.mjs';
import { calculateMetrics } from '../lib/metrics.mjs';
import { makeRoute } from './fixtures/trace.mjs';

const seat = (id, model = 'model-a', fixed) => ({ id, model, fixed, provider: 'provider', kind: 'account', who: 'PRIVATE-ACCOUNT' });
const attempt = (id, model = 'model-a', fixed, extra = {}) => ({ id, model, fixed, done: true, status: 200, ...extra });

test('allowlist removes all raw account, body, header, archive and failure text', () => {
  const raw = makeRoute(1, { done: true, fallback: true, folder: '/work/private-project',
    authorization: 'PRIVATE-AUTH', cost: 123, extra: { message: 'PRIVATE-CONTENT' },
    error: 'PRIVATE-ERROR', fail: 'rate' });
  const record = normalizeTrace(raw);
  const text = JSON.stringify(record);
  for (const secret of ['private-a@', 'private-b@', 'DO-NOT-EXPOSE', 'PRIVATE-', '/work/private-project']) assert.equal(text.includes(secret), false);
  assert.equal(record.error, 'Rate limited.');
  assert.equal(record.outcome, 'failed'); // even HTTP 200 with an error
  assert.equal(record.cost, null);
  assert.equal(record.priced, false);
  assert.equal(record.candidates[0].label, 'Key 1');
  assert.equal(normalizeTrace(raw, { showFolders: true }).folder, '/work/private-project');
  raw.tries[0].status = 500;
  assert.equal(record.attempts[0].status, 429);
});

test('A,A,B,A is one request, one retry and two fallback transitions', () => {
  const record = normalizeTrace(makeRoute(1, { done: true, retried: 98765,
    order: [seat('a'), seat('b')], tries: [attempt('a'), attempt('a'), attempt('b'), attempt('a')] }));
  assert.equal(record.retries, 1); assert.equal(record.fallbacks, 2);
  assert.deepEqual(record.attempts.map(row => row.transition), ['initial', 'retry', 'fallback', 'fallback']);
  assert.equal(calculateMetrics([record]).requests, 1);
  assert.equal(normalizeTrace(makeRoute(2, { order: [seat('a')], tries: [attempt('a', 'model-a', undefined, { again: 5000 })] })).retries, 0);
});

test('seat identity uses raw ID plus model and fixed effort; ambiguous matches stay unknown', () => {
  const raw = makeRoute(1, { order: [seat('same', 'model-a', 'low'), seat('same', 'model-a', 'high'), seat('same', 'model-b')],
    tries: [attempt('same', 'model-a', 'low'), attempt('same', 'model-a', 'high'), attempt('same', 'model-b')] });
  const record = normalizeTrace(raw);
  assert.equal(new Set(record.candidates.map(row => row.key)).size, 3);
  assert.equal(record.fallbacks, 2);
  raw.order.reverse();
  const reordered = normalizeTrace(raw);
  assert.equal(reordered.attempts[0].candidateKey, record.attempts[0].candidateKey);
  raw.tries = [attempt('same', 'model-a'), attempt('same', 'model-a', 'high')];
  const ambiguous = normalizeTrace(raw);
  assert.equal(ambiguous.attempts[0].candidateKey, null);
  assert.equal(ambiguous.attempts[1].transition, 'unknown');
  assert.equal(ambiguous.retries, null); assert.equal(ambiguous.fallbacks, null);
  raw.order = [seat('same', 'model-a', 'low')];
  raw.tries = [attempt('same', 'model-a', 'high')];
  assert.equal(normalizeTrace(raw).attempts[0].candidateKey, null);
});

test('bounded metadata rejects invalid identity rather than truncating or guessing', () => {
  const record = normalizeTrace(makeRoute(1, { session: 's'.repeat(513), model: 'https://user:secret@example.invalid',
    order: [seat('a'), seat('b')], tries: [attempt('a'), attempt('b'), attempt('a')] }), { limits: { candidates: 1, attempts: 2 } });
  assert.equal(record.sessionKey, null); assert.equal(record.session, null); assert.equal(record.model, null);
  assert.equal(record.candidates.length, 1); assert.equal(record.attempts.length, 2);
  assert.equal(record.retries, null);
  assert.ok(record.reasons.includes('attempt_limit'));
  assert.equal(normalizeTrace({ id: 1, time: 'bad', done: true }), null);
  const failed = normalizeTrace(makeRoute(3, { done: true, status: 200, fail: 'PRIVATE-FAILURE-CODE' }));
  assert.equal(failed.outcome, 'failed'); assert.equal(failed.error, 'Upstream request failed.');
  const cancelled = normalizeTrace(makeRoute(4, { done: true, status: 499 }));
  assert.equal(cancelled.error, 'Request cancelled.');
  const absent = normalizeTrace(makeRoute(2, { done: true, tokens: undefined, out: undefined, ms: undefined, status: undefined, tries: undefined }));
  assert.equal(absent.ms, null); assert.equal(absent.tokens, null); assert.equal(absent.retries, null); assert.equal(absent.outcome, 'unknown');
});

test('missing model evidence never picks the first of several same-ID seats', () => {
  const raw = makeRoute(1, { order: [seat('same', undefined), seat('same', 'model-b')], tries: [attempt('same')] });
  delete raw.order[0].model; delete raw.tries[0].model;
  assert.equal(normalizeTrace(raw).attempts[0].candidateKey, null);
  assert.equal(normalizeTrace(makeRoute(2, { tries: null })).retries, null);
  const invalidActor = normalizeTrace(makeRoute(3, { subagentId: 'private@example.invalid' }));
  assert.equal(invalidActor.subagentId, null); assert.equal(invalidActor.isSubagent, true);
});

test('only confirmed native parents and explicit actors are retained', () => {
  const raw = makeRoute(1, { parentSession: 'parent', parentMatched: true, subagentId: 'worker', subagent: { prompt: 'SECRET' } });
  assert.equal(normalizeTrace(raw).parentSessionKey, null);
  raw.parentMatched = false;
  assert.ok(normalizeTrace(raw).parentSessionKey);
  assert.equal(normalizeTrace(raw).isSubagent, true);
});

test('documented subagent call kinds classify trace and ledger actors without actor IDs', () => {
  for (const kind of ['collab_spawn', 'thread_spawn', 'agent_job']) {
    const trace = normalizeTrace(makeRoute(1, { agent: 'codex', kind }));
    const ledger = normalizeUsage({ route_id: 1, t: '2026-11-06T12:00:00Z', client: 'codex', session: 'native', kind });
    assert.equal(trace.isSubagent, true, kind);
    assert.equal(ledger.isSubagent, true, kind);
    assert.equal(trace.subagentId, null);
  }
  for (const kind of [undefined, 'review', 'thread_title', 'future_kind']) {
    assert.equal(normalizeTrace(makeRoute(1, { kind })).isSubagent, false);
  }
});

test('model-only validation preserves documented window and version suffixes throughout topology', () => {
  for (const model of ['cursor/claude-opus-5-5@300k', 'claude-opus-5-5@1m', 'grok-4.7@131072',
    'claude-sonnet-4-5@20250929', 'cursor/fake-opus@300k:fast', 'model-a@1M:high',
    'claude-opus-5-5[1m]', 'v/big:high[1m]']) {
    const record = normalizeTrace(makeRoute(1, { model, served: model,
      order: [seat('a', model)], tries: [attempt('a', model, undefined, { served: model })] }));
    assert.equal(record.model, model);
    assert.equal(record.servedModel, model);
    assert.equal(record.candidates[0]?.model, model);
    assert.equal(record.attempts[0].model, model);
    assert.equal(record.attempts[0].servedModel, model);
    assert.equal(record.attempts[0].candidateKey, record.candidates[0].key);
    assert.equal(normalizeUsage({ t: '2026-11-06T12:00:00Z', req: model }).model, model);
  }
});

test('model suffix support does not allow emails, credentials, URLs or relax other metadata', () => {
  for (const model of ['private@example.invalid', 'private@localhost', 'private@300k.example', 'private@example.invalid@300k',
    'https://example.invalid/model@300k', 'sk-ant-privatecredential@300k', 'Bearer private@300k',
    'secret:value@300k', 'model@300k\n', 'model@300k/path', 'private@example.invalid[1m]',
    'model[secret]', 'model[1m][1m]', '[1m]', 'm'.repeat(257)]) {
    const record = normalizeTrace(makeRoute(1, { model, served: model,
      order: [seat('a', model)], tries: [attempt('a', model, undefined, { served: model })] }));
    assert.equal(record.model, null, model);
    assert.equal(record.servedModel, null);
    assert.equal(record.candidates.length, 0);
    assert.equal(record.attempts[0].model, null);
    assert.equal(record.attempts[0].servedModel, null);
  }
  const record = normalizeTrace(makeRoute(1, { session: 'native@300k', provider: 'provider@300k',
    folder: 'folder@300k', order: [{ ...seat('a'), provider: 'provider@300k' }], tries: [attempt('a')] }), { showFolders: true });
  assert.equal(record.sessionKey, null);
  assert.equal(record.provider, null);
  assert.equal(record.candidates[0].provider, null);
  assert.equal(record.folder, null);
});

test('an unavailable final candidate or attempt never attributes serving to the initial provider', () => {
  const raw = makeRoute(1, { done: true, fallback: true });
  assert.equal(normalizeTrace(raw).provider, 'provider-b');
  for (const limits of [{ candidates: 1 }, { attempts: 1 }]) {
    const record = normalizeTrace(raw, { limits });
    assert.equal(record.provider, null);
    assert.equal(record.partial, true);
  }
  const unmatched = normalizeTrace({ ...raw, tries: [...raw.tries.slice(0, 1), { ...raw.tries[1], id: 'not-in-order' }] });
  assert.equal(unmatched.provider, null);
  assert.equal(unmatched.attempts.at(-1).provider, null);
  assert.equal(normalizeTrace(makeRoute(2, { tries: [] })).provider, 'provider-a');
});

test('ledger counts cache tiers, preserves nullable measurements and withholds canonical identities', () => {
  const raw = { route_id: 1, t: '2026-11-06T12:00:00Z', agent: 'user-alias', client: 'codex', session: 'native',
    req: 'requested', model: 'actual', status: 200, in: 10, out: 20, cache_read: 30, cache_write: 40,
    ttft: 9999, ttft_ms: 42, cost: 0, priced: false, err: 'PRIVATE-ERROR' };
  const row = normalizeUsage(raw, { key: 'ledger:1' });
  assert.equal(row.agent, 'codex'); assert.equal(row.ttft, 42); assert.equal(row.tokens, 100);
  assert.equal(row.inputTokens, 80); assert.equal(row.cost, null); assert.equal(row.outcome, 'failed');
  assert.equal(row.error, 'Upstream request failed.');
  assert.equal(normalizeUsage({ ...raw, session_role: 'subagent', subagent: 'child' }).sessionKey, null);
  assert.equal(normalizeUsage({ ...raw, session_role: 'unknown' }).sessionKey, null);
  assert.equal(normalizeUsage({ ...raw, source: 'log' }), null);
  assert.equal(normalizeUsage({ ...raw, computer: 'other' }), null);
  assert.equal(normalizeUsage({ ...raw, rejected: true }), null);
});

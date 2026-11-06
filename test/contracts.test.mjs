import test from 'node:test';
import assert from 'node:assert/strict';
import { ApiError, sessionKey, decodeSessionKey, parseScope, boundedInteger, scopeEquals } from '../lib/contracts.mjs';

test('session tuple encoding is exact, collision-safe and canonical', () => {
  const pairs = [['claude-code', 'same'], ['codex', 'same'], ['a:b', 'c'], ['a', 'b:c'],
    ['agent', 'Case'], ['agent', 'case'], ['代理', '会话'], ['agent', '__proto__'], ['agent', '\ud800']];
  const keys = pairs.map(pair => sessionKey(...pair));
  assert.equal(new Set(keys).size, pairs.length);
  pairs.forEach(([agent, session], index) => assert.deepEqual(decodeSessionKey(keys[index]), { agent, session }));
  for (const key of ['', '!!!', 'a=', Buffer.from('["agent",""]').toString('base64url'), 'a'.repeat(2049)]) {
    assert.throws(() => decodeSessionKey(key), error => error instanceof ApiError && error.status === 400);
  }
  assert.equal(sessionKey('agent', ''), null);
  assert.equal(sessionKey('agent', 'a\n'), null);
  assert.equal(sessionKey('agent', 'a'.repeat(513)), null);
  assert.equal(sessionKey('a'.repeat(257), 'id'), null);
  assert.equal(sessionKey('代'.repeat(256), '会'.repeat(512)), null, 'oversized encoded identities cannot enter the selector');
  const boundedUnicode = sessionKey('代'.repeat(32), '会'.repeat(128));
  assert.equal(decodeSessionKey(boundedUnicode).session, '会'.repeat(128));
});

test('query scope never maps invalid or empty selection to global traffic', () => {
  assert.deepEqual(parseScope(new URLSearchParams()), {
    kind: 'all', sessionKey: null, includeChildren: false, period: 'live',
  });
  assert.equal(parseScope(new URLSearchParams('session=unknown')).kind, 'unknown');
  const key = sessionKey('claude-code', 'x');
  const scoped = parseScope(new URLSearchParams({ session: key, includeChildren: '1', period: '7d' }));
  assert.deepEqual(scoped, { kind: 'session', sessionKey: key, includeChildren: true, period: '7d' });
  assert(Object.isFrozen(scoped));
  for (const query of ['session=', 'session=all', 'period=forever', 'period=live&period=today',
    'includeChildren=true', 'url=http://evil.invalid', 'session=unknown&session=unknown', 'offset=1']) {
    assert.throws(() => parseScope(new URLSearchParams(query)), ApiError, query);
  }
  assert.throws(() => parseScope(new URLSearchParams('period=live'), { history: true }), ApiError);
  assert.equal(parseScope(new URLSearchParams(), { history: true }).period, 'today');
});

test('pagination numbers reject coercion, overflow and noncanonical input', () => {
  assert.equal(boundedInteger(null, 20, 0, 100), 20);
  assert.equal(boundedInteger('0', 20, 0, 100), 0);
  assert.equal(boundedInteger('100', 20, 0, 100), 100);
  for (const value of ['-1', '+1', '01', '1e2', ' 1', '1.0', '101', '9007199254740992', '', 1]) {
    assert.throws(() => boundedInteger(value, 20, 0, 100), ApiError);
  }
});

test('scope comparison includes agent identity, period and descendants', () => {
  const base = parseScope(new URLSearchParams({ session: sessionKey('claude-code', 'same') }));
  assert(scopeEquals(base, { ...base }));
  assert(!scopeEquals(base, null));
  assert(!scopeEquals(base, { ...base, sessionKey: sessionKey('codex', 'same') }));
  assert(!scopeEquals(base, { ...base, period: 'today' }));
  assert(!scopeEquals(base, { ...base, includeChildren: true }));
});

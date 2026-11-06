export const identities = Object.freeze({
  alpha: ['claude-code', 'session-alpha'],
  bravo: ['claude-code', 'session-bravo'],
  codex: ['codex', 'session-alpha'],
});

export function makeRoute(id, {
  agent = 'claude-code', session = 'session-alpha', done = false, fallback = false,
  time = '2026-11-06T12:00:00.000Z', seq = id, ...extra
} = {}) {
  const first = { id: 'private-a@example.invalid', provider: 'provider-a', name: 'Provider A',
    kind: 'key', model: 'model-a', routing: 'order', used: 0, who: 'DO-NOT-EXPOSE-ACCOUNT' };
  const second = { id: 'private-b@example.invalid', provider: 'provider-b', name: 'Provider B',
    kind: 'key', model: 'model-b', routing: 'order', used: 0, who: 'DO-NOT-EXPOSE-ACCOUNT' };
  const tries = fallback ? [
    { id: first.id, model: first.model, start: time, done: true, status: 429, ms: 20,
      fail: 'rate', error: 'DO-NOT-EXPOSE-ERROR bearer secret-token request prompt' },
    { id: second.id, model: second.model, start: time, done, ...(done ? { status: 200, ms: 40, ttft: 12 } : {}) },
  ] : [{ id: first.id, model: first.model, start: time, done, ...(done ? { status: 200, ms: 40, ttft: 12 } : {}) }];
  return { id, seq, time, agent, ...(session ? { session } : {}), model: 'group/team', provider: first.provider,
    group: { id: 'team', name: 'Team route', routing: 'order', members: [] },
    order: [first, second], tries, done,
    prompt: { text: 'DO-NOT-EXPOSE-PROMPT' }, archive: 'DO-NOT-EXPOSE-ARCHIVE',
    ...(done ? { status: 200, ms: 60, ttft: 32, tokens: 100, out: 20,
      usage: [{ provider: first.provider, model: first.model, in: 80, out: 20 }] } : {}),
    ...extra,
  };
}

export function initialTrace() {
  const routes = [
    makeRoute(101, { fallback: true, seq: 1 }),
    makeRoute(102, { session: 'session-bravo', done: true, seq: 2 }),
    makeRoute(103, { seq: 3 }),
    makeRoute(104, { agent: 'codex', done: true, seq: 4 }),
    makeRoute(105, { session: null, done: true, seq: 5 }),
  ];
  return { object: 'trace', now: '2026-11-06T12:01:00.000Z', seq: 5, pid: 12345, serves: 'web',
    routes, ids: routes.map(route => route.id), totals: { requests: 99999, rerouted: 8888, errors: 7777 } };
}

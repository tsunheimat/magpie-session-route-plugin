export const API_VERSION = 1;
export const PERIODS = Object.freeze(['live', 'today', '7d', '30d']);
export const DEFAULT_PORT = 3496;
export const DEFAULT_LIMITS = Object.freeze({
  routes: 512,
  sessions: 512,
  attempts: 128,
  candidates: 128,
  responseBytes: 8 * 1024 * 1024,
  historyRows: 4000,
  historyPages: 20,
  historyPageSize: 200,
  historySnapshots: 6,
  historyTTL: 30_000,
  historyTimeout: 20_000,
});

export class ApiError extends Error {
  constructor(status, code, message) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
  }
}

// Encoding is collision-safe, not a secret or an authorization capability.
export function sessionKey(agent, session) {
  if (typeof agent !== 'string' || typeof session !== 'string' || !session ||
      agent.length > 256 || session.length > 512 || /[\u0000-\u001f\u007f]/u.test(agent + session)) return null;
  const key = Buffer.from(JSON.stringify([agent, session]), 'utf8').toString('base64url');
  return key.length <= 2048 ? key : null;
}

export function decodeSessionKey(key) {
  if (typeof key !== 'string' || key.length > 2048 || !/^[A-Za-z0-9_-]+$/u.test(key)) {
    throw new ApiError(400, 'invalid_session', 'Invalid session selection.');
  }
  try {
    const pair = JSON.parse(Buffer.from(key, 'base64url').toString('utf8'));
    if (!Array.isArray(pair) || pair.length !== 2 || sessionKey(...pair) !== key) throw new Error();
    return { agent: pair[0], session: pair[1] };
  } catch {
    throw new ApiError(400, 'invalid_session', 'Invalid session selection.');
  }
}

export function parseScope(params, { history = false } = {}) {
  const allowed = new Set(['session', 'period', 'includeChildren', ...(history ? ['offset', 'limit', 'snapshot'] : [])]);
  for (const key of params.keys()) {
    if (!allowed.has(key) || params.getAll(key).length !== 1) {
      throw new ApiError(400, 'invalid_query', 'Unknown or repeated query parameter.');
    }
  }
  const selected = params.get('session');
  const period = params.get('period') ?? (history ? 'today' : 'live');
  const children = params.get('includeChildren') ?? '0';
  if (!PERIODS.includes(period) || (history && period === 'live') || !['0', '1'].includes(children)) {
    throw new ApiError(400, 'invalid_scope', 'Invalid period or child-traffic selection.');
  }
  if (selected === '') throw new ApiError(400, 'invalid_session', 'Invalid session selection.');
  if (selected && selected !== 'unknown') decodeSessionKey(selected);
  return Object.freeze({
    kind: !selected ? 'all' : selected === 'unknown' ? 'unknown' : 'session',
    sessionKey: selected && selected !== 'unknown' ? selected : null,
    includeChildren: children === '1',
    period,
  });
}

export function boundedInteger(value, fallback, min, max, name = 'number') {
  if (value === null || value === undefined) return fallback;
  if (typeof value !== 'string' || !/^(0|[1-9][0-9]*)$/u.test(value)) {
    throw new ApiError(400, 'invalid_query', `Invalid ${name}.`);
  }
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < min || parsed > max) {
    throw new ApiError(400, 'invalid_query', `Invalid ${name}.`);
  }
  return parsed;
}

export function scopeEquals(left, right) {
  return !!left && !!right && left.kind === right.kind && left.sessionKey === right.sessionKey &&
    left.includeChildren === right.includeChildren && left.period === right.period;
}

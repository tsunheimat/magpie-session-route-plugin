import { ApiError } from './contracts.mjs';
import { measurement } from './privacy.mjs';

function subtotal(records, field) {
  const values = records.map(record => measurement(record[field])).filter(value => value !== null);
  return { value: values.length ? measurement(values.reduce((sum, value) => sum + value, 0)) : null, count: values.length };
}

// Orphaned billable tries contribute usage, not invented requests in any counter.
export const countsAsRequest = record => !record.reasons?.includes('handed_on_only');

export function calculateMetrics(records, { partial = false } = {}) {
  const requests = records.filter(countsAsRequest);
  const ttft = subtotal(records, 'ttft');
  const tokens = subtotal(records, 'tokens'), input = subtotal(records, 'inputTokens'), output = subtotal(records, 'outputTokens');
  const retries = subtotal(records, 'retries'), fallbacks = subtotal(records, 'fallbacks');
  const priced = requests.filter(record => record.priced && measurement(record.cost) !== null);
  // A grouped request may have a known subtotal and an unpriced billable try.
  const cost = subtotal(records, 'cost');
  return {
    requests: requests.length,
    inFlight: requests.filter(record => record.outcome === 'in-flight' && !record.done).length,
    failed: requests.filter(record => record.outcome === 'failed').length,
    retries: retries.value, fallbacks: fallbacks.value,
    averageTTFT: ttft.count && ttft.value !== null ? ttft.value / ttft.count : null, ttftSamples: ttft.count,
    tokens: tokens.value, inputTokens: input.value, outputTokens: output.value,
    cost: cost.value, pricedRequests: priced.length, unpricedRequests: requests.length - priced.length,
    partial: partial || records.some(record => record.partial || ['unknown', 'unavailable'].includes(record.outcome)) ||
      [tokens, input, output, retries, fallbacks, ttft].some(metric => metric.count < records.length || (metric.count > 0 && metric.value === null)) ||
      (priced.length > 0 && cost.value === null) || priced.length < records.length,
  };
}

function compareActivity(left, right) {
  return (left.updatedAt ?? left.time).localeCompare(right.updatedAt ?? right.time) ||
    left.time.localeCompare(right.time) || (left.id ?? -1) - (right.id ?? -1) || left.key.localeCompare(right.key);
}

export function buildSessions(records) {
  const index = new Map();
  const parents = new Map(), latest = new Map();
  for (const record of records) {
    if (!record.sessionKey) continue;
    let session = index.get(record.sessionKey);
    if (!session) {
      const native = record.session;
      session = { key: record.sessionKey, agent: record.agent,
        displayId: native.length > 20 ? `${native.slice(0, 10)}…${native.slice(-8)}` : native,
        title: null, folder: record.folder ?? null, lastActivity: record.time,
        activeRequests: 0, requestCount: 0, lastModel: record.model, lastProvider: record.provider,
        parentKey: null, isChild: false };
      index.set(session.key, session);
      parents.set(session.key, new Set());
    }
    if (countsAsRequest(record)) {
      session.requestCount++;
      if (record.outcome === 'in-flight' && !record.done) session.activeRequests++;
    }
    const previous = latest.get(session.key);
    if (!previous || compareActivity(record, previous) > 0) {
      latest.set(session.key, record);
      session.lastActivity = record.updatedAt ?? record.time;
      session.lastModel = record.model; session.lastProvider = record.provider;
      session.folder = record.folder ?? null;
    }
    if (record.parentSessionKey && record.parentSessionKey !== session.key) parents.get(session.key).add(record.parentSessionKey);
  }
  for (const session of index.values()) {
    const keys = parents.get(session.key);
    // Conflicting or unobserved parent evidence is not a confirmed join.
    if (keys.size === 1 && index.get([...keys][0])?.agent === session.agent) {
      session.parentKey = [...keys][0]; session.isChild = true;
    }
  }
  // Determine all invalid links before removing any: mutating while walking
  // would leave half a cycle looking like an authoritative family tree.
  const invalid = new Set();
  for (const session of index.values()) {
    const visited = new Set([session.key]);
    let cursor = session.parentKey;
    while (cursor) {
      if (visited.has(cursor)) { invalid.add(session.key); break; }
      visited.add(cursor); cursor = index.get(cursor)?.parentKey ?? null;
    }
  }
  for (const key of invalid) { index.get(key).parentKey = null; index.get(key).isChild = false; }
  return [...index.values()].sort((a, b) => (b.activeRequests > 0) - (a.activeRequests > 0) ||
    b.lastActivity.localeCompare(a.lastActivity) || a.key.localeCompare(b.key));
}

export function selectRequests(records, sessions, scope) {
  if (scope.kind === 'all') return records;
  if (scope.kind === 'unknown') return records.filter(record => record.sessionKey === null);
  if (!sessions.some(session => session.key === scope.sessionKey)) {
    throw new ApiError(410, 'session_expired', 'The selected session is not present in this source. Choose All sessions to continue.');
  }
  const selected = new Set([scope.sessionKey]);
  if (scope.includeChildren) {
    // Iterative traversal is bounded by the session count, including malformed cycles.
    for (let changed = true; changed;) {
      changed = false;
      for (const session of sessions) {
        if (session.parentKey && selected.has(session.parentKey) && !selected.has(session.key)) {
          selected.add(session.key); changed = true;
        }
      }
    }
  }
  return records.filter(record => {
    if (!selected.has(record.sessionKey)) return false;
    if (scope.includeChildren) return true;
    if (record.reasons.includes('actor_unknown')) return false;
    // An explicit independent child session is inspectable on its own. A child
    // sharing its parent's session header is not the parent's direct traffic.
    return !record.isSubagent || record.isIndependentSubagent === true ||
      (!!record.parentSessionKey && record.parentSessionKey !== record.sessionKey);
  });
}

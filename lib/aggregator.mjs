import { randomUUID } from 'node:crypto';
import { API_VERSION, ApiError, DEFAULT_LIMITS } from './contracts.mjs';
import { digest, integer, isObject, isoTime, limitsOf, normalizeTrace, nowOf, safeVersion } from './privacy.mjs';
import { buildSessions, calculateMetrics, countsAsRequest, selectRequests } from './metrics.mjs';
import { createNativeProjector, nativeSnapshot as projectNativeSnapshot, referencedLifts } from './native-routing.mjs';

const statuses = new Set(['starting', 'live', 'stale', 'disconnected', 'incompatible', 'stopped']);
const reasons = new Set(['gateway_unavailable', 'gateway_denied', 'gateway_incompatible', 'gateway_malformed',
  'gateway_timeout', 'payload_limit', 'resynchronizing', 'collector_stopped']);
const malformed = () => new ApiError(502, 'gateway_malformed', 'Gateway trace is malformed or unsupported.');
const recentFirst = (a, b) => b.time.localeCompare(a.time) || b.key.localeCompare(a.key);
const retentionFirst = (a, b) => Number(a.outcome === 'unavailable') - Number(b.outcome === 'unavailable') ||
  Number(!b.done) - Number(!a.done) || recentFirst(a, b);
const byteSize = value => Buffer.byteLength(JSON.stringify(value));
const ALL = Object.freeze({ kind: 'all', sessionKey: null, includeChildren: false, period: 'live' });

function liveState({ records, selected = records, sessions = buildSessions(records), scope = ALL, metadata, reasons = [] }) {
  const why = new Set(['retained_trace_only', ...reasons]);
  if (records.some(record => record.outcome === 'unavailable')) why.add('trace_evicted');
  if (metadata.connection.status !== 'live') why.add('stale_or_unavailable');
  for (const record of selected) for (const reason of record.reasons) why.add(reason);
  return { apiVersion: API_VERSION, ...metadata, scope,
    coverage: { source: 'trace', period: 'live', label: 'Live trace (recent retained requests)', partial: true,
      reasons: [...why], retained: records.filter(record => record.outcome !== 'unavailable').length,
      snapshotAt: metadata.connection.lastUpdated },
    sessions, unknownRequests: records.filter(record => !record.sessionKey && countsAsRequest(record)).length, requests: selected,
    metrics: calculateMetrics(selected, { partial: true }), graph: { requestKeys: selected.map(record => record.key) } };
}

export function createAggregator({ limits: input, clock, instanceId = randomUUID(), showFolders = false } = {}) {
  const limits = limitsOf(input);
  let routes = new Map(), lost = new Map(), identities = new Map();
  let seq = 0, generation = 1, revision = 0, pid = null, initialized = false, pendingReset = false;
  let coverageReasons = new Set(), highestId = -1;
  let connection = { status: 'starting', lastUpdated: null, reason: null, gatewayVersion: null };
  let nativeProjector = createNativeProjector({ limits, showFolders }), nativeRoutes = new Map();
  let nativeSource = { now: null, serves: null, totals: null, lifted: {} }, nativeReasons = new Set();

  function setConnection(update) {
    if (!statuses.has(update?.status)) return;
    const status = update.status === 'disconnected' && connection.lastUpdated ? 'stale' : update.status;
    connection = { ...connection, status, reason: reasons.has(update.reason) ? update.reason : null,
      gatewayVersion: safeVersion(update.gatewayVersion) ?? connection.gatewayVersion };
    revision++;
  }
  function applyTrace(raw, { full = false } = {}) {
    if (!isObject(raw) || raw.object !== 'trace' || integer(raw.seq) === null || integer(raw.pid) === null || raw.pid < 1 ||
        !Array.isArray(raw.routes) || !Array.isArray(raw.ids)) throw malformed();
    if (raw.routes.length > DEFAULT_LIMITS.routes || raw.ids.length > DEFAULT_LIMITS.routes) {
      throw new ApiError(502, 'payload_limit', 'Gateway trace exceeds the supported capacity.');
    }
    let bytes;
    try { bytes = Buffer.byteLength(JSON.stringify(raw)); } catch { throw malformed(); }
    if (bytes > limits.responseBytes) throw new ApiError(502, 'payload_limit', 'Gateway trace exceeds the payload limit.');
    const ids = new Set(raw.ids);
    if (ids.size !== raw.ids.length || raw.ids.some(id => integer(id) === null)) throw malformed();
    const changes = new Map();
    let reset = pendingReset || (initialized && (raw.pid !== pid || raw.seq < seq));
    for (const row of raw.routes) {
      if (!isObject(row) || integer(row.id) === null || changes.has(row.id) || !ids.has(row.id) ||
          integer(row.seq) === null || row.seq > raw.seq || !isoTime(row.time) || typeof row.done !== 'boolean') throw malformed();
      const identity = digest(JSON.stringify([row.time, row.agent, row.session ?? null]));
      const prior = identities.get(row.id);
      const fingerprint = digest(JSON.stringify(row));
      if (prior && (identity !== prior.identity || row.seq < prior.seq ||
          (row.seq === prior.seq && fingerprint !== prior.fingerprint))) reset = true;
      if (initialized && !prior && row.id <= highestId) reset = true;
      changes.set(row.id, { row, identity, fingerprint });
    }
    if (full && changes.size !== ids.size) throw malformed();
    if ((!initialized && !full) || (!full && (reset || [...ids].some(id => !identities.has(id) && !changes.has(id))))) {
      pendingReset ||= reset;
      setConnection({ status: connection.lastUpdated ? 'stale' : 'starting', reason: 'resynchronizing' });
      return { resync: true };
    }
    const nextGeneration = reset ? generation + 1 : generation;
    const at = new Date(nowOf(clock)).toISOString();
    const nextRoutes = full ? new Map() : new Map(routes);
    const nextNativeProjector = reset ? createNativeProjector({ limits, showFolders }) : nativeProjector;
    const nextNativeRoutes = full ? new Map() : new Map(nativeRoutes);
    const nextNativeSource = nextNativeProjector.metadata(raw);
    // Lift updates are incremental in the native trace. Keep only sanitized
    // timestamps referenced by the retained routes, never the raw rest map.
    nextNativeSource.lifted = { ...(!reset ? nativeSource.lifted : {}), ...nextNativeSource.lifted };
    const nextLost = reset ? new Map() : new Map(lost);
    const nextIdentities = new Map();
    const loss = new Set();
    for (const id of ids) {
      const change = changes.get(id);
      if (change) {
        const record = normalizeTrace(change.row, { generation: nextGeneration, updatedAt: at, limits, showFolders });
        if (!record) throw malformed();
        const old = !reset && routes.get(id);
        if (old && identities.get(id)?.seq === change.row.seq) record.updatedAt = old.updatedAt;
        nextRoutes.set(id, record);
        nextNativeRoutes.set(id, nextNativeProjector.route(change.row));
        nextIdentities.set(id, { identity: change.identity, fingerprint: change.fingerprint, seq: change.row.seq });
        nextLost.delete(record.key);
      } else nextIdentities.set(id, identities.get(id));
    }
    if (!reset) for (const [id, record] of routes) {
      if (!ids.has(id) && !record.done && record.outcome === 'in-flight') {
        nextLost.set(record.key, { ...record, outcome: 'unavailable', updatedAt: at, partial: true,
          candidates: record.candidates.map(candidate => candidate.state === 'attempting' ? { ...candidate, state: 'candidate' } : candidate),
          attempts: record.attempts.map(attempt => attempt.outcome === 'in-flight' ? { ...attempt, outcome: 'unavailable' } : attempt),
          reasons: [...new Set([...record.reasons, 'trace_evicted'])] });
      }
    }
    for (const id of nextRoutes.keys()) if (!ids.has(id)) nextRoutes.delete(id);
    for (const [key, record] of nextLost) if (nowOf(clock) - Date.parse(record.updatedAt) > 300_000) nextLost.delete(key);
    // Active retained records take priority, then recently started requests, then
    // unavailable tombstones. Limits also bound session indexes built from them.
    const ordered = [...nextRoutes.values()].sort((a, b) => Number(!b.done) - Number(!a.done) || recentFirst(a, b));
    const keep = [], sessions = new Set();
    const nextConnection = { ...connection, status: 'live', reason: null, lastUpdated: at };
    const metadata = { instanceId, generation: nextGeneration, revision: revision + 1, seq: raw.seq, connection: nextConnection };
    let projectionBytes = 0;
    for (const record of [...ordered, ...[...nextLost.values()].sort(recentFirst)]) {
      if (keep.length >= limits.routes) { loss.add('route_limit'); continue; }
      if (record.sessionKey && !sessions.has(record.sessionKey) && sessions.size >= limits.sessions) {
        loss.add('session_limit'); continue;
      }
      const size = byteSize(record);
      if (projectionBytes + size > limits.responseBytes) { loss.add('projection_byte_limit'); continue; }
      // A request that cannot fit even alone must not exhaust the cache budget
      // and displace smaller complete representations. Full views are still
      // bounded below, since combining individually fitting rows adds metadata.
      if (byteSize(liveState({ records: [record], metadata })) > limits.responseBytes) {
        loss.add('projection_byte_limit'); continue;
      }
      projectionBytes += size;
      if (record.sessionKey) sessions.add(record.sessionKey);
      keep.push(record);
    }
    const retained = keep.filter(record => record.outcome !== 'unavailable');
    if (retained.length < ids.size) loss.add('route_limit');
    const nativeLoss = new Set(loss);
    const nativeKept = retained.map(record => nextNativeRoutes.get(record.id)).filter(Boolean);
    if (nativeKept.length < retained.length) nativeLoss.add('projection_byte_limit');
    nextNativeSource.lifted = referencedLifts(nativeKept, nextNativeSource.lifted);
    // Bound the SECOND sanitized projection by its entire detached envelope,
    // independently of the unchanged legacy retention/selection contract.
    const nativeState = projectNativeSnapshot({ ...metadata, pid: raw.pid, source: nextNativeSource,
      routes: nativeKept, reasons: [...nativeLoss], limits });
    if (nativeState.routes.length < nativeKept.length) nativeLoss.add('projection_byte_limit');
    routes = new Map(retained.map(record => [record.id, record]));
    lost = new Map(keep.filter(record => record.outcome === 'unavailable').map(record => [record.key, record]));
    nativeProjector = nextNativeProjector;
    nativeRoutes = new Map(nativeState.routes.map(record => [record.id, record]));
    nativeSource = { ...nextNativeSource, lifted: nativeState.lifted };
    nativeReasons = nativeLoss;
    highestId = Math.max(reset ? -1 : highestId, ...raw.ids);
    identities = nextIdentities; generation = nextGeneration; seq = raw.seq; pid = raw.pid; initialized = true; pendingReset = false;
    coverageReasons = loss;
    connection = nextConnection;
    revision++;
    return { resync: false };
  }
  function records() { return [...routes.values(), ...lost.values()].sort(recentFirst); }
  function listSessions() { return buildSessions(records()); }
  function snapshot(scope) {
    const all = records(), sessions = buildSessions(all);
    // Validate selection against the authoritative cache, not a byte-limited
    // response. A session omitted from All is still individually inspectable.
    const selectedKeys = new Set(selectRequests(all, sessions, scope).map(record => record.key));
    const scopeSession = sessions.find(session => session.key === scope.sessionKey);
    function project(visible, limited = false) {
      const selected = visible.filter(record => selectedKeys.has(record.key)).sort(recentFirst);
      const directory = visible === all ? sessions : buildSessions(visible);
      // Keep a valid selector even if none of its complete requests fits. These
      // are observed session counters, not invented empty-session metadata.
      if (scopeSession && !directory.some(session => session.key === scopeSession.key)) directory.unshift(scopeSession);
      return liveState({ records: visible, selected, sessions: directory, scope,
        metadata: { instanceId, generation, revision, seq, connection },
        reasons: [...coverageReasons, ...(lost.size ? ['trace_evicted'] : []), ...(limited ? ['projection_byte_limit'] : [])] });
    }
    const complete = project(all);
    if (byteSize(complete) <= limits.responseBytes) return structuredClone(complete);

    // Request-only retention is insufficient: sessions, graph keys, metrics and
    // the envelope all count toward the HTTP ceiling. Measure the whole result
    // exactly, caching large request/key sizes during the bounded prefix search.
    const sizes = new Map(complete.requests.map(record => [record.key, byteSize(record) + byteSize(record.key)]));
    function fits(state) {
      const envelopeBytes = byteSize({ ...state, requests: [], graph: { requestKeys: [] } });
      const payloadBytes = state.requests.reduce((total, record) => total + sizes.get(record.key), 0);
      return envelopeBytes + payloadBytes + 2 * Math.max(0, state.requests.length - 1) <= limits.responseBytes;
    }
    const empty = project([], true);
    if (!fits(empty)) throw new ApiError(502, 'payload_limit', 'The response limit is too small for snapshot metadata.');
    const ordered = [...all].sort((a, b) => Number(b.sessionKey === scope.sessionKey && !!scopeSession) -
      Number(a.sessionKey === scope.sessionKey && !!scopeSession) || Number(selectedKeys.has(b.key)) - Number(selectedKeys.has(a.key)) ||
      retentionFirst(a, b));
    let start = 0, result = empty;
    // An oversized first request must not hide a smaller complete one that fits.
    for (; start < ordered.length; start++) {
      const single = project([ordered[start]], true);
      if (fits(single)) { result = single; break; }
    }
    if (start < ordered.length) {
      let low = 1, high = ordered.length - start;
      while (low < high) {
        const count = Math.ceil((low + high) / 2);
        const candidate = project(ordered.slice(start, start + count), true);
        if (fits(candidate)) { result = candidate; low = count; }
        else high = count - 1;
      }
    }
    return structuredClone(result);
  }
  function nativeSnapshot() {
    return projectNativeSnapshot({ instanceId, generation, revision, seq, pid, connection, source: nativeSource,
      routes: [...nativeRoutes.values()], reasons: [...nativeReasons], limits });
  }
  function clear() {
    routes.clear(); lost.clear(); identities.clear(); coverageReasons.clear();
    nativeRoutes.clear(); nativeReasons.clear();
    nativeSource = { now: null, serves: null, totals: null, lifted: {} };
    nativeProjector = createNativeProjector({ limits, showFolders });
    seq = 0; pid = null; initialized = false; pendingReset = false; highestId = -1; generation++; revision++;
    connection = { ...connection, status: 'stopped', lastUpdated: null, reason: 'collector_stopped' };
  }
  return { applyTrace, setConnection, snapshot, nativeSnapshot, listSessions, clear, get seq() { return seq; }, get generation() { return generation; } };
}

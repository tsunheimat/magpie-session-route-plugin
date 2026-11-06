import { randomUUID } from 'node:crypto';
import { ApiError, PERIODS } from './contracts.mjs';
import { digest, integer, isObject, limitsOf, measurement, normalizeUsage, nowOf, safeIdentifier } from './privacy.mjs';
import { buildSessions, calculateMetrics, selectRequests } from './metrics.mjs';

const ALL = Object.freeze({ kind: 'all', sessionKey: null, includeChildren: true, period: 'live' });
const expired = () => new ApiError(409, 'history_expired', 'This history snapshot expired. Restart from the first page.');
const unavailable = () => new ApiError(503, 'history_unavailable', 'Usage history is unavailable. Try again after reconnecting.');
const malformed = () => new ApiError(502, 'gateway_malformed', 'Magpie returned malformed usage history.');
const abortError = () => new DOMException('The operation was aborted.', 'AbortError');

// Cancellation of one browser must not cancel a shared scan for other browsers.
function waitFor(promise, signal) {
  if (!signal) return promise;
  if (signal.aborted) return Promise.reject(signal.reason ?? abortError());
  return new Promise((resolve, reject) => {
    const abort = () => { signal.removeEventListener('abort', abort); reject(signal.reason ?? abortError()); };
    signal.addEventListener('abort', abort, { once: true });
    promise.then(value => { signal.removeEventListener('abort', abort); resolve(value); },
      error => { signal.removeEventListener('abort', abort); reject(error); });
  });
}

function evidence(raw, row, traces) {
  if (!row.id || !row.agent) return null;
  const canonical = typeof raw.session_role === 'string' && raw.session_role !== '';
  // codexIdentityRow leaves Session untouched for "unknown": it is the
  // effective gateway header, including X-Magpie-Session overrides. Known
  // actors may instead carry a canonical root; only trace-validated native
  // evidence can recover their original gateway identity.
  const session = canonical && raw.session_role !== 'unknown' && raw.native_session ? safeIdentifier(raw.native_session, 512) :
    canonical && raw.session_role === 'subagent' ? null : safeIdentifier(raw.session, 512);
  if (!session) return null;
  // Trace publishes provider.PublicRef(model), while the ledger keeps the
  // internal requested ref. No catalog is available to invert that mapping.
  // Exact ID/start/agent/session must identify ONE trace, regardless of model
  // spelling; model equality must neither reject it nor break an ambiguous tie.
  const matches = traces.filter(trace => trace.id === row.id && trace.agent === row.agent && trace.session === session &&
    (raw.handed_on === true ? trace.attempts.some(attempt => attempt.start === row.time) : trace.time === row.time));
  return matches.length === 1 ? matches[0] : null;
}

function sourceFingerprint(raw) {
  // Query-time Codex enrichment rewrites session/role/subagent/parent_agent;
  // prices and display aliases can also change between offset-based pages.
  // Use source fields, including the original timestamp precision and private
  // upstream IDs for BOTH final and handed-on entries. Only hashes survive.
  return digest(JSON.stringify([raw.route_id ?? null, raw.t, raw.client || raw.agent,
    raw.native_session ?? null, raw.handed_on === true, raw.provider, raw.model,
    raw.providerAccount ?? null, raw.providerKeyId ?? null, raw.host ?? null,
    raw.rid ?? null, raw.response_id ?? null, raw.callerKeyId ?? null,
    raw.session_role ? null : [raw.session ?? null, raw.subagent ?? null],
    // Older entries may have no upstream ID. Preserve distinct recorded
    // outcomes/measurements, not just IDs that can repeat across restarts.
    raw.req ?? null, raw.served ?? null, raw.effort ?? null, raw.ep ?? null, raw.operation ?? null,
    raw.ms, raw.status, raw.err ?? null, raw.in, raw.out, raw.cache_read, raw.cache_write,
    raw.cache_write_1h ?? null, raw.reasoning ?? null, raw.ttft_ms ?? null]));
}

const identityFields = ['agent', 'session', 'sessionKey', 'parentSessionKey', 'subagentId', 'isSubagent', 'isIndependentSubagent'];
const identityReasons = new Set(['invalid_identity', 'actor_unknown', 'historical_identity_unconfirmed']);
function coalesce(previous, incoming, why) {
  why.add('changing_pages');
  previous.moreTries ||= incoming.moreTries;
  if (previous.annotation === incoming.annotation) {
    if (!previous.record.id || !previous.record.agent) {
      why.add('ambiguous_duplicate_usage_withheld');
      previous.record.reasons.push('ambiguous_duplicate_usage_withheld');
    }
    return;
  }
  const sameTrace = previous.trace && incoming.trace && previous.trace.key === incoming.trace.key;
  const actorConflict = previous.knownActor && incoming.knownActor &&
    (previous.role !== incoming.role || previous.record.subagentId !== incoming.record.subagentId);
  if (!previous.ambiguous && sameTrace && !actorConflict) {
    // Retain the first observed usage subtotal (prices are not a new charge),
    // but allow positive actor evidence to replace an earlier unknown label.
    if (!previous.knownActor && incoming.knownActor) {
      for (const field of identityFields) {
        if (Object.hasOwn(incoming.record, field)) previous.record[field] = incoming.record[field];
        else delete previous.record[field];
      }
      previous.record.reasons = [...new Set([...previous.record.reasons.filter(reason => !identityReasons.has(reason)),
        ...incoming.record.reasons])];
      previous.annotation = incoming.annotation; previous.knownActor = true; previous.role = incoming.role;
      previous.trace = incoming.trace;
    }
    return;
  }
  // ID/time alone cannot reconcile conflicting canonical annotations. Withhold
  // the possibly repeated charge, disclose the lost evidence, and don't assign
  // its retained subtotal or route topology to an arbitrarily chosen session.
  why.add('ambiguous_duplicate_usage_withheld');
  previous.ambiguous = true; previous.trace = null;
  previous.record.session = null; previous.record.sessionKey = null; previous.record.parentSessionKey = null;
  previous.record.isSubagent ||= incoming.record.isSubagent;
  if (previous.record.subagentId !== incoming.record.subagentId) previous.record.subagentId = null;
  delete previous.record.isIndependentSubagent;
  previous.record.reasons = [...new Set([...previous.record.reasons, 'actor_unknown', 'ambiguous_duplicate_usage_withheld'])];
}

function sumRows(rows, field) {
  const values = rows.map(row => measurement(row.record[field])).filter(value => value !== null);
  return values.length ? measurement(values.reduce((total, value) => total + value, 0)) : null;
}

function groupRows(rows, snapshotId) {
  const finals = rows.filter(row => !row.handedOn);
  const groups = finals.map(row => ({ final: row, rows: [row] }));
  const orphaned = [];
  for (const row of rows.filter(row => row.handedOn)) {
    const r = row.record;
    const candidates = groups.filter(group => {
      const f = group.final.record;
      if (!r.id || r.id !== f.id || !r.sessionKey || r.sessionKey !== f.sessionKey || r.subagentId !== f.subagentId ||
          (r.model && f.model && r.model !== f.model)) return false;
      if (row.trace && group.final.trace) return row.trace.key === group.final.trace.key;
      // A final ledger row's timestamp is request start, handed-on rows are try
      // starts. ID alone is not durable identity, nor is page order attempt order.
      const duration = measurement(f.ms);
      return duration !== null && duration <= 86_400_000 && Date.parse(r.time) >= Date.parse(f.time) &&
        Date.parse(r.time) <= Date.parse(f.time) + duration;
    });
    if (candidates.length === 1) candidates[0].rows.push(row);
    else orphaned.push({ final: null, rows: [row] });
  }
  return [...groups, ...orphaned].map((group, index) => {
    const base = group.final?.record ?? group.rows[0].record;
    const record = { ...base, key: `ledger:${snapshotId}:${index}`, reasons: [...base.reasons] };
    const trace = group.final?.trace;
    for (const field of ['tokens', 'inputTokens', 'outputTokens', 'cacheReadTokens', 'cacheWriteTokens', 'reasoningTokens', 'cost']) {
      record[field] = sumRows(group.rows, field);
      if (group.rows.some(row => row.record[field] === null)) record.reasons.push(field === 'cost' ? 'missing_prices' : 'incomplete_measurements');
    }
    record.priced = group.rows.every(row => row.record.priced);
    if (!group.final) {
      record.done = false; record.outcome = 'unknown'; record.status = null; record.error = null; record.ms = null; record.ttft = null;
      record.reasons.push('handed_on_only', 'request_identity_unavailable');
    }
    if (trace) {
      record.candidates = trace.candidates; record.attempts = trace.attempts;
      record.retries = trace.retries; record.fallbacks = trace.fallbacks;
      record.group = trace.group;
      record.parentSessionKey = trace.parentSessionKey;
      record.isSubagent = trace.isSubagent || record.isSubagent;
      record.subagentId = trace.subagentId ?? record.subagentId;
      if (trace.folder !== undefined) record.folder = trace.folder;
      record.reasons = record.reasons.filter(reason => reason !== 'attempt_history_unavailable');
      record.reasons.push(...trace.reasons);
      if (!trace.done) record.reasons.push('retained_trace_incomplete');
    }
    if (group.final && group.final.record.id && group.rows.length === 1 && group.final.moreTries) {
      record.reasons.push('billable_attempt_coverage_unknown');
    }
    record.reasons = [...new Set(record.reasons)]; record.partial = record.reasons.length > 0;
    return record;
  }).sort((a, b) => b.time.localeCompare(a.time) || a.key.localeCompare(b.key));
}

const byteLength = value => Buffer.byteLength(JSON.stringify(value));
const payloadLimit = () => new ApiError(502, 'payload_limit', 'Usage history exceeds the supported response budget.');

function responseFor(value, scope, selected, offset, limit, connection) {
  const requests = selected.slice(offset, offset + limit);
  const coverage = { ...value.coverage, partial: value.coverage.partial || selected.some(record => record.partial),
    reasons: [...new Set([...value.coverage.reasons, ...selected.flatMap(record => record.reasons)])] };
  return { apiVersion: 1, instanceId: value.instanceId, generation: value.generation, revision: value.revision,
    seq: value.seq, scope, connection, coverage, sessions: value.sessions,
    unknownRequests: value.records.filter(record => !record.sessionKey && !record.reasons.includes('handed_on_only')).length, requests,
    metrics: calculateMetrics(selected, { partial: coverage.partial }), graph: { requestKeys: requests.map(record => record.key) },
    pagination: { snapshotId: value.id, offset, limit, total: selected.length, nextOffset: offset + requests.length < selected.length ? offset + requests.length : null } };
}

function boundSnapshot(value, maximum) {
  function projected(records) {
    return { ...value, records, sessions: buildSessions(records) };
  }
  function fits(candidate) {
    // Budget the complete envelope, not just the cached records. Including ALL
    // records and graph keys also bounds every page. Reserve the widest scope
    // plus numeric and connection headroom for subsequent scoped/paged reads.
    const scope = { ...ALL, period: value.period, includeChildren: false };
    const state = responseFor(candidate, scope, candidate.records, 0, Math.max(200, candidate.records.length), candidate.connection);
    let widestScope = byteLength(scope);
    for (const session of candidate.sessions) widestScope = Math.max(widestScope,
      byteLength({ ...scope, kind: 'session', sessionKey: session.key }));
    const numericHeadroom = Object.keys(state.metrics).length * 32 + 32;
    return byteLength(state) + widestScope - byteLength(scope) + numericHeadroom + 256 <= maximum;
  }
  if (fits(value)) return value;
  value = { ...value, coverage: { ...value.coverage, partial: true,
    reasons: [...new Set([...value.coverage.reasons, 'response_byte_limit'])] } };
  let bounded = projected([]);
  if (!fits(bounded)) throw payloadLimit();
  // Trim once, before publishing the immutable snapshot ID. Rebuild every
  // derived total/index from that same retained prefix; never skip page rows
  // while claiming untrimmed usage totals or advancing over unseen records.
  let low = 0, high = value.records.length;
  while (low < high) {
    const count = Math.ceil((low + high) / 2), candidate = projected(value.records.slice(0, count));
    if (fits(candidate)) { low = count; bounded = candidate; } else high = count - 1;
  }
  return bounded;
}

export function createHistory({ gateway, aggregator, limits: input, clock } = {}) {
  const limits = limitsOf(input), snapshots = new Map(), latest = new Map(), scans = new Map(), failures = new Map();
  let queue = Promise.resolve(), epoch = 0, stopped = false;
  function prune() {
    const now = nowOf(clock);
    for (const [id, value] of snapshots) if (now >= value.expires) snapshots.delete(id);
    while (snapshots.size > limits.historySnapshots) snapshots.delete(snapshots.keys().next().value);
    for (const [period, id] of latest) if (!snapshots.has(id)) latest.delete(period);
  }
  async function scan(period, controller, startedEpoch) {
    const { signal } = controller;
    if (signal.aborted || stopped || startedEpoch !== epoch) throw unavailable();
    const began = nowOf(clock), snapshotId = randomUUID(), base = aggregator.snapshot(ALL);
    const rows = [], seen = new Map(), why = new Set(['local_rejections_and_probes_excluded']);
    let offset = 0, total = null, bytes = 0, pages = 0, scanned = 0, complete = false;
    // Abort an HTTP request as well as bounding the work between pages.
    const timer = setTimeout(() => controller.abort(new ApiError(504, 'history_timeout', 'Usage history scan timed out.')), limits.historyTimeout);
    try {
      while (pages < limits.historyPages && scanned < limits.historyRows) {
        if (signal.aborted || nowOf(clock) - began >= limits.historyTimeout) { why.add('scan_timeout'); break; }
        const limit = Math.min(limits.historyPageSize, limits.historyRows - scanned);
        let page;
        try { page = await gateway.usage({ period, offset, limit, signal }); }
        catch (error) {
          if (startedEpoch !== epoch || stopped) throw unavailable();
          if (pages === 0) throw error;
          why.add(signal.aborted ? 'scan_timeout' : 'scan_interrupted'); break;
        }
        if (startedEpoch !== epoch || stopped) throw unavailable();
        if (!isObject(page) || !Array.isArray(page.rows) || integer(page.total) === null || integer(page.offset) === null ||
            page.period !== period || page.rows.length > limit) throw malformed();
        bytes += Buffer.byteLength(JSON.stringify(page));
        if (bytes > limits.responseBytes) { why.add('scan_byte_limit'); break; }
        if (page.offset !== offset) { why.add('changing_pages'); break; }
        if (total !== null && page.total !== total) why.add('changing_pages');
        total = page.total; pages++;
        for (const raw of page.rows) {
          scanned++;
          const record = normalizeUsage(raw, { key: 'row' });
          if (!record) { why.add('rows_withheld'); continue; }
          const fingerprint = sourceFingerprint(raw);
          const trace = evidence(raw, record, base.requests);
          if (trace && !record.sessionKey) {
            record.agent = trace.agent; record.session = trace.session; record.sessionKey = trace.sessionKey;
            record.reasons = record.reasons.filter(reason => reason !== 'invalid_identity');
          }
          if (raw.session_role && !trace) {
            record.reasons = [...new Set([...record.reasons, 'historical_identity_unconfirmed'])];
          }
          if (trace && raw.session_role === 'subagent' && record.subagentId &&
              raw.native_session === record.subagentId && trace.session === record.subagentId &&
              (!trace.subagentId || trace.subagentId === record.subagentId)) record.isIndependentSubagent = true;
          const entry = { record, trace, handedOn: raw.handed_on === true, moreTries: integer(raw.tries) > 1,
            role: raw.session_role, knownActor: ['main', 'subagent'].includes(raw.session_role),
            annotation: digest(JSON.stringify([raw.session ?? null, raw.session_role ?? null, raw.subagent ?? null, raw.parent_agent ?? null])) };
          if (seen.has(fingerprint)) { coalesce(seen.get(fingerprint), entry, why); continue; }
          seen.set(fingerprint, entry); rows.push(entry);
        }
        offset += page.rows.length;
        if (offset >= total) { complete = true; break; }
        if (!page.rows.length) { why.add('changing_pages'); break; }
      }
      if (!complete) why.add(pages >= limits.historyPages ? 'scan_page_limit' : scanned >= limits.historyRows ? 'scan_row_limit' : 'scan_incomplete');
      if (pages > 1) why.add('non_atomic_pages');
      // Duplicate final rows with the same retained evidence cannot both own an
      // identical route. Keep the recorded usage, but do not attach its topology.
      const owners = new Map();
      for (const row of rows) if (!row.handedOn && row.trace) owners.set(row.trace.key, (owners.get(row.trace.key) ?? 0) + 1);
      for (const row of rows) if (row.trace && owners.get(row.trace.key) > 1) { row.trace = null; row.record.reasons.push('ambiguous_trace_join'); }
      let records = groupRows(rows, snapshotId);
      const sessionsSeen = new Set();
      let projectionBytes = 0;
      records = records.filter(record => {
        if (record.sessionKey && !sessionsSeen.has(record.sessionKey) && sessionsSeen.size >= limits.sessions) { why.add('session_limit'); return false; }
        const size = byteLength(record);
        if (projectionBytes + size > limits.responseBytes) { why.add('projection_byte_limit'); return false; }
        projectionBytes += size;
        if (record.sessionKey) sessionsSeen.add(record.sessionKey);
        return true;
      });
      if (startedEpoch !== epoch || stopped) throw unavailable();
      const at = new Date(nowOf(clock)).toISOString();
      const result = boundSnapshot({ id: snapshotId, period, expires: nowOf(clock) + limits.historyTTL, records,
        sessions: buildSessions(records), instanceId: base.instanceId, generation: base.generation, revision: base.revision, seq: base.seq,
        connection: { ...base.connection }, coverage: { source: 'ledger', period,
          label: `Usage ledger (${period}; gateway-local calendar days; excludes local rejections/probes)`,
          partial: why.size > 1, reasons: [...why], scanned, available: total, snapshotAt: at } }, limits.responseBytes);
      snapshots.set(snapshotId, result); latest.set(period, snapshotId); prune();
      return result;
    } finally { clearTimeout(timer); }
  }
  function getSnapshot(period) {
    prune();
    const cached = snapshots.get(latest.get(period));
    if (cached) return Promise.resolve(cached);
    if (scans.has(period)) return scans.get(period).promise;
    if (nowOf(clock) < (failures.get(period) ?? 0)) return Promise.reject(unavailable());
    failures.delete(period);
    const controller = new AbortController(), startedEpoch = epoch;
    const promise = queue.catch(() => {}).then(() => scan(period, controller, startedEpoch)).catch(error => {
      if (startedEpoch === epoch && !stopped) failures.set(period, nowOf(clock) + Math.min(limits.historyTTL, 5000));
      if (error instanceof ApiError) throw error;
      throw unavailable();
    });
    const work = { controller, promise };
    scans.set(period, work);
    // The scheduling tail must resolve to nothing: retaining a resolved scan
    // result here would keep revoked/expired records alive after clear().
    queue = promise.then(() => {}, () => {});
    promise.finally(() => { if (scans.get(period) === work) scans.delete(period); }).catch(() => {});
    return promise;
  }
  return {
    async snapshot(scope, { offset = 0, limit = 100, snapshotId = null, signal } = {}) {
      if (stopped) throw unavailable();
      signal?.throwIfAborted();
      if (!PERIODS.includes(scope.period) || scope.period === 'live' || integer(offset) === null || integer(limit) === null || limit < 1 || limit > 200) {
        throw new ApiError(400, 'invalid_history', 'Invalid history period or pagination.');
      }
      if (offset && !snapshotId) throw expired();
      prune();
      let value;
      if (snapshotId) {
        value = snapshots.get(snapshotId);
        if (!value || value.period !== scope.period) throw expired();
      } else value = await waitFor(getSnapshot(scope.period), signal);
      signal?.throwIfAborted();
      if (stopped || !snapshots.has(value.id)) throw expired();
      const selected = selectRequests(value.records, value.sessions, scope);
      if (offset > selected.length) throw new ApiError(400, 'invalid_offset', 'History offset exceeds this snapshot.');
      const connection = aggregator.snapshot(ALL).connection;
      const state = responseFor(value, scope, selected, offset, limit, connection);
      // A future gateway may enlarge connection metadata beyond the reserved
      // headroom. Never send an oversize body or mutate an already issued ID.
      if (byteLength(state) > limits.responseBytes) throw payloadLimit();
      return structuredClone(state);
    },
    clear() {
      epoch++; snapshots.clear(); latest.clear(); failures.clear();
      for (const work of scans.values()) work.controller.abort();
      scans.clear();
    },
    async stop() {
      stopped = true; this.clear(); await queue;
    },
  };
}

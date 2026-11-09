import { createHash, createHmac, randomBytes } from 'node:crypto';
const candidateSalt = randomBytes(32);
const opaqueCandidate = value => createHmac('sha256', candidateSalt).update(value).digest('base64url').slice(0, 22);
import { DEFAULT_LIMITS, sessionKey } from './contracts.mjs';

export const isObject = value => value !== null && typeof value === 'object' && !Array.isArray(value);
export const measurement = value => typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= Number.MAX_SAFE_INTEGER ? value : null;
export const integer = value => Number.isSafeInteger(value) && value >= 0 ? value : null;
export const statusCode = value => Number.isInteger(value) && value >= 100 && value <= 599 ? value : null;
export const nowOf = clock => Number(typeof clock === 'function' ? clock() : clock?.now ? clock.now() : Date.now());
export const isoTime = value => {
  if (typeof value !== 'string' || value.length > 64 || !/^\d{4}-\d\d-\d\dT/u.test(value)) return null;
  const time = Date.parse(value);
  return Number.isFinite(time) && time > 0 ? new Date(time).toISOString() : null;
};
export const digest = value => createHash('sha256').update(value).digest('base64url');

// Reject rather than truncate identifiers: lossy redaction must never join two actors.
// Metadata is not a general-purpose text channel (in particular not URLs or credentials).
const unsafe = /[\u0000-\u001f\u007f-\u009f‪-‮⁦-⁩]|(?:[a-z][a-z\d+.-]*:\/\/)|(?:www\.)|@|(?:\b(?:bearer|basic)\s)|(?:\bsk-(?:ant-|proj-)?[a-z\d_-]{8,})|(?:\b(?:api[_-]?key|authorization|password|secret|token)\s*[=:])/iu;
export function safeIdentifier(value, max = 256) {
  return typeof value === 'string' && value.length > 0 && value.length <= max && !unsafe.test(value) &&
    /^[\p{L}\p{N}_.:/+\- ]+$/u.test(value) && !value.startsWith('//') ? value : null;
}
export function safeModel(value, max = 256) {
  if (typeof value !== 'string' || value.length > max) return null;
  // Magpie's modelWindow/grokWindow and Vertex IDs use numeric @window or
  // @version suffixes, optionally followed by routing effort/tier modifiers.
  // Claude Code also names a long-context model with a trailing [1m]. These
  // exceptions are model-only, never account/email or credential exceptions.
  let base = value.endsWith('[1m]') ? value.slice(0, -4) : value;
  if (base.includes('@')) {
    if (!/^[^@]+@\d+[km]?(?::[a-z\d_-]+)*$/iu.test(base)) return null;
    base = base.replace(/@\d+[km]?/iu, '');
  }
  return safeIdentifier(base, max) ? value : null;
}
export function safeFolder(value) {
  return typeof value === 'string' && value.length <= 256 && value.length > 0 && !unsafe.test(value) &&
    /^[\p{L}\p{N}_ .~/\\:+-]+$/u.test(value) ? value : null;
}
// Display text is intentionally separate from identifiers: native configured
// provider names can contain Unicode and punctuation, but not private payloads.
const unsafeDisplay = /[\p{C}\p{Zl}\p{Zp}]|(?:[a-z][a-z\d+.-]*:\/\/)|(?:\b(?:file|data|javascript|mailto):)|(?:www\.)|(?:^|\s)\/\/\S|(?:[^\s@]+@[^\s@]+)|(?:\b[a-z\d.-]+\.[a-z]{2,}(?::\d+)?[/?#])|(?:\b(?:bearer|basic)\s)|(?:\bsk-(?:ant-|proj-)?[a-z\d_-]{8,})|(?:\b(?:api[_ -]?key|authorization|password|secret|token)\s*[=:])|(?:\b(?:gh[pousr]_|github_pat_|glpat-|xox[baprs]-)[a-z\d_-]{8,})|(?:\b(?:AKIA|ASIA)[A-Z\d]{16}\b)|(?:\bAIza[a-z\d_-]{20,})|(?:\beyJ[a-z\d_-]{8,}\.[a-z\d_-]+\.[a-z\d_-]+)|(?:-----BEGIN [A-Z ]*PRIVATE KEY-----)/iu;
export function safeDisplayName(value, max = 256) {
  return typeof value === 'string' && value.length <= max && value.trim().length > 0 && !unsafeDisplay.test(value) ? value : null;
}

// Derive only from validated recorded folders, never resolve a path or inspect
// the filesystem. Both gateway host path conventions are independent of ours.
export function safeProjectName(value) {
  const folder = safeFolder(value);
  if (!folder || /^(?:\\\\|\/\/)[^\\/]+(?:[\\/]+[^\\/]+)?[\\/]*$/u.test(folder)) return null;
  const name = folder.replace(/[\\/]+$/u, '').split(/[\\/]/u).at(-1);
  return safeDisplayName(name) && !['.', '..', '~'].includes(name.trim()) && !/^[a-z]:/iu.test(name) ? name : null;
}
export function safeVersion(value) {
  return typeof value === 'string' && /^(?:v?\d+\.\d+(?:\.\d+)?(?:[-+][A-Za-z0-9.-]{1,80})?|dev)$/u.test(value) ? value : null;
}
export function limitsOf(input = {}) {
  return Object.fromEntries(Object.entries(DEFAULT_LIMITS).map(([key, maximum]) =>
    [key, Number.isSafeInteger(input[key]) && input[key] > 0 ? Math.min(input[key], maximum) : maximum]));
}

const failureLabels = new Map([
  ['quota', 'Allowance exhausted.'], ['limit', 'Allowance exhausted.'], ['usage', 'Allowance exhausted.'],
  ['rate', 'Rate limited.'], ['overload', 'Upstream unavailable.'], ['overloaded', 'Upstream unavailable.'],
  ['timeout', 'Upstream timed out.'], ['auth', 'Upstream authentication failed.'],
  ['verify', 'Account verification required.'], ['cancel', 'Request cancelled.'], ['canceled', 'Request cancelled.'],
]);
export function safeError(status, fail, hasError = false) {
  if (failureLabels.has(fail)) return failureLabels.get(fail);
  if (status === 499) return 'Request cancelled.';
  if (status === 429) return 'Rate limited.';
  if (status === 401 || status === 403) return 'Upstream authentication failed.';
  if (status === 408 || status === 504) return 'Upstream timed out.';
  if (status >= 500) return 'Upstream unavailable.';
  return hasError || (typeof fail === 'string' && fail.length > 0) || status >= 400 ? 'Upstream request failed.' : null;
}
function outcome(done, status, error) {
  if (!done) return 'in-flight';
  if (error || status >= 400) return 'failed';
  return status >= 200 && status < 400 ? 'success' : 'unknown';
}
function identity(raw, { ledger = false } = {}) {
  // Ledger `agent` can be a user alias; `client` is the actual recorded agent.
  const agent = safeIdentifier(ledger && raw.client ? raw.client : raw.agent);
  // Query-time Codex identities can replace a native header with a canonical
  // root. Only retained trace evidence may restore that exact native identity.
  const session = ledger && raw.session_role ? null : safeIdentifier(raw.session, 512);
  const key = agent && session ? sessionKey(agent, session) : null;
  const parent = !ledger && (raw.parentMatched === undefined || raw.parentMatched === false) ? safeIdentifier(raw.parentSession, 512) : null;
  const subagentId = safeIdentifier(ledger ? raw.subagent : raw.subagentId, 128);
  return {
    agent, session: key ? session : null, sessionKey: key,
    parentSessionKey: agent && parent && parent !== session ? sessionKey(agent, parent) : null,
    subagentId,
    isSubagent: (typeof (ledger ? raw.subagent : raw.subagentId) === 'string' && (ledger ? raw.subagent : raw.subagentId).length > 0) ||
      (typeof raw.sub === 'string' && raw.sub.length > 0) || isObject(raw.subagent) ||
      // Documented aliases in Magpie internal/usage/purpose.go. Codex workers
      // can share the parent's session header without any separate actor ID.
      ['collab_spawn', 'thread_spawn', 'agent_job'].includes(raw.kind) ||
      (ledger && ['subagent', 'child'].includes(raw.session_role)),
  };
}
function baseRequest(raw, { key, time, updatedAt, showFolders = false, ledger = false }) {
  return {
    key, id: integer(ledger ? raw.route_id : raw.id), time, updatedAt, ...identity(raw, { ledger }),
    model: safeModel(ledger ? raw.req : raw.model), servedModel: safeModel(raw.served),
    provider: safeIdentifier(raw.provider), effort: safeIdentifier(raw.effort, 64),
    ...(showFolders ? { folder: safeFolder(raw.folder) } : {}),
    group: !ledger && isObject(raw.group) ? {
      id: safeIdentifier(raw.group.id, 128), name: safeIdentifier(raw.group.name, 128),
    } : null,
    done: ledger || raw.done, status: statusCode(raw.status), outcome: 'unknown', error: null,
    ms: measurement(raw.ms), ttft: measurement(ledger ? raw.ttft_ms : raw.ttft),
    tokens: null, inputTokens: null, outputTokens: measurement(raw.out),
    cacheReadTokens: null, cacheWriteTokens: null, reasoningTokens: measurement(raw.reasoning),
    cost: null, priced: false, retries: null, fallbacks: null,
    candidates: [], attempts: [], partial: false, reasons: [],
  };
}

// Only these projections are retained. The raw seat IDs exist for this call only.
export function normalizeTrace(raw, { generation = 1, updatedAt, limits = DEFAULT_LIMITS, showFolders = false } = {}) {
  limits = limitsOf(limits);
  if (!isObject(raw) || integer(raw.id) === null || !isoTime(raw.time) || typeof raw.done !== 'boolean') return null;
  const time = isoTime(raw.time);
  const record = baseRequest(raw, { key: `trace:${generation}:${raw.id}`, time, updatedAt: updatedAt ?? time, showFolders });
  const reasons = new Set();
  const order = raw.order == null ? [] : Array.isArray(raw.order) ? raw.order : null;
  const tries = raw.tries == null ? [] : Array.isArray(raw.tries) ? raw.tries : null;
  if (!order || !tries) reasons.add('malformed_attempts');
  if (raw.order == null || raw.tries == null) reasons.add('attempt_history_unavailable');
  if (raw.session && !record.sessionKey) reasons.add('invalid_identity');
  if (raw.parentMatched === true) reasons.add('inferred_parent_not_included');
  const seats = [];
  const seatKeys = new Map();
  for (const seat of (order ?? []).slice(0, limits.candidates)) {
    if (!isObject(seat) || typeof seat.id !== 'string' || !seat.id || seat.id.length > 2048) {
      reasons.add('malformed_candidates'); continue;
    }
    const model = safeModel(seat.model), fixed = safeIdentifier(seat.fixed, 64);
    if ((seat.model && !model) || (seat.fixed && !fixed)) { reasons.add('malformed_candidates'); continue; }
    const internalKey = JSON.stringify([seat.id, model, fixed]);
    if (seatKeys.has(internalKey)) continue;
    const candidate = {
      key: `${record.key}:candidate:${opaqueCandidate(internalKey)}`, provider: safeIdentifier(seat.provider), model,
      effort: fixed, label: `${seat.kind === 'account' ? 'Account' : seat.kind === 'key' ? 'Key' : 'Candidate'} ${seats.length + 1}`,
      state: 'candidate',
    };
    seatKeys.set(internalKey, candidate);
    seats.push({ id: seat.id, model, fixed, candidate });
  }
  if ((order?.length ?? 0) > limits.candidates) reasons.add('candidate_limit');
  let previous = null, transitionsKnown = !!tries;
  let retries = 0, fallbacks = 0;
  for (const [index, attempt] of (tries ?? []).slice(0, limits.attempts).entries()) {
    if (!isObject(attempt) || typeof attempt.done !== 'boolean') {
      reasons.add('malformed_attempts'); transitionsKnown = false; previous = null; continue;
    }
    const model = safeModel(attempt.model), fixed = safeIdentifier(attempt.fixed, 64);
    const sameId = typeof attempt.id === 'string' ? seats.filter(seat => seat.id === attempt.id) : [];
    const exact = sameId.filter(seat => seat.model === model && seat.fixed === fixed);
    const compatible = sameId.filter(seat => (!model || !seat.model || seat.model === model) &&
      (!fixed || !seat.fixed || seat.fixed === fixed));
    // Weaken only missing evidence, never contradict an explicit model/effort.
    // A fitted `effort` is not a configured `fixed` seat identifier.
    const invalid = (attempt.model && !model) || (attempt.fixed && !fixed);
    const match = invalid ? null : model && exact.length === 1 ? exact[0] : compatible.length === 1 ? compatible[0] : null;
    if (!match) reasons.add('unmatched_attempt');
    const candidateKey = match?.candidate.key ?? null;
    const transition = index === 0 ? 'initial' : previous && candidateKey ?
      (previous === candidateKey ? 'retry' : 'fallback') : 'unknown';
    if (transition === 'retry') retries++;
    if (transition === 'fallback') fallbacks++;
    if (transition === 'unknown') transitionsKnown = false;
    previous = candidateKey;
    const status = statusCode(attempt.status);
    const error = safeError(status, attempt.fail, typeof attempt.error === 'string' && attempt.error.length > 0);
    const state = outcome(attempt.done, status, error);
    record.attempts.push({
      index: index + 1, candidateKey, provider: match?.candidate.provider ?? null,
      model, effort: safeIdentifier(attempt.effort, 64), servedModel: safeModel(attempt.served),
      start: isoTime(attempt.start), done: attempt.done, status, outcome: state,
      ms: measurement(attempt.ms), ttft: measurement(attempt.ttft), error, transition,
    });
    if (match) match.candidate.state = state === 'in-flight' ? 'attempting' :
      state === 'success' || state === 'failed' ? state : 'candidate';
  }
  if ((tries?.length ?? 0) > limits.attempts) { reasons.add('attempt_limit'); transitionsKnown = false; }
  record.candidates = seats.map(seat => seat.candidate);
  if (!reasons.has('attempt_history_unavailable') && transitionsKnown) {
    record.retries = retries; record.fallbacks = fallbacks;
  }
  record.error = safeError(record.status, raw.fail, typeof raw.error === 'string' && raw.error.length > 0);
  record.outcome = outcome(record.done, record.status, record.error);
  const last = record.attempts.at(-1);
  // Route.provider is the initially resolved provider, not proof of who served
  // a fallback. An unmatched/truncated final try cannot inherit that provider.
  if (!tries || tries.length) record.provider = last && record.attempts.length === tries?.length ? last.provider : null;
  record.tokens = measurement(raw.tokens);
  if (record.tokens !== null && record.outputTokens !== null && record.tokens >= record.outputTokens) {
    record.inputTokens = record.tokens - record.outputTokens;
  }
  if (record.done && record.outcome === 'unknown') reasons.add('outcome_unknown');
  if (record.reasoningTokens === 0 && raw.reasoningHidden === true) record.reasoningTokens = null;
  record.partial = reasons.size > 0;
  record.reasons = [...reasons];
  return record;
}

export function normalizeUsage(raw, { key, showFolders = false } = {}) {
  if (!isObject(raw) || !isoTime(raw.t)) return null;
  // Defense in depth: source filters must not accidentally include local agent
  // files, reported calls or another computer's synchronized ledger.
  if ((raw.source && raw.source !== 'through') || raw.computer || raw.rejected === true) return null;
  const time = isoTime(raw.t);
  const record = baseRequest(raw, { key, time, updatedAt: time, ledger: true, showFolders });
  record.error = safeError(record.status, null, typeof raw.err === 'string' && raw.err.length > 0);
  record.outcome = outcome(true, record.status, record.error);
  record.cacheReadTokens = raw.cache_unknown === true ? null : measurement(raw.cache_read);
  record.cacheWriteTokens = raw.cache_unknown === true ? null : measurement(raw.cache_write);
  const input = measurement(raw.in);
  if ([input, record.cacheReadTokens, record.cacheWriteTokens].every(value => value !== null)) {
    record.inputTokens = measurement(input + record.cacheReadTokens + record.cacheWriteTokens);
  }
  if (record.inputTokens !== null && record.outputTokens !== null) record.tokens = measurement(record.inputTokens + record.outputTokens);
  record.cost = raw.priced === true ? measurement(raw.cost) : null;
  record.priced = record.cost !== null;
  record.reasons = ['attempt_history_unavailable'];
  if (raw.session && !record.sessionKey) record.reasons.push('invalid_identity');
  if (!record.id) { record.id = null; record.reasons.push('request_identity_unavailable'); }
  if (raw.session_role === 'unknown') record.reasons.push('actor_unknown');
  if (raw.reasoning_hidden === true && record.reasoningTokens === 0) record.reasoningTokens = null;
  record.partial = true;
  return record;
}

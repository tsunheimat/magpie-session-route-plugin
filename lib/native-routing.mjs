import { createHmac, randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { API_VERSION, ApiError } from './contracts.mjs';
import { integer, isObject, isoTime, limitsOf, measurement, safeDisplayName, safeError, safeFolder, safeIdentifier, safeModel, safeProjectName, statusCode } from './privacy.mjs';

// Read contract: Magpie 3f53fa1f316330b77e5ff6d065a7a56980cafda2,
// gateway/trace.go (Route, Weighed, Try, GroupRef, Totals), routing.go (Rest),
// affinity.go, and the upper routing/client.js stage / explanation helpers.
// This is deliberately NOT an object sanitizer: only named scalar fields and
// these finite nested shapes are projected. No provider inventory is inferred.
const MODES = new Set(['', 'order', 'drain', 'rotate', 'usage', 'pace', 'manual', 'weight', 'free', 'cheap', 'expiring', 'fast']);
const EFFORTS = new Set(['', 'none', 'off', 'on', 'auto', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max']);
const FAILURES = new Set(['rate', 'credit', 'quota', 'other', 'auth', 'canceled', 'foreign', 'floor', 'verify', 'refused',
  'shape', 'sight', 'proxy', 'offline', 'overloaded', 'effort', 'overflow', 'room', 'slow', 'prompt', 'restricted']);
const REST_BY = new Set(['retry-after', 'credit', 'window', 'resets', 'quota', 'credits', 'verify', 'off', 'restricted', 'backoff', 'cooldown']);
const AFFINITY = new Set(['', 'session', 'turn', 'off', 'strict']);
const AFFINITY_WHY = new Set(['session', 'turn', 'cache', 'strict', 'first', 'new-turn', 'resting', 'spent', 'reserve',
  'credits', 'gone', 'order', 'main', 'back', 'no-cache', 'cold', 'off', 'rule', 'busy']);
const PROTOCOLS = new Set(['', 'anthropic', 'chat', 'responses', 'gemini']);
const TIERS = new Set(['', 'auto', 'default', 'standard', 'priority', 'flex', 'fast', 'scale']);
const UNITS = new Set(['credits', 'points', 'tokens', 'requests', 'USD', 'CNY', '$']);
const PLANS = new Set(['free', 'pro', 'plus', 'max', 'team', 'enterprise', 'business', 'ultra', 'premium']);
const KINDS = new Set(['guardian', 'auto_review', 'guardian_review', 'review', 'compact', 'memory_consolidation', 'memgen', 'memory',
  'thread_title', 'thread_title_reconsideration', 'title_generation', 'title', 'thread_description', 'composer_predictions',
  'collab_spawn', 'thread_spawn', 'agent_job', 'luna_reserve', 'ambient_suggestions', 'ambient_suggestion_safety', 'web_search',
  'vision', 'routing', 'connection_check', 'provider_test', 'api_detect', 'model_list', 'mcp', 'cache_keepalive']);
const MOVES = new Set(['desktop-title', 'desktop-title-first', 'desktop-gone', 'desktop-gone-first', 'desktop-tier',
  'desktop-beside', 'desktop-aside', 'classifier', 'claude-tier', 'stand-in', 'codex-turn', 'privacy']);
const SUBAGENT_KEPT = new Set(['it is disabled in magpie', 'the gateway key may not use it', "magpie doesn't serve it now",
  'no ChatGPT account on in magpie serves it', 'no ChatGPT account is on in magpie',
  'its task was sealed by the ChatGPT backend that answered its lead, and only a ChatGPT account can open it']);
// Retain the existing public identity vocabulary, not a name/artwork guess map.
const PROVIDERS = new Set(['anthropic', 'openai', 'google', 'codex', 'claude', 'gemini', 'deepseek', 'xai',
  'moonshot', 'moonshot-cn', 'kimi-code', 'kimi-code-cn', 'zhipu', 'zai', 'minimax', 'minimax-cn', 'qwen', 'qwen-cn',
  'mistral', 'openrouter', 'ollama', 'copilot', 'cursor', 'kiro', 'groq', 'bedrock', 'together']);
const WORKER_KINDS = new Set(['collab_spawn', 'thread_spawn', 'agent_job']);
// One fixed module-relative read, shared with the public static loader. Only
// flat bundled artwork paths become tokens; no gateway-controlled path is read.
const artwork = JSON.parse(readFileSync(new URL('../ui/vendor/magpie/static-manifest.json', import.meta.url), 'utf8'));
const ICONS = new Set(['generic', ...(Array.isArray(artwork.files) ? artwork.files : []).flatMap(path => {
  const match = typeof path === 'string' && /^vendor\/magpie\/icons\/([a-z0-9][a-z0-9-]{0,127})\.(?:svg|png)$/u.exec(path);
  return match ? [match[1]] : [];
})]);
const validID = value => typeof value === 'string' && value.length > 0 && value.length <= 2048;
const bool = value => typeof value === 'boolean' ? value : null;
const enumOf = allowed => value => allowed.has(value) ? value : null;
const size = value => Buffer.byteLength(JSON.stringify(value));
const capacity = () => new ApiError(502, 'payload_limit', 'The response limit is too small for native trace metadata.');

export function createNativeProjector({ limits: input, showFolders = false, showProjectNames = true } = {}) {
  const limits = limitsOf(input), namespace = randomBytes(32);
  // No raw-id lookup table. One namespace per aggregator generation. Account
  // and rest references intentionally share a domain; providers/groups do not.
  const opaque = (domain, raw) => validID(raw) ? `${domain}_${createHmac('sha256', namespace)
    .update(JSON.stringify([domain, raw])).digest('base64url').slice(0, 22)}` : null;
  const seatID = raw => opaque('seat', raw);
  const groupID = raw => opaque('group', raw);
  const providerID = raw => PROVIDERS.has(raw) ? raw : opaque('provider', raw);
  function model(value) {
    if (typeof value !== 'string') return null;
    if (value.startsWith('group/')) { const id = groupID(value.slice(6)); return id ? `group/${id}` : null; }
    return safeModel(value);
  }
  // Group members are provider/model[:fixed], not account IDs. Map their
  // provider/group domain too, so native member ordering still finds each seat.
  function member(value) {
    if (typeof value !== 'string') return null;
    if (value.startsWith('group/')) return model(value);
    const slash = value.indexOf('/');
    if (slash <= 0) return null;
    const provider = providerID(value.slice(0, slash)), name = safeModel(value.slice(slash + 1));
    return provider && name ? `${provider}/${name}` : null;
  }
  function fields(raw, out, keys, check, reasons) {
    for (const key of keys.split(' ')) if (Object.hasOwn(raw, key) && raw[key] != null) {
      const value = check(raw[key]);
      if (value !== null) out[key] = value;
      else reasons?.add('malformed_optional');
    }
    return out;
  }
  function list(raw, max, project, reasons, reason = 'candidate_limit') {
    if (raw == null) return [];
    if (!Array.isArray(raw)) { reasons.add('malformed_optional'); return []; }
    if (raw.length > max) reasons.add(reason);
    return raw.slice(0, max).map(value => {
      const projected = project(value);
      if (projected === null) reasons.add('malformed_optional');
      return projected;
    }).filter(value => value !== null);
  }
  function failure(raw, out, reasons, key = 'fail') {
    if (typeof raw[key] === 'string' && raw[key]) {
      out[key] = FAILURES.has(raw[key]) ? raw[key] : 'other';
      if (out[key] === 'other' && raw[key] !== 'other') reasons.add('unknown_failure');
    } else if (raw[key] != null && raw[key] !== '') reasons.add('malformed_optional');
    const error = safeError(statusCode(raw.status), out[key], typeof raw.error === 'string' && !!raw.error);
    if (error) { out.error = error; if (key === 'fail' && !out.fail) out.fail = 'other'; }
  }
  function rest(raw, reasons) {
    if (!isObject(raw)) { if (raw != null) reasons.add('malformed_optional'); return null; }
    const until = isoTime(raw.until);
    if (!until) { reasons.add('rest_unavailable'); return null; }
    const out = { until };
    fields(raw, out, 'key', seatID, reasons);
    fields(raw, out, 'model', safeModel, reasons);
    fields(raw, out, 'status', statusCode, reasons);
    fields(raw, out, 'failures', integer, reasons);
    fields(raw, out, 'by', enumOf(REST_BY), reasons);
    fields(raw, out, 'probed rate', bool, reasons);
    failure(raw, out, reasons, 'why');
    if (!out.why) reasons.add('unknown_failure');
    return out;
  }
  function weighed(raw, reasons) {
    if (!isObject(raw)) { reasons.add('malformed_candidates'); return null; }
    const id = seatID(raw.id), provider = providerID(raw.provider), name = safeModel(raw.model);
    // Invalid model/fixed must not collapse two native seats into one.
    if (!id || !provider || !name || (raw.fixed != null && !EFFORTS.has(raw.fixed))) {
      reasons.add('malformed_candidates'); return null;
    }
    const kind = ['account', 'key', 'provider'].includes(raw.kind) ? raw.kind : 'candidate';
    if (kind === 'candidate') reasons.add('candidate_kind_unavailable');
    if (!MODES.has(raw.routing)) reasons.add('routing_mode_unavailable');
    const displayName = safeDisplayName(raw.name);
    if (!displayName) reasons.add(raw.name == null || raw.name === '' ? 'provider_name_unavailable' : 'provider_name_withheld');
    const preset = safeDisplayName(raw.preset, 128) && /^[a-z0-9][a-z0-9-]*$/u.test(raw.preset) ? raw.preset : null;
    if (raw.preset != null && raw.preset !== '' && !ICONS.has(preset)) reasons.add('provider_preset_unsupported');
    const explicitIcon = raw.icon != null && raw.icon !== '';
    const icon = explicitIcon ? ICONS.has(raw.icon) ? raw.icon : 'generic' : ICONS.has(preset) ? preset : 'generic';
    if (explicitIcon && !ICONS.has(raw.icon)) reasons.add('provider_icon_unsupported');
    const label = `${kind === 'account' ? 'Account' : kind === 'key' ? 'Key' : 'Candidate'} ${id.slice(5, 13)}`;
    const out = { id, provider, name: displayName ?? `Provider ${opaque('provider', raw.provider).slice(-8)}`, kind, model: name,
      who: label, icon, ...(preset ? { preset } : {}) };
    fields(raw, out, 'fixed', enumOf(EFFORTS), reasons);
    fields(raw, out, 'routing', enumOf(MODES), reasons);
    fields(raw, out, 'agent', value => PROVIDERS.has(value) ? value : null, reasons);
    fields(raw, out, 'plan', value => typeof value === 'string' && PLANS.has(value.toLowerCase()) ? value : null, reasons);
    fields(raw, out, 'fast fallback shared known learns weekLow free turn unlisted barred held noCredits credits creditsLast creditsFirst aside', bool, reasons);
    fields(raw, out, 'used amount limit balance pace tokens lateTtft lateTps spendCap spent busy', measurement, reasons);
    fields(raw, out, 'fit window capped rank reserve', integer, reasons);
    fields(raw, out, 'due expires restarts capBack spendSince usedRenews sunk', isoTime, reasons);
    fields(raw, out, 'unit', enumOf(UNITS), reasons);
    fields(raw, out, 'speaks noURL', enumOf(PROTOCOLS), reasons);
    fields(raw, out, 'dueBy', enumOf(new Set(['reset', 'expiry'])), reasons);
    fields(raw, out, 'spendPeriod', enumOf(new Set(['day', 'month', 'total'])), reasons);
    fields(raw, out, 'unread', enumOf(new Set(['unread', 'failed', 'stale', 'new', 'error', 'old'])), reasons);
    fields(raw, out, 'heldBy', groupID, reasons);
    if (raw.renews != null) out.renews = list(raw.renews, 16, isoTime, reasons, 'window_limit');
    if (raw.via != null) out.via = list(raw.via, 16, groupID, reasons, 'group_depth_limit');
    if (raw.rest != null) { const value = rest(raw.rest, reasons); if (value) out.rest = value; }
    if (isObject(raw.price)) {
      const value = fields(raw.price, {}, 'input output cacheRead', measurement, reasons);
      fields(raw.price, value, 'peak', bool, reasons);
      if (value.input !== undefined && value.output !== undefined) out.price = value;
      else reasons.add('price_unavailable');
    }
    if (out.known === true && out.used === undefined && out.balance === undefined) {
      delete out.known; reasons.add('quota_unavailable');
    }
    return out;
  }
  function attempt(raw, reasons) {
    if (!isObject(raw) || !validID(raw.id) || typeof raw.done !== 'boolean' ||
        (raw.model != null && !safeModel(raw.model)) || (raw.fixed != null && !EFFORTS.has(raw.fixed))) {
      reasons.add('malformed_attempts'); return null;
    }
    const out = { id: seatID(raw.id), done: raw.done };
    fields(raw, out, 'model served', safeModel, reasons);
    fields(raw, out, 'fixed effort ruleEffort', enumOf(EFFORTS), reasons);
    fields(raw, out, 'tier tierServed', enumOf(TIERS), reasons);
    fields(raw, out, 'start', isoTime, reasons);
    fields(raw, out, 'status', statusCode, reasons);
    fields(raw, out, 'ms ttft firstText firstReasoning flow again queued', measurement, reasons);
    fields(raw, out, 'replan patience', integer, reasons);
    fields(raw, out, 'picked fast reasoningHidden swapped routed kept gone earlier credits', bool, reasons);
    fields(raw, out, 'upstream pin', value => PROVIDERS.has(value) ? value : null, reasons);
    failure(raw, out, reasons);
    if (!out.start) reasons.add('attempt_time_unavailable');
    if (out.done && !out.status && !out.fail) reasons.add('outcome_unknown');
    if (raw.rest != null) { const value = rest(raw.rest, reasons); if (value) out.rest = value; }
    // reset.text, auto[].why, net addresses and vendor errors are not text
    // channels. Their absence is explicit instead of replaying private text.
    if (raw.reset || raw.auto || raw.net) reasons.add('attempt_details_withheld');
    return out;
  }
  function rule(raw, reasons) {
    if (!isObject(raw)) return null;
    const out = {};
    fields(raw, out, 'n turn', integer, reasons);
    fields(raw, out, 'use instead', member, reasons);
    fields(raw, out, 'held waits grown unready compact bare', bool, reasons);
    fields(raw, out, 'effort pick wanted useEffort', enumOf(EFFORTS), reasons);
    for (const key of ['more', 'then', 'small']) if (raw[key] != null) out[key] = list(raw[key], limits.candidates, member, reasons);
    if (showFolders) fields(raw, out, 'folder', safeFolder, reasons);
    // Conditions/classifier text can disclose message intent, folder matching,
    // context or classifier output. Never pass them through as arbitrary text.
    if (raw.when || raw.classified || raw.tokens != null || raw.images != null) reasons.add('rule_details_withheld');
    return out;
  }
  function group(raw, reasons) {
    if (!isObject(raw) || !validID(raw.id)) { reasons.add('group_unavailable'); return null; }
    const id = groupID(raw.id), out = { id, name: `Group ${id.slice(6, 14)}`, ref: `group/${id}` };
    if (!MODES.has(raw.routing)) reasons.add('routing_mode_unavailable');
    fields(raw, out, 'routing', enumOf(MODES), reasons);
    fields(raw, out, 'affinity', enumOf(AFFINITY), reasons);
    fields(raw, out, 'auto sink', bool, reasons);
    // Keep positional member/via alignment even when one member is withheld.
    const members = Array.isArray(raw.members) ? raw.members.slice(0, limits.candidates) : [];
    if (raw.members != null && !Array.isArray(raw.members)) reasons.add('malformed_optional');
    if (raw.members?.length > limits.candidates) reasons.add('candidate_limit');
    out.members = []; const via = [];
    for (const [index, value] of members.entries()) {
      const projected = member(value);
      if (!projected) { reasons.add('group_member_unavailable'); continue; }
      out.members.push(projected);
      const path = Array.isArray(raw.via) ? raw.via[index] : null;
      via.push(typeof path === 'string' ? list(path.split('>').filter(Boolean), 16, groupID, reasons, 'group_depth_limit').join('>') : '');
    }
    if (raw.via != null) out.via = via;
    if (raw.fast != null) out.fast = list(raw.fast, limits.candidates, member, reasons).filter(value => out.members.includes(value));
    if (raw.subs != null) out.subs = list(raw.subs, limits.candidates, sub => {
      if (!isObject(sub) || !validID(sub.id)) return null;
      const sid = groupID(sub.id), value = { id: sid, name: `Group ${sid.slice(6, 14)}`, ref: `group/${sid}` };
      fields(sub, value, 'in', groupID, reasons);
      fields(sub, value, 'rules', integer, reasons);
      fields(sub, value, 'routing', enumOf(MODES), reasons);
      return value;
    }, reasons);
    if (raw.paused) reasons.add('rule_details_withheld');
    return out;
  }
  function route(raw) {
    const reasons = new Set(), out = { id: raw.id, seq: raw.seq, time: isoTime(raw.time), done: raw.done,
      agent: safeIdentifier(raw.agent), session: safeIdentifier(raw.session, 512) };
    if (!out.agent) out.session = null;
    if (!out.agent || !out.session) reasons.add('source_identity_unavailable');
    fields(raw, out, 'model served', model, reasons);
    fields(raw, out, 'provider', providerID, reasons);
    fields(raw, out, 'effort subagentEffort', enumOf(EFFORTS), reasons);
    fields(raw, out, 'tier', enumOf(TIERS), reasons);
    fields(raw, out, 'kind', enumOf(KINDS), reasons);
    fields(raw, out, 'phase', enumOf(new Set(['redact'])), reasons);
    fields(raw, out, 'status', statusCode, reasons);
    fields(raw, out, 'ms tokens out reasoning ttft firstText firstReasoning flow sent own retried queued masking bytes contentAt estTok', measurement, reasons);
    fields(raw, out, 'sealedTask reasoningHidden swapped routed', bool, reasons);
    fields(raw, out, 'leadAccount compaction pinned', seatID, reasons);
    // Native subagentId marks tools-bearing turns; a tool-less actor header
    // must not turn a helper into a turn. Neither field establishes ancestry.
    fields(raw, out, 'subagentId', value => opaque('actor', value), reasons);
    const hasTurn = typeof raw.subagentId === 'string' && raw.subagentId.length > 0;
    const hasActor = typeof raw.sub === 'string' && raw.sub.length > 0;
    out.isSubagent = hasTurn || hasActor || WORKER_KINDS.has(raw.kind) || isObject(raw.subagent);
    if (hasTurn && hasActor && raw.subagentId !== raw.sub) reasons.add('actor_identity_conflict');
    else {
      const actor = opaque('actor', hasTurn ? raw.subagentId : raw.sub);
      if (actor) out.actorId = actor;
    }
    if (raw.sub != null && raw.sub !== '' && !validID(raw.sub)) reasons.add('malformed_optional');
    if (showFolders) fields(raw, out, 'folder', safeFolder, reasons);
    if (showProjectNames && raw.folder != null) {
      const project = safeProjectName(raw.folder);
      if (project) out.projectName = project;
      else reasons.add('project_name_unavailable');
    }
    failure(raw, out, reasons);
    if (!out.model) reasons.add('model_unavailable');
    if (!out.provider) reasons.add('provider_unavailable');
    if (out.done && !out.status && !out.fail) reasons.add('outcome_unknown');
    if (raw.order == null) reasons.add('candidate_history_unavailable');
    if (raw.tries == null) reasons.add('attempt_history_unavailable');
    out.order = list(raw.order, limits.candidates, value => weighed(value, reasons), reasons);
    out.left = list(raw.left, Math.max(0, limits.candidates - out.order.length), value => weighed(value, reasons), reasons);
    out.tries = list(raw.tries, limits.attempts, value => attempt(value, reasons), reasons, 'attempt_limit');
    if (raw.group != null) { const value = group(raw.group, reasons); if (value) out.group = value; }
    if (isObject(raw.affinity)) {
      const value = {};
      fields(raw.affinity, value, 'mode', enumOf(AFFINITY), reasons);
      fields(raw.affinity, value, 'why', enumOf(AFFINITY_WHY), reasons);
      fields(raw.affinity, value, 'last', seatID, reasons);
      fields(raw.affinity, value, 'at', isoTime, reasons);
      fields(raw.affinity, value, 'turn lastTurn cacheRead cacheWrite', integer, reasons);
      fields(raw.affinity, value, 'within kept', bool, reasons);
      if (raw.affinity.main && out.order.length + out.left.length < limits.candidates) {
        const main = weighed(raw.affinity.main, reasons); if (main) value.main = main;
      } else if (raw.affinity.main) reasons.add('candidate_limit');
      out.affinity = value;
    }
    if (raw.rule != null) { const value = rule(raw.rule, reasons); if (value) out.rule = value; }
    if (raw.nested != null) out.nested = list(raw.nested, 16, value => {
      if (!isObject(value) || !validID(value.group)) return null;
      const id = groupID(value.group), hit = rule(value.rule, reasons);
      return { group: id, name: `Group ${id.slice(6, 14)}`, ...(hit ? { rule: hit } : {}) };
    }, reasons, 'group_depth_limit');
    if (isObject(raw.subagent)) {
      const value = fields(raw.subagent, {}, 'asked to', model, reasons);
      fields(raw.subagent, value, 'lead', bool, reasons);
      if (raw.subagent.kept) {
        value.kept = SUBAGENT_KEPT.has(raw.subagent.kept) ? raw.subagent.kept : 'Routing reason unavailable.';
        if (!SUBAGENT_KEPT.has(raw.subagent.kept)) reasons.add('model_move_details_withheld');
      }
      if (value.asked && value.to) out.subagent = value;
      else reasons.add('model_move_details_withheld');
    }
    if (isObject(raw.moved)) {
      const value = fields(raw.moved, {}, 'to', model, reasons);
      fields(raw.moved, value, 'why', enumOf(MOVES), reasons);
      if (value.to) out.moved = value;
      else reasons.add('model_move_details_withheld');
    }
    if (raw.usage != null) out.usage = list(raw.usage, limits.attempts, usage => {
      if (!isObject(usage)) { reasons.add('usage_unavailable'); return null; }
      const value = {};
      fields(usage, value, 'provider', providerID, reasons);
      fields(usage, value, 'model', safeModel, reasons);
      fields(usage, value, 'in out cache_read cache_write reasoning credits', measurement, reasons);
      fields(usage, value, 'cache_unknown', bool, reasons);
      return value;
    }, reasons, 'usage_limit');
    fields(raw, out, 'unpriced', integer, reasons);
    if (raw.priced === true && measurement(raw.cost) !== null) { out.priced = true; out.cost = raw.cost; }
    else if (raw.priced === false) out.priced = false;
    out.evidence = { partial: reasons.size > 0, reasons: [...reasons],
      label: reasons.size ? 'Some routing evidence is unavailable or withheld.' : 'Recorded routing evidence.' };
    return out;
  }
  function metadata(raw) {
    const totals = {};
    if (isObject(raw.totals)) fields(raw.totals, totals, 'requests rerouted errors', integer);
    const lifted = {};
    if (isObject(raw.lifted)) for (const [key, value] of Object.entries(raw.lifted).slice(0, limits.routes * limits.candidates)) {
      const id = seatID(key), time = isoTime(value);
      if (id && time) lifted[id] = time;
    }
    return { now: isoTime(raw.now), serves: ['app', 'web', 'tui', 'serve', 'gateway'].includes(raw.serves) ? raw.serves : null,
      totals: Object.keys(totals).length ? totals : null, lifted };
  }
  return { route, metadata };
}

function restKeys(route) {
  return new Set([...route.order, ...route.left, ...route.tries, route.affinity?.main]
    .map(item => item?.rest?.key).filter(Boolean));
}

// Only rests still referenced by retained routes need lift evidence. In
// particular vanished unfinished requests are NOT native live tombstones.
export function referencedLifts(routes, lifted) {
  const keys = new Set(routes.flatMap(route => [...restKeys(route)]));
  return Object.fromEntries(Object.entries(lifted).filter(([key]) => keys.has(key)));
}

export function nativeSnapshot({ instanceId, generation, revision, seq, pid, connection, source, routes, reasons = [], limits: input }) {
  const limits = limitsOf(input);
  function project(visible, limited = false) {
    const why = new Set(['retained_trace_only', 'provider_inventory_unavailable', ...reasons]);
    if (!source.now) why.add('source_time_unavailable');
    if (!source.totals) why.add('source_totals_unavailable');
    if (connection.status !== 'live') why.add('stale_or_unavailable');
    if (limited) why.add('projection_byte_limit');
    if (visible.some(route => route.evidence.partial)) why.add('routing_evidence_partial');
    return { apiVersion: API_VERSION, instanceId, generation, revision, connection,
      coverage: { source: 'trace', period: 'live', label: 'Live trace (recent retained requests; provider inventory unavailable)',
        partial: true, reasons: [...why], retained: visible.length, snapshotAt: connection.lastUpdated,
        inventory: 'unavailable', totalsScope: source.totals ? 'gateway_since_start' : 'unavailable' },
      object: 'trace', now: source.now, seq, pid, serves: source.serves, ids: visible.map(route => route.id),
      routes: visible, totals: source.totals, lifted: referencedLifts(visible, source.lifted) };
  }
  const complete = project(routes);
  if (size(complete) <= limits.responseBytes) return structuredClone(complete);
  const empty = project([], true);
  if (size(empty) > limits.responseBytes) throw capacity();
  // Reserve the partial-evidence reason if any chosen route might need it.
  // Count each complete route and lift entry once, including both array and
  // object commas: repeatedly serializing growing prefixes is quadratic.
  if (routes.some(route => route.evidence.partial) && !empty.coverage.reasons.includes('routing_evidence_partial')) {
    empty.coverage.reasons.push('routing_evidence_partial');
  }
  let bytes = size(empty);
  const keep = [], lifts = new Set();
  for (const route of routes) {
    const additions = [...restKeys(route)].filter(key => !lifts.has(key) && Object.hasOwn(source.lifted, key));
    const liftBytes = additions.reduce((n, key, index) => n + size({ [key]: source.lifted[key] }) - 2 + Number(lifts.size + index > 0), 0);
    const extra = size(route) + size(route.id) + (keep.length ? 2 : 0) + liftBytes +
      String(keep.length + 1).length - String(keep.length).length;
    // Skip an oversized row rather than hiding smaller complete ones after it.
    if (bytes + extra <= limits.responseBytes) {
      keep.push(route); bytes += extra;
      for (const key of additions) lifts.add(key);
    }
  }
  return structuredClone(project(keep, true));
}

(() => {
  'use strict';
  const PERIODS = ['live', 'today', '7d', '30d'];
  const PERIOD_LABELS = { live: 'Live trace', today: 'Today', '7d': '7 days', '30d': '30 days' };
  const STATES = { candidate: 'Eligible / candidate', attempting: 'Attempting', 'in-flight': 'In flight', success: 'Success', failed: 'Failed', unknown: 'Unknown', unavailable: 'Unavailable' };
  const REASONS = {
    gateway_unavailable: 'Gateway unavailable; check same-container loopback access.',
    gateway_denied: 'Gateway telemetry access denied.', gateway_incompatible: 'Gateway trace capability is incompatible; update Magpie.',
    gateway_malformed: 'Gateway telemetry was malformed; waiting for a clean snapshot.',
    retained_trace_only: 'Retained trace only', stale_or_unavailable: 'Cached evidence is stale or unavailable',
    trace_evicted: 'Evicted before completion; final outcome unavailable', attempt_history_unavailable: 'Attempt history unavailable',
    incomplete_measurements: 'Some measurements are missing', missing_prices: 'Some billable records have no price',
    inferred_parent_not_included: 'Inferred parent is not included in child scope', actor_unknown: 'Actor identity is unknown',
    unmatched_attempt: 'Attempt could not be matched unambiguously to a candidate', ambiguous_trace_join: 'Trace/ledger join is ambiguous',
    handed_on_only: 'Billable handed-on evidence only; no completed request is inferred',
    retained_trace_incomplete: 'Retained attempt trace is incomplete',
  };
  const reasonLabel = reason => REASONS[reason] || String(reason || '').replace(/_/g, ' ');
  const STORAGE_KEY = 'magpie-session-routing.selection.v1';
  const measured = value => typeof value === 'number' && Number.isFinite(value) && value >= 0;
  const number = value => measured(value) ? value.toLocaleString('en-US', { maximumFractionDigits: 2 }) : '—';
  const duration = value => measured(value) ? (value < 1000 ? `${number(value)} ms` : `${number(value / 1000)} s`) : '—';
  const money = value => measured(value) ? `$${value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 6 })}` : '—';
  const time = value => value && Number.isFinite(Date.parse(value)) ? new Date(value).toLocaleString() : 'Unknown';
  const short = value => typeof value === 'string' && value.length > 28 ? `${value.slice(0, 18)}…${value.slice(-8)}` : value || 'Unknown';
  const attemptEvidence = row => row.reasons?.includes('handed_on_only') === true;
  function requestName(row) {
    if (attemptEvidence(row)) return row.id == null ? 'Unmatched billable attempt' : `Billable attempt for request ${row.id}`;
    return row.id == null ? short(row.key) : `Request ${row.id}`;
  }

  function makeScope(selection = '', period = 'live', includeChildren = false) {
    return { kind: !selection ? 'all' : selection === 'unknown' ? 'unknown' : 'session',
      sessionKey: selection && selection !== 'unknown' ? selection : null,
      period: PERIODS.includes(period) ? period : 'live', includeChildren: !!selection && selection !== 'unknown' && !!includeChildren };
  }
  function scopeEquals(a, b) {
    return !!a && !!b && a.kind === b.kind && a.sessionKey === b.sessionKey &&
      a.period === b.period && a.includeChildren === b.includeChildren;
  }
  function queryFor(scope, page = null) {
    const params = new URLSearchParams({ period: scope.period, includeChildren: scope.includeChildren ? '1' : '0' });
    if (scope.kind !== 'all') params.set('session', scope.kind === 'unknown' ? 'unknown' : scope.sessionKey);
    if (scope.period !== 'live') {
      params.set('limit', '100');
      if (page) { params.set('snapshot', page.snapshotId); params.set('offset', String(page.nextOffset)); }
    }
    return `api/${scope.period === 'live' ? 'state' : 'history'}?${params}`;
  }
  function selectSessions(sessions, search = '', activeOnly = false, selected = '') {
    const needle = search.trim().toLocaleLowerCase();
    return sessions.filter(session => session.key === selected ||
      ((!activeOnly || session.activeRequests > 0) &&
       [session.agent, session.title, session.displayId, short(session.displayId), session.folder]
         .some(value => String(value || '').toLocaleLowerCase().includes(needle))))
      .sort((a, b) => Number(b.activeRequests > 0) - Number(a.activeRequests > 0) ||
        (Date.parse(b.lastActivity) || 0) - (Date.parse(a.lastActivity) || 0) || a.key.localeCompare(b.key));
  }
  function selectedSummary(session, data) {
    if (!data || data.scope.kind !== 'session' || data.scope.sessionKey !== session.key) return null;
    const latest = data.requests.filter(row => !attemptEvidence(row)).sort((a, b) =>
      (Date.parse(b.time) || 0) - (Date.parse(a.time) || 0) || (b.id || 0) - (a.id || 0))[0];
    return { ...session, activeRequests: data.metrics.inFlight, requestCount: data.metrics.requests,
      lastActivity: latest?.updatedAt || latest?.time || null, lastModel: latest?.model ?? null,
      lastProvider: latest?.provider ?? null, folder: latest?.folder ?? null };
  }
  function validOptions(options) {
    return !!options && typeof options === 'object' && !Array.isArray(options) &&
      /^[A-Za-z0-9_-]{42}[AEIMQUYcgkosw048]$/.test(options.apiToken) &&
      /^[A-Za-z0-9_-]{21}[AQgw]$/.test(options.installationId);
  }
  function validateSnapshot(data, scope) {
    if (!data || data.apiVersion !== 1 || !scopeEquals(data.scope, scope) || !data.metrics || !data.coverage ||
        !data.connection || !Array.isArray(data.sessions) || !Array.isArray(data.requests) ||
        data.sessions.length > 512 || data.requests.length > 4000 ||
        data.requests.some(row => !row || typeof row.key !== 'string' || !Array.isArray(row.attempts) || !Array.isArray(row.candidates)) ||
        data.sessions.some(row => !row || typeof row.key !== 'string') ||
        new Set(data.requests.map(row => row.key)).size !== data.requests.length) {
      throw Object.assign(new Error('Invalid snapshot'), { code: 'invalid_snapshot' });
    }
    return data;
  }
  function selectionStore(storage) {
    let available = true;
    return {
      read() {
        try {
          const value = JSON.parse(storage().getItem(STORAGE_KEY) || 'null');
          return typeof value?.selection === 'string' && value.selection.length <= 2048 &&
            /^(?:[A-Za-z0-9_-]+)?$/.test(value.selection) ? value.selection : '';
        } catch { available = false; return ''; }
      },
      write(selection) {
        try { storage().setItem(STORAGE_KEY, JSON.stringify({ selection })); }
        catch { available = false; }
      },
      get available() { return available; },
    };
  }

  // One sequential request queue, shared by polling, refresh and pagination in
  // this frame. Aborting is not the correctness guard: epoch + exact scope are.
  function createController({ request, readOptions, onState = () => {}, onReset = () => {},
    onStatus = () => {}, onNotice = () => {}, setTimer = setTimeout, clearTimer = clearTimeout,
    initialScope = makeScope(), visible: initiallyVisible = true, pollMs = 1000 } = {}) {
    let scope = { ...initialScope }, snapshot = null, token = '', epoch = 0;
    let running = null, controller = null, timer = null, queued = null;
    let visible = initiallyVisible, stopped = false, blocked = false, failures = 0;
    const cancelTimer = () => { if (timer !== null) clearTimer(timer); timer = null; };
    const current = (version, requestedScope) => !stopped && visible && version === epoch && scopeEquals(scope, requestedScope);
    async function credentials() {
      const options = await readOptions();
      if (!validOptions(options)) throw Object.assign(new Error('Secure setup required'), { code: 'setup_required' });
      return options.apiToken;
    }
    async function authorized(path, signal) {
      if (!token) token = await credentials();
      if (signal.aborted) throw Object.assign(new Error('Aborted'), { name: 'AbortError' });
      try { return await request(path, { signal, token }); }
      catch (error) {
        if (error.status !== 401 || signal.aborted) throw error;
        // Refresh authoritative options ONCE; never set or rotate credentials.
        token = '';
        token = await credentials();
        if (signal.aborted) throw Object.assign(new Error('Aborted'), { name: 'AbortError' });
        return request(path, { signal, token });
      }
    }
    function schedule(delay) {
      cancelTimer();
      if (!visible || stopped || blocked) return;
      // History stays immutable, but still revalidates access / connection. A
      // live discovery read does not initiate another usage-ledger scan.
      timer = setTimer(() => { timer = null; enqueue(scope.period === 'live' || !snapshot ? 'refresh' : 'connection'); }, delay);
    }
    function reset() { snapshot = null; onReset({ ...scope }); }
    function enqueue(job) {
      if (stopped) return Promise.resolve();
      cancelTimer();
      if (job === 'refresh' || !queued || (job === 'page' && queued === 'connection')) queued = job;
      return pump();
    }
    function pump() {
      if (running) return running;
      if (!visible || stopped || blocked || !queued) return Promise.resolve();
      const job = queued; queued = null;
      const version = epoch, requestedScope = { ...scope };
      const previous = snapshot;
      const paging = job === 'page' ? previous?.pagination : null;
      if (job === 'page' && (!paging || paging.nextOffset == null)) return Promise.resolve();
      controller = new AbortController();
      const signal = controller.signal;
      onStatus({ loading: true });
      // Start in a microtask so even immediately rejected calls see running set.
      running = Promise.resolve().then(async () => {
        try {
          if (job === 'connection') {
            const discovery = await authorized('api/sessions?period=live&includeChildren=0', signal);
            if (!current(version, requestedScope)) return;
            if (discovery?.apiVersion !== 1 || !discovery.connection) throw Object.assign(new Error('Invalid discovery'), { code: 'invalid_snapshot' });
            if (snapshot && discovery.instanceId && discovery.instanceId !== snapshot.instanceId) {
              epoch++; reset();
              onNotice('The backend restarted. Reloading this scope; previous request focus and history pagination were cleared.');
              queued = 'refresh'; return;
            }
            failures = 0;
            onStatus({ ...discovery.connection, loading: false });
            return;
          }
          const response = await authorized(queryFor(requestedScope, paging), signal);
          if (!current(version, requestedScope)) return;
          const data = validateSnapshot(response, requestedScope);
          if (paging) {
            if (data.pagination?.snapshotId !== paging.snapshotId || data.pagination.offset !== paging.nextOffset ||
                data.instanceId !== previous.instanceId || data.generation !== previous.generation) {
              throw Object.assign(new Error('History changed'), { status: 409, code: 'history_expired' });
            }
            const unique = new Map(previous.requests.map(row => [row.key, row]));
            for (const row of data.requests) unique.set(row.key, row);
            data.requests = [...unique.values()];
            if (data.requests.length > 4000) throw Object.assign(new Error('History too large'), { code: 'invalid_snapshot' });
          }
          snapshot = data; failures = 0;
          onState(data); onStatus({ ...data.connection, loading: false });
        } catch (error) {
          if (!current(version, requestedScope) || signal.aborted || error.name === 'AbortError') return;
          if (error.status === 410 && error.code === 'session_expired' && scope.kind !== 'all') {
            // A 410 during cold start / disconnection is not evidence that a
            // saved session expired. Verify absence in fresh discovery first.
            let discovery;
            try { discovery = await authorized(`api/sessions?period=${scope.period}&includeChildren=0`, signal); }
            catch (lookupError) { error = lookupError; }
            if (!current(version, requestedScope)) return;
            if (discovery) {
              if (discovery.apiVersion === 1 && discovery.connection?.status === 'live' && Array.isArray(discovery.sessions) &&
                  !discovery.sessions.some(session => session.key === scope.sessionKey)) {
                scope = makeScope('', scope.period); epoch++;
                reset(); onNotice('The selected session is no longer in this source’s retained data. Returned to All sessions.');
                queued = 'refresh'; return;
              }
              failures++;
              onStatus({ status: 'stale', loading: false, reason: 'The selected session is not currently available. Waiting for fresh discovery before expiring the selection; Refresh or choose All sessions.' });
              return;
            }
          }
          if (error.status === 409 && error.code === 'history_expired' && paging) {
            epoch++; reset(); onNotice('The history snapshot expired. Pagination was reset; loading a new snapshot.');
            queued = 'refresh'; return;
          }
          failures++;
          if (error.status === 401 || error.status === 403 || error.code === 'setup_required') {
            token = ''; blocked = true; reset();
            onStatus({ status: 'stopped', loading: false, reason: error.status === 403 ?
              'Access was revoked or the plugin was disabled. Reopen Session Routing from Magpie.' :
              'Secure access is unavailable. Reopen the plugin page to check setup, or Refresh to re-read its options.' });
          } else {
            onStatus({ status: snapshot ? 'stale' : 'disconnected', loading: false,
              lastUpdated: snapshot?.connection?.lastUpdated,
              reason: error.code === 'invalid_snapshot' ? 'The service returned an incompatible snapshot. Update the plugin and Magpie together.' :
                'The service is unavailable. Cached data is not live. Check Magpie’s plugin host and loopback service; Refresh retries the connection.' });
          }
        }
      }).finally(() => {
        running = null; controller = null;
        if (stopped) return;
        onStatus({ loading: false });
        if (queued && visible && !blocked) void pump();
        else schedule(Math.min(15_000, pollMs * 2 ** Math.min(failures, 4)));
      });
      return running;
    }
    return {
      get scope() { return { ...scope }; },
      get snapshot() { return snapshot; },
      refresh() { blocked = false; return enqueue('refresh'); },
      loadMore() { return enqueue('page'); },
      setScope(next) {
        if (scopeEquals(scope, next)) return;
        scope = { ...next }; epoch++; controller?.abort(); cancelTimer(); blocked = false;
        reset(); return enqueue('refresh');
      },
      setVisible(value) {
        if (visible === !!value) return;
        visible = !!value; epoch++; cancelTimer(); controller?.abort();
        if (visible) return enqueue(scope.period === 'live' || !snapshot ? 'refresh' : 'connection');
        onStatus({ status: 'paused', loading: false, reason: 'Updates are paused while this page is hidden.' });
      },
      stop() { stopped = true; epoch++; cancelTimer(); controller?.abort(); token = ''; queued = null; },
    };
  }

  const sceneKey = (requestKey, candidateKey) => JSON.stringify([requestKey, candidateKey]);
  const attemptIndex = (attempt, position) => Number.isInteger(attempt.index) && attempt.index > 0 ? attempt.index : position + 1;
  const isActive = row => row.outcome === 'in-flight' && !attemptEvidence(row);
  const newest = (a, b) => (Date.parse(b.time) || 0) - (Date.parse(a.time) || 0) || a.key.localeCompare(b.key);
  // Projection consumes the controller's validated scope only. Neutral labels are
  // never identities: even a shared hub retains request-qualified ports/edges.
  function projectScene(data, { focusKey = null, replayIndex = null, maxRequests = 6, maxDestinations = 12 } = {}) {
    const requests = data?.requests || [], focused = requests.find(row => row.key === focusKey);
    const active = requests.filter(isActive).sort(newest);
    const latest = new Map();
    for (const row of [...requests].sort(newest)) {
      const session = row.sessionKey ?? JSON.stringify([row.agent ?? null, row.session ?? null]);
      if (!latest.has(session)) latest.set(session, row);
    }
    const recent = data?.scope.kind === 'all' ? [...latest.values()] : [...requests].sort(newest).slice(0, 1);
    const pool = focused ? [focused] : active.length ? active : recent;
    const shown = pool.slice(0, Math.max(1, Math.min(6, maxRequests)));
    const sources = [], possible = [];
    for (const row of shown) {
      const replaying = !!focused && replayIndex !== null;
      const attempts = replaying ? row.attempts.slice(0, Math.max(0, replayIndex + 1)) : row.attempts;
      const orphan = attemptEvidence(row);
      const candidates = orphan ? [] : row.candidates;
      const unmatched = attempts.filter(attempt => !candidates.some(candidate => candidate.key === attempt.candidateKey));
      sources.push({ key: row.key, row, attempts, active: !replaying && isActive(row), unmatched: unmatched.length, orphan });
      for (const [position, candidate] of candidates.entries()) {
        const matched = attempts.filter(attempt => attempt.candidateKey === candidate.key);
        const last = matched.at(-1), current = last && attempts.at(-1)?.candidateKey === candidate.key;
        const state = last ? (last.outcome === 'in-flight' ? 'attempting' : last.outcome || 'unknown') : 'candidate';
        possible.push({ key: sceneKey(row.key, candidate.key), requestKey: row.key, row, candidate, attempts: matched,
          state, active: !replaying && isActive(row) && !!current && last?.outcome === 'in-flight', current: !!current,
          rank: current ? 0 : matched.length ? 1 : 2, position });
      }
      if (!candidates.length) possible.push({ key: sceneKey(row.key, null), requestKey: row.key, row, candidate: null,
        attempts: [], state: 'unavailable', active: false, current: false, rank: 3, position: 0,
        message: orphan ? 'Billable evidence only · topology unavailable' : data?.scope.period !== 'live' ?
          'Historical topology unavailable' : 'No candidates recorded · route unknown' });
    }
    // All current matches precede any earlier attempts, which precede candidates.
    // This prevents a dense first request from hiding another request's active hop.
    const destinations = possible.sort((a, b) => a.rank - b.rank || shown.indexOf(a.row) - shown.indexOf(b.row) || a.position - b.position)
      .slice(0, Math.max(1, Math.min(12, maxDestinations)));
    return { sources, destinations, focusKey: focused?.key ?? null, replayIndex: focused ? replayIndex : null,
      mode: focused ? replayIndex !== null ? 'replay' : 'focused' : active.length ? 'active' : 'recent',
      total: requests.length, active: active.length, omittedRequests: requests.length - shown.length,
      omittedActive: active.filter(row => !shown.includes(row)).length,
      omittedDestinations: requests.reduce((n, row) => n + (attemptEvidence(row) ? 0 : row.candidates.length), 0) - destinations.filter(row => row.candidate).length,
      omittedShownDestinations: possible.length - destinations.length,
      unmatched: sources.reduce((n, source) => n + source.unmatched, 0) };
  }
  function motionNamespace(data) {
    const scope = data?.scope;
    return JSON.stringify([data?.instanceId, data?.generation, scope?.kind, scope?.sessionKey, scope?.period, scope?.includeChildren]);
  }
  // Pure reducer: first snapshots/resumes establish watermarks, not send events.
  // Outcome, candidate match, revision and unrelated updates cannot resend a try.
  function advanceMotion(previous, data, { visible = true, connectionStatus = data?.connection?.status,
    reducedMotion = false, replaying = false, reset = false } = {}) {
    const namespace = motionNamespace(data);
    const enabled = !!data && visible && connectionStatus === 'live' && data.scope.period === 'live' && !reducedMotion && !replaying && !reset;
    if (previous?.namespace === namespace && previous.saturated) {
      return { namespace, watermarks: new Map(), enabled, flights: [], baseline: true, saturated: true };
    }
    const baseline = !previous || previous.namespace !== namespace || !previous.enabled || !enabled;
    const watermarks = previous?.namespace === namespace ? new Map(previous.watermarks) : new Map();
    const flights = [];
    for (const row of data?.requests || []) {
      const seen = watermarks.get(row.key) || 0;
      let highest = seen;
      for (const [position, attempt] of row.attempts.entries()) {
        const index = attemptIndex(attempt, position);
        if (!baseline && index > highest && isActive(row) && attempt.outcome === 'in-flight' && row.candidates.some(candidate => candidate.key === attempt.candidateKey)) {
          flights.push({ key: JSON.stringify([namespace, row.key, index]), requestKey: row.key,
            destinationKey: sceneKey(row.key, attempt.candidateKey), index });
        }
        highest = Math.max(highest, index);
      }
      watermarks.set(row.key, highest);
    }
    // At the lifetime identity cap, retain only a saturation flag for this scope
    // and generation. Pulses still work; forgotten attempts can never resend.
    if (watermarks.size > 8192) return { namespace, watermarks: new Map(), enabled, flights: [], baseline: true, saturated: true };
    return { namespace, watermarks, enabled, flights: flights.slice(-12), baseline, saturated: false };
  }

  // Expose only stateless helpers/factory, never this frame’s token or controller.
  window.SessionRouting = Object.freeze({ makeScope, scopeEquals, queryFor, selectSessions,
    validOptions, validateSnapshot, selectionStore, createController, number, duration, money, attemptEvidence, requestName, selectedSummary,
    projectScene, sceneKey, advanceMotion });

  if (!document.getElementById('session-routing')) return;
  const $ = id => document.getElementById(id);
  const node = (tag, className, text) => {
    const element = document.createElement(tag);
    if (className) element.className = className;
    if (text !== undefined) element.textContent = text;
    return element;
  };
  const setText = (id, text) => { if ($(id).textContent !== text) $(id).textContent = text; };
  const storage = selectionStore(() => window.localStorage);
  const savedSelection = storage.read();
  let view = null, focusKey = null, replayIndex = null;
  let currentScope = makeScope(savedSelection), sessions = [], unknownRequests = 0;
  let lastConnection = { status: 'starting', lastUpdated: null };
  const expanded = new Set();
  $('storage-note').hidden = storage.available;

  function announce(message) {
    $('notice').textContent = message;
    $('notice').hidden = !message;
  }
  function selection(scope = currentScope) { return scope.kind === 'unknown' ? 'unknown' : scope.sessionKey || ''; }
  function scopeLabel() {
    if (currentScope.kind === 'all') return 'All sessions · global totals';
    if (currentScope.kind === 'unknown') return 'Unknown / no session ID · unassigned traffic';
    const session = sessions.find(row => row.key === currentScope.sessionKey);
    const label = session ? `${session.agent || 'Unknown agent'} · ${short(session.displayId)}` : 'Selected session';
    return `${label} · ${currentScope.includeChildren ? 'including confirmed children / subagents' : 'direct traffic only'}`;
  }
  function renderPicker() {
    const selected = selection();
    const select = $('session-select');
    const displaySessions = sessions.map(session => selectedSummary(session, view) || session);
    const rows = selectSessions(displaySessions, $('session-search').value, $('session-filter').value === 'active', selected);
    const options = [node('option', '', 'All sessions')]; options[0].value = '';
    if (unknownRequests || selected === 'unknown') {
      const option = node('option', '', `Unknown / no session ID (${number(unknownRequests)})`);
      option.value = 'unknown'; options.push(option);
    }
    for (const row of rows) {
      const activity = row.key === selected && !view ? 'checking scope' : row.activeRequests > 0 ? `${row.activeRequests} in flight` : 'recent';
      const label = `${row.agent || 'Unknown agent'} · ${row.title || short(row.displayId)}${row.isChild ? ' · child' : ''} · ${activity}${row.key === selected ? ' · selected scope' : ' · all actors'}`;
      const option = node('option', '', label); option.value = row.key;
      option.title = `${row.displayId || 'Unknown ID'} · Last activity ${time(row.lastActivity)} · ${row.lastModel || 'Model unknown'} · ${row.lastProvider || 'Provider unknown'}`;
      options.push(option);
    }
    if (selected && selected !== 'unknown' && !rows.some(row => row.key === selected)) {
      const pending = node('option', '', 'Selected session · waiting for source'); pending.value = selected; options.push(pending);
    }
    // Do not replace the native select on every poll if its choices did not change.
    const signature = options.map(option => `${option.value}\n${option.textContent}\n${option.title}`).join('\n');
    if (select.dataset.choices !== signature) { select.replaceChildren(...options); select.dataset.choices = signature; }
    select.value = selected;
    $('period-select').value = currentScope.period;
    $('include-children').disabled = currentScope.kind !== 'session';
    $('include-children').checked = currentScope.includeChildren;
    const chosen = displaySessions.find(row => row.key === selected);
    const hint = chosen && !view ? 'Loading the selected scope; its active indicators are not available yet.' : chosen ? `${chosen.agent || 'Unknown agent'} · ${chosen.displayId || 'ID unavailable'} · ${number(chosen.activeRequests)} unfinished gateway request(s) in selected scope · Latest loaded scope activity ${time(chosen.lastActivity)} · ${chosen.lastModel || 'Model unknown'} · ${chosen.lastProvider || 'Provider unknown'}${chosen.folder ? ` · ${chosen.folder}` : ''}${chosen.parentKey ? ' · Confirmed parent relationship' : ''}` :
      !sessions.length && view ? 'No identifiable sessions in this source. Requests without an ID remain explicitly unassigned.' :
        `${rows.length} matching session(s). Active first, then most recently observed. Idle does not mean an agent’s task is finished.`;
    setText('session-hint', hint);
    setText('scope-label', scopeLabel());
  }
  function renderConnection(update) {
    if (typeof update.loading === 'boolean') {
      $('session-routing').dataset.loading = String(update.loading);
      $('refresh').setAttribute('aria-busy', String(update.loading));
    }
    if (!update.status) return;
    lastConnection = { ...lastConnection, ...update, reason: update.reason ?? null };
    const labels = { live: 'Live', starting: 'Starting', stale: 'Stale', disconnected: 'Disconnected', incompatible: 'Incompatible gateway', stopped: 'Access stopped', paused: 'Paused' };
    const historical = update.status === 'live' && currentScope.period !== 'live';
    $('connection-status').dataset.status = historical ? 'history' : update.status;
    setText('connection-status', historical ? 'History snapshot' : labels[update.status] || 'Unknown connection');
    setText('last-updated', `${lastConnection.lastUpdated ? `Last gateway update: ${time(lastConnection.lastUpdated)}.` : 'No gateway update received yet.'}${lastConnection.reason ? ` ${reasonLabel(lastConnection.reason)}` : ''}`);
    $('session-routing').dataset.stale = String(update.status !== 'live');
    syncMotion();
    if (!view && !['live', 'starting'].includes(update.status)) {
      setText('coverage', `${PERIOD_LABELS[currentScope.period]} · No authorized snapshot available. Totals are unknown.`);
      setText('stage-empty', 'No routing snapshot is available. Refresh or reopen this page through Magpie.');
      $('request-list').replaceChildren(node('p', 'empty', 'No request snapshot is available. No traffic or completion is inferred.'));
    }
  }
  const metricSpecs = [
    ['requests', 'Requests', number], ['inFlight', 'In flight', number], ['failed', 'Failed', number],
    ['retries', 'Retries', number], ['fallbacks', 'Fallbacks', number], ['averageTTFT', 'Average TTFT', duration],
    ['tokens', 'Tokens', number], ['cost', 'Recorded cost (USD)', money],
  ];
  function renderMetrics(data) {
    const metrics = data?.metrics || {};
    const cards = metricSpecs.map(([key, label, format]) => {
      const card = node('div', 'metric');
      const value = node('dd', '', format(metrics[key])); value.dataset.testid = `metric-${key}`;
      card.append(node('dt', '', label), value);
      let note = currentScope.period === 'live' ? 'Recent trace only' : `${PERIOD_LABELS[currentScope.period]} · bounded ledger`;
      if (key === 'averageTTFT') note = measured(metrics.ttftSamples) ? `${number(metrics.ttftSamples)} measured sample(s)` : 'Measured samples only';
      if (key === 'cost') note = measured(metrics.cost) ? `${number(metrics.pricedRequests)} priced · ${number(metrics.unpricedRequests)} unpriced${metrics.unpricedRequests > 0 ? ' · known subtotal' : ''}` : 'Pricing unavailable';
      if (key === 'tokens' && metrics.partial) note += ' · known subtotal / partial';
      card.append(node('small', '', note)); return card;
    });
    $('metrics').replaceChildren(...cards);
    if (!data) { setText('coverage', `Loading ${PERIOD_LABELS[currentScope.period]} coverage. No totals are assumed.`); return; }
    const coverage = data.coverage;
    const parts = [coverage.label || (coverage.source === 'ledger' ? 'Usage ledger' : 'Live trace (recent requests)'), scopeLabel()];
    if (measured(coverage.retained)) parts.push(`Gateway cache (all sessions): ${number(coverage.retained)} retained`);
    if (measured(coverage.scanned)) parts.push(`Source scan (all sessions): ${number(coverage.scanned)} rows${measured(coverage.available) ? ` of ${number(coverage.available)} available` : ''}`);
    if (coverage.partial || metrics.partial) parts.push('Partial / incomplete measurements');
    if (coverage.snapshotAt) parts.push(`Snapshot ${time(coverage.snapshotAt)}`);
    if (Array.isArray(coverage.reasons)) parts.push(...coverage.reasons.map(reasonLabel));
    if (coverage.source === 'ledger') parts.push('Gateway-local calendar days. Through-gateway traffic on this computer only; local rejections and probes are excluded. History is a fixed snapshot; Refresh checks for newer data.');
    else parts.push('Not lifetime history. Only retained routing evidence is available.');
    setText('coverage', parts.join(' · '));
  }
  function badge(state) {
    const safe = Object.hasOwn(STATES, state) ? state : 'unknown';
    const label = node('span', 'state-badge');
    const mark = node('span', `state-symbol state-${safe === 'in-flight' ? 'attempting' : safe}`);
    mark.setAttribute('aria-hidden', 'true');
    label.append(mark, document.createTextNode(STATES[safe])); return label;
  }
  function fields(entries) {
    const list = node('dl', 'fields');
    for (const [label, value] of entries) {
      const field = node('div'); field.append(node('dt', '', label), node('dd', '', value ?? 'Unknown')); list.append(field);
    }
    return list;
  }
  function action(label, key, fn, testid) {
    const button = node('button', 'quiet', label); button.type = 'button';
    button.dataset.uiFocus = key;
    if (testid) button.dataset.testid = testid;
    button.addEventListener('click', fn); return button;
  }
  function attemptList(row, attempts = row.attempts, graph = false) {
    const list = node('ol', 'attempts');
    for (const [position, attempt] of attempts.entries()) {
      const item = node('li', 'attempt'); item.dataset.testid = graph ? 'graph-attempt' : 'attempt-row';
      const heading = node('div', 'attempt-heading');
      const transition = { initial: 'Initial attempt', retry: 'Retry · same candidate', fallback: 'Fallback · different candidate', unknown: 'Transition unknown' }[attempt.transition] || 'Transition unknown';
      heading.append(node('span', 'attempt-number', `#${position + 1}`), node('span', 'attempt-transition', transition), badge(attempt.outcome));
      const candidate = row.candidates.find(value => value.key === attempt.candidateKey);
      item.append(heading, node('p', '', `${attempt.provider || 'Provider unknown'} / ${candidate?.label || 'Candidate not matched'} → ${attempt.model || 'Model unknown'}`));
      if (graph) item.append(node('p', 'muted small', `${attempt.error || 'No recorded failure reason'} · HTTP ${attempt.status ?? 'unknown'} · TTFT ${duration(attempt.ttft)} · Elapsed ${duration(attempt.ms)}`));
      else item.append(fields([
        ['Started', time(attempt.start)], ['HTTP status', attempt.status ?? 'Unknown'], ['Recorded reason', attempt.error || 'Not recorded'],
        ['Elapsed', duration(attempt.ms)], ['TTFT', duration(attempt.ttft)], ['Effort', attempt.effort || 'Not recorded'],
        ['Requested model', attempt.model || 'Unknown'], ['Served model', attempt.servedModel || 'Not recorded'],
      ]));
      list.append(item);
    }
    return list;
  }

  function preserveFocus(render) {
    const key = document.activeElement?.dataset?.uiFocus;
    render();
    if (key) {
      const target = [...document.querySelectorAll('[data-ui-focus]')].find(element => element.dataset.uiFocus === key);
      target?.focus({ preventScroll: true });
    }
  }
  function focusRequest(key, replay = false) {
    if (!view?.requests.some(row => row.key === key)) return;
    focusKey = key; replayIndex = replay ? 0 : null;
    preserveFocus(() => { renderRoutes(); renderTimeline(); });
  }
  const NS = 'http://www.w3.org/2000/svg';
  const svg = (tag, attributes = {}) => {
    const element = document.createElementNS(NS, tag);
    for (const [key, value] of Object.entries(attributes)) element.setAttribute(key, value);
    return element;
  };
  const sourceNodes = new Map(), destinationNodes = new Map(), wireNodes = new Map(), hitNodes = new Map();
  const flights = new Map();
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  let scene = projectScene(null), motion = null, geometryFrame = null, flightFrame = null, pageStopped = false;
  let pendingFlights = [], inspectionKey = null;
  // Keep the element itself (and its event handlers) when its evidence changes.
  function reconcile(parent, cache, items, create, update) {
    const keys = new Set(items.map(item => item.key));
    for (const [key, element] of cache) if (!keys.has(key)) { element.remove(); cache.delete(key); }
    items.forEach((item, index) => {
      let element = cache.get(item.key);
      if (!element) { element = create(item); cache.set(item.key, element); }
      update(element, item);
      if (parent.children[index] !== element) parent.insertBefore(element, parent.children[index] || null);
    });
  }
  function inspect(key, destinationKey = null) {
    inspectionKey = key;
    const source = scene.sources.find(item => item.key === key);
    const destination = scene.destinations.find(item => item.key === destinationKey);
    const row = source?.row;
    if (row) {
      const info = [requestName(row), row.session || 'Unknown / no session ID', row.group?.name ? `Group: ${row.group.name}` : 'Group not recorded'];
      if (destination?.candidate) {
        const { candidate, attempts, state } = destination;
        info.push(`${candidate.provider || 'Provider unknown'} / ${candidate.label || 'Anonymous candidate'}`, candidate.model || 'Model unknown', STATES[state] || 'Unknown');
        info.push(attempts.length ? attempts.map((attempt, index) => `#${attemptIndex(attempt, index)} ${attempt.transition || 'unknown'} · ${STATES[attempt.outcome] || 'Unknown'}`).join('; ') : 'No attempt recorded');
        if (candidate.effort) info.push(`Effort: ${candidate.effort}`);
      } else if (destination?.message) info.push(destination.message);
      if (source.unmatched) info.push(`${source.unmatched} unmatched attempt(s); no destination inferred`);
      if (row.partial) info.push('Partial evidence');
      setText('stage-inspection', info.join(' · '));
    } else setText('stage-inspection', 'Select a request or destination to inspect its recorded route. Each row belongs only to its labelled request.');
    for (const element of [...wireNodes.values(), ...sourceNodes.values(), ...destinationNodes.values()]) {
      element.dataset.inspected = String(!!key && element.dataset.requestKey === key);
      element.dataset.dimmed = String(!!key && element.dataset.requestKey !== key);
    }
  }
  function sceneButton(button, key, destinationKey = null) {
    button.type = 'button'; button.dataset.uiFocus = destinationKey ? `destination-${destinationKey}` : `graph-focus-${key}`;
    button.setAttribute('aria-describedby', 'stage-inspection');
    button.addEventListener('pointerenter', () => inspect(key, destinationKey));
    button.addEventListener('focus', () => inspect(key, destinationKey));
    button.addEventListener('pointerleave', () => inspect(focusKey));
    button.addEventListener('blur', () => inspect(focusKey));
    button.addEventListener('click', () => { focusRequest(key); inspect(key, destinationKey); });
  }
  function stopFlights() {
    if (flightFrame !== null) cancelAnimationFrame(flightFrame);
    flightFrame = null; pendingFlights = [];
    for (const flight of flights.values()) flight.element.remove();
    flights.clear();
  }
  function syncMotion() {
    motion = advanceMotion(motion, view, { visible: !pageStopped && !document.hidden && window.magpie?.visible !== false,
      connectionStatus: lastConnection.status, reducedMotion: reducedMotion.matches, replaying: replayIndex !== null });
    $('route-graph').dataset.motion = motion.enabled ? 'live' : 'stopped';
    if (motion.baseline) stopFlights();
    if (!motion.enabled) {
      if (geometryFrame !== null && (pageStopped || document.hidden || window.magpie?.visible === false)) {
        cancelAnimationFrame(geometryFrame); geometryFrame = null;
      }
      return;
    }
    for (const [key, flight] of flights) if (wireNodes.get(flight.destinationKey)?.dataset.active !== 'true') { flight.element.remove(); flights.delete(key); }
    pendingFlights.push(...motion.flights.filter(flight => wireNodes.get(flight.destinationKey)?.dataset.active === 'true'));
    pendingFlights = pendingFlights.slice(-12);
    if (pendingFlights.length) scheduleGeometry();
  }
  function launchFlights() {
    if (!motion?.enabled) return;
    for (const event of pendingFlights) {
      const paths = [wireNodes.get(JSON.stringify([event.requestKey])), wireNodes.get(event.destinationKey)];
      if (paths.some(path => !path?.getAttribute('d')) || paths[1].dataset.active !== 'true' || flights.has(event.key) || flights.size >= 12) continue;
      const lengths = paths.map(path => path.getTotalLength());
      if (!lengths.every(length => length > 0)) continue;
      const bird = svg('g', { class: 'route-packet' });
      bird.dataset.testid = 'route-packet'; bird.dataset.attemptKey = event.key;
      bird.dataset.requestKey = event.requestKey; bird.dataset.attemptIndex = String(event.index);
      bird.append(svg('path', { d: 'M-9 4 -2-1 -4-8 3-2Q7-6 9-2L13 0 8 2Q5 8 0 5L-10 8Z' }), svg('circle', { cx: 16, cy: 0, r: 6.2, class: 'packet-dot' }));
      $('route-sky').append(bird);
      flights.set(event.key, { ...event, element: bird, paths, lengths, started: null });
    }
    pendingFlights = [];
    if (flights.size && flightFrame === null) flightFrame = requestAnimationFrame(animateFlights);
  }
  function animateFlights(now) {
    flightFrame = null;
    if (!motion?.enabled) { stopFlights(); return; }
    for (const [key, flight] of flights) {
      flight.started ??= now;
      const progress = Math.min(1, (now - flight.started) / 1100);
      if (progress === 1) { flight.element.remove(); flights.delete(key); continue; }
      let distance = progress * (flight.lengths[0] + flight.lengths[1]);
      const part = distance <= flight.lengths[0] ? 0 : 1;
      if (part) distance -= flight.lengths[0];
      const point = flight.paths[part].getPointAtLength(distance);
      const next = flight.paths[part].getPointAtLength(Math.min(flight.lengths[part], distance + 1));
      const angle = Math.atan2(next.y - point.y, next.x - point.x) * 180 / Math.PI;
      flight.element.setAttribute('transform', `translate(${point.x} ${point.y}) rotate(${angle}) scale(.65)`);
    }
    if (flights.size) flightFrame = requestAnimationFrame(animateFlights);
  }
  function scheduleGeometry() {
    if (geometryFrame === null && !pageStopped && !document.hidden && window.magpie?.visible !== false) {
      geometryFrame = requestAnimationFrame(layoutWires);
    }
  }
  function layoutWires() {
    geometryFrame = null;
    const bounds = $('route-graph').getBoundingClientRect();
    if (!bounds.width || !bounds.height) return;
    const box = element => {
      const rect = element.getBoundingClientRect();
      return { left: rect.left - bounds.left, right: rect.right - bounds.left, top: rect.top - bounds.top,
        bottom: rect.bottom - bounds.top, y: rect.top - bounds.top + rect.height / 2 };
    };
    const hub = box($('route-hub'));
    const sources = new Map([...sourceNodes].map(([key, element]) => [key, box(element)]));
    const destinations = new Map([...destinationNodes].map(([key, element]) => [key, box(element)]));
    const narrow = getComputedStyle($('route-graph')).getPropertyValue('--stacked').trim() === '1';
    for (const layer of [$('route-wires'), $('route-hit-area'), $('route-sky')]) layer.setAttribute('viewBox', `0 0 ${bounds.width} ${bounds.height}`);
    // Read all boxes above, then write geometry once; no DOM box reads per flight.
    for (const [key, path] of wireNodes) {
      const source = sources.get(path.dataset.requestKey), target = destinations.get(key);
      let d;
      if (!target) {
        const mid = (source.right + hub.left) / 2;
        d = `M${source.right},${source.y} C${mid},${source.y} ${mid},${hub.y} ${hub.left},${hub.y}`;
      } else if (narrow) {
        const start = (hub.left + hub.right) / 2, lane = 6;
        d = `M${start},${hub.bottom} C${start},${hub.bottom + 18} ${lane},${hub.bottom + 12} ${lane},${hub.bottom + 32} L${lane},${target.y - 12} Q${lane},${target.y} ${target.left},${target.y}`;
      } else {
        const mid = (hub.right + target.left) / 2;
        d = `M${hub.right},${hub.y} C${mid},${hub.y} ${mid},${target.y} ${target.left},${target.y}`;
      }
      if (path.getAttribute('d') !== d) path.setAttribute('d', d);
      const hit = hitNodes.get(key);
      if (hit && hit.getAttribute('d') !== d) hit.setAttribute('d', d);
    }
    launchFlights();
  }
  const stageObserver = typeof ResizeObserver === 'function' ? new ResizeObserver(scheduleGeometry) : null;
  function observeStage() {
    for (const id of ['route-graph', 'route-sources', 'route-hub', 'route-destinations']) stageObserver?.observe($(id));
    scheduleGeometry();
  }
  function renderFocusedEvidence() {
    if (!$('evidence-details').open) return;
    const row = view?.requests.find(row => row.key === focusKey);
    $('focused-evidence').hidden = !row;
    if (!row) { $('focused-evidence').replaceChildren(); return; }
    const attempts = replayIndex === null ? row.attempts : row.attempts.slice(0, replayIndex + 1);
    $('focused-evidence').replaceChildren(node('h3', '', `${requestName(row)} · recorded route`),
      node('p', 'muted small', 'Focus and recorded replay do not change the selected session or its totals.'),
      attempts.length ? attemptList(row, attempts, true) : node('p', 'muted', 'Attempt history unavailable; no route is inferred.'));
  }
  function renderStageSummary() {
    const focused = view?.requests.find(row => row.key === focusKey);
    const mode = replayIndex !== null ? 'Recorded replay' : focused ? `${requestName(focused)} · focused` :
      view?.scope.period !== 'live' ? 'Historical evidence' : scene.active ? `${scene.active} in flight` : 'Latest observed · idle';
    setText('hub-context', replayIndex !== null ? 'Recorded replay' : view?.scope.period !== 'live' ? 'History' : scene.active ? 'Routing' : 'Recent route');
    const coverage = view?.coverage.source === 'ledger' ? `${PERIOD_LABELS[currentScope.period]} · fixed ledger snapshot` : 'Recent trace · not lifetime history';
    setText('graph-note', `${mode} · ${scene.sources.length} of ${scene.total} loaded records · ${coverage}${view?.coverage.partial || view?.metrics.partial ? ' · partial coverage' : ''}` +
      (scene.omittedRequests || scene.omittedDestinations ? ` · Not shown: ${scene.omittedRequests} records (${scene.omittedActive} active), ${scene.omittedDestinations} candidates. Details has the remaining evidence.` : '') +
      (scene.unmatched ? ` · ${scene.unmatched} unmatched attempt(s); no destination inferred.` : ''));
  }
  function renderRoutes() {
    const focused = view?.requests.find(row => row.key === focusKey);
    if (!focused) { focusKey = null; replayIndex = null; }
    if (replayIndex !== null) replayIndex = Math.min(replayIndex, Math.max(0, focused.attempts.length - 1));
    scene = projectScene(view, { focusKey, replayIndex });
    $('route-graph').dataset.mode = scene.mode;
    $('clear-focus').hidden = !focused;
    $('show-more-routes').hidden = !scene.omittedRequests && !scene.omittedDestinations && !scene.unmatched;
    $('replay-controls').hidden = replayIndex === null;
    $('replay-prev').disabled = replayIndex === null || replayIndex === 0;
    $('replay-next').disabled = replayIndex === null || replayIndex >= (focused?.attempts.length || 0) - 1;
    setText('replay-status', replayIndex === null ? '' : `Recorded attempt ${replayIndex + 1} of ${focused.attempts.length} · manual replay`);
    renderStageSummary();
    $('stage-empty').hidden = !!scene.sources.length;
    $('route-hub').hidden = !scene.sources.length;
    setText('stage-empty', view ? 'No observed routes in this scope and coverage. No traffic is inferred.' : 'Loading this scope. Previous-scope routes have been cleared.');
    reconcile($('route-sources'), sourceNodes, scene.sources, item => {
      const button = node('button', 'route-source'); sceneButton(button, item.key); return button;
    }, (button, item) => {
      const { row } = item;
      button.dataset.testid = 'graph-request'; button.dataset.requestKey = row.key;
      button.dataset.active = String(item.active); button.setAttribute('aria-pressed', String(focusKey === row.key));
      const signature = JSON.stringify([row.agent, row.session, row.model, row.id, row.outcome, row.isSubagent, item.orphan, item.unmatched]);
      if (button.dataset.content !== signature) {
        button.dataset.content = signature;
        const icon = node('span', 'agent-glyph', '>_'); icon.setAttribute('aria-hidden', 'true');
        button.replaceChildren(icon, node('strong', '', row.agent || 'Unknown agent'),
          node('small', '', row.session ? short(row.session) : 'No session ID'), node('span', 'request-chip', requestName(row)),
          badge(item.orphan ? 'unavailable' : row.outcome));
        if (row.isSubagent || row.subagentId) button.append(node('small', '', 'Subagent'));
        if (item.unmatched) button.append(node('small', '', `${item.unmatched} unmatched attempt(s)`));
      }
    });
    reconcile($('route-destinations'), destinationNodes, scene.destinations, item => {
      const element = node('li', 'route-destination'), button = node('button', 'destination-button');
      sceneButton(button, item.requestKey, item.key); element.append(button); return element;
    }, (element, item) => {
      element.dataset.testid = item.candidate ? 'graph-candidate' : 'graph-unavailable';
      element.dataset.requestKey = item.requestKey; element.dataset.candidateKey = item.candidate?.key || '';
      element.dataset.sceneKey = item.key; element.dataset.state = item.state; element.dataset.active = String(item.active);
      element.dataset.highlight = String(replayIndex !== null && item.current);
      const button = element.firstElementChild;
      button.setAttribute('aria-pressed', String(focusKey === item.requestKey));
      const signature = JSON.stringify([item.candidate, item.attempts, item.state, item.message, item.row.id]);
      if (element.dataset.content !== signature) {
        element.dataset.content = signature;
        const candidate = item.candidate, last = item.attempts.at(-1);
        const title = node('span', 'destination-name');
        title.append(node('strong', '', candidate ? candidate.provider || 'Provider unknown' : 'Route unavailable'),
          node('small', '', candidate?.label || item.message));
        const meta = node('span', 'destination-meta');
        meta.append(node('code', '', candidate?.model || (candidate ? 'Model unknown' : item.row.servedModel || 'Model not recorded')),
          node('small', '', `${requestName(item.row)} · ${STATES[item.state] || 'Unknown'}${last ? ` · #${attemptIndex(last, item.attempts.length - 1)} ${last.transition || 'unknown'}` : candidate ? ' · not attempted' : ''}`));
        button.replaceChildren(badge(item.state), title, meta);
      }
    });
    const wires = [];
    for (const source of scene.sources) if (!source.orphan && (source.row.candidates.length || source.attempts.length)) {
      const active = scene.destinations.some(destination => destination.requestKey === source.key && destination.active);
      const last = source.attempts.at(-1);
      wires.push({ key: JSON.stringify([source.key]), requestKey: source.key,
        state: last ? last.outcome === 'in-flight' ? 'attempting' : last.outcome : 'candidate', active, kind: 'source' });
    }
    for (const destination of scene.destinations) if (destination.candidate) wires.push({ ...destination, kind: 'destination' });
    reconcile($('route-wires'), wireNodes, wires, () => svg('path'), (path, item) => {
      path.dataset.testid = 'route-wire'; path.dataset.sceneKey = item.key;
      path.dataset.requestKey = item.requestKey; path.dataset.kind = item.kind;
      path.dataset.state = item.state; path.dataset.active = String(item.active);
    });
    reconcile($('route-hit-area'), hitNodes, wires, item => {
      const path = svg('path');
      path.addEventListener('click', () => focusRequest(item.requestKey));
      path.addEventListener('pointerenter', () => inspect(item.requestKey, item.kind === 'destination' ? item.key : null));
      path.addEventListener('pointerleave', () => inspect(focusKey));
      return path;
    }, (path, item) => { path.dataset.requestKey = item.requestKey; });
    inspect(scene.sources.some(source => source.key === inspectionKey) ? inspectionKey : focusKey);
    renderFocusedEvidence(); scheduleGeometry(); syncMotion();
  }
  function renderTimeline() {
    if (!$('evidence-details').open) return;
    const requests = [...(view?.requests || [])].sort((a, b) => (Date.parse(b.time) || 0) - (Date.parse(a.time) || 0) || a.key.localeCompare(b.key));
    setText('request-count', `${requests.length} evidence records loaded · ${number(view?.metrics?.requests)} requests in scope coverage`);
    if (!requests.length) {
      $('request-list').replaceChildren(node('p', 'empty', view ? 'No requests in this scope and period. Choose another session or coverage period.' : 'Loading this scope. No requests are assumed.'));
    } else {
      const cards = requests.map(row => {
        const card = node('article', 'request-card'); card.dataset.testid = 'request-row'; card.dataset.requestKey = row.key;
        const toolbar = node('div', 'request-toolbar');
        toolbar.append(node('span', 'request-id', requestName(row)), badge(row.outcome),
          action('Focus route', `focus-${row.key}`, () => focusRequest(row.key), 'request-focus'));
        if (row.attempts.length) toolbar.append(action('Replay attempts', `replay-${row.key}`, () => focusRequest(row.key, true), 'request-replay'));
        if (focusKey === row.key) toolbar.append(node('span', 'muted small', 'Focused'));
        const details = node('details'); details.dataset.testid = 'request-details'; details.open = expanded.has(row.key);
        const summary = node('summary'); summary.dataset.uiFocus = `details-${row.key}`;
        const text = node('span', 'request-summary');
        const timestamp = node('time', '', time(row.time)); if (row.time) timestamp.dateTime = row.time;
        text.append(timestamp, node('span', '', row.model || 'Requested model unknown'), node('span', 'muted', `${row.agent || 'Unknown agent'} · ${row.session ? short(row.session) : 'No session ID'}`));
        summary.append(text);
        const body = node('div', 'request-body');
        let populated = false;
        const populate = () => {
          if (populated) return;
          populated = true;
          body.append(fields([
          ['Request key', row.key], ['Recorded session', row.session || 'Unknown / no session ID'], ['Agent', row.agent || 'Unknown'],
          ['Requested model', row.model || 'Unknown'], ['Served model', row.servedModel || 'Not recorded'], ['Provider', row.provider || 'Unknown'],
          ['Effort', row.effort || 'Not recorded'], ['HTTP status', row.status ?? 'Unknown'], ['Recorded reason', row.error || 'Not recorded'],
          ['TTFT', duration(row.ttft)], ['Elapsed', duration(row.ms)], ['Input tokens', number(row.inputTokens)],
          ['Output tokens', number(row.outputTokens)], ['Total tokens', number(row.tokens)], ['Cache-read tokens', number(row.cacheReadTokens)],
          ['Cache-write tokens', number(row.cacheWriteTokens)], ['Reasoning tokens', number(row.reasoningTokens)], ['Recorded cost (USD)', money(row.cost)],
          ['Retries', number(row.retries)], ['Fallback transitions', number(row.fallbacks)], ['Last update', time(row.updatedAt)],
        ]));
        if (row.folder) body.append(node('p', 'muted', `Project folder (opt-in): ${row.folder}`));
        if (row.parentSessionKey) body.append(node('p', 'muted', 'Confirmed same-agent parent relationship. Child traffic is included only when explicitly selected.'));
        if (row.isSubagent || row.subagentId) body.append(node('p', 'muted', `Explicit subagent actor${row.subagentId ? `: ${row.subagentId}` : ''}`));
        if (row.partial || row.reasons?.length) body.append(node('p', 'muted', `Partial evidence. ${(row.reasons || []).map(reasonLabel).join(' · ')}`));
        body.append(node('h3', '', 'Recorded candidates'));
        const candidates = node('ul', 'candidate-evidence');
        for (const candidate of row.candidates) {
          candidates.append(node('li', '', `${candidate.provider || 'Provider unknown'} / ${candidate.label || 'Anonymous candidate'} → ${candidate.model || 'Model unknown'}${candidate.effort ? ` · Effort: ${candidate.effort}` : ''}`));
        }
        body.append(row.candidates.length ? candidates : node('p', 'muted', 'Historical topology / candidates unavailable. No route is inferred.'));
        body.append(node('h3', '', 'Recorded attempts'));
          body.append(row.attempts.length ? attemptList(row) : node('p', 'muted', 'Attempt history unavailable. Usage ledger rows do not reconstruct routing order.'));
        };
        if (details.open) populate();
        details.append(summary, body);
        details.addEventListener('toggle', () => {
          if (!details.isConnected) return;
          if (details.open) { expanded.add(row.key); populate(); } else expanded.delete(row.key);
        });
        card.append(toolbar, details); return card;
      });
      $('request-list').replaceChildren(...cards);
    }
    const paging = view?.pagination;
    $('load-more').hidden = !paging || paging.nextOffset == null;
    setText('pagination-status', paging ? `${requests.length} of ${number(paging.total)} evidence records in this immutable history snapshot. Billable-attempt-only records are not additional requests. Scope totals cover the full scanned snapshot, not just the loaded page.` : 'Live trace is bounded; it is not a persistent archive.');
  }
  function resetView(scope) {
    if (currentScope.period !== scope.period) { sessions = []; unknownRequests = 0; }
    currentScope = scope; view = null; focusKey = null; replayIndex = null; inspectionKey = null; expanded.clear();
    motion = null; stopFlights();
    $('request-list').replaceChildren(node('p', 'empty', 'Loading this scope. Previous-scope requests have been cleared.'));
    $('focused-evidence').replaceChildren(); $('focused-evidence').hidden = true;
    storage.write(selection()); $('storage-note').hidden = storage.available;
    renderPicker(); renderMetrics(null); renderRoutes(); renderTimeline();
    renderConnection({ status: 'starting', lastUpdated: null, reason: null });
  }
  function applyState(data) {
    if (view && (data.instanceId !== view.instanceId || data.generation !== view.generation)) {
      focusKey = null; replayIndex = null; inspectionKey = null; expanded.clear();
      motion = null; stopFlights(); $('focused-evidence').replaceChildren();
      announce('The telemetry instance changed. Previous request focus and replay were cleared; session selection is unchanged.');
    }
    const unchangedRecords = view && data.instanceId === view.instanceId && data.generation === view.generation &&
      scopeEquals(data.scope, view.scope) && JSON.stringify(data.requests) === JSON.stringify(view.requests) &&
      JSON.stringify(data.pagination) === JSON.stringify(view.pagination);
    currentScope = data.scope; view = data; sessions = data.sessions; unknownRequests = data.unknownRequests || 0;
    lastConnection = { ...lastConnection, ...data.connection };
    for (const key of expanded) if (!data.requests.some(row => row.key === key)) expanded.delete(key);
    preserveFocus(() => {
      renderPicker(); renderMetrics(data);
      if (!unchangedRecords) { renderRoutes(); renderTimeline(); }
      else renderStageSummary();
    });
    syncMotion();
  }
  async function request(path, { signal, token }) {
    const abort = new AbortController();
    const cancel = () => abort.abort(); signal.addEventListener('abort', cancel, { once: true });
    const deadline = setTimeout(cancel, 30_000);
    try {
      if (signal.aborted) cancel();
      const response = await fetch(path, { method: 'GET', headers: { Authorization: `Bearer ${token}` },
        signal: abort.signal, credentials: 'omit', cache: 'no-store', redirect: 'error', referrerPolicy: 'no-referrer' });
      if (!response.headers.get('content-type')?.includes('application/json') || Number(response.headers.get('content-length')) > 8 * 1024 * 1024) {
        throw Object.assign(new Error('Unexpected service response'), { status: response.status, code: response.ok ? 'invalid_snapshot' : 'unavailable' });
      }
      const raw = await response.text();
      if (raw.length > 8 * 1024 * 1024) throw Object.assign(new Error('Response too large'), { code: 'invalid_snapshot' });
      const data = JSON.parse(raw);
      if (!response.ok) throw Object.assign(new Error('Service request failed'), { status: response.status, code: data?.error?.code });
      return data;
    } catch (error) {
      if (abort.signal.aborted && !signal.aborted) throw Object.assign(new Error('Service timeout'), { code: 'timeout' });
      throw error;
    } finally { clearTimeout(deadline); signal.removeEventListener('abort', cancel); }
  }
  let controller = null, ready = false, starting = false;
  let removeVisibility = null;
  const changeScope = () => {
    announce('');
    controller?.setScope(makeScope($('session-select').value, $('period-select').value, $('include-children').checked));
  };
  $('session-select').addEventListener('change', changeScope);
  $('period-select').addEventListener('change', changeScope);
  $('include-children').addEventListener('change', changeScope);
  $('session-search').addEventListener('input', renderPicker);
  $('session-filter').addEventListener('change', renderPicker);
  $('all-sessions').addEventListener('click', () => { announce(''); controller?.setScope(makeScope('', currentScope.period)); });
  $('refresh').addEventListener('click', () => {
    announce('');
    if (ready) void controller.refresh(); else void start();
  });
  $('load-more').addEventListener('click', () => { void controller?.loadMore(); });
  $('clear-focus').addEventListener('click', () => { focusKey = null; replayIndex = null; renderRoutes(); renderTimeline(); });
  const openEvidence = () => {
    $('evidence-details').open = true; renderFocusedEvidence(); renderTimeline();
    $('request-list').focus();
  };
  $('show-more-routes').addEventListener('click', openEvidence);
  document.querySelector('.skip-link').addEventListener('click', event => { event.preventDefault(); openEvidence(); });
  $('evidence-details').addEventListener('toggle', () => {
    if ($('evidence-details').open) { renderMetrics(view); renderFocusedEvidence(); renderTimeline(); }
  });
  $('replay-prev').addEventListener('click', () => { if (replayIndex > 0) { replayIndex--; renderRoutes(); } });
  $('replay-next').addEventListener('click', () => { if (replayIndex !== null) { replayIndex++; renderRoutes(); } });
  $('replay-exit').addEventListener('click', () => { replayIndex = null; renderRoutes(); });
  const visibility = () => {
    syncMotion(); controller?.setVisible(!document.hidden && window.magpie?.visible !== false);
    scheduleGeometry();
  };
  document.addEventListener('visibilitychange', visibility);
  reducedMotion.addEventListener('change', () => syncMotion());
  addEventListener('resize', scheduleGeometry);
  addEventListener('pagehide', () => {
    pageStopped = true; syncMotion(); stageObserver?.disconnect();
    controller?.stop(); removeVisibility?.(); removeVisibility = null; ready = false;
  });
  addEventListener('pageshow', event => {
    if (event.persisted) { pageStopped = false; motion = null; observeStage(); void start(); }
  });
  async function start() {
    if (ready || starting) return;
    starting = true;
    try {
      if (!window.magpie || window.parent === window) throw new Error('Bridge unavailable');
      await (window.magpie.reconnect ? window.magpie.reconnect() : window.magpie.ready);
      if (ready) return;
      controller = createController({ request, readOptions: () => window.magpie.options.get(), initialScope: currentScope,
        visible: !document.hidden && window.magpie.visible !== false,
        onState: applyState, onReset: resetView, onNotice: announce,
        onStatus(update) {
          if (update.status === 'stopped') { sessions = []; unknownRequests = 0; renderPicker(); }
          renderConnection(update);
        },
      });
      removeVisibility = window.magpie.onVisibility(visibility);
      ready = true; void controller.refresh();
    } catch {
      renderConnection({ status: 'disconnected', reason: 'The Magpie parent bridge is unavailable. Refresh to reconnect or reopen Session Routing from Magpie WebUI. Direct standalone access is not supported.' });
    } finally { starting = false; }
  }
  resetView(currentScope);
  observeStage();
  void start();
})();

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

  // Expose only stateless helpers/factory, never this frame’s token or controller.
  window.SessionRouting = Object.freeze({ makeScope, scopeEquals, queryFor, selectSessions,
    validOptions, validateSnapshot, selectionStore, createController, number, duration, money, attemptEvidence, requestName, selectedSummary });

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
  let view = null, focusKey = null, replayIndex = null, showAllRoutes = false;
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
    if (!view && !['live', 'starting'].includes(update.status)) {
      setText('coverage', `${PERIOD_LABELS[currentScope.period]} · No authorized snapshot available. Totals are unknown.`);
      $('route-graph').replaceChildren(node('p', 'empty', 'No routing snapshot is available. Refresh or reopen this page through Magpie.'));
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
  function renderRoutes() {
    const requests = view?.requests || [];
    const focused = requests.find(row => row.key === focusKey);
    if (!focused) { focusKey = null; replayIndex = null; }
    if (replayIndex !== null) replayIndex = Math.min(replayIndex, Math.max(0, focused.attempts.length - 1));
    const ordered = [...requests].sort((a, b) => Number(b.outcome === 'in-flight') - Number(a.outcome === 'in-flight') ||
      (Date.parse(b.time) || 0) - (Date.parse(a.time) || 0));
    const shown = focused ? [focused] : showAllRoutes ? ordered : ordered.slice(0, 12);
    $('clear-focus').hidden = !focused;
    $('show-more-routes').hidden = !!focused || showAllRoutes || ordered.length <= 12;
    $('replay-controls').hidden = replayIndex === null;
    $('replay-prev').disabled = replayIndex === null || replayIndex === 0;
    $('replay-next').disabled = replayIndex === null || replayIndex >= (focused?.attempts.length || 0) - 1;
    setText('replay-status', replayIndex === null ? '' : `Recorded attempt ${replayIndex + 1} of ${focused.attempts.length} · manual replay`);
    setText('graph-note', focused ? `${requestName(focused)} is focused${replayIndex === null ? '' : ' in recorded-step replay'}. Session selection and scope totals are unchanged.` :
      `${shown.length} of ${requests.length} loaded evidence records shown; in-flight requests first. Candidate does not mean served. Billable-attempt-only records are labelled separately and do not add to the request count.`);
    if (!shown.length) {
      $('route-graph').replaceChildren(node('p', 'empty', view ? 'No observed routes in this scope and coverage. No traffic is inferred.' : 'Loading this scope. Previous-scope routes have been cleared.'));
      return;
    }
    const cards = shown.map(row => {
      const card = node('article', 'route-card'); card.dataset.testid = 'graph-request'; card.dataset.requestKey = row.key;
      const heading = node('div', 'route-heading');
      heading.append(action(requestName(row), `graph-focus-${row.key}`, () => focusRequest(row.key)), badge(row.outcome));
      if (row.partial) heading.append(node('span', 'muted small', 'Partial evidence'));
      card.append(heading);
      const chain = node('div', 'route-chain');
      const actor = node('div', 'route-node');
      actor.append(node('small', '', 'Agent / recorded session'), node('strong', '', row.agent || 'Unknown agent'),
        node('span', '', row.session ? short(row.session) : 'Unknown / no session ID'));
      if (row.isSubagent || row.subagentId) actor.append(node('small', '', 'Explicit subagent actor'));
      const gateway = node('div', 'route-node');
      gateway.append(node('small', '', 'Read-only gateway evidence'), node('strong', '', 'Magpie gateway'), node('span', '', row.group?.name ? `Group: ${row.group.name}` : 'Group not recorded'));
      const arrow = () => { const value = node('span', 'route-arrow', '→'); value.setAttribute('aria-hidden', 'true'); return value; };
      const destinations = node('ul', 'route-destinations');
      const replaying = row.key === focusKey && replayIndex !== null;
      const attempts = replaying ? row.attempts.slice(0, replayIndex + 1) : row.attempts;
      for (const candidate of row.candidates) {
        const matched = attempts.filter(attempt => attempt.candidateKey === candidate.key);
        const latest = matched.at(-1);
        const state = replaying ? (latest?.outcome === 'in-flight' ? 'attempting' : latest?.outcome || 'candidate') : candidate.state;
        const destination = node('li', 'route-destination'); destination.dataset.testid = 'graph-candidate';
        destination.dataset.state = state || 'unknown';
        destination.dataset.highlight = String(replaying && attempts.at(-1)?.candidateKey === candidate.key);
        destination.append(badge(state), node('span', 'destination-label', `${candidate.provider || 'Provider unknown'} / ${candidate.label || 'Anonymous candidate'}`),
          node('strong', 'destination-label', `→ ${candidate.model || 'Model unknown'}`));
        if (candidate.effort) destination.append(node('small', 'muted', `Effort: ${candidate.effort}`));
        destination.append(node('small', 'muted', matched.length ? `${matched.length} recorded attempt(s)` : 'No attempt recorded in this view'));
        destinations.append(destination);
      }
      if (!row.candidates.length) destinations.append(node('li', 'route-node', `Historical topology / candidates unavailable. Recorded provider: ${row.provider || 'Unknown'} → served model: ${row.servedModel || 'Not recorded'}.`));
      chain.append(actor, arrow(), gateway, arrow(), destinations); card.append(chain);
      if (attempts.length) {
        card.append(node('h3', 'attempt-list-title', 'Actual attempt sequence'), attemptList(row, attempts, true));
        if (replaying && attempts.length < row.attempts.length) card.append(node('p', 'muted small', 'Later recorded attempts are hidden during replay. This is not live execution.'));
      } else card.append(node('p', 'muted small', 'No attempt trace is available. Eligible routes are not evidence of a successful request.'));
      return card;
    });
    $('route-graph').replaceChildren(...cards);
  }
  function renderTimeline() {
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
    currentScope = scope; view = null; focusKey = null; replayIndex = null; showAllRoutes = false; expanded.clear();
    storage.write(selection()); $('storage-note').hidden = storage.available;
    renderPicker(); renderMetrics(null); renderRoutes(); renderTimeline();
    renderConnection({ status: 'starting', lastUpdated: null, reason: null });
  }
  function applyState(data) {
    if (view && (data.instanceId !== view.instanceId || data.generation !== view.generation)) {
      focusKey = null; replayIndex = null; showAllRoutes = false; expanded.clear();
      announce('The telemetry instance changed. Previous request focus and replay were cleared; session selection is unchanged.');
    }
    const unchangedRecords = view && data.instanceId === view.instanceId && data.generation === view.generation &&
      scopeEquals(data.scope, view.scope) && JSON.stringify(data.requests) === JSON.stringify(view.requests) &&
      JSON.stringify(data.pagination) === JSON.stringify(view.pagination);
    currentScope = data.scope; view = data; sessions = data.sessions; unknownRequests = data.unknownRequests || 0;
    for (const key of expanded) if (!data.requests.some(row => row.key === key)) expanded.delete(key);
    preserveFocus(() => {
      renderPicker(); renderMetrics(data);
      if (!unchangedRecords) { renderRoutes(); renderTimeline(); }
    });
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
  $('show-more-routes').addEventListener('click', () => { showAllRoutes = true; renderRoutes(); });
  $('replay-prev').addEventListener('click', () => { if (replayIndex > 0) { replayIndex--; renderRoutes(); } });
  $('replay-next').addEventListener('click', () => { if (replayIndex !== null) { replayIndex++; renderRoutes(); } });
  $('replay-exit').addEventListener('click', () => { replayIndex = null; renderRoutes(); });
  const visibility = () => controller?.setVisible(!document.hidden && window.magpie?.visible !== false);
  document.addEventListener('visibilitychange', visibility);
  addEventListener('pagehide', () => { controller?.stop(); removeVisibility?.(); removeVisibility = null; ready = false; });
  addEventListener('pageshow', event => { if (event.persisted) void start(); });
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
  void start();
})();

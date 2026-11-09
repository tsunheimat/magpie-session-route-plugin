/* Secure transport/host for the copied native upper Routing block. The bridge
 * keeps its own window.magpie; no core app/kernel bootstrap or generic API shim.
 * Tokens stay in this closure. Only api/native-routing is ever requested. */
(() => {
  'use strict';
  const MAX_BYTES = 8 * 1024 * 1024;
  const error = code => Object.assign(new Error(code), { code });
  const integer = n => Number.isSafeInteger(n) && n >= 0;
  const object = x => !!x && typeof x === 'object' && !Array.isArray(x);
  const text = (x, n = 2048) => typeof x === 'string' && x.length <= n;
  const time = x => text(x, 64) && Number.isFinite(Date.parse(x));
  // Display-only metadata, not a second path/actor inference layer. Missing
  // projectName must stay missing even when full folder disclosure is enabled.
  const projectName = x => text(x, 256) && x.trim().length > 0 && x !== '.' && x !== '..' &&
    /^[\p{L}\p{N}_ .~:+-]+$/u.test(x);
  const actorId = x => text(x, 128) && /^[A-Za-z0-9_-]+$/.test(x);
  const measurements = (x, keys) => keys.every(k => x[k] == null || (typeof x[k] === 'number' && Number.isFinite(x[k]) && x[k] >= 0));
  function validOptions(options) {
    return object(options) && /^[A-Za-z0-9_-]{42}[AEIMQUYcgkosw048]$/.test(options.apiToken) &&
      /^[A-Za-z0-9_-]{21}[AQgw]$/.test(options.installationId);
  }
  function validateSnapshot(d) {
    if (!object(d) || d.apiVersion !== 1 || d.object !== 'trace' || !text(d.instanceId, 128) || !d.instanceId ||
        !integer(d.generation) || !integer(d.revision) || !integer(d.seq) || !object(d.connection) ||
        !['live','starting','stale','disconnected','stopped'].includes(d.connection.status) || !object(d.coverage) ||
        !Array.isArray(d.routes) || d.routes.length > 4000 || !Array.isArray(d.ids) || d.ids.length > 4000 ||
        (d.now != null && !time(d.now)) || (d.pid != null && !integer(d.pid)) ||
        (d.lifted != null && (!object(d.lifted) || Object.entries(d.lifted).some(([key,value])=>!text(key,256)||!time(value)))) ||
        (d.serves != null && !text(d.serves, 128)) ||
        new Set(d.ids).size !== d.ids.length || d.ids.some(id => !integer(id))) throw error('invalid_snapshot');
    const ids = new Set();
    let seats = 0;
    for (const r of d.routes) {
      if (!object(r) || !integer(r.id) || ids.has(r.id) || (r.agent != null && !text(r.agent, 128)) || (r.model != null && !text(r.model)) ||
          (r.provider != null && !text(r.provider, 256)) || !time(r.time) || typeof r.done !== 'boolean' ||
          !measurements(r,['status','ms','tokens','out','ttft','cost']) ||
          (r.evidence != null && (!object(r.evidence) || !Array.isArray(r.evidence.reasons) || r.evidence.reasons.some(k=>!text(k,128)))) ||
          (r.session != null && !text(r.session)) ||
          (r.projectName != null && !projectName(r.projectName)) || (r.actorId != null && !actorId(r.actorId)) ||
          (r.isSubagent != null && typeof r.isSubagent !== 'boolean') ||
          !Array.isArray(r.order) || !Array.isArray(r.tries) || !Array.isArray(r.left) ||
          r.order.length > 1024 || r.left.length > 1024 || r.tries.length > 1024) throw error('invalid_snapshot');
      ids.add(r.id);
      if (r.tries.some(s => !object(s) || typeof s.done !== 'boolean' || (s.start != null && !time(s.start)) || !measurements(s,['status','ms','ttft','again']))) throw error('invalid_snapshot');
      for (const s of [...r.order, ...r.left, ...r.tries]) {
        if (++seats > 200000 || !object(s) || !text(s.id, 256) || !s.id || (s.model != null && !text(s.model))) throw error('invalid_snapshot');
      }
    }
    if (ids.size !== d.ids.length || d.ids.some(id => !ids.has(id))) throw error('invalid_snapshot');
    if (d.totals != null && (!object(d.totals) || ['requests','rerouted','errors'].some(k => d.totals[k] != null && !integer(d.totals[k])))) throw error('invalid_snapshot');
    return d;
  }
  async function request({ signal, token }) {
    const abort = new AbortController();
    const cancel = () => abort.abort();
    signal.addEventListener('abort', cancel, { once: true });
    const deadline = setTimeout(cancel, 30_000);
    try {
      if (signal.aborted) cancel();
      const response = await fetch('api/native-routing', { method: 'GET', headers: { Authorization: `Bearer ${token}` },
        signal: abort.signal, credentials: 'omit', cache: 'no-store', redirect: 'error', referrerPolicy: 'no-referrer' });
      if (!response.ok) throw Object.assign(error('service_unavailable'), { status: response.status });
      if (!response.body || !/^application\/json(?:\s*;|$)/i.test(response.headers.get('content-type') || '') || Number(response.headers.get('content-length')) > MAX_BYTES) throw error('invalid_snapshot');
      // Count bytes while streaming: a missing Content-Length is not an unlimited read.
      const reader = response.body.getReader(), chunks = []; let bytes = 0;
      try {
        for (;;) {
          const { done, value } = await reader.read(); if (done) break;
          bytes += value.byteLength;
          if (bytes > MAX_BYTES) { await reader.cancel(); throw error('invalid_snapshot'); }
          chunks.push(value);
        }
      } finally { reader.releaseLock(); }
      const all = new Uint8Array(bytes); let at = 0;
      for (const c of chunks) { all.set(c, at); at += c.byteLength; }
      let data;
      try { data = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(all)); }
      catch { throw error('invalid_snapshot'); }
      return validateSnapshot(data);
    } catch (e) {
      if (abort.signal.aborted && !signal.aborted) throw error('timeout');
      throw e;
    } finally { clearTimeout(deadline); signal.removeEventListener('abort', cancel); }
  }
  function createController({ readOptions, request, onState, onReset, visible = true,
    setTimer = setTimeout, clearTimer = clearTimeout, onVisibility = () => {} }) {
    let token = '', epoch = 0, running = null, abort = null, timer = null, stopped = false, blocked = false, queued = false;
    const cancel = () => { if (timer != null) clearTimer(timer); timer = null; abort?.abort(); };
    async function credential() {
      const v = await readOptions();
      if (!validOptions(v)) throw error('setup_required');
      return v.apiToken;
    }
    async function authorized(signal, version) {
      if (!token) { const next = await credential(); if (version !== epoch || signal.aborted) throw error('canceled'); token = next; }
      try { return await request({ signal, token }); }
      catch (e) {
        if (e.status !== 401 || signal.aborted || version !== epoch) throw e;
        token = ''; const next = await credential();
        if (version !== epoch || signal.aborted) throw error('canceled');
        token = next; return request({ signal, token });
      }
    }
    function pump() {
      if (running || stopped || blocked || !visible) return running || Promise.resolve();
      queued = false; const version = epoch; abort = new AbortController(); const signal = abort.signal;
      running = Promise.resolve().then(async () => {
        try {
          const d = validateSnapshot(await authorized(signal, version));
          if (version === epoch && !signal.aborted && !stopped && visible) onState(d);
        } catch (e) {
          if (version !== epoch || signal.aborted || stopped || !visible) return;
          token = '';
          blocked = e.status === 401 || e.status === 403 || e.code === 'setup_required';
          onReset(blocked ? 'Access is unavailable or was revoked. Reopen Session Routing from Magpie.' :
            e.code === 'invalid_snapshot' ? 'The routing snapshot is incompatible. Update the plugin and Magpie together.' :
            'Routing data is unavailable. Waiting for the service; no cached activity is shown as live.');
        }
      }).finally(() => {
        running = null; abort = null;
        if (stopped || blocked || !visible) return;
        if (queued) void pump();
        else timer = setTimer(() => { timer = null; void pump(); }, 1000);
      });
      return running;
    }
    return {
      refresh() { if (stopped) return Promise.resolve(); blocked = false; cancel(); queued = true; return pump(); },
      setVisible(v) {
        if (visible === !!v) return;
        visible = !!v; epoch++; token = ''; cancel(); onVisibility();
        if (visible) { queued = true; return pump(); }
      },
      stop() { stopped = true; epoch++; token = ''; cancel(); onReset(''); },
    };
  }
  // Unit tests use these stateless helpers only, never a token/controller instance.
  globalThis.SessionRouting = Object.freeze({ validOptions, validateSnapshot, request, createController });
  if (typeof document === 'undefined') return;
  const bridge = window.magpie;
  let controller, currentGeneration = 0, snapshot = null, stopped = false, startEpoch = 0;
  const visible = () => !stopped && !document.hidden && bridge?.visible !== false;
  const renderer = window.mountNativeRouting({ visible, generation: () => currentGeneration,
    connectionMessage: connection => connection.status === 'starting' ? 'Waiting for routing data.' : 'Routing data is not live. Waiting for the gateway.' });
  window.installNativeMask(() => new Set((snapshot?.routes || []).flatMap(r => [...r.order, ...r.left].map(w => w.who).filter(Boolean))));
  const theme = v => {
    // Keep the original native theme tokens; only the native theme/locale choices change.
    if (typeof v?.dark === 'boolean') document.documentElement.dataset.theme = v.dark ? 'dark' : 'light';
    if (typeof v?.lang === 'string') renderer.locale(v.lang);
  };
  const visibility = () => {
    document.documentElement.classList.toggle('magpie-out-of-sight', !visible());
    controller?.setVisible(visible());
  };
  let removeTheme, removeVisibility;
  async function start() {
    const version = ++startEpoch;
    stopped = false;
    try {
      if (!bridge || parent === window) throw error('bridge_required');
      await (bridge.reconnect ? bridge.reconnect() : bridge.ready);
      if (stopped || version !== startEpoch) return;
      theme(bridge.theme);
      controller = createController({ request, readOptions: () => bridge.options.get(), visible: visible(),
        onState(d) { snapshot = d; currentGeneration = d.generation; renderer.accept(d); },
        onReset(message) { snapshot = null; renderer.clear(message); }, onVisibility: () => renderer.visibility() });
      removeTheme = bridge.onTheme(theme); removeVisibility = bridge.onVisibility(visibility);
      void controller.refresh();
    } catch { if (!stopped && version === startEpoch) renderer.clear('Open Session Routing inside Magpie WebUI. Secure parent authorization is required.'); }
  }
  document.addEventListener('visibilitychange', visibility);
  addEventListener('pagehide', () => { stopped = true; startEpoch++; controller?.stop(); renderer.visibility(); removeTheme?.(); removeVisibility?.(); });
  addEventListener('pageshow', e => { if (e.persisted) void start(); });
  void start();
})();

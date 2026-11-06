/* The service document reconnects to the same parent/WindowProxy as the launcher.
 * Keep this small protocol adapter source-compatible with Magpie pagebridge.js.
 * In particular, NEVER resolve hello.service here: it is launcher-relative. */
(() => {
  'use strict';
  const pending = new Map();
  const themed = new Set();
  const watched = new Set();
  const tokenNames = new Set(['bg', 'card', 'fg', 'fg-2', 'muted', 'faint', 'line', 'accent', 'accent-soft', 'accent-fg', 'font', 'code']);
  const nonce = new Uint32Array(4);
  crypto.getRandomValues(nonce);
  const prefix = Array.from(nonce, n => n.toString(36)).join('-');
  let next = 0;

  function call(method, params) {
    if (parent === window) return Promise.reject(new Error('Open this page inside Magpie WebUI.'));
    const id = `${prefix}-${++next}`;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        pending.delete(id);
        reject(new Error('The Magpie page bridge did not answer.'));
      }, 10_000);
      pending.set(id, { resolve, reject, timer });
      parent.postMessage({ magpie: 1, id, method, params }, '*');
    });
  }

  function paint(theme) {
    if (!theme || typeof theme !== 'object') return;
    const root = document.documentElement;
    if (typeof theme.dark === 'boolean') {
      root.dataset.theme = theme.dark ? 'dark' : 'light';
      root.style.colorScheme = theme.dark ? 'dark' : 'light';
    }
    // All UI copy is English; do not falsely label it with the parent's locale.
    for (const [name, value] of Object.entries(theme.tokens || {})) {
      if (tokenNames.has(name) && typeof value === 'string' && value.length < 256) {
        root.style.setProperty(`--magpie-${name}`, value);
      }
    }
    api.theme = theme;
    for (const callback of themed) callback(theme);
  }

  const api = {
    theme: null,
    visible: true,
    // Existing service root; ignore the launcher's relative value in hello.
    service: new URL('./', location.href).href,
    onTheme(callback) { themed.add(callback); return () => themed.delete(callback); },
    onVisibility(callback) { watched.add(callback); return () => watched.delete(callback); },
    options: {
      get: () => call('options.get'),
      set: options => call('options.set', { options }),
    },
  };

  addEventListener('message', event => {
    if (event.source !== parent) return;
    const message = event.data;
    if (!message || typeof message !== 'object' || message.magpie !== 1) return;
    if (message.event === 'theme') { paint(message.data); return; }
    if (message.event === 'visibility') {
      if (typeof message.data?.visible !== 'boolean') return;
      api.visible = message.data.visible;
      for (const callback of watched) callback(api.visible);
      return;
    }
    const waiting = pending.get(message.id);
    if (!waiting) return;
    clearTimeout(waiting.timer);
    pending.delete(message.id);
    // Parent error strings may contain paths or options: never echo them.
    if (message.error) waiting.reject(new Error('Magpie refused the page bridge request.'));
    else waiting.resolve(message.result);
  });

  let handshake = null;
  api.reconnect = () => {
    if (handshake) return handshake;
    handshake = call('hello').then(result => {
      if (!result || typeof result !== 'object') throw new Error('Unsupported Magpie page bridge.');
      api.visible = result.visible !== false;
      paint(result);
      return result;
    }).catch(error => { handshake = null; throw error; });
    // A rejected handshake is displayed by app.js, never logged with page URLs.
    handshake.catch(() => {});
    return handshake;
  };
  api.ready = api.reconnect();
  window.magpie = api;
})();

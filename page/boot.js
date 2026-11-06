(() => {
  'use strict';
  const status = document.getElementById('launch-status');
  const retry = document.getElementById('launch-retry');
  const setup = document.getElementById('launch-setup');
  let running = false;

  function randomKey(bytes) {
    const data = new Uint8Array(bytes);
    crypto.getRandomValues(data);
    return btoa(String.fromCharCode(...data)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
  }
  function provisioned(options) {
    return options && /^[A-Za-z0-9_-]{42}[AEIMQUYcgkosw048]$/.test(options.apiToken) &&
      /^[A-Za-z0-9_-]{21}[AQgw]$/.test(options.installationId);
  }
  async function bounded(promise) {
    let timer;
    try {
      return await Promise.race([promise, new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error('bridge_timeout')), 12_000);
      })]);
    } finally { clearTimeout(timer); }
  }
  async function readOptions(bridge) {
    const options = await bounded(bridge.options.get());
    if (!options || typeof options !== 'object' || Array.isArray(options)) throw new Error('invalid_options');
    return options;
  }

  async function launch(allowSetup = false) {
    if (running) return;
    running = true;
    retry.hidden = true;
    setup.hidden = true;
    let failure = 'The Magpie page bridge did not answer. Reopen this page from Magpie WebUI, then try again.';
    try {
      const bridge = window.magpie;
      if (!bridge || window.parent === window) throw new Error('no_bridge');
      status.textContent = 'Connecting to the Magpie page bridge…';
      await bounded(bridge.ready);
      // Only the launcher resolves this URL. Never re-resolve hello.service
      // after navigation: it is relative to this original package document.
      failure = 'This Magpie does not provide the required WebUI service proxy. Open a supported Magpie WebUI; a browser-localhost or desktop fallback is intentionally not used.';
      const root = location.pathname.match(/^(.*\/_magpie\/plugin\/[^/]+\/)/);
      if (!bridge.service || !root) throw new Error('no_service');
      const target = new URL(bridge.service, location.href);
      const expected = new URL(`${root[1]}_magpie/service/`, location.href);
      if (!['http:', 'https:'].includes(target.protocol) || target.href !== expected.href) throw new Error('invalid_service');

      failure = 'Plugin setup could not be saved. Reopen the page and retry. If apiToken or installationId was edited manually, remove both options in Magpie settings before setting up again. Existing credentials are never silently replaced.';
      let options = await readOptions(bridge);
      if (!provisioned(options)) {
        if (options.apiToken != null || options.installationId != null) throw new Error('invalid_options');
        if (!allowSetup) {
          status.textContent = 'Set up a private API token for this plugin. It is saved only in Magpie’s plugin options, never in the page URL or browser storage. This starts a read-only loopback service; routing settings are not changed.';
          setup.hidden = false;
          return;
        }
        status.textContent = 'Saving secure access in Magpie…';
        // Read immediately before the write so an already-provisioned tab wins.
        // Magpie also rate-limits writes per plugin. Never repeatedly set options
        // or generate a new pair on a failed/throttled write.
        options = await readOptions(bridge);
        if (!provisioned(options)) {
          if (options.apiToken != null || options.installationId != null) throw new Error('invalid_options');
          try {
            await bounded(bridge.options.set({ ...options, installationId: randomKey(16), apiToken: randomKey(32) }));
          } catch { /* A concurrent first-use tab may have saved the authoritative pair. */ }
          options = await readOptions(bridge);
          if (!provisioned(options)) {
            await new Promise(resolve => setTimeout(resolve, 1100));
            options = await readOptions(bridge);
          }
          if (!provisioned(options)) throw new Error('setup_failed');
        }
      }
      // A hosted-plugin option write restarts its host. Provision before navigating;
      // the proxy waits for the new host. The service reacquires options in memory.
      options = null;
      status.textContent = 'Opening Session Routing…';
      location.replace(target.href);
    } catch {
      status.textContent = failure;
      retry.hidden = false;
    } finally { running = false; }
  }
  retry.addEventListener('click', () => launch());
  setup.addEventListener('click', () => launch(true));
  launch();
})();

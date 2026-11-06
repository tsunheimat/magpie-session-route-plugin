import { request as httpRequest } from 'node:http';
import { randomBytes } from 'node:crypto';
import { createConfig, inspectInstallation, createInstallationAuthorizer } from './config.mjs';
import { createServer, verifyOwnershipProof } from './server.mjs';

export const STANDBY_MS = 11 * 60 * 1000;
const services = new Set();
const MESSAGES = Object.freeze({
  installation_revoked: 'Session Routing is disabled, removed, or its saved options changed. Reopen the plugin page.',
  port_conflict: 'Session Routing could not verify the service occupying its port. Choose a free plugin port; no process was stopped.',
  standby_expired: 'Session Routing waited for its previous host to finish. Reopen the page or choose a free plugin port.',
  startup_failed: 'Session Routing could not start its local service. Check the plugin options and restart the plugin.',
  stopped: 'Session Routing stopped.',
});

export class ServiceError extends Error {
  constructor(code) {
    super(MESSAGES[code] ?? MESSAGES.startup_failed);
    this.name = 'ServiceError';
    this.code = Object.hasOwn(MESSAGES, code) ? code : 'startup_failed';
    this.plain = true;
  }
}

// The only data sent to an occupied port is a fresh random challenge. Never
// send a bearer token, installation ID, session selection, or a browser URL.
export function probeOwnership(config, { signal, timeoutMs = 1000, request = httpRequest } = {}) {
  if (signal?.aborted) return Promise.resolve('unknown');
  const nonce = randomBytes(32).toString('base64url');
  return new Promise((resolve) => {
    let req;
    let timer;
    let settled = false;
    const abort = () => finish('unknown');
    function finish(result) {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      signal?.removeEventListener('abort', abort);
      req?.destroy();
      resolve(result);
    }
    signal?.addEventListener('abort', abort, { once: true });
    timer = setTimeout(abort, timeoutMs);
    timer.unref?.();
    try {
      req = request({ hostname: '127.0.0.1', port: config.port, method: 'GET',
        path: `/ownership?nonce=${nonce}`, agent: false, maxHeaderSize: 4096,
        headers: { Host: `127.0.0.1:${config.port}`, Accept: 'application/json' } }, (res) => {
        if (res.statusCode !== 200) { res.destroy(); finish('unknown'); return; }
        let size = 0;
        const chunks = [];
        res.on('error', () => finish('unknown'));
        res.on('aborted', () => finish('unknown'));
        res.on('data', (chunk) => {
          size += chunk.length;
          if (size > 2048) { res.destroy(); finish('unknown'); }
          else chunks.push(chunk);
        });
        res.on('end', () => {
          try {
            const payload = JSON.parse(Buffer.concat(chunks).toString('utf8'));
            finish(verifyOwnershipProof(config, nonce, payload) ? 'owned' : 'unknown');
          } catch { finish('unknown'); }
        });
      });
      req.on('error', (error) => finish(error.code === 'ECONNREFUSED' ? 'vacant' : 'unknown'));
      req.end();
    } catch { finish('unknown'); }
  });
}

function wait(ms, signal) {
  return new Promise((resolve) => {
    if (signal.aborted) { resolve(); return; }
    const done = () => { clearTimeout(timer); signal.removeEventListener('abort', done); resolve(); };
    const timer = setTimeout(done, ms);
    timer.unref?.();
    signal.addEventListener('abort', done, { once: true });
  });
}

async function factories(deps) {
  // Lazy imports also keep an unprovisioned installation completely inert.
  const [aggregator, gateway, collector, history] = await Promise.all([
    deps.createAggregator ?? import('./aggregator.mjs').then((mod) => mod.createAggregator),
    deps.createGateway ?? import('./gateway.mjs').then((mod) => mod.createGateway),
    deps.createCollector ?? import('./collector.mjs').then((mod) => mod.createCollector),
    deps.createHistory ?? import('./history.mjs').then((mod) => mod.createHistory),
  ]);
  return { aggregator, gateway, collector, history };
}

function inactive() {
  return Object.freeze({ status: 'unprovisioned', error: null, collectorEligible: false,
    address: () => null, ready: Promise.resolve(false), stop: async () => {} });
}

async function boot(config, deps, removed, predecessors) {
  const lifetime = new AbortController();
  const readOptions = { read: deps.readConfig, signal: lifetime.signal };
  const installation = await inspectInstallation(config, readOptions);
  if (!installation) throw new ServiceError('installation_revoked');
  const savedAuthorization = createInstallationAuthorizer(config, { ...readOptions, installation });
  const collectorEligible = config.port === installation.port;
  const clock = deps.clock ?? Date.now;
  const pause = deps.wait ?? wait;
  const standbyMs = deps.standbyMs ?? STANDBY_MS;
  const retryMs = deps.retryMs ?? 1000;
  const conflictGraceMs = deps.conflictGraceMs ?? 2000;
  const watchdogMs = deps.watchdogMs ?? 1000;
  let status = 'starting';
  let error = null;
  let server;
  let aggregator;
  let collector;
  let history;
  let watchdog;
  let stopping;
  let background;
  let readyResolve;
  let readyReject;
  const ready = new Promise((resolve, reject) => { readyResolve = resolve; readyReject = reject; });
  ready.catch(() => {}); // A host need not subscribe to a background takeover.
  const authorizationReads = new Set();
  function authorize() {
    if (lifetime.signal.aborted) return Promise.resolve(false);
    const pending = savedAuthorization().then((allowed) => allowed && !lifetime.signal.aborted);
    authorizationReads.add(pending);
    pending.finally(() => authorizationReads.delete(pending)).catch(() => {});
    return pending;
  }

  const handle = Object.freeze({
    get status() { return status; },
    get error() { return error; },
    collectorEligible, ready,
    address: () => server?.address() ?? null,
    stop: () => stop('stopped'),
  });

  function stop(reason = 'stopped') {
    if (stopping) return stopping;
    status = reason === 'installation_revoked' ? 'revoked' : reason === 'stopped' ? 'stopped' : 'failed';
    error = reason === 'stopped' ? null : new ServiceError(reason);
    lifetime.abort();
    clearTimeout(watchdog);
    server?.revoke?.();
    readyReject(error ?? new ServiceError('stopped'));
    stopping = (async () => {
      // Keep the exclusive listener until our collector has aborted and joined.
      // Releasing it first would let a replacement start a second trace poll.
      await Promise.allSettled([
        ...authorizationReads,
        Promise.resolve().then(() => collector?.stop()),
        Promise.resolve().then(() => history?.stop()),
      ]);
      try { history?.clear(); } catch { /* no sensitive diagnostics */ }
      try { aggregator?.clear(); } catch { /* no sensitive diagnostics */ }
      await server?.stop();
      removed();
    })();
    return stopping;
  }

  function watch() {
    if (lifetime.signal.aborted) return;
    watchdog = setTimeout(async () => {
      try {
        if (!await authorize()) { await stop('installation_revoked'); return; }
      } catch { await stop('installation_revoked'); return; }
      watch();
    }, watchdogMs);
    watchdog.unref?.();
  }

  async function bind() {
    let conflictDeadline = null;
    let conflictRetries = 0;
    while (!lifetime.signal.aborted) {
      if (!await authorize()) throw new ServiceError('installation_revoked');
      try {
        await server.listen();
      } catch (failure) {
        if (lifetime.signal.aborted) throw new ServiceError('stopped');
        if (failure?.code !== 'EADDRINUSE') throw new ServiceError('startup_failed');
        if (conflictDeadline === null) {
          const owner = await (deps.probeOwnership ?? probeOwnership)(config,
            { signal: lifetime.signal, timeoutMs: deps.ownershipTimeoutMs ?? 1000 });
          if (lifetime.signal.aborted) throw new ServiceError('stopped');
          if (owner === 'owned' || owner === 'vacant') return false;
          // Rotation can make the old host's proof unrecognizable. Its probe
          // also checks saved authorization and may trigger its own shutdown.
          // Do not trust, signal, or probe it again: only retry exclusive bind
          // briefly. An unrelated owner stays untouched and fails boundedly.
          conflictDeadline = clock() + conflictGraceMs;
        }
        const remaining = conflictDeadline - clock();
        if (remaining <= 0 || conflictRetries >= 20) throw new ServiceError('port_conflict');
        conflictRetries += 1;
        await pause(Math.min(retryMs, 100, remaining), lifetime.signal);
        if (clock() > conflictDeadline) throw new ServiceError('port_conflict');
        continue;
      }
      if (!await authorize()) throw new ServiceError('installation_revoked');
      status = collectorEligible ? 'serving' : 'remapped';
      readyResolve(true);
      return true;
    }
    throw new ServiceError('stopped');
  }

  async function standby() {
    const deadline = clock() + standbyMs;
    while (!lifetime.signal.aborted) {
      const remaining = deadline - clock();
      if (remaining <= 0) throw new ServiceError('standby_expired');
      await pause(Math.min(retryMs, remaining), lifetime.signal);
      if (lifetime.signal.aborted) return;
      if (clock() >= deadline) throw new ServiceError('standby_expired');
      if (await bind()) return;
    }
  }

  try {
    // The saved canonical port, not merely an effective-port map key, defines
    // the single collector. Only validated canonical replacements may retire
    // canonical owners on another port; temporary CLI services remain inert.
    for (const previous of predecessors) {
      if (previous.port !== config.port && !collectorEligible) continue;
      let handle;
      try { handle = await previous.promise; } catch { continue; } // failed startup already cleaned up
      if (previous.port === config.port || handle.collectorEligible) await handle.stop();
    }
    const make = await factories(deps);
    aggregator = make.aggregator({ showFolders: config.showFolders });
    const gateway = make.gateway({ address: config.gatewayAddress });
    collector = make.collector({ gateway, aggregator });
    history = make.history({ gateway, aggregator });
    server = (deps.createServer ?? createServer)({ config, aggregator, history,
      authorizeInstallation: authorize,
      startCollector: async () => {
        if (!collectorEligible) return false;
        if (!await authorize()) { void stop('installation_revoked'); return false; }
        collector.start();
        return true;
      },
      stop: (reason) => stop(reason === 'revoked' ? 'installation_revoked' : 'startup_failed'),
    });
    if (!await bind()) {
      status = 'standby';
      background = standby().catch((failure) => stop(failure instanceof ServiceError ? failure.code : 'startup_failed'));
      background.catch(() => {});
    }
    watch();
    return handle;
  } catch (failure) {
    const safe = failure instanceof ServiceError ? failure : new ServiceError('startup_failed');
    await stop(safe.code);
    throw safe;
  }
}

export function startService(input, options, deps = {}) {
  let config;
  try { config = createConfig(input, options, { env: deps.env ?? process.env }); }
  catch (error) { return Promise.reject(error); }
  if (!config.provisioned) return Promise.resolve(inactive());
  // Effective ports remain distinct so CLI hosts never replace a page host.
  // A saved canonical-port change additionally joins prior canonical owners
  // of this installation, after inspecting the new saved options in boot().
  const installationKey = JSON.stringify([config.directory, config.installationId]);
  const key = JSON.stringify([config.directory, config.installationId, config.port]);
  const fingerprint = JSON.stringify([config.apiToken, config.showFolders, config.gatewayAddress]);
  const previous = [...services].findLast((record) => record.key === key);
  if (previous?.fingerprint === fingerprint) return previous.promise;
  // Capture only older initializations: awaiting newer ones could form a cycle.
  // Keep each record until its own cleanup finishes, even if another startup
  // for that port fails validation before it can retire the current owner.
  const predecessors = [...services].filter((record) => record.installationKey === installationKey);
  const record = { key, installationKey, port: config.port, fingerprint, promise: null };
  const removed = () => services.delete(record);
  record.promise = boot(config, deps, removed, predecessors);
  services.add(record);
  record.promise.catch(removed);
  return record.promise;
}

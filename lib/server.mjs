import { createServer as httpServer } from 'node:http';
import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { API_VERSION, ApiError, DEFAULT_LIMITS, boundedInteger, parseScope } from './contracts.mjs';
import { canonicalSecret } from './config.mjs';

// Build once from the packaged, deterministic allowlist, never from a request or
// directory walk. Source snapshots and comparison fixtures are not public assets.
const nativeFiles = JSON.parse(readFileSync(new URL('../ui/vendor/magpie/static-manifest.json', import.meta.url), 'utf8')).files;
const nativeAssets = Object.create(null);
const nativeTypes = { js: 'text/javascript; charset=utf-8', css: 'text/css; charset=utf-8',
  svg: 'image/svg+xml', png: 'image/png' };
if (!Array.isArray(nativeFiles) || nativeFiles.length > 256) throw new Error('Invalid native asset manifest.');
for (const file of nativeFiles) {
  if (typeof file !== 'string' || !/^vendor\/magpie\/(?:(?:client|native-helpers)\.js|(?:app|routing)\.css|LICENSE|THIRD_PARTY_NOTICES|LOBE_ICONS_LICENSE|icons\/[a-zA-Z0-9_-]+\.(?:svg|png))$/u.test(file) ||
      Object.hasOwn(nativeAssets, `/${file}`)) throw new Error('Invalid native asset manifest.');
  nativeAssets[`/${file}`] = [file, nativeTypes[file.split('.').at(-1)] || 'text/plain; charset=utf-8'];
}
const ASSETS = Object.freeze({
  ...nativeAssets,
  '/': ['index.html', 'text/html; charset=utf-8'],
  '/index.html': ['index.html', 'text/html; charset=utf-8'],
  '/app.js': ['app.js', 'text/javascript; charset=utf-8'],
  '/bridge.js': ['bridge.js', 'text/javascript; charset=utf-8'],
  '/style.css': ['style.css', 'text/css; charset=utf-8'],
});
const API_PATHS = new Set(['/api/state', '/api/sessions', '/api/history', '/api/native-routing']);
// Native inline style attributes carry measured geometry and agent colors; only
// attributes are allowed, not inline style elements. The original CSS uses data
// SVG masks (app.css --x-mark and toggle marks). Scripts remain local and strict.
const CSP = "default-src 'none'; script-src 'self'; style-src 'self'; style-src-attr 'unsafe-inline'; connect-src 'self'; img-src 'self' data:; base-uri 'none'; form-action 'none'; object-src 'none'; sandbox allow-scripts";
const ERRORS = Object.freeze({
  invalid_request: [400, 'Invalid request.'],
  invalid_query: [400, 'Invalid query parameters.'],
  invalid_scope: [400, 'Invalid period or child-traffic selection.'],
  invalid_session: [400, 'Invalid session selection.'],
  unauthorized: [401, 'Authentication required.'],
  forbidden: [403, 'Request not permitted.'],
  installation_revoked: [403, 'This plugin installation is no longer authorized. Reopen the plugin page.'],
  not_found: [404, 'Not found.'],
  method_not_allowed: [405, 'Method not allowed.'],
  history_expired: [409, 'History snapshot expired. Refresh the selected period.'],
  session_expired: [410, 'The selected session is no longer available. Select another session.'],
  too_many_requests: [429, 'Too many requests. Try again shortly.'],
  invalid_history: [400, 'Invalid usage period or pagination.'],
  invalid_offset: [400, 'History offset exceeds this snapshot.'],
  history_unavailable: [503, 'Usage history is unavailable. Try again after reconnecting.'],
  history_timeout: [504, 'Usage history scan timed out.'],
  gateway_unavailable: [502, 'Cannot reach the local Magpie gateway.'],
  gateway_timeout: [502, 'The local Magpie gateway timed out.'],
  gateway_denied: [502, 'Magpie denied local telemetry access.'],
  gateway_incompatible: [502, 'This gateway does not provide the required Magpie telemetry APIs.'],
  gateway_malformed: [502, 'Magpie returned malformed telemetry.'],
  payload_limit: [502, 'Magpie telemetry exceeds the supported payload limit.'],
  unavailable: [503, 'Service temporarily unavailable. Try again shortly.'],
});

function fail(code) {
  const [status, message] = ERRORS[code];
  return new ApiError(status, code, message);
}

function equalSecret(left, right) {
  const digest = (text) => createHash('sha256').update(text).digest();
  return timingSafeEqual(digest(left), digest(right));
}

export function ownershipProof(config, nonce) {
  return createHmac('sha256', config.apiToken)
    .update(`magpie-session-routing:owner:v1\n${config.installationId}\n${nonce}`)
    .digest('base64url');
}

export function verifyOwnershipProof(config, nonce, payload) {
  return !!payload && payload.apiVersion === API_VERSION && canonicalSecret(payload.proof, 32) &&
    equalSecret(ownershipProof(config, nonce), payload.proof);
}

function headers(response, origin) {
  response.setHeader('Cache-Control', 'no-store');
  response.setHeader('Content-Security-Policy', CSP);
  response.setHeader('Referrer-Policy', 'no-referrer');
  response.setHeader('X-Content-Type-Options', 'nosniff');
  response.setHeader('Vary', 'Origin');
  if (origin === 'null') response.setHeader('Access-Control-Allow-Origin', 'null');
}

function singleHeaders(request) {
  const counts = new Map();
  for (let i = 0; i < request.rawHeaders.length; i += 2) {
    const key = request.rawHeaders[i].toLowerCase();
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  if (request.rawHeaders.length > 128 || ['host', 'origin', 'authorization', 'content-length',
    'access-control-request-method', 'access-control-request-headers'].some((key) => (counts.get(key) ?? 0) > 1)) {
    throw fail('invalid_request');
  }
}

function requestTarget(request) {
  const raw = request.url;
  if (typeof raw !== 'string' || raw.length > 8192 || !raw.startsWith('/') ||
      /[\u0000- \u007f#\\]/u.test(raw)) throw fail('invalid_request');
  const split = raw.indexOf('?');
  const path = split < 0 ? raw : raw.slice(0, split);
  const query = split < 0 ? '' : raw.slice(split + 1);
  if (query.length > 4096 || /%(?![0-9a-fA-F]{2})/u.test(query)) throw fail('invalid_query');
  // Do not normalize paths. Dot segments, encoded separators, and absolute
  // targets are never aliases for an authorized route or a local file.
  return { path, params: new URLSearchParams(query) };
}

function noQuery(params) {
  if (params.size) throw fail('invalid_query');
}

function historyOptions(params) {
  const snapshotId = params.get('snapshot');
  if (snapshotId !== null && !/^[A-Za-z0-9_-]{1,128}$/u.test(snapshotId)) throw fail('invalid_query');
  return {
    offset: boundedInteger(params.get('offset'), 0, 0, DEFAULT_LIMITS.historyRows, 'offset'),
    limit: boundedInteger(params.get('limit'), 100, 1, DEFAULT_LIMITS.historyPageSize, 'limit'),
    snapshotId,
  };
}

function abortable(work, signal) {
  return new Promise((resolve, reject) => {
    const abort = () => reject(fail('unavailable'));
    // work may already exist (and reject) when cancellation wins. Attach both
    // handlers even for an already-aborted signal; never orphan that promise.
    if (signal.aborted) abort();
    else signal.addEventListener('abort', abort, { once: true });
    Promise.resolve(work).then(
      (value) => { signal.removeEventListener('abort', abort); resolve(value); },
      (error) => { signal.removeEventListener('abort', abort); reject(error); },
    );
  });
}

async function loadAsset(name) {
  const data = await readFile(new URL(`../ui/${name}`, import.meta.url));
  // The pinned helpers include the original translations (~2.7 MiB). All names
  // still come from ASSETS and the response has its separate byte budget.
  if (data.length > 4 * 1024 * 1024) throw fail('unavailable');
  return data;
}

export function createServer({ config, aggregator, history, startCollector = () => {},
  authorizeInstallation = async () => false, stop: onRevoke,
  loadStatic = loadAsset, createHttpServer = httpServer, requestTimeoutMs = 25_000,
  responseDrainMs = 1000, maxConcurrent = 32, maxResponseBytes = DEFAULT_LIMITS.responseBytes } = {}) {
  if (!config?.provisioned || config.host !== '127.0.0.1' ||
      !Number.isInteger(config.port) || config.port < 1 || config.port > 65535 ||
      !canonicalSecret(config.apiToken, 32) || !canonicalSecret(config.installationId, 16)) {
    throw new Error('Invalid service configuration.');
  }
  let closed = false;
  let bound = false;
  let binding = null;
  let closing = null;
  let collectorStarting = null;
  let revoked = false;
  const controllers = new Map();
  const rejections = new Map();
  const sockets = new Set();
  const expectedHost = `127.0.0.1:${config.port}`;

  function write(response, status, data, type = 'application/json; charset=utf-8', head = false) {
    if (closed || response.destroyed || response.writableEnded) return;
    const body = Buffer.isBuffer(data) ? data : Buffer.from(data);
    if (body.length > maxResponseBytes) throw fail('unavailable');
    response.statusCode = status;
    response.setHeader('Content-Type', type);
    response.setHeader('Content-Length', body.length);
    response.end(head ? undefined : body);
  }

  function json(response, status, data) {
    write(response, status, JSON.stringify(data));
  }

  function errorResponse(response, error) {
    if (closed || response.destroyed || response.writableEnded) return;
    // Even an ApiError's message is not trusted: upstream exceptions and URLs
    // must never turn into an API's diagnostics.
    const code = error instanceof ApiError && Object.hasOwn(ERRORS, error.code) ? error.code : 'unavailable';
    const [status, message] = ERRORS[code];
    if (status === 401) response.setHeader('WWW-Authenticate', 'Bearer');
    if (status === 429) response.setHeader('Retry-After', '1');
    write(response, status, JSON.stringify({ error: { code, message } }));
    if (code === 'installation_revoked') {
      // Do not wait for shutdown from inside a request shutdown may abort.
      queueMicrotask(() => { Promise.resolve().then(() => onRevoke?.('revoked')).catch(() => {}); });
    }
  }

  async function authorize(signal) {
    if (revoked) throw fail('installation_revoked');
    let authorized = false;
    try { authorized = await abortable(authorizeInstallation(), signal); } catch { /* fail closed */ }
    if (closed || signal.aborted || !bound) throw fail('unavailable');
    if (revoked || authorized !== true) throw fail('installation_revoked');
  }

  async function ensureCollector(signal) {
    if (!collectorStarting) {
      collectorStarting = Promise.resolve().then(() => {
        if (closed || revoked || !bound) throw fail('unavailable');
        return startCollector();
      }).then((started) => {
        if (started === false) throw fail('unavailable');
      }).catch(() => {
        collectorStarting = null;
        throw fail('unavailable');
      });
    }
    await abortable(collectorStarting, signal);
  }

  function trackResponse(response, pool, timeoutMs) {
    const controller = new AbortController();
    pool.set(response, controller);
    let released = false;
    let timer;
    function release() {
      if (released) return;
      released = true;
      clearTimeout(timer);
      response.off('finish', release);
      response.off('close', release);
      pool.delete(response);
      controller.abort();
    }
    response.once('finish', release);
    response.once('close', release);
    timer = setTimeout(() => {
      controller.abort();
      // end() only queues data. An ended/partially sent response cannot be
      // replaced with an error, and may not retain its buffers indefinitely.
      if (response.writableEnded || response.headersSent) { response.destroy(); return; }
      try { errorResponse(response, fail('unavailable')); }
      catch { response.destroy(); }
      if (!released && !response.destroyed) {
        // Preserve the useful 503 for a timed-out operation, but also bound the
        // lifetime of that error's write if its peer is not reading.
        timer = setTimeout(() => response.destroy(), responseDrainMs);
        timer.unref?.();
      }
    }, timeoutMs);
    timer.unref?.();
    return controller;
  }

  async function handle(request, response) {
    headers(response);
    try {
      if (closed || !bound) { response.destroy(); return; }
      if (controllers.size >= maxConcurrent) {
        // Rejections have their own small write budget. Otherwise an attacker
        // could replace the bounded work queue with unlimited queued 429s.
        if (rejections.size >= maxConcurrent) { response.destroy(); return; }
        trackResponse(response, rejections, responseDrainMs);
        response.setHeader('Connection', 'close');
        errorResponse(response, fail('too_many_requests'));
        return;
      }
      // Count all responses, including validation errors and bodyless OPTIONS.
      const controller = trackResponse(response, controllers, requestTimeoutMs);
      singleHeaders(request);
      if (request.headers.host !== expectedHost) throw fail('forbidden');
      const origin = request.headers.origin;
      if (origin !== undefined && origin !== 'null') throw fail('forbidden');
      headers(response, origin);
      if (request.headers['transfer-encoding'] !== undefined ||
          (request.headers['content-length'] !== undefined && request.headers['content-length'] !== '0')) {
        response.setHeader('Connection', 'close');
        throw fail('invalid_request');
      }
      const { path, params } = requestTarget(request);
      const asset = Object.hasOwn(ASSETS, path) ? ASSETS[path] : null;
      const api = API_PATHS.has(path);
      const ownership = path === '/ownership';
      const health = path === '/healthz';
      if (!asset && !api && !ownership && !health) throw fail('not_found');

      if (request.method === 'OPTIONS') {
        if (!api) throw fail('method_not_allowed');
        if (origin !== 'null' || request.headers['access-control-request-method'] !== 'GET') throw fail('forbidden');
        const requested = request.headers['access-control-request-headers'];
        if (typeof requested !== 'string' || requested.toLowerCase().trim() !== 'authorization') throw fail('forbidden');
        if (path === '/api/native-routing') noQuery(params);
        else parseScope(params, { history: path === '/api/history' });
        if (path === '/api/history') historyOptions(params);
        response.setHeader('Access-Control-Allow-Methods', 'GET');
        response.setHeader('Access-Control-Allow-Headers', 'Authorization');
        response.setHeader('Vary', 'Origin, Access-Control-Request-Method, Access-Control-Request-Headers');
        write(response, 204, '');
        return;
      }
      if (request.method !== 'GET' && !(request.method === 'HEAD' && (asset || health))) {
        response.setHeader('Allow', asset || health ? 'GET, HEAD' : 'GET, OPTIONS');
        throw fail('method_not_allowed');
      }
      if (asset || health) {
        noQuery(params);
        if (health) write(response, 200, JSON.stringify({ apiVersion: API_VERSION, status: 'ready' }),
          'application/json; charset=utf-8', request.method === 'HEAD');
        else write(response, 200, await abortable(loadStatic(asset[0]), controller.signal), asset[1], request.method === 'HEAD');
        return;
      }
      if (ownership) {
        // This is a backend-only standby probe, not part of the browser bridge.
        if (origin !== undefined) throw fail('forbidden');
        if (params.size !== 1 || params.getAll('nonce').length !== 1 || !canonicalSecret(params.get('nonce'), 32)) {
          throw fail('invalid_query');
        }
        await authorize(controller.signal);
        json(response, 200, { apiVersion: API_VERSION, proof: ownershipProof(config, params.get('nonce')) });
        return;
      }
      const authorization = request.headers.authorization;
      if (typeof authorization !== 'string' || !equalSecret(authorization, `Bearer ${config.apiToken}`)) {
        throw fail('unauthorized');
      }
      const native = path === '/api/native-routing';
      if (native) noQuery(params);
      const scope = native ? null : parseScope(params, { history: path === '/api/history' });
      const paging = path === '/api/history' ? historyOptions(params) : {};
      await authorize(controller.signal);
      await ensureCollector(controller.signal);
      await authorize(controller.signal);
      const snapshot = native ? await abortable(aggregator.nativeSnapshot(), controller.signal) :
        scope.period === 'live' ? aggregator.snapshot(scope) :
          await abortable(history.snapshot(scope, { ...paging, signal: controller.signal }), controller.signal);
      // A historical scan may have crossed a disable/uninstall/token rotation.
      // Re-read authorization immediately before publishing its result.
      await authorize(controller.signal);
      if (path === '/api/sessions') {
        const { apiVersion, instanceId, generation, revision, connection, coverage, sessions, unknownRequests } = snapshot;
        json(response, 200, { apiVersion, instanceId, generation, revision, connection, coverage, sessions, unknownRequests });
      } else json(response, 200, snapshot);
    } catch (error) {
      errorResponse(response, error);
    } finally {
      // The response's finish/close owns its admission slot and deadline, not
      // this handler: its bytes may still be queued after end() returns.
      request.resume();
    }
  }

  const server = createHttpServer({ maxHeaderSize: 8192, requestTimeout: 5000,
    headersTimeout: 5000, keepAliveTimeout: 1000 }, (request, response) => {
    // This catch also covers a serialization failure, without logging raw data.
    handle(request, response).catch(() => response.destroy());
  });
  server.maxHeadersCount = 0; // raw header duplicates are checked, never truncated
  server.maxConnections = 64;
  server.setTimeout(requestTimeoutMs + 1000, (socket) => socket.destroy());
  server.on('connection', (socket) => {
    sockets.add(socket);
    socket.once('close', () => sockets.delete(socket));
    if (closed) socket.destroy();
  });
  // Parser errors have no admitted response. Close instead of creating a
  // separate, unbounded queue of raw error writes on malformed connections.
  server.on('clientError', (_error, socket) => socket.destroy());
  server.on('upgrade', (_request, socket) => socket.destroy());
  server.on('connect', (_request, socket) => socket.destroy());
  // The per-bind listener captures bind errors; unexpected later errors close
  // only this service, never the shared host process.
  server.on('error', () => {
    if (!bound) return;
    revoke();
    Promise.resolve().then(() => onRevoke ? onRevoke('server_error') : close()).catch(() => {});
  });

  function listen() {
    if (closed) return Promise.reject(fail('unavailable'));
    if (bound) return Promise.resolve();
    if (binding) return binding;
    binding = new Promise((resolve, reject) => {
      const cleanup = () => { server.off('error', failed); server.off('listening', listening); };
      const failed = (error) => { cleanup(); reject(error); };
      const listening = () => {
        cleanup();
        if (closed) { server.close(() => {}); reject(fail('unavailable')); return; }
        bound = true;
        resolve();
      };
      server.once('error', failed);
      server.once('listening', listening);
      try { server.listen({ host: '127.0.0.1', port: config.port, exclusive: true }); }
      catch (error) { failed(error); }
    }).finally(() => { binding = null; });
    return binding;
  }

  function revoke() {
    revoked = true;
    for (const controller of controllers.values()) controller.abort();
  }

  function close() {
    if (closing) return closing;
    closed = true;
    bound = false;
    for (const controller of controllers.values()) controller.abort();
    for (const response of controllers.keys()) response.destroy();
    for (const response of rejections.keys()) response.destroy();
    for (const socket of sockets) socket.destroy();
    closing = (async () => {
      // A pending bind can complete after stop; let its callback close it too.
      if (binding) await binding.catch(() => {});
      await new Promise((resolve) => { server.close(() => resolve()); server.closeAllConnections?.(); });
    })();
    return closing;
  }

  return Object.freeze({ listen, stop: close, revoke,
    address: () => bound && !closed ? server.address() : null,
    get listening() { return bound && !closed; } });
}

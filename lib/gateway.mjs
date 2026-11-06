import http from 'node:http';
import { ApiError, PERIODS } from './contracts.mjs';
import { integer, isObject, limitsOf, safeVersion } from './privacy.mjs';

export class GatewayError extends ApiError {
  constructor(code, message) { super(502, code, message); this.name = 'GatewayError'; }
}
const failure = (code = 'gateway_unavailable') => new GatewayError(code, {
  gateway_unavailable: 'Cannot reach the local Magpie gateway.',
  gateway_timeout: 'The local Magpie gateway timed out.',
  gateway_denied: 'Magpie denied local telemetry access.',
  gateway_incompatible: 'This gateway does not provide the required Magpie telemetry APIs.',
  gateway_malformed: 'Magpie returned malformed telemetry.',
  payload_limit: 'Magpie telemetry exceeds the configured payload limit.',
}[code]);

export function createGateway({ address = process.env.MAGPIE_ADDR || '127.0.0.1:3425', limits: input,
  timeoutMs = 30_000, request = http.request } = {}) {
  const limits = limitsOf(input);
  // Connect to numeric loopback only. `localhost` is resolved ourselves, never
  // through DNS. No URL, userinfo, proxy, path or redirect can change the peer.
  const match = typeof address === 'string' && /^(127\.0\.0\.1|localhost|\[::1\]):([1-9][0-9]{0,4})$/u.exec(address);
  if (!match || Number(match[2]) > 65535) throw new ApiError(400, 'invalid_gateway', 'A numeric loopback gateway address is required.');
  const hostname = match[1] === '[::1]' ? '::1' : '127.0.0.1';
  const port = Number(match[2]);
  const timeout = Number.isFinite(timeoutMs) && timeoutMs > 0 ? Math.min(timeoutMs, 60_000) : 30_000;
  function get(path, { signal, wait = false } = {}) {
    if (signal?.aborted) return Promise.reject(signal.reason ?? failure());
    return new Promise((resolve, reject) => {
      let req, response, timer, finished = false;
      const done = (error, result) => {
        if (finished) return;
        finished = true; clearTimeout(timer); signal?.removeEventListener('abort', abort);
        if (error) { response?.destroy(); req?.destroy(); reject(error); } else resolve(result);
      };
      const abort = () => done(signal.reason ?? failure());
      signal?.addEventListener('abort', abort, { once: true });
      try {
        req = request({ protocol: 'http:', hostname, port, path, method: 'GET', agent: false,
          headers: { accept: 'application/json', 'accept-encoding': 'identity' }, maxHeaderSize: 16 * 1024 }, res => {
          response = res;
          res.on('error', () => done(failure()));
          res.on('aborted', () => done(failure()));
          const status = res.statusCode;
          if (status !== 200) {
            done(failure(status === 401 || status === 403 ? 'gateway_denied' :
              status === 404 || (status >= 300 && status < 400) ? 'gateway_incompatible' : 'gateway_unavailable'));
            return;
          }
          if (!/^application\/(?:json|[a-z0-9.+-]+\+json)(?:\s*;|$)/iu.test(res.headers['content-type'] ?? '') ||
              (res.headers['content-encoding'] && res.headers['content-encoding'] !== 'identity')) {
            done(failure('gateway_malformed')); return;
          }
          if (Number(res.headers['content-length']) > limits.responseBytes) { done(failure('payload_limit')); return; }
          let size = 0;
          const chunks = [];
          res.on('data', chunk => {
            if (finished) return;
            size += chunk.length;
            if (size > limits.responseBytes) { done(failure('payload_limit')); return; }
            chunks.push(chunk);
          });
          res.on('end', () => {
            if (finished) return;
            try {
              const value = JSON.parse(Buffer.concat(chunks, size).toString('utf8'));
              if (!isObject(value)) throw new Error();
              done(null, value);
            } catch { done(failure('gateway_malformed')); }
          });
        });
        req.on('error', () => done(failure()));
        // Absolute deadline, not an idle socket timer: a trickling response must
        // not run forever. Magpie's long poll itself waits 25 seconds.
        timer = setTimeout(() => done(failure('gateway_timeout')), wait ? Math.max(30_000, timeout) : timeout);
        req.end();
      } catch { done(failure()); }
    });
  }
  return {
    async hello({ signal } = {}) {
      const result = await get('/api/hello', { signal });
      const version = safeVersion(result.version);
      if (result.name !== 'magpie' || !version) throw failure('gateway_incompatible');
      return { name: 'magpie', version };
    },
    trace({ after = 0, wait = false, signal } = {}) {
      if (integer(after) === null || typeof wait !== 'boolean') throw new ApiError(400, 'invalid_cursor', 'Invalid trace cursor.');
      const query = new URLSearchParams();
      if (after > 0) query.set('after', String(after));
      if (wait) query.set('wait', '1');
      return get(`/v1/magpie/trace${query.size ? `?${query}` : ''}`, { signal, wait });
    },
    usage({ period, offset = 0, limit = 200, signal } = {}) {
      if (!PERIODS.includes(period) || period === 'live' || integer(offset) === null || integer(limit) === null || limit < 1 || limit > 500) {
        throw new ApiError(400, 'invalid_history', 'Invalid usage period or pagination.');
      }
      const query = new URLSearchParams({ period, offset: String(offset), limit: String(limit), via: 'through', computer: 'this' });
      return get(`/v1/magpie/usage/requests?${query}`, { signal });
    },
  };
}

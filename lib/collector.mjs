import { setTimeout as delay } from 'node:timers/promises';
import { nowOf } from './privacy.mjs';

export function createCollector({ gateway, aggregator, clock, pollTimeoutMs = 30_000,
  backoffMs = 500, fullIntervalMs = 60_000 } = {}) {
  let controller = null, running = null;
  const deadline = Math.min(60_000, Math.max(30_000, Number(pollTimeoutMs) || 30_000));
  const firstBackoff = Math.min(30_000, Math.max(10, Number(backoffMs) || 500));
  const interval = Math.max(1000, Number(fullIntervalMs) || 60_000);
  async function run(signal) {
    let hello = false, full = true, lastFull = 0, backoff = firstBackoff;
    while (!signal.aborted) {
      try {
        if (!hello) {
          const info = await gateway.hello({ signal });
          if (signal.aborted) break;
          aggregator.setConnection({ status: aggregator.seq ? 'stale' : 'starting', gatewayVersion: info.version });
          hello = true;
        }
        if (nowOf(clock) - lastFull >= interval) full = true;
        const poll = new AbortController();
        const abort = () => poll.abort(signal.reason);
        signal.addEventListener('abort', abort, { once: true });
        const timer = setTimeout(() => poll.abort(Object.assign(new Error('Gateway poll timed out.'), { code: 'gateway_timeout' })), deadline);
        const before = aggregator.seq, began = nowOf(clock);
        let raw;
        try { raw = await gateway.trace({ after: full ? 0 : before, wait: !full, signal: poll.signal }); }
        finally { clearTimeout(timer); signal.removeEventListener('abort', abort); }
        if (signal.aborted) break;
        const result = aggregator.applyTrace(raw, { full });
        raw = null; // do not retain raw telemetry during a long poll or backoff
        if (result.resync) { full = true; continue; }
        if (full) lastFull = nowOf(clock);
        full = false; backoff = firstBackoff;
        // A gateway returning an immediate empty response must not become a
        // busy loop; real long polls and route bursts are not delayed.
        if (aggregator.seq === before && nowOf(clock) - began < 250) {
          await delay(250, undefined, { signal });
        }
      } catch (error) {
        if (signal.aborted) break;
        const code = ['gateway_denied', 'gateway_incompatible', 'gateway_malformed', 'gateway_timeout', 'payload_limit'].includes(error?.code)
          ? error.code : 'gateway_unavailable';
        aggregator.setConnection({ status: ['gateway_incompatible', 'gateway_malformed'].includes(code) ? 'incompatible' : 'disconnected', reason: code });
        hello = false; full = true;
        try { await delay(backoff, undefined, { signal }); } catch { break; }
        backoff = Math.min(30_000, backoff * 2);
      }
    }
  }
  return {
    start() {
      if (running) return;
      controller = new AbortController();
      running = run(controller.signal).finally(() => { running = null; controller = null; });
    },
    async stop() {
      controller?.abort();
      await running;
      aggregator.setConnection({ status: 'stopped', reason: 'collector_stopped' });
    },
  };
}

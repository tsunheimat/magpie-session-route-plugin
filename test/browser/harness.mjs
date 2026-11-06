import { createServer as httpServer, request as httpRequest } from 'node:http';
import { randomBytes } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { once } from 'node:events';
import { createServer } from '../../lib/server.mjs';
import { createAggregator } from '../../lib/aggregator.mjs';
import { createHistory } from '../../lib/history.mjs';
import { initialTrace } from '../fixtures/trace.mjs';

const PREFIX = '/_magpie/plugin/test-page-token/';
const SERVICE = `${PREFIX}_magpie/service/`;
const launcherBridge = `(() => {
  const waiting = new Map(); let next = 0;
  function call(method, params) { const id=++next; return new Promise((resolve,reject)=>{
    waiting.set(id,{resolve,reject}); parent.postMessage({magpie:1,id,method,params},'*'); }); }
  addEventListener('message',e=>{if(e.source!==parent || e.data?.magpie!==1)return;
    const w=waiting.get(e.data.id); if(!w)return; waiting.delete(e.data.id);
    e.data.error?w.reject(new Error('bridge refused')):w.resolve(e.data.result); });
  const api={options:{get:()=>call('options.get'),set:options=>call('options.set',{options})},service:''};
  api.ready=call('hello').then(r=>{api.service=r.service?new URL(r.service,location.href).href:''; return r;});
  window.magpie=api;
})();`;

const hostScript = `(() => {
  const frame = document.querySelector('iframe'); let dark=false;
  window.testTheme = value => {dark=value; frame.contentWindow.postMessage({magpie:1,event:'theme',data:{dark,lang:'en',tokens:{}}},'*');};
  window.testVisibility = visible => frame.contentWindow.postMessage({magpie:1,event:'visibility',data:{visible}},'*');
  addEventListener('message',async event=>{
    if(event.source!==frame.contentWindow || event.data?.magpie!==1)return;
    const {id,method,params}=event.data;
    try {
      let result;
      if(method==='hello') result={dark,lang:'en',tokens:{},visible:true,service:'_magpie/service/'};
      else if(method==='options.get') result=await (await fetch('/_test/options')).json();
      else if(method==='options.set') result=await (await fetch('/_test/options',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(params.options)})).json();
      else throw new Error('Unsupported call');
      event.source.postMessage({magpie:1,id,result},'*');
    }catch{event.source.postMessage({magpie:1,id,error:'Refused'},'*');}
  });
})();`;

async function listen(server, port = 0) {
  server.listen(port, '127.0.0.1');
  await once(server, 'listening');
  return server.address().port;
}
async function freePort() {
  const server = httpServer();
  const port = await listen(server);
  await new Promise(resolve => server.close(resolve));
  return port;
}

// This is a protocol-shaped browser harness, NOT the real Magpie proxy. Real-host
// validation lives separately under test/magpie and is reported separately.
export async function browserHarness({ unprovisioned = false, fixture = initialTrace(), ledgerRows = null } = {}) {
  const servicePort = await freePort();
  let options = unprovisioned ? { port: servicePort } : {
    port: servicePort, installationId: randomBytes(16).toString('base64url'), apiToken: randomBytes(32).toString('base64url'),
  };
  const aggregator = createAggregator({ instanceId: 'browser-fixture' });
  let replacement = null;
  const projection = { snapshot: scope => (replacement || aggregator).snapshot(scope) };
  aggregator.applyTrace(fixture, { full: true });
  aggregator.setConnection({ status: 'live', gatewayVersion: '0.1.3124' });
  let service;
  let collectorStarts = 0;
  let delaySession = null;
  let delayMs = 0;
  const pendingTimers = new Set();
  const observations = [];
  const sockets = new Set();
  const history = ledgerRows ? createHistory({ aggregator, gateway: {
    async usage({ period, offset, limit }) {
      return { period, offset, total: ledgerRows.length, rows: ledgerRows.slice(offset, offset + limit) };
    },
  } }) : {
    async snapshot(scope) {
      const live = aggregator.snapshot({ ...scope, period: 'live' });
      return { ...live, scope,
        coverage: { source: 'ledger', period: scope.period, label: `Usage ledger (${scope.period})`, partial: true,
          reasons: ['Browser fixture: partial usage history'], scanned: live.requests.length, available: 100 },
        requests: live.requests.map(row => ({ ...row, candidates: [], attempts: [], retries: null, fallbacks: null,
          partial: true, reasons: ['Routing attempt history unavailable'] })),
        metrics: { ...live.metrics, retries: null, fallbacks: null, cost: null, partial: true },
        pagination: { snapshotId: 'fixture1', offset: 0, limit: 100, total: live.requests.length, nextOffset: null },
      };
    },
  };
  async function ensureService() {
    if (service) return;
    const config = { ...options, showFolders: false, host: '127.0.0.1', provisioned: true };
    service = createServer({ config, aggregator: projection, history,
      startCollector() { collectorStarts++; },
      authorizeInstallation: async () => options.apiToken === config.apiToken,
    });
    await service.listen();
  }
  if (!unprovisioned) await ensureService();
  let origin;
  const host = httpServer(async (req, res) => {
    try {
      if (req.url === '/') {
        res.setHeader('Content-Type', 'text/html');
        res.end(`<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><title>Plugin test host</title><script src="/host.js" defer></script><style>html,body{margin:0;height:100%;}iframe{border:0;width:100%;height:100%;display:block;}</style></head><body><iframe title="Session Routing" sandbox="allow-scripts" referrerpolicy="no-referrer" src="${PREFIX}index.html"></iframe></body></html>`);
        return;
      }
      if (req.url === '/host.js') { res.setHeader('Content-Type', 'text/javascript'); res.end(hostScript); return; }
      if (req.url === '/favicon.ico') { res.writeHead(204); res.end(); return; }
      if (req.url === '/_test/options') {
        if (req.method === 'POST') {
          let bytes = ''; for await (const chunk of req) { bytes += chunk; if (bytes.length > 4096) throw new Error('too large'); }
          options = JSON.parse(bytes);
          await ensureService();
        }
        res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify(options)); return;
      }
      if (req.url.startsWith(SERVICE)) {
        if (req.headers.origin !== undefined && req.headers.origin !== 'null') { res.writeHead(403); res.end(); return; }
        const url = new URL(req.url, origin);
        observations.push({ path: url.pathname.slice(SERVICE.length), method: req.method, origin: req.headers.origin ?? null,
          authorization: !!req.headers.authorization });
        const proxy = () => {
          if (res.destroyed) return;
          const headers = { ...req.headers, host: `127.0.0.1:${servicePort}` };
          delete headers.cookie;
          const upstream = httpRequest({ hostname: '127.0.0.1', port: servicePort, method: req.method,
            path: req.url.slice(SERVICE.length - 1), headers }, reply => {
            const outgoing = { ...reply.headers };
            delete outgoing['set-cookie'];
            const self = `${origin}${SERVICE}`;
            if (outgoing['content-security-policy']) outgoing['content-security-policy'] = outgoing['content-security-policy'].replaceAll("'self'", `'self' ${self}`);
            outgoing['referrer-policy'] = 'no-referrer';
            res.writeHead(reply.statusCode, outgoing);
            reply.pipe(res);
          });
          upstream.on('error', () => { if (!res.headersSent) res.writeHead(502); res.end('Fixture service unavailable'); });
          res.on('close', () => upstream.destroy());
          req.pipe(upstream);
        };
        if (url.pathname.endsWith('/api/state') && url.searchParams.get('session') === delaySession && delayMs) {
          const timer = setTimeout(() => { pendingTimers.delete(timer); proxy(); }, delayMs);
          pendingTimers.add(timer);
        } else proxy();
        return;
      }
      const allowed = new Map([
        [`${PREFIX}index.html`, ['index.html', 'text/html']],
        [`${PREFIX}boot.js`, ['boot.js', 'text/javascript']],
        [`${PREFIX}icon.svg`, ['icon.svg', 'image/svg+xml']],
      ]);
      if (req.url === `${PREFIX}_magpie/bridge.js`) {
        res.setHeader('Content-Type', 'text/javascript'); res.end(launcherBridge); return;
      }
      const asset = allowed.get(req.url);
      if (asset) {
        res.setHeader('Content-Type', asset[1]);
        res.setHeader('Content-Security-Policy', `sandbox allow-scripts; default-src 'none'; script-src ${origin}${PREFIX}; style-src 'unsafe-inline'; img-src ${origin}${PREFIX}; connect-src 'none'; frame-src 'none'; base-uri 'none'; form-action 'none'`);
        res.setHeader('Referrer-Policy', 'no-referrer');
        res.end(await readFile(new URL(`../../page/${asset[0]}`, import.meta.url)));
        return;
      }
      res.writeHead(404); res.end();
    } catch {
      if (!res.headersSent) res.writeHead(500);
      res.end('Fixture error');
    }
  });
  host.on('connection', socket => { sockets.add(socket); socket.on('close', () => sockets.delete(socket)); });
  const port = await listen(host);
  origin = `http://127.0.0.1:${port}`;
  return {
    url: origin, aggregator, observations,
    get collectorStarts() { return collectorStarts; },
    get options() { return options; },
    delay(session, ms) { delaySession = session; delayMs = ms; },
    replaceProjection(next) { replacement = next; },
    async close() {
      for (const timer of pendingTimers) clearTimeout(timer);
      for (const socket of sockets) socket.destroy();
      await new Promise(resolve => host.close(resolve));
      await service?.stop();
      await history.stop?.();
    },
  };
}

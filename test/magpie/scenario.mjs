// This entrypoint deliberately refuses execution outside run.mjs's namespace.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer, request as httpRequest } from 'node:http';
import { randomBytes, createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';
import { assertContained } from './sandbox.mjs';

const root = fileURLToPath(new URL('../../', import.meta.url));
const run = process.env.MAGPIE_TEST_RUN;
const checks = [];
const processes = new Set();
const pending = new Set();
const servers = new Set();
const secrets = [];
let log = '';
let phase = 'containment';
let result = { status: 'failed', checks };
const redact = value => secrets.reduce((text, secret) => text.replaceAll(secret, '[redacted]'), String(value))
  .replace(/\/?\?k=[^\s\x1b]+/g, '/?k=[redacted]')
  .replace(/\/_magpie\/plugin\/[^/\s]+/g, '/_magpie/plugin/[redacted]');
function record(name, detail = true) { checks.push({ name, detail }); console.log(`PASS ${name}`); }
function launch(args, { oneShot = false } = {}) {
  const child = spawn(process.env.MAGPIE_BIN, args, { cwd: join(run, 'work'), env: process.env,
    detached: true, stdio: ['ignore', 'pipe', 'pipe'] });
  processes.add(child);
  let output = '';
  child.stdout.on('data', bytes => { output = (output + redact(bytes)).slice(-256_000); log = (log + redact(bytes)).slice(-512_000); });
  child.stderr.on('data', bytes => { output = (output + redact(bytes)).slice(-256_000); log = (log + redact(bytes)).slice(-512_000); });
  child.done = new Promise((resolveExit, reject) => {
    child.once('error', reject);
    child.once('exit', (code, signal) => { processes.delete(child); resolveExit({ code, signal, output }); });
  });
  child.done.catch(() => {});
  if (!oneShot) return child;
  return (async () => {
    const timer = setTimeout(() => child.kill('SIGTERM'), 25_000);
    try {
      const ended = await child.done;
      assert.equal(ended.code, 0, `CLI ${args.slice(0, 2).join(' ')} failed: ${ended.output}`);
      return ended.output;
    } finally { clearTimeout(timer); }
  })();
}
async function stop(child) {
  if (!processes.has(child)) return;
  // Only a process group created by this launch(), never name/port-wide kills.
  try { process.kill(-child.pid, 'SIGTERM'); } catch (error) { if (error.code !== 'ESRCH') throw error; }
  const timer = setTimeout(() => { try { process.kill(-child.pid, 'SIGKILL'); } catch { /* already exited */ } }, 2500);
  try { await child.done; } finally { clearTimeout(timer); }
}
async function until(label, get, accepts, timeout = 15_000) {
  const end = Date.now() + timeout;
  let last;
  while (Date.now() < end) {
    try { last = await get(); if (accepts(last)) return last; } catch (error) { last = error.message; }
    await delay(150);
  }
  throw new Error(`${label} timed out; last result: ${redact(JSON.stringify(last)).slice(0, 1200)}`);
}
async function listen(handler) {
  const server = createServer(handler);
  await new Promise((resolveReady, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolveReady); });
  servers.add(server);
  return server;
}
const baseOf = server => `http://127.0.0.1:${server.address().port}`;
async function request(url, options = {}) {
  assert.equal(new URL(url).hostname, '127.0.0.1', 'Test requests are loopback-only');
  const response = await fetch(url, { ...options, redirect: 'error', signal: options.signal ?? AbortSignal.timeout(8000) });
  const text = await response.text();
  let body;
  try { body = JSON.parse(text); } catch { body = text; }
  return { status: response.status, body, headers: Object.fromEntries(response.headers) };
}
const keyOf = (agent, session) => Buffer.from(JSON.stringify([agent, session])).toString('base64url');
const json = value => JSON.stringify(value, null, 2) + '\n';

try {
  const containment = await assertContained();
  result.containment = containment;
  record('external egress blocked before any Magpie process');
  if (process.argv.includes('--probe')) {
    result.status = 'passed';
  } else {
    phase = 'runtime versions';
    const versionChild = spawn(process.env.MAGPIE_BUN, ['--version'], { cwd: join(run, 'work'), env: process.env });
    let bunVersion = '';
    versionChild.stdout.on('data', data => { bunVersion += data; });
    await new Promise((resolveVersion, reject) => { versionChild.once('error', reject); versionChild.once('exit', code => code === 0 ? resolveVersion() : reject(new Error('Bun could not start'))); });
    assert.equal(bunVersion.trim(), '1.4.2', 'Use the verified Bun 1.4.2 runtime, not the remote-test shim');
    result.versions = { magpie: 'v0.1.3124', commit: '3f53fa1f316330b77e5ff6d065a7a56980cafda2', bun: bunVersion.trim(), node: process.version };
    const cfg = join(process.env.XDG_CONFIG_HOME, 'magpie');
    await mkdir(cfg, { recursive: true });
    await writeFile(join(cfg, 'settings.json'), json({ noAccountDiscovery: true, noAutoUpdate: true, requestArchive: false }));
    const webKey = randomBytes(24).toString('hex'); secrets.push(webKey);
    process.env.MAGPIE_WEB_KEY = webKey;
    process.env.MAGPIE_ADDR = '127.0.0.1:3425';
    const web = 'http://127.0.0.1:3430';
    const gateway = 'http://127.0.0.1:3425';
    const cookie = `magpie_web_3430=${webKey}`;
    const webRequest = (pathname, body) => request(web + pathname, { headers: { Cookie: cookie,
      ...(body ? { Origin: web, 'Content-Type': 'application/json' } : {}) },
      ...(body ? { method: 'POST', body: JSON.stringify(body) } : {}) });
    let held = true;
    const waiting = new Set();
    const providerHits = { limited: 0, good: 0 };
    const observedAuth = new Set();
    const good = await listen(async (incoming, response) => {
      try {
        let data = ''; for await (const bytes of incoming) { data += bytes; assert.ok(data.length < 65536); }
        assert.equal(incoming.url, '/v1/chat/completions');
        providerHits.good++;
        observedAuth.add(incoming.headers.authorization);
        await new Promise(resolveRelease => {
          if (!held) return resolveRelease();
          const release = () => { waiting.delete(release); resolveRelease(); };
          waiting.add(release); response.once('close', release);
        });
        response.writeHead(200, { 'Content-Type': 'application/json' });
        response.end(JSON.stringify({ id: `synthetic-${providerHits.good}`, object: 'chat.completion', model: 'm',
          choices: [{ index: 0, finish_reason: 'stop', message: { role: 'assistant', content: 'synthetic-local-reply' } }],
          usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 } }));
      } catch { response.writeHead(500); response.end(); }
    });
    const limited = await listen(async (incoming, response) => {
      for await (const _ of incoming) { /* drain synthetic bytes, never persist bodies */ }
      providerHits.limited++;
      response.writeHead(429, { 'Content-Type': 'application/json' });
      response.end(JSON.stringify({ error: { message: 'synthetic-private-upstream-error', type: 'rate_limit_error' } }));
    });
    const providerKey = 'synthetic-provider-key-not-real'; secrets.push(providerKey);
    const providers = { noAutoGroups: true, providers: [
      { id: 'limited', name: 'Synthetic limited', key: providerKey, models: ['m'], chat: baseOf(limited) + '/v1', patience: -1 },
      { id: 'good', name: 'Synthetic success', key: providerKey, models: ['m'], chat: baseOf(good) + '/v1', patience: -1 },
    ], groups: [{ id: 'fallback', name: 'Synthetic fallback', members: ['limited/m', 'good/m'], routing: 'order', patience: -1 }] };
    await writeFile(join(cfg, 'providers.json'), json(providers));
    const providerHash = createHash('sha256').update(await readFile(join(cfg, 'providers.json'))).digest('hex');
    phase = 'CLI installation';
    await launch(['plugin', 'add', root], { oneShot: true });
    const installed = JSON.parse(await readFile(join(cfg, 'plugins.json'), 'utf8'));
    assert.equal(installed.plugins.length, 1);
    const spec = installed.plugins[0].spec;
    record('plugin installed through the actual local-path CLI');
    let app = launch(['web', '--no-open', '--gateway', '--addr', '127.0.0.1:3430']);
    phase = 'WebUI and Bun startup';
    const pages = await until('authenticated WebUI pages', () => webRequest('/api/plugin-pages'), value =>
      value.status === 200 && Array.isArray(value.body) && value.body.some(page => page.spec === spec));
    const page = pages.body.find(page => page.spec === spec);
    assert.equal(page.title, 'Session Routing');
    assert.ok(page.service, 'Actual WebUI must advertise a service proxy');
    assert.ok(!page.replaces);
    const launcher = new URL(page.url, web);
    const service = new URL(page.service, launcher);
    assert.equal(service.origin, web);
    assert.match(launcher.pathname, /^\/_magpie\/plugin\/[^/]+\/index\.html$/,
      'Window() serves the HTML relative to its own page directory');
    const launchDocument = await request(launcher.href);
    assert.equal(launchDocument.status, 200);
    const scriptPaths = [...launchDocument.body.matchAll(/<script\b[^>]*\bsrc="([^"]+)"/g)].map(match => match[1]);
    assert(scriptPaths.includes('_magpie/bridge.js'));
    for (const scriptPath of scriptPaths) {
      const asset = await request(new URL(scriptPath, launcher).href);
      assert.equal(asset.status, 200, `Launcher asset must resolve through the actual host: ${scriptPath}`);
      assert.match(asset.headers['content-type'], /javascript/);
    }
    const token = randomBytes(32).toString('base64url'); secrets.push(token);
    const options = { port: 3496, showFolders: false, installationId: randomBytes(16).toString('base64url'), apiToken: token };
    const provisioned = await webRequest('/api/plugin-pages/options', { spec, options });
    assert.equal(provisioned.status, 200);
    assert.deepEqual(provisioned.body, options);
    const api = (suffix = 'api/state', extra = {}) => request(new URL(suffix, service).href,
      { headers: { Authorization: `Bearer ${token}`, Origin: 'null', ...extra } });
    const health = await until('real Bun service via WebUI proxy', () => request(new URL('healthz', service).href), value => value.status === 200, 30_000);
    assert.equal(health.headers['cache-control'], 'no-store');
    const document = await request(service.href);
    assert.equal(document.status, 200);
    assert.match(document.headers['content-security-policy'], /sandbox/);
    assert.ok(!JSON.stringify(document).includes(token));
    record('real Bun host serves the page through authenticated WebUI proxy');
    assert.equal((await request(new URL('api/state', service).href)).status, 401);
    assert.equal((await api('api/state', { Origin: 'https://foreign.invalid' })).status, 403);
    const rebindingStatus = await new Promise((resolveStatus, reject) => {
      // Node fetch rewrites Host; raw HTTP is required to test rebinding.
      const probe = httpRequest('http://127.0.0.1:3496/api/state', { headers: {
        Authorization: `Bearer ${token}`, Host: 'rebind.invalid:3496' } }, response => {
        response.resume(); response.once('end', () => resolveStatus(response.statusCode));
      });
      probe.setTimeout(3000, () => probe.destroy(new Error('Host probe timed out')));
      probe.once('error', reject); probe.end();
    });
    assert.equal(rebindingStatus, 403);
    record('API authentication, hostile Origin and rebinding Host rejected');
    const active = await until('collector live', () => api(), value => value.status === 200 && value.body.connection.status === 'live');
    assert.equal(active.body.requests.length, 0);
    const initialInstance = active.body.instanceId;
    const send = (session, { model = 'good/m', agent = 'claude', actor, workFolder } = {}) => {
      const headers = { 'Content-Type': 'application/json', 'User-Agent': agent === 'codex' ? 'codex_cli_rs/0.0.0' : 'claude-cli/0.0.0' };
      if (session) headers[agent === 'codex' ? 'session_id' : 'x-claude-code-session-id'] = session;
      if (actor) headers['x-claude-code-agent-id'] = actor;
      const messages = [
        ...(workFolder ? [{ role: 'system', content: `Primary working directory: ${workFolder}` }] : []),
        { role: 'user', content: 'synthetic-private-prompt' },
      ];
      const promise = request(gateway + '/v1/chat/completions', { method: 'POST', headers,
        signal: AbortSignal.timeout(60_000), body: JSON.stringify({ model, messages }) });
      pending.add(promise); promise.finally(() => pending.delete(promise)).catch(() => {});
      return promise;
    };
    phase = 'concurrent native sessions and fallback';
    const alpha = send('session-alpha', { model: 'group/fallback' });
    const bravo = send('session-bravo');
    const alpha2 = send('session-alpha');
    await until('three simultaneous requests', () => api(), value => value.body.metrics?.inFlight === 3);
    const scoped = session => api('api/state?session=' + keyOf('claude', session));
    const [a, b] = await Promise.all([scoped('session-alpha'), scoped('session-bravo')]);
    assert.equal(a.status, 200); assert.equal(b.status, 200);
    assert.equal(a.body.metrics.requests, 2); assert.equal(a.body.metrics.inFlight, 2);
    assert.equal(b.body.metrics.requests, 1); assert.equal(b.body.metrics.inFlight, 1);
    assert.ok(a.body.requests.every(route => route.session === 'session-alpha'));
    assert.ok(b.body.requests.every(route => route.session === 'session-bravo'));
    assert.deepEqual(new Set(a.body.graph.requestKeys), new Set(a.body.requests.map(route => route.key)));
    assert.deepEqual(new Set(b.body.graph.requestKeys), new Set(b.body.requests.map(route => route.key)));
    assert.equal(a.body.metrics.fallbacks, 1); assert.equal(b.body.metrics.fallbacks, 0);
    const fallback = a.body.requests.find(route => route.fallbacks === 1);
    assert.deepEqual(fallback.attempts.map(attempt => attempt.transition), ['initial', 'fallback']);
    assert.equal(fallback.attempts[0].status, 429);
    record('two native Claude sessions isolated during three simultaneous requests');
    record('actual 429-to-success fallback belongs only to Session A');
    const native = await until('native-stage projection', () => api('api/native-routing'), value =>
      value.status === 200 && value.body.routes?.length === 3);
    assert.equal(native.body.object, 'trace');
    assert.deepEqual(native.body.routes.map(r => r.session).sort(), ['session-alpha', 'session-alpha', 'session-bravo']);
    const shared = native.body.routes.filter(r => r.order.some(s => s.model === 'm'));
    const sharedIds = shared.flatMap(r => r.order.filter(s => s.model === 'm').map(s => s.id));
    assert(sharedIds.length > new Set(sharedIds).size, 'actual trace account handles are shared across requests');
    for (const secret of [token, providerKey, 'synthetic-private-prompt', 'synthetic-local-reply', 'synthetic-private-upstream-error']) {
      assert(!JSON.stringify(native.body).includes(secret), 'native stage cannot disclose private trace fields');
    }
    assert.equal((await api('api/native-routing?session=anything')).status, 400);
    assert.equal((await request(new URL('api/native-routing', service).href)).status, 401);
    assert.equal((await api('api/native-routing', { Origin: 'https://foreign.invalid' })).status, 403);
    for (const pathname of ['vendor/magpie/client.js', 'vendor/magpie/native-helpers.js', 'vendor/magpie/routing.css', 'vendor/magpie/icons/claudecode-color.svg']) {
      assert.equal((await request(new URL(pathname, service).href)).status, 200, pathname);
    }
    for (const pathname of ['vendor/magpie/upstream/app.js', 'vendor/magpie/test-only/client.baseline.js', 'vendor/magpie/source-manifest.json']) {
      assert.equal((await request(new URL(pathname, service).href)).status, 404, pathname);
    }
    assert(!document.headers['content-security-policy'].includes('allow-same-origin'));
    record('actual Bun native-stage endpoint: sanitized shared seats, fixed query, authorization and exact static surface');
    held = false; for (const release of [...waiting]) release();
    for (const response of await Promise.all([alpha, bravo, alpha2])) assert.equal(response.status, 200);
    for (const response of await Promise.all([send('session-alpha', { agent: 'codex' }), send(null)])) assert.equal(response.status, 200);
    const all = await until('five completed routes', () => api(), value => value.body.metrics?.requests === 5 && value.body.metrics.inFlight === 0);
    const codex = await api('api/state?session=' + keyOf('codex', 'session-alpha'));
    assert.equal(codex.status, 200); assert.equal(codex.body.metrics.requests, 1);
    assert.equal(codex.body.requests[0].agent, 'codex');
    assert.equal((await scoped('session-alpha')).body.metrics.requests, 2);
    const unknown = await api('api/state?session=unknown');
    assert.equal(unknown.status, 200); assert.equal(unknown.body.metrics.requests, 1);
    assert.equal(unknown.body.requests[0].sessionKey, null);
    const safeState = JSON.stringify(all.body);
    for (const secret of [token, providerKey, 'synthetic-private-prompt', 'synthetic-local-reply', 'synthetic-private-upstream-error']) {
      assert.ok(!safeState.includes(secret), 'Protected state must omit prompt, response, credentials and raw errors');
    }
    assert.equal(providerHits.good, 5); assert.equal(providerHits.limited, 1);
    assert.deepEqual([...observedAuth], [`Bearer ${providerKey}`]);
    record('same textual Claude/Codex IDs and unknown traffic stay separate');
    record('sanitized projection contains no content, credentials or upstream errors');
    phase = 'usage history';
    const history = await until('ledger rows', () => api('api/history?period=today'), value => value.status === 200 && value.body.metrics?.requests >= 5, 20_000);
    assert.equal(history.body.coverage.source, 'ledger');
    const aHistory = await api('api/history?period=today&session=' + keyOf('claude', 'session-alpha'));
    assert.equal(aHistory.status, 200); assert.equal(aHistory.body.metrics.requests, 2);
    assert.ok(aHistory.body.requests.every(route => route.agent === 'claude' && route.session === 'session-alpha'));
    record('actual usage ledger has source-labelled, isolated Today history');
    phase = 'native project and worker display evidence';
    held = true;
    const workFolder = '/synthetic/private-parent/project-visible';
    const worker = 'synthetic-worker-identity';
    const displayCalls = [send('display-session', { workFolder }),
      send('display-session', { workFolder, actor: worker }), send('display-session', { workFolder, actor: worker })];
    const display = await until('native project/actor evidence', () => api('api/native-routing'), value =>
      value.status === 200 && value.body.routes.filter(r => r.session === 'display-session').length === 3);
    const displayRows = display.body.routes.filter(r => r.session === 'display-session');
    assert(displayRows.every(r => r.projectName === 'project-visible' && r.folder === undefined));
    assert(displayRows.every(r => r.order.some(s => s.name === 'Synthetic success')), 'recorded provider display name survives');
    const workers = displayRows.filter(r => r.isSubagent);
    assert.equal(workers.length, 2); assert(workers[0].actorId); assert.equal(workers[0].actorId, workers[1].actorId);
    assert(workers.every(r => r.subagentId === undefined), 'tool-less helper identity is not promoted to a native turn tag');
    const displayText = JSON.stringify(display.body);
    assert(!displayText.includes(worker) && !displayText.includes('private-parent') && !displayText.includes('synthetic-private-prompt'));
    held = false; for (const release of [...waiting]) release();
    for (const response of await Promise.all(displayCalls)) assert.equal(response.status, 200);
    record('native project basenames, recorded provider names and tool-less actor identity without private paths');
    phase = 'disable and noninterference';
    held = true;
    const uninterrupted = send('uninterrupted');
    await until('held normal request', async () => waiting.size, value => value > 0);
    await launch(['plugin', 'off', spec], { oneShot: true });
    await until('revoked direct service', async () => {
      try { return (await request('http://127.0.0.1:3496/api/state', { headers: { Authorization: `Bearer ${token}` } })).status; }
      catch { return 'closed'; }
    }, value => value === 403 || value === 'closed');
    held = false; for (const release of [...waiting]) release();
    assert.equal((await uninterrupted).status, 200);
    assert.equal((await send('after-disable')).status, 200);
    record('CLI disable revokes sensitive data without interrupting model routing');
    phase = 'gateway restart and uninstall';
    await stop(app);
    await launch(['plugin', 'on', spec], { oneShot: true });
    app = launch(['web', '--no-open', '--gateway', '--addr', '127.0.0.1:3430']);
    const newPages = await until('restarted WebUI', () => webRequest('/api/plugin-pages'), value =>
      value.status === 200 && Array.isArray(value.body) && value.body.some(entry => entry.spec === spec));
    const newPage = newPages.body.find(entry => entry.spec === spec);
    const newService = new URL(newPage.service, new URL(newPage.url, web));
    const restarted = await until('restarted collector', () => request(new URL('api/state', newService).href,
      { headers: { Authorization: `Bearer ${token}`, Origin: 'null' } }), value => value.status === 200 && value.body.connection.status === 'live', 30_000);
    assert.notEqual(restarted.body.instanceId, initialInstance);
    assert.equal(restarted.body.metrics.inFlight, 0); assert.equal(restarted.body.requests.length, 0);
    assert.equal((await send('after-restart')).status, 200);
    await launch(['plugin', 'rm', spec], { oneShot: true });
    assert.equal((await send('after-uninstall')).status, 200);
    await until('removed page', () => webRequest('/api/plugin-pages'), value => value.status === 200 && !value.body.some(entry => entry.spec === spec));
    const afterHash = createHash('sha256').update(await readFile(join(cfg, 'providers.json'))).digest('hex');
    assert.equal(afterHash, providerHash, 'Plugin must not modify provider or routing-group configuration');
    record('whole-host restart starts with a clean collector; uninstall preserves ordinary routing');
    record('provider and group configuration unchanged');
    result.status = 'passed';
    result.providerCalls = providerHits;
    result.limitations = ['Synthetic native-header clients, not real agent processes', 'HTTP loopback proxy exercised; Docker and external HTTPS are not covered', 'Browser rendering and two-tab polling are covered separately by test:browser'];
  }
} catch (error) {
  result.error = redact(`${phase}: ${error.stack || error}`);
  console.error(result.error);
  process.exitCode = 1;
} finally {
  for (const server of servers) server.closeAllConnections();
  await Promise.allSettled([...processes].map(stop));
  await Promise.allSettled([...servers].map(server => new Promise(resolveClose => server.close(resolveClose))));
  await Promise.allSettled([...pending]);
  if (run) {
    await writeFile(join(run, 'runtime.log'), redact(log));
    await writeFile(join(run, 'result.json'), json(result));
  }
}

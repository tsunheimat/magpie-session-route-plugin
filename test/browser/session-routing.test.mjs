import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { chromium, webkit } from 'playwright';
import { browserHarness, nativeTrace } from './harness.mjs';
import { createAggregator } from '../../lib/aggregator.mjs';

const engineName = process.env.BROWSER ?? 'chromium';
const engine = { chromium, webkit }[engineName];
if (!engine) throw new Error('BROWSER must be chromium or webkit');
const shots = new URL('../../artifacts/browser/native-service/', import.meta.url);
const capturing = new WeakSet();

export function serviceFrame(page) {
  return page.frames().find(frame => frame.url().includes('/_magpie/service/'));
}
async function waitUntil(check, message) {
  const deadline = Date.now() + 10_000;
  while (!(await check())) {
    assert(Date.now() < deadline, message);
    await new Promise(resolve => setTimeout(resolve, 40));
  }
}
export async function contextFor(browser, harness, viewport = { width: 1280, height: 900 }, reducedMotion = 'reduce', init, beforeNavigate) {
  const context = await browser.newContext({ viewport, reducedMotion, hasTouch: viewport.width <= 660 });
  context.setDefaultTimeout(10_000);
  if (init) await context.addInitScript(init);
  const blocked = [], errors = [], csp = [], screenshotCsp = [];
  await context.addInitScript(() => {
    window.captureStyleTexts = [];
    new MutationObserver(records => {
      for (const record of records) for (const node of record.addedNodes) {
        if (node.nodeName === 'STYLE') window.captureStyleTexts.push(node.textContent);
      }
    }).observe(document, { subtree: true, childList: true });
  });
  await context.route('**/*', route => {
    const url = new URL(route.request().url());
    if (url.origin === harness.url) return route.continue();
    blocked.push(url.href); return route.abort();
  });
  const page = await context.newPage();
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', msg => {
    const text = msg.text();
    // Playwright's WebKit screenshot preparation injects exactly `body {}` to
    // synchronize animations (coreBundle.js inPagePrepareForScreenshots). Keep
    // production style-src strict; distinguish this verified test-only failure.
    if (engineName === 'webkit' && capturing.has(page) && text === "Refused to apply a stylesheet because its hash, its nonce, or 'unsafe-inline' does not appear in the style-src directive of the Content Security Policy.") screenshotCsp.push(text);
    else if (/Content Security Policy|violates.*policy|Refused to (?:load|execute|apply)/i.test(text)) csp.push(text);
    else if (msg.type() === 'error' && /canvas|image data|cross-origin/i.test(text)) errors.push(text);
  });
  await beforeNavigate?.(page);
  await page.goto(harness.url);
  const frame = page.frameLocator('iframe');
  // Provisioned launchers never show setup; retry is failure, not readiness.
  await frame.locator('#rt:visible, #launch-setup:visible, #launch-retry:visible').first().waitFor();
  if (await frame.locator('#launch-retry').isVisible()) {
    const message = await frame.locator('#launch-status').innerText();
    await context.close();
    assert.fail(`Launcher failed: ${message}`);
  }
  if (engineName === 'webkit') {
    await page.mouse.move(viewport.width / 2, viewport.height / 2); await page.mouse.wheel(0, 1);
  }
  return { context, page, frame, errors, csp, blocked, screenshotCsp };
}
export async function readyStage(page, frame) {
  await frame.locator('#rt .rt-src').first().waitFor();
  const service = serviceFrame(page);
  await service.waitForFunction(() => {
    const paths = [...document.querySelectorAll('.rt-wires path')];
    return paths.length > 0 && paths.every(path => path.getAttribute('d')?.includes('C'));
  });
  return service;
}
export async function noOverflow(service, label) {
  const geometry = await service.evaluate(() => {
    const view = document.querySelector('#view-routing');
    // The original app deliberately scrolls .view inside an overflow:hidden
    // body. Check that inner scroller AND actual bounds, not the clipped body.
    return { viewport: innerWidth, root: document.documentElement.scrollWidth,
      view: { client: view.clientWidth, scroll: view.scrollWidth },
      nodes: [...document.querySelectorAll('#rt,.rt-stage,.rt-src,.rt-activity,.rt-actors,.rt-actor,.rt-actor-models,.rt-actor code.mdl,.rt-hub,.rt-accts,.rt-accts>li,.rt-cap,.rt-stats,.rt-log-head,.rt-steps')]
        .filter(n => n.getBoundingClientRect().width && n.getBoundingClientRect().height)
        .map(n => ({ selector: n.className, left: n.getBoundingClientRect().left, right: n.getBoundingClientRect().right })) };
  });
  assert(geometry.root <= geometry.viewport + 1 && geometry.view.scroll <= geometry.view.client + 1 &&
    geometry.nodes.every(n => n.left >= -1 && n.right <= geometry.viewport + 1), `${label}: ${JSON.stringify(geometry)}`);
}
export async function capture(page, frame, name) {
  await mkdir(shots, { recursive: true });
  capturing.add(page);
  try {
    await page.screenshot({ path: new URL(`${engineName}-${name}-viewport.png`, shots).pathname });
    await frame.locator('#view-routing').screenshot({ path: new URL(`${engineName}-${name}-upper.png`, shots).pathname, animations: 'disabled' });
    const injected = await serviceFrame(page).evaluate(() => window.captureStyleTexts);
    assert(injected.every(text => text === 'body {}'), 'only the verified Playwright WebKit sync stylesheet may be injected');
  } finally { capturing.delete(page); }
}
const noErrors = h => { assert.deepEqual(h.errors, []); assert.deepEqual(h.csp, []); assert.deepEqual(h.blocked, []); };
const sourceTitles = frame => frame.locator('.rt-src').evaluateAll(nodes => nodes.map(n => n.title));
const reads = harness => harness.observations.filter(r => r.path === 'api/native-routing' && r.method === 'GET').length;
async function assertClientModelRows(source, expectedIcon) {
  assert.equal(await source.locator(':scope > .rt-ic > .ic').getAttribute('data-icon'), expectedIcon);
  const rows = await source.locator('.rt-actor').evaluateAll(nodes => nodes.map(n => ({
    text: n.textContent,
    models: [...n.querySelectorAll('code.mdl')].map(chip => chip.textContent).join(''),
    shape: n.children.length === 2 && n.firstElementChild.matches('.ic[aria-hidden="true"]') &&
      n.lastElementChild.matches('span.rt-actor-models') && [...n.lastElementChild.children].every(c => c.matches('code.mdl')),
    icon: n.firstElementChild.dataset.icon,
    parentIcon: n.closest('.rt-src').querySelector(':scope > .rt-ic > .ic').dataset.icon,
  })));
  assert(rows.length > 0, 'the fixture exercises actual child rows');
  for (const row of rows) {
    assert.equal(row.text, row.models, 'models are the only child-row text: no labels, counts, provider or identity');
    assert.equal(row.shape, true, 'only the client icon and model chips are present');
    assert.equal(row.icon, expectedIcon);
    assert.equal(row.icon, row.parentIcon, 'child artwork uses exactly the parent client icon token');
  }
  assert.equal(await source.locator('.rt-actor b,.rt-actor i,.rt-actor > svg,.rt-actor-label,.rt-actor-state').count(), 0);
  assert.equal(await source.locator('details,summary,button,.chev,[aria-expanded],[open]').count(), 0, 'source activity has no disclosure controls or collapse state');
  assert.equal(await source.locator('.rt-activity').evaluate(n => n.matches('div.rt-activity') && n.children.length === 2 &&
    n.firstElementChild.matches('ul.rt-actors') && n.lastElementChild.matches('span.rt-activity-overflow')), true);
  assert.equal(await source.locator('.rt-activity').isVisible(), true);
  assert.equal(await source.locator('.rt-actors').isVisible(), true, 'relevant activity is visible without a show/hide action');
  assert.equal(await source.locator('.rt-actor').evaluateAll(ns => ns.every(n => n.getBoundingClientRect().height > 0)), true);
  assert.equal(await source.locator('.rt-actors').getAttribute('tabindex'), '0');
  assert.equal(await source.locator('.rt-actors').getAttribute('title'), 'Gateway request activity only; task completion is unknown.');
  assert.equal(await source.locator('.rt-actors').getAttribute('aria-label'), 'Model request activity — scroll for all activity');
}

// Observe the real native pose writes and frame callbacks; never replace flight
// geometry, clocks or callbacks. Adapted from routing-idle-frame / sky-under.
function observeNative() {
  window.nativeFrames = 0; window.flightRecords = []; const tracked = new WeakMap();
  const raf = window.requestAnimationFrame.bind(window);
  window.requestAnimationFrame = cb => raf(ts => { if (cb.name === 'frame') window.nativeFrames++; cb(ts); });
  const set = Element.prototype.setAttribute;
  Element.prototype.setAttribute = function(name, value) {
    const result = set.call(this, name, value);
    if (name === 'cy' && this.matches('.rt-sky .pkt')) {
      let record = tracked.get(this);
      if (!record) { record = { node: this, first: null, last: null, samples: 0 }; tracked.set(this, record); window.flightRecords.push(record); }
      const point = new DOMPoint(Number(this.getAttribute('cx')), Number(value)).matrixTransform(this.getScreenCTM());
      const near = [...document.querySelectorAll('.rt-src')].map(n => {
        const b = n.getBoundingClientRect(), transform = new DOMMatrix(getComputedStyle(n).transform);
        // Native rttick scales a card around its center; wires retain the
        // unscaled layout attachment while this decorative pulse runs.
        const x = b.x + b.width / 2 + b.width / Math.hypot(transform.a, transform.b) / 2;
        const y = b.y + b.height / 2;
        const wires = [...document.querySelectorAll('.rt-wires path')].filter(w => w.getAttribute('d')).map(w => {
          const ctm = w.getScreenCTM(), start = w.getPointAtLength(0), atSix = w.getPointAtLength(6);
          const a = new DOMPoint(start.x, start.y).matrixTransform(ctm);
          const end = new DOMPoint(atSix.x, atSix.y).matrixTransform(ctm);
          return { startError: Math.hypot(a.x - x, a.y - y), sampleError: Math.hypot(end.x - point.x, end.y - point.y) };
        }).sort((a,b) => a.startError - b.startError);
        return { title: n.title, dx: point.x - b.right, dy: point.y - y, wire: wires[0] };
      }).sort((a,b) => Math.hypot(a.dx,a.dy)-Math.hypot(b.dx,b.dy))[0];
      const sample = { x: point.x, y: point.y, near, back: this.classList.contains('back') };
      record.first ||= sample; record.last = sample; record.samples++;
    }
    return result;
  };
}
async function completedFlights(service) {
  return service.evaluate(() => flightRecords.filter(r => !r.node.isConnected).map(({ first, last, samples }) => ({ first, last, samples })));
}
function assertHome(flight, session) {
  for (const point of [flight.first, flight.last]) {
    assert(point.near.title.includes(`Session id: ${session}`), JSON.stringify(flight));
    assert(point.near.wire?.startError < 1, `native session wire attaches at source right-center: ${JSON.stringify(flight)}`);
    assert(point.near.wire.sampleError < 1, `native packet is six path-length pixels from its source: ${JSON.stringify(flight)}`);
  }
  assert.equal(flight.first.back, false, JSON.stringify(flight)); assert.equal(flight.last.back, true, JSON.stringify(flight));
}
function update(harness, fixture) {
  fixture.seq = Math.max(fixture.seq, ...fixture.routes.map(r => r.seq)) + 1;
  for (const r of fixture.routes) r.seq = fixture.seq;
  harness.aggregator.applyTrace(fixture, { full: true });
}

await test(`${engineName}: copied native upper block through the production opaque-origin service`, { timeout: 240_000 }, async t => {
  const browser = await engine.launch({ headless: true }); t.after(() => browser.close());

  await t.test('authenticated boot preserves session nodes, shared seats, original controls and strict CSP', async t => {
    const harness = await browserHarness(); t.after(() => harness.close());
    const h = await contextFor(browser, harness); t.after(() => h.context.close());
    const service = await readyStage(h.page, h.frame);
    assert.equal(await h.frame.locator('.rt-stage').count(), 1);
    assert.equal(await h.frame.locator('.rt-src').count(), 2);
    assert.equal(await h.frame.locator('.rt-src .rt-activity,.rt-src .rt-actors').count(), 0, 'sources without relevant child activity have no extra wrapper or geometry');
    assert.equal(await h.frame.locator('.rt-accts>li').count(), 2, 'same account rows stay shared across sessions');
    assert.deepEqual(await h.frame.locator('.rt-src b').allTextContents(), ['Claude Code', 'Claude Code']);
    await service.waitForFunction(() => [...document.querySelectorAll('.rt-src img,.rt-accts img')].every(img => img.complete && img.naturalWidth > 0 && img.crossOrigin === 'anonymous'));
    assert(harness.observations.some(r => r.path === 'vendor/magpie/icons/claudecode-color.svg' && r.origin === 'null' && !r.authorization));
    assert((await sourceTitles(h.frame)).some(s => s.includes('session-alpha')));
    assert((await sourceTitles(h.frame)).some(s => s.includes('session-bravo')));
    assert.equal(await h.frame.locator('#session-select,#route-graph,#evidence-details').count(), 0);
    await service.evaluate(() => { window.savedNativeNodes = [...document.querySelectorAll('.rt-src,.rt-accts>li,.rt-wires path')]; });
    const before = reads(harness);
    await waitUntil(() => reads(harness) >= before + 2, 'unchanged native polls complete');
    assert.equal(await service.evaluate(() => savedNativeNodes.every(n => n.isConnected)), true);
    const fixture = nativeTrace(); fixture.seq = 4; fixture.routes[2].tokens = 50; fixture.routes[2].seq = 4;
    harness.aggregator.applyTrace(fixture);
    const updated = reads(harness); await waitUntil(() => reads(harness) > updated, 'updated native poll completes');
    assert.equal(await service.evaluate(() => savedNativeNodes.every(n => n.isConnected)), true);
    await h.frame.locator('#rtMask').click();
    assert.equal(await h.frame.locator('#rtMask').getAttribute('aria-pressed'), 'true');
    assert.doesNotMatch(await h.frame.locator('body').innerText(), /DO-NOT-EXPOSE|fixture-private-account|secret-token/);
    assert.equal(await h.page.locator('iframe').getAttribute('sandbox'), 'allow-scripts');
    assert.equal(await service.evaluate(() => { try { localStorage.getItem('probe'); return 'available'; } catch { return 'blocked'; } }), 'blocked');
    const api = harness.observations.filter(r => r.path.startsWith('api/') && r.method === 'GET');
    assert(api.length > 0 && api.every(r => r.path === 'api/native-routing' && r.authorization && r.origin === 'null'));
    assert(!h.page.frames().some(f => f.url().includes(harness.options.apiToken)));
    assert(!harness.observations.some(r => r.path.includes(harness.options.apiToken)));
    await noOverflow(service, 'desktop boot'); await capture(h.page, h.frame, 'boot'); noErrors(h);
  });

  await t.test('parent bridge listens before child navigation and awaits delayed options without setup', async t => {
    const harness = await browserHarness(); t.after(() => harness.close());
    let releaseHost, hostWaiting, releaseOptions, optionsWaiting, page;
    const hostGate = new Promise(resolve => { releaseHost = resolve; });
    const hostReached = new Promise(resolve => { hostWaiting = resolve; });
    const optionsGate = new Promise(resolve => { releaseOptions = resolve; });
    const optionsReached = new Promise(resolve => { optionsWaiting = resolve; });
    t.after(() => { releaseHost(); releaseOptions(); });
    const boot = contextFor(browser, harness, undefined, undefined, undefined, async p => {
      page = p; t.after(() => p.context().close());
      await p.route('**/host.js', async route => { hostWaiting(); await hostGate; await route.continue(); });
      let first = true;
      await p.route('**/_test/options', async route => {
        if (first && route.request().method() === 'GET') {
          first = false; optionsWaiting(); await optionsGate;
        }
        await route.continue();
      });
    });
    // Keep rejection handled even if an earlier ordering assertion fails.
    void boot.catch(() => {});
    await hostReached;
    await page.locator('iframe').waitFor({ state: 'attached' });
    assert.equal(await page.locator('iframe').getAttribute('src'), null,
      'child navigation must not precede the parent message listener');
    releaseHost();
    await optionsReached;
    const launcher = page.frameLocator('iframe');
    assert.equal(await launcher.locator('#launch-setup').getAttribute('hidden'), '');
    assert.equal(await launcher.locator('#launch-retry').getAttribute('hidden'), '');
    assert.equal(serviceFrame(page), undefined, 'pending options are not service readiness');
    releaseOptions();
    const h = await boot; await readyStage(h.page, h.frame);
    assert.equal(await h.frame.locator('#launch-setup').count(), 0);
    assert.equal(harness.collectorStarts, 1);
    noErrors(h);
  });

  await t.test('two tabs share one collector while exact agents/sessions and unknown requests stay separate', async t => {
    const fixture = nativeTrace({ sessions: ['same', 'same', null, null], agents: ['claude', 'codex', 'claude', 'claude'] });
    const harness = await browserHarness({ fixture }); t.after(() => harness.close());
    const one = await contextFor(browser, harness), two = await contextFor(browser, harness);
    t.after(() => one.context.close()); t.after(() => two.context.close());
    for (const h of [one, two]) {
      await readyStage(h.page, h.frame);
      assert.equal(await h.frame.locator('.rt-src').count(), 4);
      const titles = await sourceTitles(h.frame);
      assert(titles.some(s => s.includes('Claude Code') && s.includes('Session id: same')));
      assert(titles.some(s => s.includes('Codex') && s.includes('Session id: same')));
      assert(titles.some(s => s.includes('Unknown session · #3')));
      assert(titles.some(s => s.includes('Unknown session · #4')));
      assert.equal(await h.frame.locator('.rt-accts>li').count(), 2); noErrors(h);
    }
    assert.equal(harness.collectorStarts, 1);
  });

  await t.test('native request flights remain independent; startup and visibility resume keep LIVE=4', async t => {
    const fixture = nativeTrace({ sessions: Array(6).fill('one-session') });
    fixture.routes.forEach(r => { r.sub = `private-actor-${r.id}`; });
    const harness = await browserHarness({ fixture }); t.after(() => harness.close());
    const h = await contextFor(browser, harness, { width: 1280, height: 900 }, 'no-preference'); t.after(() => h.context.close());
    const service = await readyStage(h.page, h.frame);
    await service.waitForFunction(() => document.querySelectorAll('.rt-sky .pkt').length === 4);
    assert.equal(await h.frame.locator('.rt-src').count(), 1);
    assert.equal(await h.frame.locator('.rt-actor').count(), 6, 'activity is not restricted to the four starting flights');
    await h.page.evaluate(() => window.testVisibility(false));
    await service.waitForFunction(() => document.querySelectorAll('.rt-sky .pkt').length === 0);
    const before = reads(harness); await h.page.waitForTimeout(1200);
    assert.equal(reads(harness), before, 'hidden tab does not poll');
    await h.page.evaluate(() => window.testVisibility(true));
    await service.waitForFunction(() => document.querySelectorAll('.rt-sky .pkt').length === 4);
    harness.revoke();
    await h.frame.locator('.rt-off').filter({ hasText: /Access is unavailable or was revoked/ }).waitFor();
    assert.equal(await h.frame.locator('.rt-src,.rt-actor,.rt-activity').count(), 0);
    assert.equal(await h.frame.locator('.rt-sky .pkt,.rt-sky .bird').count(), 0);
    assert.equal(await h.frame.locator('.rt-steps').textContent(), '');
    assert.equal(await service.evaluate(() => document.querySelector('#rt').getAnimations({ subtree: true }).filter(a => a.playState === 'running').length), 0);
    // The unchanged .view entry transition (view-in, 240ms) can have resumed
    // just before revocation. No route animation survives; the outer shell
    // transition must also finish, without canceling it in test instrumentation.
    await service.waitForFunction(() => document.getAnimations().every(a => a.playState !== 'running'), null, { timeout: 1500 });
    noErrors(h);
  });

  await t.test('native replay works and backend replacement discards old source and replay state', async t => {
    const harness = await browserHarness({ fixture: nativeTrace({ done: true }) }); t.after(() => harness.close());
    const h = await contextFor(browser, harness); t.after(() => h.context.close());
    const service = await readyStage(h.page, h.frame);
    await h.frame.getByRole('button', { name: 'Replay', exact: true }).click();
    await h.frame.locator('.rt-replay').waitFor();
    await h.frame.getByRole('button', { name: 'Stop replay', exact: true }).click();
    assert.equal(await h.frame.locator('.rt-replay').isVisible(), false);
    await h.frame.getByRole('button', { name: 'Replay', exact: true }).click();
    const replacement = createAggregator({ instanceId: 'replacement-native-backend' });
    replacement.applyTrace(nativeTrace({ sessions: ['replacement-session'] }), { full: true });
    replacement.setConnection({ status: 'live' }); harness.replaceProjection(replacement);
    await service.waitForFunction(() => [...document.querySelectorAll('.rt-src')].some(n => n.title.includes('replacement-session')));
    assert.equal(await h.frame.locator('.rt-src').count(), 1);
    assert.equal(await h.frame.locator('.rt-replay').isVisible(), false);
    assert(!(await sourceTitles(h.frame)).some(s => s.includes('session-alpha'))); noErrors(h);
  });

  await t.test('stale collector clears live activity and resumes only on new authoritative data', async t => {
    const harness = await browserHarness(); t.after(() => harness.close());
    const h = await contextFor(browser, harness); t.after(() => h.context.close()); await readyStage(h.page, h.frame);
    harness.aggregator.setConnection({ status: 'stale', reason: 'gateway_unavailable' });
    await h.frame.locator('.rt-off').filter({ hasText: /not live/ }).waitFor();
    assert.equal(await h.frame.locator('.rt-src,.rt-sky .pkt').count(), 0);
    harness.aggregator.setConnection({ status: 'live' });
    await h.frame.locator('.rt-src').first().waitFor(); noErrors(h);
  });

  await t.test('first-use setup provisions only through parent options, never URL or storage', async t => {
    const harness = await browserHarness({ unprovisioned: true }); t.after(() => harness.close());
    const h = await contextFor(browser, harness); t.after(() => h.context.close());
    await h.frame.locator('#launch-setup').click(); await readyStage(h.page, h.frame);
    assert.equal(harness.options.apiToken.length, 43); assert.equal(harness.options.installationId.length, 22);
    assert(!h.page.frames().some(f => f.url().includes(harness.options.apiToken)));
    assert(!harness.observations.some(r => r.path.includes(harness.options.apiToken))); noErrors(h);
  });

  await t.test('actual native desktop/mobile, themes and motion preferences fit without hidden overflow', async t => {
    const harness = await browserHarness(); t.after(() => harness.close());
    for (const motion of ['reduce','no-preference']) for (const [name, viewport] of [['desktop', { width: 1280, height: 900 }], ['mobile', { width: 390, height: 844 }]]) {
      const h = await contextFor(browser, harness, viewport, motion);
      try {
        const service = await readyStage(h.page, h.frame);
        for (const dark of [false, true]) {
          await h.page.evaluate(v => window.testTheme(v), dark);
          await service.waitForFunction(theme => document.documentElement.dataset.theme === theme, dark ? 'dark' : 'light');
          await noOverflow(service, `${name} ${dark ? 'dark' : 'light'}`);
          await capture(h.page, h.frame, `${name}-${dark ? 'dark' : 'light'}-${motion}`);
        }
        if (name === 'mobile') {
          assert.equal(await h.frame.locator('#rt').evaluate(n => n.classList.contains('max560')), true);
          await h.frame.locator('#rtMask').tap();
        }
        noErrors(h);
      } finally { await h.context.close(); }
    }
  });

  await t.test('source-local folders, model and parent updates never merge or rekey exact sessions', async t => {
    // Adapt routing-session-folder: the old merged-stage expectation is replaced
    // with one native source per session, not with per-request cards.
    const fixture = nativeTrace({ sessions: ['alpha', 'alpha', 'bravo'] });
    fixture.routes.forEach((r, i) => { r.folder = ['workspace/magpie', 'src/engine', 'src/dial'][i]; r.parentSession = 'shared-parent'; });
    const harness = await browserHarness({ fixture, showFolders: true }); t.after(() => harness.close());
    const h = await contextFor(browser, harness); t.after(() => h.context.close()); const service = await readyStage(h.page, h.frame);
    const a = h.frame.locator('.rt-src[title*="Session id: alpha"]');
    const b = h.frame.locator('.rt-src[title*="Session id: bravo"]');
    assert.equal(await a.locator(':scope > small').textContent(), 'magpie, engine');
    assert.equal(await b.locator(':scope > small').textContent(), 'dial');
    assert.match(await a.getAttribute('title'), /Folder: workspace\/magpie\nFolder: src\/engine/);
    assert.doesNotMatch(await a.getAttribute('title'), /dial/);
    assert.match(await b.getAttribute('title'), /Folder: src\/dial/);
    assert.doesNotMatch(await b.getAttribute('title'), /magpie|engine/);
    await a.hover(); assert.equal(await a.evaluate(n => n.matches(':hover')), true);
    await service.evaluate(() => { window.folderNodes = [...document.querySelectorAll('.rt-src')]; });
    fixture.routes[1].model = 'changed-model'; fixture.routes[1].folder = 'new/module'; fixture.routes[1].parentSession = 'different-parent';
    update(harness, fixture);
    await service.waitForFunction(() => [...document.querySelectorAll('.rt-src')].some(n => n.title.includes('changed-model')));
    assert.equal(await service.evaluate(() => folderNodes.every(n => n.isConnected)), true);
    assert.equal(await h.frame.locator('.rt-src').count(), 2);
    assert.match(await a.getAttribute('title'), /Folder: new\/module/); assert.doesNotMatch(await b.getAttribute('title'), /module/);
    assert.equal(await a.locator(':scope > small').textContent(), 'magpie, module');
    assert.equal(await b.locator(':scope > small').textContent(), 'dial');
    noErrors(h);
  });

  await t.test('raw provider display metadata reaches native headings and artwork without brand substitution', async t => {
    const variants = [
      { provider: 'gemini', name: 'Gemini CLI', icon: 'geminicli-color', expected: 'geminicli-color' },
      { provider: 'custom-antigravity', name: 'Antigravity', icon: 'antigravity-color', expected: 'antigravity-color' },
      { provider: 'kiro', name: 'Kiro', icon: 'kiro-color', expected: 'kiro-color' },
      { provider: 'custom-stepfun', name: 'StepFun', icon: 'stepfun-color', expected: 'stepfun-color' },
      { provider: 'openai', name: '研發備援 (EU) & Gateway', icon: 'anthropic', preset: 'openai', expected: 'anthropic' },
      { provider: 'custom-preset', name: 'Preset fallback', preset: 'geminicli-color', expected: 'geminicli-color' },
      { provider: 'custom-upload', name: 'Uploaded artwork unavailable', icon: 'file:private-picture', preset: 'geminicli-color', expected: 'generic' },
      { provider: 'custom-remote', name: 'Remote artwork unavailable', icon: 'https://secret.invalid/image.svg', preset: 'openai', expected: 'generic' },
    ];
    const fixture = nativeTrace({ sessions: ['branding-session'] });
    function applyBrand(v) {
      const r = fixture.routes[0], s = r.order[0];
      r.provider = v.provider; r.order = [{ ...s, id: `${v.provider}@fixture-private-account`, provider: v.provider, kind: 'provider', name: v.name, icon: v.icon, preset: v.preset }];
      r.tries[0].id = r.order[0].id;
    }
    applyBrand(variants[0]);
    const harness = await browserHarness({ fixture }); t.after(() => harness.close());
    const h = await contextFor(browser, harness); t.after(() => h.context.close());
    const service = await readyStage(h.page, h.frame);
    for (const [index, v] of variants.entries()) {
      if (index) { applyBrand(v); update(harness, fixture); }
      await service.waitForFunction(name => document.querySelector('.rt-accts')?.textContent.includes(name), v.name);
      assert((await h.frame.locator('.rt-what').innerText()).includes(v.name), 'native provider heading uses the recorded display name');
      assert.equal(await h.frame.locator('.rt-accts .ic').first().getAttribute('data-icon'), v.expected);
      if (v.expected !== 'generic') {
        await waitUntil(() => harness.observations.some(r => r.path === `vendor/magpie/icons/${v.expected}.svg`), 'the actual pinned provider artwork is requested');
      }
      assert.doesNotMatch(await h.frame.locator('#rt').innerText(), /DO-NOT-EXPOSE|fixture-private-account|private-picture|secret\.invalid/);
    }
    const rawSeat = fixture.routes[0].order[0];
    rawSeat.name = 'sk-proj-credentialcanary0123456789'; update(harness, fixture);
    await service.waitForFunction(() => document.querySelector('.rt-what')?.textContent.startsWith('Provider '));
    assert.doesNotMatch(await h.frame.locator('#rt').innerText(), /credentialcanary/);
    assert.equal(await h.frame.locator('.rt-src').count(), 1);
    assert.equal(await h.frame.locator('.rt-accts > li').count(), 1);
    noErrors(h);
  });

  await t.test('equal project-only labels keep exact sessions, tooltips and source nodes distinct', async t => {
    const fixture = nativeTrace({ sessions: ['alpha', 'bravo'] });
    fixture.routes[0].folder = 'private-parent/same-project';
    fixture.routes[1].folder = 'C:\\private-parent\\same-project';
    const harness = await browserHarness({ fixture }); t.after(() => harness.close());
    const h = await contextFor(browser, harness); t.after(() => h.context.close());
    const service = await readyStage(h.page, h.frame);
    const subtitles = await h.frame.locator('.rt-src > small').allTextContents();
    assert.deepEqual(subtitles, ['same-project', 'same-project']);
    assert.equal(await h.frame.locator('.rt-src').count(), 2, 'equal project names never merge recorded sessions');
    assert.deepEqual(await sourceTitles(h.frame), [
      'Claude Code\nexample-model\nSession id: alpha\nsame-project',
      'Claude Code\nexample-model\nSession id: bravo\nsame-project',
    ]);
    await service.evaluate(() => { window.projectSources = [...document.querySelectorAll('.rt-src')]; });
    const before = reads(harness); await waitUntil(() => reads(harness) >= before + 3, 'unchanged same-project polls complete');
    assert.equal(await service.evaluate(() => projectSources.every((n, i) => n === document.querySelectorAll('.rt-src')[i])), true);
    fixture.routes[0].folder = 'private-parent/renamed-project'; fixture.routes[0].parentSession = 'bravo';
    update(harness, fixture);
    await service.waitForFunction(() => document.querySelector('.rt-src[title*="Session id: alpha"] > small')?.textContent === 'renamed-project');
    assert.equal(await service.evaluate(() => projectSources.every((n, i) => n === document.querySelectorAll('.rt-src')[i])), true, 'project and parent changes do not rekey either source');
    assert.deepEqual(await h.frame.locator('.rt-src > small').allTextContents(), ['renamed-project', 'same-project']);
    assert.deepEqual(await sourceTitles(h.frame), [
      'Claude Code\nexample-model\nSession id: alpha\nrenamed-project',
      'Claude Code\nexample-model\nSession id: bravo\nsame-project',
    ]);
    assert.doesNotMatch(JSON.stringify(harness.aggregator.nativeSnapshot()), /private-parent|C:/);
    assert.doesNotMatch(await h.frame.locator('#rt').innerText(), /private-parent/);
    assert((await sourceTitles(h.frame)).every(title => !title.includes('Folder:')));
    await noOverflow(service, 'visible single-project labels');
    await capture(h.page, h.frame, 'project-names'); noErrors(h);

    const hidden = await browserHarness({ fixture, showProjectNames: false }); t.after(() => hidden.close());
    const other = await contextFor(browser, hidden); t.after(() => other.context.close());
    await readyStage(other.page, other.frame);
    assert.deepEqual(await other.frame.locator('.rt-src > small').allTextContents(), ['alpha · example-model', 'bravo · example-model'], 'no-project session/model fallback is unchanged');
    assert.doesNotMatch(await other.frame.locator('#rt').innerText(), /same-project|renamed-project|private-parent/);
    assert.doesNotMatch(JSON.stringify(hidden.aggregator.nativeSnapshot()), /same-project|renamed-project|private-parent/);
    noErrors(other);
  });

  await t.test('client-icon/model-only children retain tooltip states, exact flight endpoints and native caps', async t => {
    const fixture = nativeTrace({ sessions: ['alpha', 'alpha', 'alpha', 'alpha', 'alpha', 'alpha', 'alpha', 'bravo', 'alpha'],
      agents: ['claude', 'claude', 'claude', 'claude', 'claude', 'claude', 'claude', 'claude', 'codex'] });
    const [main, first, helper, second, unknown, conflict, title, independent, otherAgent] = fixture.routes;
    main.folder = 'private-parent/project-alpha';
    first.subagentId = first.sub = 'private-actor-one'; helper.sub = 'private-actor-one';
    first.model = 'group/opaque-request'; first.served = 'z-model'; helper.model = 'a-model';
    second.sub = 'private-actor-two'; second.model = 'a-model';
    unknown.kind = 'collab_spawn'; delete unknown.model;
    conflict.sub = 'private-conflict-one'; conflict.subagentId = 'private-conflict-two';
    title.kind = 'title'; title.parentSession = 'bravo';
    independent.sub = otherAgent.sub = 'private-actor-one'; independent.parentSession = 'alpha';
    const harness = await browserHarness({ fixture }); t.after(() => harness.close());
    const h = await contextFor(browser, harness, { width: 1280, height: 1000 }, 'no-preference', observeNative);
    t.after(() => h.context.close()); const service = await readyStage(h.page, h.frame);
    const alpha = h.frame.locator('.rt-src[title^="Claude Code"][title*="Session id: alpha"]');
    const bravo = h.frame.locator('.rt-src[title*="Session id: bravo"]');
    const codex = h.frame.locator('.rt-src[title^="Codex"][title*="Session id: alpha"]');
    await service.waitForFunction(() => document.querySelectorAll('.rt-actor').length === 5);
    assert.equal(await h.frame.locator('.rt-src').count(), 3);
    assert.equal(await alpha.locator('.rt-actor').count(), 3);
    assert.equal(await bravo.locator('.rt-actor').count(), 1, 'independent recorded session is not reparented');
    assert.equal(await codex.locator('.rt-actor').count(), 1, 'same opaque actor and session under another agent stays independent');
    const known = alpha.locator('.rt-actor').nth(0), sameModel = alpha.locator('.rt-actor').nth(1), aggregate = alpha.locator('.rt-actor').nth(2);
    await assertClientModelRows(alpha, 'claudecode-color');
    await assertClientModelRows(bravo, 'claudecode-color');
    await assertClientModelRows(codex, 'codex-color');
    assert.deepEqual(await known.locator('code.mdl').allTextContents(), ['a-model', 'z-model']);
    assert.deepEqual(await sameModel.locator('code.mdl').allTextContents(), ['a-model']);
    assert.deepEqual(await aggregate.locator('code.mdl').allTextContents(), ['example-model', 'Unknown model']);
    assert.equal(await known.getAttribute('title'), 'Claude Code\na-model, z-model\n2 requests active\n2 active requests; 0 ended requests');
    assert.equal(await sameModel.getAttribute('title'), 'Claude Code\na-model\nRequest active\n1 active requests; 0 ended requests');
    assert.match(await aggregate.getAttribute('title'), /^Claude Code\nexample-model, Unknown model\n2 requests active\n2 active requests; 0 ended requests/);
    assert.match(await aggregate.getAttribute('title'), /Request identity unavailable/);
    assert.match(await aggregate.getAttribute('aria-label'), /Request identity unavailable/);
    assert.match(await codex.locator('.rt-actor').getAttribute('title'), /^Codex\nexample-model\nRequest active\n1 active requests; 0 ended requests$/);
    assert.equal(await alpha.locator('.rt-actors').getAttribute('title'), 'Gateway request activity only; task completion is unknown.');
    const activityDom = await h.frame.locator('.rt-activity').evaluateAll(ns => ns.map(n => n.outerHTML).join('\n'));
    assert.doesNotMatch(activityDom, /data-actor-id|actor_|private-actor|private-conflict|Sub-agent|子代理|group\/|Agent completed|Anthropic Workspace|Provider 01|Account 01/);
    assert.equal(await h.frame.locator('.rt-actor[role],.rt-actor[tabindex],.rt-actor[aria-expanded],.rt-actor.active,.rt-actor .chev').count(), 0);
    assert.equal(await h.frame.locator('.rt-actor').evaluateAll(ns => ns.every(n => n.classList.contains('on') && n.style.getPropertyValue('--depth') === '1')), true);
    assert.doesNotMatch(await h.frame.locator('#rt').innerText(), /private-actor|private-conflict|private-parent/);
    await service.waitForFunction(() => document.querySelectorAll('.rt-sky .pkt.held').length === 4);
    assert.equal(await h.frame.locator('.rt-src .rt-src,.rt-src .rt-accts,.rt-src .rt-wires').count(), 0, 'child rows are not extra native sources or destinations');
    assert.equal(await h.frame.locator('.rt-accts > li').count(), 2, 'same original account seats remain shared');
    await service.evaluate(() => {
      window.actorNodes = [...document.querySelectorAll('.rt-actor')];
      window.actorChips = [...document.querySelectorAll('.rt-actor code.mdl')];
      window.actorLists = [...document.querySelectorAll('.rt-actors')];
    });
    await alpha.locator('.rt-actors').focus(); await h.page.keyboard.press('Shift');
    assert.equal(await alpha.locator('.rt-actors').evaluate(n => n.matches(':focus-visible') && getComputedStyle(n).boxShadow !== 'none'), true);
    const before = reads(harness); await waitUntil(() => reads(harness) >= before + 3, 'unchanged actor polls complete');
    assert.equal(await service.evaluate(() => actorNodes.every((n,i) => n === document.querySelectorAll('.rt-actor')[i]) && actorChips.every(n => n.isConnected) && actorLists.every((n,i) => n === document.querySelectorAll('.rt-actors')[i])), true);
    assert.equal(await alpha.locator('.rt-actors').evaluate(n => n === document.activeElement), true, 'unchanged polls preserve keyboard focus');
    await assertClientModelRows(alpha, 'claudecode-color');
    for (const [size, width] of [['desktop', 1280], ['mobile', 390]]) {
      await h.page.setViewportSize({ width, height: 1000 });
      await service.waitForFunction(mobile => document.querySelector('#rt').classList.contains('max560') === mobile, size === 'mobile');
      for (const dark of [false, true]) {
        await h.page.evaluate(v => window.testTheme(v), dark);
        await service.waitForFunction(theme => document.documentElement.dataset.theme === theme, dark ? 'dark' : 'light');
        await noOverflow(service, `client/model activity ${size} ${dark ? 'dark' : 'light'}`);
        await assertClientModelRows(alpha, 'claudecode-color');
        await assertClientModelRows(codex, 'codex-color');
        await capture(h.page, h.frame, `nested-subagents-${size}-${dark ? 'dark' : 'light'}`);
      }
    }
    await service.waitForFunction(() => document.querySelectorAll('.rt-sky .pkt.held').length === 4);
    await service.evaluate(() => { window.actorFlights = [...document.querySelectorAll('.rt-sky .pkt.held')].map(node => flightRecords.find(r => r.node === node)); });
    for (const r of fixture.routes) { r.done = true; r.status = 200; r.ms = 900; r.tries[0].done = true; r.tries[0].status = 200; r.tries[0].ms = 900; }
    update(harness, fixture);
    await service.waitForFunction(() => actorFlights.every(r => !r.node.isConnected));
    const returns = await service.evaluate(() => actorFlights.map(({ first, last, samples }) => ({ first, last, samples })));
    for (const flight of returns) {
      assertHome(flight, flight.first.near.title.includes('Session id: alpha') ? 'alpha' : 'bravo');
      assert.equal(flight.last.near.title, flight.first.near.title, 'reply returns to the exact agent and session, including same-session Codex');
    }
    await service.waitForFunction(() => !document.querySelector('.rt-actor.on'));
    assert.equal(await h.frame.locator('.rt-actor').evaluateAll(ns => ns.every(n => n.title.includes('\nRequests ended\n') && !n.classList.contains('on'))), true);
    await assertClientModelRows(alpha, 'claudecode-color');
    await assertClientModelRows(codex, 'codex-color');
    assert.deepEqual(await known.locator('code.mdl').allTextContents(), ['a-model', 'z-model']);
    fixture.routes = [main, independent]; fixture.ids = fixture.routes.map(r => r.id); update(harness, fixture);
    await service.waitForFunction(() => !document.querySelector('.rt-src[title*="Session id: alpha"] .rt-activity'));
    assert.equal(await service.evaluate(() => actorNodes.filter(n => n.isConnected).length), 1, 'eviction retains only the independent session actor');
    harness.aggregator.setConnection({ status: 'stale', reason: 'gateway_unavailable' });
    await service.waitForFunction(() => !document.querySelector('.rt-src,.rt-actor,.rt-sky .pkt'));
    noErrors(h);
  });

  await t.test('generic client children preserve model namespaces and separate only evidenced provider prefixes', async t => {
    const fixture = nativeTrace({ sessions: ['unknown-client-session'], agents: ['unregistered-client'], done: true });
    const request = fixture.routes[0]; request.sub = 'private-unknown-client-actor';
    request.model = 'org/requested/model'; request.served = 'org/served/model';
    const harness = await browserHarness({ fixture }); t.after(() => harness.close());
    const h = await contextFor(browser, harness); t.after(() => h.context.close());
    const service = await readyStage(h.page, h.frame), source = h.frame.locator('.rt-src');
    await source.locator('.rt-actor').waitFor();
    await assertClientModelRows(source, 'generic');
    assert.deepEqual(await source.locator('.rt-actor code.mdl').allTextContents(), ['org/served/model']);
    assert.equal(await source.locator('.rt-actor').getAttribute('title'), 'unregistered-client\norg/served/model\nRequests ended\n0 active requests; 1 ended requests');
    await service.evaluate(() => { window.genericRow = document.querySelector('.rt-actor'); window.genericIcon = genericRow.firstElementChild; });
    delete request.served; update(harness, fixture);
    await service.waitForFunction(() => document.querySelector('.rt-actor code.mdl')?.textContent === 'org/requested/model');
    assert.deepEqual(await source.locator('.rt-actor code.mdl').allTextContents(), ['org/requested/model'], 'an arbitrary slash-qualified requested model is not stripped');
    request.model = `${request.provider}/evidenced-model`;
    request.tries[0].model = request.order[0].model = 'evidenced-model';
    update(harness, fixture);
    await service.waitForFunction(() => document.querySelector('.rt-actor code.mdl')?.textContent === 'evidenced-model');
    assert.equal(harness.aggregator.nativeSnapshot().routes[0].requestedModelName, 'evidenced-model', 'matching request, attempt and provider seat prove the model field');
    assert.deepEqual(await source.locator('.rt-actor code.mdl').allTextContents(), ['evidenced-model']);
    assert.equal(await service.evaluate(() => genericRow === document.querySelector('.rt-actor') && genericIcon === genericRow.firstElementChild), true);
    await assertClientModelRows(source, 'generic');
    assert.doesNotMatch(await source.locator('.rt-activity').textContent(), /Sub-agent|子代理|private-unknown|Anthropic Workspace|Request identity unavailable/);
    assert.match(await h.frame.locator('.rt-what').innerText(), /Anthropic Workspace/);
    assert.equal(await h.frame.locator('.rt-accts > li').count(), 2);
    assert.equal(await h.frame.locator('.rt-accts .ic').first().getAttribute('data-icon'), 'claude-color');
    await noOverflow(service, 'generic client/model-only child'); noErrors(h);
  });

  await t.test('outbound, successful reply and replay return to the exact recorded source', async t => {
    const fixture = nativeTrace({ sessions: ['alpha', 'alpha', 'bravo'] });
    const harness = await browserHarness({ fixture }); t.after(() => harness.close());
    const h = await contextFor(browser, harness, { width: 1280, height: 900 }, 'no-preference', observeNative);
    t.after(() => h.context.close()); const service = await readyStage(h.page, h.frame);
    await service.waitForFunction(() => document.querySelectorAll('.rt-sky .pkt.held').length === 3);
    // Deterministically retain canceled history across native stopPlays/resume.
    // WebKit can also take this path after a >1s frame gap without ever becoming
    // document.hidden. Disconnected observed packets are not all replies.
    await service.evaluate(() => { window.interruptedPackets = [...document.querySelectorAll('.rt-sky .pkt.held')]; });
    await h.page.evaluate(() => window.testVisibility(false));
    await service.waitForFunction(() => interruptedPackets.every(n => !n.isConnected) && !document.querySelector('.rt-sky .pkt'));
    const canceled = await service.evaluate(() => interruptedPackets.map(node => {
      const record = flightRecords.find(r => r.node === node);
      return { recorded: !!record, returned: record?.last?.back };
    }));
    assert.deepEqual(canceled, Array.from({ length: 3 }, () => ({ recorded: true, returned: false })));
    await h.page.evaluate(() => window.testVisibility(true));
    await service.waitForFunction(() => document.querySelectorAll('.rt-sky .pkt.held').length === 3);
    const observed = await service.evaluate(() => {
      window.replyFlights = [...document.querySelectorAll('.rt-sky .pkt.held')].map(node => flightRecords.find(r => r.node === node));
      return flightRecords.length;
    });
    // A later request cannot start until the preceding response was accepted:
    // three new GETs therefore prove at least two unchanged polls completed.
    const beforePolls = reads(harness);
    await waitUntil(() => reads(harness) >= beforePolls + 3, 'two unchanged native polls complete');
    assert.equal(await service.evaluate(() => flightRecords.length), observed, 'unchanged polls create no new flights');
    assert.equal(await service.evaluate(() => replyFlights.every(r => r.node.isConnected && r.node.classList.contains('held'))), true,
      'unchanged polls retain the exact held packet identities');
    // Each held dot is beside a card, never over its words (native sky-under).
    const overlap = await h.frame.locator('.rt-sky .pkt').evaluateAll(dots => dots.map(dot => {
      const d=dot.getBoundingClientRect(); return [...document.querySelectorAll('.rt-stage .rt-node,.rt-accts>li')].some(n => {
        const b=n.getBoundingClientRect(); return d.right>b.left+.5 && d.left<b.right-.5 && d.bottom>b.top+.5 && d.top<b.bottom-.5;
      });
    }));
    assert.deepEqual(overlap, [false,false,false]);
    for (const r of fixture.routes) { r.done=true; r.status=200; r.ms=900; r.tries[0].done=true; r.tries[0].status=200; r.tries[0].ms=900; }
    update(harness, fixture);
    // Follow the exact held cohort, without discarding records based on whether
    // they returned successfully: cancellation or a wrong endpoint must fail.
    await service.waitForFunction(() => replyFlights.every(r => !r.node.isConnected));
    const flights=await service.evaluate(() => replyFlights.map(({ first, last, samples }) => ({ first, last, samples })));
    assert.equal(flights.length,3);
    assert.equal(await service.evaluate(() => flightRecords.length), observed, 'completing held requests creates no extra flights');
    assert.equal(await h.frame.locator('.rt-sky .pkt').count(), 0);
    assert.equal(flights.filter(f=>f.first.near.title.includes('Session id: alpha')).length,2);
    assert.equal(flights.filter(f=>f.first.near.title.includes('Session id: bravo')).length,1);
    for(const f of flights) assertHome(f, f.first.near.title.includes('Session id: alpha')?'alpha':'bravo');
    await service.evaluate(() => { window.flightRecords=[]; });
    await h.frame.getByRole('button',{name:'Replay',exact:true}).focus(); await h.page.keyboard.press('Enter');
    await service.waitForFunction(() => flightRecords.some(r => !r.node.isConnected && r.last?.back));
    const replay=await completedFlights(service); assert.equal(replay.length,1); assertHome(replay[0],'bravo');
    assert.equal(await service.evaluate(() => flightRecords.length), 1, 'replay creates exactly one flight');
    await service.waitForFunction(() => document.querySelector('.rt-replay').hidden);
    // Idle return-cost: no node replacement or perpetual native frame callback.
    await service.waitForFunction(() => ![...document.querySelectorAll('.rt-livedot')].some(n=>n.classList.contains('on')));
    await h.page.waitForTimeout(4000); const before=await service.evaluate(()=>nativeFrames);
    await h.page.waitForTimeout(600); assert.equal(await service.evaluate(()=>nativeFrames),before);
    noErrors(h);
  });

  await t.test('native retry/fallback and terminal failure retain exact outbound and return source', async t => {
    const fixture=nativeTrace({sessions:['retry-session','failure-session']});const [retry,failure]=fixture.routes;
    retry.tries=[{...retry.tries[0],done:true,status:503,ms:100,again:1,fail:'overloaded'},
      {...retry.tries[0],done:true,status:429,ms:100,fail:'rate',rest:{key:retry.order[0].id,until:'2026-11-09T00:01:10Z',why:'rate',by:'retry-after'}},
      {...retry.tries[0],id:retry.order[1].id}];
    failure.done=true;failure.status=400;failure.ms=100;failure.tries[0]={...failure.tries[0],done:true,status:400,ms:100,fail:'other'};
    const harness=await browserHarness({fixture});t.after(()=>harness.close());
    const h=await contextFor(browser,harness,{width:1280,height:900},'no-preference',observeNative);t.after(()=>h.context.close());
    const service=await readyStage(h.page,h.frame);
    // Completed initial records are not automatically replayed by upstream.
    // The active retry crosses both failed attempts before holding at seat two.
    await service.waitForFunction(()=>document.querySelectorAll('.rt-sky .pkt.held').length===1);
    const held=await h.frame.locator('.rt-sky .pkt.held').boundingBox(),seat=await h.frame.locator('.rt-accts>li[title]').nth(1).boundingBox();
    assert(Math.abs(held.y+held.height/2-(seat.y+seat.height/2))<2,'fallback lands beside the second shared seat');
    // Track THIS held packet through its reply, not the first historical packet.
    // Native resume may have canceled a boot packet before the stage was ready
    // (particularly when headless WebKit resumes after asset-loading stalls).
    await service.evaluate(()=>{window.retryPacket=document.querySelector('.rt-sky .pkt.held');});
    retry.done=true;retry.status=200;retry.ms=900;retry.tries[2].done=true;retry.tries[2].status=200;retry.tries[2].ms=100;update(harness,fixture);
    await service.waitForFunction(()=>!retryPacket.isConnected);
    const returned=await service.evaluate(()=>{const {first,last,samples}=flightRecords.find(r=>r.node===retryPacket);return {first,last,samples};});
    assertHome(returned,'retry-session');
    await service.evaluate(()=>{window.flightRecords=[];});
    await h.frame.getByRole('button',{name:'Replay',exact:true}).click();
    await service.waitForFunction(()=>flightRecords.some(r=>!r.node.isConnected&&r.last?.back));
    assertHome((await completedFlights(service))[0],'failure-session');noErrors(h);
  });

  await t.test('native route headings, keyboard folds and sky layering survive multi-route data', async t => {
    const fixture=nativeTrace({sessions:['group-session','pi-session','oc-session'],agents:['claude','pi','opencode']});
    fixture.routes[0].group={id:'shared-group',name:'PRIVATE-GROUP',routing:'order',members:['anthropic/example-model']};
    fixture.routes[1].provider='zhipu';fixture.routes[2].provider='moonshot';
    for(const [i,r] of fixture.routes.entries())if(i){r.model=`model-${i}`;r.order=[{...r.order[0],id:`private-key-${i}`,provider:r.provider,model:r.model}];r.tries=[{...r.tries[0],id:r.order[0].id,model:r.model}];}
    const harness=await browserHarness({fixture});t.after(()=>harness.close());
    const h=await contextFor(browser,harness,{width:1600,height:1200},'no-preference');t.after(()=>h.context.close());
    const service=serviceFrame(h.page);
    // Native heading-to-row branches use quadratic Q/L, unlike the simple
    // readyStage fixture's cubic C. Require all ten actual wire paths, not C.
    await service.waitForFunction(()=>{const ps=[...document.querySelectorAll('.rt-wires path')];return ps.length===10&&ps.every(p=>/^M/.test(p.getAttribute('d'))&&/[CQ]/.test(p.getAttribute('d'))&&p.getTotalLength()>0);});
    assert.equal(await h.frame.locator('.rt-accts > li.rt-sub').count(),3);
    assert.equal(await h.frame.locator('.rt-accts>li[title]:not(.rt-sub)').count(),4);
    assert.deepEqual(await h.frame.locator('.rt-src b').allTextContents(),['Claude Code','Pi','OpenCode']);
    assert((await h.frame.locator('.rt-accts > li.rt-sub').evaluateAll(ns=>ns.map(n=>n.title))).some(s=>s.includes('Sent by Pi')));
    assert.doesNotMatch(await h.frame.locator('#rt').innerText(),/PRIVATE-GROUP|private-key/);
    await service.waitForFunction(()=>document.querySelectorAll('.rt-sky .pkt.held').length===3);
    const fold=h.frame.locator('.rt-accts > li.rt-sub').first();await fold.focus();await h.page.keyboard.press('Enter');
    assert.equal(await fold.getAttribute('aria-expanded'),'false');await h.page.keyboard.press('Space');
    assert.equal(await fold.getAttribute('aria-expanded'),'true');
    for(const width of [1600,560,390]){
      await h.page.setViewportSize({width,height:1400});await h.page.waitForTimeout(600);await noOverflow(service,`native headings ${width}`);
      const covered=await service.evaluate(()=>{
        const sky=document.querySelector('.rt-sky'),probe=document.createElementNS('http://www.w3.org/2000/svg','rect');
        for(const [k,v] of Object.entries({x:-5000,y:-5000,width:10000,height:10000}))probe.setAttribute(k,v);
        probe.style.pointerEvents='all';sky.append(probe);sky.style.pointerEvents='auto';
        try{return [...document.querySelectorAll('.rt-node b,.rt-node small,.rt-accts>li>b')].filter(n=>{
          const b=n.getBoundingClientRect();if(!b.width||!b.height)return false;return sky.contains(document.elementFromPoint(b.x+b.width/2,b.y+b.height/2));
        }).map(n=>n.textContent);}finally{probe.remove();sky.style.pointerEvents='';}
      });
      assert.deepEqual(covered,[],'native sky never covers source/account text');
    }
    await capture(h.page,h.frame,'multi-route-mobile-normal');noErrors(h);
  });

  await t.test('fifth-source admission refills without widening either native cap', async t => {
    const fixture=nativeTrace({sessions:['a','b','c','d','e','f']});
    const harness=await browserHarness({fixture});t.after(()=>harness.close());
    const h=await contextFor(browser,harness);t.after(()=>h.context.close()); const service=await readyStage(h.page,h.frame);
    assert.equal(await h.frame.locator('.rt-src').count(),4);
    await service.waitForFunction(()=>document.querySelectorAll('.rt-sky .pkt').length===4);
    assert.deepEqual((await sourceTitles(h.frame)).map(s=>s.match(/Session id: (\w+)/)[1]),['c','d','e','f']);
    fixture.routes=fixture.routes.filter(r=>r.session!=='f');fixture.ids=fixture.routes.map(r=>r.id);update(harness,fixture);
    await service.waitForFunction(()=>[...document.querySelectorAll('.rt-src')].some(n=>n.title.includes('Session id: b')));
    assert.equal(await h.frame.locator('.rt-src').count(),4);
    // The upstream scheduler does not create an extra flight just because an
    // older source became visible. Resume admits the last four requests.
    await h.page.evaluate(()=>window.testVisibility(false));
    await service.waitForFunction(()=>document.querySelectorAll('.rt-sky .pkt').length===0);
    await h.page.evaluate(()=>window.testVisibility(true));
    await service.waitForFunction(()=>document.querySelectorAll('.rt-sky .pkt').length===4);
    assert.deepEqual((await sourceTitles(h.frame)).map(s=>s.match(/Session id: (\w+)/)[1]),['c','d','e','b'], 'native keeps admitted node order and appends the newly admitted source');noErrors(h);
  });

  await t.test('native concurrent hold follows completion, not each new or unrouted request', async t => {
    const fixture=nativeTrace({sessions:['alpha']});fixture.routes[0].order.forEach(s=>s.model='model-a');fixture.routes[0].model='model-a';fixture.routes[0].tries[0].model='model-a';
    const harness=await browserHarness({fixture});t.after(()=>harness.close());
    const h=await contextFor(browser,harness);t.after(()=>h.context.close());const service=await readyStage(h.page,h.frame);
    const title=()=>h.frame.locator('.rt-steps').innerText();assert.match(await title(),/model-a/);
    const next=nativeTrace({sessions:['alpha','bravo']}).routes[1];next.model='model-b';next.order=[];next.tries=[];fixture.routes.push(next);fixture.ids.push(next.id);update(harness,fixture);
    await service.waitForFunction(()=>document.querySelectorAll('.rt-src').length===2);assert.match(await title(),/model-a/);
    next.order=structuredClone(fixture.routes[0].order);next.order.forEach(s=>s.model='model-b');next.tries=[{id:next.order[0].id,model:'model-b',start:next.time,done:false}];update(harness,fixture);
    const before=reads(harness);await waitUntil(()=>reads(harness)>before,'routed second request received');assert.match(await title(),/model-a/);
    fixture.routes[0].done=true;fixture.routes[0].status=200;fixture.routes[0].tries[0].done=true;fixture.routes[0].tries[0].status=200;update(harness,fixture);
    await service.waitForFunction(()=>document.querySelector('.rt-steps').textContent.includes('model-b'));noErrors(h);
  });

  await t.test('partial evidence and native locale changes keep original controls and mobile bounds', async t => {
    const fixture=nativeTrace({sessions:['alpha','bravo'],done:true}); delete fixture.totals;
    for(const r of fixture.routes){delete r.ms;delete r.ttft;for(const s of r.order){delete s.routing;delete s.used;delete s.known;}for(const tr of r.tries){delete tr.ms;delete tr.ttft;}}
    const harness=await browserHarness({fixture});t.after(()=>harness.close());
    const h=await contextFor(browser,harness,{width:390,height:1000});t.after(()=>h.context.close());const service=await readyStage(h.page,h.frame);
    assert.deepEqual(await h.frame.locator('.rt-stats b').allTextContents(),['—','—','—']);
    assert.doesNotMatch(await h.frame.locator('.rt-steps').innerText(),/in 0 ms|undefined|NaN/);
    for(const lang of ['zh','zh-TW','ja','de','en']){
      await h.page.evaluate(lang=>window.testLocale(lang),lang);
      const tag=await service.evaluate(lang=>LANG_TAGS[lang] || 'en',lang);
      await service.waitForFunction(tag=>document.documentElement.lang===tag,tag);
      const translated=await service.evaluate(()=>t('Session id'));
      await service.waitForFunction(word=>[...document.querySelectorAll('.rt-src')].every(n=>n.title.includes(word)),translated);
      assert.equal(await h.frame.locator('.rt-src').count(),2);await noOverflow(service,`${lang} partial mobile`);
      assert.doesNotMatch(await h.frame.locator('#rt').innerText(),/undefined|NaN|DO-NOT-EXPOSE/);
    }
    await h.frame.locator('#rtMask').focus();await h.page.keyboard.press('Space');
    assert.equal(await h.frame.locator('#rtMask').getAttribute('aria-pressed'),'true');noErrors(h);
  });

  await t.test('long native labels and four-source admission fit the actual inner scroller', async t => {
    const fixture = nativeTrace({ sessions: Array.from({ length: 6 }, (_, i) => `session-${i}-${'x'.repeat(80)}`) });
    for (let i = 0; i < 24; i++) fixture.routes.push({ ...structuredClone(fixture.routes[5]), id: i + 7, seq: i + 7 });
    fixture.ids = fixture.routes.map(r => r.id); fixture.seq = 30;
    for (const r of fixture.routes) {
      r.sub = `private-long-list-actor-${r.id}`;
      r.model = 'long-requested-model-'.repeat(12);
      for (const s of r.order) s.model = r.model;
      for (const tr of r.tries) tr.model = r.model;
    }
    const harness = await browserHarness({ fixture }); t.after(() => harness.close());
    for (const [name, viewport] of [['desktop', { width: 1280, height: 900 }], ['mobile', { width: 390, height: 844 }]]) {
      const h = await contextFor(browser, harness, viewport);
      try {
        const service = await readyStage(h.page, h.frame);
        assert.equal(await h.frame.locator('.rt-src').count(), 4);
        const dense = h.frame.locator('.rt-src').filter({ has: h.frame.locator(':scope > small', { hasText: 'session-5-' }) });
        assert.equal(await dense.locator('.rt-actor').count(), 25, 'long lists retain all observed actors');
        await assertClientModelRows(dense, 'claudecode-color');
        assert.equal(await dense.locator('.rt-actors').evaluate(n => getComputedStyle(n).touchAction), 'pan-y');
        assert.equal(await dense.locator('.rt-actors').evaluate(n => n.clientHeight > 0 && n.clientHeight <= 180 && n.scrollHeight > n.clientHeight && getComputedStyle(n).overflowY === 'auto'), true, 'long activity keeps a bounded scroll viewport');
        assert.match(await dense.locator('.rt-activity-overflow').textContent(), /outside view; scroll/);
        await dense.locator('.rt-actors').focus(); await h.page.keyboard.press('End');
        await waitUntil(() => dense.locator('.rt-actors').evaluate(n => n.scrollTop > 0 && n.scrollTop + n.clientHeight >= n.scrollHeight), 'long activity list scrolls to its final entries');
        assert.equal(await dense.locator('.rt-actor code.mdl').first().getAttribute('title'), fixture.routes[5].model, 'truncated model remains available in full');
        if (name === 'mobile') {
          await dense.locator('.rt-actors').tap({ position: { x: 8, y: 20 } });
          await assertClientModelRows(dense, 'claudecode-color');
          assert.equal(await dense.locator('.rt-actors').evaluate(n => n.scrollTop > 0), true, 'touching the scrollable list never collapses or resets it');
        }
        await dense.locator('.rt-actors').evaluate(n => {
          window.denseList = n; window.denseScroll = n.scrollTop; window.denseRows = [...n.children];
        });
        const before = reads(harness); await waitUntil(() => reads(harness) >= before + 3, 'unchanged dense activity polls complete');
        assert.equal(await dense.locator('.rt-actors').evaluate(n => n === denseList && n.scrollTop === denseScroll && denseRows.every((row, i) => row === n.children[i])), true, 'polls preserve long-list nodes and scroll');
        await dense.locator('.rt-actors').focus(); await h.page.keyboard.press('Home');
        await waitUntil(() => dense.locator('.rt-actors').evaluate(n => n.scrollTop === 0), 'keyboard can return to the first activity row');
        for (const dark of [false, true]) {
          await h.page.evaluate(v => window.testTheme(v), dark);
          await service.waitForFunction(theme => document.documentElement.dataset.theme === theme, dark ? 'dark' : 'light');
          await noOverflow(service, `${name} dense ${dark ? 'dark' : 'light'}`);
        }
        await capture(h.page, h.frame, `${name}-dense-dark`); noErrors(h);
      } finally { await h.context.close(); }
    }
  });
});

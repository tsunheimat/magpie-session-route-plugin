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
export async function contextFor(browser, harness, viewport = { width: 1280, height: 900 }, reducedMotion = 'reduce', init) {
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
  await page.goto(harness.url);
  const frame = page.frameLocator('iframe');
  await frame.locator('button').first().waitFor();
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
      nodes: [...document.querySelectorAll('#rt,.rt-stage,.rt-src,.rt-hub,.rt-accts,.rt-accts>li,.rt-cap,.rt-stats,.rt-log-head,.rt-steps')]
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
        const b = n.getBoundingClientRect(); return { title: n.title, dx: point.x - b.right, dy: point.y - (b.y + b.height / 2) };
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
    assert(Math.abs(point.near.dy) < 2 && point.near.dx >= 4 && point.near.dx <= 8, `native 6px source edge: ${JSON.stringify(flight)}`);
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
    const harness = await browserHarness({ fixture: nativeTrace({ sessions: Array(6).fill('one-session') }) }); t.after(() => harness.close());
    const h = await contextFor(browser, harness, { width: 1280, height: 900 }, 'no-preference'); t.after(() => h.context.close());
    const service = await readyStage(h.page, h.frame);
    await service.waitForFunction(() => document.querySelectorAll('.rt-sky .pkt').length === 4);
    assert.equal(await h.frame.locator('.rt-src').count(), 1);
    await h.page.evaluate(() => window.testVisibility(false));
    await service.waitForFunction(() => document.querySelectorAll('.rt-sky .pkt').length === 0);
    const before = reads(harness); await h.page.waitForTimeout(1200);
    assert.equal(reads(harness), before, 'hidden tab does not poll');
    await h.page.evaluate(() => window.testVisibility(true));
    await service.waitForFunction(() => document.querySelectorAll('.rt-sky .pkt').length === 4);
    harness.revoke();
    await h.frame.locator('.rt-off').filter({ hasText: /Access is unavailable or was revoked/ }).waitFor();
    assert.equal(await h.frame.locator('.rt-src').count(), 0);
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
    const a = h.frame.locator('.rt-src').filter({ has: h.frame.locator('small', { hasText: /^alpha ·/ }) });
    const b = h.frame.locator('.rt-src').filter({ has: h.frame.locator('small', { hasText: /^bravo ·/ }) });
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
    noErrors(h);
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
    assert.equal(await h.frame.locator('.rt-sub').count(),3);
    assert.equal(await h.frame.locator('.rt-accts>li[title]:not(.rt-sub)').count(),4);
    assert.deepEqual(await h.frame.locator('.rt-src b').allTextContents(),['Claude Code','Pi','OpenCode']);
    assert((await h.frame.locator('.rt-sub').evaluateAll(ns=>ns.map(n=>n.title))).some(s=>s.includes('Sent by Pi')));
    assert.doesNotMatch(await h.frame.locator('#rt').innerText(),/PRIVATE-GROUP|private-key/);
    await service.waitForFunction(()=>document.querySelectorAll('.rt-sky .pkt.held').length===3);
    const fold=h.frame.locator('.rt-sub').first();await fold.focus();await h.page.keyboard.press('Enter');
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
    for (const r of fixture.routes) { r.model = 'long-requested-model-'.repeat(12); for (const s of r.order) s.model = r.model; for (const tr of r.tries) tr.model = r.model; }
    const harness = await browserHarness({ fixture }); t.after(() => harness.close());
    for (const [name, viewport] of [['desktop', { width: 1280, height: 900 }], ['mobile', { width: 390, height: 844 }]]) {
      const h = await contextFor(browser, harness, viewport);
      try {
        const service = await readyStage(h.page, h.frame);
        assert.equal(await h.frame.locator('.rt-src').count(), 4);
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

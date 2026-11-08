import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { chromium, webkit } from 'playwright';
import { browserHarness } from './harness.mjs';
import { sessionKey } from '../../lib/contracts.mjs';
import { createAggregator } from '../../lib/aggregator.mjs';
import { initialTrace, makeRoute } from '../fixtures/trace.mjs';

const engineName = process.env.BROWSER ?? 'chromium';
const engine = { chromium, webkit }[engineName];
if (!engine) throw new Error('BROWSER must be chromium or webkit');
const alpha = sessionKey('claude-code', 'session-alpha');
const bravo = sessionKey('claude-code', 'session-bravo');
const codex = sessionKey('codex', 'session-alpha');

async function contextFor(browser, harness, viewport = { width: 1280, height: 900 }, reducedMotion = 'reduce') {
  const context = await browser.newContext({ viewport, reducedMotion, hasTouch: viewport.width <= 660 });
  context.setDefaultTimeout(10_000);
  await context.route('**/*', route => {
    const url = new URL(route.request().url());
    return url.hostname === '127.0.0.1' ? route.continue() : route.abort();
  });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(harness.url);
  const frame = page.frameLocator('iframe');
  await frame.locator('button').first().waitFor();
  // Headless WebKit occasionally suspends RAF presentation after changing pages,
  // including newly opened contexts. Native input wakes it before stability-based
  // actions; no forced click, retry, disabled animation, or test-only UI mutation.
  if (engineName === 'webkit') {
    await page.mouse.move(viewport.width / 2, viewport.height / 2);
    await page.mouse.wheel(0, 1);
  }
  return { context, page, frame, errors };
}

async function disclose(frame, selector = '#evidence-details') {
  const details = frame.locator(selector);
  if (!(await details.evaluate(element => element.open))) await details.locator(':scope > summary').click();
}

async function metric(frame, name, value) {
  await disclose(frame);
  const locator = frame.locator(`[data-testid="metric-${name}"]`);
  await locator.waitFor();
  const until = Date.now() + 10_000;
  while (true) {
    const text = (await locator.textContent()).trim();
    if (text === String(value)) return;
    if (Date.now() >= until) assert.equal(text, String(value), `metric ${name}`);
    await new Promise(resolve => setTimeout(resolve, 40));
  }
}

async function waitOption(frame, value) {
  await frame.locator(`#session-select option[value="${value}"]`).waitFor({ state: 'attached' });
}
async function select(frame, value, count) {
  await waitOption(frame, value);
  await frame.locator('#session-select').selectOption(value);
  await metric(frame, 'requests', count);
}

async function waitUntil(check, message) {
  const deadline = Date.now() + 10_000;
  while (!(await check())) {
    assert(Date.now() < deadline, message);
    await new Promise(resolve => setTimeout(resolve, 40));
  }
}

function serviceFrame(page) {
  return page.frames().find(frame => frame.url().includes('/_magpie/service/'));
}

async function readyStage(page, frame) {
  await frame.locator('[data-testid="graph-request"]').first().waitFor();
  const service = serviceFrame(page);
  await service.waitForFunction(() => [...document.querySelectorAll('[data-testid="route-wire"]')]
    .every(path => path.getAttribute('d')?.includes('C')));
  return service;
}

async function noOverflow(service, label) {
  const bounds = await service.evaluate(() => {
    const viewport = innerWidth;
    const offenders = [...document.querySelectorAll('body *')].flatMap(element => {
      const rect = element.getBoundingClientRect();
      if (!rect.width || !rect.height || (rect.right <= viewport + 1 && rect.left >= -1 && element.scrollWidth <= element.clientWidth + 1)) return [];
      const style = getComputedStyle(element);
      return [{ tag: element.tagName, id: element.id, class: element.getAttribute('class'),
        left: rect.left, right: rect.right, width: rect.width, display: style.display,
        minWidth: style.minWidth, maxWidth: style.maxWidth, grid: style.gridTemplateColumns,
        overflow: style.overflowX, flex: style.flex }];
    });
    return { scroll: document.documentElement.scrollWidth, viewport, offenders,
      bodyOverflow: getComputedStyle(document.body).overflowX,
      rootOverflow: getComputedStyle(document.documentElement).overflowX };
  });
  assert(bounds.scroll <= bounds.viewport + 1, `${label} horizontal overflow: ${JSON.stringify(bounds)}`);
  assert(!['hidden', 'clip'].includes(bounds.bodyOverflow), 'body must not hide horizontal overflow');
  assert(!['hidden', 'clip'].includes(bounds.rootOverflow), 'root must not hide horizontal overflow');
}

async function capture(page, frame, name) {
  const prefix = new URL(`../../artifacts/browser/${engineName}-${name}`, import.meta.url).pathname;
  // The default viewport capture is deliberately separate from the full iframe.
  await page.screenshot({ path: `${prefix}-viewport.png` });
  const contentHeight = await serviceFrame(page).evaluate(() => document.documentElement.scrollHeight);
  await page.locator('iframe').evaluate((element, height) => { element.style.height = `${height}px`; }, contentHeight);
  try {
    await page.screenshot({ path: `${prefix}.png`, fullPage: true });
    await frame.locator('#route-graph').screenshot({ path: `${prefix}-routes.png` });
  } finally {
    await page.locator('iframe').evaluate(element => { element.style.height = '100%'; });
  }
}

function denseTrace() {
  const routes = Array.from({ length: 9 }, (_, index) => {
    const route = makeRoute(200 + index, { agent: `agent-${'long-selector-label-'.repeat(3)}`,
      session: `dense-session-${index}-${'x'.repeat(80)}`, model: 'group/long-requested-model-'.repeat(8) });
    route.order = Array.from({ length: 4 }, (_, candidate) => ({ ...route.order[0],
      id: `key-${index}-${candidate}`, provider: `provider-${'long-name-'.repeat(9)}`,
      model: `model-${'long-model-'.repeat(10)}`, name: 'Long provider name' }));
    route.tries = [{ id: route.order[0].id, model: route.order[0].model, start: route.time, done: false }];
    return route;
  });
  return { ...initialTrace(), seq: 300, routes, ids: routes.map(row => row.id) };
}

await test(`${engineName}: session routing through an opaque-origin page-service bridge`, { timeout: 240_000 }, async t => {
  const browser = await engine.launch({ headless: true });
  t.after(() => browser.close());

  await t.test('diagram-first stage keeps concurrent identities and surviving nodes across polls', async t => {
    const harness = await browserHarness(); t.after(() => harness.close());
    const { context, page, frame, errors } = await contextFor(browser, harness); t.after(() => context.close());
    const service = await readyStage(page, frame);
    assert.equal(await frame.locator('[data-testid="routing-stage"]').count(), 1);
    assert.equal(await frame.locator('[data-testid="routing-hub"]').count(), 1);
    assert.equal(await frame.locator('#evidence-details').evaluate(element => element.open), false);
    assert.equal(await frame.locator('#metrics').isVisible(), false);
    assert.equal(await frame.locator('[data-testid="request-row"]').count(), 0, 'timeline stays lazy');
    assert.equal(await frame.locator('[data-testid="graph-request"]').count(), 2);
    assert.equal(await frame.locator('[data-testid="graph-candidate"]').count(), 4);
    const destinations = await frame.locator('[data-testid="graph-candidate"]').evaluateAll(rows => rows.map(row => ({
      scene: row.dataset.sceneKey, request: row.dataset.requestKey,
      label: row.querySelector('.destination-name').textContent,
    })));
    assert.equal(new Set(destinations.map(row => row.scene)).size, 4);
    const sameLabels = destinations.filter(row => row.label === destinations[0].label);
    assert.equal(sameLabels.length, 2);
    assert.equal(new Set(sameLabels.map(row => row.request)).size, 2, 'same-label keys must not merge across requests');
    const first = frame.locator('[data-testid="graph-request"]').first();
    const selectedKey = await first.getAttribute('data-request-key');
    await first.focus();
    assert.match(await frame.locator('#stage-inspection').innerText(), /session-alpha/);
    for (const selector of ['[data-testid="route-wire"]', '[data-testid="graph-request"]', '[data-testid="graph-candidate"]']) {
      const rows = await frame.locator(selector).evaluateAll(elements => elements.map(element => ({
        request: element.dataset.requestKey, inspected: element.dataset.inspected, dimmed: element.dataset.dimmed,
      })));
      assert(rows.every(row => row.inspected === String(row.request === selectedKey)));
      assert(rows.every(row => row.dimmed === String(row.request !== selectedKey)));
    }
    await service.evaluate(() => {
      window.savedStageNodes = [...document.querySelectorAll('[data-testid="graph-request"], [data-testid="graph-candidate"], [data-testid="route-wire"]')];
    });
    const reads = harness.observations.length;
    await waitUntil(() => harness.observations.length >= reads + 2, 'two unchanged polls must complete');
    assert.equal(await service.evaluate(() => window.savedStageNodes.every(node => node.isConnected)), true);
    const update = initialTrace(); update.seq = 6;
    update.routes = [makeRoute(102, { session: 'session-bravo', done: true, seq: 6, tokens: 900 })];
    harness.aggregator.applyTrace(update);
    await frame.locator('#refresh').click();
    await service.waitForFunction(() => document.querySelector('[data-testid="metric-tokens"]').textContent === '1,100');
    assert.equal(await service.evaluate(() => window.savedStageNodes.every(node => node.isConnected)), true,
      'an unrelated session update preserves exact source, destination and path DOM objects');
    const edge = frame.locator('#route-hit-area path').first();
    const edgeRequest = await edge.getAttribute('data-request-key');
    const edgePoint = await edge.evaluate(path => {
      const point = path.getPointAtLength(path.getTotalLength() * .35);
      const screen = new DOMPoint(point.x, point.y).matrixTransform(path.getScreenCTM());
      return { x: screen.x, y: screen.y, hit: document.elementFromPoint(screen.x, screen.y) === path };
    });
    assert.equal(edgePoint.hit, true, 'the visible connector has a reachable hit target');
    const frameBox = await page.locator('iframe').boundingBox();
    // SVG locator offset origins differ by engine when stroke extends its bounds;
    // use the actual screen point and native input after verifying hit testing.
    await page.mouse.move(frameBox.x + edgePoint.x, frameBox.y + edgePoint.y);
    assert.equal(await frame.locator('[data-testid="graph-request"][data-inspected="true"]').getAttribute('data-request-key'), edgeRequest);
    await page.mouse.click(frameBox.x + edgePoint.x, frameBox.y + edgePoint.y);
    assert.equal(await frame.locator('[data-testid="graph-request"]').getAttribute('data-request-key'), edgeRequest);
    await frame.locator('#clear-focus').click();
    await first.focus(); await first.press('Enter');
    assert.equal(await frame.locator('#route-graph').getAttribute('data-mode'), 'focused');
    assert.equal(await frame.locator('[data-testid="graph-request"]').count(), 1);
    assert.equal(await frame.locator('#session-select').inputValue(), '');
    await metric(frame, 'requests', 5);
    await frame.locator('[data-testid="request-row"]').filter({ hasText: 'Request 101' }).getByRole('button', { name: 'Replay attempts' }).click();
    assert.equal(await frame.locator('[data-testid="graph-attempt"]').count(), 1);
    assert.equal(await frame.locator('[data-testid="graph-candidate"][data-highlight="true"]').count(), 1);
    await frame.locator('#replay-next').click();
    assert.equal(await frame.locator('[data-testid="graph-attempt"]').count(), 2);
    assert.match(await frame.locator('#focused-evidence').innerText(), /Fallback · different candidate/);
    await metric(frame, 'requests', 5);
    assert.equal(errors.length, 0);
  });

  await t.test('two tabs isolate sessions, same textual IDs and unknown traffic', async t => {
    const harness = await browserHarness();
    t.after(() => harness.close());
    const one = await contextFor(browser, harness);
    t.after(() => one.context.close());
    await metric(one.frame, 'requests', 5);
    await select(one.frame, alpha, 2);
    await metric(one.frame, 'inFlight', 2);
    await metric(one.frame, 'fallbacks', 1);
    await metric(one.frame, 'retries', 0);
    const two = await contextFor(browser, harness);
    t.after(() => two.context.close());
    await select(two.frame, bravo, 1);
    await metric(two.frame, 'inFlight', 0);
    await metric(two.frame, 'fallbacks', 0);
    await metric(one.frame, 'requests', 2);
    assert.equal(harness.collectorStarts, 1, 'all browsers share the one service collector');
    const update = initialTrace();
    update.seq = 6;
    update.routes = [makeRoute(101, { fallback: true, done: true, seq: 6 })];
    harness.aggregator.applyTrace(update);
    await one.page.bringToFront();
    await metric(one.frame, 'inFlight', 1);
    await metric(one.frame, 'fallbacks', 1);
    await metric(two.frame, 'fallbacks', 0);
    await metric(two.frame, 'requests', 1);

    const aRequests = await one.frame.locator('[data-testid="request-row"]').allTextContents();
    assert.equal(aRequests.length, 2);
    assert(!aRequests.join('\n').includes('session-bravo'));
    // Headless WebKit can report this page visible after bringToFront while
    // delivering no animation frames. Re-enter the viewport and scroll toward
    // the request list, as a person would; native input resumes presentation.
    // The click still performs all of Playwright's normal stability checks.
    await one.page.bringToFront();
    const viewport = one.page.viewportSize();
    await one.page.mouse.move(viewport.width / 2, viewport.height / 2);
    await one.page.mouse.wheel(0, viewport.height);
    const focused = one.frame.locator('[data-testid="request-focus"]').first();
    await focused.click();
    await metric(one.frame, 'requests', 2);
    assert.equal(await one.frame.locator('#session-select').inputValue(), alpha);
    await select(one.frame, codex, 1);
    await metric(one.frame, 'inFlight', 0);
    await select(one.frame, 'unknown', 1);
    assert.equal(await one.frame.locator('#session-select').inputValue(), 'unknown');
    await one.frame.locator('#all-sessions').click();
    await metric(one.frame, 'requests', 5);
    const rendered = await one.frame.locator('body').innerText();
    assert(!rendered.includes('DO-NOT-EXPOSE'));
    assert(!rendered.includes('private-a@example.invalid'));
    assert(!rendered.includes('secret-token'));
    assert.equal(one.errors.length + two.errors.length, 0, 'no browser script errors');
    const requests = harness.observations.filter(row => row.path.startsWith('api/') && row.method === 'GET');
    assert(requests.length > 0);
    assert(requests.every(row => row.authorization && row.origin === 'null'));
  });

  await t.test('scope changes discard delayed replies and history is visibly partial', async t => {
    const harness = await browserHarness();
    t.after(() => harness.close());
    const { context, frame, errors } = await contextFor(browser, harness);
    t.after(() => context.close());
    await metric(frame, 'requests', 5);
    harness.delay(alpha, 700);
    await frame.locator('#session-select').selectOption(alpha);
    await frame.locator('#session-select').selectOption(bravo);
    await metric(frame, 'requests', 1);
    // A must not repaint B even after the deliberately delayed A reply's deadline.
    await new Promise(resolve => setTimeout(resolve, 950));
    assert.equal(await frame.locator('#session-select').inputValue(), bravo);
    await metric(frame, 'requests', 1);
    await metric(frame, 'fallbacks', 0);
    await frame.locator('#period-select').selectOption('7d');
    await frame.locator('#coverage').filter({ hasText: /ledger/i }).waitFor();
    await metric(frame, 'fallbacks', '—');
    await metric(frame, 'cost', '—');
    const text = await frame.locator('body').innerText();
    assert.match(text, /partial|incomplete/i);
    assert.match(text, /attempt.*unavailable|no.*attempt|does not reconstruct/i);
    assert.equal(errors.length, 0);
  });

  await t.test('subagents require explicit opt-in and stale data loses live claims', async t => {
    const fixture = initialTrace();
    fixture.routes.push(makeRoute(106, { session: 'session-alpha', sub: 'worker', subagentId: 'actor-1', seq: 6 }));
    fixture.ids.push(106); fixture.seq = 6;
    const harness = await browserHarness({ fixture });
    t.after(() => harness.close());
    const { context, frame } = await contextFor(browser, harness);
    t.after(() => context.close());
    await select(frame, alpha, 2);
    await frame.locator('#include-children').check();
    await metric(frame, 'requests', 3);
    await frame.locator('#include-children').uncheck();
    await metric(frame, 'requests', 2);
    harness.aggregator.setConnection({ status: 'stale', reason: 'Gateway unavailable' });
    await frame.locator('#connection-status').filter({ hasText: /stale|disconnect/i }).waitFor();
    assert.equal(await frame.locator('#session-select').inputValue(), alpha, 'an outage does not expire the selection');
  });

  await t.test('first-use setup stays in bridge options and never URL credentials', async t => {
    const harness = await browserHarness({ unprovisioned: true });
    t.after(() => harness.close());
    const { context, page, frame, errors } = await contextFor(browser, harness);
    t.after(() => context.close());
    const setup = frame.getByRole('button', { name: /secure|setup|enable|set up/i }).first();
    await setup.click();
    await metric(frame, 'requests', 5);
    assert.equal(harness.options.apiToken.length, 43);
    assert.equal(harness.options.installationId.length, 22);
    assert(!page.frames().some(f => f.url().includes(harness.options.apiToken)));
    assert(!harness.observations.some(row => row.path.includes(harness.options.apiToken)));
    const storage = await page.frames().find(f => f.url().includes('/_magpie/service/')).evaluate(() => {
      try { localStorage.setItem('probe', '1'); return 'available'; } catch { return 'blocked'; }
    });
    assert.equal(storage, 'blocked');
    assert.equal(errors.length, 0);
  });

  await t.test('backend replacement clears replay and selected hints exclude worker activity', async t => {
    const routes = [makeRoute(101, { done: true, fallback: true }),
      makeRoute(102, { sub: 'worker', subagentId: 'actor', model: 'worker-model' })];
    const fixture = { ...initialTrace(), seq: 102, routes, ids: routes.map(row => row.id) };
    const harness = await browserHarness({ fixture }); t.after(() => harness.close());
    const { context, frame } = await contextFor(browser, harness); t.after(() => context.close());
    await select(frame, alpha, 1); await metric(frame, 'inFlight', 0);
    await disclose(frame, '.picker-tools');
    assert.match(await frame.locator('#session-hint').innerText(), /0 unfinished.*selected scope/);
    assert(!((await frame.locator('#session-hint').innerText()).includes('worker-model')));
    const option = await frame.locator('#session-select option:checked').textContent();
    assert(!option.includes('1 in flight'));
    await frame.locator('[data-testid="request-replay"]').first().click();
    await frame.locator('#replay-next').click();
    assert.match(await frame.locator('#replay-status').innerText(), /2 of 2/);
    const replacement = createAggregator({ instanceId: 'new-backend' });
    replacement.applyTrace(fixture, { full: true }); replacement.setConnection({ status: 'live' });
    harness.replaceProjection(replacement);
    await frame.locator('#notice').filter({ hasText: /telemetry instance changed/i }).waitFor();
    assert.equal(await frame.locator('#replay-controls').isVisible(), false);
    assert.equal(await frame.locator('#session-select').inputValue(), alpha);
    await metric(frame, 'requests', 1);
  });

  await t.test('unmatched billable attempts are evidence, not extra historical requests', async t => {
    const base = { route_id: 888, t: '2026-11-06T12:00:00Z', agent: 'claude-code', provider: 'provider-a',
      model: 'model-a', in: 10, out: 20, status: 200, cost: 0.1, priced: true, ms: 1000 };
    const harness = await browserHarness({ ledgerRows: [base, { ...base, handed_on: true, status: 429 }] });
    t.after(() => harness.close());
    const { context, frame } = await contextFor(browser, harness); t.after(() => context.close());
    await metric(frame, 'requests', 5);
    await frame.locator('#period-select').selectOption('today'); await metric(frame, 'requests', 1);
    assert.equal(await frame.locator('[data-testid="request-row"]').count(), 2);
    assert.match(await frame.locator('#pagination-status').innerText(), /2 of 2 evidence records/);
    assert.match(await frame.locator('#request-list').innerText(), /Billable attempt for request 888/);
    assert(!((await frame.locator('#graph-note').innerText()).includes('Each card is one request')));
    await frame.locator('[data-testid="request-row"]').filter({ hasText: 'Billable attempt for request 888' })
      .getByRole('button', { name: 'Focus route' }).click();
    assert.equal(await frame.locator('[data-testid="graph-candidate"]').count(), 0);
    assert.equal(await frame.locator('[data-testid="route-wire"]').count(), 0);
    assert.match(await frame.locator('#route-destinations').innerText(), /Billable evidence only.*topology unavailable/);
    await metric(frame, 'requests', 1);
  });

  await t.test('zero-candidate and unmatched evidence never invent destination paths', async t => {
    const empty = makeRoute(401, { order: [], tries: [] });
    const unmatched = makeRoute(402, { order: [], tries: [{ id: 'unmatched', model: 'unknown', done: false }] });
    const fixture = { ...initialTrace(), seq: 402, routes: [empty, unmatched], ids: [401, 402] };
    const harness = await browserHarness({ fixture }); t.after(() => harness.close());
    const { context, page, frame } = await contextFor(browser, harness); t.after(() => context.close());
    await readyStage(page, frame);
    assert.equal(await frame.locator('[data-testid="graph-candidate"]').count(), 0);
    assert.equal(await frame.locator('[data-testid="graph-unavailable"]').count(), 2);
    assert.equal(await frame.locator('[data-testid="route-wire"][data-kind="destination"]').count(), 0);
    assert.match(await frame.locator('#route-destinations').innerText(), /No candidates recorded/);
    assert.match(await frame.locator('#graph-note').innerText(), /unmatched attempt.*no destination inferred/);
  });

  await t.test('normal motion sends once per observed attempt and stops at every lifecycle gate', async t => {
    let route = makeRoute(301);
    const other = makeRoute(302, { session: 'session-bravo' });
    const fixture = { ...initialTrace(), seq: 302, routes: [route, other], ids: [301, 302] };
    const harness = await browserHarness({ fixture }); t.after(() => harness.close());
    const { context, page, frame, errors } = await contextFor(browser, harness, { width: 1280, height: 900 }, 'no-preference');
    t.after(() => context.close());
    await readyStage(page, frame); await select(frame, alpha, 1);
    const service = serviceFrame(page);
    await service.waitForFunction(() => document.querySelector('#route-graph').dataset.motion === 'live');
    assert.equal(await frame.locator('[data-testid="route-packet"]').count(), 0, 'first snapshot is a baseline');
    assert(await service.evaluate(() => document.getAnimations().some(animation => animation.playState === 'running')),
      'the normal-motion context actually runs active-route animations');
    await service.evaluate(() => {
      window.flightEvents = [];
      new MutationObserver(records => {
        for (const record of records) for (const element of record.addedNodes) {
          if (element.dataset?.testid === 'route-packet') window.flightEvents.push({
            key: element.dataset.attemptKey, request: element.dataset.requestKey, index: element.dataset.attemptIndex,
          });
        }
      }).observe(document.querySelector('#route-sky'), { childList: true });
    });
    let seq = 302, expectedFlights = 0;
    const refresh = () => frame.locator('#refresh').click();
    const countFlights = () => service.evaluate(() => window.flightEvents.length);
    const send = async () => {
      const attempts = route.tries.map(attempt => ({ ...attempt, done: true, status: 429 }));
      attempts.push({ id: route.order[0].id, model: route.order[0].model, start: route.time, done: false });
      route = { ...route, seq: ++seq, tries: attempts, done: false };
      harness.aggregator.applyTrace({ ...fixture, seq, routes: [route] });
      await refresh(); expectedFlights++;
      await waitUntil(async () => await countFlights() === expectedFlights, 'one packet must be added for the new actual attempt');
      await frame.locator('[data-testid="route-packet"]').waitFor();
      assert.equal(await frame.locator('[data-testid="route-packet"]').getAttribute('data-attempt-index'), String(route.tries.length));
    };
    const stopped = async () => {
      await service.waitForFunction(() => document.querySelector('#route-graph').dataset.motion === 'stopped');
      assert.equal(await frame.locator('[data-testid="route-packet"]').count(), 0);
      assert.equal(await service.evaluate(() => document.getAnimations().filter(animation => animation.playState === 'running').length), 0);
    };
    const resumed = async () => {
      await service.waitForFunction(() => document.querySelector('#route-graph').dataset.motion === 'live');
      assert.equal(await frame.locator('[data-testid="route-packet"]').count(), 0, 'resuming establishes a baseline, not a send');
      assert.equal(await countFlights(), expectedFlights);
    };
    await send();
    const packet = frame.locator('[data-testid="route-packet"]');
    const transform = await packet.getAttribute('transform');
    await waitUntil(async () => (await packet.getAttribute('transform')) !== transform, 'a live packet must actually move');
    await packet.waitFor({ state: 'detached' });
    await refresh();
    const reads = harness.observations.length;
    await waitUntil(() => harness.observations.length >= reads + 2, 'unchanged polls complete');
    assert.equal(await countFlights(), 1, 'polls cannot resend an attempt');
    harness.aggregator.applyTrace({ ...fixture, seq: ++seq, routes: [{ ...other, seq, tokens: 12 }] });
    await refresh(); assert.equal(await countFlights(), 1, 'another session update cannot send');

    for (const status of ['stale', 'disconnected']) {
      await send(); harness.aggregator.setConnection({ status, reason: 'fixture outage' });
      await refresh(); await stopped();
      harness.aggregator.setConnection({ status: 'live' }); await refresh(); await resumed();
    }

    await send(); await page.evaluate(() => window.testVisibility(false)); await stopped();
    // An attempt arriving while hidden is baseline evidence on resume.
    route = { ...route, seq: ++seq, tries: [...route.tries.map(attempt => ({ ...attempt, done: true, status: 429 })),
      { id: route.order[0].id, model: route.order[0].model, start: route.time, done: false }] };
    harness.aggregator.applyTrace({ ...fixture, seq, routes: [route] });
    await page.evaluate(() => window.testVisibility(true));
    await service.waitForFunction(index => [...document.querySelectorAll('.destination-meta small')]
      .some(element => element.textContent.includes(`#${index} retry`)), route.tries.length);
    await resumed();

    await send(); await page.emulateMedia({ reducedMotion: 'reduce' }); await stopped();
    await page.emulateMedia({ reducedMotion: 'no-preference' }); await resumed();

    await send(); await frame.locator('#period-select').selectOption('today');
    await frame.locator('#connection-status').filter({ hasText: 'History snapshot' }).waitFor(); await stopped();
    assert.equal(await frame.locator('[data-testid="route-wire"]').count(), 0, 'unavailable history has no invented paths');
    assert.match(await frame.locator('#route-destinations').innerText(), /Historical topology unavailable/);
    await frame.locator('#period-select').selectOption('live'); await resumed();

    await send(); await frame.locator('[data-testid="request-replay"]').first().click(); await stopped();
    await frame.locator('#replay-exit').click(); await resumed();

    await send();
    route = { ...route, seq: ++seq, done: true, status: 200,
      tries: route.tries.map((attempt, index) => ({ ...attempt, done: true, status: index === route.tries.length - 1 ? 200 : 429 })) };
    harness.aggregator.applyTrace({ ...fixture, seq, routes: [route] }); await refresh();
    await metric(frame, 'inFlight', 0);
    assert.equal(await frame.locator('[data-testid="route-packet"]').count(), 0, 'completion cancels its flight');
    await refresh(); assert.equal(await countFlights(), expectedFlights, 'outcome/revision changes cannot send');

    const replacement = createAggregator({ instanceId: 'motion-replacement' });
    replacement.applyTrace({ ...fixture, seq, routes: [route, other] }, { full: true });
    replacement.setConnection({ status: 'live' }); harness.replaceProjection(replacement);
    await refresh(); await frame.locator('#notice').filter({ hasText: /instance changed/ }).waitFor(); await resumed();
    await select(frame, bravo, 1); await resumed();
    await select(frame, alpha, 1); await resumed();
    const events = await service.evaluate(() => window.flightEvents);
    assert.equal(new Set(events.map(event => event.key)).size, events.length, 'every observed send identity is unique');
    assert.equal(errors.length, 0);
  });

  await t.test('mobile and desktop themes remain usable with no horizontal overflow', async t => {
    const harness = await browserHarness();
    t.after(() => harness.close());
    await mkdir(new URL('../../artifacts/browser/', import.meta.url), { recursive: true });
    for (const [name, viewport] of [['desktop', { width: 1280, height: 900 }], ['mobile', { width: 390, height: 844 }]]) {
      const { context, page, frame, errors } = await contextFor(browser, harness, viewport);
      try {
        const service = await readyStage(page, frame);
        for (const dark of [false, true]) {
          await page.evaluate(value => window.testTheme(value), dark);
          await service.waitForFunction(expected => document.documentElement.dataset.theme === expected, dark ? 'dark' : 'light');
          const theme = dark ? 'dark' : 'light';
          assert.equal(await frame.locator('#evidence-details').evaluate(element => element.open), false);
          assert.equal(await frame.locator('#metrics').isVisible(), false);
          const graphBox = await frame.locator('#route-graph').boundingBox();
          const hubBox = await frame.locator('#route-hub').boundingBox();
          assert(graphBox.y < viewport.height / 2 && hubBox.y + hubBox.height < viewport.height,
            'the first viewport must show the diagram and hub, not metrics');
          await noOverflow(service, `${name} ${theme} closed details`);
          await capture(page, frame, `${name}-${theme}-default`);
          const summary = frame.locator('#evidence-details > summary');
          if (name === 'mobile') await summary.tap();
          else { await summary.focus(); await summary.press('Enter'); }
          await metric(frame, 'requests', 5);
          await noOverflow(service, `${name} ${theme} open details`);
          await capture(page, frame, `${name}-${theme}-details`);
          await summary.click();
          await service.evaluate(() => window.scrollTo(0, 0));
        }
        await disclose(frame, '.picker-tools');
        await frame.locator('#session-search').focus();
        await frame.locator('#session-search').fill('codex');
        await waitOption(frame, codex);
        await frame.locator('#session-search').fill('');
        await select(frame, alpha, 2);
        await noOverflow(service, `${name} selected scope`);
        await frame.locator('#evidence-details > summary').click();
        await frame.locator('.picker-tools > summary').click();
        await service.evaluate(() => window.scrollTo(0, 0));
        if (name === 'mobile') {
          await frame.locator('[data-testid="graph-candidate"]').first().locator('button').tap();
          assert.equal(await frame.locator('[data-testid="graph-request"]').count(), 1);
          assert.equal(await frame.locator('#session-select').inputValue(), alpha);
          await frame.locator('#clear-focus').tap();
        }
        await capture(page, frame, `${name}-selected-dark`);
        assert.equal(errors.length, 0);
      } finally { await context.close(); }
    }
  });

  await t.test('bounded dense evidence and long native options fit both widths and themes', async t => {
    const harness = await browserHarness({ fixture: denseTrace() }); t.after(() => harness.close());
    for (const [name, viewport] of [['desktop', { width: 1280, height: 900 }], ['mobile', { width: 390, height: 844 }]]) {
      const { context, page, frame, errors } = await contextFor(browser, harness, viewport);
      try {
        const service = await readyStage(page, frame);
        assert.equal(await frame.locator('[data-testid="graph-request"]').count(), 6);
        assert.equal(await frame.locator('[data-testid="graph-candidate"]').count(), 12);
        assert.equal(await frame.locator('[data-testid="graph-candidate"][data-active="true"]').count(), 6,
          'every displayed request retains its current destination before unused candidates');
        assert.match(await frame.locator('#graph-note').innerText(), /Not shown: 3 records \(3 active\), 24 candidates/);
        await disclose(frame, '.picker-tools');
        await frame.locator('#show-more-routes').click();
        await metric(frame, 'requests', 9);
        const detail = frame.locator('[data-testid="request-details"]').first();
        await detail.locator('summary').click();
        for (const dark of [false, true]) {
          await page.evaluate(value => window.testTheme(value), dark);
          await service.waitForFunction(expected => document.documentElement.dataset.theme === expected, dark ? 'dark' : 'light');
          await noOverflow(service, `${name} dense ${dark ? 'dark' : 'light'}`);
        }
        await capture(page, frame, `${name}-dense-dark`);
        await detail.locator('summary').click();
        const option = await frame.locator('#session-select option').nth(1).getAttribute('value');
        await frame.locator('#session-select').selectOption(option); await metric(frame, 'requests', 1);
        await noOverflow(service, `${name} long selected native option`);
        assert.equal(errors.length, 0);
      } finally { await context.close(); }
    }
  });
});

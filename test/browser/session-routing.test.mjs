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

async function contextFor(browser, harness, viewport = { width: 1280, height: 900 }) {
  const context = await browser.newContext({ viewport, reducedMotion: 'reduce' });
  await context.route('**/*', route => {
    const url = new URL(route.request().url());
    return url.hostname === '127.0.0.1' ? route.continue() : route.abort();
  });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(harness.url);
  const frame = page.frameLocator('iframe');
  return { context, page, frame, errors };
}

async function metric(frame, name, value) {
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

await test(`${engineName}: session routing through an opaque-origin page-service bridge`, { timeout: 180_000 }, async t => {
  const browser = await engine.launch({ headless: true });
  t.after(() => browser.close());

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
  });

  await t.test('mobile and desktop themes remain usable with no horizontal overflow', async t => {
    const harness = await browserHarness();
    t.after(() => harness.close());
    await mkdir(new URL('../../artifacts/browser/', import.meta.url), { recursive: true });
    for (const [name, viewport] of [['desktop', { width: 1280, height: 900 }], ['mobile', { width: 390, height: 844 }]]) {
      const { context, page, frame, errors } = await contextFor(browser, harness, viewport);
      try {
        await select(frame, alpha, 2);
        for (const dark of [false, true]) {
          await page.evaluate(value => window.testTheme(value), dark);
          const serviceFrame = page.frames().find(f => f.url().includes('/_magpie/service/'));
          await serviceFrame.waitForFunction(expected => document.documentElement.dataset.theme === expected, dark ? 'dark' : 'light');
          const widths = await serviceFrame.evaluate(() => ({ scroll: document.documentElement.scrollWidth, viewport: innerWidth }));
          assert(widths.scroll <= widths.viewport + 1, `${name} horizontal overflow: ${JSON.stringify(widths)}`);
          // Expand only the fixture host for capture: fullPage does not normally
          // include an iframe's internal scrollable content.
          const contentHeight = await serviceFrame.evaluate(() => document.documentElement.scrollHeight);
          await page.locator('iframe').evaluate((element, height) => { element.style.height = `${height}px`; }, contentHeight);
          await page.screenshot({ path: new URL(`../../artifacts/browser/${engineName}-${name}-${dark ? 'dark' : 'light'}.png`, import.meta.url).pathname, fullPage: true });
          await frame.locator('#route-graph').screenshot({ path: new URL(`../../artifacts/browser/${engineName}-${name}-${dark ? 'dark' : 'light'}-routes.png`, import.meta.url).pathname });
          await page.locator('iframe').evaluate(element => { element.style.height = '100%'; });
        }
        await frame.locator('#session-search').focus();
        await frame.locator('#session-search').fill('codex');
        await waitOption(frame, codex);
        await frame.locator('#session-search').fill('');
        assert.equal(errors.length, 0);
      } finally { await context.close(); }
    }
  });
});

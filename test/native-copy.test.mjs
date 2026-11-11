import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import http from 'node:http';
import { execFileSync } from 'node:child_process';
import { createNativeProjector, nativeSnapshot } from '../lib/native-routing.mjs';
import { browserHarness, nativeTrace } from './browser/harness.mjs';
import { fileURLToPath } from 'node:url';
import { generate, extract, sessionPatch, freeNames, REVISION, SOURCE_ACTIVITY } from '../scripts/vendor-native-routing.mjs';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const vendor = path.join(root, 'ui/vendor/magpie');
const read = p => fs.readFileSync(path.join(vendor, p),'utf8');
const source = read('upstream/plugins/routing/client.js');
const sourceLines = (a,b) => source.split('\n').slice(a-1,b).join('\n');
const baseline = extract(source), patched = sessionPatch(baseline).code;

test('pristine native snapshot, generated files, CSS and MIT notice reproduce exactly', () => {
  const result = generate({check:true});
  assert.equal(JSON.parse(read('source-manifest.json')).revision, REVISION);
  assert.equal(read('routing.css'), read('upstream/plugins/routing/routing.css'));
  assert.equal(read('app.css'), read('upstream/app.css'));
  assert.equal(read('LICENSE'), read('upstream/LICENSE'));
  assert.match(read('LICENSE'), /Copyright \(c\) 2026 yetone/);
  assert.ok(!result.staticFiles.some(p => /upstream|test-only/.test(p)));
  assert.ok(result.staticFiles.includes('vendor/magpie/LOBE_ICONS_LICENSE'));
  assert.match(read('LOBE_ICONS_LICENSE'), /Copyright \(c\) 2023 LobeHub/);
  const clients = JSON.parse(read('source-manifest.json')).clients;
  for (const [id,name,icon] of [['claude','Claude Code','claudecode-color'],['codex','Codex','codex-color'],['pi','Pi','pi'],['opencode','OpenCode','opencode']]) {
    assert.deepEqual(clients.find(c=>c.id===id),{id,name,icon});
  }
  assert.ok(baseline.includes(sourceLines(295,312)), 'native responsive width observer unchanged');
  assert.equal(result.sourceChanges,28);
  assert.equal(JSON.parse(read('source-grouping-patch.json')).length,28);
  assert.ok(patched.includes('const ags = [...new Set(out.map(sourceKey))].slice(-4);'), 'native four-source admission retained');
  assert.ok(patched.includes(sourceLines(5202,5203)), 'native LIVE=4 startup/resume request scheduling unchanged');
});
test('source patch leaves actual destination reconciliation and flight geometry intact', () => {
  for (const [a,b] of [[2181,2197],[2500,2606],[4834,4845],[4997,5001],[5162,5195],[1651,1659],[1673,1690]]) {
    assert.ok(baseline.includes(sourceLines(a,b)), `baseline native lines ${a}-${b}`);
    assert.ok(patched.includes(sourceLines(a,b)), `session patch native lines ${a}-${b}`);
  }
  assert.match(patched,/flying\.set\(dot, \{ id: tryseat\(r, r\.tries\[i\]\), agent: r\.agent, sourceKey: sourceKey\(r\) \}\)/);
  assert.match(patched,/const A = agents\.get\(sourceKey\(r\)\)/);
  assert.match(patched,/hues\(actualAgents\)/);
  assert.match(patched,/header\(cur, actualAgents\.length\)/);
});
test('known sources use exact agent/recorded session; unknown sources use stable request identity', () => {
  const code=patched.match(/const sourceKey = \(r\) =>[\s\S]*?;\n/)[0];
  const key=vm.runInNewContext(`(host=>{${code}; return sourceKey;})`)({generation:()=>4});
  const r={id:1,time:'2026-11-09T00:00:00Z',agent:'claude',session:'a'};
  assert.equal(key(r),JSON.stringify(['session','claude','a']));
  assert.equal(key(r),key({...r,id:2,model:'other',folder:'other',projectName:'Same project',provider:'else',parentSession:'parent'}));
  assert.notEqual(key({...r,projectName:'Same project'}),key({...r,session:'b',projectName:'Same project'}));
  assert.notEqual(key(r),key({...r,session:'b'}));
  assert.notEqual(key(r),key({...r,agent:'codex'}));
  assert.notEqual(key({...r,session:''}),key({...r,id:2,session:''}));
  assert.equal(key({...r,session:''}),key({...r,session:'',model:'changed'}));
});
// Test the exact generated pure grouping functions, not a replacement renderer.
const activity = vm.runInNewContext(`(() => {
  const host = { generation: () => 4 }, at = Date.parse, LINGER = 12000;
  ${patched.match(/const sourceKey = \(r\) =>[\s\S]*?;\n/)[0]}
  ${SOURCE_ACTIVITY}
  return { sourceKey, sourceRequests, requestModel, mainModels, actorGroups, actorModels };
})()`);
test('activity groups every retained source-local request, without using turns, parents or a flight limit', () => {
  const r = { id: 1, time: '2026-11-09T00:00:00Z', agent: 'claude', session: 'same', done: false, actorId: 'actor_abcdefgA', isSubagent: true };
  const clock = Date.parse(r.time) + 20000;
  const rs = [r, { ...r, id: 2 }, { ...r, id: 3, done: true, ms: 15000 },
    { ...r, id: 4, actorId: 'actor_abcdefgB', done: true, ms: 19000 },
    { ...r, id: 5, actorId: undefined }, { ...r, id: 6, actorId: undefined },
    { ...r, id: 7, actorId: undefined, isSubagent: false, subagentId: 'native-turn-only' },
    { ...r, id: 8, done: true }, { ...r, id: 9, agent: 'codex' },
    { ...r, id: 10, session: 'child', parentSession: 'same' }];
  const relevant = activity.sourceRequests(activity.sourceKey(r), [], new Map(rs.map(x => [x.id, x])), clock);
  assert.deepEqual([...relevant].map(x => x.id), [1, 2, 3, 4, 5, 6, 7]);
  const groups = activity.actorGroups(relevant);
  assert.equal(groups.size, 3);
  assert.deepEqual({ ...groups.get(r.actorId) }, { id: r.actorId, active: 2, ended: 1 });
  assert.deepEqual({ ...groups.get('actor_abcdefgB') }, { id: 'actor_abcdefgB', active: 0, ended: 1 });
  assert.deepEqual({ ...groups.get(null) }, { id: null, active: 2, ended: 0 });
  const selected = activity.sourceRequests(activity.sourceKey(r), [rs[7]], new Map(rs.map(x => [x.id, x])), clock);
  assert.equal(selected.some(x => x.id === 8), true, 'selected old request remains explicit recent/ended activity');
  assert.equal(activity.actorGroups(Array.from({ length: 60 }, (_, i) => ({ ...r, actorId: `actor_${i}` }))).size, 60);
  assert.equal(activity.actorGroups([]).size, 0);
});
test('opaque actor keys stay distinct across prefix collisions and identical models without display labels', () => {
  const ids = ['actor_123456789012345A', 'actor_123456789012345B', 'actor_other0123456789', 'actor_other0123456789X'];
  const requests = ids.map(actorId => ({ actorId, model: 'same-model', done: false }));
  assert.deepEqual([...activity.actorGroups(requests).keys()], ids);
  assert.deepEqual([...activity.actorModels(requests)].map(([id, models]) => [id, [...models]]), ids.map(id => [id, ['same-model']]));
  assert.doesNotMatch(SOURCE_ACTIVITY, /actorLabels|data-actor-id|dataset\.actorId/);
});
test('actor models preserve recorded names, prefer concrete served evidence and never infer provider labels', () => {
  const request = { actorId: 'actor_models', isSubagent: true, done: false };
  const cases = [
    [{ served: 'served-model', model: 'requested-model' }, 'served-model'],
    [{ served: 'served-model', model: 'group/opaque-request' }, 'served-model'],
    [{ served: 'group/opaque-served', model: 'requested-model' }, 'requested-model'],
    [{ served: '', model: 'requested-model' }, 'requested-model'],
    [{ served: 42, model: 'requested-model' }, 'requested-model'],
    [{ served: 'org/served-model', model: 'other/requested-model', provider: 'Not a model' }, 'org/served-model'],
    [{ model: 'org/model/version', provider: 'Provider display name' }, 'org/model/version'],
    [{ provider: 'Provider display name' }, null],
    [{ model: 'provider/requested-model', requestedModelName: 'requested-model' }, 'requested-model'],
    [{ served: 'org/served-model', model: 'provider/requested-model', requestedModelName: 'requested-model' }, 'org/served-model'],
    [{ model: 'org/model/version', requestedModelName: '' }, 'org/model/version'],
    [{ model: 'org/model/version', requestedModelName: 'group/not-a-model' }, 'org/model/version'],
    [{ model: 'group/opaque-request', requestedModelName: 'not-request-evidence' }, null],
    [{ model: 'Unknown model', requestedModelName: 'not-request-evidence', evidence: { reasons: ['model_unavailable'] } }, null],
    [{ requestedModelName: 'not-request-evidence' }, null],
    [{ served: {}, model: false }, null],
    [{ model: 'group/opaque-request' }, null],
    [{ served: 'group/opaque-served' }, null],
    [{ served: null, model: null }, null],
    [{ model: 'Unknown model', evidence: { reasons: ['model_unavailable'] } }, null],
    [{ served: 'concrete-served', model: 'Unknown model', evidence: { reasons: ['model_unavailable'] } }, 'concrete-served'],
    [{}, null],
    [{ order: [{ model: 'candidate-only' }], tries: [{ model: 'attempt-only', served: 'attempt-served' }], group: { name: 'Group name' } }, null],
  ];
  for (const [fields, expected] of cases) {
    assert.deepEqual([...activity.actorModels([{ ...request, ...fields }]).get(request.actorId)], [expected], JSON.stringify(fields));
    const main = { id: 1, agent: 'claude', session: 'model-evidence', ...fields };
    assert.equal(activity.requestModel(main), expected, JSON.stringify(fields));
    assert.deepEqual([...activity.mainModels(activity.sourceKey(main), new Map([[main.id, main]]))], [expected], 'main and child requests share the exact model evidence precedence');
  }
  const requests = [
    { ...request, model: 'z-model' }, { ...request, model: 'a-model' }, { ...request, model: 'a-model' },
    { ...request, model: 'group/opaque-request' }, { ...request },
    { ...request, actorId: 'actor_other', model: 'a-model' },
    { ...request, actorId: undefined, model: 'known-aggregate-model' }, { ...request, actorId: undefined },
    { model: 'not-subagent', done: false },
  ];
  const models = activity.actorModels(requests);
  assert.equal(models.size, 3);
  assert.deepEqual([...models.get(request.actorId)].filter(x => x !== null), ['a-model', 'z-model']);
  assert.equal([...models.get(request.actorId)].filter(x => x === null).length, 1, 'unknown evidence survives alongside concrete models');
  assert.deepEqual([...models.get('actor_other')], ['a-model']);
  assert.deepEqual([...models.get(null)].filter(x => x !== null), ['known-aggregate-model']);
  assert.equal([...models.get(null)].filter(x => x === null).length, 1);
  assert.deepEqual([...activity.actorModels([...requests].reverse()).get(request.actorId)], [...models.get(request.actorId)], 'model order does not depend on request arrival');
  assert.equal(activity.actorModels([]).size, 0);
});
test('main models include only exact-source unmarked requests, deduplicate active evidence and sort unknown last', () => {
  const base = { id: 1, agent: 'claude', session: 'main-session', time: '2026-11-09T00:00:00Z', done: false };
  const requests = [
    { ...base, model: 'org/z-model/v1' },
    { ...base, id: 2, model: 'a-model' },
    { ...base, id: 3, model: 'a-model', subagentId: 'native-turn-not-an-actor', parentSession: 'other' },
    { ...base, id: 4, model: 'group/unavailable' },
    { ...base, id: 5 },
    { ...base, id: 6, model: 'ended-model', done: true },
    { ...base, id: 7, model: 'child-model', isSubagent: true },
    { ...base, id: 8, model: 'actor-model', actorId: 'actor_example' },
    { ...base, id: 9, model: 'title-model', kind: 'title' },
    { ...base, id: 10, model: 'other-helper-model', kind: 'auxiliary' },
    { ...base, id: 11, model: 'other-session-model', session: 'child-session', parentSession: base.session },
    { ...base, id: 12, model: 'other-agent-model', agent: 'codex' },
  ].map(r => Object.freeze(r));
  const retained = new Map(requests.map(r => [r.id, r])), before = [...retained];
  const key = activity.sourceKey(base);
  assert.deepEqual([...activity.mainModels(key, retained)], ['a-model', 'org/z-model/v1', null]);
  assert.deepEqual([...activity.mainModels(key, new Map([...retained].reverse()))], ['a-model', 'org/z-model/v1', null], 'arrival order does not affect distinct active models');
  assert.deepEqual([...retained], before, 'main selection never mutates retained requests or map order');
  assert.deepEqual([...activity.mainModels(activity.sourceKey(requests[10]), retained)], ['other-session-model']);
  assert.deepEqual([...activity.mainModels(activity.sourceKey(requests[11]), retained)], ['other-agent-model']);
  const unknown = [{ ...base, session: '', model: 'unknown-one' }, { ...base, session: '', id: 2, model: 'unknown-two' }];
  const unknownMap = new Map(unknown.map(r => [r.id, r]));
  for (const request of unknown) assert.deepEqual([...activity.mainModels(activity.sourceKey(request), unknownMap)], [request.model], 'unknown sessions retain their exact request boundary');
});
test('main models retain the latest eligible request beyond linger, forget evicted evidence and never fall back from missing models', () => {
  const base = { agent: 'claude', session: 'retained-main', time: '2026-11-09T00:00:00Z', done: true, ms: 100 };
  const older = { ...base, id: 1, time: '2026-11-09T00:00:10Z', model: 'older-id-model' };
  const latest = { ...base, id: 2, model: 'org/latest-model/v2' };
  const child = { ...base, id: 3, model: 'newer-child-model', actorId: 'actor_child', done: false };
  const title = { ...base, id: 4, model: 'newer-title-model', kind: 'title', done: false };
  const retained = new Map([title, latest, child, older].map(r => [r.id, r])), key = activity.sourceKey(latest);
  assert.deepEqual([...activity.sourceRequests(key, [], retained, Date.parse(base.time) + 60000)].map(r => r.id), [3, 4], 'completed main evidence is outside activity linger');
  assert.deepEqual([...activity.mainModels(key, retained)], ['org/latest-model/v2'], 'latest retained main is selected by id, not time or newest child');
  latest.done = false; delete latest.model;
  assert.deepEqual([...activity.mainModels(key, retained)], [null], 'unknown active evidence must not revive a concrete ended model');
  latest.done = true;
  assert.deepEqual([...activity.mainModels(key, retained)], [null], 'unknown latest-ended evidence must not revive an older model either');
  retained.delete(latest.id);
  assert.deepEqual([...activity.mainModels(key, retained)], ['older-id-model'], 'only still-retained eligible evidence can replace an evicted request');
  retained.delete(older.id);
  assert.deepEqual([...activity.mainModels(key, retained)], [], 'child and auxiliary calls cannot supply a missing main model');
  retained.clear();
  assert.deepEqual([...activity.mainModels(key, retained)], []);
});
test('active model evidence replaces ended models until all retained requests end, without mutating input', () => {
  const requests = [
    { actorId: 'actor_one', done: true, model: 'old-model' },
    { actorId: 'actor_one', done: false, model: 'z-model' },
    { actorId: 'actor_one', done: false, model: 'a-model' },
    { actorId: 'actor_two', done: true, model: 'old-model' },
    { actorId: 'actor_two', done: false, model: 'group/unknown' },
  ];
  const before = structuredClone(requests);
  const frozen = Object.freeze(requests.map(r => Object.freeze({ ...r })));
  assert.deepEqual([...activity.actorModels(frozen).get('actor_one')], ['a-model', 'z-model']);
  assert.deepEqual(requests, before, 'model derivation does not modify its requests');
  assert.deepEqual([...activity.actorModels(requests).get('actor_one')], ['a-model', 'z-model']);
  assert.deepEqual([...activity.actorModels(requests).get('actor_two')], [null], 'an unknown active model must not fall back to an ended concrete model');
  requests[1].done = true;
  assert.deepEqual([...activity.actorModels(requests).get('actor_one')], ['a-model']);
  for (const request of requests) request.done = true;
  const ended = activity.actorModels(requests);
  assert.deepEqual([...ended.get('actor_one')], ['a-model', 'old-model', 'z-model']);
  assert.equal([...ended.get('actor_two')].includes(null), true);
  assert.deepEqual([...ended.get('actor_two')].filter(x => x !== null), ['old-model']);
  assert.deepEqual(requests.map(({ done, ...r }) => r), before.map(({ done, ...r }) => r));
  assert.deepEqual([...activity.actorGroups(requests).keys()], ['actor_one', 'actor_two']);
});
test('the same actor in different recorded sessions or agents has only that source model evidence', () => {
  const base = { id: 1, time: '2026-11-09T00:00:00Z', actorId: 'actor_shared', agent: 'claude', session: 'one', done: false };
  const requests = [
    { ...base, model: 'one-model' },
    { ...base, id: 2, session: 'two', parentSession: 'one', model: 'two-model' },
    { ...base, id: 3, agent: 'codex', model: 'other-agent-model' },
    { ...base, id: 4, actorId: undefined, isSubagent: false, parentSession: 'two', model: 'title-helper-model' },
  ];
  const retained = new Map(requests.map(r => [r.id, r]));
  for (const request of requests.slice(0, 3)) {
    const local = activity.sourceRequests(activity.sourceKey(request), [], retained, Date.parse(base.time));
    assert.deepEqual([...activity.actorModels(local).get(base.actorId)], [request.model]);
    assert.deepEqual([...activity.actorGroups(local).keys()], [base.actorId]);
  }
});
test('conflicting and absent actor evidence share one aggregate rather than fabricated identities', () => {
  const raw = nativeTrace({ sessions: ['same', 'same', 'same', 'same'] });
  raw.routes[0].subagentId = 'one'; raw.routes[0].sub = 'conflicting';
  raw.routes[1].kind = 'collab_spawn';
  raw.routes[2].subagent = {};
  raw.routes[3].kind = 'title'; raw.routes[3].parentSession = 'same';
  const projector = createNativeProjector(), requests = raw.routes.map(projector.route);
  assert.equal(requests[0].actorId, undefined);
  assert.equal(requests[0].evidence.reasons.includes('actor_identity_conflict'), true);
  assert.deepEqual([...activity.actorGroups(requests).keys()], [null]);
  assert.deepEqual({ ...activity.actorGroups(requests).get(null) }, { id: null, active: 3, ended: 0 });
  assert.deepEqual([...activity.actorModels(requests).get(null)], ['example-model']);
});
// Minimal DOM ports exercise the exact generated helpers; browser suites check
// actual icon artwork, layout and interaction separately.
const activityElement = (tagName, className = '') => ({
  tagName, className, children: [], attributes: {}, listeners: new Map(), parent: null, text: '',
  style: { setProperty(name, value) { this[name] = String(value); } },
  classList: { values: new Set(), toggle(name, on) { on ? this.values.add(name) : this.values.delete(name); } },
  get textContent() { return this.text + this.children.map(n => n.textContent).join(''); },
  set textContent(text) { this.text = text; this.children = []; },
  setAttribute(name, value) { this.attributes[name] = String(value); },
  append(...nodes) { for (const node of nodes) { node.parent = this; this.children.push(node); } },
  remove() { if (this.parent) this.parent.children = this.parent.children.filter(n => n !== this); this.parent = null; },
  replaceChildren(...nodes) { for (const node of this.children) node.parent = null; this.children = []; this.append(...nodes); },
  addEventListener(name, listener) { this.listeners.set(name, listener); },
  getBoundingClientRect() { return { top: 0, bottom: 20 }; },
});
test('source activity renders only client icons and recorded models; request state stays in accessible metadata', () => {
  const el = activityElement;
  const clients = JSON.parse(read('source-manifest.json')).clients;
  const render = vm.runInNewContext(`(() => { ${SOURCE_ACTIVITY}; return sourceActivity; })()`, {
    el, icon: name => { const node = el('span', 'ic'); node.setAttribute('data-icon', name); return node; },
    agentOf: id => clients.find(c => c.id === id), agentName: id => clients.find(c => c.id === id)?.name || id,
    setText: (node, text) => { node.textContent = text; }, setAttr: (node, name, value) => node.setAttribute(name, value),
    t: (text, params = {}) => text.replace(/\{(\w+)\}/g, (_, key) => params[key]),
  });
  for (const [agent, name, expectedIcon] of [['claude', 'Claude Code', 'claudecode-color'], ['codex', 'Codex', 'codex-color'], ['unregistered-client', 'unregistered-client', 'generic']]) {
    const a = { node: el('div', 'rt-src') };
    render(a, []);
    assert.equal(a.activity, undefined);
    assert.equal(a.node.children.length, 0, 'empty activity creates no wrapper or spacing');
    const requests = [
      { agent, actorId: 'actor_private_one', model: 'org/model/version', provider: 'Provider canary', done: false },
      { agent, actorId: 'actor_private_two', model: 'org/model/version', provider: 'Provider canary', done: false },
      { agent, isSubagent: true, provider: 'Provider canary', done: false },
    ];
    render(a, requests);
    const { node, list, overflow, entries } = a.activity;
    assert.equal(node.tagName, 'div');
    assert.equal(node.className, 'rt-activity');
    assert.deepEqual(node.children, [list, overflow]);
    assert.deepEqual(node.children.map(n => [n.tagName, n.className]), [['ul', 'rt-actors'], ['span', 'rt-activity-overflow']]);
    const descendants = n => [n, ...n.children.flatMap(descendants)];
    for (const child of descendants(node)) {
      assert(!['details', 'summary', 'button'].includes(child.tagName));
      assert(!child.className.split(' ').includes('chev'));
      assert.equal('open' in child, false);
      assert.equal(child.attributes['aria-expanded'], undefined);
      assert.equal(child.listeners.has('toggle'), false);
    }
    assert.equal('summary' in a.activity, false);
    assert.equal(list.attributes.title, 'Gateway request activity only; task completion is unknown.');
    assert.equal(list.attributes['aria-label'], 'Model request activity — scroll for all activity');
    assert.equal(list.tabIndex, 0);
    assert.equal(entries.size, 3, 'identical model names never merge distinct request identities');
    for (const [id, entry] of entries) {
      const expectedModel = id ? 'org/model/version' : 'Unknown model';
      assert.equal(entry.node.textContent, expectedModel, 'no visible heading, label, request count or identity');
      assert.deepEqual(entry.node.children.map(n => [n.tagName, n.className]), [['span', 'ic'], ['span', 'rt-actor-models']]);
      assert.equal(entry.node.children[0].attributes['data-icon'], expectedIcon);
      assert.equal(entry.node.children[0].attributes['aria-hidden'], 'true');
      assert.equal(entry.node.style['--depth'], '1');
      assert.equal(entry.node.classList.values.has('on'), true);
      assert.equal(entry.chips.children[0].tagName, 'code');
      assert.equal(entry.chips.children[0].className, 'mdl');
      assert.equal(entry.chips.children[0].attributes.title, expectedModel);
      const description = `${name}\n${expectedModel}\nRequest active\n1 active requests; 0 ended requests${id ? '' : '\nRequest identity unavailable'}`;
      assert.equal(entry.node.attributes.title, description);
      assert.equal(entry.node.attributes['aria-label'], description);
      assert.doesNotMatch(description, /Sub-agent|子代理|Provider canary|actor_private/);
    }
    const rows = [...list.children], chips = rows.map(n => n.children[1].children[0]);
    list.scrollTop = 40;
    render(a, requests);
    assert.equal(a.activity.node, node); assert.equal(a.activity.list, list);
    assert.equal(list.scrollTop, 40, 'unchanged polls preserve the always-visible list scroll');
    assert(rows.every((row, i) => row === list.children[i] && chips[i] === row.children[1].children[0]), 'unchanged polls preserve rows, icons and chips');
    requests[0].done = true;
    render(a, requests);
    assert.equal(list.children[0], rows[0]);
    assert.equal(rows[0].classList.values.has('on'), false);
    assert.match(rows[0].attributes.title, /\nRequests ended\n0 active requests; 1 ended requests$/);
    assert.equal(rows[0].textContent, 'org/model/version');
    render(a, []);
    assert.equal(a.activity, undefined);
    assert.equal(a.node.children.length, 0);
  }
});
function presentationHarness(routes, clock = Date.parse('2026-11-09T00:01:00Z')) {
  const present = vm.runInNewContext(`(() => {
    const host = { generation: () => 4 }, at = Date.parse, LINGER = 12000, skew = 500;
    ${patched.match(/const sourceKey = \(r\) =>[\s\S]*?;\n/)[0]}
    ${patched.match(/const sourceLabel = \(r\) =>[^\n]+/)[0]}
    ${patched.match(/const foldersOf = [^\n]+/)[0]}
    ${patched.match(/const lastLevel = [^\n]+/)[0]}
    ${SOURCE_ACTIVITY}
    return sourcePresentation;
  })()`, {
    routes, Date: class extends Date { static now() { return clock - 500; } },
    el: activityElement, agentName: id => id === 'claude' ? 'Claude Code' : id,
    t: text => text, setText: (node, text) => { node.textContent = text; },
    setAttr: (node, name, value) => node.setAttribute(name, value),
  });
  const a = { node: activityElement('div', 'rt-src'), sub: activityElement('small') };
  a.node.append(a.sub);
  return { a, present };
}
test('source presentation separates disclosed project/session labels and main models without separator text', () => {
  const base = { id: 1, agent: 'claude', session: 'session-a', model: 'requested', done: false };
  const cases = [
    [['專案'], base, '專案'],
    [['one', 'two', 'one'], base, 'one, two'],
    [['/disclosed/one'], base, 'one'],
    [['專案'], { ...base, session: 'session-b', model: 'other' }, '專案'],
    [[], { ...base, folder: '/secret/no-inference' }, 'session-a'],
    [[], { ...base, session: 'session-with-a-long-id' }, 'session-with…'],
    [[], { ...base, id: 7, session: '' }, 'Unknown session · #7'],
  ];
  for (const [projects, request, label] of cases) {
    const rs = projects.length ? projects.map((projectName, i) => ({ ...request, id: i + 1, projectName })) : [request];
    const { a, present } = presentationHarness(new Map(rs.map(r => [r.id, r])));
    present(a, activity.sourceKey(rs[0]), rs);
    assert.equal(a.label.textContent, label);
    assert.deepEqual(a.sub.children.map(n => [n.tagName, n.className]), [['span', 'rt-source-label'], ['span', 'rt-main-models']]);
    assert.equal(a.models.children.length, 1);
    const chip = a.models.children[0];
    assert.deepEqual([chip.tagName, chip.className, chip.textContent, chip.attributes.title], ['code', 'rt-main-model', request.model, request.model]);
    assert.equal(a.sub.textContent, label + request.model, 'spacing is CSS, never a visible separator or duplicated model');
    assert.equal(a.node.attributes.title, ['Claude Code', request.model, request.session ? `Session id: ${request.session}` : label,
      ...new Set(projects), ...(request.folder ? [`Folder: ${request.folder}`] : [])].join('\n'));
  }
});
test('source presentation keeps stable nodes and retained main truth independent of staged/replay children and linger', () => {
  const base = { agent: 'claude', session: 'full-session-with-a-long-id', time: '2026-11-09T00:00:00Z' };
  const main = { ...base, id: 1, done: true, ms: 100, model: 'org/main-model/v1', projectName: 'Old project' };
  const child = { ...base, id: 2, actorId: 'actor_child', model: 'child-model', done: false, projectName: 'Current project', folder: '/disclosed/current' };
  const title = { ...base, id: 3, kind: 'title', model: 'title-model', done: false, projectName: 'Current project' };
  const map = new Map([main, child, title].map(r => [r.id, r])), key = activity.sourceKey(main);
  const { a, present } = presentationHarness(map);
  present(a, key, [child, title]);
  assert.equal(a.label.textContent, 'Current project', 'project disclosure still observes linger, unlike retained main evidence');
  assert.deepEqual(a.models.children.map(n => n.textContent), ['org/main-model/v1']);
  assert.equal(a.node.attributes.title, 'Claude Code\norg/main-model/v1\nSession id: full-session-with-a-long-id\nCurrent project\nFolder: /disclosed/current');
  const nodes = [a.label, a.models, ...a.models.children];
  present(a, key, [{ ...child, model: 'synthetic-replay-child', done: true }]);
  assert.equal([a.label, a.models, ...a.models.children].every((node, i) => node === nodes[i]), true, 'unchanged evidence preserves wrapper and model node identities');
  main.model = 'org/updated-main/v2';
  present(a, key, [child]);
  assert.equal(a.label, nodes[0]); assert.equal(a.models, nodes[1]);
  assert.notEqual(a.models.children[0], nodes[2]);
  assert.deepEqual(a.models.children.map(n => n.textContent), ['org/updated-main/v2']);
  map.delete(main.id);
  present(a, key, [{ ...main, done: false }, child]);
  assert.equal(a.label, nodes[0]); assert.equal(a.models, nodes[1]);
  assert.equal(a.models.children.length, 0, 'a staged ghost cannot restore an evicted main, and child/title models cannot stand in for it');
  assert.equal(a.node.attributes.title, 'Claude Code\nSession id: full-session-with-a-long-id\nCurrent project\nFolder: /disclosed/current');
  map.set(main.id, { ...main, done: false, model: undefined });
  map.set(4, { ...main, id: 4, done: false, model: 'a-model' });
  map.set(5, { ...main, id: 5, done: false, model: 'z-model' });
  present(a, key, [child]);
  assert.deepEqual(a.models.children.map(n => n.textContent), ['a-model', 'z-model', 'Unknown model']);
  assert.match(a.node.attributes.title, /^Claude Code\na-model\nz-model\nUnknown model\nSession id:/);
});
test('renderer has no core fetch/write/body/provider/history execution paths or unresolved application globals', () => {
  assert.doesNotMatch(patched, /\bfetch\s*\(|\bapi\s*\(|function (loadBodies|renderBodies|loadGroups|groupAction|renderHist|renderActs|renderCtx|loadDays|poll)\b/);
  const runtime = read('native-helpers.js');
  assert.doesNotMatch(runtime,/\/api\/icons\//);
  const globals = new Set(['Image','MutationObserver','Node','NodeFilter','ResizeObserver','URL','URLSearchParams','cancelAnimationFrame','clearInterval','clearTimeout','console','document','getComputedStyle','innerHeight','localStorage','location','matchMedia','navigator','performance','requestAnimationFrame','setInterval','setTimeout','window']);
  assert.deepEqual(freeNames(runtime+'\n'+patched).filter(n=>!globals.has(n)),[]);
  assert.doesNotMatch(read('client.js'), /testNative|testMode|baseline=/);
});

export function fixture(sessions=['session-a'], options={}) {
  const now='2026-11-09T00:00:10.000Z';
  const routes=sessions.map((session,i)=>({id:i+1,agent:options.agents?.[i] || 'claude',session,provider:'p_fixture',model:'example-model',time:'2026-11-09T00:00:09.000Z',done:!!options.done,status:options.done?200:0,ms:options.done?600:0,
    order:[{id:'seat_fixture_a',kind:'account',provider:'p_fixture',name:'Provider 01',who:'Account 01',model:'example-model',icon:'anthropic',routing:'order',rank:0,known:true,used:35,renews:['2026-11-09T01:00:00.000Z']},
      {id:'seat_fixture_b',kind:'account',provider:'p_fixture',name:'Provider 01',who:'Account 02',model:'example-model',icon:'anthropic',routing:'order',rank:1,known:true,used:15,renews:['2026-11-09T02:00:00.000Z']}],
    tries:[{id:'seat_fixture_a',model:'example-model',start:'2026-11-09T00:00:09.000Z',done:!!options.done,status:options.done?200:0,ms:options.done?600:0}],left:[]}));
  return {apiVersion:1,object:'trace',instanceId:'fixture',generation:1,revision:1,connection:{status:'live',lastUpdated:now},coverage:{partial:true,reasons:[]},now,seq:1,pid:77,serves:'fixture',ids:routes.map(r=>r.id),routes,totals:{requests:options.done?routes.length:0,rerouted:0,errors:0},lifted:{}};
}

const adapterSource = fs.readFileSync(path.join(root,'ui/app.js'),'utf8');
const tick = () => new Promise(resolve=>setImmediate(resolve));
const credentials = {apiToken:'A'.repeat(43),installationId:'A'.repeat(22)};
function adapter(fetch = () => { throw new Error('unexpected fetch'); }) {
  const context = vm.createContext({AbortController,TextDecoder,Uint8Array,setTimeout,clearTimeout,fetch});
  vm.runInContext(adapterSource,context);
  return context.SessionRouting;
}
function controllerHarness(options={}) {
  const states=[],resets=[],timers=new Map(); let next=0;
  const controller=adapter().createController({readOptions:async()=>credentials,onState:d=>states.push(d),onReset:d=>resets.push(d),
    setTimer(fn){const id=++next;timers.set(id,fn);return id;},clearTimer:id=>timers.delete(id),...options});
  return {controller,states,resets,timers};
}
function projectedFixture() {
  const d=fixture(['session-a','session-a','session-b']),projector=createNativeProjector();
  return nativeSnapshot({...d,source:projector.metadata(d),routes:d.routes.map(projector.route)});
}
test('adapter accepts actual sanitized native projection, nullable facts, and rejects malformed envelopes',()=>{
  const ui=adapter(), d=projectedFixture();
  assert.equal(ui.validOptions(credentials),true);
  assert.equal(ui.validOptions({...credentials,apiToken:'B'.repeat(43)}),false);
  assert.equal(ui.validateSnapshot(d),d);
  assert.equal(d.coverage.inventory,'unavailable');
  assert.equal(d.routes[0].order[0].id,d.routes[2].order[0].id);
  assert.equal(ui.validateSnapshot({...d,now:null,totals:null}).now,null);
  for(const invalid of [{...d,connection:{status:'invented'}},{...d,ids:[1,1,2]}, {...d,ids:[1]}, {...d,totals:{requests:-1}},
    {...d,routes:[{...d.routes[0],order:[{id:''}]}]}, {...d,routes:[{...d.routes[0],time:'not-a-time'}]},
    {...d,now:1},{...d,lifted:[]},{...d,routes:[{...d.routes[0],evidence:{reasons:'unknown'}}]},
    {...d,routes:[{...d.routes[0],tries:[{id:'fixture',done:'yes'}]}]}]) {
    assert.throws(()=>ui.validateSnapshot(invalid),/invalid_snapshot/);
  }
  const withModelName = requestedModelName => ({ ...d, routes: d.routes.map((r, i) => i ? r : { ...r, requestedModelName }) });
  const named = withModelName('org/evidenced-model');
  assert.equal(ui.validateSnapshot(named), named, 'the optional evidenced model name is accepted without rewriting namespaces');
  assert.equal(ui.validateSnapshot(withModelName(null)).routes[0].requestedModelName, null, 'nullable model evidence remains absent');
  for (const invalid of ['', 'x'.repeat(257), 'group/opaque-model', 42, false, {}, []]) {
    assert.throws(()=>ui.validateSnapshot(withModelName(invalid)),/invalid_snapshot/,JSON.stringify(invalid));
  }
});
test('native transport is one fixed relative read, bounded without Content-Length, and rejects malformed UTF-8',async()=>{
  let calls=[];
  const ui=adapter(async(...args)=>{calls.push(args);return new Response(JSON.stringify(projectedFixture()),{headers:{'Content-Type':'application/json'}});});
  const signal=new AbortController().signal;
  await ui.request({signal,token:credentials.apiToken});
  const [url,opts]=calls[0];
  assert.equal(url,'api/native-routing');assert.equal(opts.method,'GET');assert.equal(opts.redirect,'error');assert.equal(opts.credentials,'omit');
  assert.equal(opts.headers.Authorization,`Bearer ${credentials.apiToken}`);
  let canceled=false;
  const huge=adapter(async()=>new Response(new ReadableStream({start(c){c.enqueue(new Uint8Array(8*1024*1024+1));},cancel(){canceled=true;}}),{headers:{'Content-Type':'application/json'}}));
  await assert.rejects(huge.request({signal,token:'fixture'}),/invalid_snapshot/);assert.equal(canceled,true);
  const bad=adapter(async()=>new Response(new Uint8Array([0xff]),{headers:{'Content-Type':'application/json'}}));
  await assert.rejects(bad.request({signal,token:'fixture'}),/invalid_snapshot/);
});
test('native polling coalesces refresh, discards canceled late data, and stops while hidden or revoked',async()=>{
  const calls=[], h=controllerHarness({request:options=>new Promise(resolve=>calls.push({...options,resolve}))});
  h.controller.refresh();await tick();h.controller.refresh();h.controller.refresh();await tick();
  assert.equal(calls.length,1);assert.equal(calls[0].signal.aborted,true);
  calls[0].resolve(projectedFixture());await tick();assert.equal(h.states.length,0);assert.equal(calls.length,2);
  h.controller.setVisible(false);calls[1].resolve(projectedFixture());await tick();
  assert.equal(h.states.length,0);assert.equal(h.timers.size,0);
  h.controller.setVisible(true);await tick();assert.equal(calls.length,3);
  calls[2].resolve(projectedFixture());await tick();assert.equal(h.states.length,1);assert.equal(h.timers.size,1);
  h.controller.stop();assert.equal(h.timers.size,0);
  let reads=0,requests=0;
  const denied=controllerHarness({readOptions:async()=>{reads++;return credentials;},request:async()=>{requests++;throw Object.assign(new Error('private error'),{status:401});}});
  await denied.controller.refresh();assert.equal(reads,2);assert.equal(requests,2);assert.equal(denied.states.length,0);assert.equal(denied.timers.size,0);
  assert.doesNotMatch(denied.resets[0],/private error/);denied.controller.stop();
});

test('pagehide during bridge handshake cannot start an orphan poll',async()=>{
  let ready,reads=0,visibility=0;
  const events=new Map(), renderer={clear(){},visibility(){visibility++;},accept(){},locale(){}};
  const context=vm.createContext({AbortController,TextDecoder,Uint8Array,setTimeout,clearTimeout,parent:{},
    document:{hidden:false,addEventListener(){},documentElement:{dataset:{},classList:{toggle(){}}}},
    addEventListener:(name,fn)=>events.set(name,fn),window:{
      magpie:{ready:new Promise(resolve=>{ready=resolve;}),options:{get(){reads++;}},theme:null},
      mountNativeRouting:()=>renderer,installNativeMask(){}},fetch(){throw new Error('unexpected request');}});
  vm.runInContext(adapterSource,context);
  events.get('pagehide')();ready();await tick();
  assert.equal(reads,0);assert.equal(visibility,1);
});

// Adapted from upstream internal/gui/tests/routing-session-folder.test.cjs
// serve() / routing-stage-routes.test.cjs. The ORIGINAL index and every script
// are read at the pinned git object, not extracted client.baseline.js. All API
// replies exist only in Playwright; no Magpie process or external network runs.
async function originalReference(page, d, { lang = 'en', theme = 'light' } = {}) {
  const upstream=process.env.NATIVE_UPSTREAM || path.resolve(root,'../../git-open/magpie');
  const prefix='internal/gui/assets/';
  // Explicit object database: read pinned blobs only, not working-tree files,
  // hooks, or user Git configuration in the isolated browser subprocess.
  const gitdir=`--git-dir=${path.join(upstream,'.git')}`;
  const names=new Set(execFileSync('git',[gitdir,'ls-tree','-r','--name-only',REVISION,prefix],{encoding:'utf8'}).trim().split('\n'));
  const cache=new Map(), apiRequests=[];
  const assets=p=>{
    const key=prefix+p;
    assert.ok(names.has(key),`reference asset not pinned: ${p}`);
    if(!cache.has(key))cache.set(key,execFileSync('git',[gitdir,'show',`${REVISION}:${key}`],{maxBuffer:32*1024*1024}));
    return cache.get(key);
  };
  // Verify the reference renderer independently against the pristine snapshot.
  assert.equal(assets('plugins/routing/client.js').toString(),source);
  const clients=JSON.parse(read('source-manifest.json')).clients;
  await page.route('**/*',async route=>{
    const u=new URL(route.request().url()),json=data=>route.fulfill({json:data});
    assert.equal(u.origin,'http://magpie-reference.test','reference fixture must never make external requests');
    if(u.pathname==='/boot.js')return route.fulfill({contentType:'text/javascript',body:`window.bootPrefs = ${JSON.stringify({lang,theme,web:true})};`});
    if(u.pathname==='/wails/runtime.js')return route.fulfill({contentType:'text/javascript',body:'export const Window = {};'});
    if(u.pathname.startsWith('/api/')) {
      apiRequests.push({path:u.pathname,method:route.request().method()});
      if(u.pathname==='/api/state')return json({clients,agents:clients.map(c=>({...c,fields:[]})),profiles:[],settings:{lang,theme}});
      if(u.pathname==='/api/gateway/trace') {
        if(u.searchParams.has('wait'))return; // long poll held until context.close()
        return json({...d,mine:true,by:{serves:d.serves,pid:d.pid}});
      }
      if(u.pathname==='/api/gateway/history')return json({cut:false,days:[],routes:[]});
      if(u.pathname==='/api/gateway/session-titles')return json({titles:{}});
      if(u.pathname==='/api/groups')return json({groups:[],pools:[]});
      if(u.pathname==='/api/providers')return json({providers:[],excluded:[],gateway:{running:true,window:true}});
      if(u.pathname==='/api/usage/quotas')return json([]);
      if(u.pathname==='/api/window/fit')return route.fulfill({status:204});
      return json({}); // native harness defaults; logged, test-only, never production
    }
    const p=u.pathname==='/'?'index.html':u.pathname.slice(1);
    const type={'.html':'text/html','.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml','.png':'image/png','.json':'application/json'}[path.extname(p)];
    if(!names.has(prefix+p))return route.fulfill({status:404,body:''});
    return route.fulfill({body:assets(p),contentType:type||'application/octet-stream'});
  });
  await page.goto('http://magpie-reference.test/?view=routing');
  await page.locator('#rt .rt-src').first().waitFor();
  return apiRequests;
}
async function captureUpper(page) {
  return page.locator('#rt').evaluate(root=>{
    const box=root.getBoundingClientRect();
    const selectors=['.rt-top','.rt-what','.rt-mode','.rt-stage','.rt-src','.rt-hub','.rt-accts','.rt-accts>li','.rt-cap','.rt-stats','.rt-log-head','.rt-steps'];
    const nodes=Object.fromEntries(selectors.map(sel=>[sel,[...root.querySelectorAll(sel)].map(n=>{
      const b=n.getBoundingClientRect(),s=getComputedStyle(n);
      return {text:n.textContent,rect:[b.x-box.x,b.y-box.y,b.width,b.height].map(x=>Math.round(x*100)/100),
        style:{font:s.font,color:s.color,background:s.backgroundColor,gap:s.gap,display:s.display}};
    })]));
    const styles = (node, properties) => {
      if (!node) return null;
      const s = getComputedStyle(node);
      return Object.fromEntries(properties.split(' ').map(property => [property, s[property]]));
    };
    const type = 'fontFamily fontSize fontWeight fontStyle fontStretch lineHeight color textAlign';
    const surface = 'backgroundColor paddingTop paddingRight paddingBottom paddingLeft borderTopWidth borderTopStyle borderTopColor borderRadius';
    const glyph = node => ({
      style: styles(node, 'width height color'),
      drawing: node.innerHTML, strokeWidth: node.getAttribute('stroke-width'), viewBox: node.getAttribute('viewBox'),
    });
    const nested = selector => [...root.querySelectorAll(selector)].map(node => ({
      depth: node.style.getPropertyValue('--depth'), active: node.classList.contains('on'),
      // Native mobile destinations have 22px list padding; depth is measured
      // from the list's content edge, not its unrelated responsive offset.
      indent: Math.round((node.getBoundingClientRect().left - node.parentElement.getBoundingClientRect().left -
        node.parentElement.clientLeft - parseFloat(getComputedStyle(node.parentElement).paddingLeft)) * 100) / 100,
      listGap: getComputedStyle(node.parentElement).gap,
      row: styles(node, type + ' ' + surface + ' display alignItems columnGap rowGap flexWrap marginLeft'),
      label: styles(node.querySelector(':scope > b'), type + ' overflow textOverflow whiteSpace'),
      labelMarker: node.querySelector(':scope > b') ? getComputedStyle(node.querySelector(':scope > b'), '::before').content : null,
      model: styles(node.querySelector('code.mdl'), type + ' ' + surface + ' minWidth overflow textOverflow whiteSpace'),
      pill: styles(node.querySelector(':scope > i'), type + ' ' + surface + ' whiteSpace'),
      clientIcon: node.querySelector(':scope > .ic')?.dataset.icon ?? null,
      parentClientIcon: node.closest('.rt-src')?.querySelector(':scope > .rt-ic > .ic')?.dataset.icon ?? null,
    }));
    const sourceHeaders = [...root.querySelectorAll('.rt-src')].map(n => ({
      name: n.querySelector(':scope > b').textContent,
      label: n.querySelector('.rt-source-label')?.textContent ?? null,
      models: n.querySelector('.rt-main-models') ? [...n.querySelectorAll('.rt-main-model')].map(m => m.textContent) : [n.querySelector(':scope > small').textContent],
    }));
    return {width:box.width,height:box.height,nodes,sourceHeaders,wires:[...root.querySelectorAll('.rt-wires path')].map(n=>n.getAttribute('d')),
      nested: nested('.rt-accts > li.rt-sub'), actors: nested('.rt-src .rt-actor'),
      chevrons: [...root.querySelectorAll('.rt-accts > li.rt-sub > .chev > svg')].map(glyph)};
  });
}

const browserEnabled = process.env.NATIVE_BROWSER === '1';
test('client/model-only source fixture and optional native reference: nested styling, flights, stability and eviction', {skip:!browserEnabled}, async t => {
  const {chromium,webkit} = await import('playwright');
  const assetTypes={'.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml','.png':'image/png'};
  const html=baseline=>`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/vendor/magpie/app.css"><link rel="stylesheet" href="/vendor/magpie/routing.css"><script src="/vendor/magpie/native-helpers.js" defer></script><script src="/vendor/magpie/${baseline?'test-only/client.baseline.js':'client.js'}" defer></script><script src="/fixture.js" defer></script></head><body class="window web"></body></html>`;
  const server=http.createServer((req,res)=>{
    if (req.url==='/'||req.url==='/baseline') {res.setHeader('Content-Type','text/html');res.end(html(req.url==='/baseline'));return;}
    if (req.url==='/fixture.js') {res.setHeader('Content-Type','text/javascript');res.end(`window.fixtureGeneration=1;window.fixtureVisible=true;window.testNative=mountNativeRouting({visible:()=>window.fixtureVisible,generation:()=>window.fixtureGeneration,connectionMessage:()=>"Not live"});installNativeMask(()=>new Set(["Account 01","Account 02"]));`);return;}
    if (!req.url.startsWith('/vendor/magpie/')||req.url.includes('..')) {res.writeHead(404);res.end();return;}
    const p=path.join(root,'ui',req.url); if(!fs.existsSync(p)){res.writeHead(404);res.end();return;}
    res.setHeader('Content-Type',assetTypes[path.extname(p)]||'text/plain');res.end(fs.readFileSync(p));
  });
  await new Promise(r=>server.listen(0,'127.0.0.1',r));
  t.after(()=>new Promise(r=>server.close(r)));
  const url=`http://127.0.0.1:${server.address().port}`;
  for (const [name,engine] of [['chromium',chromium],['webkit',webkit]].filter(([name])=>!process.env.BROWSER||process.env.BROWSER===name)) {
    await t.test(name, async()=>{
      const browser=await engine.launch({headless:true});
      try {
        const ctx=await browser.newContext({viewport:{width:1200,height:850}});
        const errors=[],base=await ctx.newPage(),shots=process.env.NATIVE_SCREENSHOT_DIR;
        if(shots)fs.mkdirSync(shots,{recursive:true});
        base.on('pageerror',e=>errors.push(e.message));
        await base.goto(url+'/baseline');
        const d=fixture(['session-a','session-a','session-b']);
        await base.evaluate(d=>testNative.accept(d),d);
        await base.waitForFunction(()=>['.rt-mode','.rt-steps','.rt-what'].every(sel=>document.querySelector(sel)?.textContent.trim()));
        assert.equal(await base.locator('.rt-src').count(),1);
        const baselineText={};
        for(const sel of ['.rt-mode','.rt-steps','.rt-what'])baselineText[sel]=await base.locator(sel).innerText();
        if(shots)await base.screenshot({path:path.join(shots,name+'-baseline.png')});
        await base.close();
        const page=await ctx.newPage();page.on('pageerror',e=>errors.push(e.message));
        await page.goto(url);await page.evaluate(d=>testNative.accept(d),d);
        await page.waitForFunction(()=>['.rt-mode','.rt-steps','.rt-what'].every(sel=>document.querySelector(sel)?.textContent.trim())&&document.querySelectorAll('.rt-sky .pkt').length===3);
        assert.deepEqual(errors,[]);
        assert.equal(await page.locator('.rt-src').count(),2);
        assert.equal(await page.locator('.rt-activity,.rt-actors').count(),0,'no child wrapper changes the no-activity source geometry');
        assert.equal(await page.locator('.rt-accts>li').count(),2);
        assert.equal(await page.locator('.rt-sky .pkt').count(),3);
        const colors=await page.locator('.rt-src').evaluateAll(ns=>ns.map(n=>n.style.getPropertyValue('--agent')));
        assert.equal(new Set(colors).size,1);
        for(const sel of ['.rt-mode','.rt-steps','.rt-what'])assert.equal(await page.locator(sel).innerText(),baselineText[sel]);
        await page.evaluate(()=>window.savedNodes=[...document.querySelectorAll('.rt-src')]);
        d.revision++;d.seq++; await page.evaluate(d=>testNative.accept(d),d);
        assert.equal(await page.evaluate(()=>savedNodes.every((n,i)=>n===document.querySelectorAll('.rt-src')[i])),true);
        if(shots)await page.screenshot({path:path.join(shots,name+'-sessions.png')});
        const done=fixture(['session-a','session-a','session-b'],{done:true});done.revision=3;done.seq=3;
        await page.bringToFront();await page.evaluate(d=>testNative.accept(d),done);await page.waitForTimeout(100);
        await page.getByRole('button',{name:'Replay',exact:true}).click();
        await page.waitForTimeout(100);
        assert.equal(await page.locator('.rt-replay').isVisible(),true);
        await page.getByRole('button',{name:'Stop replay',exact:true}).click();
        await page.locator('#rtMask').click();
        assert.equal(await page.locator('#rtMask').getAttribute('aria-pressed'),'true');
        await page.setViewportSize({width:390,height:844});await page.emulateMedia({colorScheme:'dark',reducedMotion:'reduce'});await page.waitForTimeout(100);
        await page.waitForFunction(()=>document.querySelector('#rt').classList.contains('max560'),{},{timeout:5000});
        if(shots)await page.screenshot({path:path.join(shots,name+'-mobile-dark.png')});
        const fit=await page.evaluate(()=>({width:innerWidth,scroll:document.documentElement.scrollWidth,rt:document.querySelector('#rt').className,
          nodes:[...document.querySelectorAll('.rt-src,.rt-hub,.rt-accts>li')].map(n=>({class:n.className,left:n.getBoundingClientRect().left,right:n.getBoundingClientRect().right}))}));
        assert.equal(fit.scroll<=fit.width && fit.nodes.every(n=>n.left>=0&&n.right<=fit.width),true,JSON.stringify(fit));
        assert.equal(await page.locator('#rt').evaluate(n=>n.classList.contains('max560')),true);
        assert.equal(await page.locator('.rt-accts').evaluate(n=>{const b=n.getBoundingClientRect();return b.left>=0&&b.right<=innerWidth;}),true);
        if(shots)await page.screenshot({path:path.join(shots,name+'-mobile-dark.png')});
        const empty={...done,revision:4,seq:4,ids:[],routes:[]};await page.evaluate(d=>testNative.accept(d),empty);await page.waitForTimeout(100);
        assert.equal(await page.locator('.rt-accts>li.idle').count(),1);
        await page.evaluate(()=>testNative.clear('Access revoked'));
        assert.equal(await page.locator('.rt-src').count(),0);
        assert.equal(await page.locator('.rt-sky .pkt').count(),0);
        assert.deepEqual(errors,[]);

        // Actual backend-shaped absent measurements and partial evidence, not
        // permissive fixture defaults that silently invent quota or zero time.
        await page.setViewportSize({width:1200,height:850});
        const partial=projectedFixture();partial.revision=10;partial.totals=null;
        for(const r of partial.routes){r.done=true;r.status=200;delete r.ms;for(const tr of r.tries){tr.done=true;tr.status=200;delete tr.ms;}}
        await page.evaluate(d=>testNative.accept(d),partial);await page.waitForTimeout(150);
        assert.deepEqual(await page.locator('.rt-stats b').allTextContents(),['—','—','—']);
        assert.doesNotMatch(await page.locator('.rt-steps').innerText(),/in 0 ms|undefined|NaN/);
        assert.doesNotMatch(await page.locator('.rt-what').innerText(),/one on|\d+ on/);
        await page.evaluate(()=>{window.fixtureVisible=false;testNative.visibility();});
        assert.equal(await page.locator('.rt-sky .pkt').count(),0);
        await page.evaluate(()=>{window.fixtureVisible=true;testNative.visibility();});
        await page.evaluate(d=>testNative.accept({...d,revision:11,connection:{status:'stale'}}),partial);
        assert.equal(await page.locator('.rt-src').count(),0);
        assert.match(await page.locator('.rt-off').innerText(),/Not live/);

        // The native four-request startup/resume scheduler is independent of
        // source admission. Six requests of one session still start only four.
        await page.reload();const six=fixture(Array(6).fill('one-session'));
        await page.evaluate(d=>testNative.accept(d),six);await page.waitForTimeout(200);
        assert.equal(await page.locator('.rt-src').count(),1);
        assert.equal(await page.locator('.rt-sky .pkt').count(),4);
        await page.evaluate(()=>{window.fixtureVisible=false;testNative.visibility();});
        await page.evaluate(()=>{window.fixtureVisible=true;testNative.visibility();});
        await page.waitForFunction(()=>document.querySelectorAll('.rt-sky .pkt').length===4,{},{timeout:5000});
        assert.equal(await page.locator('.rt-sky .pkt').count(),4);

        // Approved source-only extensions use the real copied DOM and flight
        // scheduler. These fixtures do not exercise provider projection or add
        // a different animation endpoint for child activity.
        await page.reload();
        await page.addStyleTag({path:path.join(root,'ui/style.css')});
        const actors=fixture([...Array(20).fill('project-session-a'),'project-session-b','independent-child']);
        const actorA='actor_123456789012345A', actorB='actor_123456789012345B';
        for(const [i,r] of actors.routes.entries()) {
          r.projectName='Shared project'; r.folder='/private/disclosed/Shared project'; r.isSubagent=true;
          if(i<18)r.actorId=i<2?actorA:i===2?actorB:`actor_distinct_${i}`;
          if(i>=20)r.actorId=actorA;
        }
        actors.routes[0].model='group/request-reference'; actors.routes[0].served='z-model';
        actors.routes[1].model='a-model'; actors.routes[2].model='a-model';
        delete actors.routes[18].model; actors.routes[18].evidence={reasons:['model_unavailable']};
        actors.routes[3].projectName='Other project';
        actors.routes[21].parentSession='project-session-a';
        await page.evaluate(d=>testNative.accept(d),actors);
        await page.waitForFunction(()=>document.querySelectorAll('.rt-actor').length===20);
        const srcA=page.locator('.rt-src').filter({has:page.locator(':scope > small', {hasText:'Other project'})});
        assert.equal(await page.locator('.rt-src').count(),3);
        assert.equal(await page.locator('.rt-src .rt-src').count(),0);
        assert.equal(await page.locator('.rt-sky .pkt').count(),4);
        assert.equal(await srcA.locator('.rt-actor').count(),18);
        assert.equal(await srcA.locator(':scope > small > .rt-source-label').innerText(),'Shared project, Other project');
        assert.match(await srcA.getAttribute('title'),/^Claude Code\nSession id: project-session-a\n/);
        assert.equal(await page.locator('.rt-src .rt-main-model').count(),0,'all-child fixtures omit main model text rather than borrowing a child model');
        const srcB=page.locator('.rt-src[title*="Session id: project-session-b"]');
        const independent=page.locator('.rt-src[title*="Session id: independent-child"]');
        assert.equal(await independent.count(),1,'parentSession never reparents');
        assert.equal(await srcB.locator(':scope > small > .rt-source-label').innerText(),'Shared project');
        assert.equal(await independent.locator(':scope > small > .rt-source-label').innerText(),'Shared project');
        assert.notEqual(await srcB.getAttribute('title'),await independent.getAttribute('title'),'equal project labels keep distinct full-session tooltips');
        // Input/group key order, not visible labels or DOM IDs, identifies
        // collision-separated actors whose rows may show the same model.
        assert.deepEqual([...activity.actorGroups(actors.routes.slice(0,20)).keys()].slice(0,2),[actorA,actorB]);
        const sameActor=srcA.locator('.rt-actor').nth(0), otherActor=srcA.locator('.rt-actor').nth(1);
        assert.deepEqual(await sameActor.locator('.rt-actor-models > code.mdl').allTextContents(),['a-model','z-model']);
        assert.deepEqual(await otherActor.locator('.rt-actor-models > code.mdl').allTextContents(),['a-model']);
        const unknown=srcA.locator('.rt-actor').last();
        assert.match(await unknown.getAttribute('title'),/\n2 requests active\n2 active requests; 0 ended requests/);
        assert.match(await unknown.getAttribute('title'),/Request identity unavailable/);
        assert.match(await unknown.getAttribute('aria-label'),/Request identity unavailable/);
        assert.deepEqual(await unknown.locator('code.mdl').allTextContents(),['example-model','Unknown model']);
        assert.equal(await page.locator('.rt-src details,.rt-src summary,.rt-src button,.rt-src .chev,.rt-activity[open],.rt-activity [open],.rt-activity[aria-expanded],.rt-activity [aria-expanded]').count(),0);
        assert.equal(await page.locator('.rt-activity').evaluateAll(ns=>ns.every(n=>n.matches('div.rt-activity')&&n.children.length===2&&n.firstElementChild.matches('ul.rt-actors')&&n.lastElementChild.matches('span.rt-activity-overflow'))),true);
        assert.equal(await srcA.locator('.rt-activity').isVisible(),true);
        assert.equal(await srcA.locator('.rt-actors').isVisible(),true);
        assert.equal(await page.locator('.rt-actor').evaluateAll(ns=>ns.every(n=>n.getBoundingClientRect().height>0)),true,'all retained rows have layout without opening a disclosure');
        assert.equal(await srcA.locator('.rt-actors').getAttribute('title'),'Gateway request activity only; task completion is unknown.');
        assert.equal(await srcA.locator('.rt-actors').getAttribute('aria-label'),'Model request activity — scroll for all activity');
        assert.equal(await srcA.locator('.rt-actors').getAttribute('tabindex'),'0');
        assert.equal(await page.locator('.rt-actor[data-actor-id],.rt-actor[role],.rt-actor[tabindex],.rt-actor[aria-expanded],.rt-src .rt-accts,.rt-actor .chev,.rt-actor b,.rt-actor i,.rt-actor > svg,.rt-actor-label,.rt-actor-state').count(),0);
        assert.equal(await sameActor.getAttribute('title'),'Claude Code\na-model, z-model\n2 requests active\n2 active requests; 0 ended requests');
        const childDom=await page.locator('.rt-activity').evaluateAll(ns=>ns.map(n=>n.outerHTML).join('\n'));
        assert.doesNotMatch(childDom,/actor_|group\/request-reference|Actor |Sub-agent|子代理|Agent completed|Provider 01|Account 01/);
        assert.equal(await page.locator('.rt-actor.active').count(),0);
        assert.equal(await page.locator('.rt-actor').evaluateAll(ns=>ns.every(n=>
          n.classList.contains('on')&&n.style.getPropertyValue('--depth')==='1'&&n.children.length===2&&
          n.firstElementChild.matches('.ic[aria-hidden="true"]')&&n.lastElementChild.matches('span.rt-actor-models')&&
          n.textContent===[...n.querySelectorAll('code.mdl')].map(chip=>chip.textContent).join('')&&
          n.firstElementChild.dataset.icon==='claudecode-color'&&
          n.firstElementChild.dataset.icon===n.closest('.rt-src').querySelector(':scope > .rt-ic > .ic').dataset.icon)),true);
        assert.match(await srcA.locator('.rt-activity-overflow').innerText(),/outside view; scroll/);
        if(shots)await page.screenshot({path:path.join(shots,name+'-source-activity.png')});
        await srcA.locator('.rt-actors').focus();
        await page.keyboard.press('End');
        await page.waitForFunction(()=>{const n=document.activeElement;return n?.classList.contains('rt-actors')&&n.scrollTop>0&&n.scrollTop+n.clientHeight>=n.scrollHeight;});
        await page.evaluate(()=>{
          window.savedSources=[...document.querySelectorAll('.rt-src')];
          window.savedActivity=[...document.querySelectorAll('.rt-actor')];
          window.savedChips=[...document.querySelectorAll('.rt-actor code.mdl')];
          window.savedList=document.querySelector('.rt-actors'); window.savedScroll=savedList.scrollTop;
          window.savedParts=[...savedActivity[0].children];
        });
        actors.revision++; actors.seq++;
        await page.evaluate(d=>testNative.accept(d),actors); await page.waitForTimeout(100);
        assert.equal(await srcA.locator('.rt-actors').isVisible(),true,'unchanged polls leave the activity list visible');
        assert.equal(await page.evaluate(()=>savedSources.every((n,i)=>n===document.querySelectorAll('.rt-src')[i])&&savedActivity.every((n,i)=>n===document.querySelectorAll('.rt-actor')[i])&&savedChips.every(n=>n.isConnected)),true);
        assert.equal(await page.evaluate(()=>savedList===document.querySelector('.rt-actors')&&savedList===document.activeElement),true,'polls retain the list node and keyboard focus');
        assert.equal(await page.evaluate(()=>savedList.scrollTop===savedScroll),true,'unchanged polls retain list scroll');
        assert.equal(await page.locator('.rt-sky .pkt').count(),4,'unchanged snapshot adds no flights');

        // Partial completion changes only the affected model fragment and
        // tooltip, not row/icon identity or the surviving order.
        actors.routes[0].done=true; actors.routes[0].ms=700; actors.revision++; actors.seq++;
        await page.evaluate(d=>testNative.accept(d),actors);
        await page.waitForFunction(()=>document.querySelector('.rt-actor')?.title.includes('\nRequest active\n'));
        assert.deepEqual(await sameActor.locator('code.mdl').allTextContents(),['a-model']);
        assert.equal(await sameActor.evaluate(n=>n.classList.contains('on')),true);
        assert.match(await sameActor.getAttribute('title'),/\nRequest active\n/);
        assert.match(await sameActor.getAttribute('title'),/1 active requests; 1 ended requests$/);
        assert.equal(await page.evaluate(()=>savedActivity.every(n=>n.isConnected)&&savedParts.every(n=>n.isConnected)&&savedChips.slice(2).every(n=>n.isConnected)),true);
        const newcomer={...actors.routes[2],id:0,actorId:'actor_late',model:'new-model',done:true,ms:700};
        actors.routes.push(newcomer); actors.ids.push(newcomer.id); actors.revision++; actors.seq++;
        await page.evaluate(d=>testNative.accept(d),actors);
        await page.waitForFunction(()=>document.querySelectorAll('.rt-actor').length===21);
        assert.deepEqual(await srcA.locator('.rt-actor').last().locator('code.mdl').allTextContents(),['new-model'],'new actor appends despite earlier request id');
        assert.equal(await page.evaluate(()=>savedActivity.slice(0,18).every((n,i)=>n===savedList.children[i])),true);

        // Completed gateway requests remain explicitly ended, not "worker done";
        // playback cannot turn their activity rows back into live requests.
        for(const r of actors.routes) {r.done=true;r.status=200;r.ms=700;for(const tr of r.tries){tr.done=true;tr.status=200;tr.ms=700;}}
        actors.revision++; actors.seq++;
        await page.evaluate(d=>testNative.accept(d),actors);
        await page.waitForFunction(()=>!document.querySelector('.rt-actor.on'));
        assert.equal(await page.locator('.rt-actor.on').count(),0);
        assert.match(await sameActor.getAttribute('title'),/\nRequests ended\n/);
        assert.match(await sameActor.getAttribute('title'),/0 active requests; 2 ended requests$/);
        assert.deepEqual(await sameActor.locator('code.mdl').allTextContents(),['a-model','z-model']);
        await page.getByRole('button',{name:'Replay',exact:true}).click(); await page.waitForTimeout(100);
        assert.equal(await page.locator('.rt-actor.on').count(),0);
        await page.getByRole('button',{name:'Stop replay',exact:true}).click();
        await srcA.locator('.rt-actor').first().waitFor();
        // Playback may reconstruct source rows from request-id order. Locate
        // the actor by its unique model evidence now, then test exact node
        // identity across eviction without exposing an internal key in DOM.
        await srcA.evaluate(n=>{
          window.evictionActivity=[...n.querySelectorAll('.rt-actor')];
          window.evictedActor=evictionActivity.find(row=>[...row.querySelectorAll('code.mdl')].map(c=>c.textContent).join(',')==='a-model,z-model');
        });
        assert.equal(await page.evaluate(()=>!!evictedActor),true);
        actors.routes=actors.routes.filter(r=>r.id!==1&&r.id!==2); actors.ids=actors.routes.map(r=>r.id); actors.revision++; actors.seq++;
        await page.evaluate(d=>testNative.accept(d),actors); await page.waitForTimeout(100);
        await page.waitForFunction(()=>!evictedActor.isConnected);
        assert.equal(await page.evaluate(()=>evictedActor.isConnected),false,'eviction removes actor state within a retained source');
        assert.equal(await page.evaluate(()=>evictionActivity.filter(n=>n!==evictedActor).every(n=>n.isConnected)),true,'other actor rows survive eviction');
        await page.evaluate(()=>testNative.locale('zh-TW')); await page.waitForTimeout(100);
        assert.equal(await srcA.locator('.rt-actors').getAttribute('title'),'僅表示閘道請求活動；無法判定任務是否完成。');
        assert.equal(await srcA.locator('.rt-actors').getAttribute('aria-label'),'模型請求活動 — 捲動以查看所有活動');
        assert.equal(await srcA.locator('.rt-actors').isVisible(),true);
        assert.equal(await srcA.locator('.rt-actor').evaluateAll(ns=>ns.every(n=>n.title.includes('\n請求已結束\n'))),true);
        assert.equal(await srcA.locator('.rt-actor b,.rt-actor i').count(),0);
        assert.doesNotMatch(await srcA.locator('.rt-activity').textContent(),/子代理|Sub-agent|請求已結束/);
        await page.setViewportSize({width:390,height:844});await page.waitForTimeout(100);
        assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
        if(shots)await page.screenshot({path:path.join(shots,name+'-source-activity-mobile-zh-TW.png')});
        await page.evaluate(()=>testNative.locale('de')); await page.waitForTimeout(100);
        assert.equal(await srcA.locator('.rt-actors').getAttribute('title'),'Gateway request activity only; task completion is unknown.');
        assert.equal(await srcA.locator('.rt-actors').getAttribute('aria-label'),'Model request activity — scroll for all activity','other locales retain established English activity fallback');
        assert.equal(await srcA.locator('.rt-actors').isVisible(),true);
        assert.equal(await srcA.locator('details,summary,button,.chev,[aria-expanded]').count(),0);
        assert.equal(await srcA.locator('.rt-actor').evaluateAll(ns=>ns.every(n=>n.title.includes('\nRequests ended\n'))),true);
        assert.doesNotMatch(await srcA.locator('.rt-activity').textContent(),/Sub-agent|子代理|Requests ended/);
        await page.evaluate(d=>testNative.accept({...d,revision:d.revision+1,connection:{status:'stale'}}),actors);
        assert.equal(await page.locator('.rt-activity').count(),0);
        const reset=fixture(['same-basename-a','same-basename-b']);reset.generation=2;
        reset.routes[0].projectName='Only project';reset.routes[1].folder='/not-a-project-disclosure';
        await page.evaluate(d=>testNative.accept(d),reset);await page.waitForTimeout(100);
        assert.equal(await page.locator('.rt-src').count(),2);
        assert.equal(await page.locator('.rt-activity').count(),0,'generation reset clears child state');
        assert.deepEqual(await page.locator('.rt-src > small > .rt-source-label').allTextContents(),['Only project','same-basenam…']);
        assert.deepEqual(await page.locator('.rt-src > small .rt-main-model').allTextContents(),['example-model','example-model']);
        assert.doesNotMatch(await page.locator('.rt-src > small').nth(1).innerText(),/not-a-project-disclosure/);
        reset.routes[0].actorId=actorA; reset.routes[0].isSubagent=true; reset.revision++; reset.seq++;
        await page.evaluate(d=>testNative.accept(d),reset);
        await page.locator('.rt-actor').waitFor();
        await page.evaluate(()=>{window.revokedChild=document.querySelector('.rt-actor');testNative.clear('Revoked');});
        assert.equal(await page.evaluate(()=>revokedChild.isConnected),false);
        assert.equal(await page.locator('.rt-activity').count(),0);
        await page.evaluate(()=>testNative.locale('en'));
        await page.setViewportSize({width:1200,height:850});

        if(process.env.NATIVE_REFERENCE==='1') {
          await page.evaluate(()=>localStorage.removeItem('magpie.maskEmails'));
          await page.close();
          const d=fixture(['session-a'],{done:true}),captures={};
          for(const label of ['original','extraction','sessions']) {
            const p=await ctx.newPage();p.on('pageerror',e=>errors.push(e.message));
            await p.emulateMedia({colorScheme:'light',reducedMotion:'reduce'});
            await p.clock.setFixedTime(new Date(d.now));
            if(label==='original')captures.apiRequests=await originalReference(p,d);
            else {await p.goto(url+(label==='extraction'?'/baseline':''));if(label==='sessions')await p.addStyleTag({path:path.join(root,'ui/style.css')});await p.evaluate(d=>testNative.accept(d),d);}
            // Compare the block at equal available width: the original app
            // includes its sidebar; the plugin's separate page does not.
            if(label!=='original') {
              const width=(await p.locator('#rt').boundingBox()).width;
              await p.setViewportSize({width:Math.round(1200-(width-captures.original.width)),height:850});
            }
            await p.waitForTimeout(600);
            assert.equal(await p.locator('#rt .rt-src').count(),1);
            assert.equal(await p.locator('#rt .rt-accts>li').count(),2);
            captures[label]=await captureUpper(p);
            if(shots)await p.screenshot({path:path.join(shots,name+'-'+label+'-upper.png'),clip:await p.locator('#rt').boundingBox(),animations:'disabled'});
            await p.close();
          }
          // Original inventory wording and excluded usage/body/context actions
          // are deliberately absent: no full original/extraction DOM claim.
          assert.equal(captures.original.width,captures.extraction.width);
          for(const selector of ['.rt-mode','.rt-stage','.rt-src','.rt-hub','.rt-accts','.rt-accts>li','.rt-cap','.rt-stats','.rt-steps'])
            assert.deepEqual(captures.original.nodes[selector],captures.extraction.nodes[selector],`original/extraction ${selector}`);
          assert.deepEqual(captures.original.wires,captures.extraction.wires,'original/extraction wire geometry');
          assert.deepEqual(captures.original.sourceHeaders,captures.extraction.sourceHeaders,'original/extraction source header text remains exact');
          assert.deepEqual(captures.sessions.sourceHeaders,captures.extraction.sourceHeaders.map(h=>({...h,label:'session-a'})),'only the session label is added; native client name and model stay separate exact fields');
          assert.equal(captures.extraction.nodes['.rt-src'][0].text.replace('example-model','session-aexample-model'),captures.sessions.nodes['.rt-src'][0].text,'source spacing is CSS, not new separator text');
          if(shots)fs.writeFileSync(path.join(shots,name+'-comparisons.json'),JSON.stringify(captures,null,2)+'\n');
          // Literal DOM/geometry differences, never a permissive pixel threshold.
          // The strict desktop checkpoint above remains a separate assertion.
          const report={engine:name,revision:REVISION,data:d,
            deliberateExtractionDifferences:JSON.parse(read('extraction-manifest.json')).dataAndPrivacyDifferences,
            sourcePatchDifferences:['Separate session/project label and retained main-model items with full-session tooltip','Inline source client icon/name and wrapping label/model row','Plugin-owned responsive source-track widening and native content sizing reflow hub, account column and wires; not pixel-identical parity'],variants:[]};
          const difference=(a,b,p='')=>{
            if(JSON.stringify(a)===JSON.stringify(b))return [];
            if(a && b && typeof a==='object' && typeof b==='object')return [...new Set([...Object.keys(a),...Object.keys(b)])].flatMap(k=>difference(a[k],b[k],p+'/'+k));
            return [{path:p,before:a??null,after:b??null}];
          };
          for(const size of ['desktop','mobile'])for(const theme of ['light','dark'])for(const motion of ['reduce','no-preference']){
            const variant={size,theme,motion,lang:'en',captures:{}};
            const viewport={width:size==='desktop'?1200:390,height:1400};
            for(const label of ['native-original','extracted-baseline','session-patched']){
              const context=await browser.newContext({viewport,reducedMotion:motion,colorScheme:theme,locale:'en-US',timezoneId:'UTC'});
              try{
                const p=await context.newPage();p.setDefaultTimeout(10000);p.on('pageerror',e=>errors.push(e.message));
                await p.clock.setFixedTime(new Date(d.now));
                if(label==='native-original')variant.apiRequests=await originalReference(p,d,{theme});
                else{
                  await context.route('**/*',route=>{
                    assert.equal(new URL(route.request().url()).origin,url,'extraction fixture is loopback-only');return route.continue();
                  });
                  await p.goto(url+(label==='extracted-baseline'?'/baseline':''));
                  if(label==='session-patched')await p.addStyleTag({path:path.join(root,'ui/style.css')});
                  await p.evaluate(({d,theme})=>{document.documentElement.dataset.theme=theme;document.documentElement.classList.toggle('dark',theme==='dark');testNative.locale('en');testNative.accept(d);},{d,theme});
                  const width=(await p.locator('#rt').boundingBox()).width;
                  await p.setViewportSize({...viewport,width:Math.round(viewport.width-(width-variant.captures['native-original'].width))});
                }
                if(name==='webkit'){await p.mouse.move(100,100);await p.mouse.wheel(0,1);}
                await p.waitForTimeout(650);
                await p.waitForFunction(()=>[...document.querySelectorAll('#rt .rt-wires path')].every(n=>n.getAttribute('d')?.includes('C')));
                variant.captures[label]=await captureUpper(p);
                variant.captures[label].dom=await p.locator('#rt').evaluate(n=>n.outerHTML);
                assert.equal(await p.locator('#rt .rt-src').count(),1);
                assert.equal(await p.locator('#rt .rt-accts>li').count(),2);
                if(shots)await p.screenshot({path:path.join(shots,`${name}-${size}-${theme}-${motion}-${label}.png`),clip:await p.locator('#rt').boundingBox(),animations:'disabled'});
              }finally{await context.close();}
            }
            const original=variant.captures['native-original'],baseline=variant.captures['extracted-baseline'],session=variant.captures['session-patched'];
            assert.equal(original.width,baseline.width);
            assert.equal(baseline.width,session.width);
            for(const selector of ['.rt-mode','.rt-src','.rt-hub','.rt-accts>li','.rt-stats','.rt-steps']){
              assert.deepEqual(original.nodes[selector].map(n=>({text:n.text,style:n.style})),baseline.nodes[selector].map(n=>({text:n.text,style:n.style})),`${size}/${theme}/${motion} original-extraction ${selector}`);
            }
            for(const selector of ['.rt-mode','.rt-hub','.rt-accts>li','.rt-stats','.rt-steps']){
              assert.deepEqual(baseline.nodes[selector].map(n=>({text:n.text,style:n.style})),session.nodes[selector].map(n=>({text:n.text,style:n.style})),`${size}/${theme}/${motion} extraction-session ${selector}`);
            }
            assert.deepEqual(original.sourceHeaders,baseline.sourceHeaders,`${size}/${theme}/${motion} original-extraction source header fields`);
            assert.deepEqual(session.sourceHeaders,baseline.sourceHeaders.map(h=>({...h,label:'session-a'})),`${size}/${theme}/${motion} exact session source label and model fields`);
            variant.originalToExtraction=difference(original,baseline);
            variant.extractionToSession=difference(baseline,session);
            report.variants.push(variant);
          }
          if(shots)fs.writeFileSync(path.join(shots,name+'-parity-matrix.json'),JSON.stringify(report,null,2)+'\n');

          // A real nested group inside a group, not a handcrafted imitation or
          // the extracted baseline relabeled as upstream. Both branches have
          // depth 1; only the first is lit by the recorded destination attempt.
          const nestedData=fixture(['nested-session','nested-session']);
          for(const [i,r] of nestedData.routes.entries()) {
            r.group={id:'root-group',name:'Root group',routing:'order',members:['group/outer-group'],subs:[
              {id:'outer-group',name:'Outer group',routing:'order',members:['group/lit-child','group/idle-child']},
              {id:'lit-child',name:'Native active child',routing:'order',members:['p_fixture/example-model']},
              {id:'idle-child',name:'Native idle child',routing:'order',members:['p_fixture/example-model']},
            ]};
            r.order.forEach((w,j)=>w.via=['outer-group',j?'idle-child':'lit-child']);
            r.actorId=i?'actor_retained':'actor_active'; r.isSubagent=true;
            if(i) {r.done=true;r.ms=600;r.status=200;r.tries.forEach(tr=>Object.assign(tr,{done:true,status:200,ms:600}));}
          }
          const nestedReport={revision:REVISION,fixture:nestedData,variants:[]};
          for(const size of ['desktop','mobile'])for(const theme of ['light','dark']) {
            const variant={size,theme,captures:{}},viewport={width:size==='desktop'?1200:390,height:1400};
            for(const label of ['native-original','session-patched']) {
              const context=await browser.newContext({viewport,colorScheme:theme,reducedMotion:'reduce'});
              try {
                const p=await context.newPage(); p.setDefaultTimeout(10000); p.on('pageerror',e=>errors.push(e.message));
                await p.clock.setFixedTime(new Date(nestedData.now));
                if(label==='native-original')variant.apiRequests=await originalReference(p,nestedData,{theme});
                else {
                  await context.route('**/*',route=>{
                    assert.equal(new URL(route.request().url()).origin,url,'nested source fixture is loopback-only'); return route.continue();
                  });
                  await p.goto(url);
                  await p.addStyleTag({path:path.join(root,'ui/style.css')});
                  await p.evaluate(({d,theme})=>{
                    document.documentElement.dataset.theme=theme; document.documentElement.classList.toggle('dark',theme==='dark'); testNative.accept(d);
                  },{d:nestedData,theme});
                }
                if(name==='webkit'){await p.mouse.move(100,100);await p.mouse.wheel(0,1);}
                await p.waitForFunction(()=>[...document.querySelectorAll('.rt-accts > li.rt-sub')].filter(n=>n.style.getPropertyValue('--depth')==='1').length===2);
                await p.waitForTimeout(650);
                variant.captures[label]=await captureUpper(p);
                const fit=await p.evaluate(()=>({width:innerWidth,scroll:document.documentElement.scrollWidth,
                  nodes:[...document.querySelectorAll('#rt,.rt-src,.rt-actor,.rt-actor-models,.rt-actor code.mdl,.rt-accts > li')]
                    .filter(n=>n.getBoundingClientRect().height).map(n=>({class:n.className,left:n.getBoundingClientRect().left,right:n.getBoundingClientRect().right}))}));
                assert(fit.scroll<=fit.width&&fit.nodes.every(n=>n.left>=0&&n.right<=fit.width),JSON.stringify({label,size,theme,fit}));
                if(shots)await p.locator('#rt').screenshot({path:path.join(shots,`${name}-nested-${size}-${theme}-${label}.png`),animations:'disabled'});
                const focusTarget=p.locator(label==='native-original'?'.rt-accts > li.rt-sub':'.rt-activity > .rt-actors').first();
                await focusTarget.focus(); await p.keyboard.press('Shift');
                variant.captures[label].focus=await focusTarget.evaluate(n=>({visible:n.matches(':focus-visible'),shadow:getComputedStyle(n).boxShadow,outline:getComputedStyle(n).outlineStyle}));
              } finally {await context.close();}
            }
            const original=variant.captures['native-original'],session=variant.captures['session-patched'];
            const headings=original.nested.filter(n=>n.depth==='1');
            assert.equal(headings.length,2); assert.equal(session.actors.length,2);
            assert.equal(original.actors.length,0,'pinned original never executes the plugin source extension');
            assert.equal(original.wires.length,session.wires.length,'source children introduce no destination wires');
            for(const active of [true,false]) {
              const reference=headings.find(n=>n.active===active),child=session.actors.find(n=>n.active===active);
              assert(reference&&child,`both genuine native and source fixtures include ${active?'active':'inactive'} depth-1 rows`);
              assert.equal(reference.indent,18); assert.equal(reference.listGap,'7px');
              for(const field of ['depth','active','indent','listGap','row','model']) {
                assert.deepEqual(child[field],reference[field],`${size}/${theme} ${active?'active':'ended'} child retains native nested ${field} styling`);
              }
              assert.equal(child.label,null,'child intentionally omits the native group heading label');
              assert.equal(child.labelMarker,null,'child has no native label marker');
              assert.equal(child.pill,null,'child intentionally omits the native group state pill');
              assert.equal(child.clientIcon,'claudecode-color','child uses client artwork, not the native group fan');
              assert.equal(child.clientIcon,child.parentClientIcon,'child and source use the same client icon token');
            }
            assert.deepEqual(session.chevrons,original.chevrons,`${size}/${theme} native destination chevrons remain unchanged`);
            assert.equal(original.focus.visible,true);
            assert.equal(session.focus.visible,true,'the scrollable activity list is keyboard-focusable');
            assert.notEqual(session.focus.shadow,'none','the activity list has a visible keyboard focus ring');
            nestedReport.variants.push(variant);
          }
          if(shots)fs.writeFileSync(path.join(shots,name+'-nested-original-parity.json'),JSON.stringify(nestedReport,null,2)+'\n');

          // Crucially, feed ORIGINAL raw branding to upstream and the same raw
          // trace through the actual protected plugin service. Comparing two
          // already-anonymized DTOs would not catch v0.3.0's brand substitution.
          const brands = [
            ['gemini', 'Gemini CLI', 'geminicli-color'],
            ['antigravity', 'Antigravity', 'antigravity-color'],
            ['kiro', 'Kiro', 'kiro-color'],
            ['stepfun', 'StepFun 研發 (EU)', 'stepfun-color'],
          ], branding = [];
          for (const [provider, displayName, artwork] of brands) {
            const raw = nativeTrace({ sessions: ['brand-session'], done: true });
            const r = raw.routes[0]; r.provider = provider;
            r.order = [{ ...r.order[0], id: `${provider}@synthetic-seat`, provider, kind: 'provider', name: displayName, icon: artwork }];
            r.tries[0].id = r.order[0].id;
            const evidence = { provider, expectedName: displayName, expectedIcon: artwork };
            const nativeContext = await browser.newContext({ viewport: { width: 1200, height: 900 }, reducedMotion: 'reduce' });
            try {
              const p = await nativeContext.newPage(); p.setDefaultTimeout(10000);
              await originalReference(p, raw);
              evidence.original = await p.locator('.rt-accts > li > b').evaluateAll(nodes => nodes.map(n => ({
                name: n.querySelector('.who')?.textContent, icon: n.querySelector('.ic')?.dataset.icon,
              })));
              if (shots) await p.locator('#rt').screenshot({ path: path.join(shots, `${name}-brand-${provider}-original.png`) });
            } finally { await nativeContext.close(); }
            const protectedHost = await browserHarness({ fixture: raw });
            const protectedContext = await browser.newContext({ viewport: { width: 1200, height: 900 }, reducedMotion: 'reduce' });
            try {
              await protectedContext.route('**/*', route => {
                assert.equal(new URL(route.request().url()).origin, protectedHost.url, 'protected branding fixture is loopback-only');
                return route.continue();
              });
              const p = await protectedContext.newPage(); p.setDefaultTimeout(10000); await p.goto(protectedHost.url);
              const frame = p.frameLocator('iframe'); await frame.locator('.rt-accts > li > b').first().waitFor();
              evidence.protected = await frame.locator('.rt-accts > li > b').evaluateAll(nodes => nodes.map(n => ({
                name: n.querySelector('.who')?.textContent, icon: n.querySelector('.ic')?.dataset.icon,
              })));
              assert.deepEqual(evidence.original, [{ name: displayName, icon: artwork }]);
              assert.deepEqual(evidence.protected, evidence.original, 'raw original and real projection preserve exactly the same public branding');
              if (shots) await frame.locator('#rt').screenshot({ path: path.join(shots, `${name}-brand-${provider}-protected.png`) });
            } finally { await protectedContext.close(); await protectedHost.close(); }
            branding.push(evidence);
          }
          if (shots) fs.writeFileSync(path.join(shots, name+'-raw-branding-parity.json'), JSON.stringify(branding,null,2)+'\n');
        }
        assert.deepEqual(errors,[]);
      } finally {await browser.close();}
    });
  }
});

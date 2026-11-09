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
  assert.equal(key(r),key({...r,id:2,model:'other',folder:'other',provider:'else',parentSession:'parent'}));
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
  return { sourceKey, sourceRequests, actorGroups, actorLabels };
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
test('short safe actor labels extend colliding prefixes without merging opaque identities', () => {
  const ids = ['actor_123456789012345A', 'actor_123456789012345B', 'actor_other0123456789', 'actor_other0123456789X'];
  const labels = activity.actorLabels([...ids, null]);
  assert.equal(labels.size, ids.length);
  assert.equal(new Set(labels.values()).size, ids.length);
  for (const id of ids) assert.ok(id.startsWith(labels.get(id).replace(/…$/, '')));
  assert.equal(labels.get(ids[0]), ids[0]);
  assert.equal(labels.get(ids[1]), ids[1]);
});
test('project summaries use explicitly disclosed same-session basenames even for one project', () => {
  assert.match(patched, /const projects = \[\.\.\.new Set\(relevant\.map\(\(x\) => x\.projectName\)\.filter\(Boolean\)\)\]/);
  const line = patched.match(/setText\(a\.sub, projects\.length[^\n]+/)[0];
  const subtitle = vm.runInNewContext(`(projects, r) => {
    const a = { sub: {} }, lastLevel = f => f.split('/').pop(), sourceLabel = r => r.session;
    const setText = (el, text) => el.textContent = text;
    ${line}
    return a.sub.textContent;
  }`);
  assert.equal(subtitle(['專案'], { session: 'session-a', model: 'requested' }), '專案 · session-a');
  assert.equal(subtitle(['one', 'two'], { session: 'session-a', model: 'requested' }), 'one, two · session-a');
  assert.equal(subtitle([], { session: 'session-a', model: 'requested', folder: '/secret/no-inference' }), 'session-a · requested');
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
    return {width:box.width,height:box.height,nodes,wires:[...root.querySelectorAll('.rt-wires path')].map(n=>n.getAttribute('d'))};
  });
}

const browserEnabled = process.env.NATIVE_BROWSER === '1';
test('extraction/session fixture and optional original reference: parity, flights, stable nodes, replay and eviction', {skip:!browserEnabled}, async t => {
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
        await base.evaluate(d=>testNative.accept(d),d);await base.waitForTimeout(250);
        assert.equal(await base.locator('.rt-src').count(),1);
        const baselineText={};
        for(const sel of ['.rt-mode','.rt-steps','.rt-what'])baselineText[sel]=await base.locator(sel).innerText();
        if(shots)await base.screenshot({path:path.join(shots,name+'-baseline.png')});
        await base.close();
        const page=await ctx.newPage();page.on('pageerror',e=>errors.push(e.message));
        await page.goto(url);await page.evaluate(d=>testNative.accept(d),d);await page.waitForTimeout(250);
        assert.deepEqual(errors,[]);
        assert.equal(await page.locator('.rt-src').count(),2);
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
        actors.routes[3].projectName='Other project';
        actors.routes[21].parentSession='project-session-a';
        await page.evaluate(d=>testNative.accept(d),actors);
        await page.waitForFunction(()=>document.querySelectorAll('.rt-actor').length===20);
        const srcA=page.locator('.rt-src').filter({has:page.locator(':scope > small', {hasText:'Other project'})});
        assert.equal(await page.locator('.rt-src').count(),3);
        assert.equal(await page.locator('.rt-src .rt-src').count(),0);
        assert.equal(await page.locator('.rt-sky .pkt').count(),4);
        assert.equal(await srcA.locator('.rt-actor').count(),18);
        assert.match(await srcA.locator(':scope > small').innerText(),/^Shared project, Other project · project-sess/);
        assert.match(await srcA.getAttribute('title'),/example-model\nSession id: project-session-a/);
        assert.equal(await page.locator('.rt-src').filter({hasText:'independent'}).count(),1,'parentSession never reparents');
        const sameActor=srcA.locator(`.rt-actor[data-actor-id="${actorA}"]`);
        assert.match(await sameActor.innerText(),/Active gateway requests: 2/);
        assert.notEqual(await sameActor.locator('.rt-actor-label').innerText(),await srcA.locator(`.rt-actor[data-actor-id="${actorB}"] .rt-actor-label`).innerText());
        const unknown=srcA.locator('.rt-actor[data-actor-id=""]');
        assert.match(await unknown.innerText(),/actor unavailable\nActive gateway requests: 2/);
        assert.equal(await srcA.locator('summary').getAttribute('aria-label'),'Sub-agent activity: 17 identified actors; 2 requests with actor unavailable; 20 active gateway requests');
        assert.match(await srcA.locator('.rt-activity-overflow').innerText(),/outside view; scroll/);
        if(shots)await page.screenshot({path:path.join(shots,name+'-source-activity.png')});
        await srcA.locator('.rt-actors').focus();
        await page.keyboard.press('End');
        await page.waitForFunction(()=>document.activeElement?.classList.contains('rt-actors')&&document.activeElement.scrollTop>0);
        await srcA.locator('summary').focus(); await page.keyboard.press('Enter');
        assert.equal(await srcA.locator('.rt-activity').evaluate(n=>n.open),false);
        await page.keyboard.press('Enter');
        await page.evaluate(()=>window.savedActivity=[...document.querySelectorAll('.rt-actor')]);
        actors.revision++; actors.seq++;
        await page.evaluate(d=>testNative.accept(d),actors); await page.waitForTimeout(100);
        assert.equal(await page.evaluate(()=>savedActivity.every((n,i)=>n===document.querySelectorAll('.rt-actor')[i])),true);
        assert.equal(await page.locator('.rt-sky .pkt').count(),4,'unchanged snapshot adds no flights');

        // Completed gateway requests remain explicitly ended, not "worker done";
        // playback cannot turn their activity boxes back into live requests.
        for(const r of actors.routes) {r.done=true;r.status=200;r.ms=700;for(const tr of r.tries){tr.done=true;tr.status=200;tr.ms=700;}}
        actors.revision++; actors.seq++;
        await page.evaluate(d=>testNative.accept(d),actors);
        await page.waitForFunction(()=>!document.querySelector('.rt-actor.active'));
        assert.equal(await page.locator('.rt-actor.active').count(),0);
        assert.match(await sameActor.innerText(),/Active gateway requests: 0 · Gateway requests ended: 2/);
        await page.getByRole('button',{name:'Replay',exact:true}).click(); await page.waitForTimeout(100);
        assert.equal(await page.locator('.rt-actor.active').count(),0);
        await page.getByRole('button',{name:'Stop replay',exact:true}).click();
        actors.routes=actors.routes.filter(r=>r.id!==1&&r.id!==2); actors.ids=actors.routes.map(r=>r.id); actors.revision++; actors.seq++;
        await page.evaluate(d=>testNative.accept(d),actors); await page.waitForTimeout(100);
        assert.equal(await srcA.locator(`.rt-actor[data-actor-id="${actorA}"]`).count(),0,'eviction removes actor state within a retained source');
        await page.evaluate(()=>testNative.locale('zh-TW')); await page.waitForTimeout(100);
        assert.match(await srcA.locator('summary').innerText(),/子代理活動/);
        await page.setViewportSize({width:390,height:844});await page.waitForTimeout(100);
        assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
        if(shots)await page.screenshot({path:path.join(shots,name+'-source-activity-mobile-zh-TW.png')});
        await page.evaluate(d=>testNative.accept({...d,revision:d.revision+1,connection:{status:'stale'}}),actors);
        assert.equal(await page.locator('.rt-activity').count(),0);
        const reset=fixture(['same-basename-a','same-basename-b']);reset.generation=2;
        reset.routes[0].projectName='Only project';reset.routes[1].folder='/not-a-project-disclosure';
        await page.evaluate(d=>testNative.accept(d),reset);await page.waitForTimeout(100);
        assert.equal(await page.locator('.rt-src').count(),2);
        assert.equal(await page.locator('.rt-activity').count(),0,'generation reset clears child state');
        assert.match(await page.locator('.rt-src > small').first().innerText(),/^Only project ·/);
        assert.doesNotMatch(await page.locator('.rt-src > small').nth(1).innerText(),/not-a-project-disclosure/);
        await page.evaluate(()=>testNative.clear('Revoked'));
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
            else {await p.goto(url+(label==='extraction'?'/baseline':''));await p.evaluate(d=>testNative.accept(d),d);}
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
          assert.equal(captures.extraction.nodes['.rt-src'][0].text.replace('example-model','session-a · example-model'),captures.sessions.nodes['.rt-src'][0].text);
          if(shots)fs.writeFileSync(path.join(shots,name+'-comparisons.json'),JSON.stringify(captures,null,2)+'\n');
          // Literal DOM/geometry differences, never a permissive pixel threshold.
          // The strict desktop checkpoint above remains a separate assertion.
          const report={engine:name,revision:REVISION,data:d,
            deliberateExtractionDifferences:JSON.parse(read('extraction-manifest.json')).dataAndPrivacyDifferences,
            sourcePatchDifferences:['Session discriminator and tooltip','Native fit-content source width can reflow hub, account column and wires; not pixel-identical parity'],variants:[]};
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
            variant.originalToExtraction=difference(original,baseline);
            variant.extractionToSession=difference(baseline,session);
            report.variants.push(variant);
          }
          if(shots)fs.writeFileSync(path.join(shots,name+'-parity-matrix.json'),JSON.stringify(report,null,2)+'\n');

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

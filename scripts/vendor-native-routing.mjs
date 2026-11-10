#!/usr/bin/env node
// Reproducible read-only extraction of Magpie's actual upper Routing renderer.
// Extraction/hosting boundaries and source-identity changes are separate passes.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
const require = createRequire(import.meta.url);
const { babelParse, traverse } = require('../node_modules/playwright/lib/transform/babelBundle.js');
export const REVISION = '3f53fa1f316330b77e5ff6d065a7a56980cafda2';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const VENDOR = path.join(ROOT, 'ui/vendor/magpie');
const ASSETS = 'internal/gui/assets/';
const hash = b => crypto.createHash('sha256').update(b).digest('hex');
const parse = s => babelParse(s, 'native.js');
const lines = (s, a, b) => s.split('\n').slice(a - 1, b).join('\n') + '\n';
function replace(s, a, b, label = a.slice(0, 70)) {
  const at = s.indexOf(a);
  if (at < 0 || s.indexOf(a, at + a.length) >= 0) throw new Error('Nonunique patch: ' + label);
  return s.slice(0, at) + b + s.slice(at + a.length);
}
export function freeNames(s) {
  const names = new Set();
  traverse(parse(s), { ReferencedIdentifier(p) { if (!p.scope.hasBinding(p.node.name)) names.add(p.node.name); } });
  return [...names].sort();
}
// Cull declaration-only dependencies excluded with the lower page. All surviving
// statements remain verbatim; there is no minifier or replacement flight engine.
function prune(s) {
  for (let i = 0; i < 30; i++) {
    const cuts = [];
    traverse(parse(s), { FunctionDeclaration(p) {
      if (p.node.id.name !== 'routingPage') return;
      for (const q of p.get('body.body')) {
        if (q.isFunctionDeclaration()) {
          const b = p.scope.getBinding(q.node.id.name);
          if (b && !b.referenced) cuts.push([q.node.start, q.node.end]);
        } else if (q.isVariableDeclaration()) {
          if (q.node.declarations.every(d => d.id.type === 'Identifier' && !p.scope.getBinding(d.id.name)?.referenced) &&
              q.node.declarations.every(d => !d.init || !['CallExpression','AssignmentExpression','AwaitExpression'].includes(d.init.type))) cuts.push([q.node.start, q.node.end]);
        }
      }
    }});
    if (!cuts.length) break;
    for (const [a, b] of cuts.sort((a,b)=>b[0]-a[0])) s = s.slice(0,a) + s.slice(b);
  }
  return s;
}
export const EXTRACTION_RANGES = [[43,109],[120,132],[295,312],[349,534],[561,634],[636,1560],[1590,1620],[1623,2128],[2146,2692],[2726,2748],[2750,2933],[2935,2979],[2980,2981],[2985,2985],[3058,3105],[3216,3338],[3358,3370],[3395,3601],[3622,3622],[3637,3667],[4072,4078],[4806,5251],[5254,5258],[5260,5299],[5301,5304],[5306,5333],[5335,5345],[5466,5483],[5486,5487],[8497,8505]];
export function extract(s) {
  let out = EXTRACTION_RANGES.map(([a,b]) => `\n// upstream client.js:${a}-${b}\n` + lines(s,a,b)).join('');
  out = replace(out, 'function routingPage(part) {', 'function routingPage(host) {\n  const purpose = [];\n  const day = "", past = [];\n  let sightWait = null;\n  const state = { clients: NATIVE_CLIENTS };\n  let by = null;');
  out = replace(out, 'let seq = 0, mine = true, loaded = false, daysAt = 0, by = null;', 'let seq = 0, mine = false, loaded = false;');
  out = replace(out, 'const shown = () => !$("#view-routing").hidden && !document.hidden;', 'const shown = () => host.visible() && !$("#view-routing").hidden && !document.hidden;');
  out = replace(out, 'box.append(top, rbar, stage, foot, log, off);', 'log.append(logHead, steps);\n  box.append(top, rbar, stage, foot, log, off);');
  out = replace(out, lines(s,1285,1293).trimEnd(), '    // The group configuration clock is not collected. A recorded zone can\n    // still be named, but never infer the server clock from this browser.\n    return w.zone ? t("{zone} time", { zone: w.zone }) : t("server time");');
  out = replace(out, 'function firstWhy(r) {', 'function firstWhy(r) {\n    if (r.evidence?.reasons?.some(k => /^(candidate_|malformed_candidates|routing_mode_|quota_|rule_|group_)/.test(k))) return t("Some routing evidence is unavailable or withheld.");');
  out = replace(out, lines(s,806,810).trimEnd(), '    if (r.order.length === 1) return t("{who} goes first.", { who: w }); // observed seat, not configured inventory');
  out = replace(out, 'setText(mode, none ? noneWhy(r)', 'setText(mode, r.evidence?.reasons?.includes("routing_mode_unavailable") ? t("Routing details unavailable") : none ? noneWhy(r)');
  out = replace(out, 'setText(statB[i], fmtN(n)); setAttr(statB[i], "title", exactN(n));', 'setText(statB[i], typeof n === "number" ? fmtN(n) : "—"); setAttr(statB[i], "title", typeof n === "number" ? exactN(n) : "");');
  out = replace(out, 'const userShown = (provider, user) => user && accountShownOf(providers?.providers?.find((p) => p.id === provider), user) || user;', 'const userShown = (provider, user) => user; // already neutral, stable backend labels; no account configuration is read');
  out = replace(out, 'const modeOf = (r) => MODES[r] || (r && jsRoutings(r).find(([id]) => id === r)?.slice(1, 3)) || MODES[""];', 'const modeOf = (r) => MODES[r] || [r, t("Routing details unavailable")];');
  out = replace(out, lines(s,588,593).trimEnd(), '  const lapses = (w) => w.runsOut > 0 && w.runsOutAt ? " · " + runsOutText(w) : "";');
  out = replace(out, lines(s,2120,2128).trimEnd(), '  function rankOf(w) { return w.rank || 0; } // recorded order; no provider inventory');
  out = replace(out, 'const pool = !g && f ? poolOf(f.provider) : null;', '// No configuration inventory is available in a trace. Never infer that\n    // one observed seat means only one account is configured.');
  out = replace(out, 'const lone = !g && on === 1 && !pool;', 'const lone = false; // unsupported configuration assertion excluded');
  out = replace(out, '+ (none ? (r.done ? "" : " · " + waitWord(r)) : " · " + t(on === 1 ? "one on" : "{n} on", { n: on }))', '+ (none && !r.done ? " · " + waitWord(r) : "") // configured enabled-account count unavailable');
  out = replace(out, 'setText(s.n, t(ms.length === 1 ? "one on" : "{n} on", { n: ms.length }));', 'setText(s.n, ""); // observed members are not an enabled-account inventory');
  out = replace(out, 'const took = (ms = 0) =>', 'const took = (ms) => typeof ms !== "number" ? t("unavailable") :');
  out = replace(out, 'if (!tr.done) return t("{who} is answering…", { who: name });', 'if (!tr.done) return t("{who} is answering…", { who: name });\n    if (typeof tr.status !== "number" && !tr.fail) return t("Outcome unavailable");');
  out = replace(out, 'function outcome(r) {', 'function outcome(r) {\n    if (r.done && r.evidence?.reasons?.includes("outcome_unknown")) return [t("Outcome unavailable"), "wait"];');
  out = replace(out, 'r.error || r.status }), "bad"]);', 'r.error || r.status || t("Outcome unavailable") }), "bad"]);');
  out = replace(out, 'goTo(chip, g ? "group:" + g.id : pool ? "pool:" + f.provider : "", g ? g.name : f?.name || r.provider);', '// Editor navigation is outside this read-only upper block.');
  out = replace(out, 'named = titleOf(trying.get(id));', '// Session titles may contain prompts and are not collected.');
  out = replace(out, ' named = titleOf(r);', '');
  out = replace(out, 'const tip = [w.id, ...(day ? [] : winsOf(w))].join("\\n");', 'const tip = w.id; // live /api/quotas inventory is unavailable; recorded quota remains on the row');
  out = replace(out, 'bodiesFor === r.id, ', '');
  out = replace(out, '      if ((r.masked?.n || r.masked?.warned) && !rp) logHead.append(maskedBadge(r.masked));', '      // Raw privacy/body record viewers excluded.');
  out = replace(out, lines(s,2956,2963).trimEnd(), '        // Usage/body viewers are outside this extracted upper block.');
  out = replace(out, 'if (day) lookAt(""); else { pinned = null; followListed(); }', 'pinned = null; followListed();');
  out = replace(out, 'if (r.done && r.held) items.push([t("magpie saved a report of where it held this request. If it keeps happening, send the report with yours."), "aside held", { model: r.held }]);', '// Report paths and report actions are not collected.');
  out = replace(out, '      if (c === "aside held") li.append(" ", ...heldActions(tr.model));', '');
  out = replace(out, 'render(); renderLog(); renderHist();', 'render(); renderLog(); renderStats(listed());');
  out = replace(out, '    inSightAgain();', '');
  out = replace(out, 'render(); renderActs(listed()); groupsReadAgain(); livePaint();', 'render(); renderStats(listed());');
  out = replace(out, 'const g = providers?.gateway;', '// Only sanitized gateway identity, never a configured URL.');
  out = replace(out, 'setText(hubSub, who + ((g?.url || "").replace(/^https?:\\/\\//, "") || t("gateway")));', 'setText(hubSub, who + t("gateway"));');
  let ingest = lines(s,5392,5459);
  for (const text of [lines(s,5399,5405), lines(s,5408,5408), lines(s,5411,5411), lines(s,5413,5414), lines(s,5417,5423), lines(s,5454,5455)]) ingest = ingest.replace(text, '');
  ingest = ingest.replace('pinned || asked || newest()', 'pinned || newest()');
  // The first-draw route choice was in the removed app/window-init block.
  ingest = ingest.replace('          if (r) { cur = r;', '          const r = pinned || newest();\n          if (r) { cur = r;');
  out += '\n' + fs.readFileSync(path.join(ROOT,'ui/native-lifecycle.inc.js'),'utf8').replace('/* NATIVE_INGEST */', ingest) + '\n}\n';
  out = prune(out);
  return out;
}
// Plugin-owned activity subdivision, deliberately separate from the native
// flight engine. Its only state belongs to the existing exact-session node.
export const SOURCE_ACTIVITY = `
  function sourceRequests(key, staged, map = src(), clock = now()) {
    const selected = new Set(staged.map((r) => r.id));
    return [...map.values()].filter((r) => sourceKey(r) === key &&
      (!r.done || at(r.time) + (r.ms || 0) > clock - LINGER || selected.has(r.id)))
      .sort((a, b) => a.id - b.id);
  }
  function actorGroups(requests) {
    const groups = new Map();
    for (const r of requests) {
      if (!r.isSubagent && !r.actorId) continue;
      const key = r.actorId || null;
      let entry = groups.get(key);
      if (!entry) groups.set(key, entry = { id: key, active: 0, ended: 0 });
      if (r.done) entry.ended++; else entry.active++;
    }
    return groups;
  }
  function actorModels(requests) {
    const groups = new Map(), models = new Map();
    const concrete = (value) => typeof value === "string" && value.length && !value.startsWith("group/");
    for (const r of requests) {
      if (!r.isSubagent && !r.actorId) continue;
      const key = r.actorId || null;
      let group = groups.get(key);
      if (!group) groups.set(key, group = { active: new Set(), ended: new Set() });
      const model = concrete(r.served) ? r.served :
        !r.evidence?.reasons?.includes("model_unavailable") && concrete(r.model) ?
          concrete(r.requestedModelName) ? r.requestedModelName : r.model : null;
      (r.done ? group.ended : group.active).add(model);
    }
    for (const [id, group] of groups) {
      const selected = group.active.size ? group.active : group.ended;
      models.set(id, [...selected].filter((m) => m !== null).sort().concat(selected.has(null) ? [null] : []));
    }
    return models;
  }
  function sourceActivity(a, requests) {
    const groups = actorGroups(requests);
    if (!groups.size) {
      a.activity?.node.remove();
      delete a.activity;
      return;
    }
    if (!a.activity) {
      const node = el("details", "rt-activity"), summary = el("summary"), chev = el("span", "chev"),
        list = el("ul", "rt-actors"), overflow = el("span", "rt-activity-overflow");
      setAttr(summary, "aria-label", t("Toggle model activity"));
      chev.append(svg(CHEV, 12, 1.7));
      chev.setAttribute("aria-hidden", "true");
      summary.append(chev);
      setAttr(summary, "title", t("Gateway request activity only; task completion is unknown."));
      node.open = true;
      list.tabIndex = 0;
      node.append(summary, list, overflow);
      a.node.append(node);
      const activity = a.activity = { node, summary, list, overflow, entries: new Map() };
      // Viewport limits presentation only, never the number of observed actors.
      activity.measure = () => {
        if (!node.open) return;
        const box = list.getBoundingClientRect();
        const outside = [...list.children].filter((n) => {
          const r = n.getBoundingClientRect();
          return r.top < box.top - 1 || r.bottom > box.bottom + 1;
        }).length;
        setText(overflow, outside ? t("{n} activity entries outside view; scroll to view all", { n: outside }) : "");
      };
      list.addEventListener("scroll", activity.measure, { passive: true });
      node.addEventListener("toggle", activity.measure);
    }
    const { list, entries, measure } = a.activity, models = actorModels(requests), agent = requests[0].agent;
    for (const [id, e] of entries) if (!groups.has(id)) { e.node.remove(); entries.delete(id); }
    for (const [id, group] of groups) {
      let e = entries.get(id);
      if (!e) {
        const node = el("li", "rt-actor"), chips = el("span", "rt-actor-models"),
          client = icon(agentOf(agent)?.icon || "generic");
        client.setAttribute("aria-hidden", "true");
        node.style.setProperty("--depth", 1);
        node.append(client, chips); list.append(node);
        entries.set(id, e = { node, chips, models: "" });
      }
      const names = models.get(id).map((m) => m ?? t("Unknown model"));
      const state = t(group.active > 1 ? "{n} requests active" : group.active ? "Request active" : "Requests ended", { n: group.active });
      const signature = JSON.stringify(names);
      if (signature !== e.models) {
        e.chips.replaceChildren(...names.map((name) => {
          const chip = el("code", "mdl");
          setText(chip, name); setAttr(chip, "title", name);
          return chip;
        }));
        e.models = signature;
      }
      const description = [agentName(agent), names.join(", "), state,
        t("{active} active requests; {ended} ended requests", { active: group.active, ended: group.ended }),
        ...(id ? [] : [t("Request identity unavailable")])].join("\\n");
      setAttr(e.node, "title", description);
      setAttr(e.node, "aria-label", description);
      e.node.classList.toggle("on", group.active > 0);
    }
    setAttr(list, "aria-label", t("Model request activity — scroll for all activity"));
    measure();
  }
`;
const ACTIVITY_TRANSLATIONS = {
  'zh-TW': {
    'Toggle model activity': '展開或收合模型活動',
    'Request identity unavailable': '無法識別請求來源',
    'Request active': '請求中',
    '{n} requests active': '{n} 個請求中',
    'Requests ended': '請求已結束',
    '{active} active requests; {ended} ended requests': '{active} 個請求中；{ended} 個請求已結束',
    'Gateway request activity only; task completion is unknown.': '僅表示閘道請求活動；無法判定任務是否完成。',
    'Model request activity — scroll for all activity': '模型請求活動 — 捲動以查看所有活動',
    '{n} activity entries outside view; scroll to view all': '{n} 個活動項目未顯示；捲動以查看全部',
  },
}; // Other locales intentionally use the native English-message fallback.
export function sessionPatch(s) {
  const edits = [];
  const p = (a,b) => { s = replace(s,a,b); edits.push({before:a,after:b}); };
  p('const agents = new Map(); // agent → { node, ic, name, sub, wire }', `const agents = new Map(); // exact recorded source → { node, ic, name, sub, wire }
  const sourceKey = (r) => typeof r.session === "string" && r.session.length
    ? JSON.stringify(["session", r.agent, r.session])
    : JSON.stringify(["unknown", r.agent, host.generation(), r.id, r.time]);
  const sourceLabel = (r) => r.session ? (r.session.length > 14 ? r.session.slice(0, 12) + "…" : r.session) : t("Unknown session") + " · #" + r.id;`);
  p('last.set(r.agent, r)', 'last.set(sourceKey(r), r)');
  p('last.get(r.agent) === r', 'last.get(sourceKey(r)) === r');
  p('out.map((r) => r.agent)', 'out.map(sourceKey)');
  p('ags.includes(r.agent)', 'ags.includes(sourceKey(r))');
  p('function agentNode(id) {', 'function agentNode(id, actualAgent = id) {');
  p('node.style.setProperty("--agent", hueOf(id));\n    a.wire.style.setProperty("--agent", hueOf(id));', 'node.style.setProperty("--agent", hueOf(actualAgent));\n    a.wire.style.setProperty("--agent", hueOf(actualAgent));');
  p('const ags = [...new Set(rs.map((r) => r.agent))];', 'const ags = [...new Set(rs.map(sourceKey))];\n    const actualAgents = [...new Set(rs.map((r) => r.agent))];');
  p('.map((id) => agentNode(id).node)', '.map((id) => agentNode(id, rs.find((r) => sourceKey(r) === id).agent).node)');
  p('hues(ags);', 'hues(actualAgents);');
  p('const a = agents.get(id), r = rs.filter((x) => x.agent === id).pop(), ag = agentOf(id);', 'const a = agents.get(id), r = rs.filter((x) => sourceKey(x) === id).pop(), ag = agentOf(r.agent);');
  p('for (const n of [a.node, a.wire]) n.style.setProperty("--agent", hueOf(id));', 'for (const n of [a.node, a.wire]) n.style.setProperty("--agent", hueOf(r.agent));');
  p('setText(a.name, agentName(id));', 'setText(a.name, agentName(r.agent));');
  p('filter((x) => x.agent === id &&', 'filter((x) => sourceKey(x) === id &&');
  p('...rs.filter((x) => x.agent === id)', '...rs.filter((x) => sourceKey(x) === id)');
  p('const n = now(), going = pinned ? [] : [...src().values()].filter((x) => sourceKey(x) === id && (!x.done || at(x.time) + (x.ms || 0) > n - LINGER));\n      const fs = foldersOf([...new Set([...going, ...rs.filter((x) => sourceKey(x) === id)])].sort((x, y) => x.id - y.id));',
    'const relevant = sourceRequests(id, rs), fs = foldersOf(relevant);\n      // Project disclosure is independent of full-folder disclosure. Never infer it from folder.\n      const projects = [...new Set(relevant.map((x) => x.projectName).filter(Boolean))];');
  p('setText(a.sub, fs.length > 1 ? fs.map(lastLevel).join(", ") : r.model);', 'setText(a.sub, projects.length ? projects.map(lastLevel).join(", ") + " · " + sourceLabel(r) : sourceLabel(r) + " · " + r.model);');
  p('const tip = [agentName(id), r.model, ...fs.map((f) => t("Folder") + ": " + f)].join("\\n");', 'const tip = [agentName(r.agent), r.model, r.session ? t("Session id") + ": " + r.session : sourceLabel(r), ...projects, ...fs.map((f) => t("Folder") + ": " + f)].join("\\n");');
  p('function agentNode(id, actualAgent = id) {', SOURCE_ACTIVITY + '\n  function agentNode(id, actualAgent = id) {');
  p('const n = now(), rs = staged();', 'const n = now(), rs = staged();\n    // Activity reads retained gateway truth, never the synthetic replay clock/status.\n    for (const [key, a] of agents) sourceActivity(a, sourceRequests(key, rs, routes, Date.now() + skew));');
  p('header(cur, ags.length);', 'header(cur, actualAgents.length);');
  p('agents.size <= 1', 'new Set(rs.map((r) => r.agent)).size <= 1');
  p('agents.size > 1', 'new Set(rs.map((r) => r.agent)).size > 1');
  p('busy.add(r.agent)', 'busy.add(sourceKey(r))');
  p('busy.add(f.agent)', 'busy.add(f.sourceKey)');
  p('const flying = new Map(); // packet → { id: the row it is at, agent }', 'const flying = new Map(); // packet → { id: the row it is at, agent, sourceKey }');
  p('const A = agents.get(r.agent);', 'const A = agents.get(sourceKey(r));');
  p('flying.set(dot, { id: tryseat(r, r.tries[i]), agent: r.agent });', 'flying.set(dot, { id: tryseat(r, r.tries[i]), agent: r.agent, sourceKey: sourceKey(r) });');
  return { code:s, edits };
}
function sharedHelpers(app, renderer) {
  const ast = parse(app), declarations = new Map();
  for (const n of ast.program.body) {
    if (n.type === 'FunctionDeclaration') declarations.set(n.id.name,n);
    if (n.type === 'VariableDeclaration') for (const d of n.declarations) if (d.id.type === 'Identifier') declarations.set(d.id.name,n);
  }
  const chosen = new Set(), pending = [...freeNames(renderer), 'params'];
  // Explicitly audited pure native helpers only. Missing dependencies fail, not stubs.
  const allowed = new Set(['$','$$','params','el','svg','CHEV','FAN','dot','icon','keptIcons','keepIcons','maskLoads','maskShelf','maskSpan','oneTone','toneCheck','pngIcons','replaceKeeping','calm','ctxShort','ledNum','ledFmt','ledFmtLang','fmtN','chineseUnits','fmtCost','currency','fx','countFormat','quotaLeft','quotaCount','runsOutText','resetClock','resetIn','resetInText','whenReset','dateLocale','escapeRE']);
  while (pending.length) {
    const name = pending.pop();
    if (!allowed.has(name)) continue;
    const n = declarations.get(name);
    if (!n) throw new Error('Missing shared helper '+name);
    if (chosen.has(n)) continue;
    chosen.add(n);
    pending.push(...freeNames(app.slice(n.start,n.end)));
  }
  let code = [...chosen].sort((a,b)=>a.start-b.start).map(n=>`// upstream app.js:${n.loc.start.line}-${n.loc.end.line}\n${app.slice(n.start,n.end)}\n`).join('\n');
  // Fixed local images only. Never proxy arbitrary file: artwork to the core.
  const a = code.indexOf('  if (name?.startsWith("file:")) {'), b = code.indexOf('  // a URL:',a);
  if (a < 0 || b < 0) throw new Error('icon boundary missing');
  code = code.slice(0,a) + '  if (!NATIVE_ICONS.has(name) && name !== "generic") return icon("generic");\n' + code.slice(b);
  code = code.replaceAll('`icons/${name}', '`vendor/magpie/icons/${name}');
  // The plugin has an opaque sandbox origin. Without anonymous CORS, native
  // toneCheck's canvas is tainted and monochrome artwork cannot adapt to theme.
  // Fixed local static GETs already permit precisely Origin: null; no cookies.
  code = replace(code, '      const img = el("img");', '      const img = el("img");\n      img.crossOrigin = "anonymous";');
  return code;
}
export function generate({ upstream, check=false }={}) {
  fs.mkdirSync(VENDOR,{recursive:true});
  let manifest;
  if (upstream) {
    const read = p => execFileSync('git',['-C',upstream,'show',REVISION+':'+p],{maxBuffer:32*1024*1024});
    const paths = ['LICENSE','THIRD_PARTY_NOTICES','docs/reference.md',...['app.js','app.css','index.html','i18n.js','kernel.js','purposes.js','plugins/routing/client.js','plugins/routing/routing.css','plugins/routing/i18n.js'].map(p=>ASSETS+p)];
    const tree = execFileSync('git',['-C',upstream,'ls-tree','-r','--name-only',REVISION],{encoding:'utf8'}).trim().split('\n');
    paths.push(...tree.filter(p=>p.startsWith(ASSETS+'icons/') && /\.(svg|png)$/.test(p)));
    // Actual built-in agent labels/icons, not a fabricated runtime configuration.
    const agentFiles = tree.filter(p=>p.startsWith('internal/agent/') && p.endsWith('.go') && !p.endsWith('_test.go'));
    const clients = new Map();
    for (const p of agentFiles) {
      const text = read(p).toString();
      const re = /ID:\s*"([^"]+)"\s*,\s*Name:\s*"([^"]+)"\s*,\s*Icon:\s*"([^"]+)"/g;
      let m, used = false; while ((m=re.exec(text))) { used = true; if (!clients.has(m[1])) clients.set(m[1],{id:m[1],name:m[2],icon:m[3]}); }
      // These upstream constructors pass labels/icons as arguments instead of
      // repeating struct literals (e.g. OpenCode and Pi). Read only literals.
      for (const [pattern, iconAt] of [[/openCodeLike\([^"\n]+"([^"]+)",\s*"([^"]+)",\s*"([^"]+)"/g, 3], [/piLike\([^"\n]+"([^"]+)",\s*"([^"]+)"/g, 1]]) {
        while ((m=pattern.exec(text))) { used = true; if (!clients.has(m[1])) clients.set(m[1],{id:m[1],name:m[2],icon:m[iconAt]}); }
      }
      if (used) paths.push(p);
    }
    const entries=[];
    for (const p of paths) {
      const data=read(p), rel=p.startsWith(ASSETS)?p.slice(ASSETS.length):p;
      const dest=path.join(VENDOR,'upstream',rel); fs.mkdirSync(path.dirname(dest),{recursive:true}); fs.writeFileSync(dest,data);
      entries.push({path:p,snapshot:'upstream/'+rel,sha256:hash(data),bytes:data.length});
    }
    manifest={revision:REVISION,version:'0.1.3124',license:'MIT',upstream:'https://github.com/yetone/magpie',files:entries,clients:[...clients.values()].sort((a,b)=>a.id.localeCompare(b.id))};
    fs.writeFileSync(path.join(VENDOR,'source-manifest.json'),JSON.stringify(manifest,null,2)+'\n');
  } else manifest=JSON.parse(fs.readFileSync(path.join(VENDOR,'source-manifest.json'),'utf8'));
  if (manifest.revision!==REVISION) throw new Error('Wrong source revision');
  for (const f of manifest.files) if (hash(fs.readFileSync(path.join(VENDOR,f.snapshot)))!==f.sha256) throw new Error('Changed pristine source '+f.path);
  const read = p => fs.readFileSync(path.join(VENDOR,'upstream',p),'utf8');
  const source=read('plugins/routing/client.js'), base=extract(source), {code,edits}=sessionPatch(base);
  const helpers=sharedHelpers(read('app.js'),code);
  const kernel=read('kernel.js');
  const strings='function nativeStrings(dict) {\n'+lines(kernel,253,259)+'}\n';
  const icons=manifest.files.filter(f=>f.path.startsWith(ASSETS+'icons/'));
  const app = read('app.js');
  let mask = 'window.installNativeMask = function(accountNames) {\n' + lines(app,24198,24388) + '\n  for (const s of sw) setMasked(s, s.on, true);\n};\n';
  mask = replace(mask, lines(app,24209,24225).trimEnd(), '    return [...accountNames()].filter(n => typeof n === "string" && n.length > 1).sort((a,b) => b.length-a.length);');
  mask = replace(mask, 'mode === "panel" ? [] : bs.map((b) => $(b)).filter(Boolean)', 'bs.map((b) => $(b)).filter(Boolean)');
  const runtime='// Generated from pinned upstream, see source-manifest.json.\n'+
    'const NATIVE_CLIENTS = '+JSON.stringify(manifest.clients)+';\n'+
    'const NATIVE_ICONS = new Set('+JSON.stringify(icons.map(f=>path.basename(f.path).replace(/\.(svg|png)$/,'')))+');\n'+
    helpers+'\n'+read('i18n.js')+'\n'+strings+'\n'+read('plugins/routing/i18n.js').replace('magpie.strings(', 'nativeStrings(')+
    '\n// Plugin-owned activity labels; other locales retain native English fallback.\nnativeStrings('+JSON.stringify(ACTIVITY_TRANSLATIONS)+');\n'+read('purposes.js');
  let markup=lines(source,23,28).replace(/^.*id="rtGoGroups".*\n/m,'').replace(/^.*id="rtNewGroup".*\n/m,'').replace(/^.*id="rtMore".*\n/m,'');
  const defs=read('index.html').match(/<defs><path id="bird"[\s\S]*?<\/defs>/)?.[0];
  if (!defs) throw new Error('Native bird artwork missing');
  const mount='window.mountNativeRouting = function(host) {\n  const main = document.createElement("main"); main.className = "view"; main.id = "view-routing";\n  main.innerHTML = '+JSON.stringify(markup)+';\n  document.body.append(main);\n  const art = document.createElementNS("http://www.w3.org/2000/svg", "svg");\n  art.setAttribute("width", "0"); art.setAttribute("height", "0"); art.setAttribute("aria-hidden", "true");\n  art.innerHTML = '+JSON.stringify(defs)+'; document.body.append(art);\n  translateStatic(); return routingPage(host);\n};\n';
  const outputs = new Map([
    ['client.js',mount+code],['test-only/client.baseline.js',mount+base],['native-helpers.js',runtime+'\n'+mask],
    ['routing.css',read('plugins/routing/routing.css')],['app.css',read('app.css')],
    ['LICENSE',read('LICENSE')],['THIRD_PARTY_NOTICES',read('THIRD_PARTY_NOTICES')],
    ['LOBE_ICONS_LICENSE',fs.readFileSync(path.join(VENDOR,'LOBE_ICONS_LICENSE'))],
    ['source-grouping-patch.json',JSON.stringify(edits,null,2)+'\n']
  ]);
  for (const f of icons) outputs.set('icons/'+path.basename(f.path),fs.readFileSync(path.join(VENDOR,f.snapshot)));
  const staticFiles=[...outputs.keys()].filter(p=>!p.startsWith('test-only/') && p!=='source-grouping-patch.json').map(p=>'vendor/magpie/'+p);
  outputs.set('static-manifest.json',JSON.stringify({files:staticFiles},null,2)+'\n');
  outputs.set('extraction-manifest.json',JSON.stringify({revision:REVISION,
    generator:'scripts/vendor-native-routing.mjs', generatorSha256:hash(fs.readFileSync(fileURLToPath(import.meta.url))),
    lifecycle:'ui/native-lifecycle.inc.js', lifecycleSha256:hash(fs.readFileSync(path.join(ROOT,'ui/native-lifecycle.inc.js'))),
    baselineSha256:hash(base), sessionSha256:hash(code), sessionPatch:'source-grouping-patch.json',
    sourceRanges:EXTRACTION_RANGES, ingestRange:[5392,5459],
    dataAndPrivacyDifferences:[
      {location:'header / destination member counts', difference:'Enabled-account counts and only-one-configured-account explanation are omitted; trace candidates are not configuration inventory.'},
      {location:'firstWhy / mode', difference:'Retained scalar routing evidence drives native descriptions; incomplete reasons say unavailable in the original explanation location.'},
      {location:'duration / outcome / statistics', difference:'Missing measurements and outcomes say unavailable; missing totals use an em dash rather than invented zero.'},
      {location:'account labels and tooltips', difference:'Stable opaque backend handles and neutral names replace raw account identities; mask only hides these neutral labels. External live quota windows are not read.'},
      {location:'group / provider headings', difference:'Recorded safe provider names and bundled icon/preset metadata retain native precedence; unavailable or unsupported metadata uses neutral/generic fallback. Private group/account identities remain opaque and settings navigation is removed, not stubbed.'},
      {location:'source names / model subtitles', difference:'Pinned built-in client labels/icons replace installed-client inventory. A separately disclosed project basename precedes the short session, including a single project; model and full session remain in the tooltip. No folder-to-project inference. Full folder metadata is separately opt-in.'},
      {location:'source child activity / ui/style.css', difference:'Source-local child rows adapt pinned native nested-group spacing/borders (routing.css lines 71-107), with depth-1 indentation, the actual client icon and concrete observed model names only. No visible section/actor label, provider display name, state pill, ID or numbering. Verified requested-provider prefixes use requestedModelName; model namespaces stay intact. Request state/counts and unknown-identity evidence remain in tooltips/accessibility text. Opaque actor keys stay internal; one unknown-actor activity aggregate. No worker ancestry, task completion claim, extra source, wire, or flight endpoint. A list-wide disclosure and keyboard/touch scroll expose all retained entries; no added actor cap. Only this scoped extension uses plugin CSS; native CSS is byte-identical. New messages translate zh-TW and otherwise fall back to English.'},
      {location:'gateway subtitle / clock', difference:'Collected process identity is shown without a gateway URL; missing source clock blocks live playback. Group clock configuration is unavailable.'},
      {location:'quota / formatting helpers', difference:'Recorded quota fields remain; provider-supplied display text, live windows, expiry inventory, currency preferences and exchange rates are not fetched. Native default number/USD formatting remains.'},
      {location:'transport / lifecycle', difference:'Authenticated bounded whole snapshots replace core polling; collector live status is not process ownership. Hidden/aborted/revoked and generation reset paths clear or pause native playback.'},
      {location:'icon image transport', difference:'Fixed local images use anonymous CORS so native toneCheck canvas sampling works in the opaque-origin sandbox. Only Origin: null is allowed; no credentials or arbitrary icon URLs.'},
      {location:'upper header controls / request log', difference:'Original mask and replay retained; group editor links, usage/body actions, context cards and diagnostic-report actions excluded.'}
    ],
    excluded:['lower requests/history','group/provider editors and writes','quota inventory reads/reset','body/header/archive/context viewers','raw trace polling','local agent session-title reads','tray panel'],
    unavailable:['configured provider inventory and edit navigation','external live quota windows','group configuration clock','private account/session names','body/headers/prompts','routing reasons marked partial by the projector'],
    artwork:{source:'upstream/icons/', attribution:'upstream/docs/reference.md lines 84-87', lobeLicense:'LOBE_ICONS_LICENSE', lobeLicenseSource:'https://raw.githubusercontent.com/lobehub/lobe-icons/master/LICENSE', lobeLicenseSha256:hash(fs.readFileSync(path.join(VENDOR,'LOBE_ICONS_LICENSE'))), note:'Unmodified upstream local artwork. Brand marks identify observed software; no endorsement is claimed.'}
  },null,2)+'\n');
  for (const [rel,data] of outputs) {
    const dest=path.join(VENDOR,rel);
    if (check) { if (!fs.existsSync(dest)||hash(fs.readFileSync(dest))!==hash(data)) throw new Error('Generated file differs: '+rel); }
    else { fs.mkdirSync(path.dirname(dest),{recursive:true}); fs.writeFileSync(dest,data); }
  }
  return {staticFiles,freeNames:freeNames(runtime+'\n'+code),sourceChanges:edits.length};
}
if (process.argv[1] && path.resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  const args=process.argv.slice(2), at=args.indexOf('--upstream');
  console.log(JSON.stringify(generate({upstream:at>=0?args[at+1]:undefined,check:args.includes('--check')}),null,2));
}

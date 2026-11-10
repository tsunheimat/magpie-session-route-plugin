window.mountNativeRouting = function(host) {
  const main = document.createElement("main"); main.className = "view"; main.id = "view-routing";
  main.innerHTML = "    <div class=\"row-head\"><span class=\"label\" data-t>Routing</span><span class=\"rt-livedot\" aria-hidden=\"true\"></span><span class=\"note\" data-t>live, as the gateway decides</span><span class=\"grow\"></span>\n      <button class=\"text rt-mask\" id=\"rtMask\" aria-pressed=\"false\" data-tt=\"Mask the accounts on every page — email addresses and account names — for a screenshot to share\"><svg viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\" aria-hidden=\"true\"><path d=\"M9.9 4.2A10.4 10.4 0 0 1 12 4c6.5 0 10 8 10 8a17.6 17.6 0 0 1-2.2 3.2M6.6 6.6C3.9 8.4 2 12 2 12s3.5 8 10 8a9.7 9.7 0 0 0 5.4-1.6M9.9 9.9a3 3 0 0 0 4.2 4.2M2 2l20 20\"/></svg><span data-t>Hide accounts</span></button></div>\n    <section class=\"rt\" id=\"rt\"></section>\n";
  document.body.append(main);
  const art = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  art.setAttribute("width", "0"); art.setAttribute("height", "0"); art.setAttribute("aria-hidden", "true");
  art.innerHTML = "<defs><path id=\"bird\" fill=\"currentColor\" fill-rule=\"evenodd\" d=\"M1.5 5.5C1.3 5.7 1.2 6.5 1.2 6.9C1.2 6.9 1.2 7 1.2 7.1C1.1 7.4 1.3 8 1.4 8.3C1.4 8.4 1.5 8.5 1.5 8.7C1.5 8.9 1.7 9 1.8 9.3C2.2 9.9 2.2 10 2.3 10.1C2.4 10.2 2.5 10.3 2.6 10.5C2.8 10.8 3 11.1 3.2 11.3C3.3 11.3 3.4 11.6 3.6 11.8C3.8 12 4.1 12.4 4.2 12.5C4.7 13 5.2 13.7 5.4 13.9C6 14.5 6.5 15.1 6.7 15.3C6.7 15.4 6.9 15.5 6.9 15.7C7.3 15.9 7.7 16.5 7.9 16.8C7.9 16.8 8 16.9 8 16.9C8.1 16.9 8.2 17.2 8.2 17.3C8.2 17.3 8.1 17.2 8.1 17.1C7.9 16.9 7.9 16.9 7.6 16.6C7.5 16.5 7.4 16.5 7.4 16.3C7.2 16.2 6.7 15.7 6.3 15.2C6.1 15.1 6 14.9 6 14.9C5.9 14.8 5.7 14.7 5.7 14.6C5.6 14.5 5.4 14.3 5.3 14.2C5.1 14.1 4.9 13.8 4.7 13.5C4.5 13.3 4.2 13.1 4.1 12.9C4.1 12.9 3.8 12.7 3.8 12.5C3.5 12.3 3 11.8 2.8 11.4C1.8 10.5 0.9 9.6 0.7 9.6C0.6 9.7 0.6 9.8 0.5 10C0.5 10.1 0.6 10.2 0.5 10.3C0.5 10.4 0.6 10.5 0.6 10.6C0.5 10.7 0.5 10.9 0.6 11C0.5 11.1 0.6 11.4 0.6 11.5C0.9 12.9 1.3 13.8 2.8 14.9C2.9 15.1 3.3 15.3 3.4 15.4C3.4 15.5 3.6 15.6 3.7 15.7C4.2 16 6.4 17.8 7 18.4C7.4 18.8 7.4 18.8 7.5 18.9C7.6 19 7.7 19 7.7 19.1C7.7 19.2 7.8 19.2 7.9 19.2C7.9 19.3 8.1 19.4 8.1 19.5C8.2 19.6 8.2 19.7 8.3 19.7C8.3 19.7 8.3 19.7 8.2 19.7C8.2 19.6 8.1 19.6 8 19.6C7.9 19.5 7.9 19.4 7.8 19.4C7.7 19.3 7.6 19.2 7.6 19.2C7.6 19.1 7.5 19 7.3 18.9C7.2 18.9 6.9 18.6 6.7 18.4C6.1 17.8 4.5 16.6 3.5 16C3.4 15.8 3 15.6 2.9 15.5C2.6 15.3 1.5 14.6 0.9 14.3C0.7 14.1 0.6 14.1 0.6 14.2C0.5 14.5 0.8 15.9 0.9 16.1C0.9 16.2 1 16.2 0.9 16.3C1.2 16.8 1.9 17.6 2.7 18.3C2.8 18.5 4 19.2 4.7 19.5C6.2 20.5 6.6 20.7 7.4 21.5C8.2 22.2 8.7 22.7 9.3 23.6C9.5 24.1 9.9 24.4 10.3 25.3C10.4 25.5 10.5 25.8 10.5 25.8C10.7 25.8 10.8 25.7 11 25.4C11.6 25 11.9 24.6 12.3 24.3C12.8 24 13 23.8 13 23.7C13.1 23.7 13.1 23.8 13 24C12 24.8 11 26 10.2 26.9C10.1 27.1 9.9 27.5 9.7 27.7C9.5 27.8 9.4 28 9.4 28C9.4 28 9.3 28.3 9.1 28.5C8.6 29.2 7.7 30.8 7.7 30.9C7.7 31 7.8 31 8.3 30.8C9 30.4 9.5 30.2 10.4 30C11.7 29.6 12.5 29.6 11.6 30C10.5 30.2 9.7 30.6 9.2 31.2C8.8 31.7 8.8 31.7 9.3 31.7C10.1 31.8 10.9 31.9 11.6 32.2C12.8 32.7 13.5 33.1 15.5 34.8C16.4 35.5 17.3 36.2 17.8 36.4C17.9 36.5 18.1 36.7 18.2 36.8C19.1 37.3 21.2 38.1 22.3 38.3C22.4 38.3 22.7 38.3 22.8 38.3C22.8 38.5 23 38.5 23 38.5C23.1 38.5 23.2 38.5 23.3 38.5C23.6 38.6 25.9 38.6 26.1 38.5C26.2 38.5 26.3 38.5 26.4 38.5C26.5 38.5 26.6 38.5 26.7 38.3C26.7 38.3 27 38.3 27.1 38.3C28.3 38.1 30.2 37.3 31.4 36.7C31.5 36.7 31.7 36.4 31.8 36.4C32.2 36.2 33.2 35.4 33.4 35.2C34.2 34.5 35.5 33 35.8 32.6C35.8 32.5 36 32.2 36.1 32C36.4 31.8 36.6 31.4 36.6 31.2C36.7 31.1 36.8 30.9 36.9 30.8C37.2 30.4 37.5 29.6 37.7 29.2C37.7 29.1 37.8 28.7 37.9 28.7C38.1 28.5 38.4 27.1 38.5 26.8C39 25.2 39.1 23.7 39 22.4C39 22.2 38.9 21.9 38.9 21.8C38.9 21.7 38.9 21.6 38.9 21.4C38.6 20.5 38.5 19.9 38.2 19C37.9 18.5 37.5 17.5 37.3 17.2C37 16.8 36.8 15.8 36.8 15.2C36.8 13.8 37.7 12.7 39.6 12.2C40.1 12.1 41.3 11.8 42.1 11.7C43.5 11.5 43.5 11.5 43.4 11.3C42.9 10.7 40.9 9.9 39.2 9.7C37.9 9.5 38.1 9.5 37.6 9C37 8.6 36.4 8 36 7.9C36 7.8 35.8 7.8 35.7 7.7C35.1 7.3 34.2 7 33.1 6.9C32.6 6.7 31.6 6.9 31 7C29.6 7.3 28.3 8 27.3 9.2C26.7 9.8 26.2 10.8 25.7 11.7C25.5 12.1 24.8 13.4 24.7 13.7C24.6 13.9 24.5 14.1 24.1 14.7C23.5 15.7 22.1 16.9 20.6 17.8C20.5 18 20.3 18.2 20.1 18.3C19.7 18.5 19.4 18.8 19.1 19C18.9 19.1 18.7 19.3 18.5 19.4C18 19.8 17.2 20.3 17 20.5C16.9 20.5 16.8 20.6 16.7 20.7C16.3 20.8 16.1 20.9 16 20.9C15.5 20.8 14.9 20.5 14.2 20.2C13.7 19.8 12.7 18.9 12.4 18.6C12.3 18.5 12.2 18.4 12.1 18.2C11.9 18 11.2 17.1 11 16.6C10.9 16.5 10.8 16.4 10.7 16.3C10.7 16.2 10.6 16.1 10.6 15.9C10.5 15.9 10.4 15.7 10.4 15.6C10.3 15.5 10.2 15.2 10.1 15C10 14.8 9.8 14.4 9.7 14.2C9.6 14 9.5 13.7 9.4 13.6C9.4 13.4 9.3 13.2 9.2 13C9.2 12.8 9 12.6 9 12.5C8.9 12.3 8.7 12.1 8.7 12C8.7 12 8.5 11.7 8.5 11.7C8.3 11.2 8.2 10.9 7.5 10C6.4 8.3 4.2 6.4 2.7 5.8C2 5.5 1.6 5.4 1.5 5.5ZM28.4 16.7C29.2 16.9 29.7 17.2 29.9 17.7C30.1 18.2 30 18.9 29.6 19.4C29.2 19.9 28.2 20.9 27.6 21.2C26.8 21.7 25.3 22.4 24.2 22.7C23.9 22.8 23.6 22.9 23.5 22.9C22.8 23.2 20.7 23.7 19.6 24C19 24.2 18.4 24.3 18.1 24.4C17.9 24.4 16.1 24.9 15.3 25.1C14.6 25.2 14.7 25.1 15.7 23.6C16.4 22.7 18.5 20.6 19.4 19.9C20.8 18.8 21.4 18.4 23.2 17.6C23.8 17.4 25.6 16.8 25.9 16.8C25.9 16.8 26.3 16.8 26.6 16.7C26.8 16.7 28.2 16.7 28.4 16.7ZM30.4 20.2C30.5 20.3 30.6 20.6 30.6 20.7C31.7 23.1 33.4 24.6 35.6 25.3C36.1 25.5 36.7 25.7 37.2 25.8C37.7 25.8 37.8 25.9 37.8 26.1C37.7 26.2 37.7 26.3 37.7 26.5C37.7 26.6 37.7 26.8 37.6 27C37.4 28.5 36.8 29.9 36.1 31C36.1 31.2 35.9 31.4 35.9 31.6C35.7 31.9 35.2 32.6 34.7 33.3C32.6 35.6 29.7 37.3 26.6 37.8C26.5 37.8 26.3 37.9 26.2 37.9C25.8 37.9 23.7 37.9 23.3 37.9C23.2 37.9 23 37.8 22.9 37.8C21.1 37.6 19.3 36.8 18 35.7C17.7 35.4 17 34.7 16.8 34.5C16.3 33.8 16.1 33 16.3 32.5C16.5 31.8 16.8 31.6 17.9 31.1C19.1 30.5 19.4 30.4 20.2 30C21.4 29.4 23.2 28.4 23.9 27.9C23.9 27.8 24.2 27.7 24.5 27.6C26.3 26.3 28 24.6 28.9 22.9C29.5 22.2 29.7 21.6 29.9 20.7C30.1 20 30.2 19.9 30.4 20.2Z\"/><clipPath id=\"bird-body\"><path clip-rule=\"evenodd\" d=\"M16 0H44V44H0V26.4H10.6L13 24.2L16 19Z M29.8 18.3L26 19L22 21L17 23.5L14.6 24.7L10.6 26.4L6 29V32L9 31.5L12.5 32L16.4 31.8L19 31.4L24 28.8L28.5 24L30.6 21.4Z\"/></clipPath><clipPath id=\"bird-notail\"><path d=\"M17 0H44V44H0V26.4H10.6L14 25L17.2 19.6Z\"/></clipPath><clipPath id=\"bird-tail\"><path d=\"M0 0H17L17.2 19.6L14 25L10.6 26.4H0Z\"/></clipPath><clipPath id=\"bird-wing\"><path d=\"M29.8 18.3L26 19L22 21L17 23.5L14.6 24.7L10.6 26.4L6 29V32L9 31.5L12.5 32L16.4 31.8L19 31.4L24 28.8L28.5 24L30.6 21.4Z\"/></clipPath></defs>"; document.body.append(art);
  translateStatic(); return routingPage(host);
};

// upstream client.js:43-109
function routingPage(host) {
  const purpose = [];
  const day = "", past = [];
  let sightWait = null;
  const state = { clients: NATIVE_CLIENTS };
  let by = null;
  const box = $("#rt");
  if (!box) return;
  const NS = "http://www.w3.org/2000/svg";
  const still = calm;
  const shown = () => host.visible() && !$("#view-routing").hidden && !document.hidden;
  // steady redraws a part of the page where the reader is: WebKit has no
  // scroll anchoring, and a part emptied and filled again, measured between,
  // pulls the page up to what was left of it for that moment
  function steady(fn) {
    const v = $("#view-routing"), top = v.scrollTop;
    try { return fn(); } finally { if (v.scrollTop !== top) v.scrollTop = top; }
  }

  // ---------- the stage ----------

  const top = el("div", "rt-top");
  const what = el("div", "rt-what");
  const mode = el("p", "rt-mode");
  top.append(what, mode);
  const stage = el("div", "rt-stage");
  const wires = document.createElementNS(NS, "svg");
  wires.setAttribute("class", "rt-wires");
  wires.setAttribute("aria-hidden", "true");
  // the wires flowing, drawn over the rest in an svg of their own (flowNear)
  const flows = document.createElementNS(NS, "svg");
  flows.setAttribute("class", "rt-flows");
  flows.setAttribute("aria-hidden", "true");
  const srcs = el("div", "rt-srcs"); // an agent's node each
  const hub = el("div", "rt-node rt-hub");
  const logo = document.createElementNS(NS, "svg");
  logo.setAttribute("viewBox", "0 0 44 44");
  logo.setAttribute("class", "rt-bird");
  logo.innerHTML = '<use href="#bird"/>';
  const hubSub = el("small"), chip = el("i");
  hub.append(logo, el("b", "", "magpie"), hubSub, chip);
  const list = el("ol", "rt-accts");
  // the magpies fly over the nodes, the wires run under them
  const sky = document.createElementNS(NS, "svg");
  sky.setAttribute("class", "rt-sky");
  sky.setAttribute("aria-hidden", "true");
  stage.append(wires, flows, srcs, hub, list, sky);
  const foot = el("div", "rt-foot");
  const cap = el("p", "rt-cap");
  cap.setAttribute("aria-live", "polite");
  const stats = el("div", "rt-stats");
  const statB = [];
  for (const k of ["requests", "rerouted", "errors your agent saw"]) {
    const s = el("span"), b = el("b", "", "0");
    s.append(b, el("span", "", k));
    s.dataset.label = k;
    if (k === "errors your agent saw") {
      // the newest request whose agent got an error, to see what it got
      s.classList.add("rt-errs");
      s.title = t("Show the latest request that failed");
      s.addEventListener("click", () => {
        const r = listed().find(failedRoute);
        if (r) pick(r);
      });
    }
    statB.push(b);
    stats.append(s);
  }
  foot.append(cap, stats);
  const log = el("div", "rt-log");
  const logHead = el("div", "rt-log-head");
  const steps = el("ol", "rt-steps");

// upstream client.js:120-132
  const off = el("div", "none rt-off");
  // over the stage while a replay plays: the time it is replaying, which
  // requests are in flight then, and where it is among them
  const rbar = el("div", "rt-replay");
  const rTop = el("div", "rp-top"), rClock = el("b", "rp-clock"), rDay = el("small", "rp-day"), rSkip = el("span", "rp-skip");
  const rSpeed = el("button", "text"), rStop = el("button", "text");
  rTop.append(el("span", "rp-tag"), rClock, rDay, rSkip, el("span", "grow"), rSpeed, rStop);
  const rWhat = el("div", "rp-what");
  const rTrack = el("div", "rp-track"), rHead = el("i", "rp-head");
  rTrack.append(rHead);
  rbar.append(rTop, rWhat, rTrack);
  rbar.hidden = true;
  log.append(logHead, steps);
  box.append(top, rbar, stage, foot, log, off);

// upstream client.js:295-312
  // the narrow and wide layouts go by a box's own width, as container
  // queries would, set here as a class (max560: 560px wide or less). Not
  // by container queries: with query containers in it, WebKit pulled the
  // scrolling view back from its end a frame after each scroll there, so
  // the page couldn't be scrolled to its bottom (#1249). Set on the next
  // frame: a class changed in the observer's own call changes the box's
  // height, which WebKit reports as a ResizeObserver loop (see quotaFit).
  // Out of sight a box is 0 wide: it keeps the layout it had, or coming
  // back laid out narrow and then, a frame later, wide again (#4652)
  const byWidth = (node, marks) => new ResizeObserver(([e]) => {
    const w = e.contentRect.width;
    if (!w) return;
    requestAnimationFrame(() => {
      for (const [cls, fits] of Object.entries(marks)) node.classList.toggle(cls, fits(w));
    });
  }).observe(node);
  byWidth(box, { max560: (w) => w <= 560 });
  byWidth(list, { max460: (w) => w <= 460, max560: (w) => w <= 560 });

// upstream client.js:349-534
  const path = () => { const p = document.createElementNS(NS, "path"); wires.appendChild(p); return p; };
  const setText = (e, s) => { if (e.textContent !== s) e.textContent = s; };
  // setAttr: an attribute written only when it changes, as setText: the
  // list's head is told again on every trace answer (#3731)
  const setAttr = (e, k, v) => { if (e.getAttribute(k) !== v) e.setAttribute(k, v); };
  // rerun: a class's animation played again from its start. Taking the
  // class off and reading offsetWidth to start it again laid the whole page
  // out, three or four times a request (gpboyer2, #3731): a running one is
  // rewound, and the class comes off when it ends, so putting it on again
  // starts it with no layout
  const replaying = new WeakSet();
  const rerun = (e, cls, name) => {
    const a = e.getAnimations?.().find((x) => x.animationName === name);
    if (a) { a.currentTime = 0; return; }
    if (!replaying.has(e)) {
      replaying.add(e);
      e.addEventListener("animationend", (ev) => { if (ev.target === e && ev.animationName === name) e.classList.remove(cls); });
    }
    e.classList.add(cls);
  };
  const tick = (e) => rerun(e, "tick", "rttick");
  const tagFor = new WeakMap(); // a row's failure tag: the timer that takes it down

  // ---------- words ----------

  let skew = 0; // the gateway's clock less this page's
  // now is the gateway's time — or, in a replay, the time it is replaying
  const now = () => rp ? rp.real : Date.now() + skew;
  // the times the trace says, each read once: every route names each of
  // its keys' rest and try times, and a provider of hundreds of keys
  // (#3164) had the stage, the story and the lists parse ~1M of them a
  // second, more than a third of the page's time
  const atOf = new Map();
  const at = (s) => {
    if (typeof s !== "string") return new Date(s).getTime();
    let v = atOf.get(s);
    if (v === undefined) {
      if (atOf.size > 50000) atOf.clear();
      atOf.set(s, v = new Date(s).getTime());
    }
    return v;
  };
  // when each rest was lifted by hand, by the key it rests by (#1869), on
  // the gateway's clock: here, or anywhere else the trace tells of
  // (d.lifted: the provider's editor's Try now, a key's new value)
  const liftedAt = new Map();
  function noteLifted(m) {
    for (const [k, v] of Object.entries(m || {})) if (at(v) > (liftedAt.get(k) || 0)) liftedAt.set(k, at(v));
  }
  // lifted: the rest by key, found at found, was lifted since — by the
  // time shown, so a replay of a request before the lift shows its rest
  const lifted = (key, found) => { const l = liftedAt.get(key) || 0; return !!key && l >= found && l <= now(); };
  // sunkKey is what a row sank by, as its rest's key is (restKey): an
  // account by its provider and user, a key by its own id
  const sunkKey = (w) => w.kind === "account" && w.who ? w.provider + "@" + w.who.toLowerCase() : w.id;
  const known0 = (s) => s && !s.startsWith("0001-");
  function dur(ms) {
    const s = Math.max(1, Math.round(ms / 1000));
    if (s < 60) return t("{n} s", { n: s });
    const m = Math.round(s / 60);
    if (m < 60) return t("{n} min", { n: m });
    const h = Math.floor(m / 60), mm = m % 60;
    if (h < 10 && mm) return t("{h} h {m} min", { h, m: mm });
    if (h < 48) return t("{n} h", { n: Math.round(m / 60) });
    return t("{n} d", { n: Math.round(m / 1440) });
  }
  const took = (ms) => typeof ms !== "number" ? t("unavailable") : ms < 1000 ? t("{n} ms", { n: ms }) : t("{n} s", { n: (ms / 1000).toFixed(ms < 10e3 ? 1 : 0) });
  // A reply in flight (#4951): the bytes the agent has had, what the content
  // is worth in tokens, and how long ago content last came. For requests
  // still out only: an ended row has its own metrics, which say more.
  const liveSize = (n) => n >= 1048576 ? (n / 1048576).toFixed(1) + " MiB"
    : n >= 1024 ? (n / 1024).toFixed(1) + " KiB" : Math.round(n || 0) + " B";
  // an estimate always carries ≈, and with no rate learned yet there is none
  const liveTokens = (r) => r.estTok ? t("≈ {n} tokens", { n: tokens(r.estTok) }) : "";
  // quiet is not failed: the row says how long ago, and its dot stops
  // pulsing after liveQuietMs with no content
  const liveQuietMs = 15e3;
  const liveSince = (r, now = Date.now()) => r.contentAt ? t("{d} ago", { d: dur(Math.max(0, now - r.contentAt)) }) : "";
  // (the formats made once: made for each call, they were much of what the
  // accounts' countdowns cost), made again when the GUI's language changes
  let fmtLang = null, HM, WD;
  function clock(s) {
    const d = new Date(s), n = new Date();
    if (fmtLang !== intlLang()) {
      fmtLang = intlLang();
      HM = new Intl.DateTimeFormat(fmtLang, { hour: "2-digit", minute: "2-digit" });
      WD = new Intl.DateTimeFormat(fmtLang, { weekday: "short" });
    }
    const hm = HM.format(d);
    return d.toDateString() === n.toDateString() ? hm : WD.format(d) + " " + hm;
  }
  // how long a reply took to begin, and how fast it wrote after (#196):
  // none for one whose window from its first content to its end is under
  // 100 ms or would have it write over 10,000 tok/s, as it came in one
  // burst at its end (usage.DecodeWindow, #731: a whole Gemini tool call,
  // 8264 tokens 1 ms before the end, read 8,264,000 tok/s)
  // A reply that reasoned counts its answer, its output less the
  // reasoning, from its first text (usage.DecodeOf, tony on Discord):
  // the reasoning was written before the stream showed any, OpenAI's
  // encrypted and its summary sent when done, and counting it read
  // gpt-6.1-sol at 163 tok/s. The reply's reasoning is its served try's.
  // A reply held back and let go in a burst at its end tells no speed
  // (usage.DecodeOf, John on Discord: Kimi Code at 2,237 tok/s): its
  // content came in under a quarter of its window (flow), or its answer
  // at over 20 times the pace its reasoning came before its first text, or
  // it came in under a second after a wait four times longer
  // (pluviophile714 on Discord: gpt-6.1-sol, 392 tokens 0.25 s after an
  // 8.2 s first token, read 1,539 tok/s; usage.HeldWindowMs).
  function decodeOf(r, ms, ttft, firstText, flow = r.flow, firstReasoning = r.firstReasoning, reasoningHidden = r.reasoningHidden) {
    if (reasoningHidden && !(firstText > 0)) return null;
    const think = reasoningOf(r), visible = think > 0 && !(firstText > 0) && firstReasoning >= ttft && flow > 0 && think <= r.out;
    const n = think > 0 && !visible ? r.out - think : r.out, from = visible ? firstReasoning : think > 0 ? firstText : ttft;
    const w = ms - from;
    if (!(n > 0 && ttft > 0 && from > 0 && w >= 100 && n * 1000 <= 10000 * w)) return null;
    if (flow > 0 && flow * 4 < w) return null;
    if (w < 1000 && from > 4 * w) return null;
    if (think > 0 && firstText > 0 && n * (firstText - ttft) > 20 * think * w) return null;
    return { n, w };
  }
  const reasoningOf = (r) => r.reasoning ?? (r.usage?.length ? r.usage[r.usage.length - 1].reasoning || 0 : 0);
  const speedOf = (r, ms = r.ms, ttft = r.ttft, firstText = r.firstText, flow = r.flow, firstReasoning = r.firstReasoning, reasoningHidden = r.reasoningHidden) => {
    const d = decodeOf(r, ms, ttft, firstText, flow, firstReasoning, reasoningHidden);
    return d ? d.n / (d.w / 1000) : 0;
  };
  // floorOf is the least a request that tells no speed of its own wrote
  // at, as the Usage page's Requests tab tells it for a gateway call
  // (usage/page.js's ledFloor_, zzzkl3994 on Discord: Routing left the speed
  // out of rows the Requests tab gave one): one that reasoned with no first
  // text recorded, its answer over the time after its first token, unless
  // its content came in a burst; else its output over its whole time, from
  // the request to its last token, when that is 1,000 tokens or more over a
  // second or more. answer says which. null when it tells none.
  
  // rowSpeed is a done request's speed as its row says it: measured, else
  // floorOf's "≥", with what it was told from. null for none
  
  function promptOf(r) {
    let prompt = 0, read = 0;
    // Input excludes both cache tiers. Include writes in the denominator,
    // and every billable try, as the request's cost does. Older history
    // without the tiers cannot tell a hit rate, even when it has tokens.
    // A vendor that counts no cache tokens (cache_unknown: Kiro tells
    // credits only) has no hit rate, not 0%.
    for (const u of r.usage || []) {
      if (u.cache_unknown) continue;
      read += u.cache_read || 0;
      prompt += (u.in || 0) + (u.cache_read || 0) + (u.cache_write || 0);
    }
    return { prompt, read };
  }
  

// upstream client.js:561-634
  function firstNote(r, tr) {
    let s = tr.ttft ? " · " + t("first token in {ms}", { ms: took(tr.ttft) }) : "";
    if (tr.ttft && tr.firstText > tr.ttft) s += " · " + t("first text in {ms}", { ms: took(tr.firstText) });
    const v = speedOf(r, tr.ms, tr.ttft, tr.firstText, tr.flow, tr.firstReasoning || 0, tr.reasoningHidden || false);
    if (v) s += " · " + t("{n} tok/s", { n: Math.round(v) });
    const { prompt, read } = promptOf(r);
    if (prompt) s += " · " + t("request cache hit rate {p}", { p: pct(100 * read / prompt) });
    return s;
  }
  // a count short (fmtN: 12.3K, 1.2 万), exact on hover when they differ
  // (skyhuang1994 on Discord: "看这么长串的数字有点懵逼")
  const exactN = (n) => fmtN(n) == String(n) ? "" : ledNum(n);
  
  const tokens = (n) => n >= 1e6 ? (n / 1e6).toFixed(1) + "M" : n >= 1e3 ? (n / 1e3).toFixed(1) + "k" : String(Math.round(n));
  const pct = (n) => Math.round(n) + "%";
  // an account's window as Settings' allowance display has it, how much is
  // used or how much is left, the bar filling with the same (#602)
  const share = (w) => quotaLeft ? 100 - Math.max(0, Math.min(100, w.used)) : w.used;
  // the account's own count before it, when its vendor counts in amounts
  // (WorkBuddy's credits, #659): "355 / 500 credits · 71% used"
  // a prepaid wallet tells what it has left in its unit, no share (#3950):
  // "6,291 points left", whichever way the meters read
  const balText = (w) => (countFormat.format(w.balance) + " " + t(w.unit || "")).trim();
  // and what of it is lost first, as the Usage card says it from the
  // wallet's window (runsOutText): "6,291 points left · 185 points expire
  // 23:59", the day's batch otherwise unseen beside the total (#3964).
  // Live only, as winsOf: a kept day's figure was read long ago
  const lapses = (w) => w.runsOut > 0 && w.runsOutAt ? " · " + runsOutText(w) : "";
  const quota = (w, used, left, vars) => w.balance != null ? t(left, { n: balText(w), ...vars }) + lapses(w)
    : (w.limit > 0 ? quotaCount(w) + " · " : "") + t(quotaLeft ? left : used, { n: pct(share(w)), ...vars });
  const fill = (w) => Math.max(0, Math.min(100, share(w))) + "%";
  const FAIL = { rate: "rate limited", credit: "out of credit", quota: "quota used up", other: "failed", auth: "sign-in required", canceled: "canceled", foreign: "another account's reasoning", floor: "reply too short", verify: "needs verification", refused: "refused (safety filter)", shape: "request not understood", sight: "images not taken", proxy: "proxy not reachable", offline: "network down", overloaded: "servers overloaded", effort: "reasoning effort not in its plan", overflow: "too long for its model", room: "reply asked past the window left", slow: "slow to start", prompt: "agent's prompt turned away", restricted: "account restricted by the vendor" };
  // a refusal the vendor called a rate limit, resting as out of quota
  // until the time it named (Rest.Rate), says rate limited: WorkBuddy's
  // per-model "频率限制" read as the account's quota used up, its credits
  // left (taoxiaoxin on Discord)
  const failWord = (why, rest) => t(why === "quota" && rest?.rate ? FAIL.rate : FAIL[why] || "failed");
  // a resting row: a failure that names no kind says the status it
  // answered, and the vendor's own words are over it (restTip), as
  // "failed · back in 16s" alone said nothing of why (GanHei37443 on X)
  const restSay = (rest) => `${!FAIL[rest.why] || rest.why === "other" ? (rest.status ? rest.status + " · " : "") : ""}${failWord(rest.why, rest)} · ${restWhen(rest)}`;
  const restTip = (rest) => (typeof rest.error === "string" && rest.error) || "";
  // a try that answered: one whose reply broke off after it began (its 200
  // sent, then the vendor's error, #733) didn't, and has a fail
  const tryOk = (tr) => tr.status < 400 && !tr.fail;
  const API = { anthropic: "Anthropic", chat: "OpenAI", responses: "OpenAI Responses", gemini: "Gemini" };
  const MODES = {
    "": ["Smart", "Smart: of the accounts with quota to spare, the one whose allowance renews soonest goes first — what it has left would be lost at the reset. The week decides; an account with five hours and no week goes by its five hours. One at 90% or more waits until the others can't answer; one resting after a failure goes last."],
    order: ["In order", "In order: the first answers everything until it can't; then the next."],
    drain: ["Until used up", "Until used up: one answers everything until its quota is used up; then the next, which keeps them even after the one before renews."],
    rotate: ["In turn", "In turn: each conversation's next turn goes to the account after the one that answered its last, and a new conversation starts one further along; the requests within a turn stay put, keeping the prompt cache."],
    usage: ["Least used", "Least used first: the account with the most of its allowance left goes first; a key by the tokens magpie sent it lately."],
    pace: ["Use before expiry", "Use before expiry: the account with the most left per hour until it is lost goes first — at its reset, or, when credits in it expire sooner, by those that expire first; an account with five hours and no week by what its five hours have left per hour. One at 90% or more waits until the others can't answer; a key by the tokens magpie sent it lately."],
    manual: ["Manual", "Manual: every request goes to the model picked on the group's card, over its own accounts or keys."],
    // a provider's keys or a subscription's accounts by weight (#841,
    // rubbzha on X); both strings as the provider editor's routing options
    // say them (app.js ROUTINGS), so every language is already spoken
    weight: ["By weight", "Requests spread over the keys or accounts by the weight set beside each: one weighing 3 takes three requests for every one weighing 1 takes, evenly over a few requests. One that fails is passed over while it rests, and the others share its requests; a conversation stays with it as Stays says."],
    free: ["Free first", "Requests go to what costs nothing first: the models their vendor serves at no cost to this subscription's allowance or credits, in their listed order, and only when those can't answer to one that spends them. Nothing that cost nothing is left unused."],
    cheap: ["Cheapest first", "Requests go to the member whose model costs least now, by its price a million tokens in and out at this hour — a vendor's peak hours count double where it bills them so, as DeepSeek and Ollama Cloud do — and the cheaper cache read when two cost the same; those that cost the same keep their listed order, and one with no known price goes last."],
    expiring: ["Free quota by expiry", "Free quota by expiry: the accounts on a free plan, or whose model costs nothing there, go first, the one whose free quota is lost soonest first — at its next reset, or when its credits expire if sooner; once it is used up, the next. A paid one takes requests only when no free one has quota left, the paid as Smart orders them."],
    fast: ["Speed first", "Requests go to the one that has answered this model fastest lately, by its time to the first token and how fast it writes; those within a tenth of each other keep their listed order. One not measured lately gets one request in five, so it is measured again, and one that fails is passed over while it rests."],
  };
  // modeOf: a routing's name and what it does, a JS gateway plugin's
  // ("<plugin>/<name>", app.js jsRoutings) as it is named, served or not
  const modeOf = (r) => MODES[r] || [r, t("Routing details unavailable")];
  // withJS: routing options and the JS gateway plugins' after them, with
  // saved when none serves it now; one of opts' own (a group's Manual) is
  // not a plugin's

// upstream client.js:636-1560
  const GROUP_ORDER = "In order: member by member, the first model the group names until it can't answer, each over its own accounts or keys as its provider routes them.";
  // a group routed by weight (#1910): its members, not its keys
  const GROUP_WEIGHT = "By weight: each model takes its share of the requests by the weight set beside it — one weighing 3 three for every one a model weighing 1 takes, spread out rather than in bursts. One resting after a failure leaves the round and the others share its requests; the next model is the fallback when one fails.";
  const KEYS_SMART = "Smart: keys that suit the request go first — one made for the model's own API — then in their order. One resting after a failure goes last.";
  const LONE = "Only one account or key is on for this, so routing has nothing to choose between. Turn on a second in the provider's editor, and how it routes is set under Several accounts or keys below.";

  const agentOf = (id) => (state.clients || state.agents).find((a) => a.id === id);
  // uaName is a client as the gateway names one it doesn't know
  // (usage.AgentOf): its User-Agent's product name, before the first / or
  // space, in lower case as a rule keeps it. "SillyTavern/1.12" is
  // sillytavern; a comma would part it in two (ParseRule)
  
  const agentName = (id) => agentOf(id)?.name || (id && id !== "other" ? id : t("your agent"));
  // userShown is an account of provider as the user named it in magpie
  // (provider.AccountNames, #1515), else as its plugin's usage names it
  // (accountUsers, #4416), else as its vendor names it. The name
  // is looked up as the page is drawn, by the account a request kept (its
  // vendor's name, which the user's name is kept by), so every request
  // reads by the name the account has now, one from before a rename too
  // (plugins#310: a renamed Kiro account kept its old name on requests
  // made after). Requests are still told apart by that vendor's name.
  const userShown = (provider, user) => user; // already neutral, stable backend labels; no account configuration is read
  // whoShown is the account or key a weighed one is: an account by its
  // name of the user's own; a key's name is already the user's
  const whoShown = (w) => w.kind === "account" ? userShown(w.provider, w.who) : w.who;
  // who names an account or key in a sentence
  const who = (w) => w.kind === "provider" ? w.name : whoShown(w);
  // where names one as a place a request went: the provider, and the
  // account or key when it has one
  
  // why one is left out: an account's plan lacks the model; a key's list
  // from its vendor does — relays list each key its own group's models
  // or the user set the account or key to serve other models only (#474)
  // or it is held at the usage cap the user set on the account
  const unlistedWord = (w) => w.heldBy ? t("not an account {group} may use", { group: w.heldBy }) : w.held ? t("not an account the gateway key may use") : w.noCredits ? t("held: its allowance used up, set not to spend credits") : w.capped ? t("held at its {cap}% usage cap", { cap: w.capped }) : w.barred ? t("set to serve other models, not {model}", { model: w.model }) : w.kind === "key" ? t("{name}'s list for this key has no {model}", { name: w.name, model: w.model }) : t("its plan doesn't list {model}", { model: w.model });
  // noURLWord: its keys are all set to a protocol its provider has no URL
  // for, so it went out on the URLs it has (#1702)
  const noURLWord = (w) => t("key set to {api} only, no {api} URL · sent on the others", { api: API[w.noURL] || w.noURL });
  // group is the tier Smart and Use before expiry put one in: 90% of a
  // week alone (weekLow) is kept with those that have room, as what it
  // has left is lost at its reset (ysicing_01858 on Discord)
  const group = (w) => w.used >= 98 ? "spent" : w.used >= 90 && !w.weekLow ? "low" : "fine";
  // tiered: its routing holds one running low back (routes.seatTier)
  const tiered = (w) => !w.routing || w.routing === "pace";
  const renews = (w) => (w.renews || []).map((s) => known0(s) ? at(s) : 0);
  // usedRenews is when the window w.used is the share of renews: a row
  // says the two together, so they are of one window, a Factory account's
  // 32% of its week renewing with the week, not with its month (#1778).
  // Without it (a route from before the gateway said so) only an account
  // of one window says when.
  const usedRenews = (w) => known0(w.usedRenews) ? at(w.usedRenews) : (w.renews || []).length === 1 ? renews(w)[0] : 0;
  // renewsBy is renews as Smart ranks them: an auto-used Codex reset that
  // starts the windows again sooner (restarts) is when they renew (#718)
  const renewsBy = (w) => {
    const rs = known0(w.restarts) ? at(w.restarts) : 0;
    return renews(w).map((x) => rs && (!x || rs < x) ? rs : x);
  };

  // cmpRenews orders two accounts' windows as the gateway does: the
  // biggest first, to the hour, one not known after those known. It says
  // which window decided, too.
  function cmpRenews(a, b) {
    const ra = renewsBy(a), rb = renewsBy(b), H = 3600e3;
    for (let k = 0; k < ra.length || k < rb.length; k++) {
      const x = ra[k] ? Math.floor(ra[k] / H) : 0, y = rb[k] ? Math.floor(rb[k] / H) : 0;
      if (x === y) continue;
      if (!x || !y) return { c: x ? -1 : 1, k };
      return { c: x < y ? -1 : 1, k };
    }
    return { c: 0, k: -1 };
  }

  // restModel is the one model a rest is for, "" when it is the account's
  // or key's as a whole (#1960): an account out of a pool that counts some
  // models only (Antigravity's Claude & GPT) still answers its others
  // (gemini-3.8-flash, in a pool of its own). The gateway names it; a kept
  // request from before it did has it on the end of the key it rests by,
  // after the model of the seat that carried it.
  const restModel = (rest, m) => rest.model || (m && rest.key?.endsWith("/" + m) ? m : "");
  // how long a rest is from a moment: now for a row, the moment it was
  // decided for the story of a request
  function restWhen(rest, from = now()) {
    const left = at(rest.until) - from;
    return left < 3600e3 ? t("back in {d}", { d: dur(left) }) : t("back at {time} · in {d}", { time: clock(rest.until), d: dur(left) });
  }
  // restHow says how long a failed account sits out, and what said so.
  function restHow(rest, from) {
    const d = dur(at(rest.until) - from), time = clock(rest.until);
    switch (rest.by) {
      case "retry-after": return t("It rests {d}, as the vendor's Retry-After says", { d });
      case "credit": return t("It sits out half an hour, until someone tops it up");
      case "window": return t("Its allowance is used up: it rests until that renews, at {time}", { time });
      case "resets": return t("It rests until {time}, when the vendor says the limit resets", { time });
      case "quota": return t("It rests 15 minutes: out of quota, with no word of when it resets");
      // a Codex account that holds credits, refused again once asked
      // again onto them: not benched until its window renews
      case "credits": return t("It holds credits, so it rests only {d} and its usage is read again, not until its allowance renews", { d });
      case "verify": return t("The vendor wants the account verified first: it rests half an hour, or until you say it's verified");
      // its provider set never to rest after an unknown failure
      // (`magpie provider rest-cap <id> off`): asked again next time
      case "off": return t("It doesn't rest: its provider is set to ask it again after an error like this");
      // the vendor restricted the account itself (#1849): only its lifting,
      // which the vendor's appeal asks for, brings it back
      case "restricted": return t("The vendor restricted the account: it rests {d}, as only the vendor lifting the restriction brings it back. Appeal with the vendor; once it's lifted, try it again here", { d });
      case "backoff": return rest.why === "rate"
        ? t("It was rate limited again as soon as it was back ({n} times in a row): it rests {d}, longer each time until it answers", { n: rest.failures, d })
        : (rest.failures > 1
          ? t("It has failed {n} times in a row: it rests {d}, longer each time", { n: rest.failures, d })
          : t("It rests {d}, longer if it fails again", { d }))
          // asked in the background meanwhile, and back once it answers
          + (rest.probed ? " · " + t("checked in the background, back as soon as it answers") : "");
      case "cooldown": return rest.why === "rate"
        ? t("It cools down {d}: the vendor didn't say for how long", { d })
        : t("It rests {d}", { d });
      default: return t("It rests {d}", { d });
    }
  }

  // the model a request went on: the one asked for, or the one set for
  // an agent's subagents that magpie put a subagent on in its place
  const wentOn = (r) => (r.subagent && !r.subagent.kept ? r.subagent.to : r.model);

  // the routing of the group x's place is in: the innermost group in the
  // group (via), else the group asked for; "" when no group was
  const placeRouting = (r, x) => {
    const via = x.via || [];
    return via.length ? r.group?.subs?.find((s) => s.id === via[via.length - 1])?.routing || "" : r.group?.routing || "";
  };
  // a group routed in order or by weight tries each member whole, in its
  // place, over its own accounts or keys as its provider routes them
  // (planLevel): its members aren't weighed against each other
  const wholeMembers = (r, x) => !!r.group && ["order", "weight"].includes(placeRouting(r, x));
  // weighedWith is the rows x was weighed against, x among them: in a
  // group routed in order or by weight, its own member's; else every one
  // in its place (the group's own, or one group in it). A fallback is
  // weighed with its own provider's alone (plan). bitssly on X: an In
  // order group said its later members, whose allowance isn't known, went
  // after the first because the first's was
  function weighedWith(r, x) {
    const via = (y) => (y.via || []).join(">");
    const whole = wholeMembers(r, x);
    return r.order.filter((y) => !!y.fallback === !!x.fallback && via(y) === via(x)
      && (!(x.fallback || whole) || (y.provider === x.provider && y.model === x.model && (y.fixed || "") === (x.fixed || "") && !!y.fast === !!x.fast)));
  }

  // walletWhy: f, a prepaid wallet, goes before the next of its
  // provider's in its unit as it has more left (routes.byLeft, #3950)
  function walletWhy(r, f) {
    const o = r.order.find((x) => x !== f && !x.fallback && !x.rest && x.balance != null && x.provider === f.provider && x.unit === f.unit);
    return f.balance != null && o && f.balance > o.balance
      ? t("{who} goes first: of those alike, its wallet has the most left — {n}, where {other} has {m}.", { who: who(f), n: balText(f), other: who(o), m: balText(o) }) : null;
  }

  // why a request has no one weighed for it: magpie holds it before
  // routing (masking it, or still reading it), or nothing took it
  function noneWhy(r) {
    if (!r.done) return r.phase === "redact"
      ? t("magpie is masking this request before routing it (Settings › Privacy), so who takes it isn't picked yet.")
      : t("magpie hasn't routed this request yet, so who takes it isn't picked yet.");
    if (r.error) return t("Nothing took this request: {error}", { error: r.error });
    return t("Nothing could take {model}.", { model: r.model });
  }

  // why routing put the first where it did
  function firstWhy(r) {
    if (r.evidence?.reasons?.some(k => /^(candidate_|malformed_candidates|routing_mode_|quota_|rule_|group_)/.test(k))) return t("Some routing evidence is unavailable or withheld.");
    const f = r.order[0];
    if (!f) return noneWhy(r);
    const w = who(f);
    if (r.sealedTask && r.leadAccount === f.id) return t("{who} goes first: it answered the parent agent and may be needed to read this encrypted task.", { who: w });
    if (r.compaction && r.order.length === 1) return t("{who} compacted this conversation natively, and only it can read that compaction, so the conversation stays on it: other accounts aren't asked. Start a new conversation to use them.", { who: w });
    if (r.order.length === 1) return t("{who} goes first.", { who: w }); // observed seat, not configured inventory
    if (f.rest) return t("Every one is resting after a failure, so {who}, first in line, is tried all the same.", { who: w });
    if (f.creditsLast) return t("Every one here has used up its allowance and goes on on its credits, set to spend them only after everything else, so {who}, first in line, goes first.", { who: w });
    if (f.fallback) {
      const name = r.order.find((x) => !x.fallback)?.name || r.provider;
      return t("{name} is resting, so its fallback {fb} goes first.", { name, fb: `${f.provider}/${f.model}` });
    }
    if (wholeMembers(r, f)) {
      // first as the group's member: by its place, or the round's pick;
      // weighed only against its own member's others, if any
      const own = weighedWith(r, f);
      if (own.length > 1) return firstWhy({ ...r, order: own, group: null });
      if (placeRouting(r, f) === "weight") return t("By weight: it's {who}'s share — each model takes requests as the weight set beside it says.", { who: w });
      const ahead = r.order.filter((x) => x !== f && x.rest).map(who);
      return ahead.length
        ? t("In order: with {rested} resting after a failure, {who} is the first that can answer.", { rested: ahead.join(", "), who: w })
        : t("In order: {who} is first, and answers everything while it can.", { who: w });
    }
    const peers = r.order.filter((x) => x !== f && !x.fallback && !x.rest);
    const someKnown = r.order.some((x) => x.known);
    const rested = r.order.filter((x) => x !== f && !x.fallback && x.rest).map(who);
    const restedTo = (s) => rested.length ? t("With {rested} resting after a failure, {who} goes first: ", { rested: rested.join(", "), who: w }) + s : null;
    switch (f.routing) {
      case "order": return rested.length
        ? t("In order: with {rested} resting after a failure, {who} is the first that can answer.", { rested: rested.join(", "), who: w })
        : t("In order: {who} is first, and answers everything while it can.", { who: w });
      case "drain": return t("Until used up: {who} is the one in use, and answers everything until it is used up.", { who: w });
      case "rotate": return t("In turn: it's {who}'s turn — each request starts one further along.", { who: w });
      case "weight": return t(f.kind === "account" ? "By weight: it's {who}'s share — each account takes requests as its weight says." : "By weight: it's {who}'s share — each key takes requests as its weight says.", { who: w });
      case "free":
        if (f.free) return restedTo(t("it costs nothing there, so it's spent first."))
          || t("Free first: {model} costs nothing on {who}, so it's tried before any that spends the allowance.", { model: f.model, who: w });
        return t("Free first: every one that costs nothing is spent or resting, so {model} on {who}, which spends the allowance, is next.", { model: f.model, who: w });
      case "expiring": {
        // Free quota by expiry (routes.FreeExpiring): when a free one's
        // quota is first lost, as the gateway read it (Weighed.expires)
        const left = f.expires && at(f.expires) - at(r.time);
        if (f.free && left > 0) return restedTo(t("its free quota is lost soonest, in {d}.", { d: dur(left) }))
          || t("Free quota by expiry: {who}'s free quota is lost soonest, in {d}, so it's spent first.", { who: w, d: dur(left) });
        if (f.free) return restedTo(t("it has free quota left, so it's spent before any paid one."))
          || t("Free quota by expiry: {who} has free quota left, so it's spent before any paid one.", { who: w });
        return t("Free quota by expiry: no free one has quota left, so {who}, which is paid for, is next.", { who: w });
      }
      case "cheap": {
        // Cheapest first (routes.Cheapest): its price now, as the gateway
        // read it for this request (Weighed.price)
        const p = f.price;
        if (p) {
          const price = t("{in} in, {out} out a million tokens", { in: fmtCost({ cost: p.input }), out: fmtCost({ cost: p.output }) });
          if (p.peak) return restedTo(t("it costs least now, even at its peak price — {price}.", { price }))
            || t("Cheapest first: {model} costs least on {who} now, even at its peak price — {price}.", { model: f.model, who: w, price });
          return restedTo(t("it costs least now — {price}.", { price }))
            || t("Cheapest first: {model} costs least on {who} now — {price}.", { model: f.model, who: w, price });
        }
        return t("Cheapest first: no price is known for {model} on {who}, so it goes in its listed place after every one that has a price.", { model: f.model, who: w });
      }
      case "fast": {
        // Speed first (routes.Fastest): its time to the first token and
        // pace lately, as the gateway measured them (Weighed.lateTtft)
        if (f.lateTtft) {
          const secs = (f.lateTtft / 1000).toFixed(1);
          const pace = f.lateTps ? t("first token in {s}s, {n} tokens a second", { s: secs, n: Math.round(f.lateTps) })
            : t("first token in {s}s", { s: secs });
          return restedTo(t("it answered fastest lately — {pace}.", { pace }))
            || t("Speed first: {who} answered {model} fastest lately — {pace}.", { who: w, model: f.model, pace });
        }
        if (r.order.some((x) => x !== f && !x.fallback && !x.rest && x.lateTtft))
          return t("Speed first: {who} hasn't answered {model} lately, so it takes this request to be measured — one request in five goes to one not measured.", { who: w, model: f.model });
        return t("Speed first: none has answered {model} lately, so {who}, first in the list, goes first and its answer measures it.", { who: w, model: f.model });
      }
      case "usage":
        if (f.balance != null) return walletWhy(r, f) || t("{who} goes first.", { who: w });
        if (f.known) return t("Least used first: {who} has the most of its allowance left — {n} used.", { who: w, n: pct(f.used) });
        if (f.kind === "key" && !someKnown) return t("Least used first: {who} served the fewest tokens lately — {n}.", { who: w, n: tokens(f.tokens || 0) });
        return t("Least used first: {who} goes first.", { who: w });
      case "pace":
        if (f.balance != null) return walletWhy(r, f) || t("{who} goes first.", { who: w });
        if (f.known) {
          // The allowance window used for pace, which may be shorter than a week.
          const left = known0(f.due) ? Math.min(100, Math.round((f.pace || 0) * Math.max(1, (at(f.due) - at(r.time)) / 36e5))) : null;
          if (left !== null && f.dueBy === "expiry") return t("Use before expiry: {who} has the most credits expiring per hour until they expire — {n} of its allowance expires in {d}.", { who: w, n: pct(left), d: dur(at(f.due) - at(r.time)) });
          if (left !== null && f.dueBy === "reset") return t("Use before expiry: {who} has the most remaining allowance per hour until one of its Codex resets about to run out is used by itself — {n} left, used in {d}.", { who: w, n: pct(left), d: dur(at(f.due) - at(r.time)) });
          return left !== null
            ? t("Use before expiry: {who} has the most remaining allowance per hour until reset — {n} left, resets in {d}.", { who: w, n: pct(left), d: dur(at(f.due) - at(r.time)) })
            : t("Use before expiry: {who} has the most remaining allowance per hour until reset — {n} used.", { who: w, n: pct(f.used) });
        }
        if (f.kind === "key" && !someKnown) return t("Use before expiry: {who} served the fewest tokens lately — {n}.", { who: w, n: tokens(f.tokens || 0) });
        return t("Use before expiry: {who} goes first.", { who: w });
    }
    // keys that read their own windows (a sub2api key's limits) are
    // weighed by them, as accounts are, and one not read yet beside them
    // too: told below as one
    if (f.kind === "key" && !someKnown) {
      if (!f.fit && peers.some((p) => p.fit > 0)) return t("{who} goes first: it's made for {api}, the API {model} is at home in, so nothing is translated.", { who: w, api: API[f.speaks] || f.speaks, model: f.model });
      return restedTo(t("the others go in their order.")) || t("{who} goes first: keys go in their order, those that suit the request first.", { who: w });
    }
    if (f.kind !== "account" && !f.known) return t("{who} goes first.", { who: w });
    if (f.learns && peers.some((p) => p.known)) return t("{who} goes first: what it has left isn't known yet, and its answer tells — kept behind those known, it would never answer and never be known.", { who: w });
    if (!f.known && !peers.some((p) => p.known)) return t("The vendor hasn't said yet what these accounts have left, so they go in their order: {who} first.", { who: w });
    if (group(f) === "spent" && f.credits) return t("Every account is all but used up, so {who} goes first: it goes on on its credits, which the vendor spends once its allowance is used up.", { who: w });
    if (group(f) !== "fine") return r.order.some((x) => x.kind !== "account" && x.known)
      ? t("Every key and account here is at 90% or more of its allowance, so the one with the most left goes first: {who}, at {n}.", { who: w, n: pct(f.used) })
      : t("Every account is at 90% or more of its allowance, so the one with the most left goes first: {who}, at {n}.", { who: w, n: pct(f.used) });
    const next = peers.find((p) => p.known && group(p) === "fine");
    const soon = renewsBy(f).find(Boolean);
    if (!next) return t("{who} goes first: it has quota to spare, and the others are kept for last.", { who: w });
    const { c, k } = cmpRenews(f, next);
    if (c < 0 && k === 0 && known0(f.restarts)) return t("{who} goes first: of those with quota to spare, its allowance starts again soonest — one of its Codex resets about to run out is used by itself in {d}, and what it has left then is lost. {other} renews later and keeps its own.", { who: w, d: dur(at(f.restarts) - at(r.time)), other: who(next) });
    if (c < 0 && k === 0) return t("{who} goes first: of those with quota to spare, its allowance renews soonest — in {d} — and what it has left then is lost. {other} renews later and keeps its own.", { who: w, d: dur(renews(f)[0] - at(r.time)), other: who(next) });
    if (c < 0) return t("{who} goes first: its allowance renews in the same hour as {other}'s, and its shorter one sooner — in {d}.", { who: w, other: who(next), d: dur(renewsBy(f)[k] - at(r.time)) });
    if (c === 0 && walletWhy(r, f)) return walletWhy(r, f);
    if (soon) return t("{who} and {other} renew within the same hour, so the order given stays — and the vendor's prompt cache stays warm.", { who: w, other: who(next) });
    return t("{who} goes first, in the order given: when its allowance renews isn't known.", { who: w });
  }

  // behindWhy is why an account Smart weighed, with quota to spare, isn't
  // the one tried first for the request it was weighed for, when its row
  // would otherwise say only what it has left and read as passed over
  // (demonyins on X: a Design Plan at 75% left, behind a Claude Max whose
  // week renewed sooner, read as paused): "kept" when the conversation
  // stays on the one that answered it, "sooner" when the first's allowance
  // renews sooner (cmpRenews, as the gateway ranks them). null when it is
  // first, or behind for what the row or another reason says already.
  function behindWhy(r, w) {
    const f = r.order[0], x = r.order.find((y) => y.id === w.id);
    if (!f || !x || x === f || f.rest || f.fallback || x.fallback || x.routing || !x.known || group(x) !== "fine") return null;
    if (!weighedWith(r, x).includes(f) || memberSplit(r, f, x)) return null;
    if (["session", "turn", "cache"].includes(r.affinity?.why)) return "kept";
    if (r.sealedTask || ruleWhy(r, true) || f.learns || !f.known || group(f) !== "fine") return null;
    return cmpRenews(f, x).c < 0 ? "sooner" : null;
  }

  // memberSplit: the group that put x behind f, when it is one that takes
  // its members whole (by weight, in order) and f and x are of different
  // members of it — with the names of those members and the group; null
  // when they are of one member, or of a group that pools its members'
  // accounts (Smart and the rest), where what x has left is why
  function memberSplit(r, f, x) {
    if (!r.group) return null;
    const fv = f.via || [], xv = x.via || [];
    const subOf = (id) => r.group.subs?.find((s) => s.id === id);
    const at = (w, v, i) => i < v.length ? "group/" + v[i] : `${w.provider}/${w.model}${w.fixed ? ":" + w.fixed : ""}`;
    const named = (w, v, i) => i < v.length ? subOf(v[i])?.name || v[i] : w.name || w.provider;
    let g = r.group;
    for (let i = 0; i <= Math.max(fv.length, xv.length); i++) {
      const a = at(f, fv, i), b = at(x, xv, i);
      if (a !== b) {
        const routing = g?.routing || "";
        if (routing !== "weight" && routing !== "order") return null;
        // the first there by the round's pick, or by the order, not kept
        // on for its conversation or sent there by a rule
        if (routing === "weight" ? !f.turn : r.affinity?.kept || r.rule && !r.rule.bare) return null;
        return { routing, member: named(x, xv, i), first: named(f, fv, i), group: g.name || g.id };
      }
      if (i >= fv.length || i >= xv.length) return null; // one member
      g = subOf(fv[i]);
    }
    return null;
  }

  // leftWhy is why a member was skipped before it was tried (r.left)
  const leftWhy = (x) => x.heldBy
    ? t("{who} is left out: the routing group {group} is held to other accounts of its provider.", { who: who(x), group: x.heldBy })
    : x.held
    ? t("{who} is left out: the gateway key asking may not use its account.", { who: who(x) })
    : x.window
    ? t("{who} is left out: this request is longer than its {n} context window, so it would only refuse it. It's asked only once every one with room is out of its allowance.", { who: who(x), n: ctxShort(x.window) })
    : x.noCredits
    ? t("{who} is left out: a usage window is used up, and the account is set not to spend its credits, so it counts as used up until that window renews.", { who: who(x) })
    : x.capped
    ? t("{who} is left out: a usage window is at {n}, past the {cap}% cap set on the account, so it counts as used up until that window renews.", { who: who(x), n: pct(x.used), cap: x.capped })
    : x.barred
    ? t("{who} is left out: it is set to serve other models, not {model}.", { who: who(x), model: x.model })
    : x.kind === "key"
    ? t("{who} is left out: {name} lists {model} to its other keys, not this one.", { who: who(x), name: x.name, model: x.model })
    : t("{who} is left out: its plan doesn't list {model}.", { who: who(x), model: x.model });

  // asides: the others' places, where they say something
  function asides(r) {
    const out = [];
    const told = new Set(); // the members told as behind by weight or order
    const aff = affWhy(r, true) ? null : affWhy(r, false);
    if (aff) out.push(aff);
    const cls = classWhy(r.rule);
    if (cls) out.push(cls);
    for (const n of r.nested || []) {
      const c = classWhy(n.rule);
      if (c) out.push(t("In {group}: {text}", { group: n.name || n.group, text: c }));
    }
    const rule = ruleWhy(r, false);
    if (rule) out.push(rule);
    // a member a pause rule holds for now is out of the group: not tried,
    // not a fallback
    for (const p of r.group?.paused || []) {
      const when = (p.when || []).map(condText).join(", ");
      out.push(p.group
        ? t("{model} is paused by rule {n} of {group} ({when}), so it is left out until that ends.", { model: p.member, n: p.rule, group: r.group?.subs?.find((s) => s.id === p.group)?.name || p.group, when })
        : t("{model} is paused by rule {n} ({when}), so it is left out until that ends.", { model: p.member, n: p.rule, when }));
      // a pause by folder (#1606) says the folder it read, or that none was said
      if (p.byFolder) out[out.length - 1] += " " + (p.folder ? t("The agent works in {folder}.", { folder: p.folder }) : t("The agent didn't say which folder it works in."));
    }
    const smart = (x) => !x.routing && (x.kind === "account" || x.known);
    // weighed with one known: its place among them is what Smart says
    const someKnown = (x) => weighedWith(r, x).some((y) => y !== x && y.known);
    const f0 = r.order[0];
    for (const x of r.order.slice(1)) {
      // behind the first by a group's weights or its order, which take
      // each member whole: not by what x has left (Creat.wu: a group in
      // a group by weight, its accounts at 91%, read as passed over)
      if (x.creditsLast && f0 && !f0.creditsLast) {
        // behind everything not on its credits, as the user set it
        out.push(t("{who} has used up its allowance and goes on on its credits, which it is set to spend only after everything else: it is tried after every other account, key and fallback.", { who: who(x) }));
        continue;
      }
      const by = !x.rest && !x.sunk && f0 ? memberSplit(r, f0, x) : null;
      if (by && smart(x) && (x.known ? group(x) === "low" : someKnown(x))) {
        if (!told.has(by.member)) {
          told.add(by.member);
          out.push(by.routing === "weight"
            ? t("{member} isn't passed over for being near its limit: by weight this request was {first}'s share, and {member} takes its own share of the requests while it can answer.", { member: by.member, first: by.first })
            : t("{member} isn't passed over for being near its limit: it comes after {first} in {group}'s order.", { member: by.member, first: by.first, group: by.group }));
        }
        continue;
      }
      if (x.sunk && !x.rest) out.push(t("{who} was rate limited at {time} while it had quota left, so it went to the back: it comes round again once those ahead of it are rate limited in turn.", { who: who(x), time: clock(x.sunk) }));
      else if (x.rest) out.push(t("{who} is resting — {why}, {when} — so it waits at the back.", { who: who(x), why: `${x.rest.status} · ${failWord(x.rest.why, x.rest)}`, when: restWhen(x.rest, at(r.time)) }));
      else if (smart(x) && x.known && group(x) === "spent" && x.credits) out.push(t("{who} is at {n} of its allowance but goes on on its credits — ahead of those used up with nothing to go on with, after those with allowance left.", { who: who(x), n: pct(x.used) }));
      else if (smart(x) && x.known && group(x) === "spent" && weighedWith(r, x).length > 1) out.push(t("{who} is at {n} — all but used up, it answers only when nothing else can.", { who: who(x), n: pct(x.used) }));
      else if (smart(x) && x.known && group(x) === "low" && weighedWith(r, x).length > 1) out.push(t("{who} is at {n} — kept for when the others can't.", { who: who(x), n: pct(x.used) }));
      else if (smart(x) && x.learns && someKnown(x)) out.push(t("{who}: what it has left isn't known yet, and its answer tells, so it goes before those known.", { who: who(x) }));
      else if (smart(x) && !x.known && someKnown(x)) out.push(t("{who}: what it has left isn't known yet, so it goes after those known.", { who: who(x) }));
    }
    const pooled = r.order.find((x) => !x.aside && x.kind === "key");
    // held back, the provider's accounts at once taken by those before it
    // in the list (01huadalang on Discord, ZCode)
    for (const x of r.order.filter((x) => x.reserve)) out.push(t("{who} is in reserve: {n} of its provider's accounts or keys take requests at once, the first in the list, so it's tried only once they have all failed.", { who: who(x), n: x.reserve }));
    for (const x of r.order.filter((x) => x.aside && !x.reserve)) out.push(t("{who} is made for {api}, not {other} as the keys routed over are, so it isn't one of them: it's tried after them.", { who: who(x), api: API[x.speaks] || x.speaks || t("any API"), other: API[pooled?.speaks] || pooled?.speaks || t("any API") }));
    for (const x of r.left || []) out.push(leftWhy(x));
    return out;
  }

  // affWhy tells whether a request stayed with who answered its
  // conversation last, and why — as the gateway decided it. With lead, only
  // when that is what put the first where it is.
  function affWhy(r, lead) {
    const a = r.affinity;
    if (!a) return null;
    const lw = r.order.find((x) => x.id === a.last), last = lw ? who(lw) : a.last;
    const routing = r.group ? r.group.routing : r.order[0]?.routing;
    const ago = known0(a.at) ? dur(at(r.time) - at(a.at)) : "";
    switch (a.why) {
      case "session": return t("Kept on {who}: it answered this conversation before, and affinity keeps a session with one account.", { who: last });
      case "turn": return t("Kept on {who}: {agent} is handing back tool results within turn {n}, and moving now would lose what the vendor cached of it.", { who: last, agent: agentName(r.agent), n: a.turn });
      case "cache": return t("Kept on {who}: {d} ago the vendor read {r} tokens of this conversation from its cache and wrote {w} to it; anyone else would be sent them afresh and paid in full.", { who: last, r: tokens(a.cacheRead || 0), w: tokens(a.cacheWrite || 0), d: ago });
      case "strict": return a.main ? t("{who}, a fallback, answered this conversation last. The provider's own {first} is ready again, but Stays is Strict, which never moves a conversation, so it stays on the fallback; new conversations go to {first}.", { who: last, first: who(a.main) }) : null;
      case "new-turn": return routing === "rotate"
        ? t("Turn {n} begins: in turn, it goes to the one after {who}, which answered the last turn — {next}.", { n: a.turn, who: last, next: who(r.order[0]) })
        : lead ? null : t("Turn {n} begins: affinity keeps a conversation only within a turn, so routing decides afresh.", { n: a.turn });
    }
    if (lead) return null;
    switch (a.why) {
      case "resting": return t("{who} answered this conversation last, but it is resting, so the conversation moves.", { who: last });
      case "spent": return t("{who} answered this conversation last, but its allowance is all but used up, so the conversation moves.", { who: last });
      case "reserve": return t("{who} answered this conversation last, but it is in reserve while those before it in the list can take requests, so the conversation moves back to them.", { who: last });
      case "credits": return t("{who} answered this conversation last, but it is on its credits now, set to spend them only after everything else, so the conversation moves to {first}.", { who: last, first: who(r.order[0]) });
      case "gone": return t("{who} answered this conversation last, but it is no longer one to route to.", { who: last });
      case "order": return t("{who} answered this conversation last, but the group goes in order and {first}, ahead of it, is ready again, so turn {n} goes back to {first}.", { who: last, first: who(r.order[0]), n: a.turn });
      case "main": return t("{who}, a fallback, answered this conversation last, but the provider's own {first} is ready again, so turn {n} goes back to it.", { who: last, first: who(r.order[0]), n: a.turn });
      case "back": return t("{who} took this conversation while {first}, listed ahead of it in the group, couldn't; {first} is ready again, so turn {n} goes back to it.", { who: last, first: who(r.order[0]), n: a.turn });
      case "no-cache": return t("{who} answered this conversation last, but the vendor then read only {r} tokens of it from its cache and wrote {w} — not worth staying for.", { who: last, r: tokens(a.cacheRead || 0), w: tokens(a.cacheWrite || 0) });
      case "cold": return t("{who} answered this conversation {d} ago, longer than the 5 minutes a vendor keeps a prompt cached — so routing decides afresh.", { who: last, d: ago });
      case "off": return t("Affinity is off: each request is routed afresh, whoever answered its conversation before.");
      case "rule": {
        // the group's rule, or that of a group in it, that moved it
        const x = r.nested?.findLast((n) => n.rule?.use && !n.rule.unready && !n.rule.held)?.rule || r.rule;
        return t("{who} answered this conversation last, but a new turn begins and the group's rule {n} puts {use} first.", { who: last, n: x?.n, use: useName(r, x?.instead && !x.unready ? x.instead : x?.use) });
      }
    }
    return null;
  }

  // ruleWhy tells what the group's rules did with a request. With lead,
  // only when a rule put the first where it is.
  function ruleWhy(r, lead) {
    if (!r.rule || r.rule.bare) return null;
    const x = { ...r.rule, use: useName(r, r.rule.use) };
    const when = (x.when || []).map(condText).join(", ");
    // the folder the agent said it works in, when a rule asks for one
    const dir = x.folder ? " " + t("The agent works in {folder}.", { folder: x.folder }) : "";
    if (x.use && !x.unready) {
      // the rule's first had none to take it, and its next went first
      const first = x.use;
      if (x.instead) x.use = useName(r, x.instead);
      const held = t("Rule {n} ({when}) sent turn {turn} to {use} as it began; the turn stays with whoever took it then.", { n: x.n, when, turn: x.turn, use: x.use });
      if (x.compact) return lead ? t("The agent is compacting the conversation, so rule {n} sends the summary to {use}; the conversation stays on the model it was on.", { n: x.n, use: x.use }) + (x.small?.length ? " " + t("Passed over, as the conversation is longer than they take: {models}.", { models: x.small.map((id) => useName(r, id)).join(", ") }) : "") : null;
      if (x.held) return lead || affWhy(r, true) ? held : null;
      if (x.grown) return lead ? t("Within turn {turn} the conversation grew to about {tokens} tokens, more than the model it was on takes, so rule {n} ({when}) moves it to {use}.", { turn: x.turn, tokens: tokens(x.tokens), n: x.n, when, use: x.use }) : null;
      if (!lead) return null;
      if (x.instead) return t("Rule {n} matches, but {use} has no account or key that can take this request, so {instead}, which the rule names after it, goes first.", { n: x.n, use: first, instead: x.use }) + dir;
      if (x.more?.length) return t("Turn {turn} begins and rule {n} matches — {when} — so {use} goes first, then {more}, which the rule names after it; the later rules' and the group's others stay behind them.", { turn: x.turn, n: x.n, when, use: x.use, more: x.more.map((id) => useName(r, id)).join(", ") }) + dir;
      if (x.then?.length) return t("Turn {turn} begins and rule {n} matches — {when} — so {use} goes first; if it fails, {then}, which the rules after it that match too name, then the group's others.", { turn: x.turn, n: x.n, when, use: x.use, then: x.then.map((id) => useName(r, id)).join(", ") }) + dir;
      return t("Turn {turn} begins and rule {n} matches — {when} — so {use} goes first; the group's others stay behind it if it fails.", { turn: x.turn, n: x.n, when, use: x.use }) + dir;
    }
    if (x.use && x.instead) return lead ? t("Rule {n} matches, but {use} has no account or key that can take this request, so a later matching rule puts {instead} first.", { n: x.n, use: x.use, instead: useName(r, x.instead) }) : null;
    if (lead) return null;
    if (x.use) return t("Rule {n} matches, but {use} has no account or key that can take this request, so the group's order stands.", { n: x.n, use: x.use });
    if (x.waits) return t("This turn began before magpie saw it, so the rules wait for the next one.");
    if (x.held) return null;
    return t("No rule matches turn {turn} (about {n} tokens{img}).", { turn: x.turn, n: tokens(x.tokens), img: x.images ? t(", with an image") : "" }) + dir;
  }
  // treeText is a group's models, those of a group in it in brackets after
  // its name: a/m, Fast [b/m, c/m]
  function treeText(g) {
    const name = (id) => g.subs?.find((s) => s.id === id)?.name || id;
    let out = "";
    const open = [];
    (g.members || []).forEach((m, i) => {
      const via = (g.via?.[i] || "").split(">").filter(Boolean);
      let k = 0;
      while (k < open.length && k < via.length && open[k] === via[k]) k++;
      while (open.length > k) { out += "]"; open.pop(); }
      if (out && !out.endsWith("[")) out += ", ";
      while (open.length < via.length) { const v = via[open.length]; out += name(v) + " ["; open.push(v); }
      out += m;
    });
    return out + "]".repeat(open.length);
  }
  // rUses is the models a rule sends to, in order: its use, then its
  // more; setUses writes them back, each once, the first as its use (a
  // rule of one model has no more, as one saved before it)
  
  
  // useName is what a rule sends to: a model, or a group in the group
  // a group magpie found goes by the id agents pick it by (auto/<model>), not its internal group/auto-…
  const useName = (r, id) => {
    if (!id?.startsWith("group/")) return id;
    const s = r.group?.subs?.find((s) => "group/" + s.id === id);
    return t("the group {name}", { name: s?.name || (s?.ref && !s.ref.startsWith("group/") ? s.ref : id.slice(6)) });
  };
  // nestedWhy tells, for each group in the group down to the one that
  // went first, what its own rules did — and which group it came through
  function nestedWhy(r) {
    const out = [];
    for (const n of r.nested || []) {
      const x = n.rule, g = n.name || n.group;
      if (!x) continue;
      const when = (x.when || []).map(condText).join(", ");
      if (x.use && x.instead && !x.unready && !x.held) out.push(t("In {group}, rule {n} matches, but {use} has no account or key that can take this request, so {instead}, which the rule names after it, goes first there.", { group: g, n: x.n, use: x.use, instead: x.instead }));
      else if (x.use && x.instead && x.unready) out.push(t("In {group}, rule {n} matches, but {use} has no account or key that can take this request, so a later matching rule puts {instead} first.", { group: g, n: x.n, use: x.use, instead: x.instead }));
      else if (x.use && x.unready) out.push(t("In {group}, rule {n} matches, but {use} has no account or key that can take this request, so {group}'s order stands.", { group: g, n: x.n, use: x.use }));
      else if (x.use && x.held) out.push(t("In {group}, rule {n} ({when}) sent turn {turn} to {use} as it began; the turn stays with whoever took it then.", { group: g, n: x.n, when, turn: x.turn, use: x.instead || x.use }));
      else if (x.use) out.push(t("In {group}, rule {n} matches — {when} — so {use} goes first there.", { group: g, n: x.n, when, use: x.use }));
      else if (!x.waits) out.push(t("In {group}, no rule matches.", { group: g }));
    }
    const f = r.order[0];
    if (f?.via?.length && r.group) {
      const names = f.via.map((id) => r.group.subs?.find((s) => s.id === id)?.name || id);
      const inner = r.group.subs?.find((s) => s.id === f.via[f.via.length - 1]);
      out.push(t("{who} is one of {path}, a group in {name}; that group routes {mode}.", { who: who(f), path: names.join(" › "), name: r.group.name, mode: t(modeOf(inner?.routing || "")[0]).toLowerCase() }));
    }
    return out;
  }
  // classWhy tells what a group's classifier said of the turn's message,
  // for its rule step x
  function classWhy(x) {
    const c = x?.classified;
    if (!c) return x?.pick ? t("Turn {turn} reasons at {level}, as the classifier picked when it began.", { turn: x.turn, level: x.pick }) : null;
    const r = { rule: x };
    const by = c.by || t("the classifier"), kinds = (c.intents || []).map((x) => `“${x}”`).join(", ");
    // a group above picked the turn's reasoning, so this one's classifier
    // wasn't asked for it (#4358): the turn reasons at that pick
    const above = c.above ? t("{by} wasn't asked how hard turn {turn} is: the group above picked {level} reasoning for it.", { by, turn: r.rule.turn, level: c.above }) : "";
    if (above && !c.intents?.length) return above;
    // it couldn't say, and the turn keeps the intent the turn before had
    // (#1826), rather than going with none
    if (c.error && c.fallback === "previous" && c.intent) return t("{by} was to tell which of {kinds} turn {turn} is, but couldn't — {err} — so the turn keeps “{intent}”, as turn {prev} was.", { by, kinds, turn: r.rule.turn, err: c.error, intent: c.intent, prev: r.rule.turn - 1 });
    if (c.error) return c.intents?.length
      ? t("{by} was to tell which of {kinds} turn {turn} is, but couldn't — {err} — so no rule with an intent matches it.", { by, kinds, turn: r.rule.turn, err: c.error }) + (above ? " " + above : "")
      : t("{by} was to rate how hard turn {turn} is, but couldn't — {err} — so it reasons as the agent asked.", { by, turn: r.rule.turn, err: c.error });
    const when = c.cached ? t("said before, for the same message") : t("in {ms}", { ms: took(c.ms) });
    const told = c.after ? " " + t("It was told turn {prev} was “{after}”, which a message that only carries on from it is too.", { prev: r.rule.turn - 1, after: c.after }) : "";
    const toldEffort = c.afterEffort ? " " + t("It was told turn {prev} reasoned at {level}, which a message that only carries on from it needs too.", { prev: r.rule.turn - 1, level: c.afterEffort }) : "";
    const effort = c.effort ? t("{by} rated turn {turn} {score} of 3, so it picks {level} reasoning for the turn — each model gets the level it has nearest.", { by, turn: r.rule.turn, score: (c.score || 0).toFixed(1), level: c.effort }) + toldEffort : "";
    if (!c.intents?.length) return effort ? `${effort} (${when})` : null;
    const sure = c.sure ? t(", {n} sure", { n: Math.round(c.sure * 100) + "%" }) : "";
    // c.said is the answer as it was said (#4598): a chat model's 0 is
    // none, but a decision model can name a choice no intent came of (a
    // kind under the sure-enough bar, its own "none of these")
    const answered = !c.intent && c.said && c.said !== "0" ? c.said : "";
    const said = (!c.intent
      ? answered
        ? t("{by} was asked which of {kinds} turn {turn} is, and answered “{said}”, which is no rule's intent ({took}).", { by, kinds, turn: r.rule.turn, said: answered, took: when + sure })
        : t("{by} was asked which of {kinds} turn {turn} is, and said none ({took}).", { by, kinds, turn: r.rule.turn, took: when + sure })
      : t("{by} was asked which of {kinds} turn {turn} is, and said “{intent}” ({took}).", { by, kinds, turn: r.rule.turn, intent: c.intent, took: when + sure })) + told;
    return effort ? `${said} ${effort}` : above ? `${said} ${above}` : said;
  }
  // intentOf is the intent a rule's condition asks for, as the gateway
  // writes it (intent "…"); undefined for another condition
  const intentOf = (c) => /^intent "(.*)"$/.exec(c)?.[1].replace(/\\"/g, '"').replace(/\\\\/g, "\\");
  // smartFor is the intent the decision model said the turn is, when a
  // rule by that intent put the request's first where it is, in the group
  // or a group in it: the row routing chose says it where an account's
  // allowance goes (joey_xue on Discord)
  function smartFor(r) {
    for (const x of [r.rule, ...(r.nested || []).map((n) => n.rule)]) {
      if (!x?.use || x.unready) continue;
      for (const c of x.when || []) { const m = intentOf(c); if (m) return m; }
    }
    return "";
  }
  // a rule's condition as the gateway writes it, in the page's words
  function condText(c) {
    let m;
    if ((m = intentOf(c)) != null) return t("asks for “{intent}”", { intent: m });
    if ((m = /^tokens ≥ (\d+)$/.exec(c))) return t("≥ {n} tokens", { n: Number(m[1]).toLocaleString(intlLang()) });
    if (c === "images") return t("has an image");
    if (c === "reasoning") return t("reasoning on");
    if (c === "compacting") return t("compacting");
    if ((m = /^effort ≥ (\w+)$/.exec(c))) return t("reasoning ≥ {level}", { level: m[1] });
    if ((m = /^agent (.+)$/.exec(c))) return m[1].split("|").map(agentName).join(" / ");
    if ((m = /^not folder (.+)$/.exec(c))) return t("not in {folders}", { folders: m[1].split("|").join(" / ") });
    if ((m = /^folder (.+)$/.exec(c))) return t("in {folders}", { folders: m[1].split("|").join(" / ") });
    if ((m = /^time (all day|(\d\d:\d\d)–(\d\d:\d\d))(?: ([^ (]+))?(?: \(([^)]+)\))?$/.exec(c))) {
      // the days as the gateway writes them: Mon–Fri, Sat,Sun, Mon,Wed–Fri;
      // the zone the hours are in after them, in brackets, when they have one
      const days = [];
      for (const part of (m[4] || "").split(",").filter(Boolean)) {
        const [a, b] = part.split("–").map((d) => WEEK.indexOf(d.toLowerCase()));
        for (let i = a; i >= 0 && i <= (b >= 0 ? b : a); i++) days.push(WEEK[i]);
      }
      return timeText({ from: m[2] || "00:00", to: m[3] || "00:00", days, zone: m[5] || "" });
    }
    return c;
  }
  // a rule's hours (provider.TimeWindow): local time, past midnight when
  // they end before they begin, on the days named or every day
  const WEEK = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];
  const DAY_NAMES = { mon: "Mon", tue: "Tue", wed: "Wed", thu: "Thu", fri: "Fri", sat: "Sat", sun: "Sun" };
  function daysText(days) {
    const on = WEEK.map((d) => (days || []).includes(d)), out = [];
    for (let i = 0; i < 7; i++) {
      if (!on[i]) continue;
      let j = i;
      while (j + 1 < 7 && on[j + 1]) j++;
      if (j - i >= 2) out.push(t("{from}–{to}", { from: t(DAY_NAMES[WEEK[i]]), to: t(DAY_NAMES[WEEK[j]]) }));
      else for (let k = i; k <= j; k++) out.push(t(DAY_NAMES[WEEK[k]]));
      i = j;
    }
    return out.length === 7 || !out.length ? "" : out.join(t(", "));
  }
  function timeText(w) {
    const hours = w.from === w.to ? t("all day") : t("{from}–{to}", { from: w.from, to: w.to });
    const days = daysText(w.days);
    const text = days ? t("{hours} {days}", { hours, days }) : hours;
    const zone = zoneNote(w);
    return zone ? t("{hours} ({zone})", { hours: text, zone }) : text;
  }
  // A rule's hours are in the zone they were set in (provider.TimeWindow
  // Zone): the browser's, saved with them. magpie on a server in another
  // zone (gaubeebangeel on X: a cloud box in UTC, its user in Beijing)
  // reads them there, and the zone is told beside them; hours set before
  // zones were kept are on the server's clock, told with its offset. When
  // the clocks agree nothing is added.
  
  // zoneOffset is how far zone is ahead of UTC now, in minutes; null when
  // this browser doesn't know it
  
  
  function zoneNote(w) {
    // The group configuration clock is not collected. A recorded zone can
    // still be named, but never infer the server clock from this browser.
    return w.zone ? t("{zone} time", { zone: w.zone }) : t("server time");
  }
  // "9:5" is no time; "9:05" is 09:05
  

  // how the reasoning a try was sent at came to be
  

  // a try in words, and how its reasoning came to differ from the agent's
  function tryWhy(r, i) {
    const tr = r.tries[i], said = trySaid(r, i);
    // a prompt turned away is turned away at every level: the level is no part of it
    if (!tr.effort || !r.effort || r.effort === tr.effort || tr.fail === "prompt") return said;
    const agent = agentName(r.agent);
    return said + (/[。！？]$/.test(said) ? "" : " ") + (tr.fixed
      ? t("The group fixes this model at {fixed} reasoning, in place of the {asked} {agent} asked for.", { fixed: tr.fixed, asked: r.effort, agent })
      : tr.ruleEffort
      ? t("The rule asks this model for {level} reasoning, in place of the {asked} {agent} asked for.", { level: tr.effort, asked: r.effort, agent })
      : tr.picked
      ? t("The turn's pick replaced the {asked} {agent} asked for.", { asked: r.effort, agent })
      : t("{level} is the model's nearest to the {asked} {agent} asked for.", { level: tr.effort, asked: r.effort, agent }));
  }

  // where a try's time went (gateway.TryNet, Discord Magic_zero: the
  // gateway looked slow): magpie's own, the network's on the way out, and
  // the vendor's, from the try's start to its end, the parts that took
  // none left out. Only a try whose request magpie sent itself has it: one
  // that went out some other way (a plugin's own fetch), or a trace from
  // before magpie measured it, says nothing more than the time it took.
  const ms1 = (n) => n < 10 ? t("{n} ms", { n: (Math.round(n * 10) / 10).toString() }) : took(Math.round(n));
  function timeParts(tr) {
    const n = tr.net, out = [], add = (who, label, v) => { if (v >= 0.1) out.push({ who, label, v }); };
    // the request's masking, before its first try (Route.masking)
    add("magpie", "Masking", tr.masking || 0);
    if (!n) return out;
    add("magpie", "Waiting for a slot", tr.queued || 0);
    add("magpie", "In magpie", n.own || 0);
    add("net", "Requests before it", n.before || 0);
    // what's left of the pool's wait once a dial is out is a rounding
    if ((n.pool || 0) >= 1) add("net", "Waiting for a connection", n.pool);
    add("net", "DNS", n.dns || 0);
    add("net", "Connecting", n.connect || 0);
    add("net", "TLS", n.tls || 0);
    add("net", "Sending", n.send || 0);
    add("vendor", "Vendor (first byte)", n.wait || 0);
    const head = n.head || 0;
    if (tr.ttft > 0) {
      add("vendor", "First token", tr.ttft - head);
      add("vendor", "Streaming", (tr.ms || 0) - tr.ttft);
    } else add("vendor", "Reading the reply", (tr.ms || 0) - head);
    return out;
  }
  const WHO = { magpie: "magpie {ms}", net: "network {ms}", vendor: "vendor {ms}" };
  // why a try that went out some other way has no split (gateway.sentBy)
  const SENT_BY = {
    plugin: "Its plugin sent this request itself, so magpie can't split its time",
    claude: "Claude Code sent this request itself, so magpie can't split its time",
  };
  function timeSaid(tr) {
    const parts = timeParts(tr);
    if (!parts.length) return "";
    const sum = {};
    for (const p of parts) sum[p.who] = (sum[p.who] || 0) + p.v;
    const whose = Object.keys(WHO).filter((k) => sum[k] > 0).map((k) => t(WHO[k], { ms: ms1(sum[k]) }));
    return [t("Where the time went"), whose.join(" · "), parts.map((p) => t(p.label) + " " + ms1(p.v)).join(" · ")].filter(Boolean).join(": ");
  }
  function timeElement(tr) {
    const parts = timeParts(tr), total = parts.reduce((a, p) => a + p.v, 0) || 1;
    const box = el("div", "rt-time");
    const head = el("div", "rt-time-head", t("Where the time went"));
    const sum = {};
    for (const p of parts) sum[p.who] = (sum[p.who] || 0) + p.v;
    for (const k of Object.keys(WHO)) if (sum[k] > 0) head.append(el("span", "rt-time-who " + k, t(WHO[k], { ms: ms1(sum[k]) })));
    const bar = el("div", "rt-time-bar");
    bar.setAttribute("aria-hidden", "true");
    const list = el("ul", "rt-time-parts");
    for (const p of parts) {
      const seg = el("span", p.who);
      seg.style.flexGrow = String(p.v / total);
      seg.title = t(p.label) + " " + ms1(p.v);
      bar.append(seg);
      const li = el("li", p.who);
      li.append(el("span", "k", t(p.label)), el("span", "v", ms1(p.v)));
      list.append(li);
    }
    box.append(head, bar, list);
    return box;
  }

  // what the gateway adds to WorkBuddy's "unapproved channel" refusal
  // (provider.WBRefusedHint, #182): the agent gets it in English, the page
  // says it apart from the vendor's words, in its own language
  const WB_REFUSED = "WorkBuddy refuses chats from Codex and Claude Code (their system prompt); use it from Hermes, OpenCode or Pi, or add another provider to this group";
  // what it adds to a vendor's edge firewall's block page (provider.BlockedHint)
  const BLOCKED = "the provider's network firewall blocked requests from this IP; wait a while, or switch to another network or proxy";
  // what the ZCode plugin adds to the Start Plan's 405 code 3012, an
  // account ZCode's risk control blocked (provider.ZCodeRestrictedHint,
  // plugins#348)
  const ZCODE_BLOCKED = "ZCode's risk control blocked this account for unusual activity (code 3012); it rests, and the group's other providers are used. If the ZCode app fails on this account too, only ZCode support can lift the block";
  // what it adds to Antigravity's 429 for Claude Code's and the Agent SDK's
  // system prompt (antigravityTurnedAwayHint, #666, #1425)
  const AG_TURNED_AWAY = "Antigravity answers this 429 to the system prompt of Claude Code and the Claude Agent SDK (Claude Desktop's chats) whatever quota is left, so it is not a quota and waiting won't help; use another provider for these chats, or put one after Antigravity in a routing group";
  // what it adds to the same 429 for Codex's own GPT-5 system prompt, which
  // a thread begun on a GPT model keeps after a switch (antigravityCodexHint)
  const AG_CODEX = "Antigravity answers this 429 to Codex's own system prompt for GPT-5 models whatever quota is left, so it is not a quota and waiting won't help; a Codex chat begun on a GPT model keeps that prompt after a model switch or a fork, so start a new chat on this model";
  // what it adds to the same 429 for Hermes Agent's earlier default persona
  // (antigravityHermesHint)
  const AG_HERMES = "Antigravity answers this 429 to Hermes Agent's earlier default persona (its SOUL.md) whatever quota is left, so it is not a quota and waiting won't help; Hermes' current default persona goes through, so put it in SOUL.md, or use another provider for these chats";
  // what it adds to WorkBuddy's 403 11140 for an account it restricted
  // (provider.WBRestrictedHint, #1849)
  const WB_RESTRICTED = "WorkBuddy restricted this account for unusual activity; it stays out until WorkBuddy lifts that, which an appeal (Submit feedback in WorkBuddy) asks for";
  const HINTS = [WB_REFUSED, BLOCKED, ZCODE_BLOCKED, AG_TURNED_AWAY, AG_CODEX, AG_HERMES, WB_RESTRICTED];

  function trySaid(r, i) {
    const tr = r.tries[i], w = tried(r, tr), agent = agentName(r.agent);
    let name = w ? `${who(w)} (${w.model})` : tr.id;
    // Copilot's Auto: the model it picked last, which this try went as
    if (w && tr.auto?.length) name = `${who(w)} (${w.model} → ${tr.auto[tr.auto.length - 1].model})`;
    if (tr.effort && tr.fail !== "prompt") name += " " + t("at {level} reasoning", { level: tr.effort });
    if (!tr.done) return t("{who} is answering…", { who: name });
    if (typeof tr.status !== "number" && !tr.fail) return t("Outcome unavailable");
    // what came of a try is what the gateway did next, never guessed from
    // where it stood in the order: a later try is the request going on,
    // as the gateway appends one only as it asks it, and with none the
    // error ended the request, the agent's once the route is done (#2281)
    const next = r.tries[i + 1], nw = next && tried(r, next);
    // a Codex reset spent by itself: with Codex's own sign-in the one try
    // it was spent for is the one that then answered
    const spent = tr.reset && tr.status < 400
      ? t("Its week was used up, so one of {account}'s Codex resets was used by itself first.", { account: userShown(w?.provider, tr.reset.who) }) + " "
      // Codex's own sign-in asked again onto its credits: the one try
      : tr.credits && tr.status < 400
      ? t("Its allowance had just run out and it was refused, so it was asked again at once to spend its credits.") + " "
      : "";
    if (tr.status < 400 && tr.fail)
      return tr.rest
        ? t("{who} began answering, then broke off · {fail}. {agent} got what was said before the error; {how}, so {agent}'s next request goes to another first.",
          { who: name, fail: failWord(tr.fail, tr.rest), how: restHow(tr.rest, at(tr.start) + (tr.ms || 0)), agent })
        : t("{who} began answering, then broke off. {agent} got what was said before the error; the conversation isn't kept on {who} for its next request.", { who: name, agent });
    if (tr.status < 400) {
      const tk = (r.tokens ? " · " + t("{n} tokens", { n: tokens(r.tokens) }) : "") + firstNote(r, tr);
      return spent + (i > 0
        ? t("{who} answered in {ms}{tk}. {agent} got one clean reply and never saw the {n} that failed first.", { who: name, ms: took(tr.ms), tk, agent, n: i })
        : t("{who} answered in {ms}{tk}.", { who: name, ms: took(tr.ms), tk }));
    }
    if (tr.reset)
      return t("{who} answered {status}: its week is used up and nobody else could take the request, so one of {account}'s Codex resets was used by itself and the request is asked again, before any of the reply reaches {agent}.",
        { who: name, status: tr.status, account: userShown(w?.provider, tr.reset.who), agent });
    // a Codex account that holds credits, refused as its allowance ran
    // out: asked again at once, for the vendor to spend its credits
    if (tr.credits)
      return t("{who} answered {status}: its allowance had just run out, but the account holds credits, which the vendor spends once the allowance is used up, so it is asked again at once, before any of the reply reaches {agent}.",
        { who: name, status: tr.status, agent });
    if (tr.fail === "canceled")
      return t("{agent} canceled the request while {who} was answering: nobody failed, so nobody rests and nobody else is asked.", { who: name, agent });
    if (tr.fail === "auth")
      return next
        ? t("{who} could not authenticate. Sign in again in magpie; this login is not retried. The request went to {next}.", { who: name, next: nw ? who(nw) : t("the next") })
        : t("{who} could not authenticate. Sign in again in magpie; this login is not retried. No other account could answer.", { who: name });
    if (tr.fail === "foreign")
      return t("{who} couldn't read the reasoning another account wrote earlier in this conversation, so it is asked again without it, before any of the reply reaches {agent}.", { who: name, agent });
    if (tr.fail === "floor")
      return t("{who} takes no request for a reply as short as this one asked for, so it is asked again for the shortest it gives, before any of the reply reaches {agent}.", { who: name, agent });
    if (tr.fail === "update")
      return t("{who} turned away the reasoning effort changed mid-conversation as an update that keeps its cache, so it is asked again at the new effort the usual way, before any of the reply reaches {agent}.", { who: name, agent });
    if (tr.fail === "verify" && !r.tries[i + 1])
      return t("{who} answered {status}: the vendor wants the account verified before it serves it again, and nobody is left to try, so {agent} gets the error with how to verify it. For a minute {agent}'s retries get the same answer without asking the vendor.", { who: name, status: tr.status, agent });
    if (tr.fail === "refused")
      return r.tries[i + 1]
        ? t("{who}'s safety filter refused the request before saying anything, so it goes on to the next before any of the reply reaches {agent}. Nothing is wrong with {who}, so it doesn't rest.", { who: name, agent })
        : t("{who}'s safety filter refused the request before saying anything, and nobody is left to try, so {agent} gets an error saying so, not an empty reply to ask again for.", { who: name, agent });
    if (tr.fail === "prompt")
      return r.tries[i + 1]
        ? t("{who} answered {status}: the vendor turns away {agent}'s system prompt whichever account it goes to, so it goes on to the next before any of the reply reaches {agent}. Nothing is wrong with {who}, so it doesn't rest.", { who: name, status: tr.status, agent })
        : t("{who} answered {status}: the vendor turns away {agent}'s system prompt whichever account it goes to, and nobody else is left to try, so {agent} gets the error. Nothing is wrong with {who}, so it doesn't rest.", { who: name, status: tr.status, agent });
    if (tr.fail === "sight")
      return t("{who} answered {status}: it takes no images, so it is asked again with the images described by the image recognition model, before any of the reply reaches {agent}. Later requests to it are described first. Nothing is wrong with {who}, so it doesn't rest.", { who: name, status: tr.status, agent });
    if (tr.fail === "shape")
      return t("{who} answered {status}: its API couldn't read something in the request that another's may, so it goes on to the next before any of the reply reaches {agent}. Nothing is wrong with {who}, so it doesn't rest.", { who: name, status: tr.status, agent });
    if (tr.fail === "effort")
      return r.tries[i + 1]
        ? t("{who} answered {status}: its plan doesn't take the reasoning effort asked for, so another account goes on with it before any of the reply reaches {agent}. {who} serves other efforts, so it doesn't rest.", { who: name, status: tr.status, agent })
        : t("{who} answered {status}: its plan doesn't take the reasoning effort asked for, and no account left that does could answer, so {agent} gets an error saying so.", { who: name, status: tr.status, agent });
    if (tr.fail === "slow")
      return !next && r.done
        ? t("{who} hadn't begun answering after {ms}, and nobody is left to try, so {agent} gets the error.", { who: name, ms: took(tr.ms), agent })
        // slow again and again on this account: its model rests here
        : tr.rest
        ? t("{who} hadn't begun answering after {ms}, {n} times in a row, so the request went on to the next before any of it reached {agent}. It rests {d} for {model} alone, longer each time it is slow again; its other models answer as before.",
          { who: name, ms: took(tr.ms), n: tr.rest.failures, model: tr.rest.model || tr.model, d: dur(at(tr.rest.until) - at(tr.start) - (tr.ms || 0)), agent })
        : t("{who} hadn't begun answering after {ms}, so the request went on to the next before any of it reached {agent}. Nothing is wrong with {who}, so it doesn't rest.", { who: name, ms: took(tr.ms), agent });
    // this computer had no network (usrname1833 on Discord)
    if (tr.fail === "offline")
      return r.tries[i + 1]
        ? t("{who}: this computer had no network, so the request never reached the vendor and goes on to the next. Nothing is wrong with {who}, so it doesn't rest: once the network is back it is asked first again.", { who: name })
        : t("{who}: this computer had no network, so the request never reached the vendor, and nobody is left to try: {agent} gets the error. Nothing is wrong with {who}, so it doesn't rest.", { who: name, agent });
    if (tr.fail === "proxy")
      return r.tries[i + 1]
        ? t("{who}: the proxy magpie goes through didn't take the connection, so the request never reached the vendor and goes on to the next. Nothing is wrong with {who}, so it doesn't rest: once the proxy is up it is asked first again.", { who: name })
        : t("{who}: the proxy magpie goes through didn't take the connection, so the request never reached the vendor, and nobody is left to try: {agent} gets the error. Start the proxy, or change it in Settings.", { who: name, agent });
    // the agent left while magpie waited to ask again (#1894): the
    // story ends there, not on a retry that never came
    if (tr.gone)
      return t("{who} answered {status} · {fail}, and was to be asked again in {d}, but {agent} canceled the request before then, so nobody is asked again.",
        { who: name, status: tr.status, fail: failWord(tr.fail, tr.rest), d: took(tr.again), agent });
    if (tr.replan)
      return t("{who} answered {status} · {fail}, and every member had failed with an error that may pass, so after {d} the {n} of them are asked again, in turn, before any of the reply reaches {agent}. The group waits up to {p} for one to answer.",
        { who: name, status: tr.status, fail: failWord(tr.fail, tr.rest), d: took(tr.again), n: tr.replan, p: took((tr.patience || 0) * 1000), agent });
    // kept on it for its cache, so asked once more before it moves (jiabubu)
    if (tr.again && tr.kept)
      return t("{who} answered {status} · {fail}, a failure that may pass. The conversation is kept on {who} for what its vendor cached of it, so it is asked once more in {d} before the request moves to another.",
        { who: name, status: tr.status, fail: failWord(tr.fail, tr.rest), d: took(tr.again) });
    if (tr.again)
      return t("{who} answered {status} · {fail}, and nobody else is left to ask — a failure that may pass, so it is tried again in {d}, before any of the reply reaches {agent}.",
        { who: name, status: tr.status, fail: failWord(tr.fail, tr.rest), d: took(tr.again), agent });
    // the last one left out of its allowance, after another failed
    // otherwise: the agent was told that one's error (Try.Earlier)
    if (tr.earlier && !next)
      return t("{who} answered {status} and nobody is left to try. {agent} gets the error an earlier try gave, not this used-up allowance, so it doesn't stop as if every account were out.", { who: name, status: tr.status, agent });
    // the error came, and nothing after it is known yet
    if (!next && !r.done) return t("{who} answered {status}.", { who: name, status: tr.status });
    const how = tr.rest && restHow(tr.rest, at(tr.start) + (tr.ms || 0));
    if (next)
      return tr.rest
        ? t("{who} answered {status} · {fail}. {how}; the request goes on to {next} before any of the reply reaches {agent}.",
          { who: name, status: tr.status, fail: failWord(tr.fail, tr.rest), how, next: nw ? who(nw) : t("the next"), agent })
        : t("{who} answered {status}, and the request goes on to {next} before any of the reply reaches {agent}. {who} doesn't rest for it.",
          { who: name, status: tr.status, next: nw ? who(nw) : t("the next"), agent });
    if (tr.rest)
      return t("{who} answered {status} · {fail}. {how}; nobody is left to try, so {agent} gets the error.",
        { who: name, status: tr.status, fail: failWord(tr.fail, tr.rest), how, agent });
    // the gateway stopped here with accounts left in the order: one it
    // would not go on from (the same history refused on every account of
    // a vendor, with no other vendor left)
    return i >= r.order.length - 1
      ? t("{who} answered {status} and nobody is left to try, so {agent} gets the error.", { who: name, status: tr.status, agent })
      : t("{who} answered {status} — an error another account wouldn't fix, so {agent} gets it.", { who: name, status: tr.status, agent });
  }

  // ---------- state ----------

  const routes = new Map(); // id → the latest of each route
  let seq = 0, mine = false, loaded = false;
  let traceTotals = { requests: 0, rerouted: 0, errors: 0 };
   // why the trace can't be watched here, when it can't
  // the request the window was opened on (?req=), from the tray panel
  
  let cur = null;           // the route the header and the log tell of: the newest played
  let pinned = null;        // a past route picked from the strip
  let rows = new Map();     // id → { li, wire, st, bi, tg, w, rid, up }

// upstream client.js:1590-1620
  const subs = new Map();   // a group in the group's way down → its heading { li, wire, key, up }
  // A provider's keys serving one model, FOLD_AT or more of them side by
  // side, fold into one row that tells of them all (#1319: 53 keys for one
  // model were 53 rows alike); opened, it heads them as a group in the
  // group does. Which are open is remembered by provider and model.
  // A provider's accounts for one model fold the same way, and so does a
  // group in the group, from its heading (Aiirobyte on Discord: a group of
  // many accounts pushed the groups to edit far down the page). Keys start
  // folded; accounts and a group in the group start folded when LONG or
  // more of them, else open. Which the reader opened or folded is kept, by
  // provider and model, or "group/<id>", whatever the default.
  const FOLD_AT = 3, LONG = 6;
  // Accounts and keys shows this many rows of a longer list, and every
  // one needing the reader, the rest behind Show N more
  
  const folds = new Map();  // foldKey → { li, wire, st, tg, n, w, ids, up, open, pk }
  let keysOpen = new Set(), keysShut = new Set();
  try { keysOpen = new Set(JSON.parse(localStorage.getItem("magpie.routingKeysOpen") || "[]")); } catch {}
  try { keysShut = new Set(JSON.parse(localStorage.getItem("magpie.routingFolded") || "[]")); } catch {}
  const isOpen = (k, dflt) => keysShut.has(k) ? false : keysOpen.has(k) ? true : dflt;
  function keepOpen(k, open) {
    if (open) { keysOpen.add(k); keysShut.delete(k); } else { keysOpen.delete(k); keysShut.add(k); }
    try {
      localStorage.setItem("magpie.routingKeysOpen", JSON.stringify([...keysOpen]));
      localStorage.setItem("magpie.routingFolded", JSON.stringify([...keysShut]));
    } catch {}
  }
  const agents = new Map(); // exact recorded source → { node, ic, name, sub, wire }
  const sourceKey = (r) => typeof r.session === "string" && r.session.length
    ? JSON.stringify(["session", r.agent, r.session])
    : JSON.stringify(["unknown", r.agent, host.generation(), r.id, r.time]);
  const sourceLabel = (r) => r.session ? (r.session.length > 14 ? r.session.slice(0, 12) + "…" : r.session) : t("Unknown session") + " · #" + r.id;
  let sets = [];            // the account sets on the stage, in the order they came
  const playing = new Map(); // the routes being played → the gen playing each
  let rp = null;            // a replay playing: see replay

// upstream client.js:1623-2128
  const src = () => rp ? rp.routes : routes; // the routes the stage plays from
  const LINGER = 12e3;      // how long an agent's last request stays on the stage
  let gen = 0, trips = [], waiters = [];
  // a dot let go at an account waits there while it answers: it stays at
  // the end of the wire to it as the stage is laid out again, the window
  // resized or the view coming back narrow then wide (#1859: posed once,
  // it stayed where the account had been)
  const holds = new Map(); // packet → the row it waits at
  function holdAll() {
    for (const [dot, row] of holds) pose({ dot, legs: wiresTo(row).map((p) => ({ p })) }, 1);
  }
  let capQ = [], capAt = -1e9, capLo = false, flipUntil = 0;
  // the frame loop's own state; see frame below
  let seen = false, lastFrame = 0, ticking = 0;
  // busy: something on the stage still moves — a flight, a caption waiting
  // its turn, rows sliding to their new places. Only then does the loop
  // ask for frames; an idle stage asks for none (#2827: a frame every
  // vsync, nothing drawn, cost a renderer without a GPU a core and more)
  const busy = () => trips.length > 0 || capQ.length > 0 || performance.now() < flipUntil;
  // kick wakes the loop for new motion. Waking from idle is not a gap in
  // the frames — the page was in sight and still — so the gap resume()
  // looks for counts from now
  function kick() {
    if (ticking || !shown()) return;
    if (seen) lastFrame = performance.now();
    ticking = requestAnimationFrame(frame);
  }

  // fly carries a dot along paths one after another, as one flight — and
  // the magpie holding it in its beak, if there is one
  const fly = (dot, bird, legs, ms) => new Promise((res) => {
    if (!shown()) { res(); return; } // no hidden frame is needed to finish it
    const tr = { dot, bird, legs, t0: performance.now(), ms: still() ? 0 : ms, res, g: gen };
    pose(tr, 0);
    trips.push(tr);
    kick();
  }).finally(() => { for (const l of legs) if (l.j) l.p.remove(); });

  // measured is a path's length, and the tips of it flights met, for the d
  // it had: measured again only when its d changes. Every frame poses
  // every flight, and measured each leg and each wire end anew — with
  // three agents sending at once, ~10 s of a 40 s look at the page went to
  // getTotalLength and getPointAtLength alone, and the page lagged
  // (yg6888 on X: "打开页面很卡").
  // Neither is asked of the browser for a d of magpie's own: its length is
  // that of its points (flat) and the wire ends a flight meets are read
  // from it (wireEnds). While rows slide every wire's d is new each frame,
  // and getTotalLength on each was a quarter of a busy page's time
  // (#3813).
  const measured = new WeakMap(); // path → { d, L, tips, pts, flat, ends }
  function measure(p) {
    const d = p.isConnected && p.getAttribute("d");
    if (!d) return null;
    let m = measured.get(p);
    if (!m || m.d !== d) measured.set(p, m = { d, tips: [], pts: [] });
    return m;
  }
  const lengthOf = (p, m) => {
    if (m.L === undefined) {
      if (m.flat === undefined) m.flat = flat(m.d);
      m.L = m.flat ? m.flat.len[m.flat.len.length - 1] : p.getTotalLength?.() || 0;
    }
    return m.L;
  };
  const pathLength = (p) => { const m = measure(p); return m ? lengthOf(p, m) : 0; };
  // pointAt is the point s along p, read between the points measured every
  // ptStep along it, each measured once for its d: every flight asked
  // getPointAtLength three times a frame, and the flights on one wire asked
  // for the same points again. Between two points 8 px apart, a wire's
  // curve is off its chord by a fraction of a pixel.
  const ptStep = 8;
  // flat is a d as points close together, with the length along it to
  // each, read once for its d: getPointAtLength walks the path from its
  // start on each call, and in WebKit the flights along wires to keys
  // hundreds of rows down spent a sixth of the page's time in it (#3164).
  // Only what the stage draws with, an absolute M then L, Q and C; any
  // other d is read from the browser, a point every ptStep
  function flat(d) {
    const n = d.match(/[A-Za-z]|-?(?:\d+\.?\d*|\.\d+)(?:e[-+]?\d+)?/gi) || [], k = { M: 2, L: 2, Q: 4, C: 6 };
    const xs = [], ys = [], len = [];
    const to = (x, y) => {
      const j = xs.length - 1;
      len.push(j < 0 ? 0 : len[j] + Math.hypot(x - xs[j], y - ys[j]));
      xs.push(x); ys.push(y);
    };
    let c = "";
    for (let i = 0; i < n.length;) {
      if (/[A-Za-z]/.test(n[i])) { c = n[i++]; continue; }
      if (!k[c] || (c === "M" && xs.length)) return null;
      const a = n.slice(i, i += k[c]).map(Number);
      if (a.length < k[c] || a.some(isNaN)) return null;
      if (c === "M") { to(a[0], a[1]); c = "L"; continue; }
      if (!xs.length) return null;
      const P = [xs[xs.length - 1], ys[ys.length - 1], ...a];
      if (c === "L") { to(a[0], a[1]); continue; }
      // pieces no longer than 2 px along the curve's control points
      let hull = 0;
      for (let j = 2; j < P.length; j += 2) hull += Math.hypot(P[j] - P[j - 2], P[j + 1] - P[j - 1]);
      const steps = Math.max(1, Math.ceil(hull / 2));
      for (let j = 1; j <= steps; j++) {
        const t = j / steps, u = 1 - t;
        const w = c === "Q" ? [u * u, 2 * u * t, t * t] : [u * u * u, 3 * u * u * t, 3 * u * t * t, t * t * t];
        let x = 0, y = 0;
        w.forEach((wi, q) => { x += wi * P[2 * q]; y += wi * P[2 * q + 1]; });
        to(x, y);
      }
    }
    return xs.length > 1 && len[len.length - 1] > 0 ? { xs, ys, len } : null;
  }
  function pointAt(p, s) {
    const m = measure(p);
    if (!m || !lengthOf(p, m)) return p.getPointAtLength(s);
    s = Math.max(0, Math.min(m.L, s));
    if (m.flat) {
      const { xs, ys, len } = m.flat, u = s;
      let lo = 0, hi = len.length - 1;
      while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (len[mid] <= u) lo = mid; else hi = mid; }
      const f = len[hi] > len[lo] ? (u - len[lo]) / (len[hi] - len[lo]) : 0;
      return { x: xs[lo] + (xs[hi] - xs[lo]) * f, y: ys[lo] + (ys[hi] - ys[lo]) * f };
    }
    const k = Math.floor(s / ptStep), s0 = k * ptStep, s1 = Math.min(m.L, s0 + ptStep);
    const at = (i, si) => m.pts[i] || (m.pts[i] = p.getPointAtLength(si));
    const a = at(k, s0);
    if (s === s0 || s1 <= s0) return a;
    const b = at(k + 1, s1), f = (s - s0) / (s1 - s0);
    return { x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f };
  }

  // tip is where a flight meets a wire's end or start, and which way it
  // heads there: along the wire, or back along it
  const tip = (p, atEnd, back) => () => {
    const m = measure(p);
    if (!m) return null; // not laid out: nowhere to meet it yet
    const key = (atEnd ? 2 : 0) + (back ? 1 : 0);
    if (m.tips[key]) return m.tips[key];
    if (m.ends === undefined) m.ends = wireEnds(m.d);
    let a, tx, ty;
    if (m.ends) {
      const e = m.ends[atEnd ? 1 : 0];
      a = e; tx = e.tx; ty = e.ty;
    } else {
      const L = lengthOf(p, m);
      if (!L) return null;
      a = p.getPointAtLength(atEnd ? L : 0);
      const b = p.getPointAtLength(atEnd ? Math.max(0, L - 2) : Math.min(L, 2));
      tx = atEnd ? a.x - b.x : b.x - a.x; ty = atEnd ? a.y - b.y : b.y - a.y;
    }
    if (back) { tx = -tx; ty = -ty; }
    const n = Math.hypot(tx, ty) || 1;
    return m.tips[key] = { x: a.x, y: a.y, tx: tx / n, ty: ty / n };
  };
  // wireEnds are a d's start and end, each with the way it heads there (along
  // the path at its end, into it at its start), read off its first and
  // last pieces: the line or control point next to each end that isn't
  // the end itself. Only for magpie's own absolute M, L, Q and C, and
  // null for any other d, or one with no way at all, which the browser
  // measures instead.
  function wireEnds(d) {
    const n = d.match(/[A-Za-z]|-?(?:\d+\.?\d*|\.\d+)(?:e[-+]?\d+)?/gi) || [], k = { M: 2, L: 2, Q: 4, C: 6 };
    const pts = []; // [x, y], each point the d names in turn
    let c = "";
    for (let i = 0; i < n.length;) {
      if (/[A-Za-z]/.test(n[i])) { c = n[i++]; continue; }
      if (!k[c] || (c === "M" && pts.length)) return null;
      const a = n.slice(i, i += k[c]).map(Number);
      if (a.length < k[c] || a.some(isNaN)) return null;
      for (let j = 0; j < a.length; j += 2) pts.push([a[j], a[j + 1]]);
      if (c === "M") c = "L";
    }
    if (pts.length < 2) return null;
    const way = (from, step) => {
      const [x, y] = pts[from];
      for (let j = from + step; j >= 0 && j < pts.length; j += step) {
        const tx = (pts[j][0] - x) * step, ty = (pts[j][1] - y) * step, h = Math.hypot(tx, ty);
        if (h > 1e-9) return { x, y, tx: tx / h, ty: ty / h };
      }
      return null;
    };
    // at its start, from the start to what comes next; at its end, from
    // what came before to the end
    const s = way(0, 1), e = way(pts.length - 1, -1);
    return s && e ? [s, e] : null;
  }
  // via is the way through magpie from one wire to the next: a gentle arc
  // across it, carrying on the way the flight came in and leaving the way
  // the next wire goes — or, out the side it came in, a loop round inside.
  // It follows the wires as they move.
  function via(from, to) {
    const p = document.createElementNS(NS, "path");
    p.setAttribute("class", "via");
    sky.appendChild(p);
    // j runs each frame a flight is on it: the arc is laid again only when
    // a wire's end moved, not made anew sixty times a second (#1481)
    let ax = NaN, ay = NaN, atx = NaN, aty = NaN, bx = NaN, by = NaN, btx = NaN, bty = NaN;
    const j = () => {
      const a = from(), b = to();
      if (!a || !b) { p.removeAttribute("d"); ax = NaN; return; }
      if (a.x === ax && a.y === ay && a.tx === atx && a.ty === aty && b.x === bx && b.y === by && b.tx === btx && b.ty === bty) return;
      ax = a.x; ay = a.y; atx = a.tx; aty = a.ty; bx = b.x; by = b.y; btx = b.tx; bty = b.ty;
      const dx = b.x - a.x, dy = b.y - a.y, dist = Math.hypot(dx, dy);
      let c1, c2;
      if (dist < 4) {
        const h = hub.getBoundingClientRect(), k = Math.min(h.width, h.height) * .42, m = k * .6;
        const nx = a.ty, ny = -a.tx;
        c1 = [a.x + a.tx * k - nx * m, a.y + a.ty * k - ny * m];
        c2 = [b.x - b.tx * k + nx * m, b.y - b.ty * k + ny * m];
      } else {
        const k = dist * .38, l = Math.min(16, dist * .12), nx = dy / dist, ny = -dx / dist;
        c1 = [a.x + a.tx * k + nx * l, a.y + a.ty * k + ny * l];
        c2 = [b.x - b.tx * k + nx * l, b.y - b.ty * k + ny * l];
      }
      // set only when it moved: a new d is measured again (measure)
      const d = `M${a.x} ${a.y} C${c1[0]} ${c1[1]} ${c2[0]} ${c2[1]} ${b.x} ${b.y}`;
      if (p.getAttribute("d") !== d) p.setAttribute("d", d);
    };
    j();
    return { p, j };
  }
  const until = (f) => f() ? Promise.resolve() : new Promise((res) => waiters.push({ f, res }));
  const wake = () => { const w = waiters; waiters = []; for (const x of w) if (x.f()) x.res(); else waiters.push(x); };
  function say(s, lo) {
    if (!s) return;
    if (!shown()) { capQ = []; show({ s, lo }); return; }
    if (lo && capQ.length) return;
    if (!lo) capQ = capQ.filter((c) => !c.lo);
    capQ.push({ s, lo });
    if (capQ.length > 3) capQ.shift();
    kick();
  }
  function show(c) { capLo = !!c.lo; cap.textContent = c.s; rerun(cap, "in", "rtin"); capAt = performance.now(); }

  // curve is a wire's S from (x0, y0) to (x3, y3), its bends at mx: one
  // cubic, cut into exact pieces of it about 1000 px tall (the middle ones
  // up to 1.5 times that). WebKit dashes a cubic at a cost that grows faster
  // than its length, and a key's fold hundreds of rows from magpie (#3164)
  // had its flowing wire as one 18,000 px cubic: ~75 ms of each frame. The
  // pieces trace the same curve.
  function curve(x0, y0, mx, x3, y3) {
    let a = [x0, y0], b = [mx, y0], c = [mx, y3];
    const d = [x3, y3], lerp = (p, q, t) => [p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t];
    let s = `M${x0} ${y0}`;
    for (let n = Math.min(64, Math.ceil(Math.abs(y3 - y0) / 1000)); n > 1; n--) {
      const t = 1 / n, ab = lerp(a, b, t), bc = lerp(b, c, t), cd = lerp(c, d, t), abc = lerp(ab, bc, t), bcd = lerp(bc, cd, t), m = lerp(abc, bcd, t);
      s += ` C${ab[0]} ${ab[1]} ${abc[0]} ${abc[1]} ${m[0]} ${m[1]}`;
      a = m; b = bcd; c = cd;
    }
    return s + ` C${b[0]} ${b[1]} ${c[0]} ${c[1]} ${x3} ${y3}`;
  }

  // a flowing wire is dashed only near what is in sight (#3164): one to a
  // key hundreds of rows down is tens of thousands of pixels long, and
  // WebKit stroked every dash of it again on each frame it flowed, under
  // 50 fps with two groups open. Its dashes from a screen above to a screen
  // below what is in sight are kept, from a multiple of their 8px so they
  // stay in step with the whole wire's; the rest of it is a gap, out of
  // sight (dashFor). Nothing is laid out for it: where the
  // stage and what is in sight were is kept by layout, which reads them
  // anyway (sight), and the view's scroll since by its scroll events.
  // Reading them here laid the stage out again after each update.
  // Each is drawn by a copy in flows, a layer of its own, and itself hidden:
  // in the svg of every wire, Chromium (WebView2) drew all 800 again on the
  // GPU each frame one flowed, 31 fps with both groups open (#3164)
  const flowing = new Map();
  let flowAsked = 0, sight = null, scrolled = 0;
  const flowSoon = () => { if (!flowAsked) flowAsked = requestAnimationFrame(() => { flowAsked = 0; flowNear(); }); };
  function flowNear() {
    const live = new Set([...wires.querySelectorAll("path.live[d]")].filter((p) => !p.classList.contains("rest")));
    for (const [p, f] of flowing) if (!live.has(p)) { f.copy.remove(); p.classList.remove("flown"); flowing.delete(p); }
    if (!live.size || !sight) return;
    // in the stage's own terms, a screen more each way, in steps of 200px
    // so a scroll redashes a wire only now and then
    const at = sight.at - (scrolled - sight.scroll), m = Math.max(sight.hi - sight.lo, 200);
    const top = Math.floor((sight.lo - m - at) / 200) * 200, bottom = Math.ceil((sight.hi + m - at) / 200) * 200;
    for (const p of live) {
      // the same wire with the same in sight is dashed as it was: this is
      // asked after every update
      const d = p.getAttribute("d"), hue = p.style.getPropertyValue("--agent"), key = `${d}|${hue}|${top}|${bottom}`;
      let f = flowing.get(p);
      if (f?.key === key) continue;
      if (!f) { f = { copy: document.createElementNS(NS, "path"), dash: "" }; flows.appendChild(f.copy); flowing.set(p, f); p.classList.add("flown"); }
      f.key = key;
      if (f.copy.getAttribute("d") !== d) f.copy.setAttribute("d", d);
      if (hue) f.copy.style.setProperty("--agent", hue); else f.copy.style.removeProperty("--agent");
      const dash = dashFor(d, top, bottom);
      if (f.dash === dash) continue;
      f.dash = dash;
      if (dash) f.copy.style.setProperty("stroke-dasharray", dash);
      else f.copy.style.removeProperty("stroke-dasharray");
    }
  }
  // dashFor is a wire's dashes from top to bottom, measured from its d,
  // which is magpie's own M, L, Q and C: WebKit's getPointAtLength took
  // milliseconds a wire, and a wire's d changes with most updates. Each
  // bend is walked in 16 straight steps, a little shorter than the bend,
  // so its ends are moved out by 64px each way, more than that is off
  const dashFor = (d, top, bottom) => {
    const n = (d.match(/-?[\d.]+(?:e-?\d+)?/g) || []).map(Number), cmd = d.match(/[MLQC]/g) || [];
    let x = n[0], y = n[1], k = 2, len = 0, s0 = Infinity, s1 = -Infinity;
    const mark = (l) => { s0 = Math.min(s0, l); s1 = Math.max(s1, l); };
    if (y >= top && y <= bottom) mark(0);
    for (const c of cmd.slice(1)) {
      const q = c === "L" ? 2 : c === "Q" ? 4 : 6, v = n.slice(k, k += q), steps = c === "L" ? 1 : 16;
      for (let i = 1; i <= steps; i++) {
        const t = i / steps, u = 1 - t;
        const [px, py] = c === "L" ? [v[0], v[1]]
          : c === "Q" ? [u * u * x + 2 * u * t * v[0] + t * t * v[2], u * u * y + 2 * u * t * v[1] + t * t * v[3]]
          : [u * u * u * x + 3 * u * u * t * v[0] + 3 * u * t * t * v[2] + t * t * t * v[4], u * u * u * y + 3 * u * u * t * v[1] + 3 * u * t * t * v[3] + t * t * t * v[5]];
        // where a step crosses an edge of the band, a straight one
        // thousands of pixels long too
        const l = Math.hypot(px - x, py - y);
        for (const e of [top, bottom]) if (py !== y && (y - e) * (py - e) <= 0) mark(len + l * (e - y) / (py - y));
        len += l; x = px; y = py;
        if (y >= top && y <= bottom) mark(len);
      }
    }
    if (s0 === Infinity) return `0 ${Math.ceil(len) + 64}`;
    const a = Math.max(0, Math.floor(s0 / 8) * 8 - 64), z = Math.ceil(s1 / 8) * 8 + 64;
    return a <= 0 && z >= len ? "" : `0 ${a} ${"3 5 ".repeat((z - a) / 8)}0 ${Math.ceil(len) + 64}`;
  };
  $("#view-routing").addEventListener("scroll", (e) => { scrolled = e.currentTarget.scrollTop; flowSoon(); if (win) placeSoon(); }, { passive: true });

  // with hundreds of keys open (#3164) only the keys near sight are in the
  // list: a run of the others is one gap as tall as they are, and a key in
  // it has the box it would have there, so its wire is drawn as before.
  // Each update laid out, read and moved every key, in WebKit longer than
  // a frame. Scrolled half a screen on, the list is made again around it.
  const VIRT_AT = 200;
  let gapOf = new Map(), win = null, laid = [], listAt = 0, viewH = 0, listGap = 7, placeAsked = 0;
  const laidHs = new WeakMap(), usual = new Map(); // a li → { h, nobar } as last laid out; nobar → a key's height
  const isKey = (e) => !e.classList.contains("rt-fold") && !e.classList.contains("rt-sub");
  const heightOf = (e) => {
    const nobar = e.classList.contains("nobar"), m = laidHs.get(e);
    return m && m.nobar === nobar ? m.h : usual.get(nobar) ?? usual.get(!nobar) ?? 38;
  };
  function place(els) {
    laid = els;
    gapOf = new Map();
    win = null;
    let n = 0;
    for (const e of els) if (isKey(e)) n++;
    if (n < VIRT_AT) return els;
    const m = viewH || innerHeight, lo = scrolled - listAt - m, hi = scrolled - listAt + (viewH || innerHeight) + m;
    win = { lo, hi };
    const out = [];
    let y = 0, run = null;
    // a gap is new each time, never one used for other rows: app.js's
    // click hold may keep a clicked row's neighbour where it was, and a
    // gap standing for other rows would take the view with it
    const end = () => {
      if (!run) return;
      const g = el("li", "rt-gap");
      g.setAttribute("aria-hidden", "true");
      g.style.height = Math.max(0, run.h - listGap) + "px";
      run.g = g;
      out.push(g);
      run = null;
    };
    for (const e of els) {
      const h = heightOf(e);
      if (isKey(e) && (y + h < lo || y > hi)) {
        if (!run) run = { g: null, h: 0 };
        gapOf.set(e, { run, off: run.h, h });
        run.h += h + listGap;
      } else { end(); out.push(e); }
      y += h + listGap;
    }
    end();
    return out;
  }
  // put puts what is to be in the list there, moving only the nodes out of
  // order: moving a node restarts what it plays, and the list made again
  // around a scroll put every key back, a fold held where it was clicked
  // moving again with them
  function put(out) {
    const mine = new Set(out);
    for (const li of [...list.children]) if (!mine.has(li)) li.remove();
    let at = list.firstElementChild;
    for (const e of out) {
      if (e === at) at = at.nextElementSibling;
      else list.insertBefore(e, at);
    }
  }
  const placeSoon = () => { if (!placeAsked) placeAsked = requestAnimationFrame(() => {
    placeAsked = 0;
    if (!win || !list.isConnected) return;
    // read again: a fold opened is held where it was by a scrollTop set
    // after the layout that asked, and the scroll event of it can come a
    // frame after this one, the list left around where the view was
    scrolled = $("#view-routing").scrollTop;
    const m = (viewH || innerHeight) / 2, lo = scrolled - listAt;
    if (lo - m >= win.lo && lo + viewH + m <= win.hi) return;
    // what is in sight stays where it is, the gaps above it as tall as
    // they guess or not
    const vt = $("#view-routing").getBoundingClientRect().top;
    const anchor = [...list.children].find((e) => !e.classList.contains("rt-gap") && e.getBoundingClientRect().bottom > vt);
    const was = anchor?.getBoundingClientRect().top;
    put(place(laid));
    if (anchor?.isConnected) {
      const d = anchor.getBoundingClientRect().top - was;
      if (Math.abs(d) >= 1) $("#view-routing").scrollTop += d;
    }
    layout();
  }); };

  function layout() {
    const r = stage.getBoundingClientRect();
    if (!r.width) return;
    // every box is read before any wire is drawn, each once: a wire drawn
    // between two reads had the next read lay the stage out again, and
    // hundreds of keys open (#3164) laid it out once a row, seconds a time
    const boxes = new Map(), sets = [];
    const b = (e) => {
      let v = boxes.get(e);
      if (v) return v;
      const at = !e.isConnected && gapOf.get(e);
      if (at) { // a key in a gap: where it would be in it
        const g = b(at.run.g), l = g.l + (parseFloat(e.style.getPropertyValue("--depth")) || 0) * 18, t = g.t + at.off;
        v = { l, r: g.r, t, b: t + at.h, cx: (l + g.r) / 2, cy: t + at.h / 2 };
      } else { const x = e.getBoundingClientRect(); v = { l: x.left - r.left, r: x.right - r.left, t: x.top - r.top, b: x.bottom - r.top, cx: (x.left + x.right) / 2 - r.left, cy: (x.top + x.bottom) / 2 - r.top }; }
      boxes.set(e, v);
      return v;
    };
    const h = b(hub), low = b(srcs).b;
    // a key off screen is not drawn, and its content is as tall as a drawn
    // key's (routing.css, #3164)
    let row = list.firstElementChild;
    while (row && (row.matches(".rt-fold, .rt-sub, .idle") || !row.firstElementChild?.checkVisibility?.({ contentVisibilityAuto: true }))) row = row.nextElementSibling;
    const pad = row && getComputedStyle(row), rowH = row && Math.round((b(row).b - b(row).t - parseFloat(pad.paddingTop) - parseFloat(pad.paddingBottom) - parseFloat(pad.borderTopWidth) - parseFloat(pad.borderBottomWidth)) * 100) / 100;
    for (const a of agents.values()) {
      const s = b(a.node), mx = (s.r + h.l) / 2;
      sets.push([a.wire, h.l > s.r ? curve(s.r, s.cy, mx, h.l, h.cy) : `M${s.cx} ${s.b} L${h.cx} ${h.t}`]);
    }
    const fromHub = (a) => {
      if (a.l > h.r) {
        const mx = (h.r + a.l) / 2;
        return curve(h.r, h.cy, mx, a.l, a.cy);
      }
      // the accounts sit under magpie: a lane down their left, from below the agents too
      const x = a.l - 12, y = Math.max(h.b, low - 8);
      return `M${h.cx} ${h.b} L${h.cx} ${y} C${h.cx} ${y + 22} ${x} ${y + 2} ${x} ${y + 24} L${x} ${a.cy - 10} Q${x} ${a.cy} ${a.l} ${a.cy}`;
    };
    // a group in the group: its models hang from its heading, a lane down
    // from where the wire to it ends (under the heading) to each
    const fromSub = (s, a) => {
      const p = b(s.li), x = p.l + 9;
      return `M${p.l} ${p.cy} Q${x} ${p.cy} ${x} ${p.cy + 9} L${x} ${a.cy - 9} Q${x} ${a.cy} ${a.l} ${a.cy}`;
    };
    for (const s of subs.values()) {
      const up = s.up && subs.get(s.up);
      sets.push([s.wire, up ? fromSub(up, b(s.li)) : fromHub(b(s.li))]);
    }
    for (const f of folds.values()) {
      if (!f.li.isConnected) { sets.push([f.wire, null]); continue; }
      const up = f.up && subs.get(f.up);
      sets.push([f.wire, up ? fromSub(up, b(f.li)) : fromHub(b(f.li))]);
    }
    for (const row of rows.values()) {
      // a key folded away has no wire: its fold's is the way to it
      if (!row.li.isConnected && !gapOf.has(row.li)) { sets.push([row.wire, null]); continue; }
      const f = row.fold && folds.get(row.fold);
      const up = f?.open ? f : row.up && subs.get(row.up), a = b(row.li);
      sets.push([row.wire, up ? fromSub(up, a) : fromHub(a)]);
    }
    // set after this frame: the keys not drawn changing size resize the
    // stage, which in its own ResizeObserver WebKit reports as a loop
    if (rowH && list.style.getPropertyValue("--rt-row") !== rowH + "px") requestAnimationFrame(() => list.style.setProperty("--rt-row", rowH + "px"));
    // read before the wires are set, which lays the stage out again
    const view = $("#view-routing"), v = view.getBoundingClientRect();
    scrolled = view.scrollTop;
    // what place() lays the next list out by: the list's top in the view's
    // content, and each li's height as it is now
    listAt = b(list).t + r.top - v.top + scrolled;
    viewH = v.height;
    listGap = parseFloat(getComputedStyle(list).rowGap) || 0;
    for (const e of list.children) {
      if (e.classList.contains("rt-gap") || e.classList.contains("idle")) continue;
      const x = b(e), nobar = e.classList.contains("nobar");
      laidHs.set(e, { h: x.b - x.t, nobar });
      if (isKey(e) && e.firstElementChild?.checkVisibility?.({ contentVisibilityAuto: true })) usual.set(nobar, x.b - x.t);
    }
    sight = { at: r.top, scroll: scrolled, lo: Math.max(0, v.top), hi: Math.min(innerHeight, v.bottom) };
    const box = `0 0 ${r.width} ${r.height}`;
    for (const svg of [wires, flows, sky]) if (svg.getAttribute("viewBox") !== box) svg.setAttribute("viewBox", box);
    for (const [p, d] of sets) {
      if (d === null) { if (p.hasAttribute("d")) p.removeAttribute("d"); }
      else if (p.getAttribute("d") !== d) p.setAttribute("d", d);
    }
    flowSoon();
    // the view moved by more than a scroll told of (a row held in place,
    // the stage grown under it): the list made again around where it is
    if (win) placeSoon();
    holdAll();
  }

  // rankOf is an account's or key's place in its provider's own list, the
  // order its page shows and a drag sets (#217): the list as it is now, so
  // a drag moves it at once; else as the request found it
  function rankOf(w) { return w.rank || 0; } // recorded order; no provider inventory

// upstream client.js:2146-2692
  // seated: a route's accounts and keys each in a place of its own, not in
  // the order routing weighed them this time — the group's members in the
  // group's order, a provider's fallbacks after its own, then each
  // provider's in its own order — so the column holds still while the one
  // put first moves.
  // One whose vendor doesn't list the model to it is never asked, so it
  // isn't drawn — only told of, among why it went where it did. One held
  // at its usage cap, or used up and set not to spend credits, is drawn,
  // faded and saying so, as a resting one is: it is the user's own and
  // comes back when its window renews, and a group member held so would
  // otherwise vanish from the stage (#2129, wyq0x55: d-task's gpt-sol-6.1,
  // used up, wasn't shown while a used-up Claude was).
  // window: passed over as the request is longer than its model's
  // context window (#3749), a row of its own as one at a cap is
  const heldOut = (w) => !w.held && !!(w.capped || w.noCredits || w.window);
  function seated(r) {
    const members = r.group?.members || [];
    const key = (w) => {
      let m = members.indexOf(w.provider + "/" + w.model + (w.fixed ? ":" + w.fixed : ""));
      if (m < 0) m = members.findIndex((x) => x.startsWith(w.provider + "/"));
      return [w.fallback ? 1 : 0, m < 0 ? members.length : m, w.name || w.provider, w.aside ? 1 : 0, rankOf(w), w.who || "", w.id];
    };
    const cmp = (x, y) => {
      for (let i = 0; i < x.length; i++) if (x[i] !== y[i]) return typeof x[i] === "number" ? x[i] - y[i] : String(x[i]).localeCompare(String(y[i]));
      return 0;
    };
    const on = new Set(r.order.map(seat));
    // each one's key made once, not at each comparison (#3164)
    return [...r.order, ...(r.left || []).filter((w) => heldOut(w) && !on.has(seat(w)))]
      .map((w) => [key(w), w]).sort((a, b) => cmp(a[0], b[0])).map(([, w]) => w);
  }

  // a seat is one of a route's keys or accounts for one model: two of a
  // group's models on one provider go over the same keys, and are two seats
  // — as is one model a group has twice, each at an effort of its own
  const seat = (x) => x.id + "\u0000" + (x.model || "") + (x.fixed ? ":" + x.fixed : "");
  // tried is the seat a try went to. A try's fixed is the effort it was
  // sent at by force — the member's own, or one its agent asked in the
  // model's id (a Claude Code tier at high) — where its seat's is the
  // member's own only, so a member following the group's effort is found by
  // its key and model (#865)
  const tried = (r, tr) => r.order.find((x) => seat(x) === seat(tr))
    || r.order.find((x) => x.id === tr.id && (x.model || "") === (tr.model || ""))
    || r.order.find((x) => x.id === tr.id);
  // tryseat is the seat of the row a try went to: its row is keyed by it
  const tryseat = (r, tr) => seat(tried(r, tr) || tr);
  // made once for each route's list, which a trace update replaces whole
  const setsOf = new WeakMap();
  const setOf = (r) => {
    let s = setsOf.get(r.order);
    if (s === undefined) setsOf.set(r.order, s = r.order.map(seat).sort().join("\n"));
    return s;
  };
  // whole fills in the lists a route's JSON can leave null: a route the
  // gateway weighed no seats for has "order": null, and the page reads
  // r.order, r.tries and r.left as lists everywhere — one null threw in
  // pick, and clicking such a request (a refused one) opened nothing
  const whole = (r) => {
    if (r) { r.order ||= []; r.tries ||= []; r.left ||= []; }
    return r;
  };

  // wayOf is the route a request went by, as the stage heads it: its
  // routing group, or the provider its model is of. A key of its own, no
  // ">" in it, as a group in the group's way down is joined by them.
  const wayOf = (r) => "\u0002" + (r.group ? "g:" + r.group.id : "p:" + r.provider).replace(/>/g, "\u0003");
  let ways = null; // with more than one route on the stage, each one's heading: way → info
  // wayInfos tells of each route on the stage as its latest request found
  // it, and of the agents sending to it, by name
  function wayInfos(rs) {
    const out = new Map();
    for (const r of rs) {
      const key = wayOf(r), g = r.group, f = r.order.find((x) => !x.fallback) || r.order[0];
      const agents = [...new Set([...(out.get(key)?.agents || []), agentName(r.agent)])];
      out.set(key, g ? { id: key, route: true, pk: "route/group/" + g.id, name: g.name, ref: g.ref || "group/" + g.id, routing: g.routing || "", agents }
        : { id: key, route: true, pk: "route/" + r.provider, name: f?.name || r.provider, ref: r.model, routing: f?.routing || "", icon: f ? f.icon || f.preset || "generic" : "",
          lone: r.order.filter((x) => !x.fallback).length <= 1, agents });
    }
    return out;
  }

  // staged: the routes the stage shows — a picked one alone; else those
  // playing, and each agent's latest while it lingers, a few agents at most
  function staged() {
    if (pinned) return [pinned];
    if (day && !rp) return [];
    const n = now(), last = new Map(), map = src();
    const rs = [...map.values()].filter(matchesPurpose).sort((a, b) => a.id - b.id);
    for (const r of rs) last.set(sourceKey(r), r);
    const out = rs.filter((r) => playing.has(r.id) || (last.get(sourceKey(r)) === r && (!r.done || at(r.time) + (r.ms || 0) > n - LINGER)));
    const c = cur && map.get(cur.id);
    if (c && !out.includes(c)) out.push(c);
    const ags = [...new Set(out.map(sourceKey))].slice(-4);
    return out.filter((r) => ags.includes(sourceKey(r))).sort((a, b) => a.id - b.id);
  }

  // hueOf is the colour an agent's requests and answers fly in, and it is
  // marked with. PALETTE is twelve quiet colours of one lightness and
  // chroma around the wheel, Claude's clay first; an agent asks for its
  // maker's (HUES, a place in it) or one by its id, and is given the first
  // from there no other agent has had, kept for as long as the page is
  // open. Picked by id alone, 49 of 59 agents shared 8 colours and two
  // on the stage at once were often marked alike (Pkh on Discord). The
  // agents shown together (hues) are kept apart when more than twelve
  // have come. None is red: red on this page is a failure, and an agent
  // marked in it read as one (zhouatie on X: "openai" drew rose).
  // routing-agent-hue-not-red.test.cjs holds every colour here away from it.
  const PALETTE = ["#d97757", "#bd8638", "#a59234", "#849e4a", "#5aa66c", "#25a98f", "#00a6b0", "#2e9fc9", "#5e95d7", "#858ad7", "#a47fca", "#bb77b1"];
  const HUES = {
    claude: 0, codex: 9, gemini: 7, copilot: 10, cursor: 5, opencode: 2, crush: 11, goose: 3, pi: 4, omp: 11, omo: 10, dsh: 6,
    commandcode: 1, mimocode: 8, deveco: 7,
  };
  const given = new Map(); // agent → its colour
  function hueOf(id, near) {
    let c = given.get(id);
    if (c && !near?.has(c)) return c;
    let h = HUES[id];
    if (h == null) { h = 0; for (const ch of String(id || "")) h = (h * 31 + ch.charCodeAt(0)) >>> 0; }
    const had = new Set(given.values()), from = (k) => PALETTE[(h + k) % PALETTE.length];
    const ks = [...PALETTE.keys()];
    c = from(ks.find((k) => !had.has(from(k)) && !near?.has(from(k))) ?? ks.find((k) => !near?.has(from(k))) ?? 0);
    given.set(id, c);
    return c;
  }
  // hues: the agents shown together, each its own colour
  function hues(ids) {
    const near = new Set();
    for (const id of ids) near.add(hueOf(id, near));
  }

  // foldersOf: the folders routes say, each once, in their order;
  // lastLevel, a folder's last level ("workspace/magpie" → "magpie")
  const foldersOf = (rs) => [...new Set(rs.map((r) => r.folder).filter(Boolean))];
  const lastLevel = (f) => f.split("/").pop();
  
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
        ...(id ? [] : [t("Request identity unavailable")])].join("\n");
      setAttr(e.node, "title", description);
      setAttr(e.node, "aria-label", description);
      e.node.classList.toggle("on", group.active > 0);
    }
    setAttr(list, "aria-label", t("Model request activity — scroll for all activity"));
    measure();
  }

  function agentNode(id, actualAgent = id) {
    let a = agents.get(id);
    if (a) return a;
    const node = el("div", "rt-node rt-src"), ic = el("span", "rt-ic"), name = el("b"), sub = el("small");
    node.append(ic, name, sub);
    a = { node, ic, name, sub, wire: path() };
    node.style.setProperty("--agent", hueOf(actualAgent));
    a.wire.style.setProperty("--agent", hueOf(actualAgent));
    agents.set(id, a);
    return a;
  }

  // subNode is the heading of a group in the group, key its way down
  // ("fast>cheap"), at depth d
  // It folds from its heading: what it routes to is then the heading's,
  // which says what they do together, as a fold of keys does.
  function subNode(key, info, d) {
    let s = subs.get(key);
    if (!s) {
      const li = el("li", "rt-sub"), name = el("b"), id = el("code", "mdl"), mode = el("i"), n = el("span", "n"), chev = el("span", "chev");
      const st = el("em"), tg = el("span", "tag");
      chev.append(svg(CHEV, 12, 1.7));
      // a route's heading has its provider's logo, a group's the fan
      li.append(info.route && info.icon ? icon(info.icon) : svg(FAN, 14, 1.5), name, id, n, mode, chev, st, tg);
      li.classList.toggle("rt-route", !!info.route);
      li.tabIndex = 0;
      li.setAttribute("role", "button");
      s = { li, name, id, mode, n, st, tg, wire: path(), key, sub: true };
      li.onclick = () => toggleSub(s);
      li.onkeydown = (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); toggleSub(s); } };
      subs.set(key, s);
    }
    s.up = d ? key.slice(0, key.lastIndexOf(">")) : null;
    s.pk = info.route ? info.pk : "group/" + info.id;
    s.li.style.setProperty("--depth", d);
    setText(s.name, info.name || info.id);
    setText(s.id, info.ref || "group/" + info.id);
    // a provider with one key on routes nothing: no way to name
    setText(s.mode, info.lone ? "" : t(modeOf(info.routing || "")[0]));
    s.rules = info.route ? t("Sent by {agents}", { agents: info.agents.join(", ") })
      : info.rules ? t(info.rules === 1 ? "1 rule" : "{n} rules", { n: info.rules }) : "";
    return s;
  }
  // shut marks a heading or a fold open or folded, as the reader sees it
  function shut(f, open, folded, opened) {
    f.open = open;
    f.li.classList.toggle("open", open);
    f.li.setAttribute("aria-expanded", String(open));
    const tip = t(open ? folded : opened);
    f.li.title = f.rules ? f.rules + "\n" + tip : tip;
  }
  function toggleSub(s) {
    keepOpen(s.pk, !s.open);
    const rs = staged();
    if (rs.length) steady(() => rebuild(rs, false));
    render();
  }
  // wiresTo is the way from magpie to a row: through the headings of the
  // groups it is in, then its own wire
  function wiresTo(row) {
    const out = [];
    if (row.sub) { // a group in the group folded: the way down to its heading
      const via = row.key.split(">");
      for (let d = 1; d <= via.length; d++) { const s = subs.get(via.slice(0, d).join(">")); if (s) out.push(s.wire); }
      return out;
    }
    const via = row.path || [];
    for (let d = 1; d <= via.length; d++) { const s = subs.get(via.slice(0, d).join(">")); if (s) out.push(s.wire); }
    const f = row.fold && folds.get(row.fold);
    if (f?.open) out.push(f.wire);
    return [...out, row.wire];
  }
  // shownRow is where a seat is on the stage: its own row, the fold it is
  // folded into, or the heading of the group in the group folded over it —
  // where a request to it flies, and its failure is tagged
  function shownRow(id) {
    const row = rows.get(id);
    if (row?.shut && subs.has(row.shut)) return subs.get(row.shut);
    const f = row?.fold && folds.get(row.fold);
    return f && !f.open ? f : row;
  }

  // foldKey: keys or accounts side by side that fold together — one
  // provider's, for one model at one effort, on one way down a group, all
  // fallbacks or none
  const foldKey = (w, path = w.via || []) => [path.join(">"), w.kind, w.provider, w.model || "", w.fixed || "", w.fallback ? 1 : 0, w.aside ? 1 : 0].join("\u0000");
  const folding = (w) => w.kind === "key" || w.kind === "account";
  // what is remembered open: the provider and model, whichever request
  const openKey = (w) => w.provider + "/" + (w.model || "") + (w.fixed ? ":" + w.fixed : "");
  function foldNode(key, w) {
    let f = folds.get(key);
    if (!f) {
      const li = el("li", "rt-fold"), b = el("b"), st = el("em"), tg = el("span", "tag");
      const n = el("span", "n"), chev = el("span", "chev");
      chev.append(svg(CHEV, 12, 1.7));
      li.append(el("i", "dot"), b, st, chev, tg);
      li.tabIndex = 0;
      li.setAttribute("role", "button");
      li.onclick = () => toggleFold(f);
      li.onkeydown = (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); toggleFold(f); } };
      f = { li, b, st, tg, n, wire: path(), key };
      folds.set(key, f);
    }
    f.w = w;
    f.pk = openKey(w) + (w.kind === "account" ? "@" : "");
    const name = w.fallback ? w.name : w.name || w.provider;
    const head = [icon(w.icon || (w.preset ? w.preset : "generic")), el("span", "who", name), " ", f.n,
      el("code", "mdl", w.fixed ? `${w.model}:${w.fixed}` : w.model)];
    if (w.fallback) head.push(el("small", "fb", t("fallback")));
    if (f.b.dataset.head !== openKey(w) + (w.fallback ? "|fb" : "")) { f.b.replaceChildren(...head); f.b.dataset.head = openKey(w) + (w.fallback ? "|fb" : ""); }
    return f;
  }
  // toggleFold opens a fold's keys in place, or folds them again: the row
  // clicked stays where it is (app.js holds it under the pointer)
  function toggleFold(f) {
    keepOpen(f.pk, !f.open);
    const rs = staged();
    if (rs.length) steady(() => rebuild(rs, false));
    render();
  }

  function makeRow(w) {
    const li = el("li"), b = el("b");
    b.append(icon(w.icon || (w.preset ? w.preset : "generic")));
    const name = el("span", "who", who(w));
    // the provider's name heads the card; a row names what differs
    const sub = el("span", "", rowSub(w, false));
    b.append(name, " ", sub, el("code", "mdl", w.fixed ? `${w.model}:${w.fixed}` : w.model));
    if (w.fixed) b.title = t("{level} reasoning, fixed on this model in the group", { level: w.fixed });
    if (w.fast) {
      // the group sends this member in its vendor's fast mode
      const f = el("small", "fb", t("fast"));
      f.title = t("Sent in its vendor's fast mode, as the group says");
      b.append(f);
    }
    if (w.fallback) b.append(el("small", "fb", t("fallback")));
    const st = el("em"), bar = el("div", "bar"), bi = el("i"), tg = el("span", "tag");
    bar.append(bi);
    // what the row says, cut short beside the model (routing.css), is read
    // whole over it (yi_time on Discord). Measured as the pointer comes,
    // not on each render: hundreds of rows (#3164)
    st.onpointerenter = () => {
      const cut = st.scrollWidth > st.clientWidth + 1;
      if (cut) st.dataset.cut = "1"; else delete st.dataset.cut;
      if (cut && !st.title) st.title = st.textContent;
    };
    st.onpointerleave = () => delete st.dataset.cut;
    li.append(el("i", "dot"), b, st, bar, tg);
    li.title = w.id;
    return { li, wire: path(), st, bi, tg, w, subEl: sub };
  }
  // rowSub is what a row says after the name: a fallback's provider, an
  // account's plan; and the provider of a key or account named as one of
  // another provider's on the stage is (twin), so two providers' Key-01
  // rows, each of the same model, are told apart (iamleehom on Discord)
  const rowSub = (w, twin) => w.fallback ? w.name : w.kind === "provider" ? "" : twin ? [w.name || w.provider, w.plan].filter(Boolean).join(" · ") : w.plan || "";

  // sync puts the staged routes on the stage: each agent on the left, and
  // the accounts they weighed, each route's in the order it weighed them —
  // a new order of the same accounts moves them to their places, so it
  // shows. Accounts and agents stay where they are while they stay.
  // Out of sight none of the stage is drawn: resume() draws it as it is
  // when the page comes back. Built while hidden, every trace update put
  // new agents, rows and wires in, and their entrance and live animations,
  // held by a timeline that doesn't run while the window is hidden, kept
  // each replaced node alive (#2515, #2513). Back in sight with the stage
  // built from what it would be built from now ("back"), it is brought up
  // to date as in sight, not taken down and built again: the same agents,
  // accounts and wires made anew each time the page was picked (#4652)
  let builtFrom = [];
  function sync(force) {
    if (!shown()) return;
    const rs = staged();
    if (!rs.length) return;
    const from = () => [cur, pinned, day, rp, purpose.join(), document.documentElement.lang, ...rs,
      ...rs.flatMap((r) => [...r.order, ...(r.left || [])].map(who))];
    const now = from(), same = now.length === builtFrom.length && now.every((x, i) => x === builtFrom[i]);
    if (force === "back" ? !same : force) steady(() => rebuild(rs, true));
    else rebuild(rs, false);
    builtFrom = from(); // as built: rebuild takes cur from the routes
  }
  function rebuild(rs, force) {
    // live, the request the card tells of stays (told), not the newest staged
    const stay = pinned || (!rp && !day && cur && src().get(cur.id)) || rs[rs.length - 1];
    cur = src().get(stay.id) || stay;
    if (force) {
      for (const row of rows.values()) row.wire.remove();
      rows = new Map();
      for (const s of subs.values()) s.wire.remove();
      subs.clear();
      for (const f of folds.values()) f.wire.remove();
      folds.clear();
      list.replaceChildren();
      for (const a of agents.values()) a.wire.remove();
      agents.clear();
      srcs.replaceChildren();
    }
    // agents
    const ags = [...new Set(rs.map(sourceKey))];
    const actualAgents = [...new Set(rs.map((r) => r.agent))];
    for (const [id, a] of agents) if (!ags.includes(id)) { a.node.remove(); a.wire.remove(); agents.delete(id); }
    const keep = [...agents.keys()];
    const nodes = [...keep, ...ags.filter((a) => !keep.includes(a))].map((id) => agentNode(id, rs.find((r) => sourceKey(r) === id).agent).node);
    if (nodes.some((x, i) => srcs.children[i] !== x) || srcs.children.length !== nodes.length) srcs.replaceChildren(...nodes);
    srcs.classList.toggle("many", ags.length > 1);
    hues(actualAgents);
    for (const id of ags) {
      const a = agents.get(id), r = rs.filter((x) => sourceKey(x) === id).pop(), ag = agentOf(r.agent);
      for (const n of [a.node, a.wire]) n.style.setProperty("--agent", hueOf(r.agent));
      if (a.icon !== (ag?.icon || "generic")) { a.icon = ag?.icon || "generic"; a.ic.replaceChildren(icon(a.icon)); }
      setText(a.name, agentName(r.agent));
      // one agent working in more than one folder at once: which, by
      // their last level (#1068). The stage holds an agent's latest
      // request alone, so its others still going, or just done, count too.
      const relevant = sourceRequests(id, rs), fs = foldersOf(relevant);
      // Project disclosure is independent of full-folder disclosure. Never infer it from folder.
      const projects = [...new Set(relevant.map((x) => x.projectName).filter(Boolean))];
      // told again every second (countdown): only what changed is written
      setText(a.sub, projects.length ? projects.map(lastLevel).join(", ") + " · " + sourceLabel(r) : sourceLabel(r) + " · " + r.model);
      const tip = [agentName(r.agent), r.model, r.session ? t("Session id") + ": " + r.session : sourceLabel(r), ...projects, ...fs.map((f) => t("Folder") + ": " + f)].join("\n");
      if (a.node.title !== tip) a.node.title = tip;
    }
    // the account sets, the latest of each
    const latest = new Map();
    for (const r of rs) latest.set(setOf(r), r);
    sets = [...sets.filter((k) => latest.has(k)), ...[...latest.keys()].filter((k) => !sets.includes(k))];
    // a Set beside the list: hundreds of keys looked each other up (#3164)
    const ids = [], has = new Set(), wOf = new Map(), rOf = new Map();
    // the routes the sets are of, each its sets together. With more than
    // one on the stage, each route's rows hang under a heading naming it:
    // under a header naming one route, the rows of the other agents'
    // routes read as that one's (hoobnn on Discord: a group "3 on" over
    // five rows, Pi's zcode and OpenCode's Kimi Code among them)
    const byWay = new Map();
    for (const k of sets) { const w = wayOf(latest.get(k)); byWay.has(w) ? byWay.get(w).push(k) : byWay.set(w, [k]); }
    ways = byWay.size > 1 ? wayInfos(rs) : null;
    const wayAt = new Map();
    for (const [w, ks] of byWay) for (const k of ks) {
      for (const x of seated(latest.get(k))) { const id = seat(x); if (!has.has(id)) { has.add(id); ids.push(id); wayAt.set(id, w); } }
    }
    for (const r of rs) for (const w of [...r.order, ...(r.left || [])]) { wOf.set(seat(w), w); rOf.set(seat(w), r.id); }
    // where each was, of those on the stage: a key folded away was nowhere
    const before = new Map([...[...rows].map(([id, row]) => [id, row.li]), ...[...folds].map(([k, f]) => ["\u0001" + k, f.li])]
      .filter(([, li]) => li.isConnected).map(([id, li]) => [id, li.getBoundingClientRect().top]));
    for (const [id, row] of rows) if (!has.has(id)) { row.li.remove(); row.wire.remove(); rows.delete(id); }
    if (list.querySelector(".idle")) list.replaceChildren();
    for (const id of ids) {
      let row = rows.get(id);
      if (!row) {
        row = makeRow(wOf.get(id));
        rows.set(id, row);
        if (before.size && !still()) row.li.classList.add("new");
      }
      row.w = wOf.get(id);
      row.rid = rOf.get(id);
      // its way down: its route's heading, then the groups in the group
      row.path = ways ? [wayAt.get(id), ...(row.w.via || [])] : row.w.via || [];
    }
    // a name more than one provider's rows go by says the provider too
    const provsOf = new Map();
    for (const id of ids) {
      const w = rows.get(id).w;
      if (w.kind !== "provider") { const n = who(w); provsOf.set(n, (provsOf.get(n) || new Set()).add(w.provider)); }
    }
    for (const id of ids) { const row = rows.get(id); setText(row.subEl, rowSub(row.w, provsOf.get(who(row.w))?.size > 1)); }
    // a group in the group heads its models, which it routes by its own
    // routing, set in under it
    // keys or accounts side by side that fold together, FOLD_AT or more
    const foldOf = new Map();
    let run = [];
    const flush = () => {
      if (run.length >= FOLD_AT) {
        const w = rows.get(run[0]).w, f = foldNode(foldKey(w, rows.get(run[0]).path), w), acct = w.kind === "account";
        f.ids = run;
        shut(f, isOpen(f.pk, acct && run.length < LONG),
          acct ? "Fold these accounts into one row" : "Fold these keys into one row", acct ? "Show each account" : "Show each key");
        for (const id of run) foldOf.set(id, f);
      }
      run = [];
    };
    for (const id of ids) {
      const w = rows.get(id).w;
      if (folding(w) && run.length && foldKey(rows.get(run[0]).w, rows.get(run[0]).path) === foldKey(w, rows.get(id).path)) run.push(id);
      else { flush(); if (folding(w)) run = [id]; }
    }
    flush();
    // how many each group in the group routes to, which folds it when LONG
    const under = new Map();
    for (const id of ids) {
      const via = rows.get(id).path;
      for (let d = 1; d <= via.length; d++) { const k = via.slice(0, d).join(">"); under.set(k, (under.get(k) || 0) + 1); }
    }
    const els = [], want = new Set(), infos = rs.flatMap((r) => r.group?.subs || []);
    for (const id of ids) {
      const row = rows.get(id), via = row.path, f = foldOf.get(id);
      row.fold = f ? f.key : null;
      const depth = String(via.length + (f ? 1 : 0));
      if (row.li.style.getPropertyValue("--depth") !== depth) row.li.style.setProperty("--depth", depth);
      row.up = via.length ? via.join(">") : null;
      row.shut = null;
      for (let d = 0; d < via.length; d++) {
        const key = via.slice(0, d + 1).join(">");
        if (!want.has(key)) {
          want.add(key);
          const way = !d && ways?.get(via[0]);
          const s = subNode(key, way || infos.find((x) => x.id === via[d]) || { id: via[d], name: via[d] }, d);
          // a route's heading starts open, whatever its length: a second
          // agent coming shouldn't fold the first's rows away
          if (way) shut(s, isOpen(s.pk, true), "Fold this route into one row", "Show where this route goes");
          else shut(s, isOpen(s.pk, under.get(key) < LONG), "Fold this group into one row", "Show what this group routes to");
          els.push(s.li);
        }
        // folded: what it routes to is its heading's
        if (!subs.get(key).open) { row.shut = key; break; }
      }
      if (row.shut) continue;
      if (f) {
        if (!want.has("\u0001" + f.key)) {
          want.add("\u0001" + f.key);
          f.up = row.up;
          f.li.style.setProperty("--depth", via.length);
          els.push(f.li);
        }
        if (!f.open) continue;
      }
      els.push(row.li);
    }
    for (const [k, s] of subs) if (!want.has(k)) { s.li.remove(); s.wire.remove(); subs.delete(k); }
    for (const [k, f] of folds) if (!want.has("\u0001" + k)) { f.li.remove(); f.wire.remove(); folds.delete(k); }
    put(place(els));
    // FLIP: from where each was to its new place
    let moved = false;
    const placed = [...[...rows].map(([id, row]) => [id, row.li]), ...[...folds].map(([k, f]) => ["\u0001" + k, f.li])].filter(([, li]) => li.isConnected);
    // each row's place read before any is moved: a row moved between two
    // reads laid the stage out again, once a row of hundreds (#3164)
    const dys = still() ? [] : placed.map(([id, li]) => before.has(id) ? before.get(id) - li.getBoundingClientRect().top : 0);
    placed.forEach(([, li], i) => {
      if (!dys[i]) return;
      moved = true;
      li.style.transition = "none";
      li.style.transform = `translateY(${dys[i]}px)`;
    });
    if (moved) {
      void list.offsetWidth;
      for (const [, li] of placed) { li.style.transition = ""; li.style.transform = ""; }
      flipUntil = performance.now() + 520;
      kick();
    }
    header(cur, actualAgents.length);
    layout();
  }

  // header tells of the route the log tells of: its provider or group,
  // and how it routes
  // It names how the route routes where that can be changed, and takes
  // the reader to where it is (xczzhh on X: it said Smart, and nothing
  // changed it); a provider with only one account or key on has nothing
  // to route, and says so instead.
  let headOf = null; // what the head tells of, told again once the pools are in
  function header(r, many) {
    headOf = [r, many];
    const f = r.order.find((x) => !x.fallback) || r.order[0];
    const g = r.group;
    const routing = g ? g.routing || "" : f?.routing || "";
    const m = modeOf(routing);
    const on = r.order.filter((x) => !x.fallback).length;
    // No configuration inventory is available in a trace. Never infer that
    // one observed seat means only one account is configured.
    // none weighed: a request magpie holds before routing it (masked
    // first, or still read), or one nothing took. It says so, not "0 on"
    // over the one-account hint (Jason on Discord: a held Codex turn read
    // "magpie · 0 on" and "only one account is on")
    const none = !r.order.length;
    const lone = false; // unsupported configuration assertion excluded
    // the head is told again every second: a chip whose text node is
    // swapped while it is pressed gets no click in WebKit (#2151), so
    // only what changed is written
    setText(chip, t(m[0]));
    chip.hidden = lone || (none && !g);
    // Editor navigation is outside this read-only upper block.
    hubText();
    const name = g ? g.name : f?.name || r.provider, tail = (g ? " · " + t("routing group") : "")
      + (none && !r.done ? " · " + waitWord(r) : "") // configured enabled-account count unavailable
      + (many > 1 ? " · " + t("{n} agents at once", { n: many }) : "");
    if (what.childElementCount !== 2 || what.firstChild.textContent !== name || what.lastChild.textContent !== tail) what.replaceChildren(el("b", "", name), el("span", "", tail));
    // keys that read their own windows are weighed as accounts are
    setText(mode, r.evidence?.reasons?.includes("routing_mode_unavailable") ? t("Routing details unavailable") : none ? noneWhy(r) : lone ? t(LONE) : g && routing === "order" ? t(GROUP_ORDER) : g && routing === "weight" ? t(GROUP_WEIGHT) : t(!routing && f?.kind === "key" && !r.order.some((x) => x.known) && !g ? KEYS_SMART : m[1]));
    holdMode(r);
  }
  // holdMode keeps the line under the head, live, as tall as the last
  // few requests told it, as holdStory does the story: it sits over the
  // list, so a request picked whose line is shorter (one nothing took
  // says so in a line, where one account on gave three) pulled the list
  // up under the reader's click. A layout is read only when the line's
  // words or the width change, not on each second's telling (#3164)
  let modeHold = { key: "", told: new Map() };
  function holdMode(r) {
    const w = storyW;
    if (rp || day || !w) {
      if (mode.style.minHeight) mode.style.minHeight = "";
      modeHold = { key: "", told: new Map() };
      return;
    }
    const key = JSON.stringify([w, document.documentElement.lang]);
    if (key !== modeHold.key) modeHold = { key, told: new Map() };
    if (modeHold.told.get(r.id)?.[0] !== mode.textContent) {
      mode.style.minHeight = "";
      modeHold.told.set(r.id, [mode.textContent, mode.getBoundingClientRect().height]);
      const ids = [...modeHold.told.keys()].sort((x, y) => y - x);
      for (const id of ids.slice(3)) if (id !== r.id) modeHold.told.delete(id);
    }
    const own = modeHold.told.get(r.id)[1];
    const held = Math.max(...[...modeHold.told.values()].map((h) => h[1]));
    const min = held > own ? held + "px" : "";
    if (mode.style.minHeight !== min) mode.style.minHeight = min;
  }

// upstream client.js:2726-2748
  // lightRow lights a row and its wire: on for the one answering or that
  // answered the request shown, now and a flowing wire only while a
  // request is with it (#2386)
  // tint: a fold's or a group's wire in the colour of the row lit under
  // it, or in none
  function tint(wire, from) {
    const c = from?.style.getPropertyValue("--agent");
    if (c) wire.style.setProperty("--agent", c); else wire.style.removeProperty("--agent");
  }
  function lightRow(li, wire, on, now) {
    li.classList.toggle("on", on);
    li.classList.toggle("now", on && now);
    wire.classList.toggle("live", on && now);
    wire.classList.toggle("lit", on && !now);
  }

  // what a row says now: resting, answering, or what routing weighed it by
  function render() {
    if (!cur) return;
    hubText();
    const n = now(), rs = staged();
    // Activity reads retained gateway truth, never the synthetic replay clock/status.
    for (const [key, a] of agents) sourceActivity(a, sourceRequests(key, rs, routes, Date.now() + skew));
    const trying = new Map(), busy = new Set(); // a seat → the request it answers now
    for (const r of rs) for (const tr of r.tries) if (!tr.done) { trying.set(tryseat(r, tr), r); busy.add(sourceKey(r)); }

// upstream client.js:2750-2933
    const onWire = new Map(); // a seat → the agent whose magpie is at it
    for (const f of flying.values()) { onWire.set(f.id, f.agent); busy.add(f.sourceKey); }
    // what each request found, read once a pass: hundreds of a route's
    // keys each read their route's whole list again (#3164)
    const found = new Map();
    const findings = (r) => {
      let f = found.get(r);
      if (f) return f;
      const answered = new Set(), rests = new Map(), gave = new Map(), went = new Map();
      // a rest lifted since it was found (#1869), here or in the
      // provider's editor, is over: the row doesn't say it until the next
      // request is refused again (zoecats on Discord)
      const restAt = (id, m, rest, since) => {
        if (lifted(rest.key, since)) return;
        const rm = restModel(rest, m); rests.set(rm ? id + "\u0000" + rm : id, rest);
      };
      const modelOf = (tr) => tried(r, tr)?.model || tr.model || "";
      for (const w of r.order) if (w.rest) restAt(w.id, w.model, w.rest, at(r.time));
      for (const tr of r.tries) {
        if (tr.done && tryOk(tr)) answered.add(tryseat(r, tr));
        // the error the agent got: the last try's, once the request is
        // done, not one the gateway went on from (#2281)
        else if (tr.done && !tr.rest && !tr.again && !tr.earlier && r.done && tr === r.tries[r.tries.length - 1]) gave.set(tryseat(r, tr), tr);
        // one the gateway went on from says what it answered, and that the
        // request went on, not that the agent got it
        else if (tr.done && !tr.rest && !tr.again && !tr.credits && tr !== r.tries[r.tries.length - 1]) went.set(tryseat(r, tr), tr);
        if (tr.rest) restAt(tr.id, modelOf(tr), tr.rest, at(tr.start) + (tr.ms || 0));
      }
      // it answered: whatever rest it began in is over
      for (const tr of r.tries) if (tr.done && tryOk(tr)) { rests.delete(tr.id); rests.delete(tr.id + "\u0000" + modelOf(tr)); }
      found.set(r, f = { answered, rests, gave, went });
      return f;
    };
    for (const [id, row] of rows) {
      // each row as the latest staged request that weighed it found it
      // rests by key or account, and by key or account and model for a
      // rest of one model only: the account's other models' rows don't
      // rest with it (#1960)
      const r = src().get(row.rid) || pinned || cur, { answered, rests, gave, went } = findings(r);
      const w = row.w, rest = rests.get(w.id) || rests.get(w.id + "\u0000" + (w.model || "")), resting = rest && at(rest.until) > n;
      const smart = r.order[0] && id === seat(r.order[0]) && smartFor(r), said = smart ? t("picked for “{intent}”", { intent: smart }) : "";
      // the session it answers or answered, by its title, so which one
      // has the account shows (connor_yang on Discord): the request's
      // own, not each request's words
      let s, b, named = "";
      if (w.unlisted) s = unlistedWord(w);
      else if (resting) s = restSay(rest);
      else if (w.window) s = t("request longer than its {n} window · passed over", { n: ctxShort(w.window) });
      // a row another request weighed, answering that one: the header
      // tells of this request, so it says the answer is not this one's
      else if (trying.has(id)) {
        // this request's progress beside the account answering it; not
        // when the account answers another request, whose numbers they are
        const live = r.id === cur.id ? liveParts(r).map(([value]) => value).join(" · ") : "";
        // gone quiet, it says the numbers only: "answering…" would read as
        // the vendor still writing
        const hushed = live && r.contentAt && Date.now() - r.contentAt >= liveQuietMs;
        s = hushed ? live
          : (r.id !== cur.id && new Set(rs.map((r) => r.agent)).size <= 1 ? t("answering another request…") : t("answering…")) + (said && " · " + said) + (live ? " · " + live : "");
        // Session titles may contain prompts and are not collected.
      }
      else if (answered.has(id)) { s = (new Set(rs.map((r) => r.agent)).size > 1 ? t("answered {agent}", { agent: agentName(r.agent) }) : t("answered this request")) + (said && " · " + said); }
      else if (gave.has(id)) s = t("{status} · {fail} · passed to {agent}", { status: gave.get(id).status, fail: failWord(gave.get(id).fail, gave.get(id).rest), agent: agentName(r.agent) });
      else if (went.has(id)) s = t("{status} · {fail} · went on to the next", { status: went.get(id).status, fail: failWord(went.get(id).fail, went.get(id).rest) });
      else if (w.noURL) s = noURLWord(w);
      else if (w.reserve) s = t("in reserve · {n} at once", { n: w.reserve });
      else if (w.sunk && !lifted(sunkKey(w), at(w.sunk))) s = t("rate limited at {time} · at the back", { time: clock(w.sunk) });
      // the row smart routing's intent put first says the intent instead
      else if (said) s = said;
      // a model its vendor serves at no cost is no share of the account's
      // allowance: the windows are what the rest of it costs, so "100%
      // used" and its bar said the seat that always can answer was spent
      // (#3763). The gateway says .free under a routing that weighs by it.
      else if (w.free) s = t("free · costs nothing");
      else if (w.known) {
        const soon = usedRenews(w);
        s = w.creditsLast && !r.order[0]?.creditsLast ? quota(w, "{n} used · on credits · after the others", "{n} left · on credits · after the others")
          : tiered(w) && group(w) === "spent" && w.credits ? quota(w, "{n} used · on credits", "{n} left · on credits")
          : tiered(w) && group(w) === "spent" ? quota(w, "{n} used · all but used up", "{n} left · all but used up")
          : tiered(w) && group(w) === "low" ? quota(w, "{n} used · kept for last", "{n} left · kept for last")
          : (b = behindWhy(r, w)) === "kept" ? quota(w, "{n} used · conversation kept on another", "{n} left · conversation kept on another")
          : b === "sooner" && soon ? quota(w, "{n} used · renews in {d} · one renewing sooner goes first", "{n} left · renews in {d} · one renewing sooner goes first", { d: dur(soon - n) })
          : soon ? quota(w, "{n} used · renews in {d}", "{n} left · renews in {d}", { d: dur(soon - n) }) : quota(w, "{n} used", "{n} left");
      } else if (w.kind === "account") s = t("what's left not known yet");
      else if (w.routing === "usage") s = t("{n} tokens lately", { n: tokens(w.tokens || 0) });
      else if (w.aside) s = t("{api} only · after the others", { api: API[w.speaks] || w.speaks || t("any API") });
      else if (w.speaks) s = t("{api} only", { api: API[w.speaks] || w.speaks });
      else s = w.kind === "key" ? t("API key") : t("one key");
      // when a known allowance renews stays on its row whatever the row is
      // doing (dzxx0496 on Discord): answering, kept for last, passed over.
      // A resting row says when it is back instead, a free one has nothing
      // to renew, and a row that says it already isn't told twice.
      if (!resting && !w.unlisted && w.known && !w.free) {
        const soon = usedRenews(w), renew = soon > n ? t("renews in {d}", { d: dur(soon - n) }) : "";
        if (renew && !s.includes(renew)) s += " · " + renew;
      }
      // the title in a span of its own, one line cut short however the
      // status wraps on a narrow stage (routing.css .ses)
      const line = s + (named ? " · " : "");
      if (row.st.textContent !== line + named) {
        if (named) { const n = el("span", "ses", named); row.st.replaceChildren(line, n); } else row.st.textContent = s;
      }
      // the intent and a session's title are the user's own words, of any
      // length: cut short on the row (routing.css), read whole over it
      const full = said && s.includes(said) || named ? line + named : resting && !w.unlisted ? restTip(rest) : row.st.dataset.cut ? s : "";
      if (row.st.title !== full) { if (full) row.st.title = full; else row.st.removeAttribute("title"); } // an empty title would hide the row's own
      // an account's windows each, with when they reset, in its tooltip
      // (#1835): the row says the fullest one while idle and what it is
      // doing while it answers, and a second line on every seat would
      // crowd the stage. Live only, as the list's are (winsOf).
      const tip = w.id; // live /api/quotas inventory is unavailable; recorded quota remains on the row
      if (row.li.title !== tip) row.li.title = tip;
      const bar = w.known && !w.free && w.balance == null;
      row.li.classList.toggle("nobar", !bar);
      row.bi.style.width = bar ? fill(w) : "0";
      // on: the row answers or answered the request shown; flying: a
      // request is with it now. Only that moves (the dot's pulse, the
      // wire's flow): an answer that is over stays lit, still, or a
      // finished request reads as one still being called (#2386)
      const flying = !resting && (trying.has(id) || onWire.has(id));
      const on = flying || (!resting && answered.has(id));
      lightRow(row.li, row.wire, on, flying);
      // quiet: the reply is still out but no content came for liveQuietMs;
      // the dot stops pulsing, as it has not failed
      const quiet = flying && r.id === cur.id && !cur.done && cur.contentAt && Date.now() - cur.contentAt >= liveQuietMs;
      row.li.classList.toggle("quiet", !!quiet);
      row.li.classList.toggle("low", !!(tiered(w) && w.known && group(w) !== "fine"));
      row.li.classList.toggle("rest", !!resting || gave.has(id));
      row.li.classList.toggle("left", !!w.unlisted || !!w.window);
      // in the colour of the agent whose request is on it: the one it
      // answers now, the one whose magpie is at it, else the request it
      // answered, and none once it is off, so a row kept from before
      // never shows the last agent's colour (Pkh on Discord)
      const by = trying.get(id)?.agent ?? onWire.get(id) ?? r.agent;
      if (on) row.wire.style.setProperty("--agent", hueOf(by)); else row.wire.style.removeProperty("--agent");
      row.wire.classList.toggle("rest", !!resting || !!w.unlisted || !!w.window);
    }
    // a fold tells of its keys together: the one answering or that
    // answered, by name, then how many are there to route to and how many
    // rest
    const together = (f, ms) => {
      const has = (m, c) => m.li.classList.contains(c);
      const on = ms.find((m) => has(m, "now")) || ms.find((m) => has(m, "on")), resting = ms.filter((m) => has(m, "rest")).length;
      const held = ms.filter((m) => !has(m, "rest") && has(m, "left")).length; // at a cap, or used up (#2129)
      const parts = [];
      if (on) parts.push(`${who(on.w)}: ${on.st.textContent}`);
      if (resting + held < ms.length) parts.push(t("{n} available", { n: ms.length - resting - held }));
      if (resting) parts.push(t("{n} resting", { n: resting }));
      if (held) parts.push(t("{n} held", { n: held }));
      setText(f.st, parts.join(" · "));
      // a title or an intent the row cut short is read whole over the fold too
      const tip = on?.st.title ? f.st.textContent : "";
      if (f.st.title !== tip) { if (tip) f.st.title = tip; else f.st.removeAttribute("title"); }
      lightRow(f.li, f.wire, !!on, ms.some((m) => has(m, "now")));
      tint(f.wire, on?.wire);
      return !!ms.length && resting + held === ms.length;
    };
    for (const f of folds.values()) {
      const ms = (f.ids || []).map((id) => rows.get(id)).filter(Boolean);
      setText(f.n, t(f.w.kind === "account" ? "{n} accounts" : "{n} keys", { n: ms.length }));
      const all = together(f, ms);
      f.li.classList.toggle("rest", all);
      f.wire.classList.toggle("rest", all);
    }
    // a group in the group lights while one it routes to answers; folded,
    // it tells of them together, as a fold does
    for (const s of subs.values()) {
      const ms = [...rows.values()].filter((row) => row.up === s.key || row.up?.startsWith(s.key + ">"));
      if (!s.open) {
        setText(s.n, ""); // observed members are not an enabled-account inventory
        const all = together(s, ms);
        s.li.classList.toggle("rest", all);
        continue;
      }
      setText(s.n, "");
      setText(s.st, "");
      s.li.classList.remove("rest");
      const lit = ms.find((row) => row.li.classList.contains("now")) || ms.find((row) => row.li.classList.contains("on"));
      lightRow(s.li, s.wire, !!lit, ms.some((row) => row.li.classList.contains("now")));
      tint(s.wire, lit?.wire);
    }
    for (const [id, a] of agents) a.wire.classList.toggle("live", busy.has(id));
    flowSoon();
  }

// upstream client.js:2935-2979
  // ---------- the log: how one request was routed ----------

  // the log is drawn again only when what it says changes: it is asked to
  // on every trace update (#308)
  let logR = null, headKey = "", stepsKey = "", stepsFor = "";
   // the request opened to its bodies (renderBodies)
  function renderLog() {
    const r = logR = pinned || cur;
    log.hidden = !r;
    if (!r) return;
    const on = () => listed().filter((x) => x.id >= logR.id);
    const head = JSON.stringify([document.documentElement.lang, !!rp, pinned?.id, r.id, r.time, r.done, !!pinned && on().length > 1, r.masked?.key, r.masked?.n]);
    if (headKey !== head) {
      headKey = head;
      logHead.replaceChildren(
        el("span", "", rp ? t("How the request at {time} was routed", { time: clock(r.time) })
          : pinned ? t("How the request at {time} was routed", { time: clock(r.time) }) : t("How the last request was routed")));
      // what masking kept from the vendor, its record a click away
      // Raw privacy/body record viewers excluded.
      logHead.append(el("span", "grow"));
      if (!rp && r.done) {
        // Usage/body viewers are outside this extracted upper block.
        const again = el("button", "text", t("Replay"));
        again.onclick = () => replay([logR], pinned);
        logHead.append(again);
        // and on from it: the requests listed after it, as they came
        if (pinned && on().length > 1) {
          const from = el("button", "text", t("Replay from here"));
          from.onclick = () => replay(on(), pinned);
          logHead.append(from);
        }
      }
      if (pinned && !rp) {
        const live = el("button", "text", t("Back to live"));
        live.onclick = () => { pinned = null; followListed(); };
        logHead.append(live);
      }
    }

// upstream client.js:2980-2981
    renderSteps(r);
    holdStory();

// upstream client.js:2985-2985
  }

// upstream client.js:3058-3105
  // holdStory keeps the story of the live request, its head and its lines,
  // as tall as the tallest of the last few requests told, at this
  // width: a request under way is told in fewer lines than one answered
  // ("is answering…", then "answered in 4.0 s…" over two lines at a
  // phone's width), and its head gets View usage and Replay, taller than
  // the words, once it is done. So each new request moved the context
  // window under it up and back down (dumplings on Discord: the card
  // jittered on every request). Only the last STORY_HELD told count: one
  // told in many lines (a request handed on from member to member) no
  // longer holds the box that tall for good, and it shrinks back once
  // that many shorter ones have come after it (夜松云 on Discord: the box
  // grew and never shrank back). Each request told counts, answered or
  // under way, at the height it has now: on a busy gateway a request is
  // answered as the next starts, the two come in one trace, and the
  // newest is always under way, so counting only those told answered
  // held the long one for good (shensmart on Discord, a remote magpie in
  // a local browser: the room grew with use). A request picked, a replay
  // or a past day is drawn at its own height. A change of width measures it again at
  // once, as it is then (the list coming in under it can take a
  // scrollbar's width off it before the first live request)
  const STORY_HELD = 3;
  let storyHold = { key: "", told: new Map() }, storyDrawn = "", storyW = 0;
  function holdStory() {
    const follow = !pinned && !rp && !day;
    // the width as the observer below last found it: read here, it laid
    // the whole page out again on each of the story's ten draws a second,
    // half of what the story took with two folds open in WebKit (#3164)
    const w = storyW;
    const key = JSON.stringify([follow, w, document.documentElement.lang]);
    if (key === storyHold.key && storyDrawn === headKey + stepsKey) return;
    if (key !== storyHold.key) storyHold = { key, told: new Map() };
    storyDrawn = headKey + stepsKey;
    [logHead, steps].forEach((e) => { e.style.minHeight = ""; });
    if (!follow || !w || !logR) return;
    const hs = [logHead, steps].map((e) => e.getBoundingClientRect().height);
    // a request's own height as told now, kept by its id: the last few only
    storyHold.told.set(logR.id, hs);
    const ids = [...storyHold.told.keys()].sort((x, y) => y - x);
    for (const id of ids.slice(STORY_HELD)) storyHold.told.delete(id);
    [logHead, steps].forEach((e, i) => {
      const held = Math.max(0, ...[...storyHold.told.values()].map((h) => h[i]));
      if (held > hs[i]) e.style.minHeight = held + "px";
    });
  }
  // grown since it was measured (a font come in): measured again as it is
  // and the head's line told again, so it is held from the first width
  // on, not from the second's next telling (a pick before it isn't held)
  new ResizeObserver(() => { storyW = steps.clientWidth; storyDrawn = ""; holdStory(); if (headOf) header(...headOf); }).observe(steps);

// upstream client.js:3216-3338
  // logoed puts the provider's logo before the first account, key or
  // provider a line of the story names, so who it is about reads at a
  // glance (the owner: 这里在前面显示对应的 provider 图标会不会更直观一点)
  const logoOf = (w) => w.icon || w.preset || "generic";
  // A line names an order member, one skipped before it was tried (r.left,
  // #3953: a skipped OpenCode Zen Free's line had no logo, or another
  // member's), or both. Where two share the name at the same place (a key
  // called "API key" on two providers), the member the line is about wins,
  // then an order member over a skipped one.
  function logoed(s, r, about) {
    const word = /[A-Za-z0-9_]/;
    let hit = null;
    for (const w of new Set([about, ...r.order, ...(r.left || [])].filter(Boolean))) {
      for (const n of new Set([who(w), w.name].filter(Boolean))) {
        for (let i = s.indexOf(n); i >= 0; i = s.indexOf(n, i + 1)) {
          if (word.test(s[i - 1] || "") || word.test(s[i + n.length] || "")) continue;
          if (!hit || i < hit.i || (i === hit.i && n.length > hit.n.length)) hit = { i, n, w };
          break;
        }
      }
    }
    if (!hit) return [s];
    const name = el("span", "rt-named");
    name.append(icon(logoOf(hit.w)), hit.n);
    return [s.slice(0, hit.i), name, s.slice(hit.i + hit.n.length)].filter((x) => x !== "");
  }

  function renderSteps(r) {
    const items = [];
    const main = r.order.find((x) => !x.fallback);
    items.push([r.group
      ? t("{agent} asked for the routing group {name}: {members}", { agent: agentName(r.agent), name: r.group.name, members: treeText(r.group) })
      : main && main.model !== r.model && wentOn(r) === r.model
      ? t("{agent} asked for {model}: {name} serves it, and the vendor is asked for {sent}", { agent: agentName(r.agent), model: r.model, name: main.name, sent: main.model })
      : t("{agent} asked for {model}", { agent: agentName(r.agent), model: r.model }) + " → " + (main?.name || r.provider), ""]);
    if (tagKind(r)) items.push([kindWhy(r), "aside kind"]);
    else if (r.subagent) items.push([subagentWhy(r), "aside"]);
    if (movedSays(r)) items.push([movedWhy(r), tagKind(r) ? "aside" : "aside stood"]);
    if (r.subagentEffort) items.push([t("The subagent effort set in magpie is {effort}; the model's supported levels and a routing group's fixed member effort still apply.", { effort: t(r.subagentEffort) }), "aside"]);
    if (r.sealedTask) items.push([t(r.group
      ? "This subagent task is encrypted. Only ChatGPT accounts can read it; other providers (such as Claude) are excluded regardless of quota."
      : "This subagent task is encrypted. Only ChatGPT accounts can read it."), "aside"]);
    items.push([affWhy(r, true) || ruleWhy(r, true) || firstWhy(r), "why"]);
    for (const s of nestedWhy(r)) items.push([s, "why"]);
    // the member a line is about, where it is one: a skipped one's line, a try's
    const skipped = new Map((r.left || []).map((x) => [leftWhy(x), x]));
    for (const a of asides(r)) items.push([a, "aside", undefined, skipped.get(a)]);
    r.tries.forEach((tr, i) => {
      items.push([tryWhy(r, i), tr.done ? (tryOk(tr) ? "ok" : "bad") : "wait", undefined, tried(r, tr)]);
      // where its time went, once it is done: the first try's has the
      // request's masking before it
      const timed = i === 0 && r.masking > 0 ? { ...tr, masking: r.masking } : tr;
      const when = tr.done && timeSaid(timed);
      if (when) items.push([when, "aside time", timed]);
      // a plugin or Claude Code sent it, out of magpie's sight: said, so
      // its missing split doesn't read as a request that lost it (lute)
      if (tr.done && !tr.net && tryOk(tr) && SENT_BY[tr.sentBy]) items.push([t(SENT_BY[tr.sentBy]), "aside"]);
      // each model Copilot's Auto picked for it, where from, and whether
      // Copilot refused it, on which API and with Auto's session token or
      // without (#256)
      for (const p of tr.auto || []) {
        let s = t("Copilot's Auto picked {model} ({via})", { model: p.model, via: p.via === "fallback" ? t("the model the account may pick by hand") : p.via });
        if (p.skipped) s += " · " + t("not from /auto: {why}", { why: p.skipped });
        if (p.api) s += " · " + t(p.session ? "sent to {api} with Auto's session token" : "sent to {api}", { api: p.api });
        if (p.refused) s += " · " + t("Copilot refused it: {error}", { error: p.refused });
        items.push([s, "aside"]);
      }
      // what the vendor said, word for word: the why above is magpie's reading of it
      if (tr.done && !tryOk(tr) && tr.error) {
        const hint = HINTS.find((h) => tr.error.endsWith(" — " + h));
        const said = hint ? tr.error.slice(0, -(hint.length + 3)) : tr.error;
        items.push([t("It said: {error}", { error: said.length > 600 ? said.slice(0, 600) + "…" : said }), "aside said"]);
        if (hint) items.push([t(hint), "aside"]);
      }
      // the reply said another model answered it
      if (tr.done && tryOk(tr) && tr.swapped) items.push([swapWhy(tr), "swap", tr]);
      // another magpie's routing group named the member it routed to
      else if (tr.done && tryOk(tr) && tr.routed) items.push([routedWhy(tr), "aside", tr]);
      if (tr.done && tryOk(tr) && tr.upstream) items.push([upstreamWhy(tr), "aside upstream-said", tr]);
    });
    if (r.done && !r.tries.length) items.push([t("Nothing was tried: {error}", { error: r.error || r.status || t("Outcome unavailable") }), "bad"]);
    // one magpie held too long before routing it was stopped, and what
    // held it saved to a report (the app's log goes only to stderr, which
    // its user can't reach): its line copies it. Its name rides as the
    // line's model, so another held request's line is drawn anew.
    // Report paths and report actions are not collected.
    const aboutKey = (w) => w ? seat(w) : "";
    const logos = [...r.order, ...(r.left || [])].map(logoOf);
    const key = JSON.stringify([tagKind(r), items.map(([s, c, tr, w]) => [s, c, tr?.model, tr?.served, aboutKey(w)]), logos]);
    // a different request starts its steps at the top, even when they say
    // what the last one's said (the box is routing.css's, #3764); the same
    // request keeps its scroll while its steps grow
    if (stepsFor !== r.id) { steps.scrollTop = 0; stepsFor = r.id; }
    if (stepsKey === key) return;
    stepsKey = key;
    // A line that says the same stays the very node it was, and a new line
    // takes its logo from one going: a logo made afresh loads its picture
    // again and, in WebKit, blinks out for a frame, and the story is drawn
    // again on every request that comes in and at each of its steps, so
    // with an agent at work every logo in it blinked on and off
    const was = new Map([...steps.children].map((li) => [li.dataset.k, li]));
    const lis = items.map(([s, c, tr, w]) => {
      const k = JSON.stringify([tagKind(r), s, c, tr?.model, tr?.served, aboutKey(w), logos]);
      const old = was.get(k);
      if (old) { was.delete(k); return { li: old }; }
      return { k, s, c, tr, w };
    });
    keepIcons(...was.values());
    replaceKeeping(steps, lis.map((x) => {
      if (x.li) return x.li;
      const { k, s, c, tr, w } = x;
      const li = el("li", c);
      li.dataset.k = k;
      li.append(...(/^(why|ok|bad|wait|aside)$/.test(c) ? logoed(s, r, w) : [s]));
      if (c === "aside kind") li.prepend(kindTag(r), " ");
      if (c === "aside stood") li.prepend(movedTag(r), " ");
      if (c === "swap") li.prepend(swapTag(tr), " ");
      if (c === "aside time") li.replaceChildren(timeElement(tr));

      return li;
    }));
    keptIcons = null;
  }

// upstream client.js:3358-3370
  // pick sets the stage to a past request, or back to live with the newest.
  // The page stays where it is: a request clicked in the list stays under
  // the pointer, and the stage and its story change above it (it used to
  // go up to the stage, which read as the page jumping to its top)
  function pick(r) {
    pinned = !day && r.id === newest()?.id ? null : r;
    awayAt = 0;
    if (rp) { rp = null; rbar.hidden = true; }
    stopPlays();
    cur = r;
    sync(true); renderAll();
    say(affWhy(r, true) || ruleWhy(r, true) || firstWhy(r));
  }

// upstream client.js:3395-3601
  // what a call was for when it isn't a turn of the conversation, as
  // Codex names it (x-openai-subagent): its own guardian review of an
  // approval, a thread's title, memories… — each on the model Codex picks
  // for it, so a list of Luna calls under a Sol composer reads as it is.
  // A web search is magpie's own, run for a model that can't search on the
  // model it searches with (a DeepSeek chat showing GPT calls, #314)
  const knownKind = (k) => Object.hasOwn(REQUEST_KINDS, k) ? REQUEST_KINDS[k] : null;
  const kindName = (k) => knownKind(k) ? t(knownKind(k).name) : k;
  window.kindName = kindName; // the Usage page's Requests say it too (#714)
  // The catalog is generated from usage.PurposeKinds; unknown names stay literal.
  const purposeOf = (kind) => !kind ? "unmarked" : knownKind(kind)?.purpose || "kind:" + kind;
  const purposeOptions = (ids, selected) => [...new Set([...ids, ...(selected ? [selected] : [])])].sort().map((id) => {
    const kind = id.slice(5);
    return { v: id, name: id === "unmarked" ? t("Unmarked") : kindName(kind), note: id === "unmarked"
      ? t("No purpose was recorded; this may be a conversation turn or an older record.")
      : knownKind(kind) ? "" : t("Unrecognized request purpose") };
  });
  window.purposeOf = purposeOf;
  window.purposeOptions = purposeOptions;
  // a Claude Code subagent's turn, Desktop's or a terminal's, names no kind
  // (Route.SubagentID): it is tagged and told as Codex's subagents are, its
  // purpose left unmarked as the ledger keeps it
  const tagKind = (r) => r.kind || (r.subagentId ? "collab_spawn" : "");
  function kindTag(r) {
    const k = el("span", "kind", kindName(tagKind(r)));
    k.title = kindWhy(r);
    return k;
  }
  // a try whose reply said another model answered than the one it asked
  // for: a vendor serving a cheaper model in its place, which only the
  // reply's model field tells (its dated name is the same model)
  function swapTag(tr, short) {
    const route = clineRoute(tr);
    const k = el("span", "swap", short ? t(route ? "ClinePass route {served}" : "served {served}", { served: tr.served })
      : t(route ? "requested {sent} · ClinePass route {served}" : "requested {sent} · served {served}", { sent: tr.model, served: tr.served }));
    k.title = swapWhy(tr);
    return k;
  }
  // ClinePass names a reply by the route it picked (its VMC,
  // vmc/deepseek-v4p1-flash-1017-contributor-fallbacks), not by a model:
  // such a reply is said as its route, with what was asked of it and
  // whether it said who answered (zRain on Discord, 10-24). pin is the
  // provider the try asked for; a Usage row doesn't keep it (pinUnknown).
  const clineRoute = (tr) => /^vmc\//.test(tr.served || "") && /(^|\/)cline-pass\//.test(tr.model || "");
  function swapWhy(tr, o = {}) {
    if (!clineRoute(tr)) return t("The vendor was asked for {sent}, but its reply says {served} answered: likely another model. The same model under a dated name or spelled otherwise isn't marked.", { sent: tr.model, served: tr.served });
    const s = t("ClinePass answered {sent} through {served}, a route it picks itself: the name is the route's, not another model's.", { sent: tr.model, served: tr.served });
    if (tr.upstream) return s + " " + t("Its reply says {upstream} answered.", { upstream: tr.upstream });
    if (o.pinUnknown) return s + " " + t("Its reply didn't say which provider answered.");
    if (tr.pin) return s + " " + t("{pin} was asked for, but its reply didn't say which provider answered, so whether ClinePass kept to it is unknown.", { pin: tr.pin });
    const tick = /(^|\/)cline-pass\/(deepseek|glm)/i.test(tr.model) ? " " + t("To ask for the maker's own API, tick “{tick}” in the provider's settings.", { tick: t("DeepSeek and GLM models only from their makers' own APIs") }) : "";
    return s + " " + t("No provider was asked for, and its reply didn't say which one answered.") + tick;
  }
  window.swapWhy = swapWhy; // the Usage page's Requests say it too
  // a try that asked a remote magpie for one of its routing groups: the
  // reply names the member the group routed to, which is the group
  // picking, not a swap — shown plain, as a model that answered
  
  const routedWhy = (tr) => t("{sent} is a routing group of the remote magpie, and it routed the request to {served}: the group picking one of its models, not the vendor swapping the model.", { sent: tr.model, served: tr.served });
  window.routedWhy = routedWhy;
  // the provider an aggregator (OpenRouter …) said answered behind it:
  // DeepInfra, Novita… (leslie_luo on Discord)
  
  const upstreamWhy = (tr) => t("The aggregator passed the request on to {upstream}, as its reply says: the provider that actually answered it.", { upstream: tr.upstream });
  // the model set for an agent's subagents in place of the lead's pick,
  // or why the lead's pick stood
  function subagentWhy(r) {
    const agent = agentName(r.agent);
    const said = { agent, model: r.subagent.asked, to: r.subagent.to, why: r.subagent.kept ? t(r.subagent.kept) : "" };
    // set to follow the lead (cleverpigo on X): To is the lead's model
    if (r.subagent.lead) return r.subagent.kept
      ? t("{agent} requested a subagent on {model} and it stayed there: its subagents follow their lead, on {to}, but {why}.", said)
      : t("{agent} requested a subagent on {model}; magpie put it on {to}, the model its lead is on.", said);
    return r.subagent.kept
      ? t("{agent} requested a subagent on {model} and it stayed there: its subagents are set to {to}, but {why}.", said)
      : t("{agent} requested a subagent on {model}; magpie put it on {to}, the model set for its subagents.", said);
  }
  // a request a stand-in of magpie's put on another model than it named
  // (Route.Moved): why, on its row's tag, its title and its story. Neo on
  // Discord read "chatflowsai/claude-opus-5-5 → AgentRouter · gpt-6.1-sol"
  // as magpie swapping the model, where it was Claude Desktop's title, on
  // a model Desktop picked itself, kept on the chat's model
  // Desktop's connection check says where it went in its own story
  // (kindWhy), so its move isn't said again
  function movedSays(r) { return !!r.moved && r.kind !== "connection_check"; }
  function movedWhy(r) {
    const agent = agentName(r.agent), v = { agent, model: r.model, to: r.moved.to };
    switch (r.moved.why) {
      case "desktop-title": return t("{agent} picked {model} by itself for a short request without tools, such as a chat's title; magpie served it on {to}, the model of its latest chat turn, so it stays with the provider the chat is on.", v);
      case "desktop-title-first": return t("{agent} picked {model} by itself for a short request without tools, such as a chat's title; magpie served it on {to}, the first model it lists, as it has had no chat turn yet.", v);
      case "desktop-gone": return t("{agent} asked for {model}, which magpie doesn't serve; magpie served it on {to}, the model of its latest chat turn.", v);
      case "desktop-gone-first": return t("{agent} asked for {model}, which magpie doesn't serve; magpie served it on {to}, the first model it lists.", v);
      case "desktop-tier": return t("Claude Code in {agent} asked for {model}, its own id for a Claude tier; magpie served it on {to}, the model picked for that tier.", v);
      case "desktop-beside": return t("Claude Code in {agent} asked for {model} for a call of its own; magpie served it on {to}, that tier's model on the provider the chat is on.", v);
      case "desktop-aside": return t("Claude Code in {agent} asked for {model} for a call of its own; magpie served it on {to}, the chat's model, so it stays with the provider the chat is on.", v);
      case "classifier": return t("{agent}'s auto mode classifier asked for {model}; magpie served it on {to}, the model /model moved its tier to.", v);
      case "claude-tier": return t("{agent} asked for {model} by Claude's full id; magpie served it on {to}, the model set for that tier.", v);
      case "stand-in": return t("{agent} asked for {model}, which magpie doesn't serve; magpie served it on {to}, the model its config names.", v);
      case "codex-turn": return t("{agent} asked for {model} for a call of its own, which magpie doesn't serve; magpie served it on {to}, the model its last turn was answered on.", v);
      case "privacy": return t("Masking would have changed this request, so magpie sent it as written to {to}, the model set for that in Settings › Privacy.", v);
      default: return t("magpie served it on {to} in place of {model}.", v);
    }
  }
  function movedTag(r) {
    const why = r.moved.why;
    const k = el("span", "kind stood", /^desktop-title/.test(why) ? kindName("title") : t("Stand-in"));
    k.title = movedWhy(r);
    return k;
  }
  // the tag a request's row has: what the call was for, else why magpie
  // put it on another model
  const rowTags = (r) => tagKind(r) ? [kindTag(r)] : movedSays(r) ? [movedTag(r)] : [];
  function kindWhy(r) {
    const agent = agentName(r.agent);
    if (purposeOf(tagKind(r)) === "kind:collab_spawn" && r.subagent) return subagentWhy(r);
    if (purposeOf(tagKind(r)) === "kind:collab_spawn") return r.group
      ? t("{agent} requested a subagent; magpie selects its model within this routing group.", { agent })
      : t("{agent} requested a subagent on {model}.", { agent, model: r.model });
    if (purposeOf(r.kind) === "kind:ambient_suggestions") return t("{agent} drafted the suggested prompts on its home page by itself, in the background, searching the project's files and connected apps, and checked them for safety. Not a turn of the conversation; Codex's Settings › Configuration › Suggested prompts turns it off.", { agent });
    if (purposeOf(r.kind) === "kind:composer_predictions") return t("{agent} guessed your next message for its composer by itself, reading the whole conversation again. Not a turn of the conversation; Codex composer predictions, under Settings in Codex's row on the Agents page, picks its model, and Codex's Settings › General › Show predictions turns it off.", { agent });
    // Claude Desktop's check that magpie answers names its model itself
    // (cybercaius on Discord: "Desktop requested deepseek-flash" while
    // the chat was on another model)
    if (r.kind === "connection_check") return t("{agent} checked that magpie answers, as it does when it starts and from its Test connection. It names this check's model itself, from the names in its model list ({model}), not the model chosen in the conversation, and only reads whether an answer comes back; magpie sends it to the model chosen in {agent}'s model menu, or to its first listed model when none is. Not a turn of the conversation.", { agent, model: r.model });
    if (r.kind === "luna_reserve") return t("{agent} sent this turn on Luna Reserve, which it turns to once the plan's own allowance is used up; it picks the model itself.", { agent });
    // the searcher asked first failed or found nothing, and this one
    // searched in its place: say which and why, not just who searched
    // (Gearclickist on Discord: Grok picked, Codex's model searched)
    if (r.kind === "web_search" && r.for?.instead) {
      const f = r.for;
      const whom = f.mcp ? t("{agent}'s call to magpie's web_search MCP tool", { agent: agentName(f.agent) })
        : f.model ? t("{agent}'s {model}", { agent: agentName(f.agent), model: f.model })
        : t("a model that can't search the web by itself");
      const why = f.notSearched ? t("it answered without searching the web, so its account or plan may not offer web search") : f.nothingFound ? t("its reply named no page it found") : f.why || t("it failed");
      return f.picked
        ? t("{failed}, the searcher picked in Settings › Models › Web search, didn't search for {whom}: {why}. So magpie had {searcher}, the next searcher it can use, search in its place. Not a turn of the conversation.", { failed: f.instead, whom, why, searcher: r.model })
        : t("{failed}, the searcher magpie picked, didn't search for {whom}: {why}. So magpie had {searcher}, the next searcher it can use, search in its place. Not a turn of the conversation.", { failed: f.instead, whom, why, searcher: r.model });
    }
    // the agent called magpie's web search MCP server itself, for no model
    if (r.kind === "web_search" && r.for?.mcp) return t("{agent} called magpie's web_search MCP tool: {searcher} searched for it. Not a turn of the conversation.", { agent: agentName(r.for.agent), searcher: r.model });
    if (r.kind === "web_search") return r.for
      ? t("magpie ran this web search for {agent}'s {model}, which can't search the web by itself: {searcher} searched, and {model} goes on answering once it has what was found. Not a turn of the conversation.", { agent: agentName(r.for.agent), model: r.for.model, searcher: r.model })
      : t("magpie ran this web search for a model that can't search the web by itself: {searcher} searched, and that model goes on answering once it has what was found. Not a turn of the conversation.", { searcher: r.model });
    // why the model was counted as unable to see, and where the user says
    // otherwise or picks the describer (#1287: a DeepSeek model's images
    // went to Codex's GPT, and nothing said why or where to change it)
    // the Image recognition model the user picked is missing: the one
    // magpie picks described in its place, and the row says so
    // the model asked first couldn't describe the image, and this one
    // did in its place: say which and why (kelvinjason11 on X: one
    // describer failing failed every turn with an image)
    if (r.kind === "vision" && r.for?.instead) {
      const f = r.for;
      const whom = f.mcp ? t("{agent}'s call to magpie's analyze_image MCP tool", { agent: agentName(f.agent) })
        : f.model ? t("{agent}'s {model}", { agent: agentName(f.agent), model: f.model })
        : t("a model that can't see images");
      const why = f.why || t("it failed");
      return f.picked
        ? t("{failed}, the Image recognition model picked in Settings › Models, couldn't describe an image for {whom}: {why}. So magpie had {describer}, the next model it can use that sees, describe it in its place. Not a turn of the conversation.", { failed: f.instead, whom, why, describer: r.model })
        : t("{failed}, the model magpie picked to describe images, couldn't describe an image for {whom}: {why}. So magpie had {describer}, the next model it can use that sees, describe it in its place. Not a turn of the conversation.", { failed: f.instead, whom, why, describer: r.model });
    }
    // the agent called magpie's image recognition MCP server itself
    if (r.kind === "vision" && r.for?.mcp) return t("{agent} called magpie's analyze_image MCP tool: {describer} looked at the image for it. Not a turn of the conversation.", { agent: agentName(r.for.agent), describer: r.model });
    if (r.kind === "vision" && r.for?.missing) return t("{picked}, the Image recognition model picked in Settings, isn't set up any more, so magpie had {describer}, its automatic choice, describe an image for {agent}'s {model} in its place. Pick another in Settings › Models › Image recognition. Not a turn of the conversation.", { picked: r.for.missing, agent: agentName(r.for.agent), model: r.for.model, describer: r.model });
    if (r.kind === "vision" && r.for?.unknown) return t("magpie had {describer} describe an image for {agent}'s {model}: nothing magpie knows says {model} can see images, so it is counted as text-only and given the description in the image's place. If it does see them, tick “Accepts images” for it in its provider's models. Settings › Models › Image recognition picks the model that describes. Not a turn of the conversation.", { agent: agentName(r.for.agent), model: r.for.model, describer: r.model });
    if (r.kind === "vision") return r.for
      ? t("magpie had {describer} describe an image for {agent}'s {model}, which its provider's list or its own setting says takes text only: {model} is given the description in the image's place. Settings › Models › Image recognition picks the model that describes. Not a turn of the conversation.", { agent: agentName(r.for.agent), model: r.for.model, describer: r.model })
      : t("magpie had {describer} describe an image for a model that can't see images, which is given the description in the image's place. Not a turn of the conversation.", { describer: r.model });
    return t("{agent} made this call itself ({kind}), not as a turn of the conversation, and picks its model itself.", { agent, kind: kindName(r.kind) });
  }

  // how a request that wasn't answered ended: its status and its last
  // try's failure, or that its agent left in the pause before the next
  // try (#1894). When the agent was told an earlier try's failure in the
  // last one's place, the route says that one's kind (fail): an
  // earlier 529 overload read "529 · quota used up" beside the last
  // account's usage limit (danzi002 on Discord)
  const endWord = (r, last) => `${r.status} · ${failWord(last.gone ? "canceled" : r.fail || last.fail, (!r.fail || r.fail === last.fail) && last.rest)}`;

  // what a request not yet out at a vendor is doing: being masked
  // (Settings → Privacy, the gateway's "redact" phase), or being routed
  // (fremontdango on Discord: a long request read as routing while it
  // was masked)
  const waitWord = (r) => t(r.phase === "redact" ? "masking…" : "routing…");

  // who answered a request, or what its agent got
  function outcome(r) {
    if (r.done && r.evidence?.reasons?.includes("outcome_unknown")) return [t("Outcome unavailable"), "wait"];
    if (!r.done) {
      const tr = r.tries[r.tries.length - 1], w = tr && tried(r, tr);
      return [w ? t("{who} is answering…", { who: `${who(w)} · ${w.model}` }) : waitWord(r), "wait", tr];
    }
    const ok = r.tries.find((tr) => tr.done && tryOk(tr)), w = ok && tried(r, ok);
    // a 200 whose error is a note of its own — Codex's titles off in
    // Settings, a reply with no title in it — answered: its try has no
    // fail. Bad is a reply that broke off, or every try failing
    if (r.status < 400 && (ok || !r.tries.length)) return [w ? `${who(w)} · ${w.model}` : r.provider, r.tries.length > 1 ? "moved" : "ok", ok];
    const last = r.tries[r.tries.length - 1];
    return [last ? endWord(r, last) : `${r.status || ""} ${r.error || ""}`.trim(), "bad"];
  }

// upstream client.js:3622-3622
  const allListed = () => (day ? past : [...routes.values()]).slice().sort((a, b) => b.id - a.id);

// upstream client.js:3637-3667
  const matchesPurpose = (r) => !purpose.length || purpose.includes(purposeOf(r.kind));
  const listed = () => allListed().filter(matchesPurpose);
  // Match the rows and story: a broken-off 200 fails, an informational note
  // on an answered request (such as Codex titles being off) does not.
  const failedRoute = (r) => r.done && outcome(r)[1] === "bad";
  function renderStats(rs) {
    const scoped = !!(day || purpose.length), done = rs.filter((r) => r.done);
    const counts = scoped ? {
      requests: done.length,
      rerouted: done.reduce((n, r) => n + r.tries.filter((tr, i) => tr.rest && i < r.tries.length - 1).length, 0),
      errors: done.filter(failedRoute).length,
    } : traceTotals;
    [counts.requests, counts.rerouted, counts.errors].forEach((n, i) => { setText(statB[i], typeof n === "number" ? fmtN(n) : "—"); setAttr(statB[i], "title", typeof n === "number" ? exactN(n) : ""); });
    setAttr(stats, "title", t(scoped ? "Counts for the requests in this list" : "Counts since the gateway started"));
    const failed = rs.some(failedRoute), btn = statB[2].parentElement;
    setAttr(btn, "aria-disabled", String(!failed));
    setAttr(btn, "title", t(failed ? "Show the latest request that failed" : "No failed request in this list"));
  }
  // Follow the newest matching request unless the reader picked one still in
  // this list. Stop old flights before the scope changes, including replays.
  function followListed() {
    if (rp) endReplay(true);
    stopPlays();
    if (pinned && !listed().some((r) => r.id === pinned.id)) pinned = null;
    cur = pinned || newest();
    if (day) pinned = cur;
    capQ = [];
    if (cur) { sync(true); say(affWhy(cur, true) || ruleWhy(cur, true) || firstWhy(cur)); }
    else empty();
    renderAll();
  }

// upstream client.js:4072-4078
  function liveParts(r, now = Date.now()) {
    if (r.done || !r.bytes) return [];
    const parts = [[liveSize(r.bytes), t("How much of this reply has reached the client, framing included")]];
    if (r.estTok) parts.push([liveTokens(r), t("What the words written so far are worth in output tokens, learned per provider and model")]);
    if (r.contentAt) parts.push([liveSince(r, now), t("How long ago the model last wrote something. A quiet reply is not a failed one")]);
    return parts;
  }

// upstream client.js:4806-5251
  // renderAll redraws once a frame, however many trace updates and plays
  // asked for it in between (#308), and not at all while nobody sees the
  // page: coming back into sight redraws it (see resume)
  let drawing = 0;
  function renderAll() { if (!drawing) drawing = requestAnimationFrame(drawAll); }
  function drawAll() {
    drawing = 0;
    if (!shown()) return;
    render(); renderLog(); renderStats(listed());
  }
  const newest = () => (day ? past : [...routes.values()]).filter(matchesPurpose).reduce((a, b) => (!a || b.id > a.id ? b : a), null);
  // told: the request the live card tells of. Following the newest, with
  // several agents or conversations sending at once, the card jumped from
  // one to the next on every update, and to "not routed yet" for each new
  // one (qiang2040 on Discord: "狂闪"). It stays on the request it tells
  // of until that one is done, and a newer one routing hasn't picked for
  // yet doesn't take it from one that was routed.
  function told() {
    const n = newest(), c = cur && !day && routes.get(cur.id);
    if (!c || !n || c.id === n.id || !matchesPurpose(c)) return n;
    if (!c.done) return c;
    return n.done || n.tries.length || !c.tries.length ? n : c;
  }

  // ---------- playing a request ----------

  const flying = new Map(); // packet → { id: the row it is at, agent, sourceKey }

  // A magpie, drawn to fly: facing right, the dot it carries at the tip
  // of its beak where the flight puts it; its wings beat from the shoulder.
  const FLIER = '<g class="rt-lift"><g transform="scale(1.2) translate(-6.5 3.2)">'
    + '<path class="wing far" d="M-14.5 -3.4C-16.5 -9.5 -14.2 -15 -8.6 -18.6C-9.4 -12.6 -9.6 -7.4 -9.2 -3.2Z"/>'
    + '<path class="tail" d="M-31.5 3.1L-18.6 -1.8L-17.4 1.2L-30.8 4.6Z"/>'
    + '<ellipse class="body" cx="-12.2" cy="-1.4" rx="7.6" ry="3.9"/>'
    + '<ellipse class="belly" cx="-12.8" cy="0.4" rx="4.3" ry="1.6"/>'
    + '<circle class="body" cx="-4.9" cy="-3.7" r="3.1"/>'
    + '<path class="body" d="M-2.3 -4.8L1.4 -3.3L-2.3 -2.2Z"/>'
    + '<g class="wing near"><path d="M-15.6 -3.2C-17.8 -10.2 -15.2 -16.4 -8.4 -20.4C-9.3 -13.6 -9.4 -7.8 -8.8 -2.8Z"/>'
    + '<path class="bar" d="M-14.6 -5.6C-15.4 -10.4 -13.8 -14.4 -10.4 -17.2"/></g>'
    + "</g></g>";

  function bird(kind) {
    if (still() || !shown()) return null;
    const g = document.createElementNS(NS, "g");
    g.setAttribute("class", "rt-flier " + kind);
    g.innerHTML = FLIER;
    sky.appendChild(g);
    return g;
  }
  // off it goes, up and away, once it has let go of the dot
  function away(b) {
    if (!b) return;
    b.classList.add("away");
    setTimeout(() => b.remove(), 450);
  }
  function packet() {
    const dot = document.createElementNS(NS, "circle");
    dot.setAttribute("r", 4.5);
    dot.setAttribute("class", "pkt");
    dot.setAttribute("visibility", "hidden"); // until a flight puts it somewhere
    sky.appendChild(dot);
    return dot;
  }

  // play: one magpie carries the request from the agent through magpie to
  // who routing put first, and lets it go there while it answers; another
  // picks up the answer and brings it back — a failure only as far as
  // magpie, where the first takes the request on to the next.
  async function play(id, synced) {
    const routes = src(); // a replay's, if it is one
    let r = routes.get(id);
    const g = gen;
    playing.set(id, g);
    // live, it flies, and the card stays on the request it tells of
    cur = rp ? r : told() || r;
    if (!synced) sync();
    if (cur.id === r.id) {
      say(affWhy(r, true) || ruleWhy(r, true) || firstWhy(r));
      const aside = asides(r).find((s) => s);
      if (aside) say(aside, true);
    }
    renderAll();
    const A = agents.get(sourceKey(r));
    // an agent past the stage's four (staged) isn't drawn: its request is
    // listed, not flown
    if (!A) {
      if (playing.get(id) === g) playing.delete(id);
      return;
    }
    const dot = packet();
    dot.style.setProperty("--agent", hueOf(r.agent));
    // from: where in magpie the dot is, once it is — the way it came in
    let carrier = bird("req"), from = null, back = null;
    // rt: the route as the gateway has it now — or, dropped from what it
    // keeps, as it was last, over
    const rt = () => routes.get(id) || { ...r, done: true, tries: r.tries.map((x) => ({ ...x, done: true })) };
    try {
      tick(A.node);
      if (!r.tries.length) { // routing hasn't picked yet: to magpie, to wait there
        await fly(dot, carrier, [{ p: A.wire }], 620);
        from = tip(A.wire, true);
        tick(hub);
      }
      for (let i = 0; g === gen; ) {
        r = rt();
        if (!routes.has(id)) break;
        if (i >= r.tries.length) {
          if (r.done) break;
          await until(() => g !== gen || rt().tries.length > i || rt().done);
          continue;
        }
        const row = shownRow(tryseat(r, r.tries[i])); // a folded key's fold
        if (!row) { i++; continue; }
        flying.set(dot, { id: tryseat(r, r.tries[i]), agent: r.agent, sourceKey: sourceKey(r) });
        if (!carrier) carrier = bird("req");
        if (from) tick(hub);
        const ws = wiresTo(row);
        const out = [via(from || tip(A.wire, true), tip(ws[0], false)), ...ws.map((p) => ({ p }))];
        await fly(dot, carrier, from ? out : [{ p: A.wire }, ...out], from ? 900 : 1400);
        if (g !== gen) break;
        // let go at the account: it waits there while it answers
        away(carrier);
        carrier = null;
        dot.classList.add("held");
        holds.set(dot, row);
        holdAll();
        await until(() => g !== gen || rt().tries[i].done);
        holds.delete(dot);
        if (g !== gen) break;
        r = rt();
        if (!routes.has(id)) break;
        const tr = r.tries[i];
        dot.classList.remove("held");
        if (tryOk(tr)) {
          // the reply's tokens are counted once the route is done
          await until(() => g !== gen || rt().done);
          if (g !== gen) break;
          r = rt();
          say(tryWhy(r, i), true);
          renderAll();
          dot.classList.add("back");
          dot.setAttribute("r", 4);
          back = bird("res");
          await fly(dot, back, home(row, A), 1400);
          flying.delete(dot);
          away(back);
          tick(A.node);
          break;
        }
        // the tag stands over the row's top edge, so the row is drawn whole
        // (lift, routing.css) while it shows and as it fades: the shake's
        // .hit ends at .45s, and with it the tag's top was cut for the rest
        // of its 1.8s (yuancjun on Discord). A failure again on the row
        // starts the 1.8s over
        rerun(row.li, "hit", "rthit"); row.li.classList.add("tagged", "lift");
        row.tg.textContent = `${tr.status} · ${failWord(tr.fail, tr.rest)}`;
        clearTimeout(tagFor.get(row.li));
        tagFor.set(row.li, setTimeout(() => {
          row.li.classList.remove("tagged");
          tagFor.set(row.li, setTimeout(() => row.li.classList.remove("lift"), 300));
        }, 1800));
        say(tryWhy(r, i));
        renderAll();
        dot.classList.add("back", "err");
        back = bird("res");
        if (!tr.rest && !tr.credits && (!tr.again || tr.gone)) { // that was the answer: the agent gets the error, or has gone
          await fly(dot, back, home(row, A), 1350);
          flying.delete(dot);
          away(back);
          tick(A.node);
          break;
        }
        // back to magpie, which hands the request on to the next
        await fly(dot, back, [...ws].reverse().map((p) => ({ p, rev: true })), 620);
        flying.delete(dot);
        away(back);
        dot.classList.remove("back", "err");
        from = tip(ws[0], false, true);
        i++;
      }
    } finally { // however it ended, nothing of it stays behind
      away(carrier);
      away(back);
      flying.delete(dot);
      holds.delete(dot);
      dot.remove();
      if (playing.get(id) === g) playing.delete(id);
      renderAll();
    }
  }

  // home: from an account back through magpie to the agent
  const home = (row, A) => {
    const ws = wiresTo(row);
    return [...[...ws].reverse().map((p) => ({ p, rev: true })), via(tip(ws[0], false, true), tip(A.wire, true, true)), { p: A.wire, rev: true }];
  };

  // stopPlays ends whatever is flying: each play sees its gen gone and
  // clears up after itself
  function stopPlays() {
    gen++; flying.clear(); holds.clear(); playing.clear();
    for (const p of sky.querySelectorAll(".pkt, .rt-flier")) p.remove();
    wake();
  }

  // ---------- replay ----------

  // replay plays kept requests again as they happened, from the trace the
  // gateway kept: each at its time, each try as long as it took, and the
  // stage — every agent, account, rest and sentence — as it was then. A
  // wait longer than GAP is cut to GAP, so a minute's answer or a quiet
  // hour doesn't hold it up; the clock over the stage still tells the time
  // it is replaying, running fast through what was cut.
  const GAP = 1800, LEAD = 500;
  const ends = (r) => Math.max(at(r.time) + (r.ms || 0), ...r.tries.map((tr) => at(tr.start) + (tr.ms || 0)));
  function replay(list, back) {
    list = list.filter((r) => r.done).sort((a, b) => a.id - b.id);
    if (!list.length) return;
    const all = [];
    for (const r of list) { all.push(at(r.time), ends(r)); for (const tr of r.tries) all.push(at(tr.start), at(tr.start) + (tr.ms || 0)); }
    const ts = [...new Set(all)].sort((a, b) => a - b), vs = [];
    let v = 0;
    ts.forEach((x, i) => { if (i) v += Math.min(x - ts[i - 1], GAP); vs.push(v); });
    const vOf = (x) => vs[ts.indexOf(x)];
    const plan = list.map((r, i) => ({ r, n: i + 1, s: vOf(at(r.time)), e: vOf(ends(r)),
      tries: r.tries.map((tr) => ({ s: vOf(at(tr.start)), e: vOf(at(tr.start) + (tr.ms || 0)) })) }));
    const speed = rp?.speed || 1;
    rp = null; // the old one, if one was playing, stops here
    stopPlays();
    pinned = null;
    rp = { routes: new Map(), plan, ts, vs, v: -LEAD, total: v, speed, back: back || null, t: performance.now(), real: ts[0] - LEAD };
    rTrack.replaceChildren(rHead, ...plan.map((g) => {
      const m = el("i", "rp-mark");
      m.style.left = (g.s / (v || 1)) * 100 + "%";
      m.style.setProperty("--agent", hueOf(g.r.agent));
      m.title = `${clock(g.r.time)} · ${agentName(g.r.agent)} · ${g.r.model}`;
      g.mark = m;
      return m;
    }));
    rbar.hidden = false;
    renderAll();
    requestAnimationFrame(step);
  }
  // ghost is a request as it was v into the replay
  function ghost(g, v) {
    const tries = [];
    g.r.tries.forEach((tr, i) => {
      const x = g.tries[i];
      if (x.s <= v) tries.push(x.e <= v ? tr : { ...tr, done: false, status: 0, rest: null, again: false });
    });
    return { ...g.r, tries, done: g.e <= v };
  }
  // realAt is the time it was v into the replay, and how much faster than
  // time it runs there
  function realAt(p, v) {
    const { ts, vs } = p;
    if (v <= 0) return [ts[0] + v, 1];
    for (let k = 1; k < ts.length; k++) {
      if (v > vs[k]) continue;
      const dv = vs[k] - vs[k - 1], dt = ts[k] - ts[k - 1];
      return [dv ? ts[k - 1] + (v - vs[k - 1]) * dt / dv : ts[k], dv ? dt / dv : 1];
    }
    return [ts[ts.length - 1], 1];
  }
  const same = (a, b) => a.done === b.done && a.tries.length === b.tries.length && a.tries.every((x, i) => x.done === b.tries[i].done);
  function step(ts) {
    const p = rp;
    if (!p) return;
    p.v += Math.min(ts - p.t, 250) * p.speed; // a replay out of sight waits
    p.t = ts;
    let fast;
    [p.real, fast] = realAt(p, p.v);
    let moved = false;
    for (const g of p.plan) {
      if (g.s > p.v) continue;
      const was = p.routes.get(g.r.id), is = ghost(g, p.v);
      if (was && same(was, is)) continue;
      p.routes.set(g.r.id, is);
      moved = true;
      if (!was) play(g.r.id);
    }
    wake();
    // as the gateway's own trace would: a try begun or ended shows at once
    if (moved) { if (cur && p.routes.has(cur.id)) cur = p.routes.get(cur.id); renderAll(); }
    replayBar(p, fast);
    if (p.v > p.total && !playing.size) { endReplay(); return; }
    requestAnimationFrame(step);
  }
  function replayBar(p, fast) {
    const d = new Date(p.real);
    rClock.textContent = d.toLocaleTimeString(intlLang(), { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false }) + "." + Math.floor(d.getMilliseconds() / 100);
    const day = d.toDateString() === new Date().toDateString() ? t("today") : d.toLocaleDateString(intlLang(), { weekday: "short", month: "short", day: "numeric" });
    setText(rDay, day);
    // a quiet stretch cut short: the clock runs fast through it, whatever
    // the speed picked
    const skip = fast > 1.5 ? t("skipping a quiet stretch · clock {n}×", { n: Math.round(fast) }) : "";
    // written only when it changes: WebKit sends no click to a button whose
    // text was replaced between the press and the release, and this runs
    // every frame, so Stop and the speed did nothing when clicked
    setText(rSkip, skip);
    setText(rSpeed, t("{n}× speed", { n: p.speed }));
    setText(rStop, t("Stop replay"));
    setText(rTop.firstChild, t("Replaying"));
    rHead.style.left = Math.max(0, Math.min(100, (p.v / (p.total || 1)) * 100)) + "%";
    // the requests in flight at this moment of the replay, else the last one
    const on = p.plan.filter((g) => playing.has(g.r.id) || (p.routes.has(g.r.id) && !p.routes.get(g.r.id).done));
    const shown_ = on.length ? on : p.plan.filter((g) => p.routes.has(g.r.id)).slice(-1);
    for (const g of p.plan) g.mark.classList.toggle("on", on.includes(g));
    const key = shown_.map((g) => g.r.id + ":" + p.routes.get(g.r.id)?.tries.length + ":" + p.routes.get(g.r.id)?.done).join(",") + (shown_.length ? "" : "-");
    if (rWhat.dataset.key === key) return;
    rWhat.dataset.key = key;
    rWhat.replaceChildren(...(shown_.length ? shown_.map((g) => {
      const r = p.routes.get(g.r.id) || g.r, row = el("div", "rp-req" + (on.includes(g) ? " on" : ""));
      const sw = el("i", "ag");
      sw.style.setProperty("--agent", hueOf(r.agent));
      const [said] = outcome(r);
      row.append(el("span", "rp-n", t("request {i} of {n}", { i: g.n, n: p.plan.length })), sw,
        el("b", "", agentName(r.agent)), el("code", "mdl", r.model), ...rowTags(r), el("span", "rp-to", "→ " + said),
        el("span", "rp-at", t("sent {time}", { time: new Date(r.time).toLocaleTimeString(intlLang(), { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false }) })));
      row.onclick = () => { cur = r; renderLog(); };
      return row;
    }) : [el("span", "rp-wait", t("starting…"))]));
  }
  // seek plays the replay on from where on its track was clicked
  function seek(frac) {
    const p = rp;
    if (!p) return;
    const v = Math.max(0, Math.min(1, frac)) * p.total;
    stopPlays(); // the flights end; the replay goes on
    p.v = v; p.t = performance.now(); p.routes.clear();
    for (const g of p.plan) if (g.s <= v) p.routes.set(g.r.id, ghost(g, v));
    // one in flight there flies on from where it was; the rest are done
    for (const g of p.plan) if (p.routes.has(g.r.id) && !p.routes.get(g.r.id).done) play(g.r.id);
    const last = [...p.routes.values()].pop();
    if (last) { cur = last; sync(true); }
    rWhat.dataset.key = "";
    renderAll();
  }
  function endReplay(stop) {
    const p = rp;
    if (!p) return;
    rp = null;
    rbar.hidden = true;
    if (stop) stopPlays();
    const b = p.back && (routes.get(p.back.id) || (day && past.find((x) => x.id === p.back.id)));
    pinned = b || null;
    cur = b || newest();
    if (cur) { sync(true); renderAll(); }
    else empty();
  }
  rSpeed.onclick = () => { if (rp) { rp.speed = rp.speed >= 8 ? 1 : rp.speed * 2; replayBar(rp, 1); } };
  rStop.onclick = () => endReplay(true);
  rTrack.onclick = (e) => { const b = rTrack.getBoundingClientRect(); seek((e.clientX - b.left) / b.width); };

  // ---------- the loop ----------

  // pose puts a flight's dot e of the way along, and its magpie with it,
  // heading the way it flies — turned about to fly left, tilted no more
  // than a bird banks
  function pose(tr, e) {
    for (const l of tr.legs) if (l.j) l.j();
    const lens = tr.legs.map((l) => pathLength(l.p));
    const total = lens.reduce((a, b) => a + b, 0);
    const point = (d) => {
      d = Math.max(0, Math.min(total, d));
      let i = 0;
      // a leg not laid out has nowhere to be on: passed over
      while (i < lens.length - 1 && (d > lens[i] || !lens[i])) { d -= lens[i]; i++; }
      const l = tr.legs[i];
      return pointAt(l.p, l.rev ? lens[i] - d : d);
    };
    if (!total) return;
    // every wire ends at a card, and the sky is under the cards: a flight
    // starts and ends a dot clear of them, so a dot held at its seat or
    // waiting at magpie is seen whole
    const edge = Math.min(6, total / 4), d = edge + e * (total - 2 * edge), pt = point(d);
    setAttr(tr.dot, "cx", String(pt.x));
    setAttr(tr.dot, "cy", String(pt.y));
    tr.dot.removeAttribute("visibility");
    const b = tr.bird;
    if (!b) return;
    const p0 = point(d - 3), p1 = point(d + 3);
    let vx = p1.x - p0.x, vy = p1.y - p0.y;
    if (Math.abs(vx) + Math.abs(vy) < .01) { vx = b._vx ?? (tr.legs[0].rev ? -1 : 1); vy = 0; }
    b._vx = vx;
    const aim = Math.max(-24, Math.min(24, Math.atan2(vy, Math.abs(vx)) * 180 / Math.PI));
    b._a = b._a === undefined || b._flip !== (vx < 0) ? aim : b._a + (aim - b._a) * .12;
    b._flip = vx < 0;
    b.setAttribute("transform", `translate(${pt.x.toFixed(1)} ${pt.y.toFixed(1)}) scale(${b._flip ? -1 : 1} 1) rotate(${b._a.toFixed(1)})`);
  }

  // resume: the page back in sight — another tab left, the window shown
  // again, or frames not drawn for a while (a hidden or covered window
  // draws none, and may not say it is hidden). What was flying then is
  // stale: it ends, the stage is drawn as it is now, and only the requests
  // still under way fly (#302).
  const LIVE = 4;
  const underWay = () => pinned || day ? [] : [...src().values()].filter((r) => !r.done && matchesPurpose(r)).sort((a, b) => a.id - b.id).slice(-LIVE);
  function resume() {
    stopPlays();
    if (!loaded) return;
    if (!pinned && !rp) cur = told();
    if (cur) sync("back");
    else empty();
    for (const r of underWay()) play(r.id);
    renderAll();
  }
  // the loop runs only while the page is the one in sight: out of sight it
  // is not scheduled at all, so a hidden Routing page — the window hidden,
  // another view picked, another tab open — asks for no frames forever
  // (#302's other half). Shown again, start() resumes it, and resume()
  // draws the page as it is now. The requests that came meanwhile are
  // listed by the poll, which never stops. In sight, it runs only while
  // the stage is busy, and kick() wakes it (#2827).
  function frame(ts) {
    ticking = 0;
    const vis = shown();
    if (vis && (!seen || ts - lastFrame > 1000)) resume();
    seen = vis;
    lastFrame = ts;
    if (vis) {
      const now_ = trips; trips = [];
      for (const tr of now_) {
        if (tr.g !== gen) { tr.res(); continue; }
        const k = tr.ms ? Math.min(1, Math.max(0, (ts - tr.t0) / tr.ms)) : 1;
        try {
          pose(tr, (1 - Math.cos(Math.PI * k)) / 2); // eased in and out, as a bird glides to land
        } catch { tr.res(); continue; } // one that can't be flown ends, and the rest fly on
        if (k >= 1) tr.res(); else trips.push(tr);
      }
      if (ts < flipUntil) layout();
      if (capQ.length && ts - capAt > (capLo && !capQ[0].lo ? 500 : 1700)) show(capQ.shift());
    } else pause();
    if (vis && busy() && !ticking) ticking = requestAnimationFrame(frame);
  }
  function pause() {
    if (ticking) cancelAnimationFrame(ticking);
    ticking = 0;
    seen = false;
    endReplay(true);
    leftPick();
    for (const tr of trips) tr.res();
    trips = [];
    wake();
    if (capQ.length) { show(capQ[capQ.length - 1]); capQ = []; }
  }

// upstream client.js:5254-5258
  function start() {
    const waking = !!sightWait; // the poll waited: it reads what came meanwhile

    countdown();
    if (!shown()) { pause(); return; }

// upstream client.js:5260-5299
    backToPick(!waking);
    kick();
  }
  // A pick holds the stage while the reader is with it (and #1389 lets it
  // go once it has left the list). Gone from the page — another app,
  // another page, the window hidden — and back to requests that came
  // meanwhile, the reader comes back to live, not to a pick they may well
  // have forgotten: a 16:36 request the agent had canceled held the stage
  // at 17:09 while the list under it filled with newer ones (未寒 on
  // Discord, 10-28). Back to none, the pick stays.
  let awayAt = 0, blurred = false; // the newest request when the reader left a pick; 0 while with it
  function leftPick() {
    if (pinned && !day && !rp && !awayAt) awayAt = newest()?.id || 1;
  }
  // backToPick: the reader is back; done, it was the last word on this
  // time away (the poll may still be reading what came meanwhile)
  function backToPick(done) {
    if (!awayAt || blurred || !shown() || !loaded) return;
    const was = awayAt;
    if (done) awayAt = 0;
    if (!pinned || day || rp || !((newest()?.id || 0) > was)) return;
    awayAt = 0;
    pinned = null;
    followListed();
  }
  // in sight again: the view picked, the window shown, another tab left,
  // the window covered and drawing frames once more
  new MutationObserver(start).observe($("#view-routing"), { attributes: true, attributeFilter: ["hidden"] });
  document.addEventListener("visibilitychange", start);
  window.addEventListener("blur", () => { blurred = true; leftPick(); });
  window.addEventListener("focus", () => { blurred = false; start(); });
  // countdowns tick once a second, only while the page is in sight: a
  // tick with nothing to draw wakes the web content process all the same
  // (#3185), so out of sight there is none until start() sees it again
  let second = 0;
  function countdown() {
    if (!shown()) { clearInterval(second); second = 0; return; }
    second ||= setInterval(() => { if (!shown()) return countdown(); if (!pinned && loaded && cur) sync(); render(); renderStats(listed()); }, 1000);
  }
  countdown();

// upstream client.js:5301-5304
  function offline(msg) {
    off.textContent = msg;
    off.hidden = !msg;
    for (const e of [top, stage, foot, log]) e.hidden = !!msg;

// upstream client.js:5306-5333
  }

  function empty() {
    if (!shown()) return; // resume() empties it in sight, as sync
    offline("");
    what.replaceChildren(el("b", "", t(purpose.length || day ? "No requests match these filters." : "Waiting for a request")));
    mode.textContent = t("Send one from any agent routed through magpie and it plays here as it happens: who routing put first and why, each try, and what each answered.");
    for (const a of agents.values()) a.wire.remove();
    agents.clear();
    const a = agentNode("");
    a.ic.replaceChildren(icon("generic"));
    a.name.textContent = t("your agent");
    a.sub.textContent = "";
    srcs.replaceChildren(a.node);
    for (const row of rows.values()) row.wire.remove();
    rows = new Map();
    for (const s of subs.values()) s.wire.remove();
    subs.clear();
    for (const f of folds.values()) f.wire.remove();
    folds.clear();
    builtFrom = [];
    chip.hidden = true;
    headOf = null;
    hubText();
    win = null; laid = []; gapOf = new Map();
    list.replaceChildren(el("li", "idle", t(purpose.length || day ? "No requests match these filters." : "No request yet")));
    say(t("Every request an agent sends to magpie shows up here, routed for real."));
    log.hidden = true;

// upstream client.js:5335-5345
    layout();
  }

  // the live dots beside "Routing" pulse while a request is under way,
  // and rest when none is: an endless pulse repainted the head every
  // frame, which without a GPU is a renderer's whole core (#2827)
  const anyLive = () => loaded && mine && [...routes.values()].some((r) => !r.done);
  function liveDots() {
    const on = anyLive();
    for (const d of document.querySelectorAll(".rt-livedot")) d.classList.toggle("on", on);
  }

// upstream client.js:5466-5483
  function hubText() {
    // Only sanitized gateway identity, never a configured URL.
    // which magpie is routing, when it isn't this one (#2606): this page plays
    // that magpie's routing, and its window is the other place it shows. It
    // is named by the trace the page plays, so it goes with a takeover at once
    const who = mine && by?.serves
      ? t("{serves} (pid {pid}) is routing", { serves: by.serves, pid: by.pid }) + " · "
      : "";
    setText(hubSub, who + t("gateway"));
    setAttr(hubSub, "title", who ? hubSub.textContent : ""); // whole, where the node cuts it short
  }

  // labels in the page's language, and again when it changes
  function words() {
    for (const s of stats.children) s.lastChild.textContent = t(s.dataset.label);
    hubText();
    // the caption said before, said again in these words: it was set as text
    if (loaded) { if (cur) { sync(true); renderAll(); capQ = []; say(affWhy(cur, true) || ruleWhy(cur, true) || firstWhy(cur)); } else empty(); }

// upstream client.js:5486-5487
  }
  new MutationObserver(words).observe(document.documentElement, { attributes: true, attributeFilter: ["lang"] });

// upstream client.js:8497-8505
  // laid out in the next frame, not inside this round of the observers:
  // layout() reads the rows, and with hundreds of keys the rows coming into
  // sight change #rt's height a fraction of a pixel, which WebKit reports
  // as a ResizeObserver loop (#3164)
  let stageAsked = 0;
  // The agents' and magpie's columns are as wide as their words (routing.css),
  // so a new name or address can move the cards while the stage keeps its size
  const stageSeen = new ResizeObserver(() => { if (!stageAsked) stageAsked = requestAnimationFrame(() => { stageAsked = 0; layout(); }); });
  for (const e of [stage, srcs, hub]) stageSeen.observe(e);

  // Plugin boundary, not part of source grouping. The native trace ingestion
  // below is copied from the original poll; only transport, excluded page calls
  // and full-snapshot reset/eviction are changed. No raw core APIs run here.
  let epochKey = null, revision = null, wasHidden = false;
  function clearNative(message = "") {
    rp = null; rbar.hidden = true; pinned = null; cur = null;
    stopPlays(); pause();
    if (drawing) cancelAnimationFrame(drawing);
    drawing = 0;
    for (const tr of trips) tr.res();
    trips = []; capQ = []; cap.textContent = "";
    routes.clear(); atOf.clear(); liftedAt.clear();
    seq = 0; loaded = false; mine = false; by = null;
    traceTotals = { requests: null, rerouted: null, errors: null };
    epochKey = null; revision = null; headKey = ""; stepsKey = ""; stepsFor = "";
    logR = null; logHead.replaceChildren(); steps.replaceChildren();
    builtFrom = []; storyHold = { key: "", told: new Map() }; modeHold = { key: "", told: new Map() };
    for (const a of agents.values()) a.wire.remove();
    agents.clear(); srcs.replaceChildren();
    for (const row of rows.values()) row.wire.remove();
    rows.clear(); for (const s of subs.values()) s.wire.remove(); subs.clear();
    for (const f of folds.values()) f.wire.remove(); folds.clear();
    sets = []; ways = null; win = null; laid = []; gapOf = new Map();
    list.replaceChildren(); sky.replaceChildren(); flows.replaceChildren();
    what.replaceChildren(); mode.textContent = ""; hubSub.textContent = "";
    statB.forEach(b => { b.textContent = "—"; b.removeAttribute("title"); });
    headOf = null; liveDots(); offline(message);
  }
  function accept(d) {
    const nextEpoch = JSON.stringify([d.instanceId, d.generation, d.pid]);
    if (epochKey !== nextEpoch || d.seq < seq) clearNative();
    epochKey = nextEpoch;
    // connection is an authenticated collector status, not process ownership.
    mine = d.connection.status === "live";
    if (!mine) { clearNative(host.connectionMessage(d.connection)); return; }
    if (!d.now) { clearNative(t("Gateway time is unavailable. Waiting for routing data.")); return; }
    d = { ...d, routes: d.routes.map(r => ({ ...r, model: r.model || t("Unknown model"), provider: r.provider || t("Unknown provider") })) };
    if (revision === d.revision && loaded) return;
    revision = d.revision;
    noteLifted(d.lifted);
    skew = at(d.now) - Date.now();
    by = d.serves && d.pid ? { serves: d.serves, pid: d.pid } : null;
    traceTotals = d.totals || { requests: null, rerouted: null, errors: null };
    // A whole snapshot replaces each route, never merges partial records.
    // Unlike native's incremental transport, a missing ID is fully evicted.
    const kept = new Set(d.ids);
    for (const id of routes.keys()) if (!kept.has(id)) routes.delete(id);
    const caught = wasHidden; wasHidden = false;
            seq = d.seq;
        const first = !loaded;
        const fresh = [];
        for (const r of d.routes) {
          if (!routes.has(r.id) && !first) fresh.push(r.id);
          routes.set(r.id, whole(r));
        }
        for (const id of [...routes.keys()].sort((a, b) => a - b).slice(0, -60)) routes.delete(id);
        const back = caught;
        loaded = true;
        offMsg = "";
        liveDots();
        if (first) {
          offline("");
          const r = pinned || newest();
          if (r) { cur = r; sync(true); say(affWhy(r, true) || ruleWhy(r, true) || firstWhy(r)); renderAll(); } else empty();
          // the page's first frame came before the trace did, and found
          // nothing to fly: the requests under way fly now, not never
          if (seen && shown()) for (const u of underWay()) if (!playing.has(u.id)) play(u.id);
        } else {
          if (cur && routes.has(cur.id) && !rp) cur = routes.get(cur.id);
          if (pinned && routes.has(pinned.id)) pinned = routes.get(pinned.id);
          // a request picked (in the list, or the tray panel's row that
          // opened the window) goes back to live once it has left the list,
          // as a filter that leaves it out does: the stage stayed on one
          // provider's request for hours while every request since went to
          // another (#1389, Creat55)
          else if (pinned && !day) {
            pinned = null;
            cur = newest();
            if (cur) { sync(true); say(affWhy(cur, true) || ruleWhy(cur, true) || firstWhy(cur)); }
          }
          // back in sight to requests that came while away: live again
          if (back) backToPick(true);
          if (!pinned && !rp) {
            cur = told();
            if (cur) sync();
            else empty();
          }
          // played only in sight: coming back into it plays those still
          // under way, not all that came meanwhile (#302)
          const go = !back && !pinned && !rp && !day && shown() ? fresh.filter((id) => matchesPurpose(routes.get(id))) : [];
          for (const id of go) playing.set(id, gen);
          if (go.length) sync(); // the stage once for them all (#308)
          for (const id of go) play(id, true);
          if (back && seen && shown()) for (const u of underWay()) if (!playing.has(u.id)) play(u.id);
          wake();
          renderAll();
        }

  }
  words(); start();
  offline(t("Waiting for secure routing data"));
  return Object.freeze({
    accept,
    clear: clearNative,
    visibility() { wasHidden = true; start(); if (!shown()) stopPlays(); },
    locale(pref) { setLocale(pref); },
    // Only in-page presentation; the service never supplies original account names.
    mask(on) { document.body.classList.toggle("masked", on); },
  });

}

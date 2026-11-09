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
    /* NATIVE_INGEST */
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

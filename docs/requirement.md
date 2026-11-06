# Magpie Session Routing — Product Requirements & Implementation Specification

**Version:** 1.0 (draft)  
**Date:** 2026-11-06  
**Target:** `yetone/magpie`, deployed using Docker / Magpie WebUI  
**Implementation:** Installable community plugin with a backend service managed by Magpie's Bun plugin host  
**Audience:** Developer / Codex implementation agent

## 1. Objective

Develop an installable **Session Routing** plugin for Magpie that shows the routing diagram, live request status, retries/fallbacks, and metrics **for each individual Claude Code / Codex working session**. Today, the built-in Routing view mixes requests from multiple sessions in its live diagram. The built-in **Routing → Requests → By session** option groups the request *list*, but does not isolate the entire live visualization.

**Target interaction:** choose **All sessions** or a particular working session and see only that session's traffic across the diagram, request details, counters, and history. Concurrent sessions must never contaminate each other's view.

## 2. Fixed architectural decisions

| Area | Requirement |
|---|---|
| Packaging | Normal Magpie plugin, installable using `magpie plugin add <package-or-path>` |
| Backend | Small HTTP service implemented inside the plugin and started through the plugin's `server` hook in the existing Bun plugin-host process |
| Deployment | Same existing Magpie Docker container; **no extra container, Kubernetes Deployment, Service, Ingress, or systemd unit** |
| Network | Listen only on `127.0.0.1` with a configurable, non-conflicting port; never expose the backend port publicly |
| Browser access | Use Magpie's `magpie.page.service` bridge / built-in reverse proxy; **do not** direct a remote browser to the server's `127.0.0.1` |
| Gateway integration | Read Magpie's existing, read-only routing and usage APIs; do not intercept or modify model requests |
| Source changes | **No Magpie core patches or fork in the MVP** |
| Placement | Add a **separate “Session Routing” plugin page** initially. Make `magpie.page.replaces: "routing"` an optional later mode only after parity, including preservation/access to Routing Groups editing |
| Data retention | Default to in-memory state. No request/response body archiving or persistent conversation content |

The service is a local listener **within Magpie's plugin-host process**, not an independently deployed daemon. Starting/stopping the host controls the service's lifetime. Because Magpie may start the host lazily when the plugin page opens, the UI must handle startup/restarts and reconnect gracefully.

## 3. Current Magpie interfaces and constraints

| Source | Purpose | Limitation |
|---|---|---|
| `GET /v1/magpie/trace` | Primary source for live detailed routes, `agent`, `session`, `parentSession`, request `id`, `model`, `order`, `tries`, `done`, etc. | Loopback-only; bounded recent trace (current source uses `traceKeep = 60`, with special handling for in-progress requests); not a full historical database |
| `GET /v1/magpie/trace?after=<seq>&wait=1` | Incremental live updates via gateway long-poll | Handle sequence resets, restart, expired routes, and connection failures |
| `GET /v1/magpie/route?session=<id>` | Optional per-session latest route / attempts | Latest request only; insufficient for complete history and session discovery |
| `GET /v1/magpie/usage/requests?period=<period>` | Ledger of historical requests and available token/cost/timing data | Paginated; session must be grouped/filtered by the plugin when necessary. Does **not** guarantee recovery of historical routing attempts |
| `GET /v1/magpie/route-events` | Optional gateway-wide live event feed | **No session identifier**: do not rely on it alone for session-specific views |

Use the current source code as the contract rather than assuming every installation has identical fields. Gate startup against the installed Magpie version/features and provide actionable compatibility errors.

## 4. Functional requirements

### FR-01 — Discover and identify sessions (MUST)

1. Discover sessions from observed gateway routes without depending on the agent's local session files. This must work for Claude Code / Codex running on **other machines** through the gateway.
2. Use a collision-resistant identity of **`(agent, native session ID)`**, not the model name, working directory, provider, or prompt text.
3. List active sessions first (at least one request with `done = false`), then recently observed sessions. Show agent, title if reliably known, shortened ID, latest activity, active request count, and last model/provider where available.
4. If no session ID was sent, show the traffic as **“Unknown / no session ID”**, not as a fictitious shared session. Do not silently attribute it to another session.
5. Display an explicit empty state if no identifiable sessions have been observed.

### FR-02 — Session selector and filtering (MUST)

1. Selector at the **top of the routing visualization**: `All sessions` (default) or one session.
2. A single selection must scope **all** session-dependent elements: diagram nodes/edges, active indicators, request timeline, current request details, replay, and metrics.
3. When Session A is selected, no activity from Session B may appear as A's live routing activity or affect its numbers.
4. Persist the selected `(agent, session)` in browser-local state, but fall back safely when the session expires or can no longer be found. Offer a clear control to return to All sessions.
5. Permit searching by agent, title, shortened ID, and (if not hidden by privacy settings) project folder.

### FR-03 — Per-session routing diagram (MUST)

1. Represent: **Agent / selected session → Magpie gateway → provider / account or key where safe → model**.
2. Distinguish **eligible/candidate**, **currently attempted**, **success**, **failed**, **retried**, and **fallback** states. Do not depict an unattempted candidate as having served a request.
3. Show the actual `tries` in order, including when and why an attempt failed, when exposed by trace.
4. Use route-specific `order` / `tries` / `group` information to draw the relevant topology; do not indiscriminately render every global provider as if it were used by the selected session.
5. Support multiple concurrent requests from the *same* session; do not assume a session has only one in-flight request.
6. Show reasoning effort, served-model differences, TTFT, elapsed time, and fallback reason **only when recorded**; use `—` or `Unknown` rather than guessed values.
7. Preserve visual clarity on desktop and mobile, with a responsive list/fallback view when a large topology would be unreadable.

### FR-04 — Request timeline (MUST)

1. Show the selected session's requests in reverse chronological order.
2. Each request can expand to reveal route/attempt sequence, requested versus served model (when known), status, timing, errors, and token counts (if available).
3. Clicking a request highlights/replays **that request** without changing the selected session.
4. Do not show raw prompts, tool arguments, API secrets, response bodies, or sensitive headers in this plugin.
5. Keep request identifiers unique even if two sessions contain identical-looking messages.

### FR-05 — Live updates (MUST)

1. Backend maintains **one shared** incremental long-poll against `/v1/magpie/trace`, not one long-poll per browser/session/viewer.
2. Backend maintains a bounded, in-memory projection keyed by request ID and `(agent, session)`; derives snapshots for clients.
3. Frontend gets near-real-time updates from the plugin backend through SSE **or** efficient polling. Design for live changes becoming visible within approximately **2 seconds under normal conditions** (not a hard guarantee under network loss).
4. Correctly reconcile `seq`, changed routes, retained IDs, gateway restart, reconnect, and route eviction. Never leave a completed/evicted request permanently “in progress.”
5. On disconnection, visibly mark data `stale` / `disconnected` and show a last-updated time. Do not pretend cached values are live.

### FR-06 — Session statistics (MUST)

1. Show **requests**, **in-flight requests**, **failed requests**, **retries**, **fallbacks**, and available timing/token metrics for the selected scope.
2. Define fallback distinctly from same-candidate retries; don't count one attempt as multiple requests.
3. In `All sessions` mode, use global totals only if explicitly labelled; for a selected session recalculate from that session's records.
4. **Every total must state its coverage**: e.g., `Live trace (recent requests)` versus `Usage ledger (today / 7d / 30d)`.
5. Do **not** misrepresent the last 60 trace records as a complete lifetime session history. Historical token/cost summaries can be supplemented from `/v1/magpie/usage/requests`, but historical per-attempt routing details cannot be fabricated.
6. If data or pricing is unavailable, show missing/partial rather than `$0` or a fabricated rate.

### FR-07 — Parents and subagents (SHOULD)

1. Show explicit parent-child relationships from `parentSession`, `subagentId`, and other documented native fields.
2. Offer a `Include child/subagent traffic` toggle for a parent session; default to **direct session only** for strict isolation.
3. Any heuristic/inferred parent match must be labelled as inferred and not silently merged as confirmed.
4. Keep the ability to inspect child sessions separately.

### FR-08 — Preserve standard Magpie functionality (MUST)

1. Do not change gateway routing, fallback algorithms, provider order, session affinity, request headers, request/response bodies, billing, or model settings.
2. Preserve access to the original Routing page and Routing Groups editor in the MVP.
3. No extra upstream model/API calls: the plugin monitors existing Magpie telemetry only.
4. Plugin enable/disable/uninstall must not interrupt normal model requests.

### FR-09 — History (SHOULD / phased)

1. Show `Live`, `Today`, `7 days`, and `30 days` where the ledger supports them.
2. Distinguish **usage-ledger history** from **full routing-attempt history**; historical diagrams require available trace/archive evidence or an explicitly enabled metadata-only local archive in a later phase.
3. Default retention must be non-persistent. If optional persistence is built, document retention, storage bounds, rotation, deletion, and privacy controls.

## 5. UI/UX specification

**Header:** `Session Routing` · live/disconnected indicator · refresh action.  
**Filter bar:** `[All sessions ▾] [Active / Recent] [Search] [Live / Today / 7d / 30d]`.  
**Summary:** session-scoped requests, retries, fallbacks, errors, average TTFT (if measured), tokens/cost (if priced).  
**Diagram:** isolated agent/session node, Magpie gateway, relevant candidate/attempted providers/models, live highlighting, labelled fallback paths.  
**Details:** chronological request list + expandable attempt trace; a click can focus a particular request in the diagram.  
**States:** no traffic, no session ID, loading, stale gateway, backend unavailable, wrong Magpie version, partial history.

The visual style should resemble Magpie's existing Routing UI (theme tokens, light/dark modes, compact desktop layout), **but should not copy core UI internals in a brittle way**. If exact 1:1 rendering would require a fork, favor equivalent functionality and visual consistency without modifying core.

## 6. Plugin and backend design

### 6.1 Expected structure

```text
magpie-session-routing/
├── package.json            # Plugin manifest, page, service port/options
├── index.mjs               # Magpie `server` hook; idempotent startup
├── lib/
│   ├── server.mjs          # Loopback HTTP server, auth and route handlers
│   ├── gateway.mjs         # Gateway trace/usage API client
│   ├── aggregator.mjs      # Session index and trace reconciliation
│   └── privacy.mjs         # Allow-list outgoing fields / redact
├── page/
│   ├── index.html          # Sandboxed Magpie page launcher
│   ├── boot.js             # Bridge handshake + `magpie.service` base URL
│   └── icon.svg
├── ui/
│   ├── index.html
│   ├── app.js
│   └── style.css
└── test/
    ├── aggregator.test.mjs
    ├── api.test.mjs
    └── integration.test.mjs
```

### 6.2 Manifest (illustrative, not yet a complete package)

```json
{
  "name": "magpie-session-routing",
  "version": "0.1.0",
  "type": "module",
  "main": "./index.mjs",
  "magpie": {
    "name": "Session Routing",
    "page": {
      "title": "Session Routing",
      "file": "page/index.html",
      "service": { "port": 3496, "option": "port" }
    },
    "options": { "port": 3496 }
  }
}
```

**Do not add `replaces: "routing"` in the MVP.** This is an optional mode only after proving the replacement has all necessary original functionality.

### 6.3 Browser data flow

```text
Remote browser / Magpie WebUI
        │
        ▼
Magpie plugin-page bridge (sandbox + authorized token)
        │
        ▼
Magpie reverse proxy under the plugin page's service URL
        │
        ▼
127.0.0.1:3496 (inside the existing Docker container)
        │
        ▼
Plugin backend (shared, cached state)
        │
        ▼
127.0.0.1:3425 /v1/magpie/trace, /usage/requests
```

The frontend must derive its service base from `window.magpie.service` when served through `magpie web`. It must not use the *browser's* localhost address. The backend must derive the gateway location from supported Magpie environment/configuration (e.g. `MAGPIE_ADDR`) and validate that full-trace access is from the **same container / loopback**.

### 6.4 Proposed plugin-facing endpoints

These are **plugin-owned APIs** to implement, not existing Magpie endpoints:

- `GET /healthz` — readiness, version; no secrets.
- `GET /api/sessions` — authorized list of active/recent sessions with safe display metadata.
- `GET /api/state?session=<opaque-key>&period=live` — scoped diagram graph, request summaries, metrics and `seq`.
- `GET /api/events?session=<opaque-key>` — optional SSE updates; alternatively poll `/api/state` every 1–2 seconds.
- `GET /api/history?session=<opaque-key>&period=today|7d|30d&offset=...` — optional paginated usage ledger summary.

All endpoints must validate parameters, rate-limit or bound queries, redact sensitive fields, and avoid arbitrary access to Magpie's `/api/*` or gateway APIs.

### 6.5 Aggregation and consistency rules

- Key sessions by `(agent, session)`; use an opaque/safe encoded key for frontend URLs.
- Key trace records by Magpie request ID; for multiple simultaneous requests, track each independently.
- Apply incremental `after` updates; reconcile against `ids` where available and re-fetch full snapshot on reset.
- Treat absent `session` and unverified parent relationships as unknown, not as permission to guess.
- Maintain a bounded cache, with stale-state indicators and backoff on gateway failures.
- Count only observed attempts/metrics; never derive TTFT, served model, completion or fallback from unsupported assumptions.
- Define `active` as having an observed unfinished *gateway request*. Do not claim that an idle gateway session means the overall Claude Code/Codex task has completed; local tool execution may still be in progress.

## 7. Security and privacy (MUST)

1. Backend binds to `127.0.0.1` only; the port is **not** published via Docker, Kubernetes Service, HTTPRoute, or Ingress.
2. Use Magpie's authenticated plugin-page token/bridge, plus a backend-local random API token or equivalent verified mechanism. Defend against direct loopback cross-origin access, CSRF, and DNS rebinding: validate Host, Origin, and allowed methods.
3. The backend holds privileged trace access, so return an explicit allow-list of necessary session/route fields. Strip secrets and avoid exposing arbitrary upstream headers, prompt content, file contents, or auth details.
4. No telemetry sent to third parties; no new model requests; no external analytics.
5. Handle Magpie `web` remote browsers and sandbox `Origin: null` narrowly; do not use permissive `Access-Control-Allow-Origin: *` for privileged JSON APIs.
6. Ensure a plugin URL/page token isn't logged or leaked. A disabled/uninstalled plugin must no longer serve sensitive session data.
7. Running the plugin never modifies Magpie routing configuration or session files.

## 8. Performance, reliability, compatibility

- The normal gateway request path must remain unaffected (the plugin is a read-only observer, not middleware).
- **One long-poll to the gateway per running plugin backend**, shared across UI tabs/viewers; no busy loops. Reconnect with bounded exponential backoff.
- Target UI updates within ~2 seconds in normal operation; use a single fan-out stream or efficient cached polling to clients.
- Keep memory and CPU bounded; limit cached sessions/routes and avoid rescanning entire usage history on every refresh.
- The shared Bun plugin-host process must not be blocked by synchronous heavy work.
- `server` hook startup must be idempotent. Avoid duplicate-port conflicts during host reload; do not kill an unknown process that owns the configured port. Handle shutdown/restart, failed binding, changing the port, and unavailable gateway.
- Works when Magpie is accessed via HTTPS through nginx / Kubernetes HTTPRoute, with no browser-to-backend direct connectivity.
- Single-instance Magpie is the MVP deployment assumption; document behavior under multiple Magpie replicas, where per-instance traces may differ.
- Use a minimum *tested* Magpie version in `engines.magpie`; don't guess a compatibility floor.

## 9. Acceptance criteria / test scenarios

| ID | Test | Expected result |
|---|---|---|
| AC-01 | Install plugin in a standard Magpie Docker container | Plugin appears in WebUI; no extra container or exposed port |
| AC-02 | Open Session Routing remotely through HTTPS | Page loads using Magpie's proxy and backend data API |
| AC-03 | Run Claude Code Session A and Session B simultaneously | Dropdown lists both; each selected view shows only its routes/activity |
| AC-04 | Generate a failed attempt and fallback in Session A | A's diagram and counters update; B's do not |
| AC-05 | Run Codex and Claude Code with same textual session ID | No collision: agent + ID keeps them separate |
| AC-06 | Observe two concurrent requests from one session | Both remain distinguishable and accurately shown |
| AC-07 | A request has no session header | Appears as unidentified traffic; never attributed to a real session |
| AC-08 | Gateway restarts or trace expires | State resynchronizes; stale requests are not shown as active forever |
| AC-09 | Browse older history | Totals have correct period/source labels; missing attempt traces are not invented |
| AC-10 | Close page, restart/disable/uninstall plugin | Host lifecycle/reconnect handled; standard Magpie model routing unaffected |
| AC-11 | Try unauthenticated/cross-origin access to plugin APIs | Rejected without leaking route/account metadata |
| AC-12 | Test a remote Codex/Claude Code client without locally accessible files | Session discovered from gateway trace when native session header exists |
| AC-13 | Two browser tabs view different sessions | Shared backend does not duplicate gateway polls; scopes remain isolated |
| AC-14 | Test mobile width, dark/light modes | Diagram remains usable; controls and status labels remain clear |

## 10. Delivery phases

**Phase 1 — MVP (required):** Installable plugin + Bun-hosted backend + Magpie WebUI page; trace ingestion; session discovery/selection; selected-session live diagram, request list and scoped counters; security, stale/reconnect handling, and tests. Preserve original Routing page.

**Phase 2 — Usage and polish:** Time-period views and pagination from usage ledger, improved title discovery, optional explicit parent/subagent grouping, responsive UI, accurate cost/TTFT displays, and UI performance tests.

**Phase 3 — Optional replacement:** Only if desired, enable `magpie.page.replaces: "routing"` and provide an equivalent way to use original Routing Groups management. Optional opt-in local metadata-only history with retention controls.

## 11. Explicit non-goals

- No new model router, fallback scheduler, or proxy.
- No editing providers, keys, routing groups or agent configuration in MVP.
- No conversation/resume terminal, session synchronization, or process control.
- No additional API-key calls to upstream providers; no prompts, response bodies, or tool commands collected.
- No claim of complete historical routing beyond Magpie's actual retained records.
- No dependence on reading `~/.claude` or `~/.codex` files on the Magpie host.
- No Magpie core modifications unless the no-fork approach is later proven insufficient and approved separately.

## 12. Implementation handoff / definition of done

Deliver a working repository/package, not just a design mockup. Include README with installation and Docker setup, `package.json`, backend code, frontend, configuration, automated tests, and a brief compatibility matrix. Show end-to-end validation using two simultaneous sessions and a fallback. Document any Magpie-version/API constraints and list any acceptance criteria not yet met rather than claiming success.

**Reference source files (check current upstream before coding):**

- Magpie plugin architecture: https://github.com/yetone/magpie/blob/main/docs/subsystems/plugin-runtime.md
- Gateway detailed trace and retention: https://github.com/yetone/magpie/blob/main/internal/gateway/trace.go
- Session/latest route API: https://github.com/yetone/magpie/blob/main/internal/gateway/session_route.go
- Existing Routing UI behavior: https://github.com/yetone/magpie/blob/main/internal/gui/assets/plugins/routing/client.js
- Backend service/proxy implementation: https://github.com/yetone/magpie/blob/main/internal/gui/pageservice.go
- Reference community plugin: https://github.com/magpie-community/plugins/tree/main/packages/page-usage-tree


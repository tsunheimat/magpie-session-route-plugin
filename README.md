# Session Routing for Magpie

A read-only plugin page that isolates Magpie routing evidence by the exact **agent + recorded native session ID**. Select a session to scope its routes, concurrent requests, ordered attempts, replay, metrics and usage history together. The original **Routing** page and **Routing Groups** editor are not replaced.

The service runs **inside Magpie’s existing Bun plugin host**, listening only on `127.0.0.1`. No extra daemon/container, model calls, routing middleware or persistent traffic archive is added. The browser reaches it through Magpie’s authenticated plugin-page service proxy—not the browser’s localhost.

## Compatibility and verification

Tested against Magpie **v0.1.3124**, commit `3f53fa1f316330b77e5ff6d065a7a56980cafda2`, with genuine **Bun 1.4.2**. These are the declared deployment minimums; older versions are not certified, and future versions still require compatibility checks. Source inspection, Chromium/WebKit protocol tests and isolated real-host integration are separate claims. See [compatibility](docs/compatibility.md) and the [AC-01–AC-14 validation matrix](docs/validation.md) for exact results and outstanding deployment checks.

The package is named `magpie-session-routing` and is distributed through GitHub; it has not been published to npm. It has no runtime npm dependencies and needs no asset build step. Node 22+ is for development/tests; deployment uses the genuine Bun runtime managed by Magpie.

## Install in an existing Magpie installation

Run under the same account and configuration environment as Magpie:

```sh
magpie plugin add github:tsunheimat/magpie-session-route-plugin#v0.2.0
magpie plugin list
```

### Quick install on k3s / Kubernetes

Run the CLI inside the **existing Magpie container**, not on the Kubernetes host:

```sh
kubectl exec -n <namespace> <magpie-pod> -c <magpie-container> -- \
  magpie plugin add github:tsunheimat/magpie-session-route-plugin#v0.2.0
```

The official image keeps configuration and installed plugins under `/config`; persist that mount with your existing PVC. Leave the container's HOME/XDG environment unchanged. No extra pod, Service, Ingress rule, or exposed plugin port is needed. Refresh the WebUI after installation; a pod restart should normally be unnecessary. Then complete secure first-use setup below. This is a single-instance plugin, not a cross-replica collector.

### Upgrade from v0.1.0

Run the same `magpie plugin add github:tsunheimat/magpie-session-route-plugin#v0.2.0` command inside the existing Magpie container. Both versions use the package name `magpie-session-routing`, so Magpie replaces the existing entry and preserves its options and enabled/disabled state. **Do not remove the old entry first**—removal deletes its saved options. Close/reopen Session Routing after the upgrade; previously configured secure access is reused.

`magpie plugin update` alone reinstalls a Git plugin's existing pinned spec; it does not change `#v0.1.0` to the new tag. If you previously installed from a local directory or have multiple entries, inspect `magpie plugin list` and use the appropriate installation path rather than creating another enabled instance.

### Local directory or archive

Alternatively, keep the package at a stable path readable by the account running Magpie. From that same account and configuration directory:

```sh
magpie plugin add /absolute/path/to/magpie-session-route-plugin
magpie plugin list
```

Alternatively, produce a distributable archive with `npm pack --ignore-scripts`, extract it to a stable directory, and add the extracted directory with `magpie plugin add /absolute/path/to/extracted/package`. Packing does not publish it. Do not assume a registry package exists.

Open **Session Routing** in Magpie WebUI. On first use, choose **Set up secure access**. The launcher generates a random 128-bit installation identifier and 256-bit API token, saves only this plugin’s options via Magpie’s authenticated parent bridge, re-reads the saved options, and only then navigates through the service proxy. Changing hosted-plugin options restarts its host, so provisioning must happen before navigation. The service starts no listener or collection while unprovisioned.

Existing valid credentials are reused. A throttled/concurrent first-use write is followed by an authoritative read, not a token-rotation loop. If setup fails, use **Try again** or reopen the page. If one credential was manually edited or removed, correct the plugin options or remove **both** credential options before explicitly setting up again. Never paste the token into a URL, ticket, shell transcript or browser storage.

### Same-container Docker setup

Use the **existing Magpie container** and its existing configuration volume. Mount/copy the package into that container; do not add another container or publish port 3496. For example, add a read-only package mount to the existing service:

```yaml
# Fragment of your existing Magpie service; not a second service.
volumes:
  - ./magpie-session-route-plugin:/opt/magpie-session-routing:ro
```

Then, using the same UID/HOME/configuration as the running Magpie process:

```sh
docker exec <existing-magpie-container> magpie plugin add /opt/magpie-session-routing
```

The normal Magpie WebUI endpoint remains the only browser-facing endpoint. **Do not** add `3496:3496`, an Ingress/HTTPRoute for 3496, or a separate service deployment. Read-only trace access must reach the gateway through loopback in the same container/network namespace. The runtime obtains its gateway bind address from `MAGPIE_ADDR` (default `127.0.0.1:3425`) and converts wildcard bind addresses to loopback; arbitrary URLs, remote hosts and redirects are rejected.

### Options

Set options in Magpie’s plugin settings; preserve the saved credential pair when changing an already-provisioned installation.

| Option | Default | Meaning |
|---|---|---|
| `port` | `3496` | IPv4 loopback service port, 1–65535, distinct from the gateway port. Not a browser URL. |
| `showFolders` | `false` | Explicitly allow project-folder metadata in responses/search. This can expose local paths. |
| `installationId` | Unset | Generated per installation by first-use setup. Do not reuse across separate installs. |
| `apiToken` | Unset | Generated 32-byte base64url bearer credential. Keep private. |

A CLI host can receive a temporary service port from Magpie. It must not become a second collector. Overlapping regular hosts perform an authenticated ownership check and wait for the existing owner to release the port; old Magpie hosts can drain for ten minutes. An unrecognized owner permits only a short, bounded exclusive-bind retry so a revoked old host can close during credential rotation; it is never trusted as a compatible owner. Unknown port owners are not killed, probed with a bearer token, or silently replaced by another port. Configure an unused port if the conflict remains.

## Using the page

**New in v0.2.0:** one native-style routing stage replaces the original card-based interface, with the session picker above it and Details closed initially. The original `v0.1.0` tag remains unchanged.

- **Session picker:** All sessions is global coverage; a particular session uses an exact, case-sensitive `(agent, session)` identity. Equal IDs from different agents do not collide. **Unknown / no session ID** is explicitly unassigned traffic, never a fabricated native session.
- **Search / Active:** search available agent, title, shortened ID or opt-in folder metadata. Active sessions sort first, then recent activity. A missing reliable title is not guessed. Active means an unfinished **gateway request**, not the agent’s whole task.
- **Scope:** direct traffic is the default. Include child/subagent traffic only to add confirmed same-agent children and explicit subagent actors. A child with a proven independent native session can be inspected on its own; workers sharing a parent's header are not direct parent traffic. Unconfirmed relationships do not silently join scopes. Picker discovery counts for other sessions are labelled all-actor; the selected session's hint and totals follow the selected scope.
- **Coverage:** Live uses the bounded trace. Today/7 days/30 days use bounded usage-ledger scans on **gateway-local calendar days**, not browser-local rolling windows. History discovery is period-specific.
- **Routing stage:** one shared diagram connects request/agent nodes through the Magpie hub to compact provider/key/model rows. Each destination is labelled with its request; identical “Key 1” labels from different requests do not establish a shared account. Concurrent requests remain independent. The default stage prioritizes active traffic, or retains recent static evidence when idle. It is bounded to six request lanes and twelve destination rows, with omitted records, active requests and destinations disclosed. **View all records** opens Details rather than creating an unbounded graph. On mobile, agent nodes and the hub sit above the destinations.
- **Live movement:** curved paths and local bird/packet markers reflect recorded attempts, not predicted routing. Only newly observed, matched in-flight attempts launch a flight; repeated polls do not fabricate new requests. Candidate-only paths and completed requests remain static. Hidden/stale/disconnected/history/replay/reduced-motion states stop live animation. Hover or keyboard focus reveals concise path information; click a source or destination to focus its request.
- **Details / timeline / replay:** Details is closed initially and contains full metrics, coverage period controls, the request timeline, and recorded-step replay. Expand a request for measurements; **Focus route** and **Replay attempts** change only presentation, never selected scope or totals. Replay does not reissue requests. History without retained attempt evidence shows topology unavailable; unmatched billable-attempt evidence contributes usage, not extra requests. Account inventory, routing mode and quota data are not inferred from candidate counts.
- **Refresh:** live cached snapshots poll sequentially roughly once per second without overlapping calls. Hidden frames/tabs pause. Reconnect uses bounded backoff. History is an immutable snapshot; a lightweight live-discovery heartbeat checks connection/access without rescanning history or changing its totals. Refresh requests newer coverage and resets pagination. **Load older requests** stays within the same snapshot; expiry is explained and resets it.
- **Stale data:** the page keeps same-scope cached evidence explicitly stale, with its last gateway update. Selection changes immediately clear old-scope panels and abort pending work. Epoch and exact-scope guards reject late responses. Expiration returns to All sessions only after fresh discovery confirms absence; an outage is not expiration.

### Selection persistence limitation (FR-02.4)

Magpie deliberately sandboxes this page without same-origin privileges. Browser storage is normally blocked, and there is no supported storage bridge. Selection is therefore **per frame / in memory** in the supported sandbox; reopening ordinarily returns to All sessions. A guarded, best-effort browser-local preference is used only if storage is available. No tokens are stored there, and no viewer selection is written into server-wide plugin options. Two tabs retain independent selections. Guaranteed persistence across reloads is an explicit unmet requirement until Magpie provides a safe per-viewer storage API; weakening sandboxing is not a workaround.

## Metric definitions and coverage

All totals cite the selected scope and source. `—` means unavailable, never zero.

| Metric | Definition |
|---|---|
| Requests | Observed requests, not number of attempts. Multiple billable handed-on rows can contribute usage without creating invented completed requests. |
| In flight | Observed unfinished gateway requests. Evicted unfinished records become unavailable, not guessed completed. Historical scans do not measure current activity. |
| Failed | Requests with recorded failure evidence. A successful HTTP response alone does not prove application-level success. |
| Retries | Consecutive actual attempts at the same matched candidate/model/effort seat. A scheduled `again` without another actual attempt is not a retry. |
| Fallbacks | Actual transitions between different matched seats. For `A → A → B → A`: one request, one retry, two fallbacks. Ambiguous matching remains partial. |
| Average TTFT | Arithmetic mean of available time-to-first-token measurements, with sample count. Displayed in ms/s. Missing samples are not zero. |
| Tokens | Recorded token subtotal; input/output/cache/reasoning fields are shown only when available. Missing measurements make coverage partial. |
| Recorded cost | Ledger-reported USD, never a derived trace price. Unknown/unpriced zero is not free. A known amount alongside unpriced requests is a labelled subtotal, not a complete bill. |

Trace `retried` is elapsed milliseconds, **not** a retry count; trace TTFT and ledger `ttft_ms` are normalized separately. Live trace has no authoritative dollar cost. Trace retention is upstream-bounded (reference: 60 recent records, special handling up to 120 active); the plugin also bounds its own projection. It is not lifetime history.

Ledger scans use `via=through&computer=this`, excluding local rejections/probes. Scans are shared between viewers, cached and bounded by pages, rows, bytes and elapsed work. Totals are calculated from scoped records, never reused from a global ledger envelope. Join/identity ambiguity, changing pages, missing prices, truncation and unavailable attempt details are disclosed. In-memory state and history snapshots are lost on restart; there is no persistent traffic archive.

## Security and deployment limits

The backend checks exact effective Host, absent or single `Origin: null`, bounded unique query parameters, methods/paths and bearer authorization. JSON data additionally requires a still-enabled, unique installation entry with unchanged settings in Magpie’s `plugins.json`; unreadable/malformed/ambiguous configuration fails closed. Revocation stops collection and clears caches. The page refreshes options on a 401 **without rotating credentials**; authorization failure clears its sensitive view.

Credentials travel through the source-checked parent options bridge and then only in the API `Authorization` header. Page assets contain no credential. The proxy uses Magpie’s own page token in its path; that is a separate credential and needs log protection. The page sends no referrer, analytics, fonts, CDN requests or upstream model calls. Cached metadata is allowlisted before storage: prompts, bodies, tool arguments, headers, archive paths, raw errors, account/key IDs and account emails are not returned. Candidate identities are opaque with neutral labels. Native session identifiers and opt-in folders are still potentially sensitive metadata.

**Threat boundary:** this protects against unauthenticated browsers, cross-origin requests and DNS rebinding—not trusted plugins or local processes able to read Magpie’s configuration or privileged loopback trace. Magpie’s source-only iframe bridge cannot authenticate HTML served by a hostile process already occupying the configured service port. A hostile owner can impersonate that frame; reserve the port and trust the local runtime. Do not deploy this among mutually untrusted local plugins/processes.

### Reverse-proxy log hygiene

Continue proxying the existing authenticated Magpie WebUI over HTTPS; do not proxy the loopback service directly. Redact the entire `/_magpie/plugin/<page-token>/…` path before access logging, omit query strings and Authorization headers, and disable request/response debug dumps. For example, adapt this nginx **logging fragment** to the existing configuration:

```nginx
map $uri $redacted_magpie_uri {
    ~/_magpie/plugin/ "/_magpie/plugin/[redacted]";
    default $uri;
}
log_format magpie_safe '$remote_addr "$request_method $redacted_magpie_uri $server_protocol" $status';
# Use magpie_safe on the existing Magpie proxy's access_log.
```

Do not log `$request`, `$request_uri`, `$args` or `$http_authorization` for plugin-page traffic. Apply equivalent redaction to ingress/controller logs, APM, tracing, HAR captures and support screenshots. Protect Magpie’s configuration volume and backups; do not post the plugin-options JSON. HTTPS behind a real deployment must be validated separately from the local protocol harness.

### Multiple replicas

The MVP is a **single Magpie instance**. Each replica has its own loopback trace, collector, caches, page authorization and history. There is no cross-replica aggregation. A load balancer switching replicas can make sessions disappear or invalidate page/history tokens; use instance-pinned/sticky access and distinct installation identities/configuration. Do not treat a replica’s totals as a fleet total or share a live writable plugin configuration to simulate aggregation.

## Troubleshooting

| Symptom | Check |
|---|---|
| Launcher says service proxy unavailable | Use supported `magpie web` WebUI, not a standalone page or a browser-localhost URL. Verify the host exposes `magpie.page.service`. |
| Setup fails | Open from an authenticated Magpie page; allow one first-use write to finish. Preserve existing options; repair/remove both malformed credential fields before explicit setup. Do not repeatedly rotate. |
| Service unavailable / port conflict | Check Magpie’s sanitized plugin-host diagnostics, unused `port`, the real Bun runtime and matching configuration directory. Do not kill an unknown listener. |
| Waiting after host reload | A compatible old owner may drain for up to ten minutes plus takeover grace. Keep the page open/Refresh. A revoked owner should stop promptly. |
| Stale/disconnected | Check same-container loopback gateway and `MAGPIE_ADDR`; stale data is not live traffic. No remote-gateway or environment-proxy fallback is attempted. |
| Incompatible gateway | Verify trace capability/shape and the compatibility matrix. Empty traffic is not a compatibility failure. |
| Unauthorized / access stopped | Reopen the plugin page or Refresh to re-read options. Confirm the installation is enabled and unique; do not copy tokens into URLs. |
| No sessions | Generate ordinary agent traffic through Magpie with native session headers. Remote clients do not need local files; missing/overridden/truncated original identity cannot be recovered. |
| No cost / attempt history | This is expected when the selected source lacks pricing or retained attempts. A bounded trace/ledger is not a conversation archive. |
| Selection resets on reopening | Expected sandbox limitation; see FR-02.4 above. |

Disable/remove using the **exact installation path/spec shown by `magpie plugin list`**, or the corresponding Magpie plugin controls. For the local-path installation above:

```sh
magpie plugin off /absolute/path/to/magpie-session-route-plugin
magpie plugin rm /absolute/path/to/magpie-session-route-plugin
```

Use the extracted package path instead if that is how you installed it. The manifest package name is not necessarily the CLI installation identifier. Do not terminate the shared Bun host to stop this plugin. Other plugins/provider RPCs and normal routing are not owned by it.

## Development and checks

```sh
npm ci
npm test
node --test test/ui.test.mjs
npm run check
npm run test:browser
BROWSER=webkit npm run test:browser
```

Browser tests need compatible installed Playwright browser binaries and OS libraries. They use a protocol-shaped sandbox/proxy and synthetic metadata, not paid model APIs. Real Magpie integration is a separate containment-enforced harness:

```sh
MAGPIE_GO=/absolute/path/to/go node test/magpie/build.mjs
npm run test:magpie -- --probe
MAGPIE_BUN=/absolute/path/to/verified/bun npm run test:magpie
```

Use only an approved genuine runtime. The harness uses an isolated HOME/config and blocks external networking; do not bypass containment or use real provider credentials when prerequisites are unavailable. See [validation](docs/validation.md) for reproducibility, environment gaps and exact passing evidence.

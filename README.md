# Session Routing for Magpie

A read-only plugin page that copies Magpie's **native upper Routing block**, changing client/source grouping to the exact **agent + recorded native session ID**. Different sessions of the same client have separate source nodes; concurrent requests in one session share one source and keep independent native flights. Right-hand account/provider/model rows remain shared. The original **Routing** page and **Routing Groups** editor are not replaced.

**v0.3.2 — native nested sub-agent rows.** Sub-agent activity now uses the original nested-routing-group row presentation, indented inside its session, with observed models and request states instead of actor IDs or numbered labels. The project labels and provider branding corrected in v0.3.1 remain, as do shared destinations and original session-level flights. Existing release tags are unchanged. Custom uploaded provider artwork remains unsupported. See [validation](docs/validation.md) for version-specific evidence and remaining boundaries.

The service runs **inside Magpie’s existing Bun plugin host**, listening only on `127.0.0.1`. No extra daemon/container, model calls, routing middleware or persistent traffic archive is added. The browser reaches it through Magpie’s authenticated plugin-page service proxy—not the browser’s localhost.

## Compatibility and verification

Tested against Magpie **v0.1.3124**, commit `3f53fa1f316330b77e5ff6d065a7a56980cafda2`, with genuine **Bun 1.4.2**. These are the declared deployment minimums; older versions are not certified, and future versions still require compatibility checks. Source inspection, Chromium/WebKit protocol tests and isolated real-host integration are separate claims. See [compatibility](docs/compatibility.md) and the [AC-01–AC-14 validation matrix](docs/validation.md) for exact results and outstanding deployment checks.

The package is named `magpie-session-routing` and is distributed through GitHub; it has not been published to npm. It has no runtime npm dependencies and needs no asset build step. Node 22+ is for development/tests; deployment uses the genuine Bun runtime managed by Magpie.

## Install in an existing Magpie installation

The commands in this section select **v0.3.2**, including native nested sub-agent rows and the earlier project/provider display corrections. Use the local-directory method below to test a local checkout.

Run under the same account and configuration environment as Magpie:

```sh
magpie plugin add github:tsunheimat/magpie-session-route-plugin#v0.3.2
magpie plugin list
```

### Quick install on k3s / Kubernetes

Run the CLI inside the **existing Magpie container**, not on the Kubernetes host:

```sh
kubectl exec -n <namespace> <magpie-pod> -c <magpie-container> -- \
  magpie plugin add github:tsunheimat/magpie-session-route-plugin#v0.3.2
```

The official image keeps configuration and installed plugins under `/config`; persist that mount with your existing PVC. Leave the container's HOME/XDG environment unchanged. No extra pod, Service, Ingress rule, or exposed plugin port is needed. Refresh the WebUI after installation; a pod restart should normally be unnecessary. Then complete secure first-use setup below. This is a single-instance plugin, not a cross-replica collector.

### Upgrade from v0.1.0 through v0.3.1

Run the same `magpie plugin add github:tsunheimat/magpie-session-route-plugin#v0.3.2` command inside the existing Magpie container. These versions use the same package name `magpie-session-routing`, so Magpie replaces the existing entry and preserves its options and enabled/disabled state. **Do not remove the old entry first**—removal deletes its saved options. Close/reopen Session Routing after the upgrade; previously configured secure access is reused.

`magpie plugin update` alone reinstalls a Git plugin's existing pinned spec; it does not change an earlier pin such as `#v0.3.1` to the new tag. If you previously installed from a local directory or have multiple entries, inspect `magpie plugin list` and use the appropriate installation path rather than creating another enabled instance.

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
| `showProjectNames` | `true` | Show only the final component of a recorded project folder in the native source label. Set false to withhold it. No repository/session-file lookup. |
| `showFolders` | `false` | Separately allow the recorded folder value in responses/tooltips. This can expose parent path components; project-name display alone does not enable it. |
| `installationId` | Unset | Generated per installation by first-use setup. Do not reuse across separate installs. |
| `apiToken` | Unset | Generated 32-byte base64url bearer credential. Keep private. |

**Display-privacy migration:** a missing `showProjectNames` option defaults to true, including installations upgraded from v0.3.0. This newly discloses a validated project basename, but not the rest of the recorded folder. Set `showProjectNames: false` to opt out; leave `showFolders: false` to withhold folder paths. The plugin does not rewrite saved options or credentials. Changing either option invalidates the old service's authorization and projection.

A CLI host can receive a temporary service port from Magpie. It must not become a second collector. Overlapping regular hosts perform an authenticated ownership check and wait for the existing owner to release the port; old Magpie hosts can drain for ten minutes. An unrecognized owner permits only a short, bounded exclusive-bind retry so a revoked old host can close during credential rotation; it is never trusted as a compatible owner. Unknown port owners are not killed, probed with a bearer token, or silently replaced by another port. Configure an unused port if the conflict remains.

## Using the native-copy page

This is the actual copied native upper block, not a newly drawn equivalent. There is **no new session dropdown, per-request source card, custom Details drawer or six-request/twelve-destination limit**.

- **Session sources:** `(agent, recorded session)` is exact and case-sensitive. Claude Code/session A and Claude Code/session B get separate native source nodes. Two requests in session A share one node but keep independent native request flights. Codex/session A remains separate from Claude Code/session A. The original client icon/name/color remain; the existing subtitle shows a shortened session discriminator.
- **Projects:** a recorded project basename appears even for a session with only one project, followed by the short session discriminator. Model and full session ID remain in the native tooltip. Missing evidence is not guessed, and equal project names do not merge sessions.
- **Sub-agent activity:** indented native nested-group-style rows sit inside their recorded session. Each row shows “Sub-agent”, concrete observed model(s) and request activity; no actor IDs or substitute numbers appear. Repeated requests by one actor share its row, even across models; different actors remain distinct even when their models match. Models come from active requests, or retained ended requests if none are active. Kind-only or conflicting identity evidence stays one “Sub-agent activity” aggregate, not an invented worker count. The list folds and scrolls without an additional actor cap beyond the retained trace. This is a one-level session subdivision, not a recursive agent tree: trace does not expose a complete parent-agent chain, and `parentSession` is title-helper metadata. Flights still use the session's native source wire/origin; independent recorded sessions remain separate. “Requests ended” never means the worker's whole task finished.
- **Identity boundaries:** model/provider/folder changes do not split a known session; parent/child metadata does not merge recorded sessions. Missing or invalid session identities are labelled unknown and isolated per stable request, never assigned to a known session. This page cannot recover a header that Magpie already overrode or truncated.
- **Destinations:** the original account/provider/model rows, reconciliation, folds and wires are retained. Safe account handles are shared across requests and sessions, so the same observed seat stays one native destination rather than becoming a new row per request.
- **Native limits and motion:** the copied staging policy admits at most four source identities. The separate native `LIVE = 4` startup/resume request cap is also unchanged. Requests remain independently keyed inside the native flight/replay engine; this is not a claim that every concurrent request always has a visible animation. Original curves, bird artwork and animation algorithms are retained, with a hosting lifecycle that pauses on hidden/stale/disconnected views and clears obsolete state after a backend reset or authorization failure.
- **Native upper interactions:** retained replay, focus, mask and account-fold behavior changes presentation only; replay never sends a model request. Lower Requests/Groups/provider editors, raw body/context viewers and configuration writes are outside this page. Settings links into excluded editors must not appear to perform a supported edit.
- **Evidence boundaries:** the feed contains recent retained trace evidence, not full provider inventory. Safe recorded provider display names and their bundled native icons are preserved; account/key/group identities remain neutral labels, and masks cannot disclose originals. Unsafe provider names fall back to neutral labels. Arbitrary uploaded (`file:`), remote or unbundled artwork remains unsupported and uses a generic icon rather than another guessed brand. Available quota/rest/attempt evidence is preserved, but unknown values and withheld explanation details must remain unavailable. In particular, candidate count cannot justify the native sentence that only one configured account is enabled.
- **Counters:** native gateway totals describe the gateway since its start, not the visible sessions. Missing counters are unavailable, not zero. The legacy scoped metrics/history APIs are retained separately; a period selector or history list is not added to this upper block.
- **Shared service:** each frame reads the cached safe native feed. Multiple viewers still share one gateway collector. Hidden frames pause; authorization failures clear sensitive presentation and re-read options without rotating credentials.

[Native-copy provenance](docs/native-copy-provenance.md) records the pinned original sources, deterministic extraction, session patch and unavoidable read-only/privacy differences. [Validation](docs/validation.md) separates original-to-extraction checks from extraction-to-session-copy checks.

### Sandboxed preferences (FR-02.4)

Magpie deliberately sandboxes this page without same-origin privileges. Browser storage is normally blocked, and there is no supported per-viewer storage bridge. Frame-local presentation preferences cannot be promised to persist across reloads; storage access must be guarded. No tokens are stored there, and no viewer preference is written into installation-wide plugin options. The earlier session-selection persistence requirement is not met by adding a selector to this native-copy scope; the corrected upper block has no such selector. Weakening sandboxing is not a workaround.

## Retained scoped API metrics and coverage

The following definitions apply to the existing normalized state/history APIs, **not** the native upper block's gateway-wide counters. These backend APIs remain available; this section does not imply that their former selectors/metric grid/history panels are still displayed. API totals cite their scope and source; unavailable values are not zero.

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
| No session sources | Use ordinary agent traffic through Magpie with native session headers. Remote clients do not need local files; missing/overridden/truncated original identity cannot be recovered. Native staging limits also apply. |
| No cost / attempt history | Expected when the source lacks pricing or retained attempts. The native upper block does not add the earlier history panel; a bounded trace/ledger is not a conversation archive. |
| Presentation preferences reset on reopening | Expected sandbox limitation; see FR-02.4 above. |

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

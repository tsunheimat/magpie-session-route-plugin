# Compatibility

**v0.3.1: project/sub-agent/provider display corrections.** The pinned native source and deployment floor are unchanged. Current verification passes 183 unit/API tests plus separate browser fixtures, 19 service tests and 13 comparison tests per engine, and 14 contained Magpie/Bun checks. Historical results for earlier releases remain separate. See [validation](validation.md) for current evidence and [provenance](native-copy-provenance.md) for deliberate source/data changes.

## Verified reference

- **Magpie v0.1.3124**, commit `3f53fa1f316330b77e5ff6d065a7a56980cafda2`.
- **Bun 1.4.2** genuine Linux x64 baseline runtime, verified by the integration harness against its pinned executable hash.
- **Go 1.26.10** built the headless reference offline; provenance is in `artifacts/integration/build.json`.
- **Node v24.18.0** runs the development harness and focused frontend tests. Package development minimum: Node 22.
- **Playwright 1.63.0**, **Chromium 153.0.8010.12** (revision 1243) and **WebKit 26.6** (revision 2359): the released v0.1.0 protocol suites each passed 8/8 locally, but its subsequent GitHub CI WebKit job failed mobile overflow at 390px. The v0.2.0 diagram-first redesign passes **12/12 locally in each engine**, including a reproduced and corrected native-select overflow case. The original v0.1.0 tag is unchanged; see the repository's GitHub Actions for commit-specific CI results. Baseline results and redesign evidence are separated in [validation](validation.md). Playwright is development-only.

The exact reference passed the actual local-path CLI → real Bun host → authenticated WebUI proxy → synthetic native-header requests/trace/usage-ledger integration on 2026-11-06. Baseline evidence: `artifacts/integration/run-Y5TfkG/result.json`, completion `2026-11-06T08:15:35.705Z`, twelve passing checks, `referenceUnchanged: true`. Version 0.2.0 also passed the same twelve checks on 2026-11-08; see [validation](validation.md) for the separate result. This establishes a tested reference, not a promise about every future release. Docker and external HTTPS deployments were **not** covered by that loopback HTTP integration.

The plugin feature-checks the installed gateway rather than treating a version string as proof of every API field. Older versions are not certified. An incompatible/denied/malformed trace is a distinct state from an empty trace.

## Integration contracts

| Host/API surface | Contract used | Consequence |
|---|---|---|
| Bun plugin host | Default export with `id` and `server(input, options)`, returns `{}` | Starts inside the existing host; no detached daemon/process termination. |
| Configuration directory | `input.directory` identifies Magpie configuration; `plugins.json` authorizes each sensitive response | `input.serverUrl` is not used as the gateway address. |
| Gateway address | Validated loopback interpretation of `MAGPIE_ADDR`, default `127.0.0.1:3425` | Same host/container namespace required. No browser-localhost or arbitrary remote URL fallback. |
| Page service | `magpie.page.service = { port: 3496, option: "port" }` | Separate plugin page; no `replaces` field. |
| Page bridge | Source-checked `{magpie:1,id,method,params}` messages, hello/options/theme/visibility | Launcher provisions through plugin options, then navigates the existing iframe. Service document reacquires options from its parent and keeps API/asset URLs relative. |
| Proxy security | Page-token URL authorization, loopback Host rewriting, null-Origin handling, CSP `self` source rewriting | Proxy does not inject the plugin bearer credential. Plugin must authenticate its own JSON APIs. |
| Trace | `/api/hello`; `/v1/magpie/trace`, then `after=<seq>&wait=1`; whole-route replacements and complete retained `ids` | One collector shared by browsers; resnapshot on uncertain continuity/reset; bounded retention is not lifetime history. |
| Native upper block | Pinned native source/CSS/helpers/translations/artwork, deterministic extraction and separate session-source patch | Preserve native rows/curves/flight algorithms; no whole-app bootstrap or lower editors. Four-source and `LIVE = 4` limits remain. |
| Native data shape | Allowlisted `aggregator.nativeSnapshot()` from the same trace transaction | Stable shared opaque seats; exact agent/session; bounded observations; no raw trace/config/body passthrough or second poller. No inventory-based explanation without evidence. |
| Usage | `/v1/magpie/usage/requests` with `period`, pagination, `via=through&computer=this` | Retained backend API: local scoped filtering, bounded shared scans, immutable pagination. Not a history panel added to the selected native upper block. No exact server-side session filter assumed. |
| Lifecycle | Old hosts may drain for ten minutes; no per-plugin disposer | Independent installation watchdog and an eleven-minute ownership-verified standby window; an unrecognized owner gets only a short bind-only grace for rotation shutdown. No kill/reusePort/silent port change. Canonical same-process replacements join old collectors before starting new ones. |
| CLI temporary ports | Magpie can override the effective port | Temporary-port hosts do not create a duplicate telemetry collector. |

Relevant source contracts were inspected under `internal/plugin/{host.js,host.go,store.go}`, `internal/gui/{pagebridge.js,pageservice.go,pluginpage.go,assets/pluginpages.js}`, `internal/gateway/trace.go`, and the usage API/ledger implementation. No Magpie source change is required or included.

## Explicit limitations

1. **FR-02.4 persistence is not guaranteed.** The sandbox denies ordinary browser storage and supplies no per-viewer persistence bridge. Presentation preferences are frame-local with guarded storage access. The corrected native upper block has no session selector; the earlier selector-persistence requirement is not claimed as met. No server-wide options are misused for viewer preferences.
2. **No remote gateway trace mode.** The read-only telemetry API is privileged loopback access. Keep service and gateway in the same container/network namespace.
3. **No original-identity recovery.** Session IDs are those actually recorded by Magpie. Missing/overridden/truncated identities and unsupported canonicalized history cannot be reconstructed. Unknown traffic remains unassigned.
4. **Display metadata is not identity.** Project basenames are recorded-folder metadata controlled by `showProjectNames` (new default true); parent path components remain behind separate `showFolders:false`. Safe configured provider names and bundled icons are preserved. Account/key/group labels remain neutral, and the native mask cannot reveal originals. No session titles are inferred.
5. **No fabricated historical topology or prices.** Detailed attempts require retained trace evidence with conservative joining. Unpriced zero is unknown; absent timings are not zero. Multiple billable handed-on rows need not imply multiple completed requests.
6. **No multi-replica aggregation.** Each instance has independent loopback telemetry, page tokens and caches. Use instance-pinned access and distinct installation identities. A load-balanced view is not a fleet total.
7. **Not a defense against trusted local code.** A local plugin/process with access to configuration/trace is inside the trust boundary. In particular, the parent bridge cannot authenticate the content served by a hostile process already occupying the configured service port.
8. **No certified Docker/remote HTTPS deployment yet.** Same-container installation and log-redaction instructions are supplied, but require validation in the operator’s real image/proxy setup. Actual Bun + Magpie loopback integration is not equivalent to those deployment tests.
9. **No production agent-process test claim.** Integration uses deterministic loopback providers and synthetic native Claude/Codex headers, not real agent session files, provider credentials or paid model calls.
10. **Native-copy privacy/read-only boundary.** Full provider inventory, raw rule/classifier narratives, body/context viewers and lower configuration editors are not exposed. Unsupported enabled-account counts/explanations are withheld rather than faked. Gateway totals are global since-start evidence, not session totals. Every extraction/hosting/data change is distinct from the source-grouping patch; copying the renderer alone does not establish complete visual/semantic parity.

11. **Sub-agent boxes are observed activity, not ancestry.** The trace has `sub` and turn-specific `subagentId`, but no complete parent-agent chain. Flat child boxes stay inside their exact recorded session; title-helper `parentSession` never reparents workers. Kind-only/conflicting identities remain unknown activity. Original request flights remain session-level.
12. **Only bundled artwork is available.** Public native logos use the full local inventory rather than a guessed brand table. Uploaded `file:` images, remote URLs and unbundled artwork are not fetched; explicit unsupported artwork becomes generic instead of silently selecting another brand.

## Upgrade checklist

1. Run unit, security/lifecycle and frontend controller tests.
2. Exercise Chromium and WebKit in an opaque-origin sandbox: source-checked bridge, null Origin/CSP, first-use setup, multiple session sources, same-session independent flights, shared destinations and stale/reset/revocation behavior. Compare original native → extraction and extraction → session patch separately; inspect screenshots, not only DOM assertions.
3. Run the isolated real Magpie/Bun harness against the exact candidate reference; record the version/commit/runtime and keep the source checkout unchanged.
4. Inspect package contents with `npm run check`; ensure no credentials, logs, browser artifacts or test fixtures are distributed.
5. In the actual deployment, validate same-container Docker installation and remote HTTPS proxying with page-path/header redaction. Do not expose the loopback service port.
6. Only claim a new tested version/floor after the applicable checks succeed; do not infer one from source inspection alone.

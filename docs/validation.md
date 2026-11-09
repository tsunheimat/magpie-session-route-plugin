# Validation

This record distinguishes **implemented**, **automatically tested**, and **deployment-verified** behavior. A loopback/protocol fixture is not a Docker, external HTTPS or production agent-process test. Generated artifacts are excluded from the npm package.

## v0.3.1 project, sub-agent and provider corrections — 2026-11-09

The user reported three v0.3.0 display gaps: project names disappeared under per-session grouping; sub-agent requests had no activity boxes; and the adapter replaced provider names/icons despite copying the renderer. Version **0.3.1** was developed on `fix/native-display-metadata`, based on released `2dbdedf`. It keeps the original destinations/flight engine and session source identity. New tests exercise raw recorded branding through the real projector/service, not only renderer inputs whose metadata was already substituted.

The user explicitly requested commit, merge, push and release after the local results were presented. Distribution is through GitHub source/tag/release, not npm or a cluster deployment. The v0.3.0 results and runtime fingerprint below remain historical and do not certify this version. No deployment or Magpie core change is part of this release.

Implementation now adds independent `showProjectNames:true` / `showFolders:false` disclosure controls, source-local flat actor-request boxes, safe recorded provider display names and all supported pinned icon tokens. Original source keys, four-source admission, `LIVE = 4` startup/resume, request flight endpoints and right-side reconciliation remain unchanged. The deterministic source patch now records **28 replacements**; native CSS is unchanged, and the child-box extension is scoped in plugin-owned CSS.

Runtime fingerprint: **`bb352f3923970b70fb5e73315a37301635a62549d47bb2ed2726e52aaba71512`**, using the same 222-file runtime hashing method documented for v0.3.0 below (with this version's actual file bytes and manifest).

Current verification:
- Unit/API: **183 passed, 1 explicit browser-only skip, 0 failed** (184 total), Release rerun: `artifacts/release-v0.3.1-wz91GD/unit.log`.
- Chromium and isolated WebKit protected-service: **19/19 passed in each**, Release reruns: `artifacts/release-v0.3.1-wz91GD/chromium.log` and `webkit.log`. New cases verify single-project visibility/path privacy, raw provider names/artwork (including invalid explicit icon handling), sub-agent concurrency/unknown identity, stable child DOM, collapse/mobile layout, exact native curved return endpoints and removal on eviction/stale data.
- Original/extraction/session + raw-branding comparisons: **13/13 passed in each engine**, `artifacts/native-routing/display-metadata/{chromium,webkit}-parity-final.log`. Four additional raw provider cases feed unmodified upstream separately from the actual protected service; `{chromium,webkit}-raw-branding-parity.json` records exact name/icon matches for Gemini CLI, Antigravity, Kiro and StepFun with a configured Unicode label. This specifically catches adapter substitutions hidden by comparing sanitized inputs only.
- Syntax/provenance/package: **46 scripts, 229 package files, below 6 MiB**, deterministic regeneration and whitespace checks passed.
- Contained actual Magpie/Bun: **14/14 checks passed**, Release rerun `artifacts/integration/run-aQnMaA/result.json`, completion `2026-11-09T07:11:43.169Z`, reference unchanged. The earlier display-correction run `run-m94uE3` also passed. New real-header calls verify safe project basenames, configured provider names and shared tool-less actor identity without paths/raw IDs. Synthetic HOME/work and processes are removed; external egress stays blocked.

Intermediate failures are not counted as passes. The first production-service runs exposed two test mistakes: the branding fixture reused one account ID across different providers (unlike native provider-qualified IDs), and the endpoint assertion assumed six horizontal pixels instead of six **path-length** pixels on the native curve. Corrected tests use proper raw seat identities and sample the actual source SVG path; they retain exact session/source checks and a 1px geometry tolerance. No runtime/flight algorithm changed to accommodate them. One WebKit comparison's fixed 100ms wait was replaced by waiting for the asserted activity state. A WebKit service run overlapped another WebKit suite and encountered a screenshot-stability timeout; that log alone does not establish the cause. Subsequent final suites are run sequentially to avoid the known headless presentation contention, without retrying assertions or loosening CSP.

Screenshots inspected include actual protected-service desktop project/sub-agent boxes and WebKit mobile dark, plus original native comparison fixtures. Logs/screenshots for this work are local under `artifacts/native-routing/display-metadata/` and `artifacts/browser/native-service/`; they are not packaged. All final browser/comparison runs above passed. Selected screenshots:
- [Project names and sub-agent activity, actual service](../artifacts/browser/native-service/chromium-project-subagents-upper.png)
- [WebKit mobile dark, actual service](../artifacts/browser/native-service/webkit-project-subagents-mobile-dark-upper.png)
- [Original Gemini CLI branding](../artifacts/native-routing/display-metadata/chromium-brand-gemini-original.png)
- [Gemini CLI through the protected plugin](../artifacts/native-routing/display-metadata/chromium-brand-gemini-protected.png)
- [Antigravity through protected WebKit](../artifacts/native-routing/display-metadata/webkit-brand-antigravity-protected.png)

The new project-name default applies to missing options on existing installations without rewriting them; opt out with `showProjectNames:false`. Child boxes retain every relevant observed actor, with a scrollable/collapsible area and explicit outside-view count. The new activity messages include zh-TW translations; other locales use English fallback. Account/key/group aliases, arbitrary uploaded artwork, unavailable inventory and full worker ancestry remain outside the corrected provider/project display contract.

## v0.3.0 native upper-block copy — 2026-11-09

The requested behavior is the actual native upper Routing block with client-source grouping by exact agent + recorded session. Version 0.2.0's custom renderer, session selector and per-request source nodes did not meet that requirement even though its automated tests passed. Version **0.3.0**, developed on `feat/native-session-clients`, uses the actual pinned source/CSS/artwork, deterministic extraction and a separate **25-replacement source-grouping patch**. The user explicitly requested merge and release after the comparison screenshots and known differences were presented; this does not erase the measured differences or establish pixel-identical parity.

Runtime fingerprint: **`d1f39f46e7188ea6de7d59fbc839b2eec3d4a888c0ad5b5051c583a0955ac3f8`**, over 222 lexically sorted paths: `index.mjs`, `package.json`, files directly under `lib/` and `page/`, the four UI shell files, every path in `ui/vendor/magpie/static-manifest.json` prefixed with `ui/`, and that static manifest itself. SHA-256 input is each UTF-8 path + NUL + file bytes + NUL; documentation/tests/provenance-only snapshots are excluded.

### Current results

| Check | Native-copy result / evidence |
|---|---|
| Unit/API suite | **167 passed, 1 explicit browser-only skip, 0 failures** (168 total). The skipped browser fixture is run separately below. Versioned release rerun: `artifacts/native-routing/release-unit.log`. |
| Production-service Chromium | **16/16 passed**, including enclosing test. Release rerun: `artifacts/native-routing/release-chromium-corrected.log`. |
| Production-service WebKit | **16/16 passed**, existing isolated library runner. Release rerun: `artifacts/native-routing/release-webkit-corrected.log`. No dependency/system installation. |
| Independent three-way comparison | **10/10 passed in each engine**, including eight desktop/mobile × light/dark × reduced/normal-motion variants. Original upstream → extraction and extraction → session patch are separate comparisons; the observed differences below are retained, not asserted away. `artifacts/native-routing/{chromium,webkit}-parity-tests.log` and `*-parity-matrix.json`. |
| Syntax / package / provenance | **Passed:** 46 JavaScript files, deterministic generator `--check`, exact 229-file package below 6 MiB. Original CSS and relevant destination/flight source ranges remain byte-equal; native `LIVE = 4`, startup/resume slice and four-source policy remain unchanged. No pristine/test-only source is served or packaged. |
| Actual Magpie/Bun | **13/13 checks passed**, pinned Magpie v0.1.3124 / genuine Bun 1.4.2 / Node v24.18.0. Release-candidate rerun `artifacts/integration/run-3JE5Ae/result.json`, completion `2026-11-09T04:18:36.695Z`, `referenceUnchanged: true`; previous native-copy run `run-UBk5rk` also passed. This adds native-endpoint shared-seat/privacy/query/auth/static checks to the earlier twelve checks. |
| Screenshot inspection | 48 matrix screenshots plus supplementary concurrent-session captures were generated. Original/extracted/session desktop light, mobile dark, concurrent sessions and production-service multi-route mobile screenshots were opened and visually inspected. |
| Distribution / deployment | **v0.3.0 targets GitHub source/tag/release distribution, not npm or a cluster deployment.** Publication and commit-specific CI are independently visible in GitHub. This does not fix or certify the user's Authentik/Ingress path. |

Production-service tests use the real plugin HTTP server, aggregator, protected endpoint and packaged assets in a protocol-shaped opaque iframe. They cover two tabs/one collector; exact agent/session sources; shared destinations; source-local folders; no rekey on model/parent changes; unknown identities; native four-flight cap; fifth-source refill; independently observed outbound/reply/replay endpoints; retry/fallback/terminal errors; concurrent narrative hold; keyboard folds; sky layering; idle frames; hidden/stale/revoked/reset states; first-use setup; locale changes; and desktop/mobile overflow under both themes/motion settings. They replace obsolete custom-renderer assertions, not merely skip them. Existing scoped/history API, privacy and lifecycle tests remain.

The actual-host harness uses independent network/PID namespaces, synthetic HOME/config/work and loopback-only providers. It checks the authentic CLI/Bun/WebUI HTTP path and removes synthetic state/processes afterward. **Browser rendering is tested separately, not as an end-to-end browser session inside actual Magpie.** No real agent files, provider credentials, external model requests or live configuration were used.

### Observed parity differences — not pixel-identical

1. **Original → extraction:** at equal 956px desktop block width, retained stage/source/hub/account/caption/statistics/steps geometry and sampled styles match. Configured-account counts and body/usage/editor actions are deliberately absent because this read-only service has neither full inventory nor permission to disclose raw content. On mobile, removing those actions reduces the log header from 90px to 44px (46px less block height); the routing-stage geometry is unchanged. Normal-motion Chromium records occasional approximately 0.00003px wire-coordinate differences, left visible in the reports.
2. **Extraction → session patch:** the new source subtitle/tooltip identifies the session. In the desktop fixture, native `fit-content` sizing grows the source from **124px to 137.69px**, shifts hub/account rows about **13.69px**, and narrows the account column. Mobile one-session geometry is unchanged. No CSS workaround or replacement layout was introduced. This desktop reflow is a visible difference requiring review, not a claim of pixel-identical parity.
3. **Safety/data adaptations:** custom names become stable neutral labels, missing inventory/measurements/outcomes remain unavailable, unsupported explanations are withheld, and lower configuration/body/context actions are excluded. Full details are in [native-copy provenance](native-copy-provenance.md). Passing comparison tests do not mean these differences vanished.
4. **Localization:** copied native translations were exercised in en, zh, zh-TW, ja and de. New unavailable-evidence/outcome/time messages currently fall back to English; their localization is incomplete.

Primary local screenshots:
- [Three-way comparison sheet, same fixture](../artifacts/native-routing/native-copy-comparison.png)
- [Original native, desktop light](../artifacts/native-routing/chromium-desktop-light-reduce-native-original.png)
- [Extraction-only, identical fixture](../artifacts/native-routing/chromium-desktop-light-reduce-extracted-baseline.png)
- [Session patch, identical fixture](../artifacts/native-routing/chromium-desktop-light-reduce-session-patched.png)
- [Two sessions, original shared destination rows](../artifacts/native-routing/chromium-sessions.png)
- [Original native, WebKit mobile dark](../artifacts/native-routing/webkit-mobile-dark-reduce-native-original.png)
- [Session patch, WebKit mobile dark](../artifacts/native-routing/webkit-mobile-dark-reduce-session-patched.png)

These artifacts are local and intentionally excluded from the distributable. The evidence directory is `artifacts/native-routing/`; protected-service screenshots are under `artifacts/browser/native-service/`.

### Remaining boundaries

- Merge/release was explicitly requested after the screenshots and desktop reflow were presented. No separate statement of pixel-identical visual acceptance was made; automated tests and release authorization do not establish that claim.
- Relevant upper-stage regressions were adapted, not the whole Magpie test suite or every combination of partial evidence.
- WebKit retains the documented headless native pointer/wheel activation workaround. Playwright's screenshot-only `body {}` injection is narrowly identified and excluded from application-error counting after verifying the injected text; production CSP still blocks it. An initial packet assertion selected a canceled historical packet; the implementation-phase test was corrected to track a held flight. The first v0.3.0 release rerun nevertheless failed a separate lifetime packet-count assertion (`6 !== 3`, 14 passed / 2 failed including the enclosing test), recorded in `artifacts/native-routing/release-webkit.log`; it is not counted as a pass. A controlled real 1.2s main-thread stall reproduced the same `6 !== 3` result with a measured 1246ms frame gap: native `frame → resume → stopPlays` canceled three outbound packets, then three replacements returned correctly. The original failed run did not record its triggering gap duration. The regression now deliberately exercises real host hide/resume, distinguishes canceled observation history from the exact three held packets, verifies their source endpoints, and requires two unchanged polls plus completion to create no extra/replacement flights; replay must create exactly one. Runtime/animation code is unchanged. The corrected full Chromium and WebKit suites each pass 16/16; no assertion retries, forced clicks or failure filtering were added.
- Physical-device Safari, actual Docker/remote HTTPS deployment and real agent executables remain unverified. The existing sandbox persistence limitation remains; the new upper block has no session selector.

Results in the release sections below are historical and do not certify the native-copy replacement.

## v0.2.0 visual redesign — 2026-11-08

Version `0.2.0` replaces the card-based interface with a diagram-first routing stage; the original `v0.1.0` tag remains unchanged. Its runtime fingerprint, calculated by the method below, is `6713f01f546debf1176657b40265f819990dea8356ff327e163299d1c628b3e7`. The backend, launcher, authorization bridge and Magpie reference source were not changed.

| Check | v0.2.0 result |
|---|---|
| Unit/API suite | **157/157 passed**, `npm test`, including 40 focused UI tests; no failed/skipped tests. |
| Chromium | **12/12 passed** (eleven scenarios plus enclosing test), Playwright 1.63.0 / Chromium 153.0.8010.12. `artifacts/browser/chromium-final.log`. |
| WebKit | **12/12 passed**, Playwright 1.63.0 / WebKit 26.6, using the same verified isolated library runner as the baseline. `artifacts/browser/webkit-final.log`. This is local verification, not a new GitHub CI run or physical-device Safari test. |
| Package / syntax | **Passed**, `npm run check`: 32 JavaScript files, 22 package files. `git diff --check` passed. |
| Real Magpie/Bun | **12 checks passed** again with the redesigned package, Magpie v0.1.3124 / Bun 1.4.2 / Node v24.18.0; completion `2026-11-08T15:36:12.387Z`, `referenceUnchanged: true`. Result: `artifacts/integration/run-ChmlQj/result.json` and `artifacts/integration/latest-result.json`. This validates actual host/API integration, not browser rendering through the external deployment. |
| Default-view inspection | Desktop light/dark and mobile dark screenshots were opened and compared with the native Routing stage. One shared diagram is primary; Details is closed, without an initial metric grid or request log. |
| Distribution/deployment | GitHub source tag/release `v0.2.0`; not published to npm or installed into the user's cluster by this work. Authentik/Ingress CSP behavior is separate; a successful localhost port-forward does not prove the external HTTPS path works. |
| Historical CI follow-up | Main-branch run [42495804710](https://github.com/tsunheimat/magpie-session-route-plugin/actions/runs/42495804710) passed all four jobs. The later same-commit tag run [42496037982](https://github.com/tsunheimat/magpie-session-route-plugin/actions/runs/42496037982) failed Chromium and canceled WebKit; both unit jobs passed. The earlier green run does not override that tag-run failure. |

Browser coverage retains two-tab isolation, late-response rejection, setup/privacy, history accounting and replay invariants. New checks cover closed/lazy Details, exact same-label destination separation, bounded omission indicators, source/path interaction, stable DOM nodes and wires across polls, zero-candidate/orphan evidence, and normal-motion flights that do not resend on unchanged snapshots. Motion is tested through completion, stale/disconnected state, parent visibility, reduced motion, history, replay, scope changes and backend replacement. Keyboard/touch, long labels, dense graphs, both themes and open/closed details are exercised.

**WebKit overflow correction:** reproduced 407px document width (743px with long options) at a 390px viewport. The native select's border box fit, but selected-label internals propagated overflow into `.session-field`. Native-select `contain: inline-size layout`, single-line text and ellipsis restored a 390px document without body/root clipping, increased viewports or weaker assertions. Evidence: `artifacts/browser/webkit-overflow-probe.log` and `webkit-overflow-fixed.log`. Headless WebKit's native-input presentation workaround remains documented below; no forced clicks or automatic failure retries were added.

Selected screenshot paths:
- `artifacts/browser/chromium-desktop-light-default-viewport.png`
- `artifacts/browser/webkit-desktop-dark-default-viewport.png`
- `artifacts/browser/webkit-mobile-selected-dark-viewport.png`
- `artifacts/browser/webkit-desktop-light-details.png`
- `artifacts/browser/chromium-desktop-dense-dark-routes.png`

The historical results below remain attributable to the released baseline, not to this changed UI.

## Released v0.1.0 baseline — 2026-11-06

The baseline runtime bundle SHA256 is `aa132d0e8fb53e55ddd1d1fe330c0635ec131048db14c808ea6001c31162409a`: hash the lexically sorted paths `index.mjs`, `package.json`, and files directly under `lib/`, `page/`, `ui/`, each as UTF-8 path + NUL + file bytes + NUL (19 files). Documentation and tests are not part of that fingerprint.

### Recorded baseline results

| Check | Result / scope |
|---|---|
| Focused frontend tests | **27/27 passed**, `node --test test/ui.test.mjs`, Node v24.18.0. Includes scope/late-response guards, sequential refresh, hidden-page abort/resume, canonical credentials, 401 refresh without rotation, revocation, transient stale state, fresh-discovery expiration, immutable history pagination/visibility resume, backend replacement, retryable parent handshake, direct-only session hints, orphan billing labels, secure setup and measured fallback contrast. |
| Frontend syntax | `node --check` passed for `page/boot.js`, `ui/bridge.js`, `ui/app.js`. |
| Reference build | **Passed offline** using Go 1.26.10, Magpie v0.1.3124 commit `3f53fa1f316330b77e5ff6d065a7a56980cafda2`. Provenance: `artifacts/integration/build.json`. |
| Containment probe | **Passed** before running Magpie: external egress denied, synthetic HOME only, real homes hidden, allowlisted environment and PID namespace. `artifacts/integration/containment-result.json`. |
| Actual Magpie/Bun integration | **12 checks passed**, Magpie v0.1.3124, genuine Bun 1.4.2, Node v24.18.0. `artifacts/integration/run-Y5TfkG/result.json`, completion `2026-11-06T08:15:35.705Z`, `referenceUnchanged: true`. |
| Chromium protocol browser suite | **8/8 passed** (seven scenarios plus enclosing test), Playwright 1.63.0 / Chromium **153.0.8010.12**, cached revision 1243. Command: `PLAYWRIGHT_BROWSERS_PATH="$HOME/.cache/ms-playwright" npm run test:browser`. Two-tab isolation, delayed scope changes, partial history, subagent/stale handling, secure first setup, replay reset after backend replacement, direct-only hints, orphan billing labels, mobile/desktop light/dark and no horizontal overflow are asserted. |
| Chromium replay / visibility smoke | Additional loopback browser assertions **passed** on Chromium 153.0.8010.12: manual replay advances from one to two visible actual attempts; session selection and totals stay unchanged; expanding details reveals ordered attempts; parent visibility false stops API polling and true resumes it. |
| Screenshot inspection | Generated under `artifacts/browser/`; Chromium desktop light routing topology and Chromium/WebKit mobile dark layouts visually inspected. Labels, candidate-versus-attempt states and fallback sequence are legible. Screenshots complement, not replace, automated assertions. |
| WebKit protocol browser suite | **8/8 passed in two consecutive full runs** on WebKit **26.6** (revision 2359), Playwright 1.63.0, after the native-input test adjustment described below. One run was concurrent with Chromium. An intermediate unadjusted run failed with a two-tab button-stability timeout; it is not counted as a pass. The passing two-tab scenarios took about 32 seconds: a timed diagnostic attributed about 29.5 seconds to WebKit's native `mouse.move` dispatch, followed by about 44 ms for scrolling and 83 ms for the normal click. This headless scheduling delay remains a test-environment limitation; it is not a measured application update delay. Command: `BROWSER=webkit python3 -I artifacts/webkit-deps/scripts/run.py node --test test/browser/session-routing.test.mjs`. The local runner uses isolated, integrity-verified Ubuntu Noble libraries; it does not install system packages or modify the original browser binaries. |
| Package / syntax | **Passed**, `node scripts/check.mjs`: 32 JavaScript files syntax-checked; dry-run npm package contains 22 files, with no external UI assets or unexpected development/credential files. |
| Integrated unit/API suite | **144/144 passed**, `npm test`, no failures/skips. Includes projection/retention/reset, privacy/identity, gateway/collector, history accounting/bounds, security/lifecycle, independent HTTP viewers and the 27 frontend tests. Review regressions cover Codex kind-only workers, independent-child selection, model suffixes/aliases, changing ledger annotations without duplicate billing, full-envelope byte budgets, ownership rotation, bounded response-drain admission/deadlines and cancellation handling. This is separate from browser and actual Magpie integration. |
| Release CI | [Run 42197568529](https://github.com/tsunheimat/magpie-session-route-plugin/actions/runs/42197568529), commit `ba8c9d8`: Node 22 and 24 unit/package jobs and Chromium **passed**. WebKit **failed** the mobile overflow assertion (`scrollWidth: 426`, viewport `390`), despite the earlier local passes. Local results do not override that failure. Version 0.2.0 retains this strict assertion and passes it locally; the result of each later GitHub CI run is separate from this historical failure. |
| Standard Docker installation | **Not verified** in an actual deployment container. Same-container instructions are supplied; no additional container or exposed port is required by implementation. |
| Remote HTTPS deployment | **Not verified** through an actual external HTTPS reverse proxy/Ingress. Real-host integration exercises authenticated loopback HTTP proxying. |
| Real Claude Code/Codex processes | **Not run**. Synthetic clients send the native session headers to real Magpie and deterministic loopback providers. No real provider credentials, agent files or paid calls. |
| Guaranteed browser-local persistence | **Not met (FR-02.4)** in Magpie’s opaque sandbox. Frame-local isolation and safe storage failure are tested; reload persistence cannot be promised without a host storage API. |

### Browser-test diagnostics

An intermediate WebKit run timed out during normal click actionability in the two-viewer scenario. A bounded diagnostic captured the foreground host document and its opaque iframe reporting `visibilityState: visible` while both delivered no animation frames; the other page continued rendering. Repeating `bringToFront()` did not restore frames, but native pointer movement plus scrolling did. The test now foregrounds the page, moves the pointer into its viewport and scrolls toward the request list before the unchanged normal locator click. There are no forced clicks, automatic failure retries, injected visibility events or bypassed stability assertions. This is a test interaction adjustment, not a production UI change.

### What the real-host harness checked

The twelve recorded checks cover containment; local-path plugin installation through Magpie CLI; the real Bun host and authenticated WebUI service proxy; bearer/Origin/Host rejection; two native-header Claude sessions during three simultaneous requests; deterministic 429 → successful fallback isolated to Session A; identical Claude/Codex textual IDs and unassigned traffic; absence of content/credentials/raw upstream errors in the projection; scoped Today ledger history; disable revocation without interrupting ordinary model routing; restart/uninstall handling; and unchanged provider/group configuration. Provider calls went only to the isolated loopback stubs (one rate-limited response and nine good responses). The observer itself makes no upstream model call.

The integration script cleans its synthetic HOME/work directories and spawned processes, retaining only redacted diagnostics/results. Source-immutability checks passed. No Docker or real Internet service was substituted for the explicit containment requirements.

## Historical release acceptance matrix

This matrix describes the earlier v0.1.0/v0.2.0 scope and evidence. Selector/Details/history-panel assertions do not describe the corrected native upper block. Current native-copy results and remaining differences are listed at the top of this document; backend scope/history contracts remain tested separately. “Covered” names evidence, not a blanket claim that every production deployment scenario passed.

| ID | Acceptance criterion | Current evidence / remaining boundary |
|---|---|---|
| AC-01 | Install in a standard Magpie Docker container; no extra container/exposed port | Actual CLI local-path install + real Bun host **passed**. Manifest uses one separate service page; listener is loopback-only. **Actual Docker deployment not verified.** |
| AC-02 | Open remotely through HTTPS | Real authenticated Magpie WebUI proxy **passed over loopback HTTP**. Relative browser URLs and no localhost fallback covered by UI tests. **External HTTPS/proxy configuration not verified.** |
| AC-03 | Two simultaneous sessions stay isolated | Actual Magpie three-concurrent-request/two-session check **passed**; frontend race guards are unit-tested. Browser harness exercises all scoped panels in two tabs. |
| AC-04 | A failure/fallback affects A but not B | Actual deterministic 429 → success fallback **passed**; normalized attempt sequence/counters and route focus are represented in the UI. |
| AC-05 | Same textual ID from Claude Code and Codex does not collide | Exact case-sensitive tuple contract and actual native-header check **passed**. |
| AC-06 | Two concurrent requests in one session remain distinct | Actual simultaneous requests **passed**; graph/timeline key by request generation/ID rather than message/model. |
| AC-07 | Missing session header stays unknown | Actual unassigned-traffic check **passed**; Unknown picker and scope are explicit, not a synthetic native session. |
| AC-08 | Gateway restart / expiry resynchronizes | Unit and loopback-collector tests cover a surviving projection clearing obsolete in-flight records on PID/sequence reset and eviction. The actual-host scenario verifies a **new collector starts empty after a whole-host restart**, not a surviving collector's response to a gateway-only restart. UI stale/late-response/fresh-discovery handling is tested. |
| AC-09 | Older history has source/period/partial coverage, no fabricated attempts | Actual scoped Today ledger check **passed**; frontend immutable pagination, unknown cost and partial-history behavior are unit-tested. 7d/30d use the same bounded scan contract; no lifetime-history claim. |
| AC-10 | Close/restart/disable/uninstall without disrupting routing | Actual CLI disable/restart/uninstall and ordinary loopback routing checks **passed**. Parent/document visibility pause, abort and auth revocation are tested. Long host-drain takeover has dedicated lifecycle tests rather than a ten-minute browser sleep. |
| AC-11 | Unauthenticated/cross-origin access rejected | Real proxy/service bearer, hostile Origin and rebinding Host checks **passed**. Parent source checking and canonical credential handling are tested; API/lifecycle tests cover other malformed requests. |
| AC-12 | Remote clients need no locally available agent files | Actual synthetic native-header sessions discovered while real homes are hidden **passed**. **Actual remote agent executables/machines not used.** |
| AC-13 | Two independent tabs, one shared backend collector | **Chromium and WebKit protocol browser tests passed** with two contexts viewing different sessions and exactly one collector start. UI controller tests prove local selection/race behavior. This remains separate from actual-host API checks. WebKit's headless native-input delay is documented above. |
| AC-14 | Mobile, both themes, clear controls/status | **Chromium and WebKit desktop/mobile light/dark and no-overflow assertions passed**; screenshots visually inspected. Fallback text contrast ≥4.5:1 and status-mark contrast ≥3:1 **computed in focused tests**. Labelled statuses, native controls, reduced-motion CSS and stacked mobile topology implemented. |

## Reproduce

From the package directory, with Node 22+ and dependencies installed:

```sh
npm ci
npm test
node --test test/ui.test.mjs
npm run check
npm run test:browser
BROWSER=webkit npm run test:browser
```

`test:browser` uses Playwright, an opaque-origin `sandbox="allow-scripts"` iframe and a protocol-shaped parent/service proxy. It does **not** itself prove real Magpie compatibility. Install matching Playwright browser binaries and required OS libraries through approved environment setup. Missing browser libraries are a blocked run, not a pass. The screenshot directory is `artifacts/browser/` and is intentionally not packaged.

For actual-host validation on Linux, use a clean read-only checkout of the exact reference, an approved genuine Bun runtime and working bubblewrap containment:

```sh
MAGPIE_GO=/absolute/path/to/go node test/magpie/build.mjs
npm run test:magpie -- --probe
MAGPIE_BUN=/absolute/path/to/verified/bun npm run test:magpie
```

`MAGPIE_SOURCE` can select the reference checkout and `MAGPIE_BIN` its provenance-verified executable. The harness checks the exact commit/build hash and pinned genuine Bun 1.4.2 executable before invoking Magpie. It will not silently use a PATH shim or run outside containment. The build can be run with `--online` only when dependency downloads are allowed; normal recorded build was offline. Do not substitute real credentials or real agent files to get a green run.

`npm run check` validates required files, all JavaScript syntax, local asset references, absence of a Routing replacement and the `npm pack --dry-run --offline --ignore-scripts` file list. The distributable should include runtime/page/UI files, README and compatibility/validation documentation, but no tests, generated screenshots, logs, private configuration or credential stores.

## Explicit remaining acceptance work

1. Install in the operator’s actual existing Magpie Docker image/configuration volume and validate the same-user/same-container assumptions.
2. Open through the real external HTTPS reverse proxy/Ingress; verify CSP, authenticated page/proxy access and page-token/Authorization log redaction end to end.
3. If required, run real remote Claude Code/Codex clients with approved credentials and ordinary user-driven traffic. This implementation run deliberately avoids that spend/data exposure.
4. Resolve FR-02.4 only through a supported per-viewer host storage API. Do not remove sandbox restrictions or persist a viewer selection in installation-wide options.

These are not hidden behind the source-compatible implementation or local synthetic integration results.

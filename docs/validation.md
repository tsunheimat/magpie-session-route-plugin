# Validation

This record distinguishes **implemented**, **automatically tested**, and **deployment-verified** behavior. A loopback/protocol fixture is not a Docker, external HTTPS or production agent-process test. Evidence is from this repository’s development run on **2026-11-06**; generated artifacts are excluded from the npm package. The tested runtime bundle SHA256 is `aa132d0e8fb53e55ddd1d1fe330c0635ec131048db14c808ea6001c31162409a`: hash the lexically sorted paths `index.mjs`, `package.json`, and files directly under `lib/`, `page/`, `ui/`, each as UTF-8 path + NUL + file bytes + NUL (19 files). Documentation and tests are not part of that fingerprint.

## Recorded results

| Check | Result / scope |
|---|---|
| Focused frontend tests | **27/27 passed**, `node --test test/ui.test.mjs`, Node v24.18.0. Includes scope/late-response guards, sequential refresh, hidden-page abort/resume, canonical credentials, 401 refresh without rotation, revocation, transient stale state, fresh-discovery expiration, immutable history pagination/visibility resume, backend replacement, retryable parent handshake, direct-only session hints, orphan billing labels, secure setup and measured fallback contrast. |
| Frontend syntax | `node --check` passed for `page/boot.js`, `ui/bridge.js`, `ui/app.js`. |
| Reference build | **Passed offline** using Go 1.26.10, Magpie v0.1.3124 commit `3f53fa1f316330b77e5ff6d065a7a56980cafda2`. Provenance: `artifacts/integration/build.json`. |
| Containment probe | **Passed** before running Magpie: external egress denied, synthetic HOME only, real homes hidden, allowlisted environment and PID namespace. `artifacts/integration/containment-result.json`. |
| Actual Magpie/Bun integration | **12 checks passed**, Magpie v0.1.3124, genuine Bun 1.4.2, Node v24.18.0. `artifacts/integration/latest-result.json`, completion `2026-11-06T08:15:35.705Z`, `referenceUnchanged: true`. |
| Chromium protocol browser suite | **8/8 passed** (seven scenarios plus enclosing test), Playwright 1.63.0 / Chromium **153.0.8010.12**, cached revision 1243. Command: `PLAYWRIGHT_BROWSERS_PATH="$HOME/.cache/ms-playwright" npm run test:browser`. Two-tab isolation, delayed scope changes, partial history, subagent/stale handling, secure first setup, replay reset after backend replacement, direct-only hints, orphan billing labels, mobile/desktop light/dark and no horizontal overflow are asserted. |
| Chromium replay / visibility smoke | Additional loopback browser assertions **passed** on Chromium 153.0.8010.12: manual replay advances from one to two visible actual attempts; session selection and totals stay unchanged; expanding details reveals ordered attempts; parent visibility false stops API polling and true resumes it. |
| Screenshot inspection | Generated under `artifacts/browser/`; Chromium desktop light routing topology and Chromium/WebKit mobile dark layouts visually inspected. Labels, candidate-versus-attempt states and fallback sequence are legible. Screenshots complement, not replace, automated assertions. |
| WebKit protocol browser suite | **8/8 passed in two consecutive full runs** on WebKit **26.6** (revision 2359), Playwright 1.63.0, after the native-input test adjustment described below. One run was concurrent with Chromium. An intermediate unadjusted run failed with a two-tab button-stability timeout; it is not counted as a pass. The passing two-tab scenarios took about 32 seconds: a timed diagnostic attributed about 29.5 seconds to WebKit's native `mouse.move` dispatch, followed by about 44 ms for scrolling and 83 ms for the normal click. This headless scheduling delay remains a test-environment limitation; it is not a measured application update delay. Command: `BROWSER=webkit python3 -I artifacts/webkit-deps/scripts/run.py node --test test/browser/session-routing.test.mjs`. The local runner uses isolated, integrity-verified Ubuntu Noble libraries; it does not install system packages or modify the original browser binaries. |
| Package / syntax | **Passed**, `node scripts/check.mjs`: 32 JavaScript files syntax-checked; dry-run npm package contains 22 files, with no external UI assets or unexpected development/credential files. |
| Integrated unit/API suite | **144/144 passed**, `npm test`, no failures/skips. Includes projection/retention/reset, privacy/identity, gateway/collector, history accounting/bounds, security/lifecycle, independent HTTP viewers and the 27 frontend tests. Review regressions cover Codex kind-only workers, independent-child selection, model suffixes/aliases, changing ledger annotations without duplicate billing, full-envelope byte budgets, ownership rotation, bounded response-drain admission/deadlines and cancellation handling. This is separate from browser and actual Magpie integration. |
| CI workflow | `.github/workflows/test.yml` configures Node 22/24 unit/package checks and separate Chromium/WebKit jobs. The recorded local Node version is v24.18.0; local results are not a claim about remote CI. See the repository's [GitHub Actions runs](https://github.com/tsunheimat/magpie-session-route-plugin/actions) for the current commit's CI status. |
| Standard Docker installation | **Not verified** in an actual deployment container. Same-container instructions are supplied; no additional container or exposed port is required by implementation. |
| Remote HTTPS deployment | **Not verified** through an actual external HTTPS reverse proxy/Ingress. Real-host integration exercises authenticated loopback HTTP proxying. |
| Real Claude Code/Codex processes | **Not run**. Synthetic clients send the native session headers to real Magpie and deterministic loopback providers. No real provider credentials, agent files or paid calls. |
| Guaranteed browser-local persistence | **Not met (FR-02.4)** in Magpie’s opaque sandbox. Frame-local isolation and safe storage failure are tested; reload persistence cannot be promised without a host storage API. |

### Browser-test diagnostics

An intermediate WebKit run timed out during normal click actionability in the two-viewer scenario. A bounded diagnostic captured the foreground host document and its opaque iframe reporting `visibilityState: visible` while both delivered no animation frames; the other page continued rendering. Repeating `bringToFront()` did not restore frames, but native pointer movement plus scrolling did. The test now foregrounds the page, moves the pointer into its viewport and scrolls toward the request list before the unchanged normal locator click. There are no forced clicks, automatic failure retries, injected visibility events or bypassed stability assertions. This is a test interaction adjustment, not a production UI change.

### What the real-host harness checked

The twelve recorded checks cover containment; local-path plugin installation through Magpie CLI; the real Bun host and authenticated WebUI service proxy; bearer/Origin/Host rejection; two native-header Claude sessions during three simultaneous requests; deterministic 429 → successful fallback isolated to Session A; identical Claude/Codex textual IDs and unassigned traffic; absence of content/credentials/raw upstream errors in the projection; scoped Today ledger history; disable revocation without interrupting ordinary model routing; restart/uninstall handling; and unchanged provider/group configuration. Provider calls went only to the isolated loopback stubs (one rate-limited response and nine good responses). The observer itself makes no upstream model call.

The integration script cleans its synthetic HOME/work directories and spawned processes, retaining only redacted diagnostics/results. Source-immutability checks passed. No Docker or real Internet service was substituted for the explicit containment requirements.

## Acceptance matrix

“Covered” below names evidence, not a blanket claim that every production deployment scenario passed.

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

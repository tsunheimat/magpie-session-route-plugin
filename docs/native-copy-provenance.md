# Native upper Routing provenance

## v0.3.4 project labels and visible children

Project-present source subtitles now display only the recorded project basename(s), without the short session suffix. The original exact-session key, full-session tooltip and no-project fallback remain unchanged. Child activity uses a plain source-local container and scrollable list instead of `details`/`summary`: relevant children always show, with no chevron, toggle listener or fold state. The list retains keyboard focus, touch scrolling, overflow disclosure and request-activity metadata; no child evidence means no wrapper or residual child spacing. Native destination folding and flight algorithms are untouched.

## v0.3.3 client/model-only children

Version 0.3.3 keeps native depth-1 indentation and row/model styling, but removes the visible activity heading, repeated actor label and state pill. Children use the same `icon(agentOf(agent)?.icon || "generic")` client lookup as their parent rather than the routing-group `FAN` artwork. Only client artwork and model names are visible in each row. The disclosure remains a keyboard/touch-operable chevron with an accessible name; request state/counts and unknown identity are secondary tooltip/accessibility information.

No provider display name is appended to child rows. A bounded `requestedModelName` projection omits a routing-provider prefix only when an observed attempt and candidate establish its exact decomposition. Reply model namespaces remain intact, and unresolved prefixes are not guessed. Original route identity and right-side provider headings are unchanged. Child labels/pills and group icons no longer claim parity; the native comparison is restricted to the intentionally retained row/model styling and indentation, with separate checks that child icons match the actual client.

## v0.3.2 nested sub-agent rows

The source-local activity extension now adapts the actual pinned nested-routing-group presentation from `upstream/plugins/routing/routing.css:71–107,109`: 18px depth-1 indentation, 7px gaps, 10px corners, compact 5px/10px padding, native typography and dashed/active borders. Source-scoped selectors copy the necessary inherited list styling without importing destination layout, wires, virtualization or folding endpoints. Original `app.css`, `routing.css`, pristine snapshots and the extraction-only renderer remain unchanged.

Child rows show “Sub-agent”, concrete observed models and request-only states. Actor identity remains in JavaScript reconciliation maps, not rendered IDs, numbering, DOM datasets, titles or accessibility labels. Concurrent requests of one actor stay together; unknown actor evidence remains one activity aggregate. A short list-wide disclosure preserves keyboard/touch scrolling and in-frame open state. Per-row active/ended counters remain in ID-free tooltips, not repeated on the visible child rows. No worker ancestry, task completion or new flight endpoint is implied. The scoped child-label rules neutralize the source card's inherited title font and colored dot; model text follows the actual nested heading, not account-row chip styling.

This correction is not in the published v0.3.1 tag. Release evidence below remains historical; new checks are recorded separately in [validation](validation.md). Uploaded custom artwork is still outside this change.

## v0.3.1 display corrections

Version 0.3.1 corrects display-data differences that the earlier source-copy comparison did not catch. The previous provider adapter replaced real public branding before rendering, and the source subtitle's multi-folder condition no longer fit session grouping. The approved extension also adds flat sub-agent activity boxes; these are not claimed as an original native feature.

- `projectName` is a validated recorded-folder basename (default shown, independently opt-out with `showProjectNames:false`). The browser receives no parent path from this option; `showFolders:false` still withholds the full recorded folder value. A single project is shown, not only multi-project sessions.
- Provider display names pass bounded safe-text validation separately from opaque identity. Original supported `icon`/`preset` values use the existing bundled inventory; explicit unsupported custom artwork stays generic rather than becoming another brand. Raw account/key `who`, credentials and identifiers remain withheld.
- `actorId` joins documented header/turn evidence without exposing raw actor IDs; `isSubagent` supports unknown-actor evidence. Child boxes are source-local observed-request activity. They neither reparent independent sessions nor claim complete worker ancestry. The original session wire and all request flight endpoints remain unchanged.
- Source presentation changes are recorded in the deterministic generator and plugin-owned CSS. Pristine upstream source, copied native CSS, right-hand reconciliation and flight algorithms remain the reference. The v0.3.0 comparison results below are historical. The v0.3.1 release verification in [validation](validation.md) records 183 passing unit/API tests, 19 passing service tests and 13 comparison tests per browser, and 14 contained Magpie/Bun checks; these are not the v0.3.2 correction's results.

## Source and regeneration

This page copies Magpie's upper Routing block, not a new drawing of it. Its source is Magpie **v0.1.3124**, commit **3f53fa1f316330b77e5ff6d065a7a56980cafda2**, from https://github.com/yetone/magpie.

- `ui/vendor/magpie/upstream/` holds pristine source snapshots. `source-manifest.json` records their upstream paths, SHA-256 digests, sizes and the pinned revision.
- `scripts/vendor-native-routing.mjs` selects original source ranges, removes excluded dependencies, applies the read-only hosting/data changes, then applies the session-source patch. No minifier or replacement flight engine is used.
- `extraction-manifest.json` records source ranges, generator/lifecycle hashes, exclusion and data/privacy differences, and extraction/session hashes. `.gitattributes` exempts only the two generated client extracts from blank-at-end-of-line checking: pruning leaves indentation-only lines, and normalizing them would change the verified generated bytes. Other whitespace checks remain enabled.
- `source-grouping-patch.json` records exact before/after replacements, separate from extraction/hosting changes; released v0.3.0 had 25 replacements; this project/activity extension has **28 replacements**, as recorded in the current manifest. A nonunique patch or changed pristine source fails regeneration.
- `test-only/client.baseline.js` is the **extraction-only, client-grouped** renderer. It is not the unmodified original and must not be described as proof of original parity by itself.
- `client.js` is the same extraction plus the session-source patch. `app.css` and `routing.css` are byte-identical copies. The `byWidth` responsive observers, native destination reconciliation, bird geometry and flight scheduler are retained.

From the project root:

```sh
node scripts/vendor-native-routing.mjs
node scripts/vendor-native-routing.mjs --check
# Refresh only from the same pinned git revision in a local reference checkout:
node scripts/vendor-native-routing.mjs --upstream ../../git-open/magpie
```

The generator's development-only parser is the existing Playwright Babel bundle. The deployed page has no parser, CDN or runtime dependency on the reference checkout. Built-in agent labels/icons are read from pinned Go literals, including the OpenCode-like and Pi-like constructor arguments; this is not discovery of installed/custom clients.

## Hosting and identity boundaries

`ui/index.html` loads the source-checked `bridge.js`, local native helpers, copied renderer and the plugin-owned `app.js` transport. It does not load upstream app/kernel bootstrap or replace the bridge's `window.magpie` object.

The production adapter makes only `GET api/native-routing`, with the provisioned bearer token in a closure, omitted credentials, no referrer, no caching and no redirects. Responses are counted while streaming, capped at 8 MiB, UTF-8 decoded and structurally checked before rendering. Polls are serialized; canceled/hidden/stopped requests cannot paint late data. Repeated 401 or revocation clears the renderer and stops automatic retries. This browser polling reads the single shared collector; it does not start another raw gateway collector.

The copied ingestion receives the sanitized whole-snapshot contract (`apiVersion`, `instanceId`, `generation`, `revision`, `connection`, `coverage`, `object: 'trace'`, `now`, `seq`, `pid`, `serves`, `ids`, `routes`, `totals`, `lifted`). Collector `connection.status === 'live'` is not a claim of gateway process ownership. Missing gateway time shows an unavailable state, not a browser-clock simulation. Missing totals remain em dashes. Missing IDs are evicted; instance/generation/process changes reset presentation.

Known sources use `JSON.stringify(['session', agent, recordedSession])`. Unknown sources use a separately tagged agent/generation/request-ID/time tuple. Model, provider, folder and parent session do not rekey a known source. A session shares one original source node; each request keeps its own native flight and replay identity. The right-side opaque seat identities are shared across requests, supplied by the backend, not request-namespaced or inferred from labels.

The recorded session is the effective gateway identity. An overridden/truncated native session header cannot be recovered. Private session titles are not collected. The native `<small>` subtitle now shows recorded project basename(s) alone when available, including single-project sessions. Without project disclosure the existing short-session/model fallback remains. Model/full-session evidence remains in its tooltip; recorded folder values remain separately opt-in. Project labels never become source identity.

**Unchanged native limits:** four visible source admissions, and independently `LIVE = 4` with `underWay().slice(-LIVE)` for startup/resume requests. Six concurrent startup requests from one session do not start six flights: only the native last four start. The patch does not expand that scheduler.

## Deliberate extraction and data differences

These are boundaries, not assertions that every native function is available:

| Native location | Difference and reason |
| --- | --- |
| Page header | Routing Groups/New group navigation is removed because its editors are excluded. Original title, live indicator and mask remain. |
| Provider/group header and member counts | Enabled-account counts and the “only one account/key on” explanation are omitted. One observed trace seat is not the provider's configured inventory. No fabricated provider pool is supplied. |
| Caption / routing mode / steps | Native descriptions use retained safe routing metadata. Partial candidate/routing/quota/rule/group evidence is marked unavailable in the original explanation locations. A single observed seat says it goes first, not that it is the only configured account. |
| Measurements and outcomes | Absent duration is unavailable rather than invented zero; missing totals use em dashes. Unknown completed outcomes are unavailable rather than fabricated success. Recorded zero remains zero. |
| Accounts and row tooltips | Opaque shared handles and neutral account/key/group labels replace private identities. Safe recorded provider display names and bundled native icons are preserved independently. Live quota inventory/tooltips are not fetched; recorded quota/rest data remains. The native account mask cannot reveal original private names. |
| Agent/source presentation | Pinned built-in names/icons replace live installed-client metadata. Private session titles and raw headers are omitted. Project basenames and folder values have separate disclosure settings. Source-local sub-agent request-activity rows adapt the native nested-group presentation; they are a user-requested extension, not an original worker-tree feature. Actor keys are internal only; original session-level wires, request flights and source admission remain. |
| Gateway subtitle / rule clock | Collected process identity is retained, but a raw gateway URL is not. No group-configuration clock is inferred from the browser. |
| Numeric/quota helpers | Native default number/USD formatting remains. External windows, configured display text, currency preferences and exchange rates are not fetched. |
| Request log controls | Replay remains. Body/request/response, View usage, deep context, archive/report actions and their reads are excluded. |
| Lower page | Requests/history lists, account inventory, Routing Groups/provider editors, quota refresh/reset and tray-panel code do not execute in production. |
| Transport/lifecycle | Protected whole snapshots replace native core polling. Native pause/resume is connected to the parent/document visibility and cancellation boundaries. |

The projector allowlists evidence before it reaches the renderer. Raw credentials, account IDs, emails, headers, upstream error prose, prompts, tool arguments, archive paths and conversation content are not inputs to this page. Native branches that depend on excluded evidence are not claimed as restored. Additional partial-evidence combinations still require integration review; a passing simple fixture is not coverage of every explanation branch.

## Licenses and static packaging

- `LICENSE` is the original **MIT, Copyright (c) 2026 yetone** notice.
- `THIRD_PARTY_NOTICES` is preserved verbatim from upstream. Its broad upstream notices do not mean all those components execute in this extraction.
- Upstream `docs/reference.md` lines 84–87 attribute provider/agent artwork to LobeHub icons. The separate `LOBE_ICONS_LICENSE` is **MIT, Copyright (c) 2023 LobeHub**. Its source URL and copied-file checksum are recorded in `extraction-manifest.json`; the license URL uses upstream `master`, not a separately pinned LobeHub revision. Artwork bytes themselves are pinned by Magpie's source manifest. Marks identify observed software; no endorsement is claimed.
- Bird SVG definitions are taken from upstream `index.html`. Local provider/agent SVG/PNG artwork is copied unchanged, not redesigned. Arbitrary `file:`/URL icons are rejected; only the fixed local icon set is used.

`static-manifest.json` is the explicit vendor serving list: **201 files**, consisting of `client.js`, `native-helpers.js`, `app.css`, `routing.css`, the three license/notice files, and **194 named icon files**. It excludes `upstream/`, `test-only/`, source/extraction/patch manifests, and the lifecycle source include. The ordinary shell also needs `index.html`, `style.css`, `bridge.js` and `app.js`. The production service reads this exact allowlist once and rejects unlisted paths, including source manifests and baselines; it never serves a recursive vendor directory or reference-checkout proxy. The package includes runtime assets and provenance manifests but excludes pristine snapshots, the test-only baseline and lifecycle source include. The original native-copy release was **v0.3.0**; **v0.3.1** adds project/provider display corrections, and **v0.3.2** adds the native nested-row presentation for sub-agents. Earlier source tags remain unchanged.

The protected fixed `GET /api/native-routing` accepts no query parameters, reuses the shared lazy collector and revalidates installation authorization before and after projection. Existing scope/history endpoints remain available with their previous contracts. Static assets do not start collection. The bounded static loader permits the pinned 2.7 MiB translations/helper bundle; API responses retain their separate 8 MiB budget.

CSP keeps scripts strictly local without inline/eval permissions or `allow-same-origin`. `style-src-attr 'unsafe-inline'` permits native measured geometry/color attributes while `style-src 'self'` still rejects inline style elements. `img-src 'self' data:` permits the original CSS SVG masks (`--x-mark` and toggle marks). The only image-helper adaptation is `crossOrigin = 'anonymous'` on fixed local images: otherwise the opaque sandbox taints native `toneCheck` canvas reads and prevents its monochrome/theme detection. Static GET CORS remains restricted to `Origin: null`; no credentials or arbitrary artwork URLs are added. The generator and extraction manifest record this adaptation.

## Two independent fixture comparisons

The suite additionally compares **raw recorded provider metadata → unmodified upstream** against **the same raw trace → actual aggregator/protected service → copied renderer**. Gemini CLI, Antigravity, Kiro and a configured Unicode StepFun name must retain identical display names and exact icon tokens. The v0.3.1 reports/screenshots are under `artifacts/native-routing/display-metadata/`; its source tests covered project opt-out, same-session actor grouping, unknown activity, collision-safe displayed labels, retained actor overflow, completion/replay/eviction and zh-TW presentation. The v0.3.2 correction replaces displayed-label tests with hidden-identity and observed-model tests, and adds actual native nested-group comparison. Source/flight tests continue to use session endpoints, sampling six path-length pixels along the native curve rather than assuming a horizontal offset.

The original v0.3.0 comparison design remains:

`test/native-copy.test.mjs` has two distinct comparison stages:

1. **Unmodified upstream application → extraction-only.** `NATIVE_REFERENCE=1` adapts upstream `routing-session-folder.test.cjs` / `routing-stage-routes.test.cjs` request interception. It reads the original index and all app scripts directly from the pinned local git object database, verifies the original routing source against the pristine snapshot, and fulfills every request inside Playwright. No core edits, Magpie service or external requests are used. Fake `/api/*` replies are test-only and logged in the comparison JSON. The comparison adjusts the extraction page's viewport to match the original block's available width (the original application has a sidebar); it does not change original CSS.
2. **Extraction-only → session-source patch.** Identical fixture data checks client-vs-session node counts, shared seats, independent request packets, native mode/step/header text, node identity across updates, replay, masking, mobile fit, full-snapshot eviction and clearing. Separate six-request checks retain the original four-flight startup/resume limit.

Commands using the already installed runtimes (no installation or Bun shim):

```sh
node --check ui/app.js
node --check ui/bridge.js
node --check ui/vendor/magpie/native-helpers.js
node --check ui/vendor/magpie/client.js
node --test test/native-copy.test.mjs

NATIVE_BROWSER=1 NATIVE_REFERENCE=1 BROWSER=chromium \
PLAYWRIGHT_BROWSERS_PATH=/home/matthew/.cache/ms-playwright \
NATIVE_SCREENSHOT_DIR="$PWD/artifacts/browser/native-copy-checkpoint" \
node --test test/native-copy.test.mjs

NATIVE_BROWSER=1 NATIVE_REFERENCE=1 BROWSER=webkit \
NATIVE_SCREENSHOT_DIR="$PWD/artifacts/browser/native-copy-checkpoint" \
python3 -I "$PWD/artifacts/webkit-deps/scripts/run.py" \
node --test "$PWD/test/native-copy.test.mjs"
```

Set `NATIVE_UPSTREAM` to an absolute reference checkout if it is not at `../../git-open/magpie`. Reference files are read at the pinned commit, not from that checkout's working tree. Without `NATIVE_BROWSER=1`, browser checks are explicitly skipped. `BROWSER` selects one installed engine; it is not silently substituted. WebKit pages are exercised sequentially so a background tab does not suspend the native frame/resize observers. Width checks wait for native `max560`, not a manually applied test class.

### Checkpoint evidence and remaining parity gaps

At this checkpoint, both Chromium and WebKit pass the focused file (10 tests including the browser subtest). The one-session completed fixture at equal **956px upper-block width** has equal original/extraction mode, stage, source, hub, destination rows, caption, statistics, steps, sampled computed styles and wire geometry. The deliberate differences are the omitted enabled-account wording and removed body/usage controls. Screenshots were opened and inspected, not merely written.

Artifacts are under `artifacts/browser/native-copy-checkpoint/`:

- `{chromium,webkit}-original-upper.png`: actual unmodified original upper block.
- `{chromium,webkit}-extraction-upper.png`: extraction-only.
- `{chromium,webkit}-sessions-upper.png`: one session with the subtitle patch.
- `{chromium,webkit}-comparisons.json`: selector text, relative geometry, sampled styles, paths and intercepted original API requests.
- `{chromium,webkit}-baseline.png`, `*-sessions.png`, `*-mobile-dark.png`: concurrent and 390px dark/reduced-motion fixture views.

**Remaining visible difference:** the added session subtitle can widen the source under native `fit-content` sizing, shifting the hub and narrowing the destination column without changing CSS or geometry algorithms. In the 956px Chromium fixture, the source grows from 124px to 137.69px and the hub/rows move by 13.69px. This is not pixel-identical one-session parity and is not hidden by screenshot normalization. Further review must decide whether the natural native reflow meets the requested discriminator exception; no replacement layout is introduced here.

### Protected service integration checkpoint

`test/browser/harness.mjs` serves the real production `lib/server.mjs`, actual packaged native scripts/CSS/artwork and source-checked bridge inside `sandbox="allow-scripts"`. Its synthetic raw trace enters `createAggregator`, rather than handing a permissive DTO directly to the renderer. This is still a protocol-shaped host harness, not actual Magpie/Bun.

Both Chromium and isolated WebKit pass `test/browser/session-routing.test.mjs` (**16 tests each**, including the parent). These cover protected boot, exact source grouping/unknown identities, shared destinations, stable DOM across polls, two tabs/one collector, native four-flight startup/resume, source-local folders, model/parent changes without rekeying, precise outbound/reply/replay origins, retry/fallback/error returns, fifth-source refill, concurrent narrative hold, keyboard folds, sky layering, idle frames, visibility, revocation/data clearing, backend replacement, setup, locale changes, and desktop/mobile light/dark under normal/reduced motion and long-label fit. Screenshots are in `artifacts/browser/native-service/{chromium,webkit}-*-{viewport,upper}.png`. Overflow checks inspect the actual native `.view` scroller and all stage/node/narrative bounds; checking only the document would miss clipping because upstream intentionally uses `body { overflow: hidden }`.

WebKit screenshot preparation in the installed Playwright injects a `body {}` style element to synchronize animation. Strict CSP correctly blocks that test-only injection. The harness separates only that exact, screenshot-phase message and verifies the injected text; application CSP violations still fail. Production CSP was not widened for the test tool. Anonymous local image CORS removes the separately observed tainted-canvas failures without changing native tone sampling.

```sh
npm test
npm run check
PLAYWRIGHT_BROWSERS_PATH=/home/matthew/.cache/ms-playwright BROWSER=chromium npm run test:browser
BROWSER=webkit python3 -I "$PWD/artifacts/webkit-deps/scripts/run.py" node --test "$PWD/test/browser/session-routing.test.mjs"
```

At this integration checkpoint `npm test` passes 167 tests with one explicit browser-only skip; `npm run check` verifies 46 scripts, exact extraction regeneration, and a 229-file package under 6 MiB. The rejected custom-renderer UI/browser assertions were replaced, not skipped; backend tuple/scope/history and controller/bridge/launcher authorization tests remain at their actual public boundaries.

### Completed verification and remaining acceptance

The final pass expands the independent original → extraction → session comparison to **eight variants per browser** (desktop/mobile, light/dark, normal/reduced motion), with **10/10 tests passing per engine**. Raw DOM, sampled styles, geometry, wire coordinates and literal differences are recorded in `artifacts/native-routing/{chromium,webkit}-parity-matrix.json`. The same directory contains 48 matrix screenshots named `{browser}-{desktop|mobile}-{light|dark}-{reduce|no-preference}-{native-original|extracted-baseline|session-patched}.png`, plus supplementary concurrent-session captures. Screenshots were opened and visually inspected.

The desktop discriminator reflow described above remains. On mobile, removing excluded request/response/usage actions reduces the original log header from 90px to 44px and block height by 46px; the stage geometry is unchanged. Normal-motion Chromium records occasional approximately 0.00003px wire-coordinate differences, retained in JSON instead of rounded away. Passing comparisons verify the copied structures and measured boundaries, not zero differences.

Contained actual Magpie v0.1.3124 / genuine Bun 1.4.2 integration now **passes all 13 checks**. `artifacts/integration/run-UBk5rk/result.json` records completion `2026-11-08T18:43:45.338Z` and `referenceUnchanged: true`. Added coverage checks the native endpoint, shared opaque seats, privacy canaries, query rejection, authorization and allowed/forbidden vendor assets. The run uses loopback-only network and separate PID namespaces; synthetic HOME/work and spawned processes are cleaned up. This validates actual host HTTP/proxy behavior, while browser rendering remains a separate protected-service protocol harness, not an end-to-end actual-host browser test.

Relevant upper-stage regression cases are covered, not the entire upstream suite or every combination of partial evidence. Copied native translations were exercised in en, zh, zh-TW, ja and de; newly introduced unavailable-evidence/outcome/time messages still fall back to English. WebKit retains its explicitly documented native pointer/wheel activation workaround and verified screenshot-only CSP diagnostic. Final suites pass without forced clicks or failure retries.

**Historical v0.3.0 release scope:** the user requested merge and a new release after the original/extraction/session screenshots and desktop source-width shift were presented. Version **0.3.0** contains that implementation; release authorization is not a claim of pixel-identical visual acceptance. No cluster deployment, paid model request, core patch or sandbox relaxation is part of the release. See [validation](validation.md) for current counts and limitations.

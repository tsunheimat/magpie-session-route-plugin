# Internal implementation contract

Integration contract for version 1. No raw gateway JSON crosses the API. All sources use nullable measurements (unknown is not zero). Shared `lib/contracts.mjs` is coordinator-owned; request changes rather than concurrently editing it.

## Normalized records

`Request`:
- `key` (generation-namespaced string), `id` (original numeric trace/ledger route ID or null), `time` (ISO), `updatedAt` (ISO), `sessionKey` (encoded exact agent/session tuple or null), `agent`, `session` (native recorded ID or null), `parentSessionKey` (confirmed same-agent only or null), `subagentId` (safe actor identifier or null), `isSubagent` (boolean), `model` (requested), `servedModel` (nullable), `provider` (nullable actual/known provider), `effort` (nullable), `folder` (optional opt-in), `group` (safe `{id,name}` or null).
- `done` boolean, `status` integer|null, `outcome` one of `in-flight`, `success`, `failed`, `unknown`, `unavailable`; `error` a fixed safe diagnostic label|null, never raw error text.
- `ms`, `ttft`, `tokens`, `inputTokens`, `outputTokens`, `cacheReadTokens`, `cacheWriteTokens`, `reasoningTokens`, `cost`: number|null. `priced` boolean. `cost` is unavailable in raw trace. `retries`, `fallbacks`: number|null.
- `candidates`: ordered `{key,provider,model,effort,label,state}`. `key` opaque, `label` neutral account/key label. `state` distinguishes candidate/attempting/success/failed. No raw seat IDs/account emails.
- `attempts`: ordered `{index,candidateKey,provider,model,effort,servedModel,start,done,status,outcome,ms,ttft,error,transition}`. `transition`: `initial`|`retry`|`fallback`|`unknown`. Preserve incomplete evidence; no predicted tries.
- `partial` boolean, `reasons` fixed string array. Historical request may have empty candidates/attempts, with a reason that attempt history is unavailable. Optional `isIndependentSubagent` boolean (default false) is true only when documented identity evidence proves a child owns the native session being selected, rather than sharing a parent's header; direct-only filtering may include that child's own traffic while preserving its `isSubagent` classification. History joins establish this from validated native-child evidence, never from actor absence or heuristic IDs.

`Session`: `{key,agent,displayId,title:null,folder:null|string,lastActivity,activeRequests,requestCount,lastModel,lastProvider,parentKey:null|string,isChild:boolean}`. Native title is not available. Use source-scoped counts; unknown traffic is never a session.

`Metrics`: `{requests,inFlight,failed,retries,fallbacks,averageTTFT,ttftSamples,tokens,inputTokens,outputTokens,cost,pricedRequests,unpricedRequests,partial}`. Null is unavailable; `cost` is a known subtotal only if at least one priced record exists, and partial pricing remains marked. Timings in ms; costs as reported ledger USD. No guessing prices.

`Connection`: `{status,lastUpdated,reason,gatewayVersion}`. Status is `starting`|`live`|`stale`|`disconnected`|`incompatible`|`stopped`. `lastUpdated` ISO|null; `reason` safe string|null.

`Coverage`: `{source:'trace'|'ledger',period,label,partial,reasons,retained?,scanned?,available?,snapshotAt?}`. Every displayed total cites it.

`State`: `{apiVersion:1,instanceId,generation,revision,seq,scope,connection,coverage,sessions,unknownRequests,requests,metrics,graph:{requestKeys}}`. `requests` can contain historical `handed_on_only` evidence; such records contribute recorded usage but never request, failure, in-flight, session-request or unknown-request counts. Pagination counts evidence records, not requests. The complete serialized response (including sessions, graph and envelope) must fit the byte limit; trimming retains whole records, recomputes derived fields and marks partial coverage. A live selection is validated against the authoritative retained cache, not the byte-trimmed All response.

`scope` uses shared parseScope: `{kind:'all'|'session'|'unknown',sessionKey:null|string,includeChildren:boolean,period:'live'|'today'|'7d'|'30d'}`. All means all actors, regardless of includeChildren. Session direct-only excludes known subordinate actors. Missing session => ApiError(410,'session_expired',safe message), never implicit all. Only fresh authoritative data permits fallback in UI.

## Backend module interfaces

- `createAggregator({limits?,clock?,instanceId?,showFolders?})` from aggregator.mjs. `applyTrace(rawEnvelope,{full=false}={})` validates/sanitizes before caching, returns `{resync:boolean}`. `setConnection({status,reason?,gatewayVersion?})`. `snapshot(scope)` returns State synchronously. `listSessions()` returns safe Session[]. `clear()`. `seq` readable cursor, `generation` readable local epoch. Initial/restart batches are full; raw batches follow actual Magpie contract. API snapshots must be detached/safe.
- `createGateway({address?,limits?,timeoutMs?})` from gateway.mjs. `hello({signal}={})` => `{name,version}`; `trace({after=0,wait=false,signal}={})` => raw validated-size JSON; `usage({period,offset=0,limit=200,signal}={})` => raw JSON. Paths fixed, usage includes `via=through&computer=this`. No caller-provided URL/headers. No ambient proxy or redirects. Raw records are immediately consumed by projection/history.
- `createCollector({gateway,aggregator,clock?,pollTimeoutMs?,backoffMs?,fullIntervalMs?})` from collector.mjs. `start()` is idempotent/nonblocking; `stop()` aborts and awaits loop. Full resnapshot on uncertain continuity; exactly one trace call at a time.
- `createHistory({gateway,aggregator,limits?,clock?})` from history.mjs. `snapshot(scope,{offset=0,limit=100,snapshotId=null,signal}={})` async => State plus `{pagination:{snapshotId,offset,limit,nextOffset,total},coverage}`. All histories share period scans independent of browser/session. Safe sessions for that period available in snapshot. Immutable bounded local snapshot IDs; expired => ApiError(409,'history_expired',...). `clear()` and `stop()` abort work. No hidden fetch on live UI refresh. Provider schema is source-inspected; match identities conservatively.
- `startService(input,options)` from lifecycle.mjs owns config/lifecycle, constructs gateway/aggregator/collector/history/server, returns nonblocking managed handle with `stop()`. Unprovisioned returns without listener/collector. Default export index.mjs delegates and returns `{}`.
- `createServer({config,aggregator,history,startCollector,authorizeInstallation,stop?,...testOverrides})` from server.mjs: runtime implementer may choose exact server factory API with lifecycle; do not change public contracts above. It calls collector only after bind and authorized use. Installation authorization is checked before all sensitive data responses, not only periodically.

## HTTP

Public fixed UI assets, `/healthz` and ownership nonce endpoint only carry non-sensitive data. Protected GET `/api/state?session=<key|unknown>&period=live&includeChildren=0|1`, GET `/api/sessions` with same scope args, GET `/api/history?...&period=today|7d|30d&offset=0&limit=100&snapshot=<id>`.

`/api/state` dispatches to history for non-live periods; `/api/history` is explicit paginated history. `/api/sessions` response `{apiVersion,instanceId,generation,revision,connection,coverage,sessions,unknownRequests}`. Error `{error:{code,message}}`, sanitized fixed messages, correct HTTP status. Token goes only in Authorization. `installationId`/`apiToken` options; token base64url 32 random bytes (43 chars); installationId base64url 16 bytes (22 chars). Service port default3496, `showFolders:false`.

## Frontend

UI uses classic local scripts (opaque-origin module CORS handled only if intentionally chosen), relative service API/assets. Small parent bridge: messages `{magpie:1,id,method,params}`; source-check `event.source===parent`; reply `{magpie:1,id,result|error}`. Supports hello/options.get/options.set, theme/visibility. Never re-resolve launcher's hello.service under service root. Browser state remains per frame; optional localStorage in try/catch, never tokens. Generation/scope guards prevent stale cross-scope display. Poll1s sequentially; pause when parent visibility false. Live sessions discovered via state.sessions; period change switches discovery source. Request focus is local and never changes scoped totals.

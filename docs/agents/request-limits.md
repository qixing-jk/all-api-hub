# Account and managed-site request budgets

Reviewed 2026-11-03 against the complete registered site-type inventory. These are extension client defaults, not discovered server configuration. Every type must have an explicit policy in `src/services/accountSiteDefinitions/requestLimits.ts`; sharing an adapter or inference API never establishes a shared rate limit.

## Verified defaults

| Type | Observed upstream defaults | Client rate/min | Burst | Source |
| --- | --- | --- | --- | --- |
| `one-api` | 480/180s API; 240/180s web | 144 | 8 | [Upstream source](https://github.com/songquanpeng/one-api/blob/main/common/config/config.go) |
| `new-api` | 360/180s API; 120/180s web | 108 | 8 | [Upstream source](https://github.com/QuantumNous/new-api/blob/main/common/init.go) |
| `one-hub` | 300/180s API; 180/180s web | 90 | 8 | [Upstream source](https://github.com/MartialBE/one-hub/blob/main/middleware/rate-limit.go) |
| `done-hub` | 300/180s API; 300/180s web | 90 | 8 | [Upstream source](https://github.com/deanxv/done-hub/blob/main/common/config/config.go) |
| `sub2api` | 240/min panel; 60/min heavy; 300/min public | 48 | 8 | [Upstream source](https://github.com/Wei-Shaw/sub2api/blob/main/backend/internal/service/setting_panel_rate_limit.go) |

The One API/New API/Hub values refer to ordinary `/api` traffic, not the separate web/static bucket. New API and One API API routers were checked for `GlobalAPIRateLimit`. Rates leave 10% of sustained API capacity plus room for a local burst; Sub2API deliberately stays below its smaller heavy-query default. Deployment overrides, older versions, other browser traffic and stricter endpoint limits can still produce 429. No version negotiation is implemented.

## Complete policy inventory

| Registered type | Client rate/min | Burst | Evidence status |
| --- | --- | --- | --- |
| `one-api` | 144 | 8 | Verified defaults above |
| `new-api` | 108 | 8 | Verified defaults above |
| `apiyi` | 30 | 4 | Conservative client fallback; applicable account/management threshold not verified |
| `laozhang` | 30 | 4 | Conservative client fallback; applicable account/management threshold not verified |
| `ModelFlare` | 30 | 4 | Conservative client fallback; applicable account/management threshold not verified |
| `anyrouter` | 30 | 4 | Conservative client fallback; applicable account/management threshold not verified |
| `Veloera` | 30 | 4 | Conservative client fallback; applicable account/management threshold not verified |
| `one-hub` | 90 | 8 | Verified defaults above |
| `done-hub` | 90 | 8 | Verified defaults above |
| `v-api` | 30 | 4 | Conservative client fallback; applicable account/management threshold not verified |
| `voapi-v2` | 30 | 4 | Conservative client fallback; applicable account/management threshold not verified |
| `VoAPI` | 30 | 4 | Conservative client fallback; applicable account/management threshold not verified |
| `Super-API` | 30 | 4 | Conservative client fallback; applicable account/management threshold not verified |
| `Rix-Api` | 30 | 4 | Conservative client fallback; applicable account/management threshold not verified |
| `neo-Api` | 30 | 4 | Conservative client fallback; applicable account/management threshold not verified |
| `wong-gongyi` | 30 | 4 | Conservative client fallback; applicable account/management threshold not verified |
| `sub2api` | 48 | 8 | Verified defaults above |
| `octopus` | 30 | 4 | Conservative client fallback; applicable account/management threshold not verified |
| `axonhub` | 30 | 4 | Conservative client fallback; applicable account/management threshold not verified |
| `claude-code-hub` | 30 | 4 | Conservative client fallback; applicable account/management threshold not verified |
| `cli-proxy-api` | 30 | 4 | Conservative client fallback; applicable account/management threshold not verified |
| `AIHubMix` | 30 | 4 | Conservative client fallback; applicable account/management threshold not verified |
| `sharedchat` | 30 | 4 | Conservative client fallback; applicable account/management threshold not verified |
| `freemodel` | 30 | 4 | Conservative client fallback; applicable account/management threshold not verified |
| `dahl` | 30 | 4 | Conservative client fallback; applicable account/management threshold not verified |
| `foxcode` | 30 | 4 | Conservative client fallback; applicable account/management threshold not verified |
| `xiaoen` | 30 | 4 | Conservative client fallback; applicable account/management threshold not verified |
| `emrank` | 30 | 4 | Conservative client fallback; applicable account/management threshold not verified |
| `krill` | 30 | 4 | Conservative client fallback; applicable account/management threshold not verified |
| `cubence` | 30 | 4 | Conservative client fallback; applicable account/management threshold not verified |
| `RightCode` | 30 | 4 | Conservative client fallback; applicable account/management threshold not verified |
| `relayfor` | 30 | 4 | Conservative client fallback; applicable account/management threshold not verified |
| `requesty` | 30 | 4 | Conservative client fallback; applicable account/management threshold not verified |
| `openrouter` | 30 | 4 | Conservative client fallback; applicable account/management threshold not verified |
| `omniroute` | 30 | 4 | Conservative client fallback; applicable account/management threshold not verified |
| `gpt-load` | 30 | 4 | Conservative client fallback; applicable account/management threshold not verified |
| `magpie` | 30 | 4 | Conservative client fallback; applicable account/management threshold not verified |
| `kimi` | 30 | 4 | Conservative client fallback; applicable account/management threshold not verified |
| `kimi-global` | 30 | 4 | Conservative client fallback; applicable account/management threshold not verified |
| `daya` | 30 | 4 | Conservative client fallback; applicable account/management threshold not verified |
| `pmapi` | 30 | 4 | Conservative client fallback; applicable account/management threshold not verified |
| `aimlapi` | 30 | 4 | Conservative client fallback; applicable account/management threshold not verified |
| `grsai` | 30 | 4 | Conservative client fallback; applicable account/management threshold not verified |
| `vercel-ai-gateway` | 30 | 4 | Conservative client fallback; applicable account/management threshold not verified |
| `novita` | 30 | 4 | Conservative client fallback; applicable account/management threshold not verified |
| `unknown` | 30 | 4 | Conservative client fallback; applicable account/management threshold not verified |

The unknown-quota fallback is 30/min, burst 4 and concurrency 2. This replaces the previous 18/min client budget: after spending the burst, one request is replenished every 2 seconds instead of roughly 3.33 seconds. It is a conservative client latency/load choice rather than a discovered server quota or a universal best-practice rate. Sharing an adapter never establishes a server budget. All policies keep concurrency 2; ordinary and native HTTP consumers use the same policy owner.

## Additional primary-source findings

- [OpenRouter management keys](https://openrouter.ai/docs/guides/overview/auth/management-api-keys) documents key/credit operations; free-model inference quotas do not establish a management API quota.
- [Kimi Admin API](https://platform.kimi.com/docs/admin-api/overview) documents organization/endpoint-scoped admin limits (reads 60/min, writes 20/min, certain queries concurrency 5). Those are different from the saved-account balance/console credentials used by this integration, so neither regional account type inherits them.
- [Vercel limits](https://vercel.com/docs/limits) publishes per-endpoint/user/team limits. The documented token-creation and general key quotas are not established as the AI Gateway key/credit quotas used here.
- [Requesty limits](https://docs.requesty.ai/features/api-limits), [Novita keys](https://docs.novita.ai/guides/llm-api-keys), [AI/ML key management](https://docs.aimlapi.com/api-references/service-endpoints/api-key-management), [AIHubMix account API](https://docs.aihubmix.com/en/api/Cli), [RightCode docs](https://docs.rightapi.ai/docs/rc_extension/curl), and [Grsai account routes](https://grsai.com/dashboard/documents/other) did not establish an applicable common account-management rate in the reviewed material. Published inference budgets are not used.
- Public references for other types remain in [site integration ownership](site-integrations.md#site-types-and-upstream-relationships). Some references, including Veloera and v-api, were unavailable at their recorded GitHub paths. Unverified managed-only deployments and hosted consoles retain the fallback rather than being declared unlimited.

## Scheduling and server feedback

- Budget state is process-local and keyed by the actual outgoing API origin, not the console URL, account ID, method, or selected feature. Existing foreground/background fairness stays in place.
- The first explicit type can replace an untyped default without refilling consumed tokens. Conflicting explicit types choose the stricter rate, burst and concurrency until that state expires.
- A confirmed HTTP 429 pauses subsequent work on that origin. A valid `Retry-After` delay/date is respected. Missing/invalid values use exponential cooldown (1s base, 30s base cap, up to 25% jitter). A later response never shortens an existing pause.
- The failed request is returned to its caller; this layer does not replay reads or writes. Provider workflows retain responsibility for bounded, semantically safe retries. Existing narrower limits/bypasses keep their existing ownership.
- [AWS retry guidance](https://docs.aws.amazon.com/wellarchitected/latest/framework/rel_mitigate_interaction_failure_limit_retries.html) recommends throttling and bounded retries with backoff and attention to idempotency. It does not prescribe a universal RPM value.

Native managed HTTP clients use the same origin queue while retaining their authentication, response decoding and mutation evidence. Authentication retries release the preceding lease before obtaining another one. Browser-context APIs report structured 429 responses without weakening their dispatch-evidence rules.

Excluded HTTP domains have separate owners: inference streaming, WebDAV/Gist backups, notifications, static model metadata downloads and injected session readers. These do not inherit account-management rates. Process-local limiting is not a cross-process or server-side quota guarantee.

## Unknown-quota policy research

Reviewed 2026-11-03. The following sources guide feedback handling, not an applicable quota for these providers:

- [AWS SDK retry behavior](https://docs.aws.amazon.com/sdkref/latest/guide/feature-retry-behavior.html) recommends standard mode generally, with bounded retries and jitter. Adaptive mode additionally slows initial requests after throttling; AWS reserves it for single-resource, throttling-heavy, latency-tolerant workloads and warns that a shared client can delay unaffected resources or tenants. The current page describes an opt-in 2026 retry revision, so its exact timing is not an extension contract.
- [Botocore adaptive implementation](https://github.com/boto/botocore/blob/develop/botocore/retries/adaptive.py) initially disables its send limiter, enables it after detected throttling, and adjusts its rate from measured traffic and CUBIC feedback. Its initial token bucket rate of one request/second does not establish a universal 60/min quota: that bucket initially does not gate sending.
- [Microsoft Graph throttling guidance](https://learn.microsoft.com/en-us/graph/throttling) uses server feedback and `Retry-After`, with exponential backoff when that header is absent. Limits depend on request/resource scenarios; Graph's policy does not establish an account-management quota for other servers.
- [GitHub REST best practices](https://docs.github.com/en/rest/using-the-rest-api/best-practices-for-using-the-rest-api) recommends queued serial requests, spacing bulk mutations, and honoring `Retry-After` or quota-reset headers. For secondary limits without those signals it recommends at least a minute before retrying, then exponential delays. These are GitHub-specific instructions, not a universal one-minute cooldown or 60/min allowance.

None of these sources establishes 18, 30, 48 or 60 requests/min as a universal safe unknown-server rate. Changing that baseline is an explicit client latency/load tradeoff and should retain small bursts, bounded concurrency and confirmed-429 cooldown. Cooldown and adaptive rate reduction are separate mechanisms: cooldown pauses traffic temporarily; adaptive reduction lowers subsequent sustained traffic and needs its own recovery/scope policy. A successful request does not prove spare quota. Fully adaptive discovery is not justified as a general default by AWS's guidance, especially because one origin can contain several independently limited resources or identities.


### Client decision

Raise the unverified/missing-type baseline from 18 to 30 requests/min while keeping burst 4 and concurrency 2. The extra sustained capacity reduces avoidable queue delay without enlarging the initial burst or adding concurrent load. Choose the incremental two-second refill because this origin budget covers account refresh, discovery, key operations and managed resources together; several extension contexts can also run independently. The reviewed sources do not establish a safe 48/60 RPM baseline for all those unknown deployments.

Confirmed 429 feedback still pauses future dispatches using `Retry-After` or the bounded exponential fallback. A successful request does not increase the baseline, and the failed operation is not replayed automatically. Origin-wide learned quota reduction/recovery would need a separate resource/identity policy; it is outside this tuning change. The production factory obtains its default from `getSiteRequestBudget()` so the untyped and registered fallback cannot drift between separate constants.

The mixed ordinary/native queue regression covers missing, unknown, registered-unverified and unregistered metadata together: four ready requests start from the burst, the fifth starts at 2 seconds, and a 20-request batch starts its last request at 32 seconds. This is controlled timer evidence with immediately completing tasks, not live endpoint throughput. Deployment-specific lower thresholds can still cause 429.

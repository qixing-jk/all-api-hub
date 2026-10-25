# Site integrations: ownership and relationships

Use the [type relationships and sources](#site-types-and-upstream-relationships) to understand an integration, and the ownership map to locate its code and workflow. The [integration skill](../../.agents/skills/add-site-integration/SKILL.md) owns investigation and delivery; load only the references for the requested capability.

## Source ownership

Site type, account/managed scope, and adapter family are separate decisions. A detected type or shared family does not establish that a deployment supports every capability. Confirm registration and the target contract before advertising support; missing extension code does not establish upstream absence.

| Question | Owner |
| --- | --- |
| Which types, scopes, families, onboarding defaults and product profiles are registered? | [Site definitions](../../src/services/accountSiteDefinitions/definitions.ts), with [identifiers](../../src/services/accountSiteDefinitions/identifiers.ts) and [registry accessors](../../src/services/accountSiteDefinitions/registry.ts) |
| Which domains share a deployment policy? | [Deployment definitions](../../src/services/accountSiteDefinitions/deployments.ts) and [API-origin mappings](../../src/constants/deploymentApiOrigins.ts) |
| How is a site detected during onboarding? | [Site detection](../../src/services/siteDetection/detectSiteType.ts) |
| Who selects account-detection sources and final errors? | [Detection entrypoint](../../src/services/siteDetection/autoDetectService.ts) owns target-origin policy, final API fallback and diagnostic completion; [browser source orchestration](../../src/services/siteDetection/autoDetectSources.ts) owns tab selection, browser-profile inheritance and browser recovery |
| Where do detection sources read and assemble account sessions? | [Source adapters](../../src/services/siteDetection/sources/), with shared [request/result contracts](../../src/services/siteDetection/autoDetectContracts.ts); browser reads go through [account browser sessions](../../src/services/accountBrowserSession/sessionReader.ts) |
| Which account capabilities are dispatched? | [Adapter registry](../../src/services/apiAdapters/registry.ts) and the selected family/variant |
| Where do authentication and wire-protocol differences belong? | [API services](../../src/services/apiService/) and the owning adapter |
| Where are management operations and native resources implemented? | [Managed sites](../../src/services/apiAdapters/managedSites/) and [native resource adapters](../../src/services/apiAdapters/managedResources/README.md) |
| How are check-in methods discovered and executed? | [Method registry and providers](../../src/services/checkin/autoCheckin/providers/registry.ts); follow the [check-in workflow](../../.agents/skills/add-site-integration/references/check-in.md) |

`src/constants/siteType.ts` is a compatibility facade over the definition registry. Provider directories, detection rules and documentation lists are not separate support declarations.

Account detection retains the active browser profile when selecting current or existing tabs and when recovering through a temporary context. A matched current tab first recovers through background detection with its tab fetch context; ordinary background detection can then retry with the inherited browser profile. Browser exhaustion returns an advisory reload hint, while the entrypoint still tries direct API detection and preserves more specific failures. Source adapters accept named request objects so bypass intent, diagnostics and browser context are explicit at each handoff. Temporary-context acquisition, sharing and release remain owned by the [browsing-context runtime](../../src/services/browsingContext/), behind the protection-bypass task boundary.

## Site types and upstream relationships

This overview preserves what each type represents, its relationship to other backends, and where to find upstream material. Scope and adapter-family summaries follow the [runtime definitions](../../src/services/accountSiteDefinitions/definitions.ts); they are not promises that every deployment supports every feature. **Upstream lineage, protocol compatibility, and the extension's adapter family are different relationships.** Sharing an adapter does not establish common accounts, interchangeable credentials, or a verified fork relationship.

The linked repositories, vendor documentation and consoles are starting points for investigation. Source-specific contracts and their version limits belong beside the implementation; verify the target deployment before applying an upstream assumption.

### One API lineage and New API-compatible account types

These types currently use the `NewApiFamily` account adapter. The [variant registration](../../src/services/apiAdapters/newApi/variantRegistration.ts) selects local behavior; [protocol variants](../../src/services/apiService/newApiFamily/variants/) own wire differences. New API, Veloera and DoneHub also have managed-site integrations, whose contracts must be assessed separately.

The established lineage is One API → New API → Veloera, and One API → OneHub → DoneHub. Other rows distinguish documented derivation from compatibility classifications.

| Site type | Registered scope | Relationship and compatibility boundary | Upstream / documentation |
| --- | --- | --- | --- |
| `one-api` | Account | Original One API upstream; sharing the account adapter with descendants does not add their managed-site features. | [Repository](https://github.com/songquanpeng/one-api) |
| `new-api` | Account + managed | Downstream of One API. Credential generations differ by deployment; retain one type and select the verified protocol. | [Repository](https://github.com/QuantumNous/new-api) · [Documentation](https://docs.newapi.ai/) |
| `apiyi` | Account | Hosted account service with New API-compatible behavior and its own console conventions. Compatibility does not establish a shared account service with other providers. | [Console](https://api.apiyi.com/) |
| `laozhang` | Account | Independent hosted account service. Its four console aliases share accounts; APIyi-like pricing/group behavior does not make LaoZhang and APIyi accounts interchangeable. | [Console](https://api.laozhang.ai/) · [API manual and alternate domains](https://docs.laozhang.ai/api-manual) · [Registered aliases](../../src/services/accountSiteDefinitions/identifiers.ts) |
| `ModelFlare` | Account | Deployment compatibility type with its own cookie authentication and account-header requirements; ordinary New API token behavior is not assumed. | [Console](https://modelflare.dev/) |
| `anyrouter` | Account | New API-compatible account integration with provider-specific authentication/check-in behavior; exact upstream lineage is not asserted. | [Documentation](https://docs.anyrouter.top/) |
| `Veloera` | Account + managed | Downstream of New API, with account and managed-site overrides. | [Repository](https://github.com/Veloera/Veloera) |
| `one-hub` | Account | Downstream of One API with a substantially different surface; local account-adapter reuse is broader than upstream lineage. | [Repository](https://github.com/MartialBE/one-hub) |
| `done-hub` | Account + managed | Downstream of OneHub. Reuses account-family capabilities while maintaining a dedicated management contract. | [Repository](https://github.com/deanxv/done-hub) |
| `v-api` | Account | Describes itself as based on One API with some New API functionality; treat it as a derivative/compatibility type, not an exact New API clone. | [Repository](https://github.com/popjane/v-api) |
| `VoAPI` | Account | Legacy VoAPI compatibility type. Current VoAPI uses the separate `voapi-v2` type and dedicated protocol below. | [Project repository](https://github.com/VoAPI/VoAPI); verify the legacy deployment |
| `Super-API` | Account | Describes itself as based on New API; actual compatibility still depends on the deployment. | [Repository](https://github.com/SuperAI-Api/Super-API) |
| `Rix-Api` | Account | Closed-source New API fork. Generations can share version labels while differing in endpoints, identity and quota semantics; dialect changes stay within this type. | [Project repository](https://github.com/RixAPI/Rix-API) · [Vendor documentation/version log](https://rixapi.com/) · [Dialect rationale](../../src/services/apiService/newApiFamily/variants/rixApiDialects.ts) |
| `neo-Api` | Account | New API-family compatibility classification; exact derivation and degree of modification are unverified. | No verified public upstream reference recorded; obtain the target deployment |
| `wong-gongyi` | Account | New API-family compatibility type with provider-specific check-in handling; exact lineage is not asserted. | No stable verified public upstream reference recorded; obtain the target deployment |

`unknown` is an account fallback classification using the same family, not a named upstream backend or evidence of compatibility.

### Types with dedicated account adapters

These backends have distinct account contracts. Compatible inference APIs do not make their console authentication, account identity or native resources interchangeable with New API.

| Site type | Registered scope / account adapter | Relationship and identity boundary | Upstream / documentation |
| --- | --- | --- | --- |
| `sub2api` | Account + managed / [sub2api](../../src/services/apiAdapters/sub2api/) | Independent backend family with dedicated account and management contracts. Self-hosted installations and deployment-specific check-in methods retain this type. | [Repository](https://github.com/Wei-Shaw/sub2api) |
| `xiaoen` | Account / [xiaoen](../../src/services/apiAdapters/xiaoen/) | 肖恩 AI CharityAPI console with Cookie identities, expiring daily credits and a singleton inference key. Its inference API compatibility does not establish a New API account contract. Saved sessions remain bound to `free.supxh.xin`; the official migration console and inference domains are separate roles. | [Console](https://free.supxh.xin/) · [Publication page](https://xiaoenai.pages.dev/) |
| `voapi-v2` | Account / [voapiV2](../../src/services/apiAdapters/voapiV2/) | Current VoAPI generation has a dedicated contract; the older `VoAPI` compatibility type remains separate. | [Repository](https://github.com/VoAPI/VoAPI) |
| `AIHubMix` | Account / [aihubmix](../../src/services/apiAdapters/aihubmix/) | Hosted provider with separate web-console and canonical API origins. Saved-account access and one-time key handling use its dedicated contract. | [Account API docs](https://docs.aihubmix.com/en/api/Cli) · [Model API docs](https://docs.aihubmix.com/en/api/Models-API) |
| `sharedchat` | Account / [sharedchat](../../src/services/apiAdapters/sharedchat/) | Hosted cookie-authenticated account/service integration. No verified public backend repository is recorded. | [Canonical console](https://new.sharedchat.cc/) |
| `freemodel` | Account / [freemodel](../../src/services/apiAdapters/freemodel/) | Hosted cookie-authenticated account service. Stored balance, subscription allowances and inference-key access are separate concepts; the model list is key-scoped. | [Console](https://freemodel.dev/) |
| `dahl` | Account / [dahl](../../src/services/apiAdapters/dahl/) | Independent hosted console with UUID identities and HttpOnly Cookie authentication. Token pool and per-key allocations are separate from inference credentials; dollar values represent token credit at the published rate, including free tokens. No verified New API lineage or public backend source. | [Console](https://inference.dahl.global/account) · [Docs](https://inference.dahl.global/docs/) |
| `RightCode` | Account / [rightcode](../../src/services/apiAdapters/rightcode/) | Provider-owned REST backend, not a One API/New API derivative. `www.right.codes`, `right.codes` and `rightapi.ai` are aliases of one account service. | [Console](https://www.right.codes/) · [Documentation](https://docs.rightapi.ai/) |
| `openrouter` | Account / [openrouter](../../src/services/apiAdapters/openrouter/) | Hosted platform with Management Keys and its own account/key/model contracts; not a managed/self-hosted gateway integration. | [Platform](https://openrouter.ai/) · [Documentation](https://openrouter.ai/docs) · [OpenAPI source](https://github.com/OpenRouterTeam/docs/blob/main/openapi/openapi.yaml) |
| `kimi` | Account / [kimiOpenPlatform](../../src/services/apiAdapters/kimiOpenPlatform/) | Kimi China: separate accounts, credentials and CNY balances from Global. Shares implementation with Global, not account identity; neither type is Kimi Code. | [China console](https://platform.kimi.com/) · [Regional boundaries](../../src/services/kimiOpenPlatform/deployments.ts) |
| `kimi-global` | Account / [kimiOpenPlatform](../../src/services/apiAdapters/kimiOpenPlatform/) | Kimi Global: separate accounts, credentials and USD balances from China. Region changes must not silently reuse the other region's credentials. | [Global console](https://platform.kimi.ai/) · [Regional boundaries](../../src/services/kimiOpenPlatform/deployments.ts) |
| `grsai` | Account / [grsai](../../src/services/apiAdapters/grsai/) | Provider-owned REST backend, not a New API derivative. `grsai.com` and `grsai.ai` share an account service; console API and inference origins have separate roles. | [Console](https://grsai.com/) · [Alternate console](https://grsai.ai/) · [Protocol owner](../../src/services/apiService/grsai/) |
| `cubence` | Account / [cubence](../../src/services/apiAdapters/cubence/) | Hosted cookie-authenticated account service with stored credit, today's usage, native keys and invitation aff. | [Website](https://cubence.com/) · [Documentation](https://docs.cubence.com/en/docs) |
| `krill` | Account / [krill](../../src/services/apiAdapters/krill/) | Provider-owned backend, not a New API/One API derivative (`/api/status`, `/api/user/self` and `/api/user/token` do not exist). `www.krill-ai.net` is a redirect entry address; the console Cookie, account API and saved account all live on `www.krill-code.com`. Keys are channel-routed and never expose a stored plaintext; `api.krill-ai.net`, `api-slb.krill-ai.net` and `api.cdn-krill-ai.com` are inference-only routes and stay out of console detection. | [Console](https://www.krill-code.com/) |
| `emrank` | Account / [emrank](../../src/services/apiAdapters/emrank/) | Provider-owned embedding/reranker gateway, not a New API derivative. One origin `emrank.tech` serves the console, its `/api/*` account routes and the `/v1` inference mount; `docs.emrank.tech` and `status.emrank.tech` are documentation and status pages, not console aliases. | [Console](https://emrank.tech/) · [Documentation](https://docs.emrank.tech/) |
| `relayfor` | Account / [relayfor](../../src/services/apiAdapters/relayfor/) | Independent AI public welfare service platform with Bearer token authentication, daily check-in campaigns, masked token listings, and ratio pricing; not a New API/One API derivative. | [Website](https://relayfor.xyz/) |
| `requesty` | Account / [requesty](../../src/services/apiAdapters/requesty/) | Closed-source hosted LLM gateway with manage-key authentication, prepaid USD credits, full key CRUD and a public priced model catalog; not a New API/One API derivative. The console (`app.requesty.ai`), management API (`api-v2.requesty.ai`) and inference gateway (`router.requesty.ai`) are separate origins; the EU router is a data-residency inference variant, not an account alias. | [Console](https://app.requesty.ai/) · [Documentation](https://docs.requesty.ai/) · [Protocol owner](../../src/services/apiService/requesty/) |
| `daya` | Account / [daya](../../src/services/apiAdapters/daya/) | Provider-owned account backend with Cookie-session authentication, ordered key routing and a public model catalog; not a New API/One API derivative. Console and inference origins are registered separately. | [Console](https://api.dayaai.com/) |

### Managed-only backend types

All rows below have managed scope and `Unsupported` **account** adapter family. That value means saved-account operations are not registered; their managed adapters remain supported. Their deployment URL identifies the user's installation, so official project/docs hosts are not automatic account-detection targets.

| Site type | Relationship and management boundary | Upstream / documentation | Protocol owner |
| --- | --- | --- | --- |
| `octopus` | Dedicated gateway-management contract and native resources; not a New API account integration. | [Repository](https://github.com/bestruirui/octopus) | [octopus](../../src/services/apiService/octopus/) |
| `cli-proxy-api` | Provider-management backend with dedicated management-key authentication. Compatible inference APIs do not make it an account site or an OmniRoute alias. | [Repository](https://github.com/router-for-me/CLIProxyAPI) · [Documentation](https://help.router-for.me/) | [cliProxyApi](../../src/services/apiService/cliProxyApi/) |
| `axonhub` | Dedicated GraphQL administration and native resources, not One API/New API management compatibility. | [Repository](https://github.com/looplj/axonhub) | [axonhub](../../src/services/apiService/axonHub/) |
| `claude-code-hub` | Dedicated admin/provider integration; its contract is not One API/New API management. | [Repository](https://github.com/ding113/claude-code-hub) | [claudeCodeHub](../../src/services/apiService/claudeCodeHub/) |
| `omniroute` | Fork of 9router with materially different remote authentication and provider resources, so it has its own type. It is also separate from CLIProxyAPI. | [Repository](https://github.com/diegosouzapw/OmniRoute) · [Management-auth guide](https://github.com/diegosouzapw/OmniRoute/blob/release/v3.8.51/docs/guides/MANAGEMENT-AUTH.md) | [omniroute](../../src/services/apiService/omniroute/) |
| `gpt-load` | Independent Go gateway. A managed channel maps to a native group with a driver and credential pool; its root management credential is separate from downstream keys. | [Repository](https://github.com/tbphp/gpt-load) | [gptLoad](../../src/services/apiService/gptLoad/) |
| `magpie` | Independent native provider-management contract. Management Web-key sessions and inference access have different roles; the official docs host is not an account origin. | [Repository](https://github.com/yetone/magpie) · [Setup documentation](https://usemagpie.ai/docs/start) | [magpie](../../src/services/apiService/magpie/) |

### Deployments and check-in methods within a type

A deployment-specific protocol or method name does not by itself justify another site type. The [check-in registry](../../src/services/checkin/autoCheckin/providers/registry.ts) distinguishes candidate eligibility from a confirmed usable method.

| Deployment / method | Relationship | Reference |
| --- | --- | --- |
| AI-ROUTER | Sub2API deployment with separate browser and API origins; retain the browser origin as the saved account URL and resolve the request origin at the transport boundary. | [Deployment](https://ai-router.dev/) · [Origin policy](../../src/constants/deploymentApiOrigins.ts) |
| ToolCode growth-center check-in | A method under `sub2api`, with structural discovery across eligible installations; its name is not a separate site type or a hostname allowlist. | [Deployment](https://toolcode.top/) · [Protocol](../../src/services/apiService/sub2api/checkin/toolcodeCheckIn.ts) |
| Hiyo Free daily check-in | A method under `sub2api`, with structural discovery across eligible installations. Daily rewards and extra bonuses remain different actions; sharing Sub2API does not guarantee this method exists. | [Deployment](https://free.hiyo.top/) · [Protocol](../../src/services/apiService/sub2api/checkin/hiyoCheckIn.ts) |
| 詞元公益站 daily check-in | A method under `sub2api`, with structural discovery across eligible installations. It shares the status path with the Genius Programmer method but serves a different response contract; a sibling DTO resolves as unsupported instead of unknown, so one deployment's method cannot block the other's discovery. | [Deployment](https://api.clawhud.com/) · [Protocol](../../src/services/apiService/sub2api/checkin/clawhudCheckIn.ts) |
| AgentRouter login check-in | Deployment-specific browser-login/check-in policy for New API-family accounts; its candidates cover `new-api`, `one-api` and `unknown`, with no separate `agentrouter` type. | [Deployment](https://agentrouter.org/) · [Login origins](../../src/services/accountLogin/providers/agentrouter/config.ts) |

## Documentation ownership

Update the owner of the information when its contract changes:

| Information | Where it belongs |
| --- | --- |
| Registered types, capabilities and deployment mappings | Runtime definitions and registries remain authoritative; the relationship overview explains their meaning and points to sources |
| Non-obvious protocol constraints that explain implementation decisions | A concise source-and-contract comment beside the owning logic, with regression coverage for the behavior |
| Type relationships, aliases and upstream reference material | The overview above; update it when a type, family boundary or known source changes |
| Contracts spanning modules and enduring architectural decisions | The existing module README or architecture documentation, linked to the code owners; retain the rationale and rejected alternatives without repeating wire schemas |
| Reusable integration procedures | The relevant integration skill reference; shared module invariants belong in the module's existing README |
| Deployment observations, versions, build hashes, sample rewards and live validation results | The current task's spec and evidence index; raw captures remain local under the [evidence workflow](../../.agents/skills/add-site-integration/references/evidence-and-validation.md) |
| User actions, supported features and limitations | The relevant public feature/usage page; update affected translations together |
| Public site / gateway / tool support matrices and root READMEs | [docs/docs/supported-sites.md](../docs/supported-sites.md) and [supported-export-tools.md](../docs/supported-export-tools.md) across all locales (`zh`, `en`, `ja`), plus root `README.md`, `README_CN.md`, and `README_JA.md`. Synchronize affected entries when catalog contents change, following the public catalog conventions below |

Keep source comments when external evidence determines authentication, endpoint selection, unsupported capabilities, compatibility boundaries, secret handling or deliberate non-fallback behavior. Record the source and the specific constraint; do not narrate implementation already clear from local types and tests.

Before removing an existing note, check that its decision-critical rationale and source remain discoverable in the appropriate owner. Implementation alone does not explain why a constraint exists; preserve any missing rationale before deleting the note.

### Public catalog conventions

Use the relationship overview for upstream sources and the [supported-sites page](../docs/supported-sites.md) for provider and project introductions. Apply these rules to support catalogs and root README compatibility lists:

- Match sibling entries in naming, formatting and level of detail. Name cells contain the public site or project name, without appended domains, internal identifiers, authentication methods or implementation notes. Use a short regional qualifier only when needed to distinguish separately listed platforms.
- Order comparable entries by popularity within each existing category, following the [catalog and gateway popularity policy](#gateway-presentation-order). Synchronize that relative order across support tables, locale counterparts and README compatibility lists; do not use registration order or prepend a newly adapted site. Sponsor showcases retain their separately curated order.
- Do not automatically promote investigation or deployment URLs into public catalog links. Match comparable entries: when those use plain names and no official link, keep that presentation rather than adding the adapted deployment's domain. Retain investigation URLs in developer references or local evidence. For deliberately curated official references, use the existing link column or linked-name convention; do not repeat hostnames as name suffixes.
- Keep introductions about the upstream service, project lineage and relationships. Do not append deployment-specific check-in rules, reward amounts or units, reset times, eligibility, authentication procedures, endpoint behavior, or adaptation limitations. User actions and capability details belong in the relevant integration or service guide; protocol rationale belongs beside its code, and live observations belong in local task evidence.
- Update catalogs when an entry, name, link, introduction or advertised support boundary changes. A capability-only adaptation does not require artificial catalog edits while existing entries remain accurate. Check the affected locale counterparts and root compatibility lists together before completion.

Verify behavior against the target deployment when it differs from upstream; record the deployment/version scope with the task evidence. If missing evidence blocks a protocol decision, identify the missing contract and continue independent work.

Maintain this guide for source ownership, shared conventions, type relationships and upstream references. Keep a concise entry for each type and meaningful deployment boundary; individual endpoint additions and live runs do not require a new technical profile here.

## Cubence account contract

Cubence (`cubence`) is one account-only site type with a dedicated `Cubence`
adapter family, verified on `https://cubence.com` on 2026-10-09. It is not
Sub2API: `/api/v1/auth/me` returns `{user}`, native key APIs use
`{success,data}`, analytics uses `code:200`, and invitations use `code:0`.

- **Authentication:** the default and only verified console method is Cookie.
  The observed frontend and official docs expose OAuth/email login and inference
  keys, but no console PAT or refresh-token flow. Cookie lifetime is not known;
  never call it permanent. Sign into the same account again when it expires.
  Browser-session accounts can be saved without exporting Cookie text; an
  explicit per-account Cookie import remains optional. Form validation follows
  the same `usesBrowserCookieSession` profile as stored-account requests.
  Read `/api/v1/auth/me` and match the saved numeric identity; `auth-user` in
  localStorage is only a UI cache. Inference keys do not authenticate accounts.
- **Domains:** keep the console/session origin `https://cubence.com`. The live
  supported-endpoints response lists `api-lb.cubence.ai` (mainland optimized),
  `api.cubence.ai` (global), and `api.cubence.com` (outside mainland). The last is
  the documented export default. These are inference endpoints, not console
  aliases; never send account cookies there or use cross-domain auth fallback.
  Older docs list `api-dmit`, `api-bwg`, `api-cf` under `cubence.com`; an older
  notice lists `api`, `api-dmit`, `api-bwg` under `cubence.top`. These older
  inference alternatives are not automatically probed or promoted to aliases.
- **Balance/usage:** 1 USD is 1,000,000 native units. `normal_balance` is stored
  credit; charity and discontinued subscription allowances are not merged.
  `/api/v1/analytics/apikeys/hourly-usage?range=today` uses Asia/Shanghai midnight;
  do not substitute the 24h window. Use the native total/output token counters
  without double-counting cache counters. Missing/failed statistics stay unknown.
- **Keys:** `/api/v1/user/apikeys` is an unpaginated inventory with recoverable
  plaintext. Create requires name, quota (`-1` unlimited, otherwise microcredits),
  `share_type:public`, and a single explicit `share_group_id`. The site defaults
  to 10 USD; Hub defaults new keys to unlimited, with no selected group. Separate PATCH routes `/:id/quota`,
  `/:id/share-group`, and `/:id/status` change only those fields. Names cannot be
  edited and expiry/IP/model limits are not native fields. Editors retain the
  accepted native record and PATCH only changed fields. Changed submissions read
  one fresh native record before dispatch to reject same-field conflicts and
  preserve unrelated remote edits; unchanged submissions skip that read. Successful
  write and deletion acknowledgments are authoritative; uncertain writes are not replayed.
  Hosted writes reject an unadapted extension Origin with an empty HTTP 403.
  Chromium direct transport supplies the site Origin and a fixed Cookie snapshot
  through scoped DNR rules with `credentials:omit` and redirects disabled (real
  CRUD verified 2026-10-10). Reuse the shared header-request lock; keep rule
  ownership through late installation/cleanup and clear orphan rules before
  subsequent requests. Saved Cookie takes precedence; browser-session mode
  captures cookies once per operation without writing them back. Respect Cookie
  domain/path/store scope, and reject an unresolved private store. Cubence's
  observed HttpOnly login Cookie is `token`: bind its value across the operation,
  rejecting ambiguous or changed effective values before sending. Unrelated
  scoped Cookies may differ; never broaden their paths to force header equality.
  Identity and write/readback share the snapshot; only actual writes contribute
  mutation evidence. Identity/balance responses are reused only within that operation.
  No verified rotation contract exists: expired snapshots require login/import,
  never switching to the browser's current account. Firefox retains the existing
  page/interceptor path pending equivalent browser verification.
- **Chromium permission lifecycle:** `declarativeNetRequestWithHostAccess` is
  required at extension load; Cookie reads remain optional. Fresh optional DNR
  grants reproduced pending native rule updates in isolated Edge/Chromium tests;
  extension reload could restore API completion without applying request headers.
  Required-at-load DNR applied the same rule correctly. Do not use an API Promise
  resolving as proof of header isolation, or auto-reload user drafts after a grant.
  Updating an ungranted extension to required DNR also passed native testing;
  browsers already affected by a runtime grant may need one browser restart.
  This uses the existing host access without expanding it. Explicitly denied
  permissions and failed permission inspection differ: inspection failure must
  not let ordinary requests bypass orphan-rule cleanup.
- **Safari:** shared transport rejects isolated Cookie requests before DNR
  installation or network dispatch until native isolation is verified. Basic
  Safari manifest and permission handling are maintained separately; Cubence
  account requests remain unavailable. Future work must verify native Safari
  behavior without silently substituting the browser's current account.
- **Catalog:** `/api/model-plaza` is the provider catalog;
  `/api/v1/share-groups/available` determines selectable groups. Selected-key
  model lists are filtered by the owned key's group. Static USD/M token prices
  are estimates; native tiers, scheduled multipliers, image-area billing and
  account consumption-tier discounts are not fully reconstructed. Complex rows
  explicitly have unavailable prices, not invented flat quotes.
- **Other features:** `/api/v1/invite/my-code` supplies `data.invite_code` for
  `/signup?code=<encoded-code>`. Announcements use the paginated site list, with
  local read state; popup revision and presentation state are not new identities.
  Redemption links to `/dashboard/subscription`, without automated grant writes.
  The observed lottery event has ended; it is not a currency check-in method.
  Privacy filtering, balance alerts, commissions/payouts, invoices, private
  messages, and ticket management remain in the native console.

Sources: [console](https://cubence.com/dashboard),
[pricing](https://docs.cubence.com/en/docs/guides/pricing),
[endpoints](https://docs.cubence.com/en/docs/guides/endpoints). Local request,
native-form, mutation-readback and cleanup evidence is indexed under
`.scratch/cubence-adaptation/spec.md` and stays outside Git.


## Dahl account contract

Dahl (`dahl`) has a dedicated Cookie account adapter at `https://inference.dahl.global`, with verified UUID identities and no managed gateway capabilities.

- **Authentication:** onboarding discovers the UUID through `/v1/account`; blank detection IDs are not saved account bindings. Completed browser identity observations are not cached because the login Cookie is HttpOnly. Account operations capture one Cookie session for identity, mutation and readback; expired saved sessions require logging into the same account again. Native Firefox transport remains unverified.
- **Credit and usage:** dollar balances value the pool plus key allocations at the configured published $0.03/M token rate, including free credit. This is token-credit value, not cash. Usage covers the rolling 30-day window; no verified calendar-day contract is advertised. Catalog discovery is provider-wide; pricing is a published flat-rate estimate.
- **Keys:** creation starts at zero tokens with an optional name. Secrets are recoverable, so creation does not recommend vault storage and offers a direct Allocate continuation. Rename, Allocate, Return and Revoke are independent actions. Funding accepts whole-token K/M input, 25%/50%/Max, source-balance validation and transfer previews. Direction, amount and the accepted key baseline survive submission; stale balances stop before POST, and uncertain dispatch is never blindly replayed. Revocation returns remaining credit and retains the website's revoked record.
- **Names:** save locally before background synchronization. Names are scoped by origin, UUID and browser profile; a verified matching website page synchronizes `dahl_key_labels` in both directions. Without one, edits remain pending. The website needs a reload to display changed labels. Locks and revision checks preserve newer edits; malformed reads do not acknowledge removals.
- **Other features:** today statistics, check-in, referrals, redemption, announcements and admin management are unavailable. The maintained live runner creates and cleans up its own key when mutation testing is selected, and redacts credentials in generated review evidence.

## FoxCode account contract

FoxCode (`foxcode`) is an account-only Cookie adapter at `https://foxcode.rjj.cc`, with a dedicated adapter family and CUID identities. Its Nuxt `success/data` envelopes do not establish New API or Sub2API compatibility.

- **Authentication:** `/api/auth/me` verifies the live string account ID. Each operation captures the HttpOnly `auth_token` session for identity, writes and readback; mismatched identities stop before mutations. Inference keys are not console credentials. No verified ordinary console token or refresh contract is advertised. Login expiry requires returning to `/auth/login`.
- **Origins:** only `foxcode.rjj.cc` is a console/storage alias. Public `api_endpoint_config` selects the inference origin for runtime keys; the observed primary is `https://code1.newcli.com`, with `code2.newcli.com` and `dm-fox.rjj.cc` alternatives. Console credentials stay on the console origin. OpenAI consumers use `/v1`; Anthropic consumers use the inference root.
- **Credit and plans:** native monetary quotas use 1,000,000 units per USD. Active `NEVER` plans contribute purchased credit; resetting active plans supply the separate subscription allowance. Expired history and combined dashboard quota are not purchased balances. Recent usage records do not establish calendar-day totals. Per-call rows do not turn call counts into tokens, and channel-scaled spending is not substituted for missing base cost.
- **Native keys:** paginated `/api/keys` supplies full edit baselines and recoverable plaintext secrets. Creation and editing support name, optional description, required channel, and unlimited or USD quota; editing also supports status and preserves unrestricted access for existing keys with no channel binding. Creation still requires a channel, and restricted keys cannot be unbound. There is no verified single-key detail GET. Editors retain accepted native records; PATCH sends changed fields only, preserving untouched server fields without claiming fresh conflict detection. Successful PATCH acknowledgments merge submitted changes (or validate the returned native record); DELETE can succeed without `data` and needs no inventory readback. Uncertain writes are not replayed. Canonical channel identities drive runtime groups and pricing, while native aliases remain edit values. Missing or masked secrets cannot be exported as runtime credentials. Unknown channels do not imply unrestricted model access.
- **Models and prices:** `model_square_config` binds model lists to channels; `/api/model-pricing` publishes token USD/M and per-call prices. Channel quota multipliers apply to the price estimate. Missing prices, unknown pricing fields or complex group overrides explicitly produce unavailable prices. Personal discounts and unverified billing tiers are not reconstructed. Runtime key catalog discovery uses the native binding rather than probing a paid inference request.
- **Other features:** dashboard announcements retain upstream ID and publication time with local read state. `/api/user/referral` yields `/auth/register?aff=<encoded-code>`. Redemption navigates to `/redeem` without automated grants. No verified check-in method or admin gateway capability is advertised.

Run `pnpm e2e:cdp:foxcode -- --isolate` against the current-worktree build. `--mutate` creates, edits and deletes one owned key, without inference or monetary writes. An optional `FOXCODE_SESSION_FILE` accepts a verified identity and only origin-scoped authorized cookies. Raw local screenshots and protocol evidence live outside Git under `.scratch/foxcode-adaptation/evidence/`.

<a id="gateway-presentation-order"></a>

## Catalog and gateway popularity order

Public support catalogs and README compatibility lists use popularity order within their existing categories. Plugin gateway/managed-site selectors and navigation use `MANAGED_SITE_TYPE_ORDER` in `src/services/accountSiteDefinitions/definitions.ts`; their relative order must also match the public gateway catalogs. Adding an entry includes choosing its position; registration order or appending at the end is not a popularity decision.

- For open-source projects with comparable public repositories, sort by upstream GitHub stars descending. Verify counts live when adding an entry or revising the order; refresh the compared repositories together and record repository sources, counts, and the snapshot date here. Keep the runtime gateway snapshot beside its order constant consistent. Keep this a deliberate static snapshot rather than fetching popularity during UI rendering.
- Use traffic or adoption evidence where stars are unavailable or insufficient to distinguish candidates. Record the source, measurement period, and rationale; compare the same metric and period. Do not combine stars and visits into an invented score or substitute a guessed traffic ranking. Self-hosting alone does not mean a public repository has no star count.
- Keep equal-ranked entries in their existing relative order. Place entries without comparable evidence after the ranked group, preserve the existing relative order of that unranked remainder, and append new unranked entries to it. Record the reason and revisit when comparable evidence becomes available. If evidence cannot be retrieved, disclose the provisional placement in the task report.
- Update the public-order assertions in `tests/services/accountSiteDefinitions/registry.test.ts` and `publicCatalogOrder.test.ts`; check affected selectors/navigation for hard-coded lists that bypass the registry. Preserve saved-account/user-customized ordering. `ACCOUNT_SITE_TYPE_ORDER` remains the runtime compatibility order, independently of the categorized public catalogs; this policy does not reorder saved accounts or change detection precedence.

### Popularity snapshot (2026-10-15)

Source: upstream GitHub repository API `stargazers_count`, retrieved together on the date above. Compare only entries within the same catalog category; README export summaries combine the export-tool categories using the same metric. These counts measure project interest, not hosted-service traffic or an endorsement.

| Upstream repository | GitHub stars |
| --- | ---: |
| [farion1231/cc-switch](https://github.com/farion1231/cc-switch) | 144,538 |
| [diegosouzapw/OmniRoute](https://github.com/diegosouzapw/OmniRoute) | 76,741 |
| [router-for-me/CLIProxyAPI](https://github.com/router-for-me/CLIProxyAPI) | 55,296 |
| [CherryHQ/cherry-studio](https://github.com/CherryHQ/cherry-studio) | 52,652 |
| [QuantumNous/new-api](https://github.com/QuantumNous/new-api) | 50,001 |
| [Wei-Shaw/sub2api](https://github.com/Wei-Shaw/sub2api) | 44,078 |
| [musistudio/claude-code-router](https://github.com/musistudio/claude-code-router) | 37,685 |
| [songquanpeng/one-api](https://github.com/songquanpeng/one-api) | 37,167 |
| [Kilo-Org/kilocode](https://github.com/Kilo-Org/kilocode) | 27,612 |
| [RooCodeInc/Roo-Code](https://github.com/RooCodeInc/Roo-Code) | 24,276 |
| [yetone/magpie](https://github.com/yetone/magpie) | 13,144 |
| [tbphp/gpt-load](https://github.com/tbphp/gpt-load) | 7,097 |
| [looplj/axonhub](https://github.com/looplj/axonhub) | 5,359 |
| [Chevey339/kelivo](https://github.com/Chevey339/kelivo) | 4,224 |
| [ding113/claude-code-hub](https://github.com/ding113/claude-code-hub) | 3,396 |
| [MartialBE/one-hub](https://github.com/MartialBE/one-hub) | 2,898 |
| [bestruirui/octopus](https://github.com/bestruirui/octopus) | 2,707 |
| [coulsontl/ai-toolbox](https://github.com/coulsontl/ai-toolbox) | 1,780 |
| [Veloera/Veloera](https://github.com/Veloera/Veloera) | 1,630 |
| [VoAPI/VoAPI](https://github.com/VoAPI/VoAPI) | 1,092 |
| [deanxv/done-hub](https://github.com/deanxv/done-hub) | 809 |
| [SuperAI-Api/Super-API](https://github.com/SuperAI-Api/Super-API) | 116 |

APIyi, ModelFlare and v-api have no comparable repository identified in the curated catalog. Cursor++ likewise has a curated website but no comparable repository identified there; it follows the ranked editor tools. These entries retain their existing relative order after ranked entries.

Independent platforms and commercial relays have no complete, same-period traffic/adoption comparison in this snapshot. Their existing relative order is retained provisionally; the new unranked Krill AI entry follows that remainder. A single provider's traffic estimate or its parent chatbot's traffic is insufficient to rank the whole category. Refresh the cohort together when comparable evidence becomes available.

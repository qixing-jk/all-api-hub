# Site integrations: ownership and relationships

Use the [type relationships and sources](#site-types-and-upstream-relationships) to understand an integration, and the ownership map to locate its code and workflow. The [integration skill](../../.agents/skills/add-site-integration/SKILL.md) owns investigation and delivery; load only the references for the requested capability.

## Source ownership

Site type, account/managed scope, and adapter family are separate decisions. A detected type or shared family does not establish that a deployment supports every capability. Confirm registration and the target contract before advertising support; missing extension code does not establish upstream absence.

| Question | Owner |
| --- | --- |
| Which types, scopes, families, onboarding defaults and product profiles are registered? | [Site definitions](../../src/services/accountSiteDefinitions/definitions.ts), with [identifiers](../../src/services/accountSiteDefinitions/identifiers.ts) and [registry accessors](../../src/services/accountSiteDefinitions/registry.ts) |
| Which domains share a deployment policy? | [Deployment definitions](../../src/services/accountSiteDefinitions/deployments.ts) and [API-origin mappings](../../src/constants/deploymentApiOrigins.ts) |
| How is a site detected during onboarding? | [Site detection](../../src/services/siteDetection/detectSiteType.ts) |
| Which account capabilities are dispatched? | [Adapter registry](../../src/services/apiAdapters/registry.ts) and the selected family/variant |
| Where do authentication and wire-protocol differences belong? | [API services](../../src/services/apiService/) and the owning adapter |
| Where are management operations and native resources implemented? | [Managed sites](../../src/services/apiAdapters/managedSites/) and [native resource adapters](../../src/services/apiAdapters/managedResources/README.md) |
| How are check-in methods discovered and executed? | [Method registry and providers](../../src/services/checkin/autoCheckin/providers/registry.ts); follow the [check-in workflow](../../.agents/skills/add-site-integration/references/check-in.md) |

`src/constants/siteType.ts` is a compatibility facade over the definition registry. Provider directories, detection rules and documentation lists are not separate support declarations.

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
| `voapi-v2` | Account / [voapiV2](../../src/services/apiAdapters/voapiV2/) | Current VoAPI generation has a dedicated contract; the older `VoAPI` compatibility type remains separate. | [Repository](https://github.com/VoAPI/VoAPI) |
| `AIHubMix` | Account / [aihubmix](../../src/services/apiAdapters/aihubmix/) | Hosted provider with separate web-console and canonical API origins. Saved-account access and one-time key handling use its dedicated contract. | [Account API docs](https://docs.aihubmix.com/en/api/Cli) · [Model API docs](https://docs.aihubmix.com/en/api/Models-API) |
| `sharedchat` | Account / [sharedchat](../../src/services/apiAdapters/sharedchat/) | Hosted cookie-authenticated account/service integration. No verified public backend repository is recorded. | [Canonical console](https://new.sharedchat.cc/) |
| `freemodel` | Account / [freemodel](../../src/services/apiAdapters/freemodel/) | Hosted cookie-authenticated account service. Stored balance, subscription allowances and inference-key access are separate concepts; the model list is key-scoped. | [Console](https://freemodel.dev/) |
| `RightCode` | Account / [rightcode](../../src/services/apiAdapters/rightcode/) | Provider-owned REST backend, not a One API/New API derivative. `www.right.codes`, `right.codes` and `rightapi.ai` are aliases of one account service. | [Console](https://www.right.codes/) · [Documentation](https://docs.rightapi.ai/) |
| `openrouter` | Account / [openrouter](../../src/services/apiAdapters/openrouter/) | Hosted platform with Management Keys and its own account/key/model contracts; not a managed/self-hosted gateway integration. | [Platform](https://openrouter.ai/) · [Documentation](https://openrouter.ai/docs) · [OpenAPI source](https://github.com/OpenRouterTeam/docs/blob/main/openapi/openapi.yaml) |
| `kimi` | Account / [kimiOpenPlatform](../../src/services/apiAdapters/kimiOpenPlatform/) | Kimi China: separate accounts, credentials and CNY balances from Global. Shares implementation with Global, not account identity; neither type is Kimi Code. | [China console](https://platform.kimi.com/) · [Regional boundaries](../../src/services/kimiOpenPlatform/deployments.ts) |
| `kimi-global` | Account / [kimiOpenPlatform](../../src/services/apiAdapters/kimiOpenPlatform/) | Kimi Global: separate accounts, credentials and USD balances from China. Region changes must not silently reuse the other region's credentials. | [Global console](https://platform.kimi.ai/) · [Regional boundaries](../../src/services/kimiOpenPlatform/deployments.ts) |
| `grsai` | Account / [grsai](../../src/services/apiAdapters/grsai/) | Provider-owned REST backend, not a New API derivative. `grsai.com` and `grsai.ai` share an account service; console API and inference origins have separate roles. | [Console](https://grsai.com/) · [Alternate console](https://grsai.ai/) · [Protocol owner](../../src/services/apiService/grsai/) |

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

Keep source comments when external evidence determines authentication, endpoint selection, unsupported capabilities, compatibility boundaries, secret handling or deliberate non-fallback behavior. Record the source and the specific constraint; do not narrate implementation already clear from local types and tests.

Before removing an existing note, check that its decision-critical rationale and source remain discoverable in the appropriate owner. Implementation alone does not explain why a constraint exists; preserve any missing rationale before deleting the note.

Use the relationship overview for upstream sources and the [supported-sites page](../docs/supported-sites.md) for the public support description. Verify behavior against the target deployment when it differs from upstream; record the deployment/version scope with the task evidence. If missing evidence blocks a protocol decision, identify the missing contract and continue independent work.

Maintain this guide for source ownership, shared conventions, type relationships and upstream references. Keep a concise entry for each type and meaningful deployment boundary; individual endpoint additions and live runs do not require a new technical profile here.

## Gateway presentation order

Plugin gateway/managed-site selectors and navigation use `MANAGED_SITE_TYPE_ORDER` in `src/services/accountSiteDefinitions/definitions.ts` as their shared presentation order. Adding a gateway includes choosing its position; registration order or appending at the end is not a popularity decision.

- For open-source gateways with comparable public repositories, sort by upstream GitHub stars descending. Verify counts live when adding a gateway or revising the order; refresh the compared repositories together and record repository sources, counts, and the snapshot date beside the order constant. Keep this a deliberate static snapshot rather than fetching popularity during UI rendering.
- Use traffic or adoption evidence where stars are unavailable or insufficient to distinguish candidates. Record the source, measurement period, and rationale; compare the same metric and period. Do not combine stars and visits into an invented score or substitute a guessed traffic ranking. Self-hosting alone does not mean a public repository has no star count.
- Keep equal-ranked sites in their existing relative order. Place sites without comparable evidence after the ranked group and record the reason; revisit that exception when the site changes. If evidence cannot be retrieved, disclose the provisional placement in the task report.
- Update the existing public-order assertion in `tests/services/accountSiteDefinitions/registry.test.ts` and check affected selectors/navigation for hard-coded lists that bypass the registry. Preserve saved-account/user-customized ordering; `ACCOUNT_SITE_TYPE_ORDER` has its own compatibility order and is not implicitly covered by this gateway ranking rule.

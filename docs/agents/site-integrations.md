# Site Integration Guidance

Use the relevant provider sections for site integration tasks, not as a prerequisite for unrelated changes. Provider notes and upstream links are discovery aids; current registration and verified target behavior take precedence.

This repo models site support on three independent axes: account scope, managed-site scope, and adapter family/capabilities. Do not infer one axis from another.

`src/services/accountSiteDefinitions/definitions.ts` is the source of truth for registered site types, scopes, adapter families, onboarding metadata, and product profiles. `src/services/apiAdapters/registry.ts` owns capability dispatch. `src/services/apiService/` contains provider-specific protocol transports used by those adapters. Provider directories and detection rules are not support declarations.

Managed-site capabilities live under `src/services/apiAdapters/managedSites/`; provider-native resources live under `src/services/apiAdapters/managedResources/`. `src/constants/siteType.ts` is a compatibility facade over the definition registry, not a separately maintained site inventory.

When working on a site type:

1. Confirm registration and scope in `src/services/accountSiteDefinitions/identifiers.ts`, `definitions.ts`, and `registry.ts`.
2. Confirm capability dispatch in `src/services/apiAdapters/registry.ts` and the provider-specific adapter. Use `src/services/siteDetection/detectSiteType.ts` only for onboarding and detection behavior.
3. Verify upstream behavior before making definitive claims when backend differences matter.
4. If missing upstream evidence blocks a protocol decision, ask for the target deployment, fork, version, or a redacted trace. State assumptions and continue independent work; do not repeatedly request evidence already supplied.

## Relationships

- **One API (`one-api`)** is the original upstream family. One API/New API-family account types share capability construction under `src/services/apiAdapters/newApi/` and protocol transports under `src/services/apiService/newApiFamily/`.
- **New API (`new-api`)** is a One API downstream family with both account-site and managed-site support.
- **Veloera (`Veloera`)** is downstream of New API and uses the New API family plus Veloera-specific account and managed-site overrides.
- **OneHub (`one-hub`)** is downstream of One API with a substantially different surface.
- **DoneHub (`done-hub`)** is downstream of OneHub and uses New API-family account capabilities plus a dedicated managed-site adapter.
- **AnyRouter (`anyrouter`)** and **WONG公益站 (`wong-gongyi`)** use New API-family capabilities with provider-specific variants and check-in handling; verify the target deployment before describing their exact compatibility.
- **`v-api`** documents its backend as based on One API with some New API functionality; treat it as a One-API derivative/New API-compatible bucket rather than a pure New API fork.
- **`Super-API`, `Rix-Api`, and Neo-API (`neo-Api` in code)** are treated as New API-family variants or compatibility buckets, but their degree of downstream modification varies by deployment and should not be guessed without upstream docs or observed API behavior.
- **Legacy VoAPI (`VoAPI`)** remains a New API-family account compatibility bucket for older deployments. **Current VoAPI (`voapi-v2`)** is account-only and has dedicated adapters under `src/services/apiAdapters/voapiV2/` plus transports under `src/services/apiService/voapiV2/`; do not apply one generation's API assumptions to the other.
- **Octopus (`octopus`)** is managed-only and has dedicated managed-site capabilities plus protocol transports under `src/services/apiService/octopus/`.
- **AxonHub (`axonhub`)** is managed-only and not One-API/New-API compatible; it uses dedicated GraphQL admin integration and native managed-resource adapters.
- **Claude Code Hub (`claude-code-hub`)** is managed-only and not One-API/New-API compatible; it uses dedicated admin/provider and managed-site adapters.
- **Sub2API (`sub2api`)** is both an account site and a managed site. It has dedicated authentication-session, account, model-catalog, key-resource, and managed-resource integrations; it is not a New API-family alias.
- **AIHubMix (`AIHubMix`)** is account-only and uses dedicated capabilities under `src/services/apiAdapters/aihubmix/`. Always use `https://aihubmix.com` as the API origin, including accounts imported from `console.aihubmix.com`. Auto-detect may use logged-in web endpoints (`/call/usr/self`, `/call/usr/tkn`) to obtain the account access token, but saved accounts operate as access-token accounts. Token-authenticated requests send raw `Authorization: <access_token>` without a `Bearer` prefix. Full API keys are one-time secrets; saved key responses may be masked and must not fall back to New API-family secret-resolution behavior.
- **SharedChat (`sharedchat`)** is an account-only integration for the canonical `new.sharedchat.cc` deployment. It uses dedicated cookie-authenticated account, service-credential, invite, and model-catalog capabilities. Treat its observed deployment API as provider-specific; no verified public upstream source repository is currently recorded.
- **OpenRouter (`openrouter`)** is an account-only platform integration, not a managed/self-hosted backend. It uses Management Keys for account access and provides native API-key resources plus provider-owned model catalogs.

## Default Upstream References

When the user names a backend without a deployment URL or fork, treat these as the default upstream references:

- One API: `https://github.com/songquanpeng/one-api`
- New API: `https://github.com/QuantumNous/new-api`
- Veloera: `https://github.com/Veloera/Veloera`
- V-API: `https://github.com/popjane/v-api`
- Current VoAPI / `voapi-v2`: `https://github.com/VoAPI/VoAPI`; verify legacy `VoAPI` compatibility against the target deployment
- Super-API: `https://github.com/SuperAI-Api/Super-API`
- AnyRouter docs: `https://docs.anyrouter.top/`
- OneHub: `https://github.com/MartialBE/one-hub`
- DoneHub: `https://github.com/deanxv/done-hub`
- Octopus: `https://github.com/bestruirui/octopus`
- AxonHub: `https://github.com/looplj/axonhub`
- Claude Code Hub: `https://github.com/ding113/claude-code-hub`
- Sub2API: `https://github.com/Wei-Shaw/sub2api`
- AIHubMix API docs: `https://docs.aihubmix.com/en/api/Cli` and `https://docs.aihubmix.com/en/api/Models-API`
- SharedChat canonical deployment: `https://new.sharedchat.cc`; no verified public upstream source repository is currently recorded
- OpenRouter: `https://openrouter.ai/`; docs: `https://openrouter.ai/docs`; OpenAPI source: `https://github.com/OpenRouterTeam/docs/blob/main/openapi/openapi.yaml`

If the reported behavior differs from upstream, distinguish the target deployment from the default reference before concluding the repo is wrong.

## External Backend References in Code

- When implementation behavior depends on external upstream documentation or verified backend behavior, add a concise code comment near the adapter logic that records the source and the specific contract being relied on.
- This is required when the source determines protocol fields, authentication format, unsupported capabilities, compatibility boundaries, one-time secrets, endpoint selection, or deliberate non-fallback behavior.
- Prefer a short URL or upstream repository reference plus the relevant contract summary. Do not add broad comments for ordinary implementation details that are already obvious from local types or tests.

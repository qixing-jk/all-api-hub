# Managed Site Runtime Config Design

Date: 2026-05-19

## Goal

Deepen the managed-site configuration seam so every managed-site Adapter
operates on an explicit runtime config passed by the business layer, instead
of re-reading `userPreferences` inside provider operations.

## Problem

The current `ManagedSiteService` Interface exposes operations as:

```ts
searchChannel(baseUrl, token, userId, keyword)
createChannel(baseUrl, token, userId, payload)
updateChannel(baseUrl, token, userId, payload)
deleteChannel(baseUrl, token, userId, channelId)
```

This shallow shape matches New API, DoneHub, and Veloera, but it does not
represent Octopus, AxonHub, or Claude Code Hub accurately:

- Octopus needs `baseUrl`, `username`, and `password`.
- AxonHub needs `baseUrl`, `email`, and `password`.
- Claude Code Hub needs `baseUrl` and `adminToken`, with no meaningful
  managed-site `userId`.

Because the Interface cannot carry the full config, those Adapters currently
ignore the passed `baseUrl/token/userId` for several operations and call
`userPreferences.getPreferences()` internally to recover their real config.
That creates a misleading Interface: callers appear to choose the operation
target, but some Adapter implementations silently use the currently saved
global preferences instead.

This reduces Locality. Config validation, config shape knowledge, and operation
target selection are spread between the business layer and provider Adapter
implementations. It also makes tests weaker because a test that passes explicit
operation config may still need to mock global preferences for the Adapter to
work.

## Current Data Flow

```ts
const service = await getManagedSiteService()
const managedConfig = await service.getConfig()

await service.searchChannel(
  managedConfig.baseUrl,
  managedConfig.token,
  managedConfig.userId,
  keyword,
)
```

For New API-family managed sites, the Adapter uses those arguments directly:

```ts
async function searchChannel(baseUrl, token, userId, keyword) {
  return getApiService(siteType).searchChannel({
    baseUrl,
    auth: { accessToken: token, userId },
  }, keyword)
}
```

For Claude Code Hub, AxonHub, and Octopus, provider operations recover config
from preferences:

```ts
async function searchChannel(_baseUrl, _token, _userId, keyword) {
  const config = await getFullClaudeCodeHubConfig()
  if (!config) return null
  return claudeCodeHubApi.searchProviders(config, keyword)
}
```

Actual flow:

```ts
preferences
  -> service.getConfig()
  -> { baseUrl, token, userId }
  -> caller passes args
  -> adapter may ignore args
  -> adapter reads preferences again
  -> backend call
```

## Target Data Flow

Only the managed-site runtime config resolver reads preferences. Provider
operation Adapters receive explicit config and do not read preferences.

```ts
preferences
  -> managedSiteRuntimeConfigResolver
  -> { siteType, config }
  -> business layer passes config
  -> adapter operation
  -> backend call
```

Pseudo-code:

```ts
type ManagedSiteRuntimeConfig =
  | { siteType: "new-api"; config: NewApiConfig }
  | { siteType: "done-hub"; config: DoneHubConfig }
  | { siteType: typeof SITE_TYPES.VELOERA; config: VeloeraConfig }
  | { siteType: "octopus"; config: OctopusConfig }
  | { siteType: "axonhub"; config: AxonHubConfig }
  | { siteType: "claude-code-hub"; config: ClaudeCodeHubConfig }

async function getCurrentManagedSiteRuntimeConfig() {
  const prefs = await userPreferences.getPreferences()
  return resolveManagedSiteRuntimeConfigForType(
    prefs,
    prefs.managedSiteType ?? SITE_TYPES.NEW_API,
  )
}

function resolveManagedSiteRuntimeConfigForType(prefs, siteType) {
  switch (siteType) {
    case SITE_TYPES.CLAUDE_CODE_HUB:
      return {
        siteType,
        config: requireClaudeCodeHubConfig(prefs.claudeCodeHub),
      }
    case SITE_TYPES.AXON_HUB:
      return {
        siteType,
        config: requireAxonHubConfig(prefs.axonHub),
      }
    case SITE_TYPES.OCTOPUS:
      return {
        siteType,
        config: requireOctopusConfig(prefs.octopus),
      }
    default:
      return {
        siteType,
        config: requireAccessTokenManagedSiteConfig(prefs, siteType),
      }
  }
}
```

Provider operation Interface:

```ts
interface ManagedSiteService<TConfig> {
  siteType: ManagedSiteType

  getConfig(): Promise<TConfig | null>

  searchChannel(
    config: TConfig,
    keyword: string,
  ): Promise<ManagedSiteChannelListData | null>

  createChannel(
    config: TConfig,
    payload: CreateChannelPayload,
  ): Promise<ApiResponse<unknown>>

  updateChannel(
    config: TConfig,
    payload: UpdateChannelPayload,
  ): Promise<ApiResponse<unknown>>

  deleteChannel(
    config: TConfig,
    channelId: number,
  ): Promise<ApiResponse<unknown>>

  fetchChannelSecretKey?(
    config: TConfig,
    channelId: number,
  ): Promise<string>

  hydrateComparableChannelKeys?(
    config: TConfig,
    candidates: ManagedSiteChannel[],
  ): Promise<ManagedSiteChannel[]>
}
```

Example Adapter operation:

```ts
async function searchChannel(
  config: ClaudeCodeHubConfig,
  keyword: string,
): Promise<ManagedSiteChannelListData | null> {
  const providers = await claudeCodeHubApi.searchProviders(config, keyword)
  return toManagedSiteChannelList(providers)
}
```

## Module Responsibilities

### Runtime Config Resolver Module

This Module owns config shape knowledge and validation for all managed-site
types. It is the only Module in this flow that reads `userPreferences`.

Responsibilities:

- Resolve the selected managed-site type from preferences.
- Resolve an explicit managed-site type for migration and cross-site flows.
- Validate required fields for each site type.
- Return the full site-specific config object.
- Return `null` when the config is incomplete or preferences cannot be read.

### Managed Site Service Registry

This Module selects the Adapter for a managed-site type.

Responsibilities:

- Keep `getManagedSiteService()` and `getManagedSiteServiceForType(siteType)`.
- Wire each service's `getConfig()` to the runtime config resolver.
- Expose operation functions that accept explicit full config objects.

### Provider Adapters

Provider Adapters translate between the shared managed-site channel model and
the backend-specific protocol.

Responsibilities:

- Accept explicit full config objects from callers.
- Use the passed config for search, create, update, delete, key reveal, and key
  hydration.
- Convert backend channel/provider data to `ManagedSiteChannel` shapes.
- Build backend-specific payloads from `ChannelFormData` and managed-site
  payloads.

Provider Adapters must not call `userPreferences.getPreferences()` inside
operation functions. Legacy direct-import helpers may read config only through
the resolver or through `service.getConfig()`.

### Business-Layer Flows

Business-layer flows decide which target config an operation should use.

Impacted flows:

- Token batch export preview and execution.
- Managed-site channel migration preview and execution.
- Channel matching and duplicate resolution.
- Legacy direct-import helpers kept for compatibility.

These flows should resolve runtime config once at the operation boundary and
pass the explicit config through to Adapter operations.

## Compatibility Strategy

This change is intentionally structural but not user-visible. It should not
change stored preference keys, backend request paths, payload fields, i18n copy,
or UI behavior.

Implementation can be progressive:

1. Add the runtime config resolver and tests.
2. Change `ManagedSiteService` to accept full config objects.
3. Convert one provider Adapter at a time.
4. Update business-layer call sites.
5. Remove operation-level preference reads from provider Adapters.

During migration, compatibility helper types may exist locally, but the final
state should not preserve the old `baseUrl/token/userId` operation Interface.

## Non-Goals

- Do not change the persisted `UserPreferences` shape.
- Do not add new managed-site types.
- Do not change backend protocols or endpoint selection.
- Do not change account token model-prefill behavior.
- Do not change optional `sk-` prefix comparison rules.
- Do not rewrite unrelated managed-site UI state.

## Testing Strategy

Use TDD for executable changes.

Required tests:

- Runtime config resolver returns the full config for every managed-site type.
- Runtime config resolver returns `null` for incomplete configs.
- `ManagedSiteService.getConfig()` delegates to the resolver for the selected
  or explicit site type.
- Claude Code Hub, AxonHub, and Octopus operation tests prove the passed config
  is used and provider operations do not depend on mocked `userPreferences`.
- Channel match, token batch export, and migration tests prove explicit configs
  flow from the business layer into Adapter operations.

Validation:

- Run focused related Vitest coverage for touched tests.
- Run `pnpm run validate:staged` after staging only task-scoped files.
- Use `pnpm run validate:push` if the final implementation changes exports,
  barrels, or other dependency graph structure.

## E2E Decision

This refactor changes service-layer configuration flow, not browser runtime
behavior or UI interactions. Targeted Vitest coverage is the right primary
coverage layer. E2E is not required unless implementation later changes
entrypoint wiring, extension storage behavior, or user-facing managed-site
workflows.

## Open Design Constraint

TypeScript cannot easily express a heterogeneous service registry where
`getManagedSiteServiceForType(siteType)` returns a perfectly narrowed generic
service for every dynamic `siteType` without added complexity. The implementation
should prefer a small discriminated runtime config union and straightforward
call-site narrowing over elaborate generic abstractions.

# Site Type Capabilities Managed Sites Design

Date: 2026-06-29

## Purpose

Move backend capability ownership from the current account-oriented
`SiteAdapter` shape to a site-type capability registry that can represent
account-only, managed-site-only, and mixed site types without relying on
`apiService/common`.

This design uses a direct migration rather than a long compatibility layer.
Existing call sites should move to the new `getSiteTypeCapabilities(siteType)`
Interface as part of the implementation slice, and tests should be updated to
the new capability shape.

## Current Context

The current `src/services/apiAdapters/contracts/siteAdapter.ts` Interface is an
account-site capability registry. It accepts `AccountSiteType` and exposes
account-facing capability objects such as `accountData`, `accountBootstrap`,
`keyManagement`, `modelCatalog`, `modelPricing`, `accountRefresh`, and
`tokenProvisioning`.

Managed-site workflows currently use `ManagedSiteService` from
`src/services/managedSites/managedSiteService.ts`. That Interface is useful for
product workflows because it combines managed-site runtime config, channel
form defaults, channel payload construction, duplicate resolution support,
hidden key handling, and legacy import helpers. It is too broad to become the
backend protocol Interface.

The channel protocol work still leaks through the legacy `getApiService`
facade. New API-family channel operations live in
`src/services/apiService/newApiFamily/channelManagement.ts`, while Veloera and
DoneHub provide site-specific channel behavior under `src/services/apiService/`.
The model-sync executor also calls `getApiService(siteType)` for channel list,
model fetch, and model writeback operations.

## Problem

The repo needs to remove the misleading `common` layer, but managed-site
capability facts cannot be treated as account-site facts:

- Some site types are account-only and do not support managed-site workflows.
- Some site types are managed-site-only and do not fit the current
  `AccountSiteType` adapter registry.
- Some site types support both account and managed-site workflows.
- Some managed-site implementations support channel CRUD but not model sync.

Keeping these facts in `getApiService` keeps the old flat compatibility
Interface alive. Moving them into the current `SiteAdapter` without changing
the registry semantics would make account and managed-site concepts blur.

## Goals

- Replace the current account-oriented `SiteAdapter` Interface with a
  site-type capability registry.
- Use `managedSites` as the managed-site capability group name.
- Put channel resource protocol operations under `managedSites.channels`.
- Keep product workflows such as form defaults, config reads, imports, and
  toasts in the managed-site use-case layer.
- Move channel protocol implementations out of `apiService/common` and the
  legacy `getApiService` facade.
- Represent account-only, managed-site-only, and mixed site types without
  special cases.
- Preserve existing runtime behavior while changing the owning Interface and
  call sites.

## Non-Goals

- Do not add a new site type.
- Do not redesign the channel dialog UI.
- Do not change persisted managed-site preference schema.
- Do not change locale copy or user-facing behavior.
- Do not merge product-owned announcements with upstream site announcements.
- Do not put managed-site product workflow helpers into
  `managedSites.channels`.
- Do not keep a long-lived compatibility projection from the old `SiteAdapter`
  shape.

## Architecture

Introduce a `SiteTypeCapabilities` Interface as the backend capability registry
for every supported site type:

```ts
type SiteTypeCapabilities = {
  siteType: SiteType
  family?: SiteBackendFamily

  site?: {
    notice?: SiteNoticeCapability
  }

  account?: {
    announcements?: SiteAnnouncementsCapability
    modelCatalog?: ModelCatalogCapability
    modelPricing?: ModelPricingCapability
    data?: AccountDataCapability
    bootstrap?: AccountBootstrapCapability
    completion?: AccountCompletionCapability
    keyManagement?: KeyManagementCapability
    tokenProvisioning?: TokenProvisioningCapability
    refresh?: AccountRefreshCapability
    redemption?: RedemptionCapability
  }

  managedSites?: {
    channels?: ManagedSiteChannelsCapability
    channelDrafts?: ManagedSiteChannelDraftsCapability
    config?: ManagedSiteConfigCapability
    queries?: ManagedSiteQueriesCapability
  }
}
```

`SiteTypeCapabilities` groups capabilities by the subject of the behavior, not
by whether the backend endpoint requires authentication.

- `site` describes site-level facts that are not tied to a saved account or a
  managed-site admin workflow.
- `account` describes capabilities used by saved-account workflows, even when
  a specific endpoint can be unauthenticated.
- `managedSites` describes capabilities used by admin/channel-management
  workflows.

The main registry entrypoint should be:

```ts
getSiteTypeCapabilities(siteType)
```

The old `getSiteAdapter(siteType)` entrypoint should be removed or replaced in
the same implementation series rather than kept as a long-lived projection.
If a short-lived compatibility shim is needed during a single commit, it should
be removed before the final implementation handoff.

## Managed Site Channels

`ManagedSiteChannelsCapability` owns channel resource protocol behavior:

```ts
type ManagedSiteChannelsCapability = {
  search(request, keyword): Promise<ManagedSiteChannelListData | null>
  list?(request, options?): Promise<ManagedSiteChannelListData>
  create(request, payload): Promise<ApiResponse<unknown>>
  update(request, payload): Promise<ApiResponse<unknown>>
  delete(request, channelId): Promise<ApiResponse<unknown>>

  fetchSecretKey?(request, channelId): Promise<string>
  hydrateComparableKeys?(
    request,
    candidates,
  ): Promise<ManagedSiteChannel[]>

  fetchModels?(request, channelId, options?): Promise<string[]>
  updateModels?(request, channelId, models, options?): Promise<void>
  updateModelMapping?(
    request,
    channelId,
    models,
    modelMappingJson,
    options?,
  ): Promise<void>
}
```

The exact request type should be chosen during implementation so each adapter
can receive the real managed-site runtime config it needs. Do not force
Octopus, AxonHub, or Claude Code Hub through the legacy
`baseUrl/adminToken/userId` shape.

### Belongs In `managedSites.channels`

- channel search and listing;
- channel create, update, and delete;
- hidden channel key reads and comparable-key hydration;
- channel model fetch and model writeback;
- model-mapping writeback;
- site-specific protocol normalization required for those operations.

### Does Not Belong In `managedSites.channels`

- `getConfig`;
- `checkValidConfig`;
- `buildChannelName`;
- `prepareChannelFormData`;
- `buildChannelPayload`;
- import flows and toast orchestration;
- duplicate-resolution product decisions;
- channel dialog UI state;
- scheduler policy, retries, progress, and user-facing model-sync status.

Those remain in `src/services/managedSites/**` or
`src/services/models/modelSync/**` as product and use-case Modules that consume
the channel capability.

## Managed Site Workflow Capabilities

Some managed-site functions are not channel protocol operations, but they are
still real site-specific capabilities because callers use them across modules
and each managed site type implements them differently. They should not stay as
anonymous provider functions indefinitely.

Use separate managed-site capability groups for these higher-level contracts:

```ts
type ManagedSiteConfigCapability<TConfig> = {
  checkValid(): Promise<boolean>
  get(): Promise<TConfig | null>
}

type ManagedSiteChannelDraftsCapability = {
  buildName(account, token): string
  fetchAvailableModels(account, token): Promise<string[]>
  prepareFormData(account, token): Promise<ChannelFormData>
  buildPayload(formData, mode?): CreateChannelPayload
}

type ManagedSiteQueriesCapability<TConfig> = {
  fetchSiteUserGroups(config: TConfig): Promise<string[]>
  fetchAccountAvailableModels(config: TConfig): Promise<string[]>
}
```

These capabilities still live under `managedSites` because their subject is the
managed-site workflow, but they are intentionally outside `managedSites.channels`:

- `managedSites.config` owns runtime configuration availability and lookup.
- `managedSites.queries` owns managed-site-wide lookup helpers such as user
  groups and account-level model availability.
- `managedSites.channelDrafts` owns the site-specific mapping from an account
  token to editable channel form data and create/update payloads, including
  draft-time available model lookup.

`ManagedSiteService` may remain as the product/use-case Interface that composes
these capability groups for UI and workflow callers. The implementation should
move provider-specific functions behind named capability groups when doing so
improves locality, but it should not force dialog state, toast copy, scheduler
progress, or duplicate-resolution decisions into backend capability contracts.

## Capability Classification

Capability groups are based on subject and product contract:

- `site.notice` is site-level because it returns notice text for the site.
- `account.announcements` is account-scoped when the caller works with saved
  account state, read-state, and mark-read behavior.
- `account.modelCatalog` remains account-scoped even when a backend exposes an
  unauthenticated model endpoint, because the product consumes it as account
  model availability.
- `managedSites.channels` is managed-site-scoped because the subject is channel
  inventory and the caller uses managed-site runtime/admin config.

Authentication method is an implementation fact inside an adapter, not the
primary classification rule.

## Migration Shape

This should be a direct migration with focused commits:

1. Add `SiteTypeCapabilities` contracts and rename the registry entrypoint.
2. Move existing account capability objects under `account`.
3. Move site-level notice under `site.notice`.
4. Move account-scoped announcement capability under `account.announcements`.
5. Add `managedSites.channels` contracts and implementations for existing
   managed site types.
6. Add `managedSites.config` and `managedSites.channelDrafts` for existing
   managed-site provider functions that are externally consumed and
   site-specific.
7. Update `ManagedSiteService` internals to consume
   `getSiteTypeCapabilities(siteType).managedSites?.channels`.
8. Update managed-site workflow callers to keep using `ManagedSiteService`
   unless they only need a narrow backend capability.
9. Move model-sync channel list/model read/write operations to
   `managedSites.channels` in a separate commit once CRUD/search has landed.
10. Remove obsolete `getApiService` channel-management calls and trim unused
   `apiService/common` exports only after call-site searches prove they are no
   longer used.

The implementation may temporarily keep local aliases inside a commit to keep
steps reviewable, but the completed branch should expose only the new
capability shape.

## Error Handling And Unsupported Capabilities

Missing capabilities should be explicit:

- account callers should check `capabilities.account?.<capability>`;
- managed-site callers should check `capabilities.managedSites?.channels`;
- managed-site workflow callers should check the specific group they need, such
  as `managedSites.config` or `managedSites.channelDrafts`;
- model-sync callers should keep an explicit support guard and must not infer
  support from channel CRUD alone.

AxonHub and Claude Code Hub can support channel management while still being
unsupported for managed-site model sync. Octopus can support model sync through
a dedicated executor. The capability shape should allow those facts to be
represented directly.

## Testing Strategy

Focused validation should cover:

- registry tests for account-only, managed-site-only, and mixed site types;
- updated account capability callers that previously used `getSiteAdapter`;
- managed-site service routing through `managedSites.channels`;
- managed-site config and channel-draft behavior through
  `managedSites.config` and `managedSites.channelDrafts`;
- provider/channel protocol behavior for New API, Veloera, DoneHub, Octopus,
  AxonHub, and Claude Code Hub;
- model-sync support guards and model read/write paths after those operations
  move under `managedSites.channels`;
- compile and dead-export checks after the old adapter shape is removed.

The likely focused suites are:

```bash
pnpm exec vitest --run tests/services/apiAdapters/registry.test.ts
pnpm exec vitest --run tests/services/managedSiteService/managedSiteService.test.ts
pnpm exec vitest --run tests/services/managedSites/channelMatchResolver.test.ts
pnpm exec vitest --run tests/services/managedSites/tokenBatchExport.test.ts
pnpm exec vitest --run tests/services/managedSites/channelMigration.test.ts
pnpm exec vitest --run tests/services/managedSites/tokenChannelStatus.test.ts
pnpm exec vitest --run tests/services/modelSync/modelSyncService.test.ts tests/services/modelSync/scheduler.test.ts
pnpm compile
pnpm knip
pnpm run validate:staged
```

Broaden to `pnpm run validate:push` before pushing or opening a PR because this
refactor changes shared contracts, exports, dependency graph wiring, and many
typed test mocks.

## Completion Criteria

- `getSiteTypeCapabilities(siteType)` is the canonical capability registry.
- The old top-level account-oriented `SiteAdapter` shape is gone.
- Account capabilities are grouped under `account`.
- Managed-site channel protocol is grouped under `managedSites.channels`.
- Managed-site config and channel-draft behavior are grouped under
  `managedSites.config` and `managedSites.channelDrafts` when they are consumed
  outside a single provider module.
- `ManagedSiteService` remains the product/use-case Interface and consumes
  managed-site capabilities rather than owning provider dispatch itself.
- No migrated caller depends on `getApiService` for channel protocol behavior.
- Unsupported managed-site model-sync behavior remains explicit and tested.
- `pnpm compile`, `pnpm knip`, and the affected focused tests pass.

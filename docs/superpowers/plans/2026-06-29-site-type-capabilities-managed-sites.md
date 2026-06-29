# Site Type Capabilities Managed Sites Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the account-oriented `SiteAdapter` registry with `SiteTypeCapabilities`, move managed-site channel/config/draft capability ownership under `managedSites`, and remove migrated managed-channel callers from the legacy `getApiService(...)` channel facade.

**Architecture:** `getSiteTypeCapabilities(siteType)` becomes the canonical site-type registry. Capabilities are grouped by subject: `site`, `account`, and `managedSites`. `managedSites.channels` owns backend channel protocol, while `ManagedSiteService` remains the product workflow facade and `src/services/models/modelSync/**` remains the scheduler/retry/progress owner.

**Tech Stack:** TypeScript, existing `apiAdapters`, existing managed-site providers, Vitest, `pnpm compile`, `pnpm knip`, `pnpm run validate:staged`, `pnpm run validate:push`.

**Spec:** `docs/superpowers/specs/2026-06-29-site-type-capabilities-managed-sites-design.md`

---

## Constraints

- This is a direct migration. Do not keep a long-lived `getSiteAdapter(...)` projection.
- Do not add a new site type.
- Do not change persisted managed-site preference schema.
- Do not change locale copy or user-visible workflow behavior.
- Do not move dialog UI state, duplicate-resolution product decisions, toast copy, scheduler policy, retries, progress state, or user-facing model-sync status into backend channel contracts.
- Keep unsupported managed-site model sync explicit. AxonHub and Claude Code Hub can support channel management without supporting model sync.
- Preserve unrelated local files and staged state. Stage only task-scoped files for commits.

---

## Target File Structure

Create:

- `src/services/apiAdapters/contracts/siteTypeCapabilities.ts`
  - Replaces the current `SiteAdapter` shape.
  - Defines `SiteTypeCapabilities`, `SiteType`, `SiteBackendFamily`, and grouped `site`, `account`, and `managedSites` capability shapes.
- `src/services/apiAdapters/contracts/managedSiteCapabilities.ts`
  - Defines `ManagedSiteChannelsCapability`, `ManagedSiteConfigCapability`, `ManagedSiteChannelDraftsCapability`, and `ManagedSiteImportCapability`.
- `src/services/apiAdapters/managedSites/request.ts`
  - Converts New API-family managed runtime config into the `ApiServiceRequest` shape needed by lower-level channel API modules.
- `src/services/apiAdapters/managedSites/newApi.ts`
- `src/services/apiAdapters/managedSites/veloera.ts`
- `src/services/apiAdapters/managedSites/doneHub.ts`
- `src/services/apiAdapters/managedSites/octopus.ts`
- `src/services/apiAdapters/managedSites/axonHub.ts`
- `src/services/apiAdapters/managedSites/claudeCodeHub.ts`
  - Export managed-site capability objects for each supported managed site.
- `tests/services/apiAdapters/managedSites/newApi.test.ts`
- `tests/services/apiAdapters/managedSites/veloera.test.ts`
- `tests/services/apiAdapters/managedSites/doneHub.test.ts`
- `tests/services/apiAdapters/managedSites/octopus.test.ts`
- `tests/services/apiAdapters/managedSites/axonHub.test.ts`
- `tests/services/apiAdapters/managedSites/claudeCodeHub.test.ts`
  - Cover capability routing and any moved protocol normalization.

Modify:

- `src/services/accountSiteDefinitions/siteTypes.ts`
  - Export `SiteType` and `SITE_TYPE_VALUES`.
- `src/constants/siteType.ts`
  - Re-export `SiteType` and `SITE_TYPE_VALUES`.
- `src/services/apiAdapters/registry.ts`
  - Rename public entrypoint to `getSiteTypeCapabilities(siteType)`.
  - Return grouped capabilities for account-only, managed-only, and mixed site types.
- `src/services/apiAdapters/newApi/index.ts`
- `src/services/apiAdapters/sub2api/index.ts`
- `src/services/apiAdapters/aihubmix/index.ts`
  - Return `SiteTypeCapabilities` objects with account capabilities under `account`.
- `src/services/managedSites/managedSiteService.ts`
  - Compose service methods from `getSiteTypeCapabilities(siteType).managedSites`.
  - Stop owning provider dispatch.
- `src/services/models/modelSync/modelSyncService.ts`
  - Consume managed-site channel/model capabilities instead of `getApiService(siteType)`.
- `src/services/models/modelSync/scheduler.ts`
  - Keep scheduler logic, support checks, notifications, and progress state here.
  - Route channel listing through managed-site capabilities or `ManagedSiteService`.
- Existing account capability callers listed in Task 3.
- Existing managed-site provider tests and `tests/services/apiAdapters/registry.test.ts`.

Delete when no imports remain:

- `src/services/apiAdapters/contracts/siteAdapter.ts`

Keep in place unless later searches show they are only compatibility shells:

- `src/services/managedSites/channelMatchResolver.ts`
- `src/services/managedSites/tokenBatchExport.ts`
- `src/services/managedSites/channelMigration.ts`
- `src/services/managedSites/tokenChannelStatus.ts`
- `src/services/models/modelSync/storage.ts`
- `src/services/models/modelSync/messaging.ts`
- `src/services/models/modelSync/rateLimiter.ts`
- `src/services/models/modelSync/channelProcessingTimeout.ts`

---

## Target Contracts

Use this shape as the final public contract:

```ts
export type SiteType = AccountSiteType | ManagedSiteType

export type SiteTypeCapabilities = {
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
    config?: ManagedSiteConfigCapability
    channelDrafts?: ManagedSiteChannelDraftsCapability
    imports?: ManagedSiteImportCapability
  }
}
```

Use managed-site config directly at the managed capability boundary:

```ts
export type ManagedSiteChannelsCapability<
  TConfig = ManagedSiteRuntimeConfigValue,
> = {
  search(
    config: TConfig,
    keyword: string,
  ): Promise<ManagedSiteChannelListData | null>
  list?(
    config: TConfig,
    options?: { beforeRequest?: () => Promise<void> },
  ): Promise<ManagedSiteChannelListData>
  create(
    config: TConfig,
    channelData: CreateChannelPayload,
  ): Promise<ApiResponse<unknown>>
  update(
    config: TConfig,
    channelData: UpdateChannelPayload,
  ): Promise<ApiResponse<unknown>>
  delete(config: TConfig, channelId: number): Promise<ApiResponse<unknown>>
  fetchSecretKey?(config: TConfig, channelId: number): Promise<string>
  hydrateComparableKeys?(
    config: TConfig,
    candidates: ManagedSiteChannel[],
  ): Promise<ManagedSiteChannel[]>
  fetchModels?(
    config: TConfig,
    channelId: number,
    options?: Pick<RequestInit, "signal">,
  ): Promise<string[]>
  updateModels?(
    config: TConfig,
    channelId: number,
    models: string[],
    options?: Pick<RequestInit, "signal">,
  ): Promise<void>
  updateModelMapping?(
    config: TConfig,
    channelId: number,
    models: string[],
    modelMapping: Record<string, string>,
    options?: Pick<RequestInit, "signal">,
  ): Promise<void>
}
```

Use separate workflow capability groups for site-specific behavior that is not channel protocol:

```ts
export type ManagedSiteConfigCapability<
  TConfig = ManagedSiteRuntimeConfigValue,
> = {
  checkValid(): Promise<boolean>
  get(): Promise<TConfig | null>
}

export type ManagedSiteChannelDraftsCapability = {
  fetchAvailableModels(account: DisplaySiteData, token: ApiToken): Promise<string[]>
  buildName(account: DisplaySiteData, token: ApiToken): string
  prepareFormData(
    account: DisplaySiteData,
    token: ApiToken | AccountToken,
  ): Promise<ChannelFormData>
  buildPayload(
    formData: ChannelFormData,
    mode?: ChannelMode,
  ): CreateChannelPayload
}

export type ManagedSiteImportCapability = {
  autoConfig(account: SiteAccount, toastId?: string): Promise<unknown>
}
```

---

## Task 1: Add Failing Registry Tests For Grouped Capabilities

**Files:**

- Modify: `tests/services/apiAdapters/registry.test.ts`
- Modify: `src/services/accountSiteDefinitions/siteTypes.ts`
- Modify: `src/constants/siteType.ts`

- [ ] **Step 1: Add the red tests for `SiteType` and grouped registry output**

Update `tests/services/apiAdapters/registry.test.ts` to import `getSiteTypeCapabilities` and assert the new grouped shape. Keep the old test file as the first migration surface so the expected shape is visible before implementation.

```ts
import {
  ACCOUNT_SITE_ADAPTER_FAMILIES,
  SITE_TYPES,
  type SiteType,
} from "~/constants/siteType"
import { getSiteTypeCapabilities } from "~/services/apiAdapters/registry"

const expectTokenProvisioningCapability = (
  capabilities: ReturnType<typeof getSiteTypeCapabilities>,
) => {
  expect(capabilities.account?.tokenProvisioning).toEqual({
    resolveDefaultTokenCreation: expect.any(Function),
    classifyCreatedToken: expect.any(Function),
    isInventoryTokenUsable: expect.any(Function),
    getRepairPolicy: expect.any(Function),
  })
}
```

Expected test cases:

- New API-family account site:
  - `siteType` is preserved.
  - `family` is `ACCOUNT_SITE_ADAPTER_FAMILIES.NewApiFamily`.
  - `site.notice.fetch` exists.
  - `account.data`, `account.bootstrap`, `account.completion`, `account.keyManagement`, `account.tokenProvisioning`, `account.refresh`, `account.modelPricing`, and `account.redemption` exist.
  - Old top-level names such as `accountData`, `siteNotice`, and `tokenProvisioning` are absent from the runtime object.
- Sub2API:
  - `account.announcements.fetch` and `account.announcements.markRead` exist.
  - `account.modelCatalog.fetchModels` exists.
  - `site.notice` is absent.
- AIHubMix:
  - `account` exists.
  - `managedSites` is absent.
- New API, Veloera, and DoneHub:
  - `managedSites.channels`, `managedSites.config`, `managedSites.channelDrafts`, and `managedSites.imports` exist.
- Octopus, AxonHub, and Claude Code Hub:
  - `managedSites.channels`, `managedSites.config`, `managedSites.channelDrafts`, and `managedSites.imports` exist.
  - `account` is absent.
- AxonHub and Claude Code Hub:
  - model-sync methods are absent from `managedSites.channels`.
- Managed-only site types can be passed without casting to `AccountSiteType`.

Run:

```bash
pnpm exec vitest --run tests/services/apiAdapters/registry.test.ts
```

Expected result: fail because `getSiteTypeCapabilities` and `SiteType` are not exported yet.

- [ ] **Step 2: Add the `SiteType` export**

Add the union in `src/services/accountSiteDefinitions/siteTypes.ts`:

```ts
export type SiteType = AccountSiteType | ManagedSiteType
export const SITE_TYPE_VALUES = Array.from(
  new Set([...ACCOUNT_SITE_TYPE_VALUES, ...MANAGED_SITE_TYPES]),
) as SiteType[]
```

Re-export it from `src/constants/siteType.ts`:

```ts
export {
  SITE_TYPE_VALUES,
  type SiteType,
} from "~/services/accountSiteDefinitions/siteTypes"
```

Run:

```bash
pnpm exec vitest --run tests/services/apiAdapters/registry.test.ts
```

Expected result: still fail because the registry and contracts are not migrated.

---

## Task 2: Replace `SiteAdapter` With `SiteTypeCapabilities`

**Files:**

- Create: `src/services/apiAdapters/contracts/siteTypeCapabilities.ts`
- Create: `src/services/apiAdapters/contracts/managedSiteCapabilities.ts`
- Modify: `src/services/apiAdapters/registry.ts`
- Modify: `src/services/apiAdapters/newApi/index.ts`
- Modify: `src/services/apiAdapters/sub2api/index.ts`
- Modify: `src/services/apiAdapters/aihubmix/index.ts`
- Delete after all imports move: `src/services/apiAdapters/contracts/siteAdapter.ts`
- Test: `tests/services/apiAdapters/registry.test.ts`

- [ ] **Step 1: Add the new contract files**

Create `src/services/apiAdapters/contracts/siteTypeCapabilities.ts` with the target shape from the contract section. Import account capability types from existing contract files and managed capability types from `managedSiteCapabilities.ts`.

Create `src/services/apiAdapters/contracts/managedSiteCapabilities.ts` with the managed-site contracts from the contract section. Use existing project types:

- `ManagedSiteRuntimeConfigValue` from `~/services/managedSites/runtimeConfig`
- `ApiResponse` from `~/services/apiTransport/type`
- `DisplaySiteData`, `ApiToken`, `AccountToken`, `SiteAccount` from `~/types`
- channel types from `~/types/managedSite`

- [ ] **Step 2: Rename account adapter factories to capability factories**

Update `src/services/apiAdapters/newApi/index.ts`:

```ts
export const createNewApiCapabilities = (
  siteType: AccountSiteType = SITE_TYPES.NEW_API,
): SiteTypeCapabilities => ({
  siteType,
  family: "newApiFamily",
  site: {
    notice: newApiSiteNotice,
  },
  account: {
    data: createNewApiAccountData(siteType),
    bootstrap: createNewApiAccountBootstrap(siteType),
    completion: newApiAccountCompletion,
    keyManagement: createNewApiKeyManagement(siteType),
    tokenProvisioning: createNewApiTokenProvisioning(),
    refresh: createNewApiAccountRefresh(siteType),
    modelPricing: createNewApiModelPricing(siteType),
    redemption: createNewApiRedemption(),
  },
})
```

Update `src/services/apiAdapters/sub2api/index.ts`:

```ts
export const sub2ApiCapabilities: SiteTypeCapabilities = {
  siteType: SITE_TYPES.SUB2API,
  family: "sub2api",
  account: {
    announcements: sub2ApiSiteAnnouncements,
    modelCatalog: sub2ApiModelCatalog,
    data: sub2ApiAccountData,
    bootstrap: sub2ApiAccountBootstrap,
    completion: sub2ApiAccountCompletion,
    keyManagement: sub2ApiKeyManagement,
    tokenProvisioning: sub2ApiTokenProvisioning,
    refresh: sub2ApiAccountRefresh,
  },
}
```

Update `src/services/apiAdapters/aihubmix/index.ts`:

```ts
export const aihubmixCapabilities: SiteTypeCapabilities = {
  siteType: SITE_TYPES.AIHUBMIX,
  account: {
    data: aihubmixAccountData,
    bootstrap: aihubmixAccountBootstrap,
    completion: aihubmixAccountCompletion,
    keyManagement: aihubmixKeyManagement,
    tokenProvisioning: aihubmixTokenProvisioning,
    refresh: aihubmixAccountRefresh,
    modelPricing: aihubmixModelPricing,
  },
}
```

- [ ] **Step 3: Rename the registry entrypoint**

Update `src/services/apiAdapters/registry.ts`:

```ts
export function getSiteTypeCapabilities(siteType: SiteType): SiteTypeCapabilities {
  const adapterFamily =
    getAccountSiteDefinition(siteType as AccountSiteType)?.adapterFamily ??
    ACCOUNT_SITE_ADAPTER_FAMILIES.Unsupported

  if (siteType === SITE_TYPES.SUB2API) return sub2ApiCapabilities
  if (siteType === SITE_TYPES.AIHUBMIX) return aihubmixCapabilities

  if (adapterFamily === ACCOUNT_SITE_ADAPTER_FAMILIES.NewApiFamily) {
    return createNewApiCapabilities(siteType as AccountSiteType)
  }

  return { siteType }
}
```

Do not export `getSiteAdapter` from the final file.

- [ ] **Step 4: Run the registry test**

Run:

```bash
pnpm exec vitest --run tests/services/apiAdapters/registry.test.ts
```

Expected result: account grouping assertions pass, managed-site capability assertions still fail until Task 4 adds managed capabilities.

Commit after Task 2 if no unrelated task files are staged:

```bash
git status --porcelain=v1
pnpm exec vitest --run tests/services/apiAdapters/registry.test.ts
git add src/services/accountSiteDefinitions/siteTypes.ts src/constants/siteType.ts src/services/apiAdapters/contracts/siteTypeCapabilities.ts src/services/apiAdapters/contracts/managedSiteCapabilities.ts src/services/apiAdapters/registry.ts src/services/apiAdapters/newApi/index.ts src/services/apiAdapters/sub2api/index.ts src/services/apiAdapters/aihubmix/index.ts tests/services/apiAdapters/registry.test.ts
pnpm run validate:staged
git commit -m "refactor(api-adapters): introduce site type capabilities"
```

---

## Task 3: Migrate Account Callers To `account` And `site` Groups

**Files:**

Update all production files currently importing `getSiteAdapter`:

- `src/services/accounts/accountKeyAutoProvisioning/groupCoverage.ts`
- `src/services/accounts/accountKeyAutoProvisioning/repair.ts`
- `src/services/accounts/accountOperations.ts`
- `src/services/accounts/accountStorage.ts`
- `src/services/accounts/autoDetectCompletion/completion.ts`
- `src/services/accounts/defaultTokenLifecycle/lifecycle.ts`
- `src/services/accounts/siteName.ts`
- `src/services/accounts/utils/apiServiceRequest.ts`
- `src/services/accounts/utils/siteRouteResolver.ts`
- `src/services/modelList/accountSources/readiness.ts`
- `src/services/redemption/redeemService.ts`
- `src/services/siteAnnouncements/providers.ts`
- `src/services/siteDetection/autoDetectService.ts`

Update related tests listed by:

```bash
rg -l "getSiteAdapter|SiteAdapter" tests -g "*.ts" -g "*.tsx"
```

- [ ] **Step 1: Replace imports and access paths in production code**

Use this mapping:

```ts
const capabilities = getSiteTypeCapabilities(account.site_type)

capabilities.siteNotice -> capabilities.site?.notice
capabilities.siteAnnouncements -> capabilities.account?.announcements
capabilities.modelCatalog -> capabilities.account?.modelCatalog
capabilities.modelPricing -> capabilities.account?.modelPricing
capabilities.accountData -> capabilities.account?.data
capabilities.accountBootstrap -> capabilities.account?.bootstrap
capabilities.accountCompletion -> capabilities.account?.completion
capabilities.keyManagement -> capabilities.account?.keyManagement
capabilities.tokenProvisioning -> capabilities.account?.tokenProvisioning
capabilities.accountRefresh -> capabilities.account?.refresh
capabilities.redemption -> capabilities.account?.redemption
```

Example for `src/services/redemption/redeemService.ts`:

```ts
const redemption = getSiteTypeCapabilities(account.site_type).account?.redemption
```

Example for `src/services/siteAnnouncements/providers.ts`:

```ts
const announcements =
  getSiteTypeCapabilities(account.site_type).account?.announcements
```

Do not add a `getAccountAdapter` compatibility helper. If a repeated access pattern becomes noisy inside one file, extract a file-local `getAccountCapabilities(siteType)` helper that returns `getSiteTypeCapabilities(siteType).account`.

- [ ] **Step 2: Update mocks and fixture types**

In tests, replace `SiteAdapter` fixture objects with `SiteTypeCapabilities`:

```ts
getSiteTypeCapabilitiesMock.mockReturnValue({
  siteType: SITE_TYPES.NEW_API,
  account: {
    keyManagement: mockKeyManagement,
    tokenProvisioning: mockTokenProvisioning,
  },
})
```

Mock the new registry export:

```ts
vi.mock("~/services/apiAdapters/registry", () => ({
  getSiteTypeCapabilities: getSiteTypeCapabilitiesMock,
}))
```

- [ ] **Step 3: Delete `siteAdapter.ts` when imports are gone**

Verify:

```bash
rg -n "getSiteAdapter|SiteAdapter|contracts/siteAdapter" src tests -g "*.ts" -g "*.tsx"
```

Expected result: no matches.

Delete:

```bash
git rm src/services/apiAdapters/contracts/siteAdapter.ts
```

- [ ] **Step 4: Run focused account capability suites**

Run:

```bash
pnpm exec vitest --run tests/services/apiAdapters/registry.test.ts
pnpm exec vitest --run tests/services/accountOperations.ensureAccountApiToken.test.ts tests/services/accountKeyGroupCoverage.test.ts tests/services/accountKeyRepair.test.ts
pnpm exec vitest --run tests/services/accounts/defaultTokenLifecycle.test.ts tests/services/accountStorage.test.ts
pnpm exec vitest --run tests/services/modelList/accountSources/readiness.test.ts tests/services/modelList/accountSources/tokenScopedFallback.test.ts
pnpm exec vitest --run tests/services/redeemService.test.ts tests/services/siteAnnouncements/providers.test.ts
```

Commit after Task 3:

```bash
git status --porcelain=v1
git add src tests
pnpm run validate:staged
git commit -m "refactor(accounts): consume grouped site type capabilities"
```

---

## Task 4: Add Managed-Site Channel Capability Implementations

**Files:**

- Create: `src/services/apiAdapters/managedSites/request.ts`
- Create: `src/services/apiAdapters/managedSites/newApi.ts`
- Create: `src/services/apiAdapters/managedSites/veloera.ts`
- Create: `src/services/apiAdapters/managedSites/doneHub.ts`
- Create: `src/services/apiAdapters/managedSites/octopus.ts`
- Create: `src/services/apiAdapters/managedSites/axonHub.ts`
- Create: `src/services/apiAdapters/managedSites/claudeCodeHub.ts`
- Modify: `src/services/apiAdapters/registry.ts`
- Modify: `tests/services/apiAdapters/registry.test.ts`
- Add/modify provider-capability tests under `tests/services/apiAdapters/managedSites/**`

- [ ] **Step 1: Add request conversion for New API-family managed config**

Create `src/services/apiAdapters/managedSites/request.ts`:

```ts
import { AuthTypeEnum } from "~/types"

export function toManagedSiteApiServiceRequest(
  config: { baseUrl: string; adminToken: string; userId: string },
) {
  return {
    baseUrl: config.baseUrl,
    auth: {
      authType: AuthTypeEnum.AccessToken,
      accessToken: config.adminToken,
      userId: config.userId,
    },
  }
}
```

Use this helper only for New API-family channel modules that still depend on `ApiServiceRequest`.

- [ ] **Step 2: Add New API, Veloera, and DoneHub channel capabilities**

For New API, import direct channel helpers from `~/services/apiService/newApiFamily/channelManagement` instead of `getApiService`.

```ts
export const newApiManagedSiteChannels: ManagedSiteChannelsCapability<NewApiConfig> = {
  search: (config, keyword) =>
    searchChannel(toManagedSiteApiServiceRequest(config), keyword),
  list: (config, options) =>
    listAllChannels(toManagedSiteApiServiceRequest(config), options),
  create: (config, channelData) =>
    createChannel(toManagedSiteApiServiceRequest(config), channelData),
  update: (config, channelData) =>
    updateChannel(toManagedSiteApiServiceRequest(config), channelData),
  delete: (config, channelId) =>
    deleteChannel(toManagedSiteApiServiceRequest(config), channelId),
  fetchModels: (config, channelId, options) =>
    fetchChannelModels(toManagedSiteApiServiceRequest(config), channelId, options),
  updateModels: (config, channelId, models, options) =>
    updateChannelModels(
      toManagedSiteApiServiceRequest(config),
      channelId,
      models.join(","),
      options,
    ),
  updateModelMapping: (config, channelId, models, modelMapping, options) =>
    updateChannelModelMapping(
      toManagedSiteApiServiceRequest(config),
      channelId,
      models.join(","),
      JSON.stringify(modelMapping),
      options,
    ),
}
```

For Veloera and DoneHub, import from `~/services/apiService/veloera` and `~/services/apiService/doneHub`. Preserve their site-specific pagination, payload, fallback-error, and full-channel update behavior.

- [ ] **Step 3: Add Octopus, AxonHub, and Claude Code Hub channel capabilities**

For Octopus, wrap the direct `~/services/apiService/octopus` helpers and use `octopusChannelToManagedSite` for list/search normalization where needed.

For AxonHub and Claude Code Hub, move or wrap the channel protocol functions currently in:

- `src/services/managedSites/providers/axonHub.ts`
- `src/services/managedSites/providers/claudeCodeHub.ts`

Keep pure conversion helpers beside the capability implementation when they are backend protocol details:

- AxonHub GraphQL channel input normalization.
- Claude Code Hub provider-to-managed-channel normalization.
- Claude Code Hub masked-key hydration.

Do not move toast-driven `autoConfigToAxonHub` or `autoConfigToClaudeCodeHub` into `managedSites.channels`.

- [ ] **Step 4: Register managed channel capabilities**

Update `src/services/apiAdapters/registry.ts` so managed site types return `managedSites.channels`.

```ts
const managedSiteCapabilitiesByType = {
  [SITE_TYPES.NEW_API]: newApiManagedSiteCapabilities,
  [SITE_TYPES.VELOERA]: veloeraManagedSiteCapabilities,
  [SITE_TYPES.DONE_HUB]: doneHubManagedSiteCapabilities,
  [SITE_TYPES.OCTOPUS]: octopusManagedSiteCapabilities,
  [SITE_TYPES.AXON_HUB]: axonHubManagedSiteCapabilities,
  [SITE_TYPES.CLAUDE_CODE_HUB]: claudeCodeHubManagedSiteCapabilities,
} satisfies Partial<Record<ManagedSiteType, SiteTypeCapabilities["managedSites"]>>
```

When a site type supports both account and managed-site flows, merge the groups:

```ts
const accountCapabilities = createNewApiCapabilities(siteType)
return {
  ...accountCapabilities,
  managedSites: managedSiteCapabilitiesByType[siteType],
}
```

- [ ] **Step 5: Add managed capability tests**

Add capability tests that verify delegation without re-testing every backend protocol branch already covered by API service tests.

Required assertions:

- New API channel capability calls direct `newApiFamily/channelManagement`, not `getApiService`.
- Veloera channel capability calls direct `apiService/veloera`.
- DoneHub channel capability calls direct `apiService/doneHub`.
- Octopus capability normalizes search/list results to `ManagedSiteChannelListData`.
- AxonHub capability returns `null` on search failure and returns `ApiResponse` objects for create/update/delete.
- Claude Code Hub capability exposes `fetchSecretKey` and `hydrateComparableKeys`.
- AxonHub and Claude Code Hub do not expose `fetchModels`, `updateModels`, or `updateModelMapping`.

Run:

```bash
pnpm exec vitest --run tests/services/apiAdapters/registry.test.ts
pnpm exec vitest --run tests/services/apiAdapters/managedSites/newApi.test.ts tests/services/apiAdapters/managedSites/veloera.test.ts tests/services/apiAdapters/managedSites/doneHub.test.ts
pnpm exec vitest --run tests/services/apiAdapters/managedSites/octopus.test.ts tests/services/apiAdapters/managedSites/axonHub.test.ts tests/services/apiAdapters/managedSites/claudeCodeHub.test.ts
```

Commit after Task 4:

```bash
git status --porcelain=v1
git add src/services/apiAdapters tests/services/apiAdapters
pnpm run validate:staged
git commit -m "refactor(managed-sites): register channel capabilities"
```

---

## Task 5: Move Config, Draft, And Legacy Import Capability Composition

**Files:**

- Modify: `src/services/apiAdapters/managedSites/newApi.ts`
- Modify: `src/services/apiAdapters/managedSites/veloera.ts`
- Modify: `src/services/apiAdapters/managedSites/doneHub.ts`
- Modify: `src/services/apiAdapters/managedSites/octopus.ts`
- Modify: `src/services/apiAdapters/managedSites/axonHub.ts`
- Modify: `src/services/apiAdapters/managedSites/claudeCodeHub.ts`
- Modify: `src/services/managedSites/providers/newApi.ts`
- Modify: `src/services/managedSites/providers/veloera.ts`
- Modify: `src/services/managedSites/providers/doneHubService.ts`
- Modify: `src/services/managedSites/providers/octopus.ts`
- Modify: `src/services/managedSites/providers/axonHub.ts`
- Modify: `src/services/managedSites/providers/claudeCodeHub.ts`
- Modify: provider tests under `tests/services/managedSites/providers/**`

- [ ] **Step 1: Implement `managedSites.config` in capability modules**

For each managed site, expose:

```ts
config: {
  checkValid: checkValidNewApiConfig,
  get: async () =>
    (await getManagedSiteRuntimeConfigForType(SITE_TYPES.NEW_API))?.config ??
    null,
}
```

Use the correct existing validation function per provider:

- `checkValidNewApiConfig`
- `checkValidVeloeraConfig`
- `checkValidDoneHubConfig`
- `checkValidOctopusConfig`
- `checkValidAxonHubConfig`
- `checkValidClaudeCodeHubConfig`

Move shared `get` behavior into a small local helper if the same code repeats in every managed capability module:

```ts
export function createManagedSiteConfigCapability<TSiteType extends ManagedSiteType>(
  siteType: TSiteType,
  checkValid: () => Promise<boolean>,
): ManagedSiteConfigCapability<ManagedSiteRuntimeConfigValueForType<TSiteType>> {
  return {
    checkValid,
    get: async () =>
      (await getManagedSiteRuntimeConfigForType(siteType))?.config ?? null,
  }
}
```

- [ ] **Step 2: Implement `managedSites.channelDrafts`**

Move or wrap site-specific draft functions:

```ts
channelDrafts: {
  fetchAvailableModels,
  buildName: buildChannelName,
  prepareFormData: prepareChannelFormData,
  buildPayload: buildChannelPayload,
}
```

Keep these functions outside `managedSites.channels` because they map account/token data into editable channel form data and create payloads.

- [ ] **Step 3: Implement `managedSites.imports` as legacy workflow capability**

Expose the existing legacy direct-import entrypoints under `managedSites.imports`:

```ts
imports: {
  autoConfig: autoConfigToNewApi,
}
```

Do not move toast orchestration into `managedSites.channels`. If import modules become circular, split the direct import functions into `src/services/managedSites/imports/<site>.ts` and keep only backend channel protocol in `src/services/apiAdapters/managedSites/<site>.ts`.

- [ ] **Step 4: Keep provider files as compatibility-free implementation modules**

After `ManagedSiteService` is updated in Task 6, provider files should no longer be required for dispatch. They can either:

- export pure implementation functions consumed by capability modules, or
- be split so capability modules own protocol/draft/config and import modules own legacy direct import workflows.

Do not leave a second site-type switch in provider files.

Run:

```bash
pnpm exec vitest --run tests/services/managedSites/providers/newApiSession.test.ts tests/services/managedSites/providers/newApiTotp.test.ts
pnpm exec vitest --run tests/services/managedSites/providers/axonHub.test.ts tests/services/managedSites/providers/claudeCodeHub.test.ts
pnpm exec vitest --run tests/services/apiAdapters/registry.test.ts
```

Commit after Task 5:

```bash
git status --porcelain=v1
git add src/services/apiAdapters src/services/managedSites tests/services
pnpm run validate:staged
git commit -m "refactor(managed-sites): expose workflow capabilities"
```

---

## Task 6: Rewrite `ManagedSiteService` As A Capability Composer

**Files:**

- Modify: `src/services/managedSites/managedSiteService.ts`
- Modify: `src/services/managedSites/channelMatchResolver.ts`
- Modify: `src/services/managedSites/tokenBatchExport.ts`
- Modify: `src/services/managedSites/channelMigration.ts`
- Modify: `src/services/managedSites/tokenChannelStatus.ts`
- Modify: `tests/services/managedSiteService/managedSiteService.test.ts`
- Modify if needed: `tests/services/managedSites/channelMatchResolver.test.ts`
- Modify if needed: `tests/services/managedSites/tokenBatchExport.test.ts`
- Modify if needed: `tests/services/managedSites/channelMigration.test.ts`
- Modify if needed: `tests/services/managedSites/tokenChannelStatus.test.ts`

- [ ] **Step 1: Add a managed capability resolver**

In `managedSiteService.ts`, add a small helper:

```ts
function requireManagedSiteCapabilities(siteType: ManagedSiteType) {
  const managedSites = getSiteTypeCapabilities(siteType).managedSites

  if (
    !managedSites?.channels ||
    !managedSites.config ||
    !managedSites.channelDrafts ||
    !managedSites.imports
  ) {
    throw new Error(`managedSites capabilities are not implemented for ${siteType}`)
  }

  return managedSites
}
```

- [ ] **Step 2: Replace provider dispatch with capability composition**

Replace the current `if (siteType === ...) return { ...provider }` ladder with:

```ts
const capabilities = requireManagedSiteCapabilities(siteType)

return {
  siteType,
  messagesKey,
  searchChannel: capabilities.channels.search,
  createChannel: capabilities.channels.create,
  updateChannel: capabilities.channels.update,
  deleteChannel: capabilities.channels.delete,
  checkValidConfig: capabilities.config.checkValid,
  getConfig: capabilities.config.get,
  fetchAvailableModels: capabilities.channelDrafts.fetchAvailableModels,
  buildChannelName: capabilities.channelDrafts.buildName,
  prepareChannelFormData: capabilities.channelDrafts.prepareFormData,
  buildChannelPayload: capabilities.channelDrafts.buildPayload,
  hydrateComparableChannelKeys: capabilities.channels.hydrateComparableKeys,
  fetchChannelSecretKey: capabilities.channels.fetchSecretKey,
  autoConfigToManagedSite: capabilities.imports.autoConfig,
}
```

Keep the public `ManagedSiteService` interface stable for UI/workflow callers.

- [ ] **Step 3: Keep workflow callers on `ManagedSiteService`**

Do not migrate full workflow callers directly to `getSiteTypeCapabilities` unless they only need a narrow backend protocol. These should keep using `ManagedSiteService`:

- channel duplicate resolution
- token batch export
- channel migration
- token channel status
- channel dialog prefill flows

Update only type names or method bindings if required by the service rewrite.

- [ ] **Step 4: Verify no provider dispatch remains in `managedSiteService.ts`**

Run:

```bash
rg -n "providers/|octopusService|axonHubService|claudeCodeHubService|doneHubService|newApiService|veloeraService" src/services/managedSites/managedSiteService.ts
```

Expected result: no matches.

Run focused tests:

```bash
pnpm exec vitest --run tests/services/managedSiteService/managedSiteService.test.ts
pnpm exec vitest --run tests/services/managedSites/channelMatchResolver.test.ts tests/services/managedSites/tokenBatchExport.test.ts
pnpm exec vitest --run tests/services/managedSites/channelMigration.test.ts tests/services/managedSites/tokenChannelStatus.test.ts
```

Commit after Task 6:

```bash
git status --porcelain=v1
git add src/services/managedSites tests/services/managedSiteService tests/services/managedSites
pnpm run validate:staged
git commit -m "refactor(managed-sites): compose service from capabilities"
```

---

## Task 7: Move Model Sync Off `getApiService`

**Files:**

- Modify: `src/services/models/modelSync/modelSyncService.ts`
- Modify: `src/services/models/modelSync/scheduler.ts`
- Modify: `src/services/models/modelSync/octopusModelSync.ts` only if direct Octopus behavior can be reduced without behavior change.
- Modify: `tests/services/modelSync/modelSyncService.test.ts`
- Modify: `tests/services/modelSync/scheduler.test.ts`
- Modify if needed: `tests/services/modelSync/scheduler.more.test.ts`
- Modify if needed: `tests/services/modelSync/octopusModelSync.test.ts`

- [ ] **Step 1: Resolve channel model capability in `ModelSyncService`**

Replace `createApiServiceRequest()` and `getApiService(this.managedSiteConfig.siteType)` with a capability resolver:

```ts
private getChannelCapabilities() {
  const channels = getSiteTypeCapabilities(
    this.managedSiteConfig.siteType,
  ).managedSites?.channels

  if (
    !channels?.list ||
    !channels.fetchModels ||
    !channels.updateModels ||
    !channels.updateModelMapping
  ) {
    throw new Error(
      `managed-site model sync is not implemented for ${this.managedSiteConfig.siteType}`,
    )
  }

  return channels
}
```

Keep rate limiting in `ModelSyncService`:

```ts
async listChannels(): Promise<ManagedSiteChannelListData> {
  return await this.getChannelCapabilities().list!(
    this.managedSiteConfig.config,
    { beforeRequest: async () => this.throttle() },
  )
}
```

Use array/object inputs at this boundary:

```ts
await this.getChannelCapabilities().updateModels!(
  this.managedSiteConfig.config,
  channel.id,
  models,
  abortSignal ? { signal: abortSignal } : undefined,
)
```

```ts
await this.getChannelCapabilities().updateModelMapping!(
  this.managedSiteConfig.config,
  channel.id,
  updateModels,
  modelMapping,
  abortSignal ? { signal: abortSignal } : undefined,
)
```

- [ ] **Step 2: Keep scheduler policy in `scheduler.ts`**

Do not move these responsibilities into capability modules:

- alarm lifecycle
- support guard
- retries/concurrency/timeouts
- progress messages
- notification text
- analytics result classification
- model redirect generation and pruning policy

For `listChannels()`, route non-Octopus supported managed site types through `ManagedSiteService` or directly through `managedSites.channels.list` if the method only needs backend channel listing. Keep Octopus dedicated list behavior if changing it would broaden the slice.

- [ ] **Step 3: Preserve explicit support checks**

Keep `supportsManagedSiteModelSync(siteType)` for product support policy unless a tested replacement is introduced in the same task. Do not infer model-sync support from channel CRUD.

Required behavior:

- New API, Veloera, DoneHub: supported through channel model capability methods.
- Octopus: supported through dedicated Octopus executor unless this task safely moves it.
- AxonHub and Claude Code Hub: unsupported model-sync message remains unchanged.

- [ ] **Step 4: Run focused model-sync tests**

Run:

```bash
pnpm exec vitest --run tests/services/modelSync/modelSyncService.test.ts
pnpm exec vitest --run tests/services/modelSync/scheduler.test.ts tests/services/modelSync/scheduler.more.test.ts
pnpm exec vitest --run tests/services/modelSync/octopusModelSync.test.ts
```

Commit after Task 7:

```bash
git status --porcelain=v1
git add src/services/models/modelSync tests/services/modelSync
pnpm run validate:staged
git commit -m "refactor(model-sync): consume managed site channel capabilities"
```

---

## Task 8: Remove Migrated Channel Facade Surface From `apiService/index.ts`

**Files:**

- Modify: `src/services/apiService/index.ts`
- Modify: `tests/services/apiService/index.test.ts`
- Modify or move channel API tests if imports move:
  - `tests/services/apiService/newApiFamily/channelManagement.test.ts`
  - `tests/services/apiService/veloera/channelApi.test.ts`
  - `tests/services/apiService/doneHub/channelApi.test.ts`
  - `tests/services/apiService/axonHub/index.test.ts`
  - `tests/services/apiService/octopus.index.test.ts`

- [ ] **Step 1: Prove no migrated caller still uses channel facade methods**

Run:

```bash
rg -n "getApiService\\([^\\n]*\\)\\.(searchChannel|createChannel|updateChannel|deleteChannel|listAllChannels|fetchChannelModels|updateChannelModels|updateChannelModelMapping)" src tests -g "*.ts" -g "*.tsx"
rg -n "\\.(searchChannel|createChannel|updateChannel|deleteChannel|listAllChannels|fetchChannelModels|updateChannelModels|updateChannelModelMapping)\\(" src/services/managedSites src/services/models -g "*.ts" -g "*.tsx"
```

Expected result: no `getApiService(...).<channel method>` usage in managed-site and model-sync code. Direct API module tests may still import channel helper functions from their implementation modules.

- [ ] **Step 2: Stop exporting channel management through `baseAPI`**

In `src/services/apiService/index.ts`, remove:

```ts
import * as newApiFamilyChannelManagement from "./newApiFamily/channelManagement"
```

Remove `...newApiFamilyChannelManagement` from `baseAPI` and site override lists. Keep direct channel modules exported by their own files; only remove the dynamic facade path.

- [ ] **Step 3: Update legacy facade tests**

Update `tests/services/apiService/index.test.ts` to remove assertions that `getApiService(SITE_TYPES.NEW_API).searchChannel` or related channel methods are exposed by the facade.

Do not delete direct channel implementation tests. They still prove protocol behavior:

```bash
pnpm exec vitest --run tests/services/apiService/newApiFamily/channelManagement.test.ts
pnpm exec vitest --run tests/services/apiService/veloera/channelApi.test.ts
pnpm exec vitest --run tests/services/apiService/doneHub/channelApi.test.ts
```

- [ ] **Step 4: Check common export impact**

Run:

```bash
pnpm knip
```

If `knip` reports dead channel facade exports or dead `apiService/common` exports that are only kept for migrated channel code, remove them in this task. Do not remove common helpers that account capabilities still use.

Commit after Task 8:

```bash
git status --porcelain=v1
git add src/services/apiService tests/services/apiService
pnpm run validate:staged
git commit -m "refactor(api-service): remove managed channel facade"
```

---

## Task 9: Final Compile, Dead-Code, And Contract Search

**Files:** all task-scoped files from previous tasks.

- [ ] **Step 1: Run global contract searches**

Run:

```bash
rg -n "getSiteAdapter|SiteAdapter|contracts/siteAdapter" src tests -g "*.ts" -g "*.tsx"
rg -n "accountData|accountBootstrap|accountCompletion|accountRefresh|siteNotice|siteAnnouncements|modelCatalog|modelPricing|tokenProvisioning|keyManagement|redemption" src/services/apiAdapters src/services/accounts src/services/modelList src/services/siteAnnouncements src/services/redemption tests/services -g "*.ts" -g "*.tsx"
rg -n "getApiService\\([^\\n]*\\)\\.(searchChannel|createChannel|updateChannel|deleteChannel|listAllChannels|fetchChannelModels|updateChannelModels|updateChannelModelMapping)" src tests -g "*.ts" -g "*.tsx"
```

Expected result:

- no old `SiteAdapter` references;
- old top-level capability property names only appear in historical strings or tests that intentionally assert absence;
- no managed-site/model-sync channel protocol call uses `getApiService`.

- [ ] **Step 2: Run focused suites**

Run:

```bash
pnpm exec vitest --run tests/services/apiAdapters/registry.test.ts
pnpm exec vitest --run tests/services/managedSiteService/managedSiteService.test.ts
pnpm exec vitest --run tests/services/managedSites/channelMatchResolver.test.ts
pnpm exec vitest --run tests/services/managedSites/tokenBatchExport.test.ts
pnpm exec vitest --run tests/services/managedSites/channelMigration.test.ts
pnpm exec vitest --run tests/services/managedSites/tokenChannelStatus.test.ts
pnpm exec vitest --run tests/services/modelSync/modelSyncService.test.ts tests/services/modelSync/scheduler.test.ts tests/services/modelSync/scheduler.more.test.ts
```

- [ ] **Step 3: Run shared contract gates**

Run:

```bash
pnpm compile
pnpm knip
pnpm run validate:staged
```

Before push or PR:

```bash
pnpm run validate:push
```

- [ ] **Step 4: Inspect the final diff**

Run:

```bash
git diff --stat
git diff -- src/services/apiAdapters src/services/managedSites src/services/models/modelSync tests/services/apiAdapters tests/services/managedSiteService tests/services/managedSites tests/services/modelSync
```

Confirm:

- no unrelated files are included;
- no locale, telemetry, or UI files changed without a task reason;
- no duplicate provider dispatch remains in `ManagedSiteService`;
- no long-lived `getSiteAdapter` compatibility export remains;
- no managed-site product workflow has moved into `managedSites.channels`;
- unsupported model-sync behavior remains explicit.

Final commit if all validation passes:

```bash
git status --porcelain=v1
git add <task-scoped-files>
pnpm run validate:staged
git commit -m "refactor(api-adapters): complete site type capability migration"
```

---

## Validation Decisions

Telemetry decision: none. This refactor preserves behavior and does not add a new user-visible action, setting, async flow, or analytics question.

E2E decision: no new Playwright coverage by default. The risk is service-layer contract routing and provider capability composition, which is covered faster and more precisely by Vitest and TypeScript. Add E2E only if implementation unexpectedly changes cross-entrypoint UI behavior.

Push gate decision: run `pnpm run validate:push` before pushing or opening a PR because this changes shared contracts, export surfaces, dependency graph wiring, and dead-code boundaries.

---

## Rollback Plan

Each task has its own commit boundary. If a later task fails, revert only the latest task commit and keep earlier passing capability grouping work. Do not reintroduce `getSiteAdapter` as a long-lived public API. If a temporary local helper is needed during recovery, keep it file-local and remove it before final handoff.

---

## Completion Criteria

- `getSiteTypeCapabilities(siteType)` is the only public capability registry entrypoint.
- `SiteType` supports both `AccountSiteType` and `ManagedSiteType`.
- The old top-level `SiteAdapter` shape and `contracts/siteAdapter.ts` are gone.
- Account callers use `capabilities.account?.*`.
- Site notice callers use `capabilities.site?.notice`.
- Managed-site protocol callers use `capabilities.managedSites?.channels`.
- `ManagedSiteService` composes from managed-site capabilities and no longer owns provider dispatch.
- Model sync no longer calls `getApiService` for channel list, model fetch, model update, or model mapping update.
- `apiService/index.ts` no longer exposes migrated managed-channel operations through the dynamic facade.
- `pnpm compile`, `pnpm knip`, affected Vitest suites, `pnpm run validate:staged`, and pre-push `pnpm run validate:push` pass.

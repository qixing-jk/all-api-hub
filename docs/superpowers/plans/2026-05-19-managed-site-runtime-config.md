# Managed Site Runtime Config Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the shallow managed-site `baseUrl/token/userId` operation Interface with explicit site-specific runtime configs passed from the business layer into each Adapter.

**Architecture:** Add a runtime config resolver Module that is the only managed-site operation path allowed to read `userPreferences`. `ManagedSiteService` becomes a registry for site-specific Adapters whose operation functions accept explicit full config objects. Business-layer flows resolve config once and pass that config through channel matching, import duplicate resolution, token batch export, and channel migration.

**Tech Stack:** TypeScript, Vitest, WXT extension services, existing managed-site provider modules.

---

## File Structure

- Create `src/services/managedSites/runtimeConfig.ts`
  - Owns the managed-site runtime config union, explicit config resolution from a `UserPreferences` snapshot, async current/explicit config loaders, and shared compatibility conversion helpers.
- Create `tests/services/managedSites/runtimeConfig.test.ts`
  - Tests complete and incomplete config resolution for every managed-site type.
- Modify `src/services/managedSites/managedSiteService.ts`
  - Replaces operation signatures with config-object signatures.
  - Wires `getConfig()` to `runtimeConfig.ts`.
  - Keeps service selection and `messagesKey` behavior unchanged.
- Modify `tests/services/managedSiteService/managedSiteService.test.ts`
  - Updates mocks and expectations for runtime configs instead of `{ baseUrl, token, userId }`.
- Modify provider modules:
  - `src/services/managedSites/providers/newApi.ts`
  - `src/services/managedSites/providers/doneHubService.ts`
  - `src/services/managedSites/providers/veloera.ts`
  - `src/services/managedSites/providers/octopus.ts`
  - `src/services/managedSites/providers/axonHub.ts`
  - `src/services/managedSites/providers/claudeCodeHub.ts`
- Modify provider tests:
  - `tests/services/newApiService/newApiService.test.ts`
  - `tests/services/doneHubService/doneHubService.test.ts`
  - `tests/services/doneHubService/doneHubService.more.test.ts`
  - `tests/services/veloeraService/veloeraService.test.ts`
  - `tests/services/veloeraService/veloeraService.more.test.ts`
  - `tests/services/octopusService/octopusService.more.test.ts`
  - `tests/services/managedSites/providers/axonHub.test.ts`
  - `tests/services/managedSites/providers/claudeCodeHub.test.ts`
- Modify shared managed-site flows:
  - `src/services/managedSites/channelMatchResolver.ts`
  - `src/services/managedSites/importDuplicateResolution.ts`
  - `src/services/managedSites/channelMigration.ts`
  - `src/services/managedSites/tokenBatchExport.ts`
  - `src/services/managedSites/tokenChannelStatus.ts` if compile reveals it still consumes the old operation Interface.
- Modify shared flow tests:
  - `tests/services/managedSites/channelMatchResolver.test.ts`
  - `tests/services/managedSites/importDuplicateResolution.test.ts`
  - `tests/services/managedSites/channelMigration.test.ts`
  - `tests/services/managedSites/tokenBatchExport.test.ts`
  - `tests/services/managedSites/tokenChannelStatus.test.ts` if touched by implementation.

---

### Task 1: Add Runtime Config Resolver

**Files:**

- Create: `src/services/managedSites/runtimeConfig.ts`
- Test: `tests/services/managedSites/runtimeConfig.test.ts`

- [ ] **Step 1: Write failing resolver tests**

Create `tests/services/managedSites/runtimeConfig.test.ts` with these tests:

```ts
import { describe, expect, it } from "vitest"

import { SITE_TYPES } from "~/constants/siteType"
import {
  getManagedSiteLegacyAdminConfig,
  resolveManagedSiteRuntimeConfigForType,
} from "~/services/managedSites/runtimeConfig"
import { buildUserPreferences } from "~~/tests/test-utils/factories"

describe("managed-site runtime config resolver", () => {
  it("resolves full runtime configs for every managed-site type", () => {
    const prefs = buildUserPreferences({
      newApi: {
        baseUrl: "https://new-api.example.com",
        adminToken: "new-token",
        userId: "1",
      },
      doneHub: {
        baseUrl: "https://donehub.example.com",
        adminToken: "done-token",
        userId: "2",
      },
      veloera: {
        baseUrl: "https://veloera.example.com",
        adminToken: "veloera-token",
        userId: "3",
      },
      octopus: {
        baseUrl: "https://octopus.example.com",
        username: "octo-admin",
        password: "octo-password",
      },
      axonHub: {
        baseUrl: "https://axonhub.example.com",
        email: "admin@example.com",
        password: "axon-password",
      },
      claudeCodeHub: {
        baseUrl: "https://cch.example.com",
        adminToken: "cch-token",
      },
    })

    expect(
      resolveManagedSiteRuntimeConfigForType(prefs, SITE_TYPES.NEW_API),
    ).toEqual({
      siteType: SITE_TYPES.NEW_API,
      config: prefs.newApi,
    })
    expect(
      resolveManagedSiteRuntimeConfigForType(prefs, SITE_TYPES.DONE_HUB),
    ).toEqual({
      siteType: SITE_TYPES.DONE_HUB,
      config: prefs.doneHub,
    })
    expect(
      resolveManagedSiteRuntimeConfigForType(prefs, SITE_TYPES.VELOERA),
    ).toEqual({
      siteType: SITE_TYPES.VELOERA,
      config: prefs.veloera,
    })
    expect(
      resolveManagedSiteRuntimeConfigForType(prefs, SITE_TYPES.OCTOPUS),
    ).toEqual({
      siteType: SITE_TYPES.OCTOPUS,
      config: prefs.octopus,
    })
    expect(
      resolveManagedSiteRuntimeConfigForType(prefs, SITE_TYPES.AXON_HUB),
    ).toEqual({
      siteType: SITE_TYPES.AXON_HUB,
      config: prefs.axonHub,
    })
    expect(
      resolveManagedSiteRuntimeConfigForType(
        prefs,
        SITE_TYPES.CLAUDE_CODE_HUB,
      ),
    ).toEqual({
      siteType: SITE_TYPES.CLAUDE_CODE_HUB,
      config: prefs.claudeCodeHub,
    })
  })

  it("returns null for incomplete configs", () => {
    const prefs = buildUserPreferences({
      newApi: {
        baseUrl: "",
        adminToken: "new-token",
        userId: "1",
      },
      octopus: {
        baseUrl: "https://octopus.example.com",
        username: "",
        password: "octo-password",
      },
      axonHub: {
        baseUrl: "https://axonhub.example.com",
        email: "admin@example.com",
        password: "",
      },
      claudeCodeHub: {
        baseUrl: "https://cch.example.com",
        adminToken: "",
      },
    })

    expect(
      resolveManagedSiteRuntimeConfigForType(prefs, SITE_TYPES.NEW_API),
    ).toBeNull()
    expect(
      resolveManagedSiteRuntimeConfigForType(prefs, SITE_TYPES.OCTOPUS),
    ).toBeNull()
    expect(
      resolveManagedSiteRuntimeConfigForType(prefs, SITE_TYPES.AXON_HUB),
    ).toBeNull()
    expect(
      resolveManagedSiteRuntimeConfigForType(
        prefs,
        SITE_TYPES.CLAUDE_CODE_HUB,
      ),
    ).toBeNull()
  })

  it("converts full runtime configs to the legacy admin shape for compatibility consumers", () => {
    const prefs = buildUserPreferences({
      newApi: {
        baseUrl: "https://new-api.example.com",
        adminToken: "new-token",
        userId: "1",
      },
      octopus: {
        baseUrl: "https://octopus.example.com",
        username: "octo-admin",
        password: "octo-password",
      },
      axonHub: {
        baseUrl: "https://axonhub.example.com",
        email: "admin@example.com",
        password: "axon-password",
      },
      claudeCodeHub: {
        baseUrl: "https://cch.example.com",
        adminToken: "cch-token",
      },
    })

    expect(
      getManagedSiteLegacyAdminConfig(
        resolveManagedSiteRuntimeConfigForType(prefs, SITE_TYPES.NEW_API)!,
      ),
    ).toEqual({
      baseUrl: "https://new-api.example.com",
      adminToken: "new-token",
      userId: "1",
    })
    expect(
      getManagedSiteLegacyAdminConfig(
        resolveManagedSiteRuntimeConfigForType(prefs, SITE_TYPES.OCTOPUS)!,
      ),
    ).toEqual({
      baseUrl: "https://octopus.example.com",
      adminToken: "",
      userId: "octo-admin",
    })
    expect(
      getManagedSiteLegacyAdminConfig(
        resolveManagedSiteRuntimeConfigForType(prefs, SITE_TYPES.AXON_HUB)!,
      ),
    ).toEqual({
      baseUrl: "https://axonhub.example.com",
      adminToken: "axon-password",
      userId: "admin@example.com",
    })
    expect(
      getManagedSiteLegacyAdminConfig(
        resolveManagedSiteRuntimeConfigForType(
          prefs,
          SITE_TYPES.CLAUDE_CODE_HUB,
        )!,
      ),
    ).toEqual({
      baseUrl: "https://cch.example.com",
      adminToken: "cch-token",
      userId: "admin",
    })
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
pnpm vitest --run tests/services/managedSites/runtimeConfig.test.ts
```

Expected: FAIL because `~/services/managedSites/runtimeConfig` does not exist.

- [ ] **Step 3: Implement the resolver Module**

Create `src/services/managedSites/runtimeConfig.ts`:

```ts
import { SITE_TYPES, type ManagedSiteType } from "~/constants/siteType"
import {
  userPreferences,
  type UserPreferences,
} from "~/services/preferences/userPreferences"
import type { AxonHubConfig } from "~/types/axonHubConfig"
import type { ClaudeCodeHubConfig } from "~/types/claudeCodeHubConfig"
import type { DoneHubConfig } from "~/types/doneHubConfig"
import type { NewApiConfig } from "~/types/newApiConfig"
import type { OctopusConfig } from "~/types/octopusConfig"
import type { VeloeraConfig } from "~/types/veloeraConfig"

export interface ManagedSiteLegacyAdminConfig {
  baseUrl: string
  adminToken: string
  userId: string
}

export type ManagedSiteRuntimeConfig =
  | { siteType: typeof SITE_TYPES.NEW_API; config: NewApiConfig }
  | { siteType: typeof SITE_TYPES.DONE_HUB; config: DoneHubConfig }
  | { siteType: typeof SITE_TYPES.VELOERA; config: VeloeraConfig }
  | { siteType: typeof SITE_TYPES.OCTOPUS; config: OctopusConfig }
  | { siteType: typeof SITE_TYPES.AXON_HUB; config: AxonHubConfig }
  | {
      siteType: typeof SITE_TYPES.CLAUDE_CODE_HUB
      config: ClaudeCodeHubConfig
    }

export type ManagedSiteRuntimeConfigValue = ManagedSiteRuntimeConfig["config"]

const hasText = (value: unknown): value is string =>
  typeof value === "string" && value.trim().length > 0

function resolveAccessTokenConfig(
  config: NewApiConfig | DoneHubConfig | VeloeraConfig | undefined,
) {
  if (!config) return null
  if (!hasText(config.baseUrl) || !hasText(config.adminToken)) return null
  if (!hasText(config.userId)) return null
  return config
}

export function resolveManagedSiteRuntimeConfigForType(
  preferences: UserPreferences,
  siteType: ManagedSiteType,
): ManagedSiteRuntimeConfig | null {
  if (siteType === SITE_TYPES.OCTOPUS) {
    const config = preferences.octopus
    if (
      !config ||
      !hasText(config.baseUrl) ||
      !hasText(config.username) ||
      !hasText(config.password)
    ) {
      return null
    }
    return { siteType, config }
  }

  if (siteType === SITE_TYPES.AXON_HUB) {
    const config = preferences.axonHub
    if (
      !config ||
      !hasText(config.baseUrl) ||
      !hasText(config.email) ||
      !hasText(config.password)
    ) {
      return null
    }
    return { siteType, config }
  }

  if (siteType === SITE_TYPES.CLAUDE_CODE_HUB) {
    const config = preferences.claudeCodeHub
    if (!config || !hasText(config.baseUrl) || !hasText(config.adminToken)) {
      return null
    }
    return { siteType, config }
  }

  if (siteType === SITE_TYPES.DONE_HUB) {
    const config = resolveAccessTokenConfig(preferences.doneHub)
    return config ? { siteType, config } : null
  }

  if (siteType === SITE_TYPES.VELOERA) {
    const config = resolveAccessTokenConfig(preferences.veloera)
    return config ? { siteType, config } : null
  }

  const config = resolveAccessTokenConfig(preferences.newApi)
  return config ? { siteType: SITE_TYPES.NEW_API, config } : null
}

export function resolveCurrentManagedSiteRuntimeConfig(
  preferences: UserPreferences,
): ManagedSiteRuntimeConfig | null {
  return resolveManagedSiteRuntimeConfigForType(
    preferences,
    preferences.managedSiteType || SITE_TYPES.NEW_API,
  )
}

export async function getCurrentManagedSiteRuntimeConfig(): Promise<ManagedSiteRuntimeConfig | null> {
  try {
    const preferences = await userPreferences.getPreferences()
    return resolveCurrentManagedSiteRuntimeConfig(preferences)
  } catch {
    return null
  }
}

export async function getManagedSiteRuntimeConfigForType(
  siteType: ManagedSiteType,
): Promise<ManagedSiteRuntimeConfig | null> {
  try {
    const preferences = await userPreferences.getPreferences()
    return resolveManagedSiteRuntimeConfigForType(preferences, siteType)
  } catch {
    return null
  }
}

export function getManagedSiteLegacyAdminConfig(
  runtimeConfig: ManagedSiteRuntimeConfig,
): ManagedSiteLegacyAdminConfig {
  if (runtimeConfig.siteType === SITE_TYPES.OCTOPUS) {
    return {
      baseUrl: runtimeConfig.config.baseUrl,
      adminToken: "",
      userId: runtimeConfig.config.username,
    }
  }

  if (runtimeConfig.siteType === SITE_TYPES.AXON_HUB) {
    return {
      baseUrl: runtimeConfig.config.baseUrl,
      adminToken: runtimeConfig.config.password,
      userId: runtimeConfig.config.email,
    }
  }

  if (runtimeConfig.siteType === SITE_TYPES.CLAUDE_CODE_HUB) {
    return {
      baseUrl: runtimeConfig.config.baseUrl,
      adminToken: runtimeConfig.config.adminToken,
      userId: "admin",
    }
  }

  return {
    baseUrl: runtimeConfig.config.baseUrl,
    adminToken: runtimeConfig.config.adminToken,
    userId: runtimeConfig.config.userId,
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run:

```bash
pnpm vitest --run tests/services/managedSites/runtimeConfig.test.ts
```

Expected: PASS.

---

### Task 2: Wire ManagedSiteService to Runtime Configs

**Files:**

- Modify: `src/services/managedSites/managedSiteService.ts`
- Modify: `src/services/managedSites/utils/managedSite.ts`
- Test: `tests/services/managedSiteService/managedSiteService.test.ts`
- Test: `tests/services/managedSites/runtimeConfig.test.ts`

- [ ] **Step 1: Update service tests for full configs**

In `tests/services/managedSiteService/managedSiteService.test.ts`, update provider mocks so `getConfig()` returns full config objects:

```ts
vi.mock("~/services/managedSites/providers/axonHub", () => ({
  checkValidAxonHubConfig: vi.fn(async () => true),
  searchChannel: vi.fn(),
  createChannel: vi.fn(),
  updateChannel: vi.fn(),
  deleteChannel: vi.fn(),
  fetchAvailableModels: vi.fn(),
  buildChannelName: vi.fn(),
  prepareChannelFormData: vi.fn(),
  buildChannelPayload: vi.fn(),
  autoConfigToAxonHub: vi.fn(),
}))
```

Then update config expectations to full runtime configs after importing the service:

```ts
mockGetPreferences.mockResolvedValueOnce({
  managedSiteType: SITE_TYPES.AXON_HUB,
  axonHub: {
    baseUrl: "https://axonhub.example.com",
    email: "admin@example.com",
    password: "secret",
  },
})

const service = getManagedSiteServiceForType(SITE_TYPES.AXON_HUB)
await expect(service.getConfig()).resolves.toEqual({
  baseUrl: "https://axonhub.example.com",
  email: "admin@example.com",
  password: "secret",
})
```

Add one assertion for explicit service routing:

```ts
mockGetPreferences.mockResolvedValueOnce({
  managedSiteType: SITE_TYPES.NEW_API,
  claudeCodeHub: {
    baseUrl: "https://cch.example.com",
    adminToken: "cch-token",
  },
})

const service = getManagedSiteServiceForType(SITE_TYPES.CLAUDE_CODE_HUB)
await expect(service.getConfig()).resolves.toEqual({
  baseUrl: "https://cch.example.com",
  adminToken: "cch-token",
})
```

- [ ] **Step 2: Run service tests to verify failure**

Run:

```bash
pnpm vitest --run tests/services/managedSiteService/managedSiteService.test.ts
```

Expected: FAIL because `ManagedSiteService.getConfig()` still delegates to provider-local config functions and operation signatures still use `baseUrl/token/userId`.

- [ ] **Step 3: Update `ManagedSiteService` types and registry**

In `src/services/managedSites/managedSiteService.ts`:

1. Import runtime config types and resolver:

```ts
import {
  getManagedSiteRuntimeConfigForType,
  getCurrentManagedSiteRuntimeConfig,
  type ManagedSiteRuntimeConfigValue,
} from "~/services/managedSites/runtimeConfig"
```

2. Replace `ManagedSiteConfig` with an alias for compatibility:

```ts
export type ManagedSiteConfig = ManagedSiteRuntimeConfigValue
```

3. Update `ManagedSiteService` operation signatures:

```ts
export interface ManagedSiteService {
  siteType: ManagedSiteType
  messagesKey: ManagedSiteMessagesKey

  searchChannel(
    config: ManagedSiteRuntimeConfigValue,
    keyword: string,
  ): Promise<ManagedSiteChannelListData | null>

  createChannel(
    config: ManagedSiteRuntimeConfigValue,
    channelData: CreateChannelPayload,
  ): Promise<ApiResponse<unknown>>

  updateChannel(
    config: ManagedSiteRuntimeConfigValue,
    channelData: UpdateChannelPayload,
  ): Promise<ApiResponse<unknown>>

  deleteChannel(
    config: ManagedSiteRuntimeConfigValue,
    channelId: number,
  ): Promise<ApiResponse<unknown>>

  checkValidConfig(): Promise<boolean>
  getConfig(): Promise<ManagedSiteRuntimeConfigValue | null>

  fetchAvailableModels(
    account: DisplaySiteData,
    token: ApiToken,
  ): Promise<string[]>

  buildChannelName(account: DisplaySiteData, token: ApiToken): string

  prepareChannelFormData(
    account: DisplaySiteData,
    token: ApiToken | AccountToken,
  ): Promise<ChannelFormData>

  buildChannelPayload(
    formData: ChannelFormData,
    mode?: ChannelMode,
  ): CreateChannelPayload

  hydrateComparableChannelKeys?(
    config: ManagedSiteRuntimeConfigValue,
    candidates: ManagedSiteChannel[],
  ): Promise<ManagedSiteChannel[]>

  fetchChannelSecretKey?(
    config: ManagedSiteRuntimeConfigValue,
    channelId: number,
  ): Promise<string>

  autoConfigToManagedSite(
    account: SiteAccount,
    toastId?: string,
  ): Promise<unknown>
}
```

4. Add helper:

```ts
const getConfigForServiceType = async (siteType: ManagedSiteType) => {
  const runtimeConfig = await getManagedSiteRuntimeConfigForType(siteType)
  return runtimeConfig?.config ?? null
}
```

5. Replace each provider's `getConfig` wiring:

```ts
getConfig: () => getConfigForServiceType(siteType),
```

For `getManagedSiteService()`, continue using preferences only to select the current site type:

```ts
export async function getManagedSiteService(): Promise<ManagedSiteService> {
  const runtimeConfig = await getCurrentManagedSiteRuntimeConfig()
  const siteType = runtimeConfig?.siteType ?? SITE_TYPES.NEW_API
  return getManagedSiteServiceForType(siteType)
}
```

- [ ] **Step 4: Move legacy admin config helpers to the resolver**

In `src/services/managedSites/utils/managedSite.ts`, import and reuse:

```ts
import {
  getManagedSiteLegacyAdminConfig,
  resolveManagedSiteRuntimeConfigForType,
} from "~/services/managedSites/runtimeConfig"
```

Rewrite `getManagedSiteAdminConfigForType`:

```ts
export function getManagedSiteAdminConfigForType(
  preferences: UserPreferences,
  siteType: ManagedSiteType,
): ManagedSiteAdminConfig | null {
  const runtimeConfig = resolveManagedSiteRuntimeConfigForType(
    preferences,
    siteType,
  )
  return runtimeConfig ? getManagedSiteLegacyAdminConfig(runtimeConfig) : null
}
```

Keep label/message helpers in `managedSite.ts`.

- [ ] **Step 5: Run service and resolver tests**

Run:

```bash
pnpm vitest --run tests/services/managedSites/runtimeConfig.test.ts tests/services/managedSiteService/managedSiteService.test.ts
```

Expected: PASS.

---

### Task 3: Convert New API-Family Providers to Config Objects

**Files:**

- Modify: `src/services/managedSites/providers/newApi.ts`
- Modify: `src/services/managedSites/providers/doneHubService.ts`
- Modify: `src/services/managedSites/providers/veloera.ts`
- Test: `tests/services/newApiService/newApiService.test.ts`
- Test: `tests/services/doneHubService/doneHubService.test.ts`
- Test: `tests/services/veloeraService/veloeraService.test.ts`
- Test: `tests/services/managedSites/channelMatchResolver.test.ts`

- [ ] **Step 1: Update one provider test to require config-object operations**

In the most focused New API/DoneHub/Veloera tests, add assertions following this shape:

```ts
const config = {
  baseUrl: "https://donehub.example.com",
  adminToken: "done-token",
  userId: "9",
}

await provider.searchChannel(config, "alpha")

expect(mockSearchChannel).toHaveBeenCalledWith(
  {
    baseUrl: "https://donehub.example.com",
    auth: {
      authType: AuthTypeEnum.AccessToken,
      accessToken: "done-token",
      userId: "9",
    },
  },
  "alpha",
)
```

For key hydration in `tests/services/managedSites/channelMatchResolver.test.ts`, update the service stub:

```ts
hydrateComparableChannelKeys: vi.fn(async (_config, candidates) => candidates)
```

And update expectations:

```ts
expect(hydrateComparableChannelKeys).toHaveBeenCalledWith(
  managedConfig,
  [expect.objectContaining({ id: 7 })],
)
```

- [ ] **Step 2: Run related tests to verify failure**

Run:

```bash
pnpm vitest --run tests/services/managedSites/channelMatchResolver.test.ts tests/services/doneHubService/doneHubService.test.ts tests/services/veloeraService/veloeraService.test.ts
```

Expected: FAIL because providers and channel match resolver still call the old signatures.

- [ ] **Step 3: Convert provider function signatures**

For `newApi.ts`, `doneHubService.ts`, and `veloera.ts`, replace operation signatures:

```ts
export async function searchChannel(
  config: NewApiConfig,
  keyword: string,
): Promise<ManagedSiteChannelListData | null> {
  return await getApiService(SITE_TYPES.NEW_API).searchChannel(
    {
      baseUrl: config.baseUrl,
      auth: {
        authType: AuthTypeEnum.AccessToken,
        accessToken: config.adminToken,
        userId: config.userId,
      },
    },
    keyword,
  )
}
```

Apply the same pattern for:

- `createChannel(config, channelData)`
- `updateChannel(config, channelData)`
- `deleteChannel(config, channelId)`
- `fetchChannelSecretKey(config, channelId)`
- `hydrateComparableChannelKeys(config, candidates)`

Use the correct config type per provider:

- New API: `NewApiConfig`
- DoneHub: `DoneHubConfig`
- Veloera: `VeloeraConfig`

For New API session-backed key reveal, replace:

```ts
const sessionConfig = await getNewApiManagedSessionConfig(baseUrl, userId)
```

with:

```ts
const sessionConfig = await getNewApiManagedSessionConfig(
  config.baseUrl,
  config.userId,
)
```

- [ ] **Step 4: Update channel match resolver**

In `src/services/managedSites/channelMatchResolver.ts`, change the params field:

```ts
managedConfig: ManagedSiteConfig
```

to:

```ts
managedConfig: ManagedSiteRuntimeConfigValue
```

Then update calls:

```ts
const searchResults = await service.searchChannel(
  managedConfig,
  keyword,
)
```

```ts
return await params.service.fetchChannelSecretKey!(
  params.managedConfig,
  params.channelId,
)
```

```ts
const hydratedCandidates = await service.hydrateComparableChannelKeys(
  managedConfig,
  recoverableCandidates,
)
```

- [ ] **Step 5: Run related tests**

Run:

```bash
pnpm vitest --run tests/services/managedSites/channelMatchResolver.test.ts tests/services/doneHubService/doneHubService.test.ts tests/services/veloeraService/veloeraService.test.ts
```

Expected: PASS for converted call paths.

---

### Task 4: Convert Octopus, AxonHub, and Claude Code Hub Providers

**Files:**

- Modify: `src/services/managedSites/providers/octopus.ts`
- Modify: `src/services/managedSites/providers/axonHub.ts`
- Modify: `src/services/managedSites/providers/claudeCodeHub.ts`
- Test: `tests/services/octopusService/octopusService.more.test.ts`
- Test: `tests/services/managedSites/providers/axonHub.test.ts`
- Test: `tests/services/managedSites/providers/claudeCodeHub.test.ts`

- [ ] **Step 1: Update provider tests to prove operations use passed config**

For `tests/services/managedSites/providers/claudeCodeHub.test.ts`, rewrite the CRUD test from “stored admin config” to “passed admin config”:

```ts
const config = {
  baseUrl: "https://passed-cch.example.com",
  adminToken: "passed-admin-token",
}

mockGetPreferences.mockResolvedValue({
  claudeCodeHub: {
    baseUrl: "https://stored-cch.example.com",
    adminToken: "stored-token",
  },
})

await searchChannel(config, "alpha")

expect(mockSearchProviders).toHaveBeenCalledWith(config, "alpha")
expect(mockSearchProviders).not.toHaveBeenCalledWith(
  {
    baseUrl: "https://stored-cch.example.com",
    adminToken: "stored-token",
  },
  "alpha",
)
```

Apply the same proof for:

- `createChannel(config, payload)`
- `updateChannel(config, payload)`
- `deleteChannel(config, channelId)`
- `fetchChannelSecretKey(config, channelId)`
- `hydrateComparableChannelKeys(config, candidates)`

For `tests/services/managedSites/providers/axonHub.test.ts`, assert:

```ts
const passedConfig = {
  baseUrl: "https://passed-axonhub.example.com",
  email: "passed-admin@example.com",
  password: "passed-password",
}

await provider.searchChannel(passedConfig, "alpha")
expect(mockSearchChannels).toHaveBeenCalledWith(passedConfig, "alpha")
```

For Octopus, assert `octopusApi.searchChannels`, `createChannel`,
`updateChannel`, and `deleteChannel` receive the passed `OctopusConfig`.

- [ ] **Step 2: Run provider tests to verify failure**

Run:

```bash
pnpm vitest --run tests/services/managedSites/providers/claudeCodeHub.test.ts tests/services/managedSites/providers/axonHub.test.ts tests/services/octopusService/octopusService.more.test.ts
```

Expected: FAIL because operations still call `getFull...Config()`.

- [ ] **Step 3: Convert operation signatures and remove operation-level preference reads**

In each provider:

1. Keep `checkValid...Config()` and legacy import helpers reading config through service/resolver.
2. Change operation functions to accept explicit config:

```ts
export async function searchChannel(
  config: ClaudeCodeHubConfig,
  keyword: string,
): Promise<ManagedSiteChannelListData | null> {
  try {
    return await searchClaudeCodeHubChannels(config, keyword)
  } catch (error) {
    logger.error("Failed to search Claude Code Hub providers", error)
    return null
  }
}
```

```ts
export async function createChannel(
  config: ClaudeCodeHubConfig,
  channelData: CreateChannelPayload,
): Promise<ApiResponse<unknown>> {
  try {
    const created = await claudeCodeHubApi.createProvider(
      config,
      buildClaudeCodeHubCreatePayloadFromFormData(/* existing mapping */),
    )
    return { success: true, data: created, message: "success" }
  } catch (error) {
    return {
      success: false,
      data: null,
      message:
        getErrorMessage(error) || t("messages:claudecodehub.importFailed"),
    }
  }
}
```

3. Delete `getFullClaudeCodeHubConfig()` from operation paths. If a legacy import helper still needs it, replace it with:

```ts
const service = getManagedSiteServiceForType(SITE_TYPES.CLAUDE_CODE_HUB)
const config = (await service.getConfig()) as ClaudeCodeHubConfig | null
```

If that import would create a circular dependency, import `getManagedSiteRuntimeConfigForType` from `runtimeConfig.ts` instead:

```ts
const runtimeConfig = await getManagedSiteRuntimeConfigForType(
  SITE_TYPES.CLAUDE_CODE_HUB,
)
const config =
  runtimeConfig?.siteType === SITE_TYPES.CLAUDE_CODE_HUB
    ? runtimeConfig.config
    : null
```

4. Apply equivalent conversions for AxonHub and Octopus:

```ts
export async function updateChannel(
  config: AxonHubConfig,
  channelData: UpdateChannelPayload & { status?: number },
): Promise<ApiResponse<unknown>> {
  // existing body, but remove getFullAxonHubConfig()
}
```

```ts
export async function deleteChannel(
  config: OctopusConfig,
  channelId: number,
): Promise<ApiResponse<unknown>> {
  // existing body, but remove getFullOctopusConfig()
}
```

- [ ] **Step 4: Run provider tests**

Run:

```bash
pnpm vitest --run tests/services/managedSites/providers/claudeCodeHub.test.ts tests/services/managedSites/providers/axonHub.test.ts tests/services/octopusService/octopusService.more.test.ts
```

Expected: PASS.

---

### Task 5: Update Business-Layer Flows

**Files:**

- Modify: `src/services/managedSites/importDuplicateResolution.ts`
- Modify: `src/services/managedSites/tokenBatchExport.ts`
- Modify: `src/services/managedSites/channelMigration.ts`
- Modify: `src/services/managedSites/tokenChannelStatus.ts` if compile reports old signature use.
- Test: `tests/services/managedSites/importDuplicateResolution.test.ts`
- Test: `tests/services/managedSites/tokenBatchExport.test.ts`
- Test: `tests/services/managedSites/channelMigration.test.ts`
- Test: `tests/services/managedSites/tokenChannelStatus.test.ts` if touched.

- [ ] **Step 1: Update tests to expect config-object calls**

In `tests/services/managedSites/tokenBatchExport.test.ts`, change service mock config:

```ts
const managedConfig = {
  baseUrl: "https://target.example.com",
  adminToken: "admin-token",
  userId: "1",
}

getConfig: vi.fn().mockResolvedValue(managedConfig)
```

Then assert execution calls:

```ts
expect(service.createChannel).toHaveBeenCalledWith(
  managedConfig,
  expect.objectContaining({
    channel: expect.objectContaining({
      key: "token-secret",
    }),
  }),
)
```

In `tests/services/managedSites/channelMigration.test.ts`, update expectations:

```ts
expect(mockDoneHubFetchChannelSecretKey).toHaveBeenCalledWith(
  {
    baseUrl: "https://donehub.example.com",
    adminToken: "donehub-token",
    userId: "9",
  },
  21,
)
```

```ts
expect(mockAxonHubCreateChannel).toHaveBeenNthCalledWith(
  1,
  {
    baseUrl: "https://axonhub.example.com",
    email: "admin@example.com",
    password: "secret",
  },
  expect.objectContaining({
    channel: expect.objectContaining({
      type: AXON_HUB_CHANNEL_TYPE.ANTHROPIC,
    }),
  }),
)
```

- [ ] **Step 2: Run shared flow tests to verify failure**

Run:

```bash
pnpm vitest --run tests/services/managedSites/importDuplicateResolution.test.ts tests/services/managedSites/tokenBatchExport.test.ts tests/services/managedSites/channelMigration.test.ts
```

Expected: FAIL because these flows still pass `baseUrl/token/userId` into service operations.

- [ ] **Step 3: Update duplicate resolution**

In `src/services/managedSites/importDuplicateResolution.ts`, change the input type from legacy admin config to runtime config:

```ts
managedConfig: ManagedSiteRuntimeConfigValue
```

Update calls:

```ts
const resolution = await resolveManagedSiteChannelMatch({
  service,
  managedConfig,
  accountBaseUrl: formData.base_url,
  models: normalizeList(formData.models ?? []),
  key: formData.key,
  resolveHiddenKeys: true,
})
```

Do not decompose config into `baseUrl/token/userId`.

- [ ] **Step 4: Update token batch export**

In `src/services/managedSites/tokenBatchExport.ts`:

1. Keep `const managedConfig = await service.getConfig()`.
2. Pass `managedConfig` directly into `resolveManagedSiteChannelMatch`.
3. Pass `managedConfig` directly into create:

```ts
const response = await service.createChannel(managedConfig, payload)
```

4. Update `collectSecrets` to avoid assuming `managedConfig.token` exists:

```ts
const collectManagedConfigSecrets = (managedConfig: ManagedSiteConfig) => {
  if ("adminToken" in managedConfig) return [managedConfig.adminToken]
  if ("password" in managedConfig) return [managedConfig.password]
  return []
}

const collectSecrets = (
  account: DisplaySiteData,
  token: AccountToken,
  managedConfig: ManagedSiteConfig,
) =>
  [
    token.key,
    account.token,
    account.cookieAuthSessionCookie,
    ...collectManagedConfigSecrets(managedConfig),
  ].filter(Boolean) as string[]
```

- [ ] **Step 5: Update channel migration**

In `src/services/managedSites/channelMigration.ts`:

1. Use `resolveManagedSiteRuntimeConfigForType(preferences, sourceSiteType)` for source key resolution when a source config is needed.
2. Pass the full source config into `fetchChannelSecretKey`:

```ts
const sourceRuntimeConfig = resolveManagedSiteRuntimeConfigForType(
  preferences,
  sourceSiteType,
)

if (!sourceRuntimeConfig) {
  return {
    key: null,
    blockingReasonCode:
      MANAGED_SITE_CHANNEL_MIGRATION_BLOCKED_REASON_CODES.SOURCE_KEY_RESOLUTION_FAILED,
    blockingMessage: "Source managed-site configuration is missing.",
  }
}

const key = await sourceService.fetchChannelSecretKey(
  sourceRuntimeConfig.config,
  channel.id,
)
```

3. During execution, pass target config directly:

```ts
const targetConfig = await targetService.getConfig()
...
const response = await targetService.createChannel(targetConfig, payload)
```

- [ ] **Step 6: Run shared flow tests**

Run:

```bash
pnpm vitest --run tests/services/managedSites/importDuplicateResolution.test.ts tests/services/managedSites/tokenBatchExport.test.ts tests/services/managedSites/channelMigration.test.ts
```

Expected: PASS.

---

### Task 6: Remove Remaining Old Operation Signature Uses

**Files:**

- Search and modify any file under `src/services/managedSites/**` still calling service operations with `baseUrl/token/userId`.
- Search and modify any tests under `tests/services/**` still expecting the old operation Interface.

- [ ] **Step 1: Search for old operation calls**

Run:

```bash
rg -n "searchChannel\\([^\\n]*baseUrl|createChannel\\([^\\n]*baseUrl|updateChannel\\([^\\n]*baseUrl|deleteChannel\\([^\\n]*baseUrl|fetchChannelSecretKey\\([^\\n]*baseUrl|hydrateComparableChannelKeys\\([^\\n]*baseUrl|managedConfig\\.token|managedConfig\\.userId" src tests
```

Expected before cleanup: matches in call sites not yet updated or tests still using legacy admin config shape.

- [ ] **Step 2: Replace remaining calls**

For any operation call still shaped like:

```ts
await service.createChannel(
  managedConfig.baseUrl,
  managedConfig.token,
  managedConfig.userId,
  payload,
)
```

replace with:

```ts
await service.createChannel(managedConfig, payload)
```

For any hydration call still shaped like:

```ts
await service.hydrateComparableChannelKeys(
  managedConfig.baseUrl,
  managedConfig.token,
  managedConfig.userId,
  candidates,
)
```

replace with:

```ts
await service.hydrateComparableChannelKeys(managedConfig, candidates)
```

- [ ] **Step 3: Verify the old operation shape is gone**

Run:

```bash
rg -n "searchChannel\\([^\\n]*baseUrl|createChannel\\([^\\n]*baseUrl|updateChannel\\([^\\n]*baseUrl|deleteChannel\\([^\\n]*baseUrl|fetchChannelSecretKey\\([^\\n]*baseUrl|hydrateComparableChannelKeys\\([^\\n]*baseUrl" src tests
```

Expected: no matches for service operation calls using old `baseUrl/token/userId` shape. Matches in comments or unrelated backend request objects are acceptable only if they do not call `ManagedSiteService` provider operations.

- [ ] **Step 4: Compile to catch type drift**

Run:

```bash
pnpm compile
```

Expected: PASS. If it fails, fix all TypeScript errors caused by the signature migration before continuing.

---

### Task 7: Focused Validation and Commit

**Files:**

- All task-scoped modified files.

- [ ] **Step 1: Run focused related tests**

Run:

```bash
pnpm vitest --run tests/services/managedSites/runtimeConfig.test.ts tests/services/managedSiteService/managedSiteService.test.ts tests/services/managedSites/channelMatchResolver.test.ts tests/services/managedSites/importDuplicateResolution.test.ts tests/services/managedSites/tokenBatchExport.test.ts tests/services/managedSites/channelMigration.test.ts tests/services/managedSites/providers/claudeCodeHub.test.ts tests/services/managedSites/providers/axonHub.test.ts tests/services/octopusService/octopusService.more.test.ts tests/services/doneHubService/doneHubService.test.ts tests/services/veloeraService/veloeraService.test.ts
```

Expected: PASS.

- [ ] **Step 2: Run compile**

Run:

```bash
pnpm compile
```

Expected: PASS.

- [ ] **Step 3: Run dependency/export validation**

Because this change adds a new service Module and changes exported service types, run:

```bash
pnpm run validate:push
```

Expected: PASS.

- [ ] **Step 4: Inspect final diff**

Run:

```bash
git diff --stat
git diff --check
git status --porcelain=v1
```

Expected:

- `git diff --check` exits 0.
- Diff includes only managed-site runtime config implementation, tests, and this plan.
- Pre-existing untracked files such as `notify.py` and `store-description/` remain untracked and untouched.

- [ ] **Step 5: Stage only task-scoped files**

Run:

```bash
git add src/services/managedSites/runtimeConfig.ts src/services/managedSites/managedSiteService.ts src/services/managedSites/utils/managedSite.ts src/services/managedSites/providers/newApi.ts src/services/managedSites/providers/doneHubService.ts src/services/managedSites/providers/veloera.ts src/services/managedSites/providers/octopus.ts src/services/managedSites/providers/axonHub.ts src/services/managedSites/providers/claudeCodeHub.ts src/services/managedSites/channelMatchResolver.ts src/services/managedSites/importDuplicateResolution.ts src/services/managedSites/channelMigration.ts src/services/managedSites/tokenBatchExport.ts tests/services/managedSites/runtimeConfig.test.ts tests/services/managedSiteService/managedSiteService.test.ts tests/services/managedSites/channelMatchResolver.test.ts tests/services/managedSites/importDuplicateResolution.test.ts tests/services/managedSites/tokenBatchExport.test.ts tests/services/managedSites/channelMigration.test.ts tests/services/managedSites/providers/claudeCodeHub.test.ts tests/services/managedSites/providers/axonHub.test.ts tests/services/octopusService/octopusService.more.test.ts tests/services/doneHubService/doneHubService.test.ts tests/services/veloeraService/veloeraService.test.ts
```

If `tokenChannelStatus.ts` or related tests changed during compile fixes, include those exact files in the same task-scoped `git add`.

- [ ] **Step 6: Run staged validation**

Run:

```bash
pnpm run validate:staged
```

Expected: PASS and not a no-staged-files skip.

- [ ] **Step 7: Commit implementation**

Run:

```bash
git commit -m "refactor(managed-sites): pass runtime configs to adapters"
```

Expected: commit succeeds after hooks pass.

---

## Self-Review

- Spec coverage: The plan covers the resolver Module, the `ManagedSiteService` Interface, all six managed-site providers, shared business-layer flows, tests, and validation.
- Placeholder scan: No task contains placeholder language or vague implementation instructions.
- Type consistency: The plan uses `ManagedSiteRuntimeConfig`, `ManagedSiteRuntimeConfigValue`, `ManagedSiteConfig`, and `ManagedSiteLegacyAdminConfig` consistently. `ManagedSiteConfig` remains an alias during implementation to limit call-site churn.
- E2E decision: No E2E task is included because this is service-layer configuration flow with targeted Vitest coverage and compile validation.

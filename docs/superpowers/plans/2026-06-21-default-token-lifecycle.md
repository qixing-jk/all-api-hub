# Default Token Lifecycle Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Centralize default-token lifecycle orchestration in `src/services/accounts/defaultTokenLifecycle/` so new account site types can reuse one product-side flow for inventory inspection, policy resolution, token creation, created-token classification, and inventory refetch recovery.

**Architecture:** Keep raw token CRUD in `SiteAdapter.keyManagement` and site-specific policy in `SiteAdapter.tokenProvisioning`. The new lifecycle Module owns reusable account-token orchestration and returns stable result/reason codes; current workflow Modules keep UI, toast, progress, persistence, and workflow-specific result mapping.

**Tech Stack:** TypeScript, WXT extension services, existing `apiAdapters`, Vitest, `rg`, `pnpm run validate:staged`, `pnpm run validate:push`.

**Spec:** `docs/superpowers/specs/2026-06-21-default-token-lifecycle-design.md`

---

## File Structure

- Create `src/services/accounts/defaultTokenLifecycle/contracts.ts`
  - Defines lifecycle result kinds, lifecycle block reasons, inventory state, typed lifecycle errors, and result unions.
- Create `src/services/accounts/defaultTokenLifecycle/requests.ts`
  - Owns the default token payload constants and saved-account create request builder.
  - Exports `DEFAULT_AUTO_PROVISION_TOKEN_NAME`, `DEFAULT_USER_GROUP_NAME`, `resolvePreferredDefaultUserGroup(...)`, `generateDefaultTokenRequest()`, and `createStoredAccountTokenRequest(...)`.
- Create `src/services/accounts/defaultTokenLifecycle/lifecycle.ts`
  - Owns inventory normalization, id-diff recovery, user-group second-pass decision handling, `inspectDefaultTokenInventory(...)`, `resolveDefaultTokenLifecycleDecision(...)`, `createDefaultTokenFromDecision(...)`, and `ensureDefaultTokenLifecycle(...)`.
- Create `src/services/accounts/defaultTokenLifecycle/index.ts`
  - Barrel export for lifecycle contracts, request helpers, and orchestration helpers.
- Create `tests/services/accounts/defaultTokenLifecycle.test.ts`
  - Focused tests for inventory inspection, user-group decision resolution, create/classify/refetch recovery, and high-level ensure behavior.
- Modify `src/services/accounts/accountKeyAutoProvisioning/ensureDefaultToken.ts`
  - Re-exports default-token request constants/helpers from the lifecycle Module.
  - Routes `ensureDefaultApiTokenForAccount(...)` through `ensureDefaultTokenLifecycle(...)`.
- Modify `src/services/accounts/accountOperations.ts`
  - Routes `resolveDefaultTokenQuickCreateResolution(...)` through `resolveDefaultTokenLifecycleDecision(...)`.
  - Routes `ensureAccountApiToken(...)` through `ensureDefaultTokenLifecycle(...)`.
  - Removes raw Sub2API/AIHubMix skip from `autoProvisionKeyOnAccountAdd(...)` and maps policy-blocked lifecycle errors to the current silent skip behavior.
- Modify `src/services/accounts/accountPostSaveWorkflow/ensureAccountToken.ts`
  - Routes post-save token ensure through `ensureDefaultTokenLifecycle(...)`.
  - Re-exports `inspectAccountTokenInventory(...)` and `selectSingleNewApiTokenByIdDiff(...)` as compatibility aliases backed by the lifecycle Module.
- Modify `src/services/accounts/accountPostSaveWorkflow/index.ts`
  - Keeps existing public exports stable.
- Modify `src/services/accounts/accountKeyAutoProvisioning/groupCoverage.ts`
  - Uses lifecycle create/classify/refetch helper for only the empty-group/no-token fallback path.
  - Keeps per-group repair creation and invalid-token detection local.
- Modify existing tests:
  - `tests/services/accountOperations.ensureAccountApiToken.test.ts`
  - `tests/services/accountOperations.autoProvisionKeyOnAccountAdd.test.ts`
  - `tests/services/accountPostSaveWorkflow.ensureAccountToken.test.ts`
  - `tests/services/accountKeyGroupCoverage.test.ts`
  - `tests/services/accountKeyRepair.test.ts`

Do not modify:

- `src/services/apiAdapters/**`
  - The token provisioning policy seam already exists and remains Adapter-owned.
- `src/services/apiService/**`
  - Backend token operations remain delegated behind `keyManagement`.
- `src/locales/**`
  - Existing message keys remain the current copy contract.
- telemetry schemas, settings search files, Playwright E2E tests, managed-site providers, model catalog/pricing, redemption, site announcements, account bootstrap/data/refresh/completion, or new site-type definitions.

Telemetry decision: reuse existing.

Settings search decision: none.

E2E decision: no new Playwright E2E. This is a service-layer lifecycle refactor; focused Vitest coverage exercises the behavioral risk directly.

---

## Magic String Policy

New runtime code in this slice must not branch on translated messages, raw site-type string literals, raw workflow/result/reason strings, or ad hoc error messages. Use existing constants such as `SITE_TYPES`, `TOKEN_PROVISIONING_WORKFLOWS`, `DEFAULT_TOKEN_CREATION_DECISION_KINDS`, `CREATED_TOKEN_SECRET_DECISION_KINDS`, `TOKEN_PROVISIONING_BLOCK_REASONS`, `TOKEN_PROVISIONING_ERRORS`, and account workflow constants, or add exported constants in `src/services/accounts/defaultTokenLifecycle/contracts.ts`.

Literal values are allowed only at the canonical constant definition point or as fixture data in tests. Tests may use local example IDs, URLs, tokens, and display messages, but assertions for control flow should prefer exported constants or typed errors.

---

### Task 1: Add Lifecycle Contracts, Request Helpers, And Inventory Tests

**Files:**
- Create: `src/services/accounts/defaultTokenLifecycle/contracts.ts`
- Create: `src/services/accounts/defaultTokenLifecycle/requests.ts`
- Create: `src/services/accounts/defaultTokenLifecycle/lifecycle.ts`
- Create: `src/services/accounts/defaultTokenLifecycle/index.ts`
- Create: `tests/services/accounts/defaultTokenLifecycle.test.ts`
- Modify: `src/services/accounts/accountKeyAutoProvisioning/ensureDefaultToken.ts`

- [ ] **Step 1: Write failing tests for token id-diff and inventory inspection**

Create `tests/services/accounts/defaultTokenLifecycle.test.ts` with this initial content:

```ts
import { beforeEach, describe, expect, it, vi } from "vitest"

import { SITE_TYPES } from "~/constants/siteType"
import {
  DEFAULT_TOKEN_INVENTORY_STATE_KINDS,
  inspectDefaultTokenInventory,
  selectSingleNewApiTokenByIdDiff,
} from "~/services/accounts/defaultTokenLifecycle"
import {
  TOKEN_PROVISIONING_REPAIR_POLICY_KINDS,
  TOKEN_PROVISIONING_WORKFLOWS,
} from "~/services/apiAdapters/contracts/tokenProvisioning"
import { AuthTypeEnum, type ApiToken, type DisplaySiteData } from "~/types"

const {
  fetchAccountTokensMock,
  isInventoryTokenUsableMock,
  getSiteAdapterMock,
} = vi.hoisted(() => {
  const fetchAccountTokensMock = vi.fn()
  const isInventoryTokenUsableMock = vi.fn()

  return {
    fetchAccountTokensMock,
    isInventoryTokenUsableMock,
    getSiteAdapterMock: vi.fn(() => ({
      keyManagement: {
        fetchTokens: (...args: unknown[]) => fetchAccountTokensMock(...args),
        createToken: vi.fn(),
        updateToken: vi.fn(),
        resolveTokenKey: vi.fn(),
        deleteToken: vi.fn(),
        fetchAvailableModels: vi.fn(),
      },
      tokenProvisioning: {
        isInventoryTokenUsable: (...args: unknown[]) =>
          isInventoryTokenUsableMock(...args),
        resolveDefaultTokenCreation: vi.fn(),
        classifyCreatedToken: vi.fn(),
        getRepairPolicy: vi.fn(() => ({
          kind: TOKEN_PROVISIONING_REPAIR_POLICY_KINDS.Eligible,
        })),
      },
    })),
  }
})

vi.mock("~/services/apiAdapters/registry", () => ({
  getSiteAdapter: getSiteAdapterMock,
}))

const buildToken = (overrides: Partial<ApiToken> = {}): ApiToken =>
  ({
    id: 1,
    user_id: 7,
    key: "sk-existing",
    status: 1,
    name: "existing",
    created_time: 1,
    accessed_time: 1,
    expired_time: -1,
    remain_quota: -1,
    unlimited_quota: true,
    used_quota: 0,
    ...overrides,
  }) as ApiToken

const buildDisplayAccount = (
  overrides: Partial<DisplaySiteData> = {},
): DisplaySiteData =>
  ({
    id: "account-id",
    name: "Account",
    username: "user",
    balance: { USD: 0, CNY: 0 },
    todayConsumption: { USD: 0, CNY: 0 },
    todayIncome: { USD: 0, CNY: 0 },
    todayTokens: { upload: 0, download: 0 },
    health: { status: "healthy" },
    siteType: SITE_TYPES.NEW_API,
    baseUrl: "https://api.example.invalid",
    token: "access-token",
    userId: "7",
    authType: AuthTypeEnum.AccessToken,
    checkIn: { enableDetection: false },
    cookieAuthSessionCookie: "",
    ...overrides,
  }) as DisplaySiteData

describe("defaultTokenLifecycle inventory helpers", () => {
  beforeEach(() => {
    fetchAccountTokensMock.mockReset()
    isInventoryTokenUsableMock.mockReset()
    getSiteAdapterMock.mockClear()
    isInventoryTokenUsableMock.mockReturnValue(true)
  })

  it("selects exactly one new token by id diff and ignores malformed entries", () => {
    const createdToken = buildToken({ id: 11, key: "sk-created-11" })

    expect(
      selectSingleNewApiTokenByIdDiff({
        existingTokenIds: [3, 8],
        tokens: [
          null,
          { id: "bad-token-id", key: "sk-invalid" },
          buildToken({ id: 3 }),
          createdToken,
        ],
      }),
    ).toEqual(createdToken)
  })

  it("returns null when the token id diff is empty or ambiguous", () => {
    expect(
      selectSingleNewApiTokenByIdDiff({
        existingTokenIds: [3, 8],
        tokens: [buildToken({ id: 3 }), buildToken({ id: 8 })],
      }),
    ).toBeNull()

    expect(
      selectSingleNewApiTokenByIdDiff({
        existingTokenIds: [3, 8],
        tokens: [buildToken({ id: 11 }), buildToken({ id: 12 })],
      }),
    ).toBeNull()
  })

  it("reports missing inventory with an empty id list", async () => {
    fetchAccountTokensMock.mockResolvedValueOnce([])

    await expect(
      inspectDefaultTokenInventory({
        workflow: TOKEN_PROVISIONING_WORKFLOWS.PostSaveAutomation,
        displaySiteData: buildDisplayAccount(),
      }),
    ).resolves.toEqual({
      kind: DEFAULT_TOKEN_INVENTORY_STATE_KINDS.Missing,
      existingTokenIds: [],
    })
  })

  it("reports the latest valid inventory token and policy usability", async () => {
    const firstToken = buildToken({ id: 3, key: "sk-old" })
    const latestToken = buildToken({ id: 8, key: "sk-latest" })
    fetchAccountTokensMock.mockResolvedValueOnce([
      firstToken,
      { id: "bad", key: "sk-invalid" },
      latestToken,
    ])
    isInventoryTokenUsableMock.mockReturnValueOnce(false)

    await expect(
      inspectDefaultTokenInventory({
        workflow: TOKEN_PROVISIONING_WORKFLOWS.PostSaveAutomation,
        displaySiteData: buildDisplayAccount({
          siteType: SITE_TYPES.AIHUBMIX,
          baseUrl: "https://aihubmix.example.invalid",
        }),
      }),
    ).resolves.toEqual({
      kind: DEFAULT_TOKEN_INVENTORY_STATE_KINDS.Present,
      token: latestToken,
      existingTokenIds: [3, 8],
      hasUsableSecret: false,
    })

    expect(isInventoryTokenUsableMock).toHaveBeenCalledWith({
      workflow: TOKEN_PROVISIONING_WORKFLOWS.PostSaveAutomation,
      token: latestToken,
    })
  })
})
```

- [ ] **Step 2: Run the new lifecycle test and verify it fails**

Run:

```powershell
pnpm vitest run tests/services/accounts/defaultTokenLifecycle.test.ts
```

Expected: FAIL because `src/services/accounts/defaultTokenLifecycle` does not exist.

- [ ] **Step 3: Add lifecycle contracts**

Create `src/services/accounts/defaultTokenLifecycle/contracts.ts`:

```ts
import {
  TOKEN_PROVISIONING_ERRORS,
  type TokenProvisioningBlockReason,
} from "~/services/apiAdapters/contracts/tokenProvisioning"
import type { ApiToken } from "~/types"

export const DEFAULT_TOKEN_INVENTORY_STATE_KINDS = {
  Missing: "missing",
  Present: "present",
} as const

export type DefaultTokenInventoryState =
  | {
      kind: typeof DEFAULT_TOKEN_INVENTORY_STATE_KINDS.Missing
      existingTokenIds: number[]
    }
  | {
      kind: typeof DEFAULT_TOKEN_INVENTORY_STATE_KINDS.Present
      token: ApiToken
      existingTokenIds: number[]
      hasUsableSecret: boolean
    }

export const DEFAULT_TOKEN_LIFECYCLE_RESULT_KINDS = {
  Ready: "ready",
  Created: "created",
  SelectionRequired: "selection_required",
  Blocked: "blocked",
} as const

export const DEFAULT_TOKEN_LIFECYCLE_BLOCK_REASONS = {
  MissingUserGroups: "missing_user_groups",
  CreateTokenFailed: TOKEN_PROVISIONING_ERRORS.CreateTokenFailed,
  TokenNotFound: TOKEN_PROVISIONING_ERRORS.TokenNotFound,
  AmbiguousCreatedToken: "ambiguous_created_token",
} as const

export type DefaultTokenLifecycleBlockReason =
  | TokenProvisioningBlockReason
  | (typeof DEFAULT_TOKEN_LIFECYCLE_BLOCK_REASONS)[keyof typeof DEFAULT_TOKEN_LIFECYCLE_BLOCK_REASONS]

export type DefaultTokenLifecycleResult =
  | {
      kind: typeof DEFAULT_TOKEN_LIFECYCLE_RESULT_KINDS.Ready
      token: ApiToken
      created: false
      existingTokenIds: number[]
    }
  | {
      kind: typeof DEFAULT_TOKEN_LIFECYCLE_RESULT_KINDS.Created
      token: ApiToken
      created: true
      oneTimeSecret: boolean
      existingTokenIds: number[]
    }
  | {
      kind: typeof DEFAULT_TOKEN_LIFECYCLE_RESULT_KINDS.SelectionRequired
      allowedGroups: string[]
      existingTokenIds: number[]
    }
  | {
      kind: typeof DEFAULT_TOKEN_LIFECYCLE_RESULT_KINDS.Blocked
      reason: DefaultTokenLifecycleBlockReason
      existingTokenIds: number[]
      cause?: unknown
    }

export const DEFAULT_TOKEN_LIFECYCLE_ERRORS = {
  QuickCreateSelectionIsDecisionOnly: "quick_create_selection_is_decision_only",
  PolicyBlocked: "default_token_lifecycle_policy_blocked",
} as const

export class DefaultTokenLifecyclePolicyBlockedError extends Error {
  readonly code = DEFAULT_TOKEN_LIFECYCLE_ERRORS.PolicyBlocked
  readonly reason: DefaultTokenLifecycleBlockReason

  constructor(params: {
    reason: DefaultTokenLifecycleBlockReason
    message: string
  }) {
    super(params.message)
    this.name = "DefaultTokenLifecyclePolicyBlockedError"
    this.reason = params.reason
  }
}
```

- [ ] **Step 4: Add default-token request helpers**

Create `src/services/accounts/defaultTokenLifecycle/requests.ts`:

```ts
import type { CreateTokenRequest } from "~/services/apiService/common/type"
import type { ApiServiceRequest } from "~/services/apiTransport/type"
import type { SiteAccount } from "~/types"

export const DEFAULT_AUTO_PROVISION_TOKEN_NAME = "user group (auto)"
export const DEFAULT_USER_GROUP_NAME = "default"

export function resolvePreferredDefaultUserGroup(
  allowedGroups: readonly string[],
): string {
  const normalizedGroups = allowedGroups
    .map((group) => group.trim())
    .filter(Boolean)

  if (normalizedGroups.includes(DEFAULT_USER_GROUP_NAME)) {
    return DEFAULT_USER_GROUP_NAME
  }

  return normalizedGroups[0] ?? DEFAULT_USER_GROUP_NAME
}

export function generateDefaultTokenRequest(): CreateTokenRequest {
  return {
    name: DEFAULT_AUTO_PROVISION_TOKEN_NAME,
    unlimited_quota: true,
    expired_time: -1,
    remain_quota: 0,
    allow_ips: "",
    model_limits_enabled: false,
    model_limits: "",
    group: "",
  }
}

export function createStoredAccountTokenRequest(
  account: SiteAccount,
): ApiServiceRequest {
  return {
    baseUrl: account.site_url,
    accountId: account.id,
    auth: {
      authType: account.authType,
      userId: account.account_info.id,
      accessToken: account.account_info.access_token,
      cookie: account.cookieAuth?.sessionCookie,
    },
  }
}
```

- [ ] **Step 5: Add inventory helpers**

Create `src/services/accounts/defaultTokenLifecycle/lifecycle.ts` with the inventory helpers:

```ts
import {
  createDisplayAccountApiContext,
  requireDisplayAccountKeyManagement,
  requireDisplayAccountTokenProvisioning,
} from "~/services/accounts/utils/apiServiceRequest"
import type { TokenProvisioningWorkflow } from "~/services/apiAdapters/contracts/tokenProvisioning"
import type { ApiToken, DisplaySiteData } from "~/types"

import {
  DEFAULT_TOKEN_INVENTORY_STATE_KINDS,
  type DefaultTokenInventoryState,
} from "./contracts"

const isApiTokenWithValidId = (value: unknown): value is ApiToken =>
  !!value &&
  typeof value === "object" &&
  typeof (value as Partial<ApiToken>).id === "number"

const sanitizeApiTokens = (tokens: unknown): ApiToken[] =>
  Array.isArray(tokens) ? tokens.filter(isApiTokenWithValidId) : []

const getTokenIds = (tokens: ApiToken[]): number[] =>
  tokens.map((token) => token.id)

export function selectSingleNewApiTokenByIdDiff(params: {
  existingTokenIds: number[]
  tokens: unknown[]
}): ApiToken | null {
  const existingTokenIdSet = new Set(params.existingTokenIds)
  const newTokens = sanitizeApiTokens(params.tokens).filter(
    (token) => !existingTokenIdSet.has(token.id),
  )

  return newTokens.length === 1 ? newTokens[0] : null
}

export async function inspectDefaultTokenInventory(params: {
  workflow: TokenProvisioningWorkflow
  displaySiteData: DisplaySiteData
}): Promise<DefaultTokenInventoryState> {
  const { workflow, displaySiteData } = params
  const context = createDisplayAccountApiContext(displaySiteData)
  const keyManagement = requireDisplayAccountKeyManagement(
    displaySiteData,
    context.keyManagement,
  )
  const tokenProvisioning = requireDisplayAccountTokenProvisioning(
    displaySiteData,
    context.tokenProvisioning,
  )
  const existingTokens = sanitizeApiTokens(
    await keyManagement.fetchTokens(context.request),
  )
  const existingTokenIds = getTokenIds(existingTokens)
  const existingToken = existingTokens.at(-1)

  if (!existingToken) {
    return {
      kind: DEFAULT_TOKEN_INVENTORY_STATE_KINDS.Missing,
      existingTokenIds,
    }
  }

  return {
    kind: DEFAULT_TOKEN_INVENTORY_STATE_KINDS.Present,
    token: existingToken,
    existingTokenIds,
    hasUsableSecret: tokenProvisioning.isInventoryTokenUsable({
      workflow,
      token: existingToken,
    }),
  }
}
```

Create `src/services/accounts/defaultTokenLifecycle/index.ts`:

```ts
export * from "./contracts"
export * from "./requests"
export * from "./lifecycle"
```

- [ ] **Step 6: Re-export request helpers from the legacy file**

In `src/services/accounts/accountKeyAutoProvisioning/ensureDefaultToken.ts`, replace local definitions of:

```ts
DEFAULT_AUTO_PROVISION_TOKEN_NAME
DEFAULT_USER_GROUP_NAME
resolvePreferredDefaultUserGroup
generateDefaultTokenRequest
```

with this import/export block:

```ts
export {
  DEFAULT_AUTO_PROVISION_TOKEN_NAME,
  DEFAULT_USER_GROUP_NAME,
  generateDefaultTokenRequest,
  resolvePreferredDefaultUserGroup,
} from "~/services/accounts/defaultTokenLifecycle"
import { generateDefaultTokenRequest } from "~/services/accounts/defaultTokenLifecycle"
```

Keep the existing `ensureDefaultApiTokenForAccount(...)` implementation unchanged in this task.

- [ ] **Step 7: Run the lifecycle test and verify it passes**

Run:

```powershell
pnpm vitest run tests/services/accounts/defaultTokenLifecycle.test.ts
```

Expected: PASS.

- [ ] **Step 8: Run default-token request compatibility tests**

Run:

```powershell
pnpm vitest run tests/services/accounts/accountDefaults.test.ts tests/services/accountOperations.ensureAccountApiToken.test.ts
```

Expected: PASS. This proves moving `generateDefaultTokenRequest()` did not change the default payload or current background/shared behavior.

- [ ] **Step 9: Commit the lifecycle foundation**

Run:

```powershell
git add src/services/accounts/defaultTokenLifecycle/contracts.ts src/services/accounts/defaultTokenLifecycle/requests.ts src/services/accounts/defaultTokenLifecycle/lifecycle.ts src/services/accounts/defaultTokenLifecycle/index.ts src/services/accounts/accountKeyAutoProvisioning/ensureDefaultToken.ts tests/services/accounts/defaultTokenLifecycle.test.ts
git commit -m "refactor(accounts): add default token lifecycle foundation"
```

---

### Task 2: Add Decision And Create-Recovery Lifecycle Helpers

**Files:**
- Modify: `src/services/accounts/defaultTokenLifecycle/lifecycle.ts`
- Modify: `tests/services/accounts/defaultTokenLifecycle.test.ts`

- [ ] **Step 1: Add failing tests for decision second-pass and create recovery**

In `tests/services/accounts/defaultTokenLifecycle.test.ts`, extend the existing
top-level imports to include these symbols:

```ts
import {
  CREATED_TOKEN_SECRET_DECISION_KINDS,
  DEFAULT_TOKEN_CREATION_DECISION_KINDS,
  TOKEN_CREATION_SECRET_RECOVERY,
  TOKEN_PROVISIONING_BLOCK_REASONS,
  type DefaultTokenCreationDecision,
} from "~/services/apiAdapters/contracts/tokenProvisioning"
import type { KeyManagementCapability } from "~/services/apiAdapters/contracts/keyManagement"
import type { TokenProvisioningCapability } from "~/services/apiAdapters/contracts/tokenProvisioning"
import type { ApiServiceRequest } from "~/services/apiTransport/type"
import {
  DEFAULT_TOKEN_LIFECYCLE_BLOCK_REASONS,
  DEFAULT_TOKEN_LIFECYCLE_RESULT_KINDS,
  createDefaultTokenFromDecision,
  generateDefaultTokenRequest,
  resolveDefaultTokenLifecycleDecision,
} from "~/services/accounts/defaultTokenLifecycle"
```

Then add these helpers below `buildDisplayAccount(...)`:

```ts
const buildRequest = (): ApiServiceRequest => ({
  baseUrl: "https://api.example.invalid",
  accountId: "account-id",
  auth: {
    authType: AuthTypeEnum.AccessToken,
    userId: "7",
    accessToken: "access-token",
    cookie: "",
  },
})

const createDecision = (
  tokenData = generateDefaultTokenRequest(),
): Extract<
  DefaultTokenCreationDecision,
  { kind: typeof DEFAULT_TOKEN_CREATION_DECISION_KINDS.Create }
> => ({
  kind: DEFAULT_TOKEN_CREATION_DECISION_KINDS.Create,
  tokenData,
  oneTimeSecret: false,
  recoverCreatedToken: TOKEN_CREATION_SECRET_RECOVERY.InventoryRefetch,
})
```

Then append this `describe` block:

```ts
describe("defaultTokenLifecycle decision and create helpers", () => {
  beforeEach(() => {
    fetchAccountTokensMock.mockReset()
    isInventoryTokenUsableMock.mockReset()
    getSiteAdapterMock.mockClear()
  })

  it("fetches user groups only after policy asks for them", async () => {
    const resolveDefaultTokenCreationMock = vi
      .fn()
      .mockReturnValueOnce({
        kind: DEFAULT_TOKEN_CREATION_DECISION_KINDS.NeedsUserGroups,
      })
      .mockReturnValueOnce({
        kind: DEFAULT_TOKEN_CREATION_DECISION_KINDS.SelectionRequired,
        allowedGroups: ["default", "vip"],
        reason: TOKEN_PROVISIONING_BLOCK_REASONS.GroupSelectionRequired,
      })
    const fetchUserGroupsMock = vi.fn().mockResolvedValueOnce({
      default: { desc: "Default", ratio: 1 },
      vip: { desc: "VIP", ratio: 2 },
    })

    getSiteAdapterMock.mockReturnValueOnce({
      keyManagement: {
        fetchTokens: vi.fn(),
        createToken: vi.fn(),
        updateToken: vi.fn(),
        resolveTokenKey: vi.fn(),
        deleteToken: vi.fn(),
        fetchAvailableModels: vi.fn(),
        userGroups: { fetch: fetchUserGroupsMock },
      },
      tokenProvisioning: {
        isInventoryTokenUsable: vi.fn(),
        resolveDefaultTokenCreation: resolveDefaultTokenCreationMock,
        classifyCreatedToken: vi.fn(),
        getRepairPolicy: vi.fn(),
      },
    })

    await expect(
      resolveDefaultTokenLifecycleDecision({
        workflow: TOKEN_PROVISIONING_WORKFLOWS.QuickCreateSelection,
        displaySiteData: buildDisplayAccount(),
      }),
    ).resolves.toEqual({
      kind: DEFAULT_TOKEN_CREATION_DECISION_KINDS.SelectionRequired,
      allowedGroups: ["default", "vip"],
      reason: TOKEN_PROVISIONING_BLOCK_REASONS.GroupSelectionRequired,
    })

    expect(fetchUserGroupsMock).toHaveBeenCalledTimes(1)
    expect(resolveDefaultTokenCreationMock).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        userGroups: {
          default: { desc: "Default", ratio: 1 },
          vip: { desc: "VIP", ratio: 2 },
        },
      }),
    )
  })

  it("throws the provided missing-user-groups message when group lookup is unavailable", async () => {
    getSiteAdapterMock.mockReturnValueOnce({
      keyManagement: {
        fetchTokens: vi.fn(),
        createToken: vi.fn(),
        updateToken: vi.fn(),
        resolveTokenKey: vi.fn(),
        deleteToken: vi.fn(),
        fetchAvailableModels: vi.fn(),
      },
      tokenProvisioning: {
        isInventoryTokenUsable: vi.fn(),
        resolveDefaultTokenCreation: vi.fn(() => ({
          kind: DEFAULT_TOKEN_CREATION_DECISION_KINDS.NeedsUserGroups,
        })),
        classifyCreatedToken: vi.fn(),
        getRepairPolicy: vi.fn(),
      },
    })

    await expect(
      resolveDefaultTokenLifecycleDecision({
        workflow: TOKEN_PROVISIONING_WORKFLOWS.QuickCreateSelection,
        displaySiteData: buildDisplayAccount(),
        missingUserGroupsMessage: "missing_groups",
      }),
    ).rejects.toThrow("missing_groups")
  })

  it("returns a usable created token without refetch", async () => {
    const createdToken = buildToken({ id: 22, key: "sk-created" })
    const keyManagement = {
      createToken: vi.fn().mockResolvedValueOnce(createdToken),
      fetchTokens: vi.fn(),
    } as unknown as KeyManagementCapability
    const tokenProvisioning = {
      classifyCreatedToken: vi.fn(() => ({
        kind: CREATED_TOKEN_SECRET_DECISION_KINDS.Usable,
        token: createdToken,
        oneTimeSecret: true,
      })),
    } as unknown as TokenProvisioningCapability

    await expect(
      createDefaultTokenFromDecision({
        workflow: TOKEN_PROVISIONING_WORKFLOWS.PostSaveAutomation,
        keyManagement,
        tokenProvisioning,
        createRequest: buildRequest(),
        inventoryRequest: buildRequest(),
        decision: createDecision(),
        existingTokenIds: [],
      }),
    ).resolves.toEqual({
      kind: DEFAULT_TOKEN_LIFECYCLE_RESULT_KINDS.Created,
      token: createdToken,
      created: true,
      oneTimeSecret: true,
    })

    expect(keyManagement.fetchTokens).not.toHaveBeenCalled()
  })

  it("refetches inventory and selects one new token when policy asks for inventory recovery", async () => {
    const createdToken = buildToken({ id: 22, key: "sk-created" })
    const keyManagement = {
      createToken: vi.fn().mockResolvedValueOnce(true),
      fetchTokens: vi.fn().mockResolvedValueOnce([
        buildToken({ id: 3, key: "sk-existing" }),
        createdToken,
      ]),
    } as unknown as KeyManagementCapability
    const tokenProvisioning = {
      classifyCreatedToken: vi.fn(() => ({
        kind: CREATED_TOKEN_SECRET_DECISION_KINDS.NeedsInventoryRefetch,
      })),
    } as unknown as TokenProvisioningCapability

    await expect(
      createDefaultTokenFromDecision({
        workflow: TOKEN_PROVISIONING_WORKFLOWS.SharedEnsure,
        keyManagement,
        tokenProvisioning,
        createRequest: buildRequest(),
        inventoryRequest: buildRequest(),
        decision: createDecision(),
        existingTokenIds: [3],
      }),
    ).resolves.toEqual({
      kind: DEFAULT_TOKEN_LIFECYCLE_RESULT_KINDS.Created,
      token: createdToken,
      created: true,
      oneTimeSecret: false,
    })
  })

  it("blocks ambiguous inventory refetch recovery", async () => {
    const keyManagement = {
      createToken: vi.fn().mockResolvedValueOnce(true),
      fetchTokens: vi.fn().mockResolvedValueOnce([
        buildToken({ id: 22, key: "sk-created-a" }),
        buildToken({ id: 23, key: "sk-created-b" }),
      ]),
    } as unknown as KeyManagementCapability
    const tokenProvisioning = {
      classifyCreatedToken: vi.fn(() => ({
        kind: CREATED_TOKEN_SECRET_DECISION_KINDS.NeedsInventoryRefetch,
      })),
    } as unknown as TokenProvisioningCapability

    await expect(
      createDefaultTokenFromDecision({
        workflow: TOKEN_PROVISIONING_WORKFLOWS.SharedEnsure,
        keyManagement,
        tokenProvisioning,
        createRequest: buildRequest(),
        inventoryRequest: buildRequest(),
        decision: createDecision(),
        existingTokenIds: [],
      }),
    ).resolves.toEqual({
      kind: DEFAULT_TOKEN_LIFECYCLE_RESULT_KINDS.Blocked,
      reason: DEFAULT_TOKEN_LIFECYCLE_BLOCK_REASONS.AmbiguousCreatedToken,
      existingTokenIds: [],
    })
  })
})
```

- [ ] **Step 2: Run the lifecycle test and verify it fails**

Run:

```powershell
pnpm vitest run tests/services/accounts/defaultTokenLifecycle.test.ts
```

Expected: FAIL because `resolveDefaultTokenLifecycleDecision(...)` and `createDefaultTokenFromDecision(...)` are not implemented.

- [ ] **Step 3: Move second-pass user-group decision handling into lifecycle**

In `src/services/accounts/defaultTokenLifecycle/lifecycle.ts`, add these imports:

```ts
import type { KeyManagementCapability } from "~/services/apiAdapters/contracts/keyManagement"
import {
  CREATED_TOKEN_SECRET_DECISION_KINDS,
  DEFAULT_TOKEN_CREATION_DECISION_KINDS,
  type DefaultTokenCreationDecision,
  type ResolveDefaultTokenCreationRequest,
  type TokenProvisioningCapability,
} from "~/services/apiAdapters/contracts/tokenProvisioning"
import type { ApiServiceRequest } from "~/services/apiTransport/type"
import {
  DEFAULT_TOKEN_LIFECYCLE_BLOCK_REASONS,
  DEFAULT_TOKEN_LIFECYCLE_RESULT_KINDS,
  type DefaultTokenLifecycleBlockReason,
} from "./contracts"
import { generateDefaultTokenRequest } from "./requests"
```

Add this helper:

```ts
async function resolveDefaultTokenCreationWithUserGroups(params: {
  keyManagement: KeyManagementCapability
  tokenProvisioning: TokenProvisioningCapability
  request: ApiServiceRequest
  decisionRequest: ResolveDefaultTokenCreationRequest
  missingUserGroupsMessage?: string
}): Promise<DefaultTokenCreationDecision> {
  const decision = params.tokenProvisioning.resolveDefaultTokenCreation(
    params.decisionRequest,
  )

  if (decision.kind !== DEFAULT_TOKEN_CREATION_DECISION_KINDS.NeedsUserGroups) {
    return decision
  }

  if (!params.keyManagement.userGroups) {
    throw new Error(
      params.missingUserGroupsMessage ??
        DEFAULT_TOKEN_LIFECYCLE_BLOCK_REASONS.MissingUserGroups,
    )
  }

  const userGroups = await params.keyManagement.userGroups.fetch(params.request)

  return params.tokenProvisioning.resolveDefaultTokenCreation({
    ...params.decisionRequest,
    userGroups,
  })
}

export async function resolveDefaultTokenLifecycleDecision(params: {
  workflow: TokenProvisioningWorkflow
  displaySiteData: DisplaySiteData
  defaultTokenData?: ResolveDefaultTokenCreationRequest["defaultTokenData"]
  explicitGroup?: string
  missingUserGroupsMessage?: string
}): Promise<DefaultTokenCreationDecision> {
  const context = createDisplayAccountApiContext(params.displaySiteData)
  const keyManagement = requireDisplayAccountKeyManagement(
    params.displaySiteData,
    context.keyManagement,
  )
  const tokenProvisioning = requireDisplayAccountTokenProvisioning(
    params.displaySiteData,
    context.tokenProvisioning,
  )

  return resolveDefaultTokenCreationWithUserGroups({
    keyManagement,
    tokenProvisioning,
    request: context.request,
    decisionRequest: {
      workflow: params.workflow,
      defaultTokenData:
        params.defaultTokenData ?? generateDefaultTokenRequest(),
      explicitGroup: params.explicitGroup,
    },
    missingUserGroupsMessage: params.missingUserGroupsMessage,
  })
}
```

- [ ] **Step 4: Add create/classify/refetch recovery helper**

In the same file, add:

```ts
const blockCreatedToken = (params: {
  reason: DefaultTokenLifecycleBlockReason
  existingTokenIds: number[]
  cause?: unknown
}) => {
  const result = {
    kind: DEFAULT_TOKEN_LIFECYCLE_RESULT_KINDS.Blocked,
    reason: params.reason,
    existingTokenIds: params.existingTokenIds,
  }

  return params.cause === undefined ? result : { ...result, cause: params.cause }
}

export async function createDefaultTokenFromDecision(params: {
  workflow: TokenProvisioningWorkflow
  keyManagement: KeyManagementCapability
  tokenProvisioning: TokenProvisioningCapability
  createRequest: ApiServiceRequest
  inventoryRequest: ApiServiceRequest
  decision: Extract<
    DefaultTokenCreationDecision,
    { kind: typeof DEFAULT_TOKEN_CREATION_DECISION_KINDS.Create }
  >
  existingTokenIds: number[]
}) {
  const {
    workflow,
    keyManagement,
    tokenProvisioning,
    createRequest,
    inventoryRequest,
    decision,
    existingTokenIds,
  } = params

  let createResult: Awaited<ReturnType<KeyManagementCapability["createToken"]>>
  try {
    createResult = await keyManagement.createToken(
      createRequest,
      decision.tokenData,
    )
  } catch (error) {
    return blockCreatedToken({
      reason: DEFAULT_TOKEN_LIFECYCLE_BLOCK_REASONS.CreateTokenFailed,
      existingTokenIds,
      cause: error,
    })
  }

  const createdTokenDecision = tokenProvisioning.classifyCreatedToken({
    workflow,
    result: createResult,
  })

  if (createdTokenDecision.kind === CREATED_TOKEN_SECRET_DECISION_KINDS.Usable) {
    return {
      kind: DEFAULT_TOKEN_LIFECYCLE_RESULT_KINDS.Created,
      token: createdTokenDecision.token,
      created: true,
      oneTimeSecret: createdTokenDecision.oneTimeSecret,
    }
  }

  if (createdTokenDecision.kind === CREATED_TOKEN_SECRET_DECISION_KINDS.Failed) {
    return blockCreatedToken({
      reason: DEFAULT_TOKEN_LIFECYCLE_BLOCK_REASONS.CreateTokenFailed,
      existingTokenIds,
    })
  }

  if (
    createdTokenDecision.kind === CREATED_TOKEN_SECRET_DECISION_KINDS.Unavailable
  ) {
    return blockCreatedToken({
      reason: createdTokenDecision.reason,
      existingTokenIds,
    })
  }

  const updatedTokens = sanitizeApiTokens(
    await keyManagement.fetchTokens(inventoryRequest),
  )
  const recoveredToken = selectSingleNewApiTokenByIdDiff({
    existingTokenIds,
    tokens: updatedTokens,
  })

  if (!recoveredToken) {
    const hasAnyNewToken = updatedTokens.some(
      (token) => !existingTokenIds.includes(token.id),
    )

    return blockCreatedToken({
      reason: hasAnyNewToken
        ? DEFAULT_TOKEN_LIFECYCLE_BLOCK_REASONS.AmbiguousCreatedToken
        : DEFAULT_TOKEN_LIFECYCLE_BLOCK_REASONS.TokenNotFound,
      existingTokenIds,
    })
  }

  return {
    kind: DEFAULT_TOKEN_LIFECYCLE_RESULT_KINDS.Created,
    token: recoveredToken,
    created: true,
    oneTimeSecret: decision.oneTimeSecret,
  }
}
```

- [ ] **Step 5: Keep the old utility unchanged until callers migrate**

Do not edit `src/services/accounts/utils/tokenProvisioning.ts` in this task.
It still supports existing callers until Tasks 4 and 5 route those callers
through `defaultTokenLifecycle`.

The cleanup task removes or leaves this helper based on actual production
references after migration. New implementation code must not import it.

- [ ] **Step 6: Run lifecycle tests and focused existing tests**

Run:

```powershell
pnpm vitest run tests/services/accounts/defaultTokenLifecycle.test.ts tests/services/accountOperations.ensureAccountApiToken.test.ts tests/services/accountPostSaveWorkflow.ensureAccountToken.test.ts
```

Expected: PASS for lifecycle tests. Existing workflow tests may still pass or may fail only because imports now prefer lifecycle helpers; do not route workflows in this task unless needed for compile.

- [ ] **Step 7: Commit decision and create helpers**

Run:

```powershell
git add src/services/accounts/defaultTokenLifecycle/lifecycle.ts tests/services/accounts/defaultTokenLifecycle.test.ts
git commit -m "refactor(accounts): centralize default token create recovery"
```

---

### Task 3: Add High-Level Ensure Lifecycle

**Files:**
- Modify: `src/services/accounts/defaultTokenLifecycle/lifecycle.ts`
- Modify: `tests/services/accounts/defaultTokenLifecycle.test.ts`

- [ ] **Step 1: Add failing high-level ensure tests**

In `tests/services/accounts/defaultTokenLifecycle.test.ts`, extend the existing
top-level imports to include these symbols:

```ts
import {
  createStoredAccountTokenRequest,
  ensureDefaultTokenLifecycle,
} from "~/services/accounts/defaultTokenLifecycle"
import { buildSiteAccount } from "~~/tests/test-utils/factories"
```

Append this helper:

```ts
const buildStoredAccount = (displayAccount = buildDisplayAccount()) =>
  buildSiteAccount({
    id: displayAccount.id,
    site_name: displayAccount.name,
    site_url: displayAccount.baseUrl,
    site_type: displayAccount.siteType,
    authType: displayAccount.authType,
    account_info: {
      id: displayAccount.userId,
      access_token: displayAccount.token,
      username: displayAccount.username,
      quota: 0,
      today_prompt_tokens: 0,
      today_completion_tokens: 0,
      today_quota_consumption: 0,
      today_requests_count: 0,
      today_income: 0,
    },
  })
```

Append this `describe` block:

```ts
describe("ensureDefaultTokenLifecycle", () => {
  beforeEach(() => {
    fetchAccountTokensMock.mockReset()
    isInventoryTokenUsableMock.mockReset()
    getSiteAdapterMock.mockClear()
    isInventoryTokenUsableMock.mockReturnValue(true)
  })

  it("returns Ready for an existing usable inventory token", async () => {
    const existingToken = buildToken({ id: 5, key: "sk-ready" })
    fetchAccountTokensMock.mockResolvedValueOnce([existingToken])

    await expect(
      ensureDefaultTokenLifecycle({
        workflow: TOKEN_PROVISIONING_WORKFLOWS.SharedEnsure,
        account: buildStoredAccount(),
        displaySiteData: buildDisplayAccount(),
      }),
    ).resolves.toEqual({
      kind: DEFAULT_TOKEN_LIFECYCLE_RESULT_KINDS.Ready,
      token: existingToken,
      created: false,
      existingTokenIds: [5],
    })
  })

  it("continues to policy creation when the existing inventory token is unusable", async () => {
    const displayAccount = buildDisplayAccount({
      siteType: SITE_TYPES.AIHUBMIX,
      baseUrl: "https://aihubmix.example.invalid",
    })
    const createdToken = buildToken({ id: 9, key: "sk-aihubmix-full-secret" })
    const createTokenMock = vi.fn().mockResolvedValueOnce(createdToken)
    const resolveDefaultTokenCreationMock = vi.fn(() => ({
      kind: DEFAULT_TOKEN_CREATION_DECISION_KINDS.Create,
      tokenData: generateDefaultTokenRequest(),
      oneTimeSecret: true,
      recoverCreatedToken: TOKEN_CREATION_SECRET_RECOVERY.CreatedResponseFirst,
    }))

    fetchAccountTokensMock.mockResolvedValueOnce([
      buildToken({ id: 8, key: "sk-***masked***" }),
    ])
    isInventoryTokenUsableMock.mockReturnValueOnce(false)
    getSiteAdapterMock.mockReturnValueOnce({
      keyManagement: {
        fetchTokens: (...args: unknown[]) => fetchAccountTokensMock(...args),
        createToken: createTokenMock,
        updateToken: vi.fn(),
        resolveTokenKey: vi.fn(),
        deleteToken: vi.fn(),
        fetchAvailableModels: vi.fn(),
      },
      tokenProvisioning: {
        isInventoryTokenUsable: (...args: unknown[]) =>
          isInventoryTokenUsableMock(...args),
        resolveDefaultTokenCreation: resolveDefaultTokenCreationMock,
        classifyCreatedToken: vi.fn(() => ({
          kind: CREATED_TOKEN_SECRET_DECISION_KINDS.Usable,
          token: createdToken,
          oneTimeSecret: true,
        })),
        getRepairPolicy: vi.fn(),
      },
    })

    await expect(
      ensureDefaultTokenLifecycle({
        workflow: TOKEN_PROVISIONING_WORKFLOWS.PostSaveAutomation,
        account: buildStoredAccount(displayAccount),
        displaySiteData: displayAccount,
      }),
    ).resolves.toEqual({
      kind: DEFAULT_TOKEN_LIFECYCLE_RESULT_KINDS.Created,
      token: createdToken,
      created: true,
      oneTimeSecret: true,
      existingTokenIds: [8],
    })

    expect(resolveDefaultTokenCreationMock).toHaveBeenCalledTimes(1)
    expect(createTokenMock).toHaveBeenCalledWith(
      createStoredAccountTokenRequest(buildStoredAccount(displayAccount)),
      generateDefaultTokenRequest(),
    )
  })

  it("returns SelectionRequired with existing token ids", async () => {
    const resolveDefaultTokenCreationMock = vi
      .fn()
      .mockReturnValueOnce({
        kind: DEFAULT_TOKEN_CREATION_DECISION_KINDS.NeedsUserGroups,
      })
      .mockReturnValueOnce({
        kind: DEFAULT_TOKEN_CREATION_DECISION_KINDS.SelectionRequired,
        allowedGroups: ["default", "vip"],
        reason: TOKEN_PROVISIONING_BLOCK_REASONS.GroupSelectionRequired,
      })
    const fetchUserGroupsMock = vi.fn().mockResolvedValueOnce({
      default: { desc: "Default", ratio: 1 },
      vip: { desc: "VIP", ratio: 2 },
    })

    getSiteAdapterMock.mockReturnValueOnce({
      keyManagement: {
        fetchTokens: (...args: unknown[]) => fetchAccountTokensMock(...args),
        createToken: vi.fn(),
        updateToken: vi.fn(),
        resolveTokenKey: vi.fn(),
        deleteToken: vi.fn(),
        fetchAvailableModels: vi.fn(),
        userGroups: { fetch: fetchUserGroupsMock },
      },
      tokenProvisioning: {
        isInventoryTokenUsable: vi.fn(),
        resolveDefaultTokenCreation: resolveDefaultTokenCreationMock,
        classifyCreatedToken: vi.fn(),
        getRepairPolicy: vi.fn(),
      },
    })
    fetchAccountTokensMock.mockResolvedValueOnce([])

    await expect(
      ensureDefaultTokenLifecycle({
        workflow: TOKEN_PROVISIONING_WORKFLOWS.PostSaveAutomation,
        account: buildStoredAccount(),
        displaySiteData: buildDisplayAccount(),
      }),
    ).resolves.toEqual({
      kind: DEFAULT_TOKEN_LIFECYCLE_RESULT_KINDS.SelectionRequired,
      allowedGroups: ["default", "vip"],
      existingTokenIds: [],
    })
  })

  it("returns a lifecycle block when user groups are unavailable", async () => {
    getSiteAdapterMock.mockReturnValueOnce({
      keyManagement: {
        fetchTokens: (...args: unknown[]) => fetchAccountTokensMock(...args),
        createToken: vi.fn(),
        updateToken: vi.fn(),
        resolveTokenKey: vi.fn(),
        deleteToken: vi.fn(),
        fetchAvailableModels: vi.fn(),
      },
      tokenProvisioning: {
        isInventoryTokenUsable: vi.fn(),
        resolveDefaultTokenCreation: vi.fn(() => ({
          kind: DEFAULT_TOKEN_CREATION_DECISION_KINDS.NeedsUserGroups,
        })),
        classifyCreatedToken: vi.fn(),
        getRepairPolicy: vi.fn(),
      },
    })
    fetchAccountTokensMock.mockResolvedValueOnce([])

    await expect(
      ensureDefaultTokenLifecycle({
        workflow: TOKEN_PROVISIONING_WORKFLOWS.PostSaveAutomation,
        account: buildStoredAccount(),
        displaySiteData: buildDisplayAccount(),
      }),
    ).resolves.toEqual({
      kind: DEFAULT_TOKEN_LIFECYCLE_RESULT_KINDS.Blocked,
      reason: DEFAULT_TOKEN_LIFECYCLE_BLOCK_REASONS.MissingUserGroups,
      existingTokenIds: [],
    })
  })
})
```

- [ ] **Step 2: Run lifecycle tests and verify they fail**

Run:

```powershell
pnpm vitest run tests/services/accounts/defaultTokenLifecycle.test.ts
```

Expected: FAIL because `ensureDefaultTokenLifecycle(...)` is not implemented.

- [ ] **Step 3: Implement high-level ensure**

In `src/services/accounts/defaultTokenLifecycle/lifecycle.ts`, import:

```ts
import {
  createStoredAccountTokenRequest,
  generateDefaultTokenRequest,
} from "./requests"
import type { SiteAccount } from "~/types"
```

Also extend the existing `./contracts` import with:

```ts
import {
  DEFAULT_TOKEN_LIFECYCLE_ERRORS,
  DEFAULT_TOKEN_LIFECYCLE_BLOCK_REASONS,
  DEFAULT_TOKEN_LIFECYCLE_RESULT_KINDS,
  type DefaultTokenLifecycleBlockReason,
} from "./contracts"
```

Add:

```ts
export async function ensureDefaultTokenLifecycle(params: {
  workflow: TokenProvisioningWorkflow
  account: SiteAccount
  displaySiteData: DisplaySiteData
  defaultTokenData?: ResolveDefaultTokenCreationRequest["defaultTokenData"]
  explicitGroup?: string
  inspectInventory?: boolean
}) {
  const { workflow, account, displaySiteData } = params

  if (workflow === TOKEN_PROVISIONING_WORKFLOWS.QuickCreateSelection) {
    throw new Error(
      DEFAULT_TOKEN_LIFECYCLE_ERRORS.QuickCreateSelectionIsDecisionOnly,
    )
  }

  let existingTokenIds: number[] = []

  if (params.inspectInventory !== false) {
    const inventoryState = await inspectDefaultTokenInventory({
      workflow,
      displaySiteData,
    })
    existingTokenIds = inventoryState.existingTokenIds

    if (
      inventoryState.kind === DEFAULT_TOKEN_INVENTORY_STATE_KINDS.Present &&
      inventoryState.hasUsableSecret
    ) {
      return {
        kind: DEFAULT_TOKEN_LIFECYCLE_RESULT_KINDS.Ready,
        token: inventoryState.token,
        created: false,
        existingTokenIds,
      }
    }
  }

  const context = createDisplayAccountApiContext(displaySiteData)
  const keyManagement = requireDisplayAccountKeyManagement(
    displaySiteData,
    context.keyManagement,
  )
  const tokenProvisioning = requireDisplayAccountTokenProvisioning(
    displaySiteData,
    context.tokenProvisioning,
  )

  let decision: DefaultTokenCreationDecision
  try {
    decision = await resolveDefaultTokenCreationWithUserGroups({
      keyManagement,
      tokenProvisioning,
      request: context.request,
      decisionRequest: {
        workflow,
        defaultTokenData:
          params.defaultTokenData ?? generateDefaultTokenRequest(),
        explicitGroup: params.explicitGroup,
      },
    })
  } catch (error) {
    return {
      kind: DEFAULT_TOKEN_LIFECYCLE_RESULT_KINDS.Blocked,
      reason: DEFAULT_TOKEN_LIFECYCLE_BLOCK_REASONS.MissingUserGroups,
      existingTokenIds,
      cause: error,
    }
  }

  if (decision.kind === DEFAULT_TOKEN_CREATION_DECISION_KINDS.SelectionRequired) {
    return {
      kind: DEFAULT_TOKEN_LIFECYCLE_RESULT_KINDS.SelectionRequired,
      allowedGroups: decision.allowedGroups,
      existingTokenIds,
    }
  }

  if (decision.kind === DEFAULT_TOKEN_CREATION_DECISION_KINDS.Blocked) {
    return {
      kind: DEFAULT_TOKEN_LIFECYCLE_RESULT_KINDS.Blocked,
      reason: decision.reason,
      existingTokenIds,
    }
  }

  if (decision.kind === DEFAULT_TOKEN_CREATION_DECISION_KINDS.NeedsUserGroups) {
    return {
      kind: DEFAULT_TOKEN_LIFECYCLE_RESULT_KINDS.Blocked,
      reason: DEFAULT_TOKEN_LIFECYCLE_BLOCK_REASONS.MissingUserGroups,
      existingTokenIds,
    }
  }

  const createResult = await createDefaultTokenFromDecision({
    workflow,
    keyManagement,
    tokenProvisioning,
    createRequest: createStoredAccountTokenRequest(account),
    inventoryRequest: context.request,
    decision,
    existingTokenIds,
  })

  return {
    ...createResult,
    existingTokenIds,
  }
}
```

- [ ] **Step 4: Run lifecycle tests and fix type issues**

Run:

```powershell
pnpm vitest run tests/services/accounts/defaultTokenLifecycle.test.ts
pnpm compile
```

Expected: PASS. Fix any duplicate import, unreachable branch, or return-union
compile error in the lifecycle Module before continuing.

- [ ] **Step 5: Commit high-level lifecycle ensure**

Run:

```powershell
git add src/services/accounts/defaultTokenLifecycle/lifecycle.ts tests/services/accounts/defaultTokenLifecycle.test.ts
git commit -m "refactor(accounts): add default token lifecycle ensure"
```

---

### Task 4: Route Quick-Create, Background, And Shared Ensure Through Lifecycle

**Files:**
- Modify: `src/services/accounts/accountOperations.ts`
- Modify: `src/services/accounts/accountKeyAutoProvisioning/ensureDefaultToken.ts`
- Modify: `tests/services/accountOperations.ensureAccountApiToken.test.ts`

- [ ] **Step 1: Run account operations tests as a routing baseline**

Run:

```powershell
pnpm vitest run tests/services/accountOperations.ensureAccountApiToken.test.ts
```

Expected: PASS. These tests are the behavior baseline for quick-create,
background ensure, shared ensure, Sub2API group selection, AIHubMix blocks, and
default token payload preservation before routing through lifecycle.

- [ ] **Step 2: Route quick-create decision through lifecycle**

In `src/services/accounts/accountOperations.ts`, replace:

```ts
import { resolveDefaultTokenCreationWithUserGroups } from "~/services/accounts/utils/tokenProvisioning"
```

with:

```ts
import {
  ensureDefaultTokenLifecycle,
  generateDefaultTokenRequest,
  resolveDefaultTokenLifecycleDecision,
} from "~/services/accounts/defaultTokenLifecycle"
```

Remove the old `generateDefaultTokenRequest` import from `ensureDefaultToken` if it becomes duplicate.

In `resolveDefaultTokenQuickCreateResolution(...)`, replace the direct context/keyManagement/tokenProvisioning block with:

```ts
const decision = await resolveDefaultTokenLifecycleDecision({
  workflow: TOKEN_PROVISIONING_WORKFLOWS.QuickCreateSelection,
  displaySiteData: account,
  defaultTokenData: generateDefaultTokenRequest(),
  explicitGroup: options.explicitGroup,
  missingUserGroupsMessage:
    TOKEN_PROVISIONING_ERRORS.Sub2ApiGroupInventoryNotImplemented,
})
```

Keep the existing mapping from `Create`, `SelectionRequired`, `NeedsUserGroups`, and `Blocked` to `DefaultTokenQuickCreateResolution`.

- [ ] **Step 3: Route shared ensure through lifecycle**

In `ensureAccountApiToken(...)`, replace the no-token direct policy/create/refetch block with:

```ts
if (!apiToken) {
  const result = await ensureDefaultTokenLifecycle({
    workflow: TOKEN_PROVISIONING_WORKFLOWS.SharedEnsure,
    account,
    displaySiteData,
    defaultTokenData: options.defaultTokenData,
    explicitGroup: options.explicitGroup ?? options.sub2apiGroup,
  })

  if (
    result.kind === DEFAULT_TOKEN_LIFECYCLE_RESULT_KINDS.Ready ||
    result.kind === DEFAULT_TOKEN_LIFECYCLE_RESULT_KINDS.Created
  ) {
    apiToken = result.token
  } else if (
    result.kind === DEFAULT_TOKEN_LIFECYCLE_RESULT_KINDS.Blocked &&
    (result.reason === TOKEN_PROVISIONING_BLOCK_REASONS.OneTimeSecretRequired ||
      result.reason ===
        TOKEN_PROVISIONING_BLOCK_REASONS.CreatedTokenSecretUnavailable)
  ) {
    throw new Error(t("messages:aihubmix.createRequiresOneTimeKeyDialog"))
  } else if (
    result.kind === DEFAULT_TOKEN_LIFECYCLE_RESULT_KINDS.Blocked &&
    result.reason === DEFAULT_TOKEN_LIFECYCLE_BLOCK_REASONS.CreateTokenFailed
  ) {
    throw new Error(t("messages:accountOperations.createTokenFailed"))
  } else if (
    result.kind === DEFAULT_TOKEN_LIFECYCLE_RESULT_KINDS.Blocked &&
    (result.reason === DEFAULT_TOKEN_LIFECYCLE_BLOCK_REASONS.TokenNotFound ||
      result.reason ===
        DEFAULT_TOKEN_LIFECYCLE_BLOCK_REASONS.AmbiguousCreatedToken)
  ) {
    throw new Error(t("messages:accountOperations.tokenNotFound"))
  } else {
    throw new Error(t("messages:tokenProvisioning.createRequiresGroup"))
  }
}
```

Import `DEFAULT_TOKEN_LIFECYCLE_BLOCK_REASONS` and `DEFAULT_TOKEN_LIFECYCLE_RESULT_KINDS` from the lifecycle Module.

- [ ] **Step 4: Route background ensure through lifecycle**

In `src/services/accounts/accountKeyAutoProvisioning/ensureDefaultToken.ts`, import:

```ts
import {
  DEFAULT_TOKEN_LIFECYCLE_BLOCK_REASONS,
  DEFAULT_TOKEN_LIFECYCLE_RESULT_KINDS,
  DefaultTokenLifecyclePolicyBlockedError,
  ensureDefaultTokenLifecycle,
} from "~/services/accounts/defaultTokenLifecycle"
```

Replace the body after the initial parameter destructuring with:

```ts
const result = await ensureDefaultTokenLifecycle({
  workflow: TOKEN_PROVISIONING_WORKFLOWS.BackgroundAutoProvision,
  account,
  displaySiteData,
})

if (
  result.kind === DEFAULT_TOKEN_LIFECYCLE_RESULT_KINDS.Ready ||
  result.kind === DEFAULT_TOKEN_LIFECYCLE_RESULT_KINDS.Created
) {
  return {
    token: result.token,
    created: result.created,
  }
}

if (
  result.kind === DEFAULT_TOKEN_LIFECYCLE_RESULT_KINDS.Blocked &&
  result.reason === TOKEN_PROVISIONING_BLOCK_REASONS.OneTimeSecretRequired
) {
  throw new DefaultTokenLifecyclePolicyBlockedError({
    reason: result.reason,
    message: t("messages:aihubmix.createRequiresOneTimeKeyDialog"),
  })
}

if (
  result.kind === DEFAULT_TOKEN_LIFECYCLE_RESULT_KINDS.Blocked &&
  result.reason === DEFAULT_TOKEN_LIFECYCLE_BLOCK_REASONS.CreateTokenFailed
) {
  throw new Error(TOKEN_PROVISIONING_ERRORS.CreateTokenFailed)
}

if (
  result.kind === DEFAULT_TOKEN_LIFECYCLE_RESULT_KINDS.Blocked &&
  (result.reason === DEFAULT_TOKEN_LIFECYCLE_BLOCK_REASONS.TokenNotFound ||
    result.reason ===
      DEFAULT_TOKEN_LIFECYCLE_BLOCK_REASONS.AmbiguousCreatedToken ||
    result.reason ===
      TOKEN_PROVISIONING_BLOCK_REASONS.CreatedTokenSecretUnavailable)
) {
  throw new Error(TOKEN_PROVISIONING_ERRORS.TokenNotFound)
}

throw new DefaultTokenLifecyclePolicyBlockedError({
  reason:
    result.kind === DEFAULT_TOKEN_LIFECYCLE_RESULT_KINDS.Blocked
      ? result.reason
      : TOKEN_PROVISIONING_BLOCK_REASONS.GroupSelectionRequired,
  message: t("messages:tokenProvisioning.createRequiresGroup"),
})
```

Remove now-unused direct adapter/keyManagement imports from this file. Keep
`TOKEN_PROVISIONING_ERRORS` for backend failure sentinels and
`TOKEN_PROVISIONING_BLOCK_REASONS` for typed policy-block reasons; do not catch
or branch on translated message text.

- [ ] **Step 5: Update focused tests to assert behavior, not direct policy plumbing**

In `tests/services/accountOperations.ensureAccountApiToken.test.ts`, keep
behavior assertions and avoid adding new expectations that require
`accountOperations.ts` to call policy methods directly. The tests should keep
asserting:

- grouped creation still creates with group
- `defaultTokenData` still reaches `createToken`
- AIHubMix one-time-secret errors remain unchanged
- background helper still blocks group-required policies
- background helper still returns existing tokens without creation

If tests fail because lifecycle now calls `fetchTokens` one extra time for
id-diff recovery, update expected call counts only when the resulting behavior
matches the spec:

```ts
expect(fetchAccountTokensMock).toHaveBeenCalledTimes(2)
```

- [ ] **Step 6: Run focused tests**

Run:

```powershell
pnpm vitest run tests/services/accounts/defaultTokenLifecycle.test.ts tests/services/accountOperations.ensureAccountApiToken.test.ts
```

Expected: PASS.

- [ ] **Step 7: Commit quick-create/background/shared routing**

Run:

```powershell
git add src/services/accounts/accountOperations.ts src/services/accounts/accountKeyAutoProvisioning/ensureDefaultToken.ts tests/services/accountOperations.ensureAccountApiToken.test.ts
git commit -m "refactor(accounts): route default token ensure through lifecycle"
```

---

### Task 5: Route Post-Save Token Ensure Through Lifecycle

**Files:**
- Modify: `src/services/accounts/accountPostSaveWorkflow/ensureAccountToken.ts`
- Modify: `src/services/accounts/accountPostSaveWorkflow/index.ts`
- Modify: `tests/services/accountPostSaveWorkflow.ensureAccountToken.test.ts`

- [ ] **Step 1: Update post-save tests to import lifecycle helpers**

In `tests/services/accountPostSaveWorkflow.ensureAccountToken.test.ts`, replace imports:

```ts
  ACCOUNT_TOKEN_INVENTORY_STATE_KINDS,
  inspectAccountTokenInventory,
  selectSingleNewApiTokenByIdDiff,
```

with:

```ts
  DEFAULT_TOKEN_INVENTORY_STATE_KINDS,
  inspectDefaultTokenInventory,
  selectSingleNewApiTokenByIdDiff,
```

from:

```ts
import {
  DEFAULT_TOKEN_INVENTORY_STATE_KINDS,
  inspectDefaultTokenInventory,
  selectSingleNewApiTokenByIdDiff,
} from "~/services/accounts/defaultTokenLifecycle"
```

Update assertions:

```ts
kind: DEFAULT_TOKEN_INVENTORY_STATE_KINDS.Present
```

and calls:

```ts
inspectDefaultTokenInventory({
  workflow: TOKEN_PROVISIONING_WORKFLOWS.PostSaveAutomation,
  displaySiteData: displayAccount,
})
```

- [ ] **Step 2: Run post-save tests and verify they fail**

Run:

```powershell
pnpm vitest run tests/services/accountPostSaveWorkflow.ensureAccountToken.test.ts
```

Expected: FAIL until `ensureAccountTokenForPostSaveWorkflow(...)` delegates to lifecycle and the old helper exports are removed or forwarded.

- [ ] **Step 3: Replace local post-save lifecycle helpers**

In `src/services/accounts/accountPostSaveWorkflow/ensureAccountToken.ts`, remove local implementations of:

- `isApiTokenWithValidId`
- `sanitizeApiTokens`
- `getTokenIds`
- `selectSingleNewApiTokenByIdDiff`
- `buildCreateRequest`
- `inspectAccountTokenInventory`
- `createDefaultToken`

Import:

```ts
import {
  DEFAULT_TOKEN_LIFECYCLE_BLOCK_REASONS,
  DEFAULT_TOKEN_LIFECYCLE_RESULT_KINDS,
  ensureDefaultTokenLifecycle,
  inspectDefaultTokenInventory,
  selectSingleNewApiTokenByIdDiff,
} from "~/services/accounts/defaultTokenLifecycle"
```

Export compatibility names from this file:

```ts
export {
  inspectDefaultTokenInventory as inspectAccountTokenInventory,
  selectSingleNewApiTokenByIdDiff,
}
```

This keeps current imports from `~/services/accounts/accountPostSaveWorkflow` working while the implementation lives in the lifecycle Module.

- [ ] **Step 4: Replace `ensureAccountTokenForPostSaveWorkflow(...)` body**

Replace the body with:

```ts
export async function ensureAccountTokenForPostSaveWorkflow(params: {
  account: SiteAccount
  displaySiteData: DisplaySiteData
}): Promise<EnsureAccountTokenResult> {
  const result = await ensureDefaultTokenLifecycle({
    workflow: TOKEN_PROVISIONING_WORKFLOWS.PostSaveAutomation,
    account: params.account,
    displaySiteData: params.displaySiteData,
  })

  if (result.kind === DEFAULT_TOKEN_LIFECYCLE_RESULT_KINDS.Ready) {
    return {
      kind: ENSURE_ACCOUNT_TOKEN_RESULT_KINDS.Ready,
      token: result.token,
      created: false,
    }
  }

  if (result.kind === DEFAULT_TOKEN_LIFECYCLE_RESULT_KINDS.Created) {
    return {
      kind: ENSURE_ACCOUNT_TOKEN_RESULT_KINDS.Created,
      token: result.token,
      created: true,
      oneTimeSecret: result.oneTimeSecret,
    }
  }

  if (result.kind === DEFAULT_TOKEN_LIFECYCLE_RESULT_KINDS.SelectionRequired) {
    return {
      kind: ENSURE_ACCOUNT_TOKEN_RESULT_KINDS.Sub2ApiSelectionRequired,
      allowedGroups: result.allowedGroups,
      existingTokenIds: result.existingTokenIds,
    }
  }

  if (
    result.reason === TOKEN_PROVISIONING_BLOCK_REASONS.OneTimeSecretRequired ||
    result.reason ===
      TOKEN_PROVISIONING_BLOCK_REASONS.CreatedTokenSecretUnavailable
  ) {
    return {
      kind: ENSURE_ACCOUNT_TOKEN_RESULT_KINDS.Blocked,
      code: ACCOUNT_POST_SAVE_WORKFLOW_ERROR_CODES.TokenSecretUnavailable,
      message: t("messages:aihubmix.createRequiresOneTimeKeyDialog"),
    }
  }

  if (
    result.reason === TOKEN_PROVISIONING_BLOCK_REASONS.AvailableGroupRequired ||
    result.reason === DEFAULT_TOKEN_LIFECYCLE_BLOCK_REASONS.MissingUserGroups
  ) {
    return {
      kind: ENSURE_ACCOUNT_TOKEN_RESULT_KINDS.Blocked,
      code: ACCOUNT_POST_SAVE_WORKFLOW_ERROR_CODES.TokenCreationFailed,
      message: t("messages:sub2api.createRequiresAvailableGroup"),
    }
  }

  return {
    kind: ENSURE_ACCOUNT_TOKEN_RESULT_KINDS.Blocked,
    code: ACCOUNT_POST_SAVE_WORKFLOW_ERROR_CODES.TokenCreationFailed,
    message: t("messages:accountOperations.createTokenFailed"),
  }
}
```

- [ ] **Step 5: Run post-save and Account Dialog tests**

Run:

```powershell
pnpm vitest run tests/services/accountPostSaveWorkflow.ensureAccountToken.test.ts tests/features/AccountManagement/hooks/useAccountDialog.saveAndAutoConfig.test.tsx
```

Expected: PASS. If Account Dialog imports still work through the post-save barrel, do not edit Account Dialog source.

- [ ] **Step 6: Run Channel Dialog regression test through the compatibility re-export**

Run:

```powershell
pnpm vitest run tests/components/UseChannelDialog.duplicateChannelWarning.test.tsx
```

Expected: PASS.

- [ ] **Step 7: Commit post-save routing**

Run:

```powershell
git add src/services/accounts/accountPostSaveWorkflow/ensureAccountToken.ts src/services/accounts/accountPostSaveWorkflow/index.ts tests/services/accountPostSaveWorkflow.ensureAccountToken.test.ts
git commit -m "refactor(accounts): route post-save token ensure through lifecycle"
```

If TypeScript forced a direct import update in a consumer despite the
compatibility re-export, add that exact consumer file in the same commit and
explain it in the handoff.

---

### Task 6: Route Repair Fallback Creation Through Lifecycle

**Files:**
- Modify: `src/services/accounts/accountKeyAutoProvisioning/groupCoverage.ts`
- Modify: `tests/services/accountKeyGroupCoverage.test.ts`

- [ ] **Step 1: Add a failing group-coverage refetch-recovery test**

In `tests/services/accountKeyGroupCoverage.test.ts`, add this test near the existing empty-group fallback tests:

```ts
it("recovers the empty-group fallback token by id diff through lifecycle recovery", async () => {
  const createdToken = buildApiToken({
    id: 22,
    name: DEFAULT_AUTO_PROVISION_TOKEN_NAME,
    group: "",
  })

  mocks.fetchAccountTokens
    .mockResolvedValueOnce([])
    .mockResolvedValueOnce([createdToken])
  mocks.fetchUserGroups.mockResolvedValue({})
  mocks.createApiToken.mockResolvedValueOnce(true)
  mocks.classifyCreatedToken.mockReturnValueOnce({
    kind: CREATED_TOKEN_SECRET_DECISION_KINDS.NeedsInventoryRefetch,
  })

  const result = await runCoverage()

  expect(result).toEqual({
    created: true,
    availableGroups: [],
    coveredGroups: [],
    createdGroups: [""],
    missingGroups: [],
    invalidTokens: [],
  })
  expect(mocks.fetchAccountTokens).toHaveBeenCalledTimes(2)
})
```

- [ ] **Step 2: Run group coverage test and verify the recovery assertion fails**

Run:

```powershell
pnpm vitest run tests/services/accountKeyGroupCoverage.test.ts
```

Expected: FAIL because the current empty-group fallback does not use lifecycle
recovery and therefore does not perform the second inventory fetch asserted by
the new test.

- [ ] **Step 3: Route empty-group/no-token fallback through lifecycle helper**

In `src/services/accounts/accountKeyAutoProvisioning/groupCoverage.ts`, import:

```ts
import {
  DEFAULT_TOKEN_LIFECYCLE_BLOCK_REASONS,
  DEFAULT_TOKEN_LIFECYCLE_RESULT_KINDS,
  createDefaultTokenFromDecision,
} from "~/services/accounts/defaultTokenLifecycle"
```

In the `uniqueGroups.length === 0` and `tokens.length === 0` branch, replace the direct `keyManagement.createToken(...)` and `tokenProvisioning.classifyCreatedToken(...)` block with:

```ts
const createResult = await createDefaultTokenFromDecision({
  workflow: TOKEN_PROVISIONING_WORKFLOWS.Repair,
  keyManagement,
  tokenProvisioning,
  createRequest: request,
  inventoryRequest: request,
  decision,
  existingTokenIds: [],
})

if (createResult.kind === DEFAULT_TOKEN_LIFECYCLE_RESULT_KINDS.Blocked) {
  if (
    createResult.reason ===
    DEFAULT_TOKEN_LIFECYCLE_BLOCK_REASONS.CreateTokenFailed
  ) {
    throw new Error(TOKEN_PROVISIONING_ERRORS.CreateTokenFailed)
  }

  if (
    createResult.reason ===
      TOKEN_PROVISIONING_BLOCK_REASONS.CreatedTokenSecretUnavailable ||
    createResult.reason ===
      TOKEN_PROVISIONING_BLOCK_REASONS.OneTimeSecretRequired
  ) {
    throw new Error(t("messages:aihubmix.createRequiresOneTimeKeyDialog"))
  }

  throw new Error(t("messages:tokenProvisioning.createRequiresGroup"))
}
```

Preserve the existing return:

```ts
return {
  created: true,
  availableGroups: [],
  coveredGroups: [],
  createdGroups: [decision.tokenData.group],
  missingGroups: [],
  invalidTokens: [],
}
```

Do not change the per-group creation loop.

- [ ] **Step 4: Run group coverage tests**

Run:

```powershell
pnpm vitest run tests/services/accountKeyGroupCoverage.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit repair fallback routing**

Run:

```powershell
git add src/services/accounts/accountKeyAutoProvisioning/groupCoverage.ts tests/services/accountKeyGroupCoverage.test.ts
git commit -m "refactor(accounts): reuse lifecycle recovery for key repair fallback"
```

---

### Task 7: Remove Raw Auto-Provision Site-Type Skips

**Files:**
- Modify: `src/services/accounts/accountOperations.ts`
- Modify: `tests/services/accountOperations.autoProvisionKeyOnAccountAdd.test.ts`

- [ ] **Step 0: Import typed policy-block helpers in tests**

In `tests/services/accountOperations.autoProvisionKeyOnAccountAdd.test.ts`, add:

```ts
import {
  DefaultTokenLifecyclePolicyBlockedError,
} from "~/services/accounts/defaultTokenLifecycle"
import { TOKEN_PROVISIONING_BLOCK_REASONS } from "~/services/apiAdapters/contracts/tokenProvisioning"
```

- [ ] **Step 1: Change Sub2API auto-provision test to expect lifecycle delegation**

In `tests/services/accountOperations.autoProvisionKeyOnAccountAdd.test.ts`, rename:

```ts
it("skips auto-provision for sub2api accounts", async () => {
```

to:

```ts
it("silently ignores policy-blocked auto-provision for sub2api accounts", async () => {
```

Inside the test, add before `validateAndSaveAccount(...)`:

```ts
ensureDefaultApiTokenForAccountMock.mockRejectedValueOnce(
  new DefaultTokenLifecyclePolicyBlockedError({
    reason: TOKEN_PROVISIONING_BLOCK_REASONS.GroupSelectionRequired,
    message: "messages:tokenProvisioning.createRequiresGroup",
  }),
)
```

Replace assertions:

```ts
expect(ensureDefaultApiTokenForAccountMock).not.toHaveBeenCalled()
```

with:

```ts
expect(ensureDefaultApiTokenForAccountMock).toHaveBeenCalledTimes(1)
```

Keep:

```ts
expect(toastSuccessMock).not.toHaveBeenCalled()
expect(toastErrorMock).not.toHaveBeenCalled()
```

- [ ] **Step 2: Add AIHubMix silent policy-blocked test**

Add this test next to the Sub2API policy-blocked test:

```ts
it("silently ignores policy-blocked auto-provision for AIHubMix accounts", async () => {
  ensureDefaultApiTokenForAccountMock.mockRejectedValueOnce(
    new DefaultTokenLifecyclePolicyBlockedError({
      reason: TOKEN_PROVISIONING_BLOCK_REASONS.OneTimeSecretRequired,
      message: "messages:aihubmix.createRequiresOneTimeKeyDialog",
    }),
  )

  const result = await validateAndSaveAccount(
    "https://aihubmix.example.invalid",
    "AIHubMix",
    "tester",
    "test-token",
    "1",
    "7.0",
    "",
    [],
    CHECK_IN_DISABLED,
    SITE_TYPES.AIHUBMIX,
    AuthTypeEnum.AccessToken,
    "",
  )

  expect(result.success).toBe(true)

  await flushPromises()
  await flushPromises()

  expect(ensureDefaultApiTokenForAccountMock).toHaveBeenCalledTimes(1)
  expect(toastSuccessMock).not.toHaveBeenCalled()
  expect(toastErrorMock).not.toHaveBeenCalled()
})
```

- [ ] **Step 3: Run auto-provision tests and verify they fail**

Run:

```powershell
pnpm vitest run tests/services/accountOperations.autoProvisionKeyOnAccountAdd.test.ts
```

Expected: FAIL because `autoProvisionKeyOnAccountAdd(...)` still returns before calling the lifecycle-backed helper for Sub2API/AIHubMix.

- [ ] **Step 4: Add policy-blocked detection helper**

In `src/services/accounts/accountOperations.ts`, add:

```ts
import {
  DefaultTokenLifecyclePolicyBlockedError,
} from "~/services/accounts/defaultTokenLifecycle"

const isDefaultTokenAutoProvisionPolicyBlock = (
  error: unknown,
): error is DefaultTokenLifecyclePolicyBlockedError =>
  error instanceof DefaultTokenLifecyclePolicyBlockedError
```

Do not compare `error.message` to translated message text. The background
ensure helper maps policy-blocked lifecycle results to
`DefaultTokenLifecyclePolicyBlockedError`, and the message remains only the
display payload.

- [ ] **Step 5: Remove raw site-type skip and suppress policy-blocked errors**

In `autoProvisionKeyOnAccountAdd(...)`, remove:

```ts
if (
  account.site_type === SITE_TYPES.SUB2API ||
  account.site_type === SITE_TYPES.AIHUBMIX
) {
  return
}
```

In the `catch` block, add before `toast.error(...)`:

```ts
if (isDefaultTokenAutoProvisionPolicyBlock(error)) {
  return
}
```

Keep the none-auth skip and invalid display data validation unchanged.

- [ ] **Step 6: Run auto-provision tests**

Run:

```powershell
pnpm vitest run tests/services/accountOperations.autoProvisionKeyOnAccountAdd.test.ts
```

Expected: PASS.

- [ ] **Step 7: Commit auto-provision cleanup**

Run:

```powershell
git add src/services/accounts/accountOperations.ts tests/services/accountOperations.autoProvisionKeyOnAccountAdd.test.ts
git commit -m "refactor(accounts): let lifecycle policy gate auto-provision"
```

---

### Task 8: Cleanup Searches And Validation

**Files:**
- Modify only files that cleanup searches prove still contain unexpected lifecycle duplication.

- [ ] **Step 1: Run direct policy-call cleanup search**

Run:

```powershell
rg "resolveDefaultTokenCreationWithUserGroups|resolveDefaultTokenCreation\\(|classifyCreatedToken\\(|isInventoryTokenUsable\\(" src/services/accounts tests/services
```

Expected allowed source matches:

```text
src/services/accounts/defaultTokenLifecycle/lifecycle.ts
```

Expected allowed test matches:

```text
tests/services/accounts/defaultTokenLifecycle.test.ts
tests/services/accountOperations.ensureAccountApiToken.test.ts
tests/services/accountPostSaveWorkflow.ensureAccountToken.test.ts
tests/services/accountKeyGroupCoverage.test.ts
```

If `src/services/accounts/accountOperations.ts`,
`src/services/accounts/accountPostSaveWorkflow/ensureAccountToken.ts`,
`src/services/accounts/accountKeyAutoProvisioning/ensureDefaultToken.ts`, or
`src/services/accounts/accountKeyAutoProvisioning/groupCoverage.ts` still call
policy methods directly, route those calls through lifecycle helpers.

- [ ] **Step 2: Run inventory-helper cleanup search**

Run:

```powershell
rg "selectSingleNewApiTokenByIdDiff|sanitizeApiTokens|getTokenIds|inspectAccountTokenInventory" src/services/accounts tests/services
```

Expected:

- `sanitizeApiTokens` and `getTokenIds` appear only in `src/services/accounts/defaultTokenLifecycle/lifecycle.ts`.
- `selectSingleNewApiTokenByIdDiff` appears in the lifecycle Module and tests.
- `inspectAccountTokenInventory` appears only as a compatibility alias in
  `src/services/accounts/accountPostSaveWorkflow/ensureAccountToken.ts`.

Keep the post-save barrel compatibility aliases in this slice so Account Dialog
and Channel Dialog imports remain stable.

- [ ] **Step 3: Run auto-provision site-type cleanup search**

Run:

```powershell
rg "site_type === SITE_TYPES.SUB2API|site_type === SITE_TYPES.AIHUBMIX" src/services/accounts
```

Expected: no matches in `src/services/accounts/accountOperations.ts`.

Allowed matches may remain outside `src/services/accounts` for Account Dialog site policy, manual repair UI, or explicit model-key flows. Do not broaden this slice to clean those names.

- [ ] **Step 4: Run lifecycle magic-string cleanup search**

Run:

```powershell
rg "error\\.message|DEFAULT_TOKEN_AUTO_PROVISION_POLICY_BLOCK_MESSAGES|new Error\\(\\\"messages:|quick_create_selection_is_decision_only|missing_user_groups|ambiguous_created_token|create_token_failed|token_not_found" src/services/accounts tests/services
```

Expected:

- `quick_create_selection_is_decision_only`, `missing_user_groups`, and `ambiguous_created_token` appear only at exported constant definitions or tests that import/assert those constants.
- `create_token_failed` and `token_not_found` appear through `TOKEN_PROVISIONING_ERRORS`, not as new local string literals.
- No new runtime code compares `error.message` to translated message text.
- No `DEFAULT_TOKEN_AUTO_PROVISION_POLICY_BLOCK_MESSAGES` helper exists.
- Test fixture display messages such as `"messages:tokenProvisioning.createRequiresGroup"` are allowed only when the control-flow assertion also uses `DefaultTokenLifecyclePolicyBlockedError`.

- [ ] **Step 5: Run focused tests**

Run:

```powershell
pnpm vitest run tests/services/accounts/defaultTokenLifecycle.test.ts tests/services/accountOperations.ensureAccountApiToken.test.ts tests/services/accountOperations.autoProvisionKeyOnAccountAdd.test.ts tests/services/accountPostSaveWorkflow.ensureAccountToken.test.ts tests/services/accountKeyGroupCoverage.test.ts tests/services/accountKeyRepair.test.ts
```

Expected: PASS.

- [ ] **Step 6: Run related validation**

Run:

```powershell
pnpm vitest related --run src/services/accounts/defaultTokenLifecycle/index.ts src/services/accounts/defaultTokenLifecycle/contracts.ts src/services/accounts/defaultTokenLifecycle/requests.ts src/services/accounts/defaultTokenLifecycle/lifecycle.ts src/services/accounts/accountOperations.ts src/services/accounts/accountKeyAutoProvisioning/ensureDefaultToken.ts src/services/accounts/accountPostSaveWorkflow/ensureAccountToken.ts src/services/accounts/accountKeyAutoProvisioning/groupCoverage.ts src/services/accounts/accountKeyAutoProvisioning/repair.ts
```

Expected: PASS.

- [ ] **Step 7: Run compile**

Run:

```powershell
pnpm compile
```

Expected: PASS. This is required because the slice moves shared exports and may affect UI import surfaces.

- [ ] **Step 8: Run the commit gate**

Stage only task-scoped files, then run:

```powershell
pnpm run validate:staged
```

Expected: PASS.

- [ ] **Step 9: Run the push gate before PR or remote handoff**

Run:

```powershell
pnpm run validate:push
```

Expected: PASS. This gate is required before publishing because the implementation changes shared account services, exports, and cross-module lifecycle routing.

- [ ] **Step 10: Commit cleanup fixes if any were needed**

If cleanup searches required final edits, run:

```powershell
git add src/services/accounts tests/services
git commit -m "refactor(accounts): remove duplicated default token lifecycle logic"
```

If no final edits were needed after prior task commits, do not create an empty commit.

---

## Final Verification Checklist

- [ ] `src/services/accounts/defaultTokenLifecycle/` owns inventory normalization, id-diff recovery, decision second-pass handling, create/classify/refetch recovery, and high-level default-token ensure.
- [ ] `SiteAdapter.keyManagement` remains the only raw token CRUD owner.
- [ ] `SiteAdapter.tokenProvisioning` remains the only site-specific policy owner.
- [ ] `accountOperations.ensureAccountApiToken(...)` calls `ensureDefaultTokenLifecycle(...)`.
- [ ] `accountOperations.resolveDefaultTokenQuickCreateResolution(...)` calls `resolveDefaultTokenLifecycleDecision(...)`.
- [ ] `ensureDefaultApiTokenForAccount(...)` calls `ensureDefaultTokenLifecycle(...)`.
- [ ] `ensureAccountTokenForPostSaveWorkflow(...)` calls `ensureDefaultTokenLifecycle(...)`.
- [ ] `groupCoverage.ts` uses lifecycle recovery only for empty-group/no-token fallback.
- [ ] Per-group repair creation remains local to `groupCoverage.ts`.
- [ ] `autoProvisionKeyOnAccountAdd(...)` no longer raw-skips Sub2API or AIHubMix.
- [ ] Auto-provision after account add still silently ignores group-required and one-time-secret policy blocks.
- [ ] New lifecycle runtime branches use exported constants or `DefaultTokenLifecyclePolicyBlockedError`; no new branch compares translated message strings or ad hoc error-message literals.
- [ ] `resolveSub2ApiQuickCreateResolution(...)` remains only as a compatibility wrapper and tests, if retained.
- [ ] Account Dialog post-save site policy is semantically unchanged.
- [ ] Manual Add Token and Model Key created-token behavior is unchanged.
- [ ] No locale, telemetry, settings search, Playwright, `apiService/**`, managed-site provider, or new site-type files changed.
- [ ] Focused Vitest tests pass.
- [ ] Related Vitest validation passes.
- [ ] `pnpm compile` passes.
- [ ] `pnpm run validate:staged` passes.
- [ ] `pnpm run validate:push` passes before PR or remote handoff.

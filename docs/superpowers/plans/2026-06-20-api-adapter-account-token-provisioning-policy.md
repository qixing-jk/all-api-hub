# API Adapter Account Token Provisioning Policy Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move account default-token provisioning policy behind `SiteAdapter.tokenProvisioning` so the next account site type can define creation, group, one-time-secret, and repair eligibility rules in one adapter-owned place.

**Architecture:** Keep raw token CRUD in `SiteAdapter.keyManagement`; add a pure policy capability that returns stable decisions and reason codes. Account workflow modules continue to own storage, request construction, UI result mapping, telemetry, and calls to `keyManagement`.

**Tech Stack:** TypeScript, WXT extension services, existing `apiAdapters`, Vitest, `pnpm run validate:staged`, `pnpm run validate:push`.

**Spec:** `docs/superpowers/specs/2026-06-20-api-adapter-account-token-provisioning-policy-design.md`

---

## File Structure

- Create `src/services/apiAdapters/contracts/tokenProvisioning.ts`
  - Defines workflow names, block reason codes, decision unions, and `TokenProvisioningCapability`.
- Modify `src/services/apiAdapters/contracts/siteAdapter.ts`
  - Adds optional `tokenProvisioning?: TokenProvisioningCapability`.
- Create `src/services/apiAdapters/newApi/tokenProvisioning.ts`
  - New API-family compatible policy: ungrouped default creation is allowed, inventory tokens are usable, repair is eligible.
- Create `src/services/apiAdapters/sub2api/tokenProvisioning.ts`
  - Group-required policy: explicit groups create, interactive/post-save flows can auto-select one group or request selection, repair is skipped.
- Create `src/services/apiAdapters/aihubmix/tokenProvisioning.ts`
  - One-time-secret policy: only post-save creation is allowed, created tokens must include a full unmasked key, repair is skipped.
- Modify `src/services/apiAdapters/newApi/index.ts`
  - Wires `createNewApiTokenProvisioning(siteType)` into new API-family adapters.
- Modify `src/services/apiAdapters/sub2api/index.ts`
  - Wires `sub2ApiTokenProvisioning`.
- Modify `src/services/apiAdapters/aihubmix/index.ts`
  - Wires `aihubmixTokenProvisioning`.
- Modify `tests/services/apiAdapters/tokenProvisioning.test.ts`
  - Covers policy behavior directly.
- Modify `tests/services/apiAdapters/registry.test.ts`
  - Verifies supported account adapters expose the new policy capability.
- Modify `src/services/accounts/utils/apiServiceRequest.ts`
  - Adds `requireDisplayAccountTokenProvisioning(...)` and returns `tokenProvisioning` from `createDisplayAccountApiContext(...)`.
- Create `src/services/accounts/utils/tokenProvisioning.ts`
  - Shared helper that re-invokes a policy decision after fetching user groups only when the policy asks for them.
- Modify `tests/services/accounts/apiServiceRequest.test.ts`
  - Covers the new context property and missing-capability error.
- Modify `src/services/accounts/accountPostSaveWorkflow/ensureAccountToken.ts`
  - Routes inventory usability, creation decisions, created-token classification, group selection, and one-time-secret handling through policy.
- Modify `tests/services/accountPostSaveWorkflow.ensureAccountToken.test.ts`
  - Updates adapter mocks and preserves existing post-save result behavior.
- Modify `src/services/accounts/accountKeyAutoProvisioning/ensureDefaultToken.ts`
  - Routes background default token creation through policy.
- Modify `src/services/accounts/accountOperations.ts`
  - Adds generic quick-create resolution, keeps the Sub2API compatibility wrapper, and routes `ensureAccountApiToken(...)` through policy.
- Modify `tests/services/accountOperations.ensureAccountApiToken.test.ts`
  - Preserves existing grouped creation, Sub2API group-selection, and AIHubMix blocking behavior.
- Modify `src/services/accounts/accountKeyAutoProvisioning/groupCoverage.ts`
  - Routes empty-group/no-token fallback through policy.
- Modify `tests/services/accountKeyGroupCoverage.test.ts`
  - Verifies policy-driven empty-group fallback and unchanged invalid-token deletion behavior.
- Modify `src/services/accounts/accountKeyAutoProvisioning/repair.ts`
  - Routes site-specific repair skip reasons through policy while keeping `noneAuth` in repair.
- Modify `tests/services/accountKeyRepair.test.ts`
  - Verifies policy-driven Sub2API and AIHubMix skip reasons.

Do not modify:

- `src/services/apiService/**`
  - Backend token functions remain delegated implementations behind `keyManagement`.
- `src/locales/**`
  - This slice reuses existing messages and result codes.
- telemetry schemas, settings search files, Playwright E2E tests, managed-site providers, managed-site channel CRUD, model pricing, model catalog, redemption, site announcements, account bootstrap, account data, account refresh, or account completion.
- new site-type definitions.

Telemetry decision: reuse existing.

Settings search decision: none.

E2E decision: no new Playwright E2E. The risk is service-layer policy routing and existing result mapping, which focused Vitest coverage exercises directly.

---

### Task 1: Add Token Provisioning Policy Contract And Adapter Policies

**Files:**
- Create: `src/services/apiAdapters/contracts/tokenProvisioning.ts`
- Modify: `src/services/apiAdapters/contracts/siteAdapter.ts`
- Create: `src/services/apiAdapters/newApi/tokenProvisioning.ts`
- Create: `src/services/apiAdapters/sub2api/tokenProvisioning.ts`
- Create: `src/services/apiAdapters/aihubmix/tokenProvisioning.ts`
- Modify: `src/services/apiAdapters/newApi/index.ts`
- Modify: `src/services/apiAdapters/sub2api/index.ts`
- Modify: `src/services/apiAdapters/aihubmix/index.ts`
- Modify: `tests/services/apiAdapters/tokenProvisioning.test.ts`
- Modify: `tests/services/apiAdapters/registry.test.ts`

- [ ] **Step 1: Write the failing policy tests**

Create `tests/services/apiAdapters/tokenProvisioning.test.ts`:

```ts
import { describe, expect, it } from "vitest"

import { TOKEN_PROVISIONING_BLOCK_REASONS, TOKEN_PROVISIONING_WORKFLOWS } from "~/services/apiAdapters/contracts/tokenProvisioning"
import { aihubmixTokenProvisioning } from "~/services/apiAdapters/aihubmix/tokenProvisioning"
import { createNewApiTokenProvisioning } from "~/services/apiAdapters/newApi/tokenProvisioning"
import {
  normalizeTokenProvisioningGroupNames,
  sub2ApiTokenProvisioning,
} from "~/services/apiAdapters/sub2api/tokenProvisioning"
import type { ApiToken } from "~/types"

const defaultTokenData = {
  name: "All API Hub Auto Provisioned Key",
  remain_quota: 500000,
  expired_time: -1,
  unlimited_quota: false,
  model_limits_enabled: false,
  model_limits: "",
  allow_ips: "",
  group: "",
}

const token = (overrides: Partial<ApiToken> = {}): ApiToken =>
  ({
    id: 1,
    name: "default key",
    key: "sk-full-secret",
    status: 1,
    remain_quota: 500000,
    unlimited_quota: false,
    expired_time: -1,
    created_time: 1,
    accessed_time: 1,
    used_quota: 0,
    models: "",
    subnet: "",
    ...overrides,
  }) as ApiToken

describe("tokenProvisioning policies", () => {
  it("allows new API-family default creation and inventory recovery", () => {
    const policy = createNewApiTokenProvisioning("new-api")

    expect(
      policy.resolveDefaultTokenCreation({
        workflow: TOKEN_PROVISIONING_WORKFLOWS.BackgroundAutoProvision,
        defaultTokenData,
      }),
    ).toEqual({
      kind: "create",
      tokenData: defaultTokenData,
      oneTimeSecret: false,
      recoverCreatedToken: "inventory_refetch",
    })
    expect(
      policy.classifyCreatedToken({
        workflow: TOKEN_PROVISIONING_WORKFLOWS.SharedEnsure,
        result: true,
      }),
    ).toEqual({ kind: "needs_inventory_refetch" })
    expect(
      policy.classifyCreatedToken({
        workflow: TOKEN_PROVISIONING_WORKFLOWS.PostSaveAutomation,
        result: token(),
      }),
    ).toEqual({
      kind: "usable",
      token: token(),
      oneTimeSecret: false,
    })
    expect(policy.isInventoryTokenUsable({
      workflow: TOKEN_PROVISIONING_WORKFLOWS.PostSaveAutomation,
      token: token({ key: "masked sk-abc" }),
    })).toBe(true)
    expect(policy.getRepairPolicy()).toEqual({ kind: "eligible" })
  })

  it("normalizes Sub2API group names", () => {
    expect(
      normalizeTokenProvisioningGroupNames({
        " default ": { desc: "Default", ratio: 1 },
        vip: { desc: "VIP", ratio: 1 },
        "": { desc: "Blank", ratio: 1 },
        default: { desc: "Duplicate", ratio: 1 },
      }),
    ).toEqual(["default", "vip"])
  })

  it("requires Sub2API groups for interactive and post-save creation", () => {
    expect(
      sub2ApiTokenProvisioning.resolveDefaultTokenCreation({
        workflow: TOKEN_PROVISIONING_WORKFLOWS.SharedEnsure,
        defaultTokenData,
      }),
    ).toEqual({
      kind: "blocked",
      reason: TOKEN_PROVISIONING_BLOCK_REASONS.GroupRequired,
    })
    expect(
      sub2ApiTokenProvisioning.resolveDefaultTokenCreation({
        workflow: TOKEN_PROVISIONING_WORKFLOWS.QuickCreateSelection,
        defaultTokenData,
      }),
    ).toEqual({ kind: "needs_user_groups" })
    expect(
      sub2ApiTokenProvisioning.resolveDefaultTokenCreation({
        workflow: TOKEN_PROVISIONING_WORKFLOWS.PostSaveAutomation,
        defaultTokenData,
        userGroups: { vip: { desc: "VIP", ratio: 1 } },
      }),
    ).toEqual({
      kind: "create",
      tokenData: { ...defaultTokenData, group: "vip" },
      oneTimeSecret: false,
      recoverCreatedToken: "inventory_refetch",
    })
    expect(
      sub2ApiTokenProvisioning.resolveDefaultTokenCreation({
        workflow: TOKEN_PROVISIONING_WORKFLOWS.QuickCreateSelection,
        defaultTokenData,
        userGroups: {
          default: { desc: "Default", ratio: 1 },
          vip: { desc: "VIP", ratio: 1 },
        },
      }),
    ).toEqual({
      kind: "selection_required",
      allowedGroups: ["default", "vip"],
      reason: TOKEN_PROVISIONING_BLOCK_REASONS.GroupSelectionRequired,
    })
    expect(
      sub2ApiTokenProvisioning.resolveDefaultTokenCreation({
        workflow: TOKEN_PROVISIONING_WORKFLOWS.PostSaveAutomation,
        defaultTokenData,
        userGroups: {},
      }),
    ).toEqual({
      kind: "blocked",
      reason: TOKEN_PROVISIONING_BLOCK_REASONS.AvailableGroupRequired,
    })
    expect(sub2ApiTokenProvisioning.getRepairPolicy()).toEqual({
      kind: "skipped",
      skipReason: "sub2api",
    })
  })

  it("requires AIHubMix post-save one-time full secrets", () => {
    expect(
      aihubmixTokenProvisioning.resolveDefaultTokenCreation({
        workflow: TOKEN_PROVISIONING_WORKFLOWS.BackgroundAutoProvision,
        defaultTokenData,
      }),
    ).toEqual({
      kind: "blocked",
      reason: TOKEN_PROVISIONING_BLOCK_REASONS.OneTimeSecretRequired,
    })
    expect(
      aihubmixTokenProvisioning.resolveDefaultTokenCreation({
        workflow: TOKEN_PROVISIONING_WORKFLOWS.PostSaveAutomation,
        defaultTokenData,
      }),
    ).toEqual({
      kind: "create",
      tokenData: defaultTokenData,
      oneTimeSecret: true,
      recoverCreatedToken: "created_response_first",
    })
    expect(
      aihubmixTokenProvisioning.classifyCreatedToken({
        workflow: TOKEN_PROVISIONING_WORKFLOWS.PostSaveAutomation,
        result: token({ key: "sk-full-aihubmix-secret" }),
      }),
    ).toEqual({
      kind: "usable",
      token: token({ key: "sk-full-aihubmix-secret" }),
      oneTimeSecret: true,
    })
    expect(
      aihubmixTokenProvisioning.classifyCreatedToken({
        workflow: TOKEN_PROVISIONING_WORKFLOWS.PostSaveAutomation,
        result: token({ key: "sk-****masked" }),
      }),
    ).toEqual({
      kind: "unavailable",
      reason: TOKEN_PROVISIONING_BLOCK_REASONS.CreatedTokenSecretUnavailable,
    })
    expect(aihubmixTokenProvisioning.isInventoryTokenUsable({
      workflow: TOKEN_PROVISIONING_WORKFLOWS.PostSaveAutomation,
      token: token({ key: "sk-****masked" }),
    })).toBe(false)
    expect(aihubmixTokenProvisioning.getRepairPolicy()).toEqual({
      kind: "skipped",
      skipReason: "aihubmixOneTimeKey",
    })
  })
})
```

Update `tests/services/apiAdapters/registry.test.ts` expectations for supported adapters:

```ts
expect(adapter.tokenProvisioning).toEqual(expect.any(Object))
expect(adapter.tokenProvisioning?.resolveDefaultTokenCreation).toEqual(
  expect.any(Function),
)
expect(adapter.tokenProvisioning?.classifyCreatedToken).toEqual(
  expect.any(Function),
)
expect(adapter.tokenProvisioning?.isInventoryTokenUsable).toEqual(
  expect.any(Function),
)
expect(adapter.tokenProvisioning?.getRepairPolicy).toEqual(expect.any(Function))
```

For unsupported adapters in the same file, assert:

```ts
expect(adapter.tokenProvisioning).toBeUndefined()
```

- [ ] **Step 2: Run the failing policy tests**

Run:

```powershell
pnpm vitest run tests/services/apiAdapters/tokenProvisioning.test.ts tests/services/apiAdapters/registry.test.ts
```

Expected: FAIL because `contracts/tokenProvisioning.ts` and the adapter policy modules do not exist yet.

- [ ] **Step 3: Add the policy contract**

Create `src/services/apiAdapters/contracts/tokenProvisioning.ts`:

```ts
import type {
  CreateTokenRequest,
  CreateTokenResult,
  UserGroupInfo,
} from "~/services/apiService/common/type"
import type { ApiToken } from "~/types"
import type { AccountKeyRepairSkipReason } from "~/types/accountKeyAutoProvisioning"

export const TOKEN_PROVISIONING_WORKFLOWS = {
  BackgroundAutoProvision: "background_auto_provision",
  SharedEnsure: "shared_ensure",
  QuickCreateSelection: "quick_create_selection",
  PostSaveAutomation: "post_save_automation",
  Repair: "repair",
} as const

export type TokenProvisioningWorkflow =
  (typeof TOKEN_PROVISIONING_WORKFLOWS)[keyof typeof TOKEN_PROVISIONING_WORKFLOWS]

export const TOKEN_PROVISIONING_BLOCK_REASONS = {
  GroupRequired: "group_required",
  AvailableGroupRequired: "available_group_required",
  GroupSelectionRequired: "group_selection_required",
  OneTimeSecretRequired: "one_time_secret_required",
  CreateFailed: "create_failed",
  CreatedTokenSecretUnavailable: "created_token_secret_unavailable",
} as const

export type TokenProvisioningBlockReason =
  (typeof TOKEN_PROVISIONING_BLOCK_REASONS)[keyof typeof TOKEN_PROVISIONING_BLOCK_REASONS]

export type ResolveDefaultTokenCreationRequest = {
  workflow: TokenProvisioningWorkflow
  defaultTokenData: CreateTokenRequest
  explicitGroup?: string
  userGroups?: Record<string, UserGroupInfo>
}

export type DefaultTokenCreationDecision =
  | {
      kind: "create"
      tokenData: CreateTokenRequest
      oneTimeSecret: boolean
      recoverCreatedToken: "created_response_first" | "inventory_refetch"
    }
  | { kind: "needs_user_groups" }
  | {
      kind: "selection_required"
      allowedGroups: string[]
      reason: typeof TOKEN_PROVISIONING_BLOCK_REASONS.GroupSelectionRequired
    }
  | {
      kind: "blocked"
      reason: TokenProvisioningBlockReason
    }

export type CreatedTokenSecretDecision =
  | { kind: "usable"; token: ApiToken; oneTimeSecret: boolean }
  | {
      kind: "failed"
      reason: typeof TOKEN_PROVISIONING_BLOCK_REASONS.CreateFailed
    }
  | {
      kind: "unavailable"
      reason: typeof TOKEN_PROVISIONING_BLOCK_REASONS.CreatedTokenSecretUnavailable
    }
  | { kind: "needs_inventory_refetch" }

export type TokenProvisioningRepairPolicy =
  | { kind: "eligible" }
  | {
      kind: "skipped"
      skipReason: Extract<
        AccountKeyRepairSkipReason,
        "sub2api" | "aihubmixOneTimeKey"
      >
    }

export type TokenProvisioningCapability = {
  isInventoryTokenUsable(params: {
    workflow: TokenProvisioningWorkflow
    token: ApiToken
  }): boolean
  resolveDefaultTokenCreation(
    request: ResolveDefaultTokenCreationRequest,
  ): DefaultTokenCreationDecision
  classifyCreatedToken(params: {
    workflow: TokenProvisioningWorkflow
    result: CreateTokenResult
  }): CreatedTokenSecretDecision
  getRepairPolicy(): TokenProvisioningRepairPolicy
}
```

Modify `src/services/apiAdapters/contracts/siteAdapter.ts`:

```ts
import type { TokenProvisioningCapability } from "./tokenProvisioning"

export type SiteAdapter = {
  siteType: AccountSiteType
  family?: SiteBackendFamily
  siteNotice?: SiteNoticeCapability
  siteAnnouncements?: SiteAnnouncementsCapability
  modelCatalog?: ModelCatalogCapability
  modelPricing?: ModelPricingCapability
  accountData?: AccountDataCapability
  accountBootstrap?: AccountBootstrapCapability
  accountCompletion?: AccountCompletionCapability
  keyManagement?: KeyManagementCapability
  tokenProvisioning?: TokenProvisioningCapability
  accountRefresh?: AccountRefreshCapability
  redemption?: RedemptionCapability
}
```

- [ ] **Step 4: Add concrete policy implementations**

Create `src/services/apiAdapters/newApi/tokenProvisioning.ts`:

```ts
import type { AccountSiteType } from "~/constants/siteType"
import {
  TOKEN_PROVISIONING_BLOCK_REASONS,
  type TokenProvisioningCapability,
} from "~/services/apiAdapters/contracts/tokenProvisioning"
import type { ApiToken } from "~/types"

const isCreatedApiToken = (result: unknown): result is ApiToken =>
  typeof result === "object" &&
  result !== null &&
  "id" in result &&
  "key" in result

export const createNewApiTokenProvisioning = (
  _siteType: AccountSiteType,
): TokenProvisioningCapability => ({
  isInventoryTokenUsable: () => true,
  resolveDefaultTokenCreation: ({ defaultTokenData }) => ({
    kind: "create",
    tokenData: defaultTokenData,
    oneTimeSecret: false,
    recoverCreatedToken: "inventory_refetch",
  }),
  classifyCreatedToken: ({ result }) => {
    if (isCreatedApiToken(result)) {
      return { kind: "usable", token: result, oneTimeSecret: false }
    }

    if (result) {
      return { kind: "needs_inventory_refetch" }
    }

    return {
      kind: "failed",
      reason: TOKEN_PROVISIONING_BLOCK_REASONS.CreateFailed,
    }
  },
  getRepairPolicy: () => ({ kind: "eligible" }),
})
```

Create `src/services/apiAdapters/sub2api/tokenProvisioning.ts`:

```ts
import {
  TOKEN_PROVISIONING_BLOCK_REASONS,
  TOKEN_PROVISIONING_WORKFLOWS,
  type TokenProvisioningCapability,
  type TokenProvisioningWorkflow,
} from "~/services/apiAdapters/contracts/tokenProvisioning"
import type { ApiToken } from "~/types"

const isCreatedApiToken = (result: unknown): result is ApiToken =>
  typeof result === "object" &&
  result !== null &&
  "id" in result &&
  "key" in result

const GROUP_SELECTION_WORKFLOWS = new Set<TokenProvisioningWorkflow>([
  TOKEN_PROVISIONING_WORKFLOWS.QuickCreateSelection,
  TOKEN_PROVISIONING_WORKFLOWS.PostSaveAutomation,
])

export function normalizeTokenProvisioningGroupNames(
  groups: Record<string, unknown>,
): string[] {
  return Array.from(
    new Set(
      Object.keys(groups)
        .map((group) => group.trim())
        .filter(Boolean),
    ),
  )
}

export const sub2ApiTokenProvisioning: TokenProvisioningCapability = {
  isInventoryTokenUsable: () => true,
  resolveDefaultTokenCreation: ({
    workflow,
    defaultTokenData,
    explicitGroup,
    userGroups,
  }) => {
    const normalizedExplicitGroup = explicitGroup?.trim() ?? ""

    if (normalizedExplicitGroup) {
      return {
        kind: "create",
        tokenData: { ...defaultTokenData, group: normalizedExplicitGroup },
        oneTimeSecret: false,
        recoverCreatedToken: "inventory_refetch",
      }
    }

    if (!GROUP_SELECTION_WORKFLOWS.has(workflow)) {
      return {
        kind: "blocked",
        reason: TOKEN_PROVISIONING_BLOCK_REASONS.GroupRequired,
      }
    }

    if (!userGroups) {
      return { kind: "needs_user_groups" }
    }

    const validGroups = normalizeTokenProvisioningGroupNames(userGroups)

    if (validGroups.length === 0) {
      return {
        kind: "blocked",
        reason: TOKEN_PROVISIONING_BLOCK_REASONS.AvailableGroupRequired,
      }
    }

    if (validGroups.length === 1) {
      return {
        kind: "create",
        tokenData: { ...defaultTokenData, group: validGroups[0] },
        oneTimeSecret: false,
        recoverCreatedToken: "inventory_refetch",
      }
    }

    return {
      kind: "selection_required",
      allowedGroups: validGroups,
      reason: TOKEN_PROVISIONING_BLOCK_REASONS.GroupSelectionRequired,
    }
  },
  classifyCreatedToken: ({ result }) => {
    if (isCreatedApiToken(result)) {
      return { kind: "usable", token: result, oneTimeSecret: false }
    }

    if (result) {
      return { kind: "needs_inventory_refetch" }
    }

    return {
      kind: "failed",
      reason: TOKEN_PROVISIONING_BLOCK_REASONS.CreateFailed,
    }
  },
  getRepairPolicy: () => ({ kind: "skipped", skipReason: "sub2api" }),
}
```

Create `src/services/apiAdapters/aihubmix/tokenProvisioning.ts`:

```ts
import {
  hasUsableApiTokenKey,
  isMaskedApiTokenKey,
} from "~/services/apiService/common/apiKey"
import {
  TOKEN_PROVISIONING_BLOCK_REASONS,
  TOKEN_PROVISIONING_WORKFLOWS,
  type TokenProvisioningCapability,
} from "~/services/apiAdapters/contracts/tokenProvisioning"
import type { ApiToken } from "~/types"

const isCreatedApiToken = (result: unknown): result is ApiToken =>
  typeof result === "object" &&
  result !== null &&
  "id" in result &&
  "key" in result

const hasUsableFullTokenSecret = (token: Pick<ApiToken, "key">): boolean =>
  hasUsableApiTokenKey(token.key) && !isMaskedApiTokenKey(token.key)

export const aihubmixTokenProvisioning: TokenProvisioningCapability = {
  isInventoryTokenUsable: ({ token }) => hasUsableFullTokenSecret(token),
  resolveDefaultTokenCreation: ({ workflow, defaultTokenData }) => {
    if (workflow !== TOKEN_PROVISIONING_WORKFLOWS.PostSaveAutomation) {
      return {
        kind: "blocked",
        reason: TOKEN_PROVISIONING_BLOCK_REASONS.OneTimeSecretRequired,
      }
    }

    return {
      kind: "create",
      tokenData: defaultTokenData,
      oneTimeSecret: true,
      recoverCreatedToken: "created_response_first",
    }
  },
  classifyCreatedToken: ({ result }) => {
    if (!result) {
      return {
        kind: "failed",
        reason: TOKEN_PROVISIONING_BLOCK_REASONS.CreateFailed,
      }
    }

    if (isCreatedApiToken(result) && hasUsableFullTokenSecret(result)) {
      return { kind: "usable", token: result, oneTimeSecret: true }
    }

    return {
      kind: "unavailable",
      reason: TOKEN_PROVISIONING_BLOCK_REASONS.CreatedTokenSecretUnavailable,
    }
  },
  getRepairPolicy: () => ({
    kind: "skipped",
    skipReason: "aihubmixOneTimeKey",
  }),
}
```

- [ ] **Step 5: Wire policies into adapters**

Modify `src/services/apiAdapters/newApi/index.ts`:

```ts
import { createNewApiTokenProvisioning } from "./tokenProvisioning"

export const createNewApiAdapter = (
  siteType: AccountSiteType = SITE_TYPES.NEW_API,
): SiteAdapter => ({
  siteType,
  family: "newApiFamily",
  siteNotice: newApiSiteNotice,
  accountData: createNewApiAccountData(siteType),
  accountBootstrap: createNewApiAccountBootstrap(siteType),
  accountCompletion: newApiAccountCompletion,
  keyManagement: createNewApiKeyManagement(siteType),
  tokenProvisioning: createNewApiTokenProvisioning(siteType),
  accountRefresh: createNewApiAccountRefresh(siteType),
  modelPricing: createNewApiModelPricing(siteType),
  redemption: createNewApiRedemption(siteType),
})
```

Modify `src/services/apiAdapters/sub2api/index.ts`:

```ts
import { sub2ApiTokenProvisioning } from "./tokenProvisioning"

export const sub2ApiAdapter: SiteAdapter = {
  siteType: SITE_TYPES.SUB2API,
  family: "sub2api",
  siteAnnouncements: sub2ApiSiteAnnouncements,
  modelCatalog: sub2ApiModelCatalog,
  accountData: sub2ApiAccountData,
  accountBootstrap: sub2ApiAccountBootstrap,
  accountCompletion: sub2ApiAccountCompletion,
  keyManagement: sub2ApiKeyManagement,
  tokenProvisioning: sub2ApiTokenProvisioning,
  accountRefresh: sub2ApiAccountRefresh,
}
```

Modify `src/services/apiAdapters/aihubmix/index.ts`:

```ts
import { aihubmixTokenProvisioning } from "./tokenProvisioning"

export const aihubmixAdapter: SiteAdapter = {
  siteType: SITE_TYPES.AIHUBMIX,
  accountData: aihubmixAccountData,
  accountBootstrap: aihubmixAccountBootstrap,
  accountCompletion: aihubmixAccountCompletion,
  keyManagement: aihubmixKeyManagement,
  tokenProvisioning: aihubmixTokenProvisioning,
  accountRefresh: aihubmixAccountRefresh,
  modelPricing: aihubmixModelPricing,
}
```

- [ ] **Step 6: Run policy and registry tests**

Run:

```powershell
pnpm vitest run tests/services/apiAdapters/tokenProvisioning.test.ts tests/services/apiAdapters/registry.test.ts
```

Expected: PASS.

- [ ] **Step 7: Commit the adapter policy foundation**

Run:

```powershell
git status --porcelain
git add src/services/apiAdapters/contracts/tokenProvisioning.ts src/services/apiAdapters/contracts/siteAdapter.ts src/services/apiAdapters/newApi/tokenProvisioning.ts src/services/apiAdapters/sub2api/tokenProvisioning.ts src/services/apiAdapters/aihubmix/tokenProvisioning.ts src/services/apiAdapters/newApi/index.ts src/services/apiAdapters/sub2api/index.ts src/services/apiAdapters/aihubmix/index.ts tests/services/apiAdapters/tokenProvisioning.test.ts tests/services/apiAdapters/registry.test.ts
git commit -m "feat(api-adapters): add token provisioning policy"
```

Expected: one commit containing only the adapter contract, policy modules, adapter wiring, and adapter tests.

---

### Task 2: Add Shared Token Provisioning Helpers

**Files:**
- Modify: `src/services/accounts/utils/apiServiceRequest.ts`
- Create: `src/services/accounts/utils/tokenProvisioning.ts`
- Modify: `tests/services/accounts/apiServiceRequest.test.ts`

- [ ] **Step 1: Write failing helper tests**

In `tests/services/accounts/apiServiceRequest.test.ts`, extend the test setup:

```ts
let tokenProvisioning: {
  isInventoryTokenUsable: ReturnType<typeof vi.fn>
  resolveDefaultTokenCreation: ReturnType<typeof vi.fn>
  classifyCreatedToken: ReturnType<typeof vi.fn>
  getRepairPolicy: ReturnType<typeof vi.fn>
}

beforeEach(() => {
  tokenProvisioning = {
    isInventoryTokenUsable: vi.fn(),
    resolveDefaultTokenCreation: vi.fn(),
    classifyCreatedToken: vi.fn(),
    getRepairPolicy: vi.fn(),
  }
  adapter = { siteType: "new-api", keyManagement, tokenProvisioning }
})
```

Update the existing `createDisplayAccountApiContext(...)` expectation:

```ts
expect(createDisplayAccountApiContext(ACCOUNT as any)).toEqual({
  adapter,
  keyManagement,
  tokenProvisioning,
  request: expect.objectContaining(REQUEST),
})
```

Add a missing-capability test:

```ts
it("throws when adapter token provisioning is not implemented", async () => {
  const { requireDisplayAccountTokenProvisioning } = await import(
    "~/services/accounts/utils/apiServiceRequest"
  )

  expect(() =>
    requireDisplayAccountTokenProvisioning(
      { siteType: "unsupported" } as any,
      undefined,
    ),
  ).toThrow("tokenProvisioning is not implemented for unsupported")
})
```

- [ ] **Step 2: Run the failing helper tests**

Run:

```powershell
pnpm vitest run tests/services/accounts/apiServiceRequest.test.ts
```

Expected: FAIL because `createDisplayAccountApiContext(...)` does not return `tokenProvisioning` and `requireDisplayAccountTokenProvisioning(...)` is not exported.

- [ ] **Step 3: Implement the context helper**

In `src/services/accounts/utils/apiServiceRequest.ts`, add:

```ts
import type { TokenProvisioningCapability } from "~/services/apiAdapters/contracts/tokenProvisioning"

export const createMissingTokenProvisioningCapabilityError = (
  siteType: string,
) => new Error(`tokenProvisioning is not implemented for ${siteType}`)

export const requireDisplayAccountTokenProvisioning = (
  account: Pick<DisplaySiteData, "siteType">,
  tokenProvisioning: TokenProvisioningCapability | undefined,
): TokenProvisioningCapability => {
  if (!tokenProvisioning) {
    throw createMissingTokenProvisioningCapabilityError(account.siteType)
  }

  return tokenProvisioning
}
```

Update `createDisplayAccountApiContext(...)` to return the policy reference:

```ts
export function createDisplayAccountApiContext(account: DisplaySiteData) {
  const adapter = getSiteAdapter(account.siteType)
  const request = withDisplayAccountAuthSession(account, {
    baseUrl: account.baseUrl,
    accountId: account.id,
    auth: buildDisplayAccountAuthConfig(account),
  })

  return {
    adapter,
    keyManagement: adapter.keyManagement,
    tokenProvisioning: adapter.tokenProvisioning,
    request,
  }
}
```

- [ ] **Step 4: Add the user-group re-resolution helper**

Create `src/services/accounts/utils/tokenProvisioning.ts`:

```ts
import type { KeyManagementCapability } from "~/services/apiAdapters/contracts/keyManagement"
import type {
  DefaultTokenCreationDecision,
  ResolveDefaultTokenCreationRequest,
  TokenProvisioningCapability,
} from "~/services/apiAdapters/contracts/tokenProvisioning"
import type { ApiServiceRequest } from "~/services/apiTransport/type"

export async function resolveDefaultTokenCreationWithUserGroups(params: {
  keyManagement: KeyManagementCapability
  tokenProvisioning: TokenProvisioningCapability
  request: ApiServiceRequest
  decisionRequest: ResolveDefaultTokenCreationRequest
  missingUserGroupsMessage: string
}): Promise<DefaultTokenCreationDecision> {
  const decision = params.tokenProvisioning.resolveDefaultTokenCreation(
    params.decisionRequest,
  )

  if (decision.kind !== "needs_user_groups") {
    return decision
  }

  if (!params.keyManagement.userGroups) {
    throw new Error(params.missingUserGroupsMessage)
  }

  const userGroups = await params.keyManagement.userGroups.fetch(params.request)

  return params.tokenProvisioning.resolveDefaultTokenCreation({
    ...params.decisionRequest,
    userGroups,
  })
}
```

- [ ] **Step 5: Run helper tests**

Run:

```powershell
pnpm vitest run tests/services/accounts/apiServiceRequest.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit the shared helpers**

Run:

```powershell
git status --porcelain
git add src/services/accounts/utils/apiServiceRequest.ts src/services/accounts/utils/tokenProvisioning.ts tests/services/accounts/apiServiceRequest.test.ts
git commit -m "feat(accounts): add token provisioning helpers"
```

Expected: one commit containing only the helper changes and focused tests.

---

### Task 3: Route Post-Save Account Token Ensure Through Policy

**Files:**
- Modify: `src/services/accounts/accountPostSaveWorkflow/ensureAccountToken.ts`
- Modify: `tests/services/accountPostSaveWorkflow.ensureAccountToken.test.ts`

- [ ] **Step 1: Update the post-save test adapter mock**

In `tests/services/accountPostSaveWorkflow.ensureAccountToken.test.ts`, extend hoisted mocks:

```ts
const mocks = vi.hoisted(() => ({
  fetchAccountTokens: vi.fn(),
  createApiToken: vi.fn(),
  fetchUserGroups: vi.fn(),
  isInventoryTokenUsable: vi.fn(),
  resolveDefaultTokenCreation: vi.fn(),
  classifyCreatedToken: vi.fn(),
  getRepairPolicy: vi.fn(),
}))
```

Update the adapter mock:

```ts
vi.mock("~/services/apiAdapters/registry", () => ({
  getSiteAdapter: vi.fn(() => ({
    keyManagement: {
      fetchTokens: (...args: unknown[]) => mocks.fetchAccountTokens(...args),
      createToken: (...args: unknown[]) => mocks.createApiToken(...args),
      userGroups: {
        fetch: (...args: unknown[]) => mocks.fetchUserGroups(...args),
      },
      updateToken: vi.fn(),
      resolveTokenKey: vi.fn(),
      deleteToken: vi.fn(),
      fetchAvailableModels: vi.fn(),
    },
    tokenProvisioning: {
      isInventoryTokenUsable: (...args: unknown[]) =>
        mocks.isInventoryTokenUsable(...args),
      resolveDefaultTokenCreation: (...args: unknown[]) =>
        mocks.resolveDefaultTokenCreation(...args),
      classifyCreatedToken: (...args: unknown[]) =>
        mocks.classifyCreatedToken(...args),
      getRepairPolicy: (...args: unknown[]) => mocks.getRepairPolicy(...args),
    },
  })),
}))
```

Set default policy behavior in `beforeEach`:

```ts
mocks.isInventoryTokenUsable.mockImplementation(({ token }) => Boolean(token.key))
mocks.resolveDefaultTokenCreation.mockImplementation(({ defaultTokenData }) => ({
  kind: "create",
  tokenData: defaultTokenData,
  oneTimeSecret: false,
  recoverCreatedToken: "inventory_refetch",
}))
mocks.classifyCreatedToken.mockImplementation(({ result }) =>
  typeof result === "object" && result !== null
    ? { kind: "usable", token: result, oneTimeSecret: false }
    : result
      ? { kind: "needs_inventory_refetch" }
      : { kind: "failed", reason: "create_failed" },
)
```

Add one routing assertion to an existing creates-token test:

```ts
expect(mocks.resolveDefaultTokenCreation).toHaveBeenCalledWith(
  expect.objectContaining({
    workflow: "post_save_automation",
    defaultTokenData: expect.objectContaining({
      name: "All API Hub Auto Provisioned Key",
    }),
  }),
)
expect(mocks.classifyCreatedToken).toHaveBeenCalledWith(
  expect.objectContaining({
    workflow: "post_save_automation",
  }),
)
```

- [ ] **Step 2: Run the failing post-save tests**

Run:

```powershell
pnpm vitest run tests/services/accountPostSaveWorkflow.ensureAccountToken.test.ts
```

Expected: FAIL because the workflow still uses raw site-type branches and does not call `tokenProvisioning`.

- [ ] **Step 3: Route inventory and creation through policy**

In `src/services/accounts/accountPostSaveWorkflow/ensureAccountToken.ts`, import:

```ts
import {
  TOKEN_PROVISIONING_BLOCK_REASONS,
  TOKEN_PROVISIONING_WORKFLOWS,
  type DefaultTokenCreationDecision,
} from "~/services/apiAdapters/contracts/tokenProvisioning"
import {
  createDisplayAccountApiContext,
  requireDisplayAccountKeyManagement,
  requireDisplayAccountTokenProvisioning,
} from "~/services/accounts/utils/apiServiceRequest"
import { resolveDefaultTokenCreationWithUserGroups } from "~/services/accounts/utils/tokenProvisioning"
```

Add workflow-local result mapping:

```ts
const mapBlockedDecisionToPostSaveError = (
  decision: Extract<DefaultTokenCreationDecision, { kind: "blocked" }>,
) => ({
  kind: ENSURE_ACCOUNT_TOKEN_RESULT_KINDS.Error,
  code:
    decision.reason ===
      TOKEN_PROVISIONING_BLOCK_REASONS.OneTimeSecretRequired ||
    decision.reason ===
      TOKEN_PROVISIONING_BLOCK_REASONS.CreatedTokenSecretUnavailable
      ? ACCOUNT_POST_SAVE_WORKFLOW_ERROR_CODES.TokenSecretUnavailable
      : ACCOUNT_POST_SAVE_WORKFLOW_ERROR_CODES.TokenCreationFailed,
  message:
    decision.reason === TOKEN_PROVISIONING_BLOCK_REASONS.OneTimeSecretRequired
      ? "messages:aihubmix.createRequiresOneTimeKeyDialog"
      : decision.reason ===
          TOKEN_PROVISIONING_BLOCK_REASONS.AvailableGroupRequired
        ? "messages:sub2api.createRequiresAvailableGroup"
        : "messages:accountOperations.createTokenFailed",
})
```

When resolving the adapter context, require both capabilities:

```ts
const { keyManagement, request, tokenProvisioning } =
  createDisplayAccountApiContext(displaySiteData)
const requiredKeyManagement = requireDisplayAccountKeyManagement(
  displaySiteData,
  keyManagement,
)
const requiredTokenProvisioning = requireDisplayAccountTokenProvisioning(
  displaySiteData,
  tokenProvisioning,
)
```

In inventory inspection, replace the AIHubMix key check with:

```ts
const hasUsableSecret =
  existingToken !== null &&
  requiredTokenProvisioning.isInventoryTokenUsable({
    workflow: TOKEN_PROVISIONING_WORKFLOWS.PostSaveAutomation,
    token: existingToken,
  })
```

In token creation, replace Sub2API and AIHubMix site-type branches with:

```ts
const decision = await resolveDefaultTokenCreationWithUserGroups({
  keyManagement: requiredKeyManagement,
  tokenProvisioning: requiredTokenProvisioning,
  request,
  decisionRequest: {
    workflow: TOKEN_PROVISIONING_WORKFLOWS.PostSaveAutomation,
    defaultTokenData: generateDefaultTokenRequest(),
  },
  missingUserGroupsMessage: "sub2api_group_inventory_not_implemented",
})

if (decision.kind === "selection_required") {
  return {
    kind: ENSURE_ACCOUNT_TOKEN_RESULT_KINDS.Sub2ApiSelectionRequired,
    allowedGroups: decision.allowedGroups,
  }
}

if (decision.kind === "blocked") {
  return mapBlockedDecisionToPostSaveError(decision)
}

if (decision.kind === "needs_user_groups") {
  return {
    kind: ENSURE_ACCOUNT_TOKEN_RESULT_KINDS.Error,
    code: ACCOUNT_POST_SAVE_WORKFLOW_ERROR_CODES.TokenCreationFailed,
    message: "messages:sub2api.createRequiresAvailableGroup",
  }
}

const createResult = await requiredKeyManagement.createToken(
  request,
  decision.tokenData,
)
const createdTokenDecision = requiredTokenProvisioning.classifyCreatedToken({
  workflow: TOKEN_PROVISIONING_WORKFLOWS.PostSaveAutomation,
  result: createResult,
})
```

Handle created-token classification:

```ts
if (createdTokenDecision.kind === "usable") {
  return {
    kind: ENSURE_ACCOUNT_TOKEN_RESULT_KINDS.Created,
    token: createdTokenDecision.token,
    oneTimeSecret: createdTokenDecision.oneTimeSecret,
  }
}

if (createdTokenDecision.kind === "failed") {
  return {
    kind: ENSURE_ACCOUNT_TOKEN_RESULT_KINDS.Error,
    code: ACCOUNT_POST_SAVE_WORKFLOW_ERROR_CODES.TokenCreationFailed,
    message: "messages:accountOperations.createTokenFailed",
  }
}

if (createdTokenDecision.kind === "unavailable") {
  return {
    kind: ENSURE_ACCOUNT_TOKEN_RESULT_KINDS.Error,
    code: ACCOUNT_POST_SAVE_WORKFLOW_ERROR_CODES.TokenSecretUnavailable,
    message: "messages:aihubmix.createRequiresOneTimeKeyDialog",
  }
}

const refreshedInventory = await inspectAccountTokenInventory({
  keyManagement: requiredKeyManagement,
  request,
  tokenProvisioning: requiredTokenProvisioning,
})
```

- [ ] **Step 4: Run post-save tests**

Run:

```powershell
pnpm vitest run tests/services/accountPostSaveWorkflow.ensureAccountToken.test.ts
```

Expected: PASS with unchanged external result kinds and messages.

- [ ] **Step 5: Commit the post-save routing**

Run:

```powershell
git status --porcelain
git add src/services/accounts/accountPostSaveWorkflow/ensureAccountToken.ts tests/services/accountPostSaveWorkflow.ensureAccountToken.test.ts
git commit -m "refactor(accounts): route post-save token policy through adapters"
```

Expected: one commit containing only post-save workflow and test changes.

---

### Task 4: Route Background And Shared Default Token Ensure Through Policy

**Files:**
- Modify: `src/services/accounts/accountKeyAutoProvisioning/ensureDefaultToken.ts`
- Modify: `src/services/accounts/accountOperations.ts`
- Modify: `tests/services/accountOperations.ensureAccountApiToken.test.ts`

- [ ] **Step 1: Add shared-ensure tests for generic policy routing**

In `tests/services/accountOperations.ensureAccountApiToken.test.ts`, update the adapter mock to include `tokenProvisioning`:

```ts
tokenProvisioning: {
  isInventoryTokenUsable: vi.fn(() => true),
  resolveDefaultTokenCreation: (...args: unknown[]) =>
    mocks.resolveDefaultTokenCreation(...args),
  classifyCreatedToken: (...args: unknown[]) =>
    mocks.classifyCreatedToken(...args),
  getRepairPolicy: vi.fn(() => ({ kind: "eligible" })),
}
```

Set defaults in `beforeEach`:

```ts
mocks.resolveDefaultTokenCreation.mockImplementation(({ defaultTokenData }) => ({
  kind: "create",
  tokenData: defaultTokenData,
  oneTimeSecret: false,
  recoverCreatedToken: "inventory_refetch",
}))
mocks.classifyCreatedToken.mockImplementation(({ result }) =>
  typeof result === "object" && result !== null
    ? { kind: "usable", token: result, oneTimeSecret: false }
    : result
      ? { kind: "needs_inventory_refetch" }
      : { kind: "failed", reason: "create_failed" },
)
```

Add a routing assertion to the grouped Sub2API creation test:

```ts
expect(mocks.resolveDefaultTokenCreation).toHaveBeenCalledWith(
  expect.objectContaining({
    workflow: "shared_ensure",
    explicitGroup: "vip",
  }),
)
expect(mocks.createApiToken).toHaveBeenCalledWith(
  expect.any(Object),
  expect.objectContaining({ group: "vip" }),
)
```

Add a generic quick-create resolver test:

```ts
it("resolves quick-create group selection through token provisioning policy", async () => {
  mocks.resolveDefaultTokenCreation
    .mockReturnValueOnce({ kind: "needs_user_groups" })
    .mockReturnValueOnce({
      kind: "selection_required",
      allowedGroups: ["default", "vip"],
      reason: "group_selection_required",
    })
  mocks.fetchUserGroups.mockResolvedValueOnce({
    default: { desc: "Default", ratio: 1 },
    vip: { desc: "VIP", ratio: 1 },
  })

  const { resolveDefaultTokenQuickCreateResolution } = await import(
    "~/services/accounts/accountOperations"
  )

  await expect(
    resolveDefaultTokenQuickCreateResolution(DISPLAY_ACCOUNT),
  ).resolves.toEqual({
    kind: "selection_required",
    allowedGroups: ["default", "vip"],
  })
})
```

- [ ] **Step 2: Run the failing shared-ensure tests**

Run:

```powershell
pnpm vitest run tests/services/accountOperations.ensureAccountApiToken.test.ts
```

Expected: FAIL because `accountOperations.ts` does not export `resolveDefaultTokenQuickCreateResolution(...)` and does not call `tokenProvisioning`.

- [ ] **Step 3: Route background default ensure through policy**

In `src/services/accounts/accountKeyAutoProvisioning/ensureDefaultToken.ts`, import policy helpers:

```ts
import {
  TOKEN_PROVISIONING_BLOCK_REASONS,
  TOKEN_PROVISIONING_WORKFLOWS,
} from "~/services/apiAdapters/contracts/tokenProvisioning"
import {
  requireDisplayAccountKeyManagement,
  requireDisplayAccountTokenProvisioning,
} from "~/services/accounts/utils/apiServiceRequest"
```

After resolving adapter context, require policy:

```ts
const tokenProvisioning = requireDisplayAccountTokenProvisioning(
  displaySiteData,
  adapter.tokenProvisioning,
)
```

Replace the Sub2API and AIHubMix site-type block before create with:

```ts
const decision = tokenProvisioning.resolveDefaultTokenCreation({
  workflow: TOKEN_PROVISIONING_WORKFLOWS.BackgroundAutoProvision,
  defaultTokenData: generateDefaultTokenRequest(),
})

if (decision.kind !== "create") {
  if (
    decision.kind === "blocked" &&
    decision.reason === TOKEN_PROVISIONING_BLOCK_REASONS.OneTimeSecretRequired
  ) {
    throw new Error("messages:aihubmix.createRequiresOneTimeKeyDialog")
  }

  throw new Error("messages:sub2api.createRequiresGroup")
}

const createResult = await keyManagement.createToken(request, decision.tokenData)
const createdTokenDecision = tokenProvisioning.classifyCreatedToken({
  workflow: TOKEN_PROVISIONING_WORKFLOWS.BackgroundAutoProvision,
  result: createResult,
})

if (createdTokenDecision.kind === "failed") {
  throw new Error("create_token_failed")
}
```

When deciding whether to refetch inventory:

```ts
if (createdTokenDecision.kind === "usable") {
  return createdTokenDecision.token
}

if (createdTokenDecision.kind === "unavailable") {
  throw new Error("token_not_found")
}

const refreshedTokens = await keyManagement.fetchTokens(request)
```

- [ ] **Step 4: Add generic quick-create resolver and route shared ensure**

In `src/services/accounts/accountOperations.ts`, add imports:

```ts
import {
  TOKEN_PROVISIONING_BLOCK_REASONS,
  TOKEN_PROVISIONING_WORKFLOWS,
  type TokenProvisioningBlockReason,
} from "~/services/apiAdapters/contracts/tokenProvisioning"
import { resolveDefaultTokenCreationWithUserGroups } from "~/services/accounts/utils/tokenProvisioning"
```

Add result types:

```ts
export type DefaultTokenQuickCreateResolution =
  | { kind: "ready"; tokenData: CreateTokenRequest }
  | { kind: "selection_required"; allowedGroups: string[] }
  | {
      kind: "blocked"
      reason: TokenProvisioningBlockReason
      message: string
    }
```

Add reason-to-message mapping:

```ts
const getDefaultTokenProvisioningBlockMessage = (
  reason: TokenProvisioningBlockReason,
): string => {
  if (reason === TOKEN_PROVISIONING_BLOCK_REASONS.AvailableGroupRequired) {
    return "messages:sub2api.createRequiresAvailableGroup"
  }

  if (reason === TOKEN_PROVISIONING_BLOCK_REASONS.OneTimeSecretRequired) {
    return "messages:aihubmix.createRequiresOneTimeKeyDialog"
  }

  return "messages:sub2api.createRequiresGroup"
}
```

Add generic quick-create resolution:

```ts
export async function resolveDefaultTokenQuickCreateResolution(
  account: DisplaySiteData,
  options: { explicitGroup?: string } = {},
): Promise<DefaultTokenQuickCreateResolution> {
  const { keyManagement, request, tokenProvisioning } =
    createDisplayAccountApiContext(account)
  const requiredKeyManagement = requireDisplayAccountKeyManagement(
    account,
    keyManagement,
  )
  const requiredTokenProvisioning = requireDisplayAccountTokenProvisioning(
    account,
    tokenProvisioning,
  )
  const decision = await resolveDefaultTokenCreationWithUserGroups({
    keyManagement: requiredKeyManagement,
    tokenProvisioning: requiredTokenProvisioning,
    request,
    decisionRequest: {
      workflow: TOKEN_PROVISIONING_WORKFLOWS.QuickCreateSelection,
      defaultTokenData: generateDefaultTokenRequest(),
      explicitGroup: options.explicitGroup,
    },
    missingUserGroupsMessage: "sub2api_group_inventory_not_implemented",
  })

  if (decision.kind === "create") {
    return { kind: "ready", tokenData: decision.tokenData }
  }

  if (decision.kind === "selection_required") {
    return {
      kind: "selection_required",
      allowedGroups: decision.allowedGroups,
    }
  }

  if (decision.kind === "needs_user_groups") {
    throw new Error("sub2api_group_inventory_not_implemented")
  }

  return {
    kind: "blocked",
    reason: decision.reason,
    message: getDefaultTokenProvisioningBlockMessage(decision.reason),
  }
}
```

Keep the compatibility wrapper:

```ts
export async function resolveSub2ApiQuickCreateResolution(
  account: DisplaySiteData,
): Promise<Sub2ApiQuickCreateResolution> {
  if (account.siteType !== SITE_TYPES.SUB2API) {
    throw new Error("sub2api_quick_create_not_applicable")
  }

  const resolution = await resolveDefaultTokenQuickCreateResolution(account)

  if (resolution.kind === "ready") {
    return { kind: "ready", group: resolution.tokenData.group }
  }

  if (resolution.kind === "selection_required") {
    return {
      kind: "selection_required",
      allowedGroups: resolution.allowedGroups,
    }
  }

  return { kind: "blocked", message: resolution.message }
}
```

In `ensureAccountApiToken(...)`, replace site-type creation branches with:

```ts
const decision = requiredTokenProvisioning.resolveDefaultTokenCreation({
  workflow: TOKEN_PROVISIONING_WORKFLOWS.SharedEnsure,
  defaultTokenData: generateDefaultTokenRequest(),
  explicitGroup: options.sub2apiGroup,
})

if (decision.kind !== "create") {
  if (
    decision.kind === "blocked" &&
    decision.reason === TOKEN_PROVISIONING_BLOCK_REASONS.OneTimeSecretRequired
  ) {
    throw new Error("messages:aihubmix.createRequiresOneTimeKeyDialog")
  }

  throw new Error("messages:sub2api.createRequiresGroup")
}

const createResult = await keyManagement.createToken(createRequest, decision.tokenData)
const createdTokenDecision = requiredTokenProvisioning.classifyCreatedToken({
  workflow: TOKEN_PROVISIONING_WORKFLOWS.SharedEnsure,
  result: createResult,
})
```

Return created or refetched tokens:

```ts
if (createdTokenDecision.kind === "usable") {
  return createdTokenDecision.token
}

if (createdTokenDecision.kind === "failed") {
  throw new Error("messages:accountOperations.createTokenFailed")
}

if (createdTokenDecision.kind === "unavailable") {
  throw new Error("messages:aihubmix.createRequiresOneTimeKeyDialog")
}

const refreshedTokens = await keyManagement.fetchTokens(displayRequest)
```

- [ ] **Step 5: Run shared ensure tests**

Run:

```powershell
pnpm vitest run tests/services/accountOperations.ensureAccountApiToken.test.ts
```

Expected: PASS.

- [ ] **Step 6: Run related default-token tests**

Run:

```powershell
pnpm vitest related --run src/services/accounts/accountKeyAutoProvisioning/ensureDefaultToken.ts src/services/accounts/accountOperations.ts tests/services/accountOperations.ensureAccountApiToken.test.ts
```

Expected: PASS.

- [ ] **Step 7: Commit background and shared ensure routing**

Run:

```powershell
git status --porcelain
git add src/services/accounts/accountKeyAutoProvisioning/ensureDefaultToken.ts src/services/accounts/accountOperations.ts tests/services/accountOperations.ensureAccountApiToken.test.ts
git commit -m "refactor(accounts): route default token creation policy through adapters"
```

Expected: one commit containing only background/shared default-token routing and tests.

---

### Task 5: Route Group Coverage And Repair Through Policy

**Files:**
- Modify: `src/services/accounts/accountKeyAutoProvisioning/groupCoverage.ts`
- Modify: `src/services/accounts/accountKeyAutoProvisioning/repair.ts`
- Modify: `tests/services/accountKeyGroupCoverage.test.ts`
- Modify: `tests/services/accountKeyRepair.test.ts`

- [ ] **Step 1: Update group coverage tests for policy routing**

In `tests/services/accountKeyGroupCoverage.test.ts`, extend the adapter mock:

```ts
tokenProvisioning: {
  isInventoryTokenUsable: vi.fn(() => true),
  resolveDefaultTokenCreation: (...args: unknown[]) =>
    mocks.resolveDefaultTokenCreation(...args),
  classifyCreatedToken: (...args: unknown[]) =>
    mocks.classifyCreatedToken(...args),
  getRepairPolicy: vi.fn(() => ({ kind: "eligible" })),
}
```

Set defaults:

```ts
mocks.resolveDefaultTokenCreation.mockImplementation(({ defaultTokenData }) => ({
  kind: "create",
  tokenData: defaultTokenData,
  oneTimeSecret: false,
  recoverCreatedToken: "inventory_refetch",
}))
mocks.classifyCreatedToken.mockReturnValue({ kind: "needs_inventory_refetch" })
```

Add a route assertion to the empty-group fallback test:

```ts
expect(mocks.resolveDefaultTokenCreation).toHaveBeenCalledWith(
  expect.objectContaining({
    workflow: "repair",
    defaultTokenData: generateDefaultTokenRequest(),
  }),
)
```

- [ ] **Step 2: Update repair tests for policy skip routing**

In `tests/services/accountKeyRepair.test.ts`, mock `getSiteAdapter` so Sub2API and AIHubMix return policy skip decisions:

```ts
vi.mock("~/services/apiAdapters/registry", () => ({
  getSiteAdapter: vi.fn((siteType: string) => ({
    siteType,
    tokenProvisioning:
      siteType === SITE_TYPES.SUB2API
        ? {
            getRepairPolicy: () => ({
              kind: "skipped",
              skipReason: "sub2api",
            }),
          }
        : siteType === SITE_TYPES.AIHUBMIX
          ? {
              getRepairPolicy: () => ({
                kind: "skipped",
                skipReason: "aihubmixOneTimeKey",
              }),
            }
          : {
              getRepairPolicy: () => ({ kind: "eligible" }),
            },
  })),
}))
```

Keep existing expectations:

```ts
expect(progress.results).toEqual(
  expect.arrayContaining([
    expect.objectContaining({
      accountId: "sub2api-1",
      outcome: "skipped",
      skipReason: "sub2api",
    }),
    expect.objectContaining({
      accountId: "aihubmix-1",
      outcome: "skipped",
      skipReason: "aihubmixOneTimeKey",
    }),
  ]),
)
```

- [ ] **Step 3: Run the failing group coverage and repair tests**

Run:

```powershell
pnpm vitest run tests/services/accountKeyGroupCoverage.test.ts tests/services/accountKeyRepair.test.ts
```

Expected: FAIL because group coverage and repair still branch on raw site types.

- [ ] **Step 4: Route group coverage empty-group fallback through policy**

In `src/services/accounts/accountKeyAutoProvisioning/groupCoverage.ts`, import:

```ts
import {
  TOKEN_PROVISIONING_BLOCK_REASONS,
  TOKEN_PROVISIONING_WORKFLOWS,
} from "~/services/apiAdapters/contracts/tokenProvisioning"
import { requireDisplayAccountTokenProvisioning } from "~/services/accounts/utils/apiServiceRequest"
```

After resolving `keyManagement`, require policy:

```ts
const tokenProvisioning = requireDisplayAccountTokenProvisioning(
  displaySiteData,
  adapter.tokenProvisioning,
)
```

Replace the no-token empty-group site-type branch with:

```ts
const decision = tokenProvisioning.resolveDefaultTokenCreation({
  workflow: TOKEN_PROVISIONING_WORKFLOWS.Repair,
  defaultTokenData: generateDefaultTokenRequest(),
})

if (decision.kind !== "create") {
  if (
    decision.kind === "blocked" &&
    decision.reason === TOKEN_PROVISIONING_BLOCK_REASONS.OneTimeSecretRequired
  ) {
    throw new Error("messages:aihubmix.createRequiresOneTimeKeyDialog")
  }

  throw new Error("messages:sub2api.createRequiresGroup")
}

const createResult = await keyManagement.createToken(request, decision.tokenData)
const createdTokenDecision = tokenProvisioning.classifyCreatedToken({
  workflow: TOKEN_PROVISIONING_WORKFLOWS.Repair,
  result: createResult,
})

if (createdTokenDecision.kind === "failed") {
  throw new Error("create_token_failed")
}
```

Preserve the returned result shape:

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

- [ ] **Step 5: Route repair skip reason through policy**

In `src/services/accounts/accountKeyAutoProvisioning/repair.ts`, import:

```ts
import { getSiteAdapter } from "~/services/apiAdapters/registry"
```

Replace the Sub2API and AIHubMix branches in `getSkipReason(...)` with:

```ts
function getSkipReason(
  account: SiteAccount,
): AccountKeyRepairSkipReason | null {
  const policy = getSiteAdapter(account.site_type).tokenProvisioning
    ?.getRepairPolicy()

  if (policy?.kind === "skipped") {
    return policy.skipReason
  }

  if (account.authType === AuthTypeEnum.None) {
    return "noneAuth"
  }

  return null
}
```

- [ ] **Step 6: Run group coverage and repair tests**

Run:

```powershell
pnpm vitest run tests/services/accountKeyGroupCoverage.test.ts tests/services/accountKeyRepair.test.ts
```

Expected: PASS.

- [ ] **Step 7: Commit group coverage and repair routing**

Run:

```powershell
git status --porcelain
git add src/services/accounts/accountKeyAutoProvisioning/groupCoverage.ts src/services/accounts/accountKeyAutoProvisioning/repair.ts tests/services/accountKeyGroupCoverage.test.ts tests/services/accountKeyRepair.test.ts
git commit -m "refactor(accounts): use token provisioning policy for key repair"
```

Expected: one commit containing only group coverage, repair, and focused tests.

---

### Task 6: Final Validation And Scope Audit

**Files:**
- No new source files beyond prior tasks.
- Validate all task-scoped files and inspect the final diff.

- [ ] **Step 1: Run focused policy and workflow tests**

Run:

```powershell
pnpm vitest run tests/services/apiAdapters/tokenProvisioning.test.ts tests/services/apiAdapters/registry.test.ts tests/services/accounts/apiServiceRequest.test.ts tests/services/accountPostSaveWorkflow.ensureAccountToken.test.ts tests/services/accountOperations.ensureAccountApiToken.test.ts tests/services/accountKeyGroupCoverage.test.ts tests/services/accountKeyRepair.test.ts
```

Expected: PASS.

- [ ] **Step 2: Run related validation**

Run:

```powershell
pnpm vitest related --run src/services/apiAdapters/contracts/tokenProvisioning.ts src/services/apiAdapters/contracts/siteAdapter.ts src/services/apiAdapters/newApi/tokenProvisioning.ts src/services/apiAdapters/sub2api/tokenProvisioning.ts src/services/apiAdapters/aihubmix/tokenProvisioning.ts src/services/accounts/utils/apiServiceRequest.ts src/services/accounts/utils/tokenProvisioning.ts src/services/accounts/accountPostSaveWorkflow/ensureAccountToken.ts src/services/accounts/accountKeyAutoProvisioning/ensureDefaultToken.ts src/services/accounts/accountKeyAutoProvisioning/groupCoverage.ts src/services/accounts/accountKeyAutoProvisioning/repair.ts src/services/accounts/accountOperations.ts
```

Expected: PASS.

- [ ] **Step 3: Run the commit gate**

Stage only task-scoped files, then run:

```powershell
pnpm run validate:staged
```

Expected: PASS.

- [ ] **Step 4: Run the push gate before PR or push**

Run:

```powershell
pnpm run validate:push
```

Expected: PASS. This gate is required before publishing because the slice changes shared adapter contracts and account workflow routing.

- [ ] **Step 5: Inspect final scope**

Run:

```powershell
git status --porcelain
git diff --stat HEAD~5..HEAD
git diff --name-only HEAD~5..HEAD
```

Expected changed paths are limited to:

```text
src/services/apiAdapters/contracts/tokenProvisioning.ts
src/services/apiAdapters/contracts/siteAdapter.ts
src/services/apiAdapters/newApi/tokenProvisioning.ts
src/services/apiAdapters/sub2api/tokenProvisioning.ts
src/services/apiAdapters/aihubmix/tokenProvisioning.ts
src/services/apiAdapters/newApi/index.ts
src/services/apiAdapters/sub2api/index.ts
src/services/apiAdapters/aihubmix/index.ts
src/services/accounts/utils/apiServiceRequest.ts
src/services/accounts/utils/tokenProvisioning.ts
src/services/accounts/accountPostSaveWorkflow/ensureAccountToken.ts
src/services/accounts/accountKeyAutoProvisioning/ensureDefaultToken.ts
src/services/accounts/accountKeyAutoProvisioning/groupCoverage.ts
src/services/accounts/accountKeyAutoProvisioning/repair.ts
src/services/accounts/accountOperations.ts
tests/services/apiAdapters/tokenProvisioning.test.ts
tests/services/apiAdapters/registry.test.ts
tests/services/accounts/apiServiceRequest.test.ts
tests/services/accountPostSaveWorkflow.ensureAccountToken.test.ts
tests/services/accountOperations.ensureAccountApiToken.test.ts
tests/services/accountKeyGroupCoverage.test.ts
tests/services/accountKeyRepair.test.ts
```

No locale, telemetry, settings search, Playwright, managed-site, `apiService/**`, or new site-type files should appear.

- [ ] **Step 6: Final commit or PR handoff**

If all task commits already exist, do not squash locally unless the publication workflow requires it. If this plan is executed as one integrated branch and the previous task commits were not made, commit the final isolated diff:

```powershell
git add src/services/apiAdapters/contracts/tokenProvisioning.ts src/services/apiAdapters/contracts/siteAdapter.ts src/services/apiAdapters/newApi/tokenProvisioning.ts src/services/apiAdapters/sub2api/tokenProvisioning.ts src/services/apiAdapters/aihubmix/tokenProvisioning.ts src/services/apiAdapters/newApi/index.ts src/services/apiAdapters/sub2api/index.ts src/services/apiAdapters/aihubmix/index.ts src/services/accounts/utils/apiServiceRequest.ts src/services/accounts/utils/tokenProvisioning.ts src/services/accounts/accountPostSaveWorkflow/ensureAccountToken.ts src/services/accounts/accountKeyAutoProvisioning/ensureDefaultToken.ts src/services/accounts/accountKeyAutoProvisioning/groupCoverage.ts src/services/accounts/accountKeyAutoProvisioning/repair.ts src/services/accounts/accountOperations.ts tests/services/apiAdapters/tokenProvisioning.test.ts tests/services/apiAdapters/registry.test.ts tests/services/accounts/apiServiceRequest.test.ts tests/services/accountPostSaveWorkflow.ensureAccountToken.test.ts tests/services/accountOperations.ensureAccountApiToken.test.ts tests/services/accountKeyGroupCoverage.test.ts tests/services/accountKeyRepair.test.ts
git commit -m "refactor(api-adapters): centralize token provisioning policy"
```

Expected: either the task commits are already present, or one final commit contains only the listed task-scoped files.

---

## Self-Review Checklist

- Spec coverage:
  - Adds `tokenProvisioning` policy capability: Task 1.
  - Keeps token CRUD in `keyManagement`: all tasks use `keyManagement` for list/create/delete and policy only for decisions.
  - New API-family policy: Task 1.
  - Sub2API group policy and compatibility wrapper: Tasks 1 and 4.
  - AIHubMix one-time-secret policy: Tasks 1, 3, and 4.
  - Post-save, background, shared ensure, group coverage, and repair routing: Tasks 3, 4, and 5.
  - No UI copy, locale, telemetry, settings, Playwright, managed-site, or new site-type changes: File Structure and Task 6.
- Type consistency:
  - `TOKEN_PROVISIONING_WORKFLOWS.QuickCreateSelection` is intentionally added beyond the spec draft to keep interactive group selection separate from non-interactive shared ensure.
  - `DefaultTokenCreationDecision.kind === "needs_user_groups"` is intentionally added beyond the spec draft so workflows fetch `keyManagement.userGroups` only when a policy requests it.
  - `TokenProvisioningCapability` stays pure: no storage, no backend calls, no UI, no telemetry.
- Validation:
  - Focused Vitest tests after each task.
  - `pnpm run validate:staged` before local handoff.
  - `pnpm run validate:push` before push or PR because shared contracts change.

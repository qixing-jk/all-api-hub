# Model List Group Semantics Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Model List preserve site-supported groups as read-only metadata while using only current-account/runtime-key usable groups for filters and actions, and only groups with real multipliers for price calculation.

**Architecture:** Add a stable group-semantics fact to each Model Management source and derive a pure, source-scoped `ModelGroupContext` when a pricing response becomes a row. Carry the base and active group contexts through filtering, pricing, rendering, and verification instead of reconstructing policy from `model.enable_groups`. Keep raw upstream fields unchanged and preserve existing non-group catalog behavior.

**Tech Stack:** TypeScript, React, WXT, Vitest, Testing Library, i18next, pnpm.

---

## Source Design

Implement against:

- `docs/superpowers/specs/2026-07-17-model-list-group-semantics-design.md`
- New API's contract that `enable_groups` is global model support while
  `usable_group` and `group_ratio` are viewer-scoped.

Do not filter or mutate upstream `enable_groups` in an adapter. Do not add a
React context, persisted cache field, site-type branch inside the group
resolver, telemetry, settings, or Playwright coverage.

## File Responsibility Map

- Create `src/features/ModelList/groupContext.ts`: normalize and resolve base
  and active group contexts only.
- Modify `src/features/ModelList/modelManagementSources.ts`: own the stable
  source-level group-semantics fact separately from dynamic UI capabilities.
- Modify the account-site model-list profile contract and definitions: declare
  group semantics as a stable backend-family fact before any response loads.
- Modify `src/services/modelList/pricingModel.ts`: make `usable_group` values
  opaque and add the explicit unavailable-price reason for a missing group
  multiplier.
- Modify `src/services/apiService/oneHub/transform.ts` and
  `src/services/models/utils/modelPricing.ts`: preserve finite zero group
  multipliers.
- Modify `src/features/ModelList/hooks/useFilteredModels.ts`: attach contexts,
  aggregate usable groups, calculate only priceable groups, and expose active
  action groups. Extract the shared account exchange-rate lookup to
  `src/features/ModelList/accountExchangeRate.ts`.
- Create `src/features/ModelList/groupSelectionState.ts`: pure repair helpers
  for stale single-account selections and all-account exclusions.
- Modify `src/features/ModelList/hooks/useModelData.ts` and
  `src/features/ModelList/hooks/useModelListData.ts`: expose pricing authority
  and run repair helpers only after the relevant pricing load has settled.
- Modify `src/features/ModelList/groupLabels.ts`: format a ratio only when it is
  finite; never synthesize `1x` for display.
- Modify Model List components: consume the row contexts, separate current
  usable groups from site-supported metadata, and pass `actionGroups` to model
  actions. Preserve strict empty action scope through Model Key Dialog and use
  the shared Tooltip child anchor for accessible clickable group badges.
- Modify `src/features/ModelList/batchVerification.ts`: use derived action
  scope instead of raw `enable_groups`.
- Modify all six `src/locales/*/modelList.json` files: synchronize the new
  semantic labels and recovery copy.

## Task 1: Define Stable Source Semantics And Pure Group Context

**Files:**

- Create: `src/features/ModelList/groupContext.ts`
- Modify: `src/features/ModelList/modelManagementSources.ts`
- Modify: `src/services/accounts/accountSiteProfile/contracts.ts`
- Modify: `src/services/accounts/accountSiteProfile/profiles.ts`
- Modify: `src/services/accountSiteDefinitions/definitions.ts`
- Modify: `src/services/modelList/pricingModel.ts`
- Create: `tests/features/ModelList/groupContext.test.ts`
- Create: `tests/features/ModelList/modelManagementSources.test.ts`
- Modify: `tests/services/accounts/accountSiteProfile.test.ts`

- [ ] **Step 1: Write failing source-semantics tests**

Create `tests/features/ModelList/modelManagementSources.test.ts` with focused
assertions that account/all-account sources are group-aware, profiles are not,
catalog capability downgrade does not alter the stable fact, and site types
without group semantics are correct before loading any response:

```ts
import { describe, expect, it } from "vitest"

import { SITE_TYPES } from "~/constants/siteType"
import {
  createAccountSource,
  createAllAccountsSource,
  createProfileSource,
  MODEL_LIST_GROUP_SEMANTICS,
  toCatalogOnlyCapabilities,
} from "~/features/ModelList/modelManagementSources"
import { API_TYPES } from "~/services/verification/aiApiVerification"
import { AuthTypeEnum, SiteHealthStatus, type DisplaySiteData } from "~/types"

const account: DisplaySiteData = {
  id: "account-1",
  name: "Example Account",
  username: "user",
  balance: { USD: 0, CNY: 0 },
  todayConsumption: { USD: 0, CNY: 0 },
  todayIncome: { USD: 0, CNY: 0 },
  todayTokens: { upload: 0, download: 0 },
  health: { status: SiteHealthStatus.Healthy },
  siteType: SITE_TYPES.NEW_API,
  baseUrl: "https://example.invalid",
  token: "token",
  userId: "1",
  authType: AuthTypeEnum.AccessToken,
  checkIn: { enableDetection: false },
}

describe("model management group semantics", () => {
  it("keeps stable semantics independent from catalog capabilities", () => {
    const source = createAccountSource(account)
    const capabilities = toCatalogOnlyCapabilities(source.capabilities)

    expect(source.groupSemantics).toBe(
      MODEL_LIST_GROUP_SEMANTICS.ACCOUNT_OR_RUNTIME_KEY,
    )
    expect(capabilities.supportsGroupFiltering).toBe(false)
  })

  it("marks aggregate account and profile sources explicitly", () => {
    const profile = createProfileSource({
      id: "profile-1",
      name: "Example Profile",
      apiType: API_TYPES.OPENAI_COMPATIBLE,
      baseUrl: "https://profile.example.invalid/v1",
      apiKey: "example-key",
      tagIds: [],
      notes: "",
      createdAt: 1,
      updatedAt: 1,
    })

    expect(createAllAccountsSource().groupSemantics).toBe(
      MODEL_LIST_GROUP_SEMANTICS.ACCOUNT_OR_RUNTIME_KEY,
    )
    expect(profile.groupSemantics).toBe(
      MODEL_LIST_GROUP_SEMANTICS.NOT_APPLICABLE,
    )
  })

  it("marks no-group account backends before any response loads", () => {
    for (const siteType of [SITE_TYPES.AIHUBMIX, SITE_TYPES.SHAREDCHAT]) {
      expect(
        createAccountSource({ ...account, siteType }).groupSemantics,
      ).toBe(MODEL_LIST_GROUP_SEMANTICS.NOT_APPLICABLE)
    }
  })

  it("keeps Sub2API group-aware before runtime-key pricing resolves", () => {
    expect(
      createAccountSource({
        ...account,
        siteType: SITE_TYPES.SUB2API,
      }).groupSemantics,
    ).toBe(
      MODEL_LIST_GROUP_SEMANTICS.ACCOUNT_OR_RUNTIME_KEY,
    )
  })

  it("keeps VoAPI V2 group-aware despite unsupported model-list readiness", () => {
    expect(
      createAccountSource({
        ...account,
        siteType: SITE_TYPES.VO_API_V2,
      }).groupSemantics,
    ).toBe(
      MODEL_LIST_GROUP_SEMANTICS.ACCOUNT_OR_RUNTIME_KEY,
    )
  })

  it("does not change stable semantics during capability downgrade", () => {
    const source = createAccountSource({
      ...account,
      siteType: SITE_TYPES.AIHUBMIX,
    })

    expect(source.groupSemantics).toBe(
      MODEL_LIST_GROUP_SEMANTICS.NOT_APPLICABLE,
    )
    expect(
      toCatalogOnlyCapabilities(source.capabilities).supportsGroupFiltering,
    ).toBe(false)
  })
})
```

- [ ] **Step 2: Run the source-semantics tests and verify RED**

Run:

```powershell
pnpm exec vitest --run tests/features/ModelList/modelManagementSources.test.ts
```

Expected: FAIL because `MODEL_LIST_GROUP_SEMANTICS` and
`source.groupSemantics` do not exist.

- [ ] **Step 3: Add the stable source contract**

In `src/services/accounts/accountSiteProfile/contracts.ts`, add:

```ts
export const ACCOUNT_SITE_MODEL_LIST_GROUP_SEMANTICS = {
  ACCOUNT_OR_RUNTIME_KEY: "account-or-runtime-key",
  NOT_APPLICABLE: "not-applicable",
} as const

export type AccountSiteModelListGroupSemantics =
  (typeof ACCOUNT_SITE_MODEL_LIST_GROUP_SEMANTICS)[keyof typeof ACCOUNT_SITE_MODEL_LIST_GROUP_SEMANTICS]
```

Add this required field to `AccountSiteModelListProfile`:

```ts
groupSemantics: AccountSiteModelListGroupSemantics
```

In `src/services/accounts/accountSiteProfile/profiles.ts`, set the default to
`ACCOUNT_SITE_MODEL_LIST_GROUP_SEMANTICS.ACCOUNT_OR_RUNTIME_KEY`. In
`src/services/accountSiteDefinitions/definitions.ts`, override the AIHubMix and
SharedChat `productProfile.modelList` definitions with:

```ts
groupSemantics: ACCOUNT_SITE_MODEL_LIST_GROUP_SEMANTICS.NOT_APPLICABLE,
```

Add assertions to `tests/services/accounts/accountSiteProfile.test.ts` that
New API, Sub2API, and VoAPI V2 resolve `ACCOUNT_OR_RUNTIME_KEY`, while AIHubMix
and SharedChat resolve `NOT_APPLICABLE`. VoAPI V2 remains group-aware even
though its Model List readiness and direct pricing are unsupported.

In `src/features/ModelList/modelManagementSources.ts`, alias the stable profile
constant/type for feature consumers:

```ts
export const MODEL_LIST_GROUP_SEMANTICS =
  ACCOUNT_SITE_MODEL_LIST_GROUP_SEMANTICS
export type ModelListGroupSemantics = AccountSiteModelListGroupSemantics
```

Add `groupSemantics: ModelListGroupSemantics` to every member of
`ModelManagementSource`. `createAccountSource` reads
`getAccountSiteModelListProfile(account.siteType).groupSemantics`;
`createAllAccountsSource` uses `ACCOUNT_OR_RUNTIME_KEY`; `createProfileSource`
uses `NOT_APPLICABLE`. Do not modify `groupSemantics` in
`applyAihubmixModelListCapabilities`, `deriveModelListSourceCapabilities`, or
`toCatalogOnlyCapabilities`; those functions remain dynamic capability-only
transforms.

- [ ] **Step 4: Write failing pure resolver tests**

Create `tests/features/ModelList/groupContext.test.ts`. Cover all access states,
normalization, zero ratios, and active action scope:

```ts
import { describe, expect, it } from "vitest"

import {
  MODEL_GROUP_ACCESS_STATES,
  normalizeGroupRatios,
  resolveActiveModelGroupContext,
  resolveModelGroupContext,
} from "~/features/ModelList/groupContext"
import { MODEL_LIST_GROUP_SEMANTICS } from "~/features/ModelList/modelManagementSources"
import {
  MODEL_LIST_SOURCE_KINDS,
  MODEL_PRICE_PRECISION_KINDS,
  MODEL_PRICE_SOURCE_KINDS,
} from "~/services/modelList/pricingModel"

const baseModel = {
  enable_groups: ["default", "vip"],
}

describe("resolveModelGroupContext", () => {
  it("normalizes finite ratio keys once without replacing zero", () => {
    expect(
      normalizeGroupRatios({ " vip ": 0, vip: 2, " ": 3, invalid: Number.NaN }),
    ).toEqual({ vip: 0 })
  })

  it("preserves groups that share names with object prototype keys", () => {
    const ratios = Object.fromEntries([
      ["constructor", 1],
      ["toString", 2],
      ["__proto__", 3],
    ])

    expect(normalizeGroupRatios(ratios)).toEqual(ratios)
  })

  it("separates supported, usable, and priceable groups", () => {
    expect(
      resolveModelGroupContext({
        groupSemantics:
          MODEL_LIST_GROUP_SEMANTICS.ACCOUNT_OR_RUNTIME_KEY,
        model: baseModel,
        usableGroup: { default: { description: "Default" } },
        groupRatios: { default: 1 },
      }),
    ).toEqual({
      accessState: MODEL_GROUP_ACCESS_STATES.KNOWN,
      supportedGroups: ["default", "vip"],
      usableGroups: ["default"],
      priceableGroups: ["default"],
    })
  })

  it("keeps usable groups without inventing a multiplier", () => {
    expect(
      resolveModelGroupContext({
        groupSemantics:
          MODEL_LIST_GROUP_SEMANTICS.ACCOUNT_OR_RUNTIME_KEY,
        model: baseModel,
        usableGroup: { default: true, vip: true },
        groupRatios: { default: 1 },
      }),
    ).toEqual({
      accessState: MODEL_GROUP_ACCESS_STATES.KNOWN,
      supportedGroups: ["default", "vip"],
      usableGroups: ["default", "vip"],
      priceableGroups: ["default"],
    })
  })

  it("uses only finite priced keys for compatible fallback", () => {
    expect(
      resolveModelGroupContext({
        groupSemantics:
          MODEL_LIST_GROUP_SEMANTICS.ACCOUNT_OR_RUNTIME_KEY,
        model: baseModel,
        usableGroup: {},
        groupRatios: { default: 0, vip: Number.NaN },
      }),
    ).toEqual({
      accessState: MODEL_GROUP_ACCESS_STATES.COMPATIBLE_PRICED_FALLBACK,
      supportedGroups: ["default", "vip"],
      usableGroups: ["default"],
      priceableGroups: ["default"],
    })
  })

  it("distinguishes unknown catalog access from known empty access", () => {
    const unknown = resolveModelGroupContext({
      groupSemantics: MODEL_LIST_GROUP_SEMANTICS.ACCOUNT_OR_RUNTIME_KEY,
      model: {
        ...baseModel,
        price_metadata: {
          source: MODEL_PRICE_SOURCE_KINDS.NONE,
          precision: MODEL_PRICE_PRECISION_KINDS.UNAVAILABLE,
        },
      },
      usableGroup: {},
      groupRatios: {},
      modelListSource: {
        kind: MODEL_LIST_SOURCE_KINDS.CATALOG_FALLBACK,
        supportsPricing: false,
      },
    })
    const knownEmpty = resolveModelGroupContext({
      groupSemantics: MODEL_LIST_GROUP_SEMANTICS.ACCOUNT_OR_RUNTIME_KEY,
      model: baseModel,
      usableGroup: {},
      groupRatios: {},
    })

    expect(unknown.accessState).toBe(MODEL_GROUP_ACCESS_STATES.UNKNOWN)
    expect(knownEmpty.accessState).toBe(MODEL_GROUP_ACCESS_STATES.KNOWN)
    expect(knownEmpty.usableGroups).toEqual([])
  })

  it("keeps Sub2API-style catalog downgrade applicable", () => {
    const context = resolveModelGroupContext({
      groupSemantics: MODEL_LIST_GROUP_SEMANTICS.ACCOUNT_OR_RUNTIME_KEY,
      model: baseModel,
      usableGroup: {},
      groupRatios: {},
      modelListSource: {
        kind: MODEL_LIST_SOURCE_KINDS.CATALOG_FALLBACK,
        supportsPricing: false,
      },
    })

    expect(context.accessState).toBe(MODEL_GROUP_ACCESS_STATES.UNKNOWN)
  })

  it("marks sources without group semantics as not applicable", () => {
    const context = resolveModelGroupContext({
      groupSemantics: MODEL_LIST_GROUP_SEMANTICS.NOT_APPLICABLE,
      model: baseModel,
      usableGroup: { default: true },
      groupRatios: { default: 1 },
    })

    expect(context.accessState).toBe(
      MODEL_GROUP_ACCESS_STATES.NOT_APPLICABLE,
    )
    expect(context.usableGroups).toEqual([])
    expect(context.priceableGroups).toEqual([])
  })

  it("normalizes blank and duplicate group names without sorting", () => {
    const context = resolveModelGroupContext({
      groupSemantics: MODEL_LIST_GROUP_SEMANTICS.ACCOUNT_OR_RUNTIME_KEY,
      model: { enable_groups: [" vip ", "", "default", "vip"] },
      usableGroup: { " vip ": true, default: true },
      groupRatios: { vip: 2, default: 1 },
    })

    expect(context.supportedGroups).toEqual(["vip", "default"])
    expect(context.usableGroups).toEqual(["vip", "default"])
  })
})

describe("resolveActiveModelGroupContext", () => {
  it("keeps an explicitly selected usable but unpriced group actionable", () => {
    const context = {
      accessState: MODEL_GROUP_ACCESS_STATES.KNOWN,
      supportedGroups: ["default", "vip"],
      usableGroups: ["default", "vip"],
      priceableGroups: ["default"],
    }

    expect(
      resolveActiveModelGroupContext({
        context,
        candidateGroups: ["vip"],
      }),
    ).toEqual({
      activeUsableGroups: ["vip"],
      activePriceableGroups: [],
      actionGroups: ["vip"],
    })
  })

  it("narrows actions to the selected effective priced group", () => {
    const context = {
      accessState: MODEL_GROUP_ACCESS_STATES.KNOWN,
      supportedGroups: ["default", "vip"],
      usableGroups: ["default", "vip"],
      priceableGroups: ["default", "vip"],
    }

    expect(
      resolveActiveModelGroupContext({
        context,
        effectiveGroup: "vip",
      }).actionGroups,
    ).toEqual(["vip"])
  })
})
```

- [ ] **Step 5: Run the resolver tests and verify RED**

Run:

```powershell
pnpm exec vitest --run tests/features/ModelList/groupContext.test.ts
```

Expected: FAIL because `groupContext.ts` does not exist.

- [ ] **Step 6: Implement the pure resolver and opaque response contract**

In `src/services/modelList/pricingModel.ts`, change:

```ts
usable_group: Record<string, unknown>
```

Add the new price reason:

```ts
GROUP_RATIO_UNAVAILABLE: "group-ratio-unavailable",
```

Create `src/features/ModelList/groupContext.ts` with these public contracts and
functions:

```ts
import {
  MODEL_PRICE_PRECISION_KINDS,
  type ModelListSourceInfo,
  type ModelPricing,
  type PricingResponse,
} from "~/services/modelList/pricingModel"

import type { ModelListGroupSemantics } from "./modelManagementSources"
import { MODEL_LIST_GROUP_SEMANTICS } from "./modelManagementSources"

export const MODEL_GROUP_ACCESS_STATES = {
  KNOWN: "known",
  COMPATIBLE_PRICED_FALLBACK: "compatible-priced-fallback",
  UNKNOWN: "unknown",
  NOT_APPLICABLE: "not-applicable",
} as const

export type ModelGroupAccessState =
  (typeof MODEL_GROUP_ACCESS_STATES)[keyof typeof MODEL_GROUP_ACCESS_STATES]

export interface ModelGroupContext {
  accessState: ModelGroupAccessState
  supportedGroups: string[]
  usableGroups: string[]
  priceableGroups: string[]
}

export interface ActiveModelGroupContext {
  activeUsableGroups: string[]
  activePriceableGroups: string[]
  actionGroups: string[]
}

interface ResolveModelGroupContextParams {
  groupSemantics: ModelListGroupSemantics
  model: Pick<ModelPricing, "enable_groups" | "price_metadata">
  usableGroup: PricingResponse["usable_group"]
  groupRatios: PricingResponse["group_ratio"]
  modelListSource?: ModelListSourceInfo
}

interface ResolveActiveModelGroupContextParams {
  context: ModelGroupContext
  candidateGroups?: readonly string[]
  effectiveGroup?: string
}

function normalizeGroups(groups: Iterable<string>): string[] {
  const normalized: string[] = []
  const seen = new Set<string>()

  for (const value of groups) {
    const group = value.trim()
    if (!group || seen.has(group)) continue
    seen.add(group)
    normalized.push(group)
  }

  return normalized
}

function isFiniteRatio(value: number | undefined): value is number {
  return typeof value === "number" && Number.isFinite(value)
}

export function normalizeGroupRatios(
  groupRatios: Readonly<Record<string, number>>,
): Record<string, number> {
  const entries: Array<[string, number]> = []
  const seen = new Set<string>()

  for (const [rawGroup, ratio] of Object.entries(groupRatios)) {
    const group = rawGroup.trim()
    if (!group || !isFiniteRatio(ratio) || seen.has(group)) continue
    seen.add(group)
    entries.push([group, ratio])
  }

  return Object.fromEntries(entries)
}

/**
 * New API exposes `enable_groups` as global model/channel support, while
 * `usable_group` and `group_ratio` are scoped to the current viewer.
 * https://github.com/QuantumNous/new-api/blob/a63364d156cf2a64f1c3d1ee4923d73d5f3222a1/model/pricing.go
 * https://github.com/QuantumNous/new-api/blob/a63364d156cf2a64f1c3d1ee4923d73d5f3222a1/controller/pricing.go
 */
export function resolveModelGroupContext(
  params: ResolveModelGroupContextParams,
): ModelGroupContext {
  const supportedGroups = normalizeGroups(params.model.enable_groups)

  if (params.groupSemantics === MODEL_LIST_GROUP_SEMANTICS.NOT_APPLICABLE) {
    return {
      accessState: MODEL_GROUP_ACCESS_STATES.NOT_APPLICABLE,
      supportedGroups,
      usableGroups: [],
      priceableGroups: [],
    }
  }

  const usableKeySet = new Set(
    normalizeGroups(Object.keys(params.usableGroup)),
  )
  const normalizedGroupRatios = normalizeGroupRatios(params.groupRatios)
  const pricedKeySet = new Set(Object.keys(normalizedGroupRatios))
  const usableGroups = supportedGroups.filter((group) =>
    usableKeySet.has(group),
  )
  const pricedGroups = supportedGroups.filter((group) =>
    pricedKeySet.has(group),
  )

  if (usableGroups.length > 0) {
    return {
      accessState: MODEL_GROUP_ACCESS_STATES.KNOWN,
      supportedGroups,
      usableGroups,
      priceableGroups: usableGroups.filter((group) =>
        pricedKeySet.has(group),
      ),
    }
  }

  if (pricedGroups.length > 0) {
    return {
      accessState: MODEL_GROUP_ACCESS_STATES.COMPATIBLE_PRICED_FALLBACK,
      supportedGroups,
      usableGroups: pricedGroups,
      priceableGroups: pricedGroups,
    }
  }

  const pricingUnavailable =
    params.model.price_metadata?.precision ===
      MODEL_PRICE_PRECISION_KINDS.UNAVAILABLE ||
    params.modelListSource?.supportsPricing === false

  return {
    accessState: pricingUnavailable
      ? MODEL_GROUP_ACCESS_STATES.UNKNOWN
      : MODEL_GROUP_ACCESS_STATES.KNOWN,
    supportedGroups,
    usableGroups: [],
    priceableGroups: [],
  }
}

export function resolveActiveModelGroupContext(
  params: ResolveActiveModelGroupContextParams,
): ActiveModelGroupContext {
  const candidates =
    params.candidateGroups === undefined
      ? null
      : new Set(normalizeGroups(params.candidateGroups))
  const activeUsableGroups = candidates
    ? params.context.usableGroups.filter((group) => candidates.has(group))
    : [...params.context.usableGroups]
  const priceable = new Set(params.context.priceableGroups)
  const activePriceableGroups = activeUsableGroups.filter((group) =>
    priceable.has(group),
  )
  const effectiveGroup = params.effectiveGroup?.trim()
  const actionGroups =
    effectiveGroup && activePriceableGroups.includes(effectiveGroup)
      ? [effectiveGroup]
      : activeUsableGroups

  return { activeUsableGroups, activePriceableGroups, actionGroups }
}
```

- [ ] **Step 7: Run focused tests and compile**

Run:

```powershell
pnpm exec vitest --run tests/features/ModelList/modelManagementSources.test.ts tests/features/ModelList/groupContext.test.ts tests/services/accounts/accountSiteProfile.test.ts
pnpm compile
```

Expected: all three test files PASS and TypeScript exits `0`.

- [ ] **Step 8: Commit Task 1**

```powershell
git add -- src/features/ModelList/groupContext.ts src/features/ModelList/modelManagementSources.ts src/services/accounts/accountSiteProfile/contracts.ts src/services/accounts/accountSiteProfile/profiles.ts src/services/accountSiteDefinitions/definitions.ts src/services/modelList/pricingModel.ts tests/features/ModelList/groupContext.test.ts tests/features/ModelList/modelManagementSources.test.ts tests/services/accounts/accountSiteProfile.test.ts
pnpm run validate:staged
git diff --cached --check
git commit -m "feat(model-list): define group access context"
```

## Task 2: Preserve Explicit Zero Multipliers

**Files:**

- Modify: `src/services/apiService/oneHub/transform.ts`
- Modify: `src/services/models/utils/modelPricing.ts`
- Modify: `tests/utils/one-hub-transform.test.ts`
- Modify: `tests/utils/modelPricing.test.ts`

- [ ] **Step 1: Change tests to require zero preservation**

In `tests/utils/one-hub-transform.test.ts`, change the existing
`group2` expectation in
`should compute group_ratio and usable_group from userGroupMap with default ratio fallback`
from `1` to `0`, while keeping the missing `group3` ratio at `1`.

In `tests/utils/modelPricing.test.ts`, add under
`describe("calculateModelPrice")`:

```ts
it("preserves an explicit zero group multiplier", () => {
  const result = calculateModelPrice(
    {
      model_name: "example-model",
      quota_type: 0,
      model_ratio: 2,
      completion_ratio: 3,
      model_price: 0,
      enable_groups: ["free"],
      supported_endpoint_types: [],
    },
    { free: 0 },
    7,
    "free",
  )

  expect(result.inputUSD).toBe(0)
  expect(result.outputUSD).toBe(0)
  expect(result.inputCNY).toBe(0)
  expect(result.outputCNY).toBe(0)
})
```

- [ ] **Step 2: Run zero-ratio tests and verify RED**

Run:

```powershell
pnpm exec vitest --run tests/utils/one-hub-transform.test.ts tests/utils/modelPricing.test.ts
```

Expected: FAIL because both production paths currently use truthiness fallback.

- [ ] **Step 3: Replace truthiness fallback with finite/nullish handling**

In `src/services/apiService/oneHub/transform.ts`, replace the group-ratio loop
body with:

```ts
const ratio = group.ratio
group_ratio[key] =
  typeof ratio === "number" && Number.isFinite(ratio) ? ratio : 1
```

In `src/services/models/utils/modelPricing.ts`, replace the multiplier lookup
with:

```ts
const configuredGroupMultiplier = groupRatio[userGroup]
const groupMultiplier =
  typeof configuredGroupMultiplier === "number" &&
  Number.isFinite(configuredGroupMultiplier)
    ? configuredGroupMultiplier
    : 1
```

This keeps compatibility for missing/invalid values while preserving a valid
zero.

- [ ] **Step 4: Run focused tests and commit**

Run:

```powershell
pnpm exec vitest --run tests/utils/one-hub-transform.test.ts tests/utils/modelPricing.test.ts
```

Expected: both files PASS.

Commit:

```powershell
git add -- src/services/apiService/oneHub/transform.ts src/services/models/utils/modelPricing.ts tests/utils/one-hub-transform.test.ts tests/utils/modelPricing.test.ts
pnpm run validate:staged
git diff --cached --check
git commit -m "fix(pricing): preserve zero group multipliers"
```

## Task 3: Attach Group Context To Model Rows

**Files:**

- Modify: `src/features/ModelList/hooks/useFilteredModels.ts`
- Modify: `tests/entrypoints/options/pages/ModelList/useFilteredModels.test.ts`

- [ ] **Step 1: Make the pricing fixture explicit about viewer access**

In `tests/entrypoints/options/pages/ModelList/useFilteredModels.test.ts`, make
`createPricingResponse` derive `usable_group` from the effective
`group_ratio`, never from `enable_groups`:

```ts
const createPricingResponse = (
  models: Array<string | Partial<PricingResponse["data"][number]>>,
  overrides: Partial<PricingResponse> = {},
): PricingResponse => {
  const groupRatio = overrides.group_ratio ?? { default: 1 }
  const usableGroup =
    overrides.usable_group ??
    Object.fromEntries(Object.keys(groupRatio).map((group) => [group, group]))

  return {
    data: models.map((model) =>
      typeof model === "string"
        ? createPricingModel({ model_name: model })
        : createPricingModel(model),
    group_ratio: groupRatio,
    success: true,
    usable_group: usableGroup,
    ...overrides,
  }
}
```

For tests that intentionally exercise empty/unknown access, pass both
`group_ratio: {}` and `usable_group: {}` explicitly. For existing fixtures
whose model uses only a non-default group, add matching response-level
`group_ratio` and `usable_group`; do not make the factory infer viewer access
from the model's global support list.

- [ ] **Step 2: Add failing single-account mismatch and unpriced tests**

Import `MODEL_GROUP_ACCESS_STATES` from `groupContext.ts`, then add tests proving
the reported regression and access/pricing separation:

```ts
it("uses current-account groups instead of all site-supported groups", async () => {
  const account = createDisplayAccount({ id: "account-group-scope" })
  const { result } = renderUseFilteredModels({
    pricingData: createPricingResponse(
      [{ model_name: "example-model", model_ratio: 0.05, enable_groups: ["vip", "default"] }],
      {
        group_ratio: { default: 1 },
        usable_group: { default: { description: "Default" } },
      },
    ),
    selectedSource: createAccountSource(account),
  })

  await waitFor(() => expect(result.current.filteredModels).toHaveLength(1))

  const row = result.current.filteredModels[0]
  expect(result.current.availableGroups).toEqual(["default"])
  expect(row?.groupContext.supportedGroups).toEqual(["vip", "default"])
  expect(row?.groupContext.usableGroups).toEqual(["default"])
  expect(row?.effectiveGroup).toBe("default")
  expect(row?.activeGroupContext.actionGroups).toEqual(["default"])
})

it("keeps a selected usable but unpriced group visible and actionable", async () => {
  const account = createDisplayAccount({ id: "account-unpriced-group" })
  const { result } = renderUseFilteredModels({
    pricingData: createPricingResponse(
      [{ model_name: "example-model", enable_groups: ["default", "vip"] }],
      {
        group_ratio: { default: 1 },
        usable_group: { default: true, vip: true },
      },
    ),
    selectedSource: createAccountSource(account),
    selectedGroups: ["vip"],
  })

  await waitFor(() => expect(result.current.filteredModels).toHaveLength(1))

  const row = result.current.filteredModels[0]
  expect(row?.calculatedPrice).toEqual({
    priceAvailability: "unavailable",
    unavailableReason:
      MODEL_UNAVAILABLE_PRICE_REASONS.GROUP_RATIO_UNAVAILABLE,
  })
  expect(row?.effectiveGroup).toBeUndefined()
  expect(row?.activeGroupContext.actionGroups).toEqual(["vip"])
})

it("keeps a known-empty account row visible with unavailable pricing", async () => {
  const account = createDisplayAccount({ id: "account-known-empty" })
  const { result } = renderUseFilteredModels({
    pricingData: createPricingResponse(
      [{ model_name: "example-model", enable_groups: ["default"] }],
      { group_ratio: {}, usable_group: {} },
    ),
    selectedSource: createAccountSource(account),
    selectedGroups: [],
  })

  await waitFor(() => expect(result.current.filteredModels).toHaveLength(1))

  const row = result.current.filteredModels[0]
  expect(row?.groupContext.accessState).toBe(MODEL_GROUP_ACCESS_STATES.KNOWN)
  expect(row?.activeGroupContext.activeUsableGroups).toEqual([])
  expect(row?.calculatedPrice).toEqual({
    priceAvailability: "unavailable",
    unavailableReason:
      MODEL_UNAVAILABLE_PRICE_REASONS.GROUP_RATIO_UNAVAILABLE,
  })
})
```

- [ ] **Step 3: Add failing all-account isolation and comparison tests**

Extend the existing tests around
`uses the cheapest eligible group per row` and token-scoped sources:

```ts
it("does not price or filter with a supported-only group", async () => {
  const account = createDisplayAccount({ id: "account-supported-only" })
  const { result } = renderUseFilteredModels({
    pricingContexts: [
      {
        account,
        pricing: createPricingResponse(
          [{ model_name: "shared-model", model_ratio: 1, enable_groups: ["default", "vip"] }],
          {
            group_ratio: { default: 1 },
            usable_group: { default: true },
          },
        ),
      },
    ],
    selectedSource: createAllAccountsSource(),
  })

  await waitFor(() => expect(result.current.filteredModels).toHaveLength(1))

  expect(result.current.availableAccountGroupsByAccountId).toEqual({
    "account-supported-only": ["default"],
  })
  expect(result.current.availableAccountGroupOptionsByAccountId).toEqual({
    "account-supported-only": [{ name: "default", ratio: 1 }],
  })
})
```

Also add one two-account case where account A globally supports a low-ratio
`vip` but can use only `default`, while account B has a real priceable group.
Assert the `vip` value never wins lowest-price comparison and that each row's
`groupContext` remains source-specific.

- [ ] **Step 4: Run hook tests and verify RED**

Run:

```powershell
pnpm exec vitest --run tests/entrypoints/options/pages/ModelList/useFilteredModels.test.ts
```

Expected: FAIL because calculated rows lack `groupContext` and
`activeGroupContext`, and current aggregation still adds `enable_groups`.

- [ ] **Step 5: Add contexts to row contracts and response mapping**

In `src/features/ModelList/hooks/useFilteredModels.ts`, import the resolver and
types, then change the row shapes:

```ts
interface RawModelItem {
  model: PricingResponse["data"][number]
  source: ModelManagementItemSource
  sourceIdentity?: ModelListSourceIdentity
  groupRatios: Record<string, number>
  groupContext: ModelGroupContext
  exchangeRate: number
  modelMetadata?: ModelMetadata
  resolvedVendor: ResolvedModelVendor
}

export type CalculatedModelItem = {
  model: PricingResponse["data"][number]
  calculatedPrice: ReturnType<typeof calculateModelPrice>
  source: ModelManagementItemSource
  sourceIdentity?: ModelListSourceIdentity
  groupRatios: Record<string, number>
  groupContext: ModelGroupContext
  activeGroupContext: ActiveModelGroupContext
  effectiveGroup?: string
  modelMetadata?: ModelMetadata
  resolvedVendor: ResolvedModelVendor
  hasAutoSelectedGroup?: boolean
  isLowestPrice?: boolean
}
```

At each `pricing.data.map` boundary, resolve the context with that exact
response and row source. Normalize the response-level map once and store that
same map on the row:

```ts
const groupRatios = normalizeGroupRatios(pricing.group_ratio ?? {})

groupRatios,
groupContext: resolveModelGroupContext({
  groupSemantics: source.groupSemantics,
  model,
  usableGroup: pricing.usable_group ?? {},
  groupRatios,
  modelListSource: pricing.model_list_source,
}),
```

Use `pricingData` in the single-source branch. Profile rows still receive a
context, but their source semantics resolve it to `not-applicable`.

Add a hook test with `enable_groups: ["vip"]`,
`usable_group: { " vip ": true }`, and `group_ratio: { " vip ": 0.5 }`.
Assert `row.groupRatios` is `{ vip: 0.5 }`, the row is priceable as `vip`, its
calculated input price uses `0.5`, and the account group option contains
`{ name: "vip", ratio: 0.5 }`. This proves normalized keys reach calculation,
options, and later label formatting rather than only the access-state set.

- [ ] **Step 6: Replace group aggregation with usable-group aggregation**

Delete `addAvailableGroups`. Build `availableGroups`,
`availableGroupsBySourceId`, and `availableAccountGroupsByAccountId` only from
`item.groupContext.usableGroups`.

Change the option type and construction so the ratio is optional:

```ts
export interface AccountGroupOption {
  name: string
  ratio?: number
}

function toAccountGroupOption(
  group: string,
  groupRatios: Record<string, number>,
): AccountGroupOption {
  const ratio = groupRatios[group]
  return typeof ratio === "number" && Number.isFinite(ratio)
    ? { name: group, ratio }
    : { name: group }
}
```

When multiple source-scoped rows for one account expose the same usable group,
include the optional ratio only when every occurrence has the same finite
value. Omit `ratio` when any occurrence is unpriced or when runtime keys report
conflicting values. Never insert a missing group with `ratio: 1`.

- [ ] **Step 7: Calculate only active priceable groups**

Make `getGroupCandidatesForRawItem` return `undefined` for “all usable groups”
and an array for an explicit selection/exclusion result. This distinguishes
“no filter” from “all groups excluded”.

For every row in both scopes, first return `undefined` when
`item.source.capabilities.supportsGroupFiltering` is false. This prevents a
stale page selection from filtering an unknown catalog row after dynamic
capability downgrade. Preserve the existing Sub2API regression where
`supportsPricing: false` plus `selectedGroups: ["stale-group"]` still keeps the
catalog row visible.

For an all-account row with group filtering enabled, then read its
source-scoped available usable groups. If that list is empty, return
`undefined` so known-empty rows remain visible. If it is non-empty, return the
included list after account exclusions; an empty included list then correctly
means the user excluded every usable group for that source. For a single row
with group filtering enabled, return the normalized non-empty
`selectedGroups`, or `undefined` when the page is in all-groups mode.

Replace raw `model.enable_groups` candidate intersection with:

```ts
const active = resolveActiveModelGroupContext({
  context: rawItem.groupContext,
  candidateGroups: groupCandidates,
})
```

Apply these branches in `resolveBestCalculatedItem`:

1. `not-applicable`: calculate once with `DEFAULT_MODEL_GROUP`, set no
   `effectiveGroup`, and carry an empty active context.
2. Existing model price metadata is unavailable: keep the model's existing
   unavailable result and active context.
3. An explicit candidate array, including `[]` for “all usable groups
   excluded”, has no usable intersection: return `null` because the selected
   filter excludes the row.
4. No explicit filter is active and the context is `known` with no usable
   groups: keep the row and return the same unavailable-price result below.
5. Active usable groups exist but active priceable groups are empty: keep the
   row and return:

```ts
calculatedPrice: {
  priceAvailability: "unavailable",
  unavailableReason: MODEL_UNAVAILABLE_PRICE_REASONS.GROUP_RATIO_UNAVAILABLE,
}
```

6. Otherwise evaluate only `active.activePriceableGroups`. After choosing the
   best group, recompute `activeGroupContext` with that `effectiveGroup`, so
   `actionGroups` becomes the one effective priced group.

Remove `getSupportsGroupFiltering` from `resolveCalculatedModels`; source
semantics and each row's dynamic capabilities/context now own the decision.
Keep unknown catalog rows visible when their dynamic group-filter capability is
disabled.

- [ ] **Step 8: Update legacy expectations and run focused tests**

Change the old tests that expected model groups to become `1x` fallback
options:

- Missing both maps on a direct group-aware response now produces a visible
  known-empty row with unavailable price and no group options.
- All-account group options contain usable groups only; unpriced usable groups
  omit the `ratio` property.
- AIHubMix/profile rows remain visible with `not-applicable` contexts and no
  effective group.

Run:

```powershell
pnpm exec vitest --run tests/features/ModelList/groupContext.test.ts tests/entrypoints/options/pages/ModelList/useFilteredModels.test.ts
pnpm compile
```

Expected: both test files PASS and compile exits `0`.

- [ ] **Step 9: Commit Task 3**

```powershell
git add -- src/features/ModelList/accountExchangeRate.ts src/features/ModelList/hooks/useFilteredModels.ts tests/entrypoints/options/pages/ModelList/useFilteredModels.test.ts
pnpm run validate:staged
git diff --cached --check
git commit -m "fix(model-list): derive account-scoped model groups"
```

## Task 4: Repair Stale Group Selection After Settled Refreshes

**Files:**

- Create: `src/features/ModelList/groupSelectionState.ts`
- Modify: `src/features/ModelList/hooks/useModelData.ts`
- Modify: `src/features/ModelList/hooks/useModelListData.ts`
- Create: `tests/features/ModelList/groupSelectionState.test.ts`
- Modify: `tests/entrypoints/options/pages/ModelList/useModelData.test.tsx`
- Modify: `tests/entrypoints/options/pages/ModelList/useModelListData.test.tsx`

- [ ] **Step 1: Write failing pure repair tests**

Create `tests/features/ModelList/groupSelectionState.test.ts`:

```ts
import { describe, expect, it } from "vitest"

import {
  repairAllAccountGroupExclusions,
  repairSelectedGroups,
} from "~/features/ModelList/groupSelectionState"

describe("group selection repair", () => {
  it("keeps only selected groups that remain usable", () => {
    expect(repairSelectedGroups(["default", "vip"], ["default"])).toEqual([
      "default",
    ])
    expect(repairSelectedGroups(["vip"], ["default"])).toEqual([])
  })

  it("repairs settled accounts and preserves unresolved accounts", () => {
    expect(
      repairAllAccountGroupExclusions({
        current: {
          "account-settled": ["default", "vip"],
          "account-failed": ["vip"],
        },
        availableByAccountId: {
          "account-settled": ["default"],
        },
        settledAccountIds: new Set(["account-settled"]),
      }),
    ).toEqual({
      "account-settled": ["default"],
      "account-failed": ["vip"],
    })
  })

  it("removes empty exclusion entries for settled accounts", () => {
    expect(
      repairAllAccountGroupExclusions({
        current: { "account-1": ["vip"] },
        availableByAccountId: { "account-1": ["default"] },
        settledAccountIds: new Set(["account-1"]),
      }),
    ).toEqual({})
  })
})
```

- [ ] **Step 2: Run pure tests and verify RED**

Run:

```powershell
pnpm exec vitest --run tests/features/ModelList/groupSelectionState.test.ts
```

Expected: FAIL because `groupSelectionState.ts` does not exist.

- [ ] **Step 3: Implement pure repair helpers with identity preservation**

Create `src/features/ModelList/groupSelectionState.ts`. Normalize values by
trimming and de-duplicating, return the original reference when no logical
change occurred, and export exactly:

```ts
export function repairSelectedGroups(
  current: readonly string[],
  availableGroups: readonly string[],
): string[]

export function repairAllAccountGroupExclusions(params: {
  current: Readonly<Record<string, string[]>>
  availableByAccountId: Readonly<Record<string, string[]>>
  settledAccountIds: ReadonlySet<string>
}): Record<string, string[]>
```

For each settled account, intersect exclusions with that account's available
groups and delete the map entry when the result is empty. Copy entries for
accounts absent from `settledAccountIds` unchanged so partial failures do not
erase user state.

- [ ] **Step 4: Write failing hook timing tests**

In `tests/entrypoints/options/pages/ModelList/useModelListData.test.tsx`, extend
the default `mockUseFilteredModels` result with:

```ts
availableAccountGroupsByAccountId: {},
availableAccountGroupOptionsByAccountId: {},
```

Add these behaviors:

- Single-account `selectedGroups: ["vip"]` is preserved while
  `mockUseModelData().isLoading` is true, then becomes `[]` after a settled
  pricing response and `availableGroups: ["default"]`.
- All-account exclusions for a context returned in `pricingContexts` are
  intersected after `isLoading` becomes false.
- Exclusions for an account whose query failed and produced no pricing context
  remain unchanged after the other accounts settle.
- Exclusions also remain unchanged when a partially failed account has both a
  pricing context and `accountQueryStates` entry with `hasData: true` and
  `hasError: true`:

```ts
mockUseModelData.mockReturnValue({
  pricingData: null,
  pricingContexts: [
    {
      account: ACCOUNT,
      pricing: {
        data: [],
        group_ratio: { default: 1 },
        success: true,
        usable_group: { default: true },
      },
    },
  ],
  isLoading: false,
  dataFormatError: false,
  accountQueryStates: [
    {
      account: ACCOUNT,
      isLoading: false,
      hasData: true,
      hasError: true,
    },
  ],
  loadPricingData: vi.fn(),
  loadErrorMessage: null,
  accountFallback: null,
})
mockUseFilteredModels.mockReturnValue({
  filteredModels: [],
  baseFilteredModels: [],
  getProviderFilteredCount: vi.fn(() => 0),
  availableGroups: [],
  availableAccountGroupsByAccountId: { "acc-1": ["default"] },
  availableAccountGroupOptionsByAccountId: {},
})

const { result } = renderHook(() => useModelListData())
act(() => {
  result.current.setSelectedSourceValue(ALL_ACCOUNTS_SOURCE_VALUE)
  result.current.setAllAccountsExcludedGroupsByAccountId({
    "acc-1": ["vip"],
  })
})

await waitFor(() => {
  expect(result.current.allAccountsExcludedGroupsByAccountId).toEqual({
    "acc-1": ["vip"],
  })
})
```

- Switching source while the next source is loading does not repair either
  state from the previous source's available-group result.

- [ ] **Step 5: Run hook tests and verify RED**

Run:

```powershell
pnpm exec vitest --run tests/entrypoints/options/pages/ModelList/useModelListData.test.tsx
```

Expected: new timing assertions FAIL because no settled-load repair effects
exist.

- [ ] **Step 6: Add guarded repair effects**

In `useModelListData`, destructure `setSelectedGroups` from state. After
`filteredData` is created, add:

```ts
useEffect(() => {
  if (
    modelData.isLoading ||
    selectedSource?.kind !== MODEL_MANAGEMENT_SOURCE_KINDS.ACCOUNT ||
    !modelData.pricingData
  ) {
    return
  }

  setSelectedGroups((current) =>
    repairSelectedGroups(current, filteredData.availableGroups),
  )
}, [
  filteredData.availableGroups,
  modelData.isLoading,
  modelData.pricingData,
  selectedSource?.kind,
  selectedSource?.value,
  setSelectedGroups,
])
```

Add the all-account effect:

```ts
useEffect(() => {
  if (
    modelData.isLoading ||
    selectedSource?.kind !== MODEL_MANAGEMENT_SOURCE_KINDS.ALL_ACCOUNTS
  ) {
    return
  }

  const safelySettledAccountIds = new Set(
    modelData.accountQueryStates
      .filter(
        (state) =>
          !state.isLoading && state.hasData && !state.hasError,
      )
      .map(({ account }) => account.id),
  )
  if (safelySettledAccountIds.size === 0) return

  setAllAccountsExcludedGroupsByAccountId((current) =>
    repairAllAccountGroupExclusions({
      current,
      availableByAccountId:
        filteredData.availableAccountGroupsByAccountId,
      settledAccountIds: safelySettledAccountIds,
    }),
  )
}, [
  filteredData.availableAccountGroupsByAccountId,
  modelData.accountQueryStates,
  modelData.isLoading,
  selectedSource?.kind,
  selectedSource?.value,
  setAllAccountsExcludedGroupsByAccountId,
])
```

The source value dependency and loading guard prevent a stale source result
from being treated as the next source's settled result. The query-state filter
prevents partial data from authorizing destructive repair. Do not clear state
in loading, failed, or partially failed branches.

- [ ] **Step 7: Run focused tests and commit**

Run:

```powershell
pnpm exec vitest --run tests/features/ModelList/groupSelectionState.test.ts tests/entrypoints/options/pages/ModelList/useModelListData.test.tsx
```

Expected: both files PASS.

Commit:

```powershell
git add -- src/features/ModelList/groupSelectionState.ts src/features/ModelList/hooks/useModelData.ts src/features/ModelList/hooks/useModelListData.ts tests/features/ModelList/groupSelectionState.test.ts tests/entrypoints/options/pages/ModelList/useModelData.test.tsx tests/entrypoints/options/pages/ModelList/useModelListData.test.tsx
pnpm run validate:staged
git diff --cached --check
git commit -m "fix(model-list): repair stale group filters"
```

## Task 5: Render Correct Group Semantics And Scope Single-Model Actions

**Files:**

- Modify: `src/features/ModelList/groupLabels.ts`
- Modify: `src/features/ModelList/components/ControlPanel.tsx`
- Modify: `src/features/ModelList/components/AllAccountsGroupFilterMenu.tsx`
- Modify: `src/features/ModelList/components/ModelDisplay.tsx`
- Modify: `src/features/ModelList/components/ModelItem/index.tsx`
- Modify: `src/features/ModelList/components/ModelItem/ModelItemDetails.tsx`
- Modify: `src/features/ModelList/components/ModelItem/ModelItemPricing.tsx`
- Modify: `src/features/ModelList/ModelList.tsx`
- Modify: `src/locales/en/modelList.json`
- Modify: `src/locales/es-419/modelList.json`
- Modify: `src/locales/ja/modelList.json`
- Modify: `src/locales/vi/modelList.json`
- Modify: `src/locales/zh-CN/modelList.json`
- Modify: `src/locales/zh-TW/modelList.json`
- Modify: `tests/features/ModelList/components/ControlPanel.test.tsx`
- Modify: `tests/features/ModelList/components/AllAccountsGroupFilterMenu.test.tsx`
- Modify: `tests/features/ModelList/components/ModelDisplay.test.tsx`
- Modify: `tests/features/ModelList/components/ModelItem.test.tsx`
- Modify: `tests/features/ModelList/components/ModelItemDetails.test.tsx`
- Modify: `tests/features/ModelList/components/ModelItemPricing.test.tsx`

- [ ] **Step 1: Write failing label and option tests**

Add assertions that:

- `formatGroupLabelFromRatios("vip", {})` returns `"vip"`, not `"vip (1x)"`.
- `formatGroupLabelFromRatios("free", { free: 0 })` returns `"free (0x)"`.
- Control Panel renders an unpriced usable group as plain `vip`.
- All Accounts Group Filter renders `{ name: "vip" }` as plain `vip` and a
  priced option as `default (1x)`.

Place the pure formatter assertions in a new
`tests/features/ModelList/groupLabels.test.ts` and extend the existing
component tests for the two controls with:

```ts
// groupLabels.test.ts
it("omits unknown ratios and preserves zero ratios", () => {
  expect(formatGroupLabelFromRatios("vip", {})).toBe("vip")
  expect(formatGroupLabelFromRatios("free", { free: 0 })).toBe("free (0x)")
})

// ControlPanel.test.tsx
it("renders usable groups without fabricated ratio suffixes", () => {
  renderControlPanel({
    availableGroups: ["default", "vip"],
    selectedGroups: [],
    pricingData: { group_ratio: { default: 1 } },
  })

  expect(screen.getByRole("checkbox", { name: "default (1x)" })).toBeVisible()
  expect(screen.getByRole("checkbox", { name: "vip" })).toBeVisible()
  expect(screen.queryByRole("checkbox", { name: "vip (1x)" })).toBeNull()
})

// AllAccountsGroupFilterMenu.test.tsx
it("omits ratios that are not consistent account metadata", async () => {
  const user = userEvent.setup()
  renderMenu({
    availableAccountGroupsByAccountId: {
      "account-1": ["default", "vip"],
    },
    availableAccountGroupOptionsByAccountId: {
      "account-1": [{ name: "default", ratio: 1 }, { name: "vip" }],
    },
  })

  await openAccountGroupFilterMenu(user)
  await user.click(getAccountSection("Primary Account").getByRole("combobox"))

  expect(await screen.findByRole("option", { name: "default (1x)" })).toBeVisible()
  expect(await screen.findByRole("option", { name: "vip" })).toBeVisible()
  expect(screen.queryByRole("option", { name: "vip (1x)" })).toBeNull()
})
```

- [ ] **Step 2: Run label/option tests and verify RED**

Run:

```powershell
pnpm exec vitest --run tests/features/ModelList/groupLabels.test.ts tests/features/ModelList/components/ControlPanel.test.tsx tests/features/ModelList/components/AllAccountsGroupFilterMenu.test.tsx
```

Expected: the missing-ratio label assertion FAILS with `vip (1x)` and the
optional all-account ratio fixture fails type/render expectations.

- [ ] **Step 3: Make display ratio resolution optional**

Replace `resolveGroupRatio` in `groupLabels.ts` with:

```ts
export function resolveKnownGroupRatio(
  group: string,
  groupRatios: Record<string, number>,
): number | undefined {
  const ratio = groupRatios[group]
  return typeof ratio === "number" && Number.isFinite(ratio)
    ? ratio
    : undefined
}

export function formatGroupLabel(group: string, ratio: number) {
  return `${group} (${ratio}x)`
}

export function formatGroupLabelFromRatios(
  group: string,
  groupRatios: Record<string, number>,
) {
  const ratio = resolveKnownGroupRatio(group, groupRatios)
  return ratio === undefined ? group : formatGroupLabel(group, ratio)
}
```

Use `formatGroupLabelFromRatios` in Control Panel. In All Accounts Group
Filter, render:

```ts
label:
  group.ratio === undefined
    ? group.name
    : formatGroupLabel(group.name, group.ratio),
```

- [ ] **Step 4: Write failing Model Item semantic tests**

Update Model Item fixtures to include `groupContext` and
`activeGroupContext`. Add behavior-level tests for:

- Compact summary with supported `["vip", "default"]`, usable
  `["default"]`, and ratios `{ default: 1 }` renders `default (1x)` and never
  `vip (1x)`.
- Expanded details render current usable `default (1x)` as interactive and
  site-supported-only `vip` as a non-interactive plain badge.
- A usable-but-unpriced `vip` badge is interactive, has no `1x`, and explains
  that the multiplier is unavailable.
- Known-empty access shows the local no-usable-group guidance and never
  recommends a supported-only group.
- Model key and single-model verification callbacks receive
  `activeGroupContext.actionGroups`, including exact `["vip"]` for an unpriced
  selected group and `[]` for known-empty access.
- A `not-applicable` profile row passes `undefined` group restrictions to its
  verification action rather than fabricating a default group; AIHubMix keeps
  its existing disabled key/verification actions.
- A `not-applicable` context with non-empty raw `enable_groups` renders no
  compact summary, current-usable section, or site-supported badges. Cover this
  directly in `ModelItemDetails.test.tsx` with `showGroupDetails={true}` so the
  assertion cannot pass only because an outer capability happened to hide the
  whole details component.

In `ModelItemPricing.test.tsx`, add assertions that ordinary ratio rows render
the `modelRatio` label and Sub2API estimated direct-price rows render the
`groupRatio` label. Add a case for
`GROUP_RATIO_UNAVAILABLE` copy.

- [ ] **Step 5: Run Model Item tests and verify RED**

Run:

```powershell
pnpm exec vitest --run tests/features/ModelList/components/ModelDisplay.test.tsx tests/features/ModelList/components/ModelItem.test.tsx tests/features/ModelList/components/ModelItemDetails.test.tsx tests/features/ModelList/components/ModelItemPricing.test.tsx
```

Expected: FAIL because components still iterate `model.enable_groups`, format
missing ratios as `1x`, and build actions from raw model support.

- [ ] **Step 6: Route row contexts through the component boundary**

Import `MODEL_GROUP_ACCESS_STATES` anywhere presentation or action routing
branches on access state. Add these required props to `ModelItemProps`:

```ts
groupContext: ModelGroupContext
activeGroupContext: ActiveModelGroupContext
```

Pass `item.groupContext` and `item.activeGroupContext` from `ModelDisplay`.
Remove `selectedGroups`, `availableGroups`, and `isAllGroupsMode` from
`ModelItemProps` because the row context now owns their only row-level uses.
After updating `ModelDisplay`, remove those two pass-through props from
`ModelDisplayProps` and from `ModelList.renderModelDisplay`; Control Panel keeps
the page-level selection and options.

Build the single-model action restriction exactly as:

```ts
const modelActionEnableGroups =
  groupContext.accessState === MODEL_GROUP_ACCESS_STATES.NOT_APPLICABLE
    ? undefined
    : activeGroupContext.actionGroups
```

Use that value for `onOpenModelKeyDialog` and `onVerifyModel`. Passing an empty
array for known-empty/unknown group-aware access is intentional: token
compatibility treats it as matching no group instead of widening to every
token.

- [ ] **Step 7: Separate current usable and supported-only presentation**

In `ModelItem`, derive:

```ts
const hasGroupSemantics =
  groupContext.accessState !== MODEL_GROUP_ACCESS_STATES.NOT_APPLICABLE
const usableGroupLabels = hasGroupSemantics
  ? groupContext.usableGroups.map((group) =>
      formatGroupLabelFromRatios(group, groupRatios),
    )
  : []
const supportedOnlyGroups = hasGroupSemantics
  ? groupContext.supportedGroups.filter(
      (group) => !groupContext.usableGroups.includes(group),
    )
  : []
```

Require `hasGroupSemantics` in `showGroupDetails` and in both group sections of
`ModelItemDetails`, even if a caller supplies `showGroupDetails={true}`. Use
only `usableGroupLabels` for the compact summary and title. Treat
`accessState === MODEL_GROUP_ACCESS_STATES.KNOWN && usableGroups.length === 0`
as unavailable for the
current account with this exact precedence:

```ts
const hasKnownNoUsableGroup =
  groupContext.accessState === MODEL_GROUP_ACCESS_STATES.KNOWN &&
  groupContext.usableGroups.length === 0
const isAvailableForUser = hasKnownNoUsableGroup
  ? false
  : hasRuntimeDiscoveredPricingGap
    ? true
    : showGroupDetails
      ? activeGroupContext.activeUsableGroups.length > 0
      : true
```

This keeps existing catalog/unknown price gaps visible without claiming model
unavailability.

Change `ModelItemDetailsProps` to accept both contexts. Render two sections:

- `currentUsableGroups`: iterate `groupContext.usableGroups`; look up a finite
  ratio with `resolveKnownGroupRatio`; make the badge clickable when allowed;
  use `groupRatioUnavailable` when no ratio exists.
- `siteSupportedGroups`: iterate `supportedOnlyGroups`; render plain secondary
  badges with no tooltip ratio and no click handler; omit the section when the
  difference is empty.

Replace the old unavailable block's raw `model.enable_groups` list with current
usable groups only. When known access is empty, render `noUsableGroupsForModel`
instead of suggesting a switch.

- [ ] **Step 8: Distinguish model ratio from estimated group ratio**

In `ModelItemPricing`, keep the existing value-source decision but select the
label with:

```ts
const ratioLabel = estimatedPriceUsesDirectTokenPrice
  ? t("groupRatio")
  : t("modelRatio")
```

Use `resolveKnownGroupRatio` for the estimated effective group. Because Task 3
calculates estimated rows only from priceable groups, the value is defined for
normal estimated-price rendering. Map
`MODEL_UNAVAILABLE_PRICE_REASONS.GROUP_RATIO_UNAVAILABLE` to
`unavailablePriceReasons.groupRatioUnavailable`.

- [ ] **Step 9: Synchronize app locale copy**

Add these keys to every `src/locales/*/modelList.json` file:

| Key | en | zh-CN | zh-TW | ja | es-419 | vi |
| --- | --- | --- | --- | --- | --- | --- |
| `currentUsableGroups` | Current usable groups | 当前账号可用分组 | 當前帳號可用分組 | 現在のアカウントで利用可能なグループ | Grupos utilizables por la cuenta actual | Nhóm tài khoản hiện tại có thể dùng |
| `siteSupportedGroups` | Site-supported groups | 站点支持的分组 | 站點支援的分組 | サイトが対応するグループ | Grupos compatibles con el sitio | Nhóm được trang hỗ trợ |
| `groupRatioUnavailable` | Group multiplier unavailable | 分组倍率不可用 | 分組倍率不可用 | グループ倍率を取得できません | Multiplicador de grupo no disponible | Không có hệ số nhóm |
| `modelRatio` | Model ratio: | 模型倍率： | 模型倍率： | モデル倍率: | Proporción del modelo: | Hệ số mô hình: |
| `groupRatio` | Group ratio: | 分组倍率： | 分組倍率： | グループ倍率: | Proporción del grupo: | Hệ số nhóm: |
| `noUsableGroupsForModel` | This account currently has no usable group for this model. | 当前账号没有可用于此模型的分组。 | 當前帳號沒有可用於此模型的分組。 | このモデルに利用できるグループが現在のアカウントにありません。 | Esta cuenta no tiene ningún grupo utilizable para este modelo. | Tài khoản này hiện không có nhóm dùng được cho mô hình này. |

Add `unavailablePriceReasons.groupRatioUnavailable` in all six locales with the
meaning “Price is unavailable because this usable group has no multiplier.”
Remove the old generic `ratio` key from all six locale files after replacing
its only `t("ratio")` call in `ModelItemPricing`. Confirm the removal with
`rg -n 't\("ratio"\)' src` before running extraction.

- [ ] **Step 10: Run UI, locale, and compile checks**

Run:

```powershell
pnpm exec vitest --run tests/features/ModelList/groupLabels.test.ts tests/features/ModelList/components/ControlPanel.test.tsx tests/features/ModelList/components/AllAccountsGroupFilterMenu.test.tsx tests/features/ModelList/components/ModelDisplay.test.tsx tests/features/ModelList/components/ModelItem.test.tsx tests/features/ModelList/components/ModelItemDetails.test.tsx tests/features/ModelList/components/ModelItemPricing.test.tsx
pnpm run i18n:extract:ci
pnpm compile
```

Expected: all focused tests PASS, locale extraction reports no changes, and
compile exits `0`.

- [ ] **Step 11: Commit Task 5**

```powershell
git add -- src/features/ModelList/groupLabels.ts src/features/ModelList/components/ControlPanel.tsx src/features/ModelList/components/AllAccountsGroupFilterMenu.tsx src/features/ModelList/components/ModelDisplay.tsx src/features/ModelList/components/ModelItem/index.tsx src/features/ModelList/components/ModelItem/ModelItemDetails.tsx src/features/ModelList/components/ModelItem/ModelItemPricing.tsx src/features/ModelList/ModelList.tsx src/locales/en/modelList.json src/locales/es-419/modelList.json src/locales/ja/modelList.json src/locales/vi/modelList.json src/locales/zh-CN/modelList.json src/locales/zh-TW/modelList.json tests/features/ModelList/groupLabels.test.ts tests/features/ModelList/components/ControlPanel.test.tsx tests/features/ModelList/components/AllAccountsGroupFilterMenu.test.tsx tests/features/ModelList/components/ModelDisplay.test.tsx tests/features/ModelList/components/ModelItem.test.tsx tests/features/ModelList/components/ModelItemDetails.test.tsx tests/features/ModelList/components/ModelItemPricing.test.tsx
pnpm run validate:staged
git diff --cached --check
git commit -m "fix(model-list): distinguish usable and supported groups"
```

## Task 6: Use Action Groups In Batch Verification

**Files:**

- Modify: `src/features/ModelList/batchVerification.ts`
- Modify: `tests/features/ModelList/batchVerification.test.ts`
- Modify: `src/features/ModelList/components/ModelKeyDialog/index.tsx`
- Modify: `tests/features/ModelList/components/ModelKeyDialog.test.tsx`
- Modify: `src/components/Tooltip.tsx`
- Create: `tests/components/Tooltip.test.tsx`

- [ ] **Step 1: Write failing batch action-scope tests**

Import `CalculatedModelItem`, `ModelPricing`, `createAccountSource`,
`MODEL_GROUP_ACCESS_STATES`, `SITE_TYPES`, `AuthTypeEnum`, `SiteHealthStatus`,
and `DisplaySiteData`. Add this exact fixture builder near the top of
`batchVerification.test.ts`:

```ts
type CalculatedModelOverrides = Omit<
  Partial<CalculatedModelItem>,
  "model"
> & {
  model?: Partial<ModelPricing>
}

const batchAccount = {
  id: "acc-1",
  name: "Example Account",
  username: "user",
  balance: { USD: 0, CNY: 0 },
  todayConsumption: { USD: 0, CNY: 0 },
  todayIncome: { USD: 0, CNY: 0 },
  todayTokens: { upload: 0, download: 0 },
  health: { status: SiteHealthStatus.Healthy },
  siteType: SITE_TYPES.NEW_API,
  baseUrl: "https://example.invalid",
  token: "token",
  userId: "1",
  authType: AuthTypeEnum.AccessToken,
  checkIn: { enableDetection: false },
} satisfies DisplaySiteData

function createCalculatedModelItem(
  overrides: CalculatedModelOverrides = {},
): CalculatedModelItem {
  const {
    model: modelOverrides,
    groupContext: groupContextOverride,
    activeGroupContext: activeGroupContextOverride,
    ...itemOverrides
  } = overrides
  const groupContext = groupContextOverride ?? {
    accessState: MODEL_GROUP_ACCESS_STATES.KNOWN,
    supportedGroups: [DEFAULT_MODEL_GROUP],
    usableGroups: [DEFAULT_MODEL_GROUP],
    priceableGroups: [DEFAULT_MODEL_GROUP],
  }

  return {
    model: {
      model_name: "example-model",
      quota_type: 0,
      model_ratio: 1,
      model_price: 0,
      completion_ratio: 1,
      enable_groups: [DEFAULT_MODEL_GROUP],
      supported_endpoint_types: [],
      ...modelOverrides,
    },
    calculatedPrice: {
      priceAvailability: "available",
      inputUSD: 2,
      outputUSD: 2,
      inputCNY: 14,
      outputCNY: 14,
    },
    source: createAccountSource(batchAccount),
    groupRatios: { [DEFAULT_MODEL_GROUP]: 1 },
    groupContext,
    activeGroupContext: activeGroupContextOverride ?? {
      activeUsableGroups: [...groupContext.usableGroups],
      activePriceableGroups: [...groupContext.priceableGroups],
      actionGroups: [...groupContext.usableGroups],
    },
    resolvedVendor: { state: "unknown" },
    ...itemOverrides,
  }
}
```

Add these tests:

```ts
it("uses derived action groups instead of raw supported groups", () => {
  const [item] = createBatchVerifyModelItems([
    createCalculatedModelItem({
      model: {
        model_name: "example-model",
        enable_groups: ["default", "vip"],
      },
      groupContext: {
        accessState: MODEL_GROUP_ACCESS_STATES.KNOWN,
        supportedGroups: ["default", "vip"],
        usableGroups: ["default"],
        priceableGroups: ["default"],
      },
      activeGroupContext: {
        activeUsableGroups: ["default"],
        activePriceableGroups: ["default"],
        actionGroups: ["default"],
      },
      effectiveGroup: undefined,
    }),
  ])

  expect(item?.enableGroups).toEqual(["default"])
})

it("keeps an empty action scope for unknown group-aware rows", () => {
  const [item] = createBatchVerifyModelItems([
    createCalculatedModelItem({
      groupContext: {
        accessState: MODEL_GROUP_ACCESS_STATES.UNKNOWN,
        supportedGroups: ["default"],
        usableGroups: [],
        priceableGroups: [],
      },
      activeGroupContext: {
        activeUsableGroups: [],
        activePriceableGroups: [],
        actionGroups: [],
      },
    }),
  ])

  expect(item?.enableGroups).toEqual([])
})

it("uses null group restrictions for not-applicable rows", () => {
  const [item] = createBatchVerifyModelItems([
    createCalculatedModelItem({
      groupContext: {
        accessState: MODEL_GROUP_ACCESS_STATES.NOT_APPLICABLE,
        supportedGroups: [],
        usableGroups: [],
        priceableGroups: [],
      },
      activeGroupContext: {
        activeUsableGroups: [],
        activePriceableGroups: [],
        actionGroups: [],
      },
    }),
  ])

  expect(item?.enableGroups).toBeNull()
})
```

Migrate the existing `createBatchVerifyModelItems` row literals that rely on
group behavior to this helper. Keep source-identity-specific overrides in
their individual tests.

- [ ] **Step 2: Run batch tests and verify RED**

Run:

```powershell
pnpm exec vitest --run tests/features/ModelList/batchVerification.test.ts
```

Expected: the first test reports raw `["default", "vip"]`, and the new context
fields are not consumed.

- [ ] **Step 3: Replace raw fallback with action scope**

In `createBatchVerifyModelItems`, set:

```ts
enableGroups:
  item.groupContext.accessState === MODEL_GROUP_ACCESS_STATES.NOT_APPLICABLE
    ? null
    : item.activeGroupContext.actionGroups,
```

Do not fall back to `model.enable_groups` or `DEFAULT_MODEL_GROUP`.

Confirm `ModelKeyDialog` still receives `modelEnableGroups` from Task 5 and
passes it unchanged into `useModelKeyDialog` token compatibility. Preserve the
difference between `undefined` (legacy default-group fallback) and `[]`
(strictly no usable group): the strict-empty branch must hide every key-creation
path rather than widening to `default`. Keep clickable group badges accessible
by anchoring their Tooltip to the actual focusable child.

- [ ] **Step 4: Run action workflow tests**

Run:

```powershell
pnpm exec vitest --run tests/features/ModelList/batchVerification.test.ts tests/features/ModelList/components/ModelDisplay.test.tsx tests/features/ModelList/components/ModelItem.test.tsx tests/features/ModelList/components/ModelKeyDialog.test.tsx tests/components/Tooltip.test.tsx
```

Expected: all files PASS; supported-only groups do not reach single or batch
actions, while usable-but-unpriced groups remain eligible.

- [ ] **Step 5: Commit Task 6**

```powershell
git add -- src/features/ModelList/batchVerification.ts tests/features/ModelList/batchVerification.test.ts src/features/ModelList/components/ModelKeyDialog/index.tsx tests/features/ModelList/components/ModelKeyDialog.test.tsx src/components/Tooltip.tsx tests/components/Tooltip.test.tsx
pnpm run validate:staged
git diff --cached --check
git commit -m "fix(model-list): scope verification to usable groups"
```

The Model Key Dialog change is a narrow downstream contract fix: it preserves
the strict empty scope delivered by Task 5 and keeps the existing undefined
fallback for callers that do not provide group restrictions.

## Task 7: Full Regression And Maintainability Gate

**Files:**

- Inspect: all files changed by Tasks 1-6
- No new production file is expected in this task.

- [ ] **Step 1: Run the complete focused regression set**

```powershell
pnpm exec vitest --run tests/features/ModelList/groupContext.test.ts tests/features/ModelList/modelManagementSources.test.ts tests/features/ModelList/groupSelectionState.test.ts tests/features/ModelList/groupLabels.test.ts tests/services/accounts/accountSiteProfile.test.ts tests/utils/modelPricing.test.ts tests/utils/one-hub-transform.test.ts tests/services/apiAdapters/newApi/modelPricing.test.ts tests/services/modelList/accountSources/sub2apiEstimates.test.ts tests/entrypoints/options/pages/ModelList/useFilteredModels.test.ts tests/entrypoints/options/pages/ModelList/useModelListData.test.tsx tests/features/ModelList/components/ControlPanel.test.tsx tests/features/ModelList/components/AllAccountsGroupFilterMenu.test.tsx tests/features/ModelList/components/ModelDisplay.test.tsx tests/features/ModelList/components/ModelItem.test.tsx tests/features/ModelList/components/ModelItemDetails.test.tsx tests/features/ModelList/components/ModelItemPricing.test.tsx tests/features/ModelList/batchVerification.test.ts tests/features/ModelList/components/ModelKeyDialog.test.tsx
pnpm exec vitest --run tests/components/Tooltip.test.tsx tests/entrypoints/options/pages/ModelList/useModelData.test.tsx tests/entrypoints/options/pages/ModelList/ControlPanel.capabilities.test.tsx tests/entrypoints/options/pages/ModelList/ModelItem.profileActions.test.tsx tests/entrypoints/options/pages/ModelList/ModelListPageFlows.test.tsx tests/features/ModelList/ModelList.test.tsx
```

Expected: every listed file PASS with zero failed tests. The second command
covers post-plan production surfaces added while closing strict-empty and
refresh-authority gaps.

- [ ] **Step 2: Run related tests for every production surface**

```powershell
pnpm exec vitest related --run src/features/ModelList/groupContext.ts src/features/ModelList/groupSelectionState.ts src/features/ModelList/modelManagementSources.ts src/features/ModelList/hooks/useFilteredModels.ts src/features/ModelList/hooks/useModelListData.ts src/features/ModelList/groupLabels.ts src/features/ModelList/components/ControlPanel.tsx src/features/ModelList/components/AllAccountsGroupFilterMenu.tsx src/features/ModelList/components/ModelDisplay.tsx src/features/ModelList/components/ModelItem/index.tsx src/features/ModelList/components/ModelItem/ModelItemDetails.tsx src/features/ModelList/components/ModelItem/ModelItemPricing.tsx src/features/ModelList/batchVerification.ts src/services/accounts/accountSiteProfile/contracts.ts src/services/accounts/accountSiteProfile/profiles.ts src/services/accountSiteDefinitions/definitions.ts src/services/modelList/pricingModel.ts src/services/apiService/oneHub/transform.ts src/services/models/utils/modelPricing.ts
$productionFiles = git diff --name-only origin/main...HEAD -- src | Where-Object { $_ -match '\.(ts|tsx)$' }
pnpm exec vitest related @productionFiles --run
```

Expected: all related tests PASS. The dynamic pass ensures later task-scoped
production additions cannot fall outside the handoff gate.

- [ ] **Step 3: Run locale, type, dependency, and repository gates**

```powershell
pnpm run i18n:extract:ci
pnpm compile
pnpm knip
pnpm run validate:push
```

Expected: each command exits `0`; extraction produces no locale diff; `knip`
reports no new unused exports or files.

- [ ] **Step 4: Verify commit gates and final repository state**

Every task commit already ran `validate:staged` against its own staged files.
Do not restage committed files. Run:

```powershell
git status --short
$baseCommit = git merge-base HEAD origin/main
git diff --check "$baseCommit..HEAD"
git log --oneline "$baseCommit..HEAD"
```

Expected: diff check prints no errors; the six planned conventional commits are
present in the branch log (plus any pre-existing branch commits); there are no
task-scoped staged or unstaged changes. Preserve and report unrelated
pre-existing status entries instead of cleaning them.

- [ ] **Step 5: Audit behavior and maintainability before handoff**

Confirm from the final diff and tests:

- `enable_groups` remains raw and is used only for supported metadata.
- `usable_group` values are never interpreted; only normalized keys are used.
- Filters and actions consume usable groups; price selection consumes
  priceable groups.
- Missing ratios never render `1x`; finite zero remains `0x` and calculates as
  zero.
- Unknown, known-empty, compatible fallback, and not-applicable states are
  distinct.
- Selection repair is settled-load guarded and preserves failed-account state.
- `ModelKeyDialog` does not need a parallel group-policy implementation.
- No duplicated group intersection/fallback logic remains in components.
- No telemetry or settings-search change was added.

If hooks modified files during validation, inspect and include only task-scoped
formatting changes in the appropriate existing commit via a new conventional
fixup commit; never amend or restage unrelated user work.

## E2E And Release Decisions

- **E2E:** none. The regression is deterministic response normalization,
  filtering, price selection, prop routing, and component rendering. Focused
  Vitest/Testing Library coverage is the correct layer.
- **Telemetry:** none. This corrects existing interpretation and copy; it adds
  no new user action or privacy-safe adoption question.
- **Settings search/deep links:** not applicable; no setting changes.
- **Documentation:** the design and this implementation plan are sufficient;
  user-facing changes are synchronized app locale copy.

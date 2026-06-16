# Sub2API All-Key Model Comparison Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Sub2API accounts in the all-accounts Model List load every usable saved runtime key and compare each key as its own source.

**Architecture:** Keep Sub2API runtime-key catalog loading in the Model List data hook layer, while keeping `loadAccountTokenFallbackPricingResponse()` single-token scoped. Add a lightweight `sourceIdentity` metadata object to pricing contexts and calculated rows so key-scoped rows remain distinct for row keys, source labels, group candidates, sorting, and lowest-price badges without changing account-backed verification actions.

**Tech Stack:** TypeScript, React hooks, TanStack Query `useQueries`, Vitest, Testing Library hook tests, existing Model List source/capability helpers.

---

## Files And Responsibilities

- Modify `src/features/ModelList/modelManagementSources.ts`
  - Own the shared `ModelListSourceIdentity` type and source-identity helper functions.
- Modify `src/features/ModelList/hooks/useModelData.ts`
  - Return account-level pricing query results as arrays of `AccountPricingContext`.
  - Load all Sub2API account tokens with bounded per-account concurrency.
  - Preserve partial key failures as account query state without blocking successful key contexts.
- Modify `src/features/ModelList/hooks/useFilteredModels.ts`
  - Carry `sourceIdentity` through raw/calculated rows.
  - Use source identity for row keys, price-key maps, sort tie-breakers, and source-level group candidates.
  - Keep account filters and account summary counts keyed by `account.id`.
- Modify `src/features/ModelList/sourceLabels.ts`
  - Include token names in row source labels when the row is token-scoped.
- Modify `src/features/ModelList/components/ModelItem/index.tsx`
  - Accept and pass token source identity to `formatModelListSourceLabel()`.
- Modify `src/features/ModelList/components/ModelDisplay.tsx`
  - Pass calculated-row source identity into `ModelItem`.
- Inspect `src/features/ModelList/batchVerification.ts`
  - It already calls `getModelItemKey(item)` on `CalculatedModelItem`; verify
    token-scoped rows dedupe by token identity after `CalculatedModelItem`
    carries `sourceIdentity`.
- Modify `tests/entrypoints/options/pages/ModelList/useModelData.test.tsx`
  - Cover Sub2API all-key loading, partial failures, total failures, and refresh.
- Modify `tests/entrypoints/options/pages/ModelList/useFilteredModels.test.ts`
  - Cover row identity, lowest-price comparison, account filtering, and source-level group candidate isolation.
- Create `tests/entrypoints/options/pages/ModelList/sourceLabels.test.ts`
  - Cover token source labels without raw key leakage.

---

### Task 1: Add Source Identity Plumbing

**Files:**

- Modify: `src/features/ModelList/modelManagementSources.ts`
- Modify: `src/features/ModelList/hooks/useModelData.ts`
- Modify: `src/features/ModelList/hooks/useFilteredModels.ts`
- Test: `tests/entrypoints/options/pages/ModelList/useFilteredModels.test.ts`

- [ ] **Step 1: Write the failing row-key test**

Add this test near the existing all-accounts cheapest-sort tests in `tests/entrypoints/options/pages/ModelList/useFilteredModels.test.ts`:

```ts
  it("keeps same-account token sources distinct when they expose the same model", async () => {
    const account = createDisplayAccount({
      id: "account-sub2api-multi-key",
      name: "Sub2API",
      siteType: SITE_TYPES.SUB2API,
      baseUrl: "https://sub2api.example.invalid",
    })

    const { result } = renderUseFilteredModels({
      pricingContexts: [
        {
          account,
          sourceIdentity: {
            kind: "account-token",
            id: "account-sub2api-multi-key:token:11",
            tokenId: 11,
            tokenName: "Default key",
          },
          pricing: createPricingResponse(
            [
              {
                model_name: "shared-model",
                quota_type: 0,
                model_ratio: 0,
                completion_ratio: 1,
                enable_groups: ["default"],
                token_price_usd_per_million: {
                  input: 0.5,
                  output: 1,
                },
                price_metadata: {
                  source: MODEL_PRICE_SOURCE_KINDS.OFFICIAL_RATE_ESTIMATE,
                  precision: MODEL_PRICE_PRECISION_KINDS.ESTIMATED,
                },
              },
            ],
            {
              group_ratio: { default: 1 },
              model_list_source: {
                kind: MODEL_LIST_SOURCE_KINDS.SUB2API_RUNTIME_KEY,
                provider: SITE_TYPES.SUB2API,
                supportsRuntimeModelList: true,
                supportsPricing: true,
              },
            },
          ),
        },
        {
          account,
          sourceIdentity: {
            kind: "account-token",
            id: "account-sub2api-multi-key:token:12",
            tokenId: 12,
            tokenName: "VIP key",
          },
          pricing: createPricingResponse(
            [
              {
                model_name: "shared-model",
                quota_type: 0,
                model_ratio: 0,
                completion_ratio: 1,
                enable_groups: ["vip"],
                token_price_usd_per_million: {
                  input: 0.25,
                  output: 0.75,
                },
                price_metadata: {
                  source: MODEL_PRICE_SOURCE_KINDS.OFFICIAL_RATE_ESTIMATE,
                  precision: MODEL_PRICE_PRECISION_KINDS.ESTIMATED,
                },
              },
            ],
            {
              group_ratio: { vip: 0.5 },
              model_list_source: {
                kind: MODEL_LIST_SOURCE_KINDS.SUB2API_RUNTIME_KEY,
                provider: SITE_TYPES.SUB2API,
                supportsRuntimeModelList: true,
                supportsPricing: true,
              },
            },
          ),
        },
      ],
      selectedSource: createAllAccountsSource(),
      sortMode: MODEL_LIST_SORT_MODES.MODEL_CHEAPEST_FIRST,
    })

    await waitFor(() => {
      expect(
        result.current.filteredModels.map((item) => [
          item.source.kind === "account" ? item.source.account.id : "profile",
          item.sourceIdentity?.id,
          item.effectiveGroup,
          item.calculatedPrice.inputUSD,
          item.isLowestPrice,
        ]),
      ).toEqual([
        [
          "account-sub2api-multi-key",
          "account-sub2api-multi-key:token:12",
          "vip",
          0.25,
          true,
        ],
        [
          "account-sub2api-multi-key",
          "account-sub2api-multi-key:token:11",
          "default",
          0.5,
          false,
        ],
      ])
    })
  })
```

- [ ] **Step 2: Run the focused test and verify it fails**

Run:

```bash
pnpm vitest --run tests/entrypoints/options/pages/ModelList/useFilteredModels.test.ts -t "keeps same-account token sources distinct"
```

Expected: TypeScript or runtime failure because `sourceIdentity` is not part of `AccountPricingContext` or `CalculatedModelItem`, and current row identity collapses same-account token rows.

- [ ] **Step 3: Add shared source identity types**

Append these exports after `ModelManagementItemSource` in `src/features/ModelList/modelManagementSources.ts`:

```ts
export const MODEL_LIST_SOURCE_IDENTITY_KINDS = {
  ACCOUNT: "account",
  ACCOUNT_TOKEN: "account-token",
} as const

export type ModelListSourceIdentity =
  | {
      kind: typeof MODEL_LIST_SOURCE_IDENTITY_KINDS.ACCOUNT
      id: string
    }
  | {
      kind: typeof MODEL_LIST_SOURCE_IDENTITY_KINDS.ACCOUNT_TOKEN
      id: string
      tokenId: number
      tokenName?: string
    }

export function createAccountModelListSourceIdentity(
  accountId: string,
): ModelListSourceIdentity {
  return {
    kind: MODEL_LIST_SOURCE_IDENTITY_KINDS.ACCOUNT,
    id: accountId,
  }
}

export function createAccountTokenModelListSourceIdentity(params: {
  accountId: string
  tokenId: number
  tokenName?: string
}): ModelListSourceIdentity {
  const tokenName = params.tokenName?.trim()

  return {
    kind: MODEL_LIST_SOURCE_IDENTITY_KINDS.ACCOUNT_TOKEN,
    id: `${params.accountId}:token:${params.tokenId}`,
    tokenId: params.tokenId,
    ...(tokenName ? { tokenName } : {}),
  }
}
```

- [ ] **Step 4: Extend pricing contexts**

In `src/features/ModelList/hooks/useModelData.ts`, update the import from `modelManagementSources` and extend `AccountPricingContext`:

```ts
import {
  createAccountModelListSourceIdentity,
  MODEL_MANAGEMENT_SOURCE_KINDS,
  type ModelListSourceIdentity,
  type ModelManagementSource,
} from "~/features/ModelList/modelManagementSources"

export interface AccountPricingContext {
  account: DisplaySiteData
  pricing: PricingResponse
  sourceIdentity?: ModelListSourceIdentity
}
```

In the single-account `pricingContexts` memo, add account identity:

```ts
  const pricingContexts: AccountPricingContext[] = useMemo(
    () =>
      currentAccount && pricingData
        ? [
            {
              account: currentAccount,
              pricing: pricingData,
              sourceIdentity: createAccountModelListSourceIdentity(
                currentAccount.id,
              ),
            },
          ]
        : [],
    [currentAccount, pricingData],
  )
```

- [ ] **Step 5: Carry source identity through filtering**

In `src/features/ModelList/hooks/useFilteredModels.ts`, import the type and add a helper:

```ts
import {
  createAccountSource,
  deriveModelListSourceCapabilities,
  MODEL_MANAGEMENT_SOURCE_KINDS,
  type ModelListSourceIdentity,
  type ModelManagementSource,
} from "~/features/ModelList/modelManagementSources"

function getModelListSourceIdentityKey(params: {
  source:
    | ReturnType<typeof createAccountSource>
    | Extract<
        NonNullable<ModelManagementSource>,
        { kind: typeof MODEL_MANAGEMENT_SOURCE_KINDS.PROFILE }
      >
  sourceIdentity?: ModelListSourceIdentity
}) {
  return (
    params.sourceIdentity?.id ??
    (params.source.kind === MODEL_MANAGEMENT_SOURCE_KINDS.ACCOUNT
      ? params.source.account.id
      : params.source.profile.id)
  )
}
```

Add `sourceIdentity?: ModelListSourceIdentity` to both `RawModelItem` and `CalculatedModelItem`.

Update `getModelItemKey()`:

```ts
export function getModelItemKey(
  item: Pick<CalculatedModelItem, "model" | "source" | "sourceIdentity">,
) {
  const sourceId = getModelListSourceIdentityKey({
    source: item.source,
    sourceIdentity: item.sourceIdentity,
  })

  return `${item.source.kind}:${sourceId}:${item.model.model_name}`
}
```

When building raw rows from `pricingContexts`, preserve the context identity:

```ts
      return pricingContexts.flatMap(({ account, pricing, sourceIdentity }) => {
        if (!pricing || !Array.isArray(pricing.data)) {
          return []
        }

        const exchangeRate =
          account.balance?.USD > 0
            ? account.balance.CNY / account.balance.USD
            : UI_CONSTANTS.EXCHANGE_RATE.DEFAULT

        const accountSource = createAccountSource(account)
        const allAccountsRowSource = {
          ...accountSource,
          capabilities: {
            ...accountSource.capabilities,
            supportsAccountSummary: true,
          },
        }
        const source = applyAihubmixModelListCapabilities(
          {
            ...allAccountsRowSource,
            capabilities: deriveModelListSourceCapabilities({
              capabilities: allAccountsRowSource.capabilities,
              modelListSource: pricing.model_list_source,
            }),
          },
          pricing,
        )

        return pricing.data.map((model) => ({
          model,
          source,
          sourceIdentity,
          groupRatios: pricing.group_ratio ?? {},
          exchangeRate,
        }))
      })
```

When creating `candidateItem` in `resolveBestCalculatedItem()`, include:

```ts
      sourceIdentity: rawItem.sourceIdentity,
```

- [ ] **Step 6: Run the focused test and verify it passes**

Run:

```bash
pnpm vitest --run tests/entrypoints/options/pages/ModelList/useFilteredModels.test.ts -t "keeps same-account token sources distinct"
```

Expected: PASS.

- [ ] **Step 7: Commit Task 1**

Run:

```bash
git add src/features/ModelList/modelManagementSources.ts src/features/ModelList/hooks/useModelData.ts src/features/ModelList/hooks/useFilteredModels.ts tests/entrypoints/options/pages/ModelList/useFilteredModels.test.ts
git commit -m "feat(model-list): add token source identity"
```

---

### Task 2: Isolate Source-Level Group Candidates And Labels

**Files:**

- Modify: `src/features/ModelList/hooks/useFilteredModels.ts`
- Modify: `src/features/ModelList/sourceLabels.ts`
- Modify: `src/features/ModelList/components/ModelItem/index.tsx`
- Modify: `src/features/ModelList/components/ModelDisplay.tsx`
- Test: `tests/entrypoints/options/pages/ModelList/useFilteredModels.test.ts`
- Create: `tests/entrypoints/options/pages/ModelList/sourceLabels.test.ts`

- [ ] **Step 1: Write the failing group-isolation test**

Add this test near `"treats same-named groups on different accounts as unrelated filters"` in `tests/entrypoints/options/pages/ModelList/useFilteredModels.test.ts`:

```ts
  it("keeps token-scoped group candidates separate under the same account", async () => {
    const account = createDisplayAccount({
      id: "account-sub2api-token-groups",
      name: "Sub2API",
      siteType: SITE_TYPES.SUB2API,
      baseUrl: "https://sub2api.example.invalid",
    })

    const { result } = renderUseFilteredModels({
      pricingContexts: [
        {
          account,
          sourceIdentity: {
            kind: "account-token",
            id: "account-sub2api-token-groups:token:31",
            tokenId: 31,
            tokenName: "Default key",
          },
          pricing: createPricingResponse(
            [
              {
                model_name: "default-model",
                model_ratio: 1,
                completion_ratio: 1,
                enable_groups: ["default"],
              },
            ],
            {
              group_ratio: { default: 1 },
            },
          ),
        },
        {
          account,
          sourceIdentity: {
            kind: "account-token",
            id: "account-sub2api-token-groups:token:32",
            tokenId: 32,
            tokenName: "VIP key",
          },
          pricing: createPricingResponse(
            [
              {
                model_name: "vip-model",
                model_ratio: 1,
                completion_ratio: 1,
                enable_groups: ["vip"],
              },
            ],
            {
              group_ratio: { vip: 0.5 },
            },
          ),
        },
      ],
      selectedSource: createAllAccountsSource(),
      sortMode: MODEL_LIST_SORT_MODES.MODEL_CHEAPEST_FIRST,
      allAccountsExcludedGroupsByAccountId: {
        "account-sub2api-token-groups": ["vip"],
      },
    })

    await waitFor(() => {
      expect(
        result.current.filteredModels.map((item) => [
          item.model.model_name,
          item.sourceIdentity?.id,
          item.effectiveGroup,
        ]),
      ).toEqual([
        [
          "default-model",
          "account-sub2api-token-groups:token:31",
          "default",
        ],
      ])
    })

    expect(result.current.availableAccountGroupsByAccountId).toEqual({
      "account-sub2api-token-groups": ["default", "vip"],
    })
    expect(result.current.availableAccountGroupOptionsByAccountId).toEqual({
      "account-sub2api-token-groups": [
        { name: "default", ratio: 1 },
        { name: "vip", ratio: 0.5 },
      ],
    })
  })
```

- [ ] **Step 2: Write the failing source-label test**

Create `tests/entrypoints/options/pages/ModelList/sourceLabels.test.ts`:

```ts
import { describe, expect, it } from "vitest"

import { SITE_TYPES } from "~/constants/siteType"
import {
  createAccountSource,
  createAccountTokenModelListSourceIdentity,
  createProfileSource,
} from "~/features/ModelList/modelManagementSources"
import { formatModelListSourceLabel } from "~/features/ModelList/sourceLabels"
import { API_TYPES } from "~/services/verification/aiApiVerification"
import { AuthTypeEnum, SiteHealthStatus, type DisplaySiteData } from "~/types"

const createDisplayAccount = (
  overrides: Partial<DisplaySiteData>,
): DisplaySiteData => ({
  id: "account",
  name: "Account",
  username: "user",
  balance: { USD: 0, CNY: 0 },
  todayConsumption: { USD: 0, CNY: 0 },
  todayIncome: { USD: 0, CNY: 0 },
  todayTokens: { upload: 0, download: 0 },
  health: { status: SiteHealthStatus.Healthy },
  siteType: SITE_TYPES.UNKNOWN,
  baseUrl: "https://example.com",
  token: "token",
  userId: "1",
  authType: AuthTypeEnum.AccessToken,
  checkIn: { enableDetection: false },
  ...overrides,
})

const labelOptions = {
  formatProfileLabel: ({ name, host }: { name: string; host?: string }) =>
    host ? `${name} (${host})` : name,
}

describe("formatModelListSourceLabel", () => {
  it("includes token names for account-token model-list sources", () => {
    const account = createDisplayAccount({
      id: "sub2api-account",
      name: "Sub2API Account",
      baseUrl: "https://sub2api.example.invalid",
      siteType: SITE_TYPES.SUB2API,
    })

    const label = formatModelListSourceLabel(
      createAccountSource(account),
      labelOptions,
      createAccountTokenModelListSourceIdentity({
        accountId: account.id,
        tokenId: 41,
        tokenName: "VIP runtime key",
      }),
    )

    expect(label).toEqual({
      label: "Sub2API Account / VIP runtime key · sub2api.example.invalid",
      title: "https://sub2api.example.invalid",
    })
    expect(label.label).not.toContain("sk-")
  })

  it("keeps profile labels unchanged", () => {
    const source = createProfileSource({
      id: "profile",
      name: "Reusable Key",
      apiType: API_TYPES.OPENAI_COMPATIBLE,
      baseUrl: "https://profile.example.invalid/v1",
      apiKey: "sk-secret",
      tagIds: [],
      notes: "",
      createdAt: 1,
      updatedAt: 1,
    })

    expect(formatModelListSourceLabel(source, labelOptions)).toEqual({
      label: "Reusable Key (profile.example.invalid)",
      title: "https://profile.example.invalid/v1",
    })
  })
})
```

- [ ] **Step 3: Run both focused tests and verify they fail**

Run:

```bash
pnpm vitest --run tests/entrypoints/options/pages/ModelList/useFilteredModels.test.ts -t "keeps token-scoped group candidates separate"
pnpm vitest --run tests/entrypoints/options/pages/ModelList/sourceLabels.test.ts
```

Expected: group test fails because current candidate maps are account-keyed only; label test fails because `formatModelListSourceLabel()` has no source identity parameter.

- [ ] **Step 4: Add source-level group maps**

In `src/features/ModelList/hooks/useFilteredModels.ts`, add a helper near `getModelListSourceIdentityKey()`:

```ts
function getRawItemSourceIdentityKey(item: Pick<RawModelItem, "source" | "sourceIdentity">) {
  return getModelListSourceIdentityKey({
    source: item.source,
    sourceIdentity: item.sourceIdentity,
  })
}
```

Add a source-level group memo before `availableAccountGroupsByAccountId`:

```ts
  const availableGroupsBySourceId = useMemo(() => {
    if (
      !selectedSource?.capabilities.supportsGroupFiltering ||
      selectedSource.kind !== MODEL_MANAGEMENT_SOURCE_KINDS.ALL_ACCOUNTS
    ) {
      return {}
    }

    const groupsBySourceId = new Map<string, Set<string>>()

    rawModelItems.forEach((item) => {
      if (item.source.kind !== MODEL_MANAGEMENT_SOURCE_KINDS.ACCOUNT) {
        return
      }

      const sourceId = getRawItemSourceIdentityKey(item)
      const sourceGroups = groupsBySourceId.get(sourceId) ?? new Set<string>()

      Object.keys(item.groupRatios).forEach((group) => {
        if (group) {
          sourceGroups.add(group)
        }
      })
      addAvailableGroups(sourceGroups, item.model)

      groupsBySourceId.set(sourceId, sourceGroups)
    })

    return Object.fromEntries(
      Array.from(groupsBySourceId.entries()).map(([sourceId, groups]) => [
        sourceId,
        toUniqueGroups(groups),
      ]),
    ) as Record<string, string[]>
  }, [
    rawModelItems,
    selectedSource?.capabilities.supportsGroupFiltering,
    selectedSource?.kind,
  ])
```

Keep `availableAccountGroupsByAccountId` and `availableAccountGroupOptionsByAccountId` account-keyed for UI, but compute group candidates from source ids:

```ts
  const includedAllAccountsGroupsBySourceId = useMemo(() => {
    if (selectedSource?.kind !== MODEL_MANAGEMENT_SOURCE_KINDS.ALL_ACCOUNTS) {
      return {}
    }

    return Object.fromEntries(
      rawModelItems.flatMap((item) => {
        if (item.source.kind !== MODEL_MANAGEMENT_SOURCE_KINDS.ACCOUNT) {
          return []
        }

        const sourceId = getRawItemSourceIdentityKey(item)
        const groups = availableGroupsBySourceId[sourceId] ?? []
        const excludedGroups = new Set(
          toUniqueGroups(
            allAccountsExcludedGroupsByAccountId[item.source.account.id] ?? [],
          ),
        )

        return [
          [
            sourceId,
            groups.filter((group) => !excludedGroups.has(group)),
          ],
        ]
      }),
    ) as Record<string, string[]>
  }, [
    allAccountsExcludedGroupsByAccountId,
    availableGroupsBySourceId,
    rawModelItems,
    selectedSource?.kind,
  ])
```

Update `getGroupCandidatesForRawItem()` to read `includedAllAccountsGroupsBySourceId[getRawItemSourceIdentityKey(item)]`.

- [ ] **Step 5: Add token source labels**

Update `src/features/ModelList/sourceLabels.ts`:

```ts
import {
  MODEL_LIST_SOURCE_IDENTITY_KINDS,
  MODEL_MANAGEMENT_SOURCE_KINDS,
} from "~/features/ModelList/modelManagementSources"
import type {
  ModelListSourceIdentity,
  ModelManagementItemSource,
} from "~/features/ModelList/modelManagementSources"

function formatAccountTokenName(sourceIdentity: ModelListSourceIdentity) {
  if (sourceIdentity.kind !== MODEL_LIST_SOURCE_IDENTITY_KINDS.ACCOUNT_TOKEN) {
    return null
  }

  return sourceIdentity.tokenName?.trim() || `#${sourceIdentity.tokenId}`
}
```

Change the function signature and account branch:

```ts
export function formatModelListSourceLabel(
  source: ModelManagementItemSource,
  options: FormatModelListSourceLabelOptions,
  sourceIdentity?: ModelListSourceIdentity,
): ModelListSourceLabel {
  if (source.kind === MODEL_MANAGEMENT_SOURCE_KINDS.PROFILE) {
    const baseUrl = source.profile.baseUrl.trim()
    const host = tryParseUrl(baseUrl)?.host || baseUrl || undefined

    return {
      label: options.formatProfileLabel({
        name: source.profile.name,
        host,
      }),
      title: baseUrl || undefined,
    }
  }

  const baseUrl = source.account.baseUrl?.trim() ?? ""
  const host = tryParseUrl(baseUrl)?.host || baseUrl || undefined
  const tokenName = sourceIdentity ? formatAccountTokenName(sourceIdentity) : null
  const accountLabel = tokenName
    ? `${source.account.name} / ${tokenName}`
    : source.account.name

  return {
    label: host ? `${accountLabel} · ${host}` : accountLabel,
    title: baseUrl || undefined,
  }
}
```

Update `ModelItemProps` in `src/features/ModelList/components/ModelItem/index.tsx`:

```ts
import type {
  ModelListSourceIdentity,
  ModelManagementItemSource,
  ModelManagementSourceCapabilities,
} from "~/features/ModelList/modelManagementSources"

  sourceIdentity?: ModelListSourceIdentity
```

Destructure `sourceIdentity`, and pass it to label formatting:

```ts
  const sourceLabel = formatModelListSourceLabel(
    source,
    {
      formatProfileLabel: ({ name, host }) =>
        t("sourceLabels.profileBadge", { name, host }),
    },
    sourceIdentity,
  )
```

In `src/features/ModelList/components/ModelDisplay.tsx`, pass it into `ModelItem`:

```tsx
              source={sourceForModel}
              sourceIdentity={item.sourceIdentity}
```

- [ ] **Step 6: Run focused tests and verify they pass**

Run:

```bash
pnpm vitest --run tests/entrypoints/options/pages/ModelList/useFilteredModels.test.ts -t "keeps token-scoped group candidates separate"
pnpm vitest --run tests/entrypoints/options/pages/ModelList/sourceLabels.test.ts
```

Expected: PASS.

- [ ] **Step 7: Commit Task 2**

Run:

```bash
git add src/features/ModelList/hooks/useFilteredModels.ts src/features/ModelList/sourceLabels.ts src/features/ModelList/components/ModelItem/index.tsx src/features/ModelList/components/ModelDisplay.tsx tests/entrypoints/options/pages/ModelList/useFilteredModels.test.ts tests/entrypoints/options/pages/ModelList/sourceLabels.test.ts
git commit -m "feat(model-list): distinguish token-scoped rows"
```

---

### Task 3: Load All Sub2API Tokens In All-Accounts Mode

**Files:**

- Modify: `src/features/ModelList/hooks/useModelData.ts`
- Test: `tests/entrypoints/options/pages/ModelList/useModelData.test.tsx`

- [ ] **Step 1: Write the failing all-key load test**

Replace the existing `"loads Sub2API fallback pricing in all-accounts mode so it can be compared"` test in `tests/entrypoints/options/pages/ModelList/useModelData.test.tsx` with:

```ts
  it("loads every Sub2API fallback key in all-accounts mode so each key can be compared", async () => {
    toastSuccessMock.mockReset()
    toastErrorMock.mockReset()

    const fetchModelPricing = vi
      .fn()
      .mockRejectedValue(new Error("common pricing should not be called"))
    vi.mocked(getApiService).mockReturnValue(
      createMockApiService(fetchModelPricing, {
        capabilities: { modelPricing: false },
      }),
    )

    const account = createDisplayAccount({
      id: "sub2api-all-accounts",
      name: "Sub2API Account",
      baseUrl: "https://sub2api-all.example.invalid",
      siteType: SITE_TYPES.SUB2API,
      userId: "sub2api-all-user",
    })
    const fallbackTokens = [
      {
        id: 21,
        user_id: 21,
        key: "sk-sub2api-all-masked-a",
        status: 1,
        name: "Default runtime key",
        created_time: 0,
        accessed_time: 0,
        expired_time: -1,
        remain_quota: 0,
        unlimited_quota: true,
        used_quota: 0,
      },
      {
        id: 22,
        user_id: 21,
        key: "sk-sub2api-all-masked-b",
        status: 1,
        name: "VIP runtime key",
        created_time: 0,
        accessed_time: 0,
        expired_time: -1,
        remain_quota: 0,
        unlimited_quota: true,
        used_quota: 0,
      },
    ]
    const defaultPricing = {
      data: [
        {
          model_name: "example-runtime-priced-model",
          quota_type: 0,
          model_ratio: 2,
          model_price: 0,
          completion_ratio: 1,
          enable_groups: ["default"],
          supported_endpoint_types: [],
          price_metadata: {
            source: MODEL_PRICE_SOURCE_KINDS.OFFICIAL_RATE_ESTIMATE,
            precision: MODEL_PRICE_PRECISION_KINDS.ESTIMATED,
          },
        },
      ],
      group_ratio: { default: 1 },
      success: true,
      usable_group: { default: "default" },
      model_list_source: {
        kind: MODEL_LIST_SOURCE_KINDS.SUB2API_RUNTIME_KEY,
        provider: SITE_TYPES.SUB2API,
        supportsRuntimeModelList: true,
        supportsPricing: true,
      },
    }
    const vipPricing = {
      ...defaultPricing,
      data: [
        {
          ...defaultPricing.data[0],
          model_name: "example-runtime-vip-model",
          enable_groups: ["vip"],
        },
      ],
      group_ratio: { vip: 0.5 },
      usable_group: { vip: "vip" },
    }

    mockFetchDisplayAccountTokens.mockResolvedValueOnce(fallbackTokens)
    mockLoadAccountTokenFallbackPricingResponse
      .mockResolvedValueOnce(defaultPricing)
      .mockResolvedValueOnce(vipPricing)

    const { result } = renderHook(
      () =>
        useModelData({
          selectedSource: createAllAccountsSource(),
          accounts: [account],
        }),
      { wrapper: createWrapper() },
    )

    await waitFor(
      () => {
        expect(mockLoadAccountTokenFallbackPricingResponse).toHaveBeenCalledTimes(2)
      },
      { timeout: 3000 },
    )

    expect(fetchModelPricing).not.toHaveBeenCalled()
    expect(result.current.loadErrorMessage).toBeNull()
    expect(result.current.pricingContexts).toEqual([
      {
        account,
        pricing: defaultPricing,
        sourceIdentity: {
          kind: "account-token",
          id: "sub2api-all-accounts:token:21",
          tokenId: 21,
          tokenName: "Default runtime key",
        },
      },
      {
        account,
        pricing: vipPricing,
        sourceIdentity: {
          kind: "account-token",
          id: "sub2api-all-accounts:token:22",
          tokenId: 22,
          tokenName: "VIP runtime key",
        },
      },
    ])
  })
```

- [ ] **Step 2: Write the failing partial-failure test**

Add this test in the same all-accounts describe block:

```ts
  it("keeps successful Sub2API token contexts when another token fails", async () => {
    const fetchModelPricing = vi.fn()
    vi.mocked(getApiService).mockReturnValue(
      createMockApiService(fetchModelPricing, {
        capabilities: { modelPricing: false },
      }),
    )

    const account = createDisplayAccount({
      id: "sub2api-partial",
      name: "Sub2API Partial",
      baseUrl: "https://sub2api-partial.example.invalid",
      siteType: SITE_TYPES.SUB2API,
    })
    const tokens = [
      {
        id: 31,
        user_id: 31,
        key: "sk-success",
        status: 1,
        name: "Success key",
        created_time: 0,
        accessed_time: 0,
        expired_time: -1,
        remain_quota: 0,
        unlimited_quota: true,
        used_quota: 0,
      },
      {
        id: 32,
        user_id: 31,
        key: "sk-failure",
        status: 1,
        name: "Failure key",
        created_time: 0,
        accessed_time: 0,
        expired_time: -1,
        remain_quota: 0,
        unlimited_quota: true,
        used_quota: 0,
      },
    ]
    const pricing = {
      data: [
        {
          model_name: "surviving-model",
          quota_type: 0,
          model_ratio: 1,
          model_price: 0,
          completion_ratio: 1,
          enable_groups: ["default"],
          supported_endpoint_types: [],
        },
      ],
      group_ratio: { default: 1 },
      success: true,
      usable_group: { default: "default" },
    }

    mockFetchDisplayAccountTokens.mockResolvedValueOnce(tokens)
    mockLoadAccountTokenFallbackPricingResponse
      .mockResolvedValueOnce(pricing)
      .mockRejectedValueOnce(new Error("token failed"))

    const { result } = renderHook(
      () =>
        useModelData({
          selectedSource: createAllAccountsSource(),
          accounts: [account],
        }),
      { wrapper: createWrapper() },
    )

    await waitFor(
      () => {
        expect(result.current.pricingContexts).toHaveLength(1)
      },
      { timeout: 3000 },
    )

    expect(result.current.loadErrorMessage).toBeNull()
    expect(result.current.accountQueryStates).toEqual([
      {
        account,
        isLoading: false,
        hasData: true,
        hasError: true,
        errorType: "load-failed",
      },
    ])
  })
```

- [ ] **Step 3: Write the failing all-failed test**

Add:

```ts
  it("marks a Sub2API account failed when every fallback key fails", async () => {
    const fetchModelPricing = vi.fn()
    vi.mocked(getApiService).mockReturnValue(
      createMockApiService(fetchModelPricing, {
        capabilities: { modelPricing: false },
      }),
    )

    const account = createDisplayAccount({
      id: "sub2api-all-failed",
      name: "Sub2API Failed",
      baseUrl: "https://sub2api-failed.example.invalid",
      siteType: SITE_TYPES.SUB2API,
    })
    const tokens = [
      {
        id: 41,
        user_id: 41,
        key: "sk-failed",
        status: 1,
        name: "Failed key",
        created_time: 0,
        accessed_time: 0,
        expired_time: -1,
        remain_quota: 0,
        unlimited_quota: true,
        used_quota: 0,
      },
    ]

    mockFetchDisplayAccountTokens.mockResolvedValueOnce(tokens)
    mockLoadAccountTokenFallbackPricingResponse.mockRejectedValueOnce(
      new Error("token failed"),
    )

    const { result } = renderHook(
      () =>
        useModelData({
          selectedSource: createAllAccountsSource(),
          accounts: [account],
        }),
      { wrapper: createWrapper() },
    )

    await waitFor(
      () => {
        expect(result.current.loadErrorMessage).toBe(
          "modelList:status.loadFailed",
        )
      },
      { timeout: 3000 },
    )

    expect(result.current.pricingContexts).toEqual([])
    expect(result.current.accountQueryStates).toEqual([
      {
        account,
        isLoading: false,
        hasData: false,
        hasError: true,
        errorType: "load-failed",
      },
    ])
  })
```

- [ ] **Step 4: Run the new tests and verify they fail**

Run:

```bash
pnpm vitest --run tests/entrypoints/options/pages/ModelList/useModelData.test.tsx -t "Sub2API"
```

Expected: new multi-key and partial-failure tests fail because the current all-accounts helper requires exactly one token and query data is a single `PricingResponse`.

- [ ] **Step 5: Add query-result types and bounded concurrency**

In `src/features/ModelList/hooks/useModelData.ts`, add imports:

```ts
import {
  createAccountModelListSourceIdentity,
  createAccountTokenModelListSourceIdentity,
  MODEL_MANAGEMENT_SOURCE_KINDS,
  type ModelListSourceIdentity,
  type ModelManagementSource,
} from "~/features/ModelList/modelManagementSources"
```

Add types near `AccountQueryState`:

```ts
interface AccountPricingQueryResult {
  contexts: AccountPricingContext[]
  partialFailureCount?: number
}

interface SettledContextResult {
  context?: AccountPricingContext
  error?: unknown
}
```

Add helpers near `fetchSub2ApiAllAccountsFallbackPricing`:

```ts
const SUB2API_ALL_ACCOUNTS_TOKEN_CONCURRENCY = 4

function hasValidPricingData(data: PricingResponse) {
  return Array.isArray(data.data)
}

async function mapWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  mapper: (item: T) => Promise<R>,
) {
  const results = new Array<R>(items.length)
  let nextIndex = 0
  const workerCount = Math.min(Math.max(concurrency, 1), items.length)

  await Promise.all(
    Array.from({ length: workerCount }, async () => {
      while (nextIndex < items.length) {
        const currentIndex = nextIndex
        nextIndex += 1
        results[currentIndex] = await mapper(items[currentIndex])
      }
    }),
  )

  return results
}

async function loadSub2ApiTokenPricingContext(params: {
  account: DisplaySiteData
  token: ApiToken
}): Promise<SettledContextResult> {
  try {
    const pricing = await loadAccountTokenFallbackPricingResponse(params)
    if (!hasValidPricingData(pricing)) {
      throw createInvalidFormatError()
    }

    return {
      context: {
        account: params.account,
        pricing,
        sourceIdentity: createAccountTokenModelListSourceIdentity({
          accountId: params.account.id,
          tokenId: params.token.id,
          tokenName: params.token.name,
        }),
      },
    }
  } catch (error) {
    return { error }
  }
}
```

Replace `fetchSub2ApiAllAccountsFallbackPricing()` with:

```ts
async function fetchSub2ApiAllAccountsFallbackPricingContexts(
  account: DisplaySiteData,
): Promise<AccountPricingQueryResult> {
  const tokens = await fetchDisplayAccountTokens(account)
  if (tokens.length === 0) {
    throw createUnsupportedModelPricingError()
  }

  const settledResults = await mapWithConcurrency(
    tokens,
    SUB2API_ALL_ACCOUNTS_TOKEN_CONCURRENCY,
    (token) => loadSub2ApiTokenPricingContext({ account, token }),
  )
  const contexts = settledResults.flatMap((result) =>
    result.context ? [result.context] : [],
  )
  const errors = settledResults.flatMap((result) =>
    result.error ? [result.error] : [],
  )

  if (contexts.length === 0) {
    const invalidFormatError = errors.find((error) => {
      const typedError = error as { code?: string } | null | undefined
      return typedError?.code === MODEL_LIST_DATA_ERROR_CODES.INVALID_FORMAT
    })
    throw invalidFormatError ?? createUnsupportedModelPricingError()
  }

  return {
    contexts,
    ...(errors.length > 0 ? { partialFailureCount: errors.length } : {}),
  }
}
```

- [ ] **Step 6: Convert all-accounts queries to context arrays**

In `useAllAccountsModelData()`, update `useQueries` query functions so every successful account returns `AccountPricingQueryResult`.

For Sub2API unsupported common pricing:

```ts
          if (account.siteType === SITE_TYPES.SUB2API) {
            return fetchSub2ApiAllAccountsFallbackPricingContexts(account)
          }
```

For cached account-level pricing:

```ts
        if (cached && Array.isArray(cached.data)) {
          return {
            contexts: [
              {
                account,
                pricing: cached,
                sourceIdentity: createAccountModelListSourceIdentity(
                  account.id,
                ),
              },
            ],
          }
        }
```

For newly fetched account-level pricing:

```ts
        return {
          contexts: [
            {
              account,
              pricing: data,
              sourceIdentity: createAccountModelListSourceIdentity(account.id),
            },
          ],
        }
```

Update aggregate model count:

```ts
    const modelCount = queries.reduce(
      (count, query) =>
        count +
        (query.data?.contexts.reduce(
          (contextCount, context) =>
            contextCount + getPricingModelCount(context.pricing),
          0,
        ) ?? 0),
      0,
    )
```

Update `pricingContexts` memo:

```ts
  const pricingContexts: AccountPricingContext[] = useMemo(() => {
    return queries.flatMap((query) => query.data?.contexts ?? [])
  }, [queries])
```

Update `accountQueryStates`:

```ts
        const hasData = (query?.data?.contexts.length ?? 0) > 0
        const hasError =
          !!query?.error || (query?.data?.partialFailureCount ?? 0) > 0
```

Keep the existing `errorType` rules and add:

```ts
        } else if (hasError) {
          errorType = MODEL_LIST_ACCOUNT_ERROR_TYPES.LOAD_FAILED
        }
```

- [ ] **Step 7: Update refresh invalidation**

Keep account-level cache invalidation for common pricing and refetch each account query:

```ts
  const loadPricingData = useCallback(async () => {
    await Promise.all(
      safeDisplayData.map(async (account, index) => {
        await modelPricingCache.invalidate(createModelPricingCacheKey(account))
        const query = queries[index]
        if (query) {
          await query.refetch()
        }
      }),
    )
  }, [queries, safeDisplayData])
```

Do not add token-level cache in this task unless the implementation introduces a cache write for token contexts. `loadAccountTokenFallbackPricingResponse()` currently performs live fallback loading, so refetching the account query reloads the token sources.

- [ ] **Step 8: Run focused tests and verify they pass**

Run:

```bash
pnpm vitest --run tests/entrypoints/options/pages/ModelList/useModelData.test.tsx -t "Sub2API"
```

Expected: PASS for Sub2API all-accounts, single-account fallback, selected-key fallback, and refresh tests.

- [ ] **Step 9: Commit Task 3**

Run:

```bash
git add src/features/ModelList/hooks/useModelData.ts tests/entrypoints/options/pages/ModelList/useModelData.test.tsx
git commit -m "feat(model-list): load all sub2api keys for comparison"
```

---

### Task 4: Final Integration And Validation

**Files:**

- Modify as needed: `src/features/ModelList/hooks/useFilteredModels.ts`
- Modify as needed: `src/features/ModelList/hooks/useModelData.ts`
- Modify as needed: `src/features/ModelList/batchVerification.ts`
- Modify as needed: `tests/entrypoints/options/pages/ModelList/useModelData.test.tsx`
- Modify as needed: `tests/entrypoints/options/pages/ModelList/useFilteredModels.test.ts`
- Modify as needed: `tests/features/ModelList/batchVerification.test.ts`

- [ ] **Step 1: Run all affected Model List hook tests**

Run:

```bash
pnpm vitest --run tests/entrypoints/options/pages/ModelList/useModelData.test.tsx
pnpm vitest --run tests/entrypoints/options/pages/ModelList/useFilteredModels.test.ts
pnpm vitest --run tests/entrypoints/options/pages/ModelList/sourceLabels.test.ts
```

Expected: all tests pass.

- [ ] **Step 2: Verify batch verification dedupe uses token identity**

Add this case to `tests/features/ModelList/batchVerification.test.ts`:

```ts
  it("keeps same-account token rows separate for batch verification", () => {
    const source = {
      kind: MODEL_MANAGEMENT_SOURCE_KINDS.ACCOUNT,
      account: { id: "batch-sub2api-account" },
      capabilities: { supportsBatchCredentialVerification: true },
    } as any
    const model = { model_name: "shared-model", enable_groups: ["default"] }

    expect(
      createBatchVerifyModelItems([
        {
          model,
          source,
          sourceIdentity: {
            kind: "account-token",
            id: "batch-sub2api-account:token:51",
            tokenId: 51,
            tokenName: "Default key",
          },
          groupRatios: { default: 1 },
          effectiveGroup: "default",
        },
        {
          model,
          source,
          sourceIdentity: {
            kind: "account-token",
            id: "batch-sub2api-account:token:52",
            tokenId: 52,
            tokenName: "Second key",
          },
          groupRatios: { default: 1 },
          effectiveGroup: "default",
        },
      ] as any).map((item) => item.key),
    ).toEqual([
      "account:batch-sub2api-account:token:51:shared-model",
      "account:batch-sub2api-account:token:52:shared-model",
    ])
  })
```

Run:

```bash
pnpm vitest --run tests/features/ModelList/batchVerification.test.ts -t "keeps same-account token rows separate"
```

Expected: PASS once `getModelItemKey()` uses `sourceIdentity.id`.

- [ ] **Step 3: Fix type or behavior failures from the focused run**

If failures occur, keep fixes within the task files above. The likely acceptable fixes are:

```ts
// useFilteredModels.ts dependency arrays must include new source-level maps.
includedAllAccountsGroupsBySourceId
availableGroupsBySourceId

// useModelData.ts query data is now AccountPricingQueryResult in all-accounts mode.
query.data?.contexts
query.data?.partialFailureCount
```

Run the failed command again after each fix.

- [ ] **Step 4: Inspect final diff for scope**

Run:

```bash
git diff -- src/features/ModelList/modelManagementSources.ts src/features/ModelList/hooks/useModelData.ts src/features/ModelList/hooks/useFilteredModels.ts src/features/ModelList/sourceLabels.ts src/features/ModelList/components/ModelItem/index.tsx src/features/ModelList/components/ModelDisplay.tsx src/features/ModelList/batchVerification.ts tests/entrypoints/options/pages/ModelList/useModelData.test.tsx tests/entrypoints/options/pages/ModelList/useFilteredModels.test.ts tests/entrypoints/options/pages/ModelList/sourceLabels.test.ts tests/features/ModelList/batchVerification.test.ts
git status --porcelain
```

Expected: diff contains only the all-key comparison implementation and focused tests.

- [ ] **Step 5: Run staged validation**

Stage only task-scoped files:

```bash
git add src/features/ModelList/modelManagementSources.ts src/features/ModelList/hooks/useModelData.ts src/features/ModelList/hooks/useFilteredModels.ts src/features/ModelList/sourceLabels.ts src/features/ModelList/components/ModelItem/index.tsx src/features/ModelList/components/ModelDisplay.tsx src/features/ModelList/batchVerification.ts tests/entrypoints/options/pages/ModelList/useModelData.test.tsx tests/entrypoints/options/pages/ModelList/useFilteredModels.test.ts tests/entrypoints/options/pages/ModelList/sourceLabels.test.ts tests/features/ModelList/batchVerification.test.ts
pnpm run validate:staged
```

Expected: lint-staged, ESLint, Prettier, and staged i18n check pass.

- [ ] **Step 6: Commit final validation fixes**

If Task 4 changed files after Task 3, commit them:

```bash
git commit -m "test(model-list): cover sub2api token comparison"
```

If Task 4 only verified existing commits and staged validation did not change files, do not create an empty commit.

- [ ] **Step 7: Handoff notes**

Final handoff must include:

```text
Telemetry: reused existing Model List load-completion event; no new analytics schema fields were added because token counts would require broader diagnostics typing.
E2E: not added; the risk is hook-level data identity, token loading orchestration, and row sorting, covered by Vitest.
Validation: list exact commands and pass/fail results.
Commit(s): list commit hashes.
```

---

## Self-Review Checklist

- Spec coverage:
  - all active Sub2API tokens load in all-accounts mode: Task 3
  - each token is a distinct comparison source: Task 1 and Task 2
  - one token failure does not block successful token rows: Task 3
  - all-token failure reports account failure: Task 3
  - row labels include token names without secrets: Task 2
  - account filters and summaries remain account-keyed: Task 2
  - group candidates and row keys use source identity: Task 1 and Task 2
- Red-flag scan: no unresolved markers or vague test instructions.
- Type consistency:
  - `ModelListSourceIdentity` is defined once in `modelManagementSources.ts`.
  - `AccountPricingContext.sourceIdentity` uses `ModelListSourceIdentity`.
  - `RawModelItem` and `CalculatedModelItem` carry the same optional `sourceIdentity`.
  - `getModelItemKey()` accepts `sourceIdentity` through `CalculatedModelItem`.

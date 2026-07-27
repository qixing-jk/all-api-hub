# Api Service Capabilities Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Spec:** `docs/superpowers/specs/2026-06-10-api-service-capabilities-design.md`

**Goal:** Add a small capability declaration Module at the `apiService` Seam so callers can avoid unsupported Sub2API and AIHubMix flows before invoking missing Adapter functions.

**Architecture:** Keep the existing strict missing-method throw as the final guard. Add capabilities beside the site Adapter registration in `src/services/apiService/index.ts`, expose them through `getApiService(site).capabilities`, then update the two known risky callers to check the capability Interface before invoking `fetchModelPricing` or `redeemCode`.

**Tech Stack:** TypeScript, React Query, Vitest, Testing Library where existing hook tests require it.

---

## File Structure

- Modify `src/services/apiService/index.ts`
  - Owns the `apiService` Seam.
  - Add `ApiServiceCapabilities`.
  - Add default capabilities and per-site overrides in the existing registration area.
  - Return `capabilities` on both `getApiService(site)` and the default exported wrapper object.
  - Preserve `strictOverrideSites` behavior.

- Modify `tests/services/apiService/index.test.ts`
  - Verify default and site-specific capabilities.
  - Verify strict missing-method throw still happens for Sub2API / AIHubMix.

- Modify `src/features/ModelList/hooks/useModelData.ts`
  - Check `getApiService(account.siteType).capabilities.modelPricing` before calling `fetchModelPricing`.
  - For unsupported accounts, throw a local unsupported error so the existing query error state handles the skipped source.

- Modify `tests/entrypoints/options/pages/ModelList/useModelData.test.tsx`
  - Add or update a focused test proving Sub2API does not call `fetchModelPricing` when model pricing is unsupported.
  - If existing mock setup is easier in `useModelData` tests, use the closest existing test file that already exercises the direct and all-accounts model-data hook paths.

- Modify `src/services/redemption/redeemService.ts`
  - Check `getApiService(account.site_type).capabilities.redeemCode` before calling `redeemCode`.
  - Return a localized unsupported failure result instead of relying on `apiService.redeemCode is not implemented...`.

- Modify `tests/services/redeemService.test.ts`
  - Add tests for unsupported Sub2API and AIHubMix redemption.
  - If this file does not exist, create it and mock `accountStorage` plus `getApiService`.

- Modify locale files only if an existing suitable message key does not exist.
  - Prefer reusing `redemptionAssist:messages.redeemFailed` if there is no current unsupported-copy key and this plan is intended to stay narrow.
  - If adding a key, update the Chinese source and sibling locale files consistently, then run i18n extraction validation.

## Design Details

Add this Interface in `src/services/apiService/index.ts`:

```ts
export type ApiServiceCapabilities = {
  keyManagement: boolean
  modelPricing: boolean
  redeemCode: boolean
  siteAnnouncements: boolean
}
```

Start with this default:

```ts
const defaultApiServiceCapabilities: ApiServiceCapabilities = {
  keyManagement: true,
  modelPricing: true,
  redeemCode: true,
  siteAnnouncements: true,
}
```

Use an override helper:

```ts
type ApiServiceCapabilityOverrides = Partial<ApiServiceCapabilities>

const withCapabilities = (
  overrides: ApiServiceCapabilityOverrides = {},
): ApiServiceCapabilities => ({
  ...defaultApiServiceCapabilities,
  ...overrides,
})
```

Site-specific first slice:

```ts
const siteCapabilityOverrides: Partial<
  Record<ApiOverrideSite, ApiServiceCapabilityOverrides>
> = {
  [SITE_TYPES.SUB2API]: {
    modelPricing: false,
    redeemCode: false,
  },
  [SITE_TYPES.AIHUBMIX]: {
    redeemCode: false,
  },
}
```

Do not move Sub2API announcement functions in this plan. `siteAnnouncements` is included so the Interface has the needed shape for the next cleanup, but this slice should not refactor announcement providers.

## Task 1: Expose ApiService Capabilities

**Files:**
- Modify: `src/services/apiService/index.ts`
- Test: `tests/services/apiService/index.test.ts`

- [ ] **Step 1: Write failing capability tests**

Add these tests near the existing strict override tests in `tests/services/apiService/index.test.ts`:

```ts
it("should expose default capabilities for common-compatible sites", () => {
  expect(getApiService(undefined).capabilities).toEqual({
    keyManagement: true,
    modelPricing: true,
    redeemCode: true,
    siteAnnouncements: true,
  })

  expect(getApiService(SITE_TYPES.ONE_HUB).capabilities).toEqual({
    keyManagement: true,
    modelPricing: true,
    redeemCode: true,
    siteAnnouncements: true,
  })
})

it("should expose Sub2API capability overrides", () => {
  expect(getApiService(SITE_TYPES.SUB2API).capabilities).toEqual({
    keyManagement: true,
    modelPricing: false,
    redeemCode: false,
    siteAnnouncements: true,
  })
})

it("should expose AIHubMix capability overrides", () => {
  expect(getApiService(SITE_TYPES.AIHUBMIX).capabilities).toEqual({
    keyManagement: true,
    modelPricing: true,
    redeemCode: false,
    siteAnnouncements: true,
  })
})
```

- [ ] **Step 2: Run the failing apiService tests**

Run:

```bash
pnpm vitest run tests/services/apiService/index.test.ts
```

Expected: FAIL because `capabilities` is undefined.

- [ ] **Step 3: Add capabilities to the apiService Seam**

In `src/services/apiService/index.ts`, add the capability type and helpers below `strictOverrideSites`:

```ts
export type ApiServiceCapabilities = {
  keyManagement: boolean
  modelPricing: boolean
  redeemCode: boolean
  siteAnnouncements: boolean
}

type ApiServiceCapabilityOverrides = Partial<ApiServiceCapabilities>

const defaultApiServiceCapabilities: ApiServiceCapabilities = {
  keyManagement: true,
  modelPricing: true,
  redeemCode: true,
  siteAnnouncements: true,
}

const siteCapabilityOverrides: Partial<
  Record<ApiOverrideSite, ApiServiceCapabilityOverrides>
> = {
  [SITE_TYPES.SUB2API]: {
    modelPricing: false,
    redeemCode: false,
  },
  [SITE_TYPES.AIHUBMIX]: {
    redeemCode: false,
  },
}

const getApiServiceCapabilities = (
  site: ApiOverrideSite | null,
): ApiServiceCapabilities => ({
  ...defaultApiServiceCapabilities,
  ...(site ? siteCapabilityOverrides[site] : undefined),
})
```

Update `apiForSite` so returned scoped objects include capabilities:

```ts
const apiForSite = (site: ApiOverrideSite) => {
  const scopedAPI = {
    capabilities: getApiServiceCapabilities(site),
  } as {
    capabilities: ApiServiceCapabilities
  } & {
    [K in keyof typeof commonAPI]: (typeof commonAPI)[K]
  }

  for (const key in commonAPI) {
    // eslint-disable-next-line import/namespace
    const func = commonAPI[key as keyof typeof commonAPI]
    if (typeof func === "function") {
      ;(scopedAPI as any)[key] = createSiteScopedFunction(
        key as keyof typeof commonAPI,
        site,
      )
    } else {
      ;(scopedAPI as any)[key] = func
    }
  }

  return scopedAPI
}
```

Update `exportedAPI` so the default wrapper includes capabilities:

```ts
const exportedAPI = {
  capabilities: getApiServiceCapabilities(null),
} as {
  capabilities: ApiServiceCapabilities
} & {
  [K in keyof typeof commonAPI]: WithSiteHint<(typeof commonAPI)[K]>
}
```

- [ ] **Step 4: Run apiService tests**

Run:

```bash
pnpm vitest run tests/services/apiService/index.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit Task 1**

Run:

```bash
git status --porcelain
git add src/services/apiService/index.ts tests/services/apiService/index.test.ts
git commit -m "refactor(api-service): expose site capabilities"
```

Only stage the two task-scoped files. If unrelated staged files already exist, do not commit; report the unsafe index state.

## Task 2: Guard Unsupported Model Pricing

**Files:**
- Modify: `src/features/ModelList/hooks/useModelData.ts`
- Test: `tests/entrypoints/options/pages/ModelList/useModelData.test.tsx`

- [ ] **Step 1: Inspect existing model-list hook tests**

Run:

```bash
rg -n "fetchModelPricing|Sub2API|modelPricing|all accounts|all-accounts" tests/entrypoints/options/pages/ModelList src/features/ModelList/hooks/useModelData.ts
```

Use the existing test file that already mocks `getApiService` and renders the model-list data hook. Prefer the smallest existing file over creating a new test harness.

- [ ] **Step 2: Write the failing unsupported-pricing test**

Add a test that configures a Sub2API account and a mocked service with `capabilities.modelPricing=false`. The exact harness may differ, but the assertion must prove `fetchModelPricing` is not called.

Use this behavior shape:

```ts
const fetchModelPricing = vi.fn()

mockGetApiService.mockReturnValue({
  capabilities: {
    keyManagement: true,
    modelPricing: false,
    redeemCode: false,
    siteAnnouncements: true,
  },
  fetchModelPricing,
})

// Render or invoke the model-data hook with one Sub2API account.
// Wait for the query to settle into the existing error/empty state.

expect(fetchModelPricing).not.toHaveBeenCalled()
```

If the existing test helper expects per-site responses, configure only the Sub2API service as unsupported and keep common-compatible accounts unchanged.

- [ ] **Step 3: Run the failing model-list test**

Run the focused test file:

```bash
pnpm vitest run tests/entrypoints/options/pages/ModelList/useModelData.test.tsx
```

Expected: FAIL because current code calls `fetchModelPricing` before any capability check.

- [ ] **Step 4: Add a local unsupported-pricing error helper**

In `src/features/ModelList/hooks/useModelData.ts`, add a small helper near other error helpers:

```ts
const createUnsupportedModelPricingError = () =>
  new Error("model_pricing_unsupported")
```

In the direct account query function, replace:

```ts
const data = await getApiService(
  currentAccount.siteType,
).fetchModelPricing({
  baseUrl: currentAccount.baseUrl,
  accountId: currentAccount.id,
  auth: {
    authType: currentAccount.authType,
    userId: currentAccount.userId,
    accessToken: currentAccount.token,
    cookie: currentAccount.cookieAuthSessionCookie,
  },
})
```

with:

```ts
const service = getApiService(currentAccount.siteType)
if (!service.capabilities.modelPricing) {
  throw createUnsupportedModelPricingError()
}

const data = await service.fetchModelPricing({
  baseUrl: currentAccount.baseUrl,
  accountId: currentAccount.id,
  auth: {
    authType: currentAccount.authType,
    userId: currentAccount.userId,
    accessToken: currentAccount.token,
    cookie: currentAccount.cookieAuthSessionCookie,
  },
})
```

In the all-accounts query function, replace:

```ts
const data = await getApiService(account.siteType).fetchModelPricing({
  baseUrl: account.baseUrl,
  accountId: account.id,
  auth: {
    authType: account.authType,
    userId: account.userId,
    accessToken: account.token,
    cookie: account.cookieAuthSessionCookie,
  },
})
```

with:

```ts
const service = getApiService(account.siteType)
if (!service.capabilities.modelPricing) {
  throw createUnsupportedModelPricingError()
}

const data = await service.fetchModelPricing({
  baseUrl: account.baseUrl,
  accountId: account.id,
  auth: {
    authType: account.authType,
    userId: account.userId,
    accessToken: account.token,
    cookie: account.cookieAuthSessionCookie,
  },
})
```

- [ ] **Step 5: Run the focused model-list test**

Run:

```bash
pnpm vitest run tests/entrypoints/options/pages/ModelList/useModelData.test.tsx
```

Expected: PASS.

- [ ] **Step 6: Commit Task 2**

Run:

```bash
git status --porcelain
git add src/features/ModelList/hooks/useModelData.ts tests/entrypoints/options/pages/ModelList/useModelData.test.tsx
git commit -m "fix(model-list): skip unsupported model pricing"
```

Only stage the two task-scoped files. If the final test file differs because the existing harness lives elsewhere, stage that actual test file instead.

## Task 3: Guard Unsupported Redemption

**Files:**
- Modify: `src/services/redemption/redeemService.ts`
- Test: `tests/services/redeemService.test.ts`

- [ ] **Step 1: Check whether redemption tests already exist**

Run:

```bash
rg -n "redeemCodeForAccount|redeemService|redeemCode" tests/services tests/features src/services/redemption
```

If `tests/services/redeemService.test.ts` already exists, add the new tests there. If it does not exist, create it.

- [ ] **Step 2: Write failing unsupported redemption tests**

Use this new test file if no existing file is present:

```ts
import { beforeEach, describe, expect, it, vi } from "vitest"

import { SITE_TYPES } from "~/constants/siteType"
import { AuthTypeEnum } from "~/types"

const { getAccountById, getApiService, redeemCode } = vi.hoisted(() => ({
  getAccountById: vi.fn(),
  getApiService: vi.fn(),
  redeemCode: vi.fn(),
}))

vi.mock("~/services/accounts/accountStorage", () => ({
  accountStorage: {
    getAccountById,
    getDisplayDataById: vi.fn(),
    convertToDisplayData: vi.fn(),
  },
}))

vi.mock("~/services/apiService", () => ({
  getApiService,
}))

vi.mock("~/utils/i18n/core", () => ({
  t: (key: string, options?: Record<string, unknown>) =>
    options ? `${key}:${JSON.stringify(options)}` : key,
}))

describe("redeemService", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    getApiService.mockReturnValue({
      capabilities: {
        keyManagement: true,
        modelPricing: true,
        redeemCode: false,
        siteAnnouncements: true,
      },
      redeemCode,
    })
  })

  it("does not call redeemCode for Sub2API accounts", async () => {
    const { redeemService } = await import("~/services/redemption/redeemService")
    getAccountById.mockResolvedValue({
      id: "account-1",
      site_type: SITE_TYPES.SUB2API,
      site_url: "https://sub2.example.com",
      disabled: false,
      authType: AuthTypeEnum.AccessToken,
      account_info: {
        id: "user-1",
        access_token: "jwt-token",
      },
    })

    const result = await redeemService.redeemCodeForAccount("account-1", "CODE")

    expect(result.success).toBe(false)
    expect(redeemCode).not.toHaveBeenCalled()
  })

  it("does not call redeemCode for AIHubMix accounts", async () => {
    const { redeemService } = await import("~/services/redemption/redeemService")
    getAccountById.mockResolvedValue({
      id: "account-2",
      site_type: SITE_TYPES.AIHUBMIX,
      site_url: "https://aihubmix.com",
      disabled: false,
      authType: AuthTypeEnum.AccessToken,
      account_info: {
        id: "aihubmix-user",
        access_token: "access-token",
      },
    })

    const result = await redeemService.redeemCodeForAccount("account-2", "CODE")

    expect(result.success).toBe(false)
    expect(redeemCode).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 3: Run the failing redemption test**

Run:

```bash
pnpm vitest run tests/services/redeemService.test.ts
```

Expected: FAIL because `redeemService` still calls `redeemCode` even when capabilities say unsupported.

- [ ] **Step 4: Add the redemption capability guard**

In `src/services/redemption/redeemService.ts`, replace:

```ts
const creditedAmount = await getApiService(account.site_type).redeemCode(
  {
    baseUrl: account.site_url,
    accountId,
    auth: {
      authType: account.authType,
      userId: account.account_info.id,
      accessToken: account.account_info.access_token,
      cookie: account.cookieAuth?.sessionCookie,
    },
  },
  code,
)
```

with:

```ts
const service = getApiService(account.site_type)
if (!service.capabilities.redeemCode) {
  return {
    success: false,
    message: t("redemptionAssist:messages.redeemFailed"),
  }
}

const creditedAmount = await service.redeemCode(
  {
    baseUrl: account.site_url,
    accountId,
    auth: {
      authType: account.authType,
      userId: account.account_info.id,
      accessToken: account.account_info.access_token,
      cookie: account.cookieAuth?.sessionCookie,
    },
  },
  code,
)
```

If product copy review requires a more specific unsupported message, add `redemptionAssist:messages.redeemUnsupported` to the Chinese source and sibling locales, then use that key instead of `redeemFailed`.

- [ ] **Step 5: Run redemption tests**

Run:

```bash
pnpm vitest run tests/services/redeemService.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit Task 3**

Run:

```bash
git status --porcelain
git add src/services/redemption/redeemService.ts tests/services/redeemService.test.ts
git commit -m "fix(redemption): skip unsupported site adapters"
```

Only stage the two task-scoped files. If locale files were added, stage those task-scoped locale files too.

## Task 4: Focused Validation And Cleanup

**Files:**
- Inspect final diff across task-scoped files.
- No new implementation files expected beyond the files listed above.

- [ ] **Step 1: Run focused tests**

Run:

```bash
pnpm vitest run tests/services/apiService/index.test.ts tests/entrypoints/options/pages/ModelList/useModelData.test.tsx tests/services/redeemService.test.ts
```

Expected: PASS.

- [ ] **Step 2: Run related validation for changed source files**

Run:

```bash
pnpm vitest related --run src/services/apiService/index.ts src/features/ModelList/hooks/useModelData.ts src/services/redemption/redeemService.ts
```

Expected: PASS. If `vitest related` is unavailable or fails because no related tests are found, classify it as tooling and keep the focused test results as the main evidence.

- [ ] **Step 3: Run pre-commit-equivalent validation**

Stage only task-scoped files, then run:

```bash
pnpm run validate:staged
```

Expected: PASS.

- [ ] **Step 4: Inspect final diff**

Run:

```bash
git diff --cached --stat
git diff --cached
```

Confirm:

- `strictOverrideSites` still throws for missing Sub2API / AIHubMix functions.
- `capabilities` exists on both default and site-scoped services.
- Model List checks `modelPricing` before calling `fetchModelPricing`.
- Redemption checks `redeemCode` before calling `redeemCode`.
- No Sub2API announcement placeholder cleanup is included in this slice.

- [ ] **Step 5: Final commit if not already committed per task**

If tasks were not committed individually, commit the final staged task-scoped diff:

```bash
git commit -m "refactor(api-service): add capability guards"
```

If tasks were committed individually, skip this step and report the commit hashes.

## Out Of Scope

- Do not remove `fetchSub2ApiAnnouncements` or `markSub2ApiAnnouncementRead` from `common/index.ts` in this slice.
- Do not redesign the full Adapter type hierarchy.
- Do not make TypeScript enforce function presence based on capability values yet.
- Do not change AIHubMix one-time-key behavior.
- Do not change Sub2API refresh-token or announcement sync behavior.

## Self-Review Notes

- Spec coverage: The plan adds the capability Module, exposes it through the `apiService` Seam, and updates the two known risky call sites: Model List pricing and redemption.
- Placeholder scan: No steps rely on unspecified implementation. Where an existing test harness may vary, the required behavior and assertions are explicit.
- Type consistency: The capability property names are consistent across type, defaults, overrides, tests, and callers: `keyManagement`, `modelPricing`, `redeemCode`, `siteAnnouncements`.

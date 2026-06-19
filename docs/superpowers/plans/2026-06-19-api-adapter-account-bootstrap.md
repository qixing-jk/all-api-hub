# API Adapter Account Bootstrap Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a `SiteAdapter.accountBootstrap` capability so API-fallback user discovery, site-name/status probing, account-site route resolution, and account-completion bootstrap facts stop depending on product-level `getApiService(...)` calls.

**Architecture:** Introduce `AccountBootstrapCapability` as a deep Adapter Interface for early account-site facts. Existing backend modules remain delegated implementations; product modules ask `getSiteAdapter(siteType).accountBootstrap`, while route resolver keeps URL joining/cache and account completion keeps workflow semantics.

**Tech Stack:** TypeScript, WXT extension services, existing `apiAdapters`, Vitest, `pnpm run validate:staged`, `pnpm run validate:push`.

**Spec:** `docs/superpowers/specs/2026-06-19-api-adapter-account-bootstrap-design.md`

---

## File Structure

- Create `src/services/apiAdapters/contracts/accountBootstrap.ts`
  - Defines `AccountBootstrapCapability`, `AccountBootstrapRouteKind`, and `AccountBootstrapRouteTarget`.
- Modify `src/services/apiAdapters/contracts/siteAdapter.ts`
  - Adds optional `accountBootstrap`.
- Create `src/services/apiAdapters/accountRoutes.ts`
  - Shared static account-route path resolver used by bootstrap adapters and route-resolver fallback.
- Create `src/services/apiAdapters/newApi/accountBootstrap.ts`
  - Delegates bootstrap facts to the site-bound New API-family `getApiService(siteType)`.
- Create `src/services/apiAdapters/sub2api/accountBootstrap.ts`
  - Delegates bootstrap facts to Sub2API backend helpers.
- Create `src/services/apiAdapters/aihubmix/accountBootstrap.ts`
  - Delegates bootstrap facts to AIHubMix backend helpers.
- Modify `src/services/apiAdapters/newApi/index.ts`
  - Registers `accountBootstrap: createNewApiAccountBootstrap(siteType)`.
- Modify `src/services/apiAdapters/sub2api/index.ts`
  - Registers `accountBootstrap: sub2ApiAccountBootstrap`.
- Modify `src/services/apiAdapters/aihubmix/index.ts`
  - Registers `accountBootstrap: aihubmixAccountBootstrap`.
- Create `tests/services/apiAdapters/accountBootstrap.test.ts`
  - Covers delegation and route-path behavior for New API-family, Sub2API, and AIHubMix.
- Modify `tests/services/apiAdapters/registry.test.ts`
  - Verifies bootstrap capability presence for supported adapters and omission for unsupported adapters.
- Modify `src/services/siteDetection/autoDetectService.ts`
  - Uses `accountBootstrap.fetchUserInfo(...)` for direct API fallback.
- Modify `tests/services/autoDetectService.test.ts`
  - Mocks `getSiteAdapter(...).accountBootstrap.fetchUserInfo(...)`.
- Modify `src/services/accounts/siteName.ts`
  - Uses `accountBootstrap.fetchSiteStatus(...)` for site-name status probing.
- Modify `tests/services/accountOperations.test.ts`
  - Updates `getSiteName(...)` expectations to the adapter path.
- Modify `src/services/accounts/utils/siteRouteResolver.ts`
  - Uses `accountBootstrap.resolveRoutePath(...)` for static route paths and `accountBootstrap.fetchSiteStatus(...)` for cached New API default-theme probing.
- Modify `tests/services/accounts/siteRouteResolver.test.ts`
  - Updates route tests to mock adapter bootstrap status and route path methods.
- Modify `src/services/apiAdapters/newApi/accountCompletion.ts`
  - Uses `createNewApiAccountBootstrap(detected.siteType)` internally.
- Modify `src/services/apiAdapters/sub2api/accountCompletion.ts`
  - Uses `sub2ApiAccountBootstrap` internally.
- Modify `src/services/apiAdapters/aihubmix/accountCompletion.ts`
  - Uses `aihubmixAccountBootstrap` internally.
- Modify account-completion tests:
  - `tests/services/apiAdapters/newApi/accountCompletion.test.ts`
  - `tests/services/apiAdapters/sub2api/accountCompletion.test.ts`
  - `tests/services/apiAdapters/aihubmix/accountCompletion.test.ts`

Do not modify:

- `src/services/apiService/**` backend behavior except import-only fallout if TypeScript requires it.
- `src/constants/siteType.ts` or `src/services/siteDetection/detectSiteType.ts`.
- `src/services/accounts/utils/apiServiceRequest.ts`; it still creates service requests from saved accounts until that slice migrates.
- locale files, telemetry schemas, settings search files, Playwright tests, redemption code, managed-site provider/channel CRUD, or new site-type definitions.

---

### Task 1: Add Account Bootstrap Contract And Adapter Implementations

**Files:**

- Create: `src/services/apiAdapters/contracts/accountBootstrap.ts`
- Modify: `src/services/apiAdapters/contracts/siteAdapter.ts`
- Create: `src/services/apiAdapters/accountRoutes.ts`
- Create: `src/services/apiAdapters/newApi/accountBootstrap.ts`
- Create: `src/services/apiAdapters/sub2api/accountBootstrap.ts`
- Create: `src/services/apiAdapters/aihubmix/accountBootstrap.ts`
- Modify: `src/services/apiAdapters/newApi/index.ts`
- Modify: `src/services/apiAdapters/sub2api/index.ts`
- Modify: `src/services/apiAdapters/aihubmix/index.ts`
- Create: `tests/services/apiAdapters/accountBootstrap.test.ts`
- Modify: `tests/services/apiAdapters/registry.test.ts`

- [ ] **Step 1: Add failing adapter tests for the new capability**

Create `tests/services/apiAdapters/accountBootstrap.test.ts` with hoisted mocks for the existing backend delegates:

```ts
const {
  mockAihubmixExtractDefaultExchangeRate,
  mockAihubmixFetchSiteStatus,
  mockAihubmixFetchSupportCheckIn,
  mockAihubmixFetchUserInfo,
  mockAihubmixGetOrCreateAccessToken,
  mockExtractDefaultExchangeRate,
  mockFetchSiteStatus,
  mockFetchSupportCheckIn,
  mockFetchUserInfo,
  mockGetApiService,
  mockGetOrCreateAccessToken,
  mockSub2ApiExtractDefaultExchangeRate,
  mockSub2ApiFetchSiteStatus,
  mockSub2ApiFetchSupportCheckIn,
  mockSub2ApiFetchUserInfo,
  mockSub2ApiGetOrCreateAccessToken,
} = vi.hoisted(() => ({
  mockAihubmixExtractDefaultExchangeRate: vi.fn(),
  mockAihubmixFetchSiteStatus: vi.fn(),
  mockAihubmixFetchSupportCheckIn: vi.fn(),
  mockAihubmixFetchUserInfo: vi.fn(),
  mockAihubmixGetOrCreateAccessToken: vi.fn(),
  mockExtractDefaultExchangeRate: vi.fn(),
  mockFetchSiteStatus: vi.fn(),
  mockFetchSupportCheckIn: vi.fn(),
  mockFetchUserInfo: vi.fn(),
  mockGetApiService: vi.fn(),
  mockGetOrCreateAccessToken: vi.fn(),
  mockSub2ApiExtractDefaultExchangeRate: vi.fn(),
  mockSub2ApiFetchSiteStatus: vi.fn(),
  mockSub2ApiFetchSupportCheckIn: vi.fn(),
  mockSub2ApiFetchUserInfo: vi.fn(),
  mockSub2ApiGetOrCreateAccessToken: vi.fn(),
}))

vi.mock("~/services/apiService", () => ({
  getApiService: mockGetApiService,
}))

vi.mock("~/services/apiService/sub2api", () => ({
  extractDefaultExchangeRate: mockSub2ApiExtractDefaultExchangeRate,
  fetchSiteStatus: mockSub2ApiFetchSiteStatus,
  fetchSupportCheckIn: mockSub2ApiFetchSupportCheckIn,
  fetchUserInfo: mockSub2ApiFetchUserInfo,
  getOrCreateAccessToken: mockSub2ApiGetOrCreateAccessToken,
}))

vi.mock("~/services/apiService/aihubmix", () => ({
  extractDefaultExchangeRate: mockAihubmixExtractDefaultExchangeRate,
  fetchSiteStatus: mockAihubmixFetchSiteStatus,
  fetchSupportCheckIn: mockAihubmixFetchSupportCheckIn,
  fetchUserInfo: mockAihubmixFetchUserInfo,
  getOrCreateAccessToken: mockAihubmixGetOrCreateAccessToken,
}))
```

Use request and response fixtures with example domains only:

```ts
const request = {
  baseUrl: "https://example.invalid",
  auth: { authType: AuthTypeEnum.Cookie },
}

const userInfo = { id: 1, username: "tester" }
const tokenInfo = { username: "tester", access_token: "token" }
const siteStatus = { system_name: "Example Portal", checkin_enabled: true }
```

Add a New API-family delegation test:

```ts
const accountBootstrap = createNewApiAccountBootstrap(SITE_TYPES.VELOERA)

mockFetchUserInfo.mockResolvedValueOnce(userInfo)
mockGetOrCreateAccessToken.mockResolvedValueOnce(tokenInfo)
mockFetchSiteStatus.mockResolvedValueOnce(siteStatus)
mockFetchSupportCheckIn.mockResolvedValueOnce(true)
mockExtractDefaultExchangeRate.mockReturnValueOnce(7.25)

await expect(accountBootstrap.fetchUserInfo(request)).resolves.toBe(userInfo)
await expect(accountBootstrap.getOrCreateAccessToken(request)).resolves.toBe(
  tokenInfo,
)
await expect(accountBootstrap.fetchSiteStatus(request)).resolves.toBe(
  siteStatus,
)
await expect(accountBootstrap.fetchCheckInSupport(request)).resolves.toBe(true)
expect(accountBootstrap.extractDefaultExchangeRate(siteStatus)).toBe(7.25)
expect(mockGetApiService).toHaveBeenCalledWith(SITE_TYPES.VELOERA)
```

Add static route path assertions that do not require a network/status probe:

```ts
await expect(
  accountBootstrap.resolveRoutePath(
    { baseUrl: "https://example.invalid", siteType: SITE_TYPES.VELOERA },
    "checkIn",
  ),
).resolves.toBe("/app/me")
```

Add Sub2API and AIHubMix tests with the same delegation shape, asserting module-level helper calls rather than `getApiService(...)`. For route paths, assert:

```ts
await expect(
  sub2ApiAccountBootstrap.resolveRoutePath(
    { baseUrl: "https://sub2.example.invalid", siteType: SITE_TYPES.SUB2API },
    "login",
  ),
).resolves.toBe("/login")

await expect(
  aihubmixAccountBootstrap.resolveRoutePath(
    { baseUrl: "https://aihubmix.example.invalid", siteType: SITE_TYPES.AIHUBMIX },
    "login",
  ),
).resolves.toBe("/sign-in")
```

- [ ] **Step 2: Update registry tests for bootstrap support**

In `tests/services/apiAdapters/registry.test.ts`, add `accountBootstrap` to supported adapter expectations:

```ts
expect(adapter.accountBootstrap).toEqual({
  fetchUserInfo: expect.any(Function),
  getOrCreateAccessToken: expect.any(Function),
  fetchSiteStatus: expect.any(Function),
  fetchCheckInSupport: expect.any(Function),
  extractDefaultExchangeRate: expect.any(Function),
  resolveRoutePath: expect.any(Function),
})
```

Apply this to:

- the New API-family loop
- the Sub2API adapter test
- the AIHubMix adapter test

Keep the unsupported adapter expectation strict:

```ts
expect(adapter.accountBootstrap).toBeUndefined()
```

- [ ] **Step 3: Run the adapter tests and verify the expected failure**

Run:

```powershell
pnpm vitest run tests/services/apiAdapters/accountBootstrap.test.ts tests/services/apiAdapters/registry.test.ts
```

Expected: FAIL because the contract and adapter implementations do not exist yet.

- [ ] **Step 4: Add the account bootstrap contract**

Create `src/services/apiAdapters/contracts/accountBootstrap.ts`:

```ts
import type { AccountSiteType } from "~/constants/siteType"
import type {
  AccessTokenInfo,
  ApiServiceRequest,
  SiteStatusInfo,
  UserInfo,
} from "~/services/apiService/common/type"

export type AccountBootstrapRouteKind =
  | "login"
  | "usage"
  | "checkIn"
  | "adminCredentials"
  | "redeem"
  | "siteAnnouncements"

export type AccountBootstrapRouteTarget = {
  baseUrl: string
  siteType: AccountSiteType
}

export type AccountBootstrapCapability = {
  fetchUserInfo(request: ApiServiceRequest): Promise<UserInfo>
  getOrCreateAccessToken(request: ApiServiceRequest): Promise<AccessTokenInfo>
  fetchSiteStatus(request: ApiServiceRequest): Promise<SiteStatusInfo | null>
  fetchCheckInSupport(
    request: ApiServiceRequest,
  ): Promise<boolean | undefined>
  extractDefaultExchangeRate(siteStatus: SiteStatusInfo | null): number | null
  resolveRoutePath(
    target: AccountBootstrapRouteTarget,
    route: AccountBootstrapRouteKind,
  ): Promise<string>
}
```

Modify `src/services/apiAdapters/contracts/siteAdapter.ts`:

```ts
import type { AccountBootstrapCapability } from "./accountBootstrap"

export type SiteAdapter = {
  // existing fields
  accountBootstrap?: AccountBootstrapCapability
}
```

- [ ] **Step 5: Add shared static route-path resolution**

Create `src/services/apiAdapters/accountRoutes.ts`:

```ts
import { getAccountSiteApiRouter } from "~/constants/siteType"

import type {
  AccountBootstrapRouteKind,
  AccountBootstrapRouteTarget,
} from "./contracts/accountBootstrap"

export function resolveStaticAccountRoutePath(
  target: AccountBootstrapRouteTarget,
  route: AccountBootstrapRouteKind,
): string {
  const router = getAccountSiteApiRouter(target.siteType)

  switch (route) {
    case "login":
      return router.routes.login
    case "usage":
      return router.routes.usage ?? router.routes.login
    case "checkIn":
      return router.routes.checkIn ?? router.routes.login
    case "adminCredentials":
      return router.routes.adminCredentials ?? router.routes.login
    case "redeem":
      return router.routes.redeem ?? router.routes.login
    case "siteAnnouncements":
      return router.routes.siteAnnouncements ?? router.routes.login
  }
}
```

Use existing route field names from `getAccountSiteApiRouter(...)`; if TypeScript exposes slightly different optional property names, adapt the switch to the existing router type rather than changing the router contract.

- [ ] **Step 6: Implement New API-family bootstrap**

Create `src/services/apiAdapters/newApi/accountBootstrap.ts`:

```ts
import type { AccountSiteType } from "~/constants/siteType"
import { resolveStaticAccountRoutePath } from "~/services/apiAdapters/accountRoutes"
import type { AccountBootstrapCapability } from "~/services/apiAdapters/contracts/accountBootstrap"
import { getApiService } from "~/services/apiService"

export function createNewApiAccountBootstrap(
  siteType: AccountSiteType,
): AccountBootstrapCapability {
  const apiService = getApiService(siteType)

  return {
    fetchUserInfo: (request) => apiService.fetchUserInfo(request),
    getOrCreateAccessToken: (request) =>
      apiService.getOrCreateAccessToken(request),
    fetchSiteStatus: (request) => apiService.fetchSiteStatus(request),
    fetchCheckInSupport: (request) =>
      apiService.fetchSupportCheckIn(request),
    extractDefaultExchangeRate: (siteStatus) =>
      apiService.extractDefaultExchangeRate(siteStatus),
    resolveRoutePath: (target, route) =>
      Promise.resolve(resolveStaticAccountRoutePath(target, route)),
  }
}
```

- [ ] **Step 7: Implement Sub2API bootstrap**

Create `src/services/apiAdapters/sub2api/accountBootstrap.ts`:

```ts
import { SITE_TYPES } from "~/constants/siteType"
import { resolveStaticAccountRoutePath } from "~/services/apiAdapters/accountRoutes"
import type { AccountBootstrapCapability } from "~/services/apiAdapters/contracts/accountBootstrap"
import {
  extractDefaultExchangeRate,
  fetchSiteStatus,
  fetchSupportCheckIn,
  fetchUserInfo,
  getOrCreateAccessToken,
} from "~/services/apiService/sub2api"

export const sub2ApiAccountBootstrap: AccountBootstrapCapability = {
  fetchUserInfo: (request) => fetchUserInfo(request),
  getOrCreateAccessToken: (request) => getOrCreateAccessToken(request),
  fetchSiteStatus: (request) => fetchSiteStatus(request),
  fetchCheckInSupport: (request) => fetchSupportCheckIn(request),
  extractDefaultExchangeRate: (siteStatus) =>
    extractDefaultExchangeRate(siteStatus),
  resolveRoutePath: (target, route) =>
    Promise.resolve(
      resolveStaticAccountRoutePath(
        { ...target, siteType: SITE_TYPES.SUB2API },
        route,
      ),
    ),
}
```

- [ ] **Step 8: Implement AIHubMix bootstrap**

Create `src/services/apiAdapters/aihubmix/accountBootstrap.ts`:

```ts
import { SITE_TYPES } from "~/constants/siteType"
import { resolveStaticAccountRoutePath } from "~/services/apiAdapters/accountRoutes"
import type { AccountBootstrapCapability } from "~/services/apiAdapters/contracts/accountBootstrap"
import {
  extractDefaultExchangeRate,
  fetchSiteStatus,
  fetchSupportCheckIn,
  fetchUserInfo,
  getOrCreateAccessToken,
} from "~/services/apiService/aihubmix"

export const aihubmixAccountBootstrap: AccountBootstrapCapability = {
  fetchUserInfo: (request) => fetchUserInfo(request),
  getOrCreateAccessToken: (request) => getOrCreateAccessToken(request),
  fetchSiteStatus: (request) => fetchSiteStatus(request),
  fetchCheckInSupport: (request) => fetchSupportCheckIn(request),
  extractDefaultExchangeRate: (siteStatus) =>
    extractDefaultExchangeRate(siteStatus),
  resolveRoutePath: (target, route) =>
    Promise.resolve(
      resolveStaticAccountRoutePath(
        { ...target, siteType: SITE_TYPES.AIHUBMIX },
        route,
      ),
    ),
}
```

Do not move AIHubMix web-origin login URL joining into this adapter. `resolveRoutePath(...)` returns `"/sign-in"`; `siteRouteResolver` remains responsible for choosing `AIHUBMIX_WEB_ORIGIN` for login URLs.

- [ ] **Step 9: Register the capability on adapters**

Modify `src/services/apiAdapters/newApi/index.ts`:

```ts
import { createNewApiAccountBootstrap } from "./accountBootstrap"

export const createNewApiAdapter = (
  siteType = SITE_TYPES.NEW_API,
): SiteAdapter => ({
  siteType,
  family: "newApiFamily",
  accountBootstrap: createNewApiAccountBootstrap(siteType),
  // existing capabilities
})
```

Modify `src/services/apiAdapters/sub2api/index.ts`:

```ts
import { sub2ApiAccountBootstrap } from "./accountBootstrap"

export const sub2ApiAdapter: SiteAdapter = {
  siteType: SITE_TYPES.SUB2API,
  family: "sub2api",
  accountBootstrap: sub2ApiAccountBootstrap,
  // existing capabilities
}
```

Modify `src/services/apiAdapters/aihubmix/index.ts`:

```ts
import { aihubmixAccountBootstrap } from "./accountBootstrap"

export const aihubmixAdapter: SiteAdapter = {
  siteType: SITE_TYPES.AIHUBMIX,
  accountBootstrap: aihubmixAccountBootstrap,
  // existing capabilities
}
```

- [ ] **Step 10: Run adapter tests**

Run:

```powershell
pnpm vitest run tests/services/apiAdapters/accountBootstrap.test.ts tests/services/apiAdapters/registry.test.ts
```

Expected: PASS.

- [ ] **Step 11: Commit Task 1**

Inspect the diff for only the files in this task, then commit:

```powershell
git status --porcelain=v1
git diff -- src/services/apiAdapters tests/services/apiAdapters
git add src/services/apiAdapters/contracts/accountBootstrap.ts src/services/apiAdapters/contracts/siteAdapter.ts src/services/apiAdapters/accountRoutes.ts src/services/apiAdapters/newApi/accountBootstrap.ts src/services/apiAdapters/sub2api/accountBootstrap.ts src/services/apiAdapters/aihubmix/accountBootstrap.ts src/services/apiAdapters/newApi/index.ts src/services/apiAdapters/sub2api/index.ts src/services/apiAdapters/aihubmix/index.ts tests/services/apiAdapters/accountBootstrap.test.ts tests/services/apiAdapters/registry.test.ts
git commit -m "refactor(api-adapters): add account bootstrap capability"
```

---

### Task 2: Route API-Fallback User Discovery Through Account Bootstrap

**Files:**

- Modify: `src/services/siteDetection/autoDetectService.ts`
- Modify: `tests/services/autoDetectService.test.ts`

- [ ] **Step 1: Change auto-detect tests to mock the adapter path**

In `tests/services/autoDetectService.test.ts`, replace the `~/services/apiService` mock with:

```ts
const {
  mockFetchUserInfo,
  mockGetSiteAdapter,
  // existing mocks
} = vi.hoisted(() => ({
  mockFetchUserInfo: vi.fn(),
  mockGetSiteAdapter: vi.fn(),
  // existing mocks
}))

vi.mock("~/services/apiAdapters/registry", () => ({
  getSiteAdapter: mockGetSiteAdapter,
}))
```

In `beforeEach`, return the bootstrap capability:

```ts
mockGetSiteAdapter.mockReturnValue({
  accountBootstrap: {
    fetchUserInfo: mockFetchUserInfo,
  },
})
```

Update existing assertions so API fallback still verifies unchanged request shape:

```ts
expect(mockGetSiteAdapter).toHaveBeenCalledWith(SITE_TYPES.NEW_API)
expect(mockFetchUserInfo).toHaveBeenCalledWith({
  baseUrl: "https://example.com/console",
  auth: {
    authType: AuthTypeEnum.Cookie,
  },
  fetchContext: currentTabFetchContext,
})
```

Add a missing-capability regression:

```ts
it("falls back when the detected site type has no account bootstrap capability", async () => {
  browserAny.runtime = null
  mockGetSiteAdapter.mockReturnValueOnce({})
  mockGetActiveOrAllTabs.mockResolvedValue([
    {
      id: 1,
      active: true,
      url: "https://example.com/home",
    },
  ])
  browserAny.tabs.sendMessage.mockResolvedValueOnce({
    success: false,
    error: "no local storage user",
  })

  const result = await autoDetectSmart("https://example.com/console")

  expect(result.success).toBe(false)
  expect(mockFetchUserInfo).not.toHaveBeenCalled()
})
```

- [ ] **Step 2: Run the auto-detect test and verify the expected failure**

Run:

```powershell
pnpm vitest run tests/services/autoDetectService.test.ts
```

Expected: FAIL because `autoDetectService` still imports `getApiService(...)`.

- [ ] **Step 3: Implement adapter-backed API fallback**

Modify `src/services/siteDetection/autoDetectService.ts`:

```ts
import { getSiteAdapter } from "~/services/apiAdapters/registry"
```

Remove the `getApiService` import if it becomes unused.

Add a small local helper near `getUserDataViaAPI(...)`:

```ts
function getAccountBootstrapForApiFallback(siteType: AccountSiteType) {
  return getSiteAdapter(siteType).accountBootstrap
}
```

Replace the direct legacy call:

```ts
const accountBootstrap = getAccountBootstrapForApiFallback(siteType)
if (!accountBootstrap) {
  console.warn("Account bootstrap capability is unavailable", {
    siteType,
    hasFetchContext: Boolean(fetchContext),
  })
  return null
}

const userInfo = await accountBootstrap.fetchUserInfo({
  baseUrl: url,
  auth: {
    authType: AuthTypeEnum.Cookie,
  },
  ...(fetchContext ? { fetchContext } : {}),
})
```

Keep the existing `try/catch`, user-id normalization, access-token extraction, fetch-context propagation, reload-hint behavior, background fallback, and auto-detect metadata unchanged.

- [ ] **Step 4: Run auto-detect tests**

Run:

```powershell
pnpm vitest run tests/services/autoDetectService.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit Task 2**

Inspect and commit:

```powershell
git status --porcelain=v1
git diff -- src/services/siteDetection/autoDetectService.ts tests/services/autoDetectService.test.ts
git add src/services/siteDetection/autoDetectService.ts tests/services/autoDetectService.test.ts
git commit -m "refactor(site-detection): use account bootstrap for user discovery"
```

---

### Task 3: Route Site Name And Account Routes Through Account Bootstrap

**Files:**

- Modify: `src/services/accounts/siteName.ts`
- Modify: `tests/services/accountOperations.test.ts`
- Modify: `src/services/accounts/utils/siteRouteResolver.ts`
- Modify: `tests/services/accounts/siteRouteResolver.test.ts`

- [ ] **Step 1: Update `getSiteName(...)` tests to expect adapter status probing**

In `tests/services/accountOperations.test.ts`, keep `mockGetApiService` for unrelated account-operation coverage, but change `beforeEach` so the adapter also exposes bootstrap status:

```ts
mockGetSiteAdapter.mockReturnValue({
  accountData: {
    fetchData: mockFetchAccountData,
  },
  accountBootstrap: {
    fetchSiteStatus: mockFetchSiteStatus,
  },
})
```

Update the site-type-hint assertion:

```ts
const { getSiteAdapter } = await import("~/services/apiAdapters/registry")
expect(vi.mocked(getSiteAdapter)).toHaveBeenCalledWith(SITE_TYPES.SUB2API)
```

Keep the existing request assertion:

```ts
expect(mockFetchSiteStatus).toHaveBeenCalledWith({
  baseUrl: "https://example.com",
  auth: { authType: AuthTypeEnum.None },
})
```

Add a missing-capability fallback:

```ts
it("falls back to the domain when site-type hint has no bootstrap status probe", async () => {
  mockGetSiteAdapter.mockReturnValueOnce({})

  const result = await getSiteName(
    "https://api.example.com/dashboard",
    SITE_TYPES.NEW_API,
  )

  expect(result).toBe("Example")
  expect(mockFetchSiteStatus).not.toHaveBeenCalled()
})
```

- [ ] **Step 2: Update route resolver tests to mock bootstrap status and routes**

In `tests/services/accounts/siteRouteResolver.test.ts`, add adapter registry mocks:

```ts
const {
  mockFetchSiteStatus,
  mockGetSiteAdapter,
  mockResolveRoutePath,
} = vi.hoisted(() => ({
  mockFetchSiteStatus: vi.fn(),
  mockGetSiteAdapter: vi.fn(),
  mockResolveRoutePath: vi.fn(),
}))

vi.mock("~/services/apiAdapters/registry", () => ({
  getSiteAdapter: mockGetSiteAdapter,
}))
```

In `beforeEach`, return default static route behavior:

```ts
mockResolveRoutePath.mockImplementation((_target, route) => {
  const paths = {
    adminCredentials: "/console/personal",
    checkIn: "/console/personal",
    login: "/login",
    redeem: "/console/topup",
    siteAnnouncements: "/console",
    usage: "/console/log",
  }
  return Promise.resolve(paths[route as keyof typeof paths])
})

mockGetSiteAdapter.mockReturnValue({
  accountBootstrap: {
    fetchSiteStatus: mockFetchSiteStatus,
    resolveRoutePath: mockResolveRoutePath,
  },
})
```

Replace `globalThis.fetch` helpers with bootstrap status helpers:

```ts
const mockDefaultNewApiThemeStatus = () =>
  mockFetchSiteStatus.mockResolvedValue({
    theme: "default",
  })
```

Update assertions:

```ts
expect(mockFetchSiteStatus).toHaveBeenCalledWith({
  baseUrl: "https://new-api.example",
  auth: { authType: AuthTypeEnum.None },
})

expect(mockResolveRoutePath).toHaveBeenCalledWith(
  { baseUrl: "https://new-api.example", siteType: SITE_TYPES.NEW_API },
  SITE_ROUTE_KINDS.CheckIn,
)
```

Keep assertions that non-New API sites do not probe status:

```ts
expect(mockFetchSiteStatus).not.toHaveBeenCalled()
```

Update the cache-bound test to assert `mockFetchSiteStatus` call count instead of `fetch` call count.

Add missing-capability fallback:

```ts
it("falls back to static route config when account bootstrap is missing", async () => {
  mockGetSiteAdapter.mockReturnValueOnce({})

  await expect(
    resolveAccountSiteRouteUrl(
      { baseUrl: "https://veloera.example", siteType: SITE_TYPES.VELOERA },
      SITE_ROUTE_KINDS.CheckIn,
    ),
  ).resolves.toBe("https://veloera.example/app/me")
})
```

- [ ] **Step 3: Run site-name and route tests and verify the expected failure**

Run:

```powershell
pnpm vitest run tests/services/accountOperations.test.ts tests/services/accounts/siteRouteResolver.test.ts
```

Expected: FAIL because both production modules still call the legacy facade or `fetch`.

- [ ] **Step 4: Implement adapter-backed site-name status probing**

Modify `src/services/accounts/siteName.ts`:

```ts
import {
  isAccountSiteType,
  type AccountSiteType,
} from "~/constants/siteType"
import { getSiteAdapter } from "~/services/apiAdapters/registry"
```

Remove `getApiService` if unused.

When `siteStatusInfo` is missing and `siteTypeHint` is usable:

```ts
if (!siteStatusInfo && siteTypeHint && isAccountSiteType(siteTypeHint)) {
  try {
    const accountBootstrap = getSiteAdapter(siteTypeHint).accountBootstrap
    resolvedSiteStatus = accountBootstrap
      ? await accountBootstrap.fetchSiteStatus({
          baseUrl,
          auth: { authType: AuthTypeEnum.None },
        })
      : null
  } catch {
    resolvedSiteStatus = null
  }
}
```

If `siteTypeHint` is already typed as `AccountSiteType` in the function signature, keep the guard only if callers can pass plain strings today. Preserve all existing title/default-name/domain fallback logic.

- [ ] **Step 5: Implement adapter-backed route resolution**

Modify `src/services/accounts/utils/siteRouteResolver.ts`:

```ts
import { resolveStaticAccountRoutePath } from "~/services/apiAdapters/accountRoutes"
import type { AccountBootstrapCapability } from "~/services/apiAdapters/contracts/accountBootstrap"
import { getSiteAdapter } from "~/services/apiAdapters/registry"
```

Replace the status probe with a capability-aware helper:

```ts
const fetchNewApiFrontendTheme = async (
  baseUrl: string,
  accountBootstrap?: Pick<AccountBootstrapCapability, "fetchSiteStatus">,
): Promise<string | undefined> => {
  if (!accountBootstrap) {
    return undefined
  }

  const normalizedBaseUrl = normalizeBaseUrlForCache(baseUrl)
  const cached = getCachedTheme(normalizedBaseUrl)
  if (cached) {
    return cached
  }

  try {
    const statusInfo = await accountBootstrap.fetchSiteStatus({
      baseUrl,
      auth: { authType: AuthTypeEnum.None },
    })
    const theme =
      typeof statusInfo?.theme === "string" ? statusInfo.theme : undefined
    setCachedTheme(normalizedBaseUrl, theme)
    return theme
  } catch {
    setCachedTheme(normalizedBaseUrl, undefined)
    return undefined
  }
}
```

Update `resolveAccountSiteRoutePath(...)`:

```ts
export async function resolveAccountSiteRoutePath(
  target: AccountSiteRouteTarget,
  route: SiteRouteKind,
): Promise<string> {
  const accountBootstrap = getSiteAdapter(target.siteType).accountBootstrap
  const staticPath = accountBootstrap
    ? await accountBootstrap.resolveRoutePath(target, route)
    : resolveStaticAccountRoutePath(target, route)

  if (target.siteType !== SITE_TYPES.NEW_API || route === "siteAnnouncements") {
    return staticPath
  }

  const theme = await fetchNewApiFrontendTheme(
    target.baseUrl,
    accountBootstrap,
  )

  if (theme === NEW_API_FRONTEND_THEMES.Default) {
    return NEW_API_DEFAULT_THEME_ROUTE_PATHS[route] ?? staticPath
  }

  return staticPath
}
```

Keep:

- `joinUrl(...)`
- `resolveAccountSiteRouteUrl(...)`
- `resolveAccountSiteLoginUrl(...)`
- AIHubMix login origin override
- `getBestEffortLoginUrl(...)`
- cache clear helper and cache limits

- [ ] **Step 6: Run site-name and route tests**

Run:

```powershell
pnpm vitest run tests/services/accountOperations.test.ts tests/services/accounts/siteRouteResolver.test.ts
```

Expected: PASS.

- [ ] **Step 7: Commit Task 3**

Inspect and commit:

```powershell
git status --porcelain=v1
git diff -- src/services/accounts/siteName.ts src/services/accounts/utils/siteRouteResolver.ts tests/services/accountOperations.test.ts tests/services/accounts/siteRouteResolver.test.ts
git add src/services/accounts/siteName.ts src/services/accounts/utils/siteRouteResolver.ts tests/services/accountOperations.test.ts tests/services/accounts/siteRouteResolver.test.ts
git commit -m "refactor(accounts): route bootstrap status and routes through adapters"
```

---

### Task 4: Deepen Account Completion To Use Sibling Bootstrap

**Files:**

- Modify: `src/services/apiAdapters/newApi/accountCompletion.ts`
- Modify: `src/services/apiAdapters/sub2api/accountCompletion.ts`
- Modify: `src/services/apiAdapters/aihubmix/accountCompletion.ts`
- Modify: `tests/services/apiAdapters/newApi/accountCompletion.test.ts`
- Modify: `tests/services/apiAdapters/sub2api/accountCompletion.test.ts`
- Modify: `tests/services/apiAdapters/aihubmix/accountCompletion.test.ts`

- [ ] **Step 1: Update New API account-completion tests to mock sibling bootstrap**

In `tests/services/apiAdapters/newApi/accountCompletion.test.ts`, replace direct `getApiService(...)` mocking with a module mock for the sibling bootstrap:

```ts
const {
  mockCreateNewApiAccountBootstrap,
  mockExtractDefaultExchangeRate,
  mockFetchCheckInSupport,
  mockFetchSiteStatus,
  mockFetchUserInfo,
  mockGetOrCreateAccessToken,
} = vi.hoisted(() => ({
  mockCreateNewApiAccountBootstrap: vi.fn(),
  mockExtractDefaultExchangeRate: vi.fn(),
  mockFetchCheckInSupport: vi.fn(),
  mockFetchSiteStatus: vi.fn(),
  mockFetchUserInfo: vi.fn(),
  mockGetOrCreateAccessToken: vi.fn(),
}))

vi.mock("~/services/apiAdapters/newApi/accountBootstrap", () => ({
  createNewApiAccountBootstrap: mockCreateNewApiAccountBootstrap,
}))
```

In `beforeEach`:

```ts
mockCreateNewApiAccountBootstrap.mockReturnValue({
  extractDefaultExchangeRate: mockExtractDefaultExchangeRate,
  fetchCheckInSupport: mockFetchCheckInSupport,
  fetchSiteStatus: mockFetchSiteStatus,
  fetchUserInfo: mockFetchUserInfo,
  getOrCreateAccessToken: mockGetOrCreateAccessToken,
  resolveRoutePath: vi.fn(),
})
```

Update assertions:

```ts
expect(mockCreateNewApiAccountBootstrap).toHaveBeenCalledWith(
  SITE_TYPES.NEW_API,
)
```

Keep all existing request-shape assertions for user info, token creation, site status, check-in support, exchange-rate fallback, username validation, and access-token validation.

- [ ] **Step 2: Update Sub2API account-completion tests to mock sibling bootstrap**

In `tests/services/apiAdapters/sub2api/accountCompletion.test.ts`, replace direct `getApiService(...)` mocking with:

```ts
vi.mock("~/services/apiAdapters/sub2api/accountBootstrap", () => ({
  sub2ApiAccountBootstrap: {
    extractDefaultExchangeRate: mockExtractDefaultExchangeRate,
    fetchCheckInSupport: mockFetchSupportCheckIn,
    fetchSiteStatus: mockFetchSiteStatus,
    fetchUserInfo: mockFetchUserInfo,
    getOrCreateAccessToken: mockGetOrCreateAccessToken,
    resolveRoutePath: vi.fn(),
  },
}))
```

Keep assertions that:

- detected access token is required
- site status uses `AuthTypeEnum.AccessToken`
- exchange rate uses bootstrap extraction
- check-in remains disabled
- detected `sub2apiAuth` is preserved
- `getOrCreateAccessToken(...)` is not called by completion

- [ ] **Step 3: Update AIHubMix account-completion tests to mock sibling bootstrap**

In `tests/services/apiAdapters/aihubmix/accountCompletion.test.ts`, replace direct `getApiService(...)` mocking with:

```ts
vi.mock("~/services/apiAdapters/aihubmix/accountBootstrap", () => ({
  aihubmixAccountBootstrap: {
    extractDefaultExchangeRate: mockExtractDefaultExchangeRate,
    fetchCheckInSupport: mockFetchSupportCheckIn,
    fetchSiteStatus: mockFetchSiteStatus,
    fetchUserInfo: mockFetchUserInfo,
    getOrCreateAccessToken: mockGetOrCreateAccessToken,
    resolveRoutePath: vi.fn(),
  },
}))
```

Keep assertions that:

- detected token data skips token fallback
- missing detected token calls `getOrCreateAccessToken(...)`
- site status uses cookie auth
- check-in uses `status.checkin_enabled` when available
- check-in fallback calls `fetchCheckInSupport(...)`
- username and access token validation are unchanged
- exchange rate fallback is unchanged

- [ ] **Step 4: Run account-completion tests and verify the expected failure**

Run:

```powershell
pnpm vitest run tests/services/apiAdapters/newApi/accountCompletion.test.ts tests/services/apiAdapters/sub2api/accountCompletion.test.ts tests/services/apiAdapters/aihubmix/accountCompletion.test.ts
```

Expected: FAIL because account-completion implementations still call `getApiService(...)`.

- [ ] **Step 5: Use New API sibling bootstrap inside account completion**

Modify `src/services/apiAdapters/newApi/accountCompletion.ts`:

```ts
import { createNewApiAccountBootstrap } from "./accountBootstrap"
```

Replace:

```ts
const apiService = getApiService(detected.siteType)
```

with:

```ts
const accountBootstrap = createNewApiAccountBootstrap(detected.siteType)
```

Replace method calls:

- `apiService.fetchUserInfo(...)` -> `accountBootstrap.fetchUserInfo(...)`
- `apiService.getOrCreateAccessToken(...)` -> `accountBootstrap.getOrCreateAccessToken(...)`
- `apiService.fetchSiteStatus(...)` -> `accountBootstrap.fetchSiteStatus(...)`
- `apiService.fetchSupportCheckIn(...)` -> `accountBootstrap.fetchCheckInSupport(...)`
- `apiService.extractDefaultExchangeRate(...)` -> `accountBootstrap.extractDefaultExchangeRate(...)`

Remove the `getApiService` import.

- [ ] **Step 6: Use Sub2API sibling bootstrap inside account completion**

Modify `src/services/apiAdapters/sub2api/accountCompletion.ts`:

```ts
import { sub2ApiAccountBootstrap } from "./accountBootstrap"
```

Replace:

- `service.fetchSiteStatus(...)` -> `sub2ApiAccountBootstrap.fetchSiteStatus(...)`
- `service.extractDefaultExchangeRate(...)` -> `sub2ApiAccountBootstrap.extractDefaultExchangeRate(...)`

Remove `getApiService` and `SITE_TYPES` imports if unused.

- [ ] **Step 7: Use AIHubMix sibling bootstrap inside account completion**

Modify `src/services/apiAdapters/aihubmix/accountCompletion.ts`:

```ts
import { aihubmixAccountBootstrap } from "./accountBootstrap"
```

Replace:

- `service.getOrCreateAccessToken(...)` -> `aihubmixAccountBootstrap.getOrCreateAccessToken(...)`
- `service.fetchSiteStatus(...)` -> `aihubmixAccountBootstrap.fetchSiteStatus(...)`
- `service.fetchSupportCheckIn(...)` -> `aihubmixAccountBootstrap.fetchCheckInSupport(...)`
- `service.extractDefaultExchangeRate(...)` -> `aihubmixAccountBootstrap.extractDefaultExchangeRate(...)`

Remove `getApiService` and `SITE_TYPES` imports if unused.

- [ ] **Step 8: Run account-completion tests**

Run:

```powershell
pnpm vitest run tests/services/apiAdapters/newApi/accountCompletion.test.ts tests/services/apiAdapters/sub2api/accountCompletion.test.ts tests/services/apiAdapters/aihubmix/accountCompletion.test.ts
```

Expected: PASS.

- [ ] **Step 9: Commit Task 4**

Inspect and commit:

```powershell
git status --porcelain=v1
git diff -- src/services/apiAdapters/newApi/accountCompletion.ts src/services/apiAdapters/sub2api/accountCompletion.ts src/services/apiAdapters/aihubmix/accountCompletion.ts tests/services/apiAdapters/newApi/accountCompletion.test.ts tests/services/apiAdapters/sub2api/accountCompletion.test.ts tests/services/apiAdapters/aihubmix/accountCompletion.test.ts
git add src/services/apiAdapters/newApi/accountCompletion.ts src/services/apiAdapters/sub2api/accountCompletion.ts src/services/apiAdapters/aihubmix/accountCompletion.ts tests/services/apiAdapters/newApi/accountCompletion.test.ts tests/services/apiAdapters/sub2api/accountCompletion.test.ts tests/services/apiAdapters/aihubmix/accountCompletion.test.ts
git commit -m "refactor(api-adapters): use bootstrap in account completion"
```

---

### Task 5: Integration Validation And Deletion Audit

**Files:**

- No planned source edits. If validation exposes code issues, fix only the task-scoped files from Tasks 1-4.

- [ ] **Step 1: Run focused adapter and account tests**

Run:

```powershell
pnpm vitest run tests/services/apiAdapters/accountBootstrap.test.ts tests/services/apiAdapters/registry.test.ts
pnpm vitest run tests/services/autoDetectService.test.ts tests/services/accountOperations.test.ts tests/services/accounts/siteRouteResolver.test.ts
pnpm vitest run tests/services/apiAdapters/newApi/accountCompletion.test.ts tests/services/apiAdapters/sub2api/accountCompletion.test.ts tests/services/apiAdapters/aihubmix/accountCompletion.test.ts
```

Expected: PASS.

- [ ] **Step 2: Run related-file validation for the migrated service files**

Run:

```powershell
pnpm vitest related --run src/services/apiAdapters/contracts/accountBootstrap.ts src/services/apiAdapters/accountRoutes.ts src/services/apiAdapters/newApi/accountBootstrap.ts src/services/apiAdapters/sub2api/accountBootstrap.ts src/services/apiAdapters/aihubmix/accountBootstrap.ts src/services/siteDetection/autoDetectService.ts src/services/accounts/siteName.ts src/services/accounts/utils/siteRouteResolver.ts src/services/apiAdapters/newApi/accountCompletion.ts src/services/apiAdapters/sub2api/accountCompletion.ts src/services/apiAdapters/aihubmix/accountCompletion.ts
```

Expected: PASS.

- [ ] **Step 3: Run TypeScript compile**

Run:

```powershell
pnpm compile
```

Expected: PASS.

- [ ] **Step 4: Audit for migrated product-level legacy facade calls**

Run:

```powershell
rg -n "getApiService\\(|fetchUserInfo\\(|getOrCreateAccessToken\\(|fetchSiteStatus\\(|fetchSupportCheckIn\\(|extractDefaultExchangeRate\\(" src/services/siteDetection src/services/accounts src/services/apiAdapters -g "*.ts"
```

Expected remaining calls:

- `src/services/apiAdapters/**/accountBootstrap.ts`
- other already-owned adapter/backend-delegation modules where `getApiService(siteType)` is the intentional compatibility shim
- `src/services/accounts/utils/apiServiceRequest.ts`, which is outside this slice
- `src/services/apiService/**`, if included by a broader search

Unexpected calls to fix before handoff:

- `src/services/siteDetection/autoDetectService.ts` direct `getApiService(...)`
- `src/services/accounts/siteName.ts` direct `getApiService(...)`
- `src/services/accounts/utils/siteRouteResolver.ts` direct `getApiService(...)`
- `src/services/apiAdapters/*/accountCompletion.ts` direct `getApiService(...)`

- [ ] **Step 5: Run commit-gate validation**

Stage only task-scoped files that remain uncommitted, then run:

```powershell
pnpm run validate:staged
```

Expected: PASS.

If no files are staged because Tasks 1-4 were already committed, run:

```powershell
pnpm run validate:staged
```

and record whether it reports no staged files or validates the final staged set. Do not stage unrelated untracked handoff files.

- [ ] **Step 6: Run push-gate validation**

Run:

```powershell
pnpm run validate:push
```

Expected: PASS.

This slice touches shared service contracts, exports, adapter wiring, and TypeScript types, so `validate:push` is the right final gate.

- [ ] **Step 7: Final diff and history audit**

Run:

```powershell
git status --porcelain=v1
git log --oneline -5
```

Confirm:

- only task-scoped files were modified in the new commits
- pre-existing unrelated untracked files remain untracked and unstaged
- no locale, telemetry, settings search, Playwright, or `apiService` backend behavior churn slipped in

---

## Review Checklist

- [ ] `SiteAdapter.accountBootstrap` exists and is optional.
- [ ] New API-family, Sub2API, and AIHubMix adapters expose `accountBootstrap`.
- [ ] Unsupported adapters omit `accountBootstrap`.
- [ ] `autoDetectService` uses `accountBootstrap.fetchUserInfo(...)` for API fallback and keeps request/fetch-context behavior unchanged.
- [ ] `getSiteName(...)` uses `accountBootstrap.fetchSiteStatus(...)` when a site-type hint exists and preserves all title/domain fallbacks.
- [ ] `siteRouteResolver` uses `accountBootstrap.resolveRoutePath(...)` for static route paths and `accountBootstrap.fetchSiteStatus(...)` for New API default-theme probing.
- [ ] New API default-theme route cache TTL, max size, and cache-clear test helper are preserved.
- [ ] AIHubMix login URL still resolves against `https://console.aihubmix.com`.
- [ ] Account-completion adapters use sibling bootstrap implementations instead of calling `getApiService(...)` directly.
- [ ] Existing account-completion error classification and fallback semantics are preserved.
- [ ] Tests cover missing bootstrap capability in best-effort product helpers.
- [ ] Final validation includes focused Vitest tests, `pnpm compile`, `pnpm run validate:staged`, and `pnpm run validate:push`.

## Out Of Scope

- Adding a new site type.
- Removing `getApiService(...)`.
- Migrating saved-account request creation in `src/services/accounts/utils/apiServiceRequest.ts`.
- Moving site-type detection rules behind adapters.
- Migrating redemption, managed-site channel operations, managed-site model sync, or provider registration.
- Changing telemetry, settings search, locale strings, or Playwright E2E coverage.

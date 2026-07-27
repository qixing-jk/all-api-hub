# Sub2API Adapter Seam Separation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Sub2API phase-1 identity and token helpers stop falling back to incompatible common One-API endpoints by adding strict override enforcement plus truthful Sub2API `fetchUserInfo()` and `getOrCreateAccessToken()` implementations.

**Architecture:** Keep the phase-1 surface narrow. Change the `apiService` wrapper so `SITE_TYPES.SUB2API` fails fast on missing overrides, then add adapter-owned compatibility overrides in `src/services/apiService/sub2api/index.ts` that reuse the existing JWT hydration, refresh, and re-sync logic instead of business-layer patching. Preserve current browser-session recovery modules such as content-script `localStorage` reads and `tokenResync.ts`; they remain separate support paths and are not replaced in this phase.

**Tech Stack:** TypeScript, WXT extension runtime, Vitest, existing `apiService` adapter pattern, existing Sub2API JWT refresh/resync modules, `pnpm exec vitest`, and `pnpm run validate:staged`.

---

## File Structure

- Modify `src/services/apiService/index.ts`
  - Add `SITE_TYPES.SUB2API` to `strictOverrideSites` so missing Sub2API helpers throw instead of silently hitting `commonAPI`.
- Modify `src/services/apiService/sub2api/index.ts`
  - Export `fetchUserInfo(request)` as a compatibility override backed by `/api/v1/auth/me`.
  - Export `getOrCreateAccessToken(request)` as a compatibility override backed by existing Sub2API auth hydration, refresh-token restore, and browser-session re-sync behavior.
- Modify `tests/services/apiService/index.test.ts`
  - Add strict-override routing tests proving Sub2API does not silently fall back to common helpers.
- Modify `tests/services/apiService/sub2api/index.test.ts`
  - Add focused tests for `fetchUserInfo()` and `getOrCreateAccessToken()` behavior.
- Modify `tests/services/autoDetectService.test.ts`
  - Add a regression test proving Sub2API API fallback uses the Sub2API override path instead of the common `/api/user/self` contract.
- Modify `tests/services/accountOperations.autoDetectAccount.test.ts`
  - Add a regression test proving AccessToken completion for detected Sub2API accounts uses the Sub2API override and preserves the expected result shape.

---

### Task 1: Make Sub2API A Strict Override Site

**Files:**
- Modify: `src/services/apiService/index.ts`
- Modify: `tests/services/apiService/index.test.ts`

- [ ] **Step 1: Add a failing wrapper test for missing Sub2API overrides**

In `tests/services/apiService/index.test.ts`, extend the hoisted mocks so the wrapper can observe a real Sub2API override and still verify strict failure for a missing one:

```ts
const {
  commonFetchUserInfo,
  commonFetchModelPricing,
  commonFetchAccountTokens,
  commonResolveApiTokenKey,
  aihubmixFetchAccountTokens,
  oneHubFetchModelPricing,
  oneHubFetchAccountTokens,
  wongResolveApiTokenKey,
  sub2apiFetchUserInfo,
} = vi.hoisted(() => ({
  commonFetchUserInfo: vi.fn(),
  commonFetchModelPricing: vi.fn(),
  commonFetchAccountTokens: vi.fn(),
  commonResolveApiTokenKey: vi.fn(),
  aihubmixFetchAccountTokens: vi.fn(),
  oneHubFetchModelPricing: vi.fn(),
  oneHubFetchAccountTokens: vi.fn(),
  wongResolveApiTokenKey: vi.fn(),
  sub2apiFetchUserInfo: vi.fn(),
}))
```

Add the Sub2API module mock:

```ts
vi.mock("~/services/apiService/sub2api", () => ({
  fetchUserInfo: sub2apiFetchUserInfo,
  // Intentionally omit fetchModelPricing so strict override behavior can be asserted.
}))
```

Add these two tests near the AIHubMix strict-override assertions:

```ts
it("should route Sub2API fetchUserInfo through the site override", async () => {
  sub2apiFetchUserInfo.mockResolvedValue({ id: "7" } as any)

  const request = {
    baseUrl: "https://sub2.example.com",
    auth: { authType: "access_token", accessToken: "jwt-token" },
  }

  await (getApiService(SITE_TYPES.SUB2API).fetchUserInfo as any)(request)

  expect(sub2apiFetchUserInfo).toHaveBeenCalledTimes(1)
  expect(sub2apiFetchUserInfo).toHaveBeenCalledWith(request)
  expect(commonFetchUserInfo).not.toHaveBeenCalled()
})

it("should not silently fall back to common for missing Sub2API overrides", async () => {
  commonFetchModelPricing.mockResolvedValue({} as any)

  const request = {
    baseUrl: "https://sub2.example.com",
    auth: { authType: "access_token", accessToken: "jwt-token" },
  }

  expect(() =>
    (getApiService(SITE_TYPES.SUB2API).fetchModelPricing as any)(request),
  ).toThrow(
    `apiService.fetchModelPricing is not implemented for ${SITE_TYPES.SUB2API}`,
  )

  expect(commonFetchModelPricing).not.toHaveBeenCalled()
})
```

- [ ] **Step 2: Run the wrapper test to verify the new strict Sub2API case fails**

Run:

```powershell
pnpm exec vitest --run tests/services/apiService/index.test.ts
```

Expected before implementation: the new missing-override assertion fails because `SITE_TYPES.SUB2API` is not yet included in `strictOverrideSites`.

- [ ] **Step 3: Add Sub2API to `strictOverrideSites`**

In `src/services/apiService/index.ts`, change:

```ts
const strictOverrideSites = new Set<ApiOverrideSite>([SITE_TYPES.AIHUBMIX])
```

to:

```ts
const strictOverrideSites = new Set<ApiOverrideSite>([
  SITE_TYPES.AIHUBMIX,
  SITE_TYPES.SUB2API,
])
```

Do not change `siteOverrideMap`, `getApiFunc`, or the generic fallback rules for common-compatible sites.

- [ ] **Step 4: Re-run the wrapper test to verify strict Sub2API behavior passes**

Run:

```powershell
pnpm exec vitest --run tests/services/apiService/index.test.ts
```

Expected: `tests/services/apiService/index.test.ts` passes, including the new Sub2API strict-override assertions.

- [ ] **Step 5: Commit the strict override change**

Run:

```powershell
git status --porcelain
git add src/services/apiService/index.ts tests/services/apiService/index.test.ts
git commit -m "fix(api-service): make sub2api a strict override site"
```

Expected: one focused commit containing only the wrapper change and its tests.

---

### Task 2: Add Truthful Sub2API `fetchUserInfo()` And `getOrCreateAccessToken()` Overrides

**Files:**
- Modify: `src/services/apiService/sub2api/index.ts`
- Modify: `tests/services/apiService/sub2api/index.test.ts`

- [ ] **Step 1: Add failing tests for the two missing Sub2API compatibility overrides**

In `tests/services/apiService/sub2api/index.test.ts`, update the import list to include the new exports:

```ts
import {
  createApiToken,
  deleteApiToken,
  fetchAccountAvailableModels,
  fetchAccountData,
  fetchAccountTokens,
  fetchCheckInStatus,
  fetchCurrentUser,
  fetchSiteStatus,
  fetchSub2ApiAnnouncements,
  fetchSupportCheckIn,
  fetchTodayIncome,
  fetchTodayUsage,
  fetchTokenById,
  fetchUserGroups,
  fetchUserInfo,
  getOrCreateAccessToken,
  markSub2ApiAnnouncementRead,
  refreshAccountData,
  updateApiToken,
} from "~/services/apiService/sub2api"
```

Add this focused `fetchUserInfo` test near the existing `fetchCurrentUser` coverage:

```ts
it("fetchUserInfo returns the shared compatibility shape from /api/v1/auth/me", async () => {
  vi.mocked(fetchApi).mockResolvedValueOnce({
    code: 0,
    message: "ok",
    data: {
      id: 12,
      username: "alice",
      email: "alice@example.com",
      balance: "1.5",
    },
  } as any)

  await expect(
    fetchUserInfo({
      baseUrl: "https://sub2.example.com",
      auth: {
        authType: AuthTypeEnum.AccessToken,
        accessToken: "jwt-token",
      },
    }),
  ).resolves.toEqual({
    id: "12",
    username: "alice",
    access_token: "jwt-token",
    user: {
      id: 12,
      username: "alice",
      email: "alice@example.com",
      balance: "1.5",
    },
  })

  expect(fetchApi).toHaveBeenCalledWith(
    expect.objectContaining({
      auth: expect.objectContaining({
        authType: AuthTypeEnum.AccessToken,
        accessToken: "jwt-token",
      }),
    }),
    expect.objectContaining({
      endpoint: "/api/v1/auth/me",
      options: expect.objectContaining({
        method: "GET",
        cache: "no-store",
      }),
    }),
    true,
  )
})
```

Add this focused `getOrCreateAccessToken` reuse-path test:

```ts
it("getOrCreateAccessToken reuses the existing Sub2API JWT when present", async () => {
  vi.mocked(fetchApi).mockResolvedValueOnce({
    code: 0,
    message: "ok",
    data: {
      id: 12,
      username: "alice",
      email: "alice@example.com",
      balance: "1.5",
    },
  } as any)

  await expect(
    getOrCreateAccessToken({
      baseUrl: "https://sub2.example.com",
      auth: {
        authType: AuthTypeEnum.AccessToken,
        accessToken: "jwt-token",
      },
    }),
  ).resolves.toEqual({
    username: "alice",
    access_token: "jwt-token",
  })

  expect(fetchApi).toHaveBeenCalledTimes(1)
  expect(resyncSub2ApiAuthToken).not.toHaveBeenCalled()
})
```

Add this refresh-path test:

```ts
it("getOrCreateAccessToken refreshes the Sub2API JWT when only refresh token state is usable", async () => {
  const now = 1_700_000_000_000
  const nowSpy = vi.spyOn(Date, "now").mockReturnValue(now)

  const fetchMock = vi.fn().mockResolvedValue(
    new Response(
      JSON.stringify({
        code: 0,
        message: "ok",
        data: {
          access_token: "refreshed-jwt",
          refresh_token: "rotated-refresh",
          expires_in: 3600,
        },
      }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    ),
  )
  vi.stubGlobal("fetch", fetchMock as any)

  vi.mocked(fetchApi).mockResolvedValueOnce({
    code: 0,
    message: "ok",
    data: {
      id: 12,
      username: "alice",
      email: "alice@example.com",
      balance: "1.5",
    },
  } as any)

  await expect(
    getOrCreateAccessToken({
      baseUrl: "https://sub2.example.com",
      auth: {
        authType: AuthTypeEnum.AccessToken,
        accessToken: "expired-jwt",
        refreshToken: "stored-refresh",
        tokenExpiresAt: now - 1,
      },
    }),
  ).resolves.toEqual({
    username: "alice",
    access_token: "refreshed-jwt",
  })

  expect(fetchMock).toHaveBeenCalledTimes(1)
  expect(resyncSub2ApiAuthToken).not.toHaveBeenCalled()
  nowSpy.mockRestore()
})
```

Add this resync-path test:

```ts
it("getOrCreateAccessToken falls back to browser-session re-sync when refresh token restore is unavailable", async () => {
  vi.mocked(resyncSub2ApiAuthToken).mockResolvedValueOnce({
    accessToken: "resynced-jwt",
    source: "existing_tab",
  })

  vi.mocked(fetchApi).mockResolvedValueOnce({
    code: 0,
    message: "ok",
    data: {
      id: 12,
      username: "alice",
      email: "alice@example.com",
      balance: "1.5",
    },
  } as any)

  await expect(
    getOrCreateAccessToken({
      baseUrl: "https://sub2.example.com",
      auth: {
        authType: AuthTypeEnum.AccessToken,
        accessToken: "",
      },
    }),
  ).resolves.toEqual({
    username: "alice",
    access_token: "resynced-jwt",
  })

  expect(resyncSub2ApiAuthToken).toHaveBeenCalledWith("https://sub2.example.com")
})
```

- [ ] **Step 2: Run the Sub2API adapter test file to verify the new tests fail**

Run:

```powershell
pnpm exec vitest --run tests/services/apiService/sub2api/index.test.ts
```

Expected before implementation: the new test block fails because `fetchUserInfo` and `getOrCreateAccessToken` are not exported yet.

- [ ] **Step 3: Implement `fetchUserInfo(request)` as a compatibility override**

In `src/services/apiService/sub2api/index.ts`, add `AccessTokenInfo` and `UserInfo` to the existing type import list:

```ts
import type {
  AccessTokenInfo,
  AccountData,
  ApiServiceAccountRequest,
  ApiServiceRequest,
  CreateTokenRequest,
  CreateTokenResult,
  RefreshAccountResult,
  SiteStatusInfo,
  TodayIncomeData,
  TodayUsageData,
  UserGroupInfo,
  UserInfo,
} from "~/services/apiService/common/type"
```

Add this helper after `fetchCurrentUser()`:

```ts
export async function fetchUserInfo(request: ApiServiceRequest): Promise<{
  id: string
  username: string
  access_token: string
  user: UserInfo
}> {
  const jwtRequest = normalizeJwtRequest(request)
  const body = (await fetchApi<Sub2ApiAuthMeResponse>(
    jwtRequest,
    {
      endpoint: SUB2API_AUTH_ME_ENDPOINT,
      options: {
        method: "GET",
        cache: "no-store",
      },
    },
    true,
  )) as Sub2ApiAuthMeResponse

  const data = parseSub2ApiEnvelope<Sub2ApiAuthMeData>(
    body,
    SUB2API_AUTH_ME_ENDPOINT,
  )
  const identity = parseSub2ApiUserIdentity(data)

  return {
    id: identity.userId,
    username: identity.username,
    access_token: jwtRequest.auth.accessToken,
    user: data as UserInfo,
  }
}
```

Do not add cookie-auth fallback here. This override must require adapter-native JWT auth.

- [ ] **Step 4: Implement `getOrCreateAccessToken(request)` as a truthful Sub2API override**

In `src/services/apiService/sub2api/index.ts`, add this helper after `fetchUserInfo()`:

```ts
export async function getOrCreateAccessToken(
  request: ApiServiceRequest,
): Promise<AccessTokenInfo> {
  const hydrated = await hydrateSub2ApiAuthRequest(request)
  let effectiveRequest = hydrated.request
  let accessToken = normalizeAccessToken(effectiveRequest.auth?.accessToken)
  let refreshToken = normalizeRefreshToken(effectiveRequest.auth?.refreshToken)
  const tokenExpiresAt = normalizeTokenExpiresAt(
    effectiveRequest.auth?.tokenExpiresAt,
  )

  if (accessToken && (!tokenExpiresAt || !isCloseToExpiry(tokenExpiresAt))) {
    const userInfo = await fetchUserInfo(effectiveRequest)
    return {
      username: userInfo.username,
      access_token: userInfo.access_token,
    }
  }

  if (refreshToken) {
    const refreshed = await refreshSub2ApiRequestAuth({
      request: effectiveRequest,
      refreshToken,
      accountStorageRef: hydrated.accountStorageRef,
    })
    effectiveRequest = refreshed.request
    accessToken = normalizeAccessToken(effectiveRequest.auth?.accessToken)
    refreshToken = refreshed.refreshToken

    const userInfo = await fetchUserInfo(effectiveRequest)
    return {
      username: userInfo.username,
      access_token: accessToken,
    }
  }

  effectiveRequest = await resyncSub2ApiRequestAuth({
    request: effectiveRequest,
    endpoint: SUB2API_AUTH_ME_ENDPOINT,
    accountStorageRef: hydrated.accountStorageRef,
  })

  const userInfo = await fetchUserInfo(effectiveRequest)
  return {
    username: userInfo.username,
    access_token: userInfo.access_token,
  }
}
```

Use the existing `hydrateSub2ApiAuthRequest`, `refreshSub2ApiRequestAuth`, and `resyncSub2ApiRequestAuth` helpers. Do not call common `/api/user/self` or common `/api/user/token`.

- [ ] **Step 5: Add a concise protocol comment above the new override pair**

In `src/services/apiService/sub2api/index.ts`, add this short comment above `fetchUserInfo`:

```ts
/**
 * Sub2API compatibility overrides for shared account-detection callers.
 *
 * Upstream identity lives at `/api/v1/auth/me` behind bearer JWT auth.
 * This adapter intentionally does not fall back to common `/api/user/self`
 * or `/api/user/token` semantics.
 */
```

Keep the comment narrow and protocol-focused.

- [ ] **Step 6: Re-run the Sub2API adapter tests**

Run:

```powershell
pnpm exec vitest --run tests/services/apiService/sub2api/index.test.ts
```

Expected: the new `fetchUserInfo` / `getOrCreateAccessToken` tests pass along with the existing Sub2API adapter suite.

- [ ] **Step 7: Commit the Sub2API compatibility overrides**

Run:

```powershell
git status --porcelain
git add src/services/apiService/sub2api/index.ts tests/services/apiService/sub2api/index.test.ts
git commit -m "fix(sub2api): override identity and token helpers"
```

Expected: one focused commit containing only the Sub2API override implementation and its tests.

---

### Task 3: Add Caller-Facing Regression Coverage And Final Validation

**Files:**
- Modify: `tests/services/autoDetectService.test.ts`
- Modify: `tests/services/accountOperations.autoDetectAccount.test.ts`
- Validate: `src/services/apiService/index.ts`
- Validate: `src/services/apiService/sub2api/index.ts`

- [ ] **Step 1: Add an auto-detect regression proving Sub2API API fallback uses the Sub2API helper seam**

In `tests/services/autoDetectService.test.ts`, add a Sub2API-specific fallback test near the current-tab/API fallback coverage:

```ts
it("uses the Sub2API apiService override when current-tab detection falls back to API", async () => {
  mockGetAccountSiteType.mockResolvedValueOnce(SITE_TYPES.SUB2API)
  mockGetActiveOrAllTabs.mockResolvedValue([
    {
      id: 201,
      active: true,
      url: "https://sub2.example.com/dashboard",
    },
  ])
  browserAny.tabs.sendMessage.mockResolvedValue({
    success: false,
    error: "no local storage user",
  })
  mockFetchUserInfo.mockResolvedValueOnce({
    id: "12",
    username: "alice",
    access_token: "jwt-token",
    user: { id: 12, username: "alice" },
  })

  const result = await autoDetectSmart("https://sub2.example.com/console")

  expect(result.success).toBe(true)
  expect(result.data).toMatchObject({
    userId: "12",
    siteType: SITE_TYPES.SUB2API,
    accessToken: "jwt-token",
  })
  expect(mockFetchUserInfo).toHaveBeenCalledWith({
    baseUrl: "https://sub2.example.com/console",
    auth: {
      authType: expect.any(String),
    },
    fetchContext: {
      kind: API_SERVICE_FETCH_CONTEXT_KINDS.CURRENT_TAB,
      tabId: 201,
      origin: "https://sub2.example.com",
    },
  })
})
```

This test does not verify the low-level endpoint again; it verifies the caller still works through `getApiService(siteType).fetchUserInfo(...)` after the seam change.

- [ ] **Step 2: Add an account-operations regression for detected Sub2API AccessToken completion**

In `tests/services/accountOperations.autoDetectAccount.test.ts`, add:

```ts
it("uses Sub2API getOrCreateAccessToken override semantics during access-token auto-detect completion", async () => {
  mockSendRuntimeMessage.mockResolvedValueOnce(null)
  mockAutoDetectSmart.mockResolvedValueOnce({
    success: true,
    data: {
      userId: "12",
      user: { id: 12, username: "alice" },
      siteType: SITE_TYPES.SUB2API,
      fetchContext: currentTabFetchContext("https://sub2.example.com"),
    },
  })
  mockGetOrCreateAccessToken.mockResolvedValueOnce({
    username: "alice",
    access_token: "jwt-token",
  })
  mockFetchSiteStatus.mockResolvedValueOnce(null)
  mockFetchSupportCheckIn.mockResolvedValueOnce(false)
  mockExtractDefaultExchangeRate.mockReturnValueOnce(null)

  const result = await autoDetectAccount(
    "https://sub2.example.com",
    AuthTypeEnum.AccessToken,
  )

  expect(result.success).toBe(true)
  expect(mockGetOrCreateAccessToken).toHaveBeenCalledTimes(1)
  expect(result.data).toMatchObject({
    siteType: SITE_TYPES.SUB2API,
    username: "alice",
    accessToken: "jwt-token",
    exchangeRate: UI_CONSTANTS.EXCHANGE_RATE.DEFAULT,
  })
})
```

This guards the shared business caller contract without reintroducing any business-layer Sub2API patch.

- [ ] **Step 3: Run the targeted caller regression tests**

Run:

```powershell
pnpm exec vitest --run tests/services/autoDetectService.test.ts tests/services/accountOperations.autoDetectAccount.test.ts
```

Expected: both caller-facing regression suites pass.

- [ ] **Step 4: Run the full focused phase-1 validation set**

Run:

```powershell
pnpm exec vitest --run tests/services/apiService/index.test.ts tests/services/apiService/sub2api/index.test.ts tests/services/autoDetectService.test.ts tests/services/accountOperations.autoDetectAccount.test.ts
```

Expected: all four focused suites pass.

- [ ] **Step 5: Stage only task-scoped files and run staged validation**

Run:

```powershell
git status --porcelain
git add src/services/apiService/index.ts src/services/apiService/sub2api/index.ts
git add tests/services/apiService/index.test.ts tests/services/apiService/sub2api/index.test.ts
git add tests/services/autoDetectService.test.ts tests/services/accountOperations.autoDetectAccount.test.ts
pnpm run validate:staged
```

Expected: staged validation exits 0. If formatting changes are applied by lint-staged, inspect the resulting diff before continuing.

- [ ] **Step 6: Inspect the final diff**

Run:

```powershell
git diff --cached --stat
git diff --cached --name-status
```

Expected:

```text
M src/services/apiService/index.ts
M src/services/apiService/sub2api/index.ts
M tests/services/apiService/index.test.ts
M tests/services/apiService/sub2api/index.test.ts
M tests/services/autoDetectService.test.ts
M tests/services/accountOperations.autoDetectAccount.test.ts
```

No business-layer source files such as `AccountDataContext.tsx`, `useAccountDialog.ts`, or `tokenResync.ts` should be modified in this phase.

- [ ] **Step 7: Commit the caller regression coverage and final integration**

Run:

```powershell
git commit -m "test(sub2api): cover adapter seam regressions"
```

Expected: the final task-scoped staged diff is committed cleanly.

- [ ] **Step 8: Record final status**

Run:

```powershell
git status --porcelain
git log --oneline -5
```

Expected: only unrelated pre-existing files remain untracked or modified, and recent commits include the three phase-1 commits from this plan.

---

## Self-Review Notes

- Spec coverage: Task 1 implements `strictOverrideSites` for Sub2API. Task 2 adds the required phase-1 overrides `fetchUserInfo` and `getOrCreateAccessToken` using existing Sub2API adapter auth machinery. Task 3 covers the shared callers called out in the spec validation plan and confirms no phase-2 abstraction work leaks in.
- Placeholder scan: each task includes exact file paths, code snippets, commands, and expected outcomes. No `TODO`, `TBD`, or “similar to previous step” placeholders remain.
- Type consistency: `fetchUserInfo` returns the same compatibility shape as common/AIHubMix callers expect (`id`, `username`, `access_token`, `user`), and `getOrCreateAccessToken` returns the shared `AccessTokenInfo` shape (`username`, `access_token`).

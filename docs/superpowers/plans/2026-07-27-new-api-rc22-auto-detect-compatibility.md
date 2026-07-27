# New API rc.22 Auto-Detect Compatibility Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restore New API rc.22 account auto-detection by adapting its AuthBundle dashboard session into the existing get-or-create PAT flow while preserving legacy New API-family behavior.

**Architecture:** Add an exact-site content-session extractor that obtains and validates a short-lived dashboard Bearer from the same-origin refresh cookie. Propagate that credential through a discriminated, completion-only `transientAuth` contract, consume it only inside New API account completion, and persist only the management PAT returned by the existing bootstrap. Update real-site and deterministic browser E2E paths to recognize AuthBundle sessions and clean up sessions created by tests.

**Tech Stack:** TypeScript, React account workflow, WXT Manifest V3 content/background messaging, Vitest/jsdom, Playwright Chromium, pnpm.

---

## File And Responsibility Map

### New files

- `src/services/accountSiteOnboarding/contentSession/newApiAuthBundle.ts`
  - exact `SITE_TYPES.NEW_API` refresh/AuthBundle extraction
  - strict response validation and controlled modern-auth errors
- `tests/services/accountSiteOnboarding/contentSession/newApiAuthBundle.test.ts`
  - extractor protocol and security-contract tests
- `tests/utils/realSiteCompatibleApi.test.ts`
  - compatible real-site login parser, fallback, and owned-session cleanup tests

### Modified production files

- `src/services/accountSiteOnboarding/contracts.ts`
  - discriminated completion-only transient dashboard auth type
- `src/services/accountSiteOnboarding/registry.ts`
  - exact New API extractor ordering before generic legacy storage
- `src/services/accountBrowserSession/types.ts`
  - normalized transient-auth field on browser-session results
- `src/services/accountBrowserSession/sessionReader.ts`
  - whitelist and normalize transient runtime-message data
- `src/services/siteDetection/autoDetectService.ts`
  - propagate transient auth through detection only
- `src/services/accounts/autoDetectCompletion/types.ts`
  - expose transient auth on detected identity, not completion output
- `src/services/apiAdapters/newApi/accountCompletion.ts`
  - consume rc.22 Bearer through existing get-or-create PAT capability
- `src/entrypoints/background/tempWindowPool.ts`
  - preserve transient auth through background temp-context detection

### Modified E2E files

- `e2e/utils/realSite/compatibleApi.ts`
  - opt-in AuthBundle login state machine and controlled cleanup closure
- `e2e/utils/realSite/newApi.ts`
  - enable AuthBundle mode only for the exact New API real-site wrapper
- `e2e/utils/realSite/compatibleAccountSaveFlow.ts`
  - propagate login-owned cleanup into the scenario
- `e2e/utils/realSite/accountSaveFlow.ts`
  - pass dynamic detectable-site cleanup through the account scenario
- `e2e/scenarios/accountAutoDetect.ts`
  - run dynamic session cleanup before environment cleanup and page close
- `e2e/utils/commonUserFlows.ts`
  - opt-in rc.22 mock routes with separate dashboard Bearer and management PAT
- `e2e/accountOnboardingCommonFlows.spec.ts`
  - deterministic legacy and rc.22 browser-level assertions

### Modified tests

- `tests/services/accountSiteOnboarding/registry.test.ts`
- `tests/entrypoints/content/messageHandlers/handlers/storage.test.ts`
- `tests/services/accountBrowserSession/sessionReader.test.ts`
- `tests/services/autoDetectService.test.ts`
- `tests/services/apiAdapters/newApi/accountCompletion.test.ts`
- `tests/services/accountOperations.autoDetectAccount.test.ts`
- `tests/utils/accountScenarios.test.ts`

## Task 1: Extract And Validate The rc.22 AuthBundle

**Files:**

- Create: `src/services/accountSiteOnboarding/contentSession/newApiAuthBundle.ts`
- Create: `tests/services/accountSiteOnboarding/contentSession/newApiAuthBundle.test.ts`
- Modify: `src/services/accountSiteOnboarding/contracts.ts`
- Modify: `src/services/accountSiteOnboarding/registry.ts`
- Modify: `tests/services/accountSiteOnboarding/registry.test.ts`
- Modify: `tests/entrypoints/content/messageHandlers/handlers/storage.test.ts`

- [ ] **Step 1: Write failing extractor tests**

Create tests using reserved example origins. Cover exact-site gating, successful
AuthBundle parsing, same-origin endpoint construction, `credentials: "include"`,
future-expiry enforcement, no storage writes, 404/405 legacy fallback, and
controlled 401/409/429 failures.

```ts
const validBundle = {
  success: true,
  data: {
    access_token: "dashboard-jwt",
    token_type: "Bearer",
    access_expires_at: Math.floor(Date.now() / 1000) + 900,
    user: { id: 42, username: "example-user" },
    session: { sid: "session-example", current: true },
  },
}

it("extracts exact New API AuthBundle without persisting its bearer", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue(
      new Response(JSON.stringify(validBundle), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    ),
  )

  await expect(
    newApiAuthBundleContentSessionExtractor.extract({
      url: "https://ignored.example.invalid/path",
      siteTypeHint: SITE_TYPES.NEW_API,
    }),
  ).resolves.toMatchObject({
    userId: 42,
    user: { id: 42, username: "example-user" },
    siteTypeHint: SITE_TYPES.NEW_API,
    transientAuth: {
      kind: NEW_API_DASHBOARD_TRANSIENT_AUTH_KIND,
      token: "dashboard-jwt",
      sessionId: "session-example",
    },
  })

  expect(fetch).toHaveBeenCalledWith(
    `${location.origin}/api/user/auth/refresh`,
    expect.objectContaining({ method: "POST", credentials: "include" }),
  )
  expect(localStorage.length).toBe(0)
})

it.each([404, 405])("returns null for legacy HTTP %s", async (status) => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("", { status })))
  await expect(
    newApiAuthBundleContentSessionExtractor.extract({
      siteTypeHint: SITE_TYPES.NEW_API,
    }),
  ).resolves.toBeNull()
})
```

- [ ] **Step 2: Run the new test and verify RED**

Run:

```powershell
pnpm exec vitest tests/services/accountSiteOnboarding/contentSession/newApiAuthBundle.test.ts --run
```

Expected: FAIL because the extractor and transient-auth exports do not exist.

- [ ] **Step 3: Add the transient-auth contract and extractor**

Add to `contracts.ts`:

```ts
export const NEW_API_DASHBOARD_TRANSIENT_AUTH_KIND =
  "new_api_dashboard_bearer" as const

export type NewApiDashboardTransientAuth = {
  kind: typeof NEW_API_DASHBOARD_TRANSIENT_AUTH_KIND
  token: string
  expiresAt: number
  sessionId: string
  origin: string
}

export type ContentSessionTransientAuth = NewApiDashboardTransientAuth
```

Add `transientAuth?: ContentSessionTransientAuth` to
`ContentSessionExtractionResult`. Include a doc comment stating that this field
is completion-only and must never be persisted as `account_info.access_token`.

Implement the extractor with these fixed rules:

```ts
const NEW_API_AUTH_REFRESH_PATH = "/api/user/auth/refresh"

export const newApiAuthBundleContentSessionExtractor: ContentSessionExtractor = {
  id: "new-api-auth-bundle",
  canExtract: ({ siteTypeHint }) => siteTypeHint === SITE_TYPES.NEW_API,
  async extract() {
    // New API rc.22: short dashboard Bearers stay in memory and refresh via
    // an HttpOnly cookie. See the pinned upstream authentication contract.
    const origin = location.origin
    const response = await fetch(`${origin}${NEW_API_AUTH_REFRESH_PATH}`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
    })

    if (response.status === 404 || response.status === 405) return null
    const body = await parseControlledJson(response)
    if (!response.ok) throw createNewApiDashboardSessionError(response, body)

    const bundle = parseNewApiAuthBundle(body, origin)
    return bundle ?? null
  },
}
```

Use small private validators for unknown JSON. Accept only a Bearer token,
future epoch-seconds expiry, object user with a resolvable identity, and a
non-empty SID. Error messages may include controlled upstream `code` and
`message` but never the response body, token, or SID.

- [ ] **Step 4: Register the exact extractor before generic storage fallback**

Update `getContentSessionExtractors()` to return:

```ts
return [
  sub2ApiContentSessionExtractor,
  sharedChatContentSessionExtractor,
  voApiV2ContentSessionExtractor,
  newApiAuthBundleContentSessionExtractor,
  compatibleUserContentSessionExtractor,
]
```

Update registry and storage-handler tests to assert that an AuthBundle result is
returned unchanged and a legacy `null` result continues to the compatible-user
extractor.

- [ ] **Step 5: Run focused tests and verify GREEN**

Run:

```powershell
pnpm exec vitest tests/services/accountSiteOnboarding/contentSession/newApiAuthBundle.test.ts tests/services/accountSiteOnboarding/registry.test.ts tests/entrypoints/content/messageHandlers/handlers/storage.test.ts --run
```

Expected: all selected tests PASS.

- [ ] **Step 6: Commit Task 1**

```powershell
git add -- src/services/accountSiteOnboarding/contracts.ts src/services/accountSiteOnboarding/registry.ts src/services/accountSiteOnboarding/contentSession/newApiAuthBundle.ts tests/services/accountSiteOnboarding/contentSession/newApiAuthBundle.test.ts tests/services/accountSiteOnboarding/registry.test.ts tests/entrypoints/content/messageHandlers/handlers/storage.test.ts
git commit -m "feat(new-api): extract rc22 dashboard session"
```

## Task 2: Propagate Transient Auth Without Persistence Leakage

**Files:**

- Modify: `src/services/accountBrowserSession/types.ts`
- Modify: `src/services/accountBrowserSession/sessionReader.ts`
- Modify: `src/services/siteDetection/autoDetectService.ts`
- Modify: `src/services/accounts/autoDetectCompletion/types.ts`
- Modify: `src/entrypoints/background/tempWindowPool.ts`
- Modify: `tests/services/accountBrowserSession/sessionReader.test.ts`
- Modify: `tests/services/autoDetectService.test.ts`

- [ ] **Step 1: Write failing browser-session normalization tests**

Add one valid and two invalid runtime-message cases:

```ts
it("normalizes exact New API transient auth from the content boundary", async () => {
  mockSendTabMessageWithRetry.mockResolvedValueOnce({
    success: true,
    data: {
      userId: 42,
      user: { id: 42, username: "example-user" },
      transientAuth: {
        kind: NEW_API_DASHBOARD_TRANSIENT_AUTH_KIND,
        token: " dashboard-jwt ",
        expiresAt: 2_000_000_000,
        sessionId: " session-example ",
        origin: "https://panel.example.invalid",
      },
    },
  })

  const options = {
    tabId: 7,
    baseUrl: "https://panel.example.invalid",
    siteType: SITE_TYPES.NEW_API,
    source: ACCOUNT_BROWSER_SESSION_SOURCES.CURRENT_TAB,
  } as const

  await expect(readAccountBrowserSessionFromTab(options)).resolves.toMatchObject({
    transientAuth: {
      kind: NEW_API_DASHBOARD_TRANSIENT_AUTH_KIND,
      token: "dashboard-jwt",
      sessionId: "session-example",
      origin: "https://panel.example.invalid",
    },
  })
})
```

Unknown `kind`, blank token, invalid origin, non-finite expiry, and blank SID
must drop `transientAuth` while preserving the usable identity result.

- [ ] **Step 2: Write failing auto-detect propagation tests**

Extend current-tab and background response fixtures with valid transient auth.
Assert `autoDetectSmart()` returns it inside `data`, while
`autoDetectContext` contains only existing privacy-safe fields.

- [ ] **Step 3: Run the focused tests and verify RED**

Run:

```powershell
pnpm exec vitest tests/services/accountBrowserSession/sessionReader.test.ts tests/services/autoDetectService.test.ts --run
```

Expected: FAIL because browser-session and auto-detect types drop the new field.

- [ ] **Step 4: Add strict normalization and detection propagation**

Add `transientAuth?: ContentSessionTransientAuth` to `AccountBrowserSession`.
In `sessionReader.ts`, whitelist the discriminant and fields:

```ts
function normalizeTransientAuth(
  value: unknown,
): AccountBrowserSession["transientAuth"] {
  if (!value || typeof value !== "object") return undefined
  const candidate = value as Record<string, unknown>
  if (candidate.kind !== NEW_API_DASHBOARD_TRANSIENT_AUTH_KIND) return undefined

  const token = normalizeOptionalString(candidate.token)
  const sessionId = normalizeOptionalString(candidate.sessionId)
  const origin = normalizeOptionalString(candidate.origin)
  const expiresAt = candidate.expiresAt
  if (!token || !sessionId || !origin) return undefined
  if (typeof expiresAt !== "number" || !Number.isFinite(expiresAt)) return undefined

  try {
    if (new URL(origin).origin !== origin) return undefined
  } catch {
    return undefined
  }

  return {
    kind: NEW_API_DASHBOARD_TRANSIENT_AUTH_KIND,
    token,
    expiresAt,
    sessionId,
    origin,
  }
}
```

Add the field to `UserDataResult`, `AutoDetectResult.data`, and
`DetectedAccountIdentity`. Copy it only in current-tab/background data paths and
`combineUserDataAndSiteType`. Do not add it to `AutoDetectCompletionData`.

Add it to the explicit `getSiteDataFromTab()` response projection in
`tempWindowPool.ts`; do not spread the whole content response.

- [ ] **Step 5: Run focused tests and compile**

Run:

```powershell
pnpm exec vitest tests/services/accountBrowserSession/sessionReader.test.ts tests/services/autoDetectService.test.ts --run
pnpm compile
```

Expected: selected tests and TypeScript compilation PASS.

- [ ] **Step 6: Commit Task 2**

```powershell
git add -- src/services/accountBrowserSession/types.ts src/services/accountBrowserSession/sessionReader.ts src/services/siteDetection/autoDetectService.ts src/services/accounts/autoDetectCompletion/types.ts src/entrypoints/background/tempWindowPool.ts tests/services/accountBrowserSession/sessionReader.test.ts tests/services/autoDetectService.test.ts
git commit -m "feat(new-api): propagate transient dashboard auth"
```

## Task 3: Consume The Bearer Through Existing Get-Or-Create PAT Completion

**Files:**

- Modify: `src/services/apiAdapters/newApi/accountBootstrap.ts`
- Modify: `src/services/apiAdapters/newApi/accountCompletion.ts`
- Modify: `src/services/apiService/newApiFamily/default/accountBootstrap.ts`
- Modify: `src/services/apiTransport/request.ts`
- Modify: `src/utils/browser/tempWindowFetch.ts`
- Modify: `tests/services/apiAdapters/newApi/accountBootstrap.test.ts`
- Modify: `tests/services/apiAdapters/newApi/accountCompletion.test.ts`
- Modify: `tests/services/accountOperations.autoDetectAccount.test.ts`
- Modify: `tests/services/apiService/newApiFamily/accountBootstrap.test.ts`
- Modify: `tests/services/apiTransport/request.test.ts`
- Modify: `tests/utils/tempWindowFetch.fallback.test.ts`

- [ ] **Step 1: Write a failing rc.22 completion test**

Add a case where the user requested Cookie but exact New API detection contains
transient auth:

```ts
it("uses rc22 dashboard bearer to get or create the persisted PAT", async () => {
  mockGetOrCreateAccessToken.mockResolvedValueOnce({
    username: "rc22-user",
    access_token: "management-pat",
  })
  mockFetchSiteStatus.mockResolvedValueOnce({
    system_name: "rc22 portal",
    checkin_enabled: false,
  })
  mockExtractDefaultExchangeRate.mockReturnValueOnce(null)

  const result = await newApiAccountCompletion.complete(
    {
      url: "https://panel.example.invalid",
      requestedAuthType: AuthTypeEnum.Cookie,
      detected: {
        userId: "42",
        siteType: SITE_TYPES.NEW_API,
        transientAuth: {
          kind: NEW_API_DASHBOARD_TRANSIENT_AUTH_KIND,
          token: "dashboard-jwt",
          expiresAt: 2_000_000_000,
          sessionId: "session-example",
          origin: "https://panel.example.invalid",
        },
      },
      context: { fetchContext: currentTabFetchContext },
    },
    helpers,
  )

  expect(mockGetOrCreateAccessToken).toHaveBeenCalledWith({
    baseUrl: "https://panel.example.invalid",
    fetchContext: currentTabFetchContext,
    auth: {
      authType: AuthTypeEnum.AccessToken,
      accessToken: "dashboard-jwt",
    },
  })
  expect(result).toMatchObject({
    accessToken: "management-pat",
    authType: AuthTypeEnum.AccessToken,
  })
  expect(result).not.toHaveProperty("transientAuth")
})
```

Add origin-mismatch and expired-token tests that reject before calling the
bootstrap. Retain the existing legacy Cookie and AccessToken assertions.

- [ ] **Step 2: Write a failing account-operations leakage regression test**

Mock auto-detection with `transientAuth` and completion with `management-pat`.
Assert the public result contains only `accessToken: "management-pat"` and no
dashboard JWT or transient-auth field.

- [ ] **Step 3: Run focused tests and verify RED**

Run:

```powershell
pnpm exec vitest tests/services/apiAdapters/newApi/accountCompletion.test.ts tests/services/accountOperations.autoDetectAccount.test.ts --run
```

Expected: FAIL because completion still attempts cookie authentication.

- [ ] **Step 4: Add the exact modern completion branch**

Resolve valid transient auth before the legacy `fetchTokenInfo` function:

```ts
const modernDashboardAuth =
  detected.siteType === SITE_TYPES.NEW_API &&
  detected.transientAuth?.kind === NEW_API_DASHBOARD_TRANSIENT_AUTH_KIND &&
  detected.transientAuth.origin === new URL(url).origin &&
  detected.transientAuth.expiresAt > Math.floor(Date.now() / 1000)
    ? detected.transientAuth
    : undefined

const effectiveAuthType = modernDashboardAuth
  ? AuthTypeEnum.AccessToken
  : requestedAuthType
```

For a detected transient-auth object with the exact kind but mismatched origin
or expired timestamp, throw a controlled `TokenFetchFailed` completion error;
do not fall back to cookies.

When `modernDashboardAuth` is present, create the New API account bootstrap
with an adapter-local token-creation policy:

```ts
const accountBootstrap = modernDashboardAuth
  ? createNewApiAccountBootstrap(detected.siteType, {
      accessTokenCreationPolicy: {
        currentTabTransport: "disabled",
        tempWindowFallback: { statusCodes: [], codes: [] },
      },
    })
  : createNewApiAccountBootstrap(detected.siteType)
```

Thread this optional policy through the New API adapter factory and shared
get-or-create implementation only when `/api/user/token` is actually needed.
The default must remain `undefined` so legacy New API and other New API-family
site types retain their current transport behavior.

Call the existing bootstrap with no user ID:

```ts
if (modernDashboardAuth) {
  return accountBootstrap.getOrCreateAccessToken(
    createRequest({
      authType: AuthTypeEnum.AccessToken,
      accessToken: modernDashboardAuth.token,
    }),
  )
}
```

Return `authType: effectiveAuthType` and apply the missing-token check to the
effective AccessToken mode. Keep site-status probing public as it is today.

Make explicit fallback allowlists authoritative in the generic temporary-window
transport: an explicit empty allowlist must suppress the implicit Cookie 401
fallback. Redact the exact request access token from current-tab fallback
diagnostics before logging the error text. Add focused regressions for both
transport contracts and for non-rc.22 New API-family callers retaining their
default behavior.

Add a concise source comment linking the pinned rc.22 authentication contract
and explaining why the dashboard Bearer is completion-only and omits user ID.

- [ ] **Step 5: Run focused tests and compile**

Run:

```powershell
pnpm exec vitest tests/services/apiAdapters/newApi/accountBootstrap.test.ts tests/services/apiAdapters/newApi/accountCompletion.test.ts tests/services/accountOperations.autoDetectAccount.test.ts tests/services/apiService/newApiFamily/accountBootstrap.test.ts tests/services/apiTransport/request.test.ts tests/utils/tempWindowFetch.fallback.test.ts --run
pnpm compile
```

Expected: selected tests and compilation PASS; legacy assertions remain green.

- [ ] **Step 6: Commit Task 3**

```powershell
git add -- src/services/apiAdapters/newApi/accountBootstrap.ts src/services/apiAdapters/newApi/accountCompletion.ts src/services/apiService/newApiFamily/default/accountBootstrap.ts src/services/apiTransport/request.ts src/utils/browser/tempWindowFetch.ts tests/services/apiAdapters/newApi/accountBootstrap.test.ts tests/services/apiAdapters/newApi/accountCompletion.test.ts tests/services/accountOperations.autoDetectAccount.test.ts tests/services/apiService/newApiFamily/accountBootstrap.test.ts tests/services/apiTransport/request.test.ts tests/utils/tempWindowFetch.fallback.test.ts
git commit -m "fix(new-api): exchange rc22 dashboard auth for PAT"
```

## Task 4: Fix Real-Site AuthBundle Login And Owned-Session Cleanup

**Files:**

- Create: `tests/utils/realSiteCompatibleApi.test.ts`
- Modify: `e2e/utils/realSite/compatibleApi.ts`
- Modify: `e2e/utils/realSite/newApi.ts`
- Modify: `e2e/utils/realSite/compatibleAccountSaveFlow.ts`
- Modify: `e2e/utils/realSite/accountSaveFlow.ts`
- Modify: `e2e/scenarios/accountAutoDetect.ts`
- Modify: `tests/utils/accountScenarios.test.ts`

- [ ] **Step 1: Write failing real-site login state-machine tests**

Mock a minimal Playwright `Page`/`APIRequestContext`. Define the response helper
and shared-function mocks at module scope:

```ts
const mocks = vi.hoisted(() => ({
  ensureRealSiteOriginPage: vi.fn(),
  seedLocalStorageValues: vi.fn(),
}))

vi.mock("~~/e2e/utils/realSite/shared", async (importOriginal) => ({
  ...(await importOriginal<typeof import("~~/e2e/utils/realSite/shared")>()),
  ensureRealSiteOriginPage: mocks.ensureRealSiteOriginPage,
  seedLocalStorageValues: mocks.seedLocalStorageValues,
}))

function createApiResponse(body: unknown, status = 200) {
  const text = JSON.stringify(body)
  return {
    ok: () => status >= 200 && status < 300,
    status: () => status,
    text: vi.fn().mockResolvedValue(text),
  }
}

function createAuthBundleResponse() {
  return {
    success: true,
    data: {
      access_token: "dashboard-jwt",
      token_type: "Bearer",
      access_expires_at: 2_000_000_000,
      user: { id: 42, username: "example-user" },
      session: { sid: "session-example", current: true },
    },
  }
}
```

Then cover:

```ts
it("accepts an rc22 AuthBundle without seeding localStorage or UI login", async () => {
  const requestPost = vi
    .fn()
    .mockResolvedValueOnce(createApiResponse(createAuthBundleResponse()))
  const page = {
    request: { post: requestPost, get: vi.fn() },
    waitForFunction: vi.fn().mockRejectedValue(new Error("storage missing")),
  } as unknown as Page

  const result = await loginToCompatibleApiRealSite(page, config, {
    label: "Example API",
    envPrefix: "EXAMPLE",
    authBundle: true,
  })

  expect(result.user).toEqual({ id: 42, username: "example-user" })
  expect(result.reusedSession).toBe(false)
  expect(result.cleanupOwnedSession).toEqual(expect.any(Function))
  expect(mocks.seedLocalStorageValues).not.toHaveBeenCalled()
  expect(requestPost).toHaveBeenCalledTimes(1)
})
```

Also assert:

- legacy top-level users still seed localStorage
- successful unrecognized 2xx never falls through to UI login
- 409 `AUTH_SESSION_LIMIT` and 429 `AUTH_SESSION_ISSUANCE_LIMIT` surface
  controlled code/message without dumping response JSON
- an existing refresh AuthBundle is marked reused and has no cleanup closure
- fresh-session cleanup sends Origin, Bearer, SID, and credentials via the
  shared request context
- cleanup does not log token or SID

- [ ] **Step 2: Write failing dynamic-finalizer tests**

Add cases to `accountScenarios.test.ts` proving:

```ts
expect(finalizerOrder).toEqual([
  "detectable-site-cleanup",
  "environment-cleanup",
  "site-page-close",
])
```

Run the same assertion on primary save failure. Add a case where primary and
dynamic cleanup both fail and assert the existing `AggregateError` contains
both failures.

- [ ] **Step 3: Run tests and verify RED**

Run:

```powershell
pnpm exec vitest tests/utils/realSiteCompatibleApi.test.ts tests/utils/accountScenarios.test.ts --run
```

Expected: FAIL because AuthBundle options, cleanup ownership, and dynamic
finalizers are absent.

- [ ] **Step 4: Implement the opt-in AuthBundle login state machine**

Extend login options without changing other compatible wrappers:

```ts
type CompatibleApiLoginOptions = {
  label: string
  envPrefix: string
  authBundle?: boolean
}

export interface CompatibleApiRealSiteLoginResult {
  reusedSession: boolean
  user: Record<string, unknown>
  cleanupOwnedSession?: () => Promise<void>
}
```

Use a private discriminated parser:

```ts
type CompatibleLoginPayload =
  | { kind: "legacy-user"; user: Record<string, unknown> }
  | {
      kind: "auth-bundle"
      user: Record<string, unknown>
      token: string
      sessionId: string
    }
```

When `authBundle` is enabled, probe refresh before creating a session. A 200
bundle means reuse; 401 allows login; 409/429/5xx are terminal. Parse API-login
and 2FA responses through the same function. Never seed localStorage for an
AuthBundle and never UI-login after any successful but malformed 2xx response.

Create the logout closure only for a fresh API/UI AuthBundle session. Post to
`/api/user/auth/logout` with:

```ts
{
  failOnStatusCode: false,
  headers: {
    Origin: new URL(config.baseUrl).origin,
    Authorization: `Bearer ${token}`,
    "X-Auth-Session": sessionId,
  },
}
```

Do not interpolate the token, SID, or raw body into errors.

Enable `authBundle: true` only in `loginToRealNewApiSite()`.

- [ ] **Step 5: Propagate and order dynamic cleanup**

Extend `AccountDetectionContext` with:

```ts
cleanupDetectableSite?: () => Promise<void>
```

Have compatible account-save wrappers return the login cleanup closure. In
`runAccountAutoDetectScenario`, retain the returned detection context and run:

```ts
await runFinalizers([
  async () => detectionContext?.cleanupDetectableSite?.(),
  async () => env.cleanup?.(),
  async () => sitePage.close(),
])
```

This must execute after account persistence, so subsequent real-site usage
checks prove the saved PAT is independent from the dashboard session.

- [ ] **Step 6: Run focused tests and compile**

Run:

```powershell
pnpm exec vitest tests/utils/realSiteCompatibleApi.test.ts tests/utils/accountScenarios.test.ts --run
pnpm compile
```

Expected: selected tests and compilation PASS.

- [ ] **Step 7: Commit Task 4**

```powershell
git add -- e2e/utils/realSite/compatibleApi.ts e2e/utils/realSite/newApi.ts e2e/utils/realSite/compatibleAccountSaveFlow.ts e2e/utils/realSite/accountSaveFlow.ts e2e/scenarios/accountAutoDetect.ts tests/utils/realSiteCompatibleApi.test.ts tests/utils/accountScenarios.test.ts
git commit -m "test(real-site): support rc22 auth bundles"
```

## Task 5: Add Deterministic Browser-Level rc.22 Coverage

**Files:**

- Modify: `e2e/utils/commonUserFlows.ts`
- Modify: `e2e/accountOnboardingCommonFlows.spec.ts`

- [ ] **Step 1: Extend the mock-site contract for rc.22 mode**

Add an option:

```ts
type StubNewApiSiteRoutesOptions = {
  // existing fields stay unchanged
  dashboardAuthMode?: "legacy" | "auth-bundle"
}
```

In AuthBundle mode:

- `POST /api/user/auth/refresh` returns dashboard Bearer, expiry, user, and SID
- `GET /api/user/self` requires `Authorization: Bearer dashboard-jwt` and omits
  `access_token`
- `GET /api/user/token` requires the dashboard Bearer and returns
  `management-pat`
- other authenticated account endpoints require `management-pat`
- `POST /api/user/auth/logout` marks the dashboard session revoked
- after logout, PAT-authenticated account endpoints still succeed

Keep legacy mode as the default so all existing E2E tests remain unchanged.

- [ ] **Step 2: Add the browser-level rc.22 scenario**

Use a separate reserved origin to avoid conflicting with the legacy route:

```ts
test("adds an rc22 account from AuthBundle and persists only its PAT", async ({
  context,
  extensionId,
  page,
}) => {
  const baseUrl = "https://rc22.example.invalid"
  await stubNewApiSiteRoutes(context, {
    baseUrl,
    dashboardAuthMode: "auth-bundle",
    accessToken: "management-pat",
  })

  const serviceWorker = await getServiceWorker(context)
  const fixture = await runAccountAutoDetectScenario({
    extensionId,
    extensionPage: page,
    baseUrl,
    siteType: SITE_TYPES.NEW_API,
    getServiceWorker: async () => serviceWorker,
    openSitePage: async () => {
      const sitePage = await context.newPage()
      await sitePage.goto(baseUrl)
      expect(await sitePage.evaluate(() => localStorage.getItem("user"))).toBeNull()
      return sitePage
    },
    prepareDetectableSite: async () => undefined,
  })

  const accounts = await readStoredAccounts(serviceWorker)
  const saved = accounts.find((account) => account.id === fixture.accountId)
  expect(saved?.account_info.access_token).toBe("management-pat")
  expect(JSON.stringify(saved)).not.toContain("dashboard-jwt")
})
```

If scenario-owned logout is covered only by the real-site wrapper, add a
deterministic logout callback to `prepareDetectableSite` and assert a subsequent
PAT-authenticated account read succeeds after cleanup.

- [ ] **Step 3: Run legacy and rc.22 Chromium scenarios**

Run the narrow project-supported Playwright invocation for the two named tests:

```powershell
pnpm exec playwright test e2e/accountOnboardingCommonFlows.spec.ts --project=chromium --grep "adds an account through|adds an rc22 account"
```

Expected: both legacy localStorage and rc.22 AuthBundle tests PASS.

- [ ] **Step 4: Commit Task 5**

```powershell
git add -- e2e/utils/commonUserFlows.ts e2e/accountOnboardingCommonFlows.spec.ts
git commit -m "test(new-api): cover rc22 account onboarding"
```

## Task 6: Integration Validation And Final Review

**Files:**

- Review: all files changed since `0e050f96e`

- [ ] **Step 1: Run all focused related Vitest tests**

```powershell
pnpm exec vitest tests/services/accountSiteOnboarding/contentSession/newApiAuthBundle.test.ts tests/services/accountSiteOnboarding/registry.test.ts tests/entrypoints/content/messageHandlers/handlers/storage.test.ts tests/services/accountBrowserSession/sessionReader.test.ts tests/services/autoDetectService.test.ts tests/services/apiAdapters/newApi/accountCompletion.test.ts tests/services/accountOperations.autoDetectAccount.test.ts tests/utils/realSiteCompatibleApi.test.ts tests/utils/accountScenarios.test.ts --run
```

Expected: all selected tests PASS.

- [ ] **Step 2: Run locale extraction consistency**

Even if no locale copy changed, the content/background TypeScript imports can
participate in extraction. Run:

```powershell
pnpm run i18n:extract:ci
```

Expected: PASS with no unexpected locale diff.

- [ ] **Step 3: Run the commit and push-equivalent gates**

Stage only task-scoped files, then run:

```powershell
pnpm run validate:staged
pnpm run validate:push
```

Expected: lint/format, TypeScript compile, and Knip PASS.

- [ ] **Step 4: Re-run deterministic browser coverage**

```powershell
pnpm exec playwright test e2e/accountOnboardingCommonFlows.spec.ts --project=chromium --grep "adds an account through|adds an rc22 account"
```

Expected: legacy and rc.22 tests PASS.

- [ ] **Step 5: Inspect security and maintainability invariants**

Run:

```powershell
rg -n "dashboard-jwt|session-example|transientAuth" src e2e tests
git diff 0e050f96e..HEAD --check
git diff 0e050f96e..HEAD --stat
git status --short
```

Confirm:

- placeholder secrets appear only in tests
- production log calls never receive token, SID, AuthBundle, or transient auth
- `AutoDetectCompletionData`, account drafts, and `SiteAccount` have no
  transient-auth field
- exact New API owns the new protocol branch
- legacy Cookie/PAT branches and other family variants remain intact
- no unrelated files or generated artifacts are present

- [ ] **Step 6: Run the live New API E2E when credentials permit**

Use the repository workflow or the equivalent local secret-backed command.
Before retrying, revoke leaked active sessions from the test account. If the
24-hour issuance limit is active, report it as an external validation blocker;
revoking sessions does not reset that counter.

- [ ] **Step 7: Commit any final validation-only cleanup**

If validation required a task-scoped correction, stage only the files owned by
this plan:

```powershell
git add -- src/services/accountSiteOnboarding/contracts.ts src/services/accountSiteOnboarding/registry.ts src/services/accountSiteOnboarding/contentSession/newApiAuthBundle.ts src/services/accountBrowserSession/types.ts src/services/accountBrowserSession/sessionReader.ts src/services/siteDetection/autoDetectService.ts src/services/accounts/autoDetectCompletion/types.ts src/services/apiAdapters/newApi/accountCompletion.ts src/entrypoints/background/tempWindowPool.ts e2e/utils/realSite/compatibleApi.ts e2e/utils/realSite/newApi.ts e2e/utils/realSite/compatibleAccountSaveFlow.ts e2e/utils/realSite/accountSaveFlow.ts e2e/scenarios/accountAutoDetect.ts e2e/utils/commonUserFlows.ts e2e/accountOnboardingCommonFlows.spec.ts tests/services/accountSiteOnboarding/contentSession/newApiAuthBundle.test.ts tests/services/accountSiteOnboarding/registry.test.ts tests/entrypoints/content/messageHandlers/handlers/storage.test.ts tests/services/accountBrowserSession/sessionReader.test.ts tests/services/autoDetectService.test.ts tests/services/apiAdapters/newApi/accountCompletion.test.ts tests/services/accountOperations.autoDetectAccount.test.ts tests/utils/realSiteCompatibleApi.test.ts tests/utils/accountScenarios.test.ts
git commit -m "fix(new-api): finalize rc22 compatibility"
```

If no correction is needed, do not create an empty commit.

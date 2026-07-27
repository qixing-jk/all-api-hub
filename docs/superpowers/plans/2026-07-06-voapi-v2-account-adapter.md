# VoAPI v2 Account Adapter Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add deployment-neutral VoAPI v2 account-site support for balance refresh, API key management, and check-in without changing the existing old `VoAPI` New API-family adapter.

**Architecture:** Add one narrow shared transport option for raw access-token authorization, then route `voapi-v2` through dedicated account-site definition, detection, content-session, backend service, adapter capabilities, and check-in provider modules. Detection prefers safe backend API signatures over rendered-page/title/temp-window signals so self-hosted deployments are recognized without depending on `demo.voapi.top`. VoAPI v2 is treated as single-dashboard-JWT auth: no refresh-token storage, refresh locks, or automatic renewal are added because logged-in verification found no stable refresh-token field, cookie, or renewal endpoint.

**Tech Stack:** TypeScript, WXT extension services, Vitest/MSW for unit and service tests, existing `apiTransport`, `accountSiteDefinitions`, `apiAdapters`, and `autoCheckin` registries.

---

## Source Spec

- `docs/superpowers/specs/2026-07-06-voapi-v2-account-adapter-design.md`

## File Structure

### Existing files to modify

- `src/services/apiTransport/type.ts`: add `ApiAuthTokenMode` constants/types and `FetchApiOptions.authTokenMode`.
- `src/services/apiTransport/request.ts`: apply raw-vs-Bearer authorization formatting in `createRequestHeaders(...)` and pass the option from `_fetchApi(...)`.
- `tests/services/apiTransport/request.test.ts`: cover default Bearer behavior, raw mode, header override, and cookie-auth preservation.
- `src/services/accountSiteDefinitions/identifiers.ts`: add `SITE_TYPES.VO_API_V2 = "voapi-v2"`.
- `src/services/accountSiteDefinitions/contracts.ts`: add `ACCOUNT_SITE_ADAPTER_FAMILIES.VoApiV2`.
- `src/services/accountSiteDefinitions/definitions.ts`: add `voapi-v2` definition and order it before old `SITE_TYPES.VO_API`.
- `tests/constants/siteType.test.ts`: assert the new site type value is exported and old `VoAPI` remains.
- `tests/services/accountSiteDefinitions/registry.test.ts`: assert definition ordering, scope, adapter family, routes, and auth policy.
- `tests/services/accounts/accountSiteProfile.test.ts`: assert product profile defaults.
- `tests/services/modelList/accountSources/readiness.definitions.test.ts`: assert model-list readiness is intentionally unsupported for first version account pricing.
- `src/services/accountSiteOnboarding/registry.ts`: register the VoAPI v2 content-session extractor before `compatible-user`.
- `tests/services/accountSiteOnboarding/registry.test.ts`: assert extractor priority.
- `src/services/siteDetection/detectSiteType.ts`: add VoAPI v2 protected-endpoint probe and run backend probes before title/temp-window matching.
- `tests/services/detectSiteType.test.ts`: cover custom-domain VoAPI v2 signature, no title fetch on strong backend signature, old VoAPI compatibility, and fallback.
- `tests/services/detectSiteType.fallback.test.ts`: assert existing Sub2API fallback coverage still passes after endpoint probes run before title matching.
- `src/services/apiAdapters/contracts/siteTypeCapabilities.ts`: extend `SiteBackendFamily` with `voapiV2`.
- `src/services/apiAdapters/registry.ts`: route `SITE_TYPES.VO_API_V2` to dedicated capabilities before New API-family fallback.
- `tests/services/apiAdapters/registry.test.ts`: assert `voapi-v2` capabilities are dedicated and old `VoAPI` still uses New API-family capabilities.
- `src/services/checkin/autoCheckin/providers/index.ts`: register the VoAPI v2 provider.
- `tests/services/autoCheckin/providers/voapiV2.test.ts`: cover provider eligibility, success, already checked, and auth-expired failures.

### New files to create

- `src/services/accountSiteOnboarding/contentSession/voapiV2.ts`: read `localStorage.userStore.auth.token`, decode safe identity fields, and return `siteTypeHint: SITE_TYPES.VO_API_V2`.
- `tests/services/accountSiteOnboarding/contentSession/voapiV2.test.ts`: cover JWT extraction, identity fallback, missing token, malformed storage, null `localStorage.user.access_token`, and absence of refresh-token persistence.
- `src/services/apiService/voapiV2/type.ts`: VoAPI v2 endpoint constants and response DTOs.
- `src/services/apiService/voapiV2/parsing.ts`: envelope parser, auth-expired classifier, amount/quota conversion, key/status normalization helpers.
- `src/services/apiService/voapiV2/index.ts`: account-info, dashboard statistics, key list/template/CRUD/reveal, and check-in API functions.
- `tests/services/apiService/voapiV2/parsing.test.ts`: parser and conversion coverage.
- `tests/services/apiService/voapiV2/index.test.ts`: service request/response mapping coverage.
- `src/services/apiAdapters/voapiV2/index.ts`: exported `voApiV2Capabilities`.
- `src/services/apiAdapters/voapiV2/accountBootstrap.ts`: account-site bootstrap functions for site status, user info, default exchange rate, and check-in support.
- `src/services/apiAdapters/voapiV2/accountCompletion.ts`: complete detected page-session accounts with raw JWT access-token auth.
- `src/services/apiAdapters/voapiV2/accountData.ts`: expose `fetchData` by delegating to `fetchVoApiV2AccountData`.
- `src/services/apiAdapters/voapiV2/accountRefresh.ts`: expose `refreshAccount` and `fetchCheckInSupport` by delegating to the VoAPI v2 service.
- `src/services/apiAdapters/voapiV2/keyManagement.ts`: expose key inventory, create, update, reveal, delete, groups, and model choices.
- `src/services/apiAdapters/voapiV2/tokenProvisioning.ts`: default-token provisioning policy for create-with-inventory-refetch and reveal-after-create.
- `tests/services/apiAdapters/voapiV2/accountCompletion.test.ts`: account completion coverage.
- `tests/services/apiAdapters/voapiV2/accountCompletion.test.ts`: account completion coverage.
- `tests/services/apiAdapters/registry.test.ts`: capability registration and mapping coverage.
- `tests/services/apiService/voapiV2/index.test.ts`: account refresh, key management, token provisioning, and expired JWT recovery coverage.
- `tests/services/apiService/voapiV2/tokenResync.test.ts`: browser-session dashboard JWT re-read coverage.
- `tests/services/apiAdapters/voapiV2/testUtils.ts`: shared VoAPI v2 adapter test request fixture.
- `src/services/checkin/autoCheckin/providers/voapiV2.ts`: API-based check-in provider.

## Refresh-Token Contract Decision

Logged-in verification against the demo deployment found no stable refresh-token contract:

- `localStorage.userStore.auth` contains `email`, `phone`, `registerTime`, `role`, and `token` only.
- The dashboard JWT payload contains `exp`, `iat`, `nbf`, `role`, `sign`, and `userId` only.
- `localStorage`, `sessionStorage`, and cookies do not contain `refreshToken`, `refresh_token`, or a refresh-like credential.
- The logged-in `/profile/api-key` page load performs reads such as `/api/user/info` and `/api/user_api_key`, but no refresh or token-renewal request.
- The frontend bundle sends `userStore.auth.token` as the raw `Authorization` value and clears auth plus routes to `/auth` on `code === 2` instead of retrying a refresh endpoint.

Implementation consequence: VoAPI v2 must not add Sub2API-style refresh-token storage, refresh locks, proactive refresh, or refresh-token renewal. Expired dashboard JWTs are reported as a recoverable re-login/re-detection health state, with one best-effort re-read of the currently logged-in page-session JWT when browser-session state is available.

## Implementation Tasks

### Task 1: Add request-scoped raw token support to `fetchApi`

**Files:**
- Modify: `src/services/apiTransport/type.ts`
- Modify: `src/services/apiTransport/request.ts`
- Test: `tests/services/apiTransport/request.test.ts`

- [ ] **Step 1: Add failing transport tests**

In `tests/services/apiTransport/request.test.ts`, extend the existing import from `~/services/apiTransport/type`:

```ts
import {
  API_AUTH_TOKEN_MODES,
  API_TRANSPORT_FETCH_CONTEXT_KINDS,
} from "~/services/apiTransport/type"
```

Add these tests next to `fetchApiData merges custom headers without dropping auth headers`:

```ts
it("uses Bearer authorization for access tokens by default", async () => {
  let capturedAuthorization: string | null = null

  server.use(
    http.get(API_URL, ({ request }) => {
      capturedAuthorization = request.headers.get("authorization")
      return HttpResponse.json({
        success: true,
        data: { ok: true },
        message: "ok",
      })
    }),
  )

  await fetchApi(
    {
      baseUrl: BASE_URL,
      auth: {
        authType: AuthTypeEnum.AccessToken,
        accessToken: "jwt-default",
      },
    },
    { endpoint: ENDPOINT },
    true,
  )

  expect(capturedAuthorization).toBe("Bearer jwt-default")
})

it("uses raw authorization when authTokenMode is raw", async () => {
  let capturedAuthorization: string | null = null

  server.use(
    http.get(API_URL, ({ request }) => {
      capturedAuthorization = request.headers.get("authorization")
      return HttpResponse.json({
        success: true,
        data: { ok: true },
        message: "ok",
      })
    }),
  )

  await fetchApi(
    {
      baseUrl: BASE_URL,
      auth: {
        authType: AuthTypeEnum.AccessToken,
        accessToken: "jwt-raw",
      },
    },
    {
      endpoint: "/api/user/info",
      authTokenMode: API_AUTH_TOKEN_MODES.Raw,
    },
    true,
  )

  expect(capturedAuthorization).toBe("jwt-raw")
})

it("keeps caller-provided Authorization header override in raw-token mode", async () => {
  let capturedAuthorization: string | null = null

  server.use(
    http.get(API_URL, ({ request }) => {
      capturedAuthorization = request.headers.get("authorization")
      return HttpResponse.json({
        success: true,
        data: { ok: true },
        message: "ok",
      })
    }),
  )

  await fetchApi(
    {
      baseUrl: BASE_URL,
      auth: {
        authType: AuthTypeEnum.AccessToken,
        accessToken: "jwt-from-account",
      },
    },
    {
      endpoint: "/api/user/info",
      authTokenMode: API_AUTH_TOKEN_MODES.Raw,
      options: {
        headers: {
          Authorization: "manual-header",
        },
      },
    },
    true,
  )

  expect(capturedAuthorization).toBe("manual-header")
})
```

- [ ] **Step 2: Run the failing transport tests**

Run:

```powershell
pnpm vitest run tests/services/apiTransport/request.test.ts
```

Expected: the raw-token test fails because `FetchApiOptions` has no `authTokenMode` and `createRequestHeaders(...)` always emits `Bearer <token>`.

- [ ] **Step 3: Add the transport type**

In `src/services/apiTransport/type.ts`, add this above `FetchApiOptions`:

```ts
export const API_AUTH_TOKEN_MODES = {
  Bearer: "bearer",
  Raw: "raw",
} as const

export type ApiAuthTokenMode =
  (typeof API_AUTH_TOKEN_MODES)[keyof typeof API_AUTH_TOKEN_MODES]
```

Then extend `FetchApiOptions`:

```ts
export interface FetchApiOptions {
  endpoint: string
  options?: RequestInit
  responseType?: TempWindowResponseType
  tempWindowFallback?: TempWindowFallbackAllowlist
  currentTabTransport?: "prefer" | "disabled"
  authTokenMode?: ApiAuthTokenMode
}
```

- [ ] **Step 4: Apply token mode in request headers**

In `src/services/apiTransport/request.ts`, import the new type:

```ts
import type {
  ApiAuthTokenMode,
  ApiResponse,
  ApiTransportFetchContext,
  ApiTransportRequest,
  AuthConfig,
  FetchApiOptions,
} from "~/services/apiTransport/type"
```

Change `createRequestHeaders(...)` to accept a mode:

```ts
const createRequestHeaders = async (
  auth: NormalizedAuthContext,
  authTokenMode: ApiAuthTokenMode = "bearer",
): Promise<Record<string, string>> => {
  const baseHeaders = {
    "Content-Type": REQUEST_CONFIG.HEADERS.CONTENT_TYPE,
    Pragma: REQUEST_CONFIG.HEADERS.PRAGMA,
  }

  const userHeaders = buildCompatUserIdHeaders(auth.userId)

  let headers: Record<string, string> = { ...baseHeaders, ...userHeaders }

  headers = addExtensionHeader(headers)

  if (auth.authType === AuthTypeEnum.Cookie) {
    headers = await addAuthMethodHeader(headers, AUTH_MODE.COOKIE_AUTH_MODE)
  } else if (auth.authType === AuthTypeEnum.AccessToken) {
    headers = await addAuthMethodHeader(headers, AUTH_MODE.TOKEN_AUTH_MODE)
  }

  if (auth.accessToken) {
    headers["Authorization"] =
      authTokenMode === "raw"
        ? auth.accessToken
        : `Bearer ${auth.accessToken}`
  }

  if (auth.authType === AuthTypeEnum.Cookie && auth.cookie) {
    headers["Cookie"] = auth.cookie

    const hasCookieInterceptorHeader =
      COOKIE_AUTH_HEADER_NAME in headers &&
      headers[COOKIE_AUTH_HEADER_NAME] === AUTH_MODE.COOKIE_AUTH_MODE
    if (hasCookieInterceptorHeader) {
      headers[COOKIE_SESSION_OVERRIDE_HEADER_NAME] = auth.cookie
    }
  }

  return headers
}
```

Change `createAuthRequest(...)` to accept and forward the mode:

```ts
const createAuthRequest = async (
  auth: NormalizedAuthContext,
  options: RequestInit = {},
  authTokenMode: ApiAuthTokenMode = "bearer",
): Promise<RequestInit> => {
  const credentials: RequestCredentials =
    auth.authType === AuthTypeEnum.Cookie ? "include" : "omit"

  const normalizedOptions: RequestInit = {
    ...options,
    headers: normalizeHeaderInit(options.headers),
  }

  return createBaseRequest(
    await createRequestHeaders(auth, authTokenMode),
    credentials,
    normalizedOptions,
  )
}
```

In `_fetchApi(...)`, pass the request option:

```ts
const fetchOptions = await createAuthRequest(
  resolvedAuth,
  {
    ...options.options,
    signal: options.options?.signal ?? request.abortSignal,
  },
  options.authTokenMode,
)
```

- [ ] **Step 5: Run transport tests**

Run:

```powershell
pnpm vitest run tests/services/apiTransport/request.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit transport change**

Run:

```powershell
git add src/services/apiTransport/type.ts src/services/apiTransport/request.ts tests/services/apiTransport/request.test.ts
git commit -m "feat(api-transport): support raw access token auth"
```

### Task 2: Add `voapi-v2` definition, detection, and content-session extraction

**Files:**
- Modify: `src/services/accountSiteDefinitions/identifiers.ts`
- Modify: `src/services/accountSiteDefinitions/contracts.ts`
- Modify: `src/services/accountSiteDefinitions/definitions.ts`
- Create: `src/services/accountSiteOnboarding/contentSession/voapiV2.ts`
- Modify: `src/services/accountSiteOnboarding/registry.ts`
- Modify: `src/services/siteDetection/detectSiteType.ts`
- Test: `tests/constants/siteType.test.ts`
- Test: `tests/services/accountSiteDefinitions/registry.test.ts`
- Test: `tests/services/accounts/accountSiteProfile.test.ts`
- Test: `tests/services/modelList/accountSources/readiness.definitions.test.ts`
- Test: `tests/services/accountSiteOnboarding/contentSession/voapiV2.test.ts`
- Test: `tests/services/accountSiteOnboarding/registry.test.ts`
- Test: `tests/services/detectSiteType.test.ts`
- Test: `tests/services/detectSiteType.fallback.test.ts`

- [ ] **Step 1: Write failing site-definition tests**

Add assertions that prove the new type is distinct from old `VoAPI`:

```ts
expect(SITE_TYPES.VO_API_V2).toBe("voapi-v2")
expect(SITE_TYPES.VO_API).toBe("VoAPI")
expect(SITE_TYPES.VO_API_V2).not.toBe(SITE_TYPES.VO_API)
```

In registry tests, assert:

```ts
const voApiV2 = getAccountSiteDefinition(SITE_TYPES.VO_API_V2)
expect(voApiV2).toMatchObject({
  siteType: SITE_TYPES.VO_API_V2,
  adapterFamily: ACCOUNT_SITE_ADAPTER_FAMILIES.VoApiV2,
})
expect(voApiV2?.scopes).toEqual([ACCOUNT_SITE_DEFINITION_SCOPES.Account])
expect(voApiV2?.onboarding?.routes).toMatchObject({
  usagePath: "/dash?_userMenuKey=dash",
  checkInPath: "/checkIn?_userMenuKey=checkIn",
  adminCredentialsPath: "/keys?_userMenuKey=keys",
})

expect(ACCOUNT_SITE_TYPE_ORDER.indexOf(SITE_TYPES.VO_API_V2)).toBeLessThan(
  ACCOUNT_SITE_TYPE_ORDER.indexOf(SITE_TYPES.VO_API),
)
```

In model-list readiness tests, assert first-version pricing/catalog readiness is unsupported:

```ts
expect(getAccountSiteDefinition(SITE_TYPES.VO_API_V2)?.readiness).toEqual({
  modelList: {
    expectedRoute: ACCOUNT_SITE_MODEL_LIST_EXPECTED_ROUTES.Unsupported,
  },
})
```

- [ ] **Step 2: Write failing content-session extractor tests**

Create `tests/services/accountSiteOnboarding/contentSession/voapiV2.test.ts`:

```ts
import { SITE_TYPES } from "~/constants/siteType"
import { voApiV2ContentSessionExtractor } from "~/services/accountSiteOnboarding/contentSession/voapiV2"

const jwtWithUserId =
  "eyJhbGciOiJub25lIn0.eyJ1c2VySWQiOjQyLCJleHAiOjQxMDI0NDQ4MDB9.signature"

describe("voApiV2ContentSessionExtractor", () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it("extracts the dashboard JWT from userStore.auth.token", async () => {
    localStorage.setItem(
      "userStore",
      JSON.stringify({
        auth: {
          token: jwtWithUserId,
          email: "owner@example.invalid",
        },
      }),
    )
    localStorage.setItem(
      "user",
      JSON.stringify({
        id: 7,
        username: "owner",
        display_name: "Owner",
        email: "owner@example.invalid",
        access_token: null,
      }),
    )

    await expect(
      voApiV2ContentSessionExtractor.extract({ url: "https://example.invalid" }),
    ).resolves.toEqual({
      userId: 7,
      user: {
        id: 7,
        username: "owner",
        display_name: "Owner",
        email: "owner@example.invalid",
      },
      accessToken: jwtWithUserId,
      siteTypeHint: SITE_TYPES.VO_API_V2,
    })
  })

  it("falls back to JWT userId when localStorage.user has no id", async () => {
    localStorage.setItem("userStore", JSON.stringify({ auth: { token: jwtWithUserId } }))
    localStorage.setItem("user", JSON.stringify({ access_token: null }))

    const result = await voApiV2ContentSessionExtractor.extract({})

    expect(result?.userId).toBe(42)
    expect(result?.accessToken).toBe(jwtWithUserId)
  })

  it("does not use localStorage.user.access_token", async () => {
    localStorage.setItem(
      "userStore",
      JSON.stringify({ auth: { token: jwtWithUserId } }),
    )
    localStorage.setItem(
      "user",
      JSON.stringify({ id: 7, access_token: "wrong-token" }),
    )

    const result = await voApiV2ContentSessionExtractor.extract({})

    expect(result?.accessToken).toBe(jwtWithUserId)
    expect(result?.accessToken).not.toBe("wrong-token")
  })

  it("does not project refresh-token-shaped fields into the session result", async () => {
    localStorage.setItem(
      "userStore",
      JSON.stringify({
        auth: {
          token: jwtWithUserId,
          refreshToken: "unsupported-refresh",
          refresh_token: "unsupported-refresh-snake",
        },
      }),
    )

    const result = await voApiV2ContentSessionExtractor.extract({})

    expect(result).toEqual(
      expect.not.objectContaining({
        refreshToken: expect.anything(),
        sub2apiAuth: expect.anything(),
      }),
    )
  })

  it("returns null when userStore is absent or malformed", async () => {
    await expect(voApiV2ContentSessionExtractor.extract({})).resolves.toBeNull()

    localStorage.setItem("userStore", "{")
    await expect(voApiV2ContentSessionExtractor.extract({})).resolves.toBeNull()
  })
})
```

- [ ] **Step 3: Write failing detection tests**

In `tests/services/detectSiteType.test.ts`, add a protected-endpoint test with a custom origin and no title dependency:

```ts
it("detects VoAPI v2 from a protected endpoint signature on custom origins", async () => {
  const titleSpy = vi
    .spyOn(detectSiteTypeModule, "fetchSiteOriginalTitle")
    .mockResolvedValue("Custom Portal")

  server.use(
    http.get("https://example.invalid/api/user/info", () =>
      HttpResponse.json(
        { code: 2, data: null, msg: "Unauthorized", rid: "request-id" },
        { status: 403 },
      ),
    ),
  )

  await expect(getAccountSiteType("https://example.invalid")).resolves.toBe(
    SITE_TYPES.VO_API_V2,
  )
  expect(titleSpy).not.toHaveBeenCalled()
})

it("keeps old VoAPI title-only detection on the old site type", async () => {
  vi.spyOn(detectSiteTypeModule, "fetchSiteOriginalTitle").mockResolvedValue(
    "VoAPI",
  )
  server.use(
    http.get("https://old.example.invalid/api/user/info", () =>
      HttpResponse.text("not voapi v2", {
        status: 404,
        headers: { "Content-Type": "text/plain" },
      }),
    ),
  )

  await expect(getAccountSiteType("https://old.example.invalid")).resolves.toBe(
    SITE_TYPES.VO_API,
  )
})
```

Add a fallback test for an unavailable VoAPI v2 probe:

```ts
it("falls back when the VoAPI v2 probe is inconclusive", async () => {
  vi.spyOn(detectSiteTypeModule, "fetchSiteOriginalTitle").mockResolvedValue(
    "New API",
  )
  server.use(
    http.get("https://fallback.example.invalid/api/user/info", () =>
      HttpResponse.json({ ok: false }, { status: 404 }),
    ),
  )

  await expect(
    getAccountSiteType("https://fallback.example.invalid"),
  ).resolves.toBe(SITE_TYPES.NEW_API)
})
```

- [ ] **Step 4: Run the failing definition, session, and detection tests**

Run:

```powershell
pnpm vitest run tests/constants/siteType.test.ts tests/services/accountSiteDefinitions/registry.test.ts tests/services/accounts/accountSiteProfile.test.ts tests/services/modelList/accountSources/readiness.definitions.test.ts tests/services/accountSiteOnboarding/contentSession/voapiV2.test.ts tests/services/accountSiteOnboarding/registry.test.ts tests/services/detectSiteType.test.ts tests/services/detectSiteType.fallback.test.ts
```

Expected: FAIL because `voapi-v2`, its adapter family, content-session extractor, and detection probe do not exist yet.

- [ ] **Step 5: Add the site type and adapter family**

In `src/services/accountSiteDefinitions/identifiers.ts`, add:

```ts
VO_API_V2: "voapi-v2",
```

Place it near `VO_API` so the old/new relationship is visible.

In `src/services/accountSiteDefinitions/contracts.ts`, add:

```ts
VoApiV2: "voapiV2",
```

to `ACCOUNT_SITE_ADAPTER_FAMILIES`.

- [ ] **Step 6: Add the account-site definition**

In `src/services/accountSiteDefinitions/definitions.ts`, add `SITE_TYPES.VO_API_V2` before `SITE_TYPES.VO_API` in `ACCOUNT_SITE_TYPE_ORDER`:

```ts
SITE_TYPES.V_API,
SITE_TYPES.VO_API_V2,
SITE_TYPES.VO_API,
SITE_TYPES.SUPER_API,
```

Add this definition before the old `VO_API` compatible definition:

```ts
const voApiV2Readiness = {
  modelList: {
    expectedRoute: ACCOUNT_SITE_MODEL_LIST_EXPECTED_ROUTES.Unsupported,
  },
} as const
```

```ts
{
  siteType: SITE_TYPES.VO_API_V2,
  scopes: ACCOUNT_SCOPE,
  adapterFamily: ACCOUNT_SITE_ADAPTER_FAMILIES.VoApiV2,
  onboarding: {
    detection: {
      titlePatterns: [/^VoAPI公益站$/i],
    },
    routes: {
      usagePath: "/dash?_userMenuKey=dash",
      checkInPath: "/checkIn?_userMenuKey=checkIn",
      adminCredentialsPath: "/keys?_userMenuKey=keys",
    },
  },
  productProfile: {
    auth: {
      allowedAuthTypes: [ACCOUNT_SITE_AUTH_TYPES.AccessToken],
      defaultAuthType: ACCOUNT_SITE_AUTH_TYPES.AccessToken,
      defaultAuthHostnames: [],
      supportsCookieAuth: false,
      supportsBuiltInCheckInDetection: true,
    },
    identity: {
      usernameRequired: false,
      storedUserIdentityFields: ["id", "username"],
    },
    modelList: {
      directPricing: ACCOUNT_SITE_MODEL_LIST_DIRECT_PRICING.Unsupported,
      tokenScopedCatalogFallback:
        ACCOUNT_SITE_MODEL_LIST_TOKEN_SCOPED_CATALOG_FALLBACKS.None,
      dashboardEstimateLoader:
        ACCOUNT_SITE_MODEL_LIST_DASHBOARD_ESTIMATE_LOADERS.None,
      statusScope: ACCOUNT_SITE_MODEL_LIST_STATUS_SCOPES.Account,
      displayCapabilitiesSource:
        ACCOUNT_SITE_MODEL_LIST_DISPLAY_CAPABILITY_SOURCES.Profile,
    },
  },
  readiness: voApiV2Readiness,
},
```

This definition records a precise title fallback, but the detection contract remains backend-signature first.

- [ ] **Step 7: Add the content-session extractor**

Create `src/services/accountSiteOnboarding/contentSession/voapiV2.ts`:

```ts
import { SITE_TYPES } from "~/constants/siteType"

import type { ContentSessionExtractor } from "../contracts"

const VOAPI_V2_STORAGE_KEYS = {
  userStore: "userStore",
  user: "user",
} as const

const parseJsonObject = (value: string | null): Record<string, unknown> | null => {
  if (!value) return null
  try {
    const parsed = JSON.parse(value) as unknown
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : null
  } catch {
    return null
  }
}

const trimString = (value: unknown): string | undefined =>
  typeof value === "string" && value.trim() ? value.trim() : undefined

const readObject = (value: unknown): Record<string, unknown> | null =>
  value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null

const decodeJwtPayload = (token: string): Record<string, unknown> | null => {
  const [, payload] = token.split(".")
  if (!payload) return null
  try {
    const padded = payload.padEnd(payload.length + ((4 - (payload.length % 4)) % 4), "=")
    const normalized = padded.replace(/-/g, "+").replace(/_/g, "/")
    return readObject(JSON.parse(atob(normalized)) as unknown)
  } catch {
    return null
  }
}

const readUserId = (
  user: Record<string, unknown> | null,
  jwtPayload: Record<string, unknown> | null,
): string | number | undefined => {
  const localId = user?.id
  if (typeof localId === "string" || typeof localId === "number") return localId

  const jwtUserId = jwtPayload?.userId
  if (typeof jwtUserId === "string" || typeof jwtUserId === "number") {
    return jwtUserId
  }

  return undefined
}

export const voApiV2ContentSessionExtractor: ContentSessionExtractor = {
  id: "voapi-v2",
  canExtract: () => {
    const userStore = parseJsonObject(localStorage.getItem(VOAPI_V2_STORAGE_KEYS.userStore))
    const auth = readObject(userStore?.auth)
    return Boolean(trimString(auth?.token))
  },
  async extract() {
    const userStore = parseJsonObject(localStorage.getItem(VOAPI_V2_STORAGE_KEYS.userStore))
    const auth = readObject(userStore?.auth)
    const token = trimString(auth?.token)
    if (!token) return null

    const user = parseJsonObject(localStorage.getItem(VOAPI_V2_STORAGE_KEYS.user))
    const jwtPayload = decodeJwtPayload(token)
    const userId = readUserId(user, jwtPayload)
    if (userId === undefined) return null

    return {
      userId,
      user: {
        id: userId,
        ...(trimString(user?.username) ? { username: trimString(user?.username) } : {}),
        ...(trimString(user?.display_name)
          ? { display_name: trimString(user?.display_name) }
          : {}),
        ...(trimString(user?.email) || trimString(auth?.email)
          ? { email: trimString(user?.email) ?? trimString(auth?.email) }
          : {}),
      },
      accessToken: token,
      siteTypeHint: SITE_TYPES.VO_API_V2,
    }
  },
}
```

Use line wrapping that satisfies the repository formatter; keep all token handling log-free.

- [ ] **Step 8: Register the extractor before generic compatible user**

In `src/services/accountSiteOnboarding/registry.ts`, import:

```ts
import { voApiV2ContentSessionExtractor } from "./contentSession/voapiV2"
```

Return it before `compatibleUserContentSessionExtractor`:

```ts
return [
  sub2ApiContentSessionExtractor,
  sharedChatContentSessionExtractor,
  voApiV2ContentSessionExtractor,
  compatibleUserContentSessionExtractor,
]
```

- [ ] **Step 9: Add backend-signature detection**

In `src/services/siteDetection/detectSiteType.ts`, add a contract comment and helper near `detectSub2ApiFromAuthEndpoint(...)`:

```ts
const VOAPI_V2_USER_INFO_ENDPOINT = "/api/user/info"

const readVoApiV2Message = (body: Record<string, unknown>): string => {
  const message = body.msg ?? body.message
  return typeof message === "string" ? message.trim() : ""
}

/**
 * VoAPI v2 protected endpoints return a `{ code, data, msg }` envelope.
 * Source: https://github.com/VoAPI/VoAPI and verified against demo.voapi.top:
 * unauthenticated `/api/user/info` returns a numeric code with an auth message.
 */
async function detectVoApiV2FromProtectedEndpoint(
  url: string,
): Promise<AccountSiteType> {
  try {
    const response = await fetch(new URL(VOAPI_V2_USER_INFO_ENDPOINT, url), {
      method: "GET",
      cache: "no-store",
      credentials: "omit",
      headers: {
        Accept: "application/json",
      },
    })

    const contentType = response.headers.get("content-type") || ""
    if (!/\bjson\b/i.test(contentType)) return SITE_TYPES.UNKNOWN

    const responseBody = (await response.json()) as unknown
    if (!isJsonObject(responseBody)) return SITE_TYPES.UNKNOWN

    const code = responseBody.code
    if (typeof code !== "number") return SITE_TYPES.UNKNOWN

    if (code === 0 && isJsonObject(responseBody.data)) {
      const data = responseBody.data
      if (
        "basicBalance" in data ||
        "bindBalance" in data ||
        "totalRequest" in data
      ) {
        return SITE_TYPES.VO_API_V2
      }
    }

    const message = readVoApiV2Message(responseBody)
    if (
      responseBody.data === null &&
      /unauthorized|auth\s*expire|token/i.test(message)
    ) {
      return SITE_TYPES.VO_API_V2
    }
  } catch (error) {
    logger.debug("VoAPI v2 protected endpoint probe failed", { url, error })
  }

  return SITE_TYPES.UNKNOWN
}
```

Change `getAccountSiteType(...)` order:

```ts
const voApiV2SiteType = await detectVoApiV2FromProtectedEndpoint(url)
if (voApiV2SiteType !== SITE_TYPES.UNKNOWN) {
  return voApiV2SiteType
}

const sub2ApiSiteType = await detectSub2ApiFromAuthEndpoint(url)
if (sub2ApiSiteType !== SITE_TYPES.UNKNOWN) {
  return sub2ApiSiteType
}

const title = await fetchSiteOriginalTitle(url)
```

Keep domain rules first. Keep old New API-family auth-error fallback last.

- [ ] **Step 10: Run definition, session, and detection tests**

Run:

```powershell
pnpm vitest run tests/constants/siteType.test.ts tests/services/accountSiteDefinitions/registry.test.ts tests/services/accounts/accountSiteProfile.test.ts tests/services/modelList/accountSources/readiness.definitions.test.ts tests/services/accountSiteOnboarding/contentSession/voapiV2.test.ts tests/services/accountSiteOnboarding/registry.test.ts tests/services/detectSiteType.test.ts tests/services/detectSiteType.fallback.test.ts
```

Expected: PASS.

- [ ] **Step 11: Commit detection and onboarding change**

Run:

```powershell
git add src/services/accountSiteDefinitions/identifiers.ts src/services/accountSiteDefinitions/contracts.ts src/services/accountSiteDefinitions/definitions.ts src/services/accountSiteOnboarding/contentSession/voapiV2.ts src/services/accountSiteOnboarding/registry.ts src/services/siteDetection/detectSiteType.ts tests/constants/siteType.test.ts tests/services/accountSiteDefinitions/registry.test.ts tests/services/accounts/accountSiteProfile.test.ts tests/services/modelList/accountSources/readiness.definitions.test.ts tests/services/accountSiteOnboarding/contentSession/voapiV2.test.ts tests/services/accountSiteOnboarding/registry.test.ts tests/services/detectSiteType.test.ts tests/services/detectSiteType.fallback.test.ts
git commit -m "feat(voapi-v2): detect account site sessions"
```

### Task 3: Add VoAPI v2 backend service

**Files:**
- Create: `src/services/apiService/voapiV2/type.ts`
- Create: `src/services/apiService/voapiV2/parsing.ts`
- Create: `src/services/apiService/voapiV2/index.ts`
- Test: `tests/services/apiService/voapiV2/parsing.test.ts`
- Test: `tests/services/apiService/voapiV2/index.test.ts`

- [ ] **Step 1: Write failing parser tests**

Create `tests/services/apiService/voapiV2/parsing.test.ts` with coverage for success, top-level token, non-zero code, auth-expired classification, and amount conversion:

```ts
import { UI_CONSTANTS } from "~/constants/ui"
import { ApiError } from "~/services/apiTransport/errors"
import {
  amountToQuota,
  isVoApiV2AuthExpiredError,
  parseVoApiV2Envelope,
  quotaToAmountString,
} from "~/services/apiService/voapiV2/parsing"

describe("VoAPI v2 parsing", () => {
  it("unwraps code zero data envelopes", () => {
    expect(
      parseVoApiV2Envelope({ code: 0, data: { id: 1 } }, "/api/user/info"),
    ).toEqual({ id: 1 })
  })

  it("unwraps top-level token reveal envelopes", () => {
    expect(
      parseVoApiV2Envelope(
        { code: 0, token: "sk-secret" },
        "/api/keys/1/token",
        { allowTopLevelToken: true },
      ),
    ).toBe("sk-secret")
  })

  it("throws ApiError for business errors", () => {
    expect(() =>
      parseVoApiV2Envelope({ code: 1, data: null, msg: "Signed in today" }, "/api/check_in"),
    ).toThrow(ApiError)
  })

  it("classifies auth-expired business errors", () => {
    try {
      parseVoApiV2Envelope({ code: 2, data: null, msg: "Auth expire" }, "/api/user/info")
    } catch (error) {
      expect(isVoApiV2AuthExpiredError(error)).toBe(true)
    }
  })

  it("converts decimal amounts to internal quota points", () => {
    expect(amountToQuota("1.25")).toBe(
      Math.round(1.25 * UI_CONSTANTS.EXCHANGE_RATE.CONVERSION_FACTOR),
    )
    expect(amountToQuota("invalid")).toBe(0)
    expect(quotaToAmountString(UI_CONSTANTS.EXCHANGE_RATE.CONVERSION_FACTOR)).toBe("1")
  })
})
```

- [ ] **Step 2: Write failing service tests**

Create `tests/services/apiService/voapiV2/index.test.ts` using MSW handlers. Add this helper at the top of the file:

```ts
const createVoApiV2Request = (): ApiServiceAccountRequest => ({
  baseUrl: "https://example.invalid",
  accountId: "account-1",
  auth: {
    authType: AuthTypeEnum.AccessToken,
    accessToken: "jwt-dashboard",
    userId: 7,
  },
  checkIn: {
    enableDetection: true,
  },
})
```

Then add these tests:

```ts
it("fetches account data with raw authorization and today statistics", async () => {
  server.use(
    http.get("https://example.invalid/api/user/info", ({ request }) => {
      expect(request.headers.get("authorization")).toBe("jwt-dashboard")
      return HttpResponse.json({
        code: 0,
        data: {
          id: 7,
          username: "owner",
          basicBalance: "2",
          bindBalance: "3",
          totalRequest: 123,
          totalToken: 456,
          currency: "USD",
        },
      })
    }),
    http.get("https://example.invalid/api/dash/statistics", () =>
      HttpResponse.json({
        code: 0,
        data: {
          d: {
            requests: 9,
            usedBasicBalance: "0.5",
            usedBindBalance: "0.25",
            errors: 0,
            maxRpm: 1,
          },
        },
      }),
    ),
  )

  const data = await fetchVoApiV2AccountData({
    baseUrl: "https://example.invalid",
    auth: {
      authType: AuthTypeEnum.AccessToken,
      accessToken: "jwt-dashboard",
      userId: 7,
    },
  })

  expect(data.quota).toBe(2500000)
  expect(data.today_quota_consumption).toBe(375000)
  expect(data.today_requests_count).toBe(9)
})

it("reveals token secrets from the VoAPI v2 reveal endpoint", async () => {
  server.use(
    http.post("https://example.invalid/api/keys/11/token", () =>
      HttpResponse.json({ code: 0, token: "sk-voapi-secret" }),
    ),
  )

  await expect(
    resolveVoApiV2TokenKey(createVoApiV2Request(), { id: 11, key: "sk-***" }),
  ).resolves.toBe("sk-voapi-secret")
})
```

Add these additional service tests in the same file:

```ts
it("normalizes VoAPI v2 key inventory", async () => {
  server.use(
    http.get("https://example.invalid/api/keys", () =>
      HttpResponse.json({
        code: 0,
        data: [
          {
            id: 11,
            name: "default",
            tokenMasked: "sk-***",
            groups: [2],
            enable: true,
            expireTime: 1893456000000,
            amount: "2",
            used: "0.5",
          },
        ],
      }),
    ),
  )

  await expect(fetchVoApiV2Tokens(createVoApiV2Request())).resolves.toEqual([
    expect.objectContaining({
      id: 11,
      name: "default",
      key: "sk-***",
      status: 1,
      remain_quota: 1000000,
      used_quota: 250000,
      group: "2",
      expired_time: 1893456000,
    }),
  ])
})

it("creates keys with VoAPI v2 amount and group payloads", async () => {
  let payload: unknown
  server.use(
    http.get("https://example.invalid/api/keys/template", () =>
      HttpResponse.json({
        code: 0,
        data: {
          groups: [{ id: 2, name: "default", ratio: 1 }],
          models: [],
        },
      }),
    ),
    http.post("https://example.invalid/api/keys", async ({ request }) => {
      payload = await request.json()
      return HttpResponse.json({ code: 0, data: null })
    }),
  )

  await expect(
    createVoApiV2Token(createVoApiV2Request(), {
      name: "default",
      group: "2",
      remain_quota: 500000,
      expired_time: 1893456000,
      unlimited_quota: false,
      model_limits_enabled: false,
      model_limits: "",
      allow_ips: "",
    }),
  ).resolves.toBe(true)

  expect(payload).toEqual({
    name: "default",
    groups: [2],
    amount: "1",
    genCount: 1,
    enable: true,
    expireTime: 1893456000000,
  })
})

it("maps VoAPI v2 template groups and models", async () => {
  server.use(
    http.get("https://example.invalid/api/keys/template", () =>
      HttpResponse.json({
        code: 0,
        data: {
          groups: [{ id: 2, name: "Default", ratio: 1, note: "main" }],
          models: [
            { idKey: "gpt-4.1", enable: true, hidden: false },
            { idKey: "hidden-model", enable: true, hidden: true },
            { idKey: "disabled-model", enable: false, hidden: false },
          ],
        },
      }),
    ),
  )

  await expect(fetchVoApiV2AvailableModels(createVoApiV2Request())).resolves.toEqual([
    "gpt-4.1",
  ])
  await expect(fetchVoApiV2UserGroups(createVoApiV2Request())).resolves.toEqual({
    "2": { desc: "main", ratio: 1 },
  })
})

it("classifies repeated VoAPI v2 check-in as already signed", async () => {
  server.use(
    http.post("https://example.invalid/api/check_in", () =>
      HttpResponse.json({ code: 1, data: null, msg: "Signed in today" }),
    ),
  )

  await expect(submitVoApiV2CheckIn(createVoApiV2Request())).resolves.toEqual({
    alreadySigned: true,
  })
})
```

- [ ] **Step 3: Run the failing service tests**

Run:

```powershell
pnpm vitest run tests/services/apiService/voapiV2/parsing.test.ts tests/services/apiService/voapiV2/index.test.ts
```

Expected: FAIL because the `voapiV2` service module does not exist.

- [ ] **Step 4: Add endpoint constants and DTOs**

Create `src/services/apiService/voapiV2/type.ts`:

```ts
export const VOAPI_V2_ENDPOINTS = {
  UserInfo: "/api/user/info",
  DashboardStatistics: "/api/dash/statistics",
  Keys: "/api/keys",
  KeyTemplate: "/api/keys/template",
  CheckInTemplate: "/api/check_in/template",
  CheckInStats: "/api/check_in/stats",
  CheckInRecords: "/api/check_in",
  CheckInSubmit: "/api/check_in",
} as const

export type VoApiV2Envelope<TData = unknown> = {
  code: number
  data?: TData
  msg?: string
  message?: string
  token?: string
  rid?: string
}

export type VoApiV2UserInfo = {
  id: number | string
  username?: string
  nickname?: string
  basicBalance?: string
  bindBalance?: string
  usedBasicBalance?: string
  usedBindBalance?: string
  currency?: string
  totalRequest?: number
  totalToken?: number
}

export type VoApiV2DashboardStatistics = {
  d?: {
    requests?: number
    usedBasicBalance?: string
    usedBindBalance?: string
    errors?: number
    maxRpm?: number
  }
}

export type VoApiV2Key = {
  id: number
  name?: string
  tokenMasked?: string
  groups?: Array<string | number>
  enable?: boolean
  expireTime?: number
  amount?: string
  used?: string
  note?: string
}

export type VoApiV2KeyTemplate = {
  groups?: Array<{
    id: string | number
    name?: string
    ratio?: number
    timeRatio?: number
    chargingType?: string
    subBalanceType?: string
    note?: string
  }>
  models?: Array<{
    idKey?: string
    enable?: boolean
    hidden?: boolean
  }>
  ssb?: boolean
}

export type VoApiV2CheckInStats = {
  todaySigned?: boolean
  nextAmount?: string | number
  todayRecord?: unknown
  consecutiveDays?: number
}

export type VoApiV2CheckInSubmitData = {
  amount?: string | number
  bonusAmount?: string | number
}
```

- [ ] **Step 5: Add parser and conversion helpers**

Create `src/services/apiService/voapiV2/parsing.ts`:

```ts
import { UI_CONSTANTS } from "~/constants/ui"
import {
  API_ERROR_CODES,
  ApiError,
} from "~/services/apiTransport/errors"

import type { VoApiV2Envelope } from "./type"

export class VoApiV2AuthExpiredError extends ApiError {}

export type VoApiV2EnvelopeOptions = {
  allowNullData?: boolean
  allowTopLevelToken?: boolean
}

const getMessage = (body: VoApiV2Envelope<unknown>): string =>
  (typeof body.msg === "string" && body.msg.trim()) ||
  (typeof body.message === "string" && body.message.trim()) ||
  "VoAPI v2 request failed"

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value)

export function parseVoApiV2Envelope<TData>(
  value: unknown,
  endpoint: string,
  options: VoApiV2EnvelopeOptions = {},
): TData {
  if (!isObject(value) || typeof value.code !== "number") {
    throw new ApiError(
      "Invalid VoAPI v2 response",
      undefined,
      endpoint,
      API_ERROR_CODES.JSON_PARSE_ERROR,
    )
  }

  const body = value as VoApiV2Envelope<TData>
  if (body.code !== 0) {
    const message = getMessage(body)
    const ErrorClass =
      body.code === 2 && /auth\s*expire|unauthorized|token/i.test(message)
        ? VoApiV2AuthExpiredError
        : ApiError
    throw new ErrorClass(
      message,
      undefined,
      endpoint,
      API_ERROR_CODES.BUSINESS_ERROR,
    )
  }

  if (options.allowTopLevelToken && typeof body.token === "string") {
    return body.token as TData
  }

  if (body.data === null && options.allowNullData) {
    return null as TData
  }

  if (body.data === undefined || body.data === null) {
    throw new ApiError(
      "Missing VoAPI v2 response data",
      undefined,
      endpoint,
      API_ERROR_CODES.JSON_PARSE_ERROR,
    )
  }

  return body.data
}

export const isVoApiV2AuthExpiredError = (
  error: unknown,
): error is VoApiV2AuthExpiredError => error instanceof VoApiV2AuthExpiredError

export const amountToQuota = (amount: unknown): number => {
  const parsed =
    typeof amount === "number"
      ? amount
      : typeof amount === "string"
        ? Number.parseFloat(amount)
        : 0
  if (!Number.isFinite(parsed) || parsed <= 0) return 0
  return Math.round(parsed * UI_CONSTANTS.EXCHANGE_RATE.CONVERSION_FACTOR)
}

export const quotaToAmountString = (quota: unknown): string => {
  const parsed = typeof quota === "number" ? quota : 0
  if (!Number.isFinite(parsed) || parsed <= 0) return "0"
  const amount = parsed / UI_CONSTANTS.EXCHANGE_RATE.CONVERSION_FACTOR
  return Number.isInteger(amount) ? String(amount) : amount.toFixed(6).replace(/0+$/, "").replace(/\.$/, "")
}
```

Keep the error messages local and generic; do not include tokens, URLs, key names, or raw response bodies.

- [ ] **Step 6: Add service functions**

Create `src/services/apiService/voapiV2/index.ts` with these exports:

```ts
import type { CreateTokenRequest } from "~/services/accountTokens/tokenProvisioningModel"
import { determineHealthStatus } from "~/services/accounts/accountHealth"
import type {
  AccountData,
  ApiServiceAccountRequest,
  RefreshAccountResult,
} from "~/services/accounts/accountDataModel"
import { API_AUTH_TOKEN_MODES } from "~/services/apiTransport/type"
import type { ApiServiceRequest } from "~/services/apiTransport/type"
import { fetchApi } from "~/services/apiTransport/request"
import { SiteHealthStatus, type ApiToken } from "~/types"
import { t } from "~/utils/i18n/core"

import {
  amountToQuota,
  isVoApiV2AuthExpiredError,
  parseVoApiV2Envelope,
  type VoApiV2EnvelopeOptions,
  quotaToAmountString,
} from "./parsing"
import {
  VOAPI_V2_ENDPOINTS,
  type VoApiV2CheckInStats,
  type VoApiV2CheckInSubmitData,
  type VoApiV2DashboardStatistics,
  type VoApiV2Key,
  type VoApiV2KeyTemplate,
  type VoApiV2UserInfo,
} from "./type"

export async function fetchVoApiV2Data<TData>(
  request: ApiServiceRequest,
  endpoint: string,
  options: RequestInit = {},
  parseOptions?: VoApiV2EnvelopeOptions,
): Promise<TData> {
  const body = await fetchApi<unknown>(
    request,
    {
      endpoint,
      options,
      authTokenMode: API_AUTH_TOKEN_MODES.Raw,
    },
    true,
  )

  return parseVoApiV2Envelope<TData>(body, endpoint, parseOptions)
}

const buildTodayStatisticsEndpoint = () => {
  const start = new Date()
  start.setHours(0, 0, 0, 0)
  const end = new Date()
  end.setHours(23, 59, 59, 999)
  return `${VOAPI_V2_ENDPOINTS.DashboardStatistics}?t=h&s=${start.getTime()}&e=${end.getTime()}`
}

export const fetchVoApiV2UserInfo = (request: ApiServiceRequest) =>
  fetchVoApiV2Data<VoApiV2UserInfo>(request, VOAPI_V2_ENDPOINTS.UserInfo, {
    cache: "no-store",
  })

export const fetchSupportCheckIn = async (
  _request: ApiServiceRequest,
): Promise<boolean | undefined> => true

export async function fetchVoApiV2AccountData(
  request: ApiServiceAccountRequest,
): Promise<AccountData> {
  const userInfo = await fetchVoApiV2UserInfo(request)
  let stats: VoApiV2DashboardStatistics | null = null

  if (request.includeTodayCashflow !== false) {
    try {
      stats = await fetchVoApiV2Data<VoApiV2DashboardStatistics>(
        request,
        buildTodayStatisticsEndpoint(),
        { cache: "no-store" },
      )
    } catch {
      stats = null
    }
  }

  const quota =
    amountToQuota(userInfo.basicBalance) + amountToQuota(userInfo.bindBalance)
  const todayUsage =
    amountToQuota(stats?.d?.usedBasicBalance) +
    amountToQuota(stats?.d?.usedBindBalance)

  return {
    quota,
    today_quota_consumption: todayUsage,
    today_requests_count: Number(stats?.d?.requests ?? 0),
    today_prompt_tokens: 0,
    today_completion_tokens: 0,
    today_income: 0,
    checkIn: {
      ...(request.checkIn ?? { enableDetection: false }),
      siteStatus: {
        ...(request.checkIn?.siteStatus ?? {}),
      },
    },
  }
}

export async function refreshAccountData(
  request: ApiServiceAccountRequest,
): Promise<RefreshAccountResult> {
  try {
    const data = await fetchVoApiV2AccountData(request)
    return {
      success: true,
      data,
      healthStatus: {
        status: SiteHealthStatus.Healthy,
        message: t("account:healthStatus.normal"),
      },
    }
  } catch (error) {
    if (isVoApiV2AuthExpiredError(error)) {
      return {
        success: false,
        healthStatus: {
          status: SiteHealthStatus.Warning,
          message: t("account:healthStatus.httpError", {
            statusCode: 401,
            message: error.message,
          }),
        },
      }
    }

    return {
      success: false,
      healthStatus: determineHealthStatus(error),
    }
  }
}

export async function fetchVoApiV2Tokens(
  request: ApiServiceRequest,
  page = 1,
  size = 10,
): Promise<ApiToken[]> {
  const endpoint = `${VOAPI_V2_ENDPOINTS.Keys}?page=${page}&size=${size}&sl[name]=true&sl[token]=true&sl[note]=true`
  const data = await fetchVoApiV2Data<VoApiV2Key[] | { list?: VoApiV2Key[] }>(
    request,
    endpoint,
    { cache: "no-store" },
  )
  const keys = Array.isArray(data) ? data : (data.list ?? [])
  return keys.map((token) => ({
    id: token.id,
    name: token.name ?? "",
    key: token.tokenMasked ?? "",
    status: token.enable === false ? 2 : 1,
    remain_quota: amountToQuota(token.amount),
    used_quota: amountToQuota(token.used),
    expired_time:
      typeof token.expireTime === "number" && token.expireTime > 0
        ? Math.floor(token.expireTime / 1000)
        : -1,
    created_time: 0,
    accessed_time: 0,
    user_id: Number(request.auth.userId ?? 0),
    DeletedAt: null,
    models: "",
    group: token.groups?.[0] !== undefined ? String(token.groups[0]) : "",
    unlimited_quota: false,
    model_limits_enabled: false,
    model_limits: "",
    allow_ips: "",
  }))
}

export const fetchVoApiV2Template = (request: ApiServiceRequest) =>
  fetchVoApiV2Data<VoApiV2KeyTemplate>(
    request,
    VOAPI_V2_ENDPOINTS.KeyTemplate,
    { cache: "no-store" },
  )

export async function resolveVoApiV2TokenKey(
  request: ApiServiceRequest,
  token: Pick<ApiToken, "id" | "key">,
): Promise<string> {
  return await fetchVoApiV2Data<string>(
    request,
    `${VOAPI_V2_ENDPOINTS.Keys}/${token.id}/token`,
    { method: "POST" },
    { allowTopLevelToken: true },
  )
}

const toExpireTimeMillis = (expiredTime: number | undefined): number =>
  typeof expiredTime === "number" && expiredTime > 0 ? expiredTime * 1000 : -1

export async function createVoApiV2Token(
  request: ApiServiceRequest,
  tokenData: CreateTokenRequest,
): Promise<boolean> {
  const groups = await resolveVoApiV2GroupIds(request, tokenData.group)

  await fetchVoApiV2Data<null>(
    request,
    VOAPI_V2_ENDPOINTS.Keys,
    {
      method: "POST",
      body: JSON.stringify({
        name: tokenData.name,
        groups,
        amount: quotaToAmountString(tokenData.remain_quota),
        genCount: 1,
        enable: true,
        expireTime: toExpireTimeMillis(tokenData.expired_time),
      }),
    },
    { allowNullData: true },
  )
  return true
}

export async function deleteVoApiV2Token(
  request: ApiServiceRequest,
  tokenId: number,
): Promise<boolean> {
  await fetchVoApiV2Data<null>(
    request,
    `${VOAPI_V2_ENDPOINTS.Keys}/${tokenId}`,
    { method: "DELETE" },
    { allowNullData: true },
  )
  return true
}

export const fetchVoApiV2CheckInStats = (request: ApiServiceRequest) =>
  fetchVoApiV2Data<VoApiV2CheckInStats>(
    request,
    VOAPI_V2_ENDPOINTS.CheckInStats,
    { cache: "no-store" },
  )

export const submitVoApiV2CheckIn = (request: ApiServiceRequest) =>
  fetchVoApiV2Data<VoApiV2CheckInSubmitData>(
    request,
    VOAPI_V2_ENDPOINTS.CheckInSubmit,
    { method: "POST" },
  )
```

Add `fetchVoApiV2TokenById(...)`, `updateVoApiV2Token(...)`, `setVoApiV2TokenEnabled(...)`, `fetchVoApiV2AvailableModels(...)`, and `fetchVoApiV2UserGroups(...)` in the same file. Also add a `resolveVoApiV2GroupIds(...)` helper that resolves the selected form value against `/api/keys/template` and returns numeric backend group ids for create/update payloads. `updateVoApiV2Token(...)` fetches current inventory first, preserves `used` and `note`, then sends the full update payload:

```ts
body: JSON.stringify({
  id: tokenId,
  name: tokenData.name,
  groups: await resolveVoApiV2GroupIds(request, tokenData.group, existing.groups),
  enable: existing.enable !== false,
  expireTime: toExpireTimeMillis(tokenData.expired_time),
  amount: quotaToAmountString(tokenData.remain_quota),
  used: existing.used ?? "0",
  note: existing.note ?? "",
})
```

For `setVoApiV2TokenEnabled(...)`, call the same update endpoint with `enable` set to the requested boolean and the rest of the preserved fields from `fetchVoApiV2TokenById(...)`.

For duplicate check-in (`code: 1`, `Signed in today`), `submitVoApiV2CheckIn(...)` reads the raw envelope and returns a local union:

```ts
export type VoApiV2CheckInSubmitResult =
  | VoApiV2CheckInSubmitData
  | { alreadySigned: true }
```

Ordinary non-zero codes still throw `ApiError`.

- [ ] **Step 7: Run service tests**

Run:

```powershell
pnpm vitest run tests/services/apiService/voapiV2/parsing.test.ts tests/services/apiService/voapiV2/index.test.ts
```

Expected: PASS.

- [ ] **Step 8: Commit service module**

Run:

```powershell
git add src/services/apiService/voapiV2 tests/services/apiService/voapiV2
git commit -m "feat(voapi-v2): add backend service"
```

### Task 4: Wire VoAPI v2 adapter capabilities

**Files:**
- Modify: `src/services/apiAdapters/contracts/siteTypeCapabilities.ts`
- Modify: `src/services/apiAdapters/registry.ts`
- Create: `src/services/apiAdapters/voapiV2/index.ts`
- Create: `src/services/apiAdapters/voapiV2/accountBootstrap.ts`
- Create: `src/services/apiAdapters/voapiV2/accountCompletion.ts`
- Create: `src/services/apiAdapters/voapiV2/accountData.ts`
- Create: `src/services/apiAdapters/voapiV2/accountRefresh.ts`
- Create: `src/services/apiAdapters/voapiV2/keyManagement.ts`
- Create: `src/services/apiAdapters/voapiV2/tokenProvisioning.ts`
- Test: `tests/services/apiAdapters/registry.test.ts`
- Test: `tests/services/apiAdapters/voapiV2/accountCompletion.test.ts`
- Test: `tests/services/apiAdapters/voapiV2/accountRefresh.test.ts`
- Test: `tests/services/apiAdapters/voapiV2/keyManagement.test.ts`
- Test: `tests/services/apiAdapters/voapiV2/tokenProvisioning.test.ts`
- Test helper: `tests/services/apiAdapters/voapiV2/testUtils.ts`

- [ ] **Step 1: Write failing registry and adapter tests**

In `tests/services/apiAdapters/registry.test.ts`, assert:

```ts
const voApiV2Capabilities = getSiteTypeCapabilities(SITE_TYPES.VO_API_V2)
expect(voApiV2Capabilities.family).toBe(ACCOUNT_SITE_ADAPTER_FAMILIES.VoApiV2)
expect(voApiV2Capabilities.account?.data).toBeDefined()
expect(voApiV2Capabilities.account?.completion).toBeDefined()
expect(voApiV2Capabilities.account?.keyManagement).toBeDefined()

const oldVoApiCapabilities = getSiteTypeCapabilities(SITE_TYPES.VO_API)
expect(oldVoApiCapabilities.family).toBe(ACCOUNT_SITE_ADAPTER_FAMILIES.NewApiFamily)
```

In `tests/services/apiAdapters/voapiV2/testUtils.ts`, create a shared request helper:

```ts
import { AuthTypeEnum } from "~/types"
import type { ApiServiceAccountRequest } from "~/services/accounts/accountDataModel"

export const createVoApiV2Request = (): ApiServiceAccountRequest => ({
  baseUrl: "https://example.invalid",
  accountId: "account-1",
  auth: {
    authType: AuthTypeEnum.AccessToken,
    accessToken: "jwt-dashboard",
    userId: 7,
  },
  checkIn: {
    enableDetection: true,
  },
})
```

Create account completion tests:

```ts
it("stores the dashboard JWT as the access token", async () => {
  server.use(
    http.get("https://example.invalid/api/user/info", () =>
      HttpResponse.json({
        code: 0,
        data: {
          id: 7,
          username: "owner",
          nickname: "Owner",
          basicBalance: "1",
          bindBalance: "0",
        },
      }),
    ),
  )

  const completed = await voApiV2AccountCompletion.complete(
    {
      url: "https://example.invalid",
      detected: {
        userId: 7,
        user: { username: "owner" },
        accessToken: "jwt-dashboard",
        siteTypeHint: SITE_TYPES.VO_API_V2,
      },
      context: undefined,
    },
    helpers,
  )

  expect(completed).toMatchObject({
    accessToken: "jwt-dashboard",
    userId: "7",
    username: "owner",
    authType: AuthTypeEnum.AccessToken,
  })
  expect(completed.checkIn.enableDetection).toBe(true)
})

it("fails completion when the dashboard JWT is missing", async () => {
  await expect(
    voApiV2AccountCompletion.complete(
      {
        url: "https://example.invalid",
        detected: { userId: 7, user: {} },
        context: undefined,
      },
      helpers,
    ),
  ).rejects.toMatchObject({
    reason: AUTO_DETECT_FAILURE_REASONS.AccessTokenMissing,
  })
})
```

Create account refresh tests in `tests/services/apiAdapters/voapiV2/accountRefresh.test.ts`:

```ts
it("reports expired dashboard JWT without trying refresh-token recovery", async () => {
  server.use(
    http.get("https://example.invalid/api/user/info", () =>
      HttpResponse.json({ code: 2, data: null, msg: "Auth expire" }),
    ),
  )

  await expect(
    voApiV2AccountRefresh.refreshAccount(createVoApiV2Request()),
  ).resolves.toEqual(
    expect.objectContaining({
      success: false,
      authUpdate: undefined,
      healthStatus: expect.objectContaining({
        status: SiteHealthStatus.Warning,
      }),
    }),
  )
})

it("does not expose refresh-token fields in VoAPI v2 refresh results", async () => {
  server.use(
    http.get("https://example.invalid/api/user/info", () =>
      HttpResponse.json({
        code: 0,
        data: {
          id: 7,
          username: "owner",
          basicBalance: "1",
          bindBalance: "0",
        },
      }),
    ),
    http.get("https://example.invalid/api/dash/statistics", () =>
      HttpResponse.json({ code: 0, data: { d: { requests: 0 } } }),
    ),
  )

  const result = await voApiV2AccountRefresh.refreshAccount(
    createVoApiV2Request(),
  )

  expect(result.authUpdate).toBeUndefined()
})
```

Create this key-management test in `tests/services/apiAdapters/voapiV2/keyManagement.test.ts`:

```ts
it("reveals keys through VoAPI v2 and does not call New API key reveal routes", async () => {
  const newApiReveal = vi.fn()

  server.use(
    http.post("https://example.invalid/api/keys/11/token", () =>
      HttpResponse.json({ code: 0, token: "sk-voapi-secret" }),
    ),
    http.get("https://example.invalid/api/token/11/key", () => {
      newApiReveal()
      return HttpResponse.json({ success: true, data: "wrong", message: "ok" })
    }),
  )

  await expect(
    voApiV2KeyManagement.resolveTokenKey({
      request: createVoApiV2Request(),
      token: { id: 11, key: "sk-***" },
    }),
  ).resolves.toBe("sk-voapi-secret")

  expect(newApiReveal).not.toHaveBeenCalled()
})
```

- [ ] **Step 2: Run failing adapter tests**

Run:

```powershell
pnpm vitest run tests/services/apiAdapters/registry.test.ts tests/services/apiAdapters/voapiV2/accountCompletion.test.ts tests/services/apiAdapters/voapiV2/accountRefresh.test.ts tests/services/apiAdapters/voapiV2/keyManagement.test.ts tests/services/apiAdapters/voapiV2/tokenProvisioning.test.ts
```

Expected: FAIL because the adapter modules and registry branch do not exist.

- [ ] **Step 3: Extend capability family type**

In `src/services/apiAdapters/contracts/siteTypeCapabilities.ts`, change:

```ts
export type SiteBackendFamily = "newApiFamily" | "sub2api"
```

to:

```ts
export type SiteBackendFamily = "newApiFamily" | "sub2api" | "voapiV2"
```

- [ ] **Step 4: Add account bootstrap**

Create `src/services/apiAdapters/voapiV2/accountBootstrap.ts`:

```ts
import { UI_CONSTANTS } from "~/constants/ui"
import {
  ACCOUNT_BOOTSTRAP_ROUTE_KINDS,
  type AccountBootstrapCapability,
  type AccountBootstrapRouteKind,
} from "~/services/apiAdapters/contracts/accountBootstrap"
import { fetchVoApiV2UserInfo } from "~/services/apiService/voapiV2"

const VOAPI_V2_ROUTES: Record<AccountBootstrapRouteKind, string> = {
  [ACCOUNT_BOOTSTRAP_ROUTE_KINDS.Login]: "/",
  [ACCOUNT_BOOTSTRAP_ROUTE_KINDS.Usage]: "/dash?_userMenuKey=dash",
  [ACCOUNT_BOOTSTRAP_ROUTE_KINDS.CheckIn]: "/checkIn?_userMenuKey=checkIn",
  [ACCOUNT_BOOTSTRAP_ROUTE_KINDS.AdminCredentials]: "/keys?_userMenuKey=keys",
  [ACCOUNT_BOOTSTRAP_ROUTE_KINDS.Redeem]: "/dash?_userMenuKey=dash",
  [ACCOUNT_BOOTSTRAP_ROUTE_KINDS.SiteAnnouncements]: "/dash?_userMenuKey=dash",
}

export const voApiV2AccountBootstrap: AccountBootstrapCapability = {
  fetchUserInfo: async (request) => {
    const user = await fetchVoApiV2UserInfo(request)
    return {
      id: user.id,
      username: user.username ?? user.nickname ?? String(user.id),
      access_token: request.auth.accessToken ?? "",
    }
  },
  getOrCreateAccessToken: async (request) => {
    const user = await fetchVoApiV2UserInfo(request)
    return {
      username: user.username ?? user.nickname ?? String(user.id),
      access_token: request.auth.accessToken ?? "",
    }
  },
  fetchSiteStatus: async () => ({
    system_name: "VoAPI",
    checkin_enabled: true,
  }),
  extractDefaultExchangeRate: () => UI_CONSTANTS.EXCHANGE_RATE.DEFAULT,
  fetchCheckInSupport: async () => true,
  resolveRoutePath: async (_target, route) => VOAPI_V2_ROUTES[route],
}
```

- [ ] **Step 5: Add completion**

Create `src/services/apiAdapters/voapiV2/accountCompletion.ts`:

```ts
import { AUTO_DETECT_FAILURE_REASONS } from "~/constants/autoDetect"
import { UI_CONSTANTS } from "~/constants/ui"
import { fetchVoApiV2UserInfo } from "~/services/apiService/voapiV2"
import { AuthTypeEnum } from "~/types"

import type { AccountCompletionCapability } from "../contracts/accountCompletion"

export const voApiV2AccountCompletion: AccountCompletionCapability = {
  async complete(request, helpers) {
    const { url, detected, context } = request
    const accessToken = helpers.trimString(detected.accessToken)

    if (!accessToken) {
      throw helpers.createCompletionError(
        AUTO_DETECT_FAILURE_REASONS.AccessTokenMissing,
        new Error("VoAPI v2 dashboard JWT missing"),
      )
    }

    let userInfo
    try {
      userInfo = await fetchVoApiV2UserInfo(
        helpers.createServiceRequest({
          baseUrl: url,
          context,
          auth: {
            authType: AuthTypeEnum.AccessToken,
            accessToken,
            userId: detected.userId,
          },
        }),
      )
    } catch (error) {
      throw helpers.createCompletionError(
        AUTO_DETECT_FAILURE_REASONS.TokenFetchFailed,
        error,
      )
    }

    const userId = helpers.trimString(detected.userId) || String(userInfo.id)
    const username =
      helpers.trimString(detected.user?.username) ||
      helpers.trimString(detected.user?.display_name) ||
      helpers.trimString(detected.user?.email) ||
      helpers.trimString(userInfo.username) ||
      helpers.trimString(userInfo.nickname) ||
      userId

    return {
      username,
      siteName: await helpers.fetchSiteName({ system_name: "VoAPI" }),
      accessToken,
      userId,
      exchangeRate: UI_CONSTANTS.EXCHANGE_RATE.DEFAULT,
      authType: AuthTypeEnum.AccessToken,
      checkIn: helpers.createInitialCheckInConfig({
        enableDetection: true,
        autoCheckInEnabled: false,
      }),
    }
  },
}
```

- [ ] **Step 6: Add data, refresh, key-management, and token-provisioning capabilities**

Create `src/services/apiAdapters/voapiV2/accountData.ts`:

```ts
import type { AccountDataCapability } from "~/services/apiAdapters/contracts/accountData"
import { fetchVoApiV2AccountData } from "~/services/apiService/voapiV2"

export const voApiV2AccountData: AccountDataCapability = {
  fetchData: (request) => fetchVoApiV2AccountData(request),
}
```

Create `src/services/apiAdapters/voapiV2/accountRefresh.ts`:

```ts
import type { AccountRefreshCapability } from "~/services/apiAdapters/contracts/accountRefresh"
import {
  fetchSupportCheckIn,
  refreshAccountData,
} from "~/services/apiService/voapiV2"

export const voApiV2AccountRefresh: AccountRefreshCapability = {
  fetchCheckInSupport: (request) => fetchSupportCheckIn(request),
  refreshAccount: (request) => refreshAccountData(request),
}
```

Create `src/services/apiAdapters/voapiV2/keyManagement.ts`:

```ts
import type { KeyManagementCapability } from "~/services/apiAdapters/contracts/keyManagement"
import {
  createVoApiV2Token,
  deleteVoApiV2Token,
  fetchVoApiV2AvailableModels,
  fetchVoApiV2Tokens,
  fetchVoApiV2UserGroups,
  resolveVoApiV2TokenKey,
  updateVoApiV2Token,
} from "~/services/apiService/voapiV2"

export const voApiV2KeyManagement: KeyManagementCapability = {
  fetchTokens: (request, options) =>
    fetchVoApiV2Tokens(request, options?.page, options?.size),
  createToken: (request, tokenData) => createVoApiV2Token(request, tokenData),
  updateToken: ({ request, tokenId, tokenData }) =>
    updateVoApiV2Token(request, tokenId, tokenData),
  resolveTokenKey: ({ request, token }) => resolveVoApiV2TokenKey(request, token),
  deleteToken: ({ request, tokenId }) => deleteVoApiV2Token(request, tokenId),
  fetchAvailableModels: (request) => fetchVoApiV2AvailableModels(request),
  userGroups: {
    fetch: (request) => fetchVoApiV2UserGroups(request),
  },
}
```

Create `src/services/apiAdapters/voapiV2/tokenProvisioning.ts` using the existing provisioning constants:

```ts
import type { TokenProvisioningCapability } from "~/services/apiAdapters/contracts/tokenProvisioning"
import {
  CREATED_TOKEN_SECRET_DECISION_KINDS,
  DEFAULT_TOKEN_CREATION_DECISION_KINDS,
  TOKEN_CREATION_SECRET_RECOVERY,
  TOKEN_PROVISIONING_BLOCK_REASONS,
  TOKEN_PROVISIONING_REPAIR_POLICY_KINDS,
} from "~/services/apiAdapters/contracts/tokenProvisioning"

export const voApiV2TokenProvisioning: TokenProvisioningCapability = {
  isInventoryTokenUsable: ({ token }) => Boolean(token.id),
  resolveDefaultTokenCreation({ defaultTokenData, explicitGroup, userGroups }) {
    if (defaultTokenData.unlimited_quota) {
      return {
        kind: DEFAULT_TOKEN_CREATION_DECISION_KINDS.Blocked,
        reason: TOKEN_PROVISIONING_BLOCK_REASONS.CreatedTokenSecretUnavailable,
      }
    }

    if (explicitGroup) {
      return {
        kind: DEFAULT_TOKEN_CREATION_DECISION_KINDS.Create,
        tokenData: { ...defaultTokenData, group: explicitGroup },
        oneTimeSecret: false,
        recoverCreatedToken: TOKEN_CREATION_SECRET_RECOVERY.InventoryRefetch,
      }
    }

    const allowedGroups = Object.keys(userGroups ?? {})
    if (allowedGroups.length === 0) {
      return { kind: DEFAULT_TOKEN_CREATION_DECISION_KINDS.NeedsUserGroups }
    }
    if (allowedGroups.length === 1) {
      return {
        kind: DEFAULT_TOKEN_CREATION_DECISION_KINDS.Create,
        tokenData: { ...defaultTokenData, group: allowedGroups[0] },
        oneTimeSecret: false,
        recoverCreatedToken: TOKEN_CREATION_SECRET_RECOVERY.InventoryRefetch,
      }
    }
    return {
      kind: DEFAULT_TOKEN_CREATION_DECISION_KINDS.SelectionRequired,
      allowedGroups,
      reason: TOKEN_PROVISIONING_BLOCK_REASONS.GroupSelectionRequired,
    }
  },
  classifyCreatedToken() {
    return { kind: CREATED_TOKEN_SECRET_DECISION_KINDS.NeedsInventoryRefetch }
  },
  getRepairPolicy() {
    return { kind: TOKEN_PROVISIONING_REPAIR_POLICY_KINDS.Eligible }
  },
}
```

- [ ] **Step 7: Add capability index and registry branch**

Create `src/services/apiAdapters/voapiV2/index.ts`:

```ts
import { ACCOUNT_SITE_ADAPTER_FAMILIES, SITE_TYPES } from "~/constants/siteType"
import type { SiteTypeCapabilities } from "~/services/apiAdapters/contracts/siteTypeCapabilities"

import { voApiV2AccountBootstrap } from "./accountBootstrap"
import { voApiV2AccountCompletion } from "./accountCompletion"
import { voApiV2AccountData } from "./accountData"
import { voApiV2AccountRefresh } from "./accountRefresh"
import { voApiV2KeyManagement } from "./keyManagement"
import { voApiV2TokenProvisioning } from "./tokenProvisioning"

export const voApiV2Capabilities: SiteTypeCapabilities = {
  siteType: SITE_TYPES.VO_API_V2,
  family: ACCOUNT_SITE_ADAPTER_FAMILIES.VoApiV2,
  account: {
    data: voApiV2AccountData,
    bootstrap: voApiV2AccountBootstrap,
    completion: voApiV2AccountCompletion,
    keyManagement: voApiV2KeyManagement,
    tokenProvisioning: voApiV2TokenProvisioning,
    refresh: voApiV2AccountRefresh,
  },
}
```

In `src/services/apiAdapters/registry.ts`, import:

```ts
import { voApiV2Capabilities } from "./voapiV2"
```

Add this branch before the New API-family branch:

```ts
if (siteType === SITE_TYPES.VO_API_V2) return voApiV2Capabilities
```

- [ ] **Step 8: Run adapter tests**

Run:

```powershell
pnpm vitest run tests/services/apiAdapters/registry.test.ts tests/services/apiAdapters/voapiV2/accountCompletion.test.ts tests/services/apiAdapters/voapiV2/accountRefresh.test.ts tests/services/apiAdapters/voapiV2/keyManagement.test.ts tests/services/apiAdapters/voapiV2/tokenProvisioning.test.ts
```

Expected: PASS.

- [ ] **Step 9: Commit adapter capabilities**

Run:

```powershell
git add src/services/apiAdapters/contracts/siteTypeCapabilities.ts src/services/apiAdapters/registry.ts src/services/apiAdapters/voapiV2 tests/services/apiAdapters/registry.test.ts tests/services/apiAdapters/voapiV2
git commit -m "feat(voapi-v2): add account adapter capabilities"
```

### Task 5: Add VoAPI v2 auto check-in provider

**Files:**
- Create: `src/services/checkin/autoCheckin/providers/voapiV2.ts`
- Modify: `src/services/checkin/autoCheckin/providers/index.ts`
- Test: `tests/services/autoCheckin/providers/voapiV2.test.ts`

- [ ] **Step 1: Write failing check-in provider tests**

Create `tests/services/autoCheckin/providers/voapiV2.test.ts`:

```ts
import { SITE_TYPES } from "~/constants/siteType"
import { voApiV2Provider } from "~/services/checkin/autoCheckin/providers/voapiV2"
import type { SiteAccount } from "~/types"
import { CHECKIN_RESULT_STATUS } from "~/types/autoCheckin"

const account = {
  id: "account-1",
  site_type: SITE_TYPES.VO_API_V2,
  site_url: "https://example.invalid",
  account_info: {
    id: "7",
    access_token: "jwt-dashboard",
  },
  checkIn: {
    enableDetection: true,
  },
} as unknown as SiteAccount

it("checks in through the VoAPI v2 API and confirms stats", async () => {
  server.use(
    http.post("https://example.invalid/api/check_in", ({ request }) => {
      expect(request.headers.get("authorization")).toBe("jwt-dashboard")
      return HttpResponse.json({ code: 0, data: { amount: "0.1", bonusAmount: "0" } })
    }),
    http.get("https://example.invalid/api/check_in/stats", () =>
      HttpResponse.json({ code: 0, data: { todaySigned: true } }),
    ),
  )

  await expect(voApiV2Provider.checkIn(account)).resolves.toMatchObject({
    status: CHECKIN_RESULT_STATUS.SUCCESS,
  })
})

it("treats repeated same-day sign-in as already checked", async () => {
  server.use(
    http.post("https://example.invalid/api/check_in", () =>
      HttpResponse.json({ code: 1, data: null, msg: "Signed in today" }),
    ),
    http.get("https://example.invalid/api/check_in/stats", () =>
      HttpResponse.json({ code: 0, data: { todaySigned: true } }),
    ),
  )

  await expect(voApiV2Provider.checkIn(account)).resolves.toMatchObject({
    status: CHECKIN_RESULT_STATUS.ALREADY_CHECKED,
  })
})

it("does not run without the saved dashboard JWT", () => {
  expect(
    voApiV2Provider.canCheckIn({
      ...account,
      account_info: { ...account.account_info, access_token: "" },
    } as unknown as SiteAccount),
  ).toBe(false)
})
```

- [ ] **Step 2: Run failing check-in tests**

Run:

```powershell
pnpm vitest run tests/services/autoCheckin/providers/voapiV2.test.ts
```

Expected: FAIL because the provider does not exist.

- [ ] **Step 3: Implement the provider**

Create `src/services/checkin/autoCheckin/providers/voapiV2.ts`:

```ts
import { SITE_TYPES } from "~/constants/siteType"
import type { ApiServiceRequest } from "~/services/apiTransport/type"
import {
  fetchVoApiV2CheckInStats,
  submitVoApiV2CheckIn,
} from "~/services/apiService/voapiV2"
import type { AutoCheckinProvider } from "~/services/checkin/autoCheckin/providers"
import {
  AUTO_CHECKIN_PROVIDER_FALLBACK_MESSAGE_KEYS,
  resolveProviderErrorResult,
} from "~/services/checkin/autoCheckin/providers/shared"
import type { AutoCheckinProviderResult } from "~/services/checkin/autoCheckin/providers/types"
import { AuthTypeEnum, type SiteAccount } from "~/types"
import { CHECKIN_RESULT_STATUS } from "~/types/autoCheckin"

const createRequest = (account: SiteAccount): ApiServiceRequest => ({
  baseUrl: account.site_url,
  accountId: account.id,
  auth: {
    authType: AuthTypeEnum.AccessToken,
    accessToken: account.account_info.access_token,
    userId: account.account_info.id,
  },
})

const isVoApiV2Account = (account: SiteAccount): boolean =>
  account.site_type === SITE_TYPES.VO_API_V2

export const voApiV2Provider: AutoCheckinProvider = {
  canCheckIn(account) {
    return Boolean(
      isVoApiV2Account(account as SiteAccount) &&
        (account as SiteAccount).checkIn?.enableDetection &&
        (account as SiteAccount).account_info?.access_token,
    )
  },
  async checkIn(account): Promise<AutoCheckinProviderResult> {
    try {
      const siteAccount = account as SiteAccount
      if (!this.canCheckIn(siteAccount)) {
        return {
          status: CHECKIN_RESULT_STATUS.FAILED,
          messageKey: AUTO_CHECKIN_PROVIDER_FALLBACK_MESSAGE_KEYS.checkinFailed,
        }
      }

      const request = createRequest(siteAccount)
      const submitResult = await submitVoApiV2CheckIn(request)
      const stats = await fetchVoApiV2CheckInStats(request)

      if ("alreadySigned" in submitResult) {
        return {
          status: CHECKIN_RESULT_STATUS.ALREADY_CHECKED,
          messageKey:
            AUTO_CHECKIN_PROVIDER_FALLBACK_MESSAGE_KEYS.alreadyCheckedToday,
          data: stats,
        }
      }

      return {
        status:
          stats.todaySigned === true
            ? CHECKIN_RESULT_STATUS.SUCCESS
            : CHECKIN_RESULT_STATUS.FAILED,
        messageKey:
          stats.todaySigned === true
            ? AUTO_CHECKIN_PROVIDER_FALLBACK_MESSAGE_KEYS.checkinSuccessful
            : AUTO_CHECKIN_PROVIDER_FALLBACK_MESSAGE_KEYS.checkinFailed,
        data: stats,
      }
    } catch (error) {
      return resolveProviderErrorResult({ error })
    }
  },
}
```

Do not add a native-page click fallback for VoAPI v2 in this first version.

- [ ] **Step 4: Register the provider**

In `src/services/checkin/autoCheckin/providers/index.ts`, import:

```ts
import { voApiV2Provider } from "~/services/checkin/autoCheckin/providers/voapiV2"
```

Add to `providers`:

```ts
[SITE_TYPES.VO_API_V2]: voApiV2Provider,
```

- [ ] **Step 5: Run check-in tests**

Run:

```powershell
pnpm vitest run tests/services/autoCheckin/providers/voapiV2.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit check-in provider**

Run:

```powershell
git add src/services/checkin/autoCheckin/providers/voapiV2.ts src/services/checkin/autoCheckin/providers/index.ts tests/services/autoCheckin/providers/voapiV2.test.ts
git commit -m "feat(voapi-v2): add api check-in provider"
```

### Task 6: Integration validation, maintainability audit, and handoff

**Files:**
- Review: all files touched in Tasks 1-5.

- [ ] **Step 1: Run focused test set**

Run:

```powershell
pnpm vitest run tests/services/apiTransport/request.test.ts tests/services/accountSiteOnboarding/contentSession/voapiV2.test.ts tests/services/accountSiteOnboarding/registry.test.ts tests/services/detectSiteType.test.ts tests/services/detectSiteType.fallback.test.ts tests/services/apiService/voapiV2/parsing.test.ts tests/services/apiService/voapiV2/index.test.ts tests/services/apiAdapters/registry.test.ts tests/services/apiAdapters/voapiV2/accountCompletion.test.ts tests/services/apiAdapters/voapiV2/accountRefresh.test.ts tests/services/apiAdapters/voapiV2/keyManagement.test.ts tests/services/apiAdapters/voapiV2/tokenProvisioning.test.ts tests/services/autoCheckin/providers/voapiV2.test.ts
```

Expected: PASS.

- [ ] **Step 2: Run type-check**

Run:

```powershell
pnpm compile
```

Expected: PASS.

- [ ] **Step 3: Inspect task-scoped diff**

Run:

```powershell
git diff --stat
git diff -- src/services/apiTransport src/services/accountSiteDefinitions src/services/accountSiteOnboarding src/services/siteDetection src/services/apiService/voapiV2 src/services/apiAdapters/voapiV2 src/services/apiAdapters/registry.ts src/services/apiAdapters/contracts/siteTypeCapabilities.ts src/services/checkin/autoCheckin/providers tests/services tests/constants
```

Check these invariants in the diff:

- no token, JWT, cookie, `voak-*`, or account identifier is committed;
- old `SITE_TYPES.VO_API` still routes through New API-family capabilities;
- `fetchApi` default behavior remains Bearer;
- all VoAPI v2 service calls pass `authTokenMode: API_AUTH_TOKEN_MODES.Raw`;
- VoAPI v2 does not persist `refreshToken`, `refresh_token`, `sub2apiAuth`, or
  any `authUpdate`-style refresh credential;
- `voapi-v2` detection does not require `demo.voapi.top`;
- title/temp-window detection is not the primary VoAPI v2 recognition path;
- `voak-*` is not stored or used;
- check-in provider uses API endpoints only.

- [ ] **Step 4: Run staged validation before final commit**

Stage only the task-scoped files:

```powershell
git add src/services/apiTransport/type.ts src/services/apiTransport/request.ts src/services/accountSiteDefinitions/identifiers.ts src/services/accountSiteDefinitions/contracts.ts src/services/accountSiteDefinitions/definitions.ts src/services/accountSiteOnboarding/contentSession/voapiV2.ts src/services/accountSiteOnboarding/registry.ts src/services/siteDetection/detectSiteType.ts src/services/apiService/voapiV2 src/services/apiAdapters/contracts/siteTypeCapabilities.ts src/services/apiAdapters/registry.ts src/services/apiAdapters/voapiV2 src/services/checkin/autoCheckin/providers/voapiV2.ts src/services/checkin/autoCheckin/providers/index.ts tests/constants/siteType.test.ts tests/services/apiTransport/request.test.ts tests/services/accountSiteDefinitions/registry.test.ts tests/services/accounts/accountSiteProfile.test.ts tests/services/modelList/accountSources/readiness.definitions.test.ts tests/services/accountSiteOnboarding/contentSession/voapiV2.test.ts tests/services/accountSiteOnboarding/registry.test.ts tests/services/detectSiteType.test.ts tests/services/detectSiteType.fallback.test.ts tests/services/apiService/voapiV2 tests/services/apiAdapters/registry.test.ts tests/services/apiAdapters/voapiV2 tests/services/autoCheckin/providers/voapiV2.test.ts
pnpm run validate:staged
```

Expected: PASS.

- [ ] **Step 5: Run push gate before remote handoff**

Run:

```powershell
pnpm run validate:push
```

Expected: PASS. This gate is required before pushing or opening a PR because the slice changes shared transport contracts, adapter registry exports, and site-type definitions.

- [ ] **Step 6: Final commit if any changes remain uncommitted**

If Tasks 1-5 were committed individually and `git status --porcelain` is clean, skip this step. If integration fixes remain staged after validation, commit:

```powershell
git commit -m "feat(voapi-v2): integrate account adapter"
```

## Telemetry Decision

Decision: reuse existing telemetry.

This plan adds a site adapter and reuses existing account add, refresh, key-management, and check-in flows. It does not add a new settings surface or new visible funnel. If implementation adds a new user-visible expired-session recovery action, add privacy-safe result categories in that task and avoid recording URLs, hosts, paths, key ids, token values, raw backend messages, or account names.

## Settings Search Decision

Decision: no settings search change.

No settings UI, deep link target, or options-page search definition is added.

## E2E Decision

Decision: no retained Playwright E2E by default.

The primary risks are protocol mapping, detection ordering, authorization header formatting, and adapter registry wiring, all covered by Vitest/MSW tests. Add Playwright only if the implementation changes browser tab/runtime message routing or temp-window behavior beyond the content-session extractor unit path.

## Self-Review

- Spec coverage: site identity, raw JWT transport, storage policy, balance mapping, key management, check-in, browser-session extraction, `voak-*` non-use, detection priority, telemetry, settings search, and E2E decisions are each mapped to Tasks 1-6.
- Compatibility: old `VoAPI` remains a New API-family site type; `Sub2API` remains Bearer JWT and keeps its refresh-token flow.
- Detection: backend probes run before title/temp-window matching; custom/self-hosted origins are covered by tests.
- Storage: dashboard JWT is stored in `account_info.access_token`; no secondary `voak-*` storage and no refresh-token-shaped storage are introduced.
- Validation: focused Vitest, `pnpm compile`, `pnpm run validate:staged`, and `pnpm run validate:push` are specified.

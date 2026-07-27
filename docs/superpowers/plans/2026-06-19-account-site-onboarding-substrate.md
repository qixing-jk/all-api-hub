# Account Site Onboarding Substrate Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move account-site detection metadata and content-script session extraction into a dedicated onboarding substrate so future account site types can register early onboarding facts without adding raw branches across constants, detection, and content message handlers.

**Architecture:** Add a pre-adapter Module under `src/services/accountSiteOnboarding`. A pure metadata source owns site-type values, detection rules, and route overrides; the runtime registry composes that metadata with ordered content-session extractors. `src/constants/siteType.ts` remains the compatibility facade, `detectSiteType.ts` consumes onboarding projections, and `handleGetUserFromLocalStorage(...)` delegates to extractors.

**Tech Stack:** TypeScript, WXT content scripts, Vitest, jsdom localStorage, MSW, pnpm, existing site-type and account-identity helpers.

**Spec:** `docs/superpowers/specs/2026-06-19-account-site-onboarding-substrate-design.md`

---

## File Structure

Create:

- `src/services/accountSiteOnboarding/siteTypes.ts`
  - Pure site-type constants and literal-union arrays moved out of the compatibility facade.
- `src/services/accountSiteOnboarding/contracts.ts`
  - Shared onboarding registry, detection, route, and content-session extractor Interfaces.
- `src/services/accountSiteOnboarding/metadata.ts`
  - Pure static metadata for title/domain detection and route overrides. Must not import content-session extractors.
- `src/services/accountSiteOnboarding/contentSession/sub2api.ts`
  - Sub2API localStorage/JWT session extractor and near-expiry token refresh logic.
- `src/services/accountSiteOnboarding/contentSession/compatibleUser.ts`
  - Generic compatible `localStorage["user"]` extractor.
- `src/services/accountSiteOnboarding/registry.ts`
  - Runtime registry projections plus ordered content-session extractors.
- `tests/services/accountSiteOnboarding/registry.test.ts`
  - Metadata and extractor-order projection coverage.
- `tests/services/accountSiteOnboarding/contentSession/sub2api.test.ts`
  - Sub2API extractor behavior coverage.
- `tests/services/accountSiteOnboarding/contentSession/compatibleUser.test.ts`
  - Generic compatible extractor behavior coverage.

Modify:

- `src/constants/siteType.ts`
  - Re-export site-type constants/types and derive public title/domain/route exports from pure onboarding metadata.
- `tests/constants/siteType.test.ts`
  - Lock compatibility facade behavior after moving static metadata.
- `src/services/siteDetection/detectSiteType.ts`
  - Consume onboarding registry projections for domain, title, and compat user-id header fallback rules.
- `tests/services/detectSiteType.test.ts`
  - Keep domain/title/API fallback behavior covered against registry-backed rules.
- `tests/services/detectSiteType.fallback.test.ts`
  - Keep mocked fallback-path tests green after import changes.
- `src/entrypoints/content/messageHandlers/handlers/storage.ts`
  - Keep `handleGetLocalStorage(...)` unchanged; route user extraction through ordered onboarding extractors.
- `tests/entrypoints/content/messageHandlers/handlers/storage.test.ts`
  - Keep response-shape coverage and add extractor-order/error coverage.

Do not modify:

- `src/services/apiAdapters/**`
- `src/services/apiService/**`
- `src/services/siteDetection/autoDetectService.ts` unless TypeScript exposes duplicated request shaping that can be locally simplified without changing the message wire shape.
- Account Dialog UI policy, redemption, managed-site provider/channel logic, telemetry schema, settings search entries, locale files, or Playwright E2E tests.

---

## Implementation Notes

Avoid a runtime import cycle:

- `accountSiteOnboarding/siteTypes.ts` imports nothing.
- `accountSiteOnboarding/metadata.ts` imports only `siteTypes.ts` and pure helpers.
- `constants/siteType.ts` imports only `siteTypes.ts` and `metadata.ts`.
- `accountSiteOnboarding/registry.ts` imports `metadata.ts` and content-session extractors.
- `detectSiteType.ts` and `storage.ts` import `registry.ts`.

Do not make `constants/siteType.ts` import `registry.ts`; that would pull content-script extraction code into the global constants facade and can create cycles through modules that still import `~/constants/siteType`.

The public compatibility surface stays stable:

```ts
export {
  AIHUBMIX_API_ORIGIN,
  AIHUBMIX_HOSTNAMES,
  AIHUBMIX_LOGIN_PATH,
  AIHUBMIX_WEB_ORIGIN,
  ACCOUNT_SITE_TYPES,
  ACCOUNT_SITE_TYPE_VALUES,
  MANAGED_SITE_TYPES,
  SITE_TYPES,
} from "~/services/accountSiteOnboarding/siteTypes"
export type {
  AccountSiteType,
  ManagedSiteType,
} from "~/services/accountSiteOnboarding/siteTypes"
```

The content-session extractor result must keep the existing message response data shape consumed by `autoDetectService`:

```ts
export type ContentSessionExtractionResult = {
  userId: string
  user: Record<string, unknown>
  accessToken?: string
  siteTypeHint?: AccountSiteType
  sub2apiAuth?: {
    refreshToken: string
    tokenExpiresAt?: number
  }
}
```

Use `null` for expected "not this extractor" or "not logged in" cases. Let `handleGetUserFromLocalStorage(...)` map no extractor result to `messages:content.userInfoNotFound`, except Sub2API malformed/expired session cases that must preserve `messages:sub2api.loginRequired`.

Telemetry decision: reuse existing. This is an internal routing/refactor slice.

Settings search decision: none. No settings UI or route anchors change.

E2E decision: no new Playwright E2E. Focused Vitest coverage is the right layer unless implementation changes runtime message names, action IDs, or extension entrypoint wiring.

---

### Task 1: Add Pure Onboarding Metadata And Compatibility Facade

**Files:**

- Create `src/services/accountSiteOnboarding/siteTypes.ts`
- Create `src/services/accountSiteOnboarding/contracts.ts`
- Create `src/services/accountSiteOnboarding/metadata.ts`
- Modify `src/constants/siteType.ts`
- Modify `tests/constants/siteType.test.ts`
- Create `tests/services/accountSiteOnboarding/registry.test.ts`
- Create `src/services/accountSiteOnboarding/registry.ts`

- [ ] Step 1: Add failing facade and registry projection tests.

Extend `tests/constants/siteType.test.ts` to assert:

```ts
expect(isAccountSiteType(SITE_TYPES.SUB2API)).toBe(true)
expect(isManagedSiteType(SITE_TYPES.CLAUDE_CODE_HUB)).toBe(true)
expect(getAccountSiteApiRouter(SITE_TYPES.SUB2API)).toMatchObject({
  usagePath: "/usage",
  redeemPath: "/redeem",
  siteAnnouncementsPath: "/dashboard",
})
expect(ACCOUNT_SITE_DOMAIN_RULES).toContainEqual({
  name: SITE_TYPES.AIHUBMIX,
  hostnames: AIHUBMIX_HOSTNAMES,
})
```

Create `tests/services/accountSiteOnboarding/registry.test.ts` with assertions for:

```ts
expect(getAccountSiteTitleRules().map((rule) => rule.name)).toEqual(
  ACCOUNT_SITE_TITLE_RULES.map((rule) => rule.name),
)
expect(getAccountSiteDomainRules()).toEqual(ACCOUNT_SITE_DOMAIN_RULES)
expect(getAccountSiteRouteOverrides(SITE_TYPES.AIHUBMIX)).toMatchObject({
  loginPath: AIHUBMIX_LOGIN_PATH,
  usagePath: "/statistics",
  redeemPath: "/topup",
})
expect(getContentSessionExtractors().map((extractor) => extractor.id)).toEqual([
  "sub2api",
  "compatible-user",
])
```

Run the red tests:

```powershell
pnpm vitest run tests/constants/siteType.test.ts tests/services/accountSiteOnboarding/registry.test.ts
```

Expected result: new imports fail because the onboarding Module does not exist yet.

- [ ] Step 2: Move pure site-type values into `siteTypes.ts`.

Move these existing exports from `src/constants/siteType.ts` into `src/services/accountSiteOnboarding/siteTypes.ts` without changing values:

```ts
export const SITE_TYPES = {
  ONE_API: "one-api",
  NEW_API: "new-api",
  ANYROUTER: "anyrouter",
  VELOERA: "Veloera",
  ONE_HUB: "one-hub",
  DONE_HUB: "done-hub",
  V_API: "v-api",
  VO_API: "VoAPI",
  SUPER_API: "Super-API",
  RIX_API: "Rix-Api",
  NEO_API: "neo-Api",
  WONG_GONGYI: "wong-gongyi",
  SUB2API: "sub2api",
  OCTOPUS: "octopus",
  AXON_HUB: "axonhub",
  CLAUDE_CODE_HUB: "claude-code-hub",
  AIHUBMIX: "AIHubMix",
  UNKNOWN: "unknown",
} as const
```

Also move `AIHUBMIX_*`, `ACCOUNT_SITE_TYPES`, `ACCOUNT_SITE_TYPE_VALUES`, `MANAGED_SITE_TYPES`, `AccountSiteType`, and `ManagedSiteType`.

- [ ] Step 3: Add onboarding contracts.

Create `src/services/accountSiteOnboarding/contracts.ts`:

```ts
import type { AccountSiteType } from "./siteTypes"

export type AccountSiteRouteConfig = {
  loginPath?: string
  usagePath?: string
  checkInPath?: string
  adminCredentialsPath?: string
  redeemPath?: string
  siteAnnouncementsPath?: string
}

export type AccountSiteDetectionMetadata = {
  titlePatterns?: readonly RegExp[]
  hostnames?: readonly string[]
  compatUserIdHeaderNames?: readonly string[]
}

export type ContentSessionExtractionContext = {
  url?: string
  siteTypeHint?: AccountSiteType
}

export type ContentSessionExtractionResult = {
  userId: string
  user: Record<string, unknown>
  accessToken?: string
  siteTypeHint?: AccountSiteType
  sub2apiAuth?: {
    refreshToken: string
    tokenExpiresAt?: number
  }
}

export type ContentSessionExtractor = {
  id: string
  canExtract(context: ContentSessionExtractionContext): boolean
  extract(
    context: ContentSessionExtractionContext,
  ): Promise<ContentSessionExtractionResult | null>
}

export type AccountSiteOnboardingMetadata = {
  siteType: AccountSiteType
  detection?: AccountSiteDetectionMetadata
  routes?: AccountSiteRouteConfig
}
```

- [ ] Step 4: Add pure static metadata.

Create `src/services/accountSiteOnboarding/metadata.ts`. It should include:

- `makeTitleRegex(name: string): RegExp`
- `DEFAULT_SITE_ROUTE_CONFIG`
- `accountSiteOnboardingMetadata`
- `getAccountSiteMetadata(siteType)`
- `getAccountSiteTitleRuleMetadata()`
- `getAccountSiteDomainRuleMetadata()`
- `getAccountSiteRouteOverrideMetadata(siteType)`
- `getAccountSiteCompatUserIdHeaderRules()`

Populate metadata from the current `ACCOUNT_SITE_TITLE_RULES`, `ACCOUNT_SITE_DOMAIN_RULES`, and `SITE_ROUTE_CONFIGS`. For compat header metadata, convert `COMPAT_USER_ID_ERROR_HEADER_TO_SITE_TYPE` into per-site metadata here or export a normalized array from metadata:

```ts
export function getAccountSiteCompatUserIdHeaderRules() {
  return Object.entries(COMPAT_USER_ID_ERROR_HEADER_TO_SITE_TYPE).map(
    ([headerName, siteType]) => ({ siteType, headerName }),
  )
}
```

This metadata Module may import `COMPAT_USER_ID_ERROR_HEADER_TO_SITE_TYPE`; it must not import `registry.ts` or content-session extractors.

- [ ] Step 5: Convert `siteType.ts` to the compatibility facade.

`src/constants/siteType.ts` should:

- re-export constants/types from `siteTypes.ts`
- keep `isAccountSiteType(...)` and `isManagedSiteType(...)`
- derive `ACCOUNT_SITE_TITLE_RULES` from `getAccountSiteTitleRuleMetadata()`
- derive `ACCOUNT_SITE_DOMAIN_RULES` from `getAccountSiteDomainRuleMetadata()`
- keep `getSiteRouteConfigForKey(...)` and `getAccountSiteApiRouter(...)` using `merge({}, DEFAULT_SITE_ROUTE_CONFIG, getAccountSiteRouteOverrideMetadata(key))`

Keep the same public export names and object shapes.

- [ ] Step 6: Add registry projections.

Create `src/services/accountSiteOnboarding/registry.ts` with:

```ts
export function getAccountSiteOnboardingDefinition(siteType: AccountSiteType) {
  return getAccountSiteMetadata(siteType)
}

export function getAccountSiteDomainRules() {
  return getAccountSiteDomainRuleMetadata()
}

export function getAccountSiteTitleRules() {
  return getAccountSiteTitleRuleMetadata()
}

export function getAccountSiteRouteOverrides(siteType: AccountSiteType) {
  return getAccountSiteRouteOverrideMetadata(siteType)
}

export function getContentSessionExtractors(): readonly ContentSessionExtractor[] {
  return [sub2ApiContentSessionExtractor, compatibleUserContentSessionExtractor]
}
```

For this task, stub the two extractors in their future files only if TypeScript requires them. The real extractor behavior is implemented in Task 3.

- [ ] Step 7: Run the green tests and commit.

```powershell
pnpm vitest run tests/constants/siteType.test.ts tests/services/accountSiteOnboarding/registry.test.ts
```

Expected result: both test files pass.

Commit:

```powershell
git add src/services/accountSiteOnboarding/siteTypes.ts src/services/accountSiteOnboarding/contracts.ts src/services/accountSiteOnboarding/metadata.ts src/services/accountSiteOnboarding/registry.ts src/constants/siteType.ts tests/constants/siteType.test.ts tests/services/accountSiteOnboarding/registry.test.ts
git commit -m "refactor(account-site): add onboarding metadata substrate"
```

---

### Task 2: Route Site Detection Through Onboarding Projections

**Files:**

- Modify `src/services/siteDetection/detectSiteType.ts`
- Modify `tests/services/detectSiteType.test.ts`
- Modify `tests/services/detectSiteType.fallback.test.ts`
- Modify `tests/services/accountSiteOnboarding/registry.test.ts`

- [ ] Step 1: Add failing detection expectations for registry-backed fallback rules.

In `tests/services/accountSiteOnboarding/registry.test.ts`, assert compat fallback projection includes the known header mappings:

```ts
expect(getAccountSiteCompatUserIdHeaderRules()).toEqual(
  expect.arrayContaining([
    { siteType: SITE_TYPES.NEW_API, headerName: "New-Api-User" },
    { siteType: SITE_TYPES.V_API, headerName: "X-Api-User" },
  ]),
)
```

In `tests/services/detectSiteType.test.ts`, keep or add assertions that:

- AIHubMix domain detection does not fetch title.
- `New-Api-User` API errors detect `SITE_TYPES.NEW_API`.
- `X-Api-User` API errors detect `SITE_TYPES.V_API`.
- generic `User-id` API errors return `SITE_TYPES.UNKNOWN`.

Run:

```powershell
pnpm vitest run tests/services/accountSiteOnboarding/registry.test.ts tests/services/detectSiteType.test.ts tests/services/detectSiteType.fallback.test.ts
```

Expected result: either the new registry fallback export fails or tests reveal the old direct import path.

- [ ] Step 2: Change `detectSiteType.ts` imports.

Replace imports of `ACCOUNT_SITE_DOMAIN_RULES`, `ACCOUNT_SITE_TITLE_RULES`, and `COMPAT_USER_ID_ERROR_HEADER_TO_SITE_TYPE` with registry projections:

```ts
import { SITE_TYPES, type AccountSiteType } from "~/constants/siteType"
import {
  getAccountSiteCompatUserIdHeaderRules,
  getAccountSiteDomainRules,
  getAccountSiteTitleRules,
} from "~/services/accountSiteOnboarding/registry"
```

Build `COMPAT_USER_ID_HEADER_MESSAGE_RULES` from `getAccountSiteCompatUserIdHeaderRules()`:

```ts
const COMPAT_USER_ID_HEADER_MESSAGE_RULES =
  getAccountSiteCompatUserIdHeaderRules().map(({ headerName, siteType }) => ({
    siteType,
    regex: new RegExp(
      headerName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/-/g, "[-_ ]?"),
      "i",
    ),
  }))
```

Use `getAccountSiteTitleRules()` in both title matching and API-error whole-message matching. Use `getAccountSiteDomainRules()` in domain matching.

- [ ] Step 3: Run focused detection tests and commit.

```powershell
pnpm vitest run tests/services/accountSiteOnboarding/registry.test.ts tests/services/detectSiteType.test.ts tests/services/detectSiteType.fallback.test.ts
```

Expected result: all three test files pass.

Commit:

```powershell
git add src/services/siteDetection/detectSiteType.ts tests/services/detectSiteType.test.ts tests/services/detectSiteType.fallback.test.ts tests/services/accountSiteOnboarding/registry.test.ts
git commit -m "refactor(site-detection): use onboarding metadata projections"
```

---

### Task 3: Extract Content-Session Readers

**Files:**

- Create `src/services/accountSiteOnboarding/contentSession/sub2api.ts`
- Create `src/services/accountSiteOnboarding/contentSession/compatibleUser.ts`
- Modify `src/services/accountSiteOnboarding/registry.ts`
- Create `tests/services/accountSiteOnboarding/contentSession/sub2api.test.ts`
- Create `tests/services/accountSiteOnboarding/contentSession/compatibleUser.test.ts`

- [ ] Step 1: Add failing extractor tests for Sub2API.

Create `tests/services/accountSiteOnboarding/contentSession/sub2api.test.ts` by moving the Sub2API-specific assertions out of the storage-handler test shape. Cover:

- valid `auth_token` + `auth_user` returns `{ userId, user, accessToken, siteTypeHint: SITE_TYPES.SUB2API }`
- blank `auth_token` returns a typed login-required result or throws the same local login-required error the handler maps to `messages:sub2api.loginRequired`
- near-expiry token calls `POST /api/v1/auth/refresh`, updates localStorage, and returns refreshed `sub2apiAuth`
- expired refresh failure returns or throws the same login-required path
- invalid `auth_user` returns or throws the same login-required path

Use placeholder origins such as `https://sub2.example.invalid`.

- [ ] Step 2: Add failing extractor tests for compatible users.

Create `tests/services/accountSiteOnboarding/contentSession/compatibleUser.test.ts`. Cover:

```ts
localStorage.setItem(
  "user",
  JSON.stringify({ id: 42, username: "alice", role: "admin" }),
)

await expect(
  compatibleUserContentSessionExtractor.extract({
    url: "https://example.invalid",
    siteTypeHint: SITE_TYPES.NEW_API,
  }),
).resolves.toEqual({
  userId: "42",
  user: { id: 42, username: "alice", role: "admin" },
  siteTypeHint: SITE_TYPES.NEW_API,
})
```

Also cover:

- `SITE_TYPES.UNKNOWN` omits `siteTypeHint`
- AIHubMix username identity still resolves when the explicit site type hint is `SITE_TYPES.AIHUBMIX`
- missing `user` returns `null`
- malformed JSON returns `null`

Run:

```powershell
pnpm vitest run tests/services/accountSiteOnboarding/contentSession/sub2api.test.ts tests/services/accountSiteOnboarding/contentSession/compatibleUser.test.ts
```

Expected result: imports fail until extractor modules are implemented.

- [ ] Step 3: Implement `compatibleUserContentSessionExtractor`.

Create `src/services/accountSiteOnboarding/contentSession/compatibleUser.ts`:

```ts
import { isAccountSiteType, SITE_TYPES } from "~/constants/siteType"
import { resolveStoredAccountUserIdentity } from "~/services/accounts/accountIdentity"
import type { ContentSessionExtractor } from "../contracts"

export const compatibleUserContentSessionExtractor: ContentSessionExtractor = {
  id: "compatible-user",
  canExtract: () => true,
  async extract(context) {
    const rawUser = localStorage.getItem("user")
    if (!rawUser) return null

    let user: unknown
    try {
      user = JSON.parse(rawUser)
    } catch {
      return null
    }

    const siteType = isAccountSiteType(context.siteTypeHint)
      ? context.siteTypeHint
      : SITE_TYPES.UNKNOWN
    const identity = resolveStoredAccountUserIdentity(user, siteType)
    if (!identity) return null

    return {
      ...identity,
      ...(siteType !== SITE_TYPES.UNKNOWN ? { siteTypeHint: siteType } : {}),
    }
  },
}
```

- [ ] Step 4: Implement `sub2ApiContentSessionExtractor`.

Move the following logic out of `storage.ts` into `src/services/accountSiteOnboarding/contentSession/sub2api.ts`:

- `SUB2API_AUTH_STORAGE_KEYS`
- `SUB2API_TOKEN_REFRESH_BUFFER_MS`
- `Sub2ApiEnvelope`
- `Sub2ApiRefreshTokenData`
- `tryParseTimestamp(...)`
- `refreshSub2ApiTokensIfNeeded(...)`
- parsing via `parseSub2ApiUserIdentity(...)`

Keep the behavior identical:

- `canExtract(...)` returns true only when both `auth_token` and `auth_user` exist.
- blank token maps to the login-required path.
- refresh endpoint is `new URL("/api/v1/auth/refresh", context.url).toString()` when `context.url` is present, otherwise `"/api/v1/auth/refresh"`.
- successful refresh writes `auth_token`, `refresh_token`, and `token_expires_at` back to localStorage.
- returned data includes `sub2apiAuth` only when a refresh token is available.
- no token value is logged.

Use a small local error sentinel so the handler can preserve `messages:sub2api.loginRequired` without string matching:

```ts
export class Sub2ApiContentSessionLoginRequiredError extends Error {
  constructor() {
    super("messages:sub2api.loginRequired")
  }
}
```

- [ ] Step 5: Wire registry extractor order and run tests.

Update `getContentSessionExtractors()` to return:

```ts
return [sub2ApiContentSessionExtractor, compatibleUserContentSessionExtractor]
```

Run:

```powershell
pnpm vitest run tests/services/accountSiteOnboarding/registry.test.ts tests/services/accountSiteOnboarding/contentSession/sub2api.test.ts tests/services/accountSiteOnboarding/contentSession/compatibleUser.test.ts
```

Expected result: all registry/extractor tests pass.

Commit:

```powershell
git add src/services/accountSiteOnboarding/registry.ts src/services/accountSiteOnboarding/contentSession/sub2api.ts src/services/accountSiteOnboarding/contentSession/compatibleUser.ts tests/services/accountSiteOnboarding/registry.test.ts tests/services/accountSiteOnboarding/contentSession/sub2api.test.ts tests/services/accountSiteOnboarding/contentSession/compatibleUser.test.ts
git commit -m "refactor(content-session): extract account onboarding readers"
```

---

### Task 4: Route Content Storage Handler Through Extractors

**Files:**

- Modify `src/entrypoints/content/messageHandlers/handlers/storage.ts`
- Modify `tests/entrypoints/content/messageHandlers/handlers/storage.test.ts`

- [ ] Step 1: Add failing handler tests for extractor ordering and errors.

In `tests/entrypoints/content/messageHandlers/handlers/storage.test.ts`, mock `~/services/accountSiteOnboarding/registry` in a new describe block or use the real extractors in existing cases. Add coverage that:

- the first extractor returning a result wins and later extractors are not called
- a false `canExtract(...)` skips that extractor
- no extractor result returns `{ success: false, error: "messages:content.userInfoNotFound" }`
- unexpected extractor errors still return `{ success: false, error: "..." }`
- Sub2API login-required errors still return `"messages:sub2api.loginRequired"`

Run:

```powershell
pnpm vitest run tests/entrypoints/content/messageHandlers/handlers/storage.test.ts
```

Expected result: ordering/error tests fail because `storage.ts` still owns hard-coded branches.

- [ ] Step 2: Simplify `storage.ts` imports.

Remove these from `src/entrypoints/content/messageHandlers/handlers/storage.ts`:

- `resolveStoredAccountUserIdentity`
- `parseSub2ApiUserIdentity`
- `SUB2API_AUTH_STORAGE_KEYS`
- `SUB2API_TOKEN_REFRESH_BUFFER_MS`
- `tryParseTimestamp(...)`
- `refreshSub2ApiTokensIfNeeded(...)`
- Sub2API envelope types

Keep:

- `handleGetLocalStorage(...)`
- `getErrorMessage(...)`
- `t(...)`
- `isAccountSiteType`
- `SITE_TYPES`

Add:

```ts
import {
  getContentSessionExtractors,
} from "~/services/accountSiteOnboarding/registry"
import {
  Sub2ApiContentSessionLoginRequiredError,
} from "~/services/accountSiteOnboarding/contentSession/sub2api"
```

- [ ] Step 3: Route `handleGetUserFromLocalStorage(...)` through extractors.

Replace the current hard-coded Sub2API and generic user branches with:

```ts
const context = {
  url: typeof request?.url === "string" ? request.url : undefined,
  siteTypeHint: isAccountSiteType(request?.siteType)
    ? request.siteType
    : SITE_TYPES.UNKNOWN,
}

for (const extractor of getContentSessionExtractors()) {
  if (!extractor.canExtract(context)) continue
  const result = await extractor.extract(context)
  if (!result) continue

  sendResponse({
    success: true,
    data: result,
  })
  return
}

sendResponse({
  success: false,
  error: t("messages:content.userInfoNotFound"),
})
```

In the surrounding `catch`, preserve the Sub2API login-required mapping:

```ts
if (error instanceof Sub2ApiContentSessionLoginRequiredError) {
  sendResponse({
    success: false,
    error: t("messages:sub2api.loginRequired"),
  })
  return
}
sendResponse({ success: false, error: getErrorMessage(error) })
```

- [ ] Step 4: Run handler and extractor tests.

```powershell
pnpm vitest run tests/entrypoints/content/messageHandlers/handlers/storage.test.ts tests/services/accountSiteOnboarding/contentSession/sub2api.test.ts tests/services/accountSiteOnboarding/contentSession/compatibleUser.test.ts
```

Expected result: all listed tests pass.

Commit:

```powershell
git add src/entrypoints/content/messageHandlers/handlers/storage.ts tests/entrypoints/content/messageHandlers/handlers/storage.test.ts
git commit -m "refactor(content-session): route storage handler through extractors"
```

---

### Task 5: Integration Validation And Scope Check

**Files:**

- No new files expected unless prior tasks expose type-only import fallout.

- [ ] Step 1: Run the focused validation set.

```powershell
pnpm vitest run tests/constants/siteType.test.ts tests/services/accountSiteOnboarding/registry.test.ts tests/services/accountSiteOnboarding/contentSession/sub2api.test.ts tests/services/accountSiteOnboarding/contentSession/compatibleUser.test.ts tests/services/detectSiteType.test.ts tests/services/detectSiteType.fallback.test.ts tests/entrypoints/content/messageHandlers/handlers/storage.test.ts
```

Expected result: all focused tests pass.

- [ ] Step 2: Run TypeScript validation.

```powershell
pnpm compile
```

Expected result: `tsc --noEmit` passes.

- [ ] Step 3: Inspect final diff for scope drift.

```powershell
git status --porcelain
git diff --stat HEAD
git diff HEAD -- src/services/accountSiteOnboarding src/constants/siteType.ts src/services/siteDetection/detectSiteType.ts src/entrypoints/content/messageHandlers/handlers/storage.ts tests/constants/siteType.test.ts tests/services/accountSiteOnboarding tests/services/detectSiteType.test.ts tests/services/detectSiteType.fallback.test.ts tests/entrypoints/content/messageHandlers/handlers/storage.test.ts
```

Confirm the diff does not touch:

- `src/services/apiAdapters/**`
- `src/services/apiService/**`
- Account Dialog UI policy
- locale files
- telemetry schemas
- settings search
- Playwright E2E

- [ ] Step 4: Run commit gate for task-scoped staged files.

Stage only task-scoped implementation files, then run:

```powershell
pnpm run validate:staged
```

Expected result: lint-staged and staged i18n check pass.

- [ ] Step 5: Run push gate before publishing or opening a PR.

```powershell
pnpm run validate:push
```

Expected result: `pnpm compile` and `pnpm knip` pass.

- [ ] Step 6: Final handoff.

Report:

- commit hashes created by each task
- focused Vitest command result
- `pnpm compile` result
- `pnpm run validate:staged` result
- `pnpm run validate:push` result if publishing is next
- telemetry decision: reused existing
- E2E decision: no new E2E, focused Vitest is the coverage layer
- any unrelated pre-existing local files left untouched

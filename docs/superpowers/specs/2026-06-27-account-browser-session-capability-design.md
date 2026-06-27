# Account Browser Session Capability Design

Date: 2026-06-27

## Purpose

Move account-site browser-session reads behind a small, site-aware Module so
product callers no longer duplicate tab scanning, content-script messages, and
temp-window fallback logic.

This design closes the remaining useful part of
`sub2api-capability-refactor-handoff.md`: browser-session identity resolution
and session import. The authenticated API capability work from that handoff has
already moved into existing Site Adapter Capabilities such as
`accountBootstrap`, `accountCompletion`, `accountData`, `keyManagement`,
`tokenProvisioning`, `accountRefresh`, and `modelCatalog`.

## Current Context

Sub2API browser pages persist dashboard session state in `localStorage`:

- `auth_token`
- `auth_user`
- `refresh_token`
- `token_expires_at`

The content-script extraction code already knows how to parse and refresh that
state through `ContentSessionExtractor` implementations under
`src/services/accountSiteOnboarding/contentSession/`.

The problem is not extraction inside the page. The remaining duplicated
product logic is how callers find a usable browser context and ask that context
for the session:

- `src/services/siteDetection/autoDetectService.ts`
  - reads the current tab through `RuntimeActionIds.ContentGetUserFromLocalStorage`
  - falls back to API identity when content-session data is unavailable
- `src/features/AccountManagement/hooks/AccountDataContext.tsx`
  - reads the active tab to match the current page user to a saved account
- `src/features/AccountManagement/components/AccountDialog/hooks/useAccountDialog.ts`
  - scans same-origin tabs, imports Sub2API refresh-token state, and falls back
    to `RuntimeActionIds.AutoDetectSite`
- `src/services/apiService/sub2api/tokenResync.ts`
  - scans same-origin tabs, reads the access token, and falls back to
    `RuntimeActionIds.AutoDetectSite`

The current shape works, but each caller has to understand too much about the
browser-message protocol and fallback ordering.

## Problem

The current browser-session Interface is shallow.

Callers that only need "read the browser session for this account site" must
know:

1. whether the browser has tab access
2. how to find same-origin tabs
3. how to prioritize active tabs
4. which runtime action reads `localStorage`
5. which runtime action opens a temp-window fallback
6. how to normalize the returned user id, user object, access token, and
   Sub2API refresh-token metadata
7. which missing fields make a result useful for account matching, session
   import, or token re-sync

Deletion test: if the repeated tab/message/fallback logic is deleted from the
callers, it should reappear once inside an account browser-session Module, not
as another scattered helper in each product flow.

## Goals

- Add a focused account browser-session Module that can read account-site
  browser-session identity from:
  - a specific current tab
  - same-origin existing tabs
  - the existing temp-window auto-detect fallback
- Preserve current Sub2API behavior:
  - current-tab user matching
  - existing-tab-first session import
  - temp-window fallback for session import
  - token re-sync access-token recovery
  - refresh-token and expiry propagation for Sub2API
  - incognito and Firefox container context propagation where already present
- Keep `ContentSessionExtractor` as the content/page extraction owner.
- Keep `SiteAdapter` authenticated API capabilities as they are.
- Make product callers consume browser-session results instead of raw runtime
  message protocols.
- Keep the first implementation focused on Sub2API because it is the only
  current site type that needs refresh-token browser-session import.

## Non-Goals

- Do not redesign existing `SiteAdapter` capabilities.
- Do not move API-authenticated identity fetch out of `accountBootstrap`.
- Do not rewrite Sub2API token refresh protocol logic inside
  `accountSiteOnboarding/contentSession/sub2api.ts`.
- Do not change saved account storage shape.
- Do not add new user-facing copy, locale keys, settings search entries, or
  product telemetry fields.
- Do not add Playwright E2E coverage unless implementation exposes a browser
  runtime gap that lower-level tests cannot cover.
- Do not generalize this into a cross-backend auth-storage abstraction.

## Approaches Considered

### Approach A: Keep The Current Per-Caller Logic

This avoids churn, but keeps browser-message knowledge spread across UI,
account detection, and Sub2API protocol recovery. It provides low locality:
changing fallback order or message shape requires auditing several unrelated
callers.

### Approach B: Add A Broad `SiteAdapter.browserSession` Capability

This would put browser-session behavior next to authenticated API capabilities.
It is conceptually clean, but it risks making `SiteAdapter` responsible for
browser orchestration, content-script messaging, and temp-window behavior. That
would mix two seams that currently vary for different reasons:

- `SiteAdapter` owns account-site API capabilities.
- `ContentSessionExtractor` owns page-local session extraction.
- Browser orchestration owns how extension contexts reach the page.

This approach is too broad for the current need.

### Approach C: Add A Browser-Session Orchestrator Module

Create a service Module that owns browser-context selection and runtime-message
fallbacks, while delegating page-local extraction to the existing content
session extractors.

This is the recommended path. It gives product callers a deeper Interface:
"resolve browser session for this account site" instead of "scan tabs, send
runtime messages, parse response, then decide if the result is useful."

## Design

### 1. Add Account Browser-Session Types

Create a new service area:

```text
src/services/accountBrowserSession/
```

The public contract should be small and result-focused:

```ts
import type { ApiServiceFetchContext } from "~/services/apiService/common/type"

export const ACCOUNT_BROWSER_SESSION_SOURCES = {
  CURRENT_TAB: "current_tab",
  EXISTING_TAB: "existing_tab",
  TEMP_WINDOW: "temp_window",
} as const

export type AccountBrowserSessionSource =
  (typeof ACCOUNT_BROWSER_SESSION_SOURCES)[keyof typeof ACCOUNT_BROWSER_SESSION_SOURCES]

export type AccountBrowserSessionFetchContext = ApiServiceFetchContext

export type AccountBrowserSession = {
  source: AccountBrowserSessionSource
  siteType: AccountSiteType
  userId: string
  user: Record<string, unknown>
  accessToken?: string
  sub2apiAuth?: Sub2ApiAuthConfig
  fetchContext?: AccountBrowserSessionFetchContext
}
```

The interface should not expose runtime message response objects. It returns a
normalized account browser-session result or `null`.

### 2. Provide Three Read Entry Points

The Module should expose three operations:

```ts
readAccountBrowserSessionFromTab(params)
readAccountBrowserSessionFromExistingTabs(params)
resolveAccountBrowserSession(params)
```

Responsibilities:

- `readAccountBrowserSessionFromTab(...)`
  - send `RuntimeActionIds.ContentGetUserFromLocalStorage`
  - normalize successful responses
  - return `null` for missing, failed, or unusable responses
  - preserve the current-tab fetch context when provided
- `readAccountBrowserSessionFromExistingTabs(...)`
  - parse target origin
  - check tab capability
  - list tabs
  - keep same-origin tabs only
  - sort active tabs first
  - call `readAccountBrowserSessionFromTab(...)`
  - accept an optional predicate such as `isUsableSession`
- `resolveAccountBrowserSession(...)`
  - try a specific current tab when supplied
  - optionally try same-origin existing tabs
  - optionally call temp-window auto-detect
  - normalize the temp-window result into the same result shape
  - accept an optional predicate to choose whether a partial result is enough

### 3. Keep Content Extraction In Account Site Onboarding

Do not duplicate `localStorage` parsing in the new Module.

The content-script handler should continue to use
`ContentSessionExtractor` implementations. The new Module only orchestrates
which browser context to ask and how to normalize the answer.

### 4. Migrate Current-Tab Account Matching

`AccountDataContext` should use
`readAccountBrowserSessionFromTab(...)` for active-tab user matching.

It should keep its current cache and dedupe behavior, but it should no longer
build the raw `ContentGetUserFromLocalStorage` message itself.

The matching contract remains:

- same-origin accounts are detected first
- user-level match is attempted only when same-origin accounts exist
- failed reads do not block site-level detection
- verified user identity is cached by tab id and URL

### 5. Migrate Sub2API Session Import

`useAccountDialog` should use
`resolveAccountBrowserSession(...)` with:

- `siteType: SITE_TYPES.SUB2API`
- existing-tab search enabled
- temp-window fallback enabled
- `isUsableSession` requiring `sub2apiAuth.refreshToken`

The UI-specific behavior stays in the hook:

- URL validation
- analytics result classification
- toast messages
- draft updates

The browser-session Module supplies the normalized session only.

### 6. Migrate Sub2API Token Re-Sync

`src/services/apiService/sub2api/tokenResync.ts` should consume
`resolveAccountBrowserSession(...)` with:

- `siteType: SITE_TYPES.SUB2API`
- existing-tab search enabled
- temp-window fallback enabled
- `isUsableSession` requiring a non-empty `accessToken`

It should preserve the current public return shape:

```ts
type Sub2ApiResyncedToken = {
  accessToken: string
  source:
    | typeof ACCOUNT_BROWSER_SESSION_SOURCES.EXISTING_TAB
    | typeof ACCOUNT_BROWSER_SESSION_SOURCES.TEMP_WINDOW
}
```

If the new Module returns `ACCOUNT_BROWSER_SESSION_SOURCES.CURRENT_TAB` in this
path, map it to `ACCOUNT_BROWSER_SESSION_SOURCES.EXISTING_TAB` because token
re-sync's public contract only exposes the two existing categories.

### 7. Keep Auto-Detect Fallback Semantics Stable

`autoDetectService` already has broader detection responsibilities. Do not
replace the entire service in this slice.

Only route the direct current-tab content-session read through the new Module
where it reduces message-protocol knowledge. Preserve existing API fallback,
background fallback, analytics context, and failure-reason behavior.

## Error Handling

- A content-script failure should return `null` from browser-session read
  helpers, with debug logging where the caller previously logged.
- A temp-window failure should return `null` unless the existing caller already
  surfaces an error. UI hooks should continue to own user-visible error copy.
- Missing `refreshToken` is not an exception for the Module. It is a predicate
  decision made by the caller.
- Missing `accessToken` is not an exception for the Module. It is a predicate
  decision made by the caller.
- The Module must not log tokens, refresh tokens, cookies, raw URLs beyond
  existing safe origin/base URL logging patterns, or full response payloads.

## Telemetry Decision

Telemetry decision: reuse existing.

This refactor does not introduce a new user action or product state. Existing
analytics for account auto-detect and Sub2API session import should remain at
the product caller layer.

## Settings Search Decision

Settings search decision: none.

No settings UI, route, anchor, or search definition changes.

## E2E Decision

E2E decision: no new Playwright E2E by default.

The main risk is service orchestration and fallback ordering, which can be
covered with focused Vitest tests around browser API mocks. Add Playwright only
if implementation changes extension runtime routing or temp-window behavior in
a way existing tests cannot exercise.

## Testing Strategy

Use TDD for each migration slice.

Add focused unit tests for the new browser-session Module:

- reads and normalizes a successful tab content-session response
- returns `null` when the content-session response fails
- filters existing tabs by same origin and tries the active tab first
- falls back from existing tabs to temp-window auto-detect
- honors an `isUsableSession` predicate so Sub2API import can require a
  refresh token while token re-sync can require only an access token
- preserves current-tab fetch-context metadata

Update caller tests:

- `AccountDataContext` keeps user-level active-tab matching behavior while
  delegating browser-session reads
- `useAccountDialog` imports Sub2API refresh-token state through the new Module
  and still shows the existing missing-session feedback when no refresh token
  is available
- `tokenResync.ts` returns the same public result shape while delegating
  browser-session recovery
- `autoDetectService` preserves current-tab and temp-window fallback behavior
  after removing direct message-protocol wiring where practical

## Validation Plan

Focused validation:

```powershell
pnpm vitest run tests/services/accountBrowserSession
pnpm vitest run tests/services/apiService/sub2api/tokenResync.test.ts
pnpm vitest run tests/features/AccountManagement/hooks/useAccountDialog.sub2apiConstraints.test.tsx
pnpm vitest run tests/features/AccountManagement/hooks/AccountDataContext.test.tsx
pnpm vitest run tests/services/siteDetection/autoDetectService.test.ts
```

Type validation:

```powershell
pnpm compile
```

Commit gate:

```powershell
pnpm run validate:staged
```

If shared exports, runtime actions, background temp-window routing, or content
message handlers change, run before pushing:

```powershell
pnpm run validate:push
```

If the implementation changes temp-window runtime behavior, also run the
relevant temp-window suites:

```powershell
pnpm vitest run tests/entrypoints/background/tempWindowPoolWindowFallback.test.ts tests/entrypoints/background/tempWindowPoolNativeCheckin.test.ts
```

## Rollout

1. Add the browser-session contract and tests.
2. Implement the service Module over existing browser API helpers and runtime
   actions.
3. Migrate `tokenResync.ts` to prove the access-token recovery use case first.
4. Migrate Sub2API session import in `useAccountDialog`.
5. Migrate active-tab user matching in `AccountDataContext`.
6. Migrate the current-tab read in `autoDetectService` only where it preserves
   existing detection semantics.
7. Run focused tests and type validation.
8. Run `pnpm run validate:staged`, inspect the final diff, and commit.
9. Run `pnpm run validate:push` before pushing or opening a PR.

## Follow-Up, Not In Scope

- If a second site type needs browser-session import, add its content-session
  extractor first, then decide whether the browser-session Module needs a
  capability registry.
- If several callers need richer source metadata, add it to the normalized
  result instead of leaking raw runtime responses.
- If temp-window behavior becomes more general than auto-detect, consider a
  dedicated temp-window browser-session runtime action in a separate slice.

# Sub2API Adapter Seam Separation Design

Date: 2026-06-08

## Purpose

Separate Sub2API's JWT-session and browser-session behavior from shared
business logic so that Sub2API no longer relies on incompatible common
`apiService` fallbacks such as `/api/user/self`.

The first implementation phase should fix the current seam for Sub2API only.
It should make required Sub2API overrides explicit, tighten fallback policy,
and keep the broader `apiService` capability redesign out of scope for now.

## Current Context

`src/services/apiService/index.ts` resolves helpers by checking the site
override map first and then falling back to `commonAPI` when the site adapter
does not export the requested helper.

That fallback model works for One-API/New-API-family compatibility buckets,
but Sub2API is not one of those buckets:

- Sub2API current-user reads use `GET /api/v1/auth/me`.
- Sub2API account and key requests depend on bearer JWT auth.
- Sub2API may recover or refresh bearer auth from `refresh_token` and
  `token_expires_at`.
- Sub2API browser pages persist `auth_token`, `auth_user`, `refresh_token`,
  and `token_expires_at` in `localStorage`.
- `GET /api/v1/auth/me` is an authenticated identity endpoint, not a browser
  session discovery endpoint. It cannot discover a page's current
  `refresh_token` unless the extension already has usable auth material.

The repo already contains working Sub2API-specific logic in the adapter layer:

- `fetchCurrentUser()` reads `/api/v1/auth/me`.
- `executeAuthenticatedSub2ApiRequest()` refreshes or re-syncs JWT auth for
  adapter-owned requests.
- `tokenResync.ts` can recover auth from an existing tab or temp window.
- the content message handler can read Sub2API session state from
  `localStorage`.

The architectural problem is that these capabilities are not the primary seam
for all Sub2API identity flows. Shared business logic still calls generic
helpers such as `fetchUserInfo()` and `getOrCreateAccessToken()` through
`getApiService(siteType)`, which silently falls back to common One-API-style
helpers when Sub2API does not override them.

## Problem

The current seam is shallow for incompatible site types:

- `getApiService(SITE_TYPES.SUB2API).fetchUserInfo(...)` falls back to
  `common.fetchUserInfo()`, which calls `/api/user/self`.
- `getApiService(SITE_TYPES.SUB2API).getOrCreateAccessToken(...)` falls back to
  `common.getOrCreateAccessToken()`, which depends on `/api/user/self` and
  `/api/user/token`.
- shared business logic cannot tell whether a helper is truly implemented for
  Sub2API or only inherited through an incompatible fallback.
- the adapter already knows how to restore Sub2API auth, but some call paths
  bypass that adapter knowledge and force business-layer repair logic.

This creates three kinds of friction:

1. Real protocol mismatch: Sub2API can hit incompatible common endpoints.
2. Poor locality: identity and session concerns are split between adapter code
   and business code.
3. Weak test surface: missing adapter overrides do not fail fast; they degrade
   into incorrect common behavior.

There is also an important semantic mismatch hidden inside the shared helper
names:

- authenticated identity fetch: "who is this account, given valid auth?"
- browser-session identity resolution: "who is currently logged into this page?"

For Sub2API, those are related but different operations. The first can often be
API-only; the second still depends on browser-session state.

## Goals

- Make Sub2API an explicit non-common site adapter for account identity and
  token flows.
- Prevent silent fallback from Sub2API to incompatible common helpers.
- Move Sub2API identity-fetch and token-fetch semantics behind explicit
  Sub2API adapter overrides.
- Preserve the existing browser-session import and token re-sync behavior,
  while making business callers depend on adapter-owned entrypoints instead of
  protocol assumptions.
- Keep the change narrow enough to implement in a focused first phase.

## Non-Goals

- Do not redesign the full `apiService` interface for every incompatible site
  type in this phase.
- Do not introduce a new generic capability registry across all site adapters
  yet.
- Do not remove the current Sub2API browser-session read path from content
  scripts or temp-window flows.
- Do not try to replace current browser-session import/recovery flows with
  `fetchUserInfo()`.
- Do not change user-facing Sub2API account import, refresh, key management, or
  auto-detect behavior beyond routing them through the correct adapter seam.
- Do not broaden this phase into AIHubMix or other adapter families.

## Design

### 1. Treat Sub2API As A Strict Override Site

`SITE_TYPES.SUB2API` should join `strictOverrideSites`.

That means: when shared callers request a helper that Sub2API does not
explicitly implement, the system should fail fast instead of silently calling
`commonAPI`.

This is the correct seam because Sub2API is not a partial compatibility bucket.
It is a different auth/session model with adapter-owned behavior. Fast failure
will expose missing overrides during development and tests rather than at
runtime against the wrong upstream contract.

### 2. Make Current-Identity Fetch An Explicit Sub2API Override

Sub2API should export `fetchUserInfo(request)` as an adapter override.

This override should:

- require access-token auth, not cookie auth
- call `/api/v1/auth/me`
- parse the response using existing Sub2API parsing helpers
- return the shared `UserInfo` shape expected by existing callers

This override is specifically for authenticated identity fetch when the adapter
already has usable auth material. It is not a replacement for browser-session
discovery or session import from an already-open Sub2API page.

The main purpose is not to invent a new shared abstraction. It is to ensure
that existing callers which still expect `fetchUserInfo()` now hit a truthful
Sub2API implementation instead of common fallback behavior.

`fetchCurrentUser()` should remain the deeper internal module for Sub2API's
normalized account identity. `fetchUserInfo()` becomes a compatibility adapter
over that deeper module.

### 3. Make Access-Token Resolution An Explicit Sub2API Override

Sub2API should export `getOrCreateAccessToken(request)` as an adapter override.

For Sub2API, "get or create access token" does not mean "read `/api/user/self`
and create `/api/user/token` if missing." It means:

- if a valid `auth.accessToken` already exists, use it
- if it is expired and a refresh token exists, refresh it
- if adapter-owned refresh fails but browser-session recovery is available,
  re-sync from browser session
- if none of those paths produce a usable bearer token, return a login-required
  error

This keeps Sub2API token lifecycle knowledge inside the adapter, where the
refresh and re-sync logic already lives.

In other words, API-only operation is sufficient when Sub2API auth material is
already present in the request or persisted account state. API-only operation is
not sufficient for the separate problem of discovering/importing auth material
from an already-logged-in browser page.

The first phase does not need to rename this helper globally. It only needs to
override the existing shared helper name with truthful Sub2API semantics.

### 4. Preserve Browser-Session Identity Reads As Adapter-Owned Support Logic

The current content-script path that reads Sub2API `localStorage` remains
necessary in phase 1.

It serves two distinct use cases:

- identifying which account is currently logged into an already-open Sub2API
  page
- recovering or importing a Sub2API browser session that includes refresh-token
  state

This remains necessary because `/api/v1/auth/me` only works after the extension
already has valid bearer auth. It does not discover the page's current
`refresh_token`, and therefore cannot replace browser-session import/recovery by
itself.

Those are not equivalent to generic current-user API fetches. The design for
this phase is therefore:

- keep `ContentGetUserFromLocalStorage`
- keep `tokenResync.ts`
- keep the current `auth_user` parsing path
- stop treating these as business-layer protocol knowledge
- treat them as Sub2API adapter support modules

Business logic may still call these paths indirectly in phase 1, but the design
goal is that their ownership is explicitly Sub2API-specific and not part of
`commonAPI` semantics.

### 5. Restrict Phase-1 Surface To Concrete Missing Overrides

The first phase should only require the overrides that are already known to be
unsafe when inherited from `commonAPI`.

Required phase-1 overrides:

- `fetchUserInfo`
- `getOrCreateAccessToken`

Recommended phase-1 review targets, to confirm whether explicit Sub2API
implementations are also needed now:

- `validateAccountConnection`
- `fetchAccountQuota`

If these review targets are not used by active Sub2API flows in this phase,
they can stay for a later pass. The important rule is that phase 1 must close
the confirmed wrong-path calls, not redesign every helper preemptively.

## Business-Logic Integration

This phase should simplify business callers by making Sub2API truthfully answer
the helpers they already use.

Impacted caller families include:

- auto-detect API fallback logic
- account add/edit flows that resolve an access token or user profile
- current-tab account matching flows that must identify the page's active login
- Sub2API refresh flows that currently rely on `authUpdate`

The desired direction is:

- shared business logic keeps calling `getApiService(siteType)`
- Sub2API returns adapter-owned behavior for the helpers it supports
- missing Sub2API helpers fail loudly because Sub2API is strict

This improves locality without forcing the broader capability redesign in the
same change.

## Validation Plan

Focused validation:

- add or update Sub2API adapter tests that prove `fetchUserInfo()` calls
  `/api/v1/auth/me`
- add or update tests that prove Sub2API no longer falls back to common
  `/api/user/self`
- add or update tests that prove `getOrCreateAccessToken()` for Sub2API uses
  existing bearer auth / refresh / re-sync semantics rather than common token
  creation semantics
- add or update tests for the strict override failure path when Sub2API is
  missing a required helper

Integration-focused checks:

- run affected tests for `autoDetectService`
- run affected tests for `accountOperations`
- run affected Sub2API adapter tests

Repository validation:

- run the focused Vitest set for touched Sub2API/account-detection/account
  operation files
- run `pnpm run validate:staged` before commit

## Follow-Up, Not In Scope For This Spec

The broader `apiService` redesign for incompatible site capabilities should be
handled as a separate second phase.

That later phase may introduce explicit optional adapter capabilities for
concepts such as:

- authenticated identity fetch
- browser-session identity resolution
- auth restoration / session recovery

The important boundary discovered during phase-1 investigation is:

- authenticated identity fetch can be API-only
- browser-session identity resolution cannot be reduced to generic
  `fetchUserInfo()`
- browser-session auth import/recovery cannot be reduced to generic
  `getOrCreateAccessToken()`

This spec intentionally does not define that broader interface. It only creates
the correct seam for Sub2API now and prevents further spread of incompatible
fallback behavior.

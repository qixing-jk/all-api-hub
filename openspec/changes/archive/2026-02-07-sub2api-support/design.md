## Context

All API Hub currently targets One-API/New-API-like relay sites where:

- Identity is derived from either browser cookies or an “access token” created via cookie-auth.
- Balance/quota is fetched via `/api/user/self` (or similar) and interpreted as the extension’s internal `quota` unit.
- Auto-detect reads `localStorage["user"]` (when present) and otherwise falls back to API calls using cookie auth.

Sub2API-based sites differ in two important ways:

- The dashboard uses an access token (JWT) for `/api/v1/*` endpoints, and persists session state in localStorage (not in a One-API-style `user` object). Modern Sub2API builds also include a refresh-token flow with localStorage keys like `refresh_token` and `token_expires_at`.
- The most reliable balance source is the authenticated current-user endpoint `GET /api/v1/auth/me`, which requires `Authorization: Bearer <jwt>`.

Therefore, adding “Sub2API support” in this repo means supporting a dashboard-session-backed account type whose credentials must be acquired from a logged-in dashboard context (content script / temp window) and refreshed opportunistically by re-reading localStorage (and, when available, using the refresh-token endpoint to rotate access tokens in-page).

## Goals / Non-Goals

**Goals:**

- Add a new `sub2api` site type and a Sub2API API implementation that fetches balance from `GET /api/v1/auth/me`.
- Enable auto-detect for Sub2API accounts by reading Sub2API dashboard localStorage keys:
  - `auth_token` (JWT)
  - `refresh_token` (optional; refresh token that may rotate)
  - `token_expires_at` (optional; absolute expiry timestamp in ms for `auth_token`)
  - `auth_user` (contains `id`, `username`, `balance`, etc.)
- Persist Sub2API accounts using the existing account schema by mapping:
  - `account_info.id` ← `auth_user.id`
  - `account_info.username` ← `auth_user.username`
  - `account_info.access_token` ← `auth_token` (JWT)
  - `account_info.quota` ← `round(balanceUsd * CONVERSION_FACTOR)`
  - (Not persisted) keep refresh tokens in the site page localStorage only; do not store `refresh_token` in extension storage/export.
- Enforce JWT-only behavior for Sub2API accounts (no API-key-only mode).
- Improve refresh resilience: when the stored access token is missing/expired or returns HTTP 401, re-read Sub2API auth state from localStorage (best-effort refreshing via `refresh_token` when available) and retry once, then persist the updated access token.

**Non-Goals:**

- Implementing a login UI or exchanging credentials for JWTs (the extension will not “sign in” to Sub2API).
- Supporting Sub2API “API key only” flows for balance (explicitly out of scope for this change).
- Adding check-in support (Sub2API does not expose a compatible check-in concept for this extension).
- Full usage/income breakdown for Sub2API accounts (initial version focuses on remaining balance; other stats can default to 0).

## Decisions

### 1) Detect Sub2API via localStorage, not HTML title

**Decision:** When localStorage contains both `auth_token` and a parseable `auth_user` with `id` and `username`, treat the site as Sub2API by providing a `siteTypeHint = "sub2api"` as part of the auto-detect result.

**Rationale:**

- Many deployments may change branding/title, making title-based detection unreliable.
- These localStorage keys are strongly indicative of Sub2API’s official frontend behavior.
- This also guarantees auto-detect has access to the JWT, which is required for `/api/v1/auth/me`.

**Alternatives considered:**

- HTML title regex (`/sub2api/i`): simple but brittle across branded deployments.
- Probing public endpoints: `/api/v1/auth/me` without auth returns 401 on many systems, not uniquely identifying Sub2API.

### 2) Reuse existing account model; store JWT as `access_token`

**Decision:** Represent Sub2API credentials using the existing `SiteAccount.account_info.access_token` field, and mark the account as `AuthTypeEnum.AccessToken`.

**Rationale:**

- Minimizes schema changes and keeps refresh/export flows consistent.
- The existing API helper stack already supports `Authorization: Bearer <token>` for access-token auth.
- Keeps future enhancements open (e.g., using the same stored JWT to query more `/api/v1/*` endpoints).

**Alternatives considered:**

- Adding a new auth enum (`jwt`) or a separate credential field: clearer semantics but higher migration and UI cost.

### 3) Add a Sub2API API module that understands `{ code, message, data }`

**Decision:** Implement a Sub2API-specific request/parse helper that treats `code !== 0` (when present) as an error, even if HTTP status is 200, and then extracts `data`.

**Rationale:**

- Sub2API’s frontend expects a standard envelope `{ code, message, data }` and rejects when `code != 0`.
- The extension’s generic `fetchApiData` only checks `success === false`; without this decision we may silently treat error responses as valid and write incorrect account state.

**Alternatives considered:**

- Using the generic `fetchApiData` and hoping Sub2API always uses non-2xx for errors: insufficiently robust.

### 4) Token refresh: piggyback on dashboard refresh tokens (when available)

**Decision:** Treat the Sub2API dashboard localStorage as the source of truth. When `refresh_token` + `token_expires_at` are available, refresh and rotate tokens inside the *page context* (content script) before returning an access token to the extension. The extension does **not** persist refresh tokens in its own storage.

1. The content-script storage handler reads `auth_token` + `auth_user`. If `refresh_token` + `token_expires_at` exist and the access token is close to expiry (or already expired), call `POST /api/v1/auth/refresh` with `{ refresh_token }`, then update `auth_token`, `refresh_token`, and `token_expires_at` in localStorage.
2. On refresh, call `/api/v1/auth/me` with the stored `auth_token`.
3. If the request returns HTTP 401, re-sync Sub2API auth state from a matching-origin tab or temp-window context (which triggers step 1), then retry `/api/v1/auth/me` once with the latest token.
4. If successful, return an `authUpdate` payload so `accountStorage.refreshAccount` can persist the updated access token (and updated user id/username if changed).

**Rationale:**

- Refresh tokens rotate and may be updated by the dashboard independently; keeping a second copy in extension storage is easy to desync.
- Avoids exporting/syncing a long-lived refresh token via extension backup/WebDAV flows.
- Keeps the auth “source of truth” in the same place the user actually logs in/out.

**Alternatives considered:**

- Store refresh tokens in extension storage: more “headless”, but increases security risk and introduces rotation/desync edge cases.
- Always re-read localStorage on every refresh: simpler but potentially expensive/intrusive due to temp windows.
- Mutate extension storage inside the API module: breaks layering and increases risk of circular dependencies.

### 5) Enforce JWT-only UX for Sub2API accounts

**Decision:** When `siteType === "sub2api"`, constrain the account dialog to access-token mode and surface copy that the user must be logged into the Sub2API dashboard for auto-detect and refresh to work.

**Rationale:**

- Avoids confusing “Cookie” mode which is not applicable to `/api/v1/auth/me`.
- Aligns user expectations with the actual auth requirement.

## Risks / Trade-offs

- **[LocalStorage keys change]** → Mitigation: detect via multiple signals (token + user shape), and keep manual site type selection as a fallback.
- **[No matching tab + temp-window disabled]** → Mitigation: refresh still runs with the stored JWT; on 401, surface a clear health warning instructing the user to log in and re-run detection/refresh.
- **[JWT is sensitive data]** → Mitigation: never log tokens; redact in errors; treat storage as sensitive; keep documentation explicit about security implications.
- **[Single-session nature of JWT]** → Mitigation: explicitly document that Sub2API accounts are tied to the logged-in dashboard user; multi-user/multi-session support is not in scope.

## Migration Plan

- No data migrations expected (new site type and new API module only).
- Rollback strategy: removing the `sub2api` site type will leave existing accounts as stored entries; they can be deleted by users, and the extension should continue to function for other site types.

## Open Questions

- Should we additionally support branded Sub2API deployments by allowing configurable localStorage key names (advanced setting), or keep it hard-coded for now?
- Should Sub2API accounts default today’s stats to 0, or attempt to map Sub2API’s internal usage endpoints (future capability)?

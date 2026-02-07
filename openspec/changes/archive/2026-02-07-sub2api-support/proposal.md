## Why

Users of Sub2API-based relay sites (e.g. deployments like `ai.qaq.al`) cannot add accounts to All API Hub today because Sub2API uses JWT-authenticated `/api/v1/*` endpoints and stores session state in localStorage rather than the One-API/New-API-style cookie/token flows the extension currently assumes. Adding Sub2API support enables these users to view remaining balance and keep account health up to date (without introducing check-in functionality).

## What Changes

- Add a new site type identifier `sub2api` that can be selected in the account dialog and can be auto-detected where possible.
- Add a Sub2API API implementation that fetches the current user and balance from `GET /api/v1/auth/me` using a JWT stored as the account `accessToken`, converting Sub2API’s USD balance into the extension’s internal `quota` units.
- Implement Sub2API account auto-detect using Sub2API dashboard localStorage keys (`auth_user`, `auth_token`) to populate `username`, `userId`, and `accessToken` (JWT access token).
  - When available, also leverage `refresh_token` + `token_expires_at` to proactively refresh and rotate tokens inside the dashboard page context (without persisting refresh tokens in extension storage).
- Enforce **dashboard access-token auth** behavior for Sub2API accounts (no API-key-only mode) because the required balance endpoint is session-authenticated.
- Improve refresh resilience by re-syncing Sub2API auth state from a matching-origin tab or temp-window context on HTTP 401 (retry once), then surface a clear health warning when the user must log in again.
- Add/adjust user-facing documentation and localized UI copy for Sub2API setup expectations (must be logged in to the dashboard).
- Add tests covering Sub2API response parsing, balance conversion, token re-sync retry flow, and refresh-token-aware token refresh behavior.

## Capabilities

### New Capabilities

- `sub2api-jwt-account`: Support Sub2API site type accounts using dashboard access tokens (localStorage-backed) to fetch and refresh remaining balance via `/api/v1/auth/me`, with best-effort token re-sync and refresh-token-assisted access-token refresh (when available), and no check-in functionality.

### Modified Capabilities

## Impact

- Affected areas: site type constants/detection, account auto-detect, API service overrides, account refresh/health status handling, docs/i18n, and unit tests.
- External dependencies: none expected (reuse existing fetch + temp-window/content-script infrastructure to read localStorage in a site context).

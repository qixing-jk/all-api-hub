## ADDED Requirements

### Requirement: Users MUST be able to store an exportable Sub2API refresh token per account
The system MUST allow users to configure a Sub2API account with an **extension-managed session** by providing a Sub2API refresh token credential that is persisted on the account record and included in account exports/backups.

The stored refresh token MUST be treated as account-scoped secret data (similar to cookie-auth), and it MUST be optional so existing Sub2API accounts can continue operating in “dashboard-session mode”.

#### Scenario: User saves a Sub2API account with refresh token configured
- **GIVEN** a user is adding or editing a `sub2api` account
- **WHEN** the user provides a non-empty refresh token for that account and saves
- **THEN** the stored account MUST persist the refresh token in an account-scoped field (e.g., `sub2apiAuth.refreshToken`)

#### Scenario: User clears a previously configured refresh token
- **GIVEN** a stored `sub2api` account has `sub2apiAuth.refreshToken` configured
- **WHEN** the user clears the refresh token field and saves the account
- **THEN** the stored account MUST remove `sub2apiAuth.refreshToken`
- **AND** subsequent refresh behavior MUST fall back to dashboard-session mode

### Requirement: The extension MUST inform users about Sub2API refresh-token storage
Because Sub2API refresh tokens are long-lived credentials, the UI MUST provide a concise disclosure when a user enables refresh-token-based auth for a `sub2api` account, including that exports/backups will include the stored refresh token.

#### Scenario: User enables refresh-token-based auth
- **WHEN** a user opts into storing a Sub2API refresh token in the extension
- **THEN** the UI MUST display a note that refresh tokens are secrets stored with the account
- **AND** the note MUST state that exports/backups will include the refresh token
- **AND** the UI MUST recommend a workflow to reduce rotation conflicts (e.g., importing tokens from an incognito/private window and then closing it to clear site localStorage)
- **AND** the UI MUST remind the user to enable the extension for incognito/private windows if required by the browser

### Requirement: Users MUST be able to import Sub2API session credentials from a dashboard context
The system MUST provide a user-initiated import flow that reads Sub2API session credentials from a dashboard origin (via content script and/or temp-window context) and uses them to populate account setup/edit fields.

The import flow MUST support reading `auth_token` + `auth_user`, and when present, it MUST also support reading `refresh_token` + `token_expires_at` so users can opt into refresh-token mode without manual copy/paste.

#### Scenario: Import populates Sub2API tokens and user identity
- **GIVEN** a user is adding or editing a `sub2api` account for a site origin
- **WHEN** the user triggers the Sub2API session import action
- **THEN** the system MUST attempt to read `auth_token` and `auth_user` from that origin's localStorage
- **AND** it MUST populate the detected `userId`, `username`, and `accessToken` into the account form
- **AND** if `refresh_token` and `token_expires_at` exist, the system MUST populate them into the account form so the user can opt in to storing them

### Requirement: Multi-account Sub2API refresh MUST remain account-scoped
When multiple `sub2api` accounts share the same site origin, the system MUST keep refresh-token-based authentication fully account-scoped so one account’s refresh never overwrites another account’s stored credentials.

#### Scenario: Two Sub2API accounts on the same site refresh independently
- **GIVEN** account A is a `sub2api` account with `sub2apiAuth.refreshToken = tokenA`
- **AND** account B is a `sub2api` account with `sub2apiAuth.refreshToken = tokenB`
- **AND** both accounts have the same `site_url` origin
- **WHEN** the extension refreshes account A and account B
- **THEN** account A’s refresh MUST use `tokenA`
- **AND** account B’s refresh MUST use `tokenB`
- **AND** the extension MUST NOT persist `tokenA` into account B (or vice versa)

### Requirement: Refresh-token rotation MUST be atomic per account
When refreshing a Sub2API access token using a refresh token, the server may rotate the refresh token. The extension MUST persist rotated credentials atomically per account so concurrent refresh operations do not corrupt the stored refresh token.

#### Scenario: Concurrent refreshes do not persist a stale refresh token
- **GIVEN** a `sub2api` account has `sub2apiAuth.refreshToken = token1`
- **AND** two extension contexts attempt to refresh the same account concurrently
- **WHEN** one refresh operation receives a rotated refresh token `token2`
- **THEN** the stored account MUST persist `sub2apiAuth.refreshToken = token2`
- **AND** the system MUST NOT overwrite `token2` with `token1` due to out-of-order persistence

## MODIFIED Requirements

### Requirement: The extension SHALL support Sub2API accounts authenticated by dashboard JWT

The system SHALL support a `sub2api` site type whose account data refresh uses a JWT access token (stored as `account_info.access_token`).

The JWT MAY be sourced from:
- a logged-in Sub2API dashboard session (dashboard-session mode), or
- an extension-managed session derived from an account-scoped refresh token (refresh-token mode).

#### Scenario: Account can be stored using existing account schema
- **WHEN** a user adds a Sub2API account via auto-detect or manual configuration
- **THEN** the stored account MUST persist `site_type = "sub2api"`
- **AND** the stored account MUST persist `authType = "access_token"`
- **AND** the stored account MUST persist `account_info.access_token` as the last-known Sub2API JWT access token
- **AND** the stored account MUST persist `account_info.id` as the Sub2API user id
- **AND** the stored account MUST persist `account_info.username` as the Sub2API username (which MAY be an empty string)

#### Scenario: Account can persist refresh-token credentials for extension-managed sessions
- **GIVEN** a `sub2api` account is configured with a refresh token
- **WHEN** the account is persisted
- **THEN** the stored account MUST persist `sub2apiAuth.refreshToken` as the Sub2API refresh token for that account

### Requirement: Sub2API auto-detect MUST read Sub2API localStorage keys to obtain JWT and user identity

When auto-detect is executed on a Sub2API dashboard origin, the system MUST attempt to read Sub2API session data from localStorage keys:

- `auth_token` (JWT access token)
- `auth_user` (JSON containing `id`, `username`/`email`, and optionally `balance`)
- `refresh_token` (optional; refresh token for extension-managed session import)
- `token_expires_at` (optional; access-token expiry timestamp in milliseconds since epoch)

#### Scenario: Auto-detect succeeds when both auth_token and auth_user exist
- **WHEN** localStorage contains a non-empty `auth_token`
- **AND** localStorage contains a parseable `auth_user` object with `id`
- **THEN** auto-detect MUST succeed
- **AND** it MUST return `userId = auth_user.id`
- **AND** it MUST return `username` derived from `auth_user.username` (or a fallback such as `auth_user.email` local-part when username is missing/empty)
- **AND** it MUST return `accessToken = auth_token`
- **AND** it MUST set `siteType = "sub2api"`

#### Scenario: Auto-detect returns refresh token metadata when present
- **GIVEN** localStorage contains a non-empty `refresh_token`
- **WHEN** auto-detect succeeds on a Sub2API dashboard origin
- **THEN** auto-detect MUST include the refresh token in its detection payload so the UI can persist it for the account when the user opts in
- **AND** if localStorage contains a valid numeric `token_expires_at`, auto-detect MUST include the expiry timestamp in the detection payload

#### Scenario: Auto-detect fails when JWT is missing
- **WHEN** localStorage is missing `auth_token` or it is empty/whitespace
- **THEN** auto-detect MUST fail with an error indicating the user needs to log in to the Sub2API dashboard

#### Scenario: Auto-detect fails when auth_user is invalid
- **WHEN** localStorage contains `auth_token`
- **AND** localStorage is missing `auth_user` or `auth_user` is not valid JSON or lacks `id`
- **THEN** auto-detect MUST fail with an error indicating the user needs to log in to the Sub2API dashboard

### Requirement: Sub2API refresh MUST retry once after re-syncing JWT from localStorage on 401

If a Sub2API refresh request to `/api/v1/auth/me` fails with HTTP 401, the system MUST attempt to restore a valid JWT access token and retry the request once.

The restoration strategy MUST be:
1. If the account has a configured refresh token (`sub2apiAuth.refreshToken`), refresh the JWT via Sub2API’s refresh endpoint and persist rotated credentials.
2. Otherwise, attempt to re-sync the JWT from the site’s localStorage (dashboard-session mode).

#### Scenario: 401 triggers refresh-token-based retry when refresh token is configured
- **GIVEN** a `sub2api` account has `sub2apiAuth.refreshToken` configured
- **WHEN** a Sub2API refresh to `/api/v1/auth/me` fails with HTTP 401
- **THEN** the system MUST attempt to refresh the access token using the configured refresh token
- **AND** it MUST retry `/api/v1/auth/me` once using the refreshed access token

#### Scenario: Successful refresh-token rotation persists updated credentials
- **GIVEN** a `sub2api` account has `sub2apiAuth.refreshToken` configured
- **WHEN** the system refreshes tokens successfully
- **THEN** the system MUST persist the new JWT into `account_info.access_token`
- **AND** it MUST persist any rotated refresh token into `sub2apiAuth.refreshToken`
- **AND** it MUST persist updated expiry metadata when available (e.g., `sub2apiAuth.tokenExpiresAt`)

#### Scenario: 401 triggers a localStorage token re-sync retry when refresh token is not configured
- **GIVEN** a `sub2api` account does not have `sub2apiAuth.refreshToken` configured
- **WHEN** a Sub2API refresh to `/api/v1/auth/me` fails with HTTP 401
- **THEN** the system MUST attempt to read `auth_token` from localStorage for that site origin
- **AND** it MUST retry `/api/v1/auth/me` once using the refreshed token

#### Scenario: Failed retry surfaces a health warning requiring re-import or re-login
- **WHEN** a Sub2API refresh fails with HTTP 401
- **AND** token restoration fails or the retry also fails with HTTP 401
- **THEN** the stored account health MUST be updated to a warning/error state
- **AND** the health message MUST instruct the user to restore credentials (re-import session or log in to the Sub2API dashboard again)

### Requirement: Secret handling MUST avoid logging JWTs

Sub2API JWT and refresh-token values are secrets. The system MUST NOT log them in plaintext and MUST avoid exposing them in UI surfaces beyond explicit, user-initiated secret entry/import flows.

#### Scenario: Logs do not include raw auth_token or refresh_token
- **WHEN** auto-detect, refresh, or import/export operations occur for a Sub2API account
- **THEN** any emitted logs MUST NOT contain the raw `auth_token` value
- **AND** any emitted logs MUST NOT contain the raw `refresh_token` value

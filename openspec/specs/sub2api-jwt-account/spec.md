# sub2api-jwt-account Specification

## Purpose
TBD - created by archiving change sub2api-support. Update Purpose after archive.
## Requirements
### Requirement: The extension SHALL support Sub2API accounts authenticated by dashboard JWT

The system SHALL support a `sub2api` site type whose account data refresh uses a JWT obtained from a logged-in Sub2API dashboard session.

#### Scenario: Account can be stored using existing account schema
- **WHEN** a user adds a Sub2API account via auto-detect
- **THEN** the stored account MUST persist `site_type = "sub2api"`
- **AND** the stored account MUST persist `authType = "access_token"`
- **AND** the stored account MUST persist `account_info.access_token` as the Sub2API dashboard JWT
- **AND** the stored account MUST persist `account_info.id` as the Sub2API user id
- **AND** the stored account MUST persist `account_info.username` as the Sub2API username

### Requirement: Sub2API auto-detect MUST read Sub2API localStorage keys to obtain JWT and user identity

When auto-detect is executed on a Sub2API dashboard origin, the system MUST attempt to read Sub2API session data from localStorage keys:

- `auth_token` (JWT)
- `auth_user` (JSON containing `id`, `username`, and optionally `balance`)

#### Scenario: Auto-detect succeeds when both keys exist
- **WHEN** localStorage contains a non-empty `auth_token`
- **AND** localStorage contains a parseable `auth_user` object with `id` and `username`
- **THEN** auto-detect MUST succeed
- **AND** it MUST return `userId = auth_user.id`
- **AND** it MUST return `username = auth_user.username`
- **AND** it MUST return `accessToken = auth_token`
- **AND** it MUST set `siteType = "sub2api"`

#### Scenario: Auto-detect fails when JWT is missing
- **WHEN** localStorage is missing `auth_token` or it is empty/whitespace
- **THEN** auto-detect MUST fail with an error indicating the user needs to log in to the Sub2API dashboard

#### Scenario: Auto-detect fails when auth_user is invalid
- **WHEN** localStorage contains `auth_token`
- **AND** localStorage is missing `auth_user` or `auth_user` is not valid JSON or lacks `id`/`username`
- **THEN** auto-detect MUST fail with an error indicating the user needs to log in to the Sub2API dashboard

### Requirement: Sub2API balance MUST be fetched from /api/v1/auth/me using JWT

For `sub2api` accounts, account refresh MUST fetch the current user data from `GET /api/v1/auth/me` using `Authorization: Bearer <jwt>` and derive the extension `quota` from the returned USD balance.

#### Scenario: Refresh converts USD balance into quota units
- **WHEN** a Sub2API account refresh succeeds and the server returns `balance` in USD
- **THEN** the system MUST set `account_info.quota = round(balance * UI_CONSTANTS.EXCHANGE_RATE.CONVERSION_FACTOR)`

#### Scenario: Refresh does not require check-in support
- **WHEN** a Sub2API account is refreshed
- **THEN** the system MUST NOT attempt to perform any check-in operation
- **AND** it MUST treat check-in as unsupported (disabled) for this account type

### Requirement: Sub2API refresh MUST retry once after re-syncing JWT from localStorage on 401

If a Sub2API refresh request to `/api/v1/auth/me` fails with HTTP 401, the system MUST attempt to re-sync the JWT from the site’s localStorage and retry the request once.

#### Scenario: 401 triggers a localStorage token re-sync retry
- **WHEN** a Sub2API refresh to `/api/v1/auth/me` fails with HTTP 401
- **THEN** the system MUST attempt to read `auth_token` from localStorage for that site origin
- **AND** it MUST retry `/api/v1/auth/me` once using the refreshed token

#### Scenario: Successful retry persists the updated token
- **WHEN** the 401-triggered retry succeeds
- **THEN** the system MUST persist the updated JWT into the stored account credentials for subsequent refreshes

#### Scenario: Failed retry surfaces a health warning requiring re-login
- **WHEN** a Sub2API refresh fails with HTTP 401
- **AND** token re-sync fails or the retry also fails with HTTP 401
- **THEN** the stored account health MUST be updated to a warning/error state
- **AND** the health message MUST instruct the user to log in to the Sub2API dashboard again

### Requirement: Secret handling MUST avoid logging JWTs

Sub2API JWT values are secrets. The system MUST NOT log JWTs in plaintext and MUST avoid persisting them outside the account storage mechanisms already used for other access tokens.

#### Scenario: Logs do not include raw auth_token
- **WHEN** auto-detect or refresh errors occur for a Sub2API account
- **THEN** any emitted logs MUST NOT contain the raw `auth_token` value


# ldoh-site-lookup Specification

## Purpose

Allow users to quickly access additional metadata about an account’s relay site on `https://ldoh.105117.xyz/` by showing a per-account “View on LDOH” button only when the extension can match the account’s site to an entry in the authenticated LDOH site list.

## Definitions

- **LDOH**: The authenticated directory site hosted at `https://ldoh.105117.xyz/`.
- **LDOH site list**: The list of sites available on LDOH that the extension can load (best-effort) using the user’s existing browser session.
- **Account site origin**: The normalized account URL origin (scheme + host + optional port) derived from the account’s configured URL.
- **Match**: An unambiguous association between an account and exactly one LDOH site list entry.

## Current Implementation Notes (Informative)

- **Origin**: `https://ldoh.105117.xyz`
- **Sites endpoint**: `GET /api/sites` (JSON response with `sites: [...]` items)
- **Search/deeplink**: `/?q=<hostname>` where `q` is the query parameter used to filter the site list
- **Cache TTL**: 12 hours by default
- **Persisted fields**: `id`, `apiBaseUrl`, optional `name` (stored with `version`, `fetchedAt`, `expiresAt`)
- **Related UX**: The Add Account dialog may show an “Open LDOH site list” link (opens `https://ldoh.105117.xyz`) when auto-detection fails

## ADDED Requirements

### Requirement: LDOH site list is cached with a TTL
The system MUST cache the LDOH site list with a time-to-live (TTL) and MUST reuse cached data until it expires.

The system MUST NOT fetch the LDOH site list repeatedly during account list rendering.

#### Scenario: Cache miss triggers a single refresh
- **GIVEN** the LDOH site list cache is missing or expired
- **WHEN** an account list UI is opened
- **THEN** the system MUST attempt to refresh the LDOH site list exactly once in the background
- **AND** the account list UI MUST remain usable while the refresh is in progress

#### Scenario: Cache hit avoids network work
- **GIVEN** a non-expired cached LDOH site list exists
- **WHEN** an account list UI is opened
- **THEN** the system MUST use the cached LDOH site list
- **AND** the system MUST NOT perform an LDOH site list network refresh solely due to rendering

### Requirement: LDOH site list loading is session-based and best-effort
The system MUST load the LDOH site list using the user’s existing authenticated browser session.

If the user is not logged in to LDOH (or the session is invalid), the system MUST treat the LDOH site list as unavailable and MUST NOT show LDOH-only UI affordances.

The system MUST NOT store LDOH credentials and MUST NOT require users to enter credentials inside the extension.

#### Scenario: User is not logged in
- **GIVEN** the user is not logged in to LDOH
- **WHEN** the system attempts to refresh the LDOH site list
- **THEN** the refresh MUST fail safely without persisting sensitive data
- **AND** the account list UI MUST NOT display “View on LDOH” buttons

### Requirement: Accounts are matched to LDOH sites by origin/hostname and must be unambiguous
For each account, the system MUST derive the account site origin from the account’s configured URL and MUST attempt to match that account to an LDOH site list entry.

The system MUST treat a match as successful only when exactly one LDOH site list entry matches.

If no match is found, or multiple matches are found, the system MUST treat the account as unmatched.

#### Scenario: Exact origin match succeeds
- **GIVEN** an account with configured URL `https://api.example.com/path?x=1`
- **AND** the cached LDOH site list contains exactly one entry for `https://api.example.com`
- **WHEN** the system evaluates matches for the account
- **THEN** the account MUST be treated as matched to that LDOH entry

#### Scenario: Multiple matches are treated as no match
- **GIVEN** an account whose hostname matches multiple LDOH entries
- **WHEN** the system evaluates matches for the account
- **THEN** the system MUST treat the account as unmatched
- **AND** the account MUST NOT display a “View on LDOH” button

### Requirement: Account rows show a conditional “View on LDOH” button
Any UI surface that renders an account row MUST display a “View on LDOH” button within that account item only when the account is matched to an LDOH site list entry.

If an account is unmatched, the UI MUST NOT render the button.

User-facing button label (tooltip/aria-label) MUST be localized via the extension i18n system.

#### Scenario: Matched account shows the button
- **GIVEN** an account is matched to an LDOH site list entry
- **WHEN** the account row is rendered
- **THEN** a “View on LDOH” button MUST be visible for that account

#### Scenario: Unmatched account does not show the button
- **GIVEN** an account is not matched to any LDOH site list entry
- **WHEN** the account row is rendered
- **THEN** the account row MUST NOT display a “View on LDOH” button

### Requirement: Clicking “View on LDOH” opens LDOH filtered to the matched site
When the user clicks “View on LDOH”, the system MUST open a new browser tab to LDOH and MUST include a search query parameter such that LDOH filters the site list to the matched site (currently `q=<hostname>`).

The search query value MUST be derived from the matched site identifier (at minimum the account site origin hostname) and MUST NOT include any secrets (API keys/tokens/cookies) or account URL paths/queries/fragments.

#### Scenario: Click opens a new tab with a search query
- **GIVEN** an account is matched to an LDOH site list entry
- **WHEN** the user clicks “View on LDOH”
- **THEN** the system MUST open a new tab to an LDOH URL that contains a search query parameter whose value targets the matched site

#### Scenario: Open URL uses origin/hostname only
- **GIVEN** an account has configured URL `https://api.example.com/v1?token=SHOULD_NOT_LEAK`
- **AND** the account is matched on hostname `api.example.com`
- **WHEN** the user clicks “View on LDOH”
- **THEN** the opened LDOH URL MUST include only `api.example.com` (or the origin) as the search query value
- **AND** the opened LDOH URL MUST NOT include `v1` or `token`

### Requirement: LDOH integration does not block or degrade account list rendering
The LDOH integration MUST be non-blocking for account list UIs.

Account list UIs MUST render the account list regardless of whether the LDOH site list cache is available, refreshing, or unavailable.

#### Scenario: Account list renders while LDOH refresh is slow
- **GIVEN** an account list UI is opened
- **AND** an LDOH site list refresh is slow or times out
- **WHEN** the UI renders
- **THEN** the account list MUST still render normally
- **AND** only the LDOH-specific buttons MUST be absent for unmatched/unknown accounts

# account-menu-jump-filtered-channel-management Specification

## Purpose
The `account-menu-jump-filtered-channel-management` specification exists to help users quickly locate the Managed Site channel that backs a selected account by adding a “Locate channel” action to the account menu and defining best-effort matching and navigation (focus an exact channel when possible, otherwise open channel management filtered by base URL with clear UX feedback).

## Requirements
### Requirement: Account menu includes a channel-location entry
The system MUST provide an entry in the account card “more actions / context menu” that helps the user locate the channel corresponding to the current account.

#### Scenario: Menu entry is available for enabled accounts with managed-site admin configured
- **GIVEN** the user has configured managed-site admin credentials in settings
- **WHEN** the user opens the account “more actions” menu for an enabled account
- **THEN** the system shows an action to “Locate channel” in Managed Site channel management

### Requirement: Location action navigates to channel management with best-effort filtering
When the user triggers the location action, the system MUST navigate to the Managed Site “Channels management” page and apply the best available filter derived from the current account:

- Prefer focusing a specific channel when an exact match can be determined.
- Otherwise fall back to filtering by the account base URL/origin (normalized for OpenAI-family accounts when possible).

#### Scenario: Exact channel match is found and focused
- **GIVEN** the account has exactly one API token available for comparison
- **AND** the managed-site service can determine a matching channel id for the account
- **WHEN** the user triggers the location action
- **THEN** the system navigates to channel management with `channelId=<id>` applied

#### Scenario: Key-based precision is unavailable and the UI confirms a base-url+models match
- **GIVEN** the account has exactly one API token available for comparison
- **AND** the managed-site service cannot confirm an exact match due to missing/non-comparable channel keys (e.g. New API 2FA constraints)
- **AND** the managed-site service can still find a match using base URL + models
- **WHEN** the user triggers the location action
- **THEN** the system navigates to channel management with `search=<accountBaseUrl>` applied
- **AND** the system informs the user that key-precise matching is unavailable (or requires verification) and URL filtering was applied

#### Scenario: Matching inputs cannot be prepared and the UI falls back to URL filtering only
- **GIVEN** the account has exactly one API token available for comparison
- **AND** the system cannot build comparable channel inputs (e.g. deriving models/key fails)
- **WHEN** the user triggers the location action
- **THEN** the system navigates to channel management with `search=<accountBaseUrl>` applied

#### Scenario: No match is found and the UI still opens URL-filtered channel management
- **GIVEN** the account has exactly one API token available for comparison
- **AND** the managed-site service cannot determine an exact match
- **AND** the managed-site service cannot determine a base-url+models match
- **WHEN** the user triggers the location action
- **THEN** the system navigates to channel management with `search=<accountBaseUrl>` applied

#### Scenario: Multiple API tokens on the account disables key-based matching
- **GIVEN** the account has multiple API tokens
- **WHEN** the user triggers the location action
- **THEN** the system navigates to channel management with `search=<accountBaseUrl>` applied
- **AND** the system informs the user that key-precise matching is skipped due to multiple keys

#### Scenario: No API tokens available falls back to base URL filtering
- **GIVEN** the account has no API tokens available
- **WHEN** the user triggers the location action
- **THEN** the system navigates to channel management with `search=<accountBaseUrl>` applied

#### Scenario: Token list fetch fails or returns an unexpected shape
- **GIVEN** the system cannot fetch the account token list (network/auth error) or receives an unexpected response
- **WHEN** the user triggers the location action
- **THEN** the system navigates to channel management with `search=<accountBaseUrl>` applied
- **AND** the system informs the user that locating the channel failed

#### Scenario: Managed-site configuration becomes unavailable at click-time
- **GIVEN** the menu entry is shown
- **AND** the managed-site admin configuration is missing when the action runs (e.g. preferences changed between render and click)
- **WHEN** the user triggers the location action
- **THEN** the system informs the user that configuration is required before channels can be managed
- **AND** the system navigates to channel management with `search=<accountBaseUrl>` applied

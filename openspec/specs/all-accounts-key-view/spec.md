# all-accounts-key-view Specification

## Purpose
Provide an aggregated Key Management view that can list, search, and copy API keys/tokens across all enabled accounts while preserving safe secret-handling and isolating per-account failures.

## Requirements
### Requirement: Key Management supports an “All accounts” mode
The system MUST provide an “All accounts” selection mode in the Key Management UI that allows a user to view tokens aggregated across all enabled accounts.

#### Scenario: User selects “All accounts”
- **WHEN** the user selects “All accounts” in Key Management account selection controls
- **THEN** the system enters aggregated mode and prepares to load token inventories for enabled accounts

### Requirement: Token inventories are loaded on-demand and per-account in aggregated mode
In aggregated mode, the system MUST load token inventories per account and MUST NOT require all accounts to succeed before showing any results.

#### Scenario: Partial results render while other accounts are still loading
- **WHEN** the system has loaded tokens for at least one enabled account
- **AND** one or more other accounts are still loading tokens
- **THEN** the UI renders the loaded tokens and indicates that additional accounts are still loading

### Requirement: Per-account token loading failures are isolated and actionable
If loading tokens fails for an account in aggregated mode, the system MUST surface a per-account failure state and MUST continue loading other accounts.

#### Scenario: One account fails but other accounts still load
- **WHEN** token loading fails for an enabled account
- **THEN** the UI indicates that the account failed to load tokens
- **AND** the system continues loading or displaying tokens for other enabled accounts

#### Scenario: Retry failed account token loading
- **GIVEN** an account previously failed to load tokens in aggregated mode
- **WHEN** the user triggers a retry action for that account (or retries failed accounts)
- **THEN** the system re-attempts loading tokens for the failed account

### Requirement: Token entries are scoped to their owning account for actions
When tokens are displayed in aggregated mode, per-token actions (copy, export, edit, delete) MUST operate on the token’s owning account.

#### Scenario: Delete token uses the owning account context
- **GIVEN** a token is shown in aggregated mode
- **WHEN** the user deletes that token
- **THEN** the system issues the delete operation against the token’s owning account

### Requirement: Token identity and visibility state are collision-safe across accounts
The system MUST treat `(accountId, tokenId)` as the unique identity of a token entry within the Key Management UI and MUST NOT assume token IDs are globally unique across accounts.

#### Scenario: Token visibility toggles do not collide across accounts
- **GIVEN** two different accounts have tokens with the same numeric token ID
- **WHEN** the user reveals the key for one token
- **THEN** the key visibility state applies only to that account’s token entry
- **AND** it does not reveal or affect the other account’s token entry with the same token ID

### Requirement: Secrets are handled safely in aggregated mode
The system MUST treat token key values as secrets in aggregated mode:

- Token keys MUST be masked by default.
- Revealing a token key MUST require explicit user action.
- Copying a token key MUST require explicit user action.
- User-facing errors and logs MUST NOT include raw token key values.

#### Scenario: Token keys are masked by default
- **WHEN** tokens are rendered in aggregated mode
- **THEN** token key values are not displayed in cleartext by default

#### Scenario: Errors do not leak token keys
- **WHEN** token loading or token actions fail in aggregated mode
- **THEN** any user-facing error messages do not include raw token key values

### Requirement: Aggregated token list is grouped by account
In aggregated mode, the UI MUST group tokens by owning account and allow users to expand/collapse groups (including “Expand all” / “Collapse all” actions).

#### Scenario: User expands/collapses groups
- **GIVEN** tokens exist for multiple accounts in aggregated mode
- **WHEN** the user expands an account group (or triggers “Expand all”)
- **THEN** tokens for the expanded group(s) are visible
- **WHEN** the user collapses an account group (or triggers “Collapse all”)
- **THEN** tokens for the collapsed group(s) are hidden

### Requirement: Aggregated mode supports per-account filtering without leaving the page
In aggregated mode, the UI MUST allow the user to filter the visible token list to a single account (e.g. via an account summary bar) without leaving aggregated mode.

#### Scenario: User filters to a single account
- **GIVEN** the user is in aggregated mode
- **WHEN** the user selects an account filter
- **THEN** only tokens for that account are shown
- **AND** the corresponding account group is expanded so tokens are immediately visible

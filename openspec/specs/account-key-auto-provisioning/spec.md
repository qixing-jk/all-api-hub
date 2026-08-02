# account-key-auto-provisioning Specification

## Purpose
TBD - created by archiving change auto-create-account-keys. Update Purpose after archive.
## Requirements
### Requirement: Auto-provision on account add is configurable
The system MUST provide a user setting to enable or disable automatic default-key (token) provisioning when adding an account.

The setting MUST be persisted in user preferences as `autoProvisionKeyOnAccountAdd` and MUST default to **disabled**.

#### Scenario: Auto-provision enabled runs after successful add
- **GIVEN** auto-provision on add is enabled
- **WHEN** a user successfully adds an account
- **THEN** the system MUST run the key auto-provisioning flow for that account

#### Scenario: Auto-provision disabled does not run after successful add
- **GIVEN** auto-provision on add is disabled
- **WHEN** a user successfully adds an account
- **THEN** the system MUST NOT run the key auto-provisioning flow for that account

### Requirement: Auto-provisioning is best-effort and does not fail account add
When auto-provisioning on add is enabled, token inventory fetch and/or token creation MAY fail due to upstream auth or network issues. These failures MUST NOT cause the account add operation to be considered failed, and the persisted account record MUST remain stored.

#### Scenario: Token provisioning fails but account remains added
- **GIVEN** auto-provision on add is enabled
- **WHEN** a user successfully adds an account
- **AND** token inventory fetch or default token creation fails
- **THEN** the system MUST keep the added account persisted

### Requirement: Eligibility gating for key auto-provisioning
Key auto-provisioning MUST only operate on accounts that are eligible for the
current workflow.

An account is eligible for manual repair when all of the following are true:
- The account is enabled (`disabled = false`)
- The account has credentials suitable for token management (`authType != "none"`)
- The site adapter's repair policy marks the account as eligible

#### Scenario: Disabled accounts are skipped and not shown
- **GIVEN** an account is disabled (`disabled = true`)
- **WHEN** the user runs the manual key repair action
- **THEN** the system MUST exclude the disabled account from the repair operation
- **AND** the system MUST NOT show the disabled account in the repair operation UI or results

#### Scenario: Automatic account-add provisioning skips Sub2API accounts
- **GIVEN** an account has `site_type = "sub2api"`
- **WHEN** implicit account-add key auto-provisioning is triggered
- **THEN** the system MUST NOT create a key or guess a group without an explicit group selection

#### Scenario: User-triggered repair covers every available Sub2API group
- **GIVEN** an enabled `sub2api` account has credentials suitable for token management
- **AND** one or more current Sub2API groups do not have a key
- **WHEN** the user explicitly starts the manual key repair action
- **THEN** the system MUST inspect the account's current available groups and complete paginated key inventory
- **AND** it MUST create one key for each currently uncovered group
- **AND** it MUST NOT guess a single default group or require a separate choice for each uncovered group

Automatic account-add provisioning MUST continue skipping `sub2api` accounts.
For backward compatibility, when a current manual repair result reports a
legacy skipped `sub2api` account and the underlying account record remains
available, the system MUST continue exposing the explicit group-aware
create-key follow-up action.

#### Scenario: Current legacy repair results retain Sub2API follow-up key creation
- **GIVEN** a current manual repair result reports a skipped `sub2api` account
- **AND** the underlying account record is available in the current results view
- **WHEN** the user reviews the repair results
- **THEN** the UI MUST offer an explicit create-key action for that account
- **AND** the action MUST remain user-triggered
- **AND** any follow-up token creation MUST use the shared Sub2API group-aware create flow instead of background auto-provisioning

#### Scenario: None-auth accounts are skipped
- **GIVEN** an account has `authType = "none"`
- **WHEN** key auto-provisioning is triggered (on-add or manual repair)
- **THEN** the system MUST skip that account

### Requirement: Key auto-provisioning ensures at least one token
For an eligible account, the system MUST determine the remote token inventory and MUST create a default token when the account has zero tokens.

#### Scenario: Account already has tokens
- **GIVEN** an eligible account has one or more tokens
- **WHEN** key auto-provisioning runs for that account
- **THEN** the system MUST NOT create a new token

#### Scenario: Account has no tokens
- **GIVEN** an eligible account has zero tokens
- **WHEN** key auto-provisioning runs for that account
- **THEN** the system MUST create a default token for that account
- **AND** subsequent token inventory fetches MUST return at least one token

### Requirement: Default token definition remains stable
When key auto-provisioning creates a default token, it MUST use the existing default token definition:
- `name = "user group (auto)"`
- `unlimited_quota = true`
- `remain_quota = 0`
- `expired_time = -1` (never expires)
- `allow_ips = ""` (no IP restriction)
- `model_limits_enabled = false`
- `model_limits = ""` (no model restriction)
- `group = ""` (follow user group)

#### Scenario: Created token uses the default definition
- **GIVEN** an eligible account has zero tokens
- **WHEN** the system creates a default token via key auto-provisioning
- **THEN** the created token MUST use the default token definition

### Requirement: Manual bulk repair action repairs missing keys
The system MUST provide a user-initiated action to run key auto-provisioning across all enabled accounts.

The manual repair MUST:
- Evaluate all enabled accounts, applying eligibility gating
- Create default tokens for eligible accounts that have zero tokens
- Be resilient to partial failures (continue processing remaining accounts)
- Apply rate limiting per site origin (the limiter MUST be keyed by normalized `site_url` origin, not global)

#### Scenario: Bulk repair creates tokens for accounts missing keys
- **GIVEN** multiple stored accounts exist and at least one eligible account has zero tokens
- **WHEN** the user runs the manual key repair action
- **THEN** the system MUST create a default token for each eligible account that has zero tokens

#### Scenario: Bulk repair continues when one account fails
- **GIVEN** multiple eligible accounts exist
- **AND** key auto-provisioning fails for one of the accounts
- **WHEN** the user runs the manual key repair action
- **THEN** the system MUST continue processing the remaining eligible accounts

#### Scenario: Bulk repair rate limiting is per site origin
- **GIVEN** two eligible accounts share the same `site_url` origin
- **WHEN** the user runs the manual key repair action
- **THEN** the system MUST NOT process those two accounts concurrently

#### Scenario: Bulk repair does not globally serialize different sites
- **GIVEN** two eligible accounts have different `site_url` origins
- **WHEN** the user runs the manual key repair action
- **THEN** the system MUST NOT block processing one account solely because the other origin is being processed

### Requirement: Bulk repair shows real-time progress and a durable result summary
When the user runs the manual key repair action, the system MUST present a temporary progress dialog that shows:
- Total enabled accounts
- Total eligible accounts
- Progress as accounts are processed
- Per-account outcomes and a final summary

Progress and results MUST be durable:
- Closing/dismissing the dialog MUST NOT cancel the repair job.
- Re-opening the Key Management UI while the repair is running MUST show the latest progress.

#### Scenario: Triggering repair opens progress dialog
- **WHEN** the user triggers the manual key repair action
- **THEN** the system MUST open the progress dialog and begin the repair job

#### Scenario: Progress updates are reflected without manual refresh
- **GIVEN** the repair job is running
- **WHEN** an eligible account is processed
- **THEN** the progress dialog MUST update to reflect the latest progress and outcome

#### Scenario: Closing the dialog does not cancel the repair
- **GIVEN** the repair job is running
- **WHEN** the user closes the progress dialog
- **THEN** the repair job MUST continue running in the background

#### Scenario: Re-opening Key Management shows latest progress
- **GIVEN** the repair job is running
- **WHEN** the user re-opens the Key Management UI
- **THEN** the system MUST show the latest progress in the progress dialog


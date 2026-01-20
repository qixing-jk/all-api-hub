# account-disable Specification

## Purpose
TBD - created by archiving change add-account-disable. Update Purpose after archive.
## Requirements
### Requirement: Persisted disabled state
Each `SiteAccount` MUST support a persisted `disabled` flag indicating whether the account is disabled.

#### Scenario: Existing stored accounts after upgrade
- **GIVEN** an account stored before the feature existed (no `disabled` field)
- **WHEN** the extension loads the account from storage
- **THEN** the account MUST be treated as enabled (`disabled = false`)

#### Scenario: Disabled state is durable
- **GIVEN** a user disables an account
- **WHEN** the extension is restarted or storage is reloaded
- **THEN** the account MUST remain disabled until the user enables it

### Requirement: Toggle in account action menu
Users MUST be able to disable or enable a `SiteAccount` from the account action menu.

#### Scenario: Disable an enabled account
- **GIVEN** an enabled account (`disabled = false`)
- **WHEN** the user selects “Disable” in the account action menu
- **THEN** the account MUST become disabled and the UI MUST update immediately

#### Scenario: Enable a disabled account
- **GIVEN** a disabled account (`disabled = true`)
- **WHEN** the user selects “Enable” in the account action menu
- **THEN** the account MUST become enabled and normal behavior MUST resume

### Requirement: Disabled accounts do not participate in activities
When a `SiteAccount` is disabled, it MUST NOT participate in any account-related activities. The only permitted account-related action is enabling the account.

#### Scenario: Block manual account actions
- **GIVEN** a disabled account
- **WHEN** the user attempts any account action other than “Enable” (e.g., refresh, copy key, check-in, redeem, navigation, edit, delete, pin/unpin)
- **THEN** the action MUST be blocked and MUST NOT trigger network requests or state changes for that account

#### Scenario: Skip automated/background activities
- **GIVEN** a disabled account
- **WHEN** automated/background jobs run (e.g., auto refresh, auto check-in, redemption assist)
- **THEN** the disabled account MUST be skipped and MUST NOT trigger network requests for that account

### Requirement: Disabled accounts are visually indicated
Disabled accounts MUST remain visible only in the Account Management account list and MUST be clearly indicated as disabled (greyed out).

#### Scenario: Disabled row rendering
- **GIVEN** a disabled account appears in the account list
- **WHEN** the list is rendered
- **THEN** the row MUST be greyed out and the available action MUST be “Enable” only

### Requirement: Disabled accounts are hidden outside account list
Disabled accounts MUST NOT appear in UI scenarios that list or select accounts outside the Account Management account list.

#### Scenario: Auto-checkin snapshots exclude disabled accounts
- **GIVEN** an account is disabled
- **WHEN** the Auto Check-in UI shows account snapshots or account status tables
- **THEN** the disabled account MUST NOT appear in those views

#### Scenario: Redemption assistance excludes disabled accounts
- **GIVEN** an account is disabled
- **WHEN** the redemption assistance flow searches or prompts for an account to redeem against
- **THEN** the disabled account MUST NOT be offered as a candidate

### Requirement: Disabled accounts are excluded from aggregates
Disabled accounts MUST be excluded from aggregate statistics (e.g., totals and summaries derived from multiple accounts).

#### Scenario: Aggregate stats exclude disabled accounts
- **GIVEN** a mix of enabled and disabled accounts
- **WHEN** the UI computes or displays aggregate stats
- **THEN** only enabled accounts MUST contribute to the aggregates


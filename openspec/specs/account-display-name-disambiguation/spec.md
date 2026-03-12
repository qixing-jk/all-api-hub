# account-display-name-disambiguation Specification

## Purpose
Define how the system disambiguates user-facing account display names when multiple accounts share the same normalized base name, while preserving persisted account data.

## Requirements
### Requirement: Global duplicate detection uses normalized base account name
The system MUST detect account display-name collisions globally (not limited to a single site/origin). Two accounts MUST be considered “same-name duplicates” when their base account names are equal after normalization.

Normalization MUST:
- trim leading/trailing whitespace
- collapse internal whitespace
- compare case-insensitively
- normalize full-width characters to half-width equivalents

#### Scenario: Duplicate detection is global across sites
- **GIVEN** the user has two accounts with the same base name `My Site` but different `baseUrl` values
- **WHEN** the system renders account names in any UI surface
- **THEN** the system treats those accounts as same-name duplicates for display disambiguation

#### Scenario: Duplicate detection is case-insensitive and whitespace-normalized
- **GIVEN** the user has two accounts whose base names are `My Site` and `my   site`
- **WHEN** the system renders account names in any UI surface
- **THEN** the system treats those accounts as same-name duplicates for display disambiguation

### Requirement: Duplicate accounts display a disambiguated name when username exists
When an account is part of a same-name duplicate set, and the account has a non-empty username, the system MUST render a disambiguated display name that appends the username to the base name using a consistent separator.

The disambiguated display name format MUST be:
- `<base name> · <username>`

#### Scenario: Duplicate account with username is disambiguated
- **GIVEN** two accounts share the same base name `My Site`
- **AND GIVEN** account A has `username = alice`
- **WHEN** the system renders the account name for account A
- **THEN** the system displays `My Site · alice` as the account name

#### Scenario: Duplicate account with empty username is not modified
- **GIVEN** two accounts share the same base name `My Site`
- **AND GIVEN** account A has an empty username
- **WHEN** the system renders the account name for account A
- **THEN** the system displays `My Site` (no appended suffix)

#### Scenario: Unique account name is not modified
- **GIVEN** an account has a base name `My Site` that is not duplicated by any other account
- **WHEN** the system renders the account name for that account
- **THEN** the system displays `My Site` (no appended suffix)

### Requirement: Disambiguation affects display only and does not change persisted names
The system MUST apply same-name disambiguation only at the presentation layer. The system MUST NOT modify the persisted base account name as stored in account records, exports, or backups.

#### Scenario: Persisted account name remains unchanged
- **GIVEN** an account is stored with base name `My Site`
- **AND GIVEN** the account would be disambiguated in UI because another account shares the same base name
- **WHEN** the system exports or persists the account record
- **THEN** the persisted/exported base name remains `My Site` (no appended username)

### Requirement: Search matches both base name and appended username for disambiguated entries
When a UI surface supports searching or filtering accounts by a text query, the search MUST match both the base name and the appended username information for disambiguated entries.

#### Scenario: Search matches base name
- **GIVEN** an account is displayed as `My Site · alice`
- **WHEN** the user searches for `My Site`
- **THEN** the account is included in the matching results

#### Scenario: Search matches appended username
- **GIVEN** an account is displayed as `My Site · alice`
- **WHEN** the user searches for `alice`
- **THEN** the account is included in the matching results

### Requirement: Sorting by name is stable and uses base name then username
When a UI surface sorts accounts by name, the system MUST sort primarily by the base account name, and secondarily by username (case-insensitive). Accounts without a username MUST sort as if their username is an empty string.

#### Scenario: Duplicate accounts are ordered by username as a tie-break
- **GIVEN** two accounts share the same base name `My Site`
- **AND GIVEN** their usernames are `bob` and `alice`
- **WHEN** the user sorts accounts by name ascending
- **THEN** the account `My Site · alice` appears before `My Site · bob`

## ADDED Requirements

### Requirement: Global duplicate detection uses normalized base account name
The system MUST detect account display-name collisions globally (not limited to a single site/origin). Two accounts MUST be considered “same-name duplicates” when their base account names are equal after normalization.

Normalization MUST:
- apply Unicode NFKC normalization first
- trim leading/trailing whitespace
- collapse internal whitespace
- compare case-insensitively

#### Scenario: Duplicate detection is global across sites
- **GIVEN** the user has two accounts with the same base name `My Site` but different `baseUrl` values
- **WHEN** the system renders account names in any UI surface
- **THEN** the system treats those accounts as same-name duplicates for display disambiguation

#### Scenario: Duplicate detection is case-insensitive and whitespace-normalized
- **GIVEN** the user has two accounts whose base names are `My Site` and `my   site`
- **WHEN** the system renders account names in any UI surface
- **THEN** the system treats those accounts as same-name duplicates for display disambiguation

#### Scenario: Duplicate detection treats empty-looking base names as the same comparison key
- **GIVEN** the user has two accounts whose stored base names are `""` and `   `
- **WHEN** the system determines whether those accounts are duplicates
- **THEN** the system normalizes both base names to the same empty comparison key
- **AND THEN** the stored base names remain unchanged

### Requirement: Duplicate accounts display a disambiguated name when username exists
When an account is part of a same-name duplicate set, and the account has a non-empty username after normalization, the system MUST render a disambiguated display name that appends the username to the base name using a consistent separator.

The disambiguated display name format MUST be:
- `<base name> · <username>`

The separator token ` · ` is presentation-only. Usernames MUST be appended literally, even when the username itself contains the same characters. UI surfaces MAY visually truncate long rendered labels for layout, but matching and sorting MUST continue to use the full underlying base name and username strings.

#### Scenario: Duplicate account with username is disambiguated
- **GIVEN** two accounts share the same base name `My Site`
- **AND GIVEN** account A has `username = alice`
- **WHEN** the system renders the account name for account A
- **THEN** the system displays `My Site · alice` as the account name

#### Scenario: Duplicate account with missing username is not modified
- **GIVEN** two accounts share the same base name `My Site`
- **AND GIVEN** account A has a missing username (`null` or empty string `""`)
- **WHEN** the system renders the account name for account A
- **THEN** the system displays `My Site` with no disambiguation suffix

#### Scenario: Duplicate accounts with identical usernames keep the same username-based label
- **GIVEN** two accounts share the same normalized base name `My Site`
- **AND GIVEN** both accounts have username `alice`
- **WHEN** the system renders those account names
- **THEN** each account displays `My Site · alice`
- **AND THEN** this change does not append an additional tertiary suffix

#### Scenario: Duplicate account with separator characters in username is rendered literally
- **GIVEN** two accounts share the same base name `My Site`
- **AND GIVEN** account A has username `alice · west`
- **WHEN** the system renders the account name for account A
- **THEN** the system displays `My Site · alice · west`
- **AND THEN** search treats the appended username text literally

#### Scenario: Duplicate account with an empty-looking base name preserves the stored base string
- **GIVEN** two accounts share base names that normalize to the same empty comparison key
- **AND GIVEN** account A stores base name `   ` and username `alice`
- **WHEN** the system renders the account name for account A
- **THEN** the system preserves account A's stored base-name string in the rendered label
- **AND THEN** the persisted base name remains unchanged

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
When a UI surface supports searching or filtering accounts by a text query, the search MUST normalize both the query text and account strings with the same normalization pipeline used for duplicate detection before matching. Search MUST support case-insensitive substring matches against both the base name and the appended username text for disambiguated entries.

#### Scenario: Search matches base name by case-insensitive substring
- **GIVEN** an account is displayed as `My Site · alice`
- **WHEN** the user searches for `my si`
- **THEN** the account is included in the matching results

#### Scenario: Search matches appended username by case-insensitive substring
- **GIVEN** an account is displayed as `My Site · alice`
- **WHEN** the user searches for `ALI`
- **THEN** the account is included in the matching results

### Requirement: Sorting by name is stable and uses base name then username
When a UI surface sorts accounts by name, the system MUST compare the base account name and the username using the same normalization pipeline used for duplicate detection. The normalized base account name is the primary sort key, the normalized username is the secondary sort key, missing usernames MUST sort as empty strings, and identical normalized pairs MUST fall back to the rendered label and then the account id for deterministic ordering.

#### Scenario: Duplicate accounts are ordered by username as a tie-break
- **GIVEN** two accounts share the normalized base name `My Site`
- **AND GIVEN** their usernames are `Bob` and `alice`
- **WHEN** the user sorts accounts by name ascending
- **THEN** the account `My Site · alice` appears before `My Site · Bob`

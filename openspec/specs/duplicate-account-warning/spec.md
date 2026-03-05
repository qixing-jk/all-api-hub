# duplicate-account-warning Specification

## Purpose
Prompt users for confirmation before continuing the account add flow when the target `site_url` already exists in storage, reducing accidental duplicates while keeping duplicates allowed.

## Requirements
### Requirement: Preference-controlled confirmation
The system MUST support a boolean user preference `warnOnDuplicateAccountAdd` that controls whether the duplicate-account warning is enforced in the account add flow.

#### Scenario: Backward compatibility default
- **GIVEN** stored preferences do not contain `warnOnDuplicateAccountAdd`
- **WHEN** preferences are loaded
- **THEN** the system MUST treat `warnOnDuplicateAccountAdd` as enabled (`true`)

#### Scenario: User can toggle the setting
- **GIVEN** the user is on Basic Settings → Account Management
- **WHEN** the user enables or disables the duplicate-account warning setting
- **THEN** the system MUST persist the new `warnOnDuplicateAccountAdd` value
- **AND THEN** the new value MUST be applied to subsequent account add flows

### Requirement: Duplicate detection uses exact `site_url` equality
In AccountDialog ADD mode, the system MUST treat an account as a possible duplicate when the dialog’s target `site_url` is exactly equal to an existing account’s persisted `site_url`.

#### Scenario: Valid URL input is normalized to base URL
- **GIVEN** a user enters a valid URL in the account add dialog
- **WHEN** the dialog updates its stored URL value
- **THEN** the target `site_url` MUST be normalized to `${protocol}//${host}` (no path/query/fragment)

#### Scenario: Invalid URL input is preserved
- **GIVEN** a user enters a URL value that cannot be parsed as a valid URL
- **WHEN** the dialog updates its stored URL value
- **THEN** the dialog MUST preserve the user-provided input (trimmed during downstream usage)

### Requirement: Add-flow entry is gated behind confirmation
When `warnOnDuplicateAccountAdd` is enabled and a duplicate `site_url` exists, the system MUST display a confirmation modal and MUST wait for user choice before continuing add-flow actions in ADD mode.

#### Scenario: Manual add flow prompts on duplicate site
- **GIVEN** AccountDialog is in ADD mode
- **AND GIVEN** there is at least one stored account with `site_url` equal to the dialog target `site_url`
- **AND GIVEN** `warnOnDuplicateAccountAdd` is enabled
- **WHEN** the user attempts to enter the manual add flow
- **THEN** the system MUST display the duplicate-account warning modal
- **AND THEN** the system MUST NOT proceed into the manual add flow unless the user chooses Continue

#### Scenario: Auto-detect prompts on duplicate site
- **GIVEN** AccountDialog is in ADD mode
- **AND GIVEN** there is at least one stored account with `site_url` equal to the dialog target `site_url`
- **AND GIVEN** `warnOnDuplicateAccountAdd` is enabled
- **WHEN** the user triggers auto-detection
- **THEN** the system MUST display the duplicate-account warning modal
- **AND THEN** the system MUST NOT start auto-detection unless the user chooses Continue

#### Scenario: Preference disabled bypasses the prompt
- **GIVEN** AccountDialog is in ADD mode
- **AND GIVEN** there is at least one stored account with `site_url` equal to the dialog target `site_url`
- **AND GIVEN** `warnOnDuplicateAccountAdd` is disabled
- **WHEN** the user triggers auto-detection or enters the manual add flow
- **THEN** the system MUST NOT show the duplicate-account warning modal

#### Scenario: Edit mode never prompts
- **GIVEN** AccountDialog is in EDIT mode
- **WHEN** the user interacts with the dialog
- **THEN** the system MUST NOT show the duplicate-account warning modal

### Requirement: Modal actions and content
The duplicate-account warning modal MUST provide Cancel and Continue actions and MUST include enough context for the user to understand what is duplicated.

#### Scenario: Cancel aborts the requested action
- **GIVEN** the duplicate-account warning modal is open
- **WHEN** the user chooses Cancel (or closes the modal)
- **THEN** the modal MUST close
- **AND THEN** the system MUST NOT proceed with the blocked action

#### Scenario: Continue allows the requested action to proceed
- **GIVEN** the duplicate-account warning modal is open
- **WHEN** the user chooses Continue
- **THEN** the modal MUST close
- **AND THEN** the system MUST proceed with the blocked action

#### Scenario: Modal displays site URL and duplicate context
- **GIVEN** the duplicate-account warning modal is open for a target `site_url`
- **THEN** the modal MUST display the target `site_url`

#### Scenario: Modal displays duplicate count when no exact match is available
- **GIVEN** the duplicate-account warning modal is open for a target `site_url`
- **AND GIVEN** the dialog `userId` is empty or does not match any existing stored account’s `account_info.id` for that `site_url`
- **THEN** the modal MUST display the number of existing stored accounts for that `site_url`

#### Scenario: Modal highlights exact user match when available
- **GIVEN** the duplicate-account warning modal is open for a target `site_url`
- **AND GIVEN** the dialog `userId` is non-empty and matches an existing stored account’s `account_info.id` for that `site_url`
- **THEN** the modal MUST display the matched `userId` and `username` for the existing account

### Requirement: One-time acknowledgement per `site_url` per dialog session
After the user chooses Continue for a given `site_url`, the system MUST NOT show the duplicate-account warning modal again for the same `site_url` within the same dialog session unless the `site_url` changes.

#### Scenario: Continue suppresses repeated prompts for the same URL
- **GIVEN** the user has chosen Continue for `site_url = X`
- **WHEN** the user triggers additional add-flow actions for `site_url = X`
- **THEN** the system MUST NOT re-open the duplicate-account warning modal

#### Scenario: Changing URL resets acknowledgement
- **GIVEN** the user has chosen Continue for `site_url = X`
- **WHEN** the user changes the dialog `site_url` to `Y`
- **AND WHEN** the user later returns to `site_url = X`
- **THEN** the system MUST prompt again if duplicates exist for `site_url = X` and the preference is enabled

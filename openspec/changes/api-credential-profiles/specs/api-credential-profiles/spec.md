# API Credential Profiles

## ADDED Requirements

### Requirement: Users can manage standalone API credential profiles

The system SHALL provide an Options UI page that allows users to create, view, edit, and delete standalone API credential profiles.

Each profile MUST store:
- `apiType`
- `baseUrl`
- `apiKey`

Each profile SHOULD support helper metadata:
- `name`
- `tagIds` (global tag ids shared with accounts/bookmarks)
- `notes`

#### Scenario: Create a new profile
- **WHEN** the user provides a name, selects an API type, enters a base URL, and enters an API key
- **THEN** the system saves the profile to extension local storage
- **AND** the profile appears in the profiles list

#### Scenario: Edit a profile
- **WHEN** the user edits the base URL, API key, or metadata fields
- **THEN** the system persists the changes

#### Scenario: Delete a profile
- **WHEN** the user deletes a profile and confirms the action
- **THEN** the system removes the profile from storage

### Requirement: Profiles support all verification API types

The system SHALL support at least the following `apiType` values:
- OpenAI-compatible
- OpenAI
- Anthropic
- Google/Gemini

#### Scenario: Change apiType updates verification behavior
- **WHEN** the user selects a different API type on a profile
- **THEN** verification actions use the selected API type

### Requirement: Base URL is normalized for safe downstream requests

The system SHALL normalize a user-provided base URL before persisting it.

Normalization MUST:
- Drop query and hash fragments
- Remove trailing slashes
- Avoid duplicating provider path prefixes such as `/v1` or `/v1beta` in downstream requests
- Preserve deployment subpaths (e.g. `https://example.com/api`)

#### Scenario: Persisting an OpenAI base URL with /v1
- **WHEN** a user saves `baseUrl` that includes `/v1`
- **THEN** the system stores the base URL without the `/v1` segment

#### Scenario: Persisting a Google base URL with /v1beta
- **WHEN** a user saves `baseUrl` that includes `/v1beta`
- **THEN** the system stores the base URL without the `/v1beta` segment

### Requirement: API keys are treated as secrets

The system MUST treat stored API keys as secrets.

- The UI MUST mask API keys by default.
- Logs MUST NOT contain raw API keys.
- Any user-facing error summaries MUST redact known keys.

### Requirement: Profiles can be verified without adding site accounts

The system SHALL allow verifying a profile’s credentials by executing `aiApiVerification` probes directly against the profile inputs.

#### Scenario: Verify a profile
- **WHEN** the user runs verification for a stored profile
- **THEN** the system executes probes using the profile’s `baseUrl`, `apiKey`, and `apiType`
- **AND** displays probe results without revealing the API key

### Requirement: Key Management can save account tokens into profiles

The system SHOULD allow users to save an existing account token (baseUrl + token key) from Key Management into an API credential profile.

#### Scenario: Save token as profile
- **WHEN** the user clicks “Save as API profile” for a token in Key Management
- **THEN** the system creates a profile with the token’s key and the owning account’s base URL

### Requirement: Backups may include profiles

The system SHOULD include API credential profiles in full backups (Import/Export + WebDAV sync) so profiles can be restored on another device.

### Requirement: Profiles can be quick-exported like Key Management

The system SHOULD allow exporting a stored API credential profile to the same quick-export targets available in Key Management, using the profile's `baseUrl` and `apiKey`.

Supported export targets SHOULD include:
- Cherry Studio (deeplink)
- CC Switch (deeplink)
- Kilo Code / Roo Code (settings JSON)
- CLIProxyAPI (provider import)
- Claude Code Router (provider import)
- Managed site channel creation (New API / Veloera / Octopus) when configured

#### Scenario: Quick export a profile
- **WHEN** the user selects an export target for a stored profile
- **THEN** the system performs the export/import action using the profile’s `baseUrl` and `apiKey`
- **AND** the system MUST NOT log the profile’s API key


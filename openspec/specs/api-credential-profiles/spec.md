# api-credential-profiles Specification

## Purpose
Define requirements for managing standalone API credential profiles (base URL + API key + API type) in the extension, including secure handling, verification probes, backup/restore inclusion, and quick-export flows.
## Requirements
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

#### Scenario: UI masks a stored API key
- **WHEN** a user views a stored profile
- **THEN** the system masks the API key value by default
- **AND** the system MUST NOT reveal the API key unless the user explicitly chooses to reveal it

### Requirement: Profiles can be verified without adding site accounts

The system SHALL allow the API Credential Profiles page to launch both direct API verification and CLI support verification for a stored profile without requiring a `SiteAccount`.

API verification MUST execute `aiApiVerification` probes directly against the stored profile inputs.

CLI support verification MUST reuse the shared profile-backed CLI verification flow, using the stored profile `baseUrl` and `apiKey` without requiring account token selection.
For stored profiles, the CLI verification dialog MUST attempt to fetch available models and let the user choose one, while still allowing manual model-id entry if the fetched list is unavailable or incomplete.

#### Scenario: Verify a profile with API probes
- **WHEN** the user runs API verification for a stored profile from the API Credential Profiles page
- **THEN** the system executes probes using the profile’s `baseUrl`, `apiKey`, and `apiType`
- **AND** displays probe results without revealing the API key

#### Scenario: Verify a profile with CLI support tests
- **WHEN** the user runs CLI support verification for a stored profile from the API Credential Profiles page
- **THEN** the system opens the shared CLI support verification flow using the profile’s `baseUrl` and `apiKey`
- **AND** the system MUST NOT require a `SiteAccount` or account token selection for that verification session

#### Scenario: Choose a fetched model for profile-backed CLI verification
- **WHEN** the shared CLI verification dialog opens for a stored profile
- **THEN** the system attempts to fetch model ids using the stored profile credentials
- **AND** presents the fetched model ids in a chooser inside the dialog
- **AND** still allows manual model-id entry when the fetched list cannot be used as-is

#### Scenario: CLI verification uses the same affordance as Model Management
- **GIVEN** CLI support verification is available for stored profiles in both API Credential Profiles and Model Management
- **WHEN** the user views the CLI verification action in either surface
- **THEN** the action MUST use the same command-line iconography so it is recognizable as the same CLI verification workflow

### Requirement: Key Management can save account tokens into profiles

The system SHALL allow users to save an existing account token (baseUrl + token key) from Key Management into an API credential profile.

#### Scenario: Save token as profile
- **WHEN** the user clicks “Save as API profile” for a token in Key Management
- **THEN** the system creates a profile with the token’s key and the owning account’s base URL

### Requirement: Backups may include profiles

The system SHALL include API credential profiles in full backups (Import/Export + WebDAV sync) so profiles can be restored on another device.

#### Scenario: Backup round-trip restores profiles
- **WHEN** the user exports a full backup that includes profiles
- **AND** the user imports that backup on another device
- **THEN** the system restores the exported profiles

### Requirement: Profiles can be quick-exported like Key Management

The system SHALL allow exporting a stored API credential profile to the same quick-export targets available in Key Management, using the profile's `baseUrl` and `apiKey`.

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

### Requirement: Stored profiles can be reused directly in Model Management

The system SHALL expose stored API credential profiles to Model Management directly from profile storage.

The system MUST NOT require creating or persisting a mirrored `SiteAccount` record in order to use a stored profile as a model-management source.

#### Scenario: Model Management uses a stored profile directly
- **GIVEN** a stored API credential profile exists
- **WHEN** the user selects that profile in Model Management
- **THEN** the system uses the stored profile's saved `id`, `name`, `apiType`, `baseUrl`, and `apiKey` as the selected source
- **AND** the system does not create a duplicate site account record for that profile

#### Scenario: Editing a selected profile updates Model Management source data
- **GIVEN** a stored API credential profile is currently selected in Model Management
- **WHEN** the user edits that profile and saves changes
- **THEN** Model Management continues referencing the same profile id
- **AND** the selector label and subsequent model-management requests use the updated profile data

#### Scenario: Deleting a selected profile clears stale Model Management selection
- **GIVEN** a stored API credential profile is currently selected in Model Management
- **WHEN** the user deletes that profile
- **THEN** Model Management clears or invalidates that selected source
- **AND** the deleted profile no longer appears as a selectable model-management option

### Requirement: Profile verification launched from Model Management remains model-aware

When Model Management launches profile verification, the system SHALL reuse the stored API credential profile directly and keep the verification session scoped to that profile.

The verification dialog MUST be able to accept an initial model id from the selected model row, fetch model suggestions for the active verification API type, and redact known API keys from model-fetch failures.

Temporary API type changes made inside the verification dialog MUST affect only that open verification session and MUST NOT rewrite the stored profile.

#### Scenario: Model row verification pre-fills the selected model id
- **GIVEN** a profile-backed model row is visible in Model Management
- **WHEN** the user opens API verification from that row
- **THEN** the verification dialog starts with that model id selected or suggested for follow-up probes
- **AND** the dialog continues using the stored profile instead of requiring a site account

#### Scenario: Temporary verification apiType changes do not rewrite the stored profile
- **GIVEN** a stored API credential profile has a persisted `apiType`
- **WHEN** the user temporarily switches the verification dialog to another supported API type while verifying that profile from Model Management
- **THEN** the dialog fetches model suggestions and runs probes using the temporary verification API type
- **AND** the stored profile keeps its original persisted `apiType` after the dialog closes


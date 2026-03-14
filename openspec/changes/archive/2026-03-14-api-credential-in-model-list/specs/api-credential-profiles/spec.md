## ADDED Requirements

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

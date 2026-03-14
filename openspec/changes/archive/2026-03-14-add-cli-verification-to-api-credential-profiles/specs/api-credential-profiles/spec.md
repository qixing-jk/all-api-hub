## MODIFIED Requirements

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

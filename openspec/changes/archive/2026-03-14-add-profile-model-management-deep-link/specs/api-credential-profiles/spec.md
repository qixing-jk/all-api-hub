## ADDED Requirements

### Requirement: Profiles can open Model Management through a profile deep link

The system SHALL provide a per-profile action on the API Credential Profiles page that opens Model Management already focused on the selected stored profile.

The deep link MUST identify the target profile by its stored `profileId` and MUST NOT serialize raw credential material into the URL.

#### Scenario: Open Model Management for a stored profile
- **GIVEN** a stored API credential profile is visible on the API Credential Profiles page
- **WHEN** the user triggers the profile's Model Management action
- **THEN** the system opens Model Management with a deep link targeting that profile's `id`
- **AND** Model Management resolves that stored profile as the active selected source

#### Scenario: Profile deep links keep credentials out of the URL
- **WHEN** the system constructs a Model Management deep link for a stored API credential profile
- **THEN** the URL includes only routing state needed to identify the stored profile
- **AND** the URL MUST NOT include the profile's raw `apiKey`
- **AND** the URL MUST NOT include duplicated serialized credential payload fields

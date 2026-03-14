## ADDED Requirements

### Requirement: Model Management honors profile-targeted deep links

The system SHALL allow Model Management to resolve a stored API credential profile directly from routing state, in addition to the existing account-targeted deep-link behavior.

The route contract MUST support `profileId=<id>` as a profile-backed selection target. During initialization, the system MUST resolve deep-link targets against live account/profile storage and MUST NOT keep a stale profile selection when the target no longer exists.

If both `profileId` and `accountId` are present, the system MUST use this precedence order:

1. a valid `profileId`
2. a valid `accountId`
3. no preselected source

#### Scenario: Valid profile deep link selects the stored profile
- **GIVEN** the Model Management route contains `profileId=profile-1`
- **AND** a stored API credential profile with id `profile-1` exists
- **WHEN** Model Management initializes
- **THEN** the system selects that profile as the active source
- **AND** the page loads models using the profile-backed source

#### Scenario: Valid profile target overrides a simultaneous account target
- **GIVEN** the Model Management route contains both a valid `profileId` and a valid `accountId`
- **WHEN** Model Management initializes
- **THEN** the system selects the profile-backed source
- **AND** the simultaneous `accountId` target is ignored

#### Scenario: Stale profile target falls back to a valid account target
- **GIVEN** the Model Management route contains a `profileId` that does not match any stored profile
- **AND** the route also contains a valid `accountId`
- **WHEN** Model Management initializes after route targets are resolved
- **THEN** the system ignores the stale profile target
- **AND** the system selects the account-backed source addressed by `accountId`

#### Scenario: Stale profile target does not keep an invalid selection
- **GIVEN** the Model Management route contains a `profileId` that does not match any stored profile
- **AND** the route does not contain any valid fallback source target
- **WHEN** Model Management initializes after profile storage has loaded
- **THEN** the system does not keep a stale profile-backed selection
- **AND** the page remains usable without selecting an invalid source

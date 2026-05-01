## ADDED Requirements

### Requirement: AxonHub can participate in managed-site channel migration
The managed-site channel migration workflow MUST support AxonHub as an eligible source and target managed-site type when AxonHub has a complete saved admin configuration.

AxonHub participation MUST preserve the existing create-only migration contract: the workflow MUST create new target channels only, MUST NOT mutate source channels, MUST NOT sync or overwrite existing target channels, and MUST continue reporting per-channel outcomes.

#### Scenario: AxonHub source exposes migration entry points
- **GIVEN** AxonHub is the active managed-site type
- **AND** at least one other eligible migration target is configured
- **WHEN** the user opens the managed-site channel management page
- **THEN** the system MUST expose the existing single-channel and batch migration entry points for AxonHub channels
- **AND** the system MUST continue hiding controls that depend on New API-only AxonHub-unsupported behavior

#### Scenario: Configured AxonHub appears as a migration target
- **GIVEN** the active managed-site type is not AxonHub
- **AND** AxonHub has a complete saved admin configuration
- **WHEN** the user opens the migration target picker
- **THEN** the system MUST include AxonHub as a selectable migration target

#### Scenario: AxonHub is excluded when it is the source
- **GIVEN** AxonHub is the active managed-site type
- **WHEN** the user opens the migration target picker
- **THEN** the system MUST NOT include AxonHub as a migration target for the same migration run

#### Scenario: Incomplete AxonHub configuration is not selectable
- **GIVEN** AxonHub is missing any required admin configuration field
- **WHEN** the user opens the migration target picker from another managed-site type
- **THEN** the system MUST NOT include AxonHub as a selectable migration target
- **AND** the migration entry explanation MUST continue to tell the user that another configured managed-site target is required when no eligible target remains

### Requirement: Migration preview normalizes AxonHub channel fields
When AxonHub is the source or target of a managed-site channel migration, the preview stage MUST normalize channel fields into a target draft that can be reviewed before execution.

The preview MUST preserve supported shared fields including name, base URL, usable key material, model list, status, and compatible provider type. The preview MUST warn when AxonHub migration remaps or drops source fields that cannot be represented safely by the target backend.

#### Scenario: AxonHub source channel is converted for a non-AxonHub target
- **GIVEN** AxonHub is the source managed-site type
- **AND** the selected AxonHub channel has a usable credential, models, base URL, status, and string provider type
- **WHEN** the user selects a non-AxonHub migration target
- **THEN** the preview MUST create a ready target draft using the channel name, base URL, credential, models, and mapped shared provider type
- **AND** the preview MUST warn when the AxonHub provider type is remapped for the target

#### Scenario: Non-AxonHub source channel is converted for AxonHub target
- **GIVEN** AxonHub is the selected migration target
- **AND** the selected source channel has a usable credential, models, base URL, status, and provider type
- **WHEN** the preview is built
- **THEN** the preview MUST create a ready target draft with an AxonHub-compatible string provider type
- **AND** the preview MUST warn when the source provider type is remapped or defaulted for AxonHub

#### Scenario: AxonHub migration blocks channels without usable key material
- **GIVEN** AxonHub is the source managed-site type
- **AND** a selected AxonHub channel does not expose usable credential material to the migration preview
- **WHEN** the preview is built
- **THEN** the system MUST mark only that channel as blocked
- **AND** the system MUST explain that source key material is missing or could not be resolved
- **AND** the system MUST allow other ready channels in the same preview to continue

#### Scenario: AxonHub migration warns about unsupported field loss
- **GIVEN** AxonHub is the source or target of a migration
- **AND** the selected source channel includes model mappings, status-code mappings, advanced settings, multi-key state, priority, weight, or status values that cannot be preserved exactly
- **WHEN** the preview is built
- **THEN** the preview MUST include warning codes or localized warning copy describing the affected field loss, simplification, or remapping

### Requirement: Migration execution creates AxonHub targets through the managed-site service
When AxonHub is the selected migration target, execution MUST create target channels through the AxonHub managed-site service contract and MUST use AxonHub admin GraphQL behavior behind that service.

Execution MUST preserve per-channel isolation: a failed AxonHub create operation MUST be reported for that channel without aborting remaining ready channels.

#### Scenario: Ready channel creates an AxonHub target channel
- **GIVEN** AxonHub is the selected migration target
- **AND** the preview contains a ready channel draft
- **WHEN** the user confirms migration
- **THEN** the system MUST build the create payload through the AxonHub managed-site service
- **AND** the system MUST create the channel through the AxonHub managed-site service
- **AND** the system MUST report that channel as successful when AxonHub creation succeeds

#### Scenario: AxonHub target create failure is reported per channel
- **GIVEN** AxonHub is the selected migration target
- **AND** the preview contains multiple ready channel drafts
- **WHEN** one AxonHub create operation fails
- **THEN** the system MUST report that channel as failed with the failure reason
- **AND** the system MUST continue attempting the remaining ready channel drafts


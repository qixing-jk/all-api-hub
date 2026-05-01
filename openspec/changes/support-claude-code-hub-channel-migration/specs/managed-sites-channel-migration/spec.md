## ADDED Requirements

### Requirement: Claude Code Hub can participate in managed-site channel migration
The managed-site channel migration workflow MUST support Claude Code Hub as an eligible source and target managed-site type when Claude Code Hub has a complete saved admin configuration.

Claude Code Hub participation MUST preserve the existing create-only migration contract: the workflow MUST create new target providers or channels only, MUST NOT mutate source providers or channels, MUST NOT sync or overwrite existing targets, and MUST continue reporting per-channel outcomes.

#### Scenario: Claude Code Hub source exposes migration entry points
- **GIVEN** Claude Code Hub is the active managed-site type
- **AND** at least one other eligible migration target is configured
- **WHEN** the user opens the managed-site channel management page
- **THEN** the system MUST expose the existing single-channel and batch migration entry points for Claude Code Hub providers
- **AND** the system MUST continue hiding controls that depend on Claude Code Hub-unsupported managed-site features

#### Scenario: Configured Claude Code Hub appears as a migration target
- **GIVEN** the active managed-site type is not Claude Code Hub
- **AND** Claude Code Hub has a complete saved admin configuration
- **WHEN** the user opens the migration target picker
- **THEN** the system MUST include Claude Code Hub as a selectable migration target

#### Scenario: Claude Code Hub is excluded when it is the source
- **GIVEN** Claude Code Hub is the active managed-site type
- **WHEN** the user opens the migration target picker
- **THEN** the system MUST NOT include Claude Code Hub as a migration target for the same migration run

#### Scenario: Incomplete Claude Code Hub configuration is not selectable
- **GIVEN** Claude Code Hub is missing any required admin configuration field
- **WHEN** the user opens the migration target picker from another managed-site type
- **THEN** the system MUST NOT include Claude Code Hub as a selectable migration target
- **AND** the migration entry explanation MUST continue to tell the user that another configured managed-site target is required when no eligible target remains

### Requirement: Migration preview normalizes Claude Code Hub provider fields
When Claude Code Hub is the source or target of a managed-site channel migration, the preview stage MUST normalize channel and provider fields into a target draft that can be reviewed before execution.

The preview MUST preserve supported shared fields including name, base URL, usable key material, model list, enabled status, compatible provider type, group tag, priority, and weight when the target backend can represent those fields safely. The preview MUST warn when Claude Code Hub migration remaps, drops, defaults, or simplifies source fields that cannot be represented safely by the target backend.

#### Scenario: Claude Code Hub source provider is converted for a non-Claude-Code-Hub target
- **GIVEN** Claude Code Hub is the source managed-site type
- **AND** the selected Claude Code Hub provider has usable key material, models, base URL, enabled state, and provider type
- **WHEN** the user selects a non-Claude-Code-Hub migration target
- **THEN** the preview MUST create a ready target draft using the provider name, base URL, key material, models, enabled state, and mapped shared provider type
- **AND** the preview MUST warn when the Claude Code Hub provider type is remapped or defaulted for the target

#### Scenario: Non-Claude-Code-Hub source channel is converted for Claude Code Hub target
- **GIVEN** Claude Code Hub is the selected migration target
- **AND** the selected source channel has usable key material, models, base URL, status, and provider type
- **WHEN** the preview is built
- **THEN** the preview MUST create a ready target draft with a Claude Code Hub-compatible provider type
- **AND** the preview MUST warn when the source provider type is remapped or defaulted for Claude Code Hub

#### Scenario: Claude Code Hub migration blocks providers without usable key material
- **GIVEN** Claude Code Hub is the source managed-site type
- **AND** a selected Claude Code Hub provider exposes only a masked key or no key material to the migration preview
- **WHEN** the preview is built
- **THEN** the system MUST mark only that provider as blocked
- **AND** the system MUST explain that source key material is missing or could not be resolved
- **AND** the system MUST allow other ready providers in the same preview to continue

#### Scenario: Claude Code Hub target uses provider-safe defaults
- **GIVEN** Claude Code Hub is the selected migration target
- **AND** a selected source channel has fields that Claude Code Hub cannot represent exactly
- **WHEN** the preview is built
- **THEN** the preview MUST default or simplify only the affected target provider fields
- **AND** the preview MUST include warning codes or localized warning copy describing the affected field loss, simplification, or remapping

### Requirement: Migration execution creates Claude Code Hub targets through the managed-site service
When Claude Code Hub is the selected migration target, execution MUST create target providers through the Claude Code Hub managed-site service contract and MUST use Claude Code Hub provider action API behavior behind that service.

Execution MUST preserve per-channel isolation: a failed Claude Code Hub create operation MUST be reported for that item without aborting remaining ready items.

#### Scenario: Ready channel creates a Claude Code Hub target provider
- **GIVEN** Claude Code Hub is the selected migration target
- **AND** the preview contains a ready channel draft
- **WHEN** the user confirms migration
- **THEN** the system MUST build the create payload through the Claude Code Hub managed-site service
- **AND** the system MUST create the provider through the Claude Code Hub managed-site service
- **AND** the system MUST report that item as successful when Claude Code Hub creation succeeds

#### Scenario: Claude Code Hub target create failure is reported per item
- **GIVEN** Claude Code Hub is the selected migration target
- **AND** the preview contains multiple ready channel drafts
- **WHEN** one Claude Code Hub create operation fails
- **THEN** the system MUST report that item as failed with the failure reason
- **AND** the system MUST continue attempting the remaining ready channel drafts

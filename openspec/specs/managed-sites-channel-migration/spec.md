# managed-sites-channel-migration Specification

## Purpose
Define the first managed-site channel migration workflow for All API Hub: a create-only flow that lets the user copy channels from the currently active managed site to another configured managed site with explicit target selection, preview validation, and result reporting.

## Requirements

### Requirement: Managed-site channel management exposes migration entry points
The managed-site channels page MUST expose migration entry points for single-channel and batch flows whenever at least one eligible target managed site is configured.

#### Scenario: Row action starts a single-channel migration
- **WHEN** the user triggers migration from a channel row action
- **THEN** the system MUST open the migration flow with that channel preselected

#### Scenario: Batch migration uses the current explicit row selection
- **GIVEN** the user has selected one or more channels in the managed-site channels table
- **WHEN** the user triggers the batch migration action
- **THEN** the system MUST open the migration flow with the selected channels preselected

#### Scenario: Migrate all uses the current filtered dataset
- **GIVEN** the user has applied filters in the managed-site channels table
- **WHEN** the user triggers the migrate-all action
- **THEN** the system MUST include all channels in the current filtered dataset
- **AND** the system MUST NOT limit the operation to only the current pagination page

#### Scenario: Migration entry explains when no target is configured
- **GIVEN** no other managed-site target is currently eligible for migration
- **WHEN** the user attempts to enter migration mode
- **THEN** the system MUST keep the migration workflow unavailable
- **AND** the UI MUST explain that another managed-site target must be configured first

#### Scenario: Migration mode keeps source-channel review available
- **GIVEN** the user has entered migration mode
- **WHEN** the user uses the managed-site channels page toolbar or row actions
- **THEN** the system MUST keep refresh available
- **AND** the system MUST allow read-only inspection of source channels
- **AND** the system MUST NOT expose edit, sync, or delete row actions while migration mode is active

### Requirement: Migration targets come from configured managed-site admin contexts
The system MUST let the operator choose a target only from configured managed-site admin contexts that have complete credentials and are different from the current active managed site.

The migration target picker MUST NOT require ad-hoc URLs or temporary credentials in this flow.

#### Scenario: Target list excludes the active managed site
- **GIVEN** the current managed-site type is already selected for the source channel list
- **WHEN** the user opens the migration target picker
- **THEN** the system MUST NOT offer the current active managed-site type as a migration target

#### Scenario: Only complete configured targets are selectable
- **GIVEN** one managed-site type has a complete stored admin configuration and another has missing required credentials
- **WHEN** the user opens the migration target picker
- **THEN** the system MUST allow selecting only the fully configured target
- **AND** the system MUST NOT allow migration to the incomplete target

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

### Requirement: Migration preview validates selected channels before execution
Before creating any target channel, the system MUST show a preview for the selected source channels and chosen target managed site.

The preview MUST identify which selected channels are ready to migrate and which are blocked, and it MUST warn when the migration will drop, default, or remap source channel fields for the chosen target. The preview MUST also warn that this first migration flow creates new target channels only, does not sync or merge existing target channels, and does not provide rollback.

#### Scenario: Preview shows field-mapping warnings for the chosen target
- **WHEN** the user chooses a migration target and the system builds the preview
- **THEN** the system MUST show warnings for selected channels whose source fields cannot be preserved exactly for that target

#### Scenario: Preview warns that the flow is create-only
- **WHEN** the preview is shown
- **THEN** the system MUST inform the user that the flow creates new target channels only
- **AND** the system MUST inform the user that the flow does not deduplicate or sync existing target channels
- **AND** the system MUST inform the user that rollback is not available in this change

#### Scenario: Preview cannot continue when every selected channel is blocked
- **GIVEN** the preview has no ready channels remaining
- **WHEN** the user reviews the migration preview
- **THEN** the system MUST prevent execution from starting

### Requirement: Preview resolves required source secrets before execution
When creating a target channel requires source data that is not available in the source list payload, the preview stage MUST attempt to resolve that data before enabling execution.

If the required source data cannot be resolved, the system MUST block only the affected channels and MUST explain why those channels cannot be migrated yet.

#### Scenario: Hidden source secret is resolved during preview
- **GIVEN** a selected source channel is missing required key material in the list payload
- **WHEN** the system can resolve that key material during preview
- **THEN** the system MUST mark that channel as ready if no other blocking issue remains

#### Scenario: Verification or detail loading failure blocks only the affected channel
- **GIVEN** a selected source channel is missing required key material in the list payload
- **WHEN** the system cannot resolve that key because verification or source-detail loading is required and does not complete successfully
- **THEN** the system MUST mark only that channel as blocked
- **AND** the system MUST explain why that channel cannot be migrated yet

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

### Requirement: Migration execution creates new target channels without mutating source or existing targets
When the user confirms migration, the system MUST attempt to create a new target channel for each ready selected source channel.

This flow MUST NOT update, delete, disable, or otherwise mutate the source channels, and it MUST NOT update or merge into existing target channels as part of this change. While execution is in progress, the dialog MUST prevent accidental dismissal until the run reaches a result state.

#### Scenario: Successful migration creates new target channels and leaves source unchanged
- **GIVEN** one or more selected channels are ready in preview
- **WHEN** the user confirms migration and all create operations succeed
- **THEN** the system MUST create new channels on the chosen target managed site for each ready selected channel
- **AND** the system MUST leave the source channels unchanged

#### Scenario: Blocked channels are not attempted during execution
- **GIVEN** the preview contains both ready and blocked selected channels
- **WHEN** the user confirms migration
- **THEN** the system MUST attempt migration only for the ready channels
- **AND** the system MUST NOT send target create requests for blocked channels

#### Scenario: Existing target conflicts do not trigger sync or overwrite
- **GIVEN** the target managed site already contains a similar or conflicting channel
- **WHEN** the user confirms migration
- **THEN** the system MUST NOT update or overwrite that existing target channel as part of this flow
- **AND** the system MUST report the create failure if the target backend rejects the new channel

#### Scenario: In-flight migration cannot be dismissed accidentally
- **GIVEN** the user has confirmed migration and execution is in progress
- **WHEN** the migration dialog is shown
- **THEN** the system MUST prevent backdrop, escape-key, or explicit close dismissal until execution finishes

### Requirement: Migration reports per-channel outcomes after execution
After execution finishes, the system MUST present an overall summary and per-channel results for the selected migration run.

The result report MUST distinguish successful creations from failures, and it MUST preserve the failure reason for each failed channel. When some channels fail, the system MUST continue attempting the remaining ready channels instead of aborting the entire run after the first error.

#### Scenario: All selected ready channels migrate successfully
- **WHEN** every attempted target channel creation succeeds
- **THEN** the system MUST show a success summary for the completed migration run
- **AND** the system MUST identify the channels that were created

#### Scenario: Migration partially fails and reports channel-level errors
- **WHEN** at least one attempted channel creation fails during a migration run
- **THEN** the system MUST continue attempting the remaining ready channels
- **AND** the system MUST show a mixed-result summary after execution finishes
- **AND** the system MUST report the failure reason for each failed channel

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

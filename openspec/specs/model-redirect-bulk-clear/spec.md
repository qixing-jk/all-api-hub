# model-redirect-bulk-clear Specification

## Purpose
TBD - created by syncing change clear-model-redirect-settings. Update Purpose after archive.
## Requirements

### Requirement: User can preview channels and choose which model redirect maps to clear
When the user is in a valid managed-site context, the UI MUST provide an action to preview managed-site channels and
choose which channels’ model redirect maps (`model_mapping`) will be cleared.

#### Scenario: Clear action is available when managed-site config is valid
- **WHEN** the user opens the model redirect settings section
- **THEN** the UI MUST render a clear action for channel model redirect maps
- **AND** the action MUST be disabled when managed-site configuration is missing or invalid

#### Scenario: Preview lists channels and allows selection
- **WHEN** the user opens the clear action preview
- **THEN** the UI MUST render a list of channels
- **AND** the UI MUST allow selecting and unselecting channels in the list

#### Scenario: Default selection is all channels
- **WHEN** the preview list first loads successfully
- **THEN** the UI MUST select all channels by default

#### Scenario: User can quickly select all or none
- **WHEN** the user clicks “select all” in the preview
- **THEN** the UI MUST select all channels
- **WHEN** the user clicks “select none” in the preview
- **THEN** the UI MUST unselect all channels

### Requirement: Bulk clear requires explicit confirmation
The system MUST require explicit user confirmation before performing the bulk clear operation, because it is destructive
and may remove user-entered custom mappings.

#### Scenario: User cancels confirmation and no changes occur
- **WHEN** the user proceeds from the preview to confirmation and then cancels the confirmation dialog
- **THEN** the system MUST NOT send any channel update requests
- **AND** the system MUST leave all channel `model_mapping` values unchanged

#### Scenario: User confirms and bulk clear begins
- **WHEN** the user confirms the confirmation dialog
- **THEN** the system MUST start the bulk clear operation
- **AND** the UI MUST prevent accidental dialog dismissal while the operation is in progress

### Requirement: Bulk clear only clears selected channels and reports results
When a bulk clear is confirmed, the system MUST update the selected channels so that their `model_mapping` becomes an
empty JSON object (`{}`), MUST leave unselected channels unchanged, and MUST report the outcome.

#### Scenario: Clearing succeeds for all selected channels
- **WHEN** the user confirms a bulk clear with a non-empty selection and all selected channel updates succeed
- **THEN** the system MUST write `model_mapping = "{}"` for every selected channel
- **AND** the system MUST present a success confirmation to the user

#### Scenario: Clearing partially fails and errors are reported
- **WHEN** the user confirms a bulk clear and at least one selected channel update fails
- **THEN** the system MUST continue attempting to clear remaining channels
- **AND** the system MUST present a summary indicating which channels failed and why

#### Scenario: User cannot confirm with an empty selection
- **WHEN** the user has unselected all channels in the preview
- **THEN** the UI MUST prevent continuing to the confirmation step

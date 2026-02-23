# done-hub-admin-management Specification

## Purpose
TBD - created by archiving change done-hub-management-support. Update Purpose after archive.
## Requirements
### Requirement: Done Hub can be selected as managed site type
The settings UI MUST allow selecting `done-hub` as the managed site type so that all managed-site features (channels, model sync, model redirect) operate against Done Hub.

#### Scenario: Selecting Done Hub switches managed-site context
- **WHEN** the user selects `done-hub` in the managed site type selector
- **THEN** the extension MUST persist `managedSiteType = done-hub`
- **AND** managed-site screens MUST resolve services/config using the Done Hub managed-site context

### Requirement: Done Hub admin credentials can be configured
The extension MUST allow users to configure Done Hub admin credentials required for management operations, including base URL, admin token, and user ID.

#### Scenario: Credentials are saved and used for management operations
- **WHEN** the user saves Done Hub base URL, admin token, and user ID in basic settings
- **THEN** the extension MUST persist those credentials under the Done Hub managed-site configuration
- **AND** subsequent managed-site operations MUST use the persisted Done Hub credentials

### Requirement: Channel management works for Done Hub
When `managedSiteType = done-hub` and valid credentials are configured, the extension MUST allow listing, creating, updating, and deleting channels through the managed-site channel management UI.

#### Scenario: Channel list loads for Done Hub
- **WHEN** the user opens the managed-site channels page with `managedSiteType = done-hub`
- **THEN** the extension MUST fetch channels from Done Hub and render the channel list

#### Scenario: Create channel refreshes the list
- **WHEN** the user creates a channel successfully while `managedSiteType = done-hub`
- **THEN** the extension MUST show a success confirmation
- **AND** MUST refresh the channel list to include the new channel

### Requirement: Model sync works for Done Hub
When `managedSiteType = done-hub`, model sync MUST be able to enumerate channels, fetch upstream models per channel, and update channel model lists using Done Hub admin APIs.

#### Scenario: Triggering model sync updates channel models
- **WHEN** the user triggers model sync for one or more channels while `managedSiteType = done-hub`
- **THEN** the extension MUST fetch upstream models for each selected channel
- **AND** MUST update the channel models field when differences are detected
- **AND** MUST report per-channel success/failure results to the UI

### Requirement: Model redirect works for Done Hub
When model redirect is enabled and `managedSiteType = done-hub`, the extension MUST be able to generate and apply a `model_mapping` update for eligible channels. The generated mapping MUST follow the [Model Redirect Mapping Guardrails](../model-redirect-mapping-guardrails/spec.md) (no version downgrades/upgrades).

#### Scenario: Applying model redirect writes version-safe model_mapping for Done Hub channels
- **WHEN** the user runs model redirect with `managedSiteType = done-hub`
- **THEN** the extension MUST compute a standard-model-to-actual-model mapping per channel that contains no version-downgrade or version-upgrade mappings
- **AND** MUST merge the mapping into the channel’s existing `model_mapping`
- **AND** MUST persist the updated `model_mapping` via Done Hub admin APIs

#### Scenario: Incompatible standard models are left unmapped
- **WHEN** a selected standard model has no version-compatible actual model in a Done Hub channel’s `models` list
- **THEN** the extension MUST NOT write a `model_mapping` entry for that standard model for that channel


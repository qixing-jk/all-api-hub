## MODIFIED Requirements

### Requirement: Unsupported AxonHub managed-site actions are not exposed
The extension MUST NOT expose managed-site actions for AxonHub when those actions depend on New API-only semantics that are not implemented for AxonHub in this change.

This includes New API-only controls such as groups, priority, model sync, or model redirect unless a later requirement explicitly adds AxonHub support for those actions. This exclusion MUST NOT block the create-only managed-site channel migration workflow when AxonHub migration requirements are satisfied.

#### Scenario: AxonHub can be offered as a channel migration target
- **WHEN** the user opens an existing managed-site channel migration workflow from a non-AxonHub managed-site source
- **AND** AxonHub has a complete saved admin configuration
- **THEN** the extension MUST offer AxonHub as a migration target
- **AND** the extension MUST create migrated AxonHub channels through the AxonHub managed-site service and admin GraphQL integration

#### Scenario: AxonHub can be offered as a channel migration source
- **WHEN** the user opens the managed-site channel management page with `managedSiteType = axonhub`
- **AND** at least one other eligible managed-site migration target is configured
- **THEN** the extension MUST offer channel migration entry points for AxonHub channels
- **AND** the extension MUST NOT expose New API-only edit, sync, redirect, group, or priority actions as part of enabling migration

#### Scenario: AxonHub channel page hides New API-only controls
- **WHEN** the user manages channels with `managedSiteType = axonhub`
- **THEN** the extension MUST hide or disable controls that require unsupported New API-only fields
- **AND** disabled controls MUST provide local explanatory copy rather than failing silently

## ADDED Requirements

### Requirement: AxonHub channel migration uses AxonHub-compatible channel creation
When AxonHub is a migration target, the extension MUST convert migration drafts into AxonHub-compatible create-channel input before invoking AxonHub channel creation.

The conversion MUST use AxonHub string channel types, AxonHub credential objects, model arrays, and AxonHub status behavior. It MUST NOT submit New API numeric provider types, group fields, priority fields, or other New API-only payload semantics as AxonHub channel creation data.

#### Scenario: Migrated AxonHub channel uses string provider type
- **GIVEN** AxonHub is the selected migration target
- **AND** the source channel has a provider type that can be mapped to an AxonHub provider type
- **WHEN** the migrated channel create payload is built
- **THEN** the payload MUST use an AxonHub string provider type
- **AND** the payload MUST NOT send a New API numeric provider type as the AxonHub channel type

#### Scenario: Migrated AxonHub channel uses AxonHub credential and model shapes
- **GIVEN** AxonHub is the selected migration target
- **AND** the preview draft contains a usable key and model list
- **WHEN** the migrated channel is created
- **THEN** the AxonHub create input MUST send the key through AxonHub credentials
- **AND** the AxonHub create input MUST send models through AxonHub supported and manual model lists
- **AND** the AxonHub create input MUST derive a default test model from the final model list

#### Scenario: Migrated AxonHub channel applies requested enabled status
- **GIVEN** AxonHub is the selected migration target
- **AND** the preview draft requests the final enabled status
- **WHEN** the migrated channel is created
- **THEN** the extension MUST ensure the created AxonHub channel ends in the enabled state
- **AND** the extension MUST account for AxonHub create behavior that may default newly created channels to disabled

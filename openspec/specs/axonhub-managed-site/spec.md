# axonhub-managed-site Specification

## Purpose

Provide a basic self-managed AxonHub integration in All API Hub so users can configure an AxonHub admin context, manage AxonHub channels, and import an existing account token as an AxonHub channel without enabling bulk channel migration.

## Requirements

### Requirement: AxonHub can be selected as managed site type
The settings UI MUST allow selecting `axonhub` as the managed site type.

When AxonHub is selected, managed-site screens MUST resolve managed-site labels, configuration, services, and messages from the AxonHub managed-site context without changing existing New API, Veloera, DoneHub, or Octopus behavior.

#### Scenario: Selecting AxonHub switches managed-site context
- **WHEN** the user selects `axonhub` in the managed site type selector
- **THEN** the extension MUST persist `managedSiteType = axonhub`
- **AND** managed-site screens MUST resolve AxonHub-specific configuration and services

#### Scenario: Other managed-site types remain selectable
- **WHEN** AxonHub support is available
- **THEN** the managed site type selector MUST still offer the existing New API, Veloera, DoneHub, and Octopus options
- **AND** selecting those existing options MUST continue to resolve their existing managed-site services

### Requirement: AxonHub admin credentials can be configured and validated
The extension MUST allow users to configure AxonHub admin credentials required for management operations, including base URL, admin email, and admin password.

The extension MUST validate AxonHub credentials through the AxonHub admin sign-in flow and MUST NOT require a service-account OpenAPI key for channel management.

#### Scenario: Credentials are saved for AxonHub management
- **WHEN** the user saves AxonHub base URL, admin email, and admin password in basic settings
- **THEN** the extension MUST persist those credentials under the AxonHub managed-site configuration
- **AND** subsequent AxonHub managed-site operations MUST use the persisted AxonHub configuration

#### Scenario: Credential validation signs in to AxonHub admin API
- **WHEN** the user validates AxonHub configuration with complete credentials
- **THEN** the extension MUST attempt AxonHub admin sign-in against the configured base URL
- **AND** the extension MUST report validation success only when the sign-in response yields a usable admin session token

#### Scenario: Invalid credentials show a safe error
- **WHEN** AxonHub credential validation fails
- **THEN** the extension MUST show a user-facing failure message
- **AND** the extension MUST NOT include the configured password or raw token value in the message

### Requirement: AxonHub management uses the admin GraphQL API
AxonHub managed-site operations MUST authenticate with the AxonHub admin sign-in endpoint and perform channel operations through AxonHub's authenticated admin GraphQL endpoint.

The extension MUST NOT attempt AxonHub channel CRUD through New API-compatible REST endpoints or AxonHub's service-account OpenAPI GraphQL endpoint.

#### Scenario: Channel list uses admin GraphQL
- **WHEN** the user opens the managed-site channels page with `managedSiteType = axonhub`
- **THEN** the extension MUST authenticate through AxonHub admin sign-in when no usable session token is available
- **AND** the extension MUST request channel data from the AxonHub admin GraphQL endpoint

#### Scenario: Expired admin session is refreshed
- **GIVEN** an AxonHub managed-site operation has a cached admin session token
- **WHEN** AxonHub rejects the operation because the session is expired or unauthorized
- **THEN** the extension MUST attempt one fresh admin sign-in using the stored AxonHub credentials
- **AND** the extension MUST retry the original operation after the new session token is available

### Requirement: Channel management works for AxonHub
When `managedSiteType = axonhub` and valid AxonHub credentials are configured, the extension MUST allow users to list, search, create, update, and delete AxonHub channels through the managed-site channel management UI.

AxonHub channel data MUST be normalized so the shared managed-site channel table can render channel names, provider types, statuses, base URLs, model lists, and keys or key availability without corrupting AxonHub-specific data.

#### Scenario: Channel list loads for AxonHub
- **WHEN** the user opens the managed-site channels page with `managedSiteType = axonhub`
- **THEN** the extension MUST fetch AxonHub channels through the AxonHub managed-site service
- **AND** the extension MUST render the returned channels in the managed-site channel table

#### Scenario: Channel search filters AxonHub channels
- **WHEN** the user searches AxonHub channels by keyword or base URL from a managed-site channel workflow
- **THEN** the extension MUST return matching AxonHub channels using AxonHub-compatible search or client-side filtering
- **AND** the extension MUST normalize returned channels into the managed-site channel table shape

#### Scenario: Creating an AxonHub channel refreshes the list
- **WHEN** the user creates a channel successfully while `managedSiteType = axonhub`
- **THEN** the extension MUST create the channel through AxonHub admin GraphQL
- **AND** the extension MUST show a success confirmation
- **AND** the extension MUST refresh the channel list to include the new channel

#### Scenario: Updating an AxonHub channel preserves supported fields
- **WHEN** the user updates an AxonHub channel through the managed-site channel dialog
- **THEN** the extension MUST update the corresponding AxonHub channel through admin GraphQL
- **AND** the extension MUST preserve AxonHub fields that are not represented by the edited form whenever the original channel data is available

#### Scenario: Deleting an AxonHub channel refreshes the list
- **WHEN** the user deletes an AxonHub channel successfully
- **THEN** the extension MUST delete the channel through AxonHub admin GraphQL
- **AND** the extension MUST refresh the channel list without the deleted channel

### Requirement: AxonHub channel form supports AxonHub channel types and statuses
The managed-site channel dialog MUST support AxonHub string channel types and AxonHub status values when `managedSiteType = axonhub`.

The dialog MUST NOT coerce AxonHub provider type values through New API numeric channel type parsing.

#### Scenario: AxonHub channel type values remain strings
- **WHEN** the user creates or edits an AxonHub channel and selects an AxonHub provider type
- **THEN** the extension MUST preserve the selected AxonHub provider type value as an AxonHub-compatible string
- **AND** the extension MUST NOT convert that provider type through New API numeric channel type parsing

#### Scenario: AxonHub enabled status is applied after creation
- **WHEN** the user creates an AxonHub channel with an enabled final status
- **THEN** the extension MUST ensure the created AxonHub channel ends in the enabled state
- **AND** the extension MUST account for AxonHub create behavior that may default newly created channels to disabled

#### Scenario: Unknown AxonHub channel type is not silently corrupted
- **GIVEN** AxonHub returns an existing channel with a provider type the extension does not recognize
- **WHEN** the user views or edits that channel
- **THEN** the extension MUST avoid silently replacing the unknown provider type with a New API channel type
- **AND** the extension MUST either preserve the original provider type or block edits that would corrupt it

### Requirement: Existing account tokens can be imported as AxonHub channels
When `managedSiteType = axonhub`, the extension MUST allow importing an existing account token as a new AxonHub OpenAI-compatible channel.

The import flow MUST derive the AxonHub channel name, base URL, API key credentials, model list, and default test model from the selected account/token and final channel form data.

#### Scenario: Import prepares an OpenAI-compatible AxonHub channel
- **WHEN** the user starts importing an existing account token as a managed-site channel while `managedSiteType = axonhub`
- **THEN** the extension MUST open the channel dialog with AxonHub channel type `openai`
- **AND** the dialog MUST prefill the channel base URL from the source account
- **AND** the dialog MUST prefill AxonHub credentials from the selected token key
- **AND** the dialog MUST prefill models from the selected token's available model list when that list can be loaded

#### Scenario: Import creates an AxonHub channel
- **WHEN** the user confirms an AxonHub import-as-channel dialog with a non-empty final model list
- **THEN** the extension MUST create an AxonHub channel through admin GraphQL
- **AND** the created channel MUST use the selected token key as AxonHub API key credentials
- **AND** the created channel MUST use the final model list as AxonHub supported models
- **AND** the created channel MUST include a default test model derived from the final model list

#### Scenario: Import remains available when automatic model loading fails
- **WHEN** the user starts importing an account token into AxonHub
- **AND** the selected token's automatic model list cannot be loaded
- **THEN** the extension MUST keep the import dialog available
- **AND** the extension MUST allow the user to enter the final model list manually before creation

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

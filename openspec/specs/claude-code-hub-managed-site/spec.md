# claude-code-hub-managed-site Specification

## Purpose

Allow All API Hub users to configure Claude Code Hub as a managed site, manage Claude Code Hub providers through the shared channel-management workflows, and import existing account tokens as Claude Code Hub providers without exposing secrets.

## Requirements

### Requirement: Claude Code Hub can be selected as a managed site type
The settings UI MUST allow selecting `claude-code-hub` as the managed site type.

When Claude Code Hub is selected, managed-site screens MUST resolve labels, configuration, services, and messages from the Claude Code Hub managed-site context without changing existing New API, Veloera, Done Hub, Octopus, or AxonHub behavior.

#### Scenario: Selecting Claude Code Hub switches managed-site context
- **WHEN** the user selects `claude-code-hub` in the managed site type selector
- **THEN** the extension MUST persist `managedSiteType = claude-code-hub`
- **AND** managed-site screens MUST resolve Claude Code Hub-specific configuration and services

#### Scenario: Existing managed-site types remain available
- **WHEN** Claude Code Hub support is available
- **THEN** the managed site type selector MUST still offer the existing managed-site options
- **AND** selecting any existing option MUST continue to resolve its existing managed-site service

### Requirement: Claude Code Hub admin credentials can be configured and validated
The extension MUST allow users to configure Claude Code Hub management credentials required for provider operations, including base URL and admin/auth token.

The extension MUST validate Claude Code Hub credentials through the Claude Code Hub action API and MUST NOT require a New API-style user id for Claude Code Hub management.

#### Scenario: Credentials are saved for Claude Code Hub management
- **WHEN** the user saves Claude Code Hub base URL and admin/auth token in settings
- **THEN** the extension MUST persist those values under the Claude Code Hub managed-site configuration
- **AND** subsequent Claude Code Hub managed-site operations MUST use the persisted configuration

#### Scenario: Credential validation uses Claude Code Hub action API
- **WHEN** the user validates Claude Code Hub configuration with complete credentials
- **THEN** the extension MUST call a Claude Code Hub management action using the configured base URL and token
- **AND** the extension MUST report validation success only when the action response confirms authenticated management access

#### Scenario: Invalid credentials show a safe error
- **WHEN** Claude Code Hub credential validation fails
- **THEN** the extension MUST show a user-facing failure message
- **AND** the extension MUST NOT include the configured token or any provider key in the message

### Requirement: Claude Code Hub management uses provider action endpoints
Claude Code Hub managed-site operations MUST use Claude Code Hub's `/api/actions/providers/*` management endpoints instead of New API-compatible `/api/channel/*` endpoints.

The extension MUST authenticate Claude Code Hub action requests with the configured token using an HTTP authorization mechanism supported by Claude Code Hub.

#### Scenario: Provider list uses getProviders action
- **WHEN** the user opens the managed-site channels page with `managedSiteType = claude-code-hub`
- **THEN** the extension MUST request provider data from `POST /api/actions/providers/getProviders`
- **AND** the extension MUST render the returned providers as managed-site channel rows

#### Scenario: Provider create uses addProvider action
- **WHEN** the user creates a Claude Code Hub channel/provider through the managed-site channel dialog
- **THEN** the extension MUST submit the create payload to `POST /api/actions/providers/addProvider`
- **AND** the extension MUST treat a successful Claude Code Hub action response as channel creation success

#### Scenario: Provider update uses editProvider action
- **WHEN** the user updates a Claude Code Hub channel/provider through the managed-site channel dialog
- **THEN** the extension MUST submit the update payload to `POST /api/actions/providers/editProvider`
- **AND** the extension MUST include the target provider id required by Claude Code Hub

#### Scenario: Provider delete uses removeProvider action
- **WHEN** the user deletes a Claude Code Hub channel/provider
- **THEN** the extension MUST submit the provider id to `POST /api/actions/providers/removeProvider`
- **AND** the extension MUST refresh the channel list after successful deletion

### Requirement: Claude Code Hub providers are normalized for shared channel UI
The extension MUST normalize Claude Code Hub provider records into the shared managed-site channel shape so the existing channel table and dialog can render provider names, provider types, base URLs, model lists, status, priority, weight, groups, and key availability.

The normalized row MUST preserve enough original Claude Code Hub provider data to avoid corrupting unsupported fields during safe updates.

#### Scenario: Provider fields render as channel row fields
- **WHEN** Claude Code Hub returns provider records from the provider list action
- **THEN** the extension MUST map each provider id, name, provider type, URL, enabled state, weight, priority, group tag, masked key, and allowed model list into the managed-site channel row fields
- **AND** the managed-site channel table MUST render the rows without requiring a Claude Code Hub-specific page

#### Scenario: Unsupported provider fields are not silently corrupted
- **GIVEN** a Claude Code Hub provider includes fields not represented by the managed-site channel form
- **WHEN** the user views or edits the provider through the managed-site channel UI
- **THEN** the extension MUST preserve unsupported field data when the original provider data is available or omit those fields from the update payload
- **AND** the extension MUST NOT overwrite unsupported provider fields with empty defaults solely because the shared form did not display them

### Requirement: Claude Code Hub channel form supports provider type strings
The managed-site channel dialog MUST support Claude Code Hub provider type string values when `managedSiteType = claude-code-hub`.

The dialog MUST NOT coerce Claude Code Hub provider type values through New API numeric channel type parsing.

#### Scenario: Claude Code Hub provider type values remain strings
- **WHEN** the user creates or edits a Claude Code Hub channel/provider and selects a Claude Code Hub provider type
- **THEN** the extension MUST preserve the selected provider type as a Claude Code Hub-compatible string
- **AND** the extension MUST NOT convert that provider type through New API numeric channel type parsing

#### Scenario: Known Claude Code Hub provider types are offered
- **WHEN** the user opens the channel dialog while `managedSiteType = claude-code-hub`
- **THEN** the extension MUST offer Claude Code Hub provider type options for `openai-compatible`, `codex`, `claude`, `claude-auth`, `gemini`, and `gemini-cli`

#### Scenario: Unknown existing provider type is not silently corrupted
- **GIVEN** Claude Code Hub returns an existing provider with a provider type the extension does not recognize
- **WHEN** the user views or edits that provider
- **THEN** the extension MUST avoid silently replacing the unknown provider type with a New API channel type
- **AND** the extension MUST either preserve the original provider type or block edits that would corrupt it

### Requirement: Existing account tokens can be imported as Claude Code Hub providers
When `managedSiteType = claude-code-hub`, the extension MUST allow importing an existing account token as a new Claude Code Hub provider/channel.

The import flow MUST derive the provider name, provider URL, provider key, provider type, and allowed model list from the selected account/token and final channel form data.

#### Scenario: Import prepares a Claude Code Hub provider
- **WHEN** the user starts importing an existing account token as a managed-site channel while `managedSiteType = claude-code-hub`
- **THEN** the extension MUST open the channel dialog with Claude Code Hub provider type `openai-compatible` by default
- **AND** the dialog MUST prefill the provider URL from the source account base URL
- **AND** the dialog MUST prefill the provider key from the selected token key
- **AND** the dialog MUST prefill models from the selected token's available model list when that list can be loaded

#### Scenario: Import creates a Claude Code Hub provider
- **WHEN** the user confirms a Claude Code Hub import-as-channel dialog with a non-empty final model list and usable key
- **THEN** the extension MUST create a Claude Code Hub provider through the provider add action
- **AND** the created provider MUST use the selected token key as its provider key
- **AND** the created provider MUST use the final model list as allowed models
- **AND** the created provider MUST use the final provider type selected in the dialog

#### Scenario: Import remains available when automatic model loading fails
- **WHEN** the user starts importing an account token into Claude Code Hub
- **AND** the selected token's automatic model list cannot be loaded
- **THEN** the extension MUST keep the import dialog available
- **AND** the extension MUST allow the user to enter the final model list manually before creation

### Requirement: Claude Code Hub duplicate detection is secret-safe and best-effort
The extension MUST avoid claiming an exact Claude Code Hub provider duplicate unless comparable secret material is available.

When Claude Code Hub only returns a masked provider key, duplicate detection MAY use URL and model evidence for review guidance, but it MUST NOT treat masked key data as a confirmed key match.

#### Scenario: Exact duplicate uses comparable key material
- **GIVEN** an account token is being imported into Claude Code Hub
- **AND** the extension has comparable provider key material for an existing Claude Code Hub provider
- **WHEN** the provider URL, provider key, and model list match the import inputs
- **THEN** the extension MUST treat the existing provider as an exact duplicate

#### Scenario: Masked key prevents exact duplicate confirmation
- **GIVEN** an account token is being imported into Claude Code Hub
- **AND** Claude Code Hub only provides a masked key for an existing provider
- **WHEN** the existing provider's URL and model list match the import inputs
- **THEN** the extension MUST NOT classify the existing provider as an exact key-confirmed duplicate
- **AND** the extension MAY surface the provider as a review candidate

### Requirement: Claude Code Hub updates preserve provider secrets when keys are masked
The extension MUST NOT overwrite a Claude Code Hub provider's stored key with a masked display value.

When editing an existing Claude Code Hub provider, the extension MUST send a `key` update only when the user provides a usable replacement key.

#### Scenario: Unchanged masked key is omitted from update
- **GIVEN** a Claude Code Hub provider row contains only a masked key
- **WHEN** the user edits other provider fields without entering a usable replacement key
- **THEN** the extension MUST omit the key field from the Claude Code Hub update payload
- **AND** the provider's existing secret MUST remain unchanged

#### Scenario: Replacement key is sent on update
- **GIVEN** a user is editing a Claude Code Hub provider
- **WHEN** the user enters a usable replacement key and saves the dialog
- **THEN** the extension MUST include that replacement key in the Claude Code Hub update payload

#### Scenario: Create requires a usable key
- **WHEN** the user creates or imports a Claude Code Hub provider
- **AND** the key field is empty or contains only a masked placeholder
- **THEN** the extension MUST block creation
- **AND** the extension MUST show localized guidance that a real provider key is required

### Requirement: Unsupported Claude Code Hub managed-site actions are not exposed
The extension MUST NOT expose managed-site actions for Claude Code Hub when those actions depend on semantics not implemented for Claude Code Hub in this change.

This includes bulk channel migration, managed-site model sync, model redirect, and full provider-key reveal unless a later requirement explicitly adds Claude Code Hub support for those actions.

#### Scenario: Claude Code Hub is not offered as a migration target
- **WHEN** the user opens an existing managed-site channel migration workflow
- **THEN** the extension MUST NOT offer Claude Code Hub as a migration target in this change
- **AND** the extension MUST NOT automatically convert channels from other managed-site backends into Claude Code Hub providers

#### Scenario: Claude Code Hub hides unsupported managed-site controls
- **WHEN** the user manages Claude Code Hub channels/providers
- **THEN** the extension MUST hide or disable controls that require unsupported managed-site features
- **AND** disabled controls MUST provide local explanatory copy rather than failing silently

#### Scenario: Full key reveal is not offered without a supported endpoint
- **WHEN** a Claude Code Hub provider row only includes a masked key
- **AND** no supported Claude Code Hub management endpoint is available to retrieve the unmasked provider key
- **THEN** the extension MUST NOT offer a full key reveal action for that provider

### Requirement: Claude Code Hub feedback does not expose secrets
The extension MUST NOT include raw account token keys, Claude Code Hub admin tokens, Claude Code Hub provider keys, or copied auth tokens in labels, explanations, error messages, toasts, or logs emitted for Claude Code Hub managed-site workflows.

#### Scenario: Management failure is reported without secret leakage
- **GIVEN** a Claude Code Hub managed-site operation fails while processing configured credentials or provider keys
- **WHEN** the extension reports the failure to the user or records diagnostics
- **THEN** the reported output MUST omit raw account token keys, admin/auth tokens, and provider keys

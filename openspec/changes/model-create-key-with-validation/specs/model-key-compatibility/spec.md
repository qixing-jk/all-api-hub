# Model Key Compatibility

## ADDED Requirements

### Requirement: Model List exposes a per-model key compatibility action

The system SHALL provide a per-model action in the Account Model List UI that allows the user to check whether the selected model has any usable API key/token for the associated account.

The action MUST operate on the account associated with the selected model item (including when the Model List is in “all accounts” mode).

#### Scenario: Open model key compatibility flow from a model item
- **WHEN** the user clicks the model key compatibility action for a model item
- **THEN** the system opens a modal dialog scoped to the model id and the model item’s owning account (and model enable-groups metadata)
- **AND** the dialog begins loading that account’s token inventory

### Requirement: Token inventory loading is on-demand and per-account

The system SHALL load token inventories only when the user explicitly triggers the model key compatibility flow.

The system MUST load tokens for only the selected account and MUST NOT prefetch token inventories during Model List rendering.

#### Scenario: Model List does not prefetch tokens
- **WHEN** the user opens the Model List page
- **THEN** the system does not fetch token inventories until the user triggers the model key compatibility action

#### Scenario: Token loading failure is actionable
- **WHEN** loading the selected account’s token inventory fails
- **THEN** the dialog shows a user-friendly error state
- **AND** the dialog provides a retry action that re-attempts loading tokens for the same account

### Requirement: Compatible token definition is based on enablement, token group, and model allow-lists

The system MUST determine whether a token is compatible with a model id using the following rules:

- The token MUST be enabled (disabled tokens MUST NOT be considered compatible).
- The token’s group MUST be included in the selected model’s `enable_groups` list.
  - If the token group is missing/empty, it MUST be treated as `default`.
- If the token has no model allow-list, the token MUST be treated as compatible with all models.
- If the token has a model allow-list, the token MUST be considered compatible only when the allow-list contains the selected model id.

#### Scenario: Enabled token with compatible group and no allow-list is compatible
- **WHEN** an enabled token’s group is included in the model’s `enable_groups`
- **AND** the token has no configured model allow-list
- **THEN** the system treats the token as compatible with the selected model

#### Scenario: Enabled token allow-list includes the model
- **WHEN** an enabled token’s group is included in the model’s `enable_groups`
- **AND** the token has a model allow-list that contains the selected model id
- **THEN** the system treats the token as compatible with the selected model

#### Scenario: Enabled token allow-list excludes the model
- **WHEN** an enabled token’s group is included in the model’s `enable_groups`
- **AND** the token has a model allow-list that does not contain the selected model id
- **THEN** the system treats the token as incompatible with the selected model

#### Scenario: Disabled tokens are ignored
- **WHEN** a token is disabled
- **THEN** the system excludes it from compatible-token results regardless of its allow-list configuration

#### Scenario: Token group mismatch is incompatible
- **WHEN** an enabled token’s group is not included in the model’s `enable_groups`
- **THEN** the system treats the token as incompatible with the selected model

### Requirement: The dialog clearly indicates compatibility and prompts for selection

The dialog MUST clearly indicate whether at least one compatible token exists for the selected model and account.

If one or more compatible tokens exist, the dialog MUST present the compatible tokens and MUST prompt the user to select which compatible token they intend to use for the model.

#### Scenario: Multiple compatible tokens require explicit selection
- **GIVEN** two or more compatible tokens exist for the selected model
- **WHEN** the user opens the dialog
- **THEN** the dialog prompts the user to choose one compatible token
- **AND** token-dependent actions remain disabled until a compatible token is selected

#### Scenario: Exactly one compatible token is selected by default
- **GIVEN** exactly one compatible token exists for the selected model
- **WHEN** the user opens the dialog
- **THEN** the dialog selects that token by default

### Requirement: No compatible tokens yields an actionable create flow

If no compatible tokens exist for the selected model, the dialog MUST present an actionable empty state indicating that no usable key is available for that model.

The system MUST NOT create tokens automatically when no compatible token is found; token creation MUST require explicit user intent.

#### Scenario: No compatible tokens shows create options without auto-creating
- **GIVEN** no compatible tokens exist for the selected model
- **WHEN** the dialog is rendered
- **THEN** the dialog indicates that no usable key is available for the model
- **AND** the dialog offers explicit create actions
- **AND** no token is created until the user chooses a create action

### Requirement: Create actions refresh tokens and re-evaluate compatibility

After any successful token creation initiated from the dialog, the system MUST refresh the account’s token inventory and MUST re-evaluate model compatibility using the refreshed token list.

If the refreshed token list still contains zero compatible tokens, the system MUST show a durable error message and MUST keep the dialog actionable so the user can retry creation or adjust token configuration.

#### Scenario: Create success yields a compatible token
- **WHEN** the user creates a token from the dialog and the refreshed inventory contains one or more compatible tokens
- **THEN** the dialog updates to show compatible tokens available for selection

#### Scenario: Create reports success but no compatible token exists after refresh
- **WHEN** the system reports token creation success
- **AND** the subsequent token inventory refresh yields zero compatible tokens for the selected model
- **THEN** the dialog shows an error indicating that no compatible key could be found
- **AND** the dialog keeps create actions available for retry

### Requirement: Custom create is model-aware and guides compatible configuration

The system SHALL provide a custom-create action that opens the token configuration UI for the selected account in a model-aware mode.

In this mode, the token configuration UI MUST guide the user to create a token that is compatible with the selected model, including preselecting the selected model in the token’s model allow-list controls.

#### Scenario: Custom create defaults to the selected model
- **WHEN** the user triggers custom-create for a selected model
- **THEN** the token configuration UI opens with the selected model preselected in model allow-list configuration
- **AND** the user can adjust the configuration before submitting

### Requirement: Token creation is gated by account eligibility

The system MUST disable token creation actions in this feature when the selected account is not eligible for token management (for example: the account is disabled, the account lacks required authentication, or the site type does not support token management).

When token creation is disabled, the dialog MUST provide user-facing feedback explaining why creation is unavailable.

#### Scenario: Ineligible account disables create actions
- **GIVEN** the selected account is not eligible for token management
- **WHEN** the user opens the model key compatibility dialog
- **THEN** the dialog disables token creation actions
- **AND** the dialog explains that token creation is not available for this account

### Requirement: Secrets are handled safely in compatibility and create flows

The system MUST treat token key values as secrets in this flow:

- The dialog MUST NOT display raw token key strings.
- Any user-facing error messages or logs produced by this flow MUST NOT include raw token key strings.
- Copying a token key (if offered) MUST require explicit user action.

#### Scenario: Failure feedback does not leak token secrets
- **WHEN** token inventory loading or token creation fails
- **THEN** the user-facing error message does not include the raw token key value

# model-management-credential-sources Specification

## Purpose
Define requirements for Model Management source selection and model actions when the feature is backed by site accounts, the all-accounts aggregate, or stored API credential profiles.

## Requirements
### Requirement: Model Management source selector supports stored API credentials

The system SHALL provide a source selector in Model Management that can choose:

- the existing `all accounts` aggregate option
- individual enabled site accounts
- individual stored API credential profiles

The selector MUST distinguish API credential profiles from site accounts by grouping or labeling, and selecting a profile MUST make that profile the active model-management source.

#### Scenario: Select a stored API credential profile
- **GIVEN** at least one stored API credential profile exists
- **WHEN** the user chooses that profile in the Model Management source selector
- **THEN** the system sets Model Management to that profile-backed source
- **AND** the page loads models using the selected profile instead of a site account

#### Scenario: All accounts remains account-scoped
- **WHEN** the user selects the existing `all accounts` option
- **THEN** the system aggregates enabled site accounts only
- **AND** the system MUST NOT implicitly include API credential profiles in that aggregate result

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

### Requirement: Profile-backed model loading uses stored profile credentials

For a selected API credential profile, the system MUST load the model catalog using the profile's persisted `baseUrl`, `apiKey`, and `apiType` without requiring a `SiteAccount` or account token inventory.

The system MUST normalize and de-duplicate returned model ids into the minimal model-catalog shape required by Model Management instead of fabricating relay pricing, group, or account summary data.

If the model-list request fails, the system MUST show a retryable error state scoped to the selected profile.

#### Scenario: Profile-backed model loading succeeds
- **GIVEN** a stored API credential profile with a reachable model-list endpoint
- **WHEN** the user selects that profile in Model Management
- **THEN** the system requests the model list using the profile credentials
- **AND** the page renders the normalized model identifiers for that selected profile
- **AND** blank or duplicate model ids are not rendered as separate rows

#### Scenario: Profile-backed model loading fails
- **GIVEN** a stored API credential profile is selected
- **WHEN** the model-list request fails
- **THEN** the system shows a user-facing error state for that profile-backed source
- **AND** the user can retry loading without changing the selected source

### Requirement: Profile-backed model views are capability-aware

When Model Management is backed by an API credential profile, the system MUST NOT present account-only pricing, balance, group-ratio, or token-inventory controls as if they were authoritative for that source.

The UI MUST hide or disable account-only summaries and actions, and it MUST clearly keep profile-backed results distinct from account-backed pricing views.

The UI MUST hide profile-unsupported price/group affordances such as account summary bars, pricing notes, price toggles, ratio toggles, group filters, and account-oriented detail expansion instead of showing empty placeholders.

#### Scenario: Account-only summaries are hidden for profiles
- **WHEN** the selected model-management source is an API credential profile
- **THEN** the system does not show account summary bars or account-only pricing-status messaging
- **AND** the page keeps the source labeled as profile-backed rather than account-backed

#### Scenario: Unsupported price or group metadata is not presented as authoritative
- **WHEN** the selected model-management source is an API credential profile
- **THEN** the system does not claim relay pricing or group-ratio data that was not returned by the profile-backed model query
- **AND** any profile-backed model rendering remains usable without requiring account pricing metadata

#### Scenario: Profile-backed controls stay usable without account-only detail affordances
- **WHEN** the selected model-management source is an API credential profile
- **THEN** the system still allows searching, provider filtering, refresh, copying model names, and source-compatible verification actions
- **AND** the system hides price/group toggles and per-row expand-details actions instead of showing disabled account-only placeholders

### Requirement: Model row actions respect row-source capabilities

The system SHALL expose only the model-row actions that are supported by the rendered row's concrete source type.

In `all accounts` mode, each rendered row MUST retain its owning account as the row source so account-backed rows continue to expose account-backed actions.

Account-backed rows MUST retain existing API verification, CLI verification, and account-token workflows. Profile-backed rows MUST support stored-profile API verification and stored-profile CLI verification, and MUST NOT expose account token/key compatibility actions that depend on account token inventories.

#### Scenario: Profile-backed model uses stored-profile API verification
- **GIVEN** a profile-backed model row is visible in Model Management
- **WHEN** the user triggers a verification action that only requires `baseUrl`, `apiKey`, `apiType`, and `modelId`
- **THEN** the system runs that action using the selected API credential profile
- **AND** the action does not require the user to create or select a site account first

#### Scenario: All accounts rows keep per-account actions
- **GIVEN** Model Management is showing the `all accounts` aggregate source
- **WHEN** the page renders a model row that came from a specific account
- **THEN** the row keeps that owning account as its action source
- **AND** account-backed verification, CLI support, and key-compatibility actions remain available for that row

#### Scenario: Profile-backed model uses stored-profile CLI verification without tokens
- **GIVEN** a profile-backed model row is visible in Model Management
- **WHEN** the user triggers CLI support verification for that row
- **THEN** the system runs the CLI support check using the selected profile's `baseUrl`, `apiKey`, and `modelId`
- **AND** the system does not fetch or require account token inventories for that profile-backed verification

#### Scenario: Account-only key selection is unavailable for profile-backed rows
- **GIVEN** a profile-backed model row is visible in Model Management
- **WHEN** the row renders available actions
- **THEN** the account token/key compatibility action is not shown or is disabled with a profile-specific explanation
- **AND** the system MUST NOT attempt to load account token inventories for that profile-backed row

### Requirement: Profile-backed model management preserves secret safety

The system MUST treat the selected profile's `apiKey` as a secret throughout Model Management.

User-facing errors, toasts, and logs produced by profile-backed model loading or actions MUST NOT reveal the raw API key.

#### Scenario: Profile-backed failure feedback redacts credentials
- **WHEN** a profile-backed model load or verification action fails
- **THEN** the displayed error and emitted logs do not contain the raw API key
- **AND** the failure feedback remains actionable without exposing secrets

### Requirement: Account-backed model loading can fall back to a selected account key

When Model Management is focused on a single selected account and the direct account-backed model load fails with a retryable error, the system SHALL make an account-key fallback flow available for that same account without switching away from the selected account source.

The fallback flow MUST load that account's token inventory on demand after the retryable account failure is shown. The system MAY start loading the key inventory automatically as part of the recovery UI, but it MUST NOT load the fallback catalog automatically.

If exactly one selectable key exists, the system MAY preselect it. If multiple selectable keys exist, the system MUST require the user to choose which key to use before loading the fallback catalog.

After the user confirms a key, the system MUST resolve the selected key secret and request model ids using that key as credential input against the account's base URL. The system MUST normalize and de-duplicate the returned model ids into the same minimal model-catalog shape used for stored API credential profiles.

The system MUST NOT trigger this fallback automatically in the `all accounts` aggregate view or for profile-backed sources.

#### Scenario: Single-account load failure offers key-backed fallback
- **WHEN** a single selected account fails to load models through the direct account-backed request
- **THEN** Model Management loads or begins loading that account's fallback key inventory in the recovery UI
- **AND** the user can choose one of that account's keys for fallback loading without a separate "start fallback" click

#### Scenario: Multiple available keys require explicit user choice
- **WHEN** the selected account has more than one available key for fallback loading
- **THEN** the system shows those keys in a chooser
- **AND** the fallback catalog does not load until the user explicitly selects which key to use

#### Scenario: Selected key loads a normalized fallback catalog
- **WHEN** the user confirms a valid account key for fallback loading
- **THEN** the system resolves the key secret and requests model ids with that key
- **AND** the rendered model list uses normalized, de-duplicated model ids in the minimal catalog shape already used for profile-backed sources

### Requirement: Key-backed fallback catalogs stay capability-limited, retryable, and secret-safe

When Model Management is rendering a catalog loaded through an account-key fallback, the system MUST keep the owning account as the active selected source while treating the rendered data as catalog-only rather than pricing-authoritative.

While fallback data is active, the system MUST NOT present pricing, ratio, group-filtering, or account-summary affordances as if they were authoritative for that catalog. The system MUST also avoid rendering per-row account-pricing or group-availability placeholders that would imply the fallback catalog knows relay metadata it does not have. The system MUST keep a direct-account retry path available, and a later successful direct account load MUST replace the fallback catalog and restore the normal account-backed capability set.

If the fallback request fails, the user-facing error state MUST remain retryable, MUST allow choosing a different key, and MUST NOT reveal the raw selected key in displayed errors or emitted logs.

#### Scenario: Fallback catalog hides account-only pricing affordances
- **WHEN** Model Management is showing models loaded through an account-key fallback
- **THEN** the page does not show pricing notes, price/ratio toggles, group filtering, or account summary UI for that fallback catalog
- **AND** the fallback model rows do not show synthetic account price, ratio, or group-availability warnings derived from placeholder catalog values

#### Scenario: Fallback failure remains actionable without leaking secrets
- **WHEN** the selected account key fails to load a fallback model catalog
- **THEN** the system shows a retryable error state
- **AND** the user can retry the fallback request or choose a different key
- **AND** the displayed error and emitted logs do not contain the raw selected key

#### Scenario: Successful direct retry clears the fallback catalog
- **GIVEN** Model Management is currently showing an account-key fallback catalog for a selected account
- **WHEN** the user retries the direct account-backed load and that load succeeds
- **THEN** the system clears the fallback catalog state
- **AND** the page returns to the normal account-backed pricing view for that account

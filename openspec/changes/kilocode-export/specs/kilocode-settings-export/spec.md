# Kilo Code Settings Export

## ADDED Requirements

### Requirement: User can open Kilo Code export from Key Management

The system SHALL provide an entry point in Key Management token actions that opens a dedicated “Export to Kilo Code” dialog for exporting site/API key configuration.

#### Scenario: Open export dialog from token actions
- **WHEN** the user clicks “Export to Kilo Code” for a token in Key Management
- **THEN** the system shows the Kilo Code export dialog
- **AND** the dialog preselects the token’s site and API key

### Requirement: Token loading is user-triggered and per-site

The system SHALL NOT prefetch tokens for all sites when the dialog opens.

The system SHALL fetch token inventories only for selected sites and MUST surface per-site loading and failure states without blocking other sites.

#### Scenario: Tokens are loaded lazily per selected site
- **WHEN** the user selects a site in the dialog
- **THEN** the system fetches tokens only for that site and renders the available tokens for selection

#### Scenario: Token loading failure is isolated
- **WHEN** loading tokens fails for one site
- **THEN** the system shows an error state for that site and still allows exporting other sites whose token data is available

### Requirement: No-token sites are skipped by default, but token creation is available

If a site has no API tokens, the system MUST skip that site by default (it MUST NOT create tokens automatically).

The system SHALL provide a per-site action to create a default token and, when successful, MUST refresh the token list for that site and preselect the newly created token for export.

#### Scenario: Site has no tokens and is skipped
- **WHEN** the user loads tokens for a site and the token list is empty
- **THEN** the system marks the site as skipped and indicates that no tokens are available for export

#### Scenario: Create a default token and select it
- **WHEN** the user clicks “Create default token” for a site with no tokens
- **THEN** the system creates a token, reloads the site’s tokens, and selects the created token for export

### Requirement: Export selection UX supports multi-site and multi-key export

The system SHALL allow selecting one or more sites and then selecting one or more API keys per selected site for export.

The system SHALL default-select the first loaded API key for each selected site.

Each selected API key SHALL be exported as one provider profile.

#### Scenario: Selecting multiple API keys produces one profile per key
- **WHEN** the user selects two API keys (from any combination of sites)
- **THEN** the system prepares exactly two provider profiles for export

### Requirement: User can configure model ID per exported API key

For each selected API key, the system SHALL fetch the upstream model list via an OpenAI-compatible `/v1/models` endpoint using that API key.

The system SHALL default the Model ID to the first model returned by the upstream for that API key.

If the upstream model list is empty or cannot be loaded, the system SHALL allow the user to enter a custom Model ID and MUST guide the user that Kilo Code typically requires it.

#### Scenario: Default model ID is selected
- **WHEN** the upstream returns a non-empty model list for a selected API key
- **THEN** the system selects the first model ID by default (unless the user already chose one)

#### Scenario: No upstream models returned
- **WHEN** the upstream returns an empty model list for a selected API key
- **THEN** the system prompts the user to enter a Model ID manually
- **AND** export actions remain disabled until all selected API keys have a Model ID

### Requirement: Generated profiles are OpenAI-compatible

For each exported provider profile, the system MUST generate an OpenAI-compatible profile entry that includes:

- `apiProvider` set to `"openai"`
- `openAiBaseUrl` set to the site base URL coerced to end with `/v1`
- `openAiApiKey` set to the selected token key
- `openAiModelId` set to the selected model id for that API key
- `id` set to a generated identifier

The system MUST generate profile names that are stable and collision-resistant within a single export. If multiple profiles would share the same name, the system MUST disambiguate them deterministically.

#### Scenario: Base URL is normalized to /v1
- **WHEN** the selected site base URL does not end in `/v1`
- **THEN** the exported `openAiBaseUrl` ends with `/v1` and does not contain duplicated segments (e.g., `/v1/v1`)

#### Scenario: Duplicate profile names are disambiguated
- **WHEN** the export would generate two profiles with the same display name
- **THEN** the system disambiguates names so both profiles are uniquely addressable in `apiConfigs`

### Requirement: User can copy `providerProfiles.apiConfigs` snippet

The system SHALL provide an action to copy a JSON snippet containing only the `providerProfiles.apiConfigs` object for the selected export set.

#### Scenario: Copy snippet to clipboard
- **WHEN** the user clicks “Copy apiConfigs”
- **THEN** the system writes the JSON snippet for `providerProfiles.apiConfigs` to the clipboard

### Requirement: User can download a full settings JSON file

The system SHALL provide an action to download a `kilo-code-settings.json` file containing `providerProfiles`.

The system SHALL allow the user to choose which exported profile name becomes `providerProfiles.currentApiConfigName` in the downloaded file.

The downloaded settings file MUST NOT include unrelated global settings (only what is required to import provider profiles).

#### Scenario: Download file sets current profile
- **WHEN** the user selects a profile as the current config and clicks “Download settings”
- **THEN** the downloaded JSON includes `providerProfiles.currentApiConfigName` set to the chosen profile name

### Requirement: Secrets are handled safely

The system MUST treat exported JSON and token keys as secrets:

- The system MUST NOT log token keys or the exported JSON payload.
- The dialog MUST warn that exported JSON contains API keys in plaintext and should be handled carefully.

#### Scenario: Export does not leak secrets via logs
- **WHEN** the user generates and exports configurations
- **THEN** the system does not emit logs containing token keys or full exported JSON content

### Requirement: Export is disabled when nothing is exportable

If the current selection yields zero exportable profiles (e.g., nothing selected or all selected sites are skipped), the system MUST prevent copy/download actions and MUST provide user-facing feedback explaining why.

If any selected API key is missing a Model ID, the system MUST prevent copy/download actions and MUST provide user-facing feedback explaining that Model IDs are required.

#### Scenario: No exportable profiles
- **WHEN** the user has selected no tokens/sites suitable for export
- **THEN** the system disables export actions and displays a message that there is nothing to export

#### Scenario: Missing model IDs
- **WHEN** one or more selected API keys have no Model ID
- **THEN** the system disables export actions and displays a message that Model IDs are required


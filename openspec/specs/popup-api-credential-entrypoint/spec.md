# popup-api-credential-entrypoint Specification

## Purpose
Provide access to API credential profiles from the extension popup (and side panel) so users can quickly manage, verify, and export credentials without navigating to Options.

## Requirements

### Requirement: Popup exposes an API Credentials view

The system SHALL provide an API Credentials view in the popup view switch alongside Accounts and Bookmarks.

#### Scenario: Switch to API Credentials view
- **WHEN** the user selects the API Credentials view in the popup view switch
- **THEN** the popup shows an API credential profiles view containing:
  - a statistics summary (total profiles, unique base URLs, used tags)
  - search and filters (search by name/base URL/tag/notes; filter by API type; filter by tags)
  - a list of stored API credential profiles
- **AND** the popup provides a primary action to create a new API credential profile

### Requirement: Popup can create, edit, and delete API credential profiles

The system SHALL allow users to create, edit, and delete API credential profiles from the popup API Credentials view.

#### Scenario: Create a new profile in popup
- **WHEN** the user provides required fields (and optionally tags/notes) and saves in the popup API Credentials view
- **THEN** the system saves the normalized profile to extension local storage
- **AND** the new profile appears in the popup list

#### Scenario: Edit an existing profile in popup
- **GIVEN** an existing stored API credential profile is visible in the popup list
- **WHEN** the user edits the profile fields and saves changes
- **THEN** the system persists the updated (normalized) profile

#### Scenario: Delete a profile in popup
- **GIVEN** an existing stored API credential profile is visible in the popup list
- **WHEN** the user deletes the profile and confirms the action
- **THEN** the system removes the profile from storage
- **AND** the profile no longer appears in the popup list

### Requirement: Popup supports profile actions (copy, verify, export)

Each API credential profile shown in the popup MUST support the following actions:
- Copy base URL
- Copy API key
- Copy base URL + API key bundle
- Verify credentials
- Export to supported targets
- Edit
- Delete

#### Scenario: Copy bundle action
- **GIVEN** an existing stored API credential profile is visible in the popup list
- **WHEN** the user triggers “Copy bundle”
- **THEN** the system copies the following bundle to the clipboard:
  - `BASE_URL=<profile.baseUrl>`
  - `API_KEY=<profile.apiKey>`

#### Scenario: Verify profile action
- **GIVEN** an existing stored API credential profile is visible in the popup list
- **WHEN** the user triggers “Verify”
- **THEN** the system runs `aiApiVerification` probes using that profile’s `baseUrl`, `apiKey`, and `apiType`
- **AND** displays probe results (including input/output details) without revealing the API key by default
- **AND** model-dependent probes MAY prompt for a model id and MAY fetch model suggestions when supported

### Requirement: Popup masks API keys by default

The popup UI MUST mask API keys by default and MUST NOT reveal the API key unless the user explicitly chooses to reveal it.

#### Scenario: API key is masked by default
- **GIVEN** an existing stored API credential profile is visible in the popup list
- **WHEN** the popup renders the profile’s API key
- **THEN** the API key is displayed in a masked form

### Requirement: Open full-page routes to API credential profiles

When the popup active view is API Credentials, the system SHALL open the Options UI API credential profiles section when the user triggers the “open full-page” action.

#### Scenario: Open full-page from API Credentials view
- **GIVEN** the popup active view is API Credentials
- **WHEN** the user triggers the “open full-page” action
- **THEN** the system opens the Options UI focused on the API credential profiles section
- **AND** the popup SHOULD close after the navigation request is dispatched


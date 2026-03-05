# Popup API Credential Entrypoint

## ADDED Requirements

### Requirement: Popup exposes an API Credentials view

The system SHALL provide an API Credentials view in the popup view switch alongside Accounts and Bookmarks.

#### Scenario: Switch to API Credentials view
- **WHEN** the user selects the API Credentials view in the popup view switch
- **THEN** the popup shows an API credential profiles view containing a list of stored API credential profiles
- **AND** the popup provides an action to create a new API credential profile

### Requirement: Popup can create, edit, and delete API credential profiles

The system SHALL allow users to create, edit, and delete API credential profiles from the popup API Credentials view.

#### Scenario: Create a new profile in popup
- **WHEN** the user provides a name, selects an API type, enters a base URL, and enters an API key in the popup API Credentials view
- **THEN** the system saves the profile to extension local storage
- **AND** the new profile appears in the popup list

#### Scenario: Edit an existing profile in popup
- **GIVEN** an existing stored API credential profile is visible in the popup list
- **WHEN** the user edits the profile fields and saves changes
- **THEN** the system persists the updated profile

#### Scenario: Delete a profile in popup
- **GIVEN** an existing stored API credential profile is visible in the popup list
- **WHEN** the user deletes the profile and confirms the action
- **THEN** the system removes the profile from storage
- **AND** the profile no longer appears in the popup list

### Requirement: Popup supports common profile actions

Each API credential profile shown in the popup MUST support the following actions:
- Copy base URL
- Copy API key
- Copy base URL + API key bundle
- Verify credentials
- Quick export to existing supported targets

#### Scenario: Copy bundle action
- **GIVEN** an existing stored API credential profile is visible in the popup list
- **WHEN** the user triggers “Copy bundle”
- **THEN** the system copies a base URL + API key bundle for that profile to the clipboard

#### Scenario: Verify profile action
- **GIVEN** an existing stored API credential profile is visible in the popup list
- **WHEN** the user triggers “Verify”
- **THEN** the system runs verification probes using that profile’s `baseUrl`, `apiKey`, and `apiType`
- **AND** displays results without revealing the API key by default

### Requirement: Popup masks API keys by default

The popup UI MUST mask API keys by default and MUST NOT reveal the API key unless the user explicitly chooses to reveal it.

#### Scenario: API key is masked by default
- **GIVEN** an existing stored API credential profile is visible in the popup list
- **WHEN** the popup renders the profile’s API key
- **THEN** the API key is displayed in a masked form

### Requirement: Open full page routes to API credential profiles

When the popup active view is API Credentials, the system SHALL open the Options UI API credential profiles section when the user triggers the “open full page” action.

#### Scenario: Open full page from API Credentials view
- **GIVEN** the popup active view is API Credentials
- **WHEN** the user triggers the “open full page” action
- **THEN** the system opens the Options UI focused on the API credential profiles section

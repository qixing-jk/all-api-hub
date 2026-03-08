# in-app-feedback-entrypoints Specification

## Purpose
Provide quick, localized in-app feedback entry points in the popup, side panel, and About page so users can open the correct upstream bug-report, feature-request, or discussion channel with minimal friction.

## Requirements
### Requirement: Popup and side panel expose quick feedback actions
The system SHALL provide a compact feedback entry point in the shared popup or side-panel header that gives users direct access to support actions without navigating through the full Options UI first.

#### Scenario: Open feedback actions from popup header
- **WHEN** the user opens the feedback entry point from the popup header
- **THEN** the system MUST display actions for reporting a bug, requesting a feature, and starting a discussion

#### Scenario: Shared header behavior in side panel
- **WHEN** the user opens the shared header inside the extension side panel
- **THEN** the same feedback entry point and support actions MUST be available there

### Requirement: Feedback actions route to the correct upstream channel
Each feedback action MUST open the upstream destination that matches the user's intent instead of sending every user to a generic repository page.

#### Scenario: Report a bug
- **WHEN** the user chooses the bug-report action
- **THEN** the system MUST open the repository's bug-report issue template

#### Scenario: Request a feature
- **WHEN** the user chooses the feature-request action
- **THEN** the system MUST open the repository's feature-request issue template

#### Scenario: Start a discussion
- **WHEN** the user chooses the discussion action
- **THEN** the system MUST open the repository's GitHub Discussions page

### Requirement: About page exposes richer feedback and support links
The About page SHALL present feedback and support links in a richer format than the popup header so users can understand which channel best fits their need.

#### Scenario: About page shows feedback destinations
- **WHEN** the user visits the About page
- **THEN** the system MUST show dedicated feedback actions for bug reports, feature requests, and discussion
- **AND** each action MUST include descriptive copy that clarifies its purpose

### Requirement: Feedback flows remain privacy-safe and explicit
The system MUST keep feedback entry points link-based and MUST NOT automatically attach local account data, tokens, logs, or diagnostics when routing users to external support channels.

#### Scenario: Outbound feedback link does not attach sensitive extension data
- **WHEN** the user opens any feedback action
- **THEN** the system MUST navigate to the external destination without automatically including account identifiers, credentials, or diagnostic payloads

#### Scenario: User decides what to share
- **WHEN** the external feedback page opens
- **THEN** the user MUST remain responsible for choosing what information to include in their report or discussion

### Requirement: Feedback UI is localized with the rest of the extension
All user-visible labels and descriptions introduced for feedback entry points MUST be localized through the extension's standard i18n resources.

#### Scenario: Feedback actions in a localized UI
- **WHEN** the extension UI is rendered in a supported language
- **THEN** the feedback labels and descriptions MUST appear from localized resource strings rather than hard-coded fallback text

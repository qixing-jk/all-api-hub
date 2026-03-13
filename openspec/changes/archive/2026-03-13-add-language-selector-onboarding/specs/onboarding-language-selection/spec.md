## ADDED Requirements

### Requirement: First-install onboarding exposes a language selector
The first-install permission onboarding dialog MUST display a language selection control inside the dialog so users can choose their UI language before deciding whether to grant optional permissions or dismiss onboarding.

#### Scenario: Fresh install shows selector in onboarding dialog
- **GIVEN** the extension is opened after a fresh install
- **AND** the first-install permission onboarding dialog is displayed
- **WHEN** the dialog renders
- **THEN** the dialog MUST show a language selection control without requiring navigation to another settings page
- **AND** the onboarding permission actions MUST remain available from the same dialog

### Requirement: Onboarding language changes apply immediately and persist
When the user selects a supported language from the onboarding dialog, the extension MUST immediately switch the dialog content to that language and MUST persist the chosen language as the active UI preference for later extension sessions.

#### Scenario: Selecting a language updates onboarding copy immediately
- **GIVEN** the first-install onboarding dialog is open in English
- **WHEN** the user selects Chinese from the onboarding language selector
- **THEN** the onboarding title, subtitle, action labels, and permission descriptions MUST update to Chinese without requiring a page reload or a navigation away from the dialog

#### Scenario: Selected language remains active after onboarding closes
- **GIVEN** the user selects Chinese from the onboarding language selector
- **WHEN** the onboarding dialog is closed and the user opens the extension options UI later
- **THEN** Chinese MUST remain the active UI language until the user changes it again

### Requirement: Onboarding selector options and labels are localized from supported resources
The onboarding language selector MUST be driven by the extension's supported locale resources. It MUST expose only supported languages for the current build, and its visible labels plus accessible names MUST come from localized resource strings rather than hard-coded fallback text.

#### Scenario: Current build exposes only supported languages
- **GIVEN** the current extension build includes `en` and `zh_CN` locale resources
- **WHEN** the onboarding language selector renders
- **THEN** the selector MUST offer English and Chinese as selectable languages
- **AND** the selector MUST NOT offer unsupported locales

#### Scenario: Accessible labels are localized with the active UI language
- **GIVEN** the onboarding dialog is rendered in Chinese
- **WHEN** assistive technologies read the onboarding language selector controls
- **THEN** each control MUST expose localized accessible text resolved from Chinese locale resources

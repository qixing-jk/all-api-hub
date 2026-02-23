# sidepanel-support-fallback Specification

## Purpose
Ensure the toolbar icon click behavior and related settings gracefully fall back when the host browser does not support opening a side panel/sidebar, without automatically rewriting persisted preferences (to avoid multi-device configuration sync side effects).

## ADDED Requirements

### Requirement: Side panel support is detectable
The system MUST detect whether the current runtime supports opening a side panel/sidebar and classify the support pathway.

#### Scenario: Firefox sidebarAction is available
- **WHEN** the runtime exposes `browser.sidebarAction.open`
- **THEN** the system MUST treat side panel as supported via the Firefox sidebar action pathway

#### Scenario: Chromium sidePanel is available
- **WHEN** the runtime exposes `chrome.sidePanel.open`
- **THEN** the system MUST treat side panel as supported via the Chromium side panel pathway

#### Scenario: No side panel APIs are available
- **WHEN** neither `browser.sidebarAction.open` nor `chrome.sidePanel.open` is available
- **THEN** the system MUST treat side panel as unsupported

### Requirement: Action-click behavior MUST fall back when side panel is unsupported
When the user configures the toolbar icon click behavior as `sidepanel` but side panel is unsupported, the system MUST apply an effective behavior that still opens a usable UI surface.

#### Scenario: User prefers side panel on an unsupported runtime
- **WHEN** `actionClickBehavior` is configured as `sidepanel` and side panel is detected as unsupported
- **THEN** the system MUST treat the effective behavior as `popup` so clicking the toolbar icon opens the popup UI

### Requirement: Persisted action-click preference MUST NOT be auto-normalized
To avoid surprising multi-device configuration sync, the system MUST NOT automatically modify the persisted `actionClickBehavior` preference based solely on side panel support detection.

#### Scenario: Startup on an unsupported runtime with a sidepanel preference
- **WHEN** the extension starts and side panel is detected as unsupported while `actionClickBehavior` is stored as `sidepanel`
- **THEN** the system MUST NOT write back a different `actionClickBehavior` value and MUST keep the stored preference unchanged

### Requirement: Settings MUST communicate support and fallback behavior
The settings UI MUST communicate whether side panel is supported on the current device and MUST explain how toolbar icon clicks behave when side panel is unsupported.

#### Scenario: Settings are shown on an unsupported runtime
- **WHEN** the user opens the action-click behavior settings and side panel is detected as unsupported
- **THEN** the UI MUST present an explanation that the browser does not support side panel on this device and that toolbar icon clicks will fall back to opening the popup

#### Scenario: User selects side panel while unsupported (multi-device intent)
- **WHEN** the user switches the action-click behavior to `sidepanel` while side panel is detected as unsupported
- **THEN** the system MUST persist the preference as `sidepanel` and the UI MUST show a user-visible message explaining that this device will fall back to opening the popup

### Requirement: Opening the side panel MUST have a last-resort fallback
Even when side panel support is detected, opening the side panel may fail at runtime. The system MUST provide a last-resort fallback that still brings the user to a usable surface.

#### Scenario: Side panel open fails at runtime
- **WHEN** the system attempts to open the side panel and the open call fails
- **THEN** the system MUST open the extension options/settings surface as a fallback

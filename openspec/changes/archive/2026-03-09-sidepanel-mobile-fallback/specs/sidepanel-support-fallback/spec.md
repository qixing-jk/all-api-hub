## MODIFIED Requirements

### Requirement: Side panel support is detectable
The system MUST detect whether the current runtime can effectively open a usable side panel/sidebar and classify the support pathway.

#### Scenario: Firefox sidebarAction is available
- **WHEN** the runtime exposes `browser.sidebarAction.open` and the current device/runtime can present a usable side panel
- **THEN** the system MUST treat side panel as supported via the Firefox sidebar action pathway

#### Scenario: Chromium sidePanel is available
- **WHEN** the runtime exposes `chrome.sidePanel.open` and the current device/runtime can present a usable side panel
- **THEN** the system MUST treat side panel as supported via the Chromium side panel pathway

#### Scenario: No side panel APIs are available
- **WHEN** neither `browser.sidebarAction.open` nor `chrome.sidePanel.open` is available
- **THEN** the system MUST treat side panel as unsupported

#### Scenario: Side panel API exists but the current device/runtime cannot present a usable side panel
- **WHEN** the runtime exposes a side panel API but the current device or browser environment is known or observed to be unable to actually present a usable side panel
- **THEN** the system MUST treat side panel as unsupported for effective behavior on that device
- **AND** the system MUST NOT rely on API presence alone as proof that side panel is usable

#### Scenario: A previous open failure downgrades effective support for the current runtime session
- **WHEN** a side panel open attempt has already failed on the current runtime session
- **THEN** subsequent side panel support checks MUST treat side panel as unsupported for the remainder of that runtime session
- **AND** UI entry points MUST stop advertising side panel as available on that runtime

### Requirement: Action-click behavior MUST fall back when side panel is unsupported
When the user configures the toolbar icon click behavior as `sidepanel` but side panel is unsupported or unreliable on the current device/runtime, the system MUST apply an effective behavior that still opens a usable UI surface and MUST NOT leave the toolbar action in a dead state.

#### Scenario: User prefers side panel on an unsupported runtime
- **WHEN** `actionClickBehavior` is configured as `sidepanel` and side panel is detected as unsupported
- **THEN** the system MUST treat the effective behavior as `popup` so clicking the toolbar icon opens the popup UI

#### Scenario: Side panel open fails on a nominally supported runtime
- **WHEN** `actionClickBehavior` is configured as `sidepanel`, the runtime was initially treated as supported, and an actual attempt to open the side panel fails on the current device/runtime
- **THEN** the system MUST still open a usable extension surface on that device
- **AND** the system MUST NOT leave the toolbar action with no visible result

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
- **THEN** the system MUST open the Basic section of the extension options/settings surface as a fallback

## ADDED Requirements

### Requirement: Direct side-panel entry points MUST not strand the user
Any UI affordance that explicitly tries to open the side panel MUST use the same fallback principles as toolbar-click behavior so users are not left with a closed popup and no destination.

#### Scenario: Popup-side direct side-panel affordance is hidden when support is already unsupported
- **WHEN** the popup header renders outside the side panel and effective side panel support is unsupported on the current device/runtime
- **THEN** the UI MUST NOT show a direct "open side panel" action

#### Scenario: Popup-side open side panel action fails on a false-positive runtime
- **WHEN** the user triggers a direct "open side panel" action from the popup and the side panel cannot be opened on the current device/runtime
- **THEN** the system MUST open a usable fallback surface instead of leaving the user with no visible extension page

## ADDED Requirements

### Requirement: Temp context acquisition rolls back from blocked windows to tabs
When a temp-window fallback flow requests a temporary browser context whose preferred mode requires browser window creation, the system MUST retry the request with a plain tab-backed temp context when window creation fails for a recoverable browser or platform reason and the request does not require window-only isolation.

Recoverable reasons include:

- the browser environment does not expose the windows API
- popup or normal window creation is rejected by the browser
- window creation returns no usable window or tab handle

When rollback is not allowed because the flow requires window-only isolation, the system MUST fail with a structured unsupported result and MUST NOT silently continue in a normal tab.

#### Scenario: Popup temp context falls back to a tab when window creation is blocked
- **GIVEN** a temp-window fallback flow requests a popup-window temp context
- **AND** the browser rejects popup window creation for a recoverable reason
- **WHEN** the temp context is acquired
- **THEN** the system MUST retry the request with a plain tab-backed temp context
- **AND** the flow MUST continue without surfacing the raw browser window error as the final result

#### Scenario: Composite temp context falls back to a plain tab when the shared window cannot be created
- **GIVEN** a temp-window fallback flow prefers a shared composite window
- **AND** the browser cannot create or reuse the required window for a recoverable reason
- **WHEN** the temp context is acquired
- **THEN** the system MUST open the target page in a plain tab-backed temp context
- **AND** the flow MUST continue with that tab-backed context

#### Scenario: Incognito temp context does not silently degrade to a normal tab
- **GIVEN** a temp-window fallback flow requests an incognito or private temp context
- **AND** the browser does not allow the required window creation
- **WHEN** the temp context is acquired
- **THEN** the system MUST fail with a structured unsupported result
- **AND** the system MUST NOT reuse or open a normal non-incognito tab as a fallback

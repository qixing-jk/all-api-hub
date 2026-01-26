## ADDED Requirements

### Requirement: Leveled, scoped logging API
The system SHALL provide a unified logging API for application diagnostics. The API MUST support log levels `debug`, `info`, `warn`, and `error`, and MUST allow logs to be scoped with a stable identifier (e.g., module/feature name).

#### Scenario: Scoped info log
- **WHEN** a module emits an `info` log using the unified logger with scope `Options.Settings`
- **THEN** the emitted log includes the scope `Options.Settings` and is classified as level `info`

### Requirement: Level-to-console method mapping
When console logging is enabled, the system MUST map log levels to the corresponding console methods:
- `debug` → `console.debug`
- `info` → `console.info` (or `console.log` if `console.info` is unavailable)
- `warn` → `console.warn`
- `error` → `console.error`

#### Scenario: Error logs use console.error
- **WHEN** the unified logger emits an `error` log while console logging is enabled
- **THEN** the system calls `console.error` to emit the log

### Requirement: User can enable or disable console logging
The system SHALL provide a user-facing option to enable or disable console logging. This preference MUST be persisted and MUST apply across all extension contexts (background/service worker, content scripts, popup/options/side panel). When console logging is disabled, the system MUST NOT emit any console output at any log level, including `error`.

#### Scenario: Console logging disabled suppresses output
- **WHEN** a user disables console logging in settings
- **THEN** subsequent unified logger calls do not emit any output to the browser console

#### Scenario: Error logs do not bypass disabled console logging
- **WHEN** a user disables console logging in settings and an `error` log is emitted
- **THEN** the system does not emit the error to the browser console

### Requirement: User-configurable minimum console log level
The system SHALL allow users to configure a minimum console log level. When console logging is enabled, logs below the configured level MUST NOT be emitted.

#### Scenario: Debug logs are suppressed when minimum level is info
- **WHEN** the minimum console log level is set to `info`
- **THEN** `debug` logs are not emitted but `info`, `warn`, and `error` logs are emitted

### Requirement: Sensitive data is redacted from logs
The system MUST prevent sensitive information from being written to the console. At minimum, values that represent API keys/tokens, authorization headers, cookies, or backup payloads MUST be redacted before emission.

#### Scenario: Token fields are redacted
- **WHEN** the unified logger is called with details that include a field named `adminToken` containing a token value
- **THEN** the emitted log does not contain the raw token value and instead contains a redacted placeholder

### Requirement: Logging must be resilient and non-throwing
The unified logger MUST NOT throw exceptions to its callers. If log details contain circular references or unsupported values, the logger MUST still return without throwing and MUST emit a best-effort representation when console logging is enabled.

#### Scenario: Circular details do not crash the caller
- **WHEN** the unified logger is called with details that contain a circular reference
- **THEN** the call completes without throwing an exception

### Requirement: Standardized extension context prefix
The system MUST include a standardized extension context prefix in emitted log output to support debugging across contexts. The prefix MUST identify the running context (at minimum: Background/Service Worker, Content Script, Popup, Options, Side Panel) and MUST be included alongside the module/feature scope.

#### Scenario: Content script log includes context prefix
- **WHEN** a content script emits a log using the unified logger
- **THEN** the emitted log output includes the standardized Content Script context prefix in addition to the module scope

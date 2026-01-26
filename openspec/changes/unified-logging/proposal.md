## Why

Logging is currently scattered across the codebase via direct `console.*` calls, which makes it difficult to control verbosity, apply consistent log levels, and avoid accidentally logging sensitive information. A unified logging layer is needed to standardize log semantics and give users a simple switch to enable/disable console logging when troubleshooting.

## What Changes

- Introduce a unified logger API (encapsulating `console.*`) with explicit log levels (`debug`/`info`/`warn`/`error`) and consistent prefixes/metadata.
- Replace existing `console.log`-style calls with the unified logger and pick more appropriate log levels based on message severity and expected frequency.
- Add user preferences to control whether logs are emitted to the browser console (enable/disable) and to select the minimum console log level.
- Ensure logs redact sensitive data (tokens/API keys/backups) and avoid accidentally logging secrets.
- Add tests to cover log gating (by user preference + level) and redaction behavior.

## Capabilities

### New Capabilities
- `logging`: Provide a unified, level-based logging API and a user-facing toggle to enable/disable console logging.

### Modified Capabilities

## Impact

- Cross-cutting refactor across `services/`, `utils/`, and `entrypoints/` to replace `console.*` usage.
- Options/settings UI will gain a logging control (and related i18n strings under `locales/`).
- Tests (Vitest) will be added/updated to validate logger behavior and to prevent secret leakage via logs.

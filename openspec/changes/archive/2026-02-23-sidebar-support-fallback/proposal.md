## Why

The extension supports multiple UI entrypoints (popup, options, side panel), but side panel capabilities differ across browsers/manifest versions and may be unavailable at runtime. When a user configures the toolbar icon to open the side panel, the click experience should remain reliable and always open a usable UI surface.

## What Changes

- Add a runtime capability check for side panel support (Firefox `sidebarAction` and Chromium `sidePanel`), including method availability.
- Make toolbar icon click behavior resilient:
  - If side panel is supported and the user prefers side panel, open the side panel.
  - If side panel is not supported (or opening fails), fall back to a supported UI surface (popup or options) with a consistent user experience.
- Update the settings UI to reflect support without mutating persisted preferences:
  - When side panel is unsupported on this device, clearly explain that the toolbar icon will fall back to `popup`.
  - Keep the stored preference unchanged (even if it is `sidepanel`) to avoid multi-device configuration sync side effects.
- Ensure keyboard commands (popup/sidebar actions) follow the same support detection and fallback rules.
- Add/adjust tests to cover supported and unsupported environments.

## Capabilities

### New Capabilities
- `sidepanel-support-fallback`: Define how the extension detects side panel support and how toolbar/command entrypoints fall back when side panel is unavailable.

### Modified Capabilities
- (none)

## Impact

- Background wiring: `entrypoints/background/actionClickBehavior.ts` (and command handlers if applicable).
- Cross-browser API helpers: `utils/browserApi.ts` (capability detection + safe open).
- Preferences + UX: `services/userPreferences.ts`, `contexts/UserPreferencesContext.tsx`, and options UI settings for action click behavior.
- i18n: `locales/*` for any new user-facing messaging.
- Tests: unit tests for capability detection and action-click fallback behavior.

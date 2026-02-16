## Why

The extension currently registers right-click context menu entries globally, which can make the browser context menu feel cluttered and overly wide (notably the “Quickly test the functional availability of AI APIs” entry). Users need a per-menu-entry switch so they can hide specific entries they don’t use without turning off the underlying feature or reloading the extension.

## What Changes

- Add user preferences to control visibility of each extension-owned context menu entry (starting with the Web AI API Check entry requested in #479; keep the design extensible to other entries such as Redemption Assist).
- Add settings UI toggles in Options so users can enable/disable the corresponding context menu entries.
- When a related setting changes, notify the background script so it updates (create/remove) the context menu entries immediately.
- Make background context menu registration preference-aware and safe to re-run (idempotent create/remove of only extension-owned menu ids).

## Capabilities

### New Capabilities

- `context-menu-entry-visibility`: Persisted, per-entry visibility controls for extension-owned browser context menu items, applied immediately via background menu refresh.

### Modified Capabilities

- `web-ai-api-check`: The “AI API Check” context-menu trigger becomes conditional on the user’s context-menu visibility preference (default enabled).

## Impact

- Background: context menu registration logic and its runtime-message wiring to refresh menus when preferences change.
- Preferences/storage: add new preference fields with backward-compatible defaults.
- Options UI + i18n: new toggles and translated labels/descriptions.
- Testing: add coverage for preference-driven menu registration and refresh behavior (including “toggle → background refresh”).

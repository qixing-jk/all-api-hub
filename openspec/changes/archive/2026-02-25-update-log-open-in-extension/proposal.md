## Why

Opening the changelog as a new active browser tab is disruptive and pulls users out of the extension flow. We want update release notes to be shown inline in the extension UI instead.

## What Changes

- When a pending “updated version” marker is consumed on the first UI open after an update (popup/options/sidepanel) and `openChangelogOnUpdate` is enabled, the extension shows the update log directly within the extension UI (e.g., an in-app dialog/panel) instead of opening an external docs changelog tab.
- The inline update-log UI provides user actions to close, open the full docs changelog in a new tab, and toggle `openChangelogOnUpdate` for future updates.
- The pending marker remains **at-most-once** consumed across concurrent UI contexts.
- When `openChangelogOnUpdate` is disabled, the pending marker is still consumed/cleared without showing anything.

## Capabilities

### New Capabilities

<!-- None -->

### Modified Capabilities

- `changelog-on-update`

## Impact

- UI: `components/ChangelogOnUpdateUiOpenHandler.tsx`, `components/AppLayout.tsx`, plus a new reusable in-extension update-log view (dialog/panel).
- i18n: new/updated strings for the inline update-log UI and settings descriptions.
- Tests: update existing unit/E2E coverage that currently asserts a new tab is created (`tests/components/ChangelogOnUpdateUiOpenHandler.test.tsx`, `e2e/changelogOnUpdate.spec.ts`).

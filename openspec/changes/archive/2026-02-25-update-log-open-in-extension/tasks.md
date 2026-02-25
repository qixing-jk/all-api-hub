## 1. Changelog preview source

- [x] 1.1 Embed the docs changelog page (anchored to the version) in an iframe inside the dialog
- [x] 1.2 Show a fallback message when the embedded preview fails to load, while still offering “Open full changelog”

## 2. Inline update log UI

- [x] 2.1 Implement an in-extension “Update log / What’s New” dialog/panel that shows the version-anchored docs changelog inline (iframe, best-effort) and provides Close + “Open full changelog” + “Enable/Disable auto-open” actions
- [x] 2.2 Add/adjust i18n strings for the inline dialog and update existing settings copy to match the new behavior
- [x] 2.3 Wire the dialog container/provider into `components/AppLayout.tsx` so it works across popup/options/sidepanel

## 3. Update-time trigger behavior

- [x] 3.1 Refactor `components/ChangelogOnUpdateUiOpenHandler.tsx` to open the inline update-log UI (and not call `createTab` automatically)
- [x] 3.2 Keep at-most-once semantics by continuing to consume and clear the pending marker via `services/changelogOnUpdateState.consumePendingVersion()`

## 4. Tests and verification

- [x] 4.1 Update `tests/components/ChangelogOnUpdateUiOpenHandler.test.tsx` to assert inline opening behavior (no automatic tab creation)
- [x] 4.2 Update `e2e/changelogOnUpdate.spec.ts` to assert the inline dialog appears once and the pending marker is consumed
- [x] 4.3 Run relevant unit tests and the updated E2E spec to confirm behavior

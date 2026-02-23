## 1. Service Layer

- [x] 1.1 Add a `ModelRedirectService` method to clear `model_mapping` for a selected set of channel IDs in the active managed-site context
- [x] 1.2 Reuse existing managed-site config validation and channel listing to ensure the operation fails fast with a clear error when config is missing
- [x] 1.3 Return a structured per-channel result summary suitable for UI toasts/dialog details

## 2. Options UI

- [x] 2.1 Add a “Clear model redirect maps” action to `entrypoints/options/pages/BasicSettings/components/ModelRedirectSettings.tsx`
- [x] 2.2 Implement a preview dialog that loads channels and allows selecting which channels to clear (default: all selected; provide select all/none)
- [x] 2.3 Add a `DestructiveConfirmDialog` confirmation step and disable dismissal while the clear operation is running
- [x] 2.4 Show success/failure toasts and include per-channel error details when partial failures occur

## 3. Localization & Copy

- [x] 3.1 Add i18n keys under the `modelRedirect` namespace for the new action label, preview/selection UI, confirmation title/description, and result messages
- [x] 3.2 Verify all new user-facing strings are translated for supported locales

## 4. Tests & Docs

- [x] 4.1 Add unit tests for the new bulk-clear service method using existing Vitest/MSW patterns (all-success and partial-failure cases)
- [x] 4.2 Add component tests covering preview + confirmation flow (preview loads; cancel does nothing; confirm calls the service with selected IDs)
- [x] 4.3 Update `docs/docs/model-redirect.md` to document the preview/selection + destructive clear behavior

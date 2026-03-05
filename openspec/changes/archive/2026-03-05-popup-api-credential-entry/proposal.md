## Why

API credential profiles are currently only reachable from the Options UI, which adds friction for quick “add/copy/export/verify” workflows that users typically start from the popup. Adding a dedicated popup entrypoint keeps parity with the existing Accounts/Bookmarks switching pattern and makes credential management accessible where users already work.

## What Changes

- Add an **API Credentials** entry to `PopupViewSwitchTabs` (Popup + Side Panel, since Side Panel reuses the popup UI).
- Provide a popup-friendly API credential profiles view that reuses existing profile logic/components where possible.
- Update popup header/actions behavior so “open full page” can route to the Options API credential profiles section when needed.
- Add i18n strings for the new tab/labels and add tests covering view switching and entry visibility.

## Capabilities

### New Capabilities

- `popup-api-credential-entrypoint`: Users can access a dedicated API Credentials view from the popup tab switch to work with stored API credential profiles and run the most common actions without going into settings.

### Modified Capabilities

- `site-bookmarks`: Update the Popup switching requirement so Bookmarks remains accessible when the view switch gains an additional tab beyond `Accounts | Bookmarks`.

## Impact

- Popup UI: `src/entrypoints/popup/App.tsx`, `src/entrypoints/popup/components/PopupViewSwitchTabs.tsx`, and related header/action components that depend on the active view.
- Navigation: reuse or extend `src/utils/navigation/index.ts` (`openApiCredentialProfilesPage`) for full-page fallback behavior.
- Feature UI/logic: likely reuse pieces of `src/features/ApiCredentialProfiles/**` in a popup-optimized container.
- Localization + tests: update `src/locales/**` and add/adjust Vitest + Testing Library coverage for the new popup view.

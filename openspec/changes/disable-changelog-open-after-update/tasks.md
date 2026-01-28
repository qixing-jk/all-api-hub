## 1. Preferences schema + defaults

- [x] 1.1 Add `openChangelogOnUpdate: boolean` to `UserPreferences` (`services/userPreferences.ts`) and ensure it is treated as optional for backward compatibility with existing stored preferences.
- [x] 1.2 Set the default to `true` in `DEFAULT_PREFERENCES` (`services/userPreferences.ts`) so missing values are treated as enabled.
- [x] 1.3 Add an update helper for the preference (service + `UserPreferencesContext`) so UI surfaces can persist changes without needing a page reload.

## 2. Background update behavior

- [x] 2.1 Update `entrypoints/background/index.ts` to respect `openChangelogOnUpdate` when handling `onInstalled` with `details.reason === "update"`.
- [x] 2.2 Reuse the preferences loaded during install/update migration (avoid redundant storage reads) and ensure the behavior is consistent across MV3 (Chromium) and MV2 (Firefox) builds.
- [x] 2.3 Ensure disabling changelog auto-open does not affect other update-time flows (e.g., new optional permissions onboarding).

## 3. Settings UI + i18n

- [x] 3.1 Add a Basic Settings toggle in the Options UI for `openChangelogOnUpdate` (clear label + description indicating it opens a new tab after updates).
- [x] 3.2 Wire the toggle to persistence via `UserPreferencesContext` and ensure the state updates immediately after saving.
- [x] 3.3 Add i18n keys for the new toggle and update all supported locale files touched by the settings UI.

## 4. Tests + verification

- [x] 4.1 Add a background unit test: on update, opens the version-anchored changelog tab when `openChangelogOnUpdate = true` (mock `getManifest`, `getDocsChangelogUrl`, `createTab`, and preference loading).
- [x] 4.2 Add a background unit test: on update, does not open any changelog tab when `openChangelogOnUpdate = false`.
- [x] 4.3 Add a preference test: missing `openChangelogOnUpdate` is treated as enabled (`true`) via defaults/merge behavior.
- [x] 4.4 Run `pnpm test` (and `pnpm lint`/`pnpm format` if part of the workflow) for impacted files.

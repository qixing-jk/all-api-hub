# Design

## Preference
- Add a new boolean preference: `warnOnDuplicateAccountAdd`.
- Default: `true`.
- Stored in the existing `UserPreferences` tree and exposed via `UserPreferencesContext`.

## Duplicate detection
- In ADD mode, before proceeding with the account add flow (entering manual add / running auto-detect), load existing accounts and check if any `site_url` matches the dialog `url` (already normalized to `protocol//host` in `handleUrlChange`).
- If duplicates exist and the preference is enabled, show a warning modal and wait for user confirmation before continuing the requested action.
- After the user confirms for a given `site_url`, do not re-prompt for the same URL again in the same dialog session unless the URL changes.

## UI
- Add a warning modal component similar to `DuplicateChannelWarningDialog`:
  - Title + warning `Alert`
  - Actions: Cancel / Continue
- The modal content includes the target `site_url`, and either:
  - the number of existing accounts for that site, or
  - the exact matched account’s `userId` + `username` (when the dialog `userId` matches an existing account on that site).
- Add a settings toggle section (Switch) under Account Management tab.

## i18n
- Add `accountDialog` locale keys for the warning dialog.
- Add `settings` locale keys for the new toggle section.

## Tests
- Add a `useAccountDialog` hook test:
  - When an account with the same base URL already exists and preference enabled, entering the add flow (`handleShowManualForm` / `handleAutoDetect`) pauses behind the warning until Continue is clicked.
  - When preference disabled, entering the add flow proceeds without prompting.

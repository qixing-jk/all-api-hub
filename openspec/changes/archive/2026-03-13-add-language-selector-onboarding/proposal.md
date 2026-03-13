## Why

The first-install onboarding flow currently opens a permissions-focused modal before users have made an explicit language choice. New users can already change language elsewhere in the options UI, but that is easy to miss during onboarding and forces them to interpret the initial setup content in whatever language was auto-selected.

## What Changes

- Add a language selection control to the initial onboarding experience shown on first install.
- Reuse the existing language preference and i18n infrastructure so changing language during onboarding updates the UI immediately and persists for later sessions.
- Add or adjust onboarding-facing localized strings so the first-run flow is complete in each supported UI language.

## Capabilities

### New Capabilities
- `onboarding-language-selection`: Lets users choose and persist their preferred UI language directly from the first-run onboarding flow before proceeding with setup.

### Modified Capabilities
None.

## Impact

- Affected UI: first-run onboarding in the options/settings flow, especially the permission onboarding dialog or equivalent initial boot surface.
- Affected code: existing language switcher component usage, onboarding UI components, user preference persistence, and onboarding locale resources under `src/locales/`.
- Dependencies and APIs: no new external dependencies or backend API changes are expected; this change should build on the existing i18next and `userPreferences` language support.

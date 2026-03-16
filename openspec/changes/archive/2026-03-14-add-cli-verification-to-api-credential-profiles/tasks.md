## 1. Reuse and dialog wiring

- [x] 1.1 Inspect the existing API Credential Profiles controller/dialog flow and the Model Management CLI verification affordance to confirm the change reuses `useApiCredentialProfilesController`, `ApiCredentialProfilesDialogs`, `ApiCredentialProfileListItem`, and `VerifyCliSupportDialog`.
- [x] 1.2 Extend `useApiCredentialProfilesController` and `ApiCredentialProfilesDialogs` to track a CLI-verifying profile and render the shared `VerifyCliSupportDialog` for profile sources without introducing a page-specific duplicate dialog.

## 2. API Credential Profiles UI updates

- [x] 2.1 Add a per-profile CLI verification action to `ApiCredentialProfileListItem` and any supporting list wiring so stored profiles can launch CLI support tests directly from the API Credential Profiles page.
- [x] 2.2 Use the same `CommandLineIcon` affordance as Model Management for the new CLI verification action, keeping API verification separate and adding brief clarifying comments only where the dialog-state routing is non-obvious.

## 3. Tests and validation

- [x] 3.1 Extend the API Credential Profiles options-page tests to cover the new CLI verification action and shared-dialog opening for a stored profile, while keeping the existing Model Management profile-action coverage intact.
- [x] 3.2 Run `pnpm lint` and `pnpm -s test -- tests/entrypoints/options/pages/ApiCredentialProfiles/ApiCredentialProfiles.test.tsx tests/entrypoints/options/pages/ModelList/ModelItem.profileActions.test.tsx`; if either command is blocked, document the blocker in the implementation notes instead of widening scope.

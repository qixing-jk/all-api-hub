## Why

API credential profiles can already run direct API verification from their own page, but CLI support verification for the same profile is only exposed indirectly from profile-backed rows inside Model Management. This leaves the profile-management workflow incomplete and makes the CLI test affordance inconsistent depending on where the user starts.

## What Changes

- Add a per-profile CLI verification action to the API Credential Profiles page so stored profiles can launch CLI support tests without going through Model Management first.
- Reuse the existing shared CLI verification dialog for profile sources, including the same profile credentials and profile-backed model fetching so users can choose a fetched model or enter one manually when needed.
- Align the API Credential Profiles action iconography with the existing Model Management CLI verification affordance so the same action uses the same icon across both surfaces.
- Extend page-level tests to cover the new CLI verification action on API credential profiles in addition to the existing Model Management coverage.

## Capabilities

### New Capabilities
None.

### Modified Capabilities
- `api-credential-profiles`: extend profile verification requirements so stored profiles can launch CLI support verification directly from the API Credential Profiles page with the same affordance used in Model Management.

## Impact

- Affected code: `src/features/ApiCredentialProfiles/**`, shared verification dialogs, related locale strings, and options-page tests.
- UX: profile verification actions become complete and consistent across API Credential Profiles and Model Management.
- Dependencies: reuses existing `VerifyCliSupportDialog`, profile-backed CLI verification flow, and existing profile model-catalog fetching helpers rather than adding a new verification implementation.

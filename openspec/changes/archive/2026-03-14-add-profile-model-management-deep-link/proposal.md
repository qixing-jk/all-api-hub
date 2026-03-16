## Why

Model Management now supports stored API credential profiles as first-class sources, but the routing contract still only honors `accountId` deep links and the API Credential Profiles page has no direct entry into the matching model view. Users who start from a saved profile must open Model Management first and then manually re-select the same profile, which breaks fast navigation and makes profile workflows less direct than account workflows.

This gap matters now because profile-backed Model Management already exists in the shipped capability set. Adding a stable deep link closes the navigation loop without introducing a new model-loading surface.

## What Changes

- Extend Model Management routing so a deep link can target a stored API credential profile directly, not only an account.
- Add an API Credential Profiles action that opens Model Management already focused on the selected profile.
- Define how Model Management resolves route-driven source selection when the deep link targets a missing profile or when conflicting routing params are present.
- Add targeted tests for the navigation helper, route initialization, and profile-page action wiring.

## Capabilities

### New Capabilities

- None.

### Modified Capabilities

- `api-credential-profiles`: stored profiles can launch Model Management directly through a profile-specific deep link.
- `model-management-credential-sources`: Model Management route parsing and initial source selection support profile-targeted deep links with safe fallback behavior.

## Impact

- Options routing and navigation helpers for `options.html#models`.
- API Credential Profiles list actions and controller wiring.
- Model Management route initialization and selected-source resolution.
- Unit/component tests covering deep-link URLs, route precedence, and stale-profile fallbacks.

## Why

Model Management currently treats site accounts as the only selectable data source, even though stored API credential profiles already support direct model discovery, verification probes, and several downstream API-management/export workflows. Users who only have reusable API credentials, or who want to manage models through those credentials instead of a dashboard account, cannot do that from the main model interface today.

This change makes existing API credential profiles selectable in Model Management so model querying and related actions are not artificially limited to account records.

## What Changes

- Extend the Model Management source selector so users can choose existing API credential profiles in addition to `all accounts` and individual site accounts, with localized profile labels that show the profile name and host.
- Load model data for profile-backed selections by reusing the existing API credential model-query capabilities for supported API types, normalizing returned model ids into a minimal catalog view without requiring a `SiteAccount`.
- Make Model Management rendering and actions source-aware so profile-backed results hide pricing/group/account-summary/detail affordances instead of fabricating account-only metadata, while `all accounts` rows keep their owning-account actions.
- Reuse existing profile metadata and secret-handling rules when launching profile-backed API verification and CLI support checks from Model Management, while leaving model-key compatibility account-only.
- Add targeted tests for source selection, profile-backed model loading, capability-aware rendering, and profile-backed verification/redaction flows.

## Capabilities

### New Capabilities

- `model-management-credential-sources`: Allow Model Management to load and operate on models from either site accounts or stored API credential profiles, with source-aware selection and result handling.

### Modified Capabilities

- `api-credential-profiles`: Stored API credential profiles can be selected as first-class inputs for Model Management, not only verification/export flows.

## Impact

- Options UI: Model List / Model Management selectors, labels, empty states, and source-aware actions.
- Data loading: model query hooks/services must support both account-backed and API-credential-backed sources.
- Types/state: selection state and pricing/model result context need a shared source abstraction instead of assuming `DisplaySiteData` only.
- Verification dialogs: profile-backed model rows now reuse profile verification and CLI support dialogs with model-aware defaults.
- Security: profile API keys remain masked/redacted; logs and user-facing errors must not reveal secrets.
- Tests: component/hook coverage for profile selection, model loading, verification redaction, and action gating by source type.

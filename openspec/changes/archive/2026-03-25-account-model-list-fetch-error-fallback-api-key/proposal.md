## Why

Account-backed Model Management can currently fail outright when the relay-specific model/pricing request does not succeed, even though the same account still has usable API keys that can fetch an upstream model list. This leaves users without a workable model view unless they manually recreate the account as a separate API credential profile.

## What Changes

- Add an account-scoped fallback in Model Management so that when direct account model loading fails, the user can choose one of that account's keys and load the model list through the key instead.
- Treat the selected account key like a temporary API credential source for model catalog loading, including retry support and secret-safe error handling.
- Adjust Model Management UI states so key-backed fallback results remain usable without pretending account-only pricing, group, or summary data is available.
- Reuse existing account token loading and model-catalog fetching abstractions where possible instead of creating a parallel credential flow.

## Capabilities

### New Capabilities
None.

### Modified Capabilities
- `model-management-credential-sources`: Account-backed model loading can fall back to a user-selected account key and render a key-backed model catalog when the direct account request fails.

## Impact

- Affected code will center on `src/features/ModelList/**`, especially account-backed load/error handling and any key-selection fallback UI.
- Shared model-catalog fetching logic may be extended in `src/services/apiCredentialProfiles/modelCatalog.ts` or adjacent services so account keys can reuse the same credential-style model loading path.
- Existing account token retrieval helpers and secret-redaction behavior will be reused for the fallback flow.
- Validation will need targeted tests for the new fallback behavior plus updated i18n strings for the fallback/error states.

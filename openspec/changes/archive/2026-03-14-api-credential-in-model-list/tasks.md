## 1. Source abstraction and selection state

- [x] 1.1 Introduce a model-management source abstraction that combines enabled site accounts, the existing `all accounts` option, and stored API credential profiles
- [x] 1.2 Update Model Management state and route initialization to resolve the active source safely and clear stale profile selections when the backing profile no longer exists

## 2. Source-aware model loading

- [x] 2.1 Keep the current account-backed `fetchModelPricing` flow unchanged for account and `all accounts` sources
- [x] 2.2 Add a profile-backed model loader that reuses stored profile `apiType`/`baseUrl`/`apiKey` and existing model-list helpers to fetch model identifiers without a `SiteAccount`
- [x] 2.3 Normalize loader results into source capability metadata so profile-backed views can distinguish unsupported pricing, group, summary, and token-management features while still enabling credential and CLI verification actions
- [x] 2.4 Sanitize profile-backed load/action error handling so logs, toasts, and status messages never reveal raw API keys

## 3. Model Management UI and actions

- [x] 3.1 Replace the account-only selector and status handling with source-aware UI that labels API credential profiles and preserves the current `all accounts` behavior
- [x] 3.2 Update filtering, control-panel, and summary rendering so profile-backed sources hide or disable account-only pricing/group/account-summary controls instead of showing synthetic data
- [x] 3.3 Route model-row actions by source type: keep account API/CLI/key dialogs for accounts, wire profile-backed API and CLI verification for profiles, and suppress account token/key compatibility actions for profile-backed rows
- [x] 3.4 Ensure profile create/edit/delete changes are reflected in the selector and active source without creating mirrored account records

## 4. Localization and validation

- [x] 4.1 Add or update i18n strings for profile-backed selector labels, capability-aware empty/error states, and unavailable account-only actions
- [x] 4.2 Add/update scoped tests for source selection, profile-backed model loading, capability-aware rendering, source-specific API/CLI actions, profile verification dialog behavior, and profile lifecycle sync
- [x] 4.3 Run the relevant scoped test commands for Model Management, API credential profile verification, and CLI support flows and address any regressions

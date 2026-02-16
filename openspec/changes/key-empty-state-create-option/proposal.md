## Why

Clicking the account “key” icon is a common shortcut to copy an API key/token, but today it dead-ends with a “No available key” message when the account has zero keys. Users then need to navigate elsewhere to create a key, which is slow and confusing.

## What Changes

- When the account key icon is clicked and the selected account has no available keys/tokens, show a small pop-up/modal that offers explicit actions to create a key (quick default create and custom/manual create).
- If the user chooses the quick-create action, reuse the existing key creation logic (default-token provisioning) to create a key for that account, then proceed with the original intent (make the new key available for copy/selection).
- If the user chooses the custom-create action, reuse the existing Add Token form (`AddTokenDialog`) to create a key in-place (no navigation), then refresh the token list and continue the original copy intent.
- Keep eligibility gating consistent with existing token-management behavior (e.g., disabled accounts or unsupported site types should not attempt token creation).
- Localize new UI copy and provide user-facing error feedback when creation fails.

## Capabilities

### New Capabilities
- `account-key-empty-state-create-option`: When a user triggers the account key action and the account has no keys, the UI offers a quick-create default key option and a custom-create option, then continues the original copy flow.

### Modified Capabilities
- (none)

## Impact

- Popup/options account list UI where the account key icon action is triggered (empty-state UX + new action).
- Existing token inventory fetch + default token creation services/hooks (reused; may need a new call site).
- i18n resources for the new pop-up text/actions.
- Tests for the new empty-state interaction, including success and failure paths.

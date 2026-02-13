## Why

Adding an account that has no API keys (tokens) makes common actions (copy key, key management) fail and forces extra manual setup. Auto-provisioning a default key and providing a repair action for existing accounts prevents “no key found” states after imports or legacy data.

## What Changes

- After a successful account add, automatically check the account’s token list and create a default token when none exist.
- Provide a user-initiated bulk action to scan enabled accounts and create a default token for any eligible account that has zero tokens.
- Keep the flow best-effort: key creation failures must not corrupt the stored account; the user gets clear feedback and can retry.
- Respect account constraints (e.g., skip disabled accounts) and skip site types that do not support token management.

## Capabilities

### New Capabilities
- `account-key-auto-provisioning`: Ensure each supported account has at least one API token by auto-creating a default token on account add and via a manual repair action.

### Modified Capabilities

## Impact

- Account add/save flow and storage (`services/accountOperations.ts`, `services/accountStorage.ts`).
- API token endpoints/adapters (`services/apiService/**`).
- Key Management UI and any new “repair missing keys” entry point in Options/Popup.
- i18n strings and automated tests (Vitest + MSW) for the new behaviors.

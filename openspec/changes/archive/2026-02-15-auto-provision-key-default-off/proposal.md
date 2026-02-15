## Why

Adding an account currently defaults to automatically creating a remote API token when no tokens exist. This has side effects (writes to the upstream site) and can surprise users who only want to monitor balances/models without provisioning credentials.

We need to change the default to safer, opt-in behavior and keep the OpenSpec requirements aligned with the implementation.

## What Changes

- Change the default value of `autoProvisionKeyOnAccountAdd` from enabled to disabled.
- Ensure the account-add flow uses the configured preference, and falls back to the default preference value when preferences are missing/unreadable.
- Update tests to reflect the new default and fallback behavior.
- Update the `account-key-auto-provisioning` spec to match the new default.

## Capabilities

### New Capabilities

<!-- none -->

### Modified Capabilities

- `account-key-auto-provisioning`: The `autoProvisionKeyOnAccountAdd` setting default changes from **enabled** to **disabled**.

## Impact

- Affects account-add post-save behavior (auto-provision trigger), preference defaults, and the default state of the Options toggle.
- No API surface changes; manual bulk repair and the toggle behavior remain unchanged.

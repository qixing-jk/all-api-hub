## Why

Sub2API does not safely support the extension's existing "create a default token if none exists" assumption when the request omits a concrete group. The original change draft focused on Copy Key and KiloCode export, but the implemented branch widened the same safety rule across every user-triggered Sub2API bootstrap path that could otherwise create an ungrouped key or leave the user stuck after saving an account.

## What Changes

- Add a shared Sub2API quick-create resolution step that loads the current upstream groups and classifies creation as:
  - ready with exactly one valid group
  - explicit selection required with multiple valid groups
  - blocked with a user-facing error when no valid groups exist
- Guard implicit default-token helpers so background or shared ensure flows never create a Sub2API key without an explicitly resolved group.
- Reuse constrained Add Token dialogs for multi-group Sub2API quick-create flows instead of inventing a hidden fallback group.
- Apply the same group-aware behavior to:
  - Copy Key empty-state quick create
  - KiloCode export no-token create
  - managed-site channel import when a token is missing
  - the post-save Sub2API account flow when the saved account still has no token
  - manual repair follow-up actions for skipped Sub2API accounts
- Keep automatic account-add provisioning and background repair from silently creating Sub2API keys.
- Preserve non-Sub2API quick-create behavior and the existing explicit-group Sub2API create/update path.

## Capabilities

### New Capabilities
None.

### Modified Capabilities
- `sub2api-key-management`: Sub2API key creation must resolve a valid current group, reuse constrained shared token dialogs for multi-group cases, and support resuming user-triggered follow-up flows after token creation succeeds.
- `account-key-empty-state-create-option`: the copy-key empty-state quick-create action must use the same Sub2API group-aware resolution rules instead of provisioning a default token with no selected group.
- `kilocode-settings-export`: the per-site create-token action must follow the same Sub2API single-group fast path and multi-group explicit-selection rules before creating a token for export.
- `account-key-auto-provisioning`: automatic repair/on-add provisioning must continue skipping Sub2API, but manual repair results may offer an explicit user-triggered Sub2API create-key follow-up action.

## Impact

- Affected code:
  - `src/services/accounts/accountKeyAutoProvisioning/ensureDefaultToken.ts`
  - `src/services/accounts/accountOperations.ts`
  - `src/features/AccountManagement/components/CopyKeyDialog/**`
  - `src/components/KiloCodeExportDialog.tsx`
  - `src/components/dialogs/ChannelDialog/**`
  - `src/features/KeyManagement/components/RepairMissingKeysDialog.tsx`
  - `src/features/AccountManagement/components/AccountDialog/hooks/useAccountDialog.ts`
- Affected UX:
  - Sub2API quick-create remains one click only when exactly one valid current group exists after the user triggers creation.
  - Multi-group Sub2API quick-create opens a constrained visible token-creation dialog instead of guessing a fallback group.
  - Saving or repairing a Sub2API account can now route the user into the same explicit group-aware token creation flow when a first key is still needed.
  - Non-Sub2API quick-create behavior remains unchanged.
- Validation impact:
  - Shared helper, Copy Key, KiloCode export, managed-site channel import, account-save, and repair follow-up tests need coverage for ready / selection-required / blocked Sub2API paths.

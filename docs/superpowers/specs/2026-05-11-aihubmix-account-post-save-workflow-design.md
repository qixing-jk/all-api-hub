# AIHubMix Account Post-Save Workflow Design

Date: 2026-05-11

## Purpose

Adding an AIHubMix account should support the same "configure to managed site"
and default-key flow as other account types without losing the one-time full API
key returned by AIHubMix. The flow must also keep Sub2API's group-selection
requirements visible to the user when a key has to be created.

The selected approach is a foreground post-save workflow in `AccountDialog`.
Saving the account remains the first completed step. After the account is saved,
the dialog continues with token preparation and managed-site channel setup.
Failures in the follow-up steps do not roll back the saved account.

## Current Context

- `validateAndSaveAccount` currently saves the account, then starts
  `autoProvisionKeyOnAccountAdd` as a fire-and-forget background task.
- `autoProvisionKeyOnAccountAdd` skips AIHubMix and Sub2API because both need
  foreground handling in some cases.
- `CopyKeyDialog` already preserves a full token returned from `createApiToken`
  and shows `OneTimeApiKeyDialog` for one-time secrets.
- `ChannelDialog` already supports preparing managed-site channel data from an
  account and a token through `openWithAccount(account, token)`.
- Sub2API already has `resolveSub2ApiQuickCreateResolution` and a global
  `AddTokenDialog` path for group selection.
- AIHubMix key creation can return the only full key value in the create
  response; later list/detail reads may contain masked keys. Implementation must
  not rely on reading the full key back later.

## Goals

- Keep the add-account save result independent from follow-up configuration.
- Make token creation and managed-site preparation visible and resumable in the
  current UI.
- Preserve AIHubMix full keys immediately when they are created.
- Reuse existing Sub2API group-selection UI.
- Avoid duplicate background and foreground token creation.
- Avoid magic strings for workflow state, result kinds, error codes, and site
  type branching.

## Non-Goals

- Do not create managed-site channels silently. Users still review the
  prefilled `ChannelDialog` before saving.
- Do not add a generic task-event bus for background workflows.
- Do not store AIHubMix one-time full keys in persistent storage.
- Do not change the regular account-save behavior except where needed to skip
  duplicate background auto-provisioning for this foreground workflow.

## Architecture

### Account Save Boundary

`validateAndSaveAccount` remains responsible for validation, remote account data
refresh, and storage. It should accept a narrow option that allows callers to
skip the background `autoProvisionKeyOnAccountAdd` task.

The managed-site quick-config path should call account save with that skip
option enabled. The ordinary "save account" path can keep the existing
preference-driven background auto-provisioning behavior.

### Foreground Workflow Owner

`AccountDialog` owns the post-save workflow because it owns the relevant UI
lifecycle:

1. Save the new account if needed.
2. Load the saved `DisplaySiteData`.
3. Ensure a usable API token exists.
4. Show any required foreground prompt.
5. Open the managed-site channel dialog with the ensured token.

The implementation should keep this orchestration in a focused hook/helper so
`useAccountDialog.ts` does not gain another large inline block.

### Token Workflow Helper

Introduce a small token preparation helper for foreground flows. It should
return structured results instead of relying on thrown message strings for
expected branches.

Recommended constants:

```ts
export const ENSURE_ACCOUNT_TOKEN_RESULT_KINDS = {
  Ready: "ready",
  Created: "created",
  Sub2ApiSelectionRequired: "sub2api_selection_required",
  Blocked: "blocked",
} as const
```

Recommended result shape:

```ts
export type EnsureAccountTokenResult =
  | { kind: typeof ENSURE_ACCOUNT_TOKEN_RESULT_KINDS.Ready; token: ApiToken; created: false }
  | {
      kind: typeof ENSURE_ACCOUNT_TOKEN_RESULT_KINDS.Created
      token: ApiToken
      created: true
      oneTimeSecret: boolean
    }
  | {
      kind: typeof ENSURE_ACCOUNT_TOKEN_RESULT_KINDS.Sub2ApiSelectionRequired
      allowedGroups: string[]
      existingTokenIds: number[]
    }
  | {
      kind: typeof ENSURE_ACCOUNT_TOKEN_RESULT_KINDS.Blocked
      code: AccountPostSaveWorkflowErrorCode
      message: string
    }
```

Behavior:

- Existing token: return `Ready`.
- Non-special account without token: create the default token and return
  `Created`.
- AIHubMix without token: create a default token and return `Created` only if
  `createApiToken` returns a full `ApiToken` with a usable unmasked key. Mark it
  as `oneTimeSecret: true`.
- AIHubMix create result without a usable full key: return `Blocked`. Do not
  export a masked key.
- Sub2API without token:
  - no valid groups: return `Blocked`;
  - one valid group: create the default token with that group and return
    `Created`;
  - multiple valid groups: return `Sub2ApiSelectionRequired`.

### Workflow State Constants

Workflow steps should be represented by exported constants and derived types.

```ts
export const ACCOUNT_POST_SAVE_WORKFLOW_STEPS = {
  Idle: "idle",
  SavingAccount: "saving_account",
  LoadingSavedAccount: "loading_saved_account",
  CheckingToken: "checking_token",
  CreatingToken: "creating_token",
  WaitingForOneTimeKeyAcknowledgement: "waiting_for_one_time_key_acknowledgement",
  WaitingForSub2ApiGroupSelection: "waiting_for_sub2api_group_selection",
  OpeningManagedSiteDialog: "opening_managed_site_dialog",
  Completed: "completed",
  Failed: "failed",
} as const
```

These values should be mapped to i18n keys in one place. Components should not
render or compare raw step strings directly.

### Error Code Constants

Expected workflow stops should use exported error-code constants.

```ts
export const ACCOUNT_POST_SAVE_WORKFLOW_ERROR_CODES = {
  SavedAccountNotFound: "saved_account_not_found",
  TokenCreationFailed: "token_creation_failed",
  TokenSecretUnavailable: "token_secret_unavailable",
  ManagedSiteConfigMissing: "managed_site_config_missing",
  UserCancelled: "user_cancelled",
} as const
```

UI can decide retry/cancel behavior by error code. User-visible text still comes
from i18n.

### No Magic String Rule

The implementation must not introduce bare protocol or workflow strings in
branching logic.

- Use `SITE_TYPES.AIHUBMIX` and `SITE_TYPES.SUB2API` for site checks.
- Use exported result-kind constants for token workflow branches.
- Use exported workflow-step constants for UI state.
- Use exported error-code constants for expected stops.
- Keep i18n keys centralized in mappings when a set of workflow states needs
  display text.

## User Flow

### Quick Configure To Managed Site

1. User clicks the "configure to managed site" action in add-account mode.
2. `AccountDialog` verifies managed-site configuration. If missing, show the
   existing managed-site configuration prompt and do not save.
3. The account is saved with background auto-provisioning skipped.
4. The workflow loads the saved display account.
5. The token helper checks for an existing token or creates one as needed.
6. AIHubMix one-time secrets open `OneTimeApiKeyDialog` immediately.
7. Sub2API multi-group requirements open the existing `AddTokenDialog`.
8. The workflow calls `openWithAccount(displaySiteData, token, onSuccess)`.
9. `ChannelDialog` opens with prefilled channel data for user review.

### AIHubMix

When AIHubMix creates a token and returns the full key, the workflow keeps that
token in React state or a ref only. After `OneTimeApiKeyDialog` is closed, the
same token is passed to `ChannelDialog`.

If AIHubMix does not return a full usable key, the workflow stops with an
actionable message. It should not perform a follow-up token-list fetch and use a
masked key for managed-site export.

### Sub2API

When Sub2API has no token, the workflow resolves available groups:

- one group: create with that group;
- multiple groups: ask the user through the existing `AddTokenDialog`;
- no groups: stop with the existing no-valid-group message.

After the user creates a Sub2API token through the dialog, the workflow resumes
with the created token or by reloading the token list, matching existing
dialog behavior.

### Cancellation

Canceling one of the follow-up dialogs stops only the follow-up workflow. The
account and any created token remain. The UI should present this as
configuration incomplete, not account-save failure.

## Error Handling

- Account save failure: show the existing save failure behavior.
- Managed-site config missing before save: use the existing configuration
  prompt and avoid saving.
- Saved account cannot be loaded: stop with `SavedAccountNotFound`.
- AIHubMix full secret unavailable: stop with `TokenSecretUnavailable`.
- Sub2API no valid group: stop with the existing Sub2API blocked message.
- User cancellation: stop without an error toast; show a lightweight
  "configuration not completed" message if needed.
- Unexpected exceptions: show a sanitized operation failure and log sanitized
  diagnostics.

## Testing Plan

### Token Workflow Tests

Add or extend tests around the token workflow helper:

- returns `Ready` for existing tokens;
- creates default tokens for ordinary accounts;
- creates AIHubMix default token and marks it as one-time when the full key is
  returned;
- blocks AIHubMix when the create result does not include a usable full key;
- resolves Sub2API one-group creation with the selected group in the request;
- returns Sub2API selection-required for multiple groups;
- blocks Sub2API when no valid groups are available.

### AccountDialog Workflow Tests

Extend `useAccountDialog.saveAndAutoConfig` coverage:

- AIHubMix add + quick configure saves the account, creates a full token, shows
  the one-time key dialog, then opens `ChannelDialog`.
- AIHubMix without a full create secret saves the account but does not open
  `ChannelDialog`.
- Sub2API multi-group flow opens the group-selection dialog and resumes channel
  setup after token creation.
- Quick configure skips background `autoProvisionKeyOnAccountAdd`.
- Managed-site missing config blocks before account save, preserving existing
  behavior.

### ChannelDialog Regression Test

Ensure `openWithAccount(account, token)` does not call token creation helpers
again when a token was already provided by the foreground workflow.

### Validation

Minimum expected validation after implementation:

- related Vitest tests for touched workflow and dialog files;
- `pnpm run validate:staged`;
- `pnpm run i18n:extract:ci` if translation keys are added or changed.

## E2E Decision

Do not add Playwright E2E coverage by default. This workflow is primarily hook
and dialog orchestration with mocked API services, which Vitest can cover more
directly and deterministically. Reconsider E2E only if implementation changes
browser-extension runtime messaging, cross-entrypoint behavior, or another
real-browser boundary not covered by component tests.

## Context

The implemented branch hardens Sub2API token creation at the shared helper boundary and then reuses that shared decision in every user-triggered "I need a token now" entrypoint.

The main reuse points are:

- `generateDefaultTokenRequest()` in `src/services/accounts/accountKeyAutoProvisioning/ensureDefaultToken.ts`
  This remains the canonical default token payload for supported sites and also seeds the constrained Sub2API create-dialog prefills.
- `ensureDefaultApiTokenForAccount()` in `src/services/accounts/accountKeyAutoProvisioning/ensureDefaultToken.ts`
  This background-safe helper now rejects implicit Sub2API default-token creation instead of attempting to create an ungrouped key.
- `ensureAccountApiToken()` in `src/services/accounts/accountOperations.ts`
  This shared ensure helper remains the narrowest place to block silent Sub2API creation unless a resolved valid group is supplied by the caller.
- `resolveSub2ApiQuickCreateResolution()` in `src/services/accounts/accountOperations.ts`
  This new shared decision helper loads current upstream groups and returns one of three states: `ready`, `selection_required`, or `blocked`.
- `AddTokenDialog` in `src/features/KeyManagement/components/AddTokenDialog`
  This is still the explicit group-aware creation UI, but in the implemented branch it is often opened as a constrained variant with `allowedGroups`, a default token name, and a user-facing notice.
- `useCopyKeyDialog()` and `CopyKeyDialog`
  These keep local dialog state so the empty-state flow can auto-use a single valid group or open the constrained Add Token dialog when multiple groups are available.
- `KiloCodeExportDialog`
  This uses the same resolution helper and local constrained Add Token dialog, then reloads and reselects the created token for export.
- `useChannelDialog()`, `ChannelDialogContext`, and `ChannelDialogContainer`
  These provide a global Sub2API token-dialog orchestration path so managed-site channel import, post-save account flows, and repair follow-up actions can all reuse the same constrained Add Token dialog and resume their original action after success.
- `RepairMissingKeysDialog`
  This still treats Sub2API as ineligible for background repair, but it now offers an explicit create-key follow-up action for skipped Sub2API accounts.
- `useAccountDialog()`
  After saving a Sub2API account, this can launch the same global Sub2API token creation flow when the saved account still has no keys, while allowing downstream callers to suppress that prompt when they need to continue another save-driven flow first.

## Goals / Non-Goals

**Goals:**
- Prevent the extension from silently creating ungrouped Sub2API keys from shared default-token helpers.
- Ensure every implemented Sub2API quick-create entrypoint resolves the current valid upstream group set before creating a key.
- Reuse the existing Add Token dialog as the visible explicit-selection surface instead of inventing a new Sub2API-only form.
- Preserve one-click behavior when the current valid Sub2API group set has exactly one entry after the user triggers creation.
- Preserve current behavior for non-Sub2API sites.
- Preserve the existing skip-only semantics for automatic Sub2API account-add provisioning and background repair.
- Allow user-triggered follow-up flows to resume after a constrained Sub2API token dialog succeeds.

**Non-Goals:**
- Changing upstream Sub2API group semantics or assuming any deployment-specific default group.
- Auto-migrating previously created ungrouped Sub2API keys.
- Reworking the entire token-management UI for all sites.
- Changing unrelated model-limit, quota, or auth-refresh semantics.

## Decisions

### Decision: Guard implicit Sub2API creation at shared helper boundaries

`ensureDefaultApiTokenForAccount()` and `ensureAccountApiToken()` both treat `siteType === "sub2api"` as unsafe for implicit default-token creation unless the caller already resolved a valid group.

Why:
- This blocks the bad behavior at the narrowest shared abstraction.
- Future call sites inherit the safety rule automatically.

Alternatives considered:
- Patch only current UI call sites.
  Rejected because future callers could still recreate the bug.
- Guess a fallback group inside the Sub2API adapter.
  Rejected because group choice affects routing and must stay explicit.

### Decision: Centralize quick-create state in a reusable Sub2API resolution helper

`resolveSub2ApiQuickCreateResolution()` is the shared way to interpret current upstream groups for user-triggered bootstrap flows.

Why:
- Copy Key, KiloCode export, managed-site channel import, account save, and repair follow-up all need the same ready / selection-required / blocked decision.
- A single helper keeps user-facing failure semantics aligned across entrypoints.

Alternatives considered:
- Fetch groups independently inside each UI surface.
  Rejected because it duplicates decision logic and risks drift.

### Decision: Reuse constrained Add Token dialogs for explicit group choice

When multiple valid groups exist, the implemented branch opens `AddTokenDialog` with a constrained `allowedGroups` list, a default token prefill, and a notice explaining why explicit selection is required.

Why:
- The existing token dialog already handles Sub2API group loading and submission.
- Constraining the dialog avoids inventing another group-selection form while still keeping choice visible.
- The same dialog contract works both for local modal flows and global follow-up flows.

Alternatives considered:
- Open the full unconstrained token form everywhere.
  Rejected because the implemented branch intentionally narrows the multi-group flow to the current valid groups and the default-token bootstrap use case.
- Create a lightweight group picker modal.
  Rejected because it would duplicate dialog lifecycle and submission behavior already available in Add Token dialog.

### Decision: Use local dialog state for local flows and global dialog orchestration for resumable flows

Copy Key and KiloCode export keep their constrained dialog state locally. Managed-site channel import, post-save account flows, and repair follow-up actions route through `ChannelDialogContext` so they can resume their original workflow after token creation succeeds.

Why:
- Local flows can refresh themselves directly with minimal plumbing.
- Resumable flows need a shared callback-based orchestration point after the token dialog closes.

Alternatives considered:
- Move every flow into the global dialog context.
  Rejected because the simpler local flows do not need that extra coordination.
- Keep all flows local.
  Rejected because managed-site channel import and post-save flows need shared resume callbacks.

### Decision: Keep automatic Sub2API repair skipped, but add explicit manual follow-up

Background auto-provision and repair remain unchanged for Sub2API: they skip instead of creating a key. The manual repair UI now exposes an explicit create action for the skipped result so the user can opt into the group-aware flow.

Why:
- It preserves the safety rule that Sub2API creation must stay user-triggered.
- It reduces dead-end UX after a skip without reintroducing silent creation.

Alternatives considered:
- Remove all repair affordances for skipped Sub2API accounts.
  Rejected because it leaves the user without an in-context recovery path.

## Risks / Trade-offs

- [Risk] The implemented change now spans several entrypoints, so dialog orchestration is split between local state and global context. -> Mitigation: keep the shared decision helper and constrained Add Token contract identical across both paths.
- [Risk] Users with multiple Sub2API groups now see an extra explicit dialog in more places. -> Mitigation: preserve the single-group fast path and use clear notices only when selection is truly required.
- [Risk] Future token bootstrap entrypoints could bypass the shared resolver. -> Mitigation: the shared helper boundary still rejects implicit Sub2API creation without a resolved group.

## Migration Plan

- No data migration is required.
- Existing Sub2API accounts and keys remain stored as-is.
- Existing ungrouped Sub2API keys remain untouched.
- Rollout is extension-only: once shipped, new user-triggered Sub2API bootstrap flows require either a single resolved group or an explicit visible group choice.

## Open Questions

- Should a follow-up change remove the generic empty-group compatibility normalization for Sub2API tokens elsewhere, or is create-time hardening sufficient for now?
- Should the local Copy Key and KiloCode constrained dialog wiring eventually be consolidated behind the same global orchestration used by managed-site and account-save flows?

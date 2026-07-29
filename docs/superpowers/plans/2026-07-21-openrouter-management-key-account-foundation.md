# OpenRouter Management Key Account Foundation Scope-Reduction Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Complete the accepted 2026-07-27 full-`src` scope correction: keep strict OpenRouter Management Key validation and best-effort automatic creation while removing cross-dialog recovery, OpenRouter-only generic abstractions, and shared temporary-window lifecycle changes.

**Architecture:** Generic account detection/completion remains detected-only with its current result requirements and fallback behavior. An OpenRouter-local onboarding/provisioning coordinator owns create, cancel, certainty, dialog-local recovery, Clerk metadata, credential validation, and save preparation. Management Keys remain `AuthTypeEnum.AccessToken` (`"access_token"`); generic temporary-window cleanup retains one best-effort browser-handle removal; ordinary CRUD/dedupe behavior remains generic and local-only.

**Tech Stack:** TypeScript, React, WXT browser-extension runtime messaging, Vitest, Testing Library, Playwright, pnpm.

---

## Status And Source Of Truth

Tasks 1-7 below were implemented as the first scope-reduction pass. They are a
historical record, not an active checklist. In particular, their cross-dialog
created-key handoff, caller-selected two-close retry, generic credential
capability, and other conflicting instructions are superseded.

Tasks 8-14 are the active continuation for the accepted 2026-07-27 full-`src`
audit. Do not reopen or mark the historical Tasks 1-7; execute the new tasks in
order and use the corrected design as the source of truth.

The single approved design is
`docs/superpowers/specs/2026-07-17-openrouter-management-key-account-foundation-design.md`.

Before every active task:

1. Run `git status --porcelain` and preserve unrelated work and index state.
2. Read the listed implementation and test files before editing.
3. Add or change the focused test first, prove the intended failure, then make
   the smallest implementation change.
4. Re-run the task's focused tests after implementation.
5. If the task removes/renames a module or changes imports, exports, contracts,
   or shared types, run `pnpm compile` after focused tests and before staging.
6. Stage only that task's files and inspect the staged names/diff.
7. Run `pnpm run validate:staged` while that task diff is staged.
8. Commit only after the focused tests, conditional compile, and staged
   validation pass.

This sequence applies independently to each executable Task 8-13. It also
applies to any integration correction committed in Task 14. A later task's
`validate:staged` is evidence only for that task's staged diff; it does not
retroactively validate earlier commits and is not a full TypeScript import/
export/type-graph check. Run the conditional compile even when staged
validation is green.

## Active 2026-07-27 Correction Tasks

### Task 8: Localize Onboarding And Provider Transport

**Files:**

- Modify: `src/services/accounts/accountOperations.ts`
- Modify: `src/services/apiAdapters/openrouter/accountProvisioning.ts`
- Modify: `src/services/apiAdapters/openrouter/types.ts`
- Modify: `src/services/apiAdapters/openrouter/managementKeyPageContract.ts`
- Create: `src/services/apiAdapters/openrouter/managementKeyActionClient.ts`
- Modify: `src/constants/openRouterBootstrap.ts`
- Modify: `src/constants/runtimeActions.ts`
- Modify: `src/entrypoints/background/openrouter/managementKeyAction.ts`
- Modify: `src/entrypoints/background/runtimeMessages.ts`
- Modify: `src/entrypoints/content/messageHandlers/index.ts`
- Modify: `src/entrypoints/content/messageHandlers/handlers/openRouterManagementKey.ts`
- Modify: `src/entrypoints/content/messageHandlers/openrouter/managementKeyPage.ts`
- Modify: `src/types/tempWindowFetch.ts`
- Modify: `src/utils/browser/tempWindowFetch.ts`
- Inspect and modify only if required to restore the detected-only boundary:
  `src/services/apiAdapters/contracts/accountCompletion.ts`
- Inspect and modify only if required to remove OpenRouter lifecycle residue:
  `src/services/apiAdapters/contracts/accountBootstrap.ts`
- Test: `tests/services/accountOperations.autoDetectAccount.test.ts`
- Test: `tests/services/apiAdapters/openrouter/accountProvisioning.test.ts`
- Test: `tests/services/apiAdapters/openrouter/managementKeyPageContract.test.ts`
- Test: `tests/services/apiAdapters/openrouter/managementKeyActionClient.test.ts`
- Test: `tests/constants/openRouterBootstrap.test.ts`
- Test: `tests/utils/runtimeActions.test.ts`
- Test: `tests/entrypoints/background/openRouterManagementKeyAction.test.ts`
- Test: `tests/entrypoints/background/openRouterManagementKeyActionPort.test.ts`
- Test: `tests/entrypoints/background/runtimeMessages.more.test.ts`
- Test: `tests/entrypoints/content/messageHandlers/handlers/openRouterManagementKey.test.ts`
- Test: `tests/entrypoints/content/messageHandlers/openrouter/managementKeyPage.test.ts`
- Test: `tests/utils/tempWindowFetch.background.test.ts`

- [ ] **Step 1: Add boundary tests first**

Assert that the canonical OpenRouter branch calls one OpenRouter-local
onboarding/provisioning coordinator, while generic completion stays
detected-only. Preserve the current completion result requirements and fallback
behavior; do not introduce partial detection or provider lifecycle result
unions.

Add source/contract assertions that generic `tempWindowFetch` types and client
no longer export OpenRouter create/cancel requests, results, mutation states,
or page-action clients. Provider background/content code must share those
types through an OpenRouter-local module.

- [ ] **Step 2: Run the focused tests and observe the audited conflict**

```powershell
pnpm exec vitest run `
  tests/services/accountOperations.autoDetectAccount.test.ts `
  tests/services/apiAdapters/openrouter/accountProvisioning.test.ts `
  tests/services/apiAdapters/openrouter/managementKeyPageContract.test.ts `
  tests/services/apiAdapters/openrouter/managementKeyActionClient.test.ts `
  tests/constants/openRouterBootstrap.test.ts `
  tests/utils/runtimeActions.test.ts `
  tests/entrypoints/background/openRouterManagementKeyAction.test.ts `
  tests/entrypoints/background/openRouterManagementKeyActionPort.test.ts `
  tests/entrypoints/background/runtimeMessages.more.test.ts `
  tests/entrypoints/content/messageHandlers/handlers/openRouterManagementKey.test.ts `
  tests/entrypoints/content/messageHandlers/openrouter/managementKeyPage.test.ts `
  tests/utils/tempWindowFetch.background.test.ts
```

At least one new assertion should fail against the pre-correction boundary. If
the branch already satisfies an assertion, record that evidence and do not
manufacture a failure.

- [ ] **Step 3: Move transport and route the coordinator**

Move OpenRouter create/cancel transport types and client calls out of
`src/types/tempWindowFetch.ts` and `src/utils/browser/tempWindowFetch.ts`.
Keep the generic facade limited to operations used by generic temporary-window
consumers. Route only the canonical OpenRouter onboarding branch to the local
coordinator.

Do not add `kind`, `mode`, provisioning outcome unions, cancellation, Clerk,
or recovery to `AccountCompletionCapability` or `AccountBootstrapCapability`.
Preserve real multi-adapter seams and current detected result requirements.

- [ ] **Step 4: Re-run the focused tests and scan the boundary**

Run the Step 2 command, then:

```powershell
rg -n "OpenRouter.*(Create|Cancel|Mutation|Provision)|AccountCompletionOutcome|bootstrapExecution" src/types/tempWindowFetch.ts src/utils/browser/tempWindowFetch.ts src/services/apiAdapters/contracts
rg -n "TempWindowOpenRouterManagementKey|OpenRouterManagementKeyOperation|tempWindowOpenRouterManagementKeyAction|cancelTempWindowOpenRouterManagementKeyAction" src tests
```

Expected: no OpenRouter lifecycle in generic transport/capability contracts;
remaining matches are owned by OpenRouter-local modules, the shared runtime
action registry, their direct routing sites, or focused tests.

- [ ] **Step 5: Compile, stage, validate, and commit Task 8**

Run this after the focused tests:

```powershell
pnpm compile
```

After it passes, stage the exact changed paths from the Task 8 Files list,
including deletions, with `git add --`; never stage by directory or stage
unrelated files. Then run:

```powershell
git diff --cached --name-status
pnpm run validate:staged
git commit -m "refactor(openrouter): localize onboarding transport"
```

### Task 9: Make Cancellation Certainty Accurate And Recovery Dialog-Local

**Files:**

- Modify: `src/constants/openRouterBootstrap.ts`
- Modify: `src/entrypoints/background/openrouter/managementKeyAction.ts`
- Modify: `src/entrypoints/background/runtimeMessages.ts`
- Modify: `src/services/apiAdapters/openrouter/managementKeyPageContract.ts`
- Modify: `src/services/apiAdapters/openrouter/types.ts`
- Modify: `src/services/apiAdapters/openrouter/managementKeyActionClient.ts`
- Modify: `src/services/apiAdapters/openrouter/accountProvisioning.ts`
- Modify: `src/services/accounts/accountOperations.ts`
- Modify: `src/features/AccountManagement/components/AccountDialog/hooks/useAccountDialog.ts`
- Modify: `src/features/AccountManagement/components/AccountDialog/index.tsx`
- Delete or reduce to a dialog-local helper:
  `src/features/AccountManagement/components/AccountDialog/openRouterCreatedRecoveryHandoff.ts`
- Modify when copy changes: `src/locales/en/accountDialog.json`
- Modify when copy changes: `src/locales/es-419/accountDialog.json`
- Modify when copy changes: `src/locales/ja/accountDialog.json`
- Modify when copy changes: `src/locales/vi/accountDialog.json`
- Modify when copy changes: `src/locales/zh-CN/accountDialog.json`
- Modify when copy changes: `src/locales/zh-TW/accountDialog.json`
- Test: `tests/constants/openRouterBootstrap.test.ts`
- Test: `tests/entrypoints/background/openRouterManagementKeyAction.test.ts`
- Test: `tests/entrypoints/background/runtimeMessages.more.test.ts`
- Test: `tests/services/apiAdapters/openrouter/managementKeyPageContract.test.ts`
- Test: `tests/services/apiAdapters/openrouter/managementKeyActionClient.test.ts`
- Test: `tests/services/apiAdapters/openrouter/accountProvisioning.test.ts`
- Test: `tests/services/accountOperations.autoDetectAccount.test.ts`
- Test: `tests/features/AccountManagement/hooks/useAccountDialog.openrouter.test.tsx`
- Test: `tests/features/AccountManagement/components/AccountDialog.test.tsx`
- Test: `tests/features/AccountManagement/components/openRouterCredentialCopy.test.ts`

- [ ] **Step 1: Add background-to-account-operation cancellation contract tests first**

Replace the boolean cancellation contract with a discriminated OpenRouter-local
certainty result:

- `{ certainty: "known", requestId, cancellationAccepted, mutationState, ... }`
  carries the background's exact `mutationState`: `not_dispatched`,
  `dispatched_unconfirmed`, or `created`. A recognizable `label` is allowed only
  for `dispatched_unconfirmed` or `created` when that evidence is available; it
  is absent for `not_dispatched`.
- `{ certainty: "unknown", requestId, cancellationAccepted? }` carries
  `cancellationAccepted` only when acceptance itself is known. Its type and
  runtime value must not contain `mutationState` or `label`.

Assert the discriminated contract through the background action,
runtime-message response, action client, account provisioning, and
`cancelAccountAutoDetect` boundary.

`cancellationAccepted` means only that the background recorded the cancellation
request. It does not claim that a dispatched browser mutation or remote request
was aborted. Lock down this truth table:

| Situation | `cancellationAccepted` | Certainty and evidence |
| --- | --- | --- |
| Active before create dispatch | `true` | known `not_dispatched`, no label |
| Active after create dispatch | `true` | known `dispatched_unconfirmed`, with the available recognizable label |
| Retained completed summary in any state | `false` | known exact retained state; label only for `dispatched_unconfirmed` or `created` when retained |
| Unseen valid request | `true` | unknown, because the bounded pre-cancel marker was recorded |
| Repeated already-pre-cancelled request | `true` | unknown |
| Evicted completed request | `true` | indistinguishable from unseen; record a new pre-cancel marker and return unknown |
| Malformed or missing request, runtime rejection, or transport timeout | omitted | upper normalized result is unknown with no state or label |

Cover every row, including retained completed summaries for actual `created`,
`dispatched_unconfirmed`, and `not_dispatched` results. A transport failure,
timeout, missing result, unknown request, or evicted summary must not be promoted
to `dispatched_unconfirmed` or `created` by a caller.

Keep this result and its state tracking inside the OpenRouter provisioning path.
Do not change generic partial auto-detect completion, fallback behavior, or the
semantics of other site types.

- [ ] **Step 2: Run the cancellation tests and verify failure**

```powershell
pnpm exec vitest run tests/constants/openRouterBootstrap.test.ts tests/entrypoints/background/openRouterManagementKeyAction.test.ts tests/entrypoints/background/runtimeMessages.more.test.ts tests/services/apiAdapters/openrouter/managementKeyPageContract.test.ts tests/services/apiAdapters/openrouter/managementKeyActionClient.test.ts tests/services/apiAdapters/openrouter/accountProvisioning.test.ts tests/services/accountOperations.autoDetectAccount.test.ts
```

- [ ] **Step 3: Implement the discriminated OpenRouter cancellation result**

Make the background action the authority for known mutation certainty. Replace
the existing completed-ID set with an insertion-ordered, sanitized
completed-summary map in `managementKeyAction.ts`. Reuse the existing 128-entry
bound and evict the oldest entry on capacity + 1 while retaining newer entries.
Keep it in memory only: no timer, storage, or persistence.

The request ID is the map key. Each summary value is allowlisted to contain only
the exact `mutationState` and, for `dispatched_unconfirmed` or `created`, the
recognizable `label` when available. A completed source result that also contains
a plaintext key, credential, session identity, or other fields must produce the
same allowlisted summary shape with none of those fields. Add tests for all three
exact summary shapes: `{ mutationState: "not_dispatched" }`, and
`{ mutationState: "dispatched_unconfirmed" | "created", label? }` with no other
keys. Also test sanitization, capacity + 1 oldest eviction, newer-entry retention,
and unknown behavior after eviction.

Carry the discriminated result through the runtime handler, client, provisioning
service, and account operation. These lower layers must not start a wall-clock
timeout. They only validate/normalize malformed or missing responses, runtime
rejection, or a transport-supplied timeout rejection to `certainty: "unknown"`,
never a guessed state. Keep the bounded pre-cancel marker, at-most-once create
dispatch, single settlement, late-result isolation, and recognizable label.

- [ ] **Step 4: Add dialog close-deadline and state-transition tests first**

Assert that the Account Dialog close controller is the sole owner of one shared
wall-clock deadline for cancellation and provisioning settlement. Start the
deadline once, await cancellation only within its remaining budget, then await
provisioning only within the budget still remaining. Neither wait receives a
fresh full window, and background/client/provisioning/account-operation layers
must not add another timeout.

Cover these certainty decisions explicitly:

- a known `not_dispatched` result closes silently with no key reminder;
- only a known background/provider result of `dispatched_unconfirmed` or
  `created` may produce the matching manual reminder and recognizable label;
- if provisioning settles within the remaining budget, its result wins over
  cancellation evidence; specifically, known cancellation
  `dispatched_unconfirmed` followed by provisioning `created` produces only the
  created outcome;
- if provisioning does not settle within the budget, use known cancellation
  evidence; if neither source is known, close silently without inventing
  `dispatched_unconfirmed`;
- a cancellation promise that outlives the deadline cannot start a second wait
  or produce a reminder later;
- a real created result that arrives within the shared deadline remains owned by
  the current dialog, including the plaintext key needed to save it;
- a late result remains isolated from closed or replacement dialog state, and
  reconciliation emits at most one reminder.

Also cover a created plaintext key already held only by the current dialog.
Assert:

- normal save of that exact created key is silent;
- closing/abandoning the dialog shows one manual check/delete reminder with
  the recognizable label;
- re-detecting, switching credentials/site, or saving a different key shows
  the reminder once;
- no later dialog receives the plaintext key or reminder from a FIFO/queue;
- a repeated transition does not show the same reminder twice.

Keep the credential itself out of reminder copy, logs, and telemetry.

- [ ] **Step 5: Run the dialog tests and verify failure**

```powershell
pnpm exec vitest run tests/features/AccountManagement/hooks/useAccountDialog.openrouter.test.tsx tests/features/AccountManagement/components/AccountDialog.test.tsx tests/features/AccountManagement/components/openRouterCredentialCopy.test.ts
```

- [ ] **Step 6: Implement one-deadline close and current-dialog ownership**

Compute the single close deadline in the Account Dialog controller. Await the
cancellation promise against only the remaining budget, then reconcile the
provisioning promise against only the time still left. Prefer a provisioning
result settled within that deadline; otherwise use known cancellation evidence;
otherwise close silently. Invalidate both late continuations after this one
reconciliation so they cannot trigger a second wait, state update, or reminder.
Never infer `dispatched_unconfirmed` merely because either promise missed the
deadline. Treat `certainty: "unknown"` as no mutation evidence: do not manufacture
a state, label, or reminder.

Remove the cross-dialog FIFO/handoff. Store the created-but-unsaved credential,
recognizable label, and reminder-consumed state only in the live dialog
controller. Settle the reminder at the transition that abandons or replaces the
created key. Do not persist the key or attempt remote deletion.

- [ ] **Step 7: Preserve mutation certainty and cancellation**

Keep `not_dispatched`, `dispatched_unconfirmed`, and `created`; the pre-click
marker; one create dispatch; one settlement; cancellation before and after
dispatch; late-result isolation; and the recognizable label. Before dispatch,
known `not_dispatched` and unknown outcomes close silently. After dispatch, only
known `dispatched_unconfirmed` or `created` evidence may create a reminder, and
the reminder must reflect the exact background/provider certainty and available
label. Keep the current-dialog created-but-unsaved reminder and delete the
cross-dialog FIFO. Tests must show that simplifying recovery does not weaken
these invariants.

- [ ] **Step 8: Validate focused tests and translations**

Run both focused commands from Steps 2 and 5. If translation calls or locale
copy changed, also run:

```powershell
pnpm run i18n:extract:ci
```

- [ ] **Step 9: Compile, stage, validate, and commit Task 9**

After focused tests, compile because Task 9 changes background/runtime message,
provisioning, account-operation, hook, and module ownership contracts:

```powershell
pnpm compile
```

After it passes, stage only the exact changed paths from the Task 9 Files list,
including the handoff deletion and only locale files that actually changed.
Then run:

```powershell
git diff --cached --name-status
pnpm run validate:staged
git commit -m "fix(openrouter): preserve cancellation certainty"
```

### Task 10: Restore Existing Credential Model And Identity Rules

**Files:**

- Modify: `src/services/apiAdapters/openrouter/accountIdentity.ts`
- Modify: `src/services/apiAdapters/openrouter/accountProvisioning.ts`
- Modify: `src/services/apiAdapters/openrouter/index.ts`
- Delete: `src/services/apiAdapters/openrouter/accountCredential.ts`
- Delete: `src/services/apiAdapters/contracts/accountCredential.ts`
- Modify: `src/services/apiAdapters/contracts/siteTypeCapabilities.ts`
- Modify: `src/services/apiAdapters/registry.ts`
- Modify: `src/services/accounts/accountOperations.ts`
- Modify: `src/services/apiService/openrouter/index.ts`
- Modify: `src/features/AccountManagement/components/AccountDialog/AccountForm.tsx`
- Modify: `src/features/AccountManagement/components/AccountDialog/sitePolicy.ts`
- Modify: `src/features/AccountManagement/components/AccountDialog/hooks/useAccountDialog.ts`
- Modify: `src/entrypoints/content/messageHandlers/handlers/openRouterManagementKey.ts`
- Modify: `src/entrypoints/content/messageHandlers/openrouter/clerkSessionReader.ts`
- Modify: `src/entrypoints/content/messageHandlers/openrouter/clerkSessionProtocol.ts`
- Test: `tests/services/apiAdapters/openrouter/accountIdentity.test.ts`
- Test: `tests/services/apiAdapters/openrouter/accountProvisioning.test.ts`
- Test: `tests/services/accountOperations.autoDetectAccount.test.ts`
- Test: `tests/services/accountOperations.validateAndSaveAccount.test.ts`
- Test: `tests/services/accountOperations.test.ts`
- Test: `tests/services/apiAdapters/registry.test.ts`
- Test: `tests/services/apiService/openrouter/index.test.ts`
- Test: `tests/features/AccountManagement/components/AccountDialog/sitePolicy.test.ts`
- Test: `tests/features/AccountManagement/components/AccountDialogForm.test.tsx`
- Test: `tests/entrypoints/content/messageHandlers/handlers/openRouterManagementKey.test.ts`
- Test: `tests/entrypoints/content/messageHandlers/openrouter/clerkSessionReader.test.ts`
- Test: `tests/entrypoints/content/messageHandlers/openrouter/clerkSessionProtocol.test.ts`
- Test only if the main-world bridge setup seam changes:
  `tests/entrypoints/openrouterClerkSession.test.ts`

- [ ] **Step 1: Add credential and identity tests first**

Assert that Management Keys use `AuthTypeEnum.AccessToken` (`"access_token"`) and
`account_info.access_token`; OpenRouter site context selects Management Key
copy without `credentialKind: "openrouter_management_key"`.

For manual paste/save preparation, assert the fallback order is editable
non-empty user ID, validated `creator_user_id`, then the stable OpenRouter local
fallback. Username and user ID stay editable. `/api/v1/key` validation must
still prove `is_management_key === true` before save.

- [ ] **Step 2: Add Clerk timing tests first**

Keep the early Clerk read concurrent with the page create action. If that early
read settles empty or `undefined` and the page reports successful key creation,
perform exactly one fresh bounded Clerk read after success. Send the created
result regardless of whether that second read is missing, invalid, rejected,
timed out, or still empty; Clerk identity must never gate the created result,
validation, form population, or save.

Do not perform the fresh read when the early read produced identity, or when the
page result is `dispatched_unconfirmed`, `not_dispatched`, logged out, or any
other failure. Keep the reader and main-world protocol bounded, including
payload, request correlation, origin, path, and time limits.

Test the exact call counts and outcomes: one read for early identity; two reads
for early empty plus created; one read for early empty plus unconfirmed/failure;
and one created response with optional identity whether the fresh read succeeds,
returns empty, rejects, or reaches its existing bound.

- [ ] **Step 3: Run the focused suites and verify the conflicts**

```powershell
pnpm exec vitest run `
  tests/services/apiAdapters/openrouter/accountIdentity.test.ts `
  tests/services/apiAdapters/openrouter/accountProvisioning.test.ts `
  tests/services/accountOperations.autoDetectAccount.test.ts `
  tests/services/accountOperations.validateAndSaveAccount.test.ts `
  tests/services/accountOperations.test.ts `
  tests/services/apiAdapters/registry.test.ts `
  tests/services/apiService/openrouter/index.test.ts `
  tests/features/AccountManagement/components/AccountDialog/sitePolicy.test.ts `
  tests/features/AccountManagement/components/AccountDialogForm.test.tsx `
  tests/entrypoints/content/messageHandlers/handlers/openRouterManagementKey.test.ts `
  tests/entrypoints/content/messageHandlers/openrouter/clerkSessionReader.test.ts `
  tests/entrypoints/content/messageHandlers/openrouter/clerkSessionProtocol.test.ts `
  tests/entrypoints/openrouterClerkSession.test.ts
```

- [ ] **Step 4: Remove single-consumer credential abstractions**

Delete the generic `AccountCredentialCapability`, its
`SiteTypeCapabilities.account.credential` property, the OpenRouter capability
registration, and the UI-only `credentialKind` path after verifying OpenRouter
is their sole consumer. Move any still-needed validation data type to an
OpenRouter-local module. Update account operations, the OpenRouter API service,
the capability registry, and every direct test consumer together. Keep strict
validation in the OpenRouter account/onboarding module. Remove a now-empty
forwarder/module only when its behavior is fully represented by the remaining
OpenRouter seam.

The content handler owns Clerk orchestration: preserve the concurrent early read,
then perform one fresh bounded post-success read only when the early result was
empty or `undefined`. Never retry after an unconfirmed or failed page result, and
never turn missing Clerk identity into a failed or withheld created result.

Simplify only unnecessary Clerk replay/admission machinery. Keep reader/protocol
bounds and do not remove bounded validation or the create mutation's at-most-once
protections. If the main-world setup seam changes, update only its direct
entrypoint test, `tests/entrypoints/openrouterClerkSession.test.ts`; do not pull
generic WXT injection compatibility tests into this task.

- [ ] **Step 5: Re-run, compile, stage, validate, and commit**

Run the Step 3 command, then compile:

```powershell
pnpm compile
```

After it passes, stage only the exact changed paths from the Task 10 Files list,
including both deletions. Then run:

```powershell
git diff --cached --name-status
pnpm run validate:staged
git commit -m "refactor(openrouter): use existing credential model"
```

### Task 11: Restore One Best-Effort Browser Removal

**Files:**

- Modify: `src/entrypoints/background/tempWindowPool.ts`
- Modify: `src/entrypoints/background/openrouter/managementKeyAction.ts`
- Modify: `src/entrypoints/content/messageHandlers/openrouter/managementKeyPage.ts`
- Test: `tests/entrypoints/background/tempWindowPoolOpenClose.test.ts`
- Test: `tests/entrypoints/background/tempWindowPoolWindowFallback.test.ts`
- Test: `tests/entrypoints/background/openRouterManagementKeyAction.test.ts`
- Test: `tests/entrypoints/background/openRouterManagementKeyActionPort.test.ts`
- Test: `tests/entrypoints/content/messageHandlers/openrouter/managementKeyPage.test.ts`

- [ ] **Step 1: Add lifecycle tests first**

Assert that ordinary and OpenRouter temporary contexts each make one
best-effort browser-handle removal. A failed close still follows the existing
generic index/ownership/timer lifecycle and logging contract. Download-rule
cleanup behavior remains unchanged.

At the OpenRouter background port boundary, assert one normal force-close
release with no caller-selected `browserRemovalAttempts` property. The port must
use the shared default one-removal policy rather than selecting a retry count.

Assert that secret capture settles the result without clicking the page's DOM
Close control. Creation/page action is never retried by context release.

- [ ] **Step 2: Run the focused suites and verify failure**

```powershell
pnpm exec vitest run tests/entrypoints/background/tempWindowPoolOpenClose.test.ts tests/entrypoints/background/tempWindowPoolWindowFallback.test.ts tests/entrypoints/background/openRouterManagementKeyAction.test.ts tests/entrypoints/background/openRouterManagementKeyActionPort.test.ts tests/entrypoints/content/messageHandlers/openrouter/managementKeyPage.test.ts
```

- [ ] **Step 3: Revert the two-close design**

Remove caller-selected `browserRemovalAttempts`, OpenRouter's two-attempt
selection, and the unnecessary DOM Close click after capture. Do not replace
them with an OpenRouter branch inside `tempWindowPool`; use the same existing
one-removal path as other contexts.

- [ ] **Step 4: Re-run, compile, stage, validate, and commit**

Run the Step 2 command, then compile because Task 11 removes a shared release
option and changes its call sites:

```powershell
pnpm compile
```

After it passes, stage only the exact changed paths from the Task 11 Files list.
Then run:

```powershell
git diff --cached --name-status
pnpm run validate:staged
git commit -m "refactor(temp-window): restore shared close lifecycle"
```

### Task 12: Preserve Baseline Dedupe Display For Ordinary Sites

**Files:**

- Modify: `src/services/accounts/accountDedupe.ts`
- Modify: `src/features/AccountManagement/components/DedupeAccountsDialog/types.ts`
- Modify: `src/features/AccountManagement/components/DedupeAccountsDialog/DedupeAccountCard.tsx`
- Modify only as required by the same display contract:
  `src/features/AccountManagement/components/DedupeAccountsDialog/DedupeAccountsConfirmDetails.tsx`
- Test: `tests/services/accountDedupe.test.ts`
- Test: `tests/features/AccountManagement/components/DedupeAccountsDialog.test.tsx`
- Test: `tests/features/AccountManagement/components/DedupeAccountCard.test.tsx`
- Test: `tests/features/AccountManagement/components/DedupeAccountsConfirmDetails.test.tsx`

- [ ] **Step 1: Add positive and compatibility tests first**

Keep exact non-empty Management Key equality as the only OpenRouter duplicate
signal. Blank OpenRouter keys stay unscannable and different keys do not fall
back to editable user ID.

For representative ordinary sites, assert canonical-origin plus user-ID
grouping remains unchanged and each ordinary record's user ID is rendered even
when the group reason is `same_credential`. Secret-free group metadata must not
erase ordinary identity display.

At the direct `DedupeAccountCard` owner, add a regression assertion that a
representative ordinary `same_credential` group card renders each record's user
ID while neither the raw credential nor any credential-derived display value is
present.

- [ ] **Step 2: Run the focused tests and verify the regression**

```powershell
pnpm exec vitest run tests/services/accountDedupe.test.ts tests/features/AccountManagement/components/DedupeAccountsDialog.test.tsx tests/features/AccountManagement/components/DedupeAccountCard.test.tsx tests/features/AccountManagement/components/DedupeAccountsConfirmDetails.test.tsx
```

- [ ] **Step 3: Narrow the OpenRouter special case**

Keep exact-key comparison and secrecy rules inside the OpenRouter branch.
Restore baseline origin-plus-user-ID behavior and display fields for all other
site types. Do not expose any credential in group IDs, metadata, logs, or copy.

- [ ] **Step 4: Re-run, compile, stage, validate, and commit**

Run the Step 2 command, then compile because Task 12 changes shared dedupe
result/display types:

```powershell
pnpm compile
```

After it passes, stage only the exact changed paths from the Task 12 Files list.
Then run:

```powershell
git diff --cached --name-status
pnpm run validate:staged
git commit -m "fix(accounts): preserve ordinary dedupe identity"
```

### Task 13: Remove Residual Policy, Adapter, Logging, And Telemetry Complexity

**Candidate inventory; the recorded manifest owns scope:**

- Candidate source: `src/services/accounts/accountOperations.ts`
- Candidate source:
  `src/features/AccountManagement/components/AccountDialog/sitePolicy.ts`
- Candidate source:
  `src/features/AccountManagement/components/AccountDialog/hooks/useAccountDialog.ts`
- Candidate source: `src/services/apiAdapters/openrouter/index.ts`
- Candidate source: `src/services/apiAdapters/registry.ts`
- Candidate analytics source, only if the audit proves narrowing is required:
  `src/services/productAnalytics/actions.ts`
- Candidate analytics source, only if the audit proves narrowing is required:
  `src/services/productAnalytics/contracts.ts`
- Candidate analytics source, only if the audit proves narrowing is required:
  `src/services/productAnalytics/privacy.ts`
- Protected real seams: `src/services/apiAdapters/openrouter/accountData.ts`,
  `src/services/apiAdapters/openrouter/accountRefresh.ts`, and
  `src/services/apiService/openrouter/index.ts`
- Candidate tests:
  `tests/services/accountOperations.autoDetectAccount.test.ts`,
  `tests/services/accountOperations.test.ts`,
  `tests/features/AccountManagement/components/AccountDialog/sitePolicy.test.ts`,
  `tests/features/AccountManagement/hooks/useAccountDialog.openrouter.test.tsx`,
  `tests/services/apiAdapters/registry.test.ts`,
  `tests/services/productAnalytics/actions.test.ts`, and
  `tests/services/productAnalytics/privacy.test.ts`
- Required protected-contract tests:
  `tests/services/apiAdapters/accountDataAvailabilityConformance.test.ts` and
  `tests/services/apiService/openrouter/index.test.ts`

- [ ] **Step 1: Derive the branch diff and record the exact task manifest**

Use the branch merge-base, not a remembered commit:

```powershell
$branchBase = git merge-base origin/main HEAD
git diff --name-status "$branchBase...HEAD" -- src tests e2e
git diff --stat "$branchBase...HEAD" -- src tests e2e
```

Before editing, record an explicit Task 13 manifest in the worker's task notes.
It must list every task-owned source file, its matching focused test file(s),
and whether each path is modified or deleted. Start from the known candidates
above and add another path only when the branch diff links it to this cleanup.
The recorded manifest is the Task 13 ownership boundary and staging allowlist;
do not edit a source path without adding its behavior-level test ownership.

- [ ] **Step 2: Prove inbound ownership before deleting a module**

Run the broad seam scan:

```powershell
rg -n "apiAdapters/openrouter|openRouterCapabilities|RunAccountAutoDetect|OPENROUTER_BOOTSTRAP" src tests e2e
```

For every module considered for deletion, also run `rg -n` for its exact import
path and each exported symbol across `src`, `tests`, and `e2e`; record all
matches in the Task 13 manifest before deciding. A module with independent
behavior or a real multi-adapter consumer is not shallow residue.

The account-data and account-refresh adapters are protected real capability
seams. Their tests must continue to prove that `GET /api/v1/credits` derives
finite `total_credits - total_usage`, preserves a negative result, rejects
missing/non-number/non-finite/malformed operands, keeps every today-stat group
unavailable/unsupported, and preserves refresh success/failure health mapping.

- [ ] **Step 3: Add focused tests and make the telemetry decision**

Add focused regression tests first for every behavior-changing manifest entry.
Pure dead-module removal still requires the inbound-reference evidence from
Step 2; do not manufacture a failing test for deletion alone.

Retain only controlled OpenRouter attempt/result categories that answer a
concrete adoption, success, uncertain, cancellation, or failure question.
Remove unreachable cleanup/recovery fields and duplicate events. Never capture
URLs, labels, IDs, keys, cookies, user input, page text, selectors, backend
messages, or stacks. Keep the generic plaintext backup/export warning
unchanged.

Always run the protected data/refresh suites in addition to every focused test
recorded in the manifest:

```powershell
pnpm exec vitest run tests/services/apiAdapters/accountDataAvailabilityConformance.test.ts tests/services/apiService/openrouter/index.test.ts
```

- [ ] **Step 4: Apply only the manifested bounded cleanup**

Remove only manifested unused/derivable policy fields and proven behaviorless
forwarders. Restore manifested unrelated logging precisely. Do not broaden into
generic adapter/telemetry redesign or remove, inline, or bypass OpenRouter
account-data/account-refresh capabilities.

- [ ] **Step 5: Re-run tests, translations, and compile before staging**

Re-run every focused test in the recorded manifest plus the protected suites
from Step 3. If user-facing copy or a translation call changed, run
`pnpm run i18n:extract:ci`. Then compile because Task 13 may remove modules and
change imports/exports/contracts:

```powershell
pnpm compile
```

Do not stage before compile is green.

- [ ] **Step 6: Stage exactly the manifest, validate, and commit Task 13**

Stage each exact modified/deleted path recorded in the Task 13 manifest with
`git add --`; never stage the candidate directory or an unrecorded path. Compare
`git diff --cached --name-status` line by line with the manifest, then run:

```powershell
pnpm run validate:staged
git commit -m "refactor(openrouter): remove scope reduction residue"
```

### Task 14: Integration, Browser Compatibility, And Release Gates

**Files:**

- Modify only if current expectations encode superseded behavior:
  `e2e/accountOnboardingCommonFlows.spec.ts`
- Modify only for task-scoped failures: affected files from Tasks 8-13

- [ ] **Step 1: Scan for superseded contracts**

```powershell
rg -n "browserRemovalAttempts|credentialKind.*openrouter_management_key|AccountCredentialCapability|openRouterCreatedRecoveryHandoff|discardCreated|remoteCredentialId|OpenRouterBootstrapCleanup" src tests e2e
```

Expected: no production implementation of the superseded contracts. Investigate
test names and historical comments rather than deleting matches blindly.

- [ ] **Step 2: Run affected related tests**

```powershell
pnpm exec vitest related --run src/services/accounts/accountOperations.ts src/services/apiAdapters/openrouter/accountProvisioning.ts src/services/apiAdapters/openrouter/accountIdentity.ts src/services/apiAdapters/openrouter/managementKeyPageContract.ts src/entrypoints/background/openrouter/managementKeyAction.ts src/entrypoints/background/tempWindowPool.ts src/entrypoints/content/messageHandlers/openrouter/managementKeyPage.ts src/features/AccountManagement/components/AccountDialog/hooks/useAccountDialog.ts src/services/accounts/accountDedupe.ts
```

- [ ] **Step 3: Validate translations and the push-equivalent gate**

```powershell
pnpm run i18n:extract:ci
pnpm run validate:push
```

Every earlier implementation commit already ran `validate:staged` against its
own staged diff. Do not rerun it here and treat that as coverage for prior
commits; `validate:push` is the broad compile/Knip integration gate.

- [ ] **Step 4: Run deterministic browser compatibility checks**

```powershell
pnpm exec playwright test e2e/accountOnboardingCommonFlows.spec.ts --grep "OpenRouter"
pnpm build:firefox
```

The Chromium scenario proves deterministic extension wiring. The Firefox MV2
build proves build compatibility. Neither proves the current live OpenRouter
DOM, selectors, session state, or upstream response behavior.

- [ ] **Step 5: Inspect the final diff and invariants**

```powershell
git diff --check
$branchBase = git merge-base origin/main HEAD
git diff --check "$branchBase...HEAD"
git diff --stat "$branchBase...HEAD"
git status --porcelain
```

Confirm at-most-once mutation, accurate certainty, current-dialog-only secret
ownership, one-time manual reminder, strict Management Key validation, editable
identity fallback order, one browser removal, ordinary dedupe behavior, generic
backup warning, privacy-safe telemetry, and no remote delete. Also confirm the
registered account-data/refresh seams still call `GET /api/v1/credits`, derive
finite `total_credits - total_usage`, preserve a negative result, reject
malformed/non-finite totals, and expose today statistics as unavailable.

- [ ] **Step 6: Commit final integration-only corrections**

If Steps 1-5 required a task-scoped correction, run its focused tests, stage
only the exact integration-correction paths, inspect the staged diff, and run
`validate:staged` for that correction before committing:

If the integration correction removes/renames a module or changes imports,
exports, contracts, or shared types, run `pnpm compile` after focused tests and
before staging, as required by the common sequence.

```powershell
git diff --cached --name-status
pnpm run validate:staged
git commit -m "test(openrouter): validate final scope reduction"
```

Do not create an empty commit. After a correction commit, rerun
`validate:push`, the affected browser/build gate, the full branch diff check,
and any focused test whose implementation changed.

## Historical Implementation Record (Tasks 1-7)

Tasks 1-7 formed the implemented first scope-reduction pass. They are retained
only for commit traceability; none is an executable checklist. Where an earlier
choice conflicts with the final design or active Tasks 8-14, the final design
and active task take precedence.

### Historical Task 1: Localize Editable Identity And Stable Fallback

This task removed generic credential-owned identity/provenance, kept OpenRouter
username and user ID editable, separated save-time fallback resolution, and
preserved optional username policy for other site profiles.

Commits: `2c656086c`, `a493b14c7`, `6da038cee`.

### Historical Task 2: Remove Remote Management Key Discard

This task removed unreachable remote-delete/discard orchestration and clarified
manual Management Key guidance while retaining mutation certainty and
recognizable-label recovery.

Commits: `85a4641b6`, `eff6dfe4e`.

### Historical Task 3: Restore Generic Contracts And Localize Provisioning

This task restored detected-only generic completion/bootstrap boundaries and
moved OpenRouter creation/validation evidence toward provider-local ownership.

Commits: `d66fa4f81`, `90c51939b`.

### Historical Task 4: Bound Temporary-Window Close Attempts

This task introduced a caller-selected close retry in `d4e71f406`. The final
design and active Task 11 supersede that choice: OpenRouter returns to the same
single best-effort browser-handle removal as other temporary contexts.

Commit: `d4e71f406`.

### Historical Task 5: Simplify OpenRouter Duplicate Scanning

This task kept exact non-empty Management Key comparison and returned UI-owned
account records. Active Task 12 corrects its ordinary-site display regression
without changing the exact-key OpenRouter rule.

Commit: `c125913f1`.

### Historical Task 6: Centralize Canonical OpenRouter Origin

This task centralized exact canonical-origin recognition and rejected inherited
non-HTTPS or non-canonical origins.

Commits: `1ce40efac`, `72553f205`.

### Historical Task 7: Run First-Pass Integration Gates

This task completed the first focused/unit/integration gate pass. The broader
active Task 14 gates remain required after Tasks 8-13.

Commit: `2013b9c69`.

Subsequent first-pass hardening commits `e3924965d`, `dc326949b`,
`6d6fd7e84`, `4d343d0d3`, and `cc097f065` refined dialog recovery and the
page-action boundary. They remain implementation history, not authority for
cross-dialog recovery, shared close retries, or generic transport ownership.

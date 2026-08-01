# Protection Bypass Plain Intent Context Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use
> superpowers:subagent-driven-development (recommended) or
> superpowers:executing-plans to implement this plan task-by-task. Steps use
> checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the branch's stateful user-command grant system with a plain,
explicit execution context while preserving the shipped product rule:
automatic protection bypass may be disabled without blocking eligible explicit
commands.

**Architecture:** Workflow roots construct one immutable
`ProtectionBypassExecution` and existing service/message paths propagate it.
Every protected task enters one background Coordinator; the pool invokes the
Coordinator-owned authorization callback after scheduler admission and inside
the same-origin lock, immediately before reuse or creation. Grant registry,
lease, owner/sender binding, resource scope, verified continuation, and
duplicated task-level execution/source fields are removed.

**Tech Stack:** TypeScript, React, WXT, Manifest V3 service worker, browser
runtime messaging, Vitest, Testing Library, Playwright, i18next, pnpm.

**Design authority:**
`docs/superpowers/specs/2026-07-22-protection-bypass-intent-policy-design.md`

**Revision:** 2026-07-29. This plan supersedes the original grant-based content
previously stored at this path. Continue in the existing
`feat/protection-bypass-intent-policy` worktree; do not create a new branch or
worktree.

---

## File and Ownership Map

| Responsibility | Final owner |
| --- | --- |
| Closed runtime catalogs, execution/task contracts, command-to-feature and task metadata mappings | `src/services/protectionBypass/contracts.ts` |
| Pure execution constructors and callback convenience helper | `src/services/protectionBypass/client.ts` |
| Synchronous policy/capability/resource-fact evaluation | `src/services/protectionBypass/policy.ts` |
| Runtime boundary, current-state reads, acquire callback, error/telemetry orchestration | `src/entrypoints/background/protectionBypassCoordinator.ts` |
| Queueing, same-origin lock, browser context reuse/create, presentation mechanics | `src/entrypoints/background/tempWindowPool.ts` |
| Single protected runtime envelope | `src/entrypoints/background/runtimeMessages.ts` and `src/utils/browser/tempWindowFetch.ts` |
| Browser-facing request shapes | `src/types/tempWindowFetch.ts` |
| Bounded telemetry schema and privacy contract | `src/services/productAnalytics/contracts.ts`, `shieldBypassSummary.ts`, and `privacy.ts` |

Delete these Modules completely:

- `src/services/protectionBypass/grantRegistry.ts`
- `src/services/protectionBypass/verifiedContinuation.ts`
- `tests/services/protectionBypass/grantRegistry.test.ts`

The grant deletion, resource-scope deletion, and verified-continuation deletion
are one atomic task. Do not commit a half-state where plain execution still
depends on registry ownership or hidden-key reads still require a cached scope.

## Task 1: Centralize Closed Runtime Value Families

**Files:**

- Modify: `src/services/protectionBypass/contracts.ts`
- Modify: `src/services/protectionBypass/policy.ts`
- Modify: `src/services/protectionBypass/decisionErrorCode.ts`
- Modify: `src/services/productAnalytics/contracts.ts`
- Modify: `src/services/productAnalytics/shieldBypassSummary.ts`
- Modify: `src/entrypoints/background/protectionBypassCoordinator.ts`
- Modify: `src/entrypoints/background/tempWindowPool.ts`
- Create: `tests/services/protectionBypass/contracts.test.ts`
- Test: `tests/services/protectionBypass/policy.test.ts`
- Test: `tests/services/productAnalytics/shieldBypassSummary.test.ts`

- [ ] **Step 1: Add failing catalog and exhaustive-mapping tests**

Create `tests/services/protectionBypass/contracts.test.ts` with direct
wire-value assertions and derived task-metadata coverage. Import production
constants for branching assertions; keep literals only where the serialized
contract itself is under test.

```ts
import { describe, expect, it } from "vitest"

import {
  PROTECTION_BYPASS_CAPABILITY_KINDS,
  PROTECTION_BYPASS_DECISION_RESULTS,
  PROTECTION_BYPASS_DENIED_REASONS,
  PROTECTION_BYPASS_EXECUTION_KINDS,
  PROTECTION_BYPASS_EXECUTION_VERSION,
  TEMP_CONTEXT_TASK_KINDS,
  getTempContextTaskMetadata,
} from "~/services/protectionBypass/contracts"

describe("protection bypass runtime catalogs", () => {
  it("keeps the version and execution wire values stable", () => {
    expect(PROTECTION_BYPASS_EXECUTION_VERSION).toBe(1)
    expect(PROTECTION_BYPASS_EXECUTION_KINDS).toEqual({
      UserCommand: "user_command",
      Automatic: "automatic",
    })
  })

  it("owns all nine protected task kinds in one catalog", () => {
    expect(Object.values(TEMP_CONTEXT_TASK_KINDS)).toEqual([
      "api_fallback_fetch",
      "profile_isolated_fetch",
      "turnstile_fetch",
      "native_page_action",
      "openrouter_management_key_action",
      "rendered_title",
      "session_read",
      "new_api_session_read",
      "open_context",
    ])
  })

  it("keeps every task kind covered by metadata", () => {
    for (const kind of Object.values(TEMP_CONTEXT_TASK_KINDS)) {
      expect(getTempContextTaskMetadata({ kind })).toMatchObject({
        operation: expect.any(String),
        cause: expect.any(String),
      })
    }
  })

  it("exposes controlled decision, capability, and denial catalogs", () => {
    expect(Object.values(PROTECTION_BYPASS_DECISION_RESULTS)).toEqual([
      "allowed",
      "denied",
      "unavailable",
    ])
    expect(PROTECTION_BYPASS_CAPABILITY_KINDS.PermissionRequired).toBe(
      "permission_required",
    )
    expect(PROTECTION_BYPASS_DENIED_REASONS.OperationNotPermitted).toBe(
      "operation_not_permitted",
    )
  })
})
```

- [ ] **Step 2: Run the focused tests and verify RED**

Run:

```powershell
pnpm exec vitest run tests/services/protectionBypass/contracts.test.ts tests/services/protectionBypass/policy.test.ts tests/services/productAnalytics/shieldBypassSummary.test.ts
```

Expected: FAIL because the new catalogs and `TempContextTaskKind` export do not
exist, and analytics still owns duplicate invocation/decision values.

- [ ] **Step 3: Add the canonical catalogs and derive types/sets**

In `contracts.ts`, add these sources and replace the hand-maintained private
task-kind Set:

```ts
export const PROTECTION_BYPASS_EXECUTION_VERSION = 1 as const

export const PROTECTION_BYPASS_EXECUTION_KINDS = {
  UserCommand: "user_command",
  Automatic: "automatic",
} as const

export const TEMP_CONTEXT_TASK_KINDS = {
  ApiFallbackFetch: "api_fallback_fetch",
  ProfileIsolatedFetch: "profile_isolated_fetch",
  TurnstileFetch: "turnstile_fetch",
  NativePageAction: "native_page_action",
  OpenRouterManagementKeyAction: "openrouter_management_key_action",
  RenderedTitle: "rendered_title",
  SessionRead: "session_read",
  NewApiSessionRead: "new_api_session_read",
  OpenContext: "open_context",
} as const

export type TempContextTaskKind =
  (typeof TEMP_CONTEXT_TASK_KINDS)[keyof typeof TEMP_CONTEXT_TASK_KINDS]

export const PROTECTION_BYPASS_DECISION_RESULTS = {
  Allowed: "allowed",
  Denied: "denied",
  Unavailable: "unavailable",
} as const

export const PROTECTION_BYPASS_CAPABILITY_KINDS = {
  Available: "available",
  PermissionRequired: "permission_required",
  UnsupportedEnvironment: "unsupported_environment",
  AdapterUnavailable: "adapter_unavailable",
} as const

export const PROTECTION_BYPASS_DENIED_REASONS = {
  AutomaticDisabled: "automatic_disabled",
  FeatureDisabled: "feature_disabled",
  SurfaceDisabled: "surface_disabled",
  ManualFeatureDisabled: "manual_feature_disabled",
  MissingIntent: "missing_intent",
  InvalidOrExpiredGrant: "invalid_or_expired_grant",
  OperationNotPermitted: "operation_not_permitted",
  PermissionRequired: "permission_required",
  UnsupportedEnvironment: "unsupported_environment",
  PolicyUnavailable: "policy_unavailable",
} as const

export type ProtectionBypassDeniedReason =
  (typeof PROTECTION_BYPASS_DENIED_REASONS)[keyof typeof PROTECTION_BYPASS_DENIED_REASONS]

const TEMP_CONTEXT_TASK_KIND_SET = new Set<TempContextTaskKind>(
  Object.values(TEMP_CONTEXT_TASK_KINDS),
)

export function getTempContextTaskMetadata(
  task: Pick<TempContextTask, "kind">,
): TempContextTaskMetadata {
  return TEMP_CONTEXT_TASK_METADATA[task.kind]
}
```

Continue to reuse `PROTECTION_BYPASS_FEATURES`,
`PROTECTION_BYPASS_USER_COMMANDS`,
`PROTECTION_BYPASS_AUTOMATIC_TRIGGERS`,
`PROTECTION_BYPASS_OPERATIONS`, `PROTECTION_BYPASS_CAUSES`,
`TEMP_WINDOW_REQUEST_SOURCES`, `TEMP_CONTEXT_MODES`, and
`NEW_API_SESSION_READ_ACTIONS`. Do not duplicate them under new names.

- [ ] **Step 4: Replace production branching literals with the owner constants**

Use the catalogs in discriminated unions, parsers, switches, policy decisions,
error mapping, pool task switches, and summary result construction. In
`productAnalytics/contracts.ts`, remove the local
`PRODUCT_ANALYTICS_PROTECTION_BYPASS_INVOCATION_KINDS` and
`PRODUCT_ANALYTICS_PROTECTION_BYPASS_DECISIONS`; derive the dimensions from
`PROTECTION_BYPASS_EXECUTION_KINDS` and
`PROTECTION_BYPASS_DECISION_RESULTS`.

Keep the policy decision kind narrow:

```ts
export type ProtectionBypassDecisionKind = Exclude<
  (typeof PROTECTION_BYPASS_DECISION_RESULTS)[keyof typeof PROTECTION_BYPASS_DECISION_RESULTS],
  typeof PROTECTION_BYPASS_DECISION_RESULTS.Unavailable
>
```

- [ ] **Step 5: Run focused tests and verify GREEN**

Run the Step 2 command.

Expected: all catalog, policy, and summary tests PASS.

- [ ] **Step 6: Commit the behavior-preserving catalog slice**

```powershell
git add -- src/services/protectionBypass/contracts.ts src/services/protectionBypass/policy.ts src/services/protectionBypass/decisionErrorCode.ts src/services/productAnalytics/contracts.ts src/services/productAnalytics/shieldBypassSummary.ts src/entrypoints/background/protectionBypassCoordinator.ts src/entrypoints/background/tempWindowPool.ts tests/services/protectionBypass/contracts.test.ts tests/services/protectionBypass/policy.test.ts tests/services/productAnalytics/shieldBypassSummary.test.ts
pnpm run validate:staged
git commit -m "refactor(protection-bypass): centralize runtime contracts"
```

Expected: staged validation and commit hooks PASS.

## Task 2: Atomically Remove Grant, Lease, Scope, and Continuation State

**Files:**

- Modify: `src/services/protectionBypass/contracts.ts`
- Modify: `src/services/protectionBypass/client.ts`
- Modify: `src/services/protectionBypass/policy.ts`
- Modify: `src/services/protectionBypass/decisionErrorCode.ts`
- Modify: `src/services/productAnalytics/contracts.ts`
- Modify: `src/services/productAnalytics/shieldBypassSummary.ts`
- Delete: `src/services/protectionBypass/grantRegistry.ts`
- Delete: `src/services/protectionBypass/verifiedContinuation.ts`
- Modify: `src/entrypoints/background/protectionBypassCoordinator.ts`
- Modify: `src/entrypoints/background/runtimeMessages.ts`
- Modify: `src/constants/runtimeActions.ts`
- Modify: `src/components/dialogs/ChannelDialog/components/ChannelDialog.tsx`
- Modify: `src/features/AccountManagement/components/AccountActionButtons/index.tsx`
- Modify: `src/features/KeyManagement/KeyManagement.tsx`
- Modify: `src/features/ManagedSiteChannels/ManagedSiteChannels.tsx`
- Modify: `src/features/ManagedSiteModelSync/ManagedSiteModelSync.tsx`
- Modify: `src/features/ManagedSiteVerification/loadNewApiChannelKeyWithVerification.ts`
- Modify: `src/services/accounts/autoRefreshService.ts`
- Modify: `src/services/checkin/autoCheckin/scheduler.ts`
- Modify: `src/services/history/dailyBalanceHistory/scheduler.ts`
- Modify: `src/services/integrations/ldohSiteLookup/background.ts`
- Modify: `src/services/models/modelSync/scheduler.ts`
- Modify: `src/services/checkin/autoCheckin/messaging.ts`
- Modify: `src/features/AutoCheckin/AutoCheckin.tsx`
- Modify: `src/hooks/useAutoCheckinUiOpenPretrigger.ts`
- Create: `tests/services/protectionBypass/fixtures.ts`
- Rewrite: `tests/services/protectionBypass/client.test.ts`
- Delete: `tests/services/protectionBypass/grantRegistry.test.ts`
- Modify: `tests/services/protectionBypass/policy.test.ts`
- Modify: `tests/entrypoints/background/protectionBypassCoordinator.test.ts`
- Modify: `tests/entrypoints/background/protectionBypassCoordinator.defaultValidator.test.ts`
- Modify: `tests/entrypoints/background/runtimeMessages.test.ts`
- Modify: `tests/entrypoints/background/runtimeMessages.more.test.ts`
- Modify: `tests/utils/runtimeActions.test.ts`
- Modify: `tests/services/autoRefreshService.test.ts`
- Modify: `tests/services/autoCheckin/scheduler.test.ts`
- Modify: `tests/services/dailyBalanceHistory/scheduler.test.ts`
- Modify: `tests/services/ldohSiteLookup.background.test.ts`
- Modify: `tests/services/modelSync/messageHandler.test.ts`
- Modify: `tests/services/runtimeTypedMessagingSetup.test.ts`
- Modify: `tests/features/ManagedSiteModelSync/ManagedSiteModelSync.test.tsx`
- Modify: `tests/features/ManagedSiteVerification/loadNewApiChannelKeyWithVerification.test.ts`
- Modify: `tests/components/dialogs/ChannelDialog/ChannelDialog.advisoryWarning.test.tsx`
- Modify: `tests/features/AccountManagement/components/AccountActionButtons.test.tsx`
- Modify: `tests/entrypoints/options/pages/KeyManagement/KeyManagement.managedSiteStatusSupport.test.tsx`
- Modify: `tests/entrypoints/options/pages/ManagedSiteChannels/ManagedSiteChannels.test.tsx`
- Modify: `tests/services/productAnalytics/shieldBypassSummary.test.ts`
- Modify: `tests/entrypoints/options/AutoCheckinAccountActions.test.tsx`
- Modify: `tests/entrypoints/options/AutoCheckinQuickRun.test.tsx`
- Modify: `tests/entrypoints/options/BalanceHistory.test.tsx`
- Modify: `tests/entrypoints/options/pages/KeyManagement/useKeyManagement.test.tsx`
- Modify: `tests/features/AccountManagement/bookmarkImport/importAccounts.test.ts`
- Modify: `tests/features/AccountManagement/components/BookmarkAccountImportDialog.test.tsx`
- Modify: `tests/features/AccountManagement/hooks/AccountActionsContext.test.tsx`
- Modify: `tests/features/AccountManagement/hooks/AccountDataContext.test.tsx`
- Modify: `tests/features/AccountManagement/hooks/useAccountDialog.analytics.test.tsx`
- Modify: `tests/features/AccountManagement/hooks/useAccountDialog.currentTabDetection.test.tsx`
- Modify: `tests/features/AccountManagement/hooks/useAccountDialog.duplicateAccountWarning.test.tsx`
- Modify: `tests/features/AccountManagement/hooks/useAccountDialog.excludeFromTotalBalance.test.tsx`
- Modify: `tests/features/AccountManagement/hooks/useAccountDialog.openrouter.test.tsx`
- Modify: `tests/features/AccountManagement/hooks/useAccountDialog.redetectPreservesCustomData.test.tsx`
- Modify: `tests/features/AccountManagement/hooks/useAccountDialog.saveAndAutoConfig.test.tsx`
- Modify: `tests/features/AccountManagement/hooks/useAccountDialog.sub2apiConstraints.test.tsx`
- Modify: `tests/hooks/useAccountData.test.tsx`
- Modify: `tests/services/accountBrowserSession/sessionReader.test.ts`
- Modify: `tests/services/accountOperations.autoDetectAccount.test.ts`
- Modify: `tests/services/accounts/autoDetectCompletion/completion.test.ts`
- Modify: `tests/services/accountStorage.test.ts`
- Modify: `tests/services/apiAdapters/openrouter/accountProvisioning.test.ts`
- Modify: `tests/services/apiAdapters/openrouter/managementKeyActionClient.test.ts`
- Modify: `tests/services/apiService/sub2api/tokenResync.test.ts`
- Modify: `tests/services/apiService/voapiV2/tokenResync.test.ts`
- Modify: `tests/services/autoCheckin/providers/anyrouter.test.ts`
- Modify: `tests/services/autoCheckin/providers/newApi.test.ts`
- Modify: `tests/services/autoCheckin/providers/veloera.test.ts`
- Modify: `tests/services/autoCheckin/providers/voapiV2.test.ts`
- Modify: `tests/services/autoCheckin/providers/wong.test.ts`
- Modify: `tests/services/autoDetectService.test.ts`
- Modify: `tests/services/detectSiteType.fallback.test.ts`
- Modify: `tests/services/managedSites/providers/newApiSession.test.ts`
- Modify: `tests/services/newApiService/newApiService.test.ts`
- Modify: `tests/services/productAnalytics/privacy.test.ts`

- [ ] **Step 1: Write failing plain-execution and pure-client tests**

Replace lifecycle assertions in `client.test.ts` with observable pure-helper
behavior:

```ts
describe("withProtectionBypassUserCommand", () => {
  it("constructs plain command intent without runtime IO", async () => {
    const work = vi.fn().mockResolvedValue("saved")

    await expect(
      withProtectionBypassUserCommand(
        PROTECTION_BYPASS_USER_COMMANDS.RefreshAccount,
        PROTECTION_BYPASS_SURFACES.Options,
        work,
      ),
    ).resolves.toBe("saved")

    expect(work).toHaveBeenCalledWith({
      version: PROTECTION_BYPASS_EXECUTION_VERSION,
      kind: PROTECTION_BYPASS_EXECUTION_KINDS.UserCommand,
      command: PROTECTION_BYPASS_USER_COMMANDS.RefreshAccount,
      surface: PROTECTION_BYPASS_SURFACES.Options,
    })
  })

  it("preserves callback rejection", async () => {
    const failure = new Error("work failed")
    await expect(
      withProtectionBypassUserCommand(
        PROTECTION_BYPASS_USER_COMMANDS.AddAccount,
        PROTECTION_BYPASS_SURFACES.Popup,
        async () => {
          throw failure
        },
      ),
    ).rejects.toBe(failure)
  })

  it("shares one immutable execution across fan-out", async () => {
    await withProtectionBypassUserCommand(
      PROTECTION_BYPASS_USER_COMMANDS.RefreshAllAccounts,
      PROTECTION_BYPASS_SURFACES.Options,
      async (execution) => {
        const results = await Promise.all([
          Promise.resolve(execution),
          Promise.resolve(execution),
        ])
        expect(results[0]).toEqual(results[1])
      },
    )
  })
})
```

In `contracts.test.ts`, assert that the parser accepts a serialized clone of
`{ version, kind: "user_command", command, surface }` and rejects the old
`{ version: 1, kind: "user_command", grantId: "legacy" }`.

In `policy.test.ts`, replace resolved-grant fixtures with plain execution and
prove that command-to-feature plus the static feature-operation matrix still
returns `operation_not_permitted` for an incompatible task.

- [ ] **Step 2: Run the core tests and verify RED**

```powershell
pnpm exec vitest run tests/services/protectionBypass/contracts.test.ts tests/services/protectionBypass/client.test.ts tests/services/protectionBypass/policy.test.ts tests/entrypoints/background/protectionBypassCoordinator.test.ts tests/entrypoints/background/runtimeMessages.test.ts tests/entrypoints/background/runtimeMessages.more.test.ts
```

Expected: FAIL on the old `grantId` execution shape, begin/end messages,
registry resolution, and lifecycle behavior.

- [ ] **Step 3: Replace the execution contract and make the client pure**

Use this final execution contract:

```ts
export type ProtectionBypassExecution =
  | {
      version: typeof PROTECTION_BYPASS_EXECUTION_VERSION
      kind: typeof PROTECTION_BYPASS_EXECUTION_KINDS.UserCommand
      command: ProtectionBypassUserCommand
      surface: ProtectionBypassSurface
    }
  | {
      version: typeof PROTECTION_BYPASS_EXECUTION_VERSION
      kind: typeof PROTECTION_BYPASS_EXECUTION_KINDS.Automatic
      feature: ProtectionBypassFeature
      trigger: ProtectionBypassAutomaticTrigger
      surface: ProtectionBypassSurface
    }

export const PROTECTION_BYPASS_USER_COMMAND_FEATURES = {
  [PROTECTION_BYPASS_USER_COMMANDS.RefreshAccount]:
    PROTECTION_BYPASS_FEATURES.AccountRefresh,
  [PROTECTION_BYPASS_USER_COMMANDS.RefreshAllAccounts]:
    PROTECTION_BYPASS_FEATURES.AccountRefresh,
  [PROTECTION_BYPASS_USER_COMMANDS.RefreshDisabledAccounts]:
    PROTECTION_BYPASS_FEATURES.AccountRefresh,
  [PROTECTION_BYPASS_USER_COMMANDS.ManualCheckin]:
    PROTECTION_BYPASS_FEATURES.Checkin,
  [PROTECTION_BYPASS_USER_COMMANDS.RetryCheckinAccount]:
    PROTECTION_BYPASS_FEATURES.Checkin,
  [PROTECTION_BYPASS_USER_COMMANDS.AddAccount]:
    PROTECTION_BYPASS_FEATURES.AccountOnboarding,
  [PROTECTION_BYPASS_USER_COMMANDS.DetectAccount]:
    PROTECTION_BYPASS_FEATURES.AccountOnboarding,
  [PROTECTION_BYPASS_USER_COMMANDS.ReauthenticateAccount]:
    PROTECTION_BYPASS_FEATURES.AccountOnboarding,
  [PROTECTION_BYPASS_USER_COMMANDS.VerifyProtection]:
    PROTECTION_BYPASS_FEATURES.Verification,
} as const satisfies Record<ProtectionBypassUserCommand, ProtectionBypassFeature>
```

Delete lease durations, command allowed-operation arrays, resource-scope types,
resource-scope constructors/parsers, and lease-profile registrations. Retain
`NewApiChannelKeyResource` because the exact task target is still needed for
current-state validation.

Replace `client.ts` with pure constructors plus the convenience callback:

```ts
export { createAutomaticProtectionBypassExecution } from "./contracts"

export function createUserCommandProtectionBypassExecution(
  command: ProtectionBypassUserCommand,
  surface: ProtectionBypassSurface,
): Extract<
  ProtectionBypassExecution,
  { kind: typeof PROTECTION_BYPASS_EXECUTION_KINDS.UserCommand }
> {
  return {
    version: PROTECTION_BYPASS_EXECUTION_VERSION,
    kind: PROTECTION_BYPASS_EXECUTION_KINDS.UserCommand,
    command,
    surface,
  }
}

export async function withProtectionBypassUserCommand<T>(
  command: ProtectionBypassUserCommand,
  surface: ProtectionBypassSurface,
  work: (execution: ProtectionBypassExecution) => Promise<T>,
): Promise<T> {
  return await work(createUserCommandProtectionBypassExecution(command, surface))
}
```

In the denial catalog, replace `InvalidOrExpiredGrant` with `InvalidIntent`.
Relocate `INVALID_PROTECTION_BYPASS_EXECUTION_ERROR` from the deleted
continuation Module to `contracts.ts` so all five message listeners retain one
shared controlled error string.

In the analytics contract, replace the invalid-grant classification/count with
`invalid_intent` in the same atomic change. Task 4 adds `resource_stale` after
that denial exists in the policy contract.

`client.ts` must not import runtime actions, browser APIs, background
entrypoints, logger, clock, or cleanup helpers.

- [ ] **Step 4: Simplify policy and Coordinator resolution**

Delete registry injection, sender ownership helpers, verified-continuation
WeakMap, begin/end methods, expiry checks, resource-scope checks, and
`executionsMatch`.

Resolve execution synchronously:

```ts
function resolveProtectionBypassExecution(
  execution: unknown,
): ResolvedProtectionBypassExecution | ProtectionBypassIntentResolutionFailure {
  if (execution === undefined) {
    return {
      kind: "invalid",
      reason: PROTECTION_BYPASS_DENIED_REASONS.MissingIntent,
    }
  }
  if (!isProtectionBypassExecution(execution)) {
    return {
      kind: "invalid",
      reason: PROTECTION_BYPASS_DENIED_REASONS.InvalidIntent,
    }
  }
  if (execution.kind === PROTECTION_BYPASS_EXECUTION_KINDS.Automatic) {
    return execution
  }
  return {
    ...execution,
    feature: PROTECTION_BYPASS_USER_COMMAND_FEATURES[execution.command],
  }
}
```

The resolved user-command type contains `command`, `feature`, and `surface`
only. Policy validates task operations against
`PROTECTION_BYPASS_FEATURE_OPERATIONS[feature]`; it no longer checks
`execution.allowedOperations`.

Keep `executeTask({ execution, task }, sender, sendResponse)` temporarily for
this task, but ignore `sender` for intent/owner decisions. Task 3 removes
duplicated task intent and narrows the transport.

- [ ] **Step 5: Remove begin/end runtime actions and handlers**

Delete:

```ts
RuntimeActionIds.ProtectionBypassBeginUserCommand
RuntimeActionIds.ProtectionBypassEndUserCommand
```

Remove their branches from `runtimeMessages.ts`. Keep
`ProtectionBypassExecuteTask`. Update runtime-action tests so the canonical
action list no longer expects begin/end values.

- [ ] **Step 6: Remove all resource-scope callers without removing task resources**

At these six explicit-command roots, remove the fourth
`withProtectionBypassUserCommand` argument and the associated scope
constructor imports:

| Root | Final command context |
| --- | --- |
| `ChannelDialog.tsx` | `VerifyProtection`, current surface |
| `AccountActionButtons/index.tsx` | `VerifyProtection`, current surface |
| `KeyManagement.tsx` | `VerifyProtection`, current surface |
| `ManagedSiteChannels.tsx` | `VerifyProtection`, current surface |
| `ManagedSiteModelSync.tsx` | one shared `VerifyProtection` execution for the awaited batch |
| `loadNewApiChannelKeyWithVerification.ts` | `VerifyProtection`, supplied surface |

The final call shape is:

```ts
await withProtectionBypassUserCommand(
  PROTECTION_BYPASS_USER_COMMANDS.VerifyProtection,
  surface,
  async (execution) => await runVerification(execution),
)
```

Each `new_api_session_read` task must continue to carry its exact
`origin`, `userId`, and `channelId`. Delete only the cached batch/scope
registration.

- [ ] **Step 7: Remove verified continuation from all deferred listeners**

Delete imports and registration/release calls in:

- `autoRefreshService.ts`
- `autoCheckin/scheduler.ts`
- `dailyBalanceHistory/scheduler.ts`
- `ldohSiteLookup/background.ts`
- `modelSync/scheduler.ts`

At each message boundary, validate the serialized execution shape and the
expected workflow classification directly:

```ts
if (!isProtectionBypassExecution(data?.protectionBypassExecution)) {
  return { success: false, error: INVALID_PROTECTION_BYPASS_EXECUTION_ERROR }
}
```

Keep the existing command/feature checks such as
`isManualCheckinExecution(...)`; remove comparisons between
`execution.surface` and `sender.url`. Use `execution.surface` for the
legacy surface policy and presentation source.

In auto-checkin messaging, remove the duplicate message-level
`tempWindowRequestSource`. Update `AutoCheckin.tsx` and
`useAutoCheckinUiOpenPretrigger.ts` to send only the execution; automatic
execution already contains the originating surface.

Manual model sync no longer wraps work in `try/finally` to release identity.
It validates the execution once, awaits the existing batch, and returns its
result.

- [ ] **Step 8: Delete the state Modules and rewrite value-bearing tests**

Delete `grantRegistry.ts`, `verifiedContinuation.ts`, and
`grantRegistry.test.ts`.

Create `tests/services/protectionBypass/fixtures.ts`:

```ts
import {
  PROTECTION_BYPASS_EXECUTION_KINDS,
  PROTECTION_BYPASS_EXECUTION_VERSION,
  PROTECTION_BYPASS_SURFACES,
  type ProtectionBypassSurface,
  type ProtectionBypassUserCommand,
} from "~/services/protectionBypass/contracts"

export function userCommandExecution(
  command: ProtectionBypassUserCommand,
  surface: ProtectionBypassSurface = PROTECTION_BYPASS_SURFACES.Options,
) {
  return {
    version: PROTECTION_BYPASS_EXECUTION_VERSION,
    kind: PROTECTION_BYPASS_EXECUTION_KINDS.UserCommand,
    command,
    surface,
  } as const
}
```

Migrate grant fixtures in Coordinator, runtime, auto-refresh, auto-checkin,
daily balance, LDOH, model-sync, managed-site verification, and model-sync UI
tests to this helper.

Move only these valuable grant-test invariants:

- all commands map to the expected feature;
- a feature/task operation mismatch is denied;
- immutable execution supports concurrent fan-out;
- hidden-key origin/user/channel currentness is enforced by the default
  validator.

Delete expiry, revoke, restart invalidation, idempotent end, cleanup failure,
owner/sender binding, resource-scope membership, and lease-duration assertions
without replacement.

- [ ] **Step 9: Run the atomic grant-removal matrix and verify GREEN**

```powershell
pnpm exec vitest run tests/services/protectionBypass/contracts.test.ts tests/services/protectionBypass/client.test.ts tests/services/protectionBypass/policy.test.ts tests/entrypoints/background/protectionBypassCoordinator.test.ts tests/entrypoints/background/protectionBypassCoordinator.defaultValidator.test.ts tests/entrypoints/background/runtimeMessages.test.ts tests/entrypoints/background/runtimeMessages.more.test.ts tests/utils/runtimeActions.test.ts tests/services/autoRefreshService.test.ts tests/services/autoCheckin/scheduler.test.ts tests/services/dailyBalanceHistory/scheduler.test.ts tests/services/ldohSiteLookup.background.test.ts tests/services/modelSync/messageHandler.test.ts tests/services/runtimeTypedMessagingSetup.test.ts tests/features/ManagedSiteModelSync/ManagedSiteModelSync.test.tsx tests/features/ManagedSiteVerification/loadNewApiChannelKeyWithVerification.test.ts tests/components/dialogs/ChannelDialog/ChannelDialog.advisoryWarning.test.tsx tests/features/AccountManagement/components/AccountActionButtons.test.tsx tests/entrypoints/options/pages/KeyManagement/KeyManagement.managedSiteStatusSupport.test.tsx tests/entrypoints/options/pages/ManagedSiteChannels/ManagedSiteChannels.test.tsx tests/services/productAnalytics/shieldBypassSummary.test.ts
pnpm exec vitest run tests/entrypoints/options/AutoCheckinAccountActions.test.tsx tests/entrypoints/options/AutoCheckinQuickRun.test.tsx tests/entrypoints/options/BalanceHistory.test.tsx tests/entrypoints/options/pages/KeyManagement/useKeyManagement.test.tsx tests/features/AccountManagement/bookmarkImport/importAccounts.test.ts tests/features/AccountManagement/components/BookmarkAccountImportDialog.test.tsx tests/features/AccountManagement/hooks/AccountActionsContext.test.tsx tests/features/AccountManagement/hooks/AccountDataContext.test.tsx tests/features/AccountManagement/hooks/useAccountDialog.analytics.test.tsx tests/features/AccountManagement/hooks/useAccountDialog.currentTabDetection.test.tsx tests/features/AccountManagement/hooks/useAccountDialog.duplicateAccountWarning.test.tsx tests/features/AccountManagement/hooks/useAccountDialog.excludeFromTotalBalance.test.tsx tests/features/AccountManagement/hooks/useAccountDialog.openrouter.test.tsx tests/features/AccountManagement/hooks/useAccountDialog.redetectPreservesCustomData.test.tsx tests/features/AccountManagement/hooks/useAccountDialog.saveAndAutoConfig.test.tsx tests/features/AccountManagement/hooks/useAccountDialog.sub2apiConstraints.test.tsx tests/hooks/useAccountData.test.tsx tests/services/accountBrowserSession/sessionReader.test.ts tests/services/accountOperations.autoDetectAccount.test.ts tests/services/accounts/autoDetectCompletion/completion.test.ts tests/services/accountStorage.test.ts tests/services/apiAdapters/openrouter/accountProvisioning.test.ts tests/services/apiAdapters/openrouter/managementKeyActionClient.test.ts tests/services/apiService/sub2api/tokenResync.test.ts tests/services/apiService/voapiV2/tokenResync.test.ts tests/services/autoCheckin/providers/anyrouter.test.ts tests/services/autoCheckin/providers/newApi.test.ts tests/services/autoCheckin/providers/veloera.test.ts tests/services/autoCheckin/providers/voapiV2.test.ts tests/services/autoCheckin/providers/wong.test.ts tests/services/autoDetectService.test.ts tests/services/detectSiteType.fallback.test.ts tests/services/managedSites/providers/newApiSession.test.ts tests/services/newApiService/newApiService.test.ts tests/services/productAnalytics/privacy.test.ts
```

Expected: all listed tests PASS.

Run the deletion audit:

```powershell
rg -n "grantId|invalid_or_expired_grant|ProtectionBypassBeginUserCommand|ProtectionBypassEndUserCommand|verifiedContinuation|registerVerifiedContinuation|releaseVerifiedContinuation|ProtectionBypassResourceScope|createNewApiChannelKeyResourceScope|createManualModelSyncResourceScope|resourceScope:|leaseProfile|ManualModelSyncBatch" src
rg -l "grantId" tests
rg -n "invalid_or_expired_grant|ProtectionBypassBeginUserCommand|ProtectionBypassEndUserCommand|verifiedContinuation|registerVerifiedContinuation|releaseVerifiedContinuation|ProtectionBypassResourceScope|createNewApiChannelKeyResourceScope|createManualModelSyncResourceScope|resourceScope:|leaseProfile|ManualModelSyncBatch" tests
```

Expected: the source search and the final test search have no hits. The middle
search prints exactly `tests/services/protectionBypass/contracts.test.ts`,
where the legacy `{ grantId }` shape remains only as a rejection regression.
Do not remove unrelated permission-domain uses of words such as `granted`.

- [ ] **Step 10: Commit the atomic state removal**

Stage the exact source/test files listed in this task, including the three
deletions and the new fixture; do not stage unrelated untracked files.

```powershell
git add -- src/services/protectionBypass/contracts.ts src/services/protectionBypass/client.ts src/services/protectionBypass/policy.ts src/services/protectionBypass/decisionErrorCode.ts src/services/protectionBypass/grantRegistry.ts src/services/protectionBypass/verifiedContinuation.ts src/services/productAnalytics/contracts.ts src/services/productAnalytics/shieldBypassSummary.ts src/entrypoints/background/protectionBypassCoordinator.ts src/entrypoints/background/runtimeMessages.ts src/constants/runtimeActions.ts src/components/dialogs/ChannelDialog/components/ChannelDialog.tsx src/features/AccountManagement/components/AccountActionButtons/index.tsx src/features/KeyManagement/KeyManagement.tsx src/features/ManagedSiteChannels/ManagedSiteChannels.tsx src/features/ManagedSiteModelSync/ManagedSiteModelSync.tsx src/features/ManagedSiteVerification/loadNewApiChannelKeyWithVerification.ts src/services/accounts/autoRefreshService.ts src/services/checkin/autoCheckin/scheduler.ts src/services/history/dailyBalanceHistory/scheduler.ts src/services/integrations/ldohSiteLookup/background.ts src/services/models/modelSync/scheduler.ts src/services/checkin/autoCheckin/messaging.ts src/features/AutoCheckin/AutoCheckin.tsx src/hooks/useAutoCheckinUiOpenPretrigger.ts tests/services/protectionBypass/fixtures.ts tests/services/protectionBypass/contracts.test.ts tests/services/protectionBypass/client.test.ts tests/services/protectionBypass/grantRegistry.test.ts tests/services/protectionBypass/policy.test.ts tests/entrypoints/background/protectionBypassCoordinator.test.ts tests/entrypoints/background/protectionBypassCoordinator.defaultValidator.test.ts tests/entrypoints/background/runtimeMessages.test.ts tests/entrypoints/background/runtimeMessages.more.test.ts tests/utils/runtimeActions.test.ts tests/services/autoRefreshService.test.ts tests/services/autoCheckin/scheduler.test.ts tests/services/dailyBalanceHistory/scheduler.test.ts tests/services/ldohSiteLookup.background.test.ts tests/services/modelSync/messageHandler.test.ts tests/services/runtimeTypedMessagingSetup.test.ts tests/features/ManagedSiteModelSync/ManagedSiteModelSync.test.tsx tests/features/ManagedSiteVerification/loadNewApiChannelKeyWithVerification.test.ts tests/components/dialogs/ChannelDialog/ChannelDialog.advisoryWarning.test.tsx tests/features/AccountManagement/components/AccountActionButtons.test.tsx tests/entrypoints/options/pages/KeyManagement/KeyManagement.managedSiteStatusSupport.test.tsx tests/entrypoints/options/pages/ManagedSiteChannels/ManagedSiteChannels.test.tsx tests/services/productAnalytics/shieldBypassSummary.test.ts
git add -- tests/entrypoints/options/AutoCheckinAccountActions.test.tsx tests/entrypoints/options/AutoCheckinQuickRun.test.tsx tests/entrypoints/options/BalanceHistory.test.tsx tests/entrypoints/options/pages/KeyManagement/useKeyManagement.test.tsx tests/features/AccountManagement/bookmarkImport/importAccounts.test.ts tests/features/AccountManagement/components/BookmarkAccountImportDialog.test.tsx tests/features/AccountManagement/hooks/AccountActionsContext.test.tsx tests/features/AccountManagement/hooks/AccountDataContext.test.tsx tests/features/AccountManagement/hooks/useAccountDialog.analytics.test.tsx tests/features/AccountManagement/hooks/useAccountDialog.currentTabDetection.test.tsx tests/features/AccountManagement/hooks/useAccountDialog.duplicateAccountWarning.test.tsx tests/features/AccountManagement/hooks/useAccountDialog.excludeFromTotalBalance.test.tsx tests/features/AccountManagement/hooks/useAccountDialog.openrouter.test.tsx tests/features/AccountManagement/hooks/useAccountDialog.redetectPreservesCustomData.test.tsx tests/features/AccountManagement/hooks/useAccountDialog.saveAndAutoConfig.test.tsx tests/features/AccountManagement/hooks/useAccountDialog.sub2apiConstraints.test.tsx tests/hooks/useAccountData.test.tsx tests/services/accountBrowserSession/sessionReader.test.ts tests/services/accountOperations.autoDetectAccount.test.ts tests/services/accounts/autoDetectCompletion/completion.test.ts tests/services/accountStorage.test.ts tests/services/apiAdapters/openrouter/accountProvisioning.test.ts tests/services/apiAdapters/openrouter/managementKeyActionClient.test.ts tests/services/apiService/sub2api/tokenResync.test.ts tests/services/apiService/voapiV2/tokenResync.test.ts tests/services/autoCheckin/providers/anyrouter.test.ts tests/services/autoCheckin/providers/newApi.test.ts tests/services/autoCheckin/providers/veloera.test.ts tests/services/autoCheckin/providers/voapiV2.test.ts tests/services/autoCheckin/providers/wong.test.ts tests/services/autoDetectService.test.ts tests/services/detectSiteType.fallback.test.ts tests/services/managedSites/providers/newApiSession.test.ts tests/services/newApiService/newApiService.test.ts tests/services/productAnalytics/privacy.test.ts
pnpm run validate:staged
git commit -m "refactor(protection-bypass): remove command grant state"
```

Expected: staged validation and commit hooks PASS.

## Task 3: Normalize One Execute Envelope and Remove Legacy Acquire Routes

**Files:**

- Modify: `src/services/protectionBypass/contracts.ts`
- Modify: `src/types/tempWindowFetch.ts`
- Modify: `src/utils/browser/tempWindowFetch.ts`
- Modify: `src/entrypoints/background/protectionBypassCoordinator.ts`
- Modify: `src/entrypoints/background/runtimeMessages.ts`
- Modify: `src/entrypoints/background/tempWindowPool.ts`
- Modify: `src/constants/runtimeActions.ts`
- Modify: `src/services/accountBrowserSession/sessionReader.ts`
- Modify: `src/services/siteDetection/autoDetectService.ts`
- Modify: `src/services/apiAdapters/openrouter/managementKeyActionClient.ts`
- Modify: `src/services/apiAdapters/openrouter/managementKeyPageContract.ts`
- Modify: `src/services/apiAdapters/openrouter/accountProvisioning.ts`
- Modify: `src/features/AccountManagement/components/AccountDialog/hooks/useOpenRouterAccountOnboarding.ts`
- Modify: `src/entrypoints/background/openrouter/managementKeyAction.ts`
- Test: `tests/entrypoints/background/protectionBypassArchitecture.test.ts`
- Test: `tests/entrypoints/background/protectionBypassCoordinator.test.ts`
- Test: `tests/entrypoints/background/runtimeMessages.test.ts`
- Test: `tests/entrypoints/background/runtimeMessages.more.test.ts`
- Test: `tests/entrypoints/background/tempWindowPoolWindowFallback.test.ts`
- Test: `tests/utils/runtimeActions.test.ts`
- Test: `tests/utils/tempWindowFetch.background.test.ts`
- Test: `tests/utils/tempWindowFetch.fallback.test.ts`
- Test: `tests/services/accountBrowserSession/sessionReader.test.ts`
- Test: `tests/services/autoDetectService.test.ts`
- Test: `tests/services/managedSites/providers/newApiSession.test.ts`
- Test: `tests/services/apiAdapters/openrouter/managementKeyActionClient.test.ts`
- Test: `tests/services/apiAdapters/openrouter/accountProvisioning.test.ts`
- Test: `tests/features/AccountManagement/hooks/useAccountDialog.openrouter.test.tsx`
- Test: `tests/entrypoints/background/openRouterManagementKeyAction.test.ts`

- [ ] **Step 1: Write failing single-envelope architecture tests**

Reverse the old architecture assertion that required execution in every task
param:

```ts
it("keeps intent only in the Coordinator envelope", async () => {
  const [contractsSource, typesSource, clientSource] = await Promise.all([
    fs.readFile(protectionBypassContractsPath, "utf8"),
    fs.readFile(tempWindowTypesPath, "utf8"),
    fs.readFile(protectionBypassClientPath, "utf8"),
  ])

  expect(contractsSource).toContain("execution: ProtectionBypassExecution")
  expect(contractsSource).not.toMatch(
    /params:[\s\S]{0,200}protectionBypassExecution/,
  )
  expect(contractsSource).not.toMatch(
    /params:[\s\S]{0,200}tempWindowRequestSource/,
  )
  expect(clientSource).not.toMatch(/runtimeActions|browserApi|background\//)
  expect(typesSource).toContain(
    "protectionBypassExecution: ProtectionBypassExecution",
  )
})
```

The browser-facing request types may still accept execution; the canonical
`TempContextTask.params` type must omit execution and source.

Add a runtime test that sends all nine task kinds through
`ProtectionBypassExecuteTask` and asserts the Coordinator receives exactly:

```ts
{
  execution,
  task: {
    kind,
    params: expect.not.objectContaining({
      protectionBypassExecution: expect.anything(),
      tempWindowRequestSource: expect.anything(),
    }),
  },
}
```

Also send otherwise valid tasks containing a nested
`protectionBypassExecution` or `tempWindowRequestSource` and assert the runtime
boundary rejects them rather than silently preserving a second authority.

- [ ] **Step 2: Run the envelope tests and verify RED**

```powershell
pnpm exec vitest run tests/entrypoints/background/protectionBypassArchitecture.test.ts tests/entrypoints/background/runtimeMessages.test.ts tests/entrypoints/background/runtimeMessages.more.test.ts tests/utils/tempWindowFetch.background.test.ts tests/utils/tempWindowFetch.fallback.test.ts
```

Expected: FAIL because task params and envelope currently duplicate execution
and request source.

- [ ] **Step 3: Define normalized canonical task params**

In `contracts.ts`:

```ts
type WithoutProtectionBypassIntent<T> = Omit<
  T,
  "protectionBypassExecution" | "tempWindowRequestSource"
>

export type ProtectionBypassExecuteRequest<
  TTask extends TempContextTask = TempContextTask,
> = {
  execution: ProtectionBypassExecution
  task: TTask
}

type TempContextTaskResultMap = {
  [TEMP_CONTEXT_TASK_KINDS.ApiFallbackFetch]: TempWindowFetch
  [TEMP_CONTEXT_TASK_KINDS.ProfileIsolatedFetch]: TempWindowFetch
  [TEMP_CONTEXT_TASK_KINDS.TurnstileFetch]: TempWindowTurnstileFetch
  [TEMP_CONTEXT_TASK_KINDS.NativePageAction]: TempWindowCheckinPageAction
  [TEMP_CONTEXT_TASK_KINDS.OpenRouterManagementKeyAction]: TempWindowOpenRouterManagementKeyActionResult
  [TEMP_CONTEXT_TASK_KINDS.RenderedTitle]: TempWindowRenderedTitleResponse
  [TEMP_CONTEXT_TASK_KINDS.SessionRead]: TempWindowFetch
  [TEMP_CONTEXT_TASK_KINDS.NewApiSessionRead]: TempWindowFetch
  [TEMP_CONTEXT_TASK_KINDS.OpenContext]: TempWindowOpenContextResult
}

export type TempContextTaskResult<TTask extends TempContextTask> =
  TempContextTaskResultMap[TTask["kind"]]
```

Indexing by `TTask["kind"]` makes a newly added task kind fail compilation until
its result contract is added to the map; do not add a generic fallback result.

Add the missing public response contract beside the other temp-window result
types in `src/types/tempWindowFetch.ts`:

```ts
export type TempWindowOpenContextResult =
  | { success: true; tabId: number; windowId?: number }
  | { success: false; error: string; code?: ApiErrorCode }
```

Apply `WithoutProtectionBypassIntent<...>` to every member of
`TempContextTask`. Keep the exact operation payload, including New API
`origin/userId/channelId/action`. In `isTempContextTask`, reject every params
object that owns a `protectionBypassExecution` or `tempWindowRequestSource`
key before kind-specific validation; do not merely ignore the extra field.

Add `suppressMinimize?: boolean` to `TempWindowSessionReadParams` because the
existing account-browser-session API already exposes and forwards that option.
The explicit override is supported only by API/profile fetch, Turnstile,
native-page, OpenRouter, rendered-title, session-read, and open-context tasks;
New API channel-key reads use the default derived from `execution.surface`.
Cover the session-read override in `sessionReader.test.ts` so normalization
does not silently drop current behavior.

Add one transport helper in `tempWindowFetch.ts` so background-direct and
runtime-message paths cannot drift:

```ts
async function executeProtectionBypassTask<TTask extends TempContextTask>(
  request: ProtectionBypassExecuteRequest<TTask>,
): Promise<TempContextTaskResult<TTask>> {
  if (isExtensionBackground()) {
    return await protectionBypassCoordinator.execute(request)
  }
  return await sendRuntimeMessage({
    action: RuntimeActionIds.ProtectionBypassExecuteTask,
    ...request,
  })
}
```

Replace the old Coordinator callback Interface with the design's small Promise
Interface:

```ts
interface ProtectionBypassCoordinator {
  execute<TTask extends TempContextTask>(
    request: ProtectionBypassExecuteRequest<TTask>,
  ): Promise<TempContextTaskResult<TTask>>
}
```

The Coordinator owns the one Promise adapter around the pool's private
callback-style handlers and rejects if a handler completes without a response.
`runtimeMessages.ts` validates the internal envelope, awaits
`coordinator.execute(request)`, and forwards its result through `sendResponse`.
No Coordinator caller passes a runtime sender or response callback after this
task. Update background-direct callers and tests to use the same `execute`
method; sender exists only at the runtime listener boundary and is not passed
into policy or presentation code.

In browser helper functions, destructure once when building the envelope:

```ts
const {
  protectionBypassExecution: execution,
  tempWindowRequestSource: _ignoredSource,
  ...taskParams
} = payload

return await executeProtectionBypassTask({
  execution,
  task: {
    kind: TEMP_CONTEXT_TASK_KINDS.TurnstileFetch,
    params: taskParams,
  },
})
```

Use this exhaustive mapping; do not introduce a generic cast that bypasses the
discriminated union:

| Protected operation constructor/helper | Canonical task kind |
| --- | --- |
| ordinary API fallback in `tempWindowFetch` | `api_fallback_fetch` |
| forced/profile-isolated fetch in `tempWindowFetch` | `profile_isolated_fetch` |
| `tempWindowTurnstileFetch` | `turnstile_fetch` |
| `tempWindowTriggerCheckinPageAction` | `native_page_action` |
| OpenRouter management-key client | `openrouter_management_key_action` |
| `tempWindowGetRenderedTitle` | `rendered_title` |
| account browser session and auto-detect session readers | `session_read` |
| `tempWindowNewApiSessionRead` | `new_api_session_read` |
| explicit temporary-context opener | `open_context` |

Add a concise comment beside the background envelope parser: plain command
intent is accepted only from internal extension messaging, and this boundary
must be reassessed if `externally_connectable`, `onMessageExternal`, or
`onConnectExternal` is added.

- [ ] **Step 4: Derive pool presentation source from execution**

Change the private Coordinator-to-pool Interface to carry source separately:

```ts
type ExecuteAuthorizedTask = (
  task: TempContextTask,
  presentationSource: ProtectionBypassSurface,
  authorizeAtAcquire: AuthorizeTempContextAtAcquire,
  sendResponse: (response?: unknown) => void,
  reportOutcome?: ReportAuthorizedTempContextOutcome,
) => Promise<void>
```

The Coordinator passes `execution.surface`. Add one pool-owned presentation
adapter that supports every task kind, including OpenRouter:

```ts
export function resolveAuthorizedTaskPresentation(
  task: TempContextTask,
  presentationSource: ProtectionBypassSurface,
):
  | {
      kind: "ready"
      source: ProtectionBypassSurface
      suppressMinimize: boolean
    }
  | { kind: "blocked"; reason: "firefox_popup_unsupported" } {
  const policy = resolveTempWindowRequestPolicy({
    tempWindowRequestSource: presentationSource,
    suppressMinimize:
      "suppressMinimize" in task.params
        ? task.params.suppressMinimize
        : undefined,
  })
  return policy.blockedReason
    ? { kind: "blocked", reason: policy.blockedReason }
    : {
        kind: "ready",
        source: policy.tempWindowRequestSource,
        suppressMinimize: policy.suppressMinimize,
      }
}
```

The default Coordinator dispatcher calls this adapter once before its existing
OpenRouter-versus-generic branch. On `blocked`, it responds immediately through
`buildTaskFailure`. Add an OpenRouter branch to that function that constructs a
valid `NotDispatched`/`Failed` result from the task's `requestId`, operation,
and label, so client normalization never upgrades a request that did not reach
the page to `DispatchedUnconfirmed`.

On `ready`, pass `{ source, suppressMinimize }` separately to the generic pool
executor. For OpenRouter, change
`handleTempWindowOpenRouterManagementKeyAction` to accept the normalized
`suppressMinimize` as a separate required argument and pass it directly to
`tempWindowBackgroundRuntime.acquire`; do not read the legacy source or derive
the default inside the handler. This gives both branches the following exact
path:

```text
Coordinator execution.surface
  -> pool-owned resolveAuthorizedTaskPresentation(task, source)
  -> blocked task-specific result
     OR ready { source, suppressMinimize }
       -> generic pool executor
       OR OpenRouter handler -> tempWindowBackgroundRuntime.acquire
```

Remove the per-handler `resolveTempWindowRequestPolicy` calls from
rendered-title, Turnstile, native-page, session-read, fetch, and open-context
pool paths so they consume the already normalized presentation argument
instead of resolving a second time.

Remove caller-side `resolveTempWindowRequestPolicy` calls from all protected
task constructors in `tempWindowFetch.ts` and
`managementKeyActionClient.ts`. Browser-facing compatibility inputs may still
contain `tempWindowRequestSource`, but envelope construction discards it; only
`execution.surface` reaches the Coordinator. An explicitly supplied
`suppressMinimize` remains an operation option, while its default is computed
only in the pool from `execution.surface`. Policy reads that same surface.
Neither sender nor task params may override presentation source.

Keep `getTempWindowFallbackBlockStatus` for settings/reminder discoverability,
but actual protected execution must not rely on it as a second presentation
authorization decision. Add generic-fetch and OpenRouter regressions proving
that popup defaults minimize suppression, and that Firefox popup rejection is
identical when callers provide a conflicting legacy source.

- [ ] **Step 5: Move OpenRouter onto the unified execute action**

Change `managementKeyActionClient.ts` to build the normalized task:

```ts
const task: Extract<
  TempContextTask,
  { kind: typeof TEMP_CONTEXT_TASK_KINDS.OpenRouterManagementKeyAction }
> = {
  kind: TEMP_CONTEXT_TASK_KINDS.OpenRouterManagementKeyAction,
  params: {
    requestId: params.requestId,
    operation: params.operation,
    ...(params.suppressMinimize === undefined
      ? {}
      : { suppressMinimize: params.suppressMinimize }),
  },
}
```

Make `protectionBypassExecution` required on this protected client call and
remove its caller-side `resolveTempWindowRequestPolicy` check. The Coordinator
supplies `execution.surface`; the pool owns popup/Firefox presentation policy.
Normalize the returned result with the original request as before:

```ts
const response = await sendRuntimeMessage({
  action: RuntimeActionIds.ProtectionBypassExecuteTask,
  execution: params.protectionBypassExecution,
  task,
})
return normalizeOpenRouterManagementKeyActionResult(params, response)
```

Make `protectionBypassExecution` required in `accountProvisioning.ts` and the
OpenRouter onboarding request that calls it; update
`accountProvisioning.test.ts` to prove the exact plain execution reaches the
management-key client.

Preserve the existing OpenRouter cancel, dispatched, mutation, and cleanup
messages. Only the protected acquire request moves to the unified envelope.

- [ ] **Step 6: Delete unused legacy protected acquire routes**

First run:

```powershell
rg -n "RuntimeActionIds\.(OpenTempWindow|AutoDetectSite|TempWindowFetch|TempWindowTurnstileFetch|TempWindowCheckinPageAction|TempWindowOpenRouterManagementKeyAction|TempWindowGetRenderedTitle)" src
```

Expected before deletion: definitions/handlers plus the OpenRouter sender only.
After Step 5, remove these acquire action IDs and their
`runtimeMessages.ts` handler branches:

- `OpenTempWindow`
- `AutoDetectSite`
- `TempWindowFetch`
- `TempWindowTurnstileFetch`
- `TempWindowCheckinPageAction`
- `TempWindowOpenRouterManagementKeyAction`
- `TempWindowGetRenderedTitle`

Keep `CloseTempWindow`,
`TempWindowCancelOpenRouterManagementKeyAction`, and
`TempWindowOpenRouterManagementKeyDispatched`; they are lifecycle/cleanup
paths, not protected acquire alternatives.

- [ ] **Step 7: Run transport and specialized task tests**

```powershell
pnpm exec vitest run tests/entrypoints/background/protectionBypassArchitecture.test.ts tests/entrypoints/background/protectionBypassCoordinator.test.ts tests/entrypoints/background/runtimeMessages.test.ts tests/entrypoints/background/runtimeMessages.more.test.ts tests/entrypoints/background/tempWindowPoolWindowFallback.test.ts tests/utils/runtimeActions.test.ts tests/utils/tempWindowFetch.background.test.ts tests/utils/tempWindowFetch.fallback.test.ts tests/services/accountBrowserSession/sessionReader.test.ts tests/services/autoDetectService.test.ts tests/services/managedSites/providers/newApiSession.test.ts tests/services/apiAdapters/openrouter/managementKeyActionClient.test.ts tests/services/apiAdapters/openrouter/accountProvisioning.test.ts tests/features/AccountManagement/hooks/useAccountDialog.openrouter.test.tsx tests/entrypoints/background/openRouterManagementKeyAction.test.ts
```

Expected: all listed tests PASS and all nine tasks reach the Coordinator through
one envelope.

- [ ] **Step 8: Commit the normalized transport**

```powershell
git add -- src/services/protectionBypass/contracts.ts src/types/tempWindowFetch.ts src/utils/browser/tempWindowFetch.ts src/entrypoints/background/protectionBypassCoordinator.ts src/entrypoints/background/runtimeMessages.ts src/entrypoints/background/tempWindowPool.ts src/constants/runtimeActions.ts src/services/accountBrowserSession/sessionReader.ts src/services/siteDetection/autoDetectService.ts src/services/apiAdapters/openrouter/managementKeyActionClient.ts src/services/apiAdapters/openrouter/managementKeyPageContract.ts src/services/apiAdapters/openrouter/accountProvisioning.ts src/features/AccountManagement/components/AccountDialog/hooks/useOpenRouterAccountOnboarding.ts src/entrypoints/background/openrouter/managementKeyAction.ts tests/entrypoints/background/protectionBypassArchitecture.test.ts tests/entrypoints/background/protectionBypassCoordinator.test.ts tests/entrypoints/background/runtimeMessages.test.ts tests/entrypoints/background/runtimeMessages.more.test.ts tests/entrypoints/background/tempWindowPoolWindowFallback.test.ts tests/utils/runtimeActions.test.ts tests/utils/tempWindowFetch.background.test.ts tests/utils/tempWindowFetch.fallback.test.ts tests/services/accountBrowserSession/sessionReader.test.ts tests/services/autoDetectService.test.ts tests/services/managedSites/providers/newApiSession.test.ts tests/services/apiAdapters/openrouter/managementKeyActionClient.test.ts tests/services/apiAdapters/openrouter/accountProvisioning.test.ts tests/features/AccountManagement/hooks/useAccountDialog.openrouter.test.tsx tests/entrypoints/background/openRouterManagementKeyAction.test.ts
pnpm run validate:staged
git commit -m "refactor(protection-bypass): normalize protected task transport"
```

Expected: staged validation and commit hooks PASS.

## Task 4: Make Current Resource Validation the Final Acquire-Time Fact

**Files:**

- Modify: `src/services/protectionBypass/policy.ts`
- Modify: `src/entrypoints/background/protectionBypassCoordinator.ts`
- Modify: `src/services/productAnalytics/contracts.ts`
- Modify: `src/services/productAnalytics/shieldBypassSummary.ts`
- Verify: `src/entrypoints/background/tempWindowPool.ts`
- Modify: `src/services/managedSites/providers/newApiSession.ts`
- Test: `tests/entrypoints/background/protectionBypassCoordinator.test.ts`
- Test: `tests/entrypoints/background/protectionBypassCoordinator.defaultValidator.test.ts`
- Test: `tests/entrypoints/background/tempWindowPoolProtectionGuards.test.ts`
- Test: `tests/services/protectionBypass/policy.test.ts`
- Test: `tests/services/managedSites/providers/newApiSession.test.ts`
- Test: `tests/services/productAnalytics/shieldBypassSummary.test.ts`

- [ ] **Step 1: Add the hidden-key TOCTOU regression test**

Use injected async facts and an order log:

```ts
it("validates the current resource after policy and capability awaits", async () => {
  const order: string[] = []
  let resourceIsCurrent = true
  const poolUse = vi.fn()
  const coordinator = createProtectionBypassCoordinator({
    readPolicy: vi.fn(async () => {
      order.push("policy")
      return allowedPolicy
    }),
    resolveCapability: vi.fn(async () => {
      order.push("capability")
      resourceIsCurrent = false
      return {
        kind: PROTECTION_BYPASS_CAPABILITY_KINDS.Available,
        adapter: TEMP_CONTEXT_MODES.Tab,
      }
    }),
    validateNewApiSessionReadResource: vi.fn(async () => {
      order.push("resource")
      return resourceIsCurrent
    }),
    executeAuthorizedTask: async (
      _task,
      _source,
      authorizeAtAcquire,
      sendResponse,
    ) => {
      order.push("lock")
      const decision = await authorizeAtAcquire()
      order.push("decision")
      if (decision.kind === PROTECTION_BYPASS_DECISION_RESULTS.Allowed) {
        poolUse()
      }
      sendResponse({ success: decision.kind === "allowed" })
    },
  })

  const result = await coordinator.execute({
    execution: userCommandExecution(
      PROTECTION_BYPASS_USER_COMMANDS.VerifyProtection,
      PROTECTION_BYPASS_SURFACES.Options,
    ),
    task: {
      kind: TEMP_CONTEXT_TASK_KINDS.NewApiSessionRead,
      params: {
        origin: "https://example.invalid",
        userId: "example-user",
        channelId: 7,
        action: NEW_API_SESSION_READ_ACTIONS.ChannelKey,
      },
    },
  })

  expect(order).toEqual([
    "lock",
    "policy",
    "capability",
    "resource",
    "decision",
  ])
  expect(poolUse).not.toHaveBeenCalled()
  expect(result).toMatchObject({
    success: false,
    code: API_ERROR_CODES.TEMP_WINDOW_POLICY_CONTEXT_INVALID,
  })
})
```

Assert the returned denial reason is `resource_stale`, maps to
`TEMP_WINDOW_POLICY_CONTEXT_INVALID`, and records one controlled decision
summary. Retain the existing regression where `resolveCapability` rejects;
that path must still normalize to `adapter_unavailable`, return the existing
controlled unsupported/policy response, and record one decision rather than
rejecting the Coordinator promise.

- [ ] **Step 2: Run Coordinator tests and verify RED**

```powershell
pnpm exec vitest run tests/entrypoints/background/protectionBypassCoordinator.test.ts tests/entrypoints/background/protectionBypassCoordinator.defaultValidator.test.ts tests/entrypoints/background/tempWindowPoolProtectionGuards.test.ts tests/services/protectionBypass/policy.test.ts tests/services/managedSites/providers/newApiSession.test.ts tests/services/productAnalytics/shieldBypassSummary.test.ts
```

Expected: the new order assertion FAILS because current resource validation
currently occurs before later policy/capability awaits.

- [ ] **Step 3: Reorder the acquire callback without adding a new cache**

Inside `authorizeAtAcquire`:

```ts
const policy = await readPolicy()
let capability: ProtectionBypassCapability
try {
  capability = await resolveCapability(policy)
} catch {
  capability = {
    kind: PROTECTION_BYPASS_CAPABILITY_KINDS.AdapterUnavailable,
  }
}
let resourceIsCurrent = true
if (task.kind === TEMP_CONTEXT_TASK_KINDS.NewApiSessionRead) {
  try {
    resourceIsCurrent = await validateNewApiSessionReadResource(task.params)
  } catch {
    resourceIsCurrent = false
  }
}

return evaluateProtectionBypassPolicy({
  execution: resolvedExecution,
  task,
  policy,
  capability,
  resourceIsCurrent,
})
```

Add `ResourceStale: "resource_stale"` to
`PROTECTION_BYPASS_DENIED_REASONS` in this task. Task 1 intentionally keeps the
old grant denial while the registry still exists; Task 2 replaces that entry
with `InvalidIntent` when the grant is deleted.
Add the matching controlled analytics classification and bounded count property
in the same change.

In the synchronous evaluator, after feature-operation validation and before an
allowed result:

```ts
export interface EvaluateProtectionBypassPolicyInput {
  execution:
    | ResolvedProtectionBypassExecution
    | ProtectionBypassIntentResolutionFailure
    | undefined
  task: TempContextTask
  policy: ProtectionBypassPolicyState
  capability: ProtectionBypassCapability
  resourceIsCurrent?: boolean
}
```

Change `evaluateProtectionBypassPolicy` to accept that named input and
destructure `resourceIsCurrent = true`; the default preserves all existing
non-resource callers and tests. Add a policy-level regression with otherwise
allowed facts and `resourceIsCurrent: false`, then add this branch to the
evaluator:

```ts
if (!resourceIsCurrent) {
  return denied(PROTECTION_BYPASS_DENIED_REASONS.ResourceStale, context)
}
```

There must be no unrelated `await` after
`validateNewApiSessionReadResource(...)` and before returning the decision.
Add a rejection regression proving validator failure returns the same
controlled `resource_stale` denial and never reaches reuse/create. Do not add a
resource Map, batch scope, timestamp, or lease.

In `newApiSession.ts`, replace the bare `"channel_key"` action with
`NEW_API_SESSION_READ_ACTIONS.ChannelKey`.

- [ ] **Step 4: Run acquire-time tests and verify GREEN**

Run the Step 2 command.

Expected: all tests PASS; the resource validator is the last asynchronous
authorization fact, and denied work never reaches pool reuse/create.

- [ ] **Step 5: Commit the currentness fix**

```powershell
git add -- src/services/protectionBypass/policy.ts src/entrypoints/background/protectionBypassCoordinator.ts src/services/productAnalytics/contracts.ts src/services/productAnalytics/shieldBypassSummary.ts src/services/managedSites/providers/newApiSession.ts tests/entrypoints/background/protectionBypassCoordinator.test.ts tests/entrypoints/background/protectionBypassCoordinator.defaultValidator.test.ts tests/entrypoints/background/tempWindowPoolProtectionGuards.test.ts tests/services/protectionBypass/policy.test.ts tests/services/managedSites/providers/newApiSession.test.ts tests/services/productAnalytics/shieldBypassSummary.test.ts
pnpm run validate:staged
git commit -m "fix(protection-bypass): validate current resource at acquire"
```

Expected: staged validation and commit hooks PASS.

## Task 5: Reconcile Workflow, Architecture, Telemetry, and Settings Regressions

**Files:**

- Modify: `tests/entrypoints/background/protectionBypassArchitecture.test.ts`
- Modify: `tests/services/accountStorage.test.ts`
- Modify: `tests/services/apiTransport/request.test.ts`
- Modify: `tests/features/AccountManagement/hooks/AccountDataContext.test.tsx`
- Modify: `tests/hooks/useAccountData.test.tsx`
- Modify: `tests/entrypoints/options/AutoCheckinAccountActions.test.tsx`
- Modify: `tests/components/AutoCheckinUiOpenPretrigger.test.tsx`
- Modify: `tests/services/autoCheckin/scheduler.test.ts`
- Modify: `tests/services/dailyBalanceHistory/scheduler.test.ts`
- Modify: `tests/services/modelSync/messageHandler.test.ts`
- Modify: `tests/services/runtimeTypedMessagingSetup.test.ts`
- Modify: `tests/services/accountOperations.autoDetectAccount.test.ts`
- Modify: `tests/services/autoDetectService.test.ts`
- Modify: `tests/features/AccountManagement/hooks/useAccountDialog.saveAndAutoConfig.test.tsx`
- Modify: `tests/services/managedSites/providers/newApiSession.test.ts`
- Modify: `tests/features/ManagedSiteModelSync/ManagedSiteModelSync.test.tsx`
- Modify: `src/services/productAnalytics/contracts.ts`
- Modify: `src/services/productAnalytics/privacy.ts`
- Modify: `src/services/productAnalytics/shieldBypassSummary.ts`
- Modify: `tests/services/productAnalytics/privacy.test.ts`
- Modify: `tests/services/productAnalytics/shieldBypassSummary.test.ts`
- Modify: `tests/services/productAnalytics/state.test.ts`
- Verify: `tests/entrypoints/options/ShieldSettings.test.tsx`
- Verify: `tests/features/BasicSettings/Refresh.search.test.ts`
- Verify: `tests/services/productAnalytics/settingsSnapshot.test.ts`
- Verify: `tests/services/productAnalytics/settings.test.ts`

- [ ] **Step 1: Lock retry-root semantics with behavior tests**

Keep the existing awaited manual workflow propagation, then prove persisted or
detached roots construct automatic intent:

```ts
expect(persistedRetryRecord).not.toHaveProperty("protectionBypassExecution")
expect(retryExecution).toEqual({
  version: PROTECTION_BYPASS_EXECUTION_VERSION,
  kind: PROTECTION_BYPASS_EXECUTION_KINDS.Automatic,
  feature: PROTECTION_BYPASS_FEATURES.Checkin,
  trigger: PROTECTION_BYPASS_AUTOMATIC_TRIGGERS.Retry,
  surface: PROTECTION_BYPASS_SURFACES.Background,
})
```

Delete assertions that merely search persisted JSON for `grantId`; the
behavioral invariant is that the complete user-command execution is absent.

For typed-message tests, structured-clone a valid plain execution and prove it
is accepted. Send a malformed command/surface/version and prove it is rejected.
Do not assert WeakMap registration or object identity.

- [ ] **Step 2: Reconcile explicit workflow fixtures**

Use `userCommandExecution(...)` from Task 2 for:

- single/all/disabled-account refresh;
- manual check-in and retry-one-account;
- add/detect/reauthenticate account;
- verification-backed channel-key and model-sync work.

Preserve each test's observable output, persisted account state, provider call,
or rendered UI assertion. Do not replace behavior assertions with mock
call-order assertions.

- [ ] **Step 3: Finalize telemetry schema and privacy tests**

Verify Tasks 2 and 4 already removed:

- `invalid_or_expired_grant` classification;
- `protection_bypass_denial_invalid_or_expired_grant_count`;
- any supported grant ID/property type.

Retain the controlled entries for:

```ts
[PROTECTION_BYPASS_DENIED_REASONS.InvalidIntent]:
  PROTECTION_BYPASS_DECISION_RESULTS.Denied,
[PROTECTION_BYPASS_DENIED_REASONS.ResourceStale]:
  PROTECTION_BYPASS_DECISION_RESULTS.Denied,
```

Derive invocation, decision, denial, operation, trigger, and feature dimensions
from the canonical contracts. In privacy tests, a malicious `grant_id` sample
may remain only as proof that unknown sensitive-looking properties are
filtered; it is not a supported product field.

Do not change daily-summary rollover/merge behavior in this task.

- [ ] **Step 4: Strengthen the deletion and ownership architecture test**

Keep these assertions:

- only the Coordinator imports `executeAuthorizedTempContextTask`;
- pool protected implementations remain private;
- browser context creation remains inside the pool;
- `tempWindowFetch.ts` does not import the pool or preferences.

Add source audits for:

```ts
expect(allProtectionBypassSource).not.toMatch(
  /grantRegistry|verifiedContinuation|beginUserCommand|endUserCommand|grantId/,
)
expect(clientSource).not.toMatch(
  /runtimeActions|sendRuntimeActionMessage|protectionBypassCoordinator/,
)
```

Assert task catalog coverage through `TEMP_CONTEXT_TASK_KINDS`; do not freeze a
second exact string array or count TypeScript property occurrences.

- [ ] **Step 5: Run workflow, analytics, and settings regression suites**

```powershell
pnpm exec vitest run tests/services/accountStorage.test.ts tests/services/apiTransport/request.test.ts tests/features/AccountManagement/hooks/AccountDataContext.test.tsx tests/hooks/useAccountData.test.tsx tests/entrypoints/options/AutoCheckinAccountActions.test.tsx tests/components/AutoCheckinUiOpenPretrigger.test.tsx tests/services/autoCheckin/scheduler.test.ts tests/services/dailyBalanceHistory/scheduler.test.ts tests/services/modelSync/messageHandler.test.ts tests/services/runtimeTypedMessagingSetup.test.ts tests/services/accountOperations.autoDetectAccount.test.ts tests/services/autoDetectService.test.ts tests/features/AccountManagement/hooks/useAccountDialog.saveAndAutoConfig.test.tsx tests/services/managedSites/providers/newApiSession.test.ts tests/features/ManagedSiteModelSync/ManagedSiteModelSync.test.tsx
pnpm exec vitest run tests/entrypoints/background/protectionBypassArchitecture.test.ts tests/services/productAnalytics/privacy.test.ts tests/services/productAnalytics/shieldBypassSummary.test.ts tests/services/productAnalytics/state.test.ts tests/entrypoints/options/ShieldSettings.test.tsx tests/features/BasicSettings/Refresh.search.test.ts tests/services/productAnalytics/settingsSnapshot.test.ts tests/services/productAnalytics/settings.test.ts
pnpm run i18n:extract:ci
```

Expected: all tests PASS and locale extraction reports no changes.

- [ ] **Step 6: Run related coverage for the two central contracts**

```powershell
pnpm exec vitest related --run src/services/protectionBypass/client.ts src/services/protectionBypass/contracts.ts src/entrypoints/background/protectionBypassCoordinator.ts src/entrypoints/background/tempWindowPool.ts
```

Expected: all discovered related suites PASS. If the Windows runner exits with
`EPIPE`, record that tooling failure and run the explicit focused matrices
from Tasks 2–5 instead; do not treat an `EPIPE` run as passing evidence.

- [ ] **Step 7: Commit the reconciliation slice**

```powershell
git add -- tests/entrypoints/background/protectionBypassArchitecture.test.ts tests/services/accountStorage.test.ts tests/services/apiTransport/request.test.ts tests/features/AccountManagement/hooks/AccountDataContext.test.tsx tests/hooks/useAccountData.test.tsx tests/entrypoints/options/AutoCheckinAccountActions.test.tsx tests/components/AutoCheckinUiOpenPretrigger.test.tsx tests/services/autoCheckin/scheduler.test.ts tests/services/dailyBalanceHistory/scheduler.test.ts tests/services/modelSync/messageHandler.test.ts tests/services/runtimeTypedMessagingSetup.test.ts tests/services/accountOperations.autoDetectAccount.test.ts tests/services/autoDetectService.test.ts tests/features/AccountManagement/hooks/useAccountDialog.saveAndAutoConfig.test.tsx tests/services/managedSites/providers/newApiSession.test.ts tests/features/ManagedSiteModelSync/ManagedSiteModelSync.test.tsx src/services/productAnalytics/contracts.ts src/services/productAnalytics/privacy.ts src/services/productAnalytics/shieldBypassSummary.ts tests/services/productAnalytics/privacy.test.ts tests/services/productAnalytics/shieldBypassSummary.test.ts tests/services/productAnalytics/state.test.ts
pnpm run validate:staged
git commit -m "test(protection-bypass): lock plain intent propagation"
```

Expected: staged validation and commit hooks PASS.

## Task 6: Run the Existing Browser Regression and Final Gates

**Files:**

- Verify: `e2e/autoCheckinNativePageFallback.spec.ts`
- Verify: all task-scoped changes from Tasks 1–5

- [ ] **Step 1: Run the existing real-browser product regression**

```powershell
pnpm e2e -- e2e/autoCheckinNativePageFallback.spec.ts --grep "automatic native-page fallback is denied while an explicit run is allowed"
```

Expected:

- automatic UI-open work creates no temporary tab/window while automatic
  protection bypass is disabled;
- the explicit run opens the temporary context;
- fixture page request/action is observed;
- final check-in success is persisted.

Do not add another Playwright scenario unless this existing one no longer
reaches the unified runtime envelope after the refactor.

- [ ] **Step 2: Run final static deletion and diff audits**

```powershell
rg -n "grantId|invalid_or_expired_grant|ProtectionBypassBeginUserCommand|ProtectionBypassEndUserCommand|grantRegistry|verifiedContinuation|ProtectionBypassResourceScope|createNewApiChannelKeyResourceScope|createManualModelSyncResourceScope|resourceScope:|leaseProfile|ManualModelSyncBatch" src
rg -l "grantId" tests
rg -n "invalid_or_expired_grant|ProtectionBypassBeginUserCommand|ProtectionBypassEndUserCommand|grantRegistry|verifiedContinuation|ProtectionBypassResourceScope|createNewApiChannelKeyResourceScope|createManualModelSyncResourceScope|resourceScope:|leaseProfile|ManualModelSyncBatch" tests
git diff --check
git status --short
```

Expected: the source and final test searches have no hits; the middle search
prints only the legacy-shape rejection test in
`tests/services/protectionBypass/contracts.test.ts`; diff check exits zero;
status contains only task-scoped tracked changes plus the user's existing
untracked files.

- [ ] **Step 3: Run repository gates**

```powershell
pnpm run i18n:extract:ci
pnpm run validate:push
```

Expected:

- locale extraction reports no updates;
- each implementation commit already passed staged validation for its exact
  task-scoped files; if final fixes were needed after those commits, stage only
  those fixes and rerun `pnpm run validate:staged` before committing them;
- `validate:push` completes both `compile` and `knip`.

If `validate:push` reports stale WXT generated types after branch integration,
run `pnpm exec wxt prepare`, verify it creates no tracked diff, then rerun
`pnpm run validate:push`.

- [ ] **Step 4: Inspect final history and hand off**

```powershell
git log --oneline --decorate -8
git diff main...HEAD --stat
git status --short
```

Expected: five new implementation commits after the approved design/plan
commits, no grant/lease/continuation Module, and no unrelated files staged or
committed.

Report separately:

- focused Vitest evidence;
- related-suite evidence or classified `EPIPE` fallback;
- locale/staged/push gate evidence;
- Playwright browser evidence;
- unchanged pre-existing untracked files;
- telemetry decision: reuse the bounded daily summary, remove grant-only
  dimensions, add no per-attempt event;
- E2E decision: retain and run the existing automatic-denied/manual-allowed
  scenario;
- maintainability decision: keep the deep Coordinator/pool separation and
  remove stateful grant/continuation abstractions.

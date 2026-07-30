# Protection Bypass Intent Policy Design

Date: 2026-07-22
Revised: 2026-07-30

## Revision Status

The 2026-07-29 revision superseded the original background grant design for the
same feature. The original design correctly established explicit invocation
intent, a single background Coordinator, and acquire-time enforcement, but it
treated an internal product-policy distinction as if it needed a short-lived
authorization capability.

The extension's protected workflows and runtime messages are internal trusted
code paths. This feature is not a security boundary against compromised
extension code, and no current product requirement depends on revocation,
expiry, ownership transfer, or survival across a service-worker restart.
Consequently, the implemented architecture keeps explicit intent propagation
and removes the grant registry, grant lifecycle, and verified-continuation
machinery.

The 2026-07-30 revision completes the product-policy change that the prior
revision deferred. It replaces the legacy page-surface and refresh-mode
"usage scope" settings with automatic bypass controls for user-recognizable
product features. This document remains the single design authority; the
follow-up implementation plan records execution and validation only.

## Purpose

Make temporary-context protection bypass obey the user's intent consistently:

- automatic work is denied when automatic protection bypass is disabled;
- an explicit user command remains eligible to perform the same protected work;
- execution location, runtime sender, or UI surface is never used to infer
  whether work is automatic or user initiated;
- every protected operation is evaluated against current policy, browser
  capability, and resource state immediately before it may acquire or reuse a
  temporary tab or window.

Issue #1202 exposed that the legacy `tempWindowFallback.enabled` setting was
only checked by the generic API-error fallback. Direct Turnstile fetches,
native-page actions, site detection, and forced browser-profile isolation could
reach the background pool through other paths.
The design must close that enforcement gap without introducing a second
authorization system.

## Product Semantics

The product rule is:

> Disabling automatic protection bypass denies automatic work. Explicit user
> commands may still use the configured temporary context.

Examples of explicit user commands include:

- refresh one account or all accounts;
- run a manual check-in;
- add, detect, or reauthenticate an account;
- load or verify key-management data;
- inspect managed-site channels or run model-sync work from an explicit UI
  command.

The following remain automatic even when opening the extension was itself a
user gesture:

- refresh-on-open and other UI-mount work;
- UI-open check-in pretriggers;
- scheduled refresh or check-in;
- detached or scheduled retries and background recovery;
- automatic key-management, managed-channel, or model-sync work not owned by
  an active user command;
- automatic LDOH site-index refresh.

An explicit command's context covers the awaited and delegated work that is
part of that workflow. It does not implicitly authorize a later scheduled
retry. A retry root creates a new automatic context.

Automatic bypass is controlled by one master switch and eight product-feature
switches:

| Automatic feature | Owned automatic work |
| --- | --- |
| `account_refresh` | scheduled refresh and refresh on extension open |
| `balance_history` | end-of-day balance-history capture |
| `checkin` | scheduled check-in, UI-open pretrigger, and automatic retry |
| `redemption_assist` | account refresh after a successful redemption |
| `ldoh_site_lookup` | LDOH site-index refresh |
| `key_management` | key inventory loading, managed-channel status lookup, batch-export preview, and post-delete reload |
| `managed_site_channels` | automatic channel matching and duplicate checks |
| `managed_site_model_sync` | automatic model sync and its model-mapping post-processing |

These settings control only whether automatic work may acquire a protected
temporary context. They do not enable or disable the owning product feature.
They never deny an explicit user command. Product-feature settings remain
editable while the automatic master or the owning product feature is disabled,
so a user's future intent is preserved.

`account_onboarding` remains a manual-only feature. The overloaded generic
`verification` feature and `VerifyProtection` command are removed; explicit
key, channel, and model workflows receive product-owned commands instead.

## Architectural Decision

Use one explicit, serializable execution context throughout the existing call
chain and one deep Protection Bypass Coordinator immediately in front of the
temporary-context pool:

```text
workflow root
  -> explicit execution context
  -> existing options, service calls, and runtime messages
  -> canonical protected task
  -> background Protection Bypass Coordinator
  -> temporary-context pool queue and same-origin lock
  -> Coordinator-owned acquire-time authorization callback
  -> current policy, capability, and resource validation
  -> pool reuse or create
  -> Tab / Window / Composite Adapter
```

The execution context is ordinary immutable workflow data. It is not an opaque
capability and has no registration lifecycle. No background Map is needed to
make a trusted internal value valid.

Keep:

- explicit `automatic` versus `user_command` execution;
- automatic feature and trigger classification;
- a closed automatic-feature subset separate from manual-only features;
- user-command identity;
- the canonical protected-task union, exact feature-to-task-kind validation,
  and task-owned operation metadata;
- one Coordinator as the only product-policy gateway to the pool;
- acquire-time evaluation of current policy, capability, and resource state;
- the existing pool and real Tab, Window, and Composite Adapters;
- architecture tests that require intent on every protected task and prevent
  direct protected pool entry.

Remove:

- opaque `grantId` values;
- begin/end user-command runtime actions;
- the in-memory grant registry, expiry, revocation, lease, and active state;
- runtime sender, owner, surface, operation-set, and resource-scope grant
  binding;
- verified-continuation registration and its background WeakMap;
- grant-specific profiles, errors, telemetry, and lifecycle tests;
- repeated grant resolution before dispatch and again before acquire;
- legacy surface and refresh-mode policy gates;
- generic verification ownership that conflates key, channel, and model work;
- low-level service factories that invent automatic execution metadata instead
  of receiving it from a real workflow root.

## Why Explicit Propagation Remains

The final enforcement point cannot determine whether a request originated from
a click, scheduler, retry, or lifecycle effect after those paths converge.
Therefore some invocation metadata must cross the same boundaries as the work.

This does not require adding unrelated positional parameters to every function.
Callers carry one cohesive `execution` value in existing workflow options and
runtime payloads. Intermediate layers forward it without interpreting it.
Workflow roots construct it; the Coordinator consumes it.

Alternatives are weaker:

- inferring intent from popup, options, side-panel, content-script, or
  background location confuses presentation with product intent;
- ambient or global context is unreliable across promises, fan-out, and MV3
  runtime-message boundaries;
- a background cache recreates lifecycle, cleanup, restart, and concurrency
  problems without providing a required feature;
- moving entire product workflows into the Coordinator would make it own
  account, check-in, onboarding, key-management, channel, and model
  orchestration.

## Structured Execution Context

Use canonical runtime constants and derive TypeScript unions from them. Do not
accept a loose boolean such as `isUserAction`, raw caller names, stack traces,
or inferred execution locations.

### Canonical runtime value catalog

This refactor also centralizes the closed value families that participate in
runtime branching, message validation, cross-module mappings, or telemetry.
Use `as const` objects and derive their types from the objects; do not maintain
a string union plus a separate Set or array containing the same values.

| Runtime family | Canonical source |
| --- | --- |
| Contract version | `PROTECTION_BYPASS_EXECUTION_VERSION` |
| Execution kinds | `PROTECTION_BYPASS_EXECUTION_KINDS` |
| Product features | `PROTECTION_BYPASS_FEATURES` |
| Automatic-feature subset | `PROTECTION_BYPASS_AUTOMATIC_FEATURES` |
| User commands | `PROTECTION_BYPASS_USER_COMMANDS` |
| Automatic triggers | existing `PROTECTION_BYPASS_AUTOMATIC_TRIGGERS` |
| Surfaces | existing `TEMP_WINDOW_REQUEST_SOURCES` / `PROTECTION_BYPASS_SURFACES` alias |
| Task kinds | `TEMP_CONTEXT_TASK_KINDS` |
| Operations | existing `PROTECTION_BYPASS_OPERATIONS` |
| Causes | existing `PROTECTION_BYPASS_CAUSES` |
| Decision kinds | narrow type derived from `PROTECTION_BYPASS_DECISION_RESULTS`, excluding `Unavailable` |
| Denial reasons | `PROTECTION_BYPASS_DENIED_REASONS` |
| Capability kinds | `PROTECTION_BYPASS_CAPABILITY_KINDS` |
| Summary results | `PROTECTION_BYPASS_DECISION_RESULTS` |
| Adapter modes | existing `TEMP_CONTEXT_MODES` |
| New API session actions | existing `NEW_API_SESSION_READ_ACTIONS` |

For example:

```ts
export const PROTECTION_BYPASS_EXECUTION_VERSION = 2 as const

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

type TempContextTaskKind =
  (typeof TEMP_CONTEXT_TASK_KINDS)[keyof typeof TEMP_CONTEXT_TASK_KINDS]

export const PROTECTION_BYPASS_DECISION_RESULTS = {
  Allowed: "allowed",
  Denied: "denied",
  Unavailable: "unavailable",
} as const

type ProtectionBypassDecisionKind = Exclude<
  (typeof PROTECTION_BYPASS_DECISION_RESULTS)[keyof typeof PROTECTION_BYPASS_DECISION_RESULTS],
  typeof PROTECTION_BYPASS_DECISION_RESULTS.Unavailable
>
```

The product-feature catalog contains the eight automatic features listed in
Product Semantics plus manual-only `account_onboarding`. Derive
`ProtectionBypassAutomaticFeature` from
`PROTECTION_BYPASS_AUTOMATIC_FEATURES`; do not model it as
`Exclude<ProtectionBypassFeature, ...>` or duplicate its string values in the
settings Module. Automatic constructors and runtime parsing accept only this
subset.

The version-2 user-command catalog and feature mapping are:

| User command | Product feature |
| --- | --- |
| `refresh_account`, `refresh_all_accounts`, `refresh_disabled_accounts` | `account_refresh` |
| `manual_checkin`, `retry_checkin_account` | `checkin` |
| `add_account`, `detect_account`, `reauthenticate_account` | `account_onboarding` |
| `manage_api_keys` | `key_management` |
| `manage_site_channels` | `managed_site_channels` |
| `sync_managed_site_models` | `managed_site_model_sync` |

The last three replace `verify_protection`. They identify the user's product
action without splitting commands by individual endpoint or protected task. A
model-sync action started from the channel page still uses
`sync_managed_site_models`; the visible page does not redefine ownership.

The execution discriminants, task union, parsers, exhaustive switches, policy
decisions, error mapping, and telemetry types consume these values. Runtime
validation may build a Set from `Object.values(...)`; the Set is derived data,
not another hand-maintained catalog.

Do not create constants for ordinary copy, log labels, one-use local branches,
or values already canonically owned by another Module. Tests should import the
canonical values when they exercise branching; raw literals remain appropriate
when a test intentionally proves the serialized wire value or rejects an
unknown value.

```ts
type ProtectionBypassExecution =
  | {
      version: typeof PROTECTION_BYPASS_EXECUTION_VERSION
      kind: typeof PROTECTION_BYPASS_EXECUTION_KINDS.UserCommand
      command: ProtectionBypassUserCommand
      surface: ProtectionBypassSurface
    }
  | {
      version: typeof PROTECTION_BYPASS_EXECUTION_VERSION
      kind: typeof PROTECTION_BYPASS_EXECUTION_KINDS.Automatic
      feature: ProtectionBypassAutomaticFeature
      trigger: ProtectionBypassAutomaticTrigger
      surface: ProtectionBypassSurface
    }
```

Version 1 is implemented on the current main branch and is no longer a
branch-local draft. Version 2 changes feature wire values and narrows the
automatic feature set. Runtime parsing validates the version, discriminant,
and every enum value so old, malformed, or stale messages fail closed. A
recognized version mismatch produces the controlled
`execution_version_mismatch` reason before ordinary shape validation. The
runtime response maps it to `TEMP_WINDOW_EXECUTION_VERSION_MISMATCH` with a
stable safe fallback message asking the user to refresh the extension page.
Other malformed values remain `invalid_execution`. Old feature values are
never guessed or silently reclassified.

For a user command, the Coordinator derives the top-level product feature from
one canonical command definition. For example, a profile-isolated fallback or
OpenRouter management-key action during onboarding remains owned by
`account_onboarding`; a hidden-key read from the key-management workflow
remains owned by `key_management`. The caller does not independently claim both
a command and a feature.

The command definition maps a command to its feature only. It contains no
lease duration, resource scope, or stateful allowed-operation grant. Commands
must identify their product action; one generic verification command must not
stand in for key management, managed channels, and model sync.

A static `PROTECTION_BYPASS_FEATURE_TASK_KINDS` matrix is the deterministic
contract invariant. It maps every product feature to the exact canonical task
kinds that the audited workflow may submit. The Coordinator rejects any other
task as `task_not_permitted`. Task-to-operation and task-to-cause mappings
remain separate, derived metadata for telemetry and capability routing. An
operation-level matrix is not sufficient because distinct tasks can share
`fetch`, `session_read`, or `native_page_action`.

The version-2 matrix is:

| Product feature | Allowed task kinds |
| --- | --- |
| `account_refresh` | `ApiFallbackFetch`, `SessionRead` |
| `balance_history` | `ApiFallbackFetch`, `SessionRead` |
| `checkin` | `ApiFallbackFetch`, `TurnstileFetch`, `NativePageAction`, `SessionRead` |
| `redemption_assist` | `ApiFallbackFetch`, `SessionRead` |
| `ldoh_site_lookup` | `ApiFallbackFetch` |
| `key_management` | `ApiFallbackFetch`, `SessionRead`, `NewApiSessionRead` |
| `managed_site_channels` | `NewApiSessionRead` |
| `managed_site_model_sync` | `NewApiSessionRead` |
| `account_onboarding` | `ApiFallbackFetch`, `ProfileIsolatedFetch`, `SessionRead`, `OpenRouterManagementKeyAction` |

`ProfileIsolatedFetch` is onboarding-only because current saved-account,
check-in, history, redemption, and key-management roots do not propagate the
browser profile fetch context. `SessionRead` is the generic account-browser
session fallback; `NewApiSessionRead` is the closed New API hidden-channel-key
read. They are not interchangeable. `NativePageAction` is check-in-only;
OpenRouter provisioning uses its dedicated task kind.

`RenderedTitle` and `OpenContext` have no production caller or workflow root in
the current tree and are authorized for no feature. Their exported submitter
helpers and pool support do not justify widening this matrix; removing those
dormant task kinds is a separate deletion decision.

`surface` remains presentation and message metadata even after surface settings
are removed:

- it never proves a user gesture;
- it is not compared with runtime sender or tab ownership;
- it is not stored in a registry;
- it may control presentation, minimization, Firefox popup compatibility, and
  validation of UI-owned runtime messages;
- it never participates in product-policy authorization.

The task passed to the Coordinator remains a discriminated union owned by the
temporary-context feature:

```ts
type WithoutProtectionBypassIntent<T> = Omit<
  T,
  "protectionBypassExecution" | "tempWindowRequestSource"
>

type TempContextTask =
  | {
      kind: "api_fallback_fetch"
      params: WithoutProtectionBypassIntent<TempWindowFetchParams>
    }
  | {
      kind: "profile_isolated_fetch"
      params: WithoutProtectionBypassIntent<TempWindowFetchParams>
    }
  | {
      kind: "turnstile_fetch"
      params: WithoutProtectionBypassIntent<TempWindowTurnstileFetchParams>
    }
  | {
      kind: "native_page_action"
      params: WithoutProtectionBypassIntent<TempWindowCheckinPageActionParams>
    }
  | {
      kind: "openrouter_management_key_action"
      params: WithoutProtectionBypassIntent<TempWindowOpenRouterManagementKeyActionParams>
    }
  | {
      kind: "rendered_title"
      params: WithoutProtectionBypassIntent<TempWindowRenderedTitleParams>
    }
  | {
      kind: "session_read"
      params: WithoutProtectionBypassIntent<TempWindowSessionReadParams>
    }
  | {
      kind: "new_api_session_read"
      params: WithoutProtectionBypassIntent<TempWindowNewApiSessionReadParams>
    }
  | {
      kind: "open_context"
      params: WithoutProtectionBypassIntent<OpenTempContextParams>
    }
```

The Coordinator owns the exhaustive task-to-operation and task-to-cause
mapping. Leaf callers select the task kind they own and do not repeat that
classification.

### One authoritative execution value

The runtime and Coordinator envelope has exactly one authoritative execution
member:

```ts
interface ProtectionBypassExecuteRequest<TTask extends TempContextTask> {
  execution: ProtectionBypassExecution
  task: TTask
}
```

Canonical task params do not also contain `protectionBypassExecution` or an
independently supplied `tempWindowRequestSource`. UI-facing helpers may
initially receive execution alongside other options, but they separate it when
constructing this envelope. The Coordinator derives the pool's presentation
source from `execution.surface`; that source may control presentation,
minimization, and Firefox compatibility but cannot independently affect intent
classification. The background boundary validates execution once and validates
the task independently, then the pool receives only the normalized task plus
the Coordinator-owned acquire callback.

This removes the current task/envelope duplication rather than expanding
partial equality checks across task kinds. Policy and downstream execution can
never observe two different intent values from one runtime message.

## Coordinator Interface

Keep the public Interface small:

```ts
interface ProtectionBypassCoordinator {
  execute<TTask extends TempContextTask>(
    request: ProtectionBypassExecuteRequest<TTask>,
  ): Promise<TempContextTaskResult<TTask>>
}
```

Small constructors may create typed user-command and automatic execution
values, but they are pure helpers. The existing
`withProtectionBypassUserCommand` callback helper may remain to minimize root
call-site churn if it simply constructs the value and invokes the callback. It
must not send begin/end messages, mutate background state, accept expiry, or
require `finally` cleanup.

`execute` is the only Interface that may submit protected work to the
temporary-context pool. It:

1. validates the execution and task shapes;
2. derives the product feature for a user command and rejects automatic values
   outside the automatic-feature subset;
3. validates the exact feature-to-task-kind contract, then derives operation
   and cause metadata from the task;
4. constructs an `authorizeAtAcquire` callback and submits the task plus that
   callback to the pool;
5. lets the pool complete scheduler admission and take the same-origin acquire
   lock;
6. from inside that lock, the pool invokes the callback, which reads current
   product policy and browser capability;
7. the callback validates current resource state as its last asynchronous fact
   and synchronously returns the decision;
8. the pool immediately reuses or creates the context after an allowed
   decision;
9. the Coordinator maps controlled denials and records privacy-safe summary
   telemetry.

The Coordinator does not orchestrate account refresh, check-in, onboarding,
key-management, channel, or model workflows. The pool does not read product
preferences or infer intent.

Cleanup, release, close, and destruction of an existing temporary context
remain unconditional. Policy controls new protected use, not resource cleanup.

## Data Flow

### Explicit account refresh

1. The click or command handler creates
   `{ kind: "user_command", command: "refresh_account", ... }`.
2. Account storage, Site Adapter Capability calls, API transport, and fallback
   options carry the same immutable execution value.
3. If the ordinary request succeeds, the protected resource is never used.
4. If fallback is required, the fallback Module submits an
   `api_fallback_fetch` task and the execution value to the Coordinator.
5. The Coordinator derives `account_refresh`, skips automatic feature settings,
   evaluates current capability, performs final resource validation, then
   allows or denies the acquire.
6. When the refresh promise settles, there is no grant to revoke.

Concurrent refresh-all fan-out may share the same immutable execution value.
Its lifetime is the workflow's ordinary promise graph, not a clock-based lease.

### Account onboarding

1. The explicit add or detect-account action creates an onboarding command
   context.
2. Site detection, profile-isolated fallback, session reads, and OpenRouter
   provisioning forward it unchanged.
3. Their owning Modules select the appropriate protected task.
4. Automatic work outside that workflow creates an execution for its real
   product owner and cannot become manual merely because it runs from the same
   entrypoint.

### UI-open check-in pretrigger

1. UI mount creates an automatic execution with feature `checkin`, trigger
   `ui_lifecycle`, and presentation surface metadata.
2. Scheduler and provider calls preserve the execution value.
3. Turnstile or native-page work reaches the Coordinator.
4. When automatic protection bypass is disabled, the request is denied before
   an existing context can be reused or a new context can be created.

### Scheduled and retry work

Schedules, persisted retry records, detached callbacks, and background recovery
construct new automatic execution values. A short retry that remains owned by
and awaited within the explicit command's promise graph may keep its command
context; a detached, persisted, or independently scheduled retry root may not.

This separation is enforced at the workflow roots and with propagation tests.
It is clearer and more durable than depending on a grant expiring at roughly
the desired time.

## Authoritative Enforcement and Current-State Validation

All production protected operations enter the same Coordinator seam:

- generic API fallback and profile-isolated fetches;
- Turnstile fetches;
- native-page actions;
- OpenRouter management-key page actions;
- generic session reads;
- exact New API channel-key session reads;
- LDOH site-index refresh;
- forced incognito or cookie-store isolation.

Dormant rendered-title and open-context task support has no product-feature
owner and therefore fails the exact feature-to-task-kind check.

`forceTempWindow` and browser-profile isolation describe technical necessity;
they never elevate a denied invocation.

The Coordinator supplies the authorization callback, but the pool owns its
timing. The final policy decision occurs inside the same-origin acquire lock,
after scheduler admission and immediately before reuse or creation. An early
caller-side decision may improve feedback but is never a permit.

The Coordinator reads current values rather than trusting workflow-start
snapshots:

- current automatic master and per-feature preferences;
- current browser permissions and capability;
- current managed-site identity, origin, user, channel, or other
  operation-specific resource facts.

A resource-sensitive task carries the one exact target descriptor needed for
that operation. A batch fans out several individually described tasks while
sharing the immutable execution value; it does not register or cache a batch
resource scope. The task resource remains input to current-state validation,
not proof that the operation is authorized.

Resource currentness is the callback's final asynchronous authorization fact.
There must be no unrelated `await` between successful current-resource
validation and returning the decision to the pool's acquisition logic. After
an allowed decision, the pool immediately proceeds to reuse or creation. This
prevents a hidden-key or managed-site operation from using a resource that
changed while policy or capability checks were awaiting.

This current-resource check preserves the correctness benefit previously
attributed to grant resource scopes without caching authorization state. If the
target is no longer current, the command fails with a controlled stale-resource
reason and the user may retry.

Reusing an already pooled context still requires the same decision. Otherwise,
an automatic caller could bypass current policy whenever another workflow left
a reusable context behind.

The dormant `handleOpenTempWindow` helper cannot mint manual intent from sender
or surface. Because `OpenContext` has no product-feature owner, any such task is
rejected by the exact feature-to-task-kind check. Removing the dormant helper is
a separate cleanup decision. Browser tab/window creation helpers remain private
to the pool.

## Product-Feature Preferences and Migration

Replace the legacy usage-scope fields with one automatic feature map:

```ts
interface TempWindowFallbackPreferences {
  enabled: boolean
  automaticFeatureBypass: Record<
    ProtectionBypassAutomaticFeature,
    boolean
  >
  tempContextMode: TempContextMode
}
```

`enabled` remains the automatic master switch. `tempContextMode` remains the
preferred temporary-context Adapter. `automaticFeatureBypass` answers only
whether that product feature's automatic execution may acquire a protected
context.

One canonical normalizer rebuilds `tempWindowFallback` rather than
deep-merging it. It is used by local schema migration, manual backup import, and
WebDAV import:

```text
enabled                    -> preserve the selected snapshot value
tempContextMode            -> preserve the selected snapshot value
current-version v2 key     -> preserve its valid boolean value
legacy account_refresh     -> legacy useForAutoRefresh, then embedded v2,
                              then local v2, then true
other legacy feature keys  -> embedded v2, then local v2, then true
missing current-version key -> local v2 when importing, otherwise true
```

The source preference schema version selects the branch before field
precedence is evaluated. This matters because an old client may preserve the
unknown v2 map while stamping the document with its legacy schema version. In
that case a newly changed `useForAutoRefresh` is authoritative for
`account_refresh`; the stale embedded v2 value must not win. For a
current-version payload, the canonical v2 map is authoritative and any leftover
legacy field is ignored.

Delete `useInPopup`, `useInSidePanel`, `useInOptions`, `useForAutoRefresh`, and
`useForManualRefresh` from persisted preferences, types, defaults, import/export
data, WebDAV-synchronized settings, analytics snapshots, and runtime policy.
The one-time migration may read `useForAutoRefresh` to preserve its stated
account-refresh intent, but no runtime compatibility branch or stale key
remains afterward.

Local migration runs under the existing preference write lock and atomically
persists the rebuilt latest-version object before exposing it. A schema-only
rewrite preserves `sharedPreferencesLastUpdated`; it is not a user edit. A
user's later toggle change stamps that timestamp normally.

WebDAV keeps its existing whole-preference timestamp winner. After choosing
the incoming snapshot, normalization receives the current local preferences as
a fallback only for v2 feature keys absent from an older payload. Thus a
newer-timestamp legacy client may still change shared `enabled`,
`tempContextMode`, and the legacy account-refresh choice without resetting the
other seven v2 choices.
Every accepted import is atomically saved in canonical form, and every later
upload contains only the canonical map. This import normalization is persisted
data migration, not a runtime policy compatibility adapter.

This deliberately does not attempt to translate old surface opt-outs. A
surface can host several product features, and a product feature can cross UI
and background surfaces, so no lossless mapping exists. Manual-refresh opt-out
also disappears because explicit user commands are no longer policy-gated.

## Settings Behavior

Replace the `shield-contexts` card with "Automatic features allowed to open a
temporary verification page" controls for the eight automatic features. Keep
the automatic master, Adapter mode, permission entry, `refresh` tab, and
`shield-settings` section anchor.
The rendered page has exactly one `shield-settings` DOM id; remove the current
duplicate wrapper id while preserving the public anchor.

The UI explains:

> These choices only control whether an automatically running feature may open
> a temporary page when site verification is required. They do not enable or
> disable the feature itself and do not affect actions you start yourself.

The automatic master may disable effective use without disabling the child
controls. An owning product feature's own enabled state does not clear, disable,
or rewrite its bypass preference. Remove the five old search targets and add
one target per automatic feature. Locale resources stay synchronized across all
supported application locales.

Legacy block-status and reminder helpers stop reading page-surface and manual
refresh fields. Any remaining reminder consumes an invocation-aware policy
result and must not describe an eligible explicit command as disabled merely
because the automatic master or a feature switch is off.

## Policy Matrix

| Invocation | Decision |
| --- | --- |
| Valid explicit user command | Validate its product feature and exact task kind, then evaluate capability and resource facts; automatic settings do not deny it |
| Automatic invocation with `enabled: false` | Deny as `automatic_disabled` |
| Automatic invocation with its feature disabled | Deny as `feature_disabled` |
| Automatic invocation with master and feature enabled | Validate exact task kind, then evaluate capability and resource facts |
| Recognized execution version mismatch | Deny as `execution_version_mismatch` and ask the caller to refresh its extension page |
| Missing or malformed execution | Deny as `missing_execution` or `invalid_execution` |
| Feature/task mismatch | Deny as `task_not_permitted` |
| Unavailable permissions or browser support | Deny with the existing capability classification |
| Resource changed before acquire | Deny as stale or invalid resource |
| Cleanup of an existing context | Allow |

An operation that already acquired a context may finish and clean up after a
preference change. Queued work must re-evaluate current state before acquire or
reuse.

## Error Behavior

Controlled internal denial reasons no longer include grant lifecycle failures:

```ts
type ProtectionBypassDeniedReason =
  | "automatic_disabled"
  | "feature_disabled"
  | "execution_version_mismatch"
  | "missing_execution"
  | "invalid_execution"
  | "task_not_permitted"
  | "resource_stale"
  | "permission_required"
  | "unsupported_environment"
  | "policy_unavailable"
```

Preserve existing public compatibility codes where practical:

- product-policy denials map to `TEMP_WINDOW_DISABLED`;
- missing permissions map to `TEMP_WINDOW_PERMISSION_REQUIRED`;
- recognized version mismatch maps to
  `TEMP_WINDOW_EXECUTION_VERSION_MISMATCH` with a refresh-page fallback;
- missing or malformed execution, unavailable policy, and stale resource map
  to a typed policy-context classification and never trigger an unrelated
  "enable protection bypass" reminder;
- user-visible errors provide a stable local fallback and retain safe useful
  detail where available.

An automatic policy denial remains quiet unless an existing result or health
surface needs to explain degraded behavior. An explicit command is never
denied by automatic or surface preferences. Permission, unsupported
environment, and stale-resource errors provide an actionable local fallback
and may retain safe diagnostic detail in the affected user's private UI.

## Telemetry

Continue using the bounded daily protection-bypass summary. Record controlled
dimensions only:

- feature and invocation kind;
- automatic trigger;
- operation and decision;
- controlled denial reason;
- selected Adapter for allowed operations.

Reuse the existing settings snapshot and daily summary rather than adding
per-toggle action events. The settings snapshot records eight fixed boolean
fields; the daily summary accepts only the canonical feature values. Update the
typed payload, aggregate snapshot, privacy allow-list, and focused tests
together. Do not send dynamic feature keys.

Remove grant lifecycle and invalid-grant counters. Never record execution
objects, commands as free-form strings, URLs, origins, hosts, account IDs,
site names, request IDs, raw errors, or backend messages.

The separate daily-summary rollover and atomic-merge behavior is not redesigned
by this architectural simplification. Any correction there should be handled
as an independently tested telemetry task.

## Migration Sequence

Use a test-first refactor on the follow-up task branch:

1. Characterize every automatic construction root and explicit command that
   can reach a protected task.
2. Introduce the product-feature catalog, automatic subset, exact
   feature-to-task-kind matrix, and version-2 execution parser.
3. Reclassify workflow roots. Move execution creation out of low-level model
   service factories and remove the unused automatic execution from
   `ModelRedirectService`.
4. Split the generic verification command into product-owned key, channel, and
   model commands where those explicit workflows can reach protected work.
5. Replace Coordinator policy fields and denial reasons while preserving the
   acquire-time validation order and unconditional cleanup.
6. Add the new preference shape and canonical migration, explicitly rebuilding
   and atomically persisting the stored object without the five legacy keys,
   including import and cross-version WebDAV normalization.
7. Replace the settings card, search targets, locale copy, settings snapshots,
   privacy allow-list, and daily summary dimensions.
8. Update focused service, propagation, Coordinator, settings, migration,
   analytics, and browser-level regressions.
9. Run locale extraction, staged validation, push validation, targeted
   Chromium E2E, and final diff inspection.

Do not keep a runtime compatibility adapter for old preferences or execution
feature values. Preference migration is one-time persisted-data conversion;
wire-version mismatch fails closed and asks an old extension page to refresh.

## Testing

### Execution and policy tests

- automatic master disabled denies UI lifecycle, schedule, retry, and recovery;
- each of the eight automatic product-feature settings denies only its owning
  automatic work;
- valid explicit refresh, check-in, onboarding, key, channel, and model
  commands remain eligible when the automatic master or matching feature is
  disabled;
- automatic parsing rejects manual-only features;
- a version-1 execution sent through the runtime handler returns the dedicated
  mismatch code and actionable refresh fallback without entering the pool;
- missing, malformed, or unknown execution values fail closed;
- runtime catalogs, derived unions, parsers, and exhaustive task mappings stay
  synchronized without a separately maintained string list;
- feature-to-task-kind mismatches fail as `task_not_permitted` even when two
  task kinds share an operation;
- `forceTempWindow`, incognito, and cookie-store requirements never elevate a
  denied request;
- policy read failure returns `policy_unavailable`;
- cleanup remains allowed after policy changes.

### Propagation and architecture tests

- refresh one and refresh all preserve the same explicit command value through
  account storage, Site Adapter Capability, API transport, and fallback;
- manual check-in and onboarding preserve their command context;
- scheduled and open-time account refresh remain `account_refresh`;
- balance-history capture, redemption follow-up, LDOH refresh, key-management
  loading, channel matching, and model sync use their audited product owner;
- UI-open pretrigger, alarms, scheduled retry, and true background recovery are
  classified as automatic with their real trigger and surface;
- retry records and delayed automatic roots never persist or inherit a
  user-command execution;
- fan-out may reuse immutable execution data without registration;
- API fallback, profile-isolated fetch, Turnstile, check-in page action,
  OpenRouter management-key action, and generic and New API session reads all
  enter the Coordinator;
- dormant rendered-title and open-context task kinds are authorized for no
  feature and have no production caller or workflow root;
- runtime messages contain one authoritative execution value, canonical task
  params contain no duplicate intent/source value, and pool presentation source
  is derived from `execution.surface`;
- no runtime handler or exported helper can call protected tab/window creation
  outside the private pool seam;
- no grant registry, begin/end action, verified continuation, or grant ID
  remains reachable or exported;
- `ModelRedirectService` does not invent an automatic execution; model-sync
  post-processing inherits model-sync execution, and any future protected
  redirect UI action starts from a dedicated user command.

### Acquire-time correctness tests

- queued work re-reads policy before acquire or reuse;
- an existing pooled context cannot bypass a later deny;
- capability changes while queued are observed;
- managed-site or hidden-key resource changes during an awaited policy or
  capability check are denied;
- current-resource validation is the last asynchronous authorization fact
  before acquire.

### UI, locale, search, and analytics tests

- disabling automatic bypass leaves explicit commands eligible;
- the eight controls describe permission to use automatic bypass rather than
  enabling their product features;
- child choices remain editable while the master or owning product feature is
  disabled;
- preference migration preserves `enabled`, `tempContextMode`, and the stated
  account-refresh intent while physically removing all five legacy keys;
- valid existing v2 feature choices survive repeat normalization;
- local migration atomically writes the canonical object without advancing the
  shared-preferences timestamp;
- old backup imports and synchronized settings pass through the same
  normalizer;
- a winning legacy WebDAV payload preserves local v2-only choices, maps its
  account-refresh choice, and cannot create a sync reset loop;
- a full v2 upload, legacy-client account-refresh edit, and v2 re-import round
  trip applies that legacy edit while preserving the other seven choices;
- settings search removes old scope targets and exposes all eight features;
- all supported application locales keep the same key shape;
- settings snapshots, daily summaries, and privacy sanitizers accept only
  fixed controlled fields and no grant, URL, site, account, or backend data.

### Browser-level regression

Retain one deterministic Playwright scenario in the built extension:

1. enable the automatic master and disable automatic bypass for check-in;
2. trigger the automatic UI-open check-in path whose fixture requests a
   temporary page;
3. assert that no temporary tab or window is created;
4. start the corresponding explicit check-in command;
5. assert that its temporary context is allowed.

Update the existing settings/deep-link browser flow to prove the replacement
feature controls are reachable. Do not add one E2E scenario per product
feature; Vitest covers the exhaustive policy and classification matrix.

Use fixture data and reserved example domains. Vitest covers the policy matrix;
Playwright covers the cross-entrypoint extension-runtime risk.

## Non-Goals

- Do not add a second-level scenario taxonomy or one setting per call site.
- Do not remove the automatic master switch.
- Do not use product-feature settings to enable or disable the owning feature.
- Do not turn presentation `surface` back into an authorization input.
- Do not redesign Tab, Window, or Composite lifecycle and concurrency.
- Do not cancel a protected operation after it has acquired its context.
- Do not treat internal intent metadata as a security boundary against
  compromised extension code.
- Do not persist user-command execution into schedules or retries.
- Do not infer intent from function names, stack traces, URLs, hosts, runtime
  sender, or entrypoint.
- Do not change Site Adapter Capability facts without separate evidence.

The internal-trust assumption must be revisited if the extension later adds
`externally_connectable`, `onMessageExternal`, `onConnectExternal`, or another
external message entrypoint capable of submitting protected tasks.

## Maintainability Decision

The Coordinator remains a deep Module. Deleting it would redistribute policy,
capability, acquire timing, resource currentness, error mapping, and telemetry
across every protected caller. Its single `execute` Interface provides
Leverage and Locality.

Explicit execution propagation also remains necessary. Deleting it would force
each convergence point to infer intent from unreliable ambient facts.

The grant system does not pass the same deletion test under the clarified
requirements. Removing it eliminates registry ownership, runtime lifecycle,
expiry, revocation, restart invalidation, sender binding, WeakMap continuation
state, and grant-specific tests without requiring equivalent logic elsewhere.
The only lost property is background-independent proof that a user command is
still active, and no current product behavior consumes that property.

The pool remains a separate deep Module for browser resource lifecycle. It
accepts only Coordinator-approved work and owns navigation, context reuse,
mode fallback, Adapter selection, page lifecycle, and cleanup—not product
intent or settings.

The canonical runtime catalog removes duplicated protocol literals without
creating a generic constants bucket. Each value family stays owned by the
Protection Bypass Module (or aliases an existing owner), and downstream types,
validators, switches, error mapping, and telemetry derive from it.

The product-feature catalog replaces `site_detection`, `session_resync`, and
generic `verification` ownership with user-recognizable feature boundaries.
The automatic subset, command mapping, feature-to-task-kind matrix, settings,
and telemetry all derive from this catalog rather than maintaining parallel
string lists. Detailed triggers and operations remain diagnostic dimensions,
not user configuration.

This revision also removes misleading low-level execution creation. A workflow
root owns product intent; service factories accept and forward execution but do
not manufacture a background identity. Model redirect UI methods currently do
not consume protected execution and therefore carry none. Automatic redirect
post-processing stays part of model sync and inherits the model-sync execution.

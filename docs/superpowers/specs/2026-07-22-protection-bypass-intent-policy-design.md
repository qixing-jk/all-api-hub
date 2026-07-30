# Protection Bypass Intent Policy Design

Date: 2026-07-22
Revised: 2026-07-29

## Revision Status

This revision supersedes the original background grant design for the same
feature. The original design correctly established explicit invocation intent,
a single background Coordinator, and acquire-time enforcement, but it treated
an internal product-policy distinction as if it needed a short-lived
authorization capability.

The extension's protected workflows and runtime messages are internal trusted
code paths. This feature is not a security boundary against compromised
extension code, and no current product requirement depends on revocation,
expiry, ownership transfer, or survival across a service-worker restart.
Consequently, the final design keeps explicit intent propagation and removes
the grant registry, grant lifecycle, and verified-continuation machinery.

The already executed implementation plan must be revised before implementation
continues. This document is the design authority for that replan.

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
native-page actions, rendered-title reads, site detection, and forced
browser-profile isolation could reach the background pool through other paths.
The design must close that enforcement gap without introducing a second
authorization system.

## Product Semantics

The current product rule is:

> Disabling automatic protection bypass denies automatic work. Explicit user
> commands may still use the configured temporary context.

Examples of explicit user commands include:

- refresh one account or all accounts;
- run a manual check-in;
- add, detect, or reauthenticate an account;
- start a user-visible verification command, including a
  verification-backed model-sync workflow.

The following remain automatic even when opening the extension was itself a
user gesture:

- refresh-on-open and other UI-mount work;
- UI-open check-in pretriggers;
- scheduled refresh or check-in;
- detached or scheduled retries and background recovery;
- session resynchronization not owned by an active user command;
- automatic site detection not owned by an active onboarding command.

An explicit command's context covers the awaited and delegated work that is
part of that workflow. It does not implicitly authorize a later scheduled
retry. A retry root creates a new automatic context.

Current manual-refresh and surface preferences remain compatibility policy in
this refactor so stored settings and user-visible behavior do not change
incidentally. They are not trusted evidence of user intent. The planned product
direction replaces them with per-automatic-feature settings; that migration is
outside this revision.

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
- user-command identity;
- the canonical protected-task union and task-owned operation metadata;
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
- repeated grant resolution before dispatch and again before acquire.

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
  account, check-in, onboarding, and verification orchestration.

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
| Features | existing `PROTECTION_BYPASS_FEATURES` |
| User commands | existing `PROTECTION_BYPASS_USER_COMMANDS` |
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
      feature: ProtectionBypassFeature
      trigger: ProtectionBypassAutomaticTrigger
      surface: ProtectionBypassSurface
    }
```

The branch-local version-1 contract has not shipped, so replacing its
`grantId` member does not require a persisted-data migration. Runtime parsing
still validates the discriminant and every enum value so malformed or stale
messages fail closed.

For a user command, the Coordinator derives the top-level feature from one
canonical command definition. For example, a rendered-title read during
account onboarding remains owned by `account_onboarding`; its leaf operation
is still `rendered_title`. The caller does not independently claim both a
command and a feature.

The command definition maps a command to its feature only. It contains no
lease duration, resource scope, or stateful allowed-operation grant. A separate
static feature-to-operation matrix remains a useful correctness invariant: the
Coordinator rejects a task whose operation does not belong to the derived
feature. That check is deterministic contract validation, not authorization
state.

`surface` is retained only while legacy surface settings remain in the
product. It is presentation and compatibility metadata:

- it never proves a user gesture;
- it is not compared with runtime sender or tab ownership;
- it is not stored in a registry;
- it can be removed from the execution contract when the legacy settings are
  replaced.

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
    execution: ProtectionBypassExecution | undefined,
    task: TTask,
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
2. derives command, feature, operation, and cause metadata;
3. constructs an `authorizeAtAcquire` callback and submits the task plus that
   callback to the pool;
4. lets the pool complete scheduler admission and take the same-origin acquire
   lock;
5. from inside that lock, the pool invokes the callback, which reads current
   product policy and browser capability;
6. the callback validates current resource state as its last asynchronous fact
   and synchronously returns the decision;
7. the pool immediately reuses or creates the context after an allowed
   decision;
8. the Coordinator maps controlled denials and records privacy-safe summary
   telemetry.

The Coordinator does not orchestrate account refresh, check-in, onboarding, or
verification. The pool does not read product preferences or infer intent.

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
5. The Coordinator derives `account_refresh`, evaluates current compatibility
   preferences and capability, performs final resource validation, then allows
   or denies the acquire.
6. When the refresh promise settles, there is no grant to revoke.

Concurrent refresh-all fan-out may share the same immutable execution value.
Its lifetime is the workflow's ordinary promise graph, not a clock-based lease.

### Account onboarding

1. The explicit add or detect-account action creates an onboarding command
   context.
2. Site detection, session reads, and verification forward it unchanged.
3. Their owning Modules select the appropriate protected task.
4. Automatic detection outside that workflow constructs an automatic
   `site_detection` context and cannot become manual merely because it runs
   from the same entrypoint.

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

All protected operations enter the same Coordinator seam:

- generic API fallback and profile-isolated fetches;
- Turnstile fetches;
- native-page actions;
- OpenRouter management-key page actions;
- rendered-title and session reads;
- exact New API channel-key session reads;
- site-detection operations;
- explicit open-context commands;
- forced incognito or cookie-store isolation.

`forceTempWindow` and browser-profile isolation describe technical necessity;
they never elevate a denied invocation.

The Coordinator supplies the authorization callback, but the pool owns its
timing. The final policy decision occurs inside the same-origin acquire lock,
after scheduler admission and immediately before reuse or creation. An early
caller-side decision may improve feedback but is never a permit.

The Coordinator reads current values rather than trusting workflow-start
snapshots:

- current automatic and compatibility preferences;
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

`handleOpenTempWindow` accepts an existing execution value and submits an
`open_context` task. It does not mint manual intent from sender or surface.
Browser tab/window creation helpers remain private to the pool.

## Preference Compatibility and Future Settings

Do not migrate stored preference fields as part of the grant removal:

```text
enabled             -> automatic.masterEnabled
useForAutoRefresh   -> current automatic account-refresh compatibility gate
useForManualRefresh -> current explicit refresh compatibility gate
useInPopup          -> current popup compatibility gate
useInSidePanel      -> current side-panel compatibility gate
useInOptions        -> current options compatibility gate
tempContextMode     -> preferred temporary-context Adapter
```

The stored name `enabled` is a legacy implementation detail whose current
product meaning is automatic protection-bypass enablement.

The manual and surface settings remain behavior-preserving compatibility gates
only. This revision deliberately does not deepen their role or create new
surface ownership validation because workflows cross popup, options,
side-panel, content-script, and background boundaries.

The intended later model is automatic feature policy:

```text
automatic.masterEnabled
automatic.features.account_refresh
automatic.features.checkin
automatic.features.site_detection
automatic.features.session_resync
automatic.features.verification
```

The existing `automatic.feature` field gives that future policy one stable
input. Adding those settings and deprecating the legacy manual/surface gates is
a separate product change. A total kill switch is not currently planned; if it
is reconsidered later, it is also an independent policy change. Neither change
requires modifying execution propagation or reintroducing grants.

## Settings Behavior Preserved by This Revision

The main switch continues to be presented as automatic protection bypass, not
as a promise that no explicit command can ever open a temporary context.
Disabling it must not make the mode, manual-refresh, or legacy surface controls
uneditable while those controls still exist. Existing settings-search targets,
the `refresh` tab, and the `shield-settings` anchor remain stable.

No locale, settings-search, deep-link, or telemetry snapshot wording should
regress to describing `enabled` as a total kill switch. The grant removal itself
adds no new user-facing control.

## Policy Matrix

| Invocation | Current decision |
| --- | --- |
| Valid explicit refresh command | Evaluate current manual-refresh and surface compatibility, capability, and resource facts; automatic master does not deny it |
| Other valid explicit command | Evaluate current surface compatibility, capability, and resource facts; automatic master does not deny it |
| Automatic invocation with `enabled: false` | Deny as `automatic_disabled` |
| Automatic invocation with `enabled: true` | Evaluate current feature compatibility, surface compatibility, capability, and resource facts |
| Missing or malformed execution | Deny as `missing_intent` or `invalid_intent` |
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
  | "surface_disabled"
  | "manual_feature_disabled"
  | "missing_intent"
  | "invalid_intent"
  | "operation_not_permitted"
  | "resource_stale"
  | "permission_required"
  | "unsupported_environment"
  | "policy_unavailable"
```

Preserve existing public compatibility codes where practical:

- product-policy denials map to `TEMP_WINDOW_DISABLED`;
- missing permissions map to `TEMP_WINDOW_PERMISSION_REQUIRED`;
- missing or malformed intent, unavailable policy, and stale resource map to a
  typed policy-context classification and never trigger an unrelated
  "enable protection bypass" reminder;
- user-visible errors provide a stable local fallback and retain safe useful
  detail where available.

An explicit command denied by a current compatibility setting should identify
the setting that blocked it. An automatic denial remains quiet unless an
existing result or health surface needs to explain degraded behavior.

## Telemetry

Continue using the bounded daily protection-bypass summary. Record controlled
dimensions only:

- feature and invocation kind;
- automatic trigger;
- operation and decision;
- controlled denial reason;
- selected Adapter for allowed operations.

Remove grant lifecycle and invalid-grant counters. Never record execution
objects, commands as free-form strings, URLs, origins, hosts, account IDs,
site names, request IDs, raw errors, or backend messages.

The separate daily-summary rollover and atomic-merge behavior is not redesigned
by this architectural simplification. Any correction there should be handled
as an independently tested telemetry task.

## Migration Sequence

Use a behavior-preserving, test-first refactor on the current task branch:

1. Characterize current observable behavior at execution roots, Coordinator
   policy decisions, acquire-time validation, runtime transport, and the
   protected pool seam.
2. Change the execution contract from `grantId` to explicit command data and
   make user/automatic constructors pure. Centralize the runtime value families
   listed above and derive their unions and validation sets.
3. Update workflow roots and propagation paths without changing their product
   classifications.
4. Simplify the Coordinator to consume execution directly and make current
   resource validation the final asynchronous acquire-time fact.
5. Remove begin/end runtime actions, the grant registry, verified
   continuations, grant profiles, and their lifecycle tests.
6. Normalize runtime transport to one envelope-level execution value, remove
   duplicated execution and source members from canonical task params, and
   derive the pool presentation source from `execution.surface`.
7. Update controlled errors and telemetry to remove grant-only states while
   retaining deterministic `operation_not_permitted` contract validation.
8. Retain and strengthen architecture tests proving every protected operation
   enters only through the Coordinator.
9. Run focused behavior and propagation suites, locale extraction when
   affected, the staged validation gate, the push validation gate, and the
   deterministic browser-level regression.

No compatibility shim should preserve the grant path. It would keep two
architectures alive for an unpublished internal contract.

## Testing

### Execution and policy tests

- automatic master disabled denies UI lifecycle, schedule, retry, and recovery;
- valid explicit refresh, check-in, onboarding, and verification commands,
  including a verification-backed model-sync workflow, remain eligible when
  the automatic master is disabled;
- current manual and surface compatibility gates retain their existing
  behavior;
- missing, malformed, or unknown execution values fail closed;
- runtime catalogs, derived unions, parsers, and exhaustive task mappings stay
  synchronized without a separately maintained string list;
- feature-to-operation mismatches fail as `operation_not_permitted` without any
  stateful grant lookup;
- `forceTempWindow`, incognito, and cookie-store requirements never elevate a
  denied request;
- policy read failure returns `policy_unavailable`;
- cleanup remains allowed after policy changes.

### Propagation and architecture tests

- refresh one and refresh all preserve the same explicit command value through
  account storage, Site Adapter Capability, API transport, and fallback;
- manual check-in and onboarding preserve their command context;
- UI-open pretrigger, alarms, scheduled retry, and background recovery are
  classified as automatic;
- retry records and delayed automatic roots never persist or inherit a
  user-command execution;
- fan-out may reuse immutable execution data without registration;
- Fetch, TurnstileFetch, CheckinPageAction, OpenRouter management-key actions,
  RenderedTitle, generic and New API session reads, and open-context runtime
  actions all enter the Coordinator;
- runtime messages contain one authoritative execution value, canonical task
  params contain no duplicate intent/source value, and pool presentation source
  is derived from `execution.surface`;
- no runtime handler or exported helper can call protected tab/window creation
  outside the private pool seam;
- no grant registry, begin/end action, verified continuation, or grant ID
  remains reachable or exported.

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
- existing compatibility controls retain current behavior until their later
  replacement;
- settings search and locale wording continue to describe the switch as
  automatic bypass;
- daily summaries and privacy sanitizers accept only controlled enums and no
  grant data.

### Browser-level regression

Retain one deterministic Playwright scenario in the built extension:

1. disable automatic protection bypass;
2. trigger an automatic UI-open path whose fixture requests a temporary page;
3. assert that no temporary tab or window is created;
4. start the corresponding explicit user command;
5. assert that its temporary context is allowed.

Use fixture data and reserved example domains. Vitest covers the policy matrix;
Playwright covers the cross-entrypoint extension-runtime risk.

## Non-Goals

- Do not add per-feature settings in this refactor.
- Do not add a total protection-bypass kill switch.
- Do not remove or redesign the legacy manual/surface settings yet.
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

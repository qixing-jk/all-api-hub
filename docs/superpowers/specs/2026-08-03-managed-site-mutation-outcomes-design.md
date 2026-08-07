# Managed-Site Mutation Outcomes Design

## Summary

Managed-site write surfaces currently use three incompatible contracts:

- channel capabilities return `ApiResponse`, while providers either reject or
  return `success: false`;
- transitional upstream-resource capabilities return another `ApiResponse`
  alias;
- native resource definitions use a four-certainty result internally, then
  convert it to thrown `ManagedResourceError` at the public workspace boundary.

This split makes mutation effects, replay safety, and diagnostic disclosure
depend on the provider or caller. Replace the mixed contracts with one
provider-neutral, dispatch-aware mutation result for every managed-site write
surface. Expected operational failures become explicit results. Unexpected
programming errors and violated internal invariants may still throw.

The refactor is an independent managed-site architecture change. It does not add
new product workflows, settings, telemetry events, or navigation surfaces.

## Goals

- Give all managed-site writes one exhaustive runtime and TypeScript contract.
- Distinguish confirmed success, confirmed non-application, confirmed partial
  effect, and unknown effect.
- Base replay safety on dispatch and effect evidence, not message text, HTTP
  status alone, provider type, or exception class alone.
- Preserve original upstream diagnostics internally, including status, code,
  message, nested causes, and the original value when available.
- Redact secrets only when a result crosses an output boundary.
- Represent confirmed partial effects structurally.
- Require reconciliation before replay whenever an effect is partial or unknown.
- Remove the old mutation `ApiResponse`, native certainty, and throw/result split
  from managed-site domain boundaries.

## Non-goals

- Changing provider request payloads or upstream API behavior.
- Adding unrelated managed-site features or workflows.
- Adding telemetry events, settings, search targets, or deep links.
- Persisting raw mutation diagnostics.
- Making low-level REST and GraphQL clients share one transport abstraction.
- Treating every thrown JavaScript error as an expected remote failure.
- Changing read, search, secret-reveal, or draft-validation contracts.

## Complete Mutation Surface

The refactor covers every managed-site domain write, not only channel CRUD.

| Surface | Current contract | Target contract |
| --- | --- | --- |
| `ManagedSiteChannelsCapability.create/update/delete` | `ApiResponse`, optional delete certainty, mixed reject/resolve | common mutation result |
| `ManagedSiteChannelsCapability.updateModels/updateModelMapping` | `Promise<void>` with thrown failures | common mutation result |
| `ManagedSiteService` mutation facade | channel `ApiResponse` and thrown auxiliary failures | common mutation result |
| `ManagedUpstreamResourcesCapability.items.create/update/delete` | `ManagedUpstreamResourceMutationResponse` aliasing `ApiResponse` | common mutation result |
| `NativeResourceKindDefinition.create/update/delete` | `NativeResourceMutationResult` | common mutation result |
| `ResourceEditor.submit` and `ManagedResourceWorkspace.delete` | success value/`void` or thrown `ManagedResourceError` | common mutation result |
| Channel migration, model sync/redirect, resource controllers, and channel UI mutation callers | provider-specific checks or exception handling | exhaustive outcome switch |

`NativeResourceMutationResult`, `ManagedUpstreamResourceMutationResponse`,
`ManagedSiteChannelDeleteResponse`, and provider-local mutation-certainty
classifiers are removed after migration.

Low-level REST/GraphQL clients are not domain mutation surfaces. They may retain
native mechanics, but must preserve the evidence required by the capability
adapter: original cause, status/code/message, and reliable dispatch state.

## Domain Contract

### Runtime Constants

```ts
export const MANAGED_SITE_MUTATION_OUTCOMES = {
  Succeeded: "succeeded",
  Rejected: "rejected",
  Partial: "partial",
  Uncertain: "uncertain",
} as const

export const MANAGED_SITE_MUTATION_COMPLETIONS = {
  Rejected: "rejected",
  Uncertain: "uncertain",
} as const
```

Types derive from these runtime constants. Callers do not duplicate outcome
strings.

### Internal Diagnostic

```ts
export interface ManagedSiteMutationDiagnostic {
  message: string
  code?: string | number
  statusCode?: number
  raw?: unknown
}
```

`raw` may contain an `Error`, an upstream envelope, or another non-serializable
value. Its nested `cause` chain remains available through `raw`; it is not copied
into a separately serializable field.

### Confirmed Effects

```ts
export const MANAGED_SITE_MUTATION_EFFECT_KINDS = {
  ResourceCreated: "resource-created",
  ResourceUpdated: "resource-updated",
  ResourceDeleted: "resource-deleted",
  StatusUpdated: "status-updated",
  ModelsUpdated: "models-updated",
  ModelMappingUpdated: "model-mapping-updated",
} as const

export interface ManagedSiteMutationConfirmedEffect {
  kind: ManagedSiteMutationEffectKind
  resourceKind: ManagedResourceKind | "channel"
  resourceId?: string | number
}

type NonEmptyReadonlyArray<T> = readonly [T, ...T[]]
```

Effect and resource kinds are provider-neutral, finite, and runtime-validated.
`resourceId` is internal and optional because some successful writes do not
return a stable identifier. Provider-specific step names remain inside the raw
diagnostic rather than expanding the public effect vocabulary.

### Result

```ts
export type ManagedSiteMutationResult<
  TData = void,
  TEffect extends ManagedSiteMutationConfirmedEffect =
    ManagedSiteMutationConfirmedEffect,
> =
  | {
      outcome: "succeeded"
      data: TData
      confirmedEffects: readonly TEffect[]
      message?: string
    }
  | {
      outcome: "rejected"
      diagnostic: ManagedSiteMutationDiagnostic
    }
  | {
      outcome: "partial"
      data?: TData
      confirmedEffects: NonEmptyReadonlyArray<TEffect>
      completion: "rejected" | "uncertain"
      diagnostic: ManagedSiteMutationDiagnostic
    }
  | {
      outcome: "uncertain"
      diagnostic: ManagedSiteMutationDiagnostic
    }
```

For `void` mutations, success uses `data: undefined`; operation-specific aliases
may hide this detail for ergonomics without changing the discriminated union.

### Semantics

- `succeeded`: the requested final state is confirmed. `confirmedEffects` lists
  the confirmed writes and is non-empty for every non-idempotent write. It may
  be empty for effect-free idempotent success such as a delete whose target is
  already confirmed absent.
- `rejected`: the adapter has affirmative evidence that no requested mutation
  effect occurred.
- `partial`: at least one effect is confirmed, but the requested final state is
  not confirmed. `completion` records whether the terminal step was definitely
  rejected or has an unknown effect.
- `uncertain`: no effect is confirmed, but a mutation may have occurred.

Callers switch exhaustively on `outcome`. They do not infer mutation state from
messages, status codes, provider type, or exception classes.

## Typed Execution Evidence

### Evidence Model

The shared normalizer consumes explicit evidence rather than guessing from a
response alone.

```ts
export const MANAGED_SITE_MUTATION_DISPATCH_STATES = {
  NotDispatched: "not-dispatched",
  Dispatched: "dispatched",
} as const

export interface ManagedSiteMutationStepEvidence<
  TEffect extends ManagedSiteMutationConfirmedEffect,
> {
  dispatch: ManagedSiteMutationDispatchState
  confirmedEffects: readonly TEffect[]
  nonApplication: "confirmed" | "unknown"
}

export const MANAGED_SITE_MUTATION_FINAL_STATES = {
  Confirmed: "confirmed",
  Unconfirmed: "unconfirmed",
} as const
```

This exported dispatch state is intentionally binary. It is the portable public
evidence carried by typed operational errors and adapter contracts: either the
transport boundary affirmatively knows the write was not handed off, or the
write must be treated as dispatched. The sequence composer separately tracks
the internal monotonic stages `not-dispatched`, `possibly-dispatched`, and
`response-received`; those stages must not be mistaken for additional public
`ManagedSiteMutationDispatchState` values.

Only a typed adapter assertion may set `nonApplication: "confirmed"`. A status
code, GraphQL error envelope, or resolved provider failure does not imply this by
itself.

### Classification Rules

1. `succeeded` requires an explicit `finalState: "confirmed"`; a success response
   alone is not sufficient. Non-idempotent success also requires at least one
   confirmed effect.
2. A recognized operational failure with `dispatch: "not-dispatched"` and no
   confirmed effect is `rejected`.
3. A provider may return `rejected` after dispatch only when its documented
   contract or response supplies affirmative evidence that no effect occurred.
4. Post-dispatch HTTP 5xx, protocol failures, GraphQL error envelopes, malformed
   upstream responses, network errors, aborts, and timeouts default to
   `uncertain` when no effect is confirmed.
5. When at least one effect is confirmed, any later rejection or ambiguity is
   `partial`; terminal evidence selects `completion`.
6. An idempotent operation may return `succeeded` only when the desired final
   state is affirmatively known, for example a delete whose target is confirmed
   absent.
7. Unexpected adapter output, malformed adapter-produced evidence, and violated
   internal invariants throw. Malformed upstream data is an operational protocol
   failure and follows rules 2–5.

Thrown programming/invariant errors bypass mutation-result projection but not
the application's existing sanitized global exception boundary. That boundary
must never emit request credentials, authentication material, or unprojected raw
provider values.

### Dispatch Ownership

The lowest layer that can reliably observe request dispatch owns the internal
transition from `not-dispatched` to `possibly-dispatched`:

- validation, configuration loading, request limiting, and queued cancellation
  remain `not-dispatched`;
- immediately before handing the mutation to fetch/GraphQL transport, the
  operation becomes `possibly-dispatched`;
- receiving HTTP headers or a GraphQL transport response becomes
  `response-received` before body parsing, without implying non-application;
- a typed low-level operational error carries dispatch state and preserves the
  original cause/status/code/message for the capability adapter.

When internal evidence crosses the public typed-error boundary,
`not-dispatched` maps to the public `NotDispatched` value, while both
`possibly-dispatched` and `response-received` map to `Dispatched`. Separate
response-received evidence may still be retained on the typed transport error;
it does not widen the public dispatch enum.

Existing typed dispatch evidence in native adapters maps into this protocol.
REST wrappers that currently replace failures must retain the original error as
`cause` and propagate dispatch state. Fixed-duration waits are never evidence of
dispatch or completion.

### Per-step Attempt And Sequence Composer

Each remote write step receives a fresh attempt object. Dispatch state is
monotonic within that step and resets only by beginning another explicit step:

```ts
interface ManagedSiteMutationStepAttempt<
  TEffect extends ManagedSiteMutationConfirmedEffect,
> {
  markPossiblyDispatched(): void
  markResponseReceived(): void
  confirmNonApplication(): void
  confirmEffect(effect: TEffect): void
  complete(): void
}

interface ManagedSiteMutationSequence<
  TEffect extends ManagedSiteMutationConfirmedEffect,
> {
  beginStep(): ManagedSiteMutationStepAttempt<TEffect>
  finish<TData>(
    input: { finalState: "confirmed"; data: TData },
  ): Extract<
    ManagedSiteMutationResult<TData, TEffect>,
    { outcome: "succeeded" }
  >
  finish<TData = never>(input: {
    finalState: "unconfirmed"
    data?: TData
    diagnostic: ManagedSiteMutationDiagnostic
  }): Exclude<
    ManagedSiteMutationResult<TData, TEffect>,
    { outcome: "succeeded" }
  >
}
```

`complete()` atomically registers that step's effects with the sequence and
closes the step. Beginning another step while one is active is invalid. Finishing
with an unconfirmed final state consumes the active step, if any, as the terminal
evidence; prior completed-step effects remain accumulated.

Finishing unconfirmed without an active or completed step is valid only for a
recognized failure before transport dispatch, such as configuration loading,
limiter rejection, or queued cancellation, and therefore classifies as
`rejected`. Once `beginStep()` has been called, an unfinished active step is
terminal evidence rather than an absent step.

`confirmNonApplication()` applies only to its step, so a second-step rejection
can truthfully become `partial/rejected` after a confirmed first step. The
`finalState: "confirmed"` finish branch is the only way to produce `succeeded`
and requires `data` even when its value is explicitly `undefined` for a void
mutation. It may follow a successful write response or a fresh read that
confirms an effect-free idempotent goal.

Runtime guards reject impossible combinations, including final-state
confirmation with an unresolved active step, overlapping or repeatedly completed
steps, step-local non-application after that same step confirmed an effect,
`partial` without accumulated effects, and non-idempotent success without an
effect.

## Architecture And Ownership

### Contract Layer

One pure contract module owns runtime constants, result/effect/evidence types,
and guards. Channel, transitional-resource, native-resource, service-facade, and
public-workspace write methods all import this contract.

Read, search, secret, and editor-validation failures continue using their
existing read-side contracts and `ManagedResourceError`; the unified Result is
specific to mutations.

### Normalization Layer

One shared managed-site mutation module owns:

- step-attempt, sequence, effect, and final-state transitions;
- bounded, cycle-safe, exception-safe nested `cause` traversal;
- deterministic diagnostic precedence: explicit typed operational fields first,
  then nearest recognized cause, then the outer safe message;
- recognition of native `TimeoutError`, `AbortError`, abort codes, transport
  network codes, and browser fetch failures;
- conversion of operational failures plus evidence into the four outcomes;
- runtime validation of mutation results;
- output projections described below.

Provider modules do not add independent uncertainty classifiers.

### Provider And Resource Adapters

Every current managed-site type migrates:

- New API
- Veloera
- DoneHub
- Octopus
- AxonHub
- Claude Code Hub

Single-step mutations use one step attempt and the shared sequence composer.
Multi-step mutations begin a new attempt for each remote step, accumulate effects
after each confirmed write, and compose one final result. A small provider mapper
may extract native codes or affirmative non-application evidence, but it cannot
invent another outcome model.

Known multi-step cases receive explicit tests:

| Provider/path | Confirmed first effect | Terminal step | Required result |
| --- | --- | --- | --- |
| New API update | fields updated | status update rejected | `partial/rejected` |
| New API update | fields updated | status update response lost | `partial/uncertain` |
| AxonHub create | resource created | enable rejected | `partial/rejected` |
| AxonHub create | resource created | enable response lost | `partial/uncertain` |
| AxonHub update | resource fields updated | status update rejected or ambiguous | matching `partial` result |

Other providers remain single-step unless current code proves otherwise.

### No Permanent Compatibility Shim

Migration may use temporary adapters inside the branch, but completion removes:

- mutation `ApiResponse` aliases;
- `NativeResourceMutationResult`;
- mutation-specific certainty helpers;
- public workspace conversion from native mutation result to thrown
  `ManagedResourceError`;
- caller branches that inspect `success`, catch expected mutation errors, or
  infer certainty from error codes.

## Diagnostic And Disclosure Boundaries

### Ephemeral Internal Result

The full result and `diagnostic.raw` are short-lived in-process values. They may
flow through the immediate promise/call stack, but must not be placed in React
state, event payloads, caches, persisted queues, extension messages, analytics,
or external reports.

Internal diagnostics preserve raw error/envelope values, nested causes, upstream
status, application code, and original messages. Raw data is never assumed to be
serializable or safely redacted recursively.

### Output Types

Each output boundary has a separate exact DTO and projector.

```ts
type ManagedSiteMutationProjectedOutcome =
  | { outcome: "succeeded"; completion?: never }
  | { outcome: "rejected"; completion?: never }
  | {
      outcome: "partial"
      completion: "rejected" | "uncertain"
    }
  | { outcome: "uncertain"; completion?: never }

declare const privateMutationOutputBrand: unique symbol
declare const persistedMutationStateBrand: unique symbol
declare const externalMutationSummaryBrand: unique symbol

export type ManagedSitePrivateMutationOutput =
  ManagedSiteMutationProjectedOutcome & {
    statusCode?: number
    code?: string | number
    message?: string
    readonly [privateMutationOutputBrand]: true
  }

export type ManagedSitePersistedMutationState =
  ManagedSiteMutationProjectedOutcome & {
    category?: ManagedSiteMutationControlledCategory
    readonly [persistedMutationStateBrand]: true
  }

export type ManagedSiteExternalMutationSummary =
  ManagedSiteMutationProjectedOutcome & {
    category?: ManagedSiteMutationControlledCategory
    readonly [externalMutationSummaryBrand]: true
  }
```

The persistence and external DTOs are deliberately separate even when their
initial fields coincide. Neither type accepts message, status/code, resource
data, identifiers, raw values, or arbitrary metadata. Their public TypeScript
forms are opaque, projector-produced types with distinct private brands, so one
boundary's DTO cannot be passed to another boundary accidentally; the brands do
not become serialized fields. A receiving boundary treats serialized values as
`unknown`, runs its sink-specific runtime validator, and only then returns the
corresponding branded type.

Projectors have separate signatures:

```ts
toPrivateManagedSiteMutationOutput(result, { knownSecrets })
toManagedSitePersistedMutationState(result)
toManagedSiteExternalMutationSummary(result)
```

### Private UI And Local Logs

The private projector consumes the entire mutation result, not only failures. It
drops `raw`, `data`, and confirmed-effect identifiers by default. It applies the
same redaction to success messages, failure messages, status/code strings, URL
userinfo/query text, nested-cause-derived text, and logger arguments.

Callers supply every known credential or secret value available from request,
runtime config, provider response, and source payload context. The projector
reuses the repository's existing safe-summary/redaction behavior where suitable.
It combines exact known-secret replacement with defense-in-depth structural
redaction for authentication headers, cookies, bearer values, URL userinfo,
sensitive query parameters, and recognizable credential-shaped fields. It
retains safe upstream status, code, message, deployment details, and backend
identifiers.

Raw errors/results are never passed directly to the logger. Local logs use only
the private projection plus controlled operation/provider labels.

If resource data must be shown, a separate feature-owned allow-list projector
selects its safe fields. Generic mutation projection never forwards `data`.

### Messaging, Persistence, Telemetry, And External Reports

- Private extension messaging may carry only a runtime-validated
  `ManagedSitePrivateMutationOutput` after redaction.
- Persistence accepts only `ManagedSitePersistedMutationState`; it carries no
  diagnostic text or identifiers.
- Telemetry and external reports accept only
  `ManagedSiteExternalMutationSummary`. The summary is mapped into existing
  controlled telemetry fields; it is not emitted wholesale and does not add a
  telemetry event or schema field by itself.

All three DTOs use JSON-safe primitives and exact-key runtime validators. Private
messages are capped at 4,096 UTF-16 code units, string codes at 256, numeric codes
must be finite safe integers, and status codes must be integers from 100 through
599. Validators reject unknown fields, present-but-`undefined` fields, `NaN`, and
infinities. TypeScript types are not treated as the only enforcement boundary.
Runtime validators mirror the discriminated-union invariant: `partial` requires
`completion`; every other outcome rejects it. Tests cover JSON round-trip and
structured-clone behavior where applicable.

The private projector truncates an overlong sanitized message at a complete
Unicode code-point boundary and omits an overlong string code; validators reject
overlong values received from any other source. The original internal diagnostic
remains intact.

## Replay And Reconciliation Rules

`partial` and `uncertain` are never blindly retried.

Before replay, the caller must perform a fresh provider read using a stable
resource identity or reconciliation query:

- if the desired final state is confirmed, treat the user goal as satisfied;
- if no effect is confirmed, a new explicit mutation may be offered;
- if a partial effect is confirmed, continue only the remaining safe step or ask
  the user to reconcile manually;
- if reconciliation fails, keep replay disabled and retain actionable private
  diagnostics.

Automatic retry is allowed only for `rejected` when the failure is retryable and
the operation contract confirms non-application. Existing retry mechanisms must
route through one shared retry-policy helper returning a finite decision enum;
callers do not independently interpret diagnostic codes or messages.

## Caller Compatibility Matrix

Visual copy and layout remain unchanged unless existing safety behavior already
requires uncertainty guidance. Recovery behavior becomes explicit and cannot
silently replay an ambiguous mutation.

| Caller | `succeeded` | `rejected` | `partial` / `uncertain` |
| --- | --- | --- | --- |
| Channel create/update UI | existing success, refresh, and close behavior | existing private failure; editor remains usable | require fresh read/reconciliation before another submit; do not blind retry |
| Channel delete and bulk delete | existing success result | existing failed result; confirmed-not-found may map to idempotent success | mark uncertain, refresh list, and disable automatic replay |
| Channel migration | existing migrated result | existing failed result | existing uncertainty path plus mandatory target refresh/reconciliation |
| Model sync / model redirect writes | continue existing workflow | existing failure accounting | stop dependent writes, refresh affected channel/models, then decide whether continuation is safe |
| Transitional upstream-resource mutations | existing success projection | existing failure projection | refresh resource state and prohibit direct replay |
| Native `ResourceEditor.submit` | return display facts and close as today | return rejected result for operational non-application; controller keeps editor open | close stale editor state, require fresh read, and reconcile before reopening/replaying |
| Native workspace/bulk delete | existing success; confirmed absence is success | existing failed row | existing uncertain row, mandatory refresh, no automatic replay |

Controllers consume the Result directly. Expected mutation outcomes no longer
travel through `ManagedResourceError`; read/validation errors still may.
`ResourceEditor.validate` keeps its current synchronous validation result.
Controllers validate before calling `submit`, preserve field issues from that
synchronous contract, and do not begin a mutation for invalid values. A defensive
direct `submit` of invalid values returns a generic pre-dispatch `rejected`
result; field issues remain owned by `validate` rather than the mutation result.
Malformed adapter output or an internal invariant failure still throws.

## Migration Strategy

Implementation proceeds in small green steps but lands as one complete domain
contract migration:

1. Add pure constants, result/effect/evidence contracts, runtime guards, and
   focused type/runtime tests.
2. Add attempt tracking, operational-error normalization, bounded cause
   traversal, and the three output projectors with boundary tests.
3. Migrate low-level transport wrappers required to preserve cause and dispatch
   evidence without changing their request payloads.
4. Migrate channel and auxiliary-write capabilities for all six site types,
   including the Octopus scheduler path that currently calls the low-level
   channel update directly.
5. Migrate transitional upstream-resource capabilities.
6. Replace native resource certainty and public thrown-mutation conversion with
   the common Result.
7. Migrate service facades, migration/model services, controllers, editors, and
   all direct callers using the compatibility matrix.
8. Remove temporary adapters, old aliases, duplicate classifiers, and expected
   mutation exception branches.
9. Run repository-wide type/dead-code validation to prove no mixed mutation
   contract remains.

## Testing Strategy

### Shared Contract And Evidence Tests

- exhaustive runtime guards and narrowing for all outcomes;
- impossible evidence combinations rejected;
- step completion atomically registers effects; overlapping, unfinished, and
  repeatedly completed step attempts are rejected;
- `succeeded` requires explicit final-state confirmation, and non-idempotent
  success requires at least one confirmed effect;
- pre-dispatch, possibly-dispatched, response-received, confirmed-effect, and
  confirmed-non-application paths;
- multi-step sequence composition covers a confirmed first step followed by
  pre-dispatch rejection, explicit post-dispatch non-application, or
  post-dispatch ambiguity, producing the matching `partial` completion;
- HTTP/provider envelopes do not imply non-application;
- native timeout, abort, network, browser fetch, protocol, malformed upstream,
  and bounded nested-cause cases;
- cycle-safe and exception-safe cause traversal with deterministic precedence;
- arbitrary programming errors remain thrown;
- `void` and returned-resource data ergonomics.

### Disclosure Tests

- internal raw diagnostic and original upstream text preserved;
- secrets removed from success/failure messages, codes, URL userinfo/query,
  nested causes, and logger arguments;
- known secret lists from config/request/response/source contexts applied;
- structural redaction removes header, cookie, bearer, URL-userinfo,
  sensitive-query, and credential-shaped secrets not present in known-secret
  lists;
- raw/data/effect identifiers absent from generic output DTOs;
- unknown keys and prohibited fields rejected at runtime;
- exact string, number, and status bounds reject explicit `undefined`, overlong
  strings, unsafe integers, `NaN`, and infinities;
- `partial` requires `completion`, while all other outcomes reject it, at both
  type and runtime boundaries;
- boundary DTO brands are not mutually assignable, while validated/projected
  values still JSON-round-trip without brand fields;
- private messaging DTO structured-clones and JSON round-trips;
- persistence and external DTOs cannot contain diagnostic text at type or runtime
  boundaries.

### Provider Contract Tests

Use a reusable suite across all current managed-site types and write surfaces.
For create, update, delete, model update, and mapping update where supported:

- success returns `succeeded`, with a confirmed effect for every non-idempotent
  write;
- recognized operational failures return a valid Result rather than throwing;
- post-dispatch ambiguity defaults to `uncertain` without explicit
  non-application evidence;
- original diagnostic content remains available internally;
- provider request payloads remain unchanged;
- queued/preflight cancellation remains `rejected`;
- mutation after dispatch cancellation/timeout is `uncertain`;
- known multi-step cases match the provider matrix.

### Caller Regression Tests

Cover every row in the caller compatibility matrix. Assert observable result,
refresh/reconciliation behavior, editor lifecycle, and replay prohibition rather
than only mock choreography.

### Validation Gates

- focused shared-contract/evidence/disclosure tests;
- provider contract and provider-specific suites;
- affected service/controller/UI suites;
- `pnpm vitest related --run` for every changed TypeScript module;
- `pnpm compile`;
- `pnpm run validate:staged`;
- `pnpm run validate:push` because public TypeScript contracts and cross-module
  runtime behavior change;
- `git diff --check` and final task-scoped diff inspection.

The current main baseline has shown non-deterministic 15-second timeouts under
full `pnpm test:ci` coverage pressure. Each timed-out file passed when rerun in a
focused group. This is baseline evidence, not permission to weaken or skip
affected validation.

## Product Readiness Decisions

- Telemetry: no new event or field; this refactor changes internal contracts
  without adding a user action.
- Settings discoverability: not applicable; no settings surface changes.
- E2E: no new scenario by default. Contract, provider, and caller behavior is
  more precisely covered with Vitest. Existing browser flows remain part of
  final regression validation where practical.
- Maintainability: one result/evidence contract, one normalization module, three
  explicit output projectors, and no provider-local certainty classifier.

## Acceptance Criteria

- Every managed-site domain write surface in the scope table returns the common
  four-state mutation result.
- No expected operational mutation failure crosses a domain capability or public
  workspace boundary as an ordinary exception.
- Unrecognized programming errors and internal invariant failures still throw.
- `rejected` requires affirmative non-application evidence; post-dispatch
  ambiguity otherwise becomes `uncertain`.
- `succeeded` requires explicit final-state confirmation, and every
  non-idempotent success contains at least one confirmed effect.
- `partial` always contains a non-empty confirmed-effect list and terminal
  disposition.
- The sequence composer uses a distinct monotonic attempt for each remote step
  and preserves prior confirmed effects when classifying the terminal step.
- All six current managed-site providers pass the reusable mutation contract
  suite for every supported write.
- Internal results preserve original diagnostics; all output boundaries apply
  their exact projector and runtime validator.
- Output projection is discriminated: only `partial` has and requires
  `completion`; all other outcomes prohibit it.
- Generic output projection drops raw data, mutation data, and effect identifiers
  by default.
- Raw diagnostics cannot enter React state, caches, events, messages, persistent
  records, analytics, logs, or external reports.
- Partial/uncertain results require fresh read/reconciliation and cannot be
  blindly replayed.
- Existing request payloads remain unchanged, and every caller matches the
  compatibility matrix.
- Old mutation aliases, native certainty results, expected mutation exceptions,
  permanent shims, and duplicate classifiers are removed.
- Focused, related, compile, staged, and push-equivalent gates pass, with any
  unrelated full-suite baseline timeout reported separately.

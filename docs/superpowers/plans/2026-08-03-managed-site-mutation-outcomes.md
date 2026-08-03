# Managed-Site Mutation Outcomes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace every managed-site domain write with one provider-neutral, dispatch-aware four-outcome result while retaining original diagnostics internally and exposing only boundary-specific redacted projections.

**Architecture:** Add a focused `managedSites/mutations` ownership boundary containing the pure contract, step sequence/normalizer, retry policy, and disclosure projectors. Instrument the shared API transport with provider-neutral request lifecycle callbacks, migrate the six managed-site adapters and both resource layers behind short-lived compatibility seams, then migrate every caller and delete the old `ApiResponse`, certainty, and expected-exception paths. Each migration slice starts with behavior tests and keeps request payloads unchanged.

**Tech Stack:** TypeScript, React, WXT browser extension services, Fetch/GraphQL adapters, Vitest, Testing Library, existing logger/redaction utilities, pnpm validation gates.

---

Related design: `docs/superpowers/specs/2026-08-03-managed-site-mutation-outcomes-design.md`

## Non-negotiable implementation invariants

- The only domain result is `ManagedSiteMutationResult<TData, TEffect>` with `succeeded`, `rejected`, `partial`, and `uncertain` outcomes.
- A non-idempotent `succeeded` result has at least one confirmed effect. An effect-free idempotent success requires a fresh authoritative confirmation of the desired state.
- `rejected` requires affirmative non-application evidence. Any possibly dispatched failure without that evidence is `uncertain`; confirmed earlier effects make it `partial`.
- Every remote write receives its own monotonic step attempt. A multi-step operation never reuses an attempt or loses effects confirmed by an earlier step.
- Expected operational failures return the result. Malformed adapter output, programming errors, and violated internal invariants still throw.
- `diagnostic.raw` retains the original error/envelope/cause in the immediate in-process call chain. It is never stored in React state, extension messages, persistence, analytics, logger arguments, or external reports.
- Private UI/log output, persisted state, and external summaries use three separately branded DTOs and exact runtime validators. Only `partial` accepts and requires `completion`.
- Partial and uncertain mutations are never blindly replayed. Callers require a fresh read/reconciliation first.
- Provider request payloads and upstream endpoint behavior remain unchanged.
- The migration-only adapters introduced below must be deleted in Task 11. They are not accepted as final architecture.

## File ownership map

- `src/services/managedSites/mutations/contracts.ts`: runtime constants, result/effect/evidence types, exact guards, and operation-specific result aliases.
- `src/services/managedSites/mutations/execution.ts`: cause traversal, diagnostic normalization, step attempts, sequence composition, and reusable single-step execution.
- `src/services/managedSites/mutations/disclosure.ts`: secret-aware private projection, persistence/external projections, brands, and sink-specific validators.
- `src/services/managedSites/mutations/retryPolicy.ts`: the sole controlled retry/reconciliation decision helper.
- `src/services/managedSites/mutations/index.ts`: public exports for the mutation domain boundary.
- `src/services/apiTransport/type.ts` and `request.ts`: transport-neutral dispatch/response observation; these files must not import managed-site types.
- `src/services/apiAdapters/contracts/*`: final mutation signatures for channel, transitional-resource, and native-resource surfaces.
- `src/services/apiAdapters/managedSites/*`: provider protocol mapping and effect/non-application assertions.
- `src/services/apiAdapters/managedResources/*`: native AxonHub operations and public workspace migration.
- Service/controller/UI files consume exhaustive results and own reconciliation behavior, not provider classification.

## Task 1: Add the pure mutation contract and exact runtime guards

**Files:**

- Create: `src/services/managedSites/mutations/contracts.ts`
- Create: `src/services/managedSites/mutations/index.ts`
- Create: `tests/services/managedSites/mutations/contracts.test.ts`

- [ ] Add failing tests named around these invariants:

  - accepts all four valid outcomes and narrows them by `outcome`;
  - rejects `partial` without a non-empty `confirmedEffects` tuple;
  - rejects `completion` on non-partial outcomes and requires it on partial;
  - rejects unknown outcome/effect/resource keys, invalid IDs, unsafe numbers, and malformed diagnostics;
  - accepts `data: undefined` only when the success object explicitly owns `data`;
  - accepts an empty success effect list only when validation receives `idempotent: true` and final-state confirmation;
  - rejects a non-idempotent success without an effect.

- [ ] Run the focused suite and confirm it fails because the module does not exist:

  ```powershell
  pnpm vitest run tests/services/managedSites/mutations/contracts.test.ts
  ```

- [ ] Implement runtime constants and types with the exact shape from the design. Export these core signatures:

  ```ts
  export type NonEmptyReadonlyArray<T> = readonly [T, ...T[]]

  export type ManagedSiteMutationResult<
    TData = void,
    TEffect extends ManagedSiteMutationConfirmedEffect =
      ManagedSiteMutationConfirmedEffect,
  > =
    | ManagedSiteMutationSucceeded<TData, TEffect>
    | ManagedSiteMutationRejected
    | ManagedSiteMutationPartial<TData, TEffect>
    | ManagedSiteMutationUncertain

  export function assertManagedSiteMutationResult<
    TData,
    TEffect extends ManagedSiteMutationConfirmedEffect,
  >(
    value: unknown,
    options: { idempotent: boolean },
  ): asserts value is ManagedSiteMutationResult<TData, TEffect>
  ```

  Derive `ManagedSiteMutationOutcome`, `ManagedSiteMutationCompletion`, effect kind, dispatch state, and final-state types from exported `as const` runtime maps. Use `ManagedResourceKind | "channel"` for effect resource kinds and keep `resourceId` internal/optional.

- [ ] Make guards exact: require own keys, reject unknown keys, reject present-but-`undefined` optional fields, validate HTTP status as integer `100..599`, and validate numeric codes/IDs as finite safe integers. The guard must never coerce input.

- [ ] Add ergonomic aliases for void and resource-returning mutations without defining another outcome model:

  ```ts
  export type ManagedSiteVoidMutationResult<
    TEffect extends ManagedSiteMutationConfirmedEffect =
      ManagedSiteMutationConfirmedEffect,
  > = ManagedSiteMutationResult<void, TEffect>
  ```

- [ ] Export only the contract surface from `index.ts`, rerun the focused suite, then run related validation:

  ```powershell
  pnpm vitest run tests/services/managedSites/mutations/contracts.test.ts
  pnpm vitest related --run src/services/managedSites/mutations/contracts.ts
  ```

- [ ] Commit the isolated contract:

  ```powershell
  git add src/services/managedSites/mutations/contracts.ts src/services/managedSites/mutations/index.ts tests/services/managedSites/mutations/contracts.test.ts
  git commit -m "refactor(managed-sites): define mutation outcome contract"
  ```

## Task 2: Implement step evidence, diagnostic normalization, and retry policy

**Files:**

- Create: `src/services/managedSites/mutations/execution.ts`
- Create: `src/services/managedSites/mutations/retryPolicy.ts`
- Modify: `src/services/managedSites/mutations/index.ts`
- Create: `tests/services/managedSites/mutations/execution.test.ts`
- Create: `tests/services/managedSites/mutations/retryPolicy.test.ts`

- [ ] Add failing execution tests for:

  - pre-dispatch operational rejection with no active step;
  - monotonic `not-dispatched -> possibly-dispatched -> response-received` transitions;
  - rejecting backwards, overlapping, repeated-completion, and effect-plus-non-application transitions;
  - successful non-idempotent and effect-free idempotent completion;
  - first step applied followed by pre-dispatch rejection => `partial/rejected`;
  - first step applied followed by explicit response non-application => `partial/rejected`;
  - first step applied followed by post-dispatch timeout/network/abort => `partial/uncertain`;
  - no confirmed effect plus post-dispatch ambiguity => `uncertain`;
  - malformed upstream protocol data is operational while malformed adapter evidence throws;
  - bounded, cycle-safe, getter-safe cause traversal with explicit fields taking precedence over nearest recognized cause.

- [ ] Add failing retry-policy tests proving only retryable `rejected` results can be automatically retried; `partial` and `uncertain` always require reconciliation; `succeeded` needs no retry.

- [ ] Run both suites and confirm missing exports fail:

  ```powershell
  pnpm vitest run tests/services/managedSites/mutations/execution.test.ts tests/services/managedSites/mutations/retryPolicy.test.ts
  ```

- [ ] Implement the sequence API exactly once:

  ```ts
  export interface ManagedSiteMutationStepAttempt<
    TEffect extends ManagedSiteMutationConfirmedEffect,
  > {
    markPossiblyDispatched(): void
    markResponseReceived(): void
    confirmNonApplication(): void
    confirmEffect(effect: TEffect): void
    complete(): void
  }

  export interface ManagedSiteMutationSequence<
    TEffect extends ManagedSiteMutationConfirmedEffect,
  > {
    beginStep(): ManagedSiteMutationStepAttempt<TEffect>
    finish<TData>(input: {
      finalState: "confirmed"
      data: TData
    }): ManagedSiteMutationSucceeded<TData, TEffect>
    finish<TData = never>(input: {
      finalState: "unconfirmed"
      data?: TData
      diagnostic: ManagedSiteMutationDiagnostic
    }): Exclude<ManagedSiteMutationResult<TData, TEffect>, { outcome: "succeeded" }>
  }

  export function createManagedSiteMutationSequence<
    TEffect extends ManagedSiteMutationConfirmedEffect,
  >(options: { idempotent: boolean }): ManagedSiteMutationSequence<TEffect>
  ```

- [ ] Add `toManagedSiteMutationDiagnostic(error)` with a maximum cause depth of `8`, a `WeakSet` cycle guard, property access inside `try/catch`, and precedence `typed operational fields -> nearest recognized cause -> outer safe message`. Preserve `raw: error` without cloning it.

- [ ] Add a reusable `runManagedSiteMutationStep(...)` helper. It begins one attempt, gives the transport an observer backed by that attempt, accepts a provider-owned response classifier returning only `applied` or affirmative `rejected`, confirms the supplied effect only for `applied`, and converts recognized thrown operational errors according to dispatch evidence. It must rethrow programming/invariant errors.

  ```ts
  export interface ManagedSiteMutationRequestObserver {
    onDispatch(): void
    onResponse(): void
  }

  export type ManagedSiteMutationStepRunResult<TData> =
    | { outcome: "applied"; data: TData }
    | {
        outcome: "rejected" | "uncertain"
        diagnostic: ManagedSiteMutationDiagnostic
      }

  export async function runManagedSiteMutationStep<
    TEffect extends ManagedSiteMutationConfirmedEffect,
    TResponse,
    TData,
  >(input: {
    sequence: ManagedSiteMutationSequence<TEffect>
    effect: TEffect
    execute(
      observer: ManagedSiteMutationRequestObserver,
    ): Promise<TResponse>
    classifyResponse(response: TResponse):
      | { outcome: "applied"; data: TData }
      | { outcome: "rejected"; diagnostic: ManagedSiteMutationDiagnostic }
  }): Promise<ManagedSiteMutationStepRunResult<TData>>
  ```

- [ ] Define a finite retry decision map in `retryPolicy.ts`:

  ```ts
  export const MANAGED_SITE_MUTATION_RETRY_DECISIONS = {
    NoRetryNeeded: "no-retry-needed",
    RetryAllowed: "retry-allowed",
    ReconcileRequired: "reconcile-required",
    RetryDisallowed: "retry-disallowed",
  } as const
  ```

  `getManagedSiteMutationRetryDecision(result, { retryableRejection })` is the only code allowed to convert outcomes into replay policy.

- [ ] Rerun both suites and related validation, then commit:

  ```powershell
  pnpm vitest run tests/services/managedSites/mutations/execution.test.ts tests/services/managedSites/mutations/retryPolicy.test.ts
  pnpm vitest related --run src/services/managedSites/mutations/execution.ts src/services/managedSites/mutations/retryPolicy.ts
  git add src/services/managedSites/mutations src/services/managedSites/mutations/index.ts tests/services/managedSites/mutations
  git commit -m "refactor(managed-sites): compose mutation evidence"
  ```

## Task 3: Add disclosure projectors and sink-specific validators

**Files:**

- Create: `src/services/managedSites/mutations/disclosure.ts`
- Modify: `src/services/managedSites/mutations/index.ts`
- Create: `tests/services/managedSites/mutations/disclosure.test.ts`

- [ ] Add failing tests proving:

  - internal `raw`, original message, status, code, and nested cause remain unchanged;
  - private output removes known secrets from success and failure messages/codes;
  - bearer/basic authorization, cookies, URL userinfo, sensitive query values, JWT/key-shaped text, and credential-shaped assignments are structurally redacted without a known-secret list;
  - private output drops mutation `data`, effect IDs, `raw`, and unknown fields;
  - a sanitized message is truncated at a complete Unicode code-point boundary at 4,096 UTF-16 code units and an overlong string code is omitted;
  - persistence/external outputs contain only outcome/completion/category and are not mutually assignable in a `tsd`-style `expectTypeOf` assertion;
  - serialized values are treated as `unknown`, exact-validated, and rebranded at each receiving boundary;
  - explicit `undefined`, `NaN`, infinities, unsafe integers, invalid status, and forbidden completion combinations are rejected;
  - private output structured-clones and all DTOs JSON-round-trip without brand fields.

- [ ] Run the suite and confirm the projector module is missing:

  ```powershell
  pnpm vitest run tests/services/managedSites/mutations/disclosure.test.ts
  ```

- [ ] Implement three private `unique symbol` brands and these projector/validator pairs:

  ```ts
  toPrivateManagedSiteMutationOutput(result, { knownSecrets })
  parsePrivateManagedSiteMutationOutput(value: unknown)

  toManagedSitePersistedMutationState(result)
  parseManagedSitePersistedMutationState(value: unknown)

  toManagedSiteExternalMutationSummary(result)
  parseManagedSiteExternalMutationSummary(value: unknown)
  ```

  Keep the persisted and external types separate even while their initial JSON shapes match. Map categories from a finite controlled map; do not accept caller-provided arbitrary category strings.

- [ ] Reuse `toSanitizedErrorSummary(...)` for exact known-secret replacement, then apply disclosure-owned structural patterns and `sanitizeUrlForLog(...)`. Project the entire result so success messages cannot bypass redaction. Do not traverse or stringify `raw`.

- [ ] Rerun the suite and related validation, then commit:

  ```powershell
  pnpm vitest run tests/services/managedSites/mutations/disclosure.test.ts
  pnpm vitest related --run src/services/managedSites/mutations/disclosure.ts
  git add src/services/managedSites/mutations/disclosure.ts src/services/managedSites/mutations/index.ts tests/services/managedSites/mutations/disclosure.test.ts
  git commit -m "refactor(managed-sites): enforce mutation disclosure boundaries"
  ```

## Task 4: Preserve dispatch evidence and original causes through REST transport

**Files:**

- Modify: `src/services/apiTransport/type.ts`
- Modify: `src/services/apiTransport/request.ts`
- Modify: `src/services/apiTransport/errors.ts`
- Modify: `src/services/apiAdapters/managedSites/request.ts`
- Modify: `src/services/apiService/newApiFamily/channelManagement.ts`
- Modify: `src/services/apiService/veloera/index.ts`
- Modify: `src/services/apiService/doneHub/index.ts`
- Test: `tests/services/apiTransport/request.test.ts`
- Test: `tests/services/apiService/newApiFamily/channelManagement.test.ts`
- Test: `tests/services/apiService/veloera/channelApi.test.ts`
- Test: `tests/services/apiService/doneHub/channelApi.test.ts`

- [ ] Add failing transport tests proving a lifecycle observer:

  - is not called while queued behind the site limiter;
  - is not dispatched for a pre-aborted task;
  - receives `onDispatch` immediately before the selected fetch/content/temp-window route starts;
  - receives `onResponse` once a transport response exists and before JSON/body parsing;
  - preserves `onDispatch` without `onResponse` for network loss/timeout after dispatch;
  - remains optional and does not alter existing read calls.

- [ ] Add provider-family regression tests proving the three REST modules preserve the original caught value as `cause`, including its `ApiError.statusCode`, `code`, and message, instead of replacing it with an unlinked localized `Error`.
- [ ] Add logger assertions proving the REST wrappers no longer pass raw caught errors as logger arguments. They may log a controlled operation label; private managed-site callers log only projected output with known config/payload secrets.

- [ ] Run the four suites and confirm the lifecycle/cause assertions fail:

  ```powershell
  pnpm vitest run tests/services/apiTransport/request.test.ts tests/services/apiService/newApiFamily/channelManagement.test.ts tests/services/apiService/veloera/channelApi.test.ts tests/services/apiService/doneHub/channelApi.test.ts
  ```

- [ ] Add a provider-neutral optional observer to `ApiTransportRequest`:

  ```ts
  export interface ApiTransportRequestObserver {
    onDispatch(): void
    onResponse(): void
  }
  ```

  Thread it through `_fetchApi`/`apiRequest` without serializing callbacks into extension messages. Invoke `onDispatch` inside the limiter-admitted abortable task and `onResponse` immediately after obtaining a `Response` or equivalent structured remote response, before status/body handling.

- [ ] Extend `ApiError` and the three channel-service catch blocks to retain `cause`. Keep existing human fallbacks and payload serialization unchanged. `toManagedSiteApiServiceRequest` accepts an optional observer and places it on the request DTO.
- [ ] Remove raw error arguments from the three low-level mutation catch logs. Do not stringify the cause there; it remains available to the adapter through the thrown error.

- [ ] Rerun the four suites plus related validation, then commit:

  ```powershell
  pnpm vitest run tests/services/apiTransport/request.test.ts tests/services/apiService/newApiFamily/channelManagement.test.ts tests/services/apiService/veloera/channelApi.test.ts tests/services/apiService/doneHub/channelApi.test.ts
  pnpm vitest related --run src/services/apiTransport/type.ts src/services/apiTransport/request.ts src/services/apiTransport/errors.ts src/services/apiAdapters/managedSites/request.ts
  git add src/services/apiTransport/type.ts src/services/apiTransport/request.ts src/services/apiTransport/errors.ts src/services/apiAdapters/managedSites/request.ts src/services/apiService/newApiFamily/channelManagement.ts src/services/apiService/veloera/index.ts src/services/apiService/doneHub/index.ts tests/services/apiTransport/request.test.ts tests/services/apiService/newApiFamily/channelManagement.test.ts tests/services/apiService/veloera/channelApi.test.ts tests/services/apiService/doneHub/channelApi.test.ts
  git commit -m "refactor(api-transport): expose mutation dispatch evidence"
  ```

## Task 5: Migrate all six channel capabilities to the common result

**Files:**

- Modify: `src/services/apiAdapters/contracts/managedSiteCapabilities.ts`
- Modify: `src/services/apiAdapters/managedSites/newApi.ts`
- Modify: `src/services/apiAdapters/managedSites/veloera.ts`
- Modify: `src/services/apiAdapters/managedSites/doneHub.ts`
- Modify: `src/services/apiAdapters/managedSites/octopus.ts`
- Modify: `src/services/apiAdapters/managedSites/axonHub.ts`
- Modify: `src/services/apiAdapters/managedSites/claudeCodeHub.ts`
- Modify: `src/services/apiService/newApiFamily/channelManagement.ts`
- Modify: `src/services/managedSites/managedSiteService.ts`
- Delete later: `src/services/managedSites/mutationCertainty.ts`
- Test: `tests/services/apiAdapters/managedSites/newApi.test.ts`
- Test: `tests/services/apiAdapters/managedSites/veloera.test.ts`
- Test: `tests/services/apiAdapters/managedSites/doneHub.test.ts`
- Test: `tests/services/apiAdapters/managedSites/octopus.test.ts`
- Test: `tests/services/apiAdapters/managedSites/axonHub.test.ts`
- Test: `tests/services/apiAdapters/managedSites/claudeCodeHub.test.ts`
- Test: `tests/services/managedSites/managedSiteService.test.ts`

- [ ] Replace provider tests that assert `ApiResponse`/delete certainty with a reusable contract table covering supported `create`, `update`, `delete`, `updateModels`, and `updateModelMapping` operations. For every supported write assert success effect, affirmative rejection, post-dispatch ambiguity, preflight cancellation, preserved raw diagnostic, and unchanged request body.

- [ ] Add explicit New API multi-step tests:

  - field update applied + status response rejected => `partial/rejected`;
  - field update applied + status response lost => `partial/uncertain`;
  - field update rejected before status dispatch => `rejected`;
  - both steps applied => `succeeded` with `resource-updated` and `status-updated` effects.

- [ ] Run the provider suites and confirm they fail under the old contracts:

  ```powershell
  pnpm vitest run tests/services/apiAdapters/managedSites/newApi.test.ts tests/services/apiAdapters/managedSites/veloera.test.ts tests/services/apiAdapters/managedSites/doneHub.test.ts tests/services/apiAdapters/managedSites/octopus.test.ts tests/services/apiAdapters/managedSites/axonHub.test.ts tests/services/apiAdapters/managedSites/claudeCodeHub.test.ts tests/services/managedSites/managedSiteService.test.ts
  ```

- [ ] Change `ManagedSiteChannelsCapability` write signatures to `ManagedSiteMutationResult`; remove `ManagedSiteChannelDeleteResponse`, `MANAGED_SITE_MUTATION_CERTAINTIES`, and `ManagedSiteMutationCertainty`. Keep reads and request options unchanged.

- [ ] For New API, expose single-request low-level field/status primitives from `channelManagement.ts` and let the managed-site adapter compose them as separate attempts. Preserve the existing `updateChannel(...)` low-level composition for non-domain callers; it is transport mechanics, not a second domain outcome.

- [ ] Migrate New API, Veloera, and DoneHub through `runManagedSiteMutationStep(...)` with `toManagedSiteApiServiceRequest(config, { requestObserver })`. Treat documented `success: false` business envelopes as non-application only at the provider response mapper; network/abort/timeout after dispatch remains uncertain.

- [ ] Migrate Octopus without `getManagedSiteDeleteCertainty(...)`. Map direct request responses through the same result helper and retain thrown originals in `diagnostic.raw`.

- [ ] Map AxonHub's existing GraphQL `RequestError.dispatch` and native error kinds into the shared dispatch/non-application evidence. Map Claude Code Hub direct provider actions similarly. Do not infer rejection from GraphQL error envelopes alone.

- [ ] Keep `ManagedSiteService` temporarily returning its legacy response shape by a private, clearly named `toLegacyMutationResponseDuringMigration(...)` adapter so existing UI callers remain green. Add a test proving `partial`/`uncertain` map only to the existing uncertainty-safe behavior; delete this adapter in Task 9.

- [ ] Rerun all seven suites and related validation, then commit:

  ```powershell
  pnpm vitest run tests/services/apiAdapters/managedSites/newApi.test.ts tests/services/apiAdapters/managedSites/veloera.test.ts tests/services/apiAdapters/managedSites/doneHub.test.ts tests/services/apiAdapters/managedSites/octopus.test.ts tests/services/apiAdapters/managedSites/axonHub.test.ts tests/services/apiAdapters/managedSites/claudeCodeHub.test.ts tests/services/managedSites/managedSiteService.test.ts
  pnpm vitest related --run src/services/apiAdapters/contracts/managedSiteCapabilities.ts src/services/apiAdapters/managedSites/newApi.ts src/services/apiAdapters/managedSites/veloera.ts src/services/apiAdapters/managedSites/doneHub.ts src/services/apiAdapters/managedSites/octopus.ts src/services/apiAdapters/managedSites/axonHub.ts src/services/apiAdapters/managedSites/claudeCodeHub.ts
  git add src/services/apiAdapters/contracts/managedSiteCapabilities.ts src/services/apiAdapters/managedSites src/services/apiService/newApiFamily/channelManagement.ts src/services/managedSites/managedSiteService.ts tests/services/apiAdapters/managedSites tests/services/managedSites/managedSiteService.test.ts
  git commit -m "refactor(managed-sites): unify channel mutation outcomes"
  ```

## Task 6: Migrate transitional managed-upstream-resource writes

**Files:**

- Modify: `src/services/apiAdapters/contracts/managedUpstreamResources.ts`
- Modify: `src/services/apiAdapters/managedSites/newApi.ts`
- Modify: `src/services/apiAdapters/managedSites/veloera.ts`
- Modify: `src/services/apiAdapters/managedSites/doneHub.ts`
- Modify: `src/services/apiAdapters/managedSites/octopus.ts`
- Modify: `src/services/apiAdapters/managedSites/axonHub.ts`
- Modify: `src/services/apiAdapters/managedSites/claudeCodeHub.ts`
- Modify: `src/services/managedSites/managedUpstreamResourceService.ts`
- Test: `tests/services/apiAdapters/managedSites/newApi.test.ts`
- Test: `tests/services/apiAdapters/managedSites/veloera.test.ts`
- Test: `tests/services/apiAdapters/managedSites/doneHub.test.ts`
- Test: `tests/services/apiAdapters/managedSites/octopus.test.ts`
- Test: `tests/services/apiAdapters/managedSites/axonHub.test.ts`
- Test: `tests/services/apiAdapters/managedSites/claudeCodeHub.test.ts`
- Test: `tests/services/managedSites/managedUpstreamResourceService.test.ts`

- [ ] Add failing tests for each provider's resource `create/update/delete`: returned summary on success, provider-neutral confirmed effect, response-level rejection, post-dispatch uncertainty, original raw diagnostic, and unchanged native payload/detail preservation.

- [ ] Add AxonHub resource multi-step tests for create+enable and update+status: a confirmed first effect followed by rejection/ambiguity must become the matching partial result.

- [ ] Run the focused provider/resource-service suites and confirm old `ManagedUpstreamResourceMutationResponse` assertions fail.

- [ ] Replace `ManagedUpstreamResourceMutationResponse` with `ManagedSiteMutationResult<ManagedUpstreamResourceSummary | null>` for create/update and a void result for delete. Remove the alias from the contract.

- [ ] Reuse each provider's channel mutation mapping when the endpoint and effect are truly identical; keep native AxonHub/Claude/Octopus resource payload preservation in their current adapter files. Do not convert a result back into `ApiResponse` inside providers.

- [ ] Add a private `adaptManagedUpstreamResourcesForLegacyCallers(...)` only in `managedUpstreamResourceService.ts` so current model/migration/dialog callers remain green. Its partial/uncertain branch must preserve no-replay behavior; delete it in Task 8.

- [ ] Rerun focused and related suites, then commit:

  ```powershell
  pnpm vitest run tests/services/apiAdapters/managedSites/newApi.test.ts tests/services/apiAdapters/managedSites/veloera.test.ts tests/services/apiAdapters/managedSites/doneHub.test.ts tests/services/apiAdapters/managedSites/octopus.test.ts tests/services/apiAdapters/managedSites/axonHub.test.ts tests/services/apiAdapters/managedSites/claudeCodeHub.test.ts tests/services/managedSites/managedUpstreamResourceService.test.ts
  pnpm vitest related --run src/services/apiAdapters/contracts/managedUpstreamResources.ts src/services/managedSites/managedUpstreamResourceService.ts
  git add src/services/apiAdapters/contracts/managedUpstreamResources.ts src/services/apiAdapters/managedSites src/services/managedSites/managedUpstreamResourceService.ts tests/services/apiAdapters/managedSites tests/services/managedSites/managedUpstreamResourceService.test.ts
  git commit -m "refactor(managed-sites): unify upstream resource mutations"
  ```

## Task 7: Replace native resource certainty with the common result

**Files:**

- Modify: `src/services/apiAdapters/contracts/managedResourceNative.ts`
- Modify: `src/services/apiAdapters/managedResources/axonHub.ts`
- Modify: `src/services/apiAdapters/managedResources/factory.ts`
- Test: `tests/services/apiAdapters/managedResources/axonHub.test.ts`
- Test: `tests/services/apiAdapters/managedResources/factory.test.ts`

- [ ] Replace certainty-specific tests with failing result tests for applied, not-applied, possibly-applied, partially-applied, not-found idempotent delete, pre/post-dispatch abort, malformed adapter output, repeated submit, and fresh-read failure.

- [ ] Run both suites and confirm they fail on `NativeResourceMutationResult`.

- [ ] Change `NativeResourceKindDefinition.create/update/delete` to the common result and remove `NativeResourceMutationResult`. Translate AxonHub native dispatch-aware errors at the definition boundary and preserve raw causes.

- [ ] Keep the existing public `ResourceEditor.submit`/`ManagedResourceWorkspace.delete` behavior temporarily through a private factory conversion so controllers still compile. The conversion must use the private projector for messages and close editors on partial/uncertain outcomes; delete it in Task 10.

- [ ] Keep synchronous `ResourceEditor.validate` authoritative for field issues. A defensive direct submit of invalid values returns a generic pre-dispatch rejection internally; do not add field issues to the common mutation result.

- [ ] Rerun focused/related suites and commit:

  ```powershell
  pnpm vitest run tests/services/apiAdapters/managedResources/axonHub.test.ts tests/services/apiAdapters/managedResources/factory.test.ts
  pnpm vitest related --run src/services/apiAdapters/contracts/managedResourceNative.ts src/services/apiAdapters/managedResources/axonHub.ts src/services/apiAdapters/managedResources/factory.ts
  git add src/services/apiAdapters/contracts/managedResourceNative.ts src/services/apiAdapters/managedResources/axonHub.ts src/services/apiAdapters/managedResources/factory.ts tests/services/apiAdapters/managedResources/axonHub.test.ts tests/services/apiAdapters/managedResources/factory.test.ts
  git commit -m "refactor(managed-sites): unify native resource mutations"
  ```

## Task 8: Migrate model sync, model redirect, and resource-backed migration callers

**Files:**

- Modify: `src/services/models/modelSync/modelSyncService.ts`
- Modify: `src/services/models/modelSync/octopusModelSync.ts`
- Modify: `src/services/models/modelRedirect/ModelRedirectService.ts`
- Modify: `src/services/managedSites/channelMigration.ts`
- Modify: `src/services/apiAdapters/managedResources/axonHubMigration.ts`
- Modify: `src/services/managedSites/managedUpstreamResourceService.ts`
- Test: `tests/services/modelSync/modelSyncService.test.ts`
- Test: `tests/services/modelSync/octopusModelSync.test.ts`
- Test: `tests/services/modelRedirect/ModelRedirectService.apply.test.ts`
- Test: `tests/services/modelRedirect/ModelRedirectService.bulkClear.test.ts`
- Test: `tests/services/managedSites/channelMigration.test.ts`
- Test: `tests/services/apiAdapters/managedResources/axonHubMigration.test.ts`

- [ ] Add failing caller tests asserting exhaustive outcome behavior:

  - succeeded writes retain existing success accounting;
  - rejected writes retain ordinary failure accounting and may retry only through the shared retry policy;
  - partial/uncertain writes stop dependent writes, request a fresh read, and never replay directly;
  - Octopus scheduled model sync uses the managed-site channel capability instead of calling `octopusApi.updateChannel` directly;
  - AxonHub migration maps created/rejected/partial/uncertain without inspecting native certainty.

- [ ] Run the six focused suites and confirm legacy `.success`, thrown-error, or certainty branches fail.

- [ ] Switch `ModelSyncService` and `ModelRedirectService` writer interfaces to return common results. Centralize exhaustive switching in small helpers local to each service; do not make provider-specific code decisions there.

- [ ] Route `octopusModelSync.ts` through `octopusManagedSiteChannels` so rate-limit bypass remains an option on the capability request and the scheduler no longer bypasses domain outcome semantics.

- [ ] Update both channel-migration branches: transitional resource create consumes the result directly, while the legacy service branch remains on the Task 5 temporary facade until Task 9. Update AxonHub native migration to use outcome/effects rather than certainty.

- [ ] Delete `adaptManagedUpstreamResourcesForLegacyCallers(...)` after every direct transitional-resource caller is migrated. Prove with `rg` that no caller inspects resource `.success`.

- [ ] Rerun suites/related validation and commit:

  ```powershell
  pnpm vitest run tests/services/modelSync/modelSyncService.test.ts tests/services/modelSync/octopusModelSync.test.ts tests/services/modelRedirect/ModelRedirectService.apply.test.ts tests/services/modelRedirect/ModelRedirectService.bulkClear.test.ts tests/services/managedSites/channelMigration.test.ts tests/services/apiAdapters/managedResources/axonHubMigration.test.ts
  pnpm vitest related --run src/services/models/modelSync/modelSyncService.ts src/services/models/modelSync/octopusModelSync.ts src/services/models/modelRedirect/ModelRedirectService.ts src/services/managedSites/channelMigration.ts src/services/apiAdapters/managedResources/axonHubMigration.ts
  git add src/services/models src/services/managedSites/channelMigration.ts src/services/managedSites/managedUpstreamResourceService.ts src/services/apiAdapters/managedResources/axonHubMigration.ts tests/services/modelSync tests/services/modelRedirect tests/services/managedSites/channelMigration.test.ts tests/services/apiAdapters/managedResources/axonHubMigration.test.ts
  git commit -m "refactor(managed-sites): consume mutation outcomes in model workflows"
  ```

## Task 9: Migrate the managed-site facade and channel callers

**Files:**

- Modify: `src/services/managedSites/managedSiteService.ts`
- Modify: `src/components/dialogs/ChannelDialog/hooks/useChannelForm.ts`
- Modify: `src/features/ManagedSiteChannels/ManagedSiteChannels.tsx`
- Modify: `src/services/managedSites/channelMigration.ts`
- Modify: `src/services/managedSites/tokenBatchExport.ts`
- Test: `tests/services/managedSites/managedSiteService.test.ts`
- Test: `tests/components/dialogs/ChannelDialog/useChannelForm.test.tsx`
- Create: `tests/features/ManagedSiteChannels/ManagedSiteChannels.test.tsx`
- Test: `tests/services/managedSites/channelMigration.test.ts`
- Test: `tests/services/managedSites/tokenBatchExport.test.ts`

- [ ] Add failing tests for each direct channel caller:

  - succeeded preserves current refresh/close/success behavior;
  - rejected keeps forms open and shows `toPrivateManagedSiteMutationOutput(...)` with all config/payload secrets supplied;
  - partial/uncertain closes stale editor state, requires a fresh read, and prevents immediate resubmit/delete replay;
  - delete not-found is success only after confirmed absence;
  - batch execution records controlled failed/uncertain outcomes without persisting raw provider text;
  - channel migration refreshes/reconciles the target after partial/uncertain.

- [ ] Change `ManagedSiteService.createChannel/updateChannel/deleteChannel` to return the common result directly and delete `toLegacyMutationResponseDuringMigration(...)`.

- [ ] Replace `.success` checks and expected mutation `catch` branches with exhaustive switches. Use private projections only at UI/local-log boundaries. Never put the internal result in React state.

- [ ] Keep existing user-facing copy and layout. Reuse current uncertainty guidance; add no settings, search targets, analytics events, or new navigation.

- [ ] Run the exact focused suites discovered above plus service/migration/batch tests, then related validation and commit:

  ```powershell
  pnpm vitest run tests/services/managedSites/managedSiteService.test.ts tests/components/dialogs/ChannelDialog/useChannelForm.test.tsx tests/features/ManagedSiteChannels/ManagedSiteChannels.test.tsx tests/services/managedSites/channelMigration.test.ts tests/services/managedSites/tokenBatchExport.test.ts
  pnpm vitest related --run src/services/managedSites/managedSiteService.ts src/components/dialogs/ChannelDialog/hooks/useChannelForm.ts src/features/ManagedSiteChannels/ManagedSiteChannels.tsx src/services/managedSites/channelMigration.ts src/services/managedSites/tokenBatchExport.ts
  git add src/services/managedSites/managedSiteService.ts src/components/dialogs/ChannelDialog/hooks/useChannelForm.ts src/features/ManagedSiteChannels/ManagedSiteChannels.tsx src/services/managedSites/channelMigration.ts src/services/managedSites/tokenBatchExport.ts tests/services/managedSites tests/components/dialogs/ChannelDialog tests/features/ManagedSiteChannels
  git commit -m "refactor(managed-sites): consume channel mutation outcomes"
  ```

## Task 10: Expose common results from native workspaces and migrate controllers

**Files:**

- Modify: `src/services/apiAdapters/contracts/managedResourceNative.ts`
- Modify: `src/services/apiAdapters/managedResources/factory.ts`
- Modify: `src/features/ManagedSiteChannels/controllers/useManagedResourceMutationController.ts`
- Modify: `src/features/ManagedSiteChannels/controllers/legacyManagedResourceBulkDeleteController.ts`
- Modify: `src/features/ManagedSiteChannels/ManagedSiteChannelsRoute.tsx`
- Test: `tests/services/apiAdapters/managedResources/factory.test.ts`
- Test: `tests/features/ManagedSiteChannels/controllers/useManagedResourceControllers.test.tsx`
- Test: `tests/features/ManagedSiteChannels/controllers/legacyManagedResourceBulkDeleteController.test.ts`
- Test: `tests/features/ManagedSiteChannels/ManagedSiteChannelsRoute.test.tsx`

- [ ] Add failing public-workspace/controller tests for:

  - submit success returns display facts inside `succeeded` and closes only after accepted refresh behavior;
  - synchronous validation preserves field issues and never calls submit;
  - direct invalid submit returns generic pre-dispatch rejection;
  - rejected keeps the editor reusable;
  - partial/uncertain closes stale state, requires fresh read, and blocks duplicate concurrent replay;
  - delete success/not-found/rejected/partial/uncertain map to the existing row states without raw diagnostics;
  - bulk delete never retries partial/uncertain rows automatically.

- [ ] Change `ResourceEditor.submit` and `ManagedResourceWorkspace.delete` to common results. Remove factory conversion to thrown `ManagedResourceError` for expected mutations; retain `ManagedResourceError` for reads, secret loading, editor setup, validation plumbing, and programming-safe global handling.

- [ ] Update controllers to switch exhaustively and immediately project private diagnostics before storing feedback. Store controlled `ResourceFailure`/fresh-read flags only, never the internal result or `raw`.

- [ ] Keep analytics payloads limited to current controlled success/failure/cancel categories. Do not add raw message, code, status, effect, ID, or result DTO fields.

- [ ] Rerun focused/related suites and commit:

  ```powershell
  pnpm vitest run tests/services/apiAdapters/managedResources/factory.test.ts tests/features/ManagedSiteChannels/controllers/useManagedResourceControllers.test.tsx tests/features/ManagedSiteChannels/controllers/legacyManagedResourceBulkDeleteController.test.ts tests/features/ManagedSiteChannels/ManagedSiteChannelsRoute.test.tsx
  pnpm vitest related --run src/services/apiAdapters/contracts/managedResourceNative.ts src/services/apiAdapters/managedResources/factory.ts src/features/ManagedSiteChannels/controllers/useManagedResourceMutationController.ts src/features/ManagedSiteChannels/controllers/legacyManagedResourceBulkDeleteController.ts src/features/ManagedSiteChannels/ManagedSiteChannelsRoute.tsx
  git add src/services/apiAdapters/contracts/managedResourceNative.ts src/services/apiAdapters/managedResources/factory.ts src/features/ManagedSiteChannels tests/services/apiAdapters/managedResources/factory.test.ts tests/features/ManagedSiteChannels
  git commit -m "refactor(managed-sites): expose native mutation outcomes"
  ```

## Task 11: Remove migration seams and prove complete contract convergence

**Files:**

- Delete: `src/services/managedSites/mutationCertainty.ts`
- Create: `tests/services/apiAdapters/managedSiteMutationConformance.test.ts`

- [ ] Run exact searches and require no production hits for the removed model:

  ```powershell
  rg -n "ManagedSiteChannelDeleteResponse|ManagedUpstreamResourceMutationResponse|NativeResourceMutationResult|MANAGED_SITE_MUTATION_CERTAINTIES|getManagedSiteDeleteCertainty|toLegacyMutationResponseDuringMigration|adaptManagedUpstreamResourcesForLegacyCallers|certainty ===|\.certainty" src tests
  rg -n "\.success" src/services/apiAdapters/managedSites src/services/managedSites src/services/models src/features/ManagedSiteChannels src/components/dialogs/ChannelDialog
  ```

  Any remaining hit must be a read-side/upstream transport contract proven unrelated to managed-site domain mutations; remove all mutation-surface hits.

- [ ] Delete `mutationCertainty.ts`, all temporary adapters, mutation-specific certainty helpers, and obsolete expected-mutation exception branches. Ensure the mutation folder remains the sole outcome/evidence/retry/disclosure owner.

- [ ] Add compile-time/runtime conformance coverage in `managedSiteMutationConformance.test.ts` so every current `ManagedSiteType` supplies the common channel contract and every supported resource/native write returns the same result family. Use `expectTypeOf` for signatures and the registry's actual six managed-site entries for runtime membership.

- [ ] Run focused mutation/provider/caller tests as one deterministic command:

  ```powershell
  pnpm vitest run tests/services/managedSites/mutations tests/services/apiAdapters/managedSites tests/services/apiAdapters/managedResources/factory.test.ts tests/features/ManagedSiteChannels/controllers/useManagedResourceControllers.test.tsx tests/services/modelSync/modelSyncService.test.ts tests/services/modelRedirect/ModelRedirectService.apply.test.ts tests/services/managedSites/channelMigration.test.ts tests/services/managedSites/tokenBatchExport.test.ts
  ```

- [ ] Run repository gates in order:

  ```powershell
  pnpm compile
  pnpm run validate:staged
  pnpm run validate:push
  git diff --check
  ```

  Stage only task-scoped files before `validate:staged`. If full `pnpm test:ci` is run, classify any 15-second coverage timeout separately and rerun the exact timed-out files; do not weaken timeouts or report the aggregate suite as passing when it did not.

- [ ] Inspect the complete diff for unchanged request payloads, no raw-result state/persistence/logging, no duplicated outcome strings/classifiers, no debug artifacts, and no unrelated files.

- [ ] Record release-readiness decisions: no new telemetry event/field, no settings search/deep-link change, and no new Playwright scenario because the affected risk is covered more precisely at contract/provider/caller level. Run existing E2E only if related browser validation exposes a runtime-specific regression.

- [ ] Commit final convergence only after all required gates pass:

  ```powershell
  git add src/services/managedSites/mutationCertainty.ts tests/services/apiAdapters/managedSiteMutationConformance.test.ts
  git commit -m "refactor(managed-sites): complete mutation outcome migration"
  ```

## Final acceptance checklist

- Every managed-site channel, auxiliary model write, transitional resource write, native resource write, service facade, workspace, and direct caller uses the common result.
- All six managed-site types pass the reusable provider contract for every supported mutation.
- New API and AxonHub multi-step operations preserve confirmed first-step effects and classify the terminal step truthfully.
- No expected operational mutation failure crosses a domain/public workspace boundary as an ordinary exception.
- Internal raw diagnostics remain available only in-process; every output boundary uses its exact projector and runtime validator.
- Private UI retains safe upstream status/code/message; persistence, telemetry, analytics, messages, and reports receive no raw text, identifiers, secrets, or mutation data.
- Partial/uncertain outcomes require fresh reconciliation and have no blind-retry route.
- Provider request payload snapshots remain unchanged.
- Old aliases, certainty helpers, migration adapters, duplicate classifiers, and expected-mutation exception branches have zero production references.
- Focused, related, compile, staged, push-equivalent, diff, and maintainability gates pass with unrelated baseline instability reported separately.

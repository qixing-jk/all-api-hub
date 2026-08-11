# Account Key Inventory Native Reconciliation

Status: complete

## Problem Statement

The account-key coverage repair still treats New API-shaped `ApiToken` values,
numeric `tokenId` values, group names, and repair-specific result fields as its
cross-layer contract. That shape leaks provider facts into orchestration,
forces Sub2API and other account site types through New API terminology, and
makes exact creation provenance, mutation uncertainty, secret recovery, and
managed-site import harder to express safely.

The repository already has the stronger foundation needed for the replacement:
provider-native account key resources use `AccountKeyResourceRef`, account
runtime operations use `AccountRuntimeKey`, and managed-site import already
owns shared review, duplicate assessment, target validation, execution, and
partial-result behavior. The repair workflow should compose these capabilities
without recreating provider CRUD inside the repair runner or adding a separate
repair-only managed-site importer.

## Goals

- Replace repair-owned `ApiToken`, `tokenId`, group, and `createdGroups`
  contracts with provider-neutral requirements, placements, resource refs, and
  per-requirement results.
- Keep one provider-neutral `reconcileAccountKeyInventory` module for complete
  inventory comparison, sequential provisioning, uncertainty reconciliation,
  and result aggregation.
- Keep provider facts and native commands in account key resource Adapters.
- Preserve current eligible-provider behavior for the New API Adapter Family,
  Sub2API, and VoAPI v2 before removing the legacy repair implementation.
- Preserve invalid-key deletion and automatic default-key rename behavior with
  explicit ref-based mutation outcomes.
- Carry exact created-resource provenance into the existing shared managed-site
  import flow without persisting plaintext secrets.
- Invalidate incompatible historical repair progress while leaving saved
  account records untouched.

## Non-Goals

- Migrating every Managed Site Type Adapter to `AccountRuntimeKey` in this
  effort.
- Replacing the shared managed-site preview, duplicate assessment, channel
  draft, target verification, or execution modules.
- Making OpenRouter, AIHubMix, SharedChat, or currently unsupported account site
  types eligible for background key coverage repair.
- Persisting account key plaintext, created-secret values, raw provider
  responses, or provider error objects.
- Changing saved-account storage shape, authentication, onboarding, or account
  refresh behavior.
- Adding scheduled repair, automatic repair on startup, or automatic invalid
  key deletion.

## Three-Layer Orchestration

### Layer 1: Provider-native account key session

`AccountKeyResourceCapability.open(...)` returns an
`AccountKeyResourceSession` bound to one saved account, request context, and
provider configuration. The session remains the seam for resource scopes,
complete inventory reads, opaque refs, native mutations, and runtime-key
resolution.

An eligible Adapter exposes an optional `session.provisioning` facet. It owns:

- requirement discovery from provider-native account facts;
- stable opaque requirement identity and user-facing labels;
- resource placement classification;
- provider-native default creation;
- provider-native recognition and rename of extension-created default keys;
- mutation failure normalization and certainty; and
- any bounded read-only recovery that can prove an exact created ref.

The facet does not implement the full repair loop. It does not aggregate
progress, choose the next account, import into a managed site, or inspect other
providers.

An eligible runtime source exposes
`session.runtimeKey.resolve(ref, options)`. It turns one correlated
`AccountKeyResourceRef` into a transient `AccountRuntimeKey`, resolving a
recoverable secret only at the point of use. Create-response-only resources
may hand a correlated created secret across extension entrypoints through
`browser.storage.session` for the current repair session, but do not claim
historical secret recovery.

### Layer 2: Provider-neutral inventory reconciler

`reconcileAccountKeyInventory(...)` owns one account reconciliation. It:

1. loads every required scope and page;
2. rejects incomplete inventory as unsafe for missing-key decisions;
3. loads requirements through `session.provisioning`;
4. classifies each resource placement without parsing display fields;
5. computes covered, missing, invalid, unknown, and ignored resources;
6. optionally renames recognized extension-created defaults;
7. provisions missing requirements sequentially;
8. performs at most one bounded read-only reconciliation after an uncertain
   create;
9. separates current coverage from exact creation provenance; and
10. returns deterministic per-requirement and per-resource results.

The reconciler does not know group names, numeric group IDs, token fields,
provider DTOs, storage, UI progress, or managed-site channel contracts.

### Layer 3: Product workflows

`AccountKeyRepairRunner` owns enabled-account selection, skip policy,
per-origin serialization, cancellation, progress persistence, messaging,
summary counts, user-triggered invalid deletion, and the
`renameAutoTemplateTokens` option. It calls the reconciler once per eligible
account and projects its public result into progress.

The managed import bridge consumes exact created refs after the user opens the
shared import review. It resolves each ref through the saved account's resource
session, uses a same-operation created-secret projection when available or
`session.runtimeKey.resolve(ref)` otherwise, and supplies `AccountRuntimeKey`
inputs to the existing shared managed-site import flow. Target Managed Site
Type Adapters remain behind their existing channel-draft and mutation seams.

## Native Contracts

### Requirements and placement

A requirement is provider-owned and opaque to shared orchestration:

```ts
type AccountKeyProvisioningRequirement = {
  requirementKey: string
  displayName: string
  provisioning:
    | { kind: "automatic" }
    | { kind: "input-required"; reasonCode: string }
}
```

Requirement IDs must be stable for the lifetime of a repair job. Sub2API uses
its numeric group identity encoded as a string when available; a group name is
display data, not identity. New API-family Adapters may use a normalized
provider group name when that is the upstream identity. Except for One API,
whose token group is not applicable, an empty New API-family token group
inherits the account group resolved from the current-user endpoint. A missing
or invalid current-user group remains an explicit unresolved inherited-group
result. Providers without usable group inventory may expose one explicit
account-default requirement when current behavior is one-key coverage.

Requirement discovery is explicit:

```ts
type AccountKeyRequirementInventory =
  | {
      kind: "complete"
      requirements: readonly AccountKeyProvisioningRequirement[]
    }
  | { kind: "blocked"; reason: ControlledReason }
  | { kind: "unavailable"; failure: ResourceFailure }
```

An empty array means the provider has proved that no key is required. It never
means group discovery failed, group selection is required, or one-key fallback
should be inferred.

Every requirement explicitly states whether the Adapter can safely execute its
native default write. `input-required` is a first-class blocked outcome, not a
signal for shared orchestration to guess provider fields or defaults.

Resource placement is also explicit. One native key may satisfy multiple
provider requirements:

```ts
type AccountKeyResourcePlacement =
  | { kind: "requirement"; requirementKeys: readonly string[] }
  | { kind: "orphaned"; placementKey: string; displayName?: string }
  | { kind: "unmanaged" }
  | { kind: "unknown" }
```

The Adapter derives placement from provider-native data retained behind its
resource definition. Shared code never parses `ResourceDisplayFact.fieldId`,
display labels, masked keys, or provider group names.

### Inventory completeness

Complete inventory is a correctness prerequisite, not a convenience flag.
The session and collection path must surface whether scope discovery and every
resource page completed. Duplicate refs, cursor cycles, page caps, partial
scope discovery, cancellation, and provider pagination errors make the
inventory incomplete.

When inventory is incomplete, the reconciler returns an incomplete result and
performs no create, rename, or delete mutation. This is a global invariant for
the account operation: any partial failure, duplicate ref, unknown coverage,
unknown placement, malformed placement, or placement referring to an unknown
requirement blocks every mutation, not just the apparently affected
requirement. Unknown is not treated as missing. A successful empty complete
inventory is distinct from a failed or partial inventory.

The same rule applies after an uncertain create. Its single read-only refresh
becomes the working inventory for every remaining requirement; the reconciler
must not continue from the older pre-mutation snapshot. If that refresh is
incomplete or introduces any global safety violation, it proves neither
coverage nor invalid-resource eligibility and blocks every remaining mutation.
An incomplete final inventory therefore exposes no actionable invalid refs.

### Mutation certainty

Every create, rename, and invalid-delete mutation is normalized to:

```ts
type AccountKeyMutationOutcome<T> =
  | { outcome: "applied"; value: T }
  | { outcome: "rejected"; failure: ResourceFailure }
  | { outcome: "uncertain"; failure: ResourceFailure }
```

One resource mutation does not report aggregate partial success. Partial
success is computed by Layer 2 or Layer 3 from multiple per-item outcomes.
Programming errors and malformed Adapter results throw; provider rejection and
post-dispatch uncertainty return controlled outcomes. Adapters preserve safe
provider messages and codes in `failure`; shared orchestration consumes only
that stable shape and never parses provider response bodies.

The reconciler never blindly replays an uncertain create, rename, or delete.
It may perform one bounded read-only inventory refresh. A refreshed matching
resource can prove that a requirement is now covered, but an uncertain create
does not become trusted creation provenance merely because coverage appeared.

### Creation provenance and secrets

Exact creation provenance is one of:

- an applied create response carrying a correlated `AccountKeyResourceRef`;
- an applied create acknowledgement followed by one unambiguous provider-owned
  ref recovery; or
- another Adapter-specific proof documented and tested at the provisioning
  seam.

`covered-after-uncertain` is coverage evidence, not creation provenance. It is
excluded from repair-created `trusted-new` import.

When an uncertain create is followed by a complete refresh, the refreshed
coverage also drives the remaining requirement decisions. A resource observed
for a later requirement prevents a duplicate create even when it appeared only
after the earlier uncertain write.

An applied result may return a `CreatedRuntimeSecret` correlated to the exact
ref. The secret is stored only in bounded `browser.storage.session` state keyed
by repair job plus full ref. It may be used only by a `CURRENT_SESSION` import
review; `HISTORICAL` review bypasses this cache and calls
`session.runtimeKey.resolve(ref)`. New jobs, explicit cancellation, failed
runs, and cold-start terminalization clear the cache, while successful or
already-present receipts discard their exact refs. Repeated entries for one
exact ref must carry the same secret and are deduplicated; conflicting secrets
fail closed without changing the cache. Only the ref and controlled result
metadata enter local progress, receipts, runtime messages, logs, or telemetry.
If the provider cannot recover a historical secret, the row blocks.

## Repair Results and Progress Version

Per-account progress stores provider-neutral summaries and item results:

- requirement IDs and display labels;
- covered, missing, rejected, uncertain, and blocked requirement results;
- exact `createdRefs` only;
- invalid resource refs and controlled reasons;
- rename applied, rejected, and uncertain results; and
- account-level completion/partial/failure status derived from those items.

Invalid deletion requests and receipts identify resources by
`AccountKeyResourceRef`, never numeric `tokenId`. Managed import receipts are
keyed by target fingerprint plus resource-ref identity.

The UI's created count is the number of exact created refs recorded by the
current repair result. It is not a count of secrets already proved recoverable.
Current availability, secret recovery, and existing target imports are checked
only when the user opens the shared managed-import review; unavailable refs
become explicit blocked rows.

The new progress payload has a required schema version. Existing stored repair
progress without the current version is intentionally invalidated and read as
idle; it is not migrated. The next repair start replaces it with the current
shape. This invalidation applies only to the repair-progress storage key.
Saved accounts, account credentials, tags, preferences, and other account
storage remain unchanged.

## Provider Parity

Legacy repair removal is gated on current eligible-provider parity:

- **New API Adapter Family:** keep per-site-type routing and verified variant
  behavior. Group facts and default fallback stay inside the family Adapter.
- **Sub2API:** use provider group ID as requirement identity, keep group name as
  display data, treat an ID with missing joined group data as unknown/incomplete,
  and preserve full paginated key inventory.
- **VoAPI v2:** use native paginated key inventory and stable provider key/group
  identities. A key may cover multiple group requirements. Retired-only groups
  are orphaned, while a mixture of known and unknown groups is unknown and
  blocks mutation globally. Finite-quota creation requires user-provided quota;
  until that input seam exists, reconciliation returns `blocked-input-required`
  and never guesses an unlimited sentinel or default amount. Native runtime
  reveal, provider-owned template rename, exact delete, and strict pagination
  completeness remain behind the Adapter.
- **AIHubMix:** remains skipped because the current repair policy and
  one-time-secret behavior are not compatible with background coverage.
- **OpenRouter:** retains native key management but does not implement this
  background provisioning facet; existing rows are create-response-only and a
  Management Key is not a runtime inference secret.
- **SharedChat and unsupported site types:** retain current no-repair behavior.
- **None-auth accounts:** remain skipped by Layer 3.

Parity tests derive the eligible set from the current registry/capability
contracts so a newly eligible account site type cannot silently miss the native
reconciliation path.

## Invalid Delete and Default Rename

The automatic reconciliation step never deletes invalid resources. It reports
exact invalid refs for the existing explicit destructive UI.

User-confirmed deletion runs serially and records applied, rejected, and
uncertain results. Applied rows leave the invalid list; rejected and uncertain
rows remain visible with controlled recovery guidance. An uncertain delete is
not automatically replayed.

Default-key rename remains opt-in through the existing repair start option.
Provider Adapters recognize their own extension-created template names and
attach a provider-owned rename suggestion to the native inventory item. Shared
orchestration never parses display names to infer rename intent or construct a
provider command. The reconciler may request a rename only for a resource
already placed against a current requirement. A rename failure does not remove
otherwise valid coverage, and its applied, rejected, or uncertain result is
reported separately.

## Resource Ref to Managed Import

The repair-created managed import path is:

```text
AccountKeyResourceRef
  -> current saved account and AccountKeyResourceSession
  -> current-session browser-session secret or runtimeKey.resolve(ref)
  -> transient AccountRuntimeKey
  -> shared managed import review and execution
  -> Resource Ref based receipt
```

Resolution matches the exact ref and never substitutes a nearby resource. A
missing account, changed site type, changed normalized source origin, missing
scope, missing resource, unresolved secret, or malformed runtime projection
becomes a per-row blocker.

The bridge is the only new compatibility point with managed import. It may
project the transient runtime key into the existing shared channel-draft input
owned by that flow. This effort does not migrate all target Managed Site Type
Adapters. It also does not add provider branches to the repair UI or create a
repair-specific target channel writer.

`trusted-new` is available only for exact created refs from the current repair
session with no prior same-target attempt. Failed or uncertain target writes
retain ref-based receipts and retry through complete duplicate reconciliation.
Historical review never reads the current-session created-secret cache.

## Five Public Test Seams

Tests for the new architecture cross only these public interfaces:

1. `AccountKeyResourceSession.provisioning` contract.
2. `reconcileAccountKeyInventory` public function and result.
3. `AccountKeyRepairRunner` progress plus per-account/per-requirement results.
4. `AccountKeyResourceSession.runtimeKey.resolve(ref)` resource-ref runtime
   resolution.
5. The managed import bridge consuming `AccountRuntimeKey` or a correlated
   created-secret projection and emitting Resource Ref based receipts.

Contract tests may provide in-memory/fake sessions and provider transport
fixtures behind these seams. They assert observable results, mutation
certainty, persisted controlled data, and user-visible workflow outcomes. They
do not assert internal helper call order, private cache layout, loop structure,
or mock choreography below the public interface.

Required cases include:

- complete empty inventory versus partial or unavailable inventory;
- multi-scope and multi-page completion, duplicate refs, cursor cycles, and
  cancellation;
- explicit default fallback, complete requirement inventory, blocked discovery,
  and unknown placement;
- sequential create with mixed applied, rejected, and uncertain outcomes;
- uncertain create yielding coverage without trusted creation provenance;
- exact created ref plus transient created secret;
- default rename success, rejection, and uncertainty without coverage loss;
- serial invalid delete with mixed results and no automatic replay;
- New API-family, Sub2API, and VoAPI v2 parity;
- stale progress version returning idle while saved accounts remain unchanged;
- exact ref runtime resolution, missing resource, unresolved secret, and
  create-response-only behavior; and
- ref-based managed import receipts, same-target retry, target change, and
  secret-free persistence.

## Telemetry, Settings, and E2E Decisions

Reuse existing repair and managed-import analytics. Keep payloads to controlled
provider-neutral counts, status categories, durations, and source/verification
enums. Do not record requirement labels, refs, account IDs, URLs, secrets, raw
errors, or backend messages.

No settings control, settings-search target, or deep link is added or moved.

Use Vitest and Testing Library at the five public seams for the behavior matrix.
Update or add one representative Playwright flow only if the final integration
risk depends on real extension storage, background messaging, or the shared
managed-import entrypoint. Do not move requirement, placement, or mutation
matrices into E2E.

## Delivery Slices

1. [Define the native contracts, progress schema, and public test fixtures](issues/01-define-native-reconciliation-contracts.md).
2. [Implement and prove the provider-neutral reconciler with a fake session](issues/02-implement-account-key-inventory-reconciler.md).
3. [Add New API Adapter Family native reconciliation and runtime resolution](issues/03-migrate-new-api-family-key-resources.md).
4. [Add Sub2API native reconciliation and runtime resolution](issues/04-migrate-sub2api-key-resources.md).
5. [Add VoAPI v2 native parity](issues/05-preserve-voapi-v2-repair-parity.md).
6. [Cut the repair runner, invalid deletion, rename results, messaging,
   storage, and UI to the new public result](issues/06-cut-repair-runner-to-native-results.md).
7. [Add the ref-to-runtime managed import bridge and ref-based receipts](issues/07-bridge-resource-refs-to-managed-import.md).
8. [Remove superseded repair-only token contracts after parity and complete
   affected validation](issues/08-remove-legacy-repair-token-contracts.md).

Each slice must leave the public seam green and preserve unrelated account and
managed-site behavior. Legacy removal is the final slice, not a prerequisite
for proving the new path.

## Further Notes

- The architecture is intentionally asymmetric: account key source Adapters
  migrate to native resources, while target Managed Site Type Adapters remain
  behind the existing shared import flow.
- `AccountKeyResourceRef` becomes a persisted repair identity, so provider ref
  encoding must remain stable for the lifetime of current-version progress.
- The central invariant is fail-closed reconciliation: incomplete or unknown
  inventory can produce diagnostics and blockers, but never a missing-key write.

## Completion Evidence

Completed on 2026-08-11. The current task tree passed:

- `pnpm compile`;
- `pnpm run i18n:extract:ci`;
- 170 current-tree repair, UI, reconciliation, provider-adapter, and
  managed-import Vitest cases;
- 87 CopyKey, runtime-key, and typed-messaging Vitest cases;
- 314 provider, registry, account-lifecycle, and native-resource Vitest cases;
- scoped ESLint and Prettier checks plus `git diff --check`; and
- the representative Playwright repair/delete/import scenario against the
  built extension.

A final independent read-only review rechecked historical/current-session
secret boundaries, cold-start cleanup, exact-ref conflict handling, invalid
delete validation, scope validation, incomplete-inventory classification, and
legacy callback removal without finding a remaining material issue.

The final audit found no repair-only dependency on legacy `createdGroups`,
`createdTokens`, numeric `tokenId`, token-based invalid deletion, or the old
repair-created token import module name. Existing managed-site
`TokenBatchImport` naming remains unchanged because it is the target flow's
public contract rather than a repair-source identity.

# AxonHub Canonical Migration Capability Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox notation (`- [ ]`) for tracking.

**Goal:** Route AxonHub migration as both source and target through a named, feature-owned canonical capability while preserving the current dialog and every observable migration behavior.

**Architecture:** The migration feature owns canonical source, target projection, adjustment, command, and result models. A temporary legacy facade is the only new Module allowed to translate `ManagedSiteChannel` or `ChannelFormData`; the AxonHub capability consumes native refs and PR1 native operations, and the current dialog continues to receive its existing preview/result shape.

**Tech Stack:** TypeScript 5.9, Vitest 4, existing managed-site migration orchestration, PR1 resource-native registry and AxonHub Adapter, React Testing Library regression tests.

---

## Source, prerequisite, and stop conditions

Implement the second delivery slice from
`docs/superpowers/specs/2026-07-16-managed-site-resource-native-extension-design.md`.

Prerequisite: the PR1 plan
`2026-07-16-managed-site-resource-native-substrate.md` is implemented and
green. Execute this plan before the native UI cutover plan.

Stop and split the PR if any of these becomes necessary:

- more than eight production files;
- moving a second Site Type to the named capability;
- changing migration dialog props or rendered shape;
- changing locales, analytics contracts, runtime messages, persistence, or
  options routing;
- changing numeric UI row identity to native resource identity;
- adding protocol operations that belong in PR1;
- changing more than roughly 300 lines inside `channelMigration.ts` instead of
  extracting canonical orchestration.

## File structure

Create:

- `src/types/managedSiteMigrationCapability.ts` — feature-owned canonical
  migration types and named capability Interface.
- `src/services/managedSites/channelMigrationCapabilityRegistry.ts` — explicit
  migration capability lookup.
- `src/services/managedSites/channelMigrationLegacyFacade.ts` — the only new
  legacy row/draft translation seam.
- `src/services/apiAdapters/managedResources/axonHubMigration.ts` — AxonHub
  source/target capability built on PR1 native primitives.
- `tests/services/managedSites/channelMigrationCapabilityRegistry.test.ts` —
  registry and no-fallback tests.

Modify:

- `src/types/managedSiteMigration.ts` — optional internal canonical preparation
  on existing preview rows.
- `src/services/managedSites/channelMigration.ts` — canonical orchestration
  while preserving exported signatures.
- `src/services/managedSites/managedUpstreamResourceMigration.ts` — remove only
  AxonHub's old channel-migration feature gate.
- `src/services/apiAdapters/managedResources/axonHub.ts` — export the existing
  native detail/create primitives for the named capability; do not add legacy
  draft logic.
- `tests/services/managedSites/channelMigration.test.ts` — source/target
  equivalence and per-row outcomes.
- `tests/services/apiAdapters/managedResources/axonHub.test.ts` — canonical
  mapping and native mutation coverage.
- `tests/services/managedSites/managedUpstreamResourceService.test.ts` — old
  gate regression.

Keep `ManagedSiteChannelMigrationDialog.tsx`, its locale keys, and analytics
contracts unchanged. Modify its test only if TypeScript fixtures require the new
optional property.

### Task 1: Define canonical migration models and an explicit registry

**Files:**

- Create: `src/types/managedSiteMigrationCapability.ts`
- Create: `src/services/managedSites/channelMigrationCapabilityRegistry.ts`
- Create: `tests/services/managedSites/channelMigrationCapabilityRegistry.test.ts`

- [ ] **Step 1: Write failing registry tests**

Add:

```ts
describe("channelMigrationCapabilityRegistry", () => {
  it("returns null when a Site Type has no named migration capability", () => {
    expect(resolveManagedSiteMigrationCapability(SITE_TYPES.NEW_API)).toBeNull()
  })

  it("does not fall back to the old resource feature gate", () => {
    expect(resolveManagedSiteMigrationCapability(SITE_TYPES.AXON_HUB)).toBeNull()
    expect(resolveManagedUpstreamResourceFeatureCapabilities).not.toHaveBeenCalled()
  })
})
```

The first commit intentionally has no production registration.

- [ ] **Step 2: Run the test and verify failure**

```powershell
pnpm exec vitest run tests/services/managedSites/channelMigrationCapabilityRegistry.test.ts
```

Expected: FAIL because the canonical type and registry modules do not exist.

- [ ] **Step 3: Add the feature-owned canonical types**

Create `managedSiteMigrationCapability.ts`:

```ts
import type { ChannelType } from "~/constants/managedSite"
import type { ManagedSiteType } from "~/constants/siteType"
import type {
  ManagedResourceRef,
  ResourceOperationOptions,
} from "~/services/apiAdapters/contracts/managedResourceNative"

import type {
  ManagedSiteChannelMigrationBlockedReasonCode,
  ManagedSiteChannelMigrationGeneralWarningCode,
  ManagedSiteChannelMigrationItemWarningCode,
} from "./managedSiteMigration"

export type ManagedSiteMigrationSelection = {
  selectionId: string
  displayName: string
  ref: ManagedResourceRef
}

export type ManagedSiteMigrationStatus = "enabled" | "disabled" | "other"

export type ManagedSiteMigrationLossSignals = {
  hasModelMapping: boolean
  hasStatusCodeMapping: boolean
  hasAdvancedSettings: boolean
  hasMultiKeyState: boolean
}

export type ManagedSiteMigrationSource = {
  sourceSiteType: ManagedSiteType
  resourceType: ChannelType
  baseUrl: string
  models: string[]
  groups: string[]
  priority: number
  weight: number
  status: ManagedSiteMigrationStatus
  lossSignals: ManagedSiteMigrationLossSignals
}

export type ManagedSiteMigrationPreviewProjection = {
  name: string
  type: ChannelType | string
  baseUrl: string
  models: string[]
  groups: string[]
  priority: number
  weight: number
  status: 1 | 2
}

export type ManagedSiteMigrationTargetAdjustments = {
  remappedType: boolean
  normalizedBaseUrl: boolean
  forcedDefaultGroup: boolean
  ignoredPriority: boolean
  ignoredWeight: boolean
  simplifiedStatus: boolean
}

export type ManagedSiteMigrationExecutionCommand = {
  source: ManagedSiteMigrationSource
  targetSiteType: ManagedSiteType
  projection: ManagedSiteMigrationPreviewProjection
  credential: string
}

export type ManagedSiteMigrationTargetPreparation = {
  projection: ManagedSiteMigrationPreviewProjection
  adjustments: ManagedSiteMigrationTargetAdjustments
}

export type ManagedSiteMigrationSourcePreparation =
  | { status: "ready"; source: ManagedSiteMigrationSource }
  | {
      status: "blocked"
      reasonCode: ManagedSiteChannelMigrationBlockedReasonCode
    }

export type ManagedSiteMigrationCredentialResolution =
  | { status: "ready"; credential: string }
  | {
      status: "blocked"
      reasonCode: ManagedSiteChannelMigrationBlockedReasonCode
    }

export const MANAGED_SITE_MIGRATION_EXECUTION_FAILURE_CODES = {
  SourceUnavailable: "source_unavailable",
  TargetUnavailable: "target_unavailable",
  TargetRejected: "target_rejected",
  MutationStateUncertain: "mutation_state_uncertain",
  Unexpected: "unexpected",
} as const

export type ManagedSiteMigrationExecutionFailureCode =
  (typeof MANAGED_SITE_MIGRATION_EXECUTION_FAILURE_CODES)[keyof typeof MANAGED_SITE_MIGRATION_EXECUTION_FAILURE_CODES]

export type ManagedSiteMigrationCreateResult =
  | { status: "created" }
  | { status: "failed"; failureCode: ManagedSiteMigrationExecutionFailureCode }
  | { status: "uncertain" }

export type ManagedSiteMigrationCanonicalPreviewItem = {
  selection: ManagedSiteMigrationSelection
  status: "ready" | "blocked"
  warningCodes: readonly ManagedSiteChannelMigrationItemWarningCode[]
  blockingReasonCode?: ManagedSiteChannelMigrationBlockedReasonCode
  source?: ManagedSiteMigrationSource
  target?: ManagedSiteMigrationTargetPreparation
}

export type ManagedSiteMigrationCanonicalPreview = {
  sourceSiteType: ManagedSiteType
  targetSiteType: ManagedSiteType
  generalWarningCodes: readonly ManagedSiteChannelMigrationGeneralWarningCode[]
  items: readonly ManagedSiteMigrationCanonicalPreviewItem[]
  totalCount: number
  readyCount: number
  blockedCount: number
}

export type ManagedSiteMigrationCanonicalExecutionResult = {
  totalSelected: number
  attemptedCount: number
  createdCount: number
  failedCount: number
  skippedCount: number
  uncertainCount: number
  items: readonly {
    selectionId: string
    displayName: string
    status: "created" | "failed" | "skipped" | "uncertain"
    failureCode?: ManagedSiteMigrationExecutionFailureCode
    blockingReasonCode?: ManagedSiteChannelMigrationBlockedReasonCode
  }[]
}

export type ManagedSiteMigrationCapability = {
  source?: {
    prepare(
      selection: ManagedSiteMigrationSelection,
      options?: ResourceOperationOptions,
    ): Promise<ManagedSiteMigrationSourcePreparation>
    resolveCredential(
      selection: ManagedSiteMigrationSelection,
      options?: ResourceOperationOptions,
    ): Promise<ManagedSiteMigrationCredentialResolution>
  }
  target?: {
    prepare(
      source: ManagedSiteMigrationSource,
      options?: ResourceOperationOptions,
    ): Promise<ManagedSiteMigrationTargetPreparation>
    create(
      command: ManagedSiteMigrationExecutionCommand,
      options?: ResourceOperationOptions,
    ): Promise<ManagedSiteMigrationCreateResult>
  }
}
```

Every preview and result type above is secret-free. The execution function
calls `source.resolveCredential(selection)` immediately before target creation,
constructs `ManagedSiteMigrationExecutionCommand` in local scope, awaits one
`target.create(command)`, and then drops the command. The command must never be
returned, cached, persisted, placed in React state, logged, or analyzed.
If credential resolution is blocked after a ready preview, emit a skipped item
with the controlled blocker and do not increment `attemptedCount`. A confirmed
target rejection emits failed; possible/partial application emits uncertain.

The canonical file must not import `ManagedSiteChannel`, `ChannelFormData`,
editor descriptors, or the legacy runtime-config union.

- [ ] **Step 4: Add an empty explicit registry**

Create `channelMigrationCapabilityRegistry.ts` with a typed registration array
and this lookup:

```ts
export function resolveManagedSiteMigrationCapability(
  siteType: ManagedSiteType,
): ManagedSiteMigrationCapability | null {
  return registrations.find((entry) => entry.siteType === siteType)?.capability ?? null
}
```

Do not import the old feature gates or create a generic capability bag.

- [ ] **Step 5: Run tests and compile**

```powershell
pnpm exec vitest run tests/services/managedSites/channelMigrationCapabilityRegistry.test.ts
pnpm compile
```

Expected: PASS.

- [ ] **Step 6: Commit the canonical contract**

```powershell
git add src/types/managedSiteMigrationCapability.ts src/services/managedSites/channelMigrationCapabilityRegistry.ts tests/services/managedSites/channelMigrationCapabilityRegistry.test.ts
pnpm run validate:staged
git commit -m "refactor(managed-sites): define canonical migration capabilities"
```

### Task 2: Introduce the legacy compatibility facade without behavior changes

**Files:**

- Create: `src/services/managedSites/channelMigrationLegacyFacade.ts`
- Modify: `src/types/managedSiteMigration.ts`
- Modify: `src/services/managedSites/channelMigration.ts`
- Test: `tests/services/managedSites/channelMigration.test.ts`

- [ ] **Step 1: Add failing compatibility tests**

Add tests proving:

- non-Axon preview rows keep identical `channelId`, `channelName`, order,
  warnings, `draft`, and counts;
- source key hydration concurrency remains `5`;
- target-config missing, empty response messages, thrown errors, blocked rows,
  and successful-row retention remain unchanged;
- current exported preview and execution function signatures remain usable.

Also add failing tests for the new canonical entry points:

```ts
export function prepareManagedSiteMigrationPreview(params: {
  sourceSiteType: ManagedSiteType
  targetSiteType: ManagedSiteType
  selections: readonly ManagedSiteMigrationSelection[]
  options?: ResourceOperationOptions
}): Promise<ManagedSiteMigrationCanonicalPreview>

export function executeManagedSiteMigration(params: {
  preview: ManagedSiteMigrationCanonicalPreview
  options?: ResourceOperationOptions
}): Promise<ManagedSiteMigrationCanonicalExecutionResult>
```

The canonical entry points use string `selectionId` and `ManagedResourceRef`;
they never accept `ManagedSiteChannel` or return `ChannelFormData`.

Add one test that calls the new facade directly and proves its product model is
secret-free:

```ts
const source = toCanonicalMigrationSourceFromLegacyChannel({
  sourceSiteType: SITE_TYPES.NEW_API,
  channel: buildManagedSiteChannel({ id: 7, name: "Example" }),
})
expect(source).toMatchObject({
  sourceSiteType: SITE_TYPES.NEW_API,
})
expect(source).not.toHaveProperty("credential")
```

- [ ] **Step 2: Run the migration test and verify failure**

```powershell
pnpm exec vitest run tests/services/managedSites/channelMigration.test.ts
```

Expected: FAIL because the legacy facade does not exist.

- [ ] **Step 3: Add the optional canonical preparation to preview rows**

In `managedSiteMigration.ts` add:

```ts
export type ManagedSiteMigrationCanonicalPreparation = {
  selection: ManagedSiteMigrationSelection
  source: ManagedSiteMigrationSource
  target: ManagedSiteMigrationTargetPreparation
}
```

Add `canonicalPreparation?: ManagedSiteMigrationCanonicalPreparation` to
`ManagedSiteChannelMigrationPreviewItem`. Keep all existing fields and names.

- [ ] **Step 4: Extract the permitted legacy translation functions**

The new facade owns exactly:

- `toCanonicalMigrationSourceFromLegacyChannel`
- `toCanonicalMigrationSelectionFromLegacyAxonRow`
- `resolveAxonHubMigrationResourceRefFromLegacyRow`
- `toCanonicalTargetPreparationFromLegacyDraft`
- `toLegacyChannelFormDataProjection`
- `collectLegacyMigrationLossSignals`
- `toLegacyMigrationWarningCodes`

It is the only new Module allowed to accept `ManagedSiteChannel` or return
`ChannelFormData`. Prefer an existing `resourceRef`; the temporary Axon fallback
may use `_axonHubData.id`. Preserve numeric selection identity and native string
resource identity separately. The canonical selection uses the native ref and
a string `selectionId`; numeric `channelId` remains exclusively on the existing
legacy preview/result shape.
`toCanonicalTargetPreparationFromLegacyDraft` removes the credential and maps
only preview projection/adjustment facts. `toLegacyChannelFormDataProjection`
accepts the safe source, safe target projection, and an execution-time
credential, and returns an ephemeral target draft only to the existing target
create call.

- [ ] **Step 5: Route legacy paths through the facade with no production registration**

Add `prepareManagedSiteMigrationPreview` and `executeManagedSiteMigration` as
the canonical orchestration entry points. Refactor `buildPreviewItem`, warning
collection, target draft preparation, and execution to use them internally.
Keep `prepareManagedSiteChannelMigrationPreview` and
`executeManagedSiteChannelMigration` as legacy wrappers that translate through
the facade and preserve every observable existing field, row order, count,
warning, copy, and behavior. The optional canonical preparation is safe and
contains no credential or execution command. Because the named registry is
still empty, every production Site Type must finish on its current legacy or
old resource path.

The canonical orchestrator supports a named native source with a legacy target:
preview translates the safe canonical source through the existing legacy target
preparation and immediately converts that draft back to the secret-free target
projection/adjustments. Execution resolves the source credential just in time,
injects it into an ephemeral `ChannelFormData` inside
`channelMigrationLegacyFacade.ts`, invokes the target's existing create path
once, and discards both values. Neither the draft nor credential enters the
canonical preview. This bridge is target compatibility, not a native source
conversion to `ManagedSiteChannel`.

- [ ] **Step 6: Run migration and dialog regression tests**

```powershell
pnpm exec vitest run tests/services/managedSites/channelMigration.test.ts tests/features/ManagedSiteChannels/components/ManagedSiteChannelMigrationDialog.test.tsx
```

Expected: PASS.

- [ ] **Step 7: Commit the compatibility plumbing**

```powershell
git add src/services/managedSites/channelMigrationLegacyFacade.ts src/types/managedSiteMigration.ts src/services/managedSites/channelMigration.ts tests/services/managedSites/channelMigration.test.ts
pnpm run validate:staged
git commit -m "refactor(managed-sites): normalize migration through canonical models"
```

### Task 3: Route AxonHub source and target through the named capability

**Files:**

- Create: `src/services/apiAdapters/managedResources/axonHubMigration.ts`
- Modify: `src/services/apiAdapters/managedResources/axonHub.ts`
- Modify: `src/services/managedSites/channelMigrationCapabilityRegistry.ts`
- Modify: `src/services/managedSites/channelMigration.ts`
- Modify: `src/services/managedSites/managedUpstreamResourceMigration.ts`
- Modify: `tests/services/apiAdapters/managedResources/axonHub.test.ts`
- Modify: `tests/services/managedSites/channelMigrationCapabilityRegistry.test.ts`
- Modify: `tests/services/managedSites/channelMigration.test.ts`
- Modify: `tests/services/managedSites/managedUpstreamResourceService.test.ts`

- [ ] **Step 1: Add failing named-capability registry and gate tests**

Change the registry expectation to:

```ts
expect(resolveManagedSiteMigrationCapability(SITE_TYPES.AXON_HUB)).toMatchObject({
  source: {
    prepare: expect.any(Function),
    resolveCredential: expect.any(Function),
  },
  target: { prepare: expect.any(Function), create: expect.any(Function) },
})
```

In the old resource service test, assert that AxonHub channel migration returns
`feature-slice-disabled`, while Axon core resource resolution and every other
existing feature gate remain unchanged.

- [ ] **Step 2: Add failing Axon source/target orchestration tests**

Add these exact cases to `channelMigration.test.ts`:

- `prepares an Axon target through the named capability and keeps the displayed legacy draft equivalent`
- `resolves an Axon credential only at execution and creates exactly once without legacy payload builders`
- `prepares an Axon source from its native string ref without old secret hydration`
- `maps permission-hidden Axon credentials to the existing blocked row`
- `preserves Axon source projection when targeting a legacy site`
- `executes an Axon native selection into a legacy target with one just-in-time credential resolution and one create`
- `blocks only the row whose named target preparation fails`
- `continues after one named target create failure`
- `preserves string selection identity and order across native preparation`
- `maps uncertain target creation to an explicit non-replayable result`
- `keeps canonical preview and result objects free of credentials and commands`
- `returns the existing create-only no-dedupe and no-rollback general warnings`

When `targetSiteType` is AxonHub, assert that the path does not call old
`prepareImportDraft`, `resources.items.create`, legacy `buildChannelPayload`,
or legacy `createChannel`. An Axon source targeting a non-Axon legacy site is
expected to call that target's existing create path through the compatibility
facade exactly once.

- [ ] **Step 3: Run the focused tests and verify red state**

```powershell
pnpm exec vitest run tests/services/managedSites/channelMigrationCapabilityRegistry.test.ts tests/services/managedSites/channelMigration.test.ts tests/services/managedSites/managedUpstreamResourceService.test.ts
```

Expected: FAIL because Axon has not been registered in the named capability.

- [ ] **Step 4: Export and reuse PR1 native primitives**

In `managedResources/axonHub.ts`, reuse the exact PR1 export
`openAxonHubNativeResourceOperations(options)`. Its returned
`AxonHubNativeResourceOperations.get(ref, options)` and
`.create(input, desiredStatus, options)` are the only native operations this
capability needs. Do not export editor descriptors, configuration, or native
detail through the public Workspace contract. Preserve the caller's signal.

- [ ] **Step 5: Implement the Axon capability**

`axonHubMigration.ts` must:

- source: load native detail by `ManagedResourceRef`, require a usable regular
  key during preview only to classify availability, discard its value, map
  native string type to current `ChannelType`, preserve supported and manual
  model semantics, and return existing blocker codes for unavailable
  credentials; `resolveCredential` reloads detail at execution and returns the
  usable key only to the orchestration call stack;
- target prepare: map canonical type to Axon type, build the safe projection and
  adjustment facts without a credential or command;
- target create: build direct `AxonHubCreateChannelInput`, call the shared native
  create primitive, and map confirmed success/failure to the controlled feature
  result;
- uncertain or partial creation: return `{ status: "uncertain" }`; canonical
  execution emits the controlled `mutation_state_uncertain` category, increments
  `uncertainCount`, refreshes, and never triggers replay.

The file must not import `ManagedSiteChannel`, `ChannelFormData`, legacy provider
builders, or the old resource capability.

- [ ] **Step 6: Register Axon and remove only its old feature gate**

Register:

```ts
{
  siteType: SITE_TYPES.AXON_HUB,
  capability: axonHubManagedSiteMigrationCapability,
}
```

Delete only this old gate entry:

```ts
{
  siteType: SITE_TYPES.AXON_HUB,
  feature: MANAGED_UPSTREAM_RESOURCE_FEATURES.ChannelMigration,
}
```

Do not remove Axon core gating or change another Site Type.

- [ ] **Step 7: Route Axon orchestration through canonical preparation**

For Axon source, call `source.prepare(selection, options)` with the string
selection identity and native ref. For Axon target, call `target.prepare`,
convert only its projection to the existing display `draft`, and store only the
safe selection/source/target preparation. During execution, resolve the source
credential just in time, construct the execution command locally, call
`target.create(command, options)` once, and discard it. A legacy non-Axon source
uses its existing key-resolution path at this same execution boundary; it does
not copy the credential into canonical preparation. Keep the two legacy
exported migration function signatures unchanged.
For the unchanged legacy result shape, map canonical `uncertain` to one failed
row with localized safe fallback text and include it in `failedCount`; do not
retry it. The canonical result keeps `status: "uncertain"` and
`uncertainCount` for the native UI.

- [ ] **Step 8: Run capability, migration, Adapter, and dialog tests**

```powershell
pnpm exec vitest run tests/services/managedSites/channelMigrationCapabilityRegistry.test.ts tests/services/managedSites/channelMigration.test.ts tests/services/apiAdapters/managedResources/axonHub.test.ts tests/services/managedSites/managedUpstreamResourceService.test.ts tests/features/ManagedSiteChannels/components/ManagedSiteChannelMigrationDialog.test.tsx
```

Expected: PASS. Existing analytics assertions remain aggregate-only, and the
dialog never renders canonical credentials or commands.

- [ ] **Step 9: Commit the Axon route**

```powershell
git add src/services/apiAdapters/managedResources/axonHubMigration.ts src/services/apiAdapters/managedResources/axonHub.ts src/services/managedSites/channelMigrationCapabilityRegistry.ts src/services/managedSites/channelMigration.ts src/services/managedSites/managedUpstreamResourceMigration.ts tests/services/apiAdapters/managedResources/axonHub.test.ts tests/services/managedSites/channelMigrationCapabilityRegistry.test.ts tests/services/managedSites/channelMigration.test.ts tests/services/managedSites/managedUpstreamResourceService.test.ts
pnpm run validate:staged
git commit -m "refactor(axonhub): route migration through native capabilities"
```

## PR2 final verification

- [ ] Run the affected migration surface:

```powershell
pnpm exec vitest related --run src/services/managedSites/channelMigration.ts src/services/apiAdapters/managedResources/axonHubMigration.ts src/types/managedSiteMigration.ts src/types/managedSiteMigrationCapability.ts
pnpm compile
```

Expected: PASS.

- [ ] Confirm every task commit ran `validate:staged` after its exact `git add`
  and before `git commit`. Do not run a no-staged-files command as a substitute.

- [ ] Run the remote handoff gate:

```powershell
pnpm run validate:push
```

Expected: compile and `knip` pass.

- [ ] Inspect the PR against its prerequisite branch:

```powershell
$baseSha = git log -1 --format=%H --grep="^refactor(axonhub): register native resource adapter$"
git diff --stat "$baseSha..HEAD"
git diff --name-status "$baseSha..HEAD"
git diff --check "$baseSha..HEAD"
```

Expected: `$baseSha` is non-empty; at most eight production files, the named tests, and no dialog,
locale, analytics, runtime-message, storage, or routing changes.

## Required preserved behavior

- Current dialog props, copy, warning order, counts, loading, refresh, retry,
  late-result cancellation, and close protection.
- Numeric UI row identity and selection order; native string identity remains in
  `ManagedResourceRef`.
- `PREVIEW_BUILD_CONCURRENCY = 5`.
- Existing New API, Veloera, DoneHub, Octopus, and Claude Code Hub paths.
- Per-row failure continuation, no rollback, successful-row retention, local
  empty-message fallback, and no replay of uncertain native creation.
- Existing analytics action IDs and aggregate-only payloads.

## Release-readiness decisions

- Telemetry: `reuse existing`; the production dialog and analytics contract do
  not change.
- E2E: `none`; migration orchestration and unchanged dialog behavior are covered
  more precisely with Vitest.
- Maintainability: the compatibility facade localizes all permitted legacy
  translation. Delete it only after the native UI no longer needs legacy preview
  shapes; do not spread dual-model translation into the Adapter or dialog.

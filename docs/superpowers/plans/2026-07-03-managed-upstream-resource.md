# Managed Upstream Resource Staged Migration Plan

> **For agentic workers:** implement this plan one task at a time. Do not convert
> every managed-site feature in a single pass. Keep at most one managed-site type
> in migration at once unless the user explicitly asks to broaden the slice.

## Goal

Introduce an internal `ManagedUpstreamResource` seam without breaking existing
managed-site channel behavior. Migrate site types vertically and keep the legacy
channel path available until every site and feature surface has completed its own
behavior slice.

## Source Spec

Implement
`docs/superpowers/specs/2026-07-03-managed-upstream-resource-design.md`.

## Guardrails

- Keep user-visible wording as "channel" / "渠道" during this plan.
- Do not remove `ManagedSiteChannel`, `ChannelFormData`, `CreateChannelPayload`,
  `UpdateChannelPayload`, `managedSites.channels`, or `channelDrafts` in early
  slices.
- Do not route a site type through resource edit mode until its adapter detail,
  draft, update, UI loading, legacy-fallback, and masked-secret tests are in
  place.
- Do not add matching, model-sync, model-mapping, migration, or config-storage
  resource contracts until the focused feature slice that needs them.
- Do not write masked or unavailable key text back to a backend.
- Keep each commit reviewable and revertible.

## Commit Boundaries

1. Internal core resource contracts.
2. Migration-aware facade and explicit migration gates.
3. `new-api` core vertical migration.
4. `Veloera` core vertical migration.
5. `done-hub` core vertical migration.
6. `octopus` core vertical migration.
7. `claude-code-hub` core vertical migration.
8. `axonhub` core vertical migration.
9. Purpose-specific feature migrations.
10. Final cleanup after all migrated sites and features are green.

Each boundary should be independently validated before moving to the next.

## Required Regression Matrix

| Slice | Required regressions | Minimum validation |
| --- | --- | --- |
| Core contracts | ref/key helpers, optional capability shape, no consumer migration | focused type tests, `pnpm compile`, `pnpm run validate:staged` |
| Facade/gates | default legacy path, explicit per-site opt-in, unsupported capability result | facade tests, `pnpm compile`, `pnpm run validate:staged` |
| Site core migration | adapter round-trip, edit detail loading, masked-secret preservation, legacy fallback for unmigrated sites, channel wording | adapter tests, `ChannelDialog`/table tests, `pnpm compile` when shared props/contracts move, `pnpm run validate:staged` |
| Feature migration | migrated resource behavior and unmigrated legacy fallback for that feature | exact feature service/component tests, `pnpm compile` for shared contract/runtime-message changes, `pnpm run validate:staged` |

## Task 1: Add Internal Core Resource Contracts

**Files:**

- Create `src/types/managedUpstreamResource.ts`
- Create `src/services/apiAdapters/contracts/managedUpstreamResources.ts`
- Modify `src/services/apiAdapters/contracts/siteTypeCapabilities.ts`
- Add tests under `tests/types/managedUpstreamResource.test.ts`
- Add focused registry/capability tests if needed

**Implementation:**

- Add `ManagedUpstreamResourceRef`, `ManagedUpstreamResourceSummary`,
  `ManagedUpstreamResourceDetail`, field descriptors, validation result, secret
  result, and core mutation response types.
- Add optional core `managedSites.resources` capability group with only
  list/search/detail/create/update/delete, draft, validation, field descriptor,
  and secret reveal capabilities.
- Keep existing channel capabilities unchanged.
- Add ref/key helpers that derive stable non-secret composite keys.
- Do not add matching, model sync, model mapping, migration, or channel config
  storage resource capability types in this task.

**Validation:**

```powershell
pnpm vitest run tests/types/managedUpstreamResource.test.ts
pnpm compile
pnpm run validate:staged
```

**Done When:**

- internal types compile;
- existing managed-site behavior is unchanged;
- no product caller has been forced onto the resource path;
- future feature capabilities remain out of the initial contract.

## Task 2: Add Migration-Aware Facade And Gates

**Files:**

- Create `src/services/managedSites/managedUpstreamResourceService.ts`
- Create or extend a small migration-state helper for explicit site/feature gates
- Modify `src/services/managedSites/managedSiteService.ts` only where needed
- Add `tests/services/managedSites/managedUpstreamResourceService.test.ts`

**Implementation:**

- Provide helpers that can resolve resource capabilities for a site type.
- Add explicit opt-in gates for core resource slices and future feature resource
  slices. Default every site and feature to legacy channel behavior.
- Return explicit unsupported results for missing optional capabilities.
- Do not replace existing `getManagedSiteService()` behavior.
- Keep legacy callers on `managedSiteService` unless they explicitly opt into a
  migrated site and migrated feature path.

**Validation:**

```powershell
pnpm vitest run tests/services/managedSites/managedUpstreamResourceService.test.ts
pnpm compile
pnpm run validate:staged
```

**Done When:**

- migrated and unmigrated site paths can coexist;
- a test proves capability presence alone does not opt a site into resource mode;
- unsupported capability results are typed and tested;
- no user-facing copy mentions "managed upstream resource".

## Task 3: Migrate `new-api` As The Baseline Core Slice

**Files:**

- Modify `src/services/apiAdapters/managedSites/newApi.ts`
- Add shared helpers only if they are directly needed by `new-api`
- Modify the migration gate to enable `new-api` core resource behavior only
- Modify `src/features/ManagedSiteChannels/ManagedSiteChannels.tsx`
- Modify `src/components/dialogs/ChannelDialog/**`
- Add/update:
  - `tests/services/apiAdapters/managedSites/newApi.test.ts`
  - `tests/components/dialogs/ChannelDialog/useChannelForm.test.tsx`
  - `tests/components/dialogs/ChannelDialog/ChannelDialog.behavior.test.tsx`
  - `tests/entrypoints/options/pages/ManagedSiteChannels/ManagedSiteChannels.test.tsx`

**Implementation:**

- Add core `managedSites.resources` for `new-api`.
- Map channel rows to resource summaries.
- Fetch detail before edit.
- Prepare edit drafts from native channel detail.
- Disable submit until detail and descriptors are ready.
- Update through `update(config, detail, draft)`.
- Preserve hidden native fields such as advanced settings and mappings.
- Do not write masked keys back.
- Keep table labels, row actions, toast copy, and dialog titles as channel copy.
- Keep legacy channel edit path available for unmigrated sites and old callers.

**Required Regression Tests:**

- `new-api` adapter maps list/detail/update without writing masked keys back.
- `ChannelDialog` disables submit until resource detail/descriptors are ready.
- `ManagedSiteChannels` opens `new-api` edit through the resource path.
- An unmigrated managed site still uses `ChannelDialog` plus `updateChannel` and
  does not call `getResourceDetail`.

**Validation:**

```powershell
pnpm vitest run tests/services/apiAdapters/managedSites/newApi.test.ts
pnpm vitest run tests/components/dialogs/ChannelDialog/useChannelForm.test.tsx
pnpm vitest run tests/components/dialogs/ChannelDialog/ChannelDialog.behavior.test.tsx
pnpm vitest run tests/entrypoints/options/pages/ManagedSiteChannels/ManagedSiteChannels.test.tsx
pnpm compile
pnpm run validate:staged
```

**Done When:**

- `new-api` list, create, edit, update, delete, and hidden-key behavior are
  covered;
- legacy channel path still works for any unmigrated site;
- no locale key introduces resource wording.

## Task 4: Migrate `Veloera` Core Slice

**Files:**

- Modify `src/services/apiAdapters/managedSites/veloera.ts`
- Extend New API-family resource helper only after `new-api` behavior is already
  tested
- Add/update `tests/services/apiAdapters/managedSites/veloera.test.ts`

**Implementation:**

- Enable the core resource migration gate for `Veloera` only after adapter tests
  pass.
- Reuse the New API-family helper only for contracts that are truly shared.
- Keep Veloera-specific update and secret behavior in adapter overrides.
- Prove masked secrets are not written back.
- Prove update payloads preserve fields not exposed by the dialog.

**Validation:**

```powershell
pnpm vitest run tests/services/apiAdapters/managedSites/veloera.test.ts
pnpm compile
pnpm run validate:staged
```

**Done When:**

- Veloera passes the same edit round-trip contract as `new-api`;
- helper reuse has not hidden Veloera-specific update behavior;
- no other site gate changed.

## Task 5: Migrate `done-hub` Core Slice

**Files:**

- Modify `src/services/apiAdapters/managedSites/doneHub.ts`
- Extend New API-family resource helper only where shared behavior is proven
- Add/update `tests/services/apiAdapters/managedSites/doneHub.test.ts`

**Implementation:**

- Enable the core resource migration gate for `done-hub` only after adapter tests
  pass.
- Preserve DoneHub full-object update behavior.
- Prove masked secrets are not written back.
- Prove update payloads preserve fields not exposed by the dialog.

**Validation:**

```powershell
pnpm vitest run tests/services/apiAdapters/managedSites/doneHub.test.ts
pnpm compile
pnpm run validate:staged
```

**Done When:**

- DoneHub passes the same edit round-trip contract as `new-api`;
- full-object update behavior is covered;
- no other site gate changed.

## Task 6: Migrate `octopus` Core Slice

**Files:**

- Modify `src/services/apiAdapters/managedSites/octopus.ts`
- Modify Octopus model sync only if the resource ref shape is needed
- Add/update:
  - `tests/services/apiAdapters/managedSites/octopus.test.ts`
  - `tests/services/modelSync/octopusModelSync.test.ts` if touched

**Implementation:**

- Map Octopus native channel/outbound fields to summaries without pretending
  they are New API channels.
- Preserve native fields such as `base_urls`, `keys`, `custom_model`, proxy,
  headers, match rules, `auto_sync`, and `auto_group`.
- Preserve existing Octopus model sync behavior.
- Keep Octopus edit fields channel-worded in UI.

**Validation:**

```powershell
pnpm vitest run tests/services/apiAdapters/managedSites/octopus.test.ts
pnpm vitest run tests/services/modelSync/octopusModelSync.test.ts
pnpm compile
pnpm run validate:staged
```

**Done When:**

- Octopus edit update preserves native fields;
- key updates only happen with a real user-provided key;
- model sync behavior is unchanged or intentionally covered;
- no other site gate changed.

## Task 7: Migrate `claude-code-hub` Core Slice

**Files:**

- Modify `src/services/apiAdapters/managedSites/claudeCodeHub.ts`
- Add/update:
  - `tests/services/apiAdapters/managedSites/claudeCodeHub.test.ts`
  - `tests/components/dialogs/ChannelDialog/useChannelForm.test.tsx`
  - `tests/entrypoints/options/pages/ManagedSiteChannels/ManagedSiteChannels.test.tsx`

**Implementation:**

- Treat native providers as internal resources.
- Preserve provider type, URL, allowed model rules, enabled state, weight,
  priority, group tag, and masked-key state.
- Use reveal support through `secrets.revealSecret`.
- Do not require a real provider key for ordinary edits unless the user is
  replacing the key or the backend contract requires it.
- Keep provider edit and reveal UI copy on the existing channel surface wording.

**Validation:**

```powershell
pnpm vitest run tests/services/apiAdapters/managedSites/claudeCodeHub.test.ts
pnpm vitest run tests/components/dialogs/ChannelDialog/useChannelForm.test.tsx
pnpm vitest run tests/entrypoints/options/pages/ManagedSiteChannels/ManagedSiteChannels.test.tsx
pnpm compile
pnpm run validate:staged
```

**Done When:**

- provider edit does not overwrite masked keys;
- reveal flow still works from the edit dialog;
- table/dialog copy still says channel where the existing product surface says
  channel;
- no other site gate changed.

## Task 8: Migrate `axonhub` Core Slice

**Files:**

- Modify `src/services/apiAdapters/managedSites/axonHub.ts`
- Add/update:
  - `tests/services/apiAdapters/managedSites/axonHub.test.ts`
  - `tests/features/ManagedSiteChannels/components/RowActions.test.tsx`
  - `tests/entrypoints/options/pages/ManagedSiteChannels/ManagedSiteChannels.test.tsx`

**Implementation:**

- Preserve string native ids.
- Preserve GraphQL native fields such as credentials, supported/manual models,
  default test model, settings, ordering weight, and remarks.
- Avoid converting AxonHub into a New API channel shape in product code.
- Keep unsupported model sync explicit unless support is separately verified.

**Validation:**

```powershell
pnpm vitest run tests/services/apiAdapters/managedSites/axonHub.test.ts
pnpm vitest run tests/features/ManagedSiteChannels/components/RowActions.test.tsx
pnpm vitest run tests/entrypoints/options/pages/ManagedSiteChannels/ManagedSiteChannels.test.tsx
pnpm compile
pnpm run validate:staged
```

**Done When:**

- AxonHub edit round-trip preserves native detail;
- credential object behavior is covered;
- string resource refs work in table actions;
- no other site gate changed.

## Task 9: Purpose-Specific Feature Migrations

Only after the relevant source and target site types have completed their core
resource slices, update feature surfaces in focused slices. Each feature slice
must keep a legacy fallback for unmigrated sites.

| Feature slice | Production files to inspect first | Tests to add/update |
| --- | --- | --- |
| Duplicate matching | `src/services/managedSites/utils/channelMatching.ts`, `src/services/managedSites/channelMatchResolver.ts`, `src/services/managedSites/channelMatch.ts` | `tests/services/managedSites/channelMatching.test.ts`, `tests/services/managedSites/channelMatchResolver.test.ts`, `tests/components/UseChannelDialog.duplicateChannelWarning.test.tsx` |
| Channel migration preview/execution | `src/services/managedSites/channelMigration.ts`, `src/features/ManagedSiteChannels/components/ManagedSiteChannelMigrationDialog.tsx`, `src/types/managedSiteMigration.ts` | `tests/services/managedSites/channelMigration.test.ts`, `tests/features/ManagedSiteChannels/components/ManagedSiteChannelMigrationDialog.test.tsx` |
| Token batch export target matching | `src/services/managedSites/tokenBatchExport.ts`, `src/features/KeyManagement/components/ManagedSiteTokenBatchExportDialog.tsx`, `src/types/managedSiteTokenBatchExport.ts` | `tests/services/managedSites/tokenBatchExport.test.ts`, `tests/features/KeyManagement/components/ManagedSiteTokenBatchExportDialog.test.tsx` |
| Token channel status and account shortcuts | `src/services/managedSites/tokenChannelStatus.ts`, `src/features/AccountManagement/components/AccountActionButtons/**`, `src/components/ManagedSiteChannelLinkButton.tsx` | `tests/services/managedSites/tokenChannelStatus.test.ts`, `tests/features/AccountManagement/components/AccountActionButtons.test.tsx`, `tests/features/AccountManagement/components/AccountActionButtons.locateManagedSiteChannelToast.test.ts` |
| Model sync | `src/services/models/modelSync/modelSyncService.ts`, `src/services/models/modelSync/scheduler.ts`, `src/services/models/modelSync/messaging.ts`, `src/services/models/modelSync/channelModelFilterEvaluator.ts`, `src/features/ManagedSiteModelSync/ManagedSiteModelSync.tsx`, `src/types/managedSiteModelSync.ts` | `tests/services/modelSync/modelSyncService.test.ts`, `tests/services/modelSync/scheduler.test.ts`, `tests/services/modelSync/scheduler.more.test.ts`, `tests/services/modelSync/scheduler.lifecycle.test.ts`, `tests/services/modelSync/scheduler.modelRedirectPrune.test.ts`, `tests/features/ManagedSiteModelSync/ManagedSiteModelSync.test.tsx`, `tests/features/ManagedSiteModelSync/components.test.tsx` |
| Model redirect mapping | `src/services/models/modelRedirect/ModelRedirectService.ts`, `src/features/BasicSettings/components/dialogs/ClearModelRedirectMappingsDialog.tsx` | `tests/services/modelRedirect/ModelRedirectService.test.ts`, `tests/services/modelRedirect/ModelRedirectService.apply.test.ts`, `tests/services/modelRedirect/ModelRedirectService.bulkClear.test.ts`, `tests/entrypoints/options/ModelRedirectBulkClear.test.tsx` |
| Channel filters and per-resource config | `src/features/ManagedSiteChannels/components/ChannelFilterDialog.tsx`, `src/features/ManagedSiteChannels/utils/channelFilters.ts`, `src/services/managedSites/channelConfigStorage.ts` | `tests/features/ManagedSiteChannels/components/ChannelFilterDialog.test.tsx`, `tests/features/ManagedSiteChannels/utils/channelFilters.test.ts`, `tests/services/channelConfigStorage.test.ts` |

**Implementation:**

- Add feature-specific resource capability types only inside the feature slice
  that uses them.
- Keep the legacy channel implementation as fallback for any unmigrated site or
  unmigrated feature.
- Preserve runtime-message compatibility or add explicit backward-compatible
  migration when message/storage shapes change.

**Validation:**

Run the exact feature tests from the table, then:

```powershell
pnpm compile
pnpm run validate:staged
```

Run `pnpm run validate:push` before publishing any branch that changes shared
runtime contracts, storage migrations, or runtime messages.

## Task 10: Final Compatibility Removal

Do this only after all managed site types and purpose-specific features have
migrated.

**Files:**

- `src/types/managedSite.ts`
- `src/services/apiAdapters/contracts/managedSiteCapabilities.ts`
- `src/services/managedSites/managedSiteService.ts`
- tests that still exercise legacy-only channel capability paths

**Implementation:**

- Remove obsolete channel compatibility exports.
- Keep persisted data migrations backward compatible.
- Keep visible channel copy unless a separate product rename spec is approved.

**Validation:**

```powershell
pnpm compile
pnpm knip
pnpm run validate:staged
pnpm run validate:push
```

## E2E Decision

Do not add E2E coverage mechanically for each site migration. Prefer focused
adapter and component tests for payload, draft, and secret behavior.

Update Playwright only when a change depends on real extension browser behavior,
cross-entrypoint navigation, runtime messages, or persisted storage migration.

## Telemetry Decision

Reuse existing managed-site channel telemetry during the staged migration. Do
not rename feature ids, action ids, or surface ids while user-visible copy still
uses channel terminology.

If a future slice adds a new user-visible recovery action or unsupported-state
button, make a separate telemetry decision in that slice.

## Final Handoff Gate

Before each implementation handoff:

1. inspect `git diff origin/main...HEAD` for unrelated code or copy churn;
2. confirm only the intended site type or feature slice changed;
3. confirm no other site migration gate changed accidentally;
4. run the focused tests listed in that task;
5. run `pnpm run validate:staged`;
6. report unmigrated fallback behavior and any uncovered native edge case.

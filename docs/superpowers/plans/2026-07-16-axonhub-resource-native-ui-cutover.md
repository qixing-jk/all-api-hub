# AxonHub Resource-Native UI Cutover Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move AxonHub to native resource data and mutations while preserving one shared Managed Site Channels page, table, editor shell, and migration dialog for every managed site.

**Architecture:** The existing `ManagedSiteChannels` presentation is extracted into capability- and state-driven views. Legacy and native controllers adapt their own data to the same UI-only contracts; no shared view calls a service, and native code never constructs `ManagedSiteChannel` or `ChannelFormData`. A feature-owned field presentation policy controls labels, sections, order, and renderer selection from a finite frontend-owned vocabulary; the Adapter contract exposes facts and validation only.

**Tech Stack:** TypeScript, React, WXT, TanStack Table, existing Modal/Radix/shadcn primitives, i18next, Vitest, Testing Library, Playwright, and existing product analytics.

**Revision 2026-07-28:** Consolidate the AxonHub field contract and completed
release-blocker follow-up into this plan/spec pair; remove one-off documentation
paths and the separate delta plan.

---

## Immutable context and delivery shape

The immutable prerequisite tip is `e2c9da1a1` (already reachable from
`origin/main`). The unpublished prototype commits are preserved only at
`backup/axonhub-resource-native-ui-cutover-before-parity-redesign-20260719`.
Do not cherry-pick the prototype page/table/editor/migration implementation.
Selectively port controller or lifecycle behavior only after it fits the
contracts below.

This is one PR whose original cutover used three ordered commits:

1. legacy-only presentation extraction and parity proof;
2. native controllers, field policy, and canonical migration mapping while
   AxonHub remains on `legacy-channel`;
3. the AxonHub definition switch and final browser proof.

The post-cutover compatibility correction remains Task D. The approved native
form experience correction is Task E and follows Task D without rebuilding or
reordering the original three commits.

Each commit must pass its own focused tests and `pnpm run validate:staged`
before the next commit begins. No remote branch or PR is created by this plan.
At execution time, the plan/spec documentation commit was completed before
implementation started; Commit A required an empty index. If unrelated staged
work exists during any replay, stop rather than unstaging or mixing it with
implementation commits.

## Scope controls and stop conditions

- Modify the existing `ManagedSiteChannels` and `ChannelDialog` internals when
  needed to extract presentation components; preserve their external visual
  and interaction contract.
- Do not create `ManagedSiteResourcePage`, `ManagedResourceTable`,
  `ManagedResourceEditorDialog`, or `ManagedResourceMigrationDialog`.
- Do not add a second table, toolbar, row-action menu, editor shell, or
  migration markup tree.
- Shared views receive UI-only props and callbacks; they never call a
  Workspace, managed-site service, or adapter.
- Native code must not import `ManagedSiteChannel`, `ChannelFormData`, or
  `channelMigrationLegacyFacade`.
- Adapter descriptors contain field facts, types, constraints, options, and
  secret state only. Section/order/label/renderer metadata belongs to the
  feature-owned presentation policy.
- Shared views must not add `isAxonHub` or any other site-type conditional.
- AxonHub's first list controller drains all cursor pages with cancellation and
  repeated-cursor protection, then preserves the old client-side pagination,
  filtering, and selection semantics.
- Stop and amend this plan if an implementation requires raw JSON, arbitrary
  backend-driven layout, a custom renderer without a reviewed product
  contract, remote pagination with changed visible semantics, or native-to-
  legacy DTO conversion.

## File map

### Commit A: shared presentation extraction

Create:

- `src/features/ManagedSiteChannels/presentation/contracts.ts`
- `src/features/ManagedSiteChannels/presentation/ManagedSiteChannelsView.tsx`
- `src/features/ManagedSiteChannels/presentation/ManagedSiteChannelsTable.tsx`
- `src/features/ManagedSiteChannels/presentation/ManagedSiteMigrationDialogView.tsx`
- `src/features/ManagedSiteChannels/presentation/ManagedSiteChannelDetailView.tsx`
- `src/components/dialogs/ChannelDialog/components/ChannelEditorShell.tsx`
- `src/components/dialogs/ChannelDialog/components/ChannelCommonFieldsBody.tsx`
- `tests/features/ManagedSiteChannels/presentation/ManagedSiteChannelsView.test.tsx`
- `tests/features/ManagedSiteChannels/presentation/ManagedSiteMigrationDialogView.test.tsx`
- `tests/components/dialogs/ChannelDialog/ChannelEditorShell.test.tsx`
- `e2e/fixtures/managedSiteChannelsIntercepted.ts`
- `e2e/managedSiteChannelsParity.spec.ts`

Modify:

- `src/features/ManagedSiteChannels/ManagedSiteChannels.tsx`
- `src/features/ManagedSiteChannels/components/ManagedSiteChannelMigrationDialog.tsx`
- `src/features/ManagedSiteChannels/components/RowActions.tsx`
- `src/features/ManagedSiteChannels/components/ChannelFilterDialog.tsx`
- `src/components/dialogs/ChannelDialog/components/ChannelDialog.tsx`
- `src/features/ManagedSiteChannels/testIds.ts` only when an existing stable
  selector must be moved without changing its value
- `tests/entrypoints/options/pages/ManagedSiteChannels/ManagedSiteChannels.test.tsx`
- `tests/features/ManagedSiteChannels/components/ManagedSiteChannelMigrationDialog.test.tsx`
- `tests/components/dialogs/ChannelDialog/ChannelDialog.behavior.test.tsx`

### Commit B: native controller and field policy

Create:

- `src/features/ManagedSiteChannels/presentation/managedResourceFieldPolicy.ts`
- `src/features/ManagedSiteChannels/presentation/managedResourcePresentation.ts`
- `src/features/ManagedSiteChannels/presentation/ManagedResourceEditorBody.tsx`
- `src/features/ManagedSiteChannels/presentation/managedResourceMigrationPresentation.ts`
- `src/features/ManagedSiteChannels/controllers/useManagedResourceMigrationController.ts`
- `src/features/ManagedSiteChannels/controllers/useManagedResourceListController.ts`
- `src/features/ManagedSiteChannels/controllers/useManagedResourceMutationController.ts`
- `src/features/ManagedSiteChannels/controllers/managedResourceConcurrency.ts`
- `src/features/ManagedSiteChannels/controllers/ManagedSiteChannelsRoute.tsx`
- `tests/features/ManagedSiteChannels/presentation/managedResourcePresentation.test.ts`
- `tests/features/ManagedSiteChannels/presentation/managedResourceFieldPolicy.test.ts`
- `tests/features/ManagedSiteChannels/presentation/managedResourceMigrationPresentation.test.ts`
- `tests/features/ManagedSiteChannels/controllers/useManagedResourceControllers.test.tsx`
- `tests/features/ManagedSiteChannels/controllers/useManagedResourceMigrationController.test.tsx`
- `tests/test-utils/managedResourceWorkspace.ts`
- `tests/services/apiAdapters/managedResources/axonHubMigration.test.ts`

Modify:

- `src/entrypoints/options/pages/ManagedSiteChannels/index.tsx`
- `src/features/ManagedSiteChannels/index.ts`
- `docs/superpowers/specs/2026-07-16-managed-site-resource-native-extension-design.md`
- `src/components/ManagedSiteConfigRequiredState.tsx` only if the shared
  configuration CTA needs the definition-owned settings anchor
- `tests/components/ManagedSiteConfigRequiredState.test.tsx`
- `src/services/apiAdapters/contracts/managedResourceNative.ts` only if a
  missing fact-level contract is proven by a failing adapter contract test;
  this includes moving textarea layout metadata into feature policy and
  separating secret `canReplace` from masked read state
- `src/services/apiAdapters/managedResources/factory.ts` to expose and enforce
  CRUD/search operation capabilities
- `tests/services/apiAdapters/managedResources/factory.test.ts` for capability
  normalization, wrong-ref rejection, and crafted unsupported calls
- `src/services/apiAdapters/managedResources/axonHub.ts` only for verified
  native field facts or preservation behavior
- `src/services/apiAdapters/managedResources/axonHubChannelType.ts` to replace
  the current unknown-type OpenAI fallback with `mapped | unsupported`
- `src/services/apiAdapters/managedResources/axonHubMigration.ts` to propagate
  unsupported source/target types before command construction
- `tests/services/apiAdapters/managedResources/axonHubChannelType.test.ts`
- `src/services/managedSites/channelMigrationLegacyFacade.ts`
- `tests/services/managedSites/channelMigration.test.ts` for the strict
  mapper/legacy adapter boundary
- `src/locales/{zh-CN,zh-TW,en,ja,es-419,vi}/managedSiteChannels.json` only
  for controlled native-only copy; do not create a parallel locale namespace

### Commit C: static AxonHub switch and browser proof

Modify:

- `src/services/accountSiteDefinitions/definitions.ts`
- `tests/services/accountSiteDefinitions/registry.test.ts`
- `e2e/scenarios/managedSiteChannels.ts`
- `e2e/fixtures/managedSiteChannelsIntercepted.ts`
- `e2e/managedSiteChannelsParity.spec.ts`

## Commit A: Extract the shared presentation

### Step 1: Establish legacy characterization coverage

Before moving markup, run the existing behavior suites and add only missing
behavior assertions for the current legacy path:

~~~powershell
pnpm exec vitest run `
  tests/entrypoints/options/pages/ManagedSiteChannels/ManagedSiteChannels.test.tsx `
  tests/features/ManagedSiteChannels/components/ManagedSiteChannelMigrationDialog.test.tsx `
  tests/components/dialogs/ChannelDialog/ChannelDialog.behavior.test.tsx
~~~

The added assertions must cover toolbar button order, common table columns,
selection and row-action semantics, create/edit submit behavior, migration
preview comparison rows, warning tooltip, blocked details, confirmation, and
partial-result summary. Use roles, accessible names, and existing test ids;
do not freeze Tailwind classes or entire rendered trees.

Still before editing any production markup, create
`e2e/fixtures/managedSiteChannelsIntercepted.ts` and
`e2e/managedSiteChannelsParity.spec.ts` around the current legacy UI. Use fixed
language, fixture data, desktop/mobile viewports, intercepted responses, and
reduced motion. Assert the shared toolbar, table, editor, migration controls,
user actions, and responsive behavior using roles, accessible names, and stable
test ids. Keep the retained browser proof focused on behavior rather than pixel
snapshots; Playwright failure artifacts remain available for diagnosis.

### Step 2: Define the UI-only contracts

Create `presentation/contracts.ts` with contracts equivalent to:

~~~ts
export type ManagedChannelsCell =
  | { kind: "text"; value: string }
  | { kind: "number"; value: number }
  | { kind: "boolean"; value: boolean }
  | { kind: "list"; value: readonly string[] }
  | { kind: "status"; value: string }
  | {
      kind: "secret"
      state: "available" | "masked" | "unavailable" | "permission-hidden"
    }

export type ManagedChannelsRowViewModel = {
  rowKey: string
  displayIdentifier?: string
  displaySortKey: string | number
  displayName: string
  status: string
  cells: Readonly<Record<string, ManagedChannelsCell>>
  actions: {
    canView: boolean
    canEdit: boolean
    canDelete: boolean
    canSyncModels: boolean
    showFilterAction: boolean
    showMigrationAction: boolean
    canExecuteMigration: boolean
    migrationDisabledReasonKey?: string
  }
}

export type ManagedChannelsPresentationState = {
  rows: readonly ManagedChannelsRowViewModel[]
  selectedRowKeys: readonly string[]
  visibleColumnIds: readonly string[]
  sorting: readonly { columnId: string; direction: "asc" | "desc" }[]
  search: string
  routeChannelId?: string
  statusFilter: readonly string[]
  pageIndex: number
  pageSize: number
  totalRows: number
  isLoading: boolean
  isRefreshing: boolean
  deleteState?: {
    selectedRowKeys: readonly string[]
    isConfirmOpen: boolean
    isExecuting: boolean
    results: readonly {
      rowKey: string
      status: "success" | "failed" | "uncertain"
      resultKey: string
    }[]
    requiresRefresh: boolean
  }
  failure?: {
    kind:
      | "configuration"
      | "authentication"
      | "permission"
      | "unavailable"
      | "unexpected"
  }
}
~~~

Actions and pagination callbacks must use `rowKey`, not display text,
position, or numeric conversion. `rowKey` is a controller-generated opaque UI
identity; it is never a serialized `ManagedResourceRef`. The contract carries
safe display id and sort values separately and must not import any legacy
domain type or Workspace type.

Legacy dynamic test-id values remain unchanged. Native repeated rows use the
same exported test-id family scoped by a controller-local, non-ref row token;
the token is stable while the resource remains in the accepted result set and
is safe to expose in DOM, but cannot be decoded to `scopeKey` or `resourceId`.
Duplicate names and rename/refresh behavior are covered without adding a second
native selector family.

The page contract also includes explicit toolbar capabilities and callbacks,
controlled TanStack selection, column visibility/sorting/status facets,
`RowActions`, `ChannelFilterDialog`, model-sync/filter capabilities, route
search and legacy `channelId`, View/detail state, refresh, bulk-delete
confirmation/results, and existing analytics callbacks. Extract a shared
read-only detail body so View does not become a disabled editor or a native-only
dialog. Legacy numeric `channelId` retains the existing list-filter/focus
behavior; it does not auto-open View. Native rows do
not put `resourceId` or `rowKey` in the URL; native View opens from row action
state only until a separately reviewed safe-link identifier exists. Existing
native `channelId` query values are ignored and cleared, never treated as a
resource locator.

Route props include the current query object and an `onReplaceRouteQuery`
callback. When native mode sees a legacy `channelId` or unsupported search, it
uses that callback to clear only the unsupported key while preserving unrelated
query parameters; tests assert URL replacement rather than navigation or
silent local-only clearing.

Add a controller-neutral column registry to the presentation contract. Each
column declares its stable id, default visibility, safe accessor, sort
direction/accessor, missing-value ordering, status-facet mapping, and whether
it is legacy-common or an approved native extension. The default legacy sort
remains safe display id descending; native rows use their explicit display sort
key and normalize `archived` and `auto-disabled` as distinct status facets.
Tests cover visibility toggles, sort direction/missing values, page and
cross-page selection, duplicate names, rename/refresh row-key stability, and
selection reset only after an accepted refresh.

Define migration presentation props in the same file. They cover open/close,
target options and selection, preview loading/error/manual refresh, preview
rows, warning and blocked states, confirmation, execution loading, partial
results, refresh-required recovery, and close guards. A preview row contains
selection id, display name, seven controlled comparison values, warning codes,
blocked reason/safe message, and `ready | blocked`. `selectionId` is UI-internal
and never rendered; an optional safe `displayIdentifier` preserves the current
legacy `#numeric` label without exposing native refs. A result row contains
`created | failed | skipped | uncertain` and a controlled error/status key.

Add a typed registration/workspace capability contract before wiring the view:
`canSearch`, `canCreate`, `canUpdate`, and `canDelete`. The controller
normalizes these once; unsupported Workspace actions are hidden and the
Workspace rejects crafted calls with a controlled failure. Model sync, model
filtering, and migration visibility come from their named capability registries
plus feature policy, and guards remain at those named entry points. The shared
presentation receives the combined normalized state but does not infer feature
availability from Workspace booleans.

Bulk delete is controller-owned despite the Workspace's single-row API. The
controller snapshots selected row keys, asks the shared confirmation view, runs
deletes through a feature-local `mapSettledWithConcurrency` helper created in
`src/features/ManagedSiteChannels/controllers/managedResourceConcurrency.ts`
with a limit of four,
records each row as `success`, `failed`, or `uncertain`, preserves settled outcomes in selection order, refreshes once
after all settled calls, and disables replay for uncertain rows until a fresh
read. The presentation contract includes confirmation, progress, result, and
refresh-required states; no bulk-delete protocol is added to the Workspace.
Confirmed pre-dispatch/rejected failures are `failed`; abort or transport loss
after dispatch maps to `uncertain`. Tests assert the concurrency ceiling,
ordering, mapping, one refresh, and no replay.

`RowActions` is a UI-only component. Its props are `rowKey`, safe display data,
capability flags, and callbacks keyed by `rowKey`; it never receives `ChannelRow`
or a numeric id. Legacy binds its existing row to this contract in a thin
adapter; native binds its controller row directly. Analytics currently emitted
inside legacy `RowActions` and `ChannelFilterDialog` move behind typed callbacks:
legacy adapters keep the existing event taxonomy, native controllers own their
events, and shared views remain analytics-import-free. The presentation keeps
support/visibility separate from current executability: legacy migration stays
visible-but-disabled when no target exists through `showMigrationAction` plus
`canExecuteMigration` and a controlled disabled-reason key.

`ChannelFilterDialog` remains an explicitly legacy-only wrapper in this slice.
Every native registration sets `canFilterModels: false`, native paths never
instantiate or import it, and unsupported filter actions are absent. A future
native filter action requires a named capability and a presentation-only dialog
contract before any registration may set the flag true; it may not reuse the
legacy `ChannelRow`/persistence-bound dialog directly.

`ManagedSiteChannelsView` receives an optional legacy-owned filter-dialog render
slot; it does not import `ChannelFilterDialog`. The legacy controller injects
that slot and sets `showFilterAction`; native controllers omit the slot and set
the flag false. A static import-boundary test plus legacy-visible/native-absent
fixture tests enforce this ownership.

### Step 3: Extract the page and table without changing legacy behavior

Move the existing page markup from
`src/features/ManagedSiteChannels/ManagedSiteChannels.tsx` into
`ManagedSiteChannelsView.tsx` and `ManagedSiteChannelsTable.tsx`. Keep the
current TanStack configuration, column ids, button order, row menu, pagination
summary, empty/error states, analytics surfaces, and test ids. The legacy
component remains the controller and maps its existing `ChannelRow` state into
the new UI-only contract.

The shared view must render from props and callbacks only. It must not call
`useChannelDialog`, `ModelRedirectService`, a managed-site service, or a
Workspace. If an action needs orchestration, expose a callback in the
presentation contract and keep the existing legacy controller responsible.

### Step 4: Extract the editor shell

Create `ChannelEditorShell.tsx` by moving only the existing Modal shell,
header/footer, spacing, focus restoration, close guards, loading state, and
destructive confirmation boundary from `ChannelDialog.tsx`. Extract the common
name/type/base URL/status/models/secret controls into
`ChannelCommonFieldsBody.tsx` with the existing labels, test ids, focus order,
and validation bindings. Keep `useChannelForm` and legacy orchestration
unchanged in this commit.

The shell accepts `open`, title/description, `children`, footer actions,
submitting/close-lock state, and `onClose`. It must not accept a generic field
schema or call a Workspace. Existing ChannelDialog behavior tests must continue
to pass unchanged.

`ChannelCommonFieldsBody` accepts UI-only field values, controlled option
lists, validation issues, capability booleans, and `onFieldChange`; it imports
neither `ChannelFormData` nor `EditableResourceProjection`. The legacy wrapper
maps `ChannelFormData` to these props in Commit A. The native wrapper maps
`EditableResourceProjection` in Commit B. Native code therefore reuses the
same rendered controls without importing or constructing legacy DTOs.

### Step 5: Extract the migration presentation

Create `ManagedSiteMigrationDialogView.tsx` from the existing migration
markup. It must preserve the target selector, Modal, confirmation dialog,
CollapsibleSection rows, seven-field comparison grid, warning tooltip, blocked
details, no-rollback copy, result badges, and refresh-required recovery.

Keep the existing orchestration in
`ManagedSiteChannelMigrationDialog.tsx`, but map its legacy preview/result
objects to the presentation contract. Do not make the view accept
`ChannelRow[]` or call migration services.

### Step 6: Verify the extraction before native code

Run:

~~~powershell
pnpm exec vitest run `
  tests/features/ManagedSiteChannels/presentation `
  tests/entrypoints/options/pages/ManagedSiteChannels/ManagedSiteChannels.test.tsx `
  tests/features/ManagedSiteChannels/components/ManagedSiteChannelMigrationDialog.test.tsx `
  tests/components/dialogs/ChannelDialog/ChannelDialog.behavior.test.tsx `
  tests/components/dialogs/ChannelDialog/ChannelEditorShell.test.tsx `
  tests/features/ManagedSiteChannels/components/RowActions.test.tsx `
  tests/features/ManagedSiteChannels/components/ChannelFilterDialog.test.tsx
~~~

Run `pnpm run validate:staged` only after the Step 7 `git add` command so the
staged gate validates the extraction files rather than the old index.

Run the deterministic intercepted fixture at desktop and mobile viewports with
the same language, fixture data, intercepted responses, and reduced-motion
setting. Verify the common UI contract through DOM, accessibility, interaction,
and responsive-behavior assertions. Do not switch AxonHub.

Run:

~~~powershell
pnpm exec playwright test e2e/managedSiteChannelsParity.spec.ts --project=chromium
~~~

Expected: the deterministic fixture passes without a live deployment and uses
the same existing test-id constants and route/analytics setup as the legacy
scenario. Failures retain Playwright screenshots and traces as diagnostic
artifacts; committed pixel baselines are not part of the release contract.

### Step 7: Commit the extraction

~~~powershell
git diff --cached --quiet
if ($LASTEXITCODE -eq 1) { throw "pre-existing staged changes; stop" }
if ($LASTEXITCODE -ne 0) { throw "cannot inspect staged state" }
git add src/features/ManagedSiteChannels/presentation `
  src/features/ManagedSiteChannels/ManagedSiteChannels.tsx `
  src/features/ManagedSiteChannels/components/ManagedSiteChannelMigrationDialog.tsx `
  src/features/ManagedSiteChannels/components/RowActions.tsx `
  src/features/ManagedSiteChannels/components/ChannelFilterDialog.tsx `
  src/features/ManagedSiteChannels/testIds.ts `
  src/components/dialogs/ChannelDialog/components/ChannelEditorShell.tsx `
  src/components/dialogs/ChannelDialog/components/ChannelCommonFieldsBody.tsx `
  src/components/dialogs/ChannelDialog/components/ChannelDialog.tsx `
  tests/features/ManagedSiteChannels/presentation `
  tests/entrypoints/options/pages/ManagedSiteChannels/ManagedSiteChannels.test.tsx `
  tests/features/ManagedSiteChannels/components/ManagedSiteChannelMigrationDialog.test.tsx `
  tests/components/dialogs/ChannelDialog/ChannelDialog.behavior.test.tsx `
  tests/components/dialogs/ChannelDialog/ChannelEditorShell.test.tsx `
  tests/features/ManagedSiteChannels/components/RowActions.test.tsx `
  tests/features/ManagedSiteChannels/components/ChannelFilterDialog.test.tsx `
  e2e/fixtures/managedSiteChannelsIntercepted.ts `
  e2e/managedSiteChannelsParity.spec.ts
pnpm run validate:staged
pnpm run validate:push
git commit -m "refactor(managed-sites): extract shared channel presentation"
~~~

Expected result: all current managed-site routes still render the legacy
controller through the same visual contract, with no native mode or new
resource page in the commit.

## Commit B: Add native controllers and controlled field presentation

### Step 0: Close the AxonHub migration type boundary

Add failing tests for unknown source/target types at the canonical and legacy
facade boundaries. Introduce strict native mapper results
`mapped | unsupported` in `axonHubChannelType.ts`, propagate them through
`axonHubMigration.ts`, and keep explicitly named fallback wrappers only inside
`channelMigrationLegacyFacade.ts`. The canonical executor receives the full
preview and returns ordered skipped rows for unsupported items; no credential or
create call is made for them. This step is required before native migration
presentation mapping and is covered by the existing migration capability tests.

### Step 1: Define feature-owned field presentation policy

First add failing policy tests for every AxonHub create/edit descriptor:
required entries exist exactly once, hidden entries are explicitly classified,
renderer value types agree, option labels are controlled, common fields select
the extracted shared renderer, and the test-only second registration can supply
a policy without copying a view. Then create
`managedResourceFieldPolicy.ts`. Adapter descriptors continue to use
only the existing fact-level `ResourceFieldDescriptor`. The feature policy
maps verified fields to a finite renderer and section:

~~~ts
type ManagedResourceEditorMode = "create" | "edit"
type ManagedResourceSection =
  | "basic"
  | "connection"
  | "models"
  | "sync"
  | "routing"
  | "metadata"
  | "advanced"

type ManagedResourceFieldPresentation = {
  fieldId: string
  section: ManagedResourceSection
  order: number
  labelKey: string
  helpKey?: string
  rows?: number
  optionLabelKeys?: Readonly<Record<string, string>>
  renderer:
    | "text"
    | "textarea"
    | "number"
    | "boolean"
    | "select"
    | "multi-select"
    | "secret"
  visibleWhen?: (values: EditableResourceProjection) => boolean
}
~~~

The policy is static frontend code keyed by site type, resource kind, field id,
and editor mode. It groups AxonHub fields as basic, connection, models, sync,
routing, metadata, and advanced. It must not accept backend-supplied labels,
renderer ids, layout, or executable predicates. The first slice uses only the
existing primitive renderers. Select and multi-select descriptors continue to
provide value-only options; the feature policy maps every approved option value
to controlled localized copy. Unknown values use a controlled fallback and
must never be passed directly to `t(...)` or shown as an unlabeled raw enum.
The policy is the single source of truth for native field order/section/labels;
existing table/detail field ids remain the source for shared common columns and
are referenced by the policy rather than duplicated.

Move the existing `textarea.rows` layout hint out of
`ResourceFieldDescriptor` and into this policy. Add `canReplace` to secret
descriptors separately from `secretState` and `allowClear`; masked or
permission-hidden read state never disables a permitted user-entered
replacement. AxonHub models and tags reuse the existing free-form
`CompactMultiSelect` behavior, so empty descriptor options do not make those
fields unusable or force raw enum labels.

Do not change the existing legacy mapper signatures in place. Add strict
`mapped | unsupported` mapper functions for canonical/native migration and keep
the current fallback functions as explicitly named legacy compatibility
wrappers used only by `channelMigrationLegacyFacade`. Tests freeze both: native
unknowns fail closed, while the legacy controller remains unchanged until its
separate migration is intentionally removed.

### Step 2: Add controller and collection tests first

Create a Workspace fixture using an opaque id,
`channel_example_opaque`, `https://upstream.example.invalid`, and reserved
model names. Add controller tests for:

- opening a Workspace and loading all cursor pages in order;
- aborting collection on refresh, search, scope change, unmount, or mutation;
- rejecting repeated cursors without an infinite loop;
- preserving current rows after same-scope refresh failure;
- passing the normalized search term to every Workspace page request, draining
  all returned search cursors, and resetting selection/client pagination;
- applying status filters and selected-row operations to the collected set;
- clearing an existing route search and refusing search UI when
  `capabilities.canSearch` is false;
- loading detail and ignoring a late result after row replacement;
- rejecting stale/unknown row keys before Workspace or capability access;
- rejecting wrong site/kind/scope, malformed, empty, and oversized refs at the
  Workspace and named-migration boundaries before native access;
- proving sentinel URL/token-like ref values never reach DOM, routes, test ids,
  logs, or analytics;
- create/edit validation, duplicate submit coalescing, confirmed upsert, and
  not-found recovery;
- closing and requiring a fresh read after
  `mutation_state_uncertain`, with no automatic replay;
- per-row bulk delete `success | failed | uncertain` results keyed by opaque
  controller row keys, with refresh and no-replay behavior.

The collection contract is:

~~~ts
async function collectAllPages(
  workspace: ManagedResourceWorkspace,
  query: ResourceListQuery,
  signal: AbortSignal,
): Promise<readonly ResourceDisplayFacts[]> {
  const items: ResourceDisplayFacts[] = []
  const seen = new Set<string>()
  const seenItems = new Set<string>()
  const maxPages = 100
  let cursor: string | undefined
  let pageCount = 0
  do {
    if (signal.aborted) throw new DOMException("Aborted", "AbortError")
    const page = await workspace.list({ ...query, cursor }, { signal })
    pageCount += 1
    if (pageCount > maxPages) throw createUnexpectedCollectionFailure()
    for (const item of page.items) {
      const itemKey = toControllerIdentity(item.ref)
      if (seenItems.has(itemKey)) throw createUnexpectedCollectionFailure()
      seenItems.add(itemKey)
      items.push(item)
    }
    if (!page.nextCursor) return items
    if (seen.has(page.nextCursor)) throw createUnexpectedCollectionFailure()
    seen.add(page.nextCursor)
    cursor = page.nextCursor
  } while (true)
}
~~~

Use the repository's actual failure constants and abort helper names when
implementing the test; the invariant is complete collection, cancellation,
repeated-cursor protection, duplicate-item protection, and a bounded collection
that reports a controlled failure instead of rendering a partial result. The
actual item identity used for duplicate detection is a controller-local
identity derived from the ref and never stored in UI state, DOM, analytics, or
serialized route parameters.

### Step 3: Implement native list/mutation controllers

Create `useManagedResourceListController.ts` and
`useManagedResourceMutationController.ts`. Controllers own Workspace opening,
complete cursor collection, query generations, selection, detail, editor
sessions, mutation certainty, safe failures, and refresh. They do not render
JSX and do not import legacy channel types.

Search always follows the Workspace contract: pass the normalized search term
to `workspace.list` and rely on the Adapter's resource-wide semantics, then
drain every cursor page returned for that query. Do not fetch one unsearched
page and filter it locally. Status filtering and table pagination remain
client-side over the fully collected result set.

Map `ResourceDisplayFacts` to `ManagedChannelsRowViewModel` in
`managedResourcePresentation.ts`. Keep refs in an internal
`rowKey -> ManagedResourceRef` map; expose only the opaque controller row key to
the table. Use controlled status/field labels and never display raw resource ids,
scope keys, adapter messages, or secrets.

### Step 4: Implement the native editor body

Add failing shared-body tests first for the legacy and native binders, common
test ids/focus order, primitive values/options/validation, free-form
multi-select, and secret replacement intent.

Extract the common field body and renderers from `ChannelDialog` in Commit A.
Create `ManagedResourceEditorBody.tsx` only for the controlled native extension
slot. It sorts the feature-owned policy by section/order and renders only the
primitive field components already used by the product. It is passed as
`children` to `ChannelEditorShell`; it does not create a new Dialog. Create and
edit may have different policy entries. Secret fields use `SecretEditIntent`,
never masked-string inference. Native fields may be grouped/reordered inside
the existing section primitives, but common name/type/base URL/status/models/
secret controls, labels, test ids, focus behavior, and validation are reused.
The shared read-only detail body is also reused by legacy and native View.
Tests cover masked/unavailable secrets with `canReplace` both true and false,
and verify that only explicit user input creates a `replace` intent.
Adapter tests submit crafted projections directly and assert zero native
mutation calls for forbidden type transitions or replace/clear intents on
OAuth, AWS, GCP, unknown, or permission-hidden credentials. These guards live
in Adapter validation/command construction, independent of field visibility.

Add locale keys only for native-only labels, controlled validation, and
recovery states. Keep existing `managedSiteChannels` copy for shared actions.
Run `pnpm run i18n:extract:ci` and inspect all six locale diffs.

### Step 5: Map canonical migration to the shared view

Add the focused mapping tests described below first and confirm they fail for
the current numeric-id/default-to-OpenAI path.

Create `managedResourceMigrationPresentation.ts`. Map
`ManagedSiteMigrationCanonicalPreview` and
`ManagedSiteMigrationCanonicalExecutionResult` to the shared migration view
contract. Preserve source/target values for base URL, type, models, groups,
priority, weight, and status; preserve warning order and safe blocked fallback
copy. Map `uncertain` to an explicit verify-and-refresh-required result and
never expose a credential, command, raw error, or native ref.

Add tests for row identity/order, seven comparison fields, warning mapping,
blocked fallback, created/failed/skipped/uncertain results, partial success,
and no replay. Add an unknown AxonHub source type case that returns
`unsupported`, blocks execution work for that row, and never defaults
to OpenAI. Mixed confirmation passes the complete canonical preview to the
landed executor: unsupported rows return ordered `skipped` results and ready
rows may execute. All-unsupported and unavailable-target previews also return
ordered results rather than throwing. Tests assert no credential resolution,
default-target mapping, or create call for blocked/unsupported rows. The native
wrapper may call canonical migration entry points, but the shared view must
remain service-free.

### Step 6: Add native migration orchestration

Add the controller cancellation, mixed-selection, analytics, partial-result,
and no-replay tests below before implementing the hook.

Create `useManagedResourceMigrationController.ts`. It accepts selected native
row keys, resolves them through the controller-owned ref map, and constructs
`ManagedSiteMigrationSelection[]` containing only selection id, display name,
and public ref. It calls the canonical
`prepareManagedSiteMigrationPreview` and `executeManagedSiteMigration` entry
points from `src/services/managedSites/channelMigration.ts`. Those entry
points resolve `axonHubManagedSiteMigrationCapability` through the existing
capability registry; the native UI must not call the legacy preview/execute
functions.

The hook owns target selection, preview generation, confirmation/execution,
AbortControllers, stale-generation rejection, exact-once analytics completion,
and post-execution refresh. A target change or close aborts preview. Execution
keeps created rows, reports failed/skipped/uncertain rows, refreshes after any
settled result, and never replays uncertain work.

Add focused tests proving:

- opaque string selection ids and order reach the canonical preview unchanged;
- the AxonHub named source/target capability is invoked through the registry;
- no `ChannelRow`, numeric id conversion, legacy facade, credential, or command
  enters UI state;
- target change, close, scope replacement, and unmount cancel stale work;
- late abort-insensitive results cannot open or replace a dialog;
- uncertain execution renders verify/refresh-required and cannot execute again
  from the stale preview;
- created rows remain created when a later row fails.

The hook passes only presentation preview/result plus callbacks to
`ManagedSiteMigrationDialogView`.

### Step 7: Add the native route wrapper without switching production mode

Create `ManagedSiteChannelsRoute.tsx` as the only mode dispatcher and keep the
three controller hooks free of JSX. It receives `siteType`, `refreshKey`, and
the existing route params (`search` and `channelId`) plus
`onReplaceRouteQuery`, selects exactly one
legacy or native controller from the static definition, and renders the shared
presentation. A missing native registration renders the controlled integration
failure and never falls back. Exercise native mode with AxonHub and a second
test-only registration while keeping the AxonHub production definition on
`legacy-channel`. Add
component tests proving legacy and native fixtures render the same toolbar
order, common columns, row-action controls, editor shell, migration shell, test
ids, loading/empty/error states, and focus behavior.

Before implementation, add the pinned AxonHub field contract to
`docs/superpowers/specs/2026-07-16-managed-site-resource-native-extension-design.md`.
It is the source-of-truth checklist for field, read selection, create input,
update input, clear behavior, editable-now decision, credential/type guard, and
preservation rule. The Adapter tests must cover every contract row before the
native editor body is wired.

If the native configuration failure needs a definition-owned settings anchor,
pass it through `ManagedSiteConfigRequiredState` and cover both the default
managed-site settings target and the AxonHub anchor in
`tests/components/ManagedSiteConfigRequiredState.test.tsx`. The CTA must use
controlled local copy and a retry action, never a raw adapter message.

### Step 8: Validate and commit native integration

Run:

~~~powershell
pnpm exec vitest run `
  tests/features/ManagedSiteChannels/presentation `
  tests/features/ManagedSiteChannels/controllers `
  tests/components/ManagedSiteConfigRequiredState.test.tsx `
  tests/services/apiAdapters/managedResources `
  tests/services/managedSites/channelMigration.test.ts `
  tests/services/managedSites/channelMigrationCapabilityRegistry.test.ts
pnpm run i18n:extract:ci
~~~

Run `pnpm run validate:staged` only after the Commit B `git add` command below.

Before committing, run the static boundary check (whole-word patterns avoid
false positives from names such as `ManagedSiteChannelsView`):

~~~powershell
$matches = rg -n -w "ManagedSiteChannel|ChannelFormData|channelMigrationLegacyFacade|prepareManagedSiteChannelMigrationPreview|executeManagedSiteChannelMigration" src/features/ManagedSiteChannels/controllers src/features/ManagedSiteChannels/presentation
if ($LASTEXITCODE -eq 0) { throw "native boundary violation:`n$matches" }
if ($LASTEXITCODE -ne 1) { throw "boundary check failed with exit code $LASTEXITCODE" }
~~~

Expected: no matches in native controller, native presentation mapping, or
native editor body. Legacy wrappers may retain their existing imports outside
those native modules.

Commit:

~~~powershell
git diff --cached --quiet
if ($LASTEXITCODE -eq 1) { throw "pre-existing staged changes; stop" }
if ($LASTEXITCODE -ne 0) { throw "cannot inspect staged state" }
git add src/features/ManagedSiteChannels/controllers `
  src/features/ManagedSiteChannels/presentation `
  src/entrypoints/options/pages/ManagedSiteChannels/index.tsx `
  src/features/ManagedSiteChannels/index.ts `
  src/components/ManagedSiteConfigRequiredState.tsx `
  tests/components/ManagedSiteConfigRequiredState.test.tsx `
  src/services/apiAdapters/contracts/managedResourceNative.ts `
  src/services/apiAdapters/managedResources/factory.ts `
  src/services/apiAdapters/managedResources/axonHub.ts `
  src/services/apiAdapters/managedResources/axonHubChannelType.ts `
  src/services/apiAdapters/managedResources/axonHubMigration.ts `
  src/services/managedSites/channelMigrationLegacyFacade.ts `
  tests/services/managedSites/channelMigration.test.ts `
  tests/services/apiAdapters/managedResources/factory.test.ts `
  tests/features/ManagedSiteChannels/controllers `
  tests/features/ManagedSiteChannels/presentation `
  tests/test-utils/managedResourceWorkspace.ts `
  docs/superpowers/specs/2026-07-16-managed-site-resource-native-extension-design.md `
  src/locales/zh-CN/managedSiteChannels.json `
  src/locales/zh-TW/managedSiteChannels.json `
  src/locales/en/managedSiteChannels.json `
  src/locales/ja/managedSiteChannels.json `
  src/locales/es-419/managedSiteChannels.json `
  src/locales/vi/managedSiteChannels.json
pnpm run validate:staged
pnpm run validate:push
git commit -m "feat(managed-sites): connect native controllers to shared channels UI"
~~~

Expected result: native fixtures render the shared UI, but AxonHub production
mode and all existing routes remain unchanged.

## Commit C: Switch AxonHub and prove the browser contract

### Step 1: Add the failing definition assertion

Update `tests/services/accountSiteDefinitions/registry.test.ts` to assert:

- AxonHub declares `native-resource` with the registered channel kind;
- the native registration is present;
- the other five managed-site types remain `legacy-channel`;
- mode is explicit and never inferred from registration presence.

Run:

~~~powershell
pnpm exec vitest run tests/services/accountSiteDefinitions/registry.test.ts
~~~

Expected: FAIL because AxonHub remains on `legacy-channel`.

### Step 2: Add the intercepted Chromium proof

Extend `e2e/managedSiteChannelsParity.spec.ts` using the same intercepted
fixture and shared test-id paths created in Commit A. Seed reserved example AxonHub
preferences and return opaque ids plus cursor pages. Use the existing
`MANAGED_SITE_CHANNELS_TEST_IDS` and `CHANNEL_DIALOG_TEST_IDS`; do not add a
native selector branch for controls already present.

Cover one representative workflow:

1. open the existing Managed Site Channels route;
2. assert the shared toolbar, common columns, row menu, and search;
3. open edit, change the name and one approved native field;
4. assert the mutation omits unchanged fields and credentials;
5. return the updated row and assert refresh;
6. open migration preview and assert the shared comparison/warning structure.

Run the workflow at fixed desktop and mobile viewports with the fixture language,
data, intercepted responses, and reduced-motion context. Assert the shared shell
and common controls through DOM, accessibility, and interaction checks. Do not
require a live AxonHub deployment.

### Step 3: Flip only the static AxonHub definition

Change `src/services/accountSiteDefinitions/definitions.ts` to
`native-resource` for AxonHub. Do not delete the legacy provider or add a
runtime fallback. The one-line definition mode remains the rollback switch.

### Step 4: Run focused tests and release gates

~~~powershell
pnpm exec vitest run `
  tests/services/accountSiteDefinitions/registry.test.ts `
  tests/features/ManagedSiteChannels/presentation `
  tests/features/ManagedSiteChannels/controllers `
  tests/services/apiAdapters/managedResources `
  tests/services/managedSites/channelMigration.test.ts
pnpm run i18n:extract:ci
pnpm exec playwright test e2e/managedSiteChannelsParity.spec.ts --project=chromium
~~~

Expected: focused tests, locale extraction, Chromium proof, compile, and knip
all pass. The final `validate:push` runs after staging in Step 5. Classify
failures before changing code; do not weaken a gate.

### Step 5: Review stop conditions and commit

Inspect:

~~~powershell
git diff --check e2c9da1a1
git diff --name-status e2c9da1a1
git status --short
~~~

Confirm that changed files belong to the original three commits, the native modules
contain no legacy DTO imports, shared views contain no site-type conditionals,
cursor collection is cancellable and complete, uncertain mutations require a
fresh read, and the other five managed-site routes still use legacy fixtures.

Then stage only the final switch, registry test, and E2E changes:

~~~powershell
git diff --cached --quiet
if ($LASTEXITCODE -eq 1) { throw "pre-existing staged changes; stop" }
if ($LASTEXITCODE -ne 0) { throw "cannot inspect staged state" }
git add src/services/accountSiteDefinitions/definitions.ts `
  tests/services/accountSiteDefinitions/registry.test.ts `
  e2e/fixtures/managedSiteChannelsIntercepted.ts `
  e2e/managedSiteChannelsParity.spec.ts `
  e2e/scenarios/managedSiteChannels.ts
pnpm run validate:staged
pnpm run validate:push
git commit -m "feat(axonhub): switch to native controller behind shared UI"
~~~

## Observability and compatibility

Reuse existing Managed Site Channels analytics feature, action ids, surfaces,
and controlled result categories. Do not record URLs, ids, refs, names, tags,
models, field values, credentials, raw backend messages, or errors. The
presentation refactor adds no passive impression event and no settings-search
entry.

Legacy controller components/adapters and native controller hooks are the only
owners of analytics emission. They emit the existing action id at user intent
and one controlled result category when an operation settles; late or aborted
generations emit no duplicate completion. Shared `RowActions`, filter dialogs,
and views only invoke typed callbacks and contain no analytics imports.

The rollback is the static AxonHub definition mode. Reverting it routes AxonHub
back to the legacy controller inside the same presentation; no runtime
catch-and-fallback is added.

## Final acceptance

- One shared page/table/editor/migration markup tree is used by legacy and
  native controllers.
- AxonHub fields are grouped by the approved feature-owned policy and rendered
  only by existing primitive components.
- AxonHub list search, pagination, selection, and filtered migration preserve
  current client-side semantics after cancellable cursor collection.
- Native code never constructs legacy DTOs or exposes native details/secrets
  outside the existing field-local password/reveal interaction.
- Canonical migration preserves comparison fields, warnings, blocked recovery,
  partial outcomes, uncertain refresh-required state, copy, and analytics.
- The other five managed-site types pass their existing legacy behavior tests
  and browser scenario.
- The original three commits and the follow-up compatibility correction pass
  their focused tests and staged validation; the final state passes i18n
  extraction, targeted Chromium, compile, and knip through
  `pnpm run validate:push`.
- AxonHub's default test model is selected from the current supported/manual
  model union, with deterministic first-option repair and a usable empty state.
- Automatic model synchronization identifies the AxonHub-owned schedule; its
  filter is named, explained, conditionally displayed, preserved while hidden,
  and validated before mutation dispatch.

## Post-cutover compatibility correction

The first native cutover exposed three parity regressions. This correction is
part of the same original plan and is delivered as a follow-up task-scoped
commit before remote handoff.

### Task D: Restore AxonHub status, model-count, and key-view semantics

**Files:**

- Modify: `src/services/apiAdapters/contracts/managedResourceNative.ts`
- Modify: `src/services/apiAdapters/managedResources/factory.ts`
- Modify: `src/services/apiAdapters/managedResources/axonHub.ts`
- Modify: `src/services/apiService/axonHub/index.ts`
- Modify: `src/components/dialogs/ChannelDialog/components/ChannelCommonFieldsBody.tsx`
- Modify: `src/features/ManagedSiteChannels/presentation/ManagedResourceEditorBody.tsx`
- Modify: `src/locales/{zh-CN,zh-TW,en,ja,es-419,vi}/managedSiteChannels.json`
- Test: `tests/services/apiAdapters/managedResources/axonHub.test.ts`
- Test: `tests/services/apiService/axonHub/index.test.ts`
- Test: `tests/features/ManagedSiteChannels/presentation/ManagedResourceEditorBody.test.tsx`
- Test: `tests/features/ManagedSiteChannels/presentation/ManagedSiteChannelsView.test.tsx`

- [ ] **Step 1: Write the failing status tests.** Start from `disabled`,
  submit `enabled`, and assert native operations call `updateChannelStatus`
  without leaving `status` in the ordinary patch. Add a mixed patch case where
  the ordinary update succeeds and the status mutation rejects; expect
  `{ certainty: "partially-applied" }`.

- [ ] **Step 2: Run the status tests and verify RED.**

```powershell
pnpm exec vitest run tests/services/apiAdapters/managedResources/axonHub.test.ts --testNamePattern "status|partially"
```

Expected: the new assertions fail because native update currently sends status
only through `updateChannel`.

- [ ] **Step 3: Implement the smallest status split.** Remove status from the
  ordinary patch, apply that patch first when non-empty, then call
  `updateAxonHubChannelStatus` when status changed. Return partial certainty
  when the second mutation fails after the first succeeds.

- [ ] **Step 4: Write and run failing model-count tests.** Extend the list
  GraphQL fixture with `manualModels`; assert the native list fact is the
  numeric trimmed, non-empty, de-duplicated union count and the table renders a
  number rather than model badges.

```powershell
pnpm exec vitest run tests/services/apiService/axonHub/index.test.ts tests/features/ManagedSiteChannels/presentation/ManagedSiteChannelsView.test.tsx --testNamePattern "model|Models"
```

Expected: RED because the summary currently selects only `supportedModels` and
the presenter treats it as a list.

- [ ] **Step 5: Implement numeric model presentation.** Add `manualModels` to
  the safe list selection and sanitized summary. Map the approved list models
  field to a numeric union-count fact while leaving detail facts as separate
  lists for editing.

- [ ] **Step 6: Write and run failing saved-key tests.** For an available key,
  assert the editor automatically resolves it into the existing password field,
  the eye control toggles visibility, an untouched prefill remains `unchanged`,
  and a subsequent user edit emits `replace`. Keep masked, permission-hidden,
  unavailable, and structured credentials blank.

```powershell
pnpm exec vitest run tests/features/ManagedSiteChannels/presentation/ManagedResourceEditorBody.test.tsx tests/services/apiAdapters/managedResources/axonHub.test.ts --testNamePattern "saved key|credential|secret"
```

Expected: RED because native edit currently exposes only secret state.

- [ ] **Step 7: Implement automatic saved-key prefill.** Add an editor-owned
  secret resolver that supplies only a usable regular key to the leaf
  `ChannelSecretField` local state when the editor opens. Keep the public
  projection at `unchanged` until actual input; reuse the existing password
  reveal control, set `autocomplete="new-password"`, and clear the leaf value
  on unmount.

- [ ] **Step 8: Preserve stale model state for unrelated edits.** Existing
  empty supported/default-model values may remain unchanged during status or
  name edits. Create still requires them, and user-cleared model invariants
  remain invalid when model fields are edited.

- [ ] **Step 9: Run the complete focused RED-to-GREEN loop.** Re-run all three
  commands above plus the full affected test files. Verify each new assertion
  failed before implementation and passes after it.

- [ ] **Step 10: Validate and commit.** Synchronize this plan and the original
  design spec's field contract. Stage only Task D files, run
  `pnpm run validate:staged` and `pnpm run validate:push`, then commit:

```powershell
git commit -m "fix(axonhub): restore native channel parity semantics"
```

### Task E: Match AxonHub's native model-form experience

**Files:**

- Modify: `src/features/ManagedSiteChannels/presentation/managedResourceFieldPolicy.ts`
- Modify: `src/features/ManagedSiteChannels/presentation/ManagedResourceEditorBody.tsx`
- Modify: `src/services/apiAdapters/managedResources/axonHub.ts`
- Modify: `src/locales/{zh-CN,zh-TW,en,ja,es-419,vi}/managedSiteChannels.json`
- Test: `tests/features/ManagedSiteChannels/presentation/managedResourceFieldPolicy.test.ts`
- Test: `tests/features/ManagedSiteChannels/presentation/ManagedResourceEditorBody.test.tsx`
- Test: `tests/services/apiAdapters/managedResources/axonHub.test.ts`

- [ ] **Step 1: Write failing field-policy tests.** Change
  the test descriptor for `defaultTestModel` to a select with empty static
  options, then assert the approved frontend-owned presentation contract:

```ts
expect(defaultTestModelField).toMatchObject({
  renderer: "select",
  optionSourceFieldIds: [
    AXON_HUB_CHANNEL_FIELD_IDS.SUPPORTED_MODELS,
    AXON_HUB_CHANNEL_FIELD_IDS.MANUAL_MODELS,
  ],
  autoSelectFirstOption: true,
  helpKey:
    "managedSiteChannels:nativeEditor.fields.defaultTestModel.help",
  placeholderKey:
    "managedSiteChannels:nativeEditor.fields.defaultTestModel.placeholder",
})
expect(autoSyncField).toMatchObject({
  helpKey:
    "managedSiteChannels:nativeEditor.fields.autoSyncSupportedModels.help",
})
expect(patternField).toMatchObject({
  helpKey: "managedSiteChannels:nativeEditor.fields.autoSyncModelPattern.help",
  placeholderKey:
    "managedSiteChannels:nativeEditor.fields.autoSyncModelPattern.placeholder",
  issueLabelKeys: {
    invalid_value:
      "managedSiteChannels:nativeEditor.fields.autoSyncModelPattern.invalid",
  },
})
expect(patternField.visibleWhen?.({
  [AXON_HUB_CHANNEL_FIELD_IDS.AUTO_SYNC_SUPPORTED_MODELS]: false,
})).toBe(false)
expect(patternField.visibleWhen?.({
  [AXON_HUB_CHANNEL_FIELD_IDS.AUTO_SYNC_SUPPORTED_MODELS]: true,
})).toBe(true)
```

- [ ] **Step 2: Run the policy test and verify RED.**

```powershell
pnpm exec vitest run tests/features/ManagedSiteChannels/presentation/managedResourceFieldPolicy.test.ts
```

  Expected: FAIL because the default test model descriptor/policy is still
  text-only and the presentation policy does not yet define dependent options,
  help, placeholder, visibility, or field-specific validation copy.

- [ ] **Step 3: Implement the smallest validated presentation contract.** Add
  these optional properties to `ManagedResourceFieldPresentation`:

```ts
placeholderKey?: string
optionSourceFieldIds?: readonly string[]
autoSelectFirstOption?: boolean
issueLabelKeys?: Partial<Record<ResourceFieldIssue["code"], string>>
```

  Import `ResourceFieldIssue` as a type. In `assertModePolicy`, reject
  `optionSourceFieldIds` unless the renderer is `select`, reject an empty or
  duplicate source list, and require a non-empty source list when
  `autoSelectFirstOption` is true. This remains frontend policy; do not move a
  resolver into Adapter descriptors.

  Change AxonHub's `defaultTestModel` descriptor and presentation renderer to
  `select` with `options: []`. Configure its option sources as supported and
  manual models. Add the approved help/placeholder keys. Give the automatic
  sync switch its help key. Give the pattern its help, placeholder, controlled
  invalid-message key, and this visibility predicate:

```ts
visibleWhen: (values) =>
  values[AXON_HUB_CHANNEL_FIELD_IDS.AUTO_SYNC_SUPPORTED_MODELS] === true
```

- [ ] **Step 4: Run the policy test and verify GREEN.**

```powershell
pnpm exec vitest run tests/features/ManagedSiteChannels/presentation/managedResourceFieldPolicy.test.ts
```

  Expected: PASS, including renderer compatibility and policy metadata.

- [ ] **Step 5: Write failing dependent-select and conditional-field component
  tests.** In `ManagedResourceEditorBody.test.tsx`, use reserved model ids such
  as `model-example-a` and `model-example-b`. Cover these observable rules:

```ts
expect(
  screen.getByRole("combobox", { name: /Default test model/ }),
).toBeVisible()
await user.click(
  screen.getByRole("combobox", { name: /Default test model/ }),
)
expect(screen.getAllByRole("option").map((option) => option.textContent)).toEqual(
  ["model-example-a", "model-example-b"],
)
```

  Supply duplicates across supported/manual models and prove they collapse to
  one option. Prove a new empty default selects the first candidate, removing
  the selected candidate falls back to the first remaining candidate, and an
  empty candidate list disables the select without clearing an existing stale
  edit value. Prove the help text is the select's accessible description.

  Start automatic sync disabled and assert the pattern input is absent. Toggle
  the switch, assert the pattern input appears with placeholder and accessible
  description, enter `(?i)^model-example`, toggle off and on, and assert the
  value is preserved.

- [ ] **Step 6: Run the component test and verify RED.**

```powershell
pnpm exec vitest run tests/features/ManagedSiteChannels/presentation/ManagedResourceEditorBody.test.tsx --testNamePattern "default test model|automatic model sync|model filter"
```

  Expected: FAIL because the control is still a text input, select options are
  not derived, and the pattern is always visible without help or placeholder.

- [ ] **Step 7: Implement generic dependent select rendering.** Add one pure
  helper in `ManagedResourceEditorBody.tsx` that combines descriptor options
  with the configured projection lists, trims values, removes empty strings,
  and de-duplicates without reordering:

```ts
const resolveSelectOptionValues = (
  descriptor: Extract<ResourceFieldDescriptor, { type: "select" }>,
  presentation: ManagedResourceFieldPresentation,
  values: EditableResourceProjection,
) =>
  Array.from(
    new Set([
      ...descriptor.options.map(({ value }) => value),
      ...(presentation.optionSourceFieldIds ?? []).flatMap((fieldId) =>
        readList(values, fieldId),
      ),
    ].map((value) => value.trim()).filter(Boolean)),
  )
```

  Use the resolved values for every select. Keep existing translated enum
  labels for descriptor-owned options; dependent values render their literal
  model ids. Pass `placeholderKey` into `SelectValue` and text `Input`.
  Disable a dependent select while its resolved option list is empty.

  Add a single effect over resolved policy fields. When
  `autoSelectFirstOption` is true, the option list is non-empty, and the
  current value is empty or absent from the list, call `onValueChange` with the
  first option. Do nothing for an empty option list so existing stale edit data
  is not silently cleared. Use the presentation-specific issue key before the
  generic `ISSUE_LABEL_KEYS` fallback. Do not import AxonHub constants or add a
  site-type branch to the shared editor.

- [ ] **Step 8: Run the component and policy tests and verify GREEN.**

```powershell
pnpm exec vitest run tests/features/ManagedSiteChannels/presentation/ManagedResourceEditorBody.test.tsx tests/features/ManagedSiteChannels/presentation/managedResourceFieldPolicy.test.ts
```

  Expected: PASS with no React update-loop, act, duplicate-key, or accessibility
  warnings.

- [ ] **Step 9: Write failing locale-contract tests and add synchronized copy.**
  First extend the existing six-locale loop to resolve every new `helpKey`,
  `placeholderKey`, and field-specific issue key; run the policy test and
  verify RED because the resources are missing. Then add the same key shape to
  all six locale files with these exact meanings:

| Key | English | Simplified Chinese |
| --- | --- | --- |
| `defaultTestModel.label` | Default test model | 默认测试模型 |
| `defaultTestModel.help` | Used to test this channel connection. Choose one of the configured supported or manual models. | 用于测试此渠道的连接，请从已配置的支持模型或手动模型中选择。 |
| `defaultTestModel.placeholder` | Select a configured model | 选择已配置的模型 |
| `autoSyncSupportedModels.label` | Automatically sync supported models | 自动同步支持的模型 |
| `autoSyncSupportedModels.help` | AxonHub updates enabled channels from the provider API at the frequency configured in AxonHub system settings. | AxonHub 会按其系统设置的频率，从提供商 API 更新已启用渠道的模型列表。 |
| `autoSyncModelPattern.label` | Model filter pattern | 模型过滤规则 |
| `autoSyncModelPattern.help` | Only sync matching models. Prefix with (?i) to ignore case; leave empty to sync all models. | 仅同步匹配此规则的模型；使用 (?i) 前缀可忽略大小写，留空则同步全部模型。 |
| `autoSyncModelPattern.placeholder` | For example, (?i)^model-example | 例如 (?i)^model-example |
| `autoSyncModelPattern.invalid` | Enter a valid model filter pattern. | 请输入有效的模型过滤规则。 |

  Use the following localized values for the remaining four files; do not
  leave English fallback text or expose GraphQL field names:

```jsonc
// src/locales/zh-TW/managedSiteChannels.json
{
  "defaultTestModel": {
    "label": "預設測試模型",
    "help": "用於測試此渠道的連線，請從已設定的支援模型或手動模型中選擇。",
    "placeholder": "選擇已設定的模型"
  },
  "autoSyncSupportedModels": {
    "label": "自動同步支援的模型",
    "help": "AxonHub 會依其系統設定的頻率，從供應商 API 更新已啟用渠道的模型清單。"
  },
  "autoSyncModelPattern": {
    "label": "模型篩選規則",
    "help": "僅同步符合此規則的模型；使用 (?i) 前綴可忽略大小寫，留空則同步所有模型。",
    "placeholder": "例如 (?i)^model-example",
    "invalid": "請輸入有效的模型篩選規則。"
  }
}
```

```jsonc
// src/locales/ja/managedSiteChannels.json
{
  "defaultTestModel": {
    "label": "既定のテストモデル",
    "help": "このチャネルの接続テストに使用します。設定済みの対応モデルまたは手動モデルから選択してください。",
    "placeholder": "設定済みモデルを選択"
  },
  "autoSyncSupportedModels": {
    "label": "対応モデルを自動同期",
    "help": "AxonHub はシステム設定で指定された頻度で、プロバイダー API から有効なチャネルのモデル一覧を更新します。"
  },
  "autoSyncModelPattern": {
    "label": "モデルフィルターパターン",
    "help": "このパターンに一致するモデルだけを同期します。大文字と小文字を区別しない場合は先頭に (?i) を付け、すべて同期する場合は空欄にします。",
    "placeholder": "例: (?i)^model-example",
    "invalid": "有効なモデルフィルターパターンを入力してください。"
  }
}
```

```jsonc
// src/locales/es-419/managedSiteChannels.json
{
  "defaultTestModel": {
    "label": "Modelo de prueba predeterminado",
    "help": "Se usa para probar la conexión de este canal. Selecciona uno de los modelos compatibles o manuales configurados.",
    "placeholder": "Selecciona un modelo configurado"
  },
  "autoSyncSupportedModels": {
    "label": "Sincronizar automáticamente los modelos compatibles",
    "help": "AxonHub actualiza los canales habilitados desde la API del proveedor con la frecuencia configurada en los ajustes del sistema de AxonHub."
  },
  "autoSyncModelPattern": {
    "label": "Patrón de filtro de modelos",
    "help": "Sincroniza solo los modelos que coincidan. Añade el prefijo (?i) para ignorar mayúsculas y minúsculas; déjalo vacío para sincronizar todos los modelos.",
    "placeholder": "Por ejemplo, (?i)^model-example",
    "invalid": "Ingresa un patrón de filtro de modelos válido."
  }
}
```

```jsonc
// src/locales/vi/managedSiteChannels.json
{
  "defaultTestModel": {
    "label": "Mô hình kiểm thử mặc định",
    "help": "Dùng để kiểm thử kết nối của kênh này. Chọn một mô hình được hỗ trợ hoặc mô hình thủ công đã cấu hình.",
    "placeholder": "Chọn một mô hình đã cấu hình"
  },
  "autoSyncSupportedModels": {
    "label": "Tự động đồng bộ các mô hình được hỗ trợ",
    "help": "AxonHub cập nhật các kênh đang bật từ API của nhà cung cấp theo tần suất được cấu hình trong phần cài đặt hệ thống AxonHub."
  },
  "autoSyncModelPattern": {
    "label": "Mẫu lọc mô hình",
    "help": "Chỉ đồng bộ các mô hình khớp với mẫu này. Thêm tiền tố (?i) để không phân biệt chữ hoa chữ thường; để trống để đồng bộ tất cả mô hình.",
    "placeholder": "Ví dụ: (?i)^model-example",
    "invalid": "Nhập mẫu lọc mô hình hợp lệ."
  }
}
```

  Run the policy test again and verify GREEN; the existing English and
  Simplified Chinese objects must contain the same keys as the four snippets.

- [ ] **Step 10: Write failing AxonHub pattern-validation tests.** Open a real
  create editor from `axonHubManagedResourceRegistration`, build otherwise
  valid values, enable automatic sync, and assert that `model-example`, `*`,
  `(?i)^model-example`, and an empty pattern validate. Assert `[model-example`
  returns exactly this controlled issue:

```ts
{
  fieldId: AXON_HUB_CHANNEL_FIELD_IDS.AUTO_SYNC_MODEL_PATTERN,
  code: MANAGED_RESOURCE_FIELD_ISSUE_CODES.InvalidValue,
}
```

  Disable automatic sync with the same malformed saved pattern and assert
  validation does not block an unrelated edit.

- [ ] **Step 11: Run the Adapter test and verify RED.**

```powershell
pnpm exec vitest run tests/services/apiAdapters/managedResources/axonHub.test.ts --testNamePattern "model filter pattern"
```

  Expected: FAIL because `validateValues` does not validate
  `autoSyncModelPattern`.

- [ ] **Step 12: Implement pinned AxonHub pattern validation.** Keep the helper
  private to `src/services/apiAdapters/managedResources/axonHub.ts` and add a
  concise source comment pointing to the pinned upstream
  `frontend/src/features/channels/utils/pattern.ts`. Mirror its UI-supported
  contract:

```ts
const AXON_HUB_MODEL_PATTERN_REGEX_CHARS = /[*?+[\]{}()^$.|\\]/

const isValidAxonHubModelPattern = (pattern: string) => {
  if (!pattern || pattern === "*") return true
  const caseInsensitive = pattern.startsWith("(?i)")
  const body = caseInsensitive ? pattern.slice(4) : pattern
  if (!AXON_HUB_MODEL_PATTERN_REGEX_CHARS.test(body)) return true
  try {
    const normalizedBody = body.replace(/^\^/, "").replace(/\$$/, "")
    new RegExp(`^(?:${normalizedBody})$`, caseInsensitive ? "i" : "")
    return true
  } catch {
    return false
  }
}
```

  In `validateValues`, read the switch and trimmed pattern. Add
  `InvalidValue` for `AUTO_SYNC_MODEL_PATTERN` only when automatic sync is
  enabled and the pattern is invalid. Leave mutation normalization and hidden
  pattern preservation unchanged.

- [ ] **Step 13: Run all focused tests, locale extraction, and related tests.**

```powershell
pnpm exec vitest run tests/features/ManagedSiteChannels/presentation/managedResourceFieldPolicy.test.ts tests/features/ManagedSiteChannels/presentation/ManagedResourceEditorBody.test.tsx tests/services/apiAdapters/managedResources/axonHub.test.ts
pnpm exec vitest related --run src/features/ManagedSiteChannels/presentation/managedResourceFieldPolicy.ts src/features/ManagedSiteChannels/presentation/ManagedResourceEditorBody.tsx src/services/apiAdapters/managedResources/axonHub.ts
pnpm run i18n:extract:ci
```

  Expected: PASS, locale extraction leaves the worktree unchanged, and no
  unrelated historical test is weakened.

- [ ] **Step 14: Review maintainability and validate the integrated diff.**
  Confirm the dependent-option logic is policy-driven, the shared editor has
  no AxonHub/site-type conditional, no third model-list implementation was
  added, hidden patterns are preserved, and analytics receives no model or
  pattern values. Stage only Task E files, then run:

```powershell
pnpm run validate:staged
pnpm run validate:push
git diff --cached --check
git status --short
```

  Expected: all checks pass; the staged diff contains only Task E code, tests,
  and locales. The design and plan updates were committed before implementation
  and are not restaged with the product change.

- [ ] **Step 15: Commit the form experience correction.**

```powershell
git commit -m "fix(axonhub): improve native model form guidance"
```

## Post-cutover release-blocker corrections

The initial cutover exposed follow-up release blockers in credential safety, mutation recovery, form feedback, and the shared mobile migration layout. They remain part of this cutover plan because they correct the same native editor contract; no separate follow-up plan or architecture applies.

**Goal:** Remove the AxonHub native editor's multi-key data-loss risk and make its validation, credential, failure, recovery, and mobile migration states clear enough for release.

**Architecture:** Keep AxonHub protocol safety in the AxonHub managed-resource adapter, keep mutation certainty and recovery state in the native mutation controller, and keep rendering/copy in the shared presentation layer. Extend existing descriptors and presentation contracts only where controlled state must cross those boundaries; do not build a multi-key editor, add remote model fetching, or change AxonHub's intentionally optional Base URL.

The unchecked steps below preserve the original execution plan. The
retrospective notes record their completed implementation.

### Task F: Fail Closed for Multi-Key AxonHub Credentials

Implemented as part of the final AxonHub native cutover slice.

**Files:**
- Modify: `src/services/apiAdapters/contracts/managedResourceNative.ts`
- Modify: `src/services/apiAdapters/managedResources/axonHub.ts`
- Modify: `src/features/ManagedSiteChannels/presentation/ManagedResourceEditorBody.tsx`
- Modify: `src/locales/en/managedSiteChannels.json`
- Modify: `src/locales/es-419/managedSiteChannels.json`
- Modify: `src/locales/ja/managedSiteChannels.json`
- Modify: `src/locales/vi/managedSiteChannels.json`
- Modify: `src/locales/zh-CN/managedSiteChannels.json`
- Modify: `src/locales/zh-TW/managedSiteChannels.json`
- Modify: `docs/superpowers/specs/2026-07-16-managed-site-resource-native-extension-design.md`
- Test: `tests/services/apiAdapters/managedResources/axonHub.test.ts`
- Test: `tests/features/ManagedSiteChannels/presentation/ManagedResourceEditorBody.test.tsx`

- [ ] **Step 1: Write adapter regression tests for a multi-key detail.** Build a regular AxonHub detail with two non-empty values across `credentials.apiKeys`/legacy `credentials.apiKey`. Assert that the secret descriptor is not replaceable, carries `multiple_credentials`, exposes no `loadSecret`, rejects crafted `replace` and `clear` intents with `unsupported_option`, permits an unrelated rename with `unchanged`, and never sends `credentials` for that rename.

```ts
expect(secretField).toMatchObject({
  canReplace: false,
  replacementBlockReason: "multiple_credentials",
})
expect(editor.loadSecret).toBeUndefined()
expect(editor.validate({ ...editor.initialValues, key: { kind: "replace", value: "replacement-placeholder" } })).toMatchObject({
  valid: false,
  issues: [{ fieldId: "key", code: "unsupported_option" }],
})
```

- [ ] **Step 2: Write the latest-detail race regression.** Open the editor from a single-key detail, return a two-key detail when submission refreshes authoritative state, submit a replacement, and assert `updateAxonHubChannel` is never dispatched.

- [ ] **Step 3: Write the presentation regression.** Render a secret descriptor with `canReplace: false` and `replacementBlockReason: "multiple_credentials"`; assert the input is disabled and blank, automatic loading is not invoked, and the accessible description says the channel's keys must be managed in AxonHub.

- [ ] **Step 4: Run the focused tests and verify RED.**

```powershell
pnpm exec vitest run tests/services/apiAdapters/managedResources/axonHub.test.ts tests/features/ManagedSiteChannels/presentation/ManagedResourceEditorBody.test.tsx --testNamePattern "multiple API keys|multi-key credential"
```

Expected: FAIL because the adapter currently loses key count, exposes the first key, and emits a one-element replacement array.

- [ ] **Step 5: Add the controlled descriptor reason.** Export the runtime constant and derived type, then add the optional field only to the secret descriptor branch.

```ts
export const MANAGED_RESOURCE_SECRET_REPLACEMENT_BLOCK_REASONS = {
  MultipleCredentials: "multiple_credentials",
} as const

export type ResourceSecretReplacementBlockReason =
  (typeof MANAGED_RESOURCE_SECRET_REPLACEMENT_BLOCK_REASONS)[keyof typeof MANAGED_RESOURCE_SECRET_REPLACEMENT_BLOCK_REASONS]
```

- [ ] **Step 6: Centralize AxonHub credential metadata.** Normalize trimmed candidates once, store `{ state, candidateCount }` with sanitized editor detail, and make `canReplaceCredential`, descriptor construction, validation, command construction, and loader exposure use the same metadata. Treat more than one non-empty candidate as non-replaceable while leaving other fields editable.

- [ ] **Step 7: Add defense at the authoritative mutation boundary.** Before dispatching a credential update against the freshly loaded detail, reject the command when the refreshed detail is multi-key. Add a concise source comment pointing to AxonHub's `UpdateChannelInput` contract and explaining that `credentials.apiKeys` is replacement data, so a scalar editor must not overwrite a collection.

- [ ] **Step 8: Add controlled copy and documentation.** Use `nativeEditor.secret.replacementDisabledMultipleCredentials` in all six locales. English source: `This channel has multiple API keys. Manage its keys in AxonHub.` Update the design spec's field contract to state that multi-key channels remain editable except for credentials.

- [ ] **Step 9: Run focused and locale validation, then verify GREEN.**

```powershell
pnpm exec vitest run tests/services/apiAdapters/managedResources/axonHub.test.ts tests/features/ManagedSiteChannels/presentation/ManagedResourceEditorBody.test.tsx --testNamePattern "multiple API keys|multi-key credential"
pnpm run i18n:extract:ci
```

Expected: PASS; locale extraction produces no diff; single-key replacement and unchanged multi-key edits remain covered.

- [ ] **Step 10: Commit the isolated safety fix after review.**

```powershell
git add src/services/apiAdapters/contracts/managedResourceNative.ts src/services/apiAdapters/managedResources/axonHub.ts src/features/ManagedSiteChannels/presentation/ManagedResourceEditorBody.tsx src/locales/en/managedSiteChannels.json src/locales/es-419/managedSiteChannels.json src/locales/ja/managedSiteChannels.json src/locales/vi/managedSiteChannels.json src/locales/zh-CN/managedSiteChannels.json src/locales/zh-TW/managedSiteChannels.json docs/superpowers/specs/2026-07-16-managed-site-resource-native-extension-design.md tests/services/apiAdapters/managedResources/axonHub.test.ts tests/features/ManagedSiteChannels/presentation/ManagedResourceEditorBody.test.tsx
pnpm run validate:staged
git commit -m "fix(axonhub): protect multi-key channel credentials"
```

### Task G: Distinguish Editor Failures and Restore Fresh-Read Recovery

Implemented as part of the final AxonHub native cutover slice.

**Files:**
- Modify: `src/features/ManagedSiteChannels/controllers/useManagedResourceMutationController.ts`
- Modify: `src/features/ManagedSiteChannels/ManagedSiteChannelsRoute.tsx`
- Modify: `src/features/ManagedSiteChannels/presentation/contracts.ts`
- Modify: `src/features/ManagedSiteChannels/presentation/ManagedSiteChannelsView.tsx`
- Modify: `src/locales/en/managedSiteChannels.json`
- Modify: `src/locales/es-419/managedSiteChannels.json`
- Modify: `src/locales/ja/managedSiteChannels.json`
- Modify: `src/locales/vi/managedSiteChannels.json`
- Modify: `src/locales/zh-CN/managedSiteChannels.json`
- Modify: `src/locales/zh-TW/managedSiteChannels.json`
- Test: `tests/features/ManagedSiteChannels/controllers/useManagedResourceControllers.test.tsx`
- Test: `tests/features/ManagedSiteChannels/ManagedSiteChannelsRoute.test.tsx`

- [ ] **Step 1: Write controller feedback tests.** Cover create/edit open rejection, a confirmed save rejection that retains the editor, an uncertain save that closes it, and a confirmed save followed by a rejected refresh. Assert a discriminated feedback kind instead of inferring operation context from `ResourceFailure.code`.

```ts
expect(result.current.editorFeedback).toEqual({
  kind: "saved-refresh-failed",
})
expect(result.current.deleteState.requiresFreshRead).toBe(true)
```

- [ ] **Step 2: Write recovery tests.** After `saved-refresh-failed`, make the next refresh succeed through `recoverFreshRead()` and assert both the replay lock and feedback clear. Preserve feedback when recovery fails.

- [ ] **Step 3: Write route presentation tests.** Assert open failures appear as a page alert, confirmed save failures keep the dialog and say `Unable to save channel`, uncertain outcomes keep the existing review-required copy, and confirmed-save refresh failure uses warning tone with `Channel saved, refresh needed`. Click the existing toolbar refresh and assert it invokes `recoverFreshRead`, not a parallel list refresh, while locked.

- [ ] **Step 4: Run controller and route tests and verify RED.**

```powershell
pnpm exec vitest run tests/features/ManagedSiteChannels/controllers/useManagedResourceControllers.test.tsx tests/features/ManagedSiteChannels/ManagedSiteChannelsRoute.test.tsx --testNamePattern "editor feedback|saved.*refresh|open.*failure|save.*failure"
```

Expected: FAIL because `editorFailure` has no operation context, ordinary open failures are hidden, and toolbar refresh does not clear the controller lock.

- [ ] **Step 5: Implement discriminated feedback in the controller.** Use the exact public kinds `open-failed`, `save-failed`, `save-uncertain`, and `saved-refresh-failed`; carry a safe `ResourceFailure` only where field/code details are meaningful. Clear stale feedback when an editor opens successfully, on accepted recovery, on workspace invalidation, and when the user closes the relevant editor.

- [ ] **Step 6: Map feedback at the route boundary.** Keep validation issues attached to fields. Render `save-failed` inside the open dialog with save-specific copy; render `open-failed`, `save-uncertain`, and `saved-refresh-failed` in the page alert. Add optional `variant` to `ManagedChannelsFailureState` and have the shared view default to `destructive`; use `warning` only for confirmed save plus stale list.

- [ ] **Step 7: Route locked refreshes through recovery.** When `deleteState.requiresFreshRead` is true, the existing `onRefresh` callback calls `mutation.recoverFreshRead()`; otherwise it retains the list cancel/refresh behavior. Do not add a second refresh button or a new retry subsystem.

- [ ] **Step 8: Add locale copy in all six locales.** Add shape-aligned keys:

```json
{
  "alerts": {
    "editorLoadError": {
      "title": "Unable to open channel editor",
      "description": "The channel form could not be loaded. Refresh the channel list and try again."
    },
    "editorSaveError": {
      "title": "Unable to save channel",
      "description": "Your changes were not saved. Try again."
    },
    "savedRefreshError": {
      "title": "Channel saved, refresh needed",
      "description": "The channel was saved, but the latest list could not be loaded. Refresh the channel list before making more changes."
    }
  }
}
```

- [ ] **Step 9: Run focused and locale validation, then verify GREEN.**

```powershell
pnpm exec vitest run tests/features/ManagedSiteChannels/controllers/useManagedResourceControllers.test.tsx tests/features/ManagedSiteChannels/ManagedSiteChannelsRoute.test.tsx
pnpm run i18n:extract:ci
```

- [ ] **Step 10: Commit the feedback/recovery slice after review.**

```powershell
git add src/features/ManagedSiteChannels/controllers/useManagedResourceMutationController.ts src/features/ManagedSiteChannels/ManagedSiteChannelsRoute.tsx src/features/ManagedSiteChannels/presentation/contracts.ts src/features/ManagedSiteChannels/presentation/ManagedSiteChannelsView.tsx src/locales/en/managedSiteChannels.json src/locales/es-419/managedSiteChannels.json src/locales/ja/managedSiteChannels.json src/locales/vi/managedSiteChannels.json src/locales/zh-CN/managedSiteChannels.json src/locales/zh-TW/managedSiteChannels.json tests/features/ManagedSiteChannels/controllers/useManagedResourceControllers.test.tsx tests/features/ManagedSiteChannels/ManagedSiteChannelsRoute.test.tsx
pnpm run validate:staged
git commit -m "fix(channels): clarify native editor recovery"
```

### Task H: Make Credential Intent and Loading Visible

Implemented as part of the final AxonHub native cutover slice.

**Files:**
- Modify: `src/features/ManagedSiteChannels/ManagedSiteChannelsRoute.tsx`
- Modify: `src/features/ManagedSiteChannels/presentation/ManagedResourceEditorBody.tsx`
- Modify: `src/services/apiAdapters/contracts/managedResourceNative.ts`
- Modify: `src/locales/en/managedSiteChannels.json`
- Modify: `src/locales/es-419/managedSiteChannels.json`
- Modify: `src/locales/ja/managedSiteChannels.json`
- Modify: `src/locales/vi/managedSiteChannels.json`
- Modify: `src/locales/zh-CN/managedSiteChannels.json`
- Modify: `src/locales/zh-TW/managedSiteChannels.json`
- Test: `tests/features/ManagedSiteChannels/presentation/ManagedResourceEditorBody.test.tsx`

- [ ] **Step 1: Write presentation tests for create and edit guidance.** Pass editor mode explicitly. Assert create says `Enter a credential for the new channel.` instead of describing a missing saved secret. Assert an editable saved credential says `Leave this field blank to keep the saved credential unchanged.` and that typing then clearing still emits `{ kind: "unchanged" }`.

- [ ] **Step 2: Write the pending-load test.** Keep `loadSecret` unresolved and assert the field has a visible, screen-reader-announced `Loading the saved credential...` state; resolve it and assert the existing prefill behavior remains unchanged.

- [ ] **Step 3: Run the presentation test and verify RED.**

```powershell
pnpm exec vitest run tests/features/ManagedSiteChannels/presentation/ManagedResourceEditorBody.test.tsx --testNamePattern "credential.*create|keep.*credential|loading.*credential"
```

Expected: FAIL because the body cannot distinguish create/edit and does not track pending secret loads.

- [ ] **Step 4: Pass mode through the existing route/body boundary.** Add `mode: "create" | "edit"` to `ManagedResourceEditorBodyProps` and pass `mutation.editorMode`. Do not add AxonHub/site-type checks to the shared renderer.

- [ ] **Step 5: Implement local loading and description selection.** Set `isSecretLoading` before `onLoadSecret`, clear it for resolve/reject/abort, and render an `aria-live="polite"` loading line. Select description in this priority: multi-key/specific replacement block, create hint, loading, saved-secret state plus keep-existing hint, then generic state/replacement-disabled fallback. Automatic loading must require `descriptor.canReplace` so blocked credentials are never exposed.

- [ ] **Step 6: Correct the secret-loader contract comment.** The existing adapter deliberately preloads an available edit credential. Update the comment to describe optional field-local loading without claiming every load requires an explicit user action; do not change the public secret intent or expose secrets outside the password field.

- [ ] **Step 7: Add locale keys in all six locales.** Add `nativeEditor.secret.createHint`, `nativeEditor.secret.loading`, and `nativeEditor.secret.keepExistingHint` with identical key shape.

- [ ] **Step 8: Run focused and locale validation, then verify GREEN.**

```powershell
pnpm exec vitest run tests/features/ManagedSiteChannels/presentation/ManagedResourceEditorBody.test.tsx
pnpm run i18n:extract:ci
```

- [ ] **Step 9: Commit the credential UX slice after review.**

```powershell
git add src/features/ManagedSiteChannels/ManagedSiteChannelsRoute.tsx src/features/ManagedSiteChannels/presentation/ManagedResourceEditorBody.tsx src/services/apiAdapters/contracts/managedResourceNative.ts src/locales/en/managedSiteChannels.json src/locales/es-419/managedSiteChannels.json src/locales/ja/managedSiteChannels.json src/locales/vi/managedSiteChannels.json src/locales/zh-CN/managedSiteChannels.json src/locales/zh-TW/managedSiteChannels.json tests/features/ManagedSiteChannels/presentation/ManagedResourceEditorBody.test.tsx
pnpm run validate:staged
git commit -m "fix(channels): explain native credential state"
```

### Task I: Gate Invalid Native Forms and Repair the Mobile Migration Footer

Implemented as part of the final AxonHub native cutover slice, including the
final submit-feedback behavior.

**Files:**
- Modify: `src/features/ManagedSiteChannels/ManagedSiteChannelsRoute.tsx`
- Modify: `src/features/ManagedSiteChannels/presentation/ManagedSiteMigrationDialogView.tsx`
- Test: `tests/features/ManagedSiteChannels/ManagedSiteChannelsRoute.test.tsx`
- Test: `tests/features/ManagedSiteChannels/presentation/ManagedSiteMigrationDialogView.test.tsx`
- Validate: `e2e/managedSiteChannelsParity.spec.ts`

- [ ] **Step 1: Write the native form validity-gating test.** Open a native create editor with empty initial values. Assert the shared submit button is disabled, fill the required name/type/key/models inputs, let the existing default-model auto-selection run, and assert the same button becomes enabled. Submit and assert the controller receives the final values. Do not show all field errors before the first submit attempt.

- [ ] **Step 2: Write the responsive footer contract test.** Assert both preview and result footer branches expose a mobile column layout with a full-width/right-aligned action row and retain the `sm` row layout. This is an explicit layout contract, so narrowly scoped class assertions are acceptable here.

- [ ] **Step 3: Run route and migration tests and verify RED.**

```powershell
pnpm exec vitest run tests/features/ManagedSiteChannels/ManagedSiteChannelsRoute.test.tsx tests/features/ManagedSiteChannels/presentation/ManagedSiteMigrationDialogView.test.tsx --testNamePattern "native.*submit|migration.*footer"
```

Expected: FAIL because the route does not pass `isSubmitDisabled`, and both footer branches force one horizontal row.

- [ ] **Step 4: Reuse adapter validation for proactive gating.** Derive `mutation.editor.validate(editorValues)` in the route and pass `isSubmitDisabled={!validation.valid}` plus `CHANNEL_DIALOG_TEST_IDS.submitButton` to `ChannelEditorShell`. Keep controller submit validation as the authoritative defense; do not duplicate required-field rules in React state.

- [ ] **Step 5: Make both footer branches responsive.** Use `flex flex-col items-stretch gap-3 sm:flex-row sm:items-center sm:justify-between` on the footer root and `flex w-full justify-end gap-2 sm:w-auto` on the action group. Preserve button order, disabled/loading semantics, and desktop alignment.

- [ ] **Step 6: Run focused and related tests, then verify GREEN.**

```powershell
pnpm exec vitest run tests/features/ManagedSiteChannels/ManagedSiteChannelsRoute.test.tsx tests/features/ManagedSiteChannels/presentation/ManagedSiteMigrationDialogView.test.tsx
pnpm exec vitest related --run src/features/ManagedSiteChannels/ManagedSiteChannelsRoute.tsx src/features/ManagedSiteChannels/presentation/ManagedSiteMigrationDialogView.tsx
```

- [ ] **Step 7: Run the existing browser path.** Reuse the mobile legacy scenario because it opens the shared 390 px migration dialog, and reuse the AxonHub desktop scenario because it proves the native route uses the same view. Do not add a second E2E state matrix.

```powershell
pnpm exec playwright test e2e/managedSiteChannelsParity.spec.ts --project=chromium --grep "runs the AxonHub native edit and migration preview through the shared UI|keeps common toolbar controls usable" --reporter=line --timeout=60000
```

Expected: both scenarios PASS in Chromium at their configured desktop and mobile viewports.

- [ ] **Step 8: Commit the validation/layout slice after review.**

```powershell
git add src/features/ManagedSiteChannels/ManagedSiteChannelsRoute.tsx src/features/ManagedSiteChannels/presentation/ManagedSiteMigrationDialogView.tsx tests/features/ManagedSiteChannels/ManagedSiteChannelsRoute.test.tsx tests/features/ManagedSiteChannels/presentation/ManagedSiteMigrationDialogView.test.tsx
pnpm run validate:staged
git commit -m "fix(channels): tighten native form feedback"
```

### Task J: Integrated Review and Branch Validation

Completed across the Task F-I commits and their final integrated validation.

**Files:**
- Review: all files changed by Tasks F-I

- [ ] **Step 1: Run the complete focused regression set.**

```powershell
pnpm exec vitest run tests/services/apiAdapters/managedResources/axonHub.test.ts tests/features/ManagedSiteChannels/controllers/useManagedResourceControllers.test.tsx tests/features/ManagedSiteChannels/ManagedSiteChannelsRoute.test.tsx tests/features/ManagedSiteChannels/presentation/ManagedResourceEditorBody.test.tsx tests/features/ManagedSiteChannels/presentation/ManagedSiteMigrationDialogView.test.tsx
pnpm run i18n:extract:ci
```

Expected: 5 test files pass; locale extraction leaves the worktree unchanged.

- [ ] **Step 2: Run maintainability review.** Confirm there is one credential candidate normalizer, one controller feedback union, no AxonHub conditional in shared presentation, no duplicated validation rules, no new model-fetch path, and no URL/credential/model values in analytics.

- [ ] **Step 3: Run commit and push-equivalent gates.** Stage only remaining task-scoped files before `validate:staged`; then run the broader gate because the change touches shared contracts, exports, controller state, locale extraction, and adapter runtime behavior.

```powershell
pnpm run validate:staged
pnpm run validate:push
git diff --check origin/main...HEAD
git status --short
```

Expected: all commands exit 0 and the status is clean.

- [ ] **Step 4: Perform final spec and code-quality review.** Verify every approved A-route outcome against the current diff and commit range, resolve all material findings, and re-run affected focused tests after any fix.

### Release decisions

- **Telemetry:** Reuse existing create/update action analytics. Do not add an event for a safety restriction, copy clarification, disabled invalid submit, or responsive layout change.
- **Settings search/deep links:** None; no setting is added, renamed, moved, or removed.
- **E2E:** Reuse the existing AxonHub native desktop flow and 390 px shared migration flow. Add no new browser scenario. Pixel baselines were useful during cutover development but are not retained as a release contract; Playwright failure artifacts remain diagnostic-only.
- **Explicitly deferred:** Full multi-key editing, default Base URL presets, remote model fetching, model verification, and broader ChannelEditorShell redesign.

# AxonHub Resource-Native UI Cutover Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox notation (`- [ ]`) for tracking.

**Goal:** Add the shared resource-native managed-site UI, preserve the current AxonHub user workflow and analytics, and switch only AxonHub from the legacy channel page to its native Workspace.

**Architecture:** The options entry point renders a small dispatcher using the static Managed Site Definition. Legacy definitions continue to render `ManagedSiteChannels`; a native definition must resolve a matching registration or render an integration failure without fallback. A feature-local page composes one list controller and one mutation controller, while the Workspace remains the only feature-facing data interface. Primitive field components render only the approved descriptor kinds. Native migration consumes the canonical capability API from the preceding plan and never creates `ManagedSiteChannel` or `ChannelFormData` values.

**Tech Stack:** TypeScript, React, WXT, the existing options hash/search route parameters, shadcn/Radix UI primitives already in the repository, i18next, Vitest, Testing Library, Playwright, product analytics.

## Required inputs and execution order

Implement this plan only after both preceding plans are merged or present in
the working tree:

1. `docs/superpowers/plans/2026-07-16-managed-site-resource-native-substrate.md`
2. `docs/superpowers/plans/2026-07-16-axonhub-canonical-migration-capability.md`

The approved design is
`docs/superpowers/specs/2026-07-16-managed-site-resource-native-extension-design.md`.
The pinned AxonHub contract and source links in that design remain authoritative.
Do not replace them with behavior inferred from the current default branch.

Before editing, run:

```powershell
git status --short
git log -3 --oneline
```

Expected: understand and preserve all pre-existing index and worktree state.
Confirm that the native registry and canonical migration entry points compile.

## Scope controls

- Do not edit the large legacy
  `src/features/ManagedSiteChannels/ManagedSiteChannels.tsx` or
  `src/components/dialogs/ChannelDialog/**`.
- Do not add a global resource provider, a general state-machine dependency, a
  form generator, raw JSON fields, or a third controller hook that merely
  combines the two feature hooks.
- Do not convert a native `ManagedResourceRef` into a numeric id or a legacy
  channel row. Selection identity is the serialized ref identity, not display
  text or row position.
- Do not display Adapter detail, raw backend messages, endpoints, resource ids,
  scope keys, secrets, or mutation-certainty internals.
- Do not replay an uncertain mutation. Close its editor, clear unsafe
  selection, and require a fresh list/detail read.
- Keep the existing static definition mode as the rollback switch. Missing
  native registration is an integration error, never permission to fall back.
- Keep existing user-facing “channel” terminology where it is already the
  product language. The new locale namespace is for new native-only states and
  field labels, not a broad copy rewrite.

## File structure

Create:

- `src/features/ManagedSiteResources/ManagedResourceDispatcher.tsx`
- `src/features/ManagedSiteResources/ManagedSiteResourcePage.tsx`
- `src/features/ManagedSiteResources/hooks/useManagedResourceListController.ts`
- `src/features/ManagedSiteResources/hooks/useManagedResourceMutationController.ts`
- `src/features/ManagedSiteResources/components/ManagedResourceTable.tsx`
- `src/features/ManagedSiteResources/components/ManagedResourceDetailDialog.tsx`
- `src/features/ManagedSiteResources/components/ManagedResourceEditorDialog.tsx`
- `src/features/ManagedSiteResources/components/ManagedResourceField.tsx`
- `src/features/ManagedSiteResources/components/ManagedResourceMigrationDialog.tsx`
- `src/features/ManagedSiteResources/copy.ts`
- `src/features/ManagedSiteResources/testIds.ts`
- `src/locales/{zh-CN,zh-TW,en,ja,es-419,vi}/managedSiteResources.json`
- `tests/test-utils/managedResourceWorkspace.ts`
- `tests/features/ManagedSiteResources/ManagedResourceDispatcher.test.tsx`
- `tests/features/ManagedSiteResources/useManagedResourceControllers.test.tsx`
- `tests/features/ManagedSiteResources/ManagedResourceEditorDialog.test.tsx`
- `tests/features/ManagedSiteResources/ManagedSiteResourcePage.test.tsx`
- `tests/features/ManagedSiteResources/ManagedResourceMigrationDialog.test.tsx`
- `tests/components/ManagedSiteConfigRequiredState.test.tsx`
- `e2e/managedSiteAxonHubNative.spec.ts`

Modify:

- `src/entrypoints/options/pages/ManagedSiteChannels/index.tsx`
- `src/components/ManagedSiteConfigRequiredState.tsx`
- `src/services/accountSiteDefinitions/definitions.ts`
- `tests/services/accountSiteDefinitions/registry.test.ts`
- `e2e/scenarios/managedSiteChannels.ts`

If implementation needs to change the public Workspace contract or canonical
migration model, stop and amend the preceding plan and its contract tests first.
Do not work around contract gaps in React.

### Task 1: Add explicit dispatch and definition-owned settings recovery

**Files:**

- Create: `src/features/ManagedSiteResources/ManagedResourceDispatcher.tsx`
- Modify: `src/entrypoints/options/pages/ManagedSiteChannels/index.tsx`
- Modify: `src/components/ManagedSiteConfigRequiredState.tsx`
- Test: `tests/features/ManagedSiteResources/ManagedResourceDispatcher.test.tsx`
- Test: `tests/components/ManagedSiteConfigRequiredState.test.tsx`

- [ ] **Step 1: Write the failing dispatcher tests**

Mock the user-preferences context, definition registry, native registration
registry, the legacy page, and a native-page test double. Add these behavior
tests:

- `renders the legacy page for a legacy-channel definition`
- `renders the native page for a native-resource definition`
- `reports a native integration error when registration is missing`
- `never falls back to the legacy page when native registration is missing`
- `re-dispatches when the selected managed site type changes`
- `forwards refreshKey and routeParams to the selected page`

The missing-registration assertion must target controlled local copy and a
retry/reload action; it must not expose a thrown error message.

- [ ] **Step 2: Write the failing settings-target test**

Add tests for `ManagedSiteConfigRequiredState`:

- `opens managed-site settings with the default target when no target is supplied`
- `opens the definition-owned settings anchor when supplied`

Extend its props with an optional target using the same settings target type
introduced by PR 1. The AxonHub assertion is:

```ts
expect(openSettingsTab).toHaveBeenCalledWith("managedSite", {
  anchor: "axonhub",
  preserveHistory: true,
})
```

- [ ] **Step 3: Run both tests and verify they fail**

```powershell
pnpm exec vitest run tests/features/ManagedSiteResources/ManagedResourceDispatcher.test.tsx tests/components/ManagedSiteConfigRequiredState.test.tsx
```

Expected: FAIL because the dispatcher does not exist and the configuration
state cannot receive a settings target.

- [ ] **Step 4: Implement the small dispatcher**

`ManagedResourceDispatcher` accepts the same page props as the legacy page:

```ts
export interface ManagedResourcePageRouteProps {
  refreshKey?: number
  routeParams?: Record<string, string>
}
```

It reads `managedSiteType` from `useUserPreferencesContext()`, resolves the
Managed Site Definition, and switches only on the definition's explicit mode:

```tsx
if (policy.mode === MANAGED_RESOURCE_MODES.LegacyChannel) {
  return <ManagedSiteChannels {...props} />
}

const registration = getManagedResourceRegistration(
  managedSiteType,
  policy.primaryKind,
)
if (!registration) return <NativeRegistrationIntegrationError />

return (
  <ManagedSiteResourcePage
    key={`${managedSiteType}:${policy.primaryKind}`}
    definition={definition}
    registration={registration}
    {...props}
  />
)
```

The integration-error component is local to the dispatcher. It may reload the
page, but it must not invoke the legacy UI. Update the options entry point to
export the dispatcher. Update `ManagedSiteConfigRequiredState` to use its
supplied target while preserving the current default.

- [ ] **Step 5: Run the focused tests**

```powershell
pnpm exec vitest run tests/features/ManagedSiteResources/ManagedResourceDispatcher.test.tsx tests/components/ManagedSiteConfigRequiredState.test.tsx
```

Expected: PASS.

- [ ] **Step 6: Commit the dispatch seam**

```powershell
git add src/features/ManagedSiteResources/ManagedResourceDispatcher.tsx src/entrypoints/options/pages/ManagedSiteChannels/index.tsx src/components/ManagedSiteConfigRequiredState.tsx tests/features/ManagedSiteResources/ManagedResourceDispatcher.test.tsx tests/components/ManagedSiteConfigRequiredState.test.tsx
pnpm run validate:staged
git commit -m "feat(managed-sites): dispatch native resource workspaces"
```

### Task 2: Implement list and mutation controllers

**Files:**

- Create: `src/features/ManagedSiteResources/hooks/useManagedResourceListController.ts`
- Create: `src/features/ManagedSiteResources/hooks/useManagedResourceMutationController.ts`
- Create: `tests/test-utils/managedResourceWorkspace.ts`
- Test: `tests/features/ManagedSiteResources/useManagedResourceControllers.test.tsx`

- [ ] **Step 1: Create a typed Workspace test builder**

The builder returns a complete `ManagedResourceWorkspace` with overridable
methods and uses reserved example data. Use an opaque id such as
`channel_example_opaque`, `https://upstream.example.invalid`, and fake model
names. Do not add Axon native DTOs to the helper.

- [ ] **Step 2: Write failing list-controller tests**

Use `renderHook` and deferred promises. Add these tests:

- `opens a workspace and loads its first page`
- `aborts the previous open and ignores a late site result`
- `reloads and supersedes the active request when refreshKey changes`
- `treats route channelId or search as a new first-page resource-wide query`
- `supersedes an in-flight search without showing an aborted error`
- `does not render a search state when supportsSearch is false`
- `appends a cursor page without assuming a total`
- `updates the managedSiteChannels URL and clears channelId when search changes`
- `does not navigate when normalized route search is unchanged`
- `keeps the current rows when a manual refresh fails`
- `maps safe failure codes without reading raw error messages`
- `retries workspace opening after configuration changes`
- `clears row selection when site scope changes`

The list state should distinguish initial loading, refreshing, empty, and safe
failure. Do not expose a generic `unknown` error to the page.

- [ ] **Step 3: Write failing mutation-controller tests**

Add these tests:

- `loads detail and ignores a late result after the selected ref changes`
- `opens create and edit sessions through the Workspace`
- `coalesces duplicate UI submit attempts while saving`
- `upserts returned display facts after confirmed create or update`
- `retains entered values after validation or confirmed pre-dispatch failure`
- `closes the editor and requires refresh after mutation_state_uncertain`
- `never automatically replays an uncertain mutation`
- `refreshes after not_found closes a stale edit session`
- `treats an already-missing delete as a successful desired state`
- `returns per-ref successes and failures for bulk delete`

Use serialized ref identity for sets and maps. Do not use `displayName`, array
index, or numeric conversion as identity.

- [ ] **Step 4: Run the controller test and verify it fails**

```powershell
pnpm exec vitest run tests/features/ManagedSiteResources/useManagedResourceControllers.test.tsx
```

Expected: FAIL because both hooks are missing.

- [ ] **Step 5: Implement the list controller**

Own only Workspace opening, query/cursor, rows, selection, abort generations,
and load/retry/refresh state. Preserve current route precedence by normalizing
`routeParams.channelId?.trim() ?? routeParams.search?.trim()` exactly once when
either parameter changes. Treat that term as Workspace resource-wide search,
which the Axon Adapter matches against opaque id and safe display facts. A user
search updates the existing options hash with `navigateWithinOptionsPage`,
sets only `search`, and thereby clears `channelId`. If search is unsupported,
omit the control and query rather than locally filtering a loaded page.

Abort every prior open/list request when site type, resource kind, search,
`refreshKey`, or cursor changes. Use a monotonically increasing generation to
ignore late results even when an Adapter does not observe abort promptly. A
refresh error keeps the previous rows and exposes a safe retry state. Cursor UX
is one-way “load more”: append unique rows and retain only `nextCursor`; do not
build a previous-page cursor stack or page-number abstraction.

- [ ] **Step 6: Implement the mutation controller**

Own detail/editor/delete dialog state and one UI-level submit guard. Delegate
validation and correctness to the Resource Editor. On confirmed success call a
controller callback to upsert returned facts. On `mutation_state_uncertain` or
`not_found`, close the editor, clear its ref, and request a list refresh. Never
automatically invoke `submit` or `delete` again.

Bulk delete may run requests independently, but its product result contains
only safe per-ref success/failure codes. It must not add a generic batch method
to the Workspace.

- [ ] **Step 7: Run the controller tests**

```powershell
pnpm exec vitest run tests/features/ManagedSiteResources/useManagedResourceControllers.test.tsx
```

Expected: PASS, including abort, late-result, uncertain-mutation, and partial
bulk-delete cases.

- [ ] **Step 8: Commit the controllers**

```powershell
git add src/features/ManagedSiteResources/hooks/useManagedResourceListController.ts src/features/ManagedSiteResources/hooks/useManagedResourceMutationController.ts tests/test-utils/managedResourceWorkspace.ts tests/features/ManagedSiteResources/useManagedResourceControllers.test.tsx
pnpm run validate:staged
git commit -m "feat(managed-sites): control native resource workflows"
```

### Task 3: Render the approved primitive editor safely

**Files:**

- Create: `src/features/ManagedSiteResources/components/ManagedResourceField.tsx`
- Create: `src/features/ManagedSiteResources/components/ManagedResourceEditorDialog.tsx`
- Create: `src/features/ManagedSiteResources/copy.ts`
- Create: `src/features/ManagedSiteResources/testIds.ts`
- Create: `src/locales/{zh-CN,zh-TW,en,ja,es-419,vi}/managedSiteResources.json`
- Test: `tests/features/ManagedSiteResources/ManagedResourceEditorDialog.test.tsx`

- [ ] **Step 1: Define stable native test ids**

Use constant ids for workflow-critical controls and ref-derived ids for rows:

```ts
export const MANAGED_SITE_RESOURCE_TEST_IDS = {
  addButton: "managed-site-resource-add-button",
  refreshButton: "managed-site-resource-refresh-button",
  searchInput: "managed-site-resource-search-input",
  editorDialog: "managed-site-resource-editor-dialog",
  editorSubmit: "managed-site-resource-editor-submit",
  deleteConfirm: "managed-site-resource-delete-confirm",
  row: "managed-site-resource-row",
  rowActions: "managed-site-resource-row-actions",
} as const
```

Rows share the fixed `row` id and expose an accessible row name; actions inside
the row use the fixed `rowActions` id. Tests locate the row by accessible name
and then scope fixed action ids within it. Do not put a serialized ref,
resource id, scope key, display name, or secret into a DOM attribute.

- [ ] **Step 2: Write the failing editor tests**

Create one descriptor for every approved kind and add these tests:

- `renders text textarea number boolean select multi-select and secret fields`
- `initializes only the safe editable projection`
- `renders field issues and focuses the first invalid field`
- `represents secrets with unchanged replace and allowed clear intents`
- `does not render an input value for masked or unavailable secrets`
- `does not offer clear when the descriptor forbids it`
- `does not infer replacement from a masked placeholder`
- `disables dismissal and repeated submission while saving`
- `keeps values after a reusable validation failure`
- `closes after a confirmed success or terminal recovery result`

Assert labels and roles rather than wrapper structure or Tailwind classes.

- [ ] **Step 3: Run the editor test and verify it fails**

```powershell
pnpm exec vitest run tests/features/ManagedSiteResources/ManagedResourceEditorDialog.test.tsx
```

Expected: FAIL because the renderer and dialog do not exist.

- [ ] **Step 4: Implement the field renderer**

Switch exhaustively on the seven descriptor kinds. Reuse repository UI
primitives and existing accessible dialog/select/checkbox patterns. The
renderer receives a descriptor, current value, field issue, and `onChange`; it
does not receive a Workspace, native detail, or site type.

For secret fields, render an explicit replace control and a separate clear
choice only when allowed. Never write masked text into form state. Reject an
unknown descriptor kind with a development integration error; do not render a
raw JSON fallback.

- [ ] **Step 5: Implement the editor dialog**

React owns a copy of `editor.initialValues`. Call `editor.validate` before
submit, focus the first returned issue, and then call the controller's guarded
submit. Keep the dialog controlled by the page and block accidental dismissal
while saving. `copy.ts` maps controlled failure code plus operation to locale
keys and maps each approved field id to a literal localized label call. It never
accepts a backend message. An unrecognized field id is a controlled integration
error, not a raw-id label fallback.

- [ ] **Step 6: Add the complete localized namespace with the editor**

Create all six locale files with identical key shape. Include actions, states,
all controlled failure and field-issue codes, editor/detail/table/secret copy,
and labels for the exact 14 Axon fields. Chinese is the source wording; add
natural `zh-TW`, `en`, `ja`, `es-419`, and `vi` translations now. Keep existing
channel and migration terminology. Add no keys for deferred fields. Every key
must have a real literal `t("managedSiteResources:...")` call in `copy.ts`;
do not change extractor configuration or use `defaultValue`.

The required families are:

- actions: retry, refresh, add, view, edit, delete, delete selected, replace
  secret, clear secret, load more, and open settings;
- states: initial loading, refreshing, empty, filtered empty, integration
  error, partial delete, and uncertain mutation;
- failures: all eleven `ResourceFailure.code` values with actionable recovery;
- validation: every controlled `ResourceFieldIssue.code`;
- editor, detail, table, pagination, and secret-state labels;
- fields: name, type, base URL, status, key, supported models, manual models,
  default test model, automatic supported-model sync, automatic model pattern,
  tags, ordering weight, remark, and extra model prefix.

Do not add keys for endpoints, policies, settings JSON, revision conflicts, or
other deferred fields.

- [ ] **Step 7: Run locale extraction and editor tests**

```powershell
pnpm run i18n:extract:ci
pnpm exec vitest run tests/features/ManagedSiteResources/ManagedResourceEditorDialog.test.tsx
```

Expected: PASS with no locale rewrite and all editor behavior green.

- [ ] **Step 8: Commit the primitive editor and its copy atomically**

```powershell
git add src/features/ManagedSiteResources/components/ManagedResourceField.tsx src/features/ManagedSiteResources/components/ManagedResourceEditorDialog.tsx src/features/ManagedSiteResources/copy.ts src/features/ManagedSiteResources/testIds.ts src/locales/zh-CN/managedSiteResources.json src/locales/zh-TW/managedSiteResources.json src/locales/en/managedSiteResources.json src/locales/ja/managedSiteResources.json src/locales/es-419/managedSiteResources.json src/locales/vi/managedSiteResources.json tests/features/ManagedSiteResources/ManagedResourceEditorDialog.test.tsx
pnpm run validate:staged
git commit -m "feat(managed-sites): render localized native resource editors"
```

### Task 4: Build the list, detail, and canonical migration experience

**Files:**

- Create: `src/features/ManagedSiteResources/components/ManagedResourceTable.tsx`
- Create: `src/features/ManagedSiteResources/components/ManagedResourceDetailDialog.tsx`
- Create: `src/features/ManagedSiteResources/components/ManagedResourceMigrationDialog.tsx`
- Create: `src/features/ManagedSiteResources/ManagedSiteResourcePage.tsx`
- Test: `tests/features/ManagedSiteResources/ManagedSiteResourcePage.test.tsx`
- Test: `tests/features/ManagedSiteResources/ManagedResourceMigrationDialog.test.tsx`

- [ ] **Step 1: Write failing page tests**

Add behavior tests for:

- `shows the definition-owned configuration CTA and retries after setup`
- `shows controlled authentication and permission recovery without raw detail`
- `shows initial loading empty filtered-empty and refresh-failure states`
- `renders search only when the Workspace supports resource-wide search`
- `applies route search and resets the cursor`
- `renders rows and loads safe detail facts on demand`
- `renders all fourteen definition-selected safe Axon detail facts`
- `opens create and edit editors from explicit actions`
- `does not open an empty editor when session opening fails`
- `confirms single and selected deletion before dispatch`
- `loads every remaining search cursor before opening filtered migration`
- `keeps successful rows and reports failed rows after bulk delete`
- `refreshes instead of replaying after an uncertain mutation`
- `does not expose resource ids scope keys credentials or native detail`
- `records only controlled analytics dimensions`
- `maps every ResourceFailure code to controlled copy without Error messages`
- `treats aborted and superseded operations as silent cancellation`
- `retains editor values for upstream_rejected but closes uncertain and not-found sessions`

The page test should inspect analytics payloads and prove that names, URLs,
models, tags, ids, refs, field values, and error messages are absent.
Cover `configuration_required`, `invalid_configuration`,
`authentication_failed`, `permission_denied`, `validation_failed`, `not_found`,
`mutation_state_uncertain`, `unavailable`, `upstream_rejected`, `aborted`, and
`unexpected` in a table-driven copy/recovery test.

- [ ] **Step 2: Write failing canonical migration dialog tests**

Mock only the canonical PR 2 entry points. Add:

- `prepares preview from selected ManagedResourceRef values`
- `preserves string selection identity and row ordering`
- `renders existing warning and blocked-reason copy`
- `blocks unavailable or compatibility-masked source credentials`
- `renders created failed and skipped per-item results`
- `keeps created rows when a later row fails and does not roll back`
- `refreshes the source list after execution`
- `cancels a late preview when the target changes`
- `retries a failed preview without retaining stale rows`
- `prevents closing while execution is running`
- `resets preview and result when closed and reopened`
- `renders uncertain results as refresh-required and never re-executes them`
- `records the existing migration analytics action without resource data`
- `never constructs ManagedSiteChannel or ChannelFormData`
- `never receives or stores a credential or execution command in preview state`

- [ ] **Step 3: Run the page and migration tests and verify they fail**

```powershell
pnpm exec vitest run tests/features/ManagedSiteResources/ManagedSiteResourcePage.test.tsx tests/features/ManagedSiteResources/ManagedResourceMigrationDialog.test.tsx
```

Expected: FAIL because the page components do not exist.

- [ ] **Step 4: Implement the table and detail dialog**

Render only `ResourceDisplayFacts` selected by the definition policy. Reuse the
current managed-site toolbar/table visual language and row-action menu. The
table receives callbacks and state; it does not call the Workspace. Detail
renders safe facts only and uses the same safe failure mapping as the page.
Render create, delete-selected, and migration controls only when their
definition-owned product action is present; row update/delete remain controlled
by each fact's safe action flags.

Use explicit loading, empty, filtered-empty, error, partial-delete, and
refreshing states. Optional `total` and cursors must remain optional in copy and
pagination controls.

- [ ] **Step 5: Implement the native migration dialog**

Pass `ManagedSiteMigrationSelection[]` containing `selectionId`, `displayName`,
and public `ref` to:

```ts
prepareManagedSiteMigrationPreview({
  sourceSiteType,
  targetSiteType,
  selections,
})

executeManagedSiteMigration({ preview })
```

Reuse existing `managedSiteChannels:migration.*` copy and the existing target
option helper. Do not duplicate migration projections or warning rules in UI.
Preserve the current no-rollback explanation and concurrency behavior from PR
2. For “filtered” migration, the list controller drains the current
resource-wide search through every remaining cursor with abort and repeated-
cursor protection before building selections; it must not silently migrate
only the visible page. The dialog refreshes after execution even when some rows
fail.

- [ ] **Step 6: Implement the page by composing the two controllers**

The page owns only view composition, dialogs, selected target, and analytics
contexts. It uses the list controller for Workspace/list/search/selection and
the mutation controller for detail/editor/delete. It does not introduce a
third hook that re-exports their state.

Reuse these existing analytics identifiers rather than adding new events:

- feature: `PRODUCT_ANALYTICS_FEATURE_IDS.ManagedSiteChannels`
- entry point: the existing Options entry id
- surfaces:
  `OptionsManagedSiteChannelsToolbar` and
  `OptionsManagedSiteChannelsRowActions`
- actions: create, view, update, delete, delete selected, refresh, toggle
  migration, open single/selected/filtered migration, and migrate managed-site
  channels.

Completion payloads may include controlled site type, result, item count, and
failure category only. They must omit all resource data and user-entered data.
The button/row-action analytics integration emits the single start event. The
page creates and passes the action context; the controller's terminal outcome
callback completes it exactly once. Do not start or complete again inside both
page and controller. Allow only `managedSiteType`, `itemCount`, `selectedCount`,
`successCount`, `failureCount`, `errorCategory`, and `failureReason` controlled
dimensions. Map uncertain mutation to the existing controlled failed/partial
result category without resource data.

- [ ] **Step 7: Run related UI tests**

```powershell
pnpm exec vitest run tests/features/ManagedSiteResources/ManagedSiteResourcePage.test.tsx tests/features/ManagedSiteResources/ManagedResourceMigrationDialog.test.tsx tests/features/ManagedSiteResources/useManagedResourceControllers.test.tsx tests/features/ManagedSiteResources/ManagedResourceEditorDialog.test.tsx
```

Expected: PASS.

- [ ] **Step 8: Commit the complete native page**

```powershell
git add src/features/ManagedSiteResources/ManagedSiteResourcePage.tsx src/features/ManagedSiteResources/components/ManagedResourceTable.tsx src/features/ManagedSiteResources/components/ManagedResourceDetailDialog.tsx src/features/ManagedSiteResources/components/ManagedResourceMigrationDialog.tsx tests/features/ManagedSiteResources/ManagedSiteResourcePage.test.tsx tests/features/ManagedSiteResources/ManagedResourceMigrationDialog.test.tsx
pnpm run validate:staged
git commit -m "feat(managed-sites): add native resource management page"
```

### Task 5: Write the AxonHub browser proof without enabling it

**Files:**

- Create: `e2e/managedSiteAxonHubNative.spec.ts`
- Modify: `e2e/scenarios/managedSiteChannels.ts`

- [ ] **Step 1: Add native helpers without changing other site scenarios**

Import the native test ids into `e2e/scenarios/managedSiteChannels.ts`. Route
only `SITE_TYPES.AXON_HUB` through native row/editor helpers. The other five
managed site types must continue using existing legacy test ids and
`ChannelDialog` helpers.

Do not modify the environment-backed multi-site scenarios to require live
AxonHub credentials.

- [ ] **Step 2: Write the targeted intercepted Chromium test**

Test name:

```ts
test("routes AxonHub channel management through the native editor and refreshes the edited row", async ({ context, page, extensionId }) => {
  // ...
})
```

Import `test` from `~~/e2e/fixtures/extensionTest`. In `beforeEach`, call
`installExtensionPageGuards(page)`, `forceExtensionLanguage(page, "en")`, and
`stubLlmMetadataIndex(context)`. Obtain the service worker with
`getServiceWorker(context)` and seed preferences through the existing
`seedUserPreferences` helper.

Seed valid AxonHub preferences with reserved example values. Use
`context.route` so requests made by the extension service worker are also
intercepted; handle sign-in and GraphQL operations. Return an opaque string id
and cursor page without requiring a total. Open the options channel-management
route with a `search` parameter, assert the native search and row selectors,
edit only the channel name, and submit.

Assert the intercepted `UpdateChannel` variables contain the required id and
changed `name`, and omit credentials and every unchanged editable field. Return
the updated row, wait for the subsequent list refresh, and assert the edited
name is visible.

Do not flip the definition, run this E2E, or commit these two files yet. They
remain part of the final cutover commit in Task 6, so the definition test can
still prove a red state first.

### Task 6: Switch AxonHub and run release gates

**Files:**

- Modify: `src/services/accountSiteDefinitions/definitions.ts`
- Modify: `tests/services/accountSiteDefinitions/registry.test.ts`
- Create: `e2e/managedSiteAxonHubNative.spec.ts`
- Modify: `e2e/scenarios/managedSiteChannels.ts`

- [ ] **Step 1: Write the failing definition assertion**

Update the registry test to assert:

- AxonHub declares `native-resource` and its exact primary kind;
- AxonHub has a matching production registration;
- all five other Managed Site Types still declare `legacy-channel`;
- every native definition has a matching registration;
- mode is explicit and is never inferred from registration presence.

- [ ] **Step 2: Run the registry test and verify it fails**

```powershell
pnpm exec vitest run tests/services/accountSiteDefinitions/registry.test.ts
```

Expected: FAIL because AxonHub still uses legacy mode.

- [ ] **Step 3: Flip only the AxonHub static definition**

Change AxonHub to `native-resource` with the registered channel kind. Do not
delete the legacy AxonHub Adapter/provider/UI path in this plan. The one-line
definition change is the rollback switch; reverting it restores the legacy
page without a runtime flag.

- [ ] **Step 4: Run all focused tests**

```powershell
pnpm exec vitest run tests/services/accountSiteDefinitions/registry.test.ts tests/features/ManagedSiteResources tests/components/ManagedSiteConfigRequiredState.test.tsx tests/services/apiAdapters/managedResources tests/services/managedSites/channelMigrationCapabilityRegistry.test.ts tests/services/managedSites/channelMigration.test.ts
```

Expected: PASS.

- [ ] **Step 5: Run locale, targeted E2E, and repository gates**

```powershell
pnpm run i18n:extract:ci
pnpm exec playwright test e2e/managedSiteAxonHubNative.spec.ts --project=chromium
pnpm run validate:push
```

Expected: all PASS. `validate:push` must include successful compile and knip
checks. Classify any failure before changing code; do not weaken a gate.

- [ ] **Step 6: Inspect maintainability and privacy**

Inspect the task diff and verify:

- the page composes two substantive hooks and no shallow aggregation layer;
- Workspace calls exist only in controllers, not table/field components;
- no resource value reaches analytics, logs, or safe failure copy;
- no legacy channel conversion exists in the native feature;
- there is one field-kind switch and one failure-code-to-copy mapping;
- route search is not duplicated as client-side current-page filtering;
- uncertain mutations have no retry/replay branch;
- no unsupported AxonHub field was added;
- non-AxonHub modes and E2E paths remain unchanged.

Run the static native/legacy boundary check:

```powershell
rg -n "ManagedSiteChannel|ChannelFormData|prepareManagedSiteChannelMigrationPreview|executeManagedSiteChannelMigration|channelMigrationLegacyFacade" src/features/ManagedSiteResources
```

Expected: no matches. The feature may import only canonical migration types and
the canonical preview/execute entry points.

Inspect the entire PR3 range, not only the last uncommitted slice:

```powershell
$baseSha = git log -1 --format=%H --grep="^refactor(axonhub): route migration through native capabilities$"
git diff --check $baseSha
git diff --stat $baseSha
git diff --name-status $baseSha
```

Expected: `$baseSha` is non-empty and the diff contains only files named by
this plan.

If cleanup would exceed this touched surface, record it as follow-up rather
than expanding the cutover.

- [ ] **Step 7: Stage only task files and run the commit gate**

```powershell
git status --short
git diff --check
git add src/features/ManagedSiteResources src/entrypoints/options/pages/ManagedSiteChannels/index.tsx src/components/ManagedSiteConfigRequiredState.tsx src/services/accountSiteDefinitions/definitions.ts src/locales/zh-CN/managedSiteResources.json src/locales/zh-TW/managedSiteResources.json src/locales/en/managedSiteResources.json src/locales/ja/managedSiteResources.json src/locales/es-419/managedSiteResources.json src/locales/vi/managedSiteResources.json tests/features/ManagedSiteResources tests/test-utils/managedResourceWorkspace.ts tests/components/ManagedSiteConfigRequiredState.test.tsx tests/services/accountSiteDefinitions/registry.test.ts e2e/managedSiteAxonHubNative.spec.ts e2e/scenarios/managedSiteChannels.ts
pnpm run validate:staged
```

Expected: PASS. Inspect `git diff --cached --stat` and
`git diff --cached --check`; unrelated files must not be staged.

- [ ] **Step 8: Commit the static cutover**

```powershell
git commit -m "feat(axonhub): switch channels to native workspace"
```

- [ ] **Step 9: Verify the committed state**

```powershell
git status --short
git log -1 --oneline
$baseSha = git log -1 --format=%H --grep="^refactor(axonhub): route migration through native capabilities$"
git diff --check "$baseSha..HEAD"
git diff --stat "$baseSha..HEAD"
```

Expected: the task-scoped work is committed and unrelated user state, if any,
is untouched.

## Release decisions

- **Telemetry:** reuse existing Managed Site Channels action events and
  controlled result categories. Add no passive impression or settings
  snapshot. Tests prove resource and field values are excluded.
- **Settings search/deep links:** add no search entry because no setting moves.
  Preserve the definition-owned AxonHub `managedSite` anchor and test the CTA.
- **E2E:** retain one intercepted Chromium workflow because the primary cutover
  risk is route dispatch plus real dialog/browser integration. Keep state
  matrices in Vitest.
- **Maintainability:** reuse existing UI primitives, target selection, locale
  copy, navigation, analytics ids, Workspace, and canonical migration API.
  Extract only the two deep controllers, primitive field switch, and controlled
  copy mapping. Leave legacy page deletion and migration of the other five site
  types out of scope.
- **Rollback:** revert only AxonHub's static `resourceMode` definition. Do not
  add a runtime fallback, remote flag, or catch-and-fallback branch.

## Completion criteria

- AxonHub renders the resource-native page; the other five site types render
  the unchanged legacy page.
- The first 14 fields can be displayed and the Adapter-selected editable subset
  can be edited without exposing or replacing hidden values.
- Configuration, authentication, permission, empty, loading, refresh failure,
  deletion partial failure, not-found, and uncertain mutation states have safe
  actionable UI.
- Resource-wide search is either delegated to the Workspace or absent.
- Native migration uses canonical selections/results and preserves existing
  warnings, partial outcomes, no rollback, refresh, copy, and analytics.
- No native code constructs `ManagedSiteChannel` or `ChannelFormData`.
- Focused tests, i18n extraction, targeted Chromium E2E,
  `validate:staged`, and `validate:push` pass before remote handoff.

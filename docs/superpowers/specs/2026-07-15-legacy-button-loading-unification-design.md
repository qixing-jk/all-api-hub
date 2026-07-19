# Legacy Button Loading-State Unification Design

**Date:** 2026-07-15

## Context

The first loading-state consistency pass standardized all 72 structural
`<Button loading={...}>` call sites. Text buttons now combine the shared visual
spinner with action-specific pending copy, and shared button primitives expose
consistent disabled and `aria-busy` behavior.

Historical controls remain outside that first pass. Some async actions only set
`disabled`, some render their own spinner, and others use menu items, toast
actions, icon buttons, or native buttons. These controls cannot be migrated by
treating every disabled state as loading because disabled also represents
validation, permissions, missing selections, unsupported capabilities, and
navigation boundaries.

The current structural audit found:

| Surface | Total | Existing `loading` | `disabled` without `loading` | Async-name candidates | Manual spinners |
| --- | ---: | ---: | ---: | ---: | ---: |
| Shared `Button` | 359 | 72 | 149 | 91 | 6 |
| Shared `IconButton` | 101 | 0 | 19 | 7 | 2 |
| Native `<button>` | 55 | 0 | 10 | 5 | 1 business case |

The 91 shared-button candidates and 6 manual-spinners overlap on 5 paths, for
92 unique audited paths. The candidate counts are an audit upper bound, not a
migration target. Many buttons are only locked while another action runs.

## Goals

- Give every confirmed async action consistent, action-specific progress
  feedback.
- Reuse the existing shared `Button` and `IconButton` loading contracts where
  their disabling behavior is correct.
- Ensure only the initiating control, or an explicitly defined stable status
  continuation after a transient initiator closes, appears busy.
- Remove duplicated spinner, disabled, and accessibility wiring from direct
  button consumers.
- Preserve validation, permission, capability, empty-selection, pagination,
  and other static disabled semantics.
- Preserve interruptible actions that must remain clickable while work is in
  progress.

## Non-goals

- Inferring loading from `disabled` inside shared components.
- Changing request execution, business side effects, backend behavior,
  concurrency rules, or workflow results. A presentation callback's return type
  may be widened to `Promise<void>` only when necessary to expose an existing
  async lifecycle to its true UI owner; direct consumers and tests must be
  updated with no behavioral change.
- Adding a global loading-state manager.
- Replacing page-level progress indicators that communicate multi-stage or
  batch progress.
- Making every disabled control display a spinner or pending label.

## State Classification

Each candidate is classified by state ownership rather than variable name.

### 1. Own async action

The control initiated the operation and remains unavailable until that same
operation settles. Use the shared loading contract and action-specific pending
copy.

```tsx
<Button loading={isSaving} disabled={!canSave}>
  {isSaving ? t("common:status.saving") : t("common:actions.save")}
</Button>
```

Do not repeat `disabled={isSaving}` because `loading` already physically
disables the shared button. Keep independent guards such as `!canSave`.

### 2. Locked by another action

The control did not initiate the current operation but must be unavailable
while it runs. Keep it disabled without a spinner. Common examples are Cancel,
Close, selection controls, and secondary actions locked during a primary
submission.

### 3. Static or prerequisite disabled state

The control is unavailable because input is incomplete, the user lacks a
required capability, no item is selected, data is empty, or a pagination or
scroll boundary has been reached. Preserve `disabled` and do not expose
`aria-busy`.

### 4. Interruptible busy action

The running action intentionally remains clickable so the user can cancel or
stop it. Do not use the existing shared `loading` prop because it forces the
control to be disabled. Keep an interactive busy presentation with:

- `aria-busy="true"` while work is running;
- a visual spinner hidden from assistive technology;
- copy that describes the currently available action, such as “Cancel
  refresh”; and
- the existing cancel or stop callback.

The managed-site channel refresh control is the representative case.

## Component and State Design

### Shared button primitives

Do not change the meaning of `Button.loading` or `IconButton.loading`. They
continue to mean that the control's own non-interruptible action is running,
and they continue to provide the spinner, physical disabling, click
suppression, and `aria-busy` behavior.

Do not add automatic pending-label generation to the primitive. Workflows own
their action vocabulary and select the correct localized pending label.

### Direct single-action controls

Direct controls with a dedicated state such as `isSubmitting`, `isSaving`,
`isCreating`, or an entity-specific identifier migrate mechanically after the
state source is verified. High-confidence examples include import submissions,
settings saves, key display, row-specific verification, popup refresh, and
single-item retry actions.

Manual `Loader2`, `animate-spin`, disabled, and `aria-busy` wiring is removed
when the shared contract fully replaces it.

### Multi-action workflows

A broad `isBusy`, `isRunning`, or `isWorking` flag must not be passed to every
button as `loading`. When multiple actions can start the same workflow, the
workflow owns a small typed discriminator:

```ts
type ActiveAction = "run_all" | "run_selected" | "retry_failed" | null
```

The clicked action receives `loading={activeAction === "run_all"}`. Sibling
actions remain disabled while `activeAction !== null`, but do not appear busy.
The discriminator must live at the layer that owns the real async lifecycle.
That owner sets it immediately before starting the operation and clears it in
`finally` so success and failure paths cannot leave stale UI state.

Presentational action bars whose callback contract is `() => void` must not
create local action state and clear it around that synchronous callback. Their
workflow parent should own and pass the discriminator. Changing a callback to
return `Promise` is acceptable only when that component truly becomes the
lifecycle owner and all direct consumers and standalone tests are updated.

For row or entity operations, prefer an existing or feature-local entity
identifier such as `retryingCode`, `verifyingItemId`, or
`refreshingAccountId`. This avoids introducing a parallel global state model.

Likely discriminator consumers include managed-site model sync actions,
auto-check-in actions, and tag operations. Account bulk toolbar controls are
normally locked by the separate destructive-confirmation workflow and should
not receive a new discriminator unless a distinct toolbar action is verified
to own an async lifecycle.

### Composite stages

Controls whose spinner currently combines different phases must be modeled
before migration. For example, preview loading and execution running are not
the same button action. The control may use a finite phase such as
`preview_loading | ready | running`, or derive equivalent booleans from
existing workflow state. Its pending copy and click availability must match the
current phase.

### Wrappers and non-button surfaces

Feature wrappers may receive a narrow `loading` and pending-label contract when
they own an actionable control, including account action menu items and toast
actions. Their rendering should reuse the shared spinner and accessibility
rules without forcing ordinary button layout into menus.

When an initiating control lives in a transient surface, such as a popup menu
or confirmation dialog that already closes immediately after selection, the
stable visible parent control may act as the action's status continuation.
This is allowed only when the workflow tracks the specific action or phase that
originated from that transient surface. Aggregate row, selection, preview, or
bulk busy state may disable the parent control but must not make it appear busy.

Native buttons should migrate to a shared primitive when their styling and
interaction contract are compatible. If a native or menu control must remain,
it should expose equivalent busy semantics without duplicating generic state
logic across consumers.

## Copy and Accessibility

- Text buttons show a spinner plus action-specific pending copy: Save → Saving,
  Import → Importing, Retry → Retrying.
- Prefer an accurate broader phase label such as Processing when one operation
  spans download, decrypt, import, and reload stages.
- Icon-only buttons keep a stable action-specific accessible name while the
  icon is replaced by a spinner.
- Button-internal visual spinners remain hidden from assistive technology so
  they do not pollute the accessible name.
- Static disabled controls do not receive `aria-busy`.
- Pending labels are synchronized across every supported app locale and
  verified with `pnpm run i18n:extract:ci`.
- Existing page-level `role="status"` or `aria-live` progress remains in place
  when it communicates batch or multi-stage progress that a button label cannot
  represent.

## Migration Order

1. Migrate high-confidence direct `Button`, `IconButton`, and native-button
   cases with a dedicated action state.
2. Replace manual spinners when the shared loading contract is behaviorally
   equivalent.
3. Add narrow loading contracts to menu and toast action wrappers.
4. Introduce typed active-action or entity-ID state for multi-action workflows.
5. Resolve composite phase cases after their preview and execution states are
   distinguishable.
6. Re-run structural audits and document intentional exceptions, including
   interruptible controls.

This order keeps mechanical migrations separate from state-model changes and
makes review failures easier to localize.

## Classification Manifest

The implementation plan must include a path-level manifest for every audited
async-name candidate and manual-spinner control. Each entry is assigned exactly
one disposition:

- direct shared-loading migration;
- wrapper-loading migration;
- locked by another action;
- static or prerequisite disabled state;
- active-action or entity-ID state required;
- composite phase required; or
- interruptible intentional exception.

The manifest is the migration and acceptance boundary. It prevents heuristic
candidate counts from being mistaken for required migrations and makes every
intentional non-change reviewable. The final structural re-audit must reconcile
new findings against the same dispositions rather than silently expanding or
shrinking scope.

## Error and Recovery Behavior

Loading state must clear in the existing error path, normally through
`finally`. Existing error toasts, inline messages, retry controls, and recovery
flows remain unchanged. A loading-state migration must not swallow errors,
change whether a dialog closes, or alter cancellation behavior.

If an operation is retryable, the retry button returns to its idle label after
failure. If an operation is interruptible, its cancel or stop action remains
available throughout the running phase.

## Testing Strategy

Use focused Vitest and Testing Library coverage at the changed component or
workflow boundary.

Direct controls should verify:

- idle and pending accessible names;
- `aria-busy="true"` only for the initiating control;
- physical disabling and duplicate-click suppression;
- restoration of the idle state after success and failure; and
- removal of duplicate or assistive-technology-visible spinners.

Multi-action workflows should verify:

- only the selected action displays loading;
- sibling actions are disabled without appearing busy;
- the active action clears on rejection; and
- entity-specific operations only mark the affected row.

Wrapper tests should instantiate the wrapper contract directly as well as cover
at least one real consumer. Locale changes require
`pnpm run i18n:extract:ci`. Cross-cutting TypeScript changes require the normal
focused tests, `pnpm run validate:staged`, and `pnpm run validate:push` before a
remote handoff.

## E2E and Telemetry Decisions

No new telemetry is planned. This work changes the presentation and
accessibility of existing actions without adding a new user action, setting, or
outcome.

No new Playwright scenario is planned by default. Component tests are the
precise layer for loading copy, busy semantics, and action discrimination. An
existing E2E flow should only be extended if a migrated case depends on browser
runtime behavior, cross-entrypoint messaging, or an interruptible browser
operation that lower-level tests cannot represent.

## Risks and Mitigations

- **False loading:** Do not infer loading from `disabled`; verify which action
  owns the async state.
- **Multiple simultaneous spinners:** Add a typed active-action or entity-ID
  discriminator before migrating shared busy flags.
- **Broken cancellation:** Keep interruptible controls interactive and outside
  the disabling loading contract.
- **Inaccurate copy:** Distinguish preview, execution, and compound processing
  phases before selecting a pending label.
- **State stuck after failure:** Clear local action state in `finally` and cover
  rejection behavior.
- **Hidden custom surfaces:** Re-run structural and text searches for shared
  buttons, icon buttons, native buttons, menu actions, toast actions,
  `animate-spin`, manual Spinner usage, and `aria-busy` after migration.

## Acceptance Criteria

- Every confirmed, non-interruptible async action in the audited surfaces uses
  a shared or wrapper-level loading contract with accurate pending copy.
- Only the initiating control or its explicitly defined stable status
  continuation appears busy.
- Static disabled controls preserve their original semantics and do not show a
  spinner.
- Interruptible actions remain operable and clearly communicate the available
  cancel or stop action.
- Manual spinners inside the audited interactive controls remain only where a
  classification-manifest entry documents the interaction contract that
  requires them. Page loading, table loading, and batch progress indicators are
  outside this button-internal criterion.
- Accessibility, locale extraction, focused tests, staged validation, and the
  applicable push gate pass.
- Request behavior, error recovery, cancellation, analytics, and workflow
  outcomes remain unchanged.

## Context

The extension supports “model redirect” by writing a JSON string to each managed-site channel’s `model_mapping` field.
This mapping lets downstream callers use a stable “standard model” id while routing to the channel’s actual upstream
model.

Today, the UI can generate and apply mappings (incrementally merged into existing `model_mapping`). When users want to
fully reset routing (e.g., after upstream model reshuffles), there is no single operation to clear all channel mappings.
Manual per-channel edits are slow and error-prone, and a bulk clear is destructive (potentially removing user-entered
custom mappings), so it must be guarded by explicit confirmation.

## Goals / Non-Goals

**Goals:**

- Provide a bulk action that lets users preview channels and clear `model_mapping` for a selected set of channels in the
  current managed-site context.
- Require an explicit confirmation step before performing the destructive operation.
- Report per-channel results so failures can be retried or handled manually.

**Non-Goals:**

- Preserving/merging parts of an existing mapping (the action is an intentional “reset to empty”).
- Changing the model redirect generation algorithm.
- Migrating server-side channel schemas or adding new backend endpoints.

## Decisions

- **UI location:** Add the bulk-clear action to the existing model redirect settings panel
  (`entrypoints/options/pages/BasicSettings/components/ModelRedirectSettings.tsx`) so it’s discoverable next to
  “regenerate mapping”.
  - Alternative: put it in a global “Danger Zone” panel. Rejected because it’s feature-specific and users expect it near
    model redirect controls.

- **Preview + confirmation UX:** Use a two-step flow:
  1) A preview/selection dialog that loads channels and lets the user select which channels to clear (default: all
  selected; include select-all/none shortcuts).
  2) A `DestructiveConfirmDialog` that explicitly confirms “clear selected channels” before any API writes.
  - Alternative: cram selection into the destructive confirm dialog “details” slot. Rejected because large lists are hard
    to scan and interact with in a confirm-only dialog.

- **Service API shape:** Implement a new `ModelRedirectService` method (e.g.
  `clearChannelModelMappings(channelIds: number[])`), which:
  - Loads current preferences to resolve managed-site config and credentials.
  - Fetches the full channel list via the existing `ModelSyncService` / API service wiring.
  - Filters the list to the selected channel IDs (UI provides IDs).
  - Updates each selected channel by calling `ModelSyncService.updateChannelModelMapping(channel, {})` (empty object,
    stringified to `{}`), keeping the channel’s `models` unchanged.
  - Returns a summary `{ successCount, failureCount, errors[] }` suitable for toast display.
  - Alternative: implement this in UI with ad-hoc API calls. Rejected to keep business logic in `services/`.

- **Which channels are eligible:** All channels returned by the managed-site channel list API are eligible (including
  disabled channels). Selection is user-controlled, but disabled channels can still be cleared.

- **Execution strategy:** Run updates sequentially (or with a small fixed concurrency) to reduce rate-limit risk and keep
  error reporting deterministic. Start with sequential unless existing model-sync concurrency utilities are easy to reuse.

## Risks / Trade-offs

- **Accidental data loss (user custom mappings)** → Mitigation: destructive confirm dialog + explicit wording that this
  clears all mappings and cannot be undone.
- **Partial failure (some channels fail to update)** → Mitigation: per-channel error list and a final summary; leave the
  system in a consistent “some cleared, some not” state with clear user feedback.
- **Backend differences across managed-site types** → Mitigation: reuse existing `getApiService(managedSiteType)`
  selection and `updateChannelModelMapping` implementations (`services/apiService/common` and
  `services/apiService/doneHub`) rather than new endpoint logic.

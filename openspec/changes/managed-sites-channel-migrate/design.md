## Context

Managed-site channel CRUD already exists, but it is scoped to the currently selected `managedSiteType`. The current channel page (`src/features/ManagedSiteChannels/ManagedSiteChannels.tsx`) already loads the active managed-site channel list, keeps full client-side row selection/filtering state, and exposes both row-level and bulk actions. That makes it the correct entry point for a first migration workflow.

The nearest existing reuse points are:

- `src/features/ManagedSiteChannels/ManagedSiteChannels.tsx`: reuse the existing table data, row selection, filter state, and bulk action surface; extend it with a migration dialog entry point instead of adding a separate page.
- `src/features/ManagedSiteChannels/components/RowActions.tsx`: extend it with a single-channel migration action that preselects one row.
- `src/services/managedSites/managedSiteService.ts`: extend the service resolver so callers can obtain a managed-site service for an explicit target site type instead of only the currently active one.
- `src/services/managedSites/utils/managedSite.ts`: extend the config helpers to read admin credentials for a specified managed-site type and enumerate configured migration targets from existing preferences.
- `src/services/managedSites/providers/{newApi,doneHubService,veloera,octopus}.ts`: reuse provider-specific `createChannel` and `buildChannelPayload` logic rather than adding parallel payload builders.
- `src/components/dialogs/ChannelDialog/hooks/useChannelForm.ts`: reuse the shared `ChannelFormData` contract, but do not reuse the dialog itself because it is bound to the active managed-site context and manual edit/create UX.
- `src/features/BasicSettings/components/dialogs/ClearModelRedirectMappingsDialog.tsx`: reuse its preview -> confirm -> result modal pattern for a managed-site batch action.
- `src/features/ManagedSiteVerification/loadNewApiChannelKeyWithVerification.ts`, `src/services/managedSites/providers/newApiSession.ts`, and `src/services/apiService/doneHub/index.ts`: reuse these for source-channel key hydration when list payloads do not expose the raw key.

A key constraint is that user preferences already store one admin config per managed-site type (`newApi`, `doneHub`, `veloera`, `octopus`), but not multiple profiles per type. That means the first migration release can target other configured managed-site types, but it cannot yet target two different deployments of the same type.

## Goals / Non-Goals

**Goals:**

- Add a basic channel migration flow from the currently active managed site to another configured managed site.
- Support migrating one row, selected rows, or the full currently filtered channel list.
- Reuse the existing provider-specific channel creation logic so migration stays aligned with each backend's current create semantics.
- Show a preflight preview with warnings for dropped or remapped fields before any target channel is created.
- Return per-channel success and failure results after execution.

**Non-Goals:**

- Syncing into existing target channels.
- Duplicate detection, overwrite policies, merge policies, or any other conflict-resolution workflow.
- Rollback, source deletion, source disablement, or any source-side mutation.
- Introducing a new multi-profile managed-site settings model.
- Background job persistence, resumable execution, or cross-session progress recovery.

## Decisions

### 1. Use existing per-type managed-site configs as the migration target registry

**Decision:** The migration target picker will enumerate the already stored managed-site configs from user preferences and offer only those with complete credentials, excluding the currently active managed-site type.

**Rationale:** The repo already persists one config per managed-site type. Reusing that storage avoids a new settings feature and keeps this change focused on the basic migration path the user asked for.

**Alternative considered:** Add a new "managed site profiles" data model that allows multiple saved targets per site type. Rejected for this change because it expands scope into settings/storage UX and is not required for the first create-only migration flow.

**Trade-off captured up front:** The first version supports only one target per managed-site type, so it does not cover "same backend type, different second deployment" unless that second deployment is stored under a different managed-site type.

### 2. Extend managed-site resolution helpers to accept an explicit site type

**Decision:** Add explicit typed helpers such as `getManagedSiteAdminConfigForType(...)`, `getManagedSiteContextForType(...)`, and `getManagedSiteServiceForType(...)`, while keeping the existing "current active site" helpers as thin wrappers.

**Rationale:** Migration needs the current managed-site context for the source page and a different managed-site context for the target at the same time. The existing helpers only read `preferences.managedSiteType`, so they are insufficient for cross-site operations without dangerous temporary state changes.

**Alternative considered:** Temporarily switch `managedSiteType` in preferences before creating target channels, then switch it back. Rejected because it would mutate user state for a transient operation and would risk surprising unrelated UI/background flows.

### 3. Introduce a dedicated migration orchestrator that maps source channels into `ChannelFormData`

**Decision:** Add a new managed-site migration service that produces a per-channel migration draft shaped like:

- source channel metadata
- normalized `ChannelFormData`
- non-fatal warnings
- fatal blocking reason, if the channel cannot be created safely

The orchestrator will then pass the normalized `ChannelFormData` into the target provider's existing `buildChannelPayload(...)` and `createChannel(...)` methods.

**Rationale:** `ChannelFormData` is already the narrow shared contract between the UI and provider-specific payload builders. Reusing it avoids a second copy of per-provider create payload logic while still allowing the migration layer to describe what is being dropped, defaulted, or converted.

**Alternative considered:** Reuse `ChannelDialog` or `useChannelForm` directly and drive migration through a hidden form flow. Rejected because those abstractions are coupled to the active managed-site context, manual user editing, and immediate form submission.

### 4. Use explicit field mapping rules instead of "copy raw JSON and hope"

**Decision:** Migration will copy only the fields that are already represented in `ChannelFormData` and known create payloads:

- `name`
- `type`
- `key`
- `base_url`
- `models`
- `groups`
- `priority`
- `weight`
- enabled/disabled `status`

Provider-specific handling:

- `new-api`, `Veloera`, and `done-hub` keep the common fields above with minimal normalization.
- `octopus` reuses the existing type conversion and base-URL normalization rules already present in `providers/octopus.ts`:
  - map New API-style channel types to Octopus outbound types
  - normalize `base_url` to the expected `/v1` form
  - force `groups` to the Octopus-compatible default
  - coerce unsupported priority/weight semantics to Octopus defaults

The migration layer will explicitly not copy create-unfriendly or backend-specific state such as:

- `model_mapping`
- `status_code_mapping`
- `channel_info`
- `setting` / `settings`
- multi-key runtime metadata
- backend-specific extra fields not represented in `ChannelFormData`

Those omissions will be surfaced as preview warnings when they matter.

**Rationale:** This keeps the first version deterministic and readable. It also matches the user's request to skip sync, dedupe, and rollback for now.

**Alternative considered:** Forward the full source channel object into each target backend and let the backend ignore unknown fields. Rejected because provider payloads already differ materially, especially for Octopus and Done Hub, and silent field loss would be harder to explain or test.

### 5. Resolve hidden source keys during preview, before execution starts

**Decision:** The preview step will hydrate any missing source `key` values needed for channel creation before the user confirms execution.

Resolution strategy:

- `new-api`: reuse the existing verification-backed key loader flow used by channel edit.
- `done-hub`: reuse channel-detail fetch to hydrate omitted keys from the detail payload.
- `octopus`: reuse the list payload because it already includes channel key data in the normalized channel.
- `Veloera`: use the list payload in the first version; if a deployment hides keys, the channel remains blocked with a clear reason.

**Rationale:** A migration that starts creating target channels and only then discovers that source secrets are unavailable creates confusing partial failures. Preview-time hydration keeps the result predictable and gives the user a chance to resolve verification requirements before the batch starts.

**Alternative considered:** Allow empty keys to flow into target creation and rely on backend validation to fail. Rejected because it converts an actionable preflight problem into a noisy runtime failure and can still create partially broken target channels on permissive backends.

### 6. Keep execution in the options page for the first release

**Decision:** The first migration implementation will run through a page-local service invoked from the options page dialog, with serial channel creation and an in-dialog result view.

**Rationale:** This keeps the feature small and aligned with existing direct CRUD flows such as channel create/edit/delete and bulk model-redirect clearing. It avoids introducing a new runtime message namespace before the workflow needs background durability.

**Alternative considered:** Add a new background runtime-action namespace for channel migration. Rejected for this change because resumable or long-lived background execution is not required for the initial create-only feature.

**Operational detail:** The dialog should disable close while execution is running, but the code still treats page teardown as an interruption rather than something to recover from automatically.

### 7. Define "migrate all" as the full currently filtered dataset

**Decision:** The bulk entry point will operate on all channels currently included by the table's filtered row model, not just the current page and not only manually checked rows.

**Rationale:** `ManagedSiteChannels` already holds the full loaded dataset client-side and already applies filters locally. Using the filtered dataset matches user expectation for "all" in the current review context without adding another server fetch or selection mode.

**Alternative considered:** Limit "all" to the current paginated page or require explicit checkbox selection for every batch. Rejected because it makes large migrations tedious and inconsistent with the issue's "multi-select / migrate all" requirement.

## Risks / Trade-offs

- **[Risk] Duplicate target channels are easy to create because this change intentionally skips dedupe and sync behavior** → **Mitigation:** show an explicit preview warning that the operation always creates new channels and does not search for existing matches on the target.
- **[Risk] The first release cannot target a second deployment of the same managed-site type** → **Mitigation:** document this limitation in the UI copy and keep the design isolated so a later multi-profile settings change can replace only the target-registry helper.
- **[Risk] Source channel keys may require verification or provider-specific detail fetches** → **Mitigation:** hydrate keys during preview, block only the affected rows, and reuse the existing New API verification flow instead of inventing a new one.
- **[Risk] Cross-provider field mismatches may surprise users, especially when targeting Octopus** → **Mitigation:** show dropped/remapped field warnings in preview and restrict the copied shape to the small set of fields already represented in `ChannelFormData`.
- **[Risk] Serial execution is slower for large batches** → **Mitigation:** accept the slower but more deterministic behavior for the first release; add bounded concurrency later only if real usage shows the need.
- **[Risk] Page-local execution can be interrupted if the options page closes** → **Mitigation:** keep the modal non-dismissable while running, return per-channel results immediately, and avoid any source-side mutation so rerunning the batch remains straightforward.
- **[Risk] There is no rollback for partially successful runs** → **Mitigation:** keep the result list copyable and include channel-level failure reasons so the operator can manually clean up or retry on the target site.

## Migration Plan

- No local storage migration is required. The feature reuses existing managed-site preference objects and introduces only transient UI state plus new service helpers.
- Add new localized strings for target selection, preview warnings, execution progress, and result summaries.
- Ship the feature as inert unless at least one non-active managed-site config is complete enough to be a target.
- Code rollback is low risk because there is no new persisted data model; removing the dialog/action leaves existing preferences valid.
- Operational rollback of channels created on the target site is explicitly out of scope for this change and remains manual.

## Open Questions

- Does any supported `Veloera` deployment hide channel keys in list payloads the same way New API can? If yes, the migration service will need a Veloera-specific key-hydration hook similar to the New API and Done Hub branches.

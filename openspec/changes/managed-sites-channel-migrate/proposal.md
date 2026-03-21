## Why

Managed-site channel CRUD already exists, but operators still have to recreate channels manually when moving to a new self-hosted site or rebuilding an existing deployment. This change adds the first migration workflow now so users can copy channels between managed sites without waiting for the more complex sync, duplicate-reconciliation, and rollback phases.

## What Changes

- Add a dedicated migration mode to the managed-site channel list with single-row, selected-row, and current filtered-list entry points while keeping refresh available and source channels viewable in read-only mode.
- Allow the user to choose another configured managed site as the target and copy supported channel configuration into that target as newly created channels.
- Resolve hidden source keys during preview by reusing the shared New API managed-session verification flow and provider secret-detail loaders where available, blocking only the affected rows when a real key cannot be recovered.
- Provide a preflight review step that compares source and target field values, highlights ready versus blocked channels, and warns when source fields must be dropped, defaulted, or remapped for the chosen target.
- Show per-channel success, failure, and skipped results after execution so the operator can review what completed and what still needs manual follow-up.
- Explicitly defer bidirectional sync, duplicate matching or overwrite strategies, and rollback for a later change.

## Capabilities

### New Capabilities

- `managed-sites-channel-migration`: Support basic create-only migration of selected managed-site channels from one managed site to another, including target selection, preflight warnings, and execution results.

### Modified Capabilities

## Impact

- Managed-site channel management UI under `src/features/ManagedSiteChannels/**`, the shared channel dialog view mode under `src/components/dialogs/ChannelDialog/**`, and related localized copy.
- Managed-site verification helpers under `src/features/ManagedSiteVerification/**` and `src/services/managedSites/providers/newApiSession.ts` for New API source-key loading.
- Managed-site service abstractions and provider adapters under `src/services/managedSites/**`, plus shared managed-site channel payload and mapping logic.
- Runtime flows that read channels from the current managed site and create channels on another configured managed site for supported site types (`new-api`, `Veloera`, `done-hub`, `octopus`).
- No new external dependencies; this change relies on existing managed-site configuration, credentials, and channel CRUD capabilities.

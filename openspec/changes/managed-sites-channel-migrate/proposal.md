## Why

Managed-site channel CRUD already exists, but operators still have to recreate channels manually when moving to a new self-hosted site or rebuilding an existing deployment. This change adds the first migration workflow now so users can copy channels between managed sites without waiting for the more complex sync, duplicate-reconciliation, and rollback phases.

## What Changes

- Add a managed-site channel migration entry point from the managed-site channel list for selected channels and full-list runs.
- Allow the user to choose another configured managed site as the target and copy supported channel configuration into that target as newly created channels.
- Provide a preflight review step that shows which channels are about to be migrated and warns when some source fields cannot be mapped to the target managed-site type.
- Show per-channel success and failure results after execution so the operator can review what completed and what still needs manual follow-up.
- Explicitly defer bidirectional sync, duplicate matching or overwrite strategies, and rollback for a later change.

## Capabilities

### New Capabilities

- `managed-sites-channel-migration`: Support basic create-only migration of selected managed-site channels from one managed site to another, including target selection, preflight warnings, and execution results.

### Modified Capabilities

## Impact

- Managed-site channel management UI under `src/features/ManagedSiteChannels/**` and related localized copy.
- Managed-site service abstractions and provider adapters under `src/services/managedSites/**`, plus shared managed-site channel payload and mapping logic.
- Runtime flows that read channels from the current managed site and create channels on another configured managed site for supported site types (`new-api`, `Veloera`, `done-hub`, `octopus`).
- No new external dependencies; this change relies on existing managed-site configuration, credentials, and channel CRUD capabilities.

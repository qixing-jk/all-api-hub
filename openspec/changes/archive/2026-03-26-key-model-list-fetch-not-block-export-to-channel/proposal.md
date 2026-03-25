## Why

Exporting a key to the managed-site channel flow currently depends on a live upstream model-list fetch before the channel dialog opens. When that fetch fails, the entire export/import action is aborted even though the user could still continue with fallback model data or enter models manually.

## What Changes

- Keep the managed-site channel export/import flow available when upstream model-list preloading fails.
- Use only the selected key's live upstream model-list for automatic prefill, and fall back to an empty, editable model picker when that fetch fails.
- Treat model preload failures as non-blocking diagnostics instead of fatal preparation errors for the channel dialog.
- Show a non-blocking in-dialog warning when automatic model prefill fails so the user knows they must enter and confirm models manually.

## Capabilities

### New Capabilities
- `managed-site-channel-import-model-fallback`: Allow the managed-site channel import dialog to open and remain usable when upstream model preloading fails, using only live upstream model data for automatic prefill and guiding the user to manual model entry when that prefill is unavailable.

### Modified Capabilities
<!-- None -->

## Impact

- Managed-site provider helpers in `src/services/managedSites/providers/` that currently build prefilled channel form data.
- Shared managed-site model probing under `src/services/managedSites/utils/`.
- Key Management and other dialog entry points that call `useChannelDialog().openWithAccount()` or `openWithCredentials()`.
- Channel dialog UX and validation for prefilled model suggestions, explicit warning guidance, and user-entered models.

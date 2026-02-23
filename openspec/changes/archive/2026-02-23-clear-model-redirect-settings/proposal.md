## Why

Users can enable “model redirect” (channel `model_mapping`) to remap standard model names to upstream model IDs per
channel. When a deployment changes models, users need a fast, safe way to reset all channel redirect maps back to a
clean state without manually editing each channel.

## What Changes

- Add a destructive “clear model redirect maps” action that lets users **preview channels** and choose which channels’
  `model_mapping` should be cleared in the current managed-site context.
- Default to selecting all channels, with “select all / none” convenience controls.
- Require an explicit user confirmation before performing the clear (to prevent accidental irreversible changes).
- Show per-channel results (success/failure) so users can see what was cleared and what needs manual follow-up.

## Capabilities

### New Capabilities

- `model-redirect-bulk-clear`: Preview channels and clear channel `model_mapping` for selected channels with a
  confirmation step and per-channel result reporting.

### Modified Capabilities

- (none)

## Impact

- Settings / managed-site admin UI (where model redirect actions are triggered).
- Managed-site channel update API calls (writing empty `model_mapping`).
- Storage/state used to determine current managed-site context and credentials.

## Why

Claude Code Hub users currently cannot manage their self-hosted provider inventory from All API Hub even though Claude Code Hub exposes an admin action API for provider CRUD. Adding it as a managed-site target lets users import existing account tokens as Claude Code Hub providers and perform basic channel management from the same workflows used for other supported managed sites.

## What Changes

- Add Claude Code Hub as a selectable managed-site type with persisted admin configuration.
- Support basic Claude Code Hub provider management through the managed-site channel page: list, search, create, update, and delete.
- Support importing an existing All API Hub account token as a Claude Code Hub provider/channel, including source base URL, selected token key, and final model list.
- Map Claude Code Hub provider records into the shared managed-site channel table shape without exposing raw secrets in labels, errors, or logs.
- Preserve existing provider secrets on edit when Claude Code Hub only returns a masked key and the user has not supplied a replacement key.
- Defer bulk channel migration, model sync, model redirect, and full managed-site key reveal unless later requirements explicitly add them.

## Capabilities

### New Capabilities

- `claude-code-hub-managed-site`: Configure Claude Code Hub as a managed site, manage its providers through the shared channel UI, and import existing account tokens as Claude Code Hub provider channels.

### Modified Capabilities

- None.

## Impact

- Managed-site constants, labels, configuration persistence, settings UI, and managed-site type switching.
- Managed-site service routing and a new Claude Code Hub provider/API adapter for `/api/actions/providers/*`.
- Channel dialog mapping for Claude Code Hub provider type values and masked-key-safe updates.
- Account-token import flow, duplicate detection, and model-prefill behavior for the new managed-site target.
- i18n resources for settings, managed-site labels, channel management messages, and safe error/fallback text.
- Targeted unit/component tests for configuration validation, service selection, provider CRUD mapping, import payload mapping, and secret-safe edit behavior.

## Why

Recent `new-api` changes mask token keys in list/detail/search responses and move full-key access to a dedicated on-demand endpoint. All API Hub currently assumes `token.key` from token inventory APIs is immediately usable secret material, so copy/export/integration and managed-site matching flows can break or silently degrade against newer `new-api` deployments while still needing to remain compatible with older deployments that continue returning full keys.

## What Changes

- Add compatibility for token-management backends that return masked token keys in inventory responses while exposing full keys through a separate explicit fetch step.
- Ensure secret-dependent actions resolve the full token key on demand instead of treating masked inventory values as usable credentials.
- Preserve existing user-facing token workflows across supported account and Key Management surfaces, including copy, export, integration handoff, and managed-site comparison flows.
- Keep backward compatibility with older backends that still return full token keys directly, without requiring a new configuration toggle.
- Preserve secret-handling guarantees by keeping masked values as the default display form and avoiding plaintext-key leakage in logs, cached summaries, and background diagnostics.

## Capabilities

### New Capabilities

- `masked-token-key-compatibility`: The extension can operate correctly when a site masks token keys in inventory APIs and requires an explicit per-token request to obtain the full key for user-initiated secret actions.

### Modified Capabilities

None.

## Impact

- Updates token-fetching and token-detail handling under `src/services/apiService/common/**` and site-specific adapters that currently assume inventory APIs always return usable full keys.
- Affects Key Management, account token dialogs, and token-driven export/integration flows under `src/features/**` and `src/components/**` that copy, compare, or embed token secrets.
- May affect managed-site channel matching and provider helpers under `src/services/managedSites/**` where exact token-key comparison is required.
- Requires targeted unit/component coverage for masked-token inventories, on-demand key resolution, fallback compatibility with older backends, and secret-safe failure handling.

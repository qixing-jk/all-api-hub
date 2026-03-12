## Why

Key Management currently tells users whether a key is already represented as a managed-site channel only after they start the import flow. That feedback arrives too late, creates repeated import-and-backtrack work, leaves New API-family verification limits unclear when exact key comparison is unavailable, and provides no up-front explanation when a provider such as Veloera cannot reliably prove channel absence from its search API.

## What Changes

- Add a managed-site channel status indicator to each key in Key Management for the currently configured managed site.
- Define user-visible status outcomes for `added`, `not added`, and `unknown / not verifiable`, including clear guidance when managed-site admin configuration is missing, exact key material is unavailable, only weak base-url matches exist, or the provider cannot support a trustworthy absence check.
- Reuse the existing managed-site channel matching workflow for token-level checks so the list can surface duplicate-channel information before the user starts an import, including matched-channel follow-up links when exact or weak matches exist.
- Support cached and manually refreshable status checks with controlled concurrency so bulk key lists do not overwhelm managed-site admin APIs, while treating Veloera as an explicit unsupported `unknown` state instead of emitting false `not added` results.
- Preserve secret-handling guarantees by avoiding plaintext-key leakage in logs, toasts, and fallback messaging.

## Capabilities

### New Capabilities

- `key-management-managed-site-channel-status`: Key Management can determine and display whether each token already maps to a channel in the configured managed site, including precise matches, confirmed non-matches, and best-effort unknown states when verification is incomplete because comparable key material is unavailable from the prepared inputs, only weak matches exist, or provider search behavior is not trustworthy enough to prove absence.

### Modified Capabilities

None.

## Impact

- Affects Key Management token list and token header UI under `src/features/KeyManagement/**`.
- Affects managed-site matching, config validation, and provider-specific channel lookup behavior under `src/services/managedSites/**`.
- Affects localized Key Management copy in `src/locales/**/keyManagement.json`.
- Affects targeted UI/service tests for managed-site matching states, refresh behavior, and unknown-state handling.

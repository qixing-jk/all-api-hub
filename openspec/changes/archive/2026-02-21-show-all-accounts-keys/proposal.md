## Why

Managing many sites/accounts currently requires switching account-by-account to view or copy API keys/tokens. A single aggregated view reduces repetitive navigation and makes it easier to audit, search, and export keys across accounts when troubleshooting or configuring downstream tools.

## What Changes

- Add an “All accounts” mode in Key Management so users can list keys/tokens across all enabled accounts in one place.
- In “All accounts” mode, group tokens by account with collapse/expand controls and provide per-account summary badges for quick filtering.
- Load token inventories on-demand and surface per-account loading/error states so one failing account doesn’t block the rest.
- Keep token values treated as secrets: keys are masked by default; reveal/copy requires explicit user action; no secret logging.
- Ensure per-token actions (copy/export/edit/delete) remain correctly scoped to the token’s owning account when shown in an aggregated list.

## Capabilities

### New Capabilities

- `all-accounts-key-view`: Provide an aggregated Key Management view that can display/search/copy keys from all enabled accounts with safe secret-handling and per-account failure isolation.

### Modified Capabilities

## Impact

- Options UI: `entrypoints/options/pages/KeyManagement/**` (account selector, token list, refresh behavior, and action handling).
- Data loading: multi-account token inventory fetching and result aggregation, including safe scoping identifiers to avoid collisions across accounts.
- Security/UX: ensure masked-by-default rendering, explicit reveal/copy actions, and user-facing warnings for plaintext keys.
- i18n: new/updated strings for “All accounts”, loading/progress, and per-account error messaging.

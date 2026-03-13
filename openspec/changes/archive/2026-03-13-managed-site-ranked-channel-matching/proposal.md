## Why

Managed-site channel lookup previously depended on strict comparable-input equality and coarse fallback states. Real deployments can hide channel keys, drift model lists after redirects or delayed sync, or return only partial search evidence. We need one shared inspection flow so account navigation and token status can reuse the same normalized URL, key, and model evidence without pretending weak matches are exact.

## What Changes

- Add shared managed-site channel matching primitives that normalize base URLs, rank `url + models` candidates inside a URL bucket, and expose reusable ranked-match constants plus separate URL, key, and model assessment reasons.
- Resolve account channel location and token status through the same inspection flow: search by normalized base URL first, then ask the provider for an exact channel only when key and model inputs are available and the local search result did not already prove an exact match.
- Treat direct `channelId` navigation as an exact-only action that requires the same channel to satisfy both key matching and exact model equality; all weaker or conflicting outcomes open channel management with `search=<baseUrl>` and signal-specific feedback.
- Keep Key Management's `added` / `not added` / `unknown` badges, but enrich exact and review states with URL/key/model signal badges, tooltips, and follow-up links that avoid exposing secrets.

## Capabilities

### New Capabilities

- None.

### Modified Capabilities

- `account-menu-jump-filtered-channel-management`: refine the lookup priority, exact-focus rule, and user-facing feedback when locating a likely managed-site channel from an account.
- `key-management-managed-site-channel-status`: align token channel-status resolution and rendering with the same shared inspection semantics, while keeping the existing top-level status badges.

## Impact

- Affected areas include managed-site channel matching utilities, the account "Locate channel" action, and Key Management channel-status rendering.
- User-facing localization must cover secondary/fuzzy review toasts plus URL/key/model signal labels and tooltips for Key Management.
- Validation needs targeted service and UI coverage for ranked model evaluation, exact-only channel focusing, weak-match review flows, and provider-specific verification guardrails.

## Context

- The extension already provides Managed Site channel management (options menu: `#managedSiteChannels`) with support for URL query params such as `channelId` and `search`.
- Accounts expose a “more actions” dropdown via `AccountActionButtons`, and the repo already has managed-site helpers to detect duplicate channels by comparing `base_url`, `models`, and (when comparable) `key`.
- On New API family backends, channel `key` is typically not returned by the channel list API unless the admin has completed 2FA verification. This makes exact key matching unreliable and must be handled explicitly.
- The “Locate channel” menu entry is only shown when the user has a valid managed-site admin configuration in preferences.

## Goals / Non-Goals

**Goals:**

- Add an account-menu entry that helps admins quickly jump to Managed Site “Channels management”.
- Prefill the destination with the best available filter:
  - Prefer exact channel focus when a unique match can be determined.
  - Otherwise fall back to filtering by account `baseUrl` (and inform the user why key-precision is unavailable).

**Non-Goals:**

- Introduce a new multi-criteria filter UI (models/groups) in the channel management table.
- Add new backend endpoints or change managed-site API contracts.
- Auto-create API keys/tokens as part of the “locate channel” action (this action must be non-mutating).

## Decisions

1. **Navigate using existing options routing (`#managedSiteChannels` + query params).**
   - Rationale: Managed Site channels UI already reads `routeParams` and applies filters accordingly; reusing this keeps the change small and consistent with other navigation helpers.

2. **Attempt exact match via managed-site service helpers when sufficient local context exists.**
   - If the account has exactly one API token, build the same comparison inputs as the channel import flow (`base_url`, `models`, `key`) and try to locate a matching channel id.
   - If the channel id can be determined, navigate with `channelId` to focus results.

3. **Gracefully degrade when key matching is not possible or ambiguous.**
   - If the account has multiple API tokens (ambiguous key) or the managed-site channel list does not expose comparable keys (e.g. New API 2FA), navigate with `search=<accountBaseUrl>` and show an explicit toast that key-precision is unavailable.
   - If the system cannot fetch the account token list or cannot prepare matching inputs, fall back to navigating with `search=<accountBaseUrl>` and (for token-list failures) show a generic failure toast.
   - When a base URL + models match can be determined but key-precise matching cannot, show an explicit toast indicating key matching is unavailable/requires verification; otherwise, just open the URL-filtered channel management view.

## Risks / Trade-offs

- **[Risk]** “Exact match” may be impossible on some backends because channel keys are masked/empty.  
  **→ Mitigation:** Perform a fallback attempt without key and/or fall back to base URL search, paired with a user-facing explanation.

- **[Risk]** Accounts with multiple API tokens cannot be reliably mapped to a single channel.  
  **→ Mitigation:** Skip key-based matching in that case and use base URL search only.

## Migration Plan

- No migration required. This is a backwards-compatible UI/navigation enhancement.

## Open Questions

- If multiple channels share the same `base_url` and model set, should the UI later support additional filtering (e.g. by key hash or group) to narrow candidates without requiring channel keys?

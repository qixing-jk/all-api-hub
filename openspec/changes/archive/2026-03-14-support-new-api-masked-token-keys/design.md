## Context

`fetchAccountTokens` and `fetchTokenById` in `src/services/apiService/common/index.ts` currently normalize `sk-` prefixes but otherwise treat inventory payloads as if `token.key` always contains a usable secret. That assumption is baked into multiple flows: account-level smart copy, Copy Key dialogs, Key Management actions, export/import dialogs, provider model discovery, API profile creation, and managed-site channel matching.

Newer `new-api` deployments now return masked key values from token inventory endpoints and require an explicit per-token request to read the full key. If All API Hub keeps treating inventory payloads as secret material, newer deployments will produce broken clipboard actions, invalid export payloads, failed upstream model probes, and degraded managed-site duplicate checks. At the same time, eagerly rehydrating every token into a full key would undo the backend's secret-minimization goal and would add N+1 requests to every token list load.

## Goals / Non-Goals

**Goals:**

- Support both legacy token backends that still return full keys and newer `new-api` deployments that only expose full keys through an explicit per-token fetch.
- Centralize masked-key compatibility in a shared service abstraction instead of scattering site-specific branching across UI components.
- Keep token inventories and list rendering masked-by-default unless a user-initiated or exact-verification flow truly needs the full secret.
- Preserve existing user workflows for copy, export, integration handoff, API profile save, and managed-site comparison.
- Avoid persisting resolved secrets to storage, logs, or long-lived shared caches.

**Non-Goals:**

- Redesign token list presentation or require a new user setting for masked-key compatibility.
- Change backend contracts or add new external dependencies.
- Guarantee compatibility with arbitrary forks that diverge from the upstream `new-api` masked-key endpoint contract.
- Persist full token keys across sessions, page reloads, or extension contexts.

## Decisions

### 1. Introduce a centralized token secret resolver at the API-service layer

Add a low-level helper to the shared API service surface, tentatively `resolveApiTokenKey(request, token)` or equivalent, so callers can ask the site adapter for a usable secret key without knowing whether the backend returned a full or masked value.

For the common / `new-api` family implementation:

- If the normalized inventory value already looks like a usable full key, return it unchanged.
- If the value matches the masked-key shape, fetch the full key from the dedicated per-token endpoint and normalize the returned value.
- If the backend reports an error or the endpoint is unavailable, return a redacted failure so the caller can stop a secret-dependent action cleanly.

Other site adapters can inherit a no-op default that simply returns `token.key`, and specific overrides can be added later if another site family adopts a different masked-key contract.

Rationale:

- The compatibility decision belongs in site adapters, not in UI event handlers.
- A single resolver keeps masked-key detection, endpoint selection, and normalization consistent.
- It allows older deployments to continue working without extra requests.

Alternative considered:

- Add site-specific branching in each copy/export/integration flow.
- Rejected because it duplicates logic, increases drift, and makes future backend variants harder to support.

### 2. Keep inventory tokens as display-oriented data and pass resolved clones into secret consumers

`fetchAccountTokens` and `fetchTokenById` should continue returning the backend inventory payload after existing normalization. The shared token objects in Key Management, account dialogs, and other list UIs should not be rewritten in place with resolved full secrets.

Instead, add a small convenience layer for account-scoped UI code, for example a helper that takes `DisplaySiteData` plus `ApiToken` and returns a transient `{ ...token, key: resolvedKey }` clone for secret use. This allows synchronous consumers such as export dialogs and integration utilities to keep their current interfaces while receiving a key-safe token object only at the moment it is needed.

Rationale:

- Shared token inventories should remain safe to cache in React state, reuse in derived lists, and log diagnostically without broad secret exposure.
- Passing a resolved clone keeps most downstream components unchanged.
- It prevents accidental promotion of a masked list view into a full-secret view after one action resolves a key.

Alternative considered:

- Replace the `token.key` field in shared state after the first successful resolution.
- Rejected because it spreads secrets through long-lived UI state and makes later redaction rules harder to reason about.

### 3. Resolve full keys only at explicit secret boundaries

The extension should resolve full keys only for flows that truly require the secret value:

- clipboard copy and single-key quick copy
- API profile save
- Cherry Studio / CC Switch / KiloCode / CliProxy / Claude Code Router handoff
- upstream model discovery inside dialogs that use the API key to probe models
- managed-site exact matching and import payload preparation

Inventory loading, quota/status display, masked previews, sorting, and non-secret filtering should continue to use the inventory payload as-is.

For dialogs that immediately use `token.key` after opening, the caller should resolve the token before opening the dialog. This keeps deep dialog internals synchronous and avoids teaching every dialog component how to fetch masked secrets.

Rationale:

- This mirrors the upstream `new-api` security model: inventory is safe by default, secret access is explicit.
- It minimizes extra network traffic and limits where full keys can live in memory.
- It reduces the number of components that must understand masked-key compatibility.

Alternative considered:

- Eagerly resolve all token keys whenever a token list is loaded.
- Rejected because it recreates the original overexposure problem and would add avoidable requests even when the user never uses the key.

### 4. Use an in-memory promise cache for resolved secrets

The resolver should maintain a per-context in-memory cache keyed by stable token identity, such as `siteType + accountId + tokenId + inventoryKey`. The cache should store in-flight promises as well as resolved values so repeated clicks or multiple dialogs opened in quick succession reuse the same request.

The cache must remain ephemeral:

- do not persist to extension storage
- clear naturally on page reload / context disposal
- invalidate automatically when token inventory reloads, a token is edited or deleted, or the inventory key changes

Rationale:

- A promise cache prevents duplicate `/key` requests and reduces rate-limit pressure.
- Scoping the cache to the active context keeps invalidation simple and secrets short-lived.

Alternative considered:

- No cache at all.
- Rejected because the same token can be used by multiple actions in one session, especially in Key Management, and repeated secret fetches would create unnecessary latency and backend load.

### 5. Managed-site flows reuse the same resolver but keep conservative fallback semantics

Managed-site channel preparation and duplicate detection currently assume `token.key` can be compared exactly. For masked-key-compatible sites, these flows should resolve the key through the shared resolver before attempting exact matching or channel payload generation.

This applies to both:

- user-initiated managed-site import flows through `useChannelDialog`
- automatic managed-site status checks in `src/services/managedSites/tokenChannelStatus.ts`

Automatic status checks must still stay conservative. If full-key resolution fails, is unsupported, or is throttled during a background verification run, the result should remain `unknown` rather than degrading to a false `not-added`. User-initiated imports should instead stop with a user-visible, redacted failure because importing with a masked key would create a broken channel.

Rationale:

- Managed-site exact matching is one of the few non-copy flows that genuinely requires secret material.
- Reusing the shared resolver avoids site-specific compatibility logic leaking into managed-site providers.
- Conservative fallback preserves the existing channel-status safety guarantees.

Alternative considered:

- Leave managed-site status/import flows on inventory keys only.
- Rejected because newer `new-api` deployments would remain permanently unverifiable even when the backend can reveal the secret on demand.

## Risks / Trade-offs

- [Extra per-token fetches can hit backend rate limits] -> Use on-demand resolution, promise deduplication, and bounded concurrency for background status checks.
- [Dialogs may open slightly later because a key must be resolved first] -> Resolve before opening and reuse the existing loading/toast affordances for explicit user actions.
- [Masked-key detection could miss a backend variant] -> Keep detection centralized and allow site overrides instead of duplicating heuristics across the UI.
- [Resolved keys could linger in local component state while a dialog stays open] -> Keep resolved keys only in ephemeral in-memory state, pass them as transient clones, and clear dialog state on close.
- [Some forks may mask keys but not support the upstream fetch endpoint] -> Let inventory and non-secret views continue working, but fail secret-dependent actions with a clear redacted error rather than silently using an unusable masked key.
- [Automatic managed-site status checks may perform more requests than before] -> Reuse the status feature's existing bounded-concurrency model and degrade unresolved cases to `unknown`.

## Migration Plan

1. Add masked-key detection and full-key resolution helpers to the shared API service layer, with a common / `new-api` family implementation and a safe default fallback for other sites.
2. Add a small account-scoped convenience helper so UI code can obtain a resolved token clone without rebuilding the logic at each call site.
3. Update secret-action entry points in Account Management, Copy Key dialogs, Key Management actions, and export/integration launchers to use the resolver.
4. Update managed-site channel preparation and status-check paths to resolve full keys before exact comparisons, while preserving `unknown` fallback behavior.
5. Add targeted unit/component coverage for masked inventory compatibility, cache deduplication, legacy full-key fallback, and redacted failure handling.

No storage, preference, or browser-permission migration is required. Rollout is additive and rollback is code-only.

## Open Questions

None for the initial implementation. If a supported fork later masks inventory keys without implementing the upstream `new-api` per-token key endpoint, that should be handled with a site-specific override rather than by weakening the generic resolver contract.

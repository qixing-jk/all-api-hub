## Context

The extension already supports `sub2api` accounts for balance refresh via `src/services/apiService/sub2api/index.ts`, and `src/services/apiService/index.ts` already routes `sub2api` requests into that override module. However, the shared key workflows (`useKeyManagement.ts`, `useCopyKeyDialog.ts`, `useModelKeyDialog.ts`, export dialogs, and add/edit token flows) call shared helpers such as `fetchAccountTokens`, `createApiToken`, `updateApiToken`, `deleteApiToken`, `fetchUserGroups`, and `fetchAccountAvailableModels`. Because the `sub2api` override module does not implement those helpers yet, the calls fall back to `src/services/apiService/common/index.ts` and hit One-API-style routes such as `/api/token/`, `/api/user/self/groups`, and `/api/user/models`, which do not match Sub2API.

Sub2API’s user dashboard exposes JWT-authenticated key management routes under the user API namespace (mounted as `/api/v1/keys` plus `/api/v1/groups/available` and `/api/v1/groups/rates`). Its request/response model differs from the extension’s shared token shape:

- quotas are expressed in USD, while the extension stores token quota in internal `quota` units;
- expiration is expressed as `expires_in_days` or ISO `expires_at`, while the shared UI uses epoch seconds;
- writes target `group_id`, while the shared token form stores a string `group` value;
- Sub2API key writes do not accept the shared model-limit fields.

The good news is that the existing Sub2API module already provides most of the hard parts we need to reuse: `{ code, message, data }` envelope parsing, JWT normalization, localStorage/session re-sync, refresh-token-based JWT renewal, and secret redaction.

## Goals / Non-Goals

**Goals:**

- Make Sub2API keys available to existing shared key workflows without adding site-specific branches to every consumer.
- Support list/copy/export/create/edit/delete flows for `sub2api` accounts using the existing UI surfaces.
- Reuse Sub2API’s current auth-recovery behavior so key requests can survive expired JWTs when a refresh token or dashboard session is available.
- Normalize Sub2API key/group data into the extension’s shared `ApiToken` and `UserGroupInfo` models.
- Keep user-facing secret handling unchanged: keys remain masked by default, are copied/exported only on explicit user action, and are never logged.

**Non-Goals:**

- No changes to automatic key provisioning / missing-key repair eligibility. The existing `account-key-auto-provisioning` capability continues to skip `sub2api` accounts.
- No support for upstream-only advanced fields that the extension does not currently model, such as custom keys, IP blacklist entries, rate-limit controls, or reset-usage actions.
- No dedicated “create managed-site channel from Sub2API” flow in this change; downstream exports continue to consume the token inventory returned by the shared APIs.
- No attempt to support Sub2API model-limit configuration. The existing shared model-limit UI should remain hidden for this site type.

## Decisions

### 1) Implement Sub2API key APIs as site overrides, not UI forks

Add Sub2API implementations for the shared token-management helpers inside `src/services/apiService/sub2api/index.ts` (and related Sub2API parsing/types files), including:

- `fetchAccountTokens`
- `fetchTokenById`
- `createApiToken`
- `updateApiToken`
- `deleteApiToken`
- `fetchUserGroups`
- `fetchAccountAvailableModels`

This keeps existing callers unchanged because `getApiService(account.siteType)` already resolves to site overrides before falling back to common helpers.

**Alternatives considered**
- Add `if (siteType === "sub2api")` branches in each UI hook/component: larger blast radius, more review surface, and easier to miss export/copy flows.
- Create a separate Sub2API-only key-management page/dialog: duplicates mature shared UI that already solves masking, copy, edit, delete, and export workflows.

### 2) Introduce a shared Sub2API authenticated-request wrapper for CRUD + list operations

Today, `refreshAccountData` contains Sub2API-specific JWT recovery logic, but CRUD/list key calls would otherwise need to duplicate that logic. This change should factor the common behavior into an internal helper used by all Sub2API key/group requests.

The helper should:

- normalize the incoming JWT-bearing `ApiServiceRequest`;
- proactively refresh the access token when `tokenExpiresAt` is close and a refresh token exists;
- retry once after a 401 by either using refresh-token renewal or dashboard-session re-sync;
- redact sensitive token values in logs/errors;
- surface actionable login-required errors when recovery is impossible.

When a request successfully refreshes or rotates credentials and `request.accountId` is present, the helper should persist the new auth data back to the matching stored account via the existing account storage update path. This prevents repeated stale-token retries and preserves rotated refresh tokens discovered during key-management operations.

**Alternatives considered**
- Duplicate the refresh/re-sync logic in each CRUD/list method: easy to drift and harder to test.
- Recover credentials only in memory for the current request: simpler, but repeated dialogs/actions would continue using stale persisted credentials and could lose a rotated refresh token.
- Push Sub2API-specific recovery into the generic common fetch helper: increases coupling in the shared One-API path for a backend family with very different auth semantics.

### 3) Add an explicit Sub2API token translation layer instead of changing shared token types

Sub2API key payloads should be translated at the adapter boundary so the rest of the extension can continue using shared token types.

The mapper should normalize Sub2API key records into `ApiToken` by:

- mapping active/inactive status to the numeric convention the current UI already uses (`status === 1` means enabled);
- converting quota/usage amounts from USD into internal quota units using the same conversion factor already used for Sub2API account balance;
- converting `expires_at` timestamps into shared `expired_time` epoch seconds (`-1` when unlimited / absent);
- flattening supported IP whitelist data into the shared `allow_ips` string field;
- preserving the raw key value for copy/export flows when the upstream list response provides it.

The write mapper should translate the shared `CreateTokenRequest` into Sub2API’s request shape by:

- converting `remain_quota` back into USD `quota` unless the token is unlimited;
- converting `expired_time` into `expires_in_days` for create and ISO `expires_at` for update;
- splitting the shared `allow_ips` text field into Sub2API `ip_whitelist` arrays;
- ignoring unsupported shared fields (`model_limits_enabled`, `model_limits`) rather than pretending they are enforced upstream.

**Alternatives considered**
- Expand the shared `ApiToken` / form DTOs to include both One-API and Sub2API shapes: too invasive for a compatibility adapter.
- Silently pass shared model-limit fields through to Sub2API writes: misleading, because the upstream create/update handlers do not accept them.

### 4) Resolve groups in two layers: synthetic read model, fresh write lookup

The shared add/edit token UI expects `fetchUserGroups()` to return `Record<string, UserGroupInfo>` keyed by group name, but Sub2API writes require `group_id`.

To keep the UI unchanged:

- `fetchUserGroups` should combine Sub2API’s available-groups and group-rate endpoints into a synthetic `Record<string, UserGroupInfo>` keyed by displayable group name.
- `fetchAccountAvailableModels` should return an empty array for `sub2api`, which automatically hides the shared model-limit section in `AdvancedSettingsSection`.
- `createApiToken` / `updateApiToken` should perform a fresh available-groups lookup when resolving the selected `group` string back to `group_id`.

The write path should fail with a user-facing error if a non-empty selected group can no longer be resolved, rather than silently remapping the token to a different group.

**Alternatives considered**
- Cache group-name-to-id mappings in component state or global storage: adds invalidation problems and cross-context coupling for little benefit.
- Add new UI state carrying both group id and name: larger form/UI change than needed.

### 5) Follow the mounted Sub2API user routes, not stale inline comments

Sub2API source currently contains at least one stale inline comment referring to `/api/v1/api-keys`, while the mounted route group and frontend client use `/api/v1/keys`. The extension should implement against the mounted route shape used by the upstream user client and keep route constants centralized in the Sub2API adapter.

This decision reduces the chance of scattering hard-coded path guesses across the codebase and makes compatibility fixes easier if downstream forks diverge.

**Alternatives considered**
- Mirror handler comments verbatim: too risky when the router and frontend point to a different path.
- Infer routes ad hoc inside each method: harder to review and more brittle.

## Risks / Trade-offs

- [JWT expiry during interactive key actions] More user-facing flows now depend on short-lived Sub2API JWTs → Reuse refresh/re-sync recovery in a shared helper and persist auth updates when they change.
- [Route / response drift across Sub2API forks] Sub2API is evolving and route comments are not fully trustworthy → Keep route constants local to the adapter, parse the standard envelope defensively, and add adapter-focused tests for the exact request/response shapes we support.
- [Shared-form mismatch] The shared token dialog models One-API-style fields that Sub2API does not fully support → Adapt only the overlapping subset, hide model-limit UI by returning no models, and keep unsupported upstream-only features out of scope for this change.
- [Extra group lookup on writes] Resolving `group` to `group_id` at write time adds an additional request → Accept the small latency cost in exchange for not introducing stale caches or cross-component state.
- [Secrets appearing in more flows] Copy/export/list operations for Sub2API will now hold raw key values in memory → Continue using masked-by-default rendering, explicit copy/export actions, and redacted logging only.

## Migration Plan

- No storage schema migration is required; existing `sub2api` accounts automatically gain key-management support once the adapter is shipped.
- Add the Sub2API token/group adapters, wire localized error strings if needed, and extend focused tests around the Sub2API service layer plus impacted key-management hooks.
- Rollback is a straightforward code revert because no persisted data model or route contracts inside extension storage change.

## Open Questions

- If a Sub2API deployment returns masked/partial key values from list responses instead of full key strings, should copy/export flows fetch token details on demand via `fetchTokenById` before exposing the value?
  - Current upstream user UI strongly suggests list responses include the key value, so this change can proceed without making detail fetches mandatory.
  - If a divergent deployment proves otherwise, the adapter surface already has a natural fallback point: use `fetchTokenById` before copy/export for Sub2API only.

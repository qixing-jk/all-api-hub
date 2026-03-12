## Context

Key Management currently loads token inventories in `useKeyManagement` and renders each token through `TokenListItem` / `TokenHeader`. The managed-site import action in `TokenHeader` calls `useChannelDialog().openWithAccount`, which prepares channel form data and then uses `managedSiteService.findMatchingChannel(...)` to detect duplicates only when the user starts an import.

That existing duplicate-check path is close to what this change needs, but it is not sufficient by itself for a list-level status badge. Today `findMatchingChannel` returns only `ManagedSiteChannel | null`, so callers cannot distinguish between:

- no matching channel exists
- managed-site admin config is missing
- the backend can only provide base-url/models matches because key material is unavailable
- the search failed or was rate-limited

This ambiguity matters because the requested UX needs a conservative `unknown / not verifiable` state rather than confidently showing `not added` when the extension cannot prove it.

## Goals / Non-Goals

**Goals:**

- Show a managed-site channel status for each visible key in Key Management before the user clicks import.
- Reuse the existing managed-site channel matching flow and provider-specific logic instead of inventing a second matching system.
- Provide a refreshable, rate-limit-aware check flow that works for New API, Done Hub, and Octopus managed-site modes, and returns an explicit unsupported `unknown` state for Veloera where reliable absence checks are not possible.
- Preserve security guarantees by keeping plaintext keys out of logs, toasts, and persisted cache.
- Keep the async orchestration in container hooks/services rather than pushing network work into presentational components.

**Non-Goals:**

- Persist status results across browser sessions or extension contexts.
- Change the existing import dialog workflow, duplicate-warning dialog, or channel-creation payloads.
- Guarantee a precise answer when the backend cannot expose comparable key material.
- Introduce new managed-site provider support beyond the currently supported managed-site types.

## Decisions

### 1. Add a dedicated managed-site key status service that returns richer outcomes

Create a new service layer for Key Management status checks, for example under `src/services/managedSites/`, that wraps the existing managed-site helpers and returns a discriminated result such as:

- `added`
- `not-added`
- `unknown`

with optional reason codes and matched channel metadata.

This service should:

- resolve the current managed-site service and config
- call `prepareChannelFormData(account, token)` to derive normalized channel inputs
- short-circuit provider modes that cannot support trustworthy absence checks, currently Veloera
- attempt exact matching through the provider, including provider-specific fallbacks such as fetching DoneHub channel details by id when list/search payloads omit comparable key material
- perform weaker base-url/models-only and base-url-only matching to surface manual follow-up targets when exact comparison is unavailable
- normalize null search responses and unexpected failures into explicit `unknown` reasons rather than silently collapsing them into `null`

Rationale:

- the current `findMatchingChannel` API is adequate for import-time duplicate detection, but it is too coarse for a status badge that must explain uncertainty
- keeping richer status semantics in a wrapper avoids breaking existing callers such as `useChannelDialog` and account actions
- encapsulating DoneHub detail fetches and Veloera short-circuit logic in the wrapper keeps provider quirks out of the Key Management hook/UI

Alternative considered:

- expand `findMatchingChannel` to return a union instead of `ManagedSiteChannel | null`
- rejected because it would force unrelated duplicate-check flows to absorb UI-specific status semantics

### 2. Keep cache and queue ownership in `useKeyManagement`

The Key Management hook already owns token inventory loading, selection epochs, and per-account request guards. The new status cache should live alongside that state instead of inside `TokenHeader` or persistent storage.

The hook should maintain:

- a per-token status map keyed by token identity plus the active managed-site config fingerprint
- pending / refreshed-at metadata for rendering and invalidation
- a refresh trigger that can requeue checks for the current selection

Invalidation should happen when:

- token inventories reload for an account
- the managed-site type or managed-site config changes
- a token is edited or deleted
- a managed-site import succeeds for a token

Rationale:

- this aligns with the current Key Management architecture, where container hooks own async workflows and presentational components only render state
- an in-memory cache is sufficient because the status is derived, admin-config-dependent, and cheap to discard on page reload

Alternative considered:

- persist the status cache in extension storage
- rejected because it increases invalidation complexity and risks surfacing stale results after admin config or backend verification state changes

### 3. Use bounded background checking with conservative status classification

Status checks should run automatically after token inventories are available for the current selection, but with bounded concurrency against the managed-site admin backend. Unlike token inventory loading, the pressure point here is the single managed-site endpoint, so the limiter should be a small fixed worker pool rather than per-account-origin grouping.

Classification should be conservative:

- `added`: an exact key-comparable match is found
- `not-added`: exact key material is available, provider search completes, and no exact match, base-url/models match, or base-url-only match is found
- `unknown`: config is missing, comparable inputs cannot be prepared, exact key material is unavailable from the prepared inputs, only a weak base-url/models or base-url-only match is available, provider search is unsupported for reliable absence checks, or the search returns an unusable response or fails unexpectedly

When a weak or exact match exists, the result should carry channel id/name metadata so the UI can link the user into channel management instead of only showing a dead-end badge.

Rationale:

- the requested UX explicitly calls out unverifiable situations such as New API two-step verification when weak matches or missing comparable inputs prevent exact confirmation
- treating unverifiable cases as `not-added` would create false confidence and reintroduce duplicate imports

Alternative considered:

- mark weak no-match results as `not-added`
- rejected because provider search limitations and hidden keys can produce false negatives

### 4. Surface status in the token header and add a page-level refresh action

The status indicator belongs near the existing token metadata in `TokenHeader`, where users already decide whether to copy, edit, or import a key. The page should also expose a refresh action from the Key Management header so users can re-run all visible checks after changing managed-site config or completing verification on the backend.

The UI contract should include:

- `checking` as a transient loading state
- a badge or equivalent compact label for `added`, `not added`, and `unknown`
- localized explanatory text for unknown reasons, including a New API-specific hidden-key hint when exact verification is unavailable
- a matched-channel link that opens managed-site channel management for exact or weak matches
- targeted invalidation after a successful import so a newly imported token can flip to `added` without waiting for a full page reload

Rationale:

- page-level refresh is simpler and clearer than forcing users to re-open the page or click a per-token action dozens of times
- targeted invalidation keeps the status trustworthy after local actions that obviously affect one token
- inline explanatory text plus the matched-channel link covers the current UX without adding separate per-token refresh or remediation controls

Alternative considered:

- expose only a per-token manual “check” action
- rejected because it delays the feature’s main value: preventing unnecessary import attempts up front

## Risks / Trade-offs

- [Large token lists can generate too many admin requests] -> Use a small worker pool, deduplicate queued checks by token identity, and cache within the current session.
- [Provider helpers currently collapse many outcomes into `null`] -> Wrap them in a richer status service and classify unexpected failures as `unknown`, never `not-added`.
- [Status can become stale after import, edit, or delete actions] -> Invalidate affected token/account entries whenever token inventories reload or managed-site import succeeds.
- [Conservative `unknown` results may feel less decisive] -> Include reason-specific copy and, when possible, a link into managed-site channel management for manual confirmation.
- [Managed-site preferences can change while the page is open] -> Include managed-site configuration in the cache fingerprint and reset status state when those preferences change.

## Migration Plan

No stored data, API schema, or browser permission migration is required. Rollout is additive: ship the status service, UI badge, refresh control, and localized copy together. Rollback is code-only and consists of removing the status UI/service without any cleanup step.

## Resolved UX Decisions

- Refresh is page-wide only in the current implementation; individual tokens refresh opportunistically after a successful managed-site import.
- `unknown` reasons render as inline helper text next to the badge, and matched channels render a direct link into managed-site channel management instead of separate remediation buttons.

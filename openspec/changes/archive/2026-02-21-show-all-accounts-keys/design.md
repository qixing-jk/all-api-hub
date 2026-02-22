## Context

The Options → Key Management page supports viewing/managing tokens for a single selected account, and an aggregated “All accounts” mode that lists tokens across all enabled accounts:

- `entrypoints/options/pages/KeyManagement/hooks/useKeyManagement.ts` maintains a per-account `tokenInventories` map and derives flattened `AccountToken[]` lists for rendering and search.
- `AccountToken` extends `ApiToken` with `{ accountId, accountName }` so token ownership and actions are resolved via `accountId` (not display name).
- Key masking/visibility is tracked via `visibleKeys: Set<string>` keyed by a collision-safe identity key `${accountId}:${tokenId}`.

This enables “show all keys from all accounts” while:

- Keeping token values treated as secrets (masked by default, explicit reveal/copy).
- Isolating per-account failures (a single account failing to load tokens must not block other accounts).
- Preserving correct scoping for token actions (copy/export/edit/delete must operate on the owning account).

There is an existing pattern for per-site token inventory loading with isolated failures in `components/KiloCodeExportDialog.tsx` using a `tokenInventories` map keyed by `siteId`.

## Goals / Non-Goals

**Goals:**

- Add an “All accounts” selection option in Key Management.
- In “All accounts” mode, load token inventories per account on-demand, incrementally, and with per-account loading/error states.
- Ensure token actions remain correctly scoped to the owning account (no reliance on account name uniqueness).
- Avoid key/ID collisions when multiple accounts return tokens with the same numeric `token.id`.
- Maintain current secret-handling behavior (masked by default; reveal/copy requires explicit user action; no logging of keys).

**Non-Goals:**

- No storage persistence for aggregated token inventories (in-memory only).
- No changes to key repair / auto-provisioning behavior (separate capability/spec).
- No large UI redesign (keep existing token card/list structure; only add the minimum UX needed for “all accounts” mode).

## Decisions

### 1) Represent “All accounts” via a sentinel account id

Use a sentinel value (e.g., `selectedAccount = "all"`) in Key Management state, matching existing patterns used in other pages (e.g. Model List).

**Alternatives considered**
- Separate boolean flag (`isAllAccounts`) + `selectedAccountId`: more state wiring, more branching in components.
- Separate route/page: unnecessary scope.

### 2) Make token entries explicitly account-scoped

Extend the Key Management token type to include `accountId` (and continue carrying `accountName` for display), e.g.:

- `AccountToken = ApiToken & { accountId: string; accountName: string }`

All token actions (`edit`, `delete`, export integrations) should resolve the owning account via `accountId` (Map lookup from `enabledDisplayData`) rather than `accountName` matching.

**Alternatives considered**
- Keep name-based lookup: breaks if names collide or change, and complicates “all accounts” mode.

### 3) Key visibility state must be collision-safe

Replace `visibleKeys: Set<number>` with `visibleKeys: Set<string>` using a composite selection key: `${accountId}:${tokenId}`.

Update `formatKey` / `KeyDisplay` to use this composite identity rather than a bare `token.id`.

**Alternatives considered**
- Derive a globally unique numeric id: brittle and unnecessary.

### 4) Use per-account token inventory state (pattern reuse)

Model token loading similarly to `components/KiloCodeExportDialog.tsx`:

- `tokenInventories: Record<accountId, { status: "idle"|"loading"|"loaded"|"error"; tokens: AccountToken[]; errorMessage?: string }>`

Derive a flattened `AccountToken[]` for rendering and searching:

- For single-account mode, the map has just one entry.
- For “all accounts” mode, entries update independently as requests resolve.

This structure enables:

- Partial success rendering while other accounts are still loading or failed.
- Retrying a single account without reloading everything.

### 5) Loading strategy for “All accounts” mode

When `selectedAccount === "all"`:

- Iterate enabled accounts (`useAccountData().enabledDisplayData`) and call `fetchAccountTokens` per account.
- Update `tokenInventories[accountId]` to `loading` before request, then `loaded`/`error` after.
- Continue processing remaining accounts even if one fails.

To avoid overloading upstreams, introduce light concurrency control:

- Serialize requests per normalized origin (`new URL(baseUrl).origin`) so accounts sharing a site are not fetched concurrently.
- Allow parallelism across distinct origins (no global cap).

Also guard against races:

- Use a selection epoch + per-account request epochs so switching selection (from “all” to single, or to a different account) ignores stale updates (requests are not aborted).

**Alternatives considered**
- `Promise.all` across all accounts: fastest but can flood a site and makes partial progress UX harder.
- Strictly sequential: simplest but may feel slow for many sites.

### 6) UI adjustments (minimal)

- Account selector (`components/AccountSelectorPanel.tsx`) adds an “All accounts” option at the top.
- Summary/counts line:
  - In single mode, keep current counts.
  - In “all” mode, show aggregated counts from the flattened token list and optionally a small progress indicator (loaded accounts / total).
- Error surfacing:
  - Show an inline warning/alert when one or more accounts failed to load tokens, listing affected account names and a “Retry failed” action.
- Aggregated token list UX:
  - Group tokens by account with collapsible sections (collapsed by default).
  - Provide “Expand all” / “Collapse all” controls.
  - Provide a per-account summary bar for quick filtering; when filtered, force the target account group expanded.
- Add token dialog:
  - If `selectedAccount === "all"`, open `AddTokenDialog` with `preSelectedAccountId = null` so the user chooses the target account.

Search matches against `token.name` only (case-insensitive). We intentionally do **not** search `token.key` because it is a secret value.

## Risks / Trade-offs

- [Security: more secrets in memory] Aggregating tokens increases the number of key strings held at once → Keep inventories in local component state only, keep masked by default, never log keys, clear state on close/navigation/unmount.
- [Performance: many accounts] Loading all token inventories may be slow or heavy → Load only when user selects “All accounts”, update incrementally, and serialize requests per origin (no global cap across distinct origins).
- [Race conditions] Rapid switching between accounts/modes could apply stale results → Use selection/request epoch guards to ignore outdated updates (requests are not aborted).
- [ID/name collisions] Token IDs and account names may collide across accounts → Use `accountId` for ownership and `${accountId}:${tokenId}` for UI identity/visibility state.

## Migration Plan

- No persisted data schema changes required.
- Ship as an options-page-only behavior change with new i18n strings.
- Rollback is a simple code revert (no migrations).

## Open Questions

- **Resolved:** For now, treat unsupported auth/site types the same as other failures and surface a generic “load failed” state.
  - Rationale: reliably detecting “unsupported” vs transient/network errors is backend-specific and easy to misclassify.
  - Follow-up: if we later add explicit capability checks (or standardized error codes) per site type, introduce a distinct UI label (e.g. “unsupported”) and a separate `errorType` for `AccountSummaryBar`.

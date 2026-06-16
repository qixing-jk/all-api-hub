# Sub2API All-Key Model Comparison Design

Date: 2026-06-16

## Purpose

Make Sub2API accounts with multiple saved runtime keys participate naturally in
the all-accounts Model List comparison. Instead of requiring the user to choose
one key first, the all-accounts view should load each usable Sub2API key as its
own comparable source.

## Current Context

Sub2API does not expose account-level pricing compatible with One API or New
API. The existing Sub2API Model List path correctly uses each runtime API key
against `/v1/models` and then applies estimated pricing only when the key's
group and model price table can be resolved.

The current all-accounts integration is intentionally conservative:

- `src/features/ModelList/hooks/useModelData.ts` returns Sub2API fallback
  pricing only when `fetchDisplayAccountTokens(account)` returns exactly one
  token.
- `AccountPricingContext` currently carries `{ account, pricing }`, so the
  downstream model row source only knows the owning account.
- `src/features/ModelList/hooks/useFilteredModels.ts` builds row identity with
  `getModelItemKey()` as `account:<accountId>:<modelName>` for account-backed
  rows.
- Model row source labels come from
  `src/features/ModelList/sourceLabels.ts`, which formats account rows as
  account name plus host.

That shape is sufficient for one account-level catalog per account. It is not
sufficient for Sub2API multi-key comparison because two keys under the same
account may expose different model lists, groups, and estimated prices.

## Decision

In all-accounts mode, Sub2API should default to loading all active saved
runtime keys and treating each loaded key as an independent comparison source.

This is the same user-facing comparison idea as New API group-aware sorting:
the user asks "which source is best for this model?", and the list evaluates
all configured viable sources. The source unit differs by backend:

- New API-family accounts: the account is the source, and groups are price
  candidates inside that source.
- Sub2API accounts: each runtime key is the source because model visibility and
  group/rate context are key-scoped.

The UI must make the key dimension visible. It must not silently merge multiple
Sub2API keys under a single account row identity.

## Goals

- In all-accounts mode, load every active saved Sub2API token that can be used
  for runtime model discovery.
- Keep each Sub2API key distinct for sorting, lowest-price badges, row keys,
  verification context, and source labels.
- Preserve model rows when a key has model-list data but unavailable prices.
- Allow one failing Sub2API key to fail independently without dropping the
  whole Sub2API account.
- Avoid exposing secrets, raw key values, backend messages, or group ids in UI
  or telemetry.
- Keep single-account fallback behavior unchanged unless implementation needs a
  small shared helper.

## Non-Goals

- Do not add a user preference screen for key inclusion in the first version.
- Do not make dashboard channel pricing a dependency.
- Do not reclassify Sub2API as supporting exact account-level
  `fetchModelPricing`.
- Do not load disabled/deleted/unusable tokens when the token list exposes an
  active/enabled flag.
- Do not deduplicate keys by group or model list in the first version. Duplicate
  rows are acceptable when they represent distinct configured keys.

## Data Model

Add explicit source identity metadata to all-account pricing contexts:

```ts
export interface AccountPricingContext {
  account: DisplaySiteData
  pricing: PricingResponse
  sourceIdentity?: {
    kind: "account" | "account-token"
    id: string
    tokenId?: number
    tokenName?: string
  }
}
```

Default account-level contexts should use either no `sourceIdentity` or
`{ kind: "account", id: account.id }`. Sub2API all-key contexts should use:

```ts
{
  kind: "account-token",
  id: `${account.id}:token:${token.id}`,
  tokenId: token.id,
  tokenName: token.name,
}
```

The source identity is display and comparison metadata only. It must never
store the raw token key.

## Loading Design

Replace the single-key-only all-accounts helper with a multi-source loader:

```ts
async function fetchSub2ApiAllAccountsFallbackPricingContexts(
  account: DisplaySiteData,
): Promise<AccountPricingContext[]> {
  const tokens = await fetchDisplayAccountTokens(account)
  const usableTokens = tokens.filter(isUsableSub2ApiRuntimeToken)
  return mapWithConcurrency(usableTokens, 4, async (token) => ({
    account,
    pricing: await loadAccountTokenFallbackPricingResponse({ account, token }),
    sourceIdentity: {
      kind: "account-token",
      id: `${account.id}:token:${token.id}`,
      tokenId: token.id,
      tokenName: token.name,
    },
  }))
}
```

If the current `ApiToken` type does not expose a reliable active flag, the first
implementation may treat all fetched tokens as usable and document that choice
in a short helper comment.

The helper should live near `useAllAccountsModelData()` at first because it is
hook orchestration logic. If the code becomes difficult to test or grows beyond
loading orchestration, split it into a focused module under
`src/features/ModelList/hooks/` rather than moving React state concerns into
`src/services/`.

### Per-Key Error Handling

Each token load should settle independently.

- Success: include an `AccountPricingContext` for that key.
- Invalid payload for one key: omit that key and record a key-source failure in
  the account query summary.
- Auth/network/business failure for one key: omit that key and record a
  key-source failure in the account query summary.
- All keys fail or no usable keys exist: treat the Sub2API account as failed or
  unsupported for all-accounts data, using the existing all-account error state.

The first implementation can keep the current aggregate account-level
`AccountQueryState` shape if it only needs to say the account is partial or
failed. Per-key partial-failure details are a separate UI refinement, not part
of this first all-key comparison change.

### Concurrency

Use bounded concurrency for Sub2API keys inside one account. Four parallel key
loads is a reasonable first limit because it avoids a large burst against a
single deployment while still keeping all-accounts loading responsive.

Do not add a new dependency for this. A tiny local helper that walks the token
array with worker indexes is enough and avoids bundle cost.

## Filtering And Comparison

Update downstream row identity to use `sourceIdentity.id` when present:

```ts
export function getModelItemKey(
  item: Pick<CalculatedModelItem, "model" | "source" | "sourceIdentity">,
) {
  const sourceId =
    item.sourceIdentity?.id ??
    (item.source.kind === MODEL_MANAGEMENT_SOURCE_KINDS.ACCOUNT
      ? item.source.account.id
      : item.source.profile.id)

  return `${item.source.kind}:${sourceId}:${item.model.model_name}`
}
```

`RawModelItem` and `CalculatedModelItem` should carry the optional
`sourceIdentity` alongside `source`. Lowest-price grouping should still group
by model name and billing mode, not by key, so all Sub2API keys compete against
each other and against other accounts.

Account filters should remain account-level in the first version. Selecting or
excluding an account includes or excludes all of that account's Sub2API key
sources.

Group-derived state needs a deliberate split:

- account filter and account summary maps stay keyed by `account.id`
- source-level group candidates, group exclusions, price keys, and row keys use
  `sourceIdentity.id` when present

This prevents two Sub2API keys under the same account from leaking group
availability or exclusion state into each other while preserving the current
account-level sidebar behavior.

Account summary counts should remain account-level by default, summing all key
rows for that account. This matches the current account list and avoids adding
a new key-level sidebar surface. If duplicate model rows from multiple keys
make the count surprising, a separate key-source count should be designed as a
follow-up UI change.

## Source Labels

Extend model-row source labels to include token names when source identity is a
Sub2API account-token source:

```text
Account name / Token name · host
```

If the token name is empty, use a local fallback such as "Runtime key". The
label and title must not include the raw API key.

The same source identity should be used only for display and comparison. Row
actions that verify a model or open the key dialog should still receive the
owning account and model id. The current code can keep using
`source.account` for those actions.

## Refresh And Caching

All-accounts refresh should invalidate and reload each Sub2API key source for
the account. The cache key for Sub2API all-key contexts must include the token
id or source identity so two token catalogs under one account cannot overwrite
each other.

The existing `modelPricingCache` account-level cache should continue to apply
to backends that truly return one account-level pricing response. Sub2API
token-level fallback results need token-level cache identity if they are cached
in this path.

## UI Requirements

- The all-accounts Model List should show multiple rows for the same model when
  different Sub2API keys expose that model.
- The source badge should identify the account and token.
- Lowest-price badges should compare Sub2API token rows against other token
  rows and other accounts.
- Price-unavailable rows should still render, but should not win lowest-price
  comparison.
- A failed key should not show a blocking full-page error when at least one
  other source loaded successfully.
- No new manual selection control is required for the first version.

## Telemetry

Telemetry decision: reuse the existing Model List load-completion event and add
safe aggregate counts only if diagnostics already has a natural field location.

Safe new fields:

- `sub2apiTokenSourceCount`
- `sub2apiTokenSourceSuccessCount`
- `sub2apiTokenSourceFailureCount`

Do not record token ids, token names, group names, group ids, model ids, base
URLs, API keys, JWTs, or raw backend messages.

If adding those fields causes broad analytics schema churn, defer telemetry and
state that the first implementation reuses existing account success/failure
counts.

## Testing Strategy

Focused tests should cover:

- `useModelData` all-accounts mode loads two Sub2API tokens and returns two
  pricing contexts with distinct `sourceIdentity.id` values.
- A single failed Sub2API token does not remove another successful token source.
- All Sub2API tokens failing leaves the account in a load-failed state.
- `useFilteredModels` keeps two same-account Sub2API rows for the same model
  distinct and marks the cheapest comparable token as lowest price.
- `getModelItemKey()` includes source identity so two token rows with the same
  account and model do not collide.
- Token-qualified group candidates and group exclusions do not leak between two
  keys under the same account.
- Source-label formatting includes token name and never includes a raw key.
- Account filter still includes/excludes all token sources under the account.

No Playwright E2E is required for the first implementation because the risk is
data identity, loading orchestration, and sorting behavior. Vitest coverage at
hook and formatter level is the right layer unless implementation introduces a
new interactive control.

## Validation

Focused validation:

- `pnpm vitest --run tests/entrypoints/options/pages/ModelList/useModelData.test.tsx`
- `pnpm vitest --run tests/entrypoints/options/pages/ModelList/useFilteredModels.test.ts`

Commit gate:

- `pnpm run validate:staged`

Run `pnpm run validate:push` only if the implementation changes shared exports,
analytics event schema, dependency wiring, or build configuration.

## Rollout

Implement as one scoped feature branch with three small commits:

1. Add source identity types and row identity/label tests.
2. Add Sub2API all-key loading with bounded concurrency and hook tests.
3. Add partial-failure diagnostics and final validation fixes.

If the source identity change touches too many model-row action surfaces, split
the identity plumbing into its own PR and keep the Sub2API loader change for a
second PR.

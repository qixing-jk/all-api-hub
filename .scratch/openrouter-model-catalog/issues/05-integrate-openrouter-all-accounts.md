# Integrate OpenRouter into All-Accounts Model Comparison

Status: ready-for-agent

Blocked by: 03

## Objective

Include OpenRouter in the existing all-accounts Model List without duplicating provider-wide public data, inflating counts, weakening partial-failure behavior, or comparing semantically incompatible prices.

## Scope

- Extend the existing account-source orchestration with provider-neutral catalog scope and source identity.
- Represent one or more OpenRouter public catalogs as one provider-wide source, even when multiple saved accounts refer to the provider.
- Preserve ordinary account sources and any future verified personalized OpenRouter source as account-specific sources.
- Keep successful sources visible when an OpenRouter or another account source fails.
- Update account/source summaries so affected accounts and provider-wide fallback state remain understandable without duplicating model rows.
- Use only canonical semantically comparable prices for existing cheapest-model behavior; native price dimensions and overrides remain informational.
- Preserve filtering, sorting, virtualization, deduplication, refresh, and source attribution.

## Acceptance Criteria

- Two saved OpenRouter accounts backed by the same public catalog create one provider catalog source and do not double counts or price comparisons.
- An ordinary account and OpenRouter can be shown together with stable source identity and no collision when request model IDs match.
- A failed source does not remove successful sources, and summaries identify partial failure and provider-catalog fallback accurately.
- Refresh invalidates the correct provider- or account-scoped cache without cross-source contamination.
- Existing filtering and sorting never compare native price dimensions as though they were canonical token prices.
- No OpenRouter-specific conditional is added to shared all-account React orchestration.

## Tests

- Cover one ordinary account plus OpenRouter, multiple OpenRouter accounts, identical model IDs from different sources, public-source collapse, partial failure, counts, summaries, cache invalidation, filtering, sorting, and comparable-price selection.
- Prefer observable combined results and rendered source identity over mock-call ordering.

## Telemetry and E2E Decision

- Reuse existing aggregate model-load telemetry with controlled scope/status counts only if already supported; never send account IDs, model IDs, provider URLs, or raw errors.
- If personalized support is deferred, add the representative Chromium E2E here: OpenRouter deep link, rich details, mixed all-accounts mode, unsupported-action absence, and public-catalog scope disclosure.

## Comments

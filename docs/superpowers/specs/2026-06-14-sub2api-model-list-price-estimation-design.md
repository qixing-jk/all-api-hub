# Sub2API Model List And Price Estimation Design

Date: 2026-06-14

## Purpose

Add a correct Sub2API model-list path and define a guarded price-estimation
path for Model List without reintroducing incompatible One-API/New-API common
pricing behavior.

Sub2API is not One-API/New-API compatible. Its runtime model list is keyed by
the API key's group, while its dashboard user APIs expose group visibility and
user-specific group rates. The first implementation should use those contracts
directly and label derived prices as estimates.

## Current Context

The adapter capability contract currently marks Sub2API model pricing as
unsupported. That is correct for full, backend-accurate model pricing because
Sub2API does not expose a key-scoped pricing endpoint equivalent to common
`/api/pricing` surfaces.

Upstream Sub2API does provide two relevant data paths:

- API-key runtime model discovery:
  - `GET /v1/models`
  - `Authorization: Bearer <api key>`
  - returns the models visible to that API key.
- Dashboard user group pricing inputs:
  - `GET /api/v1/groups/available`
  - `GET /api/v1/groups/rates`
  - `Authorization: Bearer <dashboard JWT>`
  - returns user-visible groups and user-specific group-rate overrides.

The related Price-Monitor-AI-Api project uses the same user group inputs plus a
LiteLLM-style official price table to produce price rows. Its README explicitly
states that `/v1/models` is only a model-probe source and not a complete price
directory. Its Sub2API user-price logic multiplies official model prices by the
effective group rate.

## Verified Sub2API Behavior

### Runtime Model List

Sub2API registers `/v1/models` on the gateway route with API-key auth. The
handler resolves the API key from context, reads its group and platform, then
calls `GatewayService.GetAvailableModels(groupID, platform)`.

The returned list is key-scoped through the key's group:

- API key auth validates the key and loads `APIKey`, `User`, and `Group`.
- `Models` uses `apiKey.Group.ID` and `apiKey.Group.Platform`.
- `GetAvailableModels` lists schedulable accounts in that group/platform and
  collects model names from account model mappings.
- If the group enables a custom model list, the handler filters by that list.
- If no mapped models are available, the handler falls back to default platform
  model catalogs.

This means the correct model-list source for a saved Sub2API API key is the
runtime `/v1/models` endpoint, not `/api/v1/channels/available`.

### Dashboard Group Rates

Sub2API user routes expose:

- `GET /api/v1/groups/available`, handled by
  `APIKeyHandler.GetAvailableGroups`, returning groups the authenticated user
  may bind to.
- `GET /api/v1/groups/rates`, handled by
  `APIKeyHandler.GetUserGroupRates`, returning `map[groupID]rateMultiplier`
  for user-specific group-rate overrides.

These endpoints require dashboard JWT auth. They do not accept the runtime API
key as a substitute.

### Billing Calculation

For OpenAI-compatible requests, Sub2API usage recording resolves a rate
multiplier before calculating cost:

- start with configured/default rate
- when the API key has a group, resolve the effective user/group rate with
  `userGroupRateResolver.Resolve(userID, groupID, group.RateMultiplier)`
- pass that multiplier into `BillingService.CalculateCostUnified`

The base model pricing is resolved by `ModelPricingResolver`:

- channel pricing override
- LiteLLM/dynamic model price
- fallback price

For token pricing without channel overrides, the high-level relationship is:

```text
model base price * effective group rate
```

The Price-Monitor-AI-Api approach is therefore faithful to the simple/default
rate-multiplier part of Sub2API billing, but it is an estimate rather than a
complete billing replica.

## Problem

The product needs two related but distinct capabilities:

1. show the models a saved Sub2API key can actually use
2. show a useful price comparison when enough dashboard data is available

Treating these as one `fetchModelPricing` capability creates false precision:

- `/v1/models` is key-scoped but has no prices.
- `/api/v1/groups/available` and `/api/v1/groups/rates` provide rate inputs,
  but do not prove which group a specific key uses unless key metadata is
  also read.
- `official price * effective rate` misses Sub2API channel pricing overrides,
  interval pricing, image/per-request pricing, and model mapping choices.
- `/api/v1/channels/available` may contain channel pricing, but it is
  feature-gated, dashboard-scoped, and not a reliable key-scoped model-list
  source.

## Goals

- Add a Sub2API model-list path that uses the saved API key against
  `/v1/models`.
- Keep model-list availability separate from price-estimation availability.
- When dashboard JWT data is available, estimate model prices from the key's
  group, user group rates, and an official/LiteLLM price table.
- Mark estimated prices as estimated in the returned data and UI state.
- Avoid claiming support for exact Sub2API billing prices.
- Keep `/api/v1/channels/available` out of the first implementation's required
  path.
- Preserve strict adapter behavior for unsupported full model-pricing calls
  until the new estimated-price capability is explicitly modeled.

## Non-Goals

- Do not implement exact Sub2API usage-billing replication.
- Do not depend on `/api/v1/channels/available` for the first implementation.
- Do not scrape dashboard pages.
- Do not require a dashboard JWT just to show the API key's model list.
- Do not store or ship real provider prices in tests or fixtures; use reserved
  examples or tiny synthetic tables in tests.
- Do not change Sub2API key creation, refresh-token import, or browser-session
  recovery behavior outside the data needed for this feature.

## Design

### 1. Split Capability Semantics

Sub2API should not simply flip `capabilities.modelPricing` to `true` for the
first slice. That field currently implies a full account pricing response,
which would be misleading for estimated data.

Before Sub2API `/v1/models` rows flow through `PricingResponse`, the Model List
data model must represent price precision and unavailable prices explicitly.
Returning model-only rows with zero prices is not acceptable because current
filtering and sorting logic treats numeric zero as a real price.

Add explicit semantics at the model-list layer, either by extending
`PricingResponse.model_list_source`, adding pricing metadata to `ModelPricing`,
or adding source capability flags in the Model List data model:

- model list source: `sub2api-runtime-key`
- price source: `none`, `official-rate-estimate`, or future
  `channel-pricing`
- precision: `exact`, `estimated`, or `unavailable`
- unavailable-price reason: `model-list-only`, `key-group-unknown`,
  `official-price-missing`, or `pricing-source-unavailable`

The first implementation should expose:

- `supportsRuntimeModelList: true`
- `supportsPricing: false` when only `/v1/models` succeeds
- `supportsPricing: true` with `precision: estimated` only when the
  JWT/rate/official-price path succeeds

### 2. Runtime Model List

Add a Sub2API helper that calls:

```http
GET {baseUrl}/v1/models
Authorization: Bearer <apiKey>
Accept: application/json
```

Normalize both common OpenAI-style numeric `created` payloads and Sub2API's
observed `created_at` payload:

```json
{
  "object": "list",
  "data": [
    {
      "id": "example-model",
      "type": "model",
      "display_name": "example-model",
      "created_at": "2024-01-01T00:00:00Z"
    }
  ]
}
```

The normalized model rows should have no price fields unless the estimation
path can join prices later.

Failure behavior:

- 401/403: surface an API-key-specific model-list auth error.
- empty `data`: return an empty catalog with a clear empty state.
- malformed payload: fail the Sub2API account source and avoid falling back to
  common `/api/pricing`.

### 3. Key-Scoped Group Resolution

When dashboard JWT auth is available, resolve the saved API key's group before
estimating price.

Data sources:

- `GET /api/v1/keys` to list current user's keys.
- match the saved runtime key to a key DTO when possible.
- read its group id/name from the matched key.
- `GET /api/v1/groups/available` for group default metadata.
- `GET /api/v1/groups/rates` for user-specific rate overrides.

Implementation note: current local Sub2API key normalization maps backend key
DTOs into the existing `ApiToken` shape and preserves the group as `group`.
It does not currently preserve a separate stable `group_id`. The
implementation must either extend that normalized/storage shape to carry
`group_id`, or treat stored group information as a name and resolve it
conservatively against `/api/v1/groups/available`.

Matching must be conservative because some deployments may mask key values in
list responses:

- If the exact key cannot be matched, do not estimate by guessing the cheapest
  or first group.
- If the account already stores a Sub2API group selected during key creation,
  prefer a stored group id only if the implementation extends the normalized
  token/storage shape to preserve that id. The current token normalization
  preserves the group as a name-like value, not a stable `group_id`.
- If only a stored group name is available, resolve it conservatively against
  current available groups. A single exact name match may be used; no match or
  multiple matches must disable estimation.
- If neither exact key match nor conservative stored-group resolution is
  available, return the model list without prices and explain that the key
  group is unknown.

### 4. Official Price Table

Use an official/LiteLLM-style price table as the base price source, following
the Price-Monitor-AI-Api pattern.

Initial source options:

- bundled static snapshot for offline reliability
- optional remote refresh from a known model-price source when network access
  and project policy allow it

The implementation must preserve source metadata:

- price table source
- fetched-at or bundled snapshot date when available
- unmatched models count

Tests should use synthetic model names and prices.

### 5. Estimation Formula

For token models where the official table has token prices:

```text
effectiveRate = userGroupRate[groupId] ?? group.rate_multiplier ?? 1
estimatedInput = officialInput * effectiveRate
estimatedOutput = officialOutput * effectiveRate
estimatedCacheRead = officialCacheRead * effectiveRate
estimatedCacheWrite = officialCacheWrite * effectiveRate
```

Convert official per-token prices to this repository's existing
`ModelPricing`/display units consistently with existing `modelPricing` helpers.

When the official table lacks a model, include the model without pricing and
mark the price as unavailable. Do not synthesize zero-valued price fields for
unknown prices.

### 6. Channel Pricing Treatment

The spec must document channel pricing as a known accuracy gap.

Sub2API's real serving and billing can involve channel state. Channels are not
the base model-list source, but they can affect model mapping, restrictions,
and pricing. Sub2API's real billing resolves pricing through:

```text
channel pricing -> LiteLLM/base price -> fallback
```

Channel pricing can override token prices, define intervals, or use
per-request/image billing. The first implementation should not depend on
`/api/v1/channels/available` because:

- the endpoint is dashboard-scoped, not API-key runtime scoped
- the feature is opt-in and can return an empty list when disabled
- channel rows can span multiple groups/platforms and require careful mapping
- using it incorrectly can be worse than showing no price

Future enhancement:

- probe `/api/v1/channels/available` only when dashboard JWT is available
- use channel pricing only when it can be mapped to the saved key's resolved
  group, platform, and model
- mark source as `channel-pricing`
- keep fallback estimated prices visible only when the source is clearly
  labeled

## Data Flow

### Model List Only

1. User opens Model List for a Sub2API account.
2. App resolves the saved runtime API key.
3. Sub2API adapter calls `/v1/models` with API-key auth.
4. App displays key-scoped models with no price fields.
5. UI shows a source note: key runtime model list, prices unavailable.

### Model List With Estimated Prices

1. Runtime model list succeeds.
2. App checks whether dashboard JWT/refresh-token auth is available for the
   same Sub2API account.
3. App resolves dashboard JWT using existing Sub2API auth helpers.
4. App resolves the key's group via exact key match or stored group id.
5. App loads available groups and user group rates.
6. App loads official price table.
7. App joins visible runtime model ids to official price rows.
8. App applies effective group rate.
9. UI shows estimated prices with source and precision metadata.

## UI Requirements

- Do not label estimated data as exact pricing.
- Show model rows even when price estimation fails.
- When prices are estimated, display a short source state such as:
  "Estimated from official model prices and Sub2API group rate."
- When some models lack official prices, show those models as price
  unavailable rather than hiding them.
- When key group resolution fails, show prices unavailable with a local
  explanation.
- Avoid using raw backend error text directly for user-visible status.

## Telemetry

Telemetry decision: add result/summary event fields only if the implementation
already touches Model List refresh analytics.

Safe fields:

- source site type: `sub2api`
- runtime model list status: success/error/empty
- estimated pricing status: success/unavailable/error
- key group resolution status: matched/stored/missing
- counts: model count, priced model count, unpriced model count

Do not record:

- base URL
- model ids
- API keys
- JWTs
- group names or ids
- raw backend messages

## Testing Strategy

Unit tests:

- normalize Sub2API `/v1/models` payload with `created_at`.
- reject malformed runtime model-list payloads.
- join exact key or stored group id to available group metadata.
- refuse estimation when key group is unknown.
- apply user-specific group rate over default group rate.
- keep unpriced models when the official table lacks entries.
- label estimated price source and precision.
- do not call common `fetchModelPricing` for Sub2API runtime model list.

Hook/service tests:

- Model List displays Sub2API runtime models without prices when only API key
  auth is available.
- Model List displays estimated prices when dashboard auth and official prices
  are available.
- Cached estimated responses do not masquerade as exact pricing.

No Playwright E2E is required for the first implementation because the main
risk is adapter/data normalization and pricing-source semantics. Add E2E only
if implementation changes cross-entrypoint browser-session recovery or a new
interactive setup flow.

## Validation

Focused validation should include:

- affected Sub2API adapter tests
- affected Model List hook tests
- pricing utility tests for any new conversion helpers

Before handoff or commit:

- `pnpm run validate:staged`

Run broader `pnpm run validate:push` only if the implementation touches shared
exports, dependency graph wiring, or build configuration.

## Rollout

Implement in two phases:

1. Runtime model-list source:
   - add Sub2API `/v1/models` API-key helper
   - show models without prices
   - keep full `modelPricing` capability disabled
2. Estimated pricing enhancement:
   - resolve key group with dashboard JWT
   - load group rates and official price table
   - join estimated prices to runtime models
   - label source and precision

Channel pricing should remain a documented future enhancement until the mapping
from user-visible channel data to a specific key's resolved billing source is
verified and tested.

## Source References

Sub2API upstream:

- `backend/internal/server/routes/gateway.go`
- `backend/internal/handler/gateway_handler.go`
- `backend/internal/service/gateway_service.go`
- `backend/internal/handler/api_key_handler.go`
- `backend/internal/service/api_key_service.go`
- `backend/internal/service/openai_gateway_service.go`
- `backend/internal/service/model_pricing_resolver.go`
- `backend/internal/handler/available_channel_handler.go`

Price-Monitor-AI-Api reference:

- `README.md`
- `internal/app/model_probe.go`
- `internal/app/sub2api_prices.go`
- `internal/app/sub2api.go`

Existing repo context:

- `docs/superpowers/specs/2026-06-08-sub2api-adapter-seam-separation-design.md`
- `docs/superpowers/specs/2026-06-10-api-service-capabilities-design.md`

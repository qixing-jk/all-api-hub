# AIHubMix Model List Design

Date: 2026-05-23

## Purpose

AIHubMix should work in the existing Model List page with semantics that match
its API. The displayed model set should represent the current user's available
models when AIHubMix exposes that scope. The full `/api/v1/models` catalog
should provide the raw model metadata used to enrich those rows.

This design is based on the public clarification in
https://github.com/jerlinn/inferHub/issues/1:

- `/api/v1/models` is the authoritative complete catalog and metadata source.
- `/call/usr/avail_mdls` represents user-available models in the web app.
- `/api/user/available_models` is currently unavailable on the observed
  deployment, but is expected to return later with content aligned to
  `/call/usr/avail_mdls`.
- `/v1/models` is the OpenAI-compatible SDK discovery endpoint.
- `/api/models` is not the model-list source for this feature.

## Current Context

- The Model List page already loads account-backed data through
  `fetchModelPricing(request)` and expects a `PricingResponse` shape.
- AIHubMix is a strict API override site, so account-backed model-list support
  belongs in `src/services/apiService/aihubmix/`.
- The current AIHubMix adapter has `fetchAccountAvailableModels` and
  `fetchAllModels`, but they still use `/api/user/available_models` and
  `/api/models`.
- AIHubMix account API traffic is pinned to `https://aihubmix.com`, even when
  the user imported an account from `console.aihubmix.com`.
- AIHubMix does not have New API group semantics. Group fields must remain
  empty instead of inventing a `default` group.

## Goals

- Show AIHubMix models in the existing Model List page.
- Prefer the user-scoped model set when available.
- Use `/api/v1/models` as the raw catalog and metadata source.
- Fall back to a complete catalog view when user-scoped endpoints are
  unavailable.
- Clearly indicate catalog fallback when the actual user scope could not be
  confirmed.
- Disable or hide AIHubMix model features that do not have meaningful backend
  semantics.
- Keep the implementation inside existing adapter and Model List extension
  points.

## Non-Goals

- Do not create an AIHubMix-specific Model List page.
- Do not use `/api/models` as a new model-list dependency.
- Do not use `/v1/models` as the complete catalog source.
- Do not add managed-site model sync support for AIHubMix.
- Do not add fake New API groups, group ratios, or group filters.
- Do not change token creation, one-time key handling, or account import unless
  a narrow model-list call path requires it.

## Data Source Semantics

AIHubMix model loading has three layers:

1. Catalog layer: fetch `/api/v1/models` and treat it as the authoritative raw
   model directory.
2. User scope layer: try `/api/user/available_models` first. If it is
   unavailable, try `/call/usr/avail_mdls`.
3. Fallback layer: if both user-scope endpoints fail or return an unparseable
   payload, show the full `/api/v1/models` catalog with a catalog-fallback
   status.

If a user-scope endpoint succeeds with an empty array, the result is an empty
user-scoped list. It must not fall back to the full catalog, because an empty
successful response means the account currently has no available models.

The join key is the model identifier:

- user scope: `model`
- catalog: `model_id`

If user scope contains a model ID that is missing from the catalog, keep a
minimal row for that ID so the user-available model is not silently dropped.

## Adapter Design

AIHubMix should implement `fetchModelPricing(request)` in
`src/services/apiService/aihubmix/`.

Suggested internal helpers:

- `fetchAIHubMixModelCatalog`: loads `/api/v1/models`.
- `fetchAIHubMixUserScopedModelIds`: tries `/api/user/available_models`, then
  `/call/usr/avail_mdls`.
- `buildAIHubMixPricingResponse`: joins user scope and catalog data into the
  existing `PricingResponse` shape.
- `resolveAIHubMixModelListStatus`: returns whether the result is
  `user-scoped` or `catalog-fallback`.

The adapter should keep AIHubMix authentication behavior explicit:

- access-token requests use raw `Authorization: <access_token>`.
- API calls use `https://aihubmix.com`.
- `/call/usr/avail_mdls` is a fallback because it is a web-app user-scope
  endpoint. It should not become the primary catalog source.

## PricingResponse Mapping

The mapped response should preserve only fields that AIHubMix can support
meaningfully.

- `model_name`: catalog `model_id`, or the user-scope model ID for minimal rows.
- `model_description`: catalog `desc` or equivalent description field.
- `owner_by`: developer/provider name or ID when provided.
- `supported_endpoint_types`: catalog endpoint metadata when provided.
- model type, modalities, features, context length, output limits, and pricing:
  preserve via the closest existing fields or a narrowly added display metadata
  path when the current `PricingResponse` cannot represent them safely.
- `group_ratio`: `{}`.
- `usable_group`: `{}`.
- per-model `enable_groups`: `[]`.

The implementation must not synthesize `default` groups, fake group ratios, or
New API-only compatibility fields for AIHubMix.

## Model List Page Behavior

The existing Model List page remains the UI surface.

When an AIHubMix account is selected:

- load `fetchModelPricing(request)` through the normal account-backed path.
- if user scope succeeds, display only user-available models and do not show a
  fallback warning.
- if user scope is unavailable but `/api/v1/models` succeeds, display the full
  catalog and show a clear notice that the actual account-available scope could
  not be confirmed.
- if `/api/v1/models` fails, use the existing load-failed and retry behavior.

AIHubMix should hide or disable model-list controls whose semantics do not
apply:

- no group filter controls when all group data is empty.
- no group chips on model cards.
- no group-specific sorting or account summary data based on groups.
- no claims that catalog fallback models are definitely available to the
  account.
- pricing controls should only appear for fields that are reliably mapped from
  `/api/v1/models`; otherwise the page should behave like a catalog-only source
  for those parts.

Search, provider filtering, basic model display, and model verification can
reuse existing behavior as long as they operate on the mapped model IDs and do
not imply unavailable AIHubMix semantics.

## Error Handling

- `/api/v1/models` failure is a hard failure for the Model List page.
- `/api/user/available_models` failure is recoverable; continue to
  `/call/usr/avail_mdls`.
- `/call/usr/avail_mdls` failure is recoverable; use catalog fallback if the
  catalog was loaded.
- successful user-scope empty array is a valid empty list.
- malformed user-scope payload is recoverable and should trigger catalog
  fallback.
- malformed catalog payload is a hard failure.

The fallback notice should be local UI copy, not a raw backend message. Logs may
record which user-scope endpoint failed, but analytics and UI should avoid
including raw model IDs or secrets.

## Testing

Adapter tests should cover:

- `/api/v1/models` maps to `PricingResponse`.
- successful `/api/user/available_models` filters the catalog to user-scoped
  models.
- `/api/user/available_models` 404 falls through to `/call/usr/avail_mdls`.
- both user-scope endpoints failing returns catalog data with fallback status.
- successful empty user-scope returns an empty model list.
- user-scope IDs missing from catalog are kept as minimal rows.
- group fields are empty for AIHubMix.
- `/api/models` is not called by the new Model List path.

Model List tests should cover:

- AIHubMix user-scoped load does not show a fallback notice.
- AIHubMix catalog fallback shows the fallback notice.
- group controls are absent or disabled when the selected AIHubMix source has no
  group semantics.

E2E is not required for the first implementation because the main risk is
adapter source semantics and page state. If implementation touches route,
browser-extension runtime, or cross-entrypoint behavior, add or update a focused
Playwright scenario.

## Implementation Boundaries

Keep the first implementation focused on AIHubMix Model List support:

- update `src/services/apiService/aihubmix/`.
- add a small Model List status/capability path only if the existing
  `PricingResponse` contract cannot carry fallback status and AIHubMix
  capability masking cleanly.
- update locale source copy only where a new fallback notice or disabled-state
  text is needed.
- update tests around the touched adapter and Model List behavior.

Do not refactor unrelated model metadata, managed-site sync, token provisioning,
or API credential profile model discovery.

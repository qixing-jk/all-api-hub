# OpenRouter Public Catalog End-to-End

Status: ready-for-agent

Blocked by: none

## Objective

Make a saved OpenRouter account usable in the existing Model List and prove the provider-neutral presentation boundary with a real public catalog. The same slice must work in single-account and basic all-accounts mode.

## Scope

- Define the Product Canonical Model core and typed Model Display Fact seam needed by this real provider.
- Add the provider-local public catalog transport, runtime schemas, normalization Adapter, cache policy, and source registration.
- Request the documented public endpoint with all output modalities and without Authorization.
- Follow pagination, reject cycles or non-progressing pages, preserve cancellation, and avoid caching partial results as complete.
- Validate the response envelope and model identity strictly; normalize primary prices and core limits while preserving zero and distinguishing invalid from unknown.
- Render a concise provider-catalog source in single-account mode and combine it with ordinary sources in all-accounts mode.
- Collapse repeated OpenRouter public catalogs to one provider-wide source, retain stable source identity, preserve partial failures, and avoid incompatible price comparisons.
- Keep raw provider DTOs and provider-specific field identifiers out of shared React code, filtering, sorting, and orchestration.
- Derive actions from source capability and usable runtime-secret availability; Management Keys do not enable runtime-key actions.

## Acceptance Criteria

- Selecting an OpenRouter account shows a clearly identified Provider Model Catalog in the existing page.
- The public request never contains Authorization or another saved account secret.
- A multi-page response is complete and deterministically deduplicated; malformed envelopes and pagination cycles fail safely.
- Invalid rows cannot reach React or cache state; malformed optional facts are omitted rather than converted into misleading defaults.
- Legitimate free prices remain `0`; unknown or invalid prices remain unavailable.
- An ordinary account and OpenRouter can be shown together; repeated OpenRouter public data is represented once and does not inflate counts.
- Existing filtering, sorting, virtualization, source identity, loading, empty, refresh, cancellation, error, and partial-failure behavior remain usable.
- Generic tests prove a second provider can choose different fields and ordering without an OpenRouter branch in shared renderer logic.

## Tests

- Cover request URL/query construction, absence of Authorization, pagination, cancellation, envelope errors, blank identity, malformed fields, unknown fields, cache reuse, refresh, and error classification.
- Cover price normalization, zero/missing/negative/non-finite values, source collapse, partial failure, counts, filtering, sorting, and comparable-price selection.
- Cover generic presentation ordering, missing facts, structured fact rendering, long values, keyboard expansion, and unsupported-action absence with neutral fixtures.
- Add one representative Chromium flow that selects an OpenRouter account and then enters all-accounts mode.

## Telemetry and E2E Decision

- Reuse existing model-load analytics; add only controlled catalog-scope/source-variant values if needed.
- Keep telemetry free of model IDs, URLs, raw errors, payloads, and credentials.

## Comments

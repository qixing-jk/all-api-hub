# Integrate OpenRouter Public Catalog in Single-Account Model List

Status: ready-for-agent

Blocked by: 02

## Objective

Make a saved OpenRouter account selectable in the existing Model List and load the complete provider-wide public catalog without using its Management Key.

## Scope

- Add a provider-local public catalog transport, runtime schemas, normalization Adapter, cache policy, and source registration.
- Request `GET https://openrouter.ai/api/v1/models` with all output modalities and without Authorization.
- Follow documented pagination, reject cycles or non-progressing next pages, preserve caller cancellation, and avoid caching partial results as complete.
- Validate the response envelope and required model identity strictly.
- Validate and normalize primary comparable prices and core limits at the Adapter boundary.
- Preserve zero prices; map missing, negative, non-finite, or malformed prices to unavailable rather than zero.
- Tolerate additive unknown fields without exposing them or failing the catalog.
- Share the provider catalog request and cache across saved OpenRouter accounts while keeping selected-source identity understandable in the UI.
- Present loading, empty, refresh, cancellation, and safe error states through the existing Model List experience.
- Ensure Management Key accounts expose no runtime-key verification, CLI verification, batch verification, or model-key actions.
- Add a concise source comment near the transport documenting the no-auth and output-modality contracts.

## Acceptance Criteria

- Selecting an OpenRouter account shows a clearly identified Provider Model Catalog in the existing page.
- The public request never contains Authorization or another saved account secret.
- A multi-page response produces one complete, deterministically deduplicated catalog; pagination cycles and malformed envelopes produce a controlled failure.
- Rows without a usable nonblank identity cannot reach React or cache state.
- A malformed optional field affects only that fact when safe; it does not erase otherwise valid models or become a misleading default.
- Legitimate free prices remain `0`; unknown or invalid prices remain unavailable.
- Refresh invalidates the shared provider cache without creating account-keyed duplicate public caches.
- Existing provider sources and unsupported-source behavior remain unchanged.

## Tests

- Cover URL and query construction, absence of Authorization, pagination, deduplication, cancellation, envelope errors, blank identity, malformed optional fields, unknown additive fields, cache reuse, refresh, and error classification.
- Cover per-token to per-million-token normalization and zero, missing, negative, non-finite, and invalid price values.
- Add focused hook/page tests for loading, empty, cached, refreshed, and failed public catalogs.
- Use placeholder providers and reserved domains outside the required production endpoint/source comment.

## Telemetry and E2E Decision

- Reuse existing model-load analytics; add only a controlled catalog-scope/source-variant enum if current events cannot distinguish provider catalog behavior.
- Do not add a standalone E2E here if Ticket 06 remains eligible for the final representative flow; otherwise Ticket 05 must own the public-only browser path.

## Comments

# Validate OpenRouter Personalized Catalog Contract

Status: ready-for-human

Blocked by: none

## Objective

Determine whether an OpenRouter Management Key can safely and correctly authorize the personalized models endpoint before the product treats that endpoint as an account-specific model source.

## Scope

- Verify the current official contract for the public and personalized model endpoints against pinned primary sources.
- With an explicitly supplied test Management Key, perform a read-only request to the personalized endpoint without persisting or logging the credential or response body.
- Establish whether the response reflects the expected personal or organization identity and whether provider preferences, privacy settings, and guardrails are actually applied.
- Record status codes, controlled response-shape observations, relevant headers, and sanitized failure categories only.
- Compare the personalized row shape with the public row shape and identify any distinct envelope, pagination, or optional-field behavior.
- Produce one decision: `verified`, `not supported`, or `unverifiable without an authorized credential`.
- If a credential is unavailable, do not guess. Record the public-only delivery decision and the exact evidence required to reopen personalized support.

## Acceptance Criteria

- The decision and supporting primary-source links are appended under `## Result` without secrets, account identifiers, model lists, raw payloads, or raw backend errors.
- A verified decision states the credential type, identity semantics, filtering semantics, pagination behavior, and safe runtime failure policy.
- An unsupported or unverifiable decision explicitly keeps personalized catalog implementation disabled and allows the public catalog work to proceed.
- Any later implementation can distinguish authorization failure, permission failure, invalid response, cancellation, and network failure without exposing sensitive payloads.
- No production code is added merely to speculate about an unverified credential contract.

## Validation

- Confirm the public endpoint still succeeds without Authorization and the personalized endpoint rejects an unauthenticated request.
- When authorized by the user, repeat only the personalized read with a real test Management Key and inspect sanitized shape metadata.
- Re-check the final notes for credential, account, organization, URL-query, header, and payload disclosure.

## Out of Scope

- Implementing product flows for creating, rotating, revealing, or persisting
  keys.
- Sending inference requests.
- Implementing the catalog UI.

## Comments

## Result

Decision: `verified`

Validated on 2026-08-07 against the current OpenRouter documentation and live
read-only endpoints. A user-authorized reversible browser follow-up completed
the filtering and cleanup checks on 2026-08-08.

### Primary-source contract

- The [public models guide](https://openrouter.ai/docs/guides/overview/models)
  documents `GET https://openrouter.ai/api/v1/models`, including
  `output_modalities=all`, and shows requests without Authorization. The
  [public endpoint reference](https://openrouter.ai/docs/api/api-reference/models/list-all-models-and-their-properties)
  defines the `data`, `total_count`, and `links` envelope.
- The [personalized endpoint reference](https://openrouter.ai/docs/api/api-reference/models/list-models-filtered-by-user-provider-preferences-privacy-settings-and-guardrails)
  documents `GET https://openrouter.ai/api/v1/models/user`, Bearer
  authentication, filtering by user provider preferences, privacy settings,
  and guardrails, plus `offset` and `limit` pagination. Omitting both pagination
  parameters returns the full list; `limit` is capped at 1000. Its documented
  `403` response identifies Management Keys as the required credential class.
- The [Management API Key guide](https://openrouter.ai/docs/guides/overview/auth/management-api-keys)
  defines Management Keys as administrative credentials and requires Bearer
  authentication for management operations. They must not be treated as
  completion credentials.
- The [guardrails guide](https://openrouter.ai/docs/guides/features/guardrails)
  states that account-wide privacy and provider settings form the default
  guardrail and that organizations can add tighter model, provider, spending,
  and privacy restrictions. The
  [provider-logging guide](https://openrouter.ai/docs/guides/privacy/provider-logging)
  links the account-wide privacy setting to personalized model availability.

### Sanitized live observations

- The public endpoint returned `200` without Authorization. Its response used
  the documented `data`, `total_count`, and `links` envelope, returned a
  complete page with no `links.next`, and advertised
  `public, max-age=300, stale-while-revalidate=3600, stale-if-error=3600`.
  `output_modalities=all` also returned `200`.
- The personalized endpoint returned `401` without Authorization and
  advertised `private, no-store`.
- Explicitly authorized requests using temporary Management Keys as
  `Authorization: Bearer <credential>` returned `200` and
  `private, no-store`. One supplied credential was decrypted only in memory and
  its encrypted temporary file was removed afterward. The browser follow-up
  created a separate temporary key, retained its secret only in bridge memory,
  revoked it after validation, and confirmed that the revoked key then returned
  `401`. No credential or response body was printed or persisted.
- A follow-up Playwright extension bridge to an already logged-in Edge session
  showed the generic `Default Workspace` settings context and successful private
  provider-preference/guardrail requests. A same-origin personalized-catalog
  request without a Bearer credential still returned `401` and
  `private, no-store`; browser session cookies are not a substitute for the
  Management Key contract.
- The authenticated response used the same top-level envelope and pagination
  contract as the public response. An unpaginated response returned the full
  set with no `links.next`. A `limit=1` request returned one row and a canonical
  same-origin `links.next`; following it returned the next page successfully.
  `total_count` remained consistent across the full response and both pages.
- Personalized rows used the public model row contract with optional-field
  variation. The observed personalized row-key union was a strict subset of
  the public row-key union: the public response additionally exposed optional
  `alias_target` and `benchmarks` fields. A later Adapter may reuse a shared
  permissive row schema, but it must not require optional fields merely because
  they appeared in the public response.
- With no allowed-provider or ignored-provider rules configured, the
  personalized and public endpoints each returned 400 unique models. Adding one
  temporary ignored-provider rule reduced the personalized response to 342
  unique models: 58 baseline models were removed and none were added, while the
  unauthenticated public response remained at 400. This directly verifies that
  provider preferences filter the personalized catalog without changing the
  public catalog.
- After removing the temporary rule, the private preference state again
  contained no ignored providers and the personalized response returned the
  exact original 400-model membership with no missing or extra rows.
- The personalized body and relevant response headers exposed no user,
  workspace, organization, account, or other identity field. The safe identity
  interpretation is therefore the authenticated principal represented by the
  saved Management Key. Product code must keep results isolated by saved
  account identity and must not infer or display personal-versus-organization
  scope from the catalog payload.

### Runtime contract and failure policy

- Ticket 04 may use the personalized endpoint for a saved OpenRouter account.
  Send its Management Key only to the canonical personalized origin and never
  attach it to the public fallback request.
- Keep personalized requests and caches account-isolated even when two current
  responses have identical membership. Keep the public response in a separate
  provider-wide cache.
- Treat `401` as authorization failure and `403` as authenticated permission
  failure. Treat malformed JSON, an invalid envelope, invalid row identity, or
  non-progressing pagination as invalid-response failures. Preserve caller
  cancellation separately from timeout/network failure; classify rate limits
  and other upstream statuses without exposing raw bodies.
- Cancellation should stop the personalized load without starting unrelated
  recovery work. Other safe personalized failures may fall back to the public
  catalog only with an explicit scope-change notice and retry action. The
  fallback request must remain unauthenticated.
- Follow `links.next` or offset progress when pagination is present, reject
  cycles or non-progressing pages, and do not cache a partial personalized
  result as complete.
- Do not log or emit telemetry containing the credential, catalog payload,
  model identities, account identity, organization identity, URLs, or raw
  backend errors.

This satisfies Ticket 04's `verified` entry condition. Public-catalog delivery
may proceed independently, while personalized implementation remains deferred
to that ticket. No production code was added for this validation slice.

# Add Verified OpenRouter Personalized Catalog and Public Fallback

Status: ready-for-agent

Blocked by: 01, 03, 05

## Objective

When Ticket 01 verifies the Management Key contract, prefer an account-isolated Personalized Model Catalog and fall back transparently to the shared Provider Model Catalog when personalized loading fails.

## Entry Condition

Ticket 01 must record a `verified` decision. If it records `not supported` or `unverifiable`, resolve this ticket as explicitly deferred without adding a speculative authenticated branch.

## Scope

- Add a separate authenticated transport and response-envelope schema for the verified personalized contract.
- Reuse the validated model-row normalization only where public and personalized row contracts are proven equivalent.
- Send the Management Key only to the verified personalized endpoint and never to the public fallback endpoint.
- Keep personalized requests, results, refresh state, and caches isolated by account identity.
- Prefer personalized data for a selected account; on authorized runtime failures, show the public provider catalog with an explicit scope-change notice and retry action.
- In all-accounts mode, preserve successful personalized sources per account while collapsing public fallbacks to one provider-wide source.
- Distinguish auth, permission, invalid-response, cancellation, rate-limit, network, and upstream failures using safe local messages and controlled status categories.
- Do not expose inference, CLI, batch, or model-key actions merely because a Management Key exists.

## Acceptance Criteria

- The authenticated request and identity behavior exactly match Ticket 01's verified contract.
- Personalized cache entries cannot be read by another account and can never populate the provider-wide public cache.
- Public fallback never carries Authorization and is visibly labeled as provider-wide rather than personalized.
- Retry targets the personalized source while a successful public fallback remains usable.
- Multiple personalized accounts remain distinct; multiple public fallbacks are represented once while summaries retain affected-account status.
- Missing or unsuitable backend messages still produce an actionable local error, and no credentials or raw personalized payloads reach logs or telemetry.
- If the entry condition is not met, no authenticated implementation path is merged.

## Tests

- Cover authenticated request construction, distinct envelopes, row-schema compatibility, account-isolated caching, refresh, auth and permission errors, invalid responses, cancellation, public fallback, retry, recovery, and multi-account source aggregation.
- Prove that Authorization is absent from fallback requests and that personalized data cannot cross account or provider-cache boundaries.
- Use fake credentials and reserved example identities only.

## Telemetry and E2E Decision

- Add or reuse controlled catalog-scope and fallback-result values only; never record model identities, account identities, URLs, preferences, raw errors, payloads, or credentials.
- When implemented, own the representative Chromium E2E covering a personalized OpenRouter deep link, rich details, mixed all-accounts mode, unsupported-action absence, visible public fallback, and retry.

## Comments

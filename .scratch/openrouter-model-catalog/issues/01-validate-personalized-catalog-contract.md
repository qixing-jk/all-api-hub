# Validate OpenRouter Personalized Catalog Contract

Status: ready-for-agent

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

- Creating, rotating, revealing, or persisting keys.
- Sending inference requests.
- Implementing the catalog UI.

## Comments

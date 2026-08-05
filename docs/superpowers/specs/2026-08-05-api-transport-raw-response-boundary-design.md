# API Transport Raw Response Boundary Design

Date: 2026-08-05
Status: approved design

## Purpose

Separate protocol-neutral HTTP transport from provider response semantics.
The transport must preserve the parsed response body and basic HTTP facts
without guessing whether a provider-specific envelope represents a business
error. Existing callers keep their current `fetchApi` and `fetchApiData`
behavior while provider-native integrations can opt into the lower-level
response contract.

This design corrects the OpenRouter native key-management plan's decision to
teach the shared transport about OpenRouter's nested error envelope.

## Current Problem

`src/services/apiTransport/request.ts` currently combines several layers:

- request construction, authentication, rate limiting, cancellation, and
  current-tab or temporary-window dispatch;
- response-type parsing and HTTP status handling;
- compatibility parsing for One API/New API-shaped envelopes; and
- provider-specific recognition of OpenRouter-shaped
  `{ error: { code, message } }` failures.

The last responsibility changes error behavior for unrelated providers. The
three dispatch paths also preserve different amounts of failed-response data:
the content-side path already sends `status`, `headers`, and `data`, while the
background wrappers discard `data` when constructing `ApiError`.

## Boundary

The protocol-neutral transport owns:

- URL and request construction;
- authentication headers and credential mode;
- request admission, timeout, cancellation, and abort composition;
- primary, current-tab, and temporary-window dispatch;
- parsing according to the declared response type; and
- returning HTTP status, headers, and the parsed response body.

It does not own:

- provider success or error envelope recognition;
- upstream business-code classification;
- selection of a user-facing provider message;
- provider schema validation; or
- provider-specific redaction and failure mapping.

The transport throws only when it cannot produce the declared response:
network failure, timeout, abort, extension-message failure, or response decode
failure. An HTTP 4xx or 5xx response is a completed HTTP exchange and is
returned with `ok: false`.

## Public Contract

Add a public repo-internal API transport result and request helper:

```ts
export interface ApiTransportResponse<T> {
  ok: boolean
  status: number
  headers: Readonly<Record<string, string>>
  body: T
}

export function fetchApiResponse<T = unknown>(
  request: ApiTransportRequest,
  options: FetchApiOptions,
): Promise<ApiTransportResponse<T>>
```

`body` is the response content parsed according to `responseType`. JSON content
is returned as `unknown` until a provider or compatibility layer validates it.
The helper does not expose the browser-native `Response`, which cannot be
reliably transferred across extension message boundaries.

All primary, current-tab, and temporary-window paths normalize into this same
serializable shape. Failed-response bodies must not be replaced by derived
message strings before reaching the caller.

## Compatibility Layer

Keep `fetchApi` and `fetchApiData` as compatibility APIs. Their public types and
observable behavior remain unchanged:

- non-success HTTP statuses still become `ApiError`;
- existing One API/New API top-level and `new_api_error` compatibility remains;
- `fetchApiData` still requires JSON and extracts `data`;
- `fetchApi(..., true)` still unwraps only the established normal envelope; and
- existing protection-bypass eligibility and current-tab fallback behavior
  remain covered by regression tests.

These compatibility APIs are implemented above the raw response primitive.
Legacy envelope recognition belongs to that compatibility layer, not to the
protocol-neutral response acquisition layer.

## OpenRouter Ownership

OpenRouter key management uses `fetchApiResponse<unknown>`. Its service layer:

1. checks `ok` and `status`;
2. validates successful endpoint responses with the existing Zod schemas;
3. recognizes its documented nested error envelope;
4. retains only a bounded scalar upstream code and non-empty message;
5. redacts the Management Key and task-scoped hashes, workspace IDs, or member
   IDs before constructing an error; and
6. maps the result to `ApiError`, then lets the Adapter map it to
   `ResourceFailure`.

Arbitrary error metadata is neither retained nor exposed. Raw response bodies
are not attached to general `ApiError`, logs, analytics, or external reports.

## Cross-Context Consistency

The content-side fetch handler already returns a serializable body for both
successful and unsuccessful HTTP responses. The background current-tab and
temporary-window consumers must retain that body when normalizing the result.
Binary response types keep their existing message-safe representations.

Compatibility wrappers may interpret a normalized result to preserve existing
fallback decisions, but the raw response primitive itself must not inspect a
provider envelope.

## Testing

Use TDD and cover these observable contracts:

- `fetchApiResponse` returns a JSON error body for an ordinary non-OpenRouter
  400 response without throwing;
- it returns `status`, `headers`, and `ok: false` consistently;
- current-tab and temporary-window failed responses retain their body;
- `fetchApi` and `fetchApiData` preserve all existing legacy error behavior;
- generic nested `error.code/message` is no longer interpreted globally;
- OpenRouter retains its nested message and bounded upstream code;
- OpenRouter redaction removes credentials and opaque provider identifiers;
- network, abort, timeout, content-type, and JSON-decode failures still throw;
  and
- existing protection-bypass and current-tab fallback tests remain green.

Focused Vitest coverage is the primary layer. Run the existing representative
browser-level protection-bypass flow if implementation changes shared
cross-entrypoint dispatch behavior; no new E2E scenario is required when the
existing flow covers the changed path.

## Telemetry

No telemetry is added. This is an internal ownership correction with no new
user action or product setting. Raw response bodies must never enter telemetry.

## Non-Goals

- Do not migrate every existing provider to `fetchApiResponse` in this change.
- Do not change provider-visible error copy except where the prior global
  OpenRouter parsing leaked into unrelated providers.
- Do not expose native `Response` objects or unrestricted response bodies on
  shared error classes.
- Do not redesign authentication, request limiting, protection bypass, or
  retry policy.

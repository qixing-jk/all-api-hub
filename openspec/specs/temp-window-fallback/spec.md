# temp-window-fallback Specification

## Purpose
Define the temp-window fallback behavior for protection/challenge bypass and non-JSON error response handling.

## Requirements
### Requirement: Temp context readiness checks CAP and Cloudflare
When creating or reusing a temporary browsing context for protection bypass, the extension MUST treat the context as “ready” only when both:
- a Cloudflare challenge page is not detected (or has been cleared), and
- a CAP (cap.js) checkpoint page is not detected (or has been cleared).

#### Scenario: CAP checkpoint present but Cloudflare not present
- **WHEN** the temp context finishes loading and the current page contains a CAP checkpoint
- **THEN** the temp context MUST NOT be considered ready until CAP is cleared

#### Scenario: Cloudflare challenge present but CAP not present
- **WHEN** the temp context finishes loading and the current page contains a Cloudflare challenge
- **THEN** the temp context MUST NOT be considered ready until Cloudflare is cleared

#### Scenario: Both CAP and Cloudflare are absent
- **WHEN** the temp context finishes loading and neither CAP nor Cloudflare is detected
- **THEN** the temp context MUST be considered ready

### Requirement: CAP auto-start is best-effort and user-like
When a CAP checkpoint is detected in the temp context, the extension MUST attempt to start the checkpoint flow in a stable, user-like way and MUST NOT implement proof-of-work cracking or protocol reverse-engineering.

#### Scenario: CAP widget present in the temp context
- **WHEN** the temp context contains a `<cap-widget>` element
- **THEN** the extension MUST attempt to start verification by simulating a click on the CAP widget UI

### Requirement: CAP auto-start attempts are throttled
To avoid repeated noisy interactions during readiness polling, CAP auto-start attempts MUST be throttled per request and MUST NOT run on every poll tick.

#### Scenario: Repeated guard checks during polling
- **WHEN** the background polls temp-context readiness and repeatedly asks the content script to check CAP guard status for the same request
- **THEN** the content script MUST NOT repeatedly trigger CAP auto-start on every check invocation

### Requirement: 401/429 HTML responses are classified as content-type mismatch for JSON requests
When an upstream API request expects JSON but receives an HTTP 401 or 429 response whose `Content-Type` indicates HTML, the extension MUST classify the failure as `CONTENT_TYPE_MISMATCH` (instead of a plain auth or rate-limit error) so the temp-window fallback can recover when the response is actually a challenge/login page.

#### Scenario: 401 HTML response while JSON is expected
- **WHEN** a request expects a JSON response and the upstream responds with HTTP 401 and `Content-Type` indicates HTML
- **THEN** the extension MUST classify the error as `CONTENT_TYPE_MISMATCH` while preserving the original HTTP status code for diagnostics

#### Scenario: 429 HTML response without Retry-After while JSON is expected
- **WHEN** a request expects a JSON response and the upstream responds with HTTP 429, `Content-Type` indicates HTML, and the `Retry-After` header is absent
- **THEN** the extension MUST classify the error as `CONTENT_TYPE_MISMATCH` while preserving the original HTTP status code for diagnostics

### Requirement: 429 with Retry-After is treated as real rate limiting
When the upstream response includes `Retry-After` for HTTP 429, the extension MUST treat the failure as real rate limiting rather than a challenge page.

#### Scenario: 429 response includes Retry-After
- **WHEN** a request expects a JSON response and the upstream responds with HTTP 429 and includes the `Retry-After` header
- **THEN** the extension MUST classify the error as `HTTP_429` (and MUST NOT relabel it as `CONTENT_TYPE_MISMATCH`)

### Requirement: Temp-window fallback does not auto-trigger on plain 401/429 API errors
To reduce user disturbance, the temp-window fallback MUST NOT auto-trigger for 401/429 responses that look like normal API JSON errors; these are typically unrecoverable via browser context (e.g., invalid credentials or real rate limiting).

#### Scenario: 401 response contains JSON content-type
- **WHEN** a request expects a JSON response and the upstream responds with HTTP 401 and `Content-Type` indicates JSON
- **THEN** the extension MUST NOT invoke temp-window fallback by default for this request

#### Scenario: 429 response contains JSON content-type
- **WHEN** a request expects a JSON response and the upstream responds with HTTP 429 and `Content-Type` indicates JSON
- **THEN** the extension MUST NOT invoke temp-window fallback by default for this request

### Requirement: Temp context can wait for a Turnstile token on demand
When a feature flow (such as auto check-in) needs Cloudflare Turnstile verification in a temporary browsing context, the extension MUST support a best-effort content-script operation that waits for a Turnstile token in the temp context.

This operation MUST:
- Detect Turnstile presence using stable page markers (for example `name="cf-turnstile-response"`, `.cf-turnstile`, or Turnstile iframe/script URLs).
- Attempt to “auto-start” Turnstile in a user-like way when present (for example simulate a click on a visible widget container/iframe marker), without implementing cracking, proof-of-work solving, or protocol reverse-engineering.
- Optionally pre-trigger the site’s check-in UI flow (e.g. click a “check in / 签到” button) when the widget is known to render lazily only after user interaction (best-effort, throttled per request).
- Treat a token as available only when a non-empty token value is observed in a stable DOM field (e.g. `name="cf-turnstile-response"`).
- Return within a bounded timeout with a structured result (`not_present` / `token_obtained` / `timeout`) indicating whether a token was obtained.
- Never persist Turnstile tokens to storage and MUST NOT log token values (only log booleans/metadata).

#### Scenario: No Turnstile present returns quickly
- **WHEN** the temp context page does not contain a Turnstile widget
- **THEN** the Turnstile wait operation MUST report that no token is required/available

#### Scenario: Turnstile present and token becomes available
- **WHEN** the temp context page contains a Turnstile widget
- **AND** the widget produces a token within the timeout
- **THEN** the Turnstile wait operation MUST return the token value to the caller

#### Scenario: Turnstile present but token never appears
- **WHEN** the temp context page contains a Turnstile widget
- **AND** no token becomes available before the timeout
- **THEN** the Turnstile wait operation MUST return a timeout result indicating no token was obtained

### Requirement: Temp context can perform a Turnstile-assisted fetch on demand
When a feature flow needs a Turnstile token to call a protected endpoint, the extension MUST support a temp-context fetch variant that:

- Acquires (or reuses) a temp context for the target origin.
- Navigates the temp tab/window to a provided `pageUrl` that can render the Turnstile widget.
- MAY run the temp context in an incognito/private window when requested for per-account storage isolation (multi-account scenarios).
- Waits for temp-context protection guards (Cloudflare challenge pages and CAP checkpoints) to be cleared.
- Invokes the Turnstile token wait operation in the content script with a bounded timeout.
- When a token is obtained:
  - Appends the token to the protected request URL as a query parameter (default key: `turnstile`).
  - Replays the network request in the same temp tab so cookies/session and token apply together.
- When a token is not obtained (not present / timeout / error):
  - Returns a failed response with structured Turnstile status metadata so the caller can decide how to proceed.

#### Scenario: Assisted fetch appends token and replays request in same tab
- **GIVEN** a protected endpoint requires a Turnstile token
- **AND** the temp context can obtain a Turnstile token within the timeout
- **WHEN** the feature flow invokes the Turnstile-assisted temp-context fetch
- **THEN** the extension MUST replay the request with `?turnstile=<token>` (or configured param name) in the same tab
- **AND** the extension MUST return the upstream response to the caller

#### Scenario: Assisted fetch fails when token times out
- **GIVEN** a protected endpoint requires a Turnstile token
- **AND** the temp context cannot obtain a Turnstile token within the timeout
- **WHEN** the feature flow invokes the Turnstile-assisted temp-context fetch
- **THEN** the extension MUST return a failure response
- **AND** the response MUST indicate the Turnstile status as `timeout` (or an equivalent structured timeout result)

### Requirement: Turnstile auto-start attempts are throttled
To avoid repeated noisy interactions during polling, Turnstile auto-start attempts MUST be throttled per request and MUST NOT run on every poll tick.

#### Scenario: Repeated guard checks during polling
- **WHEN** the background repeatedly asks the content script to wait for a Turnstile token for the same request
- **THEN** the content script MUST NOT repeatedly trigger Turnstile auto-start on every invocation


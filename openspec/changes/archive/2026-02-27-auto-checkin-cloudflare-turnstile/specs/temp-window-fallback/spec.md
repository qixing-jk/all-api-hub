# temp-window-fallback Specification (Turnstile assistance)

## ADDED Requirements

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

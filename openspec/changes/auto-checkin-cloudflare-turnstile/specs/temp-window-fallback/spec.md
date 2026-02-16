# temp-window-fallback Specification (Turnstile assistance)

## ADDED Requirements

### Requirement: Temp context can wait for a Turnstile token on demand
When a feature flow (such as auto check-in) needs Cloudflare Turnstile verification in a temporary browsing context, the extension MUST support a best-effort content-script operation that waits for a Turnstile token in the temp context.

This operation MUST:
- Detect Turnstile presence using stable page markers (for example `name="cf-turnstile-response"`, `.cf-turnstile`, or Turnstile iframe/script URLs).
- Attempt to “auto-start” Turnstile in a user-like way when present (for example simulate a click on a visible widget container), without implementing cracking, proof-of-work solving, or protocol reverse-engineering.
- Treat a token as available only when a non-empty token value is observed.
- Return within a bounded timeout with a structured result indicating whether a token was obtained.
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

### Requirement: Turnstile auto-start attempts are throttled
To avoid repeated noisy interactions during polling, Turnstile auto-start attempts MUST be throttled per request and MUST NOT run on every poll tick.

#### Scenario: Repeated guard checks during polling
- **WHEN** the background repeatedly asks the content script to wait for a Turnstile token for the same request
- **THEN** the content script MUST NOT repeatedly trigger Turnstile auto-start on every invocation

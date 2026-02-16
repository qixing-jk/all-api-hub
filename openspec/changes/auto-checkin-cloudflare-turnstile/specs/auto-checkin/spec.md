## ADDED Requirements

### Requirement: Auto check-in retries Turnstile-gated check-ins once via temp context
When an auto check-in provider receives a failed check-in result that indicates Cloudflare Turnstile verification is required (for example, the upstream response message contains `Turnstile` and indicates a missing/invalid token), the provider MUST attempt at most one additional “temp-context assisted” check-in for that account in the same execution run.

The assisted attempt MUST:
- Acquire a temporary browsing context for the account’s origin and navigate to a page that can render the Turnstile widget for that site’s check-in flow.
- Wait for temp-context protection guards (Cloudflare challenge pages and CAP checkpoints) to be cleared before attempting Turnstile work.
- Obtain a Turnstile token in a best-effort, user-like way (no cracking, no external solvers).
- Re-issue the check-in request via a temp-context-compatible mechanism so that WAF cookies and the Turnstile token apply in the same browser context.

The provider MUST NOT attempt more than one assisted retry per account per run. If the assisted attempt cannot obtain a token within its timeout, the provider MUST return a failed result with an actionable message indicating manual verification is required.

#### Scenario: Turnstile-required failure triggers a single assisted retry
- **GIVEN** an eligible account is included in an auto check-in execution
- **AND** the initial provider check-in call fails with a Turnstile-required error
- **AND** the temp context can obtain a Turnstile token within the timeout
- **WHEN** the provider handles the failed result
- **THEN** the provider MUST perform exactly one temp-context assisted retry for that account
- **AND** the provider MUST return `success` if the assisted retry succeeds

#### Scenario: Assisted retry is not repeated after token timeout
- **GIVEN** an eligible account is included in an auto check-in execution
- **AND** the initial provider check-in call fails with a Turnstile-required error
- **AND** the temp context cannot obtain a Turnstile token within the timeout
- **WHEN** the provider completes the account check-in attempt
- **THEN** the provider MUST return `failed` for that account
- **AND** the provider MUST NOT perform a second assisted retry in the same run

#### Scenario: Non-Turnstile failures do not trigger the assisted retry
- **GIVEN** an eligible account is included in an auto check-in execution
- **AND** the provider check-in call fails for a reason not related to Turnstile
- **WHEN** the provider handles the failed result
- **THEN** the provider MUST NOT attempt the temp-context assisted retry

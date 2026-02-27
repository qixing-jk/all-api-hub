## ADDED Requirements

### Requirement: Auto check-in retries Turnstile-gated check-ins via temp context
When an auto check-in provider receives a failed check-in result that indicates Cloudflare Turnstile verification is required (for example, the upstream response message contains `Turnstile` and indicates a missing/invalid token), the provider MUST attempt a “temp-context assisted” check-in for that account in the same execution run.

The assisted attempt MUST:
- Acquire a temporary browsing context for the account’s origin and navigate to a page that can render the Turnstile widget for that site’s check-in flow.
- Wait for temp-context protection guards (Cloudflare challenge pages and CAP checkpoints) to be cleared before attempting Turnstile work.
- Obtain a Turnstile token in a best-effort, user-like way (no cracking, no external solvers).
- Re-issue the check-in request via a temp-context-compatible mechanism so that WAF cookies and the Turnstile token apply in the same browser context.

The provider MUST NOT attempt more than one assisted retry per account per run.

However, to handle multi-account UI inheritance (the temp page may render without Turnstile when it inherits a different logged-in web UI user), the provider MAY perform one additional assisted attempt in an incognito/private temp context when:
- The assisted attempt fails
- AND it reports `turnstile.status = not_present`
- AND `turnstile.hasTurnstile = false`

If a token cannot be obtained after the assisted attempt(s), the provider MUST return a failed result with an actionable message indicating manual verification is required (unless it can confirm the user is already checked in today).

#### Scenario: Turnstile-required failure triggers an assisted retry
- **GIVEN** an eligible account is included in an auto check-in execution
- **AND** the initial provider check-in call fails with a Turnstile-required error
- **AND** the temp context can obtain a Turnstile token within the timeout
- **WHEN** the provider handles the failed result
- **THEN** the provider MUST perform a temp-context assisted retry for that account
- **AND** the provider MUST return `success` if the assisted retry succeeds

#### Scenario: Token timeout does not trigger an incognito/private retry
- **GIVEN** an eligible account is included in an auto check-in execution
- **AND** the initial provider check-in call fails with a Turnstile-required error
- **AND** the temp context cannot obtain a Turnstile token within the timeout
- **WHEN** the provider completes the account check-in attempt
- **THEN** the provider MUST return `failed` for that account
- **AND** the provider MUST NOT perform an incognito/private retry in the same run

#### Scenario: Non-Turnstile failures do not trigger the assisted retry
- **GIVEN** an eligible account is included in an auto check-in execution
- **AND** the provider check-in call fails for a reason not related to Turnstile
- **WHEN** the provider handles the failed result
- **THEN** the provider MUST NOT attempt the temp-context assisted retry

#### Scenario: Incognito/private retry runs once when Turnstile is not present
- **GIVEN** an eligible account is included in an auto check-in execution
- **AND** the initial provider check-in call fails with a Turnstile-required error
- **AND** the first assisted attempt fails with `turnstile.status = not_present` and `turnstile.hasTurnstile = false`
- **AND** incognito/private access is allowed
- **WHEN** the provider completes the account check-in attempt
- **THEN** the provider MAY perform exactly one additional assisted retry in an incognito/private temp context

### Requirement: Provider returns actionable messaging when incognito access is required
When the provider determines an incognito/private temp-context retry is required but the extension is not allowed to run in incognito/private windows, the provider MUST return a failed result with:
- `messageKey = autoCheckin:providerFallback.turnstileIncognitoAccessRequired`
- `messageParams.checkInUrl` set to a user-openable URL for completing manual verification

### Requirement: Provider confirms already-checked status when token is unavailable
When the assisted attempt does not obtain a Turnstile token (`not_present` / `timeout` / `error`), the provider SHOULD attempt a best-effort check of the account’s “checked-in today” status. If the status can be confirmed as already checked in, the provider SHOULD return `already_checked` instead of `failed`.

### Requirement: Actionable failure includes check-in URL for manual Turnstile
When the assisted attempt cannot obtain a Turnstile token (for example `not_present` / `timeout` / `error`), the provider MUST return a failed result with:
- `messageKey = autoCheckin:providerFallback.turnstileManualRequired`
- `messageParams.checkInUrl` set to a user-openable URL for completing manual verification

The `checkInUrl` SHOULD prefer the account’s configured custom check-in URL when present, otherwise fall back to the site-type router check-in path for the account’s `site_url`.

#### Scenario: Token timeout returns manual-required messaging with check-in URL
- **GIVEN** an eligible account is included in an auto check-in execution
- **AND** the initial provider check-in call fails with a Turnstile-required error
- **AND** the temp context cannot obtain a Turnstile token within the timeout
- **WHEN** the provider completes the account check-in attempt
- **THEN** the provider MUST return `failed`
- **AND** the provider MUST include `autoCheckin:providerFallback.turnstileManualRequired` with a `checkInUrl`

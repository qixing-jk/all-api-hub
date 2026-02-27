# temp-window-fallback Specification (401/429 response sniffing)

## ADDED Requirements

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

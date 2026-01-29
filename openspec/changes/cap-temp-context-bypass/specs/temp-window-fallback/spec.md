# temp-window-fallback Specification (CAP + Cloudflare readiness)

## ADDED Requirements

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

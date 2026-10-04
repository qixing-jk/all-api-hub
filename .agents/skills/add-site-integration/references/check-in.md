# Site-specific check-in workflow

Use when adding a check-in method, including to an already-supported site. Confirm existing site identity/authentication and reuse it; check-in does not require a new site type or unrelated account/managed capability changes.

## Establish discovery, status and execution separately

Read the check-in section of `docs/agents/site-integrations.md` and the closest provider under `src/services/checkin/autoCheckin/providers/`. Inspect `registry.ts`, discovery and feedback consumers before adding a method.

- Capture native status and mutation requests/responses independently: authentication, method/body, timezone/day boundary, enablement, already-checked state, eligibility and reward fields. A status request must not perform the action.
- Keep candidate discovery read-only, including hidden side effects of transport helpers: no credential issuance, login window or recovery-triggered writes merely to classify a method. Reuse verified structural clues across a family when appropriate; retain an origin restriction only when the evidence establishes a deployment-specific contract.
- Distinguish disabled, unavailable, not checked, already checked, auth failure and inconclusive responses. A guessed endpoint's 404 or missing credential does not establish family-wide absence. Do not treat an unknown status as permission to submit.
- Register verified feedback/status routes in the owning method definition and reuse shared path/query builders. Do not add a parallel route switch; mutation-only methods must not use POST as a status fallback.
- Bind cancellation and asynchronous results to the current account/origin/credentials. Test cancellation and timeout even when provider work ignores its signal, so late discovery cannot overwrite a newer draft or trigger fallback.

## Execute and reconcile rewards

Verify successful execution, duplicate/already-checked semantics and authoritative readback. Use existing centralized retry/reconciliation policy. After an uncertain response, read status where available rather than blindly replaying a mutation. Record timezone/reset semantics and whether an extension run observed a fresh grant or only the already-completed state; do not perform extra daily mutations solely for evidence.

Keep points, expiring bonus credit, subscription allowance and cash balance distinct. Populate quota rewards only from a verified balance-equivalent amount and valid finite conversion. Preserve authoritative reward/status data through polling, retry and result-replacement paths; absence of a reward field is not zero reward. Include manual/automatic execution, feedback and result UI consumers affected by the method.

## Validate and hand off

Start with focused failing tests for the actual discovery/transport/provider and affected consumers, including missing credentials without recovery side effects, duplicate result, uncertainty, cancellation and reward semantics where applicable. Then exercise the authorized real deployment or self-hosted backend. Explain whether discovery is structurally reusable or hostname-specific and name the observed deployment/version.

Persist the probe and site-specific CDP flow. Show the detected method and relevant status/result UI using [visual previews](visual-previews.md); include live protocol evidence and identify any fresh-grant path that could not be exercised. Check-in rewards generally cannot be rolled back, so record the real account change instead of claiming resource cleanup restored it.

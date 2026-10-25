# Deployment-modified check-in routes (issue #1740, ultrarouter.org)

- Status: implemented; user confirmed live route learning on 2026-10-25; live check-in mutation/reward verification still open
- Related issues: qixing-jk/all-api-hub#1740 and #1752 (same-site check-in report; authenticated confirmation still needed)
- Integration base: `origin/main` @ `6ae5cbf37de793706dc819d96dced3c5eae3e828` (checked 2026-10-25)

## Problem

ultrarouter.org is a heavily modified New API fork that renamed the two user
check-in routes. The site's own console bundle (`/static/js/async/68669.33760ed4df.js`,
`/static/js/async/77302.d4c0db40ad.js`, fetched 2026-10-23) calls:

```js
GET  `/api/user/daily-9f3k?month=${month}`
POST `/api/user/daily-9f3k?turnstile=${encodeURIComponent(token)}`   // or POST /api/user/daily-9f3k
```

`/api/status` still reports `checkin_enabled: true`, and the payload shape read by
the page (`data.stats.checked_in_today`, `stats.records[].{checkin_date,quota_awarded}`,
`data.quota_awarded` on success) matches `NewApiCheckInStatus` / `NewApiCheckInRecord`.

Unauthenticated probes of `/api/user/checkin`, `/api/user/check_in_status`,
`/api/user/daily-9f3k`, and a made-up `/api/user/nonexistent-route` all answer
`401 AUTH_UNAUTHORIZED`; that deployment runs auth middleware before route
matching, so a missing route never produces the 404 that
`detectWithStatusReadback` requires to classify the method as `unsupported`.
The probe therefore fails as `unknown (permission_denied)`, no method is selected,
and automatic execution records `no_selected_method` — exactly the report.

## Decision

Treat a deployment's check-in *route* as a per-account fact instead of a protocol
constant, in three layers:

1. **Endpoint parameterization.** The New API provider reads its check-in path
   from the account configuration, defaulting to `/api/user/checkin`. Status
   reads, mutation, Turnstile replay, and the feedback probe all use the same
   resolver.
2. **Per-account route override.** `CheckInConfig.routeOverrides[methodId] =
   { path, source, observedAt }` holds a same-origin request path. The account
   dialog exposes it for methods that declare support, so a user can enter the
   path seen in DevTools.
3. **Learning on explicit redetection.** When an override-capable method reports
   unsupported, permission denied or an invalid response, and the site's own assets expose
   candidate paths, redetection probes them read-only (`?month=` GET, must answer
   `data.stats.checked_in_today: boolean`) and persists the first verified path
   with `source: "discovery"`. The same redetection action then runs method
   discovery against the learned path. Unattended discovery never scans.
   A failed discovery-sourced path can be replaced by a verified new path;
   manual paths and edits or clears made while discovery is pending are preserved.

Alternatives rejected:

- A dedicated `ultrarouter:daily-checkin` method: the suffix (`9f3k`) is baked
  into the site build and can rotate on their next deploy, and the method would
  still need the endpoint parameterization to exist.
- Treating 401/403 as "method available": unknown status is not authorization,
  and it conflicts with `requiresAuthoritativeStatusBeforeMutation`.
- Guessing paths from a shared family list: the repository requires structural
  read-only evidence per deployment.

## Evidence

- Site bundle analysis and unauthenticated route probes: this file plus the
  command log in `evidence.md`.
- Not verified live: an authenticated GET/POST against `daily-9f3k` (no account).
  Consequence: whether the deployment returns `data.enabled` on the status GET is
  unknown, so an overridden route accepts a status payload without `enabled` and
  falls back to the public `checkin_enabled` flag for availability. Recorded as a
  validation gap.
- On 2026-10-25 the user confirmed that live testing correctly learned the path.
  Treat this as manual route-learning acceptance, with no claim that an agent
  captured authenticated response bodies or verified a check-in mutation/reward.

## Acceptance

- `pnpm test` for the touched suites; `pnpm compile`; `pnpm run i18n:extract:ci`.
- Existing New API accounts keep using `/api/user/checkin` with no behavior change.
- Route validation, manual provenance, save/reopen/clear persistence and pending
  discovery conflicts have regression coverage. Invalid input remains editable
  and blocks submission until corrected or cleared.
- Local browser evidence is retained in
  [the route-edit capture](../visual-captures/run-xV1LIc/capture.md).
  It uses an offline fixture and has no matching before-image baseline.
- Execution and Scout records are kept locally under
  `test-results/finish-branch-20261025/`; they are excluded from delivery.

# AgentRouter email/password check-in confirmation

Status: ready-for-human

## Observed protocol (2026-11-10)

At revision `55080ada34d88406036b1924725516cdde393eb9`, the native
AgentRouter email form returned HTTP 200 JSON from `POST /api/user/login`
with `success: true`, the expected `data.id`, and `data.checked_in: true`.
The immediate `/api/user/self` response did not include `checked_in`.

The extension's saved-account password check-in instead stopped during its
preflight `/api/user/self`, before any login POST or logout. That request
returned HTTP 200 `text/html` with Aliyun WAF meta markers. Treating the
response as JSON collapsed the challenge into a generic unknown error.
A later private-context attempt submitted successfully but encountered WAF
on the follow-up identity read, losing the login's valid check-in evidence.

These observations do not establish why this deployment challenged a request
or that email accounts alone are affected. A slider identifier in HTML does
not prove a visible slider was rendered. [WAF research](waf-research.md)
records the vendor documentation and the limits of the observed fingerprints.

## Accepted behavior and boundaries

- Readiness uses the existing bounded protection-page wait, including the
  observed Aliyun document markers. Normal CAPTCHA widgets and script text
  alone do not establish a WAF interstitial.
- A challenged preflight may reload the login page once before submission.
  An empty, exclusively owned private AgentRouter login context may skip that
  initial identity read. Shared or cached sessions keep server verification
  and the existing consent/reset policy.
- Canonical and known-mirror AgentRouter password login observes the native
  same-origin `POST /api/user/login` through Fetch or XHR. It submits once,
  accepts only a successful response with the expected identity, and projects
  only identity and optional boolean check-in evidence. Login success without
  `checked_in: true` does not establish check-in success.
- Missing, incomplete or second-factor responses retain the existing session
  verifier. If the page retained its transport before observation, bounded
  capture ends before one final read-only verification. Lost XHR responses,
  unload and operation completion release observation. No login is replayed
  within the attempt to recover an uncertain response.
- A caller obtaining a Cookie still needs an authenticated session read;
  check-in evidence alone does not prove that a captured Cookie is usable.
- Pre-submission WAF reports a failed action requiring verification;
  post-submission WAF preserves uncertainty and the verification reason.
  Both remain outside unattended retry under the existing reason policy.
  Network and invalid-response failures retain their distinct causes.

Stale localStorage, navigation, SDK callbacks and Cookie presence were rejected
as proof of this attempt's success. The WAF markers are deployment evidence,
not a guaranteed vendor-wide protocol. OAuth is not assumed exempt from WAF.

## Live acceptance and remaining limits

Production revision `0c24e28f89` was tested through the real extension's
**Run now** control in Chromium with private access enabled. The target was
unauthenticated before the attempt. A captured native login returned the
expected identity and `checked_in: true`; the site's authenticated
`/api/user/self` also succeeded. The extension persisted success and
execution-sourced `today: checked`. Its execution result survived page reload.
The temporary account was removed and private access restored afterward.

That run did not encounter WAF or require a slider. Deterministic browser
fixtures cover WAF before and after submission, clearance, response loss and
uncaptured native requests. Real human-slider continuation, Firefox, onboarding
and management-token acquisition remain unverified by this task. Its fixture
had no management token, so unrelated balance/log refresh returned 401.
No newly awarded daily quota is claimed. A network-enable timeout prevents
claiming complete global request capture; the runner clicked Run now once.

Regression owners are `tests/services/accountLogin/`,
`tests/services/apiService/agentrouterPasswordUi.test.ts`,
`tests/services/autoCheckin/providers/agentrouter.test.ts`, the temporary-page
guard suites, and `e2e/passwordLoginUi.spec.ts`. They cover identity isolation,
Cookie capture, 2FA, existing session protection, single submission and cleanup.

## Retained local evidence

Keep generated artifacts outside Git for review. `artifacts/repair-review.md`
contains the behavior table and failing/passing regression records;
`artifacts/live-review-0c24e28f89.md` contains the production acceptance report.
`artifacts/finish-validation.md` records validation after base integration.
Earlier failed browser runs remain under `artifacts/repair-final/` and
`artifacts/native-response-first/`; passing reruns do not replace those records.

Raw authenticated evidence, screenshots, comparison galleries and one-off
probes remain under
`%LOCALAPPDATA%/AllApiHub/diagnostics/agentrouter-email-20261110/`.
The `acceptance.md` gallery and `live-review-0c24e28f89/` directory retain
rendered evidence; `finish-backup/` retains the original investigation journal.
Local probes require the task's CDP profile and user-filled credentials.
Generated-code breakpoint probes are build-specific; native probes submit
credentials, and their dispatch records must be checked before reuse.

## Shared WAF recovery and login contracts

The OAuth/refresh follow-up reproduced two defects on revision `1740dca289`:
the shared refresh transport did not classify observed Aliyun challenge HTML,
and AgentRouter OAuth discarded the verification reason. Protection belongs to
shared infrastructure because it can appear on any deployment. The repair uses
the existing transport and login owners, not a global fetch interceptor.

- Direct, current-tab and temporary-page JSON responses recognize observed
  Aliyun HTML markers and Cloudflare's explicit challenge header before adapter
  parsing. HTTP status and ordinary CAPTCHA widgets alone do not prove a challenge.
- Every transport request declares a protection execution or a direct-request
  reason. Existing factories bind the choice; an untyped omission fails before
  dispatch. Passive probes, credential isolation and provider-specific direct
  protocols retain their policies.
- Explicit mutation semantics prohibit replay through current-tab, temporary-page
  and outer credential recovery, including mutating GET routes. Declaring a POST
  to be a read does not make it replay-safe.
- Protected password/OAuth actions wait for their page, with bounded continuation
  in the same owned session through the existing reminder. Closing the window or
  cancelling ends the wait. Readiness failure before dispatch and uncertainty
  after dispatch remain separate outcomes.
- Private-session ownership is checked after clearance. Native password-response
  observation is armed in the document that survives clearance. AgentRouter
  logout/state response loss, malformed replies and unavailable callback
  verification remain uncertain without replaying preparation or submission.
- Cookie acquisition still requires an authenticated identity read; native login
  check-in evidence alone does not establish a usable Cookie.

The Chinese, English and Japanese helper pages describe these recovery conditions
and their limits. Provider endpoints and authentication rules remain local to
their adapters.

## Validation scope and unresolved reproduction

Deterministic Vitest and Chromium extension fixtures cover initial/callback page
clearance, persistent protection, reminder continuation, cancellation, shared
private sessions, native Fetch/XHR evidence, response loss, malformed replies,
identity mismatch and single submission. They also verify mutation non-replay
and required recovery declarations across request callers. These fixtures do not
establish real vendor challenge or human-slider clearance.

Live observations on 2026-11-10/11 used the existing account credentials without
issuing or rotating tokens. Hosted Edge acceptance used production revision
`7580cf3202`; later cold-session cases retained their own build/network metadata.
Password check-in and bearer refresh used separate fixtures where stated.

| Conditions | Observed result | Limit / retained evidence |
| --- | --- | --- |
| Hosted email/password Run now | One native login POST returned the expected identity and `checked_in: true`; extension success survived reload. Separate access-token refresh returned JSON, saved matching quota and normal account health. | No challenge observed; a tokenless check-in fixture's refresh returned JSON 401. `artifacts/live-cdp-acceptance.md`. |
| Fresh profiles; direct saved-account import; no tester provider navigation or probe | Metadata showed no provider tabs, cookies or storage and zero provider requests before the extension action. Bearer refresh and one-submit password check-in passed, including persisted results. | Initial document bodies were not always captured, so transient automatic clearance cannot be excluded. `artifacts/cold-cdp-acceptance.md`. |
| Hong Kong and USA egress, distinct from Japan baseline | Four independent cold-profile refresh/check-in cases passed. Proxy connection records confirmed the selected routes; each check-in made one native login POST. | Initial documents and one trailing log response per case remained uncaptured. The original WAF/HTML failure was not reproduced. `artifacts/cold-ip-20261110.md`. |
| Local curl through Japan | Homepage HTML, public status, authenticated self and unauthenticated JSON 401 were ordinary responses. The bounded refresh query succeeded in 0.721 seconds. | An unbounded statistics request timed out once, then returned JSON after about 25 seconds. `artifacts/curl-20261111.md`. |
| Local curl through verified DIRECT selector | Five homepage/read-only API attempts failed at TLS handshake, before an HTTP response; three routes were independently observed. | Neither TLS cause nor direct WAF behavior was established. Same curl report. |

The first-contact constraint is essential: import saved-account data directly and
let application code make the first provider request or create the first page.
Automatic detection, authenticated probes, website navigation or session transfer
would change the state being reproduced. Warm-profile acceptance does not meet
that condition. The live-extension skill records this exception to its normal
authenticated preflight.

Real challenge continuation, Firefox, fresh email-only onboarding, management-token
acquisition and a scheduled alarm firing remain unverified here. Run now exercised
the automatic workflow with scheduling disabled. No newly awarded daily quota is
inferred from login success. These successful runs do not disprove intermittent
WAF behavior in the originally reported production accounts.

## Evidence retention

Keep protocol evidence and the conditions needed to close the remaining gaps in
this spec and `waf-research.md`. Keep generated reports, screenshots, failed runs
and one-off diagnostic scripts local. Do not replay native login/check-in probes
without first checking their recorded dispatch and authoritative outcome.

- Shared request/login acceptance: `artifacts/oauth-refresh-followup.md`,
  `artifacts/common-waf-acceptance.md`, `artifacts/contract-acceptance.md`.
- Full-branch regression and review matrix: `artifacts/review-20261111/report.md`;
  final contract refactor checks: `artifacts/scout-20261111.md`.
- Existing reminder gallery: `.scratch/visual-captures/run-AGKMjl/`. There is no
  comparable old workflow capture. Fixture behavior checks and visual comparison
  evidence remain separate.
- Raw authenticated responses, expanded live galleries and profiles remain under
  `%LOCALAPPDATA%/AllApiHub/diagnostics/agentrouter-email-20261110/`, including
  `waf-final-email-coeLdI/`, `waf-final-refresh-JPf46X/`, the `waf-cold-*` runs,
  and `ip-repro-9D77Jf/`. The linked local reports identify individual runs.
- Earlier setup failures, stale-quota assertions, incomplete network capture and
  failed browser attempts remain with those reports. Passing retries do not erase
  them. Temporary test accounts and preference/private-access overrides were
  removed or restored; task-owned browsers were closed without deleting profiles.
  Japan routing and rule mode were restored after the route comparisons.

The original investigation journal is retained locally at
`artifacts/finish-branch-20261111/original-spec.md`.

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

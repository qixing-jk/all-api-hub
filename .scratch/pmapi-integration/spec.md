# PM-API integration

## Scope and decisions

- `pmcat.top` and `pap.pmcat.top` run the same PM-API program with independent accounts. Every credential and readback stays bound to its origin.
- AccessToken authentication reads the console's `pm_token` after the user logs in; `/api/me` verifies the identity. Login captcha remains a manual step.
- Account/balance/today usage, keys, models/pricing, redemption, invite links and announcements are supported. Online top-up is outside scope.
- The site uses hash routes (`/#/console/tokens`, `/#/console/wallet`, `/#/pricing`). Plain console paths can render the landing page.

## Verified deployment contracts

The live status observations from 2026-10-22 supersede the initially inverted deployment table:

| Deployment | Check-in enabled | Captcha scenes relevant here |
| --- | --- | --- |
| pmcat.top | false | login, register |
| pap.pmcat.top | true | login, register, checkin, redeem |

Read `/api/status` at runtime rather than hardcoding deployment policy. A captcha scene does not mean that a check-in method is absent. Detect the method and read availability/today status; automatic execution defaults off for newly detected accounts requiring check-in verification. Existing saved choices and explicit user choices are preserved.

## Native check-in opt-in

Reuse the existing page assistance/reminder mechanism, make simulated clicking optional and off by default, and default new captcha-gated accounts out of automatic check-in.

Follow-up decision (2026-10-24): the gate must be visible metadata instead of a one-shot creation default, and the click preference needs an account-level override on top of the user-level default. Chosen: persist the gate on the method status, keep both switches (automatic execution and page-assistance click) with the account UI explaining their relationship, and scope the whole mechanism to PM-API for now.

Second follow-up (2026-10-25): the switch is about *continuing the run and reporting the account for a manual step*, not about "clicking a button on one site". Renamed the field, preference and all copy to `continueWhenVerificationRequired` and removed PM-API wording so the next gated site can reuse the same contract. The account control shows the value it actually resolves to and links to the setting that owns the default.

- `requiresManualVerification` is part of the probe's known status (`/api/status` captcha scenes), not a creation-time flag, so the account UI can explain the gate and the value refreshes with the deployment. Execution evidence keeps the last known deployment facts instead of dropping them.
- `CheckInConfig.continueWhenVerificationRequired` is the account override (absent = follow global). Preference `autoCheckin.continueWhenVerificationRequired` stays the user-level default; absent or unreadable preferences mean off.
- A determinate captcha refusal can acquire the native wallet page through the existing protection-bypass mechanism. Verify its browser-session user ID against the saved account before dispatching one click.
- Reuse configured manual-verification reminders. Never solve captcha or treat opening/clicking as business success.
- After a click, read `/api/me.checked_in_today` using the account's saved credential. Unconfirmed completion remains a manual-verification result. Lost action responses never authorize another click.
- A disabled deployment remains disabled. Captcha-free API success and already-checked responses retain their original semantics.
- Continuing means the account stays in the run and its refusal is reported as `MANUAL_VERIFICATION_REQUIRED`, which maps to the `ACTION_REQUIRED` skip category. That already places it in the auto check-in page's setup-required filter and in the existing "open all failed accounts' check-in pages" bulk action, so a batch of gated accounts can be finished in one pass. No separate aggregate entry point was added.
- Still open: a gated account whose automatic execution stays off appears in no check-in TODO list, because the overview only inspects accounts that opted in.


## Key and pricing contracts

- `/api/tokens` returns recoverable plaintext secrets; avoid logging them. Creation returns `keys`; updates are partial writes. Regenerating existing user keys is not part of validation.
- Token groups come from `/api/token-groups`; preserve site group names and labels, including the implicit account-group choice. Group selection is a real routing/billing dimension.
- `/api/pricing` returns models plus group names, descriptions and ratios. Token rows use `input_per_m` and `output_per_m`; request rows use `price` per call. Apply the selected group ratio once at quote time, including zero-price groups.
- A row's `available=false` concerns the current group; it does not establish global model unavailability. Preserve the row's groups without dimming the model globally.
- If usable-group discovery fails, retain catalog display with compatible priced candidate groups. Malformed catalog rows fail rather than producing partial data.

## Owners and validation

- Definitions/routes: `src/services/accountSiteDefinitions/definitions.ts`.
- PM-API protocol: `src/services/apiService/pmapi/`; adapters: `src/services/apiAdapters/pmapi/`.
- Check-in execution: `src/services/checkin/autoCheckin/providers/pmapi.ts` and `pmapiNativePageClick.ts`.
- Account draft defaults: shared completion contract and `autoDetectDraft.ts` / `compatibilityConfig.ts`.
- Regression tests: matching PM-API API/adapter/provider tests, account draft tests, automatic-check-in settings and settings-search tests.
- Maintained live runner: `pnpm e2e:cdp:pmapi` (dev build by default; `--prod` selects production; `--checkin-only` omits disposable key lifecycle; `--native-action` also checks identity/today status before dispatching one native action when a claim is still available).

Raw CDP reports, screenshots, logs and temporary probes stay local under ignored `evidence/`, `artifacts/` and `cdp-*.mjs`. They are not shareable artifacts. The live runner requires existing authenticated accounts in the dedicated development profile. It cancels onboarding drafts, restores its preference changes, and cleans up only keys created by its own run. A captcha-dependent successful claim requires manual verification; unit fixtures establish success/failure branches that the live account cannot exercise unattended.

## 2026-10-26: Pro wallet click readiness

The Pro deployment (`pap.pmcat.top`) had recorded `target_not_found` results before reaching verification. Its live wallet route is `/#/console/wallet`, with a native `button#ckBtn` labelled “立即签到”. The document can become available before this control renders. Native assistance now selects `#ckBtn:not(:disabled)` and waits at most 10 seconds for it without dispatching clicks during the wait. Existing selector triggers without a configured wait retain their immediate behavior.

The native action now calls `HTMLElement.click()` once. The existing widget-wake simulator dispatched both a synthetic click and `.click()`, producing two native click events; widget waking retains its separate behavior. PM-API still verifies the browser account before dispatch and requires authoritative account-state confirmation after the action. No automatic replay follows an uncertain result.

| Scenario | Before | Expected and verified after | Evidence |
| --- | --- | --- | --- |
| Wallet button renders late or is initially disabled | Immediate `target_not_found` | Wait for an enabled site button and click exactly once | Handler regression observed red, then green |
| Wallet button never becomes usable | Immediate failure | End after the bounded wait; no later click or reminder | Handler timeout regression |
| Native click opens verification | Existing verification machinery | Continue using the existing configured reminder and completion observation | Delayed-button/reminder integration regression |
| Real Pro wallet | Prior native-action history reported missing target | Production content handler clicked “立即签到” exactly once and opened the real interactive puzzle | Local report and screenshot under `.scratch/verification-copy/` |

Validation: 109 provider, content-handler, trigger and background tests passed; `pnpm compile` and `pnpm build` passed; implementation commit hooks passed, including two permission-warning browser checks.

The live target check used a fresh Chromium profile loaded from this checkout's production build, reused only the verified Pro-origin session from the dedicated dev profile, and confirmed the same account was not checked in today. It blocked any check-in POST; none was attempted. The returned action was `clicked`, the event count was 1, and verification was `required` / `interactive`. No CAPTCHA was solved and a successful grant was not validated. This establishes the real native control and challenge, not the complete background reminder workflow in the original dev browser; that browser's generated dev manifest lacked content-script registration. A separate ordinary-UI attempt ended in page-load failure and was not automatically replayed.

Local review entry: [verification-copy/spec.md](../verification-copy/spec.md). Raw logs, challenge screenshot and probes remain local for review; they contain no persisted session tokens. The maintained live runner's assertions were updated to the revised application copy and syntax-checked; its complete account/key suite was not rerun for this focused click fix.

## Scout review follow-ups (2026-10-26)

- The account continuation menu computes its “Use global” option label from the resolved account override. When the override differs from the global preference, the label describes the override rather than the value selecting that option will use. Correcting the visible label is a behavior change, kept separate from the behavior-preserving refactor.
- The maintained live runner reads only `/api/tokens?p=1&size=100` for baseline, readback and cleanup, while the extension reads every inventory page. More than 100 live keys can cause a false parity failure or hide a run-owned key from cleanup. Extending the runner's pagination is a separate validation-behavior correction; never delete existing user keys to satisfy that assumption.
- Acceptance and validation logs: `artifacts/scout-refactor-20261026/`. Existing `evidence/`, `cdp-*.mjs`, logs and `../verification-copy/` remain local for pending review.

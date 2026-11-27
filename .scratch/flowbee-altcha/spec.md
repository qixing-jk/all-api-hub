# Native check-in page discovery and Flowbee ALTCHA support

Status: implemented and independently reviewed. This extends existing account types and native-page workflows; it does not introduce a new managed-site integration.

## Problem and scope

NovaAPI uses `/profile` with its `newllma` theme, whereas the generic New API route selected `/console/personal` ([issue #1853](https://github.com/qixing-jk/all-api-hub/issues/1853)). Flowbee serves its welfare page at `/invite`, uses ALTCHA, and awards daily points independently of monetary quota. A route clue or a completed CAPTCHA alone cannot establish a successful check-in.

Accounts can configure a same-origin native page path independently of API route overrides and external welfare URLs. New API accounts additionally expose read-only Find, Open and Use actions. Use changes the draft; ordinary Save persists it. Cancellation, failure and obsolete replies preserve the user's configuration. Clearing and saving restores default routing. Query strings and hash routing are supported; absolute URLs and paths that normalize outside the allowed path contract are rejected.

Native execution first checks the configured/default destination. New API may explore bounded alternatives when the target is absent, including a broken manual path. A verified learned destination is stored separately after authoritative success, bound to the account identity and configured path, and revalidated before reuse. Account or manual-path changes invalidate it. PM-API, Daigua and Nexavlinks retain their explicit provider policies while consuming the shared page-path and discovery contracts.

## Safety and ownership contracts

- Configuration discovery navigates and reads same-origin page/script evidence without logging in, issuing credentials or claiming rewards. Scripts are read as text, never evaluated. Navigation and source scanning share bounded budgets with feedback collection.
- Source clues and checked areas are reviewable candidates, not executable proof. Automatic selection requires complete exploration and one actionable page; multiple real actions remain ambiguous. Semantic disclosure headings do not count as grant controls, and provider-owned explicit selectors retain their contract.
- Both configured-login and existing-browser-session execution require fresh same-account identity before mutation, including after discovery navigation. Modern New API verifies its current refresh session; legacy sessions retain their verification path. Refresh requests are bounded and cancelled underneath the timeout.
- `services/checkin/pageAction.ts` owns target inspection, readiness, unique selection and clicks. CAPTCHA observation, account identity, grant confirmation and React state remain with their separate owners. Delayed hydration may make a disabled button ready; it does not authorize another grant attempt.
- Shared ALTCHA handling activates one eligible native checkbox and observes completion, including open shadow DOM. The website computes the PoW and submits its own proof. Hidden, unrelated or ambiguous widgets do not authorize activation; replacing a widget does not authorize a second activation. Unfinished verification retains manual assistance.
- Normal API check-in remains first where supported. Native submission owns its proof. A dispatched click, lost response or uncertain result never authorizes token/API replay. Success requires authoritative account/day state and reward readback.
- Flowbee rewards retain their native point asset, provenance and record date. They are not converted to money or inferred from balance changes. Other New API deployments retain their monetary quota semantics.

## Verified deployment facts

Flowbee was investigated on November 15, 2026 against deployed frontend version `main-20261102-15ee1ed`; no verified public backend source was available. Its status exposed `altcha_check=true`, `turnstile_check=false`, `checkin_enabled=true` and `welfare_points_enabled=true`. Native GET `/api/user/checkin?month=2026-11` returned dated `points_awarded` records with legacy `quota_awarded=0`. The console uses dashboard Bearer authentication; cookie-only requests did not establish the contract.

The native widget used `/api/captcha/altcha`, observed `statechange`, and submitted its proof through the legacy `turnstile` query parameter. The parameter name does not identify the CAPTCHA vendor. Daily welfare points reset at midnight UTC+8. The native welfare overview's displayed 50 points did not match individual grant amounts, so no available-balance increment was inferred.

NovaAPI's deployed `v0.6.6-custom` frontend used theme `newllma` and `/profile` on November 16, 2026. The theme-specific route is limited to check-in; unrelated routes retain their existing resolution.

## Acceptance and evidence boundaries

The maintained [full-branch acceptance report and expanded UI gallery](artifacts/ui-cdp-20261127/acceptance.md) is the reviewer entry point. Its fixed pre-branch baseline is `b4b52d8eebd4cce57a0b42c6a84754a262527006`. It covers page configuration/persistence, shared editors, feedback and execution recovery, protection history, verification fixtures, point results and native credential continuation. The [Scout report](artifacts/scout-20261127/acceptance.md) records subsequent behavior-preserving extraction and current test/build boundaries; the [finish record](artifacts/finish-20261128/acceptance.md) records final history/tree equivalence and base validation.

| Scenario | Evidence and limits |
| --- | --- |
| Find/Open/Use/Save/reopen, clear, cancelled/failed/stale discovery, ambiguous or unavailable targets | Component tests, maintained Chromium scenarios and the full-branch UI gallery. English/Chinese narrow layouts and related shared editor states were inspected. |
| Native target selection, heading exclusions, delayed hydration, fresh identity, cancellation and no replay | Failing-before regressions and final passing suites are retained in [target review](artifacts/target-review-acceptance.md), [current Flowbee acceptance](artifacts/live-current-20261127/acceptance.md) and the Scout report. |
| ALTCHA light/shadow DOM, Turnstile native callbacks, hidden/ambiguous widgets and manual recovery | Maintained built-extension fixtures and content tests. Synthetic proof computation is distinct from hosted ALTCHA evidence. |
| Official New API and NovaAPI hosted grants | November 17, 2026: official New API awarded 5772 quota and NovaAPI awarded 1505 quota, with fresh identity, eligibility and new native records. NovaAPI's observer did not retain body proof metadata, so its successful proof format/count is unverified. See [hosted evidence](report.md). |
| Current Flowbee onboarding, discovery, grant and duplicate admission | November 27, 2026: ordinary detection, native scoped-token continuation, `/invite` adoption and save/reopen passed. One successful proof-bearing native POST followed two rejected empty-proof requests. Fresh readback and persisted UI agreed on 197 points, zero quota and one new dated record. A second action skipped with `already_checked_today` and sent no check-in POST. See [current acceptance](artifacts/live-current-20261127/acceptance.md). |
| Flowbee identity reliability follow-up | Eight identity-only attempts passed across an existing page and newly created native contexts; all twelve observed refresh responses were HTTP 200 with the expected identity. The earlier isolated `identity_missing` did not reproduce, and its cause remains unconfirmed. No grant was triggered. See [identity retest](artifacts/live-current-20261127/identity-retest.md). |
| Resource cleanup | The current Flowbee run's temporary extension account and both temporary tokens were removed; native reload confirmed absence and preservation of the pre-existing token. Historical hosted cleanup is recorded separately. |

Independent UI/acceptance reviews closed all confirmed findings. Later Scout changes preserve rendering and reuse those inspections. Historical live evidence is tied to the recorded build/source and day; no later grant is claimed. Firefox, Safari and production Turnstile were not exercised. Popup/sidepanel captures cover extension documents at target widths, not OS toolbar containers. Failed collectors, rate-limited reloads, locator failures and early assertions remain failed records even where independent native readback or a repaired harness closed the corresponding evidence gap.

## Reusable tooling and local retention

`scripts/flows/new-api-native-checkin.mjs` is an explicit manual acceptance helper for modern official New API with `/api/user/auth/refresh`, `/api/user/checkin`, a same-account authenticated native page and an eligible account/day. Callers own login, onboarding, evidence and cleanup. It requires exactly one proof-bearing query submission and one additional native record; it is not a generic no-CAPTCHA or arbitrary-fork runner, and must not be repeated after an uncertain mutation. The local `live-local-final-native.mjs` driver demonstrates its invocation. Its query-only proof observation does not establish body-carried proofs.

The maintained token UI helper supports password-only verification without tabs, multiple native permission groups and current Chinese one-time token copy. Browser regressions cover those contracts independently of live credentials.

Keep this spec, maintained runners/tests and synchronized Chinese/English/Japanese user documentation in Git. Keep `report.md`, `artifacts/`, `evidence/` and exploratory `live-*.mjs`/`live-*.js` local for review, including failures and before/after images. The complete pre-finish chronological spec is preserved at `artifacts/finish-20261128/spec-before-finish.md`; it is historical evidence, not the current acceptance verdict. Unrelated scratch material remains untouched.

# Hiyo Free daily check-in

Status: completed

Related issues: [#1629](https://github.com/qixing-jk/all-api-hub/issues/1629), [#1664](https://github.com/qixing-jk/all-api-hub/issues/1664). Both request daily check-in for the same Sub2API deployment.

## Scope and decisions

- Keep one existing `sub2api` account type and its renewable Bearer authentication. The saved origin identifies this installation; no new site type, credential store or managed-site work is needed.
- Observed deployment: https://free.hiyo.top/dashboard, 2026-10-10. Console and account API share this origin. Visible documentation points to `/docs`; no alternate account domains were advertised. Inference/domain equivalence beyond this origin is outside this check-in-only task.
- Add `hiyo:daily-checkin` as a structural Sub2API candidate: match the verified envelope and daily fields, not hostname alone. Other Sub2API check-in routes differ.
- Test seams: authenticated check-in transport (HTTP/envelope/status/reward), registered provider execution (discovery, admission, uncertainty), and feedback routes. Reuse existing account authentication, selection, scheduler and result presentation boundaries.
- Use per-account access tokens with the existing refresh lifecycle. The native frontend stores `auth_token`, `refresh_token`, and `token_expires_at`. Passive discovery must never refresh, recover browser credentials or persist state. No durable console PAT alternative was established; cookies are not needed. Expired/missing credentials use existing same-account recovery, with no mutation replay.
- `GET /api/v1/checkin?timezone=Asia%2FSingapore` returned enabled, daily_claimed, daily_available, can_claim, tokens_met, amount_min/max and next_reset_at. The native `POST /api/v1/checkin` sends `{}` when Turnstile is disabled.
- Native fresh grant: `type: daily`, `amount: 0.4275`, `balance: 3.9763`, nested status daily_claimed true. Before balance 3.5488; authoritative GET readback confirmed completion. This grant is retained, not rolled back. No duplicate POST will be made just for evidence.
- Daily status is `daily_claimed`, never `can_claim` (which includes consumption-based extra rewards). Bonus redemption is outside scope. The combined mutation cannot select daily-only, so require fresh daily eligibility and disable automatic retries. Concurrent native bonus claims remain a protocol limitation.
- Observed reset: 2026-10-11T00:00:00+08:00 for Asia/Singapore. Follow native GET timezone and server-owned day; do not infer status from the local date.
- Frontend supports optional Turnstile, disabled on this deployment. Automated challenge handling is not claimed; authentication/verification errors must remain visible and must not replay POST.

## Evidence and validation checklist

Raw task evidence is locally ignored under `evidence/` (verified with `git check-ignore`). Public bundles: `index-DMwmuiWq.js`, `DashboardView-CBdk58Av.js`, `user-B-g3wqMl.js`. Request authentication is redacted; no credentials are retained.

| Group | Operation | Outcome / mapping | Evidence or remaining check |
| --- | --- | --- | --- |
| Setup | Type/auth/domains | Existing Sub2API origin and renewable Bearer | Native frontend and authenticated status |
| Discovery/status | Read-only discovery, disabled/ineligible/checked | Adapted; daily fields govern eligibility | status-before.txt, status-after.txt |
| Execution/rewards | Daily grant, reward, no bonus replay | Native grant verified; USD amount to quota | claim-request.txt, claim-response.txt |
| Execution/rewards | Duplicate/uncertain/cancellation | Use status readback; do not guess duplicate errors | Focused transport/execution/cancellation tests passed |
| User paths | Method selection/manual/automatic/results | Reuse shared consumers | Registered provider tests and current-worktree live detection/save/status UI passed |
| Delivery | Unit/contract checks | TDD passed | 34 transport and 11 registered-provider tests; related regression suites passed |
| Delivery | Native UI/protocol | Fresh grant and readback passed | Existing Edge session |
| Delivery | Current-worktree extension | Passed: detected Hiyo Free, saved method, verified checked status, result row; zero claim POSTs | Fresh extension grant not repeated after native daily grant |
| Cleanup | Browser and artifacts | Temporary accounts removed; temporary result storage restored; original browser preserved | Live runner cleanup asserted |


## Reproduction and final validation

- `pnpm exec vitest run tests/services/apiService/sub2api/checkin/hiyoCheckIn.test.ts tests/services/autoCheckin/providers/hiyo.test.ts`: 45 tests passed, including missing-token side effects, HTTP/auth errors, malformed envelopes, daily-vs-bonus eligibility, finite rewards, uncertain readback without replay, cancellation and timeout.
- Related provider/discovery/execution/feedback and analytics suite: 962 tests considered; adding a candidate required updating four existing test fixtures/count assertions. The affected 131 tests passed after these test-only repairs; the other 957 passed in the broader run.
- `pnpm compile`, `pnpm build`, `pnpm exec knip`: passed. Build reports an existing mixed static/dynamic import warning for tempWindowFetch.
- `HIYO_ACCESS_TOKEN` supplies a current console token in the process environment; `pnpm e2e:cdp:hiyo --isolate` uses the isolated current-worktree extension. `HIYO_BASE_URL` optionally changes the deployment; `HIYO_EVIDENCE_DIR` must point to a locally ignored evidence directory. No refresh token, cookie export, or persisted credential artifact is required.
- The runner uses actual provider GETs, extension re-detection, save, runtime status verification and a result-row assertion. It restores temporary status storage and removes its own account. It never submits a check-in. Native fresh grant was already observed today; no second grant or bonus is performed for testing.
- Native frontend's optional Turnstile path is not exercised because this deployment did not enable it. Duplicate POST errors, other timezones/reset boundaries, long-term credential expiry, and a fresh grant through the extension remain unverified live; focused tests cover the delivered dispatch/status/reward behavior. A runnable pinned Hiyo backend was not identified, so self-hosted E2E is not claimed.
- Screenshots and exact current-worktree extension identity are in `evidence/live/result.json`, `01-detected-method.png`, and `02-status-workspace.png`. Documentation was synchronized manually in Chinese, English and Japanese after finalizing the Chinese source.

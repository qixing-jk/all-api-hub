# Uncertain and failed check-ins: specific reasons and same-day automatic recovery

- Status: ready-for-review — policy v4, implementation complete
- Baseline: `main` @ `85fd7f4e1`
- Supersedes: `.scratch/checkin-method-discovery/spec.md` lines 19, 868, 988, 999, 1013 (the "verified idempotency policy" requirement) and the `待确认` wording in `docs/docs/auto-checkin.md:60,75,136`
- Trigger: an AnyRouter account produced `uncertain`; the only offered action (`验证状态`) can never succeed for that method, and the real cause was invisible.
- v4 amendment: retry unless the outcome is obviously impossible. A provider `retryable: false` is not a veto. AgentRouter login check-in is included. Admission and the retry queue must include non-daily attempts. A WAF HTML body or a bare HTTP 403 is not an authentication or permission failure.

## 0. Policy in one sentence

After any attempt whose result is not an obvious dead end, retry it automatically later the same day within `maxAttemptsPerDay`. When the method can read today's status, read that first and skip the mutation if today is already checked.

The basis is an accepted **platform assumption**, not a per-method proof: replaying a daily check-in is safe enough, because a reward credited on every POST would be trivially farmable. The client detectors for "already checked in" (`providers/shared.ts:61-85`, `providers/anyrouter.ts:83-91`) show that known deployments try to report a same-day duplicate. They do not prove that token refresh, streaks, or lottery steps are idempotent. That residual risk, including another AgentRouter login, is accepted in §6.

## 1. Problems

**P1 — Determinate rejections are recorded as uncertainty.** `providers/shared.ts:191-221` funnels every unclassified post-dispatch failure into `uncertain`. AnyRouter calls `newApiFamilyRequests.payload`, which turns on application-error decoding (`apiService/newApiFamily/responseError.ts` `isFailedBusinessEnvelope` → `apiTransport/compatibilityResponse.ts` `createProviderBusinessError`). `{success:false}` or `code !== 0` therefore throws before `providers/anyrouter.ts` can apply its OR of `success === true`, `ret === 1`, and `code === 0`. `{ret:0}` does not match that decoder, so it stays in the provider and becomes `FAILED`. HTTP 400/409/429 are also unclassified because `checkin/autoCheckin/errors.ts:47-59` only special-cases 401/403/408/504/5xx. A bare HTTP 403 becomes `permission_denied` before the body is considered.

**P2 — The cause is recorded and then hidden.** 5xx → `source_unavailable`, timeout → `timeout`, connection loss → `network_error`, unparsable → `upstream_error` (`providers/shared.ts:104-121,191-221`), yet `features/AutoCheckin/utils/autoCheckin.ts` returns one fixed sentence for every `UNCERTAIN`. On `FAILED`, a `reasonCode` is rendered before `rawMessage`, so `createUpstreamFailureResult` hides the site text whenever `messageKey` is absent. `reconcileUncertainResult`'s `reconciliation` values are consumed only by telemetry (`productAnalytics/autoCheckin.ts:236-256`).

**P3 — WAF HTML never becomes diagnostic evidence.** AnyRouter forces a temp window. `entrypoints/content/messageHandlers/utils/tempFetchUtils.ts` `parseResponseData` catches a JSON parse failure and returns the raw text. An HTTP 200 HTML body is then `success: true` with a string body (`tempWindowFetch.ts` handler). `mapCompatibilityResponse` returns that string because this call is not `onlyData`, and AnyRouter treats the missing envelope as an ordinary non-success: `FAILED` with the generic check-in-failed copy and no status or content-type. The direct-fetch parser in `apiTransport/request.ts` `parseResponseByType` already attaches HTTP status; `apiTransport/response.ts` `extractDataFromApiResponseBody` is not this path. Content-type is available on the temp-window response and is then discarded.

**P4 — Retry admission drops the result before the alarm can see it.** Three gates discard retryability, so removing only the readback check is not enough:

- `executeSelectedCheckIn` reports `retryable: true` only for `FAILED` (`methods.ts` execution return). `UNCERTAIN` is forced to `false`.
- `scheduler.ts` `runAccountCheckin` copies `retryable` onto the persisted result only for `FAILED`.
- `isRetryableCheckinResult` (`resultPolicy.ts:7-14`) returns false for every non-`FAILED` status.

Separately, `canSafelyRetryProviderResult` (`methods.ts:138-148`, called at `methods.ts:630-637`) requires `getStatus`, so `anyrouter:daily-checkin` and `agentrouter:login-checkin` never enter the queue. The retry execution also bails out when `requireStatusConfirmationBeforeMutation` is set and `getStatus` is absent (`methods.ts:457-465`). The queue itself is created only on a daily run (`scheduler.ts` around the `isDailyRun` branch), and `runRetryCheckins` clears it unless `lastDailyRunDay` is today. A manual run therefore cannot start same-day recovery. The UI still offers `验证状态` for these methods (`refresh.ts:58-61` → `scheduler.ts:3198-3200`). The background log is `Message handling failed`; the options toast is the generic verification-failed message.

**P5 — The current policy is documented.** `docs/docs/auto-checkin.md:60,75,136` promise read-only verification with no resubmission, and `checkin-method-discovery/spec.md:868` requires verified idempotency before an uncertain mutation may become retryable. This spec changes that deliberately.

## 2. Decisions

- **D1** — Retry admission no longer depends on readback. Readback is an *enhancement* (read, then skip if already checked), not a precondition.
- **D2** — A determinate rejection (a business envelope the provider actually got to inspect, or a 4xx other than 404/405) is `FAILED`, not `UNCERTAIN`. It is still retried unless the body is an obvious dead end from D5. `{success:true}` or `{ret:1}` remains success even when another code field is non-zero.
- **D3** — The result status describes **today's outcome**, not the fate of the request. The site or a readback saying checked maps to `ALREADY_CHECKED` / `SUCCESS`. A readback saying today is not checked maps to `FAILED`, but the mutation's `reasonCode` stays; `reconciliation` records the readback. Only a not-checked readback with no mutation reason uses `checkin_unconfirmed`. Everything whose outcome is unknown stays `UNCERTAIN`. This reverses the `retryable?: never` invariant on `UNCERTAIN` (`types/autoCheckin.ts:195-203`) on purpose.
- **D4** — The existing retry budget stays (`maxAttemptsPerDay`, default 3). The interval stays `retryStrategy.intervalMinutes` (default 30). That default is not a hard floor: a stored smaller interval is honored, and an already-past trigger still uses the existing 15-second fallback. Do not add a new minimum in this change. The budget bounds total automatic attempts per account per local day (initial + alarm retries) as stored in `attemptsByAccount`; an explicit single-account `再试一次` button action still runs on demand without incrementing that alarm count.
- **D5** — Default allow, explicit deny. A provider's own `retryable: false` is not a veto. Automatic retry is refused only for a result that is already clearly hopeless:
  - authentication required or permission denied.
  - the site says this method is disabled.
  - HTTP 404 or 405. Digits inside a message are not this signal.
  - `execution_context_invalid`.
  - every `SKIPPED` precondition: account unavailable, credentials missing, login provider not selected, no selection, detection or global check-in disabled, login provider claimed by another account.
  - a method listed in the D9 `nonRepeatSafe` set.
  Turnstile, other `manual_verification_required` results, session-busy, upstream rejection, and a bare HTTP 403 or HTML challenge are not on this list. Do not add finer exceptions in this change.
- **D6** — Causes are always visible, in this order: specific `messageKey`, then site `rawMessage`, then the reason label, then reconciliation detail. The fixed `UNCERTAIN` sentence is removed. A specific `messageKey` is not replaced by raw text.
- **D7** — `验证状态` is offered only where readback metadata is true. `再试一次` uses the existing per-account `RetryAccount` / `RetryCheckinAccount` action, including every `uncertain` row and every retryable `failed` row. It is not routed through `RunNow`. Obvious dead ends do not show it; opening the site remains their recovery.
- **D8** — Expected verify states become a typed outcome instead of a thrown `Error`.
- **D9** — Escape valve: `NON_REPEAT_SAFE_CHECKIN_METHOD_IDS`, a `ReadonlySet<CheckInMethodId>` in `providers/registry.ts`, default empty. It restores today's conservative behavior for that method after a same-day check-in is observed applying twice. No per-method opt-in and no domain matcher in this change. AgentRouter is not seeded into it.

Explicitly rejected: making every `uncertain` a `FAILED`. A 5xx, a timeout, or a lost response may still have applied the mutation. The status stays "unknown", and the retry is justified by the repeat-safety assumption, not by a claim that nothing happened. Also rejected: treating a conservative `retryable: false`, Turnstile, or another not-yet-decided edge as a dead end. Those stay retryable until a later change says otherwise.

## 3. Evidence → status, then automatic follow-up

### 3.1 Clear evidence maps straight through

| Evidence | Status | Reason | Retryable |
| --- | --- | --- | --- |
| Site says already checked in | `ALREADY_CHECKED` | — | — |
| Site says the check-in succeeded (`success`, `ret === 1`, or `code === 0` for AnyRouter; any one is enough) | `SUCCESS` | — | — |
| Readback says today is checked | `SUCCESS` | — | — |
| Readback says today is not checked, method enabled | `FAILED` | keep the mutation reason; `checkin_unconfirmed` only when the mutation had none. `reconciliation: not_checked` | yes |
| Site refuses the check-in, and the body is not a D5 dead end | `FAILED` | `upstream_rejected` | yes |
| D5 dead end | `FAILED` or `SKIPPED` | matching code | no |
| Affirmative evidence that the request never reached the site (connection or DNS failure, or a pre-dispatch WAF rejection that is not a D5 message) | `FAILED` | `network_error` / `source_unavailable` | yes |
| Anything else: dispatched with no usable answer. Includes timeout, 408, 5xx, lost response, non-JSON/HTML body, bare HTTP 403, HTML 401, no readback, and a failed or inconclusive readback | `UNCERTAIN` | taken from the evidence (`timeout`, `source_unavailable`, `network_error`, `upstream_error`, …) | yes |

Rows 7 and 8 are distinguished by dispatch evidence the transport already has (`mutationLifecycle.dispatched`, temp-window affirmative pre-dispatch evidence). `markPossiblyDispatched` means the request might have left, so the result is row 8. Do not split these rows by matching error-message text. An HTTP 200 or 403 HTML page from AnyRouter is row 8, not proof that today is unchecked.

Status and `reasonCode` are independent axes. The same `network_error` can be `FAILED` when the request never left and `UNCERTAIN` when it left and the answer was lost. When readback fails, keep the mutation `reasonCode` and record the readback in `reconciliation`. A not-checked readback also keeps the mutation reason instead of replacing it with `checkin_unconfirmed`.

### 3.2 Automatic follow-up

| After | What happens, with no user involvement |
| --- | --- |
| Any run (daily, manual, or single-account) produces a retryable result and retry is enabled | the account joins today's `retryState.pendingAccountIds`. The first admission today sets `attemptsByAccount` to 1. A later run does not reset a higher count. |
| The retry alarm runs | at the existing interval, only while `attempts < maxAttemptsPerDay`. Each alarm execution increments that account's count. |
| A queued retry runs, readback available | read first: checked → `SKIPPED(already_checked_today)`; not checked and the method is enabled → POST; readback failed → do not POST on that pass, keep the row retryable |
| A queued retry runs, no readback | POST directly. Absence of `getStatus` does not skip the account. |
| Attempts exhausted | drop it from the alarm queue; the last result stands. The manual `再试一次` button still runs and does not increment the alarm count. |
| D5 dead end | never queued |

Do not mark `lastDailyRunDay` from a manual or single-account run. Do not clear a today-dated pending queue just because that daily marker is absent. The daily alarm still runs at most once per day. The same `executeSelectedCheckIn` call never sends a second POST; recovery is only the later alarm.

A not-checked readback is self-correcting: if an earlier request landed but was not visible yet, the next readback can report checked and the row becomes `ALREADY_CHECKED` without user action.

## 4. Tickets

### T1 — Make a non-dead-end result reach the same-day alarm

- Reason: P4, D1, D5, D9.
- Touchpoints:
  - `canSafelyRetryProviderResult` (`methods.ts:138-148`): drop the `hasStatusReadback` requirement. Return false for a D5 reason or a `nonRepeatSafe` method, and true otherwise, including when the provider passed `retryable: false`.
  - `reconcileUncertainResult` (`methods.ts:307-374`): for not-checked, unavailable, and unknown readback, set `retryable: true` unless the method is disabled or `nonRepeatSafe`. Keep the mutation `reasonCode`. Set `reconciliation` from the readback. Use `FAILED` + `checkin_unconfirmed` only when the readback says not checked and the mutation reason is empty.
  - `executeSelectedCheckIn` return value: propagate `retryable: true` for retryable `UNCERTAIN`, not only `FAILED`.
  - `scheduler.ts` `runAccountCheckin`: copy `retryable` for both `FAILED` and `UNCERTAIN`.
  - `isRetryableCheckinResult`: `UNCERTAIN` is retryable only when `retryable === true` (legacy rows without the flag stay false). `FAILED` keeps `retryable ?? true` so older failed rows do not change historical behavior.
  - `types/autoCheckin.ts:195-203`: allow `retryable: true` on `UNCERTAIN`.
  - `methods.ts:457-465`: `requireStatusConfirmationBeforeMutation` applies only when `getStatus` exists. A missing readback POSTs.
  - Queue: a daily, manual, or `retryAccount` result with `retryable === true` merges into today's pending list under D4's attempt rules. `runRetryCheckins` must not clear that list merely because `lastDailyRunDay` is unset.
  - `NON_REPEAT_SAFE_CHECKIN_METHOD_IDS` in `providers/registry.ts`, default empty.
- Behavior: see §3. The in-flight call still performs at most one mutation.
- Tests: `tests/services/autoCheckin/providers/geniusProgrammer.test.ts:253-280` changes the admitted retryability but still expects one POST in that execution. `checkInMethods.test.ts`, `resultPolicy.test.ts`, and `scheduler.test.ts` cover legacy `UNCERTAIN` without a flag, provider `retryable: false` still admitted, manual-run queue membership, no `lastDailyRunDay` write from that manual run, and the alarm's read-first path.

### T2 — Classify the body the provider actually sees

- Reason: P1, D2, D5.
- Touchpoints: AnyRouter check-in stops using `payload` application-error decoding and reads the envelope, so `success` / `ret` / `code` are judged together. Add `AUTO_CHECKIN_SKIP_REASON.UPSTREAM_REJECTED` (`types/autoCheckin.ts` and the exhaustive `SKIP_REASON_TRANSLATION_KEYS` map). Map a real refusal to `FAILED` + `upstream_rejected` + retryable in `providers/shared.ts`.
- Required ordering, before the generic refusal: already-checked copy, provider success signals, message-evidenced authentication or permission, method-disabled copy, then transport 404/405. `providers/newApi.ts:197-214` is only the page-fallback guard; `resolveDirectFailureReason` currently collapses both auth and permission to `AUTHENTICATION_REQUIRED`. Split them when the copy distinguishes `无权限` / `forbidden` from login copy. Either dead-end code is non-retryable.
- HTTP status: 404/405 are method-unsupported and non-retryable. Bare 403, HTML 401, 400, 409, and 429 are not D5 dead ends. 408, 5xx, timeout, and non-JSON bodies stay row 8.
- Do not change `getCheckInMethodUnknownReason` or discovery evidence as a side effect of `classifyAutoCheckinError`. Check-in execution owns this distinction.
- Behavior: a refused check-in shows as failed with the site's own message and is queued. `未登录` is not queued.
- Tests: `providers/shared.test.ts` for auth text, bare 403, and HTML 401; `providers/anyrouter.test.ts` through the real envelope, including `{ret:1, code:1}` and `{success:false}` already-checked copy.

### T3 — Show the cause

- Reason: P2, D6.
- Touchpoints: `features/AutoCheckin/utils/autoCheckin.ts` result-message resolver, including `reconciliation` in its input. Render through `components/ResultsTableRow.tsx` and `components/ResultsTable.tsx`. `FeedbackForm.tsx` inherits the resolver. Add locale keys and run `pnpm run i18n:extract:ci` so every catalog under `src/locales/` is complete, not only `zh-CN` and `en`.
- Tests: `tests/features/AutoCheckin/utils/autoCheckin.test.ts`.

### T4 — Make a non-JSON temp-window body diagnosable

- Reason: P3.
- Touchpoints: when JSON was requested and the temp-window body is text or the content-type is not JSON, produce a check-in error carrying HTTP status and content-type. Do this before AnyRouter treats the string as an envelope. Also attach content-type to the direct `parseResponseByType` JSON failure. Localized copy, for example "returned text/html instead of JSON (HTTP 200)".
- Behavior: dispatched HTML is `UNCERTAIN`, retryable, with that cause visible. It is not a silent generic `FAILED`.
- Excluded: response-body snippets. Status and content-type are enough, and bodies can carry session material.
- Tests: temp-window HTML 200 and bare 403 fixtures through the AnyRouter check-in path.

### T5 — Publish read-only readback capability as pure metadata

- Reason: D7 needs capability without importing the executable provider graph into the options bundle (`refresh.ts:52-56`). `providers/registry.ts` is already imported by UI code (`checkInPresentation.ts:15`, `useAccountDialog.ts:100`, `useAccountCheckInRedetection.ts:18`), so this adds no import.
- Touchpoints: `providers/registry.ts` — add `supportsStatusReadback` to `AutoCheckinMethodDefinition` plus a selector; keep `index.ts` as the only executable mapping.
- Tests: `tests/services/autoCheckin/providers/registry.test.ts` — assert the metadata equals `Boolean(provider.getStatus)` for every registration. The UI reads it with `=== true`, so drift hides the verify button instead of offering a dead one.

### T6 — Gate actions by capability

- Reason: P4, D7.
- Touchpoints: `components/ResultsTableRowActions.tsx` — `验证状态` only when `supportsStatusReadback === true`. Show the existing `再试一次` button (`AutoCheckin.tsx` `handleRetryAccount`, `RetryCheckinAccount`) for `uncertain` rows and retryable `failed` rows, including readback-capable rows whose readback failed. Do not send that action through `RunNow` / `ManualCheckin`.
- Behavior: the button remains available after the alarm budget is exhausted and does not increment `attemptsByAccount`. D5 rows do not show it. The manual retry handler surfaces failures with error toasts instead of unconditional success. `resolveAutoCheckinTroubleshootingHintKey` exposes troubleshooting and bypass navigation for `UNCERTAIN` results as well as `FAILED`.
- Tests: `tests/features/AutoCheckin/components/ResultsTable.test.tsx`, `tests/features/AutoCheckin/utils/autoCheckin.test.ts`.

### T7 — Structured background verify outcome and storage persistence

- Reason: D8. Unsupported, unavailable, and not-saved are expected verify states and today share one thrown `Error` (`scheduler.ts:3198-3200,3207-3209`), which the listener logs as `Message handling failed`. When verified, the outcome must persist to `autoCheckinStorage` so the UI and retry queue reflect the confirmed reality.
- Touchpoints: `scheduler.ts` `verifyAccountStatus`, `messaging.ts`, `AutoCheckin.tsx` verify handler.
- Tests: `scheduler.test.ts` verify coverage, `runtimeTypedMessagingSetup.test.ts`.

### T8 — Documentation and design-spec amendment

- Reason: P5. The change reverses the documented read-only promise.
- Touchpoints: `docs/docs/auto-checkin.md:60,75,136` (and the nearby `待确认` wording), Chinese source first, then `docs/docs/en/auto-checkin.md` via `docs_assistant/translate.py`. Append an amendment to `.scratch/checkin-method-discovery/spec.md` replacing "verified idempotency policy" with this repeat-safe assumption and recording §6. Do not edit `docs/docs/changelog.md`; the next release notes carry it.

### T9 — Validation

- Targeted vitest for T1 through T7, including manual queue admission, bare 403 / HTML 200, and the AnyRouter success OR. `pnpm run i18n:extract:ci`. No full-suite run and no new e2e. The genius-programmer lost-response test must still observe one POST.
- Manual: one AnyRouter run whose row shows the concrete cause, and whose lost or HTML response is queued for later the same day without another POST in that same run.

## 5. Non-goals

- No write-ahead journal or generic operation guard.
- No read-only status endpoint for AnyRouter, and no change to its Turnstile or native-page fallback behavior. A Turnstile miss stays retryable.
- No immediate in-run resend. The automatic retry is the delayed alarm.
- No new persisted result fields beyond allowing `retryable` on `UNCERTAIN`. `reconciliation` values stay the existing set.
- No domain-scoped escape hatch. D9 is a method-id set.
- No new hard minimum on the retry interval.
- No automatic retry of a D5 dead end.

## 6. Residual risk

Accepted with the repeat-safety assumption:

1. **Side effects beyond the daily flag.** Some forks also renew a token, increment a streak, or run a lottery step. A duplicate may repeat those branches. AgentRouter is the sharp case: a retry runs another OAuth login and can disturb the shared browser session, including after `session_busy`.
2. **Rate-limit and WAF friction** on mutation endpoints (AnyRouter depends on WAF cookies, `providers/anyrouter.ts:59-62`). The existing interval and attempt budget reduce it; they do not remove it. Bare 403 and HTML challenges are retried on purpose.
3. **Budget consumption.** Each alarm retry uses one of `maxAttemptsPerDay` (default 3). The manual button does not.
4. **A readback is an observation, not proof.** "Not checked yet" cannot exclude an in-flight request, a delayed write, or a status projection from different data. Retry is admitted by the repeat-safety assumption, not by treating readback as proof.

These are a deliberate increase in unattended writes. A manual full run can already POST again, but methods without readback did not previously get a working same-day retry. If a site is observed applying one check-in twice in a day, add that method to the D9 set instead of reverting the policy.


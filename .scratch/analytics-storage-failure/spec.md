# Core reliability and continuous analytics

Status: ready-for-human

Reviewed 2026-11-28 against base `198a67164117ebaa349ebc9ae2f1d3daa2cdb677`. This document records the final contracts and interpretation limits; regression tests own implementation details.

## Reliability

Legacy account reads return the canonical readable snapshot when persisting account or tag migrations fails, and retry deferred migration on a later read. A genuine strict read failure still propagates. Mutation locks and writes retain their existing behavior; this fallback must never overwrite unknown data after a failed read.

Every WebDAV request uses explicit configured Authorization with `credentials: omit`. A rejected login returns to existing error handling independently of browser cookies and HTTP authentication. Provider requirements, including application passwords, still apply. Connection checks, backup verification, atomic replacement and cleanup retain their existing protocols.

The WebDAV challenge symptom is related to [issue #589](https://github.com/qixing-jk/all-api-hub/issues/589), which was already resolved by using an application password. This change supplies an extension-side boundary; it does not establish the cause of other historical WebDAV or uninstall reports.

## Collection policy

All eligible foreground and passive events are collected for every enabled installation under the existing consent, configuration, privacy and remote-disable gates. There is no installation sampling or sampling metadata. Event budgets are controlled only by the independent diagnostic cooldown and snapshot cadence described below; no daily volume forecast is claimed.

Storage failure diagnostics reserve one attempt per operation/stage per rolling 24 hours in browser session storage, before SDK capture and under a separate write lock. An SDK failure consumes the slot. Unavailable, unreadable or unwritable session storage suppresses this diagnostic rather than falling back to the failing local store. Other events retain their existing admission path. Browser restart or extension reload clears session admission, so this is not an absolute daily budget. Throttling does not diagnose or repair the underlying storage outage.

Settings and ecosystem snapshots retain the three-day cadence, one in-flight capture per category, and worker/session fallback when local timestamp writes fail. A partially captured ecosystem prefix consumes the session cadence to prevent replay after a later group fails. Empty or failed initial captures do not consume it. If both persistence layers fail, fallback protection lasts only in the current worker.

## Outcome semantics

Expected access-token verification completes account auto-detection as `action_required`, carrying its controlled reason/identity evidence without failure diagnostics. Other failures, cancellation and successful recovery remain distinct. Do not replace the exact verification condition with the broader access-token recovery predicate.

For older releases, normalize only the matching detection failure when comparing versions:

```sql
if(
  event = 'feature_action_completed'
  AND properties.action_id = 'run_account_auto_detect'
  AND properties.result = 'failure'
  AND properties.account_auto_detect_failure_reason = 'access_token_verification_required',
  'action_required',
  properties.result
) AS normalized_result
```

Opening the UI may automatically pretrigger check-in. Its completion has automatic source, actual popup/sidepanel/options entrypoint and a dedicated surface; it does not emit explicit manual intent. Check-in execution, retry and user feedback are unchanged.

`account_dialog_closed` reports one coarse state observation per explicit Add Account close/opening: phase, validity, issue count, blocking/verification flags and pending detection/save. Edit closes and unmount alone emit none. Shared programmatic and post-save close paths can emit it, while browser-dismissed popups may not. It is neither a causal abandonment reason nor proof of failed creation; use ordered create/save events to assess recovery. No URL, credential, raw identity or form text is collected.

Copy Key reports inventory/selection fallback as `action_required`; direct clipboard completion alone is success. Failures retain request, secret-resolution or clipboard-execution stages and recovery availability. The UI is unchanged.

## Verification and rollout

Regression coverage spans account migration fault injection, WebDAV challenge/commit/cleanup, analytics session and worker restarts, partial snapshot capture, privacy, automatic check-in, expected verification, explicit close lifecycle and clipboard fallback. The focused reliability run passed 1,113 tests; the subsequent behavior-preserving refactor passed 608 distinct tests plus compile and knip. Normal commit hooks also passed. Detailed local evidence is retained under ignored `artifacts/`; these counts are separate runs with overlapping coverage, not additive totals.

The reusable [WebDAV probe](webdav-auth-probe.mjs) requires Node 24, installed project dependencies and Playwright Chromium. From the checkout root, run `node .scratch/analytics-storage-failure/webdav-auth-probe.mjs`. It loads the production helper in a disposable MV3 extension against a loopback server with synthetic credentials. In Chromium, the baseline attached a cookie and timed out on the challenge; the fixed request returned 401 directly, attached no cookie and accepted 204 while retaining Authorization. This is headless request evidence, not visual confirmation of a native browser dialog or validation against a real provider. Firefox/Safari and a full release upgrade remain unverified.

[Post-release queries](post-release-queries.json) are reusable read-only definitions, not executed rollout evidence. After release, compare event volume by app version, inspect old-version traffic and daily volume, and compare automatic/manual actions and close observations with subsequent creation. Validate continuous collection before calculating complete D1/D3/D7 cohorts. Quota gaps remain missing data; foreground retention should use `app_opened`, not passive background activity. No subscription change or historical backfill is included.


## Full collection acceptance: 2026-11-28

The proposed 5% installation sampling was withdrawn before publication at the user's request. Its cohort/hash module, sample-rate types and collection metadata were removed, along with the associated volume projection. The remaining storage cooldown, snapshot deduplication, outcome classification and reliability fixes are unchanged.

At the existing `productAnalyticsClient.capture` to PostHog boundary, the regression first observed only 15 of 39 events for previously excluded installations. After removing sampling, all 39 passive/foreground observations across three worker lifetimes are captured for each tested installation, and caller-supplied collection metadata is stripped. The complete client suite passed 35 tests. Retained [red](artifacts/remove-sampling-20261128/red.log) and [green](artifacts/remove-sampling-20261128/green.log) evidence is local. The full analytics suite passed 377 tests across 22 files; compile and knip passed, with the existing knip ignore-pattern hint. These results and the normal commit-gate log are retained in the same directory. No UI or extension API behavior changed; this pass adds no live-browser or post-release claim.

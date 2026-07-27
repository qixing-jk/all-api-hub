# Temporary Page Concurrency Design

Date: 2026-07-17

## Purpose

Prevent automatic check-in and account refresh work from opening or operating
too many temporary browser pages at once without throttling ordinary API work
at the scheduler layer.

The current scheduler processes account check-ins in fixed batches of three
with a 250 ms delay between batches. Post-checkin account refresh uses the same
batch size. Each batch waits for its slowest item before the next batch starts,
so completed slots cannot be refilled continuously. The limit also applies to
API-only work even though the original resource failure involved providers that
opened many browser pages concurrently.

## Decision

Remove both account-level batching policies from the auto-checkin scheduler and
move resource admission to the layers that own the constrained resource:

- API requests continue through the existing per-origin API transport limiter.
- Self-contained temporary-page operations enter one background `p-queue` with
  global concurrency `3`.
- Temporary-page operations for the same origin execute serially because the
  pool may reuse one tab for that origin.
- The scheduler remains responsible only for account orchestration, error
  isolation, result aggregation, retry state, post-checkin refresh, persistence,
  and completion notification.

The concurrency value is fixed. This slice does not inspect device performance,
add system permissions, expose a setting, or implement adaptive scaling.

## Scheduler Behavior

Delete the scheduler-owned check-in batch size, inter-batch delay, generic batch
processor, and batch-specific account runner.

Eligible account check-ins start without an account-level batch barrier. Each
account keeps its current independent error-to-result conversion so one
unexpected rejection does not abort the run.

Successful check-ins still trigger the existing best-effort forced account
refresh before the completion notification. These refreshes also start without
an account-level batch barrier. Refresh failures remain isolated and do not
change check-in completion semantics.

This preserves the business behavior introduced to update balances, quotas,
health, and check-in status while removing duplicate resource policy from the
scheduler.

## Resource Boundaries

### API requests

The existing API transport limiter remains authoritative for API traffic. It
limits each site origin independently, including API calls made during account
refresh. No new cross-origin global network limit is added.

If cross-origin API traffic later proves harmful, the appropriate extension
point is the API transport layer rather than the auto-checkin scheduler.

### Temporary-page operations

One feature-owned queue in the background temp-window pool limits active,
self-contained page operations to three. The queue covers the entire operation:

1. wait for global and origin admission;
2. acquire or reuse a temporary context;
3. navigate, inspect, trigger, or fetch through the page;
4. execute cleanup in the existing `finally` path;
5. release the queue slot whether the operation succeeds or fails.

The shared queue covers every pool path that calls `acquireTempContext`:

- rendered-title reads;
- site auto-detection page reads;
- generic temp-window fetch;
- native check-in page action;
- Turnstile-assisted fetch.

Queueing belongs inside these handlers/helpers rather than only at runtime
message routing because background-local fallback code calls them directly.
Queueing only context creation or acquisition is insufficient because it would
release the slot before navigation and page work finish.

### Same-origin serialization

The existing origin lock protects pool bookkeeping only. It does not cover the
full operation after acquisition, and concurrent requests can reuse the same
tab. Add a separate per-origin operation queue with concurrency one.

Origin admission must precede global admission so several same-origin tasks do
not occupy all three global slots while waiting for one shared tab.

Idle per-origin queues are removed after they drain so origins do not accumulate
for the lifetime of the service worker.

## Scope Boundary

The limit applies to active page operations, not the exact number of physical
tabs or windows still present in the browser. Existing delayed context cleanup
may retain an idle context briefly after its operation releases a queue slot.

`OpenTempWindow` and `CloseTempWindow` are excluded. They form a manual,
cross-message lifecycle, so queueing only the open handler would limit creation
momentarily rather than hold capacity until close. Strict physical-page limits
or manual-page permits would require a separate lifecycle design.

The queue is process-local like the existing temporary-context maps. MV3 service
worker restart behavior is unchanged; no queue state is persisted and no
keepalive mechanism is added.

## Failure and Compatibility Behavior

- A page-operation rejection releases both origin and global capacity.
- Waiting tasks start as soon as capacity becomes available; there is no fixed
  delay between tasks.
- Invalid or policy-blocked requests return before consuming page capacity where
  practical.
- Existing force-close, delayed cleanup, suspend cleanup, Firefox behavior,
  window/tab fallback, and response contracts remain unchanged.
- API-only providers do not wait for temporary-page capacity.
- The queue must bundle in Chromium, Firefox, and Safari WXT builds.

## Testing

Use TDD at the resource boundaries:

- start four different-origin page tasks and prove only three enter page work;
- complete one of the first three while the others remain pending and prove the
  fourth starts immediately;
- prove a rejected page task releases capacity;
- prove two same-origin operations do not overlap while another origin can use
  a free global slot;
- prove each temp-page handler participates in the shared queue;
- update scheduler tests to prove all eligible check-ins can be dispatched
  without a batch delay while unexpected per-account failures remain isolated;
- preserve post-checkin refresh, deduplication, and best-effort failure tests
  without asserting fixed account batches.

Focused Vitest tests are the primary coverage layer. No new Playwright scenario
is planned because the contract is deterministic queue admission and scheduler
orchestration, which browser-level E2E would test less precisely.

Run related Vitest suites, dependency/build checks, `pnpm run validate:staged`,
and `pnpm run validate:push` before handoff because the change adds a dependency
and modifies background runtime behavior.

## Release Readiness

- Telemetry: reuse existing check-in and temporary-window result events; no new
  event is needed for an internal scheduling change.
- Settings search/deep links: not applicable; no setting is added.
- Permissions: none; device CPU and memory APIs are not used.
- Maintainability: centralize page admission in one feature-owned module and
  remove scheduler batching rather than introducing another concurrency helper.

# 08 — Retry a close the browser refused

- Status: ready-for-agent
- Parent: `.scratch/temp-window-orphan-cleanup/spec.md`
- Blocked by: 03, 07

## Goal

A close that the browser rejected is retried on a timer instead of waiting for the next wake.

## Why

The sweep only runs when the worker is activated, and the wake that follows a rejected close is not guaranteed to be soon: the scheduled wakes are hours apart, so a leftover from a refused `tabs.remove`/`windows.remove` can sit in the window list until the user happens to open the extension. That is the one failure the extension knows about at the moment it happens.

## Work

- Arm a one-shot alarm (shortest delay Chrome honours, 1 minute) when a close is rejected — from the pool's two close-failure paths and from a `failed` outcome during a sweep — and keep an already armed retry instead of pushing its deadline out.
- Run the sweep from the alarm, registered at background startup before the first await so an alarm wake is handled in the same activation; the listener filters on its own alarm name, and a retry that finds nothing is a no-op.
- Nothing else persists the retry: an alarm that never fires costs nothing because its markers are still there for the next start.
- Report the armed state in the debug surface so the panel shows it.

## Validation

- `tests/services/browsingContext/internalTabReclamation.test.ts`: a failed close arms the retry, a second failure keeps the same alarm, and a clean sweep arms nothing.
- `tests/entrypoints/background/tempContextReclamation.test.ts`: the listener sweeps for its own alarm and ignores others.
- `tests/entrypoints/background/tempWindowPoolWindowFallback.test.ts`: a window close and a tab close both rejected arm the retry.
- `tests/entrypoints/background/backgroundSuspendCleanup.test.ts`: the entrypoint registers the listener during startup.

## Comments

- The alarm is armed before the risk as well: `acquireTempContext` arms it as soon as a context is handed to a request, so a worker that dies before its timer-based close is replaced by a worker the alarm wakes. That is the case a failure-only trigger could not cover.
- A sweep that still finds a live request holding a young temp page keeps the alarm armed (the risky window has not passed); the heartbeat stops for held pages older than ten minutes, so a ghost-held context cannot wake the worker every minute forever.
- Alarm timing facts checked against the Chrome docs while doing this: the honored floor is 30 seconds (values below 0.5 minutes are rejected with a warning), and `persistAcrossSessions` defaults to true in current Chrome, which is why an alarm armed before the risk survives the worker death it insures against.
- Covered by: `internalTabReclamation.test.ts` (arm on failure, keep an armed retry, heartbeat on a live page, heartbeat stops when old, nothing armed on a clean sweep), `tempWindowPoolWindowFallback.test.ts` (arming on acquire, and on both close failures), `tempContextReclamation.test.ts` (listener filters by name), `backgroundSuspendCleanup.test.ts` (startup registration), plus `e2e/tempWindowOrphanReclamation.spec.ts` asserting `retryArmed` after a tracked context.


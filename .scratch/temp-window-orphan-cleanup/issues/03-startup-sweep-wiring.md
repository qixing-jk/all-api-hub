# 03 — Run the sweep at background start

- Status: ready-for-agent
- Parent: `.scratch/temp-window-orphan-cleanup/spec.md`
- Blocked by: 02

## Goal

A surviving marker is reclaimed on the next background start, without blocking startup.

## Work

- Expose a per-tab ownership check from the temp-context pool (e.g. `isTempContextTabTracked(tabId)` in `tempWindowPool.ts`) so the sweep can skip live contexts instead of importing the pool, and a context created mid-sweep stays tracked.
- Call the reclamation fire-and-forget from the background entrypoint after `initializeServices()` (`src/entrypoints/background/index.ts`, `main()`), wrapped so a failure only logs.
- Document in the call site that this runs on every service-worker activation, which is the recovery path for closes lost to worker death.
- Skip all browser work when no markers exist.

## Validation

- Unit test that the wiring calls the sweep once and swallows failures.
- `pnpm compile` plus the background entrypoint suites.

## Comments

- The pool exports `isTempContextTabTracked(tabId)`, and `src/entrypoints/background/tempContextReclamation.ts` composes it with the sweep.
- `main()` calls `reclaimOrphanedTempPages()` last, fire-and-forget, logging failures only.
- `tests/entrypoints/background/backgroundSuspendCleanup.test.ts` covers both the call and the swallowed failure; the two entrypoint suites mock the new module.

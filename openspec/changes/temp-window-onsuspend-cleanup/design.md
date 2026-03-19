## Context

The current temp-window fallback lifecycle lives primarily in `src/entrypoints/background/tempWindowPool.ts`. It tracks temporary contexts in memory, reuses same-origin contexts when possible, and closes them through the normal release path after a short delay. The background entrypoint in `src/entrypoints/background/index.ts` already registers lifecycle listeners such as startup and install handlers, and `src/utils/browser/browserApi.ts` already provides thin wrappers for runtime and tab/window events.

The nearest existing abstractions and how this change should use them:
- `src/entrypoints/background/tempWindowPool.ts`: reuse and extend the existing temp-context tracking and destroy helpers; do not introduce a parallel temp-context registry.
- `src/utils/browser/browserApi.ts`: extend the existing lifecycle-wrapper pattern with an `onSuspend` helper instead of wiring raw runtime listeners directly in the background entrypoint.
- `src/entrypoints/background/index.ts`: reuse the current background initialization pattern by registering one additional lifecycle listener during startup.
- `src/services/checkin/externalCheckInService.ts`: do not reuse or modify this path because it opens user-facing pages that are intentionally outside the temp-window pool.

The motivating problem is specific to Chromium MV3 service workers. Normal temp-context cleanup is deferred to improve reuse, but worker unload can happen before delayed cleanup finishes. A small suspend-time cleanup hook is the lowest-cost mitigation that can reduce orphan temporary pages without changing the current reuse strategy.

## Goals / Non-Goals

**Goals:**
- Add a best-effort suspend-time cleanup path for tracked temp-window fallback contexts.
- Keep the normal delayed release and short reuse window unchanged while the background remains alive.
- Limit the change to the background temp-window pool and lifecycle wiring.
- Add enough logging and tests to verify whether suspend cleanup is invoked.

**Non-Goals:**
- Guarantee cleanup completion during service-worker unload.
- Replace delayed timer-based cleanup with persisted leases, alarms, or startup sweep logic.
- Change temp-context acquisition, reuse, or idle-timeout policy.
- Auto-close external custom check-in pages opened by `externalCheckInService`.

## Decisions

### Decision: Add `runtime.onSuspend` as a supplemental cleanup hook

The implementation will register a best-effort suspend listener from the background entrypoint and delegate cleanup to the temp-window pool.

Why this approach:
- It is the smallest possible change that directly targets the observed failure mode.
- It improves behavior without changing request-time reuse semantics.
- It matches the existing background-lifecycle wiring style already used for `onInstalled` and `onStartup`.

Alternatives considered:
- Do nothing: rejected because orphan temporary pages are already user-visible.
- Replace delayed cleanup with immediate close: rejected because it defeats the current reuse optimization.
- Introduce persisted temp-context leases plus alarm/startup sweep: better long-term reliability, but intentionally deferred because it adds more moving parts than this mitigation needs.

### Decision: Reuse the existing temp-window state and destroy logic

Suspend cleanup should iterate the temp-window pool's currently tracked contexts and call the existing close/destroy path instead of reimplementing tab/window removal logic elsewhere.

Why this approach:
- It keeps cleanup rules in one module.
- It avoids a second source of truth for temp-context ownership.
- It preserves the existing mapping cleanup behavior already used for manual close and tab/window removal handlers.

Alternatives considered:
- Close tabs/windows directly from `index.ts`: rejected because it duplicates temp-window ownership logic.
- Add a separate generic cleanup service: rejected because the scope is too small to justify a new abstraction.

### Decision: Scope suspend cleanup strictly to temp-window fallback contexts

The cleanup entrypoint will only act on contexts tracked by `tempWindowPool`.

Why this approach:
- Those contexts are extension-owned temporary infrastructure.
- External custom check-in windows are user-facing and should not be implicitly closed by this patch.

Alternatives considered:
- Sweep any recently created extension-opened page: rejected because ownership is ambiguous and risks closing pages the user intentionally opened or is actively using.

## Risks / Trade-offs

- `[Best-effort only]` `runtime.onSuspend` does not guarantee async completion -> Mitigation: document the behavior as an improvement, not a complete fix, and keep existing normal cleanup intact.
- `[Concurrent shutdown]` suspend cleanup may race with normal release/destroy flows -> Mitigation: reuse the existing destroy path and tolerate already-removed contexts as a no-op.
- `[Cross-browser variance]` Firefox MV2 and Chromium MV3 lifecycle details differ -> Mitigation: hide listener wiring behind `browserApi` and keep the behavior harmless when suspend never fires.
- `[Future blind spots]` issue reports may still be hard to diagnose -> Mitigation: add explicit suspend-cleanup logging for invocation and outcome counts.

## Migration Plan

1. Add an `onSuspend` wrapper in `browserApi`.
2. Expose a temp-window-pool cleanup function that performs best-effort shutdown of tracked contexts.
3. Register the suspend listener in the background entrypoint.
4. Add targeted tests for the suspend hook and cleanup entrypoint behavior.

Rollback is straightforward: remove the listener registration and helper without data migration or persisted-state cleanup.

## Open Questions

None for this minimal mitigation. If orphan temp pages still reproduce after this change, the next step should be a persisted lease plus startup/alarm sweep design rather than expanding `onSuspend` complexity.

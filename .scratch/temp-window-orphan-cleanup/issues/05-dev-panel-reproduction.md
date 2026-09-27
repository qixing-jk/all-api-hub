# 05 — Dev-panel reproduction surface

- Status: ready-for-agent
- Parent: `.scratch/temp-window-orphan-cleanup/spec.md`
- Blocked by: 03

## Goal

A human can reproduce a leftover and watch reclamation work in the real browser, instead of inferring it from unit tests.

## Work

- Dev-only runtime actions (`RuntimeActionPrefixes.TempContextDebug`, gated by `isDevelopmentMode()` like the balance-history debug action):
  - create an orphan fixture in the shapes users actually see — an owned popup window, a shared background tab, and an active tab — each writing a real ownership marker without registering a temp context;
  - create a real tracked temp context through the pool and never release it (the "live worker still owns it" case, and the raw material for the restart repro);
  - list current markers with their scope, age, and whether the live pool tracks them, plus the last reclamation summary of this worker;
  - run reclamation now and return its summary.
- Dev panel section (`src/features/DevPanel/sections/`), options surface: those actions plus "Dev: Restart background worker" (`reloadRuntime()`), which is the honest repro — the leftover survives the worker, and the next start reclaims it.

## Validation

- `tests/entrypoints/background/tempContextDebug.test.ts`: the gate rejects outside development, each fixture writes the marker it claims, and reclamation now returns the summary.
- Merge-visible check: entries appear in the dev panel and the panel reload action restarts the worker.

## Comments

- Actions live in `src/entrypoints/background/tempContextDebug.ts` (`RuntimeActionIds.TempContextDebug*`), routed next to the balance-history debug action and gated on `isDevelopmentMode() || isTestMode()` so a shipped build refuses them.
- Fixtures persist a marker without claiming live ownership (`persistInternalTabMarker`), which is exactly the state a dead worker leaves; the tracked-context fixture opens a real temp context through the pool and never releases it.
- The panel section is `src/features/DevPanel/sections/tempContextSection.tsx`, options surface, with markers + recent runs as rows.
- `tests/entrypoints/background/tempContextDebug.test.ts` covers the gate, each fixture, scenario validation, listing and on-demand reclamation (13 cases). A mutation on the owned-window scope mapping fails exactly its case.
- `tests/features/DevPanel/tempContextSection.test.tsx` covers the section through the shared harness: rows from the last read, the shape each leak action asks for, the reclaimed count, the restart action, a failed action, and the disabled-while-running wiring.
- That test also caught a render loop: reading the clock during render made the section a new object every render, and the panel registry re-registers on identity change. The instant is now fixed at read time.


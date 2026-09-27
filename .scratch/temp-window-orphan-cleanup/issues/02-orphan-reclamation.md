# 02 — Reclaim orphaned internal tabs

- Status: ready-for-agent
- Parent: `.scratch/temp-window-orphan-cleanup/spec.md`

## Goal

One operation that closes extension-owned temp tabs/windows which nothing is tracking any more, keyed only on ownership markers.

## Work

- New background-safe module (suggested: `src/services/browsingContext/internalTabReclamation.ts`):
  - input: stored records, the ids tracked by the live temp-context pool, and the live browser tabs/windows;
  - `skip` when the tab no longer exists (clear the marker only);
  - `skip` when the tab id is tracked by the current worker;
  - `skip` when the tab is the active tab of a focused window;
  - otherwise close: `windows.remove(tab.windowId)` for `mode: "window"` with `tabs.remove(tabId)` as fallback, `tabs.remove(tabId)` for shared-window modes;
  - clear the marker only after the close resolved successfully;
  - return a bounded summary (counts plus per-tab reasons) for logging; no URLs in logs.
- Keep the decision logic testable apart from the browser calls (browser access stays in one thin executor).

## Validation

- New `tests/entrypoints/background/tempWindowOrphanReclamation.test.ts` (or a service-level equivalent) covering each decision above, the fallback path, and the no-op case.

## Comments

- Landed as `src/services/browsingContext/internalTabReclamation.ts` with `reclaimOrphanedInternalTabs({ isTabTracked })`; the window/tab close helper lives in `src/utils/browser/ownedTabRemoval.ts` and is shared with the pool.
- Tests live in `tests/services/browsingContext/internalTabReclamation.test.ts` (fake browser, 8 cases).
- A suite-wide mutation check confirmed the visibility rule is actually asserted.

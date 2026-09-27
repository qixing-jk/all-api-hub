# Reclaiming Temporary Windows Left Behind

- Status: Implemented
- Date: 2026-09-27
- Source: user feedback ("临时窗口可能还是没关掉，残留的甚至不是任何一个站点")
- Surface: temp-context lifecycle (`src/entrypoints/background/tempWindowPool.ts`), internal-tab ownership (`src/services/browsingContext/internalTabsBackground.ts`), background startup (`src/entrypoints/background/index.ts`)

## Problem

Users still see temporary windows/tabs after the flow that opened them finished. What survives is often not a recognizable site page: a popup/tab created at `about:blank` that never got navigated, i.e. a blank window or a tab that looks like a new tab.

Two consequences:

1. A stray window is user-visible damage: temp contexts are created minimized, and the interactive flows bring them forward, so leftovers surface in the window list.
2. Anything that identifies temp contexts by their final site URL cannot find these leftovers. Ownership must come from the marker the extension already writes.

## Evidence in the current code

- Temp contexts start at `TEMP_CONTEXT_INITIAL_URL = "about:blank"` (`tempWindowPool.ts:127`) and are navigated later by `updateTab` inside `createTempContextInstance` (`tempWindowPool.ts:2764`). Anything that interrupts the flow between window creation and navigation leaves a blank window/tab, never a site URL.
- Every close path is in-memory and timer-driven: `releaseTempContext` schedules a 2s delayed release (`tempWindowPool.ts:2377`), `scheduleContextCleanup` arms a 3s/5s idle timer (`tempWindowPool.ts:3133`), and `destroyContext` removes the window/tab last (`tempWindowPool.ts:3239`). An MV3 worker that dies inside those windows leaves the context open with nothing left to close it.
- `cleanupTempContextsOnSuspend` (`tempWindowPool.ts:1236`) is the only wholesale cleanup, and `runtime.onSuspend` is not guaranteed to run; it also cannot await.
- Removal failures are swallowed and the context record is already deleted (`logger.warn("Failed to remove temp context")`, `tempWindowPool.ts:3243`), so a transient `tabs.remove`/`windows.remove` rejection leaks the window with no retry.
- The composite mode remembers its shared window only in memory (`compositeWindowId`, `tempWindowPool.ts:1093`): after a worker restart the window is neither reused nor closed.
- `handleCloseTempWindow` answers `messages:background.windowNotFound` whenever the requestId is not in `tempRequestContextMap` (`tempWindowPool.ts:1371`), which is exactly the post-restart state. (No client calls this action today; recorded as context, not as work.)
- The one ownership fact that does survive a restart is the per-tab marker `internalBrowsingTab:<id>` in `chrome.storage.session` (`internalTabsBackground.ts:8`), written before navigation and read by `getInternalTabIds` across worker restarts (asserted in `tests/services/browsingContext/internalTabs.test.ts`). Today it is only used to *hide* extension-owned tabs from browsing-context signals; nothing consumes it to *close* them.

## Decisions

1. **Reclaim on ownership, never on URL.** The marker is the identifier; a blank or new-tab-shaped leftover is reclaimed exactly like a site-shaped one.
2. **Task-level orphan is defined against the live worker.** At worker start the in-memory pool is empty, so every surviving marker belongs to a dead idea of ownership. A marker is an orphan when the live pool does not track its tab, and the pool is asked per tab (`isTempContextTabTracked`) rather than handed over as a snapshot, so a context created while a sweep is already running is never mistaken for a leftover.
3. **The sweep runs at background start**, i.e. at every service-worker activation (alarm wakes included), fire-and-forget after `initializeServices()`. No periodic alarm: worker wakes are frequent and every leak listed above is only observable after a wake. A sweep with no markers must do no browser work beyond the storage read.
4. **Ownership record instead of a boolean.** Store `{ windowScope, createdAt }` per tab, where `windowScope` says whether the tab owns its window (`owned`) or only occupies a shared window (`shared`, i.e. composite and plain-tab contexts), so reclamation restores the close semantics of `removeTempWindowHandle`. Registration is the only writer and states the scope at the call site. Reads stay tolerant of the legacy `true` marker, which is treated as shared ownership.
5. **Never close a tab the user is looking at.** An orphan that is the active tab of a focused window is skipped and left for a later sweep. The extension does hand temp windows to the user on purpose, and a leftover is indistinguishable from one of those by ownership alone; being on screen is the fact that separates them, which a URL- or age-based rule could not see.
6. **Window-owned orphans close their window, with a tab fallback.** One shared helper (`~/utils/browser/ownedTabRemoval.ts`) removes window-owned tabs: `windows.remove` first, `tabs.remove` when that is unavailable or fails. It serves both reclamation and the live `removeTempWindowHandle` path, so a popup can no longer outlive its only tab. Window-owned handles now carry their tab id for that fallback.
7. **Markers are cleared only after the close succeeded**, so a failed reclamation stays visible to the next sweep instead of leaking silently.

## Boundaries

- No new user-facing setting, toast, or history surface; the sweep is invisible unless it closes something.
- No change to when temp contexts are created, reused, or released during normal flows.
- No new alarm, no storage-lock work: markers are disjoint per-tab keys written only by the background, so there is no read-modify-write of a shared object (`docs/agents/storage.md` concerns `storage.local`).
- Not in scope: `handleCloseTempWindow`'s post-restart behaviour (no caller today), and reclaiming pages the *site* opened from a temp page (not extension-owned).

## Validation

- `tests/services/browsingContext/`: marker records round-trip, legacy `true` markers stay owned, record enumeration returns only own keys.
- `tests/services/browsingContext/internalTabReclamation.test.ts`: window-owned orphan closes its window (even when its tab is active in an unfocused window); shared-window orphan closes only the tab; window removal failure falls back to the tab; focused-window active tab is skipped; live-tracked tab is left alone; marker cleared only on success and after a failed close; no browser work without markers.
- `tests/entrypoints/background/backgroundSuspendCleanup.test.ts`: the background entrypoint runs the sweep once per start and only logs its failure.
- Existing `tests/entrypoints/background/tempWindowPool*` and `tests/services/browsingContext/internalTabs.test.ts` stay green (registration call site and tolerant reads).
- `tsc --noEmit`, eslint, prettier, knip; `tests/entrypoints/background`, `tests/services/browsingContext`, `tests/features/AccountManagement`, `tests/utils/browserApi.test.ts`.
- Not covered: a real-browser E2E that kills the service worker mid-close. The wiring is covered by the entrypoint test and the decisions by the service test.

## Tickets

- `issues/01-marker-ownership-record.md`
- `issues/02-orphan-reclamation.md`
- `issues/03-startup-sweep-wiring.md`
- `issues/04-window-close-fallback.md`

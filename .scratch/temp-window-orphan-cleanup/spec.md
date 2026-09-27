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
2. **Live ownership has one source, and it is claimed before the marker.** A marker is an orphan when this worker no longer holds its tab, and “holds” is the internal-tab ownership set (`isInternalTabOwned`) — the same set the browsing-context filter reads, so “hidden from related pages” and “kept by reclamation” can never disagree. `registerInternalTab` claims the tab *before* it writes the marker, so a sweep can never see a marker for a context that is still being created. The predicate is consulted per tab, not handed over as a snapshot, so a tab claimed while a sweep is already running is not mistaken for a leftover.
   - Found by the E2E (ticket 06): with the pool as the source, a temp context is not registered in the pool until after its navigation and readiness wait, while its marker exists from the start — a sweep running in that window closed the tab under its own creation (`No tab with id: …`). A worker start can run concurrently with a flow that the same activation began, so this was reachable outside tests too.
3. **The sweep runs at background start**, i.e. at every service-worker activation (alarm wakes included), fire-and-forget after `initializeServices()`. No periodic alarm: worker wakes are frequent and every leak listed above is only observable after a wake. A sweep with no markers must do no browser work beyond the storage read.
4. **Ownership record instead of a boolean.** Store `{ windowScope, createdAt }` per tab, where `windowScope` says whether the tab owns its window (`owned`) or only occupies a shared window (`shared`, i.e. composite and plain-tab contexts), so reclamation restores the close semantics of `removeTempWindowHandle`. Registration is the only writer and states the scope at the call site. Reads stay tolerant of the legacy `true` marker, which is treated as shared ownership.
5. **Never close a tab the user is looking at.** An orphan that is the active tab of a focused window is skipped and left for a later sweep. The extension does hand temp windows to the user on purpose, and a leftover is indistinguishable from one of those by ownership alone; being on screen is the fact that separates them, which a URL- or age-based rule could not see.
6. **Window-owned orphans close their window, with a tab fallback.** One shared helper (`~/utils/browser/ownedTabRemoval.ts`) removes window-owned tabs: `windows.remove` first, `tabs.remove` when that is unavailable or fails. It serves both reclamation and the live `removeTempWindowHandle` path, so a popup can no longer outlive its only tab. Window-owned handles now carry their tab id for that fallback.
7. **Markers are cleared only after the close succeeded**, so a failed reclamation stays visible to the next sweep instead of leaking silently.

## Reproduction surface

Reclamation runs at a worker start, which a human cannot ask for, so the mechanism is observable through a dev-only surface instead of guesswork:

- Background debug actions (`RuntimeActionIds.TempContextDebug*`, refused unless the build mode is development or test, so production never exposes them): leave an orphan in each shape users report (owned popup window, shared background tab, visible tab), open a real temp context that is left tracked, list current markers with their live ownership plus this worker's recent runs, and run reclamation on demand.
- A dev panel section (`Temporary pages`, options surface) drives those actions, shows the markers with the recent runs, and offers "restart background worker" (`reloadRuntime()`) — the honest repro: the leftover survives the worker, and the next start reclaims it.

## Boundaries

- No new user-facing setting, toast, or history surface; the sweep is invisible unless it closes something.
- No change to when temp contexts are created, reused, or released during normal flows.
- No new alarm, no storage-lock work: markers are disjoint per-tab keys written only by the background, so there is no read-modify-write of a shared object (`docs/agents/storage.md` concerns `storage.local`).
- Not in scope: `handleCloseTempWindow`'s post-restart behaviour (no caller today), and reclaiming pages the *site* opened from a temp page (not extension-owned).

## Validation

- `tests/services/browsingContext/`: marker records round-trip, legacy `true` markers stay owned, record enumeration returns only own keys, ownership is claimed before the marker is written, and a persisted-only marker does not claim live ownership.
- `tests/services/browsingContext/internalTabReclamation.test.ts`: window-owned orphan closes its window (even when its tab is active in an unfocused window); shared-window orphan closes only the tab; window removal failure falls back to the tab; focused-window active tab is skipped; live-owned tab is left alone; marker cleared only on success and after a failed close; no browser work without markers.
- `tests/entrypoints/background/backgroundSuspendCleanup.test.ts`: the background entrypoint runs the sweep once per start and only logs its failure.
- `tests/entrypoints/background/tempContextDebug.test.ts`: the debug surface is refused outside development/test builds, each fixture writes the marker it claims, and on-demand reclamation returns its summary.
- `e2e/tempWindowOrphanReclamation.spec.ts` (real Chromium, build + 4 cases, three consecutive green runs): a leaked background tab is closed, the popup window a leaked context owns is closed with its window, a temp page the live worker still owns is left alone, and the tab the user is looking at is left alone.
- Existing `tests/entrypoints/background/tempWindowPool*` and `tests/services/browsingContext/internalTabs.test.ts` stay green (registration call site and tolerant reads).
- Local: `tsc --noEmit`, eslint, prettier, knip; `tests/entrypoints/background`, `tests/services/browsingContext`, `tests/features/AccountManagement`, `tests/utils/browserApi.test.ts` (1788 tests).
- Not automated: restarting the worker inside the Playwright run. `chrome.runtime.reload()` leaves the unpacked extension unserviceable for the rest of the harness run (`ERR_BLOCKED_BY_CLIENT` on its own pages), so that step stays the dev panel's restart action or terminating the service worker from `chrome://extensions`.

## Tickets

- `issues/01-marker-ownership-record.md`
- `issues/02-orphan-reclamation.md`
- `issues/03-startup-sweep-wiring.md`
- `issues/04-window-close-fallback.md`
- `issues/05-dev-panel-reproduction.md`
- `issues/06-e2e-reclamation.md`

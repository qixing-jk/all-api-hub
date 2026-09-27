# 07 — Reclaim leftovers across an extension reload or update

- Status: ready-for-agent
- Parent: `.scratch/temp-window-orphan-cleanup/spec.md`
- Blocked by: 03

## Goal

A leftover is still reclaimable after the extension was reloaded, updated, or disabled and re-enabled, without ever acting on tab ids from a previous browser session.

## Why

`chrome.storage.session` is documented as cleared when the extension is disabled, reloaded, or updated, and when the browser restarts ("The storage is cleared if the extension is disabled, reloaded, updated, and when the browser restarts"). It survives only a service-worker restart. So today every leftover that outlives an extension reload or an auto-update loses its marker and can never be reclaimed — and the dev panel's "restart worker" step clears the very evidence it is meant to demonstrate.

## Work

- Move the ownership markers to `storage.local` (same key space), and stamp each record with a `browserSession` token.
- Own the token next to the markers: read-or-mint on demand, and rotate it on `runtime.onStartup`, which fires for a browser start but not for an extension reload/update.
- Reclamation treats a marker from another browser session as stale: report it (`skipped-stale-session`), clear it, and close nothing. Tab ids only mean something inside one browser session, so acting on a foreign one could close an unrelated tab.
- Keep the rest of the marker contract: ownership claimed before the marker is written, legacy boolean markers tolerated, `getInternalTabIds` unchanged for its consumers.
- Dev panel: the restart action becomes a valid reproduction again (markers survive it), so say what it does instead of warning that it drops the evidence.

## Boundaries

- A leftover restored by a *browser* restart is still not reclaimed: its browser session is over, the marker is stale by design, and no safe rule distinguishes that window from one the user opened. Cleared, not closed.

## Validation

- `tests/services/browsingContext/internalTabs.test.ts`: markers land in local storage, carry the current session, a rotation makes them foreign, reads still ignore unrelated keys.
- `tests/services/browsingContext/internalTabReclamation.test.ts`: a foreign-session marker is reported stale, cleared, and closes nothing.
- `tests/entrypoints/background/backgroundSuspendCleanup.test.ts`: the entrypoint rotates the session on browser startup.
- `tests/entrypoints/background/tempContextDebug.test.ts` and `e2e/tempWindowOrphanReclamation.spec.ts` stay green (fixtures persist markers through the same store).

## Comments

- Markers moved to `storage.local` with a `browserSession` stamp; the session key is registered in `storageKeys.ts` and the session is minted on demand, rotated by `onStartup` through `rotateTempPageBrowserSession()`.
- A stale marker is cleared as `skipped-stale-session`, and the same check runs immediately before each close, so a rotation cannot leave a sweep acting on ids from the session that just ended.
- The debug payload now reports the current session and each marker's session, and the panel flags a marker from another session, which is what a leftover restored by a browser restart looks like.
- Covered by: marker store and rotation (`tests/services/browsingContext/internalTabs.test.ts`), stale and mid-sweep handling (`internalTabReclamation.test.ts`), startup rotation wiring (`backgroundSuspendCleanup.test.ts`), plus the unchanged debug and E2E suites on the new store.


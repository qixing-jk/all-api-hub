# 06 — End-to-end reclamation in a real browser

- Status: ready-for-agent
- Parent: `.scratch/temp-window-orphan-cleanup/spec.md`
- Blocked by: 05

## Goal

Cover the layer unit tests only approximate: real `chrome.storage.session`, real tab/window enumeration, and a real close.

## Work

- Playwright spec that opens the options page, drives the ticket-05 fixture actions, and asserts with the reclamation summary and the marker list:
  - a shared-window orphan is closed by its tab (`closed-tab`);
  - an owned-window orphan is closed with its window (`closed-window`);
  - a context the live worker still owns survives (`skipped-tracked`);
  - the tab the user is looking at survives (`skipped-visible`).
- Read the outcome per tab rather than counting pages, so the assertion proves the removal round-trip: a tab that does not exist makes the real `tabs.remove` reject and would surface as `failed`.

## Validation

- `pnpm e2e -- e2e/tempWindowOrphanReclamation.spec.ts` (build + chromium) passes locally.
- The "active tab of a focused window" skip is covered too: in this harness the injected tab is genuinely the active tab of the focused window, so `skipped-visible` is asserted for real rather than simulated.

## Comments

- `e2e/tempWindowOrphanReclamation.spec.ts` drives the ticket-05 actions over the real runtime channel and asserts against `chrome.tabs.query` / `chrome.windows.getAll` read from the extension page itself, plus each run's recorded outcome. Four cases, three consecutive green runs.
- It asserts the *outcome* rather than which run produced it: a reclamation also runs whenever the worker starts, and in this harness the worker is killed aggressively, so the startup sweep often wins the race with the on-demand run. That is the mechanism working, not a flake.
- Found a real defect on the first run: the sweep closed a temp context whose marker existed but whose pool registration had not happened yet, i.e. a context under creation. Fixed by making the internal-tab ownership set the single source of live ownership and claiming it before the marker is written (spec decision 2); the invariant now has a unit test.
- Restarting the worker inside the spec was tried and dropped: `chrome.runtime.reload()` leaves the unpacked extension unserviceable for the rest of the run (`ERR_BLOCKED_BY_CLIENT` on `chrome-extension://…/options.html`), so that step is manual through the dev panel.


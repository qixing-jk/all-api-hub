# Composite Temp Window Cleanup Design

## Problem

Composite mode creates a dedicated normal browser window but stores each temp
context as a tab-backed context. Normal cleanup therefore passes the tab ID to
`removeTabOrWindow()`, which first attempts `windows.remove(tabId)` and then
falls back to `tabs.remove(tabId)`.

Chromium closes a normal window after its final tab is removed, which hides the
missing window ownership in the current model. Browsers that keep the window
alive by inserting a new tab can leave the extension-created window behind.

## Goals

- Explicitly close an extension-created composite window when its current temp
  tab is the only tab left in that window.
- Preserve concurrent composite work and any additional tabs by removing only
  the completed temp tab when the window contains more than one tab.
- Make unknown-ID window-to-tab fallback visible through warning-level logs.
- Cover the cleanup decision and warning contract with focused tests.

## Non-Goals

- Detect or special-case a specific Chromium fork.
- Change popup-window or plain-tab user preferences.
- Add product analytics for an internal cleanup correction.
- Keep the temporary Playwright diagnostic as permanent E2E coverage.

## Design

### Preserve Composite Window Ownership

`TempContextOpenResult` and `TempContext` will retain the actual open mode and
the owning `windowId` for composite contexts. Popup contexts continue to
identify themselves by their window ID, while plain tabs have no owning
temp-window ID. A window-creation fallback must record its resulting mode as
`tab`, not the originally requested mode.

The composite open path already receives both handles from
`openTabInCompositeWindow()`. The change carries that existing `windowId`
through context creation instead of discarding it. The `tempWindows` map used
by manual open/close messages will likewise store a typed handle rather than an
unclassified number, so manual composite tabs retain both IDs.

### Serialize Shared Window Mutations

The current origin locks cannot protect a composite window because different
origins share that window. A dedicated composite operation lock will serialize:

- creation or reuse of the shared window;
- creation of a tab inside the shared window;
- inspection before closing a composite context; and
- removal of a composite tab or its owning window.

This prevents a cleanup operation from observing one remaining tab and closing
the window while another origin is concurrently adding a new tab to the same
window. Ordinary page loading and fetch work remain outside this lock.

### Use Explicit Removal for Known Handles

The browser API adapter will expose explicit `removeTab(tabId)` and
`removeWindow(windowId)` helpers. Cleanup paths that already know the handle
kind will use those helpers instead of `removeTabOrWindow()`.

For a composite context, cleanup will query the owning window inside the
composite operation lock immediately before removal:

1. If the window contains exactly the current temp tab, clear the matching
   cached `compositeWindowId` and close the window explicitly.
2. If the window contains other tabs, remove only the current temp tab.
3. If window inspection fails, log a warning and use the conservative tab-only
   cleanup so an uncertain window is not closed.

Clearing the cached composite window ID before awaiting window removal routes
later opens to a fresh window. The lock closes the create-versus-remove race,
while querying the real window tab list protects other concurrent temp tabs and
user-added tabs from being closed.

### Warn on Unknown-ID Fallback

`removeTabOrWindow()` remains a compatibility helper for callers whose stored
handle kind is not available. When `windows.remove(id)` fails and the helper
falls back to `tabs.remove(id)`, it will emit a `logger.warn` entry containing
the ID and the original error.

Known tab cleanup must not call this helper merely to trigger the fallback;
otherwise routine operation would generate misleading warnings.

## Error Handling

- Failure to inspect a composite window produces a warning and falls back to
  removing only the known tab.
- Failure of the selected browser removal API remains caught by the existing
  temp-context cleanup boundary and is logged without masking the completed
  request result.
- Browser `onRemoved` listeners remain the source of truth for externally
  closed windows and tabs.

## Tests

Focused Vitest coverage will prove:

- a single-tab composite context closes its owning window ID rather than
  sending its tab ID through the unknown-kind fallback;
- a composite window with another tracked or untracked tab removes only the
  completed temp tab;
- concurrent composite open and final cleanup operations cannot close the tab
  being opened;
- manual composite open/close retains the owner window and follows the same
  final-window decision;
- a composite window inspection failure uses conservative tab cleanup;
- `removeTabOrWindow()` warns with the ID and error before falling back from
  `windows.remove` to `tabs.remove`;
- popup-window and plain-tab cleanup behavior remains unchanged and does not
  emit an expected-operation fallback warning.

The prior Playwright diagnostic already established the real Chromium API
behavior: `windows.remove(tabId)` rejects, the tab survives that attempt, and
removing the final tab closes the normal Chromium window. The regression itself
belongs in Vitest because the defect is the extension's handle ownership and
branching logic, not Chromium's API implementation.

## Validation

Run the two affected test files first, followed by related Vitest coverage and
the repository's staged validation gate. Because the change affects shared
browser helpers and background runtime behavior, also run `validate:push`
before handoff.

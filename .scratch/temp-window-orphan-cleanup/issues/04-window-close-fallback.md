# 04 — Fall back to the tab when window removal fails

- Status: ready-for-agent
- Parent: `.scratch/temp-window-orphan-cleanup/spec.md`

## Goal

A window-owned temp context still gets closed when `windows.remove` is unavailable or rejects.

## Work

- `removeTempWindowHandle` (`tempWindowPool.ts:1179`): for `kind: "window"`, attempt `removeWindow` and fall back to removing the tab on failure, mirroring `removeCompositeTabLocked`'s existing `removeWindow` → `removeTab` fallback. Log the fallback; never let the fallback failure replace the original error surface.
- Keep the composite and tab branches as they are.

## Validation

- Extend `tests/entrypoints/background/` temp-window lifecycle coverage: window removal rejects → tab removed; both reject → logged, no throw escaping `destroyContext`.

## Comments

- `removeTabOwningWindow(tabId, windowId)` in `src/utils/browser/ownedTabRemoval.ts`; `TempWindowHandle`'s window variant now carries `tabId` so the fallback has a target.
- `tests/entrypoints/background/tempWindowPoolWindowFallback.test.ts` covers a rejected window close through the pool: the tab is removed and the fallback is logged.
- `tests/services/browsingContext/internalTabReclamation.test.ts` covers the same helper through the real browser adapter, where `windows.remove` rejects and `tabs.remove` closes the orphan.

# 01 — Mark temp-tab ownership with a record

- Status: ready-for-agent
- Parent: `.scratch/temp-window-orphan-cleanup/spec.md`

## Goal

Replace the boolean `internalBrowsingTab:<id>` marker with a small ownership record so a later sweep can close a leftover tab the way its owner would have.

## Work

- `src/services/browsingContext/internalTabsBackground.ts`:
  - add `InternalTabOwnershipMode = "window" | "composite" | "tab"` and `InternalTabRecord = { mode, createdAt }`;
  - `registerInternalTab(tabId, record)` writes the record; the argument is required so every call site states its mode;
  - reads accept the legacy `true` marker as owned (treated as `{ mode: "tab", createdAt: <unknown> }`) and never mutate it;
  - `getInternalTabIds` behaviour is unchanged for callers;
  - add a read that returns the stored records for a set of tab ids or for all keyed markers, without exposing unrelated session keys.
- `src/entrypoints/background/tempWindowPool.ts`: pass the mode at the single registration call in `createTempContextInstance` (`opened.mode === "window" ? "window" : "tab"`, i.e. composite is not window-owning).

## Validation

- `tests/services/browsingContext/internalTabs.test.ts` stays green, plus: record round-trip after `vi.resetModules()`, legacy `true` still owned, enumeration returns only `internalBrowsingTab:` keys.

## Comments

- `internalTabsBackground.ts` now exposes `INTERNAL_TAB_WINDOW_SCOPES` (`owned`/`shared`), `InternalTabRecord`, `InternalTabOwnership`, and `listInternalTabRecords()`; `registerInternalTab` takes the record as a required argument.
- The single production call site is `createTempContextInstance`, which maps `mode: window` to `owned` and composite/plain tab to `shared`.
- `tests/services/browsingContext/internalTabs.test.ts` covers the record round-trip across a module reset, legacy `true` tolerance without rewriting the stored value, and prefix-only enumeration.

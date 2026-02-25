## 1. Storage State

- [x] 1.1 Add a dedicated storage key + lock name for “pending changelog version” in `services/storageKeys.ts`
- [x] 1.2 Implement a small state service (e.g., `services/changelogOnUpdateState.ts`) to write and atomically consume/clear the pending version using `withExtensionStorageWriteLock()`

## 2. Background Update Marking

- [x] 2.1 Update `entrypoints/background/index.ts` to persist the pending changelog version on `onInstalled` when `details.reason === "update"`
- [x] 2.2 Remove direct `createTab(getDocsChangelogUrl(...))` behavior from the update handler (keep other update flows, e.g., optional-permission prompting, unchanged)

## 3. UI First-Open Consumption

- [x] 3.1 Implement a UI-open handler (component or hook) that consumes the pending version and opens `getDocsChangelogUrl(version)` in a new active tab when `openChangelogOnUpdate` is enabled
- [x] 3.2 Wire the handler into UI entrypoints so popup/sidepanel/options run it on mount (prefer a shared integration point such as `components/AppLayout.tsx`)

## 4. Tests & Verification

- [x] 4.1 Update `tests/entrypoints/background/changelogOnUpdate.test.ts` to assert that updates do not open a tab immediately and that the pending marker is written
- [x] 4.2 Add tests for “first UI open after update” consumption: opens once, clears pending, and respects `openChangelogOnUpdate = false`
- [x] 4.3 Run `pnpm -s test` (or focused test paths) and ensure all tests pass

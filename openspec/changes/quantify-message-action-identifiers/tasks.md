## 1. Inventory and wire-compatibility

- [ ] 1.1 Enumerate all runtime message action strings and prefixes used in the repo (search for `action: "..."`, `request.action ===`, `switch (request.action)`, and `startsWith("...")`), and dedupe into a single list.
- [ ] 1.2 Confirm which values are exact action IDs vs. routing prefixes, and document any legacy naming groups that cannot be represented as a single prefix (e.g., auto-refresh).
- [ ] 1.3 Verify the planned registry preserves all existing on-the-wire action values (no renames) by mapping each discovered string literal to a canonical constant.

## 2. Centralize runtime action IDs and prefixes

- [ ] 2.1 Expand `constants/runtimeActions.ts` to include a canonical `RuntimeActionPrefixes` registry for every prefix-based route (e.g., `externalCheckIn:`, `webdavAutoSync:`, `modelSync:`, `autoCheckin:`, `redemptionAssist:`, `channelConfig:`, `usageHistory:`).
- [ ] 2.2 Expand `constants/runtimeActions.ts` to include canonical `RuntimeActionIds` entries for every exact-match action currently used (including legacy non-namespaced actions used by auto-refresh).
- [ ] 2.3 Add literal union types `RuntimeActionId` and `RuntimeActionPrefix` derived from the registries (TypeScript `as const` pattern).
- [ ] 2.4 Add a documented, null-safe prefix matcher helper (e.g., `hasRuntimeActionPrefix`) for router code.
- [ ] 2.5 Add a documented action composer helper (e.g., `composeRuntimeAction`) for building namespaced IDs from prefix + suffix.
- [ ] 2.6 Add any documented legacy “group matcher” needed to replace inline lists (e.g., `isAutoRefreshRuntimeAction`).

## 3. Migrate the background message router

- [ ] 3.1 Update `entrypoints/background/runtimeMessages.ts` to replace all inline action string equality checks with `RuntimeActionIds` constants.
- [ ] 3.2 Update `entrypoints/background/runtimeMessages.ts` to replace all inline prefix checks (`startsWith("<prefix>")`) with `RuntimeActionPrefixes` + `hasRuntimeActionPrefix`.
- [ ] 3.3 Replace the auto-refresh mixed prefix/list routing with a single constant-driven matcher (e.g., `isAutoRefreshRuntimeAction`) so the router contains no magic strings.

## 4. Migrate feature handlers and senders

- [ ] 4.1 Update feature handlers that switch on `request.action` to use canonical constants (e.g., `services/webdav/webdavAutoSyncService.ts`, `services/autoCheckin/scheduler.ts`, and any other handlers routed via `runtimeMessages.ts`).
- [ ] 4.2 Update runtime message senders across background/options/popup/content contexts to use `RuntimeActionIds` (e.g., `utils/browserApi.ts` permission check, `entrypoints/background/contextMenus.ts` redemption assist trigger, and any UI flows that call `sendRuntimeMessage`).
- [ ] 4.3 Update message-contract documentation blocks in code to reference the canonical constants (keep contract semantics unchanged).
- [ ] 4.4 Add `sendRuntimeActionMessage()` (typed to `RuntimeActionId`) as a thin wrapper over `sendRuntimeMessage` and migrate key senders to it where it improves type-safety.

## 5. Tests and guardrails

- [ ] 5.1 Add a unit test suite for `constants/runtimeActions.ts` (registry + helper behavior).
- [ ] 5.2 Assert all `RuntimeActionIds` values are unique (prevents ambiguous routing).
- [ ] 5.3 Assert prefix matching is null/undefined/non-string safe and matches only the intended prefixes.
- [ ] 5.4 Assert composed actions match expected shipped wire values and spot-check key stable IDs (e.g., `permissions:check`).
- [ ] 5.5 Update existing tests that assert string actions to use `RuntimeActionIds` (e.g., options UI tests and service tests that call `sendRuntimeMessage`).
- [ ] 5.6 Add/adjust targeted tests for routing behavior that exercises at least one exact-match action and one prefix-routed action through the background handler path (including an unknown/missing action case).
- [ ] 5.7 Run `pnpm test` and fix regressions introduced by the migration; ensure abnormal branches (unknown action, missing action) remain covered.
- [ ] 5.8 Add a small unit test for `sendRuntimeActionMessage()` to ensure it forwards payload/options to `sendRuntimeMessage` unchanged.

## 6. Validation

- [ ] 6.1 Run `pnpm lint` (and `pnpm format` if required by repo conventions) to ensure imports and formatting remain consistent after refactors.
- [ ] 6.2 Run `openspec validate quantify-message-action-identifiers --strict` and confirm artifacts remain consistent before implementation begins.

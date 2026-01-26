## 1. Inventory and wire-compatibility

- [x] 1.1 Enumerate all runtime message action strings and prefixes used in the repo (search for `action: "..."`, `request.action ===`, `switch (request.action)`, and `startsWith("...")`), and dedupe into a single list.
- [x] 1.2 Confirm which values are exact action IDs vs. routing prefixes, and document any legacy naming groups that should be standardized (e.g., auto-refresh).
- [x] 1.3 Verify the planned registry preserves all existing on-the-wire action values where feasible by mapping each discovered string literal to a canonical constant.

## 2. Centralize runtime action IDs and prefixes

- [x] 2.1 Expand `constants/runtimeActions.ts` to include a canonical `RuntimeActionPrefixes` registry for every prefix-based route (e.g., `externalCheckIn:`, `webdavAutoSync:`, `modelSync:`, `autoCheckin:`, `redemptionAssist:`, `channelConfig:`, `usageHistory:`).
- [x] 2.2 Expand `constants/runtimeActions.ts` to include canonical `RuntimeActionIds` entries for every exact-match action currently used.
- [x] 2.3 Add literal union types `RuntimeActionId` and `RuntimeActionPrefix` derived from the registries (TypeScript `as const` pattern).
- [x] 2.4 Add a documented, null-safe prefix matcher helper (e.g., `hasRuntimeActionPrefix`) for router code.
- [x] 2.5 Add a documented action composer helper (e.g., `composeRuntimeAction`) for building namespaced IDs from prefix + suffix.
- [x] 2.6 Standardize legacy auto-refresh actions into a strict `autoRefresh:` prefix so routing can be prefix-only (no special-case matcher needed).

## 3. Migrate the background message router

- [x] 3.1 Update `entrypoints/background/runtimeMessages.ts` to replace all inline action string equality checks with `RuntimeActionIds` constants.
- [x] 3.2 Update `entrypoints/background/runtimeMessages.ts` to replace all inline prefix checks (`startsWith("<prefix>")`) with `RuntimeActionPrefixes` + `hasRuntimeActionPrefix`.
- [x] 3.3 Route auto-refresh messages via `RuntimeActionPrefixes.AutoRefresh` + `hasRuntimeActionPrefix` so the router contains no magic strings.

## 4. Migrate feature handlers and senders

- [x] 4.1 Update feature handlers that switch on `request.action` to use canonical constants (e.g., `services/webdav/webdavAutoSyncService.ts`, `services/autoCheckin/scheduler.ts`, and any other handlers routed via `runtimeMessages.ts`).
- [x] 4.2 Update runtime message senders across background/options/popup/content contexts to use `RuntimeActionIds` (e.g., `utils/browserApi.ts` permission check, `entrypoints/background/contextMenus.ts` redemption assist trigger, and any UI flows that call `sendRuntimeMessage`).
- [x] 4.3 Update message-contract documentation blocks in code to reference the canonical constants (keep contract semantics unchanged).
- [x] 4.4 Add `sendRuntimeActionMessage()` (typed to `RuntimeActionId`) as a thin wrapper over `sendRuntimeMessage` and migrate key senders to it where it improves type-safety.

## 5. Tests and guardrails

- [x] 5.1 Add a unit test suite for `constants/runtimeActions.ts` (registry + helper behavior).
- [x] 5.2 Assert all `RuntimeActionIds` values are unique (prevents ambiguous routing).
- [x] 5.3 Assert prefix matching is null/undefined/non-string safe and matches only the intended prefixes.
- [x] 5.4 Assert composed actions match expected shipped wire values and spot-check key stable IDs (e.g., `permissions:check`).
- [x] 5.5 Update existing tests that assert string actions to use `RuntimeActionIds` (e.g., options UI tests and service tests that call `sendRuntimeMessage`).
- [x] 5.6 Add/adjust targeted tests for routing behavior that exercises at least one exact-match action and one prefix-routed action through the background handler path (including an unknown/missing action case).
- [x] 5.7 Run `pnpm test` and fix regressions introduced by the migration; ensure abnormal branches (unknown action, missing action) remain covered.
- [x] 5.8 Add a small unit test for `sendRuntimeActionMessage()` to ensure it forwards payload/options to `sendRuntimeMessage` unchanged.

## 6. Validation

- [x] 6.1 Run `pnpm lint` (and `pnpm format` if required by repo conventions) to ensure imports and formatting remain consistent after refactors.
- [x] 6.2 Run `openspec validate quantify-message-action-identifiers --strict` and confirm artifacts remain consistent before implementation begins.

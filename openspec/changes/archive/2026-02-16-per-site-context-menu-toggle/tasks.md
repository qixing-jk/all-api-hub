## 1. Preferences model

- [x] 1.1 Add `contextMenu.enabled` fields to `WebAiApiCheckPreferences` and `RedemptionAssistPreferences` types in `services/userPreferences.ts`
- [x] 1.2 Set default values (`true`) in `DEFAULT_PREFERENCES` for both features’ `contextMenu.enabled`
- [x] 1.3 Ensure preferences loading remains backward compatible (missing fields treated as enabled)

## 2. Runtime actions and background refresh

- [x] 2.1 Add `RuntimeActionIds.PreferencesRefreshContextMenus` (value `preferences:refreshContextMenus`) in `constants/runtimeActions.ts`
- [x] 2.2 Handle `PreferencesRefreshContextMenus` in `entrypoints/background/runtimeMessages.ts` by invoking a context menu refresh function
- [x] 2.3 Refactor `entrypoints/background/contextMenus.ts` to expose a refresh-safe API (`ensureContextMenuClickListener` + `refreshContextMenus(preferences)`)
- [x] 2.4 Update background startup (`entrypoints/background/index.ts`) to call the new context menu initialization that reads preferences and applies visibility gating

## 3. Context menu visibility gating

- [x] 3.1 Gate creation of the “AI API Check” menu by `webAiApiCheck.enabled && webAiApiCheck.contextMenu.enabled`
- [x] 3.2 Gate creation of the “Redemption Assist” menu by `redemptionAssist.enabled && redemptionAssist.contextMenu.enabled`
- [x] 3.3 Verify refresh is idempotent: repeated refresh does not duplicate click listeners or trigger forwarding

## 4. Options UI toggles

- [x] 4.1 Add “Show in browser right-click menu” toggle to `entrypoints/options/pages/BasicSettings/components/WebAiApiCheckSettings.tsx` (persist and trigger background refresh)
- [x] 4.2 Add the same toggle to `entrypoints/options/pages/BasicSettings/components/RedemptionAssistSettings.tsx` (persist and trigger background refresh)
- [x] 4.3 Add i18n keys for the new labels/descriptions in `locales/**` namespaces used by these settings

## 5. Preference update wiring (notify background)

- [x] 5.1 Update `contexts/UserPreferencesContext.tsx` so `updateWebAiApiCheck` sends `PreferencesRefreshContextMenus` after a successful save when the context menu field changes
- [x] 5.2 Update `contexts/UserPreferencesContext.tsx` so `updateRedemptionAssist` sends `PreferencesRefreshContextMenus` after a successful save when the context menu field changes

## 6. Tests

- [x] 6.1 Add/extend background tests to cover: defaults create both menus; disabling AI API Check visibility prevents creation; toggling triggers refresh message path
- [x] 6.2 Add unit test for idempotent refresh (multiple refreshes, single click → single forwarded trigger)
- [x] 6.3 Add settings component tests verifying toggles persist updates and trigger the refresh runtime message (mocked)

## 7. Verification

- [x] 7.1 Run `pnpm -s test` and ensure new tests pass
- [x] 7.2 Run `pnpm -s compile` to validate TypeScript types and build

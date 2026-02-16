## 1. Preferences model

- [ ] 1.1 Add `contextMenu.enabled` fields to `WebAiApiCheckPreferences` and `RedemptionAssistPreferences` types in `services/userPreferences.ts`
- [ ] 1.2 Set default values (`true`) in `DEFAULT_PREFERENCES` for both features’ `contextMenu.enabled`
- [ ] 1.3 Ensure preferences loading remains backward compatible (missing fields treated as enabled)

## 2. Runtime actions and background refresh

- [ ] 2.1 Add `RuntimeActionIds.PreferencesRefreshContextMenus` (value `preferences:refreshContextMenus`) in `constants/runtimeActions.ts`
- [ ] 2.2 Handle `PreferencesRefreshContextMenus` in `entrypoints/background/runtimeMessages.ts` by invoking a context menu refresh function
- [ ] 2.3 Refactor `entrypoints/background/contextMenus.ts` to expose a refresh-safe API (`ensureContextMenuClickListener` + `refreshContextMenus(preferences)`)
- [ ] 2.4 Update background startup (`entrypoints/background/index.ts`) to call the new context menu initialization that reads preferences and applies visibility gating

## 3. Context menu visibility gating

- [ ] 3.1 Gate creation of the “AI API Check” menu by `webAiApiCheck.enabled && webAiApiCheck.contextMenu.enabled`
- [ ] 3.2 Gate creation of the “Redemption Assist” menu by `redemptionAssist.enabled && redemptionAssist.contextMenu.enabled`
- [ ] 3.3 Verify refresh is idempotent: repeated refresh does not duplicate click listeners or trigger forwarding

## 4. Options UI toggles

- [ ] 4.1 Add “Show in browser right-click menu” toggle to `entrypoints/options/pages/BasicSettings/components/WebAiApiCheckSettings.tsx` (persist and trigger background refresh)
- [ ] 4.2 Add the same toggle to `entrypoints/options/pages/BasicSettings/components/RedemptionAssistSettings.tsx` (persist and trigger background refresh)
- [ ] 4.3 Add i18n keys for the new labels/descriptions in `locales/**` namespaces used by these settings

## 5. Preference update wiring (notify background)

- [ ] 5.1 Update `contexts/UserPreferencesContext.tsx` so `updateWebAiApiCheck` sends `PreferencesRefreshContextMenus` after a successful save when the context menu field changes
- [ ] 5.2 Update `contexts/UserPreferencesContext.tsx` so `updateRedemptionAssist` sends `PreferencesRefreshContextMenus` after a successful save when the context menu field changes

## 6. Tests

- [ ] 6.1 Add/extend background tests to cover: defaults create both menus; disabling AI API Check visibility prevents creation; toggling triggers refresh message path
- [ ] 6.2 Add unit test for idempotent refresh (multiple refreshes, single click → single forwarded trigger)
- [ ] 6.3 Add settings component tests verifying toggles persist updates and trigger the refresh runtime message (mocked)

## 7. Verification

- [ ] 7.1 Run `pnpm -s test` and ensure new tests pass
- [ ] 7.2 Run `pnpm -s compile` to validate TypeScript types and build

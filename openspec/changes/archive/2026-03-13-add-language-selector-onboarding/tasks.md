## 1. Shared language selector support

- [x] 1.1 Extract the supported language options and localized control labels/accessible names into shared resources used by `LanguageSwitcher`
- [x] 1.2 Update `src/components/LanguageSwitcher.tsx` so it remains reusable in the header and General settings tab while fitting cleanly inside onboarding dialog layout constraints

## 2. Onboarding dialog integration

- [x] 2.1 Add the onboarding language selector label/helper copy to `src/locales/en/settings.json` and `src/locales/zh_CN/settings.json`
- [x] 2.2 Render the shared language selector in `src/features/BasicSettings/components/dialogs/PermissionOnboardingDialog.tsx` so it appears during first-install onboarding and updates dialog copy immediately after selection

## 3. Regression coverage

- [x] 3.1 Add component tests covering the onboarding dialog rendering the selector and switching visible onboarding copy when the language changes
- [x] 3.2 Add coverage that the selected onboarding language persists for later options UI renders and that localized accessible labels remain correct for shared switcher usage

## 4. Validation

- [x] 4.1 Run `openspec validate add-language-selector-onboarding --strict`
- [x] 4.2 Run the smallest affected Vitest suite for onboarding dialog and language switcher behavior, then note any remaining environment blockers or follow-up gaps

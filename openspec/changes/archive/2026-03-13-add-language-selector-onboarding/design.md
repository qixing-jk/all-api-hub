## Context

On first install, the background entrypoint opens the options page with onboarding query parameters that cause `BasicSettings` to display `PermissionOnboardingDialog`. That dialog is the current "initial boot" experience in this repository: it explains optional permissions and lets the user continue or grant all recommended permissions.

The extension already has working language infrastructure. UI copy is localized through i18next resources under `src/locales/`, the active language is applied through `i18n.changeLanguage(...)`, and the selected value is persisted through `userPreferences.setLanguage(...)`. A shared `LanguageSwitcher` component already exists in the options header and General settings tab, but the onboarding dialog does not surface it, so new users may see the first-run content in an auto-detected language before noticing where to change it.

This design is needed because the change touches multiple modules with a small but cross-cutting interaction boundary: the first-install onboarding route, a shared language switcher, persistent preferences, and onboarding-specific localization content.

## Goals / Non-Goals

**Goals:**
- Make language selection visible inside the first-run onboarding dialog before the user acts on permission messaging.
- Reuse the existing i18n and preference persistence flow so onboarding language changes apply immediately and remain active in later sessions.
- Keep the change contained to the current onboarding surface and avoid introducing a parallel language-selection implementation.
- Add the missing onboarding and accessibility copy required to present the language selector cleanly in supported locales.

**Non-Goals:**
- Introducing new supported languages beyond the current in-repo set (`en`, `zh_CN`).
- Replacing the current permission onboarding flow with a new standalone welcome page.
- Changing how browser language detection, background i18n initialization, or manifest locale files work.
- Redesigning the broader settings layout outside the first-run onboarding entrypoint.

## Decisions

### 1. Treat `PermissionOnboardingDialog` as the initial boot surface

The implementation will add language selection to `src/features/BasicSettings/components/dialogs/PermissionOnboardingDialog.tsx`, because that is the install-triggered surface users already reach today.

Rationale:
- It matches the current repository behavior without inventing a new navigation flow.
- It keeps the feature aligned with the proposal's "initial boot page" intent while staying within scope.
- It avoids duplicating onboarding state or adding another route that must coordinate with `onboarding=permissions`.

Alternatives considered:
- Create a dedicated welcome page before permissions onboarding. Rejected because it adds new routing, new state transitions, and more translation surface than this feature requires.
- Redirect users to the General tab and rely on the existing switcher there. Rejected because the first-run permission explanation would still appear before the user has a clear language affordance.

### 2. Reuse the shared language selector instead of creating onboarding-specific logic

The onboarding dialog should use the existing `LanguageSwitcher` behavior and the existing `userPreferences` language persistence path. If the current component needs small adjustments for dialog placement, those adjustments should be made by extending the shared component or extracting shared option metadata, not by copying the toggle implementation into the dialog.

Rationale:
- The repo already has a working language switcher and persistence contract.
- Reuse keeps language options, persistence, and active-state behavior consistent across the options page and onboarding.
- It avoids a third copy of similar logic in the same UI area.

Alternatives considered:
- Inline a separate toggle inside the onboarding dialog. Rejected because it would duplicate supported-language options, persistence behavior, and accessibility labeling.
- Build a new onboarding-only selector and sync it later into preferences. Rejected because the existing switcher already does the only required state transition.

### 3. Persist language immediately when the user selects it

Selecting a language during onboarding should call the same immediate update flow used elsewhere: change the active i18n language, then persist the preference. The onboarding dialog should not stage language changes behind a secondary confirmation step.

Rationale:
- Users need the onboarding text to update as soon as they select a language; delayed persistence would leave the current screen harder to understand.
- Immediate persistence means closing, reopening, or refreshing the options page preserves the chosen language without extra onboarding state.
- This matches the current expectations established by the shared `LanguageSwitcher`.

Alternatives considered:
- Save the language only when the user clicks "Allow recommended permissions" or closes onboarding. Rejected because the dialog content would not necessarily switch immediately and the selection could be lost if the modal is dismissed or the page reloads unexpectedly.
- Store a temporary onboarding-only value and sync it later. Rejected because it creates unnecessary state duplication and rollback cases.

### 4. Add onboarding-specific copy, but keep supported languages centrally defined

The change will add localized onboarding strings for the selector label and any helper text needed in `src/locales/en/settings.json` and `src/locales/zh_CN/settings.json`. If the shared `LanguageSwitcher` needs translated labels or ARIA text, those should come from i18n-backed strings or a single shared language option definition rather than hard-coded English button titles.

Rationale:
- The dialog needs explicit context so users understand the selector before reading permission details.
- Accessibility text should localize with the rest of the onboarding experience.
- Centralizing language metadata prevents drift between onboarding and the existing settings/header usage.

Alternatives considered:
- Keep the current hard-coded `"Switch to EN"` / `"Switch to 中文"` labels. Rejected because the onboarding feature is specifically about first-impression language clarity, and untranslated control labels weaken that.
- Add onboarding helper copy without touching the shared switcher labels. Rejected because it would leave part of the interaction localized and part of it hard-coded.

### 5. Keep rollout simple and validate with focused UI coverage

No migration or schema changes are needed. Validation should focus on the options/onboarding UI behavior: rendering the selector in the dialog, updating visible copy when the language changes, and preserving the existing permission actions.

Rationale:
- The change is UI-focused and uses existing storage keys.
- Focused tests provide confidence without broadening into unrelated extension flows.

Alternatives considered:
- Rely only on manual verification. Rejected because the change affects localized rendering and persisted preferences, which are prone to regressions in component composition.

## Risks / Trade-offs

- [Dialog crowding on narrow screens] -> Use the existing compact switcher styling or a dialog-friendly variant so the control remains visible without pushing the primary onboarding actions below the fold unnecessarily.
- [Shared component changes could affect header/general settings usage] -> Keep any `LanguageSwitcher` extension additive and backwards-compatible, then verify existing usages in the options header and General tab still render correctly.
- [Localized accessibility text may remain partially hard-coded] -> Move switcher labels/titles into shared translated strings as part of this change instead of treating them as a follow-up cleanup.
- [The product language "initial boot page" may later expand beyond the permissions modal] -> Scope this change to the current install-triggered onboarding entrypoint and keep the switcher reusable so it can be embedded in any future onboarding surface.

## Migration Plan

No data migration is required. The change reuses the existing language preference field already stored by `userPreferences`.

Deployment:
- Ship the UI update and locale-resource changes together so the selector and onboarding copy stay consistent.

Rollback:
- Remove the onboarding placement of the shared switcher and the associated localized strings. Existing language selection from the header and General settings remains intact.

## Open Questions

None for the current repo state. If product direction later introduces a standalone welcome page, that page should reuse the same shared onboarding language-selection pattern rather than diverging from this design.

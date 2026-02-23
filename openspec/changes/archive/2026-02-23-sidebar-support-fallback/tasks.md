## 1. Capability Detection

- [x] 1.1 Add a side panel support helper (e.g. `getSidePanelSupport`) in `utils/browserApi.ts` to classify Firefox (`sidebarAction`) vs Chromium (`sidePanel`) vs unsupported.
- [x] 1.2 Update `openSidePanel` to use the support helper and provide clearer, deterministic errors when unsupported.

## 2. Toolbar Icon Click Wiring

- [x] 2.1 Update `entrypoints/background/actionClickBehavior.ts` to compute an effective behavior (`sidepanel` only when supported, otherwise `popup`).
- [x] 2.2 Ensure popup wiring is restored when falling back (popup is set to `popup.html` and side-panel click listeners are not installed).
- [x] 2.3 Keep a last-resort fallback for runtime failures: if opening the side panel fails, open the options/settings surface.
- [x] 2.4 Ensure no preference write-back occurs during fallback (effective behavior is computed in-memory only).

## 3. Settings + Preferences UX

- [x] 3.1 Expose side panel support status to the Options settings surface (context/hook) so UI can display support + fallback messaging.
- [x] 3.2 Update `ActionClickBehaviorSettings` to show an explanation when side panel is unsupported on this device (including when the stored preference is `sidepanel` from another device).
- [x] 3.3 When the user selects `sidepanel` on an unsupported device, persist the preference as requested and show a toast explaining that this device will fall back to opening the popup.

## 4. Localization

- [x] 4.1 Add i18n keys for side panel unsupported explanation and fallback toast in `locales/zh_CN/settings.json` and other maintained locales.

## 5. Tests

- [x] 5.1 Add unit tests for the side panel support helper (Firefox supported, Chromium supported, unsupported).
- [x] 5.2 Add unit tests for `applyActionClickBehavior` verifying unsupported sidepanel preference falls back to popup wiring.
- [x] 5.3 Add a component test for `ActionClickBehaviorSettings` verifying the unsupported warning is shown (and that selecting `sidepanel` still persists while warning about fallback).

## 6. Verification

- [x] 6.1 Run `pnpm -s test` for the added/updated tests.
- [x] 6.2 Run `pnpm -s compile` and `pnpm -s lint` to confirm type and lint correctness.

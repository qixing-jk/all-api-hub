## 1. Preferences + settings UI
- [x] 1.1 Extend `AutoCheckinPreferences` with `pretriggerDailyOnUiOpen` (default true)
- [x] 1.2 Add a toggle in the sign-in/auto-checkin settings panel and wire it to `updateAutoCheckin`
- [x] 1.3 Add i18n strings for the new toggle and prompts

## 2. Background: pre-trigger entrypoint
- [x] 2.1 Add a runtime message action (e.g., `autoCheckin:pretriggerDailyOnUiOpen`) handled by `handleAutoCheckinMessage`
- [x] 2.2 Implement a scheduler method that conditionally triggers today’s **daily** run early without modifying retry logic
- [x] 2.3 Add a minimal in-flight guard to prevent duplicate daily runs (UI-open + alarm) for the same day

## 3. UI: trigger + notifications
- [x] 3.1 Add a shared UI-on-open hook (used by popup/sidepanel/options) that calls the pre-trigger action
- [x] 3.2 Show a toast when the early trigger starts
- [x] 3.3 Show a dialog on completion with a summary and a “View details” button that navigates to the Auto Check-in details page

## 4. Documentation
- [x] 4.1 Update `docs/docs/auto-checkin.md` to mention the UI-open pre-trigger toggle and the completion dialog

## 5. Tests + validation
- [x] 5.1 Add tests for the background scheduler pre-trigger decision logic
- [x] 5.2 Add UI tests for toast + completion dialog behavior
- [x] 5.3 Run `openspec validate add-auto-checkin-pretrigger-on-ui-open --strict`
- [x] 5.4 Run `pnpm test:ci` and report coverage gap + follow-up plan if below target


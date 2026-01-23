## 1. Preferences + settings UI
- [ ] 1.1 Extend `AutoCheckinPreferences` with `pretriggerDailyOnUiOpen` (default true)
- [ ] 1.2 Add a toggle in the sign-in/auto-checkin settings panel and wire it to `updateAutoCheckin`
- [ ] 1.3 Add i18n strings for the new toggle and prompts

## 2. Background: pre-trigger entrypoint
- [ ] 2.1 Add a runtime message action (e.g., `autoCheckin:pretriggerDailyOnUiOpen`) handled by `handleAutoCheckinMessage`
- [ ] 2.2 Implement a scheduler method that conditionally triggers today’s **daily** run early without modifying retry logic
- [ ] 2.3 Add a minimal in-flight guard to prevent duplicate daily runs (UI-open + alarm) for the same day

## 3. UI: trigger + notifications
- [ ] 3.1 Add a shared UI-on-open hook (used by popup/sidepanel/options) that calls the pre-trigger action
- [ ] 3.2 Show a toast when the early trigger starts
- [ ] 3.3 Show a dialog on completion with a summary and a “View details” button that navigates to the Auto Check-in details page

## 4. Documentation
- [ ] 4.1 Update `docs/docs/auto-checkin.md` to mention the UI-open pre-trigger toggle and the completion dialog

## 5. Tests + validation
- [ ] 5.1 Add tests for the background scheduler pre-trigger decision logic
- [ ] 5.2 Add UI tests for toast + completion dialog behavior
- [ ] 5.3 Run `openspec validate add-auto-checkin-pretrigger-on-ui-open --strict`
- [ ] 5.4 Run `pnpm test:ci` and report coverage gap + follow-up plan if below target


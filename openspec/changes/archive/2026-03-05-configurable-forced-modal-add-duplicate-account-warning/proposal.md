# Proposal: Duplicate account add warning (configurable)

## Problem
Users can accidentally add the same site/account more than once. The current UI has an inline hint when the *current tab* already matches a stored site, but it’s easy to miss and does not cover all add flows (manual URL entry / auto-config save).

## Goals
- When adding an account and the target site URL already exists in storage, show a mandatory confirmation pop-up (modal) before proceeding.
- Make the confirmation enable/disable via Settings.
- Default behavior: enabled (missing preference treated as enabled for backward compatibility).

## Non-goals
- Hard-blocking duplicates.
- Auto-merging/deduping existing accounts.
- Changing account storage schema beyond adding a new preference flag.

## UX Summary
- Add flow (`AccountDialog` in ADD mode): before proceeding with the add flow (auto-detect / entering manual add), detect whether any existing account shares the same `site_url`.
  - If yes and the setting is enabled: show a warning dialog with Cancel / Continue.
  - Continue proceeds with the user’s requested action; Cancel keeps the add dialog open and does not proceed.
- Setting is located under Basic Settings → Account Management.

## Capabilities

### New Capabilities

- `duplicate-account-warning`: Prompt for confirmation before continuing the account add flow when the target site URL already exists in account storage (configurable).

### Modified Capabilities

<!-- None. This change introduces a new capability; it does not modify existing openspec/specs requirements. -->

## Impact

- Preferences: `warnOnDuplicateAccountAdd` (default enabled), wiring via `UserPreferencesContext`
- Account add flow: duplicate detection + confirmation modal in `useAccountDialog` (ADD mode)
- Settings UI: toggle under Basic Settings → Account Management
- i18n: new `accountDialog` + `settings` locale keys
- Tests: hook tests covering enabled/disabled preference behavior

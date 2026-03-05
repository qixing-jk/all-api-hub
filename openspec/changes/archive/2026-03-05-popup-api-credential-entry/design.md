## Context

The popup UI currently supports two primary views—Accounts and Bookmarks—selected via `PopupViewSwitchTabs` and rendered by `src/entrypoints/popup/App.tsx`. API credential profiles already exist as an Options page section (`#apiCredentialProfiles`) implemented in `src/features/ApiCredentialProfiles/**`, with storage and verification/export tooling in shared services.

This change adds a third popup view to make API credential profiles accessible without navigating to Options, while keeping the existing Accounts/Bookmarks experience intact (popup and side panel both reuse the same UI).

## Goals / Non-Goals

**Goals:**
- Add an **API Credentials** view to the popup view switch, alongside Accounts and Bookmarks.
- Reuse existing API credential profiles storage and UI building blocks (dialogs/list item patterns) to support the common profile workflows from the popup: view/list, create, edit, delete, copy, verify, and quick export.
- Keep “open full page” behavior consistent: from the popup header, users can jump to the corresponding Options section for the active view (Accounts/Bookmarks/API Credentials).
- Keep the change MV2/MV3 safe and avoid logging or leaking API keys.

**Non-Goals:**
- No changes to the profile data model, storage keys, backup format, or verification probe behavior.
- No new external dependencies.
- No persistence of “last active popup tab” across popup opens (unless later required).
- No attempt to fully replicate the desktop Options layout (sidebar, large page header) inside the popup.

## Decisions

1. **Popup view id and routing**
   - Add a third view id (e.g. `apiCredentialProfiles`) to the popup’s active view union to align with the existing Options menu id (`MENU_ITEM_IDS.API_CREDENTIAL_PROFILES`) and the existing i18n namespace (`apiCredentialProfiles`).
   - Update `HeaderSection` “open full page” logic to call `openApiCredentialProfilesPage` when this view is active.

2. **Extend `PopupViewSwitchTabs` to 3 tabs (not a new control)**
   - Keep the existing `PopupViewSwitchTabs` component and extend it to render a third button.
   - Keep styling consistent with the historical “StyledTab” look; adjust spacing/padding so 3 labels fit in the popup width (and remain usable in the side panel).

3. **Popup-friendly profile view uses a compact container**
   - Implement a compact popup container (e.g. `ApiCredentialProfilesPopupView`) that:
     - Uses `useApiCredentialProfiles()` for data + mutations.
     - Reuses existing dialogs/components where possible (`ApiCredentialProfileDialog`, `VerifyApiCredentialProfileDialog`, `ApiCredentialProfileListItem`, export dialogs).
     - Avoids Options-only chrome (`PageHeader`, sidebar layout), instead fitting into the popup’s existing `ActionButtons` + list area pattern.
   - Prefer conditional mounting so profile data/tag data is only fetched when the API Credentials view is active (minimize background work when users stay on Accounts).

4. **Centralize view-specific UI decisions in `PopupContent`**
   - Replace 2-way ternaries with a small view configuration mapping (label, primary action, header extras, main list component) so adding the third view does not increase conditional complexity across `PopupContent`.

5. **i18n strategy**
   - Add a dedicated label key for the new view (prefer `apiCredentialProfiles:*` keys for profile-related UI), while preserving existing `bookmark:switch.accounts` / `bookmark:switch.bookmarks` usage.
   - Ensure all new user-facing strings are translated in the same namespaces already used in popup/options where possible.

## Risks / Trade-offs

- **Popup space constraints** → Keep the tab switch compact (`text-xs`, tight padding) and ensure labels truncate gracefully.
- **Increased UI complexity in popup** → Contain profile-specific logic in a dedicated popup view component; keep `PopupContent` declarative via view config mapping.
- **Extra async work (profiles/tags) even when unused** → Mount the API Credentials view component only when active; load tags lazily within that view.
- **Secrets handling regressions** → Reuse existing masking/copy patterns from the Options implementation; avoid any logging of raw `apiKey` values.

## Migration Plan

- No data migration required (existing profile storage and services are reused).
- Deploy as a UI-only change; rollback is safe by reverting the popup view additions.

## Open Questions

- Which subset of export actions should be enabled in popup by default (all existing exports vs. a minimal set)?
- Should the popup show a small “stats” header section for profiles (e.g., count, last updated), or omit that section entirely for this view?

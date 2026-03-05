## 1. Popup View Switch + Routing

- [x] 1.1 Extend `PopupViewType` and `PopupViewSwitchTabs` to include `apiCredentialProfiles`
- [x] 1.2 Update `src/entrypoints/popup/App.tsx` to render a third view and avoid ternary sprawl via a view config mapping
- [x] 1.3 Update `src/entrypoints/popup/components/HeaderSection.tsx` “open full page” action to route API Credentials to `openApiCredentialProfilesPage`

## 2. Popup API Credential Profiles View

- [x] 2.1 Create a popup-optimized container component (e.g., `ApiCredentialProfilesPopupView`) that is only mounted when active
- [x] 2.2 Reuse `useApiCredentialProfiles()` and existing dialog components to support create/edit/delete from popup
- [x] 2.3 Reuse `ApiCredentialProfileListItem` for copy bundle, verify, and export actions in popup
- [x] 2.4 Ensure API keys remain masked by default and are never logged; verify clipboard + toast messaging works in popup context

## 3. UI/UX Polishing

- [x] 3.1 Add/adjust i18n keys for the new popup tab label and any popup-specific text
- [x] 3.2 Ensure the 3-tab switch remains usable in small popup widths (truncate/spacing) and in side panel
- [x] 3.3 Confirm popup header secondary sections behave sensibly for the API Credentials view (e.g., hide account balance/bookmark stats sections if not applicable)

## 4. Tests

- [x] 4.1 Add a component test covering switching between Accounts / Bookmarks / API Credentials views
- [x] 4.2 Add a test ensuring “open full page” routes to the correct options section per active view (including API Credentials)

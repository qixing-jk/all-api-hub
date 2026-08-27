import type { PopupViewType } from "./components/PopupViewSwitchTabs"

export const POPUP_TEST_IDS = {
  apiCredentialProfilesPrimaryAction:
    "popup-api-credential-profiles-primary-action",
  bookmarksPrimaryAction: "popup-bookmarks-primary-action",
  accountsTab: "popup-accounts-tab",
  apiCredentialProfilesTab: "popup-api-credential-profiles-tab",
  bookmarksTab: "popup-bookmarks-tab",
  scrollContainer: "popup-scroll-container",
  openAccountManagementButton: "popup-open-account-management-button",
  openApiCredentialProfilesButton: "popup-open-api-credential-profiles-button",
  openBookmarkManagementButton: "popup-open-bookmark-management-button",
} as const

/**
 * Returns the stable test id for the active popup view container.
 */
export function getPopupViewTestId(view: PopupViewType) {
  return `popup-view-${view}`
}

/**
 * Returns the stable test id for the popup header button that opens the active view in a full page.
 */
export function getPopupOpenFullPageButtonTestId(view: PopupViewType) {
  switch (view) {
    case "bookmarks":
      return POPUP_TEST_IDS.openBookmarkManagementButton
    case "apiCredentialProfiles":
      return POPUP_TEST_IDS.openApiCredentialProfilesButton
    case "accounts":
    default:
      return POPUP_TEST_IDS.openAccountManagementButton
  }
}

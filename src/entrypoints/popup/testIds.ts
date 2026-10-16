import { POPUP_VIEW_TYPES } from "./viewTypes"
import type { PopupViewType } from "./viewTypes"

export const POPUP_TEST_IDS = {
  apiCredentialProfilesPrimaryAction:
    "popup-api-credential-profiles-primary-action",
  bookmarksPrimaryAction: "popup-bookmarks-primary-action",
  accountsTab: "popup-accounts-tab",
  apiCredentialProfilesTab: "popup-api-credential-profiles-tab",
  bookmarksTab: "popup-bookmarks-tab",
  scrollContainer: "popup-scroll-container",
  detectedSiteFilterButton: "popup-detected-site-filter-button",
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
    case POPUP_VIEW_TYPES.Bookmarks:
      return POPUP_TEST_IDS.openBookmarkManagementButton
    case POPUP_VIEW_TYPES.ApiCredentialProfiles:
      return POPUP_TEST_IDS.openApiCredentialProfilesButton
    case POPUP_VIEW_TYPES.Accounts:
    default:
      return POPUP_TEST_IDS.openAccountManagementButton
  }
}

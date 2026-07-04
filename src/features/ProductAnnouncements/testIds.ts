export const PRODUCT_ANNOUNCEMENT_TEST_IDS = {
  button: "product-announcement-button",
  reservedSlot: "product-announcement-reserved-slot",
  badge: "product-announcement-badge",
  popover: "product-announcement-popover",
  sheet: "product-announcement-sheet",
  closeButton: "product-announcement-close-button",
  activeTab: "product-announcement-active-tab",
  dismissedTab: "product-announcement-dismissed-tab",
  activeList: "product-announcement-active-list",
  dismissedList: "product-announcement-dismissed-list",
  dismissButtonPrefix: "product-announcement-dismiss-button",
  restoreButtonPrefix: "product-announcement-restore-button",
} as const

/**
 * Builds the stable dismiss-button test id for a product announcement.
 */
export function getProductAnnouncementDismissButtonTestId(id: string) {
  return `${PRODUCT_ANNOUNCEMENT_TEST_IDS.dismissButtonPrefix}-${id}`
}

/**
 * Builds the stable restore-button test id for a product announcement.
 */
export function getProductAnnouncementRestoreButtonTestId(id: string) {
  return `${PRODUCT_ANNOUNCEMENT_TEST_IDS.restoreButtonPrefix}-${id}`
}

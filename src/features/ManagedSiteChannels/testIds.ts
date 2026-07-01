export const MANAGED_SITE_CHANNELS_TEST_IDS = {
  addChannelButton: "managed-site-channels-add-channel-button",
  searchInput: "managed-site-channels-search-input",
  paginationSummary: "managed-site-channels-pagination-summary",
  deleteChannelConfirmButton: "managed-site-channels-delete-confirm-button",
  deleteSelectedButton: "managed-site-channels-delete-selected-button",
} as const

export const MANAGED_SITE_CHANNEL_ROW_TEST_ID_PREFIX =
  "managed-site-channel-row-" as const

/**
 * Returns the stable test id for a managed-site channel table row.
 */
export function getManagedSiteChannelRowTestId(channelName: string) {
  return `${MANAGED_SITE_CHANNEL_ROW_TEST_ID_PREFIX}${channelName}`
}

/**
 * Returns the stable test id for a managed-site channel row actions trigger.
 */
export function getManagedSiteChannelRowActionsButtonTestId(
  channelName: string,
) {
  return `${getManagedSiteChannelRowTestId(channelName)}-actions`
}

/**
 * Returns the stable test id for a managed-site channel row selection checkbox.
 */
export function getManagedSiteChannelRowSelectTestId(channelName: string) {
  return `${getManagedSiteChannelRowTestId(channelName)}-select`
}

/**
 * Returns the stable test id for a managed-site channel edit action.
 */
export function getManagedSiteChannelRowEditActionTestId(channelName: string) {
  return `${getManagedSiteChannelRowTestId(channelName)}-edit`
}

/**
 * Returns the stable test id for a managed-site channel delete action.
 */
export function getManagedSiteChannelRowDeleteActionTestId(
  channelName: string,
) {
  return `${getManagedSiteChannelRowTestId(channelName)}-delete`
}

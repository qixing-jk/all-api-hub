export const MANAGED_SITE_CHANNELS_TEST_IDS = {
  addChannelButton: "managed-site-channels-add-channel-button",
  refreshButton: "managed-site-channels-refresh-button",
  migrationModeButton: "managed-site-channels-migration-mode-button",
  migrationControls: "managed-site-channels-migration-controls",
  migrationComparison: "managed-site-channels-migration-comparison",
  searchInput: "managed-site-channels-search-input",
  paginationSummary: "managed-site-channels-pagination-summary",
  deleteChannelConfirmButton: "managed-site-channels-delete-confirm-button",
  deleteChannelCancelButton: "managed-site-channels-delete-cancel-button",
  deleteSelectedButton: "managed-site-channels-delete-selected-button",
} as const

export const MANAGED_SITE_CHANNEL_ROW_TEST_ID_PREFIX =
  "managed-site-channel-row-" as const

export const MANAGED_SITE_CHANNELS_REFRESH_STATE_ATTRIBUTE =
  "data-refresh-state" as const

export const MANAGED_SITE_CHANNELS_REFRESH_STATES = {
  Idle: "idle",
  Loading: "loading",
} as const

/**
 * Returns the stable test id for a managed-site channel table row.
 */
export function getManagedSiteChannelRowTestId(rowTestToken: string) {
  return `${MANAGED_SITE_CHANNEL_ROW_TEST_ID_PREFIX}${rowTestToken}`
}

/**
 * Returns the stable test id for a managed-site channel row actions trigger.
 */
export function getManagedSiteChannelRowActionsButtonTestId(
  rowTestToken: string,
) {
  return `${getManagedSiteChannelRowTestId(rowTestToken)}-actions`
}

/**
 * Returns the stable test id for a managed-site channel row selection checkbox.
 */
export function getManagedSiteChannelRowSelectTestId(rowTestToken: string) {
  return `${getManagedSiteChannelRowTestId(rowTestToken)}-select`
}

/**
 * Returns the stable test id for a managed-site channel edit action.
 */
export function getManagedSiteChannelRowEditActionTestId(rowTestToken: string) {
  return `${getManagedSiteChannelRowTestId(rowTestToken)}-edit`
}

/**
 * Returns the stable test id for a managed-site channel delete action.
 */
export function getManagedSiteChannelRowDeleteActionTestId(
  rowTestToken: string,
) {
  return `${getManagedSiteChannelRowTestId(rowTestToken)}-delete`
}

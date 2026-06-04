import { BASIC_SETTINGS_ANCHOR_TO_TAB } from "~/constants/basicSettingsTabs"
import { MENU_ITEM_IDS } from "~/constants/optionsMenuIds"
import { SETTINGS_ANCHORS } from "~/constants/settingsAnchors"

import { OPTIONS_OVERVIEW_CONFIGURATION_STATUSES as CONFIGURATION_STATUSES } from "./ids"
import type {
  OptionsOverviewActionCenterItem,
  OptionsOverviewNavigationTarget,
} from "./types"

type BasicSettingsAnchor =
  | typeof SETTINGS_ANCHORS.AUTO_CHECKIN
  | typeof SETTINGS_ANCHORS.SITE_ANNOUNCEMENT_NOTIFICATIONS_ENABLED
  | typeof SETTINGS_ANCHORS.USAGE_HISTORY_SYNC
  | typeof SETTINGS_ANCHORS.BALANCE_HISTORY
  | typeof SETTINGS_ANCHORS.MANAGED_SITE_MODEL_SYNC
  | typeof SETTINGS_ANCHORS.MANAGED_SITE_SELECTOR

/**
 * Builds a deep link to an import/export section and applies the same highlight
 * behavior used by settings search results.
 */
export function buildImportExportAnchorTarget(
  targetId: string,
): OptionsOverviewNavigationTarget {
  return {
    menuItemId: MENU_ITEM_IDS.IMPORT_EXPORT,
    params: {
      anchor: targetId,
      highlight: targetId,
    },
  }
}

/**
 * Builds a Basic Settings deep link that can scroll to and highlight a setting.
 */
export function buildBasicSettingsAnchorTarget(
  anchor: BasicSettingsAnchor,
): OptionsOverviewNavigationTarget {
  return {
    menuItemId: MENU_ITEM_IDS.BASIC,
    params: {
      tab: BASIC_SETTINGS_ANCHOR_TO_TAB[anchor],
      anchor,
      highlight: anchor,
    },
  }
}

/**
 * Sends configured capabilities to their operational page and setup gaps to the
 * exact settings section that resolves the gap.
 */
export function buildConfigurationTarget(
  status: OptionsOverviewActionCenterItem["status"],
  operationalMenuItemId: OptionsOverviewNavigationTarget["menuItemId"],
  settingsAnchor: BasicSettingsAnchor,
): OptionsOverviewNavigationTarget {
  return status === CONFIGURATION_STATUSES.configured
    ? { menuItemId: operationalMenuItemId }
    : buildBasicSettingsAnchorTarget(settingsAnchor)
}

/**
 * Routes auto check-in setup gaps to the owner of the missing prerequisite.
 */
export function buildAutoCheckinConfigurationTarget(input: {
  status: OptionsOverviewActionCenterItem["status"]
}): OptionsOverviewNavigationTarget {
  if (input.status === CONFIGURATION_STATUSES.configured) {
    return { menuItemId: MENU_ITEM_IDS.AUTO_CHECKIN }
  }

  if (input.status === CONFIGURATION_STATUSES.needsSetup) {
    return buildAccountNavigationTarget()
  }

  return buildBasicSettingsAnchorTarget(SETTINGS_ANCHORS.AUTO_CHECKIN)
}

/**
 * Routes announcement setup gaps to accounts when there is nothing to poll.
 */
export function buildSiteAnnouncementsConfigurationTarget(input: {
  status: OptionsOverviewActionCenterItem["status"]
  enabledAccountCount: number
}): OptionsOverviewNavigationTarget {
  if (input.status === CONFIGURATION_STATUSES.configured) {
    return { menuItemId: MENU_ITEM_IDS.SITE_ANNOUNCEMENTS }
  }

  if (
    input.status === CONFIGURATION_STATUSES.needsSetup &&
    input.enabledAccountCount === 0
  ) {
    return buildAccountNavigationTarget()
  }

  return buildBasicSettingsAnchorTarget(
    SETTINGS_ANCHORS.SITE_ANNOUNCEMENT_NOTIFICATIONS_ENABLED,
  )
}

/**
 * Routes history setup gaps to accounts when there is no account scope.
 */
export function buildDataHistoryConfigurationTarget(input: {
  status: OptionsOverviewActionCenterItem["status"]
  enabledAccountCount: number
  operationalMenuItemId: OptionsOverviewNavigationTarget["menuItemId"]
  settingsAnchor: BasicSettingsAnchor
}): OptionsOverviewNavigationTarget {
  if (input.status === CONFIGURATION_STATUSES.configured) {
    return { menuItemId: input.operationalMenuItemId }
  }

  if (
    input.status === CONFIGURATION_STATUSES.needsSetup &&
    input.enabledAccountCount === 0
  ) {
    return buildAccountNavigationTarget()
  }

  return buildBasicSettingsAnchorTarget(input.settingsAnchor)
}

/**
 * Routes model sync setup to the prerequisite managed-site connection first.
 */
export function buildManagedSiteModelSyncConfigurationTarget(input: {
  status: OptionsOverviewActionCenterItem["status"]
  managedSiteConfigured: boolean
}): OptionsOverviewNavigationTarget {
  if (input.status === CONFIGURATION_STATUSES.configured) {
    return { menuItemId: MENU_ITEM_IDS.MANAGED_SITE_MODEL_SYNC }
  }

  return buildBasicSettingsAnchorTarget(
    input.managedSiteConfigured
      ? SETTINGS_ANCHORS.MANAGED_SITE_MODEL_SYNC
      : SETTINGS_ANCHORS.MANAGED_SITE_SELECTOR,
  )
}

/**
 * Uses the account manager's supported search route to focus a specific account.
 */
export function buildAccountNavigationTarget(
  accountId?: string,
): OptionsOverviewNavigationTarget {
  const search = accountId?.trim()

  return {
    menuItemId: MENU_ITEM_IDS.ACCOUNT,
    params: search ? { search } : undefined,
  }
}

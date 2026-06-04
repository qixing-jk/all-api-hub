import { MENU_ITEM_IDS } from "~/constants/optionsMenuIds"
import { SETTINGS_ANCHORS } from "~/constants/settingsAnchors"
import type { ManagedSiteType } from "~/constants/siteType"
import {
  WEBDAV_AUTO_SYNC_TARGET_IDS,
  WEBDAV_TARGET_IDS,
} from "~/features/ImportExport/searchTargets"
import type { UserPreferences } from "~/services/preferences/userPreferences"
import type { SiteAccount } from "~/types"

import {
  resolveAutoCheckinConfigurationStatus,
  resolveBalanceHistoryConfigurationStatus,
  resolveManagedSiteConfigurationStatus,
  resolveSiteAnnouncementsConfigurationStatus,
  resolveUsageAnalyticsConfigurationStatus,
  summarizeConfigurationStatuses,
  type ConfigurationStatus,
} from "./configurationStatus"
import {
  OPTIONS_OVERVIEW_CONFIGURATION_STATUSES as CONFIGURATION_STATUSES,
  OPTIONS_OVERVIEW_ACTION_CENTER_ITEM_IDS,
  OPTIONS_OVERVIEW_CONFIGURATION_SUB_ITEM_IDS,
} from "./ids"
import {
  buildAccountNavigationTarget,
  buildAutoCheckinConfigurationTarget,
  buildConfigurationTarget,
  buildDataHistoryConfigurationTarget,
  buildImportExportAnchorTarget,
  buildManagedSiteModelSyncConfigurationTarget,
  buildSiteAnnouncementsConfigurationTarget,
} from "./navigationTargets"
import type { OptionsOverviewActionCenterItem } from "./types"

type ConfigurationGroupId = OptionsOverviewActionCenterItem["id"]
type ConfigurationSubItem = OptionsOverviewActionCenterItem["subItems"][number]
type ConfigurationSubItemId = ConfigurationSubItem["id"]
type ConfigurationTarget = ConfigurationSubItem["target"]

/**
 * Builds one configuration overview group with the default visible state.
 */
function buildConfigurationGroup(input: {
  id: ConfigurationGroupId
  status: ConfigurationStatus
  subItems: ConfigurationSubItem[]
  isVisible?: boolean
}): OptionsOverviewActionCenterItem {
  return {
    id: input.id,
    status: input.status,
    subItems: input.subItems,
    isVisible: input.isVisible ?? true,
  }
}

/**
 * Builds one nested configuration destination entry.
 */
function buildConfigurationSubItem(input: {
  id: ConfigurationSubItemId
  status: ConfigurationStatus
  target: ConfigurationTarget
}): ConfigurationSubItem {
  return {
    id: input.id,
    status: input.status,
    target: input.target,
  }
}

/**
 * Builds a group whose readiness and count are derived from child statuses.
 */
function buildSummarizedConfigurationGroup(input: {
  id: ConfigurationGroupId
  statuses: ConfigurationStatus[]
  subItems: ConfigurationSubItem[]
  isVisible?: boolean
}): OptionsOverviewActionCenterItem {
  return buildConfigurationGroup({
    id: input.id,
    status: summarizeConfigurationStatuses(input.statuses),
    subItems: input.subItems,
    isVisible: input.isVisible,
  })
}

/**
 * Builds capability status cards from configuration state and nested routes.
 */
export function buildConfigurationOverviewItems(input: {
  enabledAccountCount: number
  accounts: SiteAccount[]
  profileCount: number
  preferences: UserPreferences | null | undefined
  managedSiteType: ManagedSiteType | undefined
  hasUsageData: boolean
}): OptionsOverviewActionCenterItem[] {
  const backupSyncStatus = resolveBackupSyncStatus(input.preferences)
  const autoCheckinStatus = resolveAutoCheckinConfigurationStatus({
    accounts: input.accounts,
    preferences: input.preferences,
  })
  const siteAnnouncementsStatus = resolveSiteAnnouncementsConfigurationStatus({
    enabledAccountCount: input.enabledAccountCount,
    preferences: input.preferences,
  })
  const usageAnalyticsStatus = resolveUsageAnalyticsConfigurationStatus({
    hasUsageData: input.hasUsageData,
    preferences: input.preferences,
  })
  const balanceHistoryStatus = resolveBalanceHistoryConfigurationStatus({
    enabledAccountCount: input.enabledAccountCount,
    preferences: input.preferences,
  })
  const { managedSiteConfigured, modelSyncStatus } =
    resolveManagedSiteConfigurationStatus({
      managedSiteType: input.managedSiteType,
      preferences: input.preferences,
    })
  const managedSiteStatus = resolveManagedSiteConnectionStatus({
    managedSiteType: input.managedSiteType,
    managedSiteConfigured,
  })
  const effectiveModelSyncStatus = input.managedSiteType
    ? modelSyncStatus
    : CONFIGURATION_STATUSES.notApplicable
  const managedSiteStatuses = input.managedSiteType
    ? [managedSiteStatus, modelSyncStatus]
    : [CONFIGURATION_STATUSES.notApplicable]

  return [
    buildConfigurationGroup({
      id: OPTIONS_OVERVIEW_ACTION_CENTER_ITEM_IDS.accountFoundation,
      status:
        input.enabledAccountCount > 0
          ? CONFIGURATION_STATUSES.configured
          : CONFIGURATION_STATUSES.needsSetup,
      subItems: [
        buildConfigurationSubItem({
          id: OPTIONS_OVERVIEW_CONFIGURATION_SUB_ITEM_IDS.accounts,
          status:
            input.enabledAccountCount > 0
              ? CONFIGURATION_STATUSES.configured
              : CONFIGURATION_STATUSES.needsSetup,
          target: buildAccountNavigationTarget(),
        }),
      ],
    }),
    buildConfigurationGroup({
      id: OPTIONS_OVERVIEW_ACTION_CENTER_ITEM_IDS.credentialAssets,
      status:
        input.profileCount > 0
          ? CONFIGURATION_STATUSES.configured
          : CONFIGURATION_STATUSES.needsSetup,
      subItems: [
        buildConfigurationSubItem({
          id: OPTIONS_OVERVIEW_CONFIGURATION_SUB_ITEM_IDS.apiProfiles,
          status:
            input.profileCount > 0
              ? CONFIGURATION_STATUSES.configured
              : CONFIGURATION_STATUSES.needsSetup,
          target: { menuItemId: MENU_ITEM_IDS.API_CREDENTIAL_PROFILES },
        }),
        buildConfigurationSubItem({
          id: OPTIONS_OVERVIEW_CONFIGURATION_SUB_ITEM_IDS.apiKeys,
          status:
            input.enabledAccountCount > 0
              ? CONFIGURATION_STATUSES.configured
              : CONFIGURATION_STATUSES.needsSetup,
          target: { menuItemId: MENU_ITEM_IDS.KEYS },
        }),
      ],
    }),
    buildSummarizedConfigurationGroup({
      id: OPTIONS_OVERVIEW_ACTION_CENTER_ITEM_IDS.automation,
      statuses: [autoCheckinStatus, siteAnnouncementsStatus],
      subItems: [
        buildConfigurationSubItem({
          id: OPTIONS_OVERVIEW_CONFIGURATION_SUB_ITEM_IDS.autoCheckin,
          status: autoCheckinStatus,
          target: buildAutoCheckinConfigurationTarget({
            status: autoCheckinStatus,
          }),
        }),
        buildConfigurationSubItem({
          id: OPTIONS_OVERVIEW_CONFIGURATION_SUB_ITEM_IDS.siteAnnouncements,
          status: siteAnnouncementsStatus,
          target: buildSiteAnnouncementsConfigurationTarget({
            status: siteAnnouncementsStatus,
            enabledAccountCount: input.enabledAccountCount,
          }),
        }),
      ],
    }),
    buildSummarizedConfigurationGroup({
      id: OPTIONS_OVERVIEW_ACTION_CENTER_ITEM_IDS.dataHistory,
      statuses: [usageAnalyticsStatus, balanceHistoryStatus],
      subItems: [
        buildConfigurationSubItem({
          id: OPTIONS_OVERVIEW_CONFIGURATION_SUB_ITEM_IDS.usageAnalytics,
          status: usageAnalyticsStatus,
          target: buildDataHistoryConfigurationTarget({
            status: usageAnalyticsStatus,
            enabledAccountCount: input.enabledAccountCount,
            operationalMenuItemId: MENU_ITEM_IDS.USAGE_ANALYTICS,
            settingsAnchor: SETTINGS_ANCHORS.USAGE_HISTORY_SYNC,
          }),
        }),
        buildConfigurationSubItem({
          id: OPTIONS_OVERVIEW_CONFIGURATION_SUB_ITEM_IDS.balanceHistory,
          status: balanceHistoryStatus,
          target: buildDataHistoryConfigurationTarget({
            status: balanceHistoryStatus,
            enabledAccountCount: input.enabledAccountCount,
            operationalMenuItemId: MENU_ITEM_IDS.BALANCE_HISTORY,
            settingsAnchor: SETTINGS_ANCHORS.BALANCE_HISTORY,
          }),
        }),
      ],
    }),
    buildConfigurationGroup({
      id: OPTIONS_OVERVIEW_ACTION_CENTER_ITEM_IDS.backupSync,
      status: backupSyncStatus.hasConfiguredSync
        ? CONFIGURATION_STATUSES.configured
        : CONFIGURATION_STATUSES.disabled,
      subItems: [
        buildConfigurationSubItem({
          id: OPTIONS_OVERVIEW_CONFIGURATION_SUB_ITEM_IDS.webdavManual,
          status: backupSyncStatus.manualStatus,
          target: buildImportExportAnchorTarget(WEBDAV_TARGET_IDS.root),
        }),
        buildConfigurationSubItem({
          id: OPTIONS_OVERVIEW_CONFIGURATION_SUB_ITEM_IDS.webdavAutoSync,
          status: backupSyncStatus.autoSyncStatus,
          target: buildImportExportAnchorTarget(
            WEBDAV_AUTO_SYNC_TARGET_IDS.root,
          ),
        }),
      ],
    }),
    buildSummarizedConfigurationGroup({
      id: OPTIONS_OVERVIEW_ACTION_CENTER_ITEM_IDS.managedSite,
      statuses: managedSiteStatuses,
      subItems: [
        buildConfigurationSubItem({
          id: OPTIONS_OVERVIEW_CONFIGURATION_SUB_ITEM_IDS.managedSiteChannels,
          status: managedSiteStatus,
          target: buildConfigurationTarget(
            managedSiteStatus,
            MENU_ITEM_IDS.MANAGED_SITE_CHANNELS,
            SETTINGS_ANCHORS.MANAGED_SITE_SELECTOR,
          ),
        }),
        buildConfigurationSubItem({
          id: OPTIONS_OVERVIEW_CONFIGURATION_SUB_ITEM_IDS.managedSiteModelSync,
          status: effectiveModelSyncStatus,
          target: buildManagedSiteModelSyncConfigurationTarget({
            status: effectiveModelSyncStatus,
            managedSiteConfigured,
          }),
        }),
      ],
      isVisible: Boolean(input.managedSiteType),
    }),
  ]
}

/**
 * Resolves manual and automatic WebDAV backup readiness as one card summary.
 */
function resolveBackupSyncStatus(
  preferences: UserPreferences | null | undefined,
): {
  hasConfiguredSync: boolean
  manualStatus: ConfigurationStatus
  autoSyncStatus: ConfigurationStatus
} {
  const webdav = preferences?.webdav
  const manualStatus: ConfigurationStatus =
    webdav?.url.trim() && webdav.username.trim() && webdav.password.trim()
      ? CONFIGURATION_STATUSES.configured
      : CONFIGURATION_STATUSES.disabled
  const autoSyncStatus: ConfigurationStatus =
    webdav?.autoSync === true
      ? CONFIGURATION_STATUSES.configured
      : CONFIGURATION_STATUSES.disabled

  return {
    hasConfiguredSync:
      manualStatus === CONFIGURATION_STATUSES.configured ||
      autoSyncStatus === CONFIGURATION_STATUSES.configured,
    manualStatus,
    autoSyncStatus,
  }
}

/**
 * Resolves whether managed-site entrypoints should show setup or ready state.
 */
function resolveManagedSiteConnectionStatus(input: {
  managedSiteType: ManagedSiteType | undefined
  managedSiteConfigured: boolean
}): ConfigurationStatus {
  if (!input.managedSiteType) return CONFIGURATION_STATUSES.notApplicable
  return input.managedSiteConfigured
    ? CONFIGURATION_STATUSES.configured
    : CONFIGURATION_STATUSES.needsSetup
}

import { MENU_ITEM_IDS } from "~/constants/optionsMenuIds"
import { SETTINGS_ANCHORS } from "~/constants/settingsAnchors"
import type { ManagedSiteType } from "~/constants/siteType"
import { WEBDAV_AUTO_SYNC_TARGET_IDS } from "~/features/ImportExport/searchTargets"
import { supportsManagedSiteModelSync } from "~/services/managedSites/utils/managedSite"
import type { UserPreferences } from "~/services/preferences/userPreferences"
import type {
  SiteAnnouncementRecord,
  SiteAnnouncementSiteState,
} from "~/types/siteAnnouncements"
import { resolveWebdavSyncDataSelection } from "~/types/webdav"

import {
  OPTIONS_OVERVIEW_AUTOMATION_STATUS_LABELS as AUTOMATION_STATUS_LABELS,
  OPTIONS_OVERVIEW_AUTOMATION_ACTION_IDS,
  OPTIONS_OVERVIEW_AUTOMATION_ITEM_IDS,
  OPTIONS_OVERVIEW_AUTOMATION_SUMMARY_ROW_IDS as SUMMARY_ROW_IDS,
  OPTIONS_OVERVIEW_AUTOMATION_SUMMARY_VALUE_TYPES as SUMMARY_VALUE_TYPES,
} from "./ids"
import {
  buildBasicSettingsAnchorTarget,
  buildImportExportAnchorTarget,
} from "./navigationTargets"
import type {
  OptionsOverviewAutoCheckinPanel,
  OptionsOverviewAutomationAction,
  OptionsOverviewAutomationItem,
  OptionsOverviewAutomationOverview,
  OptionsOverviewNavigationTarget,
} from "./types"

const MILLISECONDS_PER_HOUR = 60 * 60 * 1000
const SECONDS_PER_MINUTE = 60

/**
 * Builds the automation execution overview from local run status and preferences.
 */
export function buildAutomationOverview(input: {
  autoCheckinPanel: OptionsOverviewAutoCheckinPanel
  preferences: UserPreferences | null | undefined
  managedSiteType: ManagedSiteType | undefined
  siteAnnouncementRecords: SiteAnnouncementRecord[]
  siteAnnouncementStatuses: SiteAnnouncementSiteState[]
}): OptionsOverviewAutomationOverview {
  const items: OptionsOverviewAutomationItem[] = [
    buildAutoCheckinAutomationItem(input.autoCheckinPanel),
    buildSiteAnnouncementsAutomationItem({
      preferences: input.preferences,
      records: input.siteAnnouncementRecords,
      statuses: input.siteAnnouncementStatuses,
    }),
  ]

  if (
    input.managedSiteType &&
    supportsManagedSiteModelSync(input.managedSiteType)
  ) {
    items.push(
      buildManagedSiteModelSyncAutomationItem({
        preferences: input.preferences,
      }),
    )
  }

  items.push(
    buildWebdavAutoSyncAutomationItem({
      preferences: input.preferences,
    }),
  )

  return { items }
}

/**
 * Creates the primary automation row for auto check-in execution.
 */
function buildAutoCheckinAutomationItem(
  panel: OptionsOverviewAutoCheckinPanel,
): OptionsOverviewAutomationItem {
  return {
    id: OPTIONS_OVERVIEW_AUTOMATION_ITEM_IDS.autoCheckin,
    status: panel.severity,
    statusLabel: AUTOMATION_STATUS_LABELS.enabled,
    primaryTarget: { menuItemId: MENU_ITEM_IDS.AUTO_CHECKIN },
    summaryRows: [
      {
        id: SUMMARY_ROW_IDS.lastRun,
        value: panel.lastRunAt ?? "",
        valueType: SUMMARY_VALUE_TYPES.datetime,
      },
      {
        id: SUMMARY_ROW_IDS.nextRun,
        value: panel.nextRunAt ?? "",
        valueType: SUMMARY_VALUE_TYPES.datetime,
      },
      ...(panel.nextRetryAt
        ? [
            {
              id: SUMMARY_ROW_IDS.nextRetry,
              value: panel.nextRetryAt,
              valueType: SUMMARY_VALUE_TYPES.datetime,
            },
          ]
        : []),
    ],
    actions: panel.actions.map((action, index) => ({
      id: action.id,
      target: action.target,
      variant: index === 0 ? "default" : "outline",
    })),
    defaultExpanded: false,
    autoCheckinPanel: panel,
  }
}

/**
 * Creates the site-announcement polling automation row from local records/status.
 */
function buildSiteAnnouncementsAutomationItem(input: {
  preferences: UserPreferences | null | undefined
  records: SiteAnnouncementRecord[]
  statuses: SiteAnnouncementSiteState[]
}): OptionsOverviewAutomationItem {
  const prefs = input.preferences?.siteAnnouncementNotifications
  const enabled = prefs?.enabled === true
  const latestStatus = input.statuses[0]
  const failedStatusCount = input.statuses.filter(
    (status) => status.status === "error",
  ).length
  const unsupportedStatusCount = input.statuses.filter(
    (status) => status.status === "unsupported",
  ).length
  const unreadCount = input.records.filter((record) => !record.read).length
  const readiness = resolveAutomationReadiness(enabled)
  const status = enabled
    ? failedStatusCount > 0
      ? "error"
      : unsupportedStatusCount > 0
        ? "warning"
        : readiness.status
    : readiness.status

  return {
    id: OPTIONS_OVERVIEW_AUTOMATION_ITEM_IDS.siteAnnouncements,
    status,
    statusLabel: readiness.statusLabel,
    primaryTarget: buildBasicSettingsAnchorTarget(
      SETTINGS_ANCHORS.SITE_ANNOUNCEMENT_NOTIFICATIONS_ENABLED,
    ),
    summaryRows: [
      {
        id: SUMMARY_ROW_IDS.interval,
        value: String(prefs?.intervalMinutes ?? 0),
      },
      {
        id: SUMMARY_ROW_IDS.records,
        value: String(input.records.length),
      },
      {
        id: SUMMARY_ROW_IDS.unread,
        value: String(unreadCount),
      },
      {
        id: SUMMARY_ROW_IDS.lastChecked,
        value: formatTimestampValue(latestStatus?.lastCheckedAt),
        valueType: SUMMARY_VALUE_TYPES.datetime,
      },
    ],
    actions: [
      {
        id: OPTIONS_OVERVIEW_AUTOMATION_ACTION_IDS.openAnnouncements,
        target: { menuItemId: MENU_ITEM_IDS.SITE_ANNOUNCEMENTS },
      },
      {
        id: OPTIONS_OVERVIEW_AUTOMATION_ACTION_IDS.openAnnouncementSettings,
        target: buildBasicSettingsAnchorTarget(
          SETTINGS_ANCHORS.SITE_ANNOUNCEMENT_NOTIFICATIONS_ENABLED,
        ),
        variant: "outline",
      },
    ],
    defaultExpanded: false,
  }
}

/**
 * Creates the managed-site model sync automation row from local settings.
 */
function buildManagedSiteModelSyncAutomationItem(input: {
  preferences: UserPreferences | null | undefined
}): OptionsOverviewAutomationItem {
  const config = input.preferences?.managedSiteModelSync

  return buildPreferenceAutomationItem({
    id: OPTIONS_OVERVIEW_AUTOMATION_ITEM_IDS.managedSiteModelSync,
    enabled: config?.enabled === true,
    primaryTarget: { menuItemId: MENU_ITEM_IDS.MANAGED_SITE_MODEL_SYNC },
    summaryRows: [
      {
        id: SUMMARY_ROW_IDS.interval,
        value: String(
          toMinimumUnitCount(config?.interval, MILLISECONDS_PER_HOUR),
        ),
      },
      {
        id: SUMMARY_ROW_IDS.concurrency,
        value: String(config?.concurrency ?? 0),
      },
      {
        id: SUMMARY_ROW_IDS.allowedModels,
        value: String(config?.allowedModels?.length ?? 0),
      },
    ],
    actions: [
      {
        id: OPTIONS_OVERVIEW_AUTOMATION_ACTION_IDS.openManagedSiteModelSync,
        target: { menuItemId: MENU_ITEM_IDS.MANAGED_SITE_MODEL_SYNC },
      },
    ],
  })
}

/**
 * Creates the WebDAV auto-sync automation row from local backup settings.
 */
function buildWebdavAutoSyncAutomationItem(input: {
  preferences: UserPreferences | null | undefined
}): OptionsOverviewAutomationItem {
  const webdav = input.preferences?.webdav
  const selectedDomains = resolveWebdavSyncDataSelection(webdav?.syncData)

  return buildPreferenceAutomationItem({
    id: OPTIONS_OVERVIEW_AUTOMATION_ITEM_IDS.webdavAutoSync,
    enabled: webdav?.autoSync === true,
    primaryTarget: buildImportExportAnchorTarget(
      WEBDAV_AUTO_SYNC_TARGET_IDS.root,
    ),
    summaryRows: [
      {
        id: SUMMARY_ROW_IDS.interval,
        value: String(
          toMinimumUnitCount(webdav?.syncInterval, SECONDS_PER_MINUTE),
        ),
      },
      {
        id: SUMMARY_ROW_IDS.strategy,
        value: webdav?.syncStrategy ?? "",
      },
      {
        id: SUMMARY_ROW_IDS.domains,
        value: String(countEnabledValues(selectedDomains)),
      },
    ],
    actions: [
      {
        id: OPTIONS_OVERVIEW_AUTOMATION_ACTION_IDS.openImportExport,
        target: buildImportExportAnchorTarget(WEBDAV_AUTO_SYNC_TARGET_IDS.root),
      },
    ],
  })
}

/**
 * Builds automation rows whose readiness is determined by a single preference.
 */
function buildPreferenceAutomationItem(input: {
  id: OptionsOverviewAutomationItem["id"]
  enabled: boolean
  primaryTarget: OptionsOverviewNavigationTarget
  summaryRows: OptionsOverviewAutomationItem["summaryRows"]
  actions: OptionsOverviewAutomationAction[]
}): OptionsOverviewAutomationItem {
  return {
    id: input.id,
    ...resolveAutomationReadiness(input.enabled),
    primaryTarget: input.primaryTarget,
    summaryRows: input.summaryRows,
    actions: input.actions,
    defaultExpanded: false,
  }
}

/**
 * Converts optional durations into the minimum displayed unit count.
 */
function toMinimumUnitCount(value: number | undefined, unitSize: number) {
  return Math.max(1, Math.round((value ?? 0) / unitSize))
}

/**
 * Formats persisted millisecond timestamps for datetime summary rows.
 */
function formatTimestampValue(value: number | undefined) {
  return typeof value === "number" ? new Date(value).toISOString() : ""
}

/**
 * Counts enabled boolean flags without exposing the selection map shape.
 */
function countEnabledValues(values: Record<string, boolean>) {
  return Object.values(values).filter(Boolean).length
}

/**
 * Normalizes preference-enabled automation state into the row status contract.
 */
function resolveAutomationReadiness(
  enabled: boolean,
): Pick<OptionsOverviewAutomationItem, "status" | "statusLabel"> {
  return enabled
    ? { status: "success", statusLabel: AUTOMATION_STATUS_LABELS.enabled }
    : { status: "info", statusLabel: AUTOMATION_STATUS_LABELS.disabled }
}

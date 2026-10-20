import { MENU_ITEM_IDS } from "~/constants/optionsMenuIds"
import { SETTINGS_ANCHORS } from "~/constants/settingsAnchors"
import type { ManagedSiteType } from "~/constants/siteType"
import { WEBDAV_AUTO_SYNC_TARGET_IDS } from "~/features/ImportExport/searchTargets"
import { resolveAutomationState } from "~/features/OptionsOverview/automation/automationState"
import {
  OPTIONS_OVERVIEW_AUTO_CHECKIN_PANEL_STATUSES as CHECKIN_STATUSES,
  OPTIONS_OVERVIEW_AUTOMATION_ACTION_IDS,
  OPTIONS_OVERVIEW_AUTOMATION_ITEM_IDS,
  OPTIONS_OVERVIEW_AUTOMATION_STATUS_LABELS as STATUS_LABELS,
  OPTIONS_OVERVIEW_AUTOMATION_SUMMARY_ROW_IDS as SUMMARY_ROW_IDS,
  OPTIONS_OVERVIEW_AUTOMATION_SUMMARY_VALUE_TYPES as SUMMARY_VALUE_TYPES,
} from "~/features/OptionsOverview/ids"
import {
  buildBasicSettingsAnchorTarget,
  buildImportExportAnchorTarget,
} from "~/features/OptionsOverview/navigationTargets"
import type {
  OptionsOverviewAutoCheckinPanel,
  OptionsOverviewAutomationAction,
  OptionsOverviewAutomationItem,
  OptionsOverviewAutomationOverview,
  OptionsOverviewAutomationRunData,
  OptionsOverviewAutomationStatusLabel,
  OptionsOverviewNavigationTarget,
} from "~/features/OptionsOverview/types"
import { supportsManagedSiteModelSync } from "~/services/managedSites/utils/managedSite"
import type { UserPreferences } from "~/services/preferences/preferencesSchema"
import {
  SITE_ANNOUNCEMENT_STATUS,
  type SiteAnnouncementRecord,
  type SiteAnnouncementSiteState,
} from "~/types/siteAnnouncements"
import { resolveWebdavSyncDataSelection } from "~/types/webdav"

const MILLISECONDS_PER_HOUR = 60 * 60 * 1000
const SECONDS_PER_MINUTE = 60

/**
 * Builds the automation execution overview from local run status and preferences.
 */
export function buildAutomationOverview(
  input: OptionsOverviewAutomationRunData & {
    autoCheckinPanel: OptionsOverviewAutoCheckinPanel
    preferences: UserPreferences | null | undefined
    managedSiteType: ManagedSiteType | undefined
    siteAnnouncementRecords: SiteAnnouncementRecord[]
    siteAnnouncementStatuses: SiteAnnouncementSiteState[]
  },
): OptionsOverviewAutomationOverview {
  const items: OptionsOverviewAutomationItem[] = [
    buildAutoCheckinAutomationItem(
      input.autoCheckinPanel,
      input.autoCheckinDataAvailable,
      input.preferences != null,
    ),
    buildSiteAnnouncementsAutomationItem({
      preferences: input.preferences,
      records: input.siteAnnouncementRecords,
      statuses: input.siteAnnouncementStatuses,
      dataAvailable: input.announcementDataAvailable,
    }),
  ]

  if (
    input.managedSiteType &&
    supportsManagedSiteModelSync(input.managedSiteType)
  ) {
    items.push(
      buildManagedSiteModelSyncAutomationItem({
        preferences: input.preferences,
        modelSyncExecution: input.modelSyncExecution,
      }),
    )
  }

  items.push(
    buildWebdavAutoSyncAutomationItem({
      preferences: input.preferences,
      webdavStatus: input.webdavStatus,
    }),
  )

  return { items }
}

/**
 * Creates the primary automation row for auto check-in execution.
 */
function buildAutoCheckinAutomationItem(
  panel: OptionsOverviewAutoCheckinPanel,
  dataAvailable: boolean | undefined,
  preferencesAvailable: boolean,
): OptionsOverviewAutomationItem {
  return {
    id: OPTIONS_OVERVIEW_AUTOMATION_ITEM_IDS.autoCheckin,
    ...resolveAutomationState(
      preferencesAvailable
        ? panel.status !== CHECKIN_STATUSES.disabled
        : undefined,
      dataAvailable === false ? STATUS_LABELS.unknown : panel.status,
    ),
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
  dataAvailable?: boolean
}): OptionsOverviewAutomationItem {
  const prefs = input.preferences?.siteAnnouncementNotifications
  const enabled = input.preferences ? prefs?.enabled === true : undefined
  const latestStatus = input.statuses[0]
  const failedStatusCount = input.statuses.filter(
    (status) => status.status === SITE_ANNOUNCEMENT_STATUS.Error,
  ).length
  const unsupportedStatusCount = input.statuses.filter(
    (status) => status.status === SITE_ANNOUNCEMENT_STATUS.Unsupported,
  ).length
  const unreadCount = input.records.filter((record) => !record.read).length
  const successCount = input.statuses.filter(
    (status) => status.status === SITE_ANNOUNCEMENT_STATUS.Success,
  ).length
  const runStatus = resolveAnnouncementRunStatus({
    dataAvailable: input.dataAvailable,
    failedStatusCount,
    unsupportedStatusCount,
    successCount,
  })

  return {
    id: OPTIONS_OVERVIEW_AUTOMATION_ITEM_IDS.siteAnnouncements,
    ...resolveAutomationState(enabled, runStatus),
    primaryTarget: { menuItemId: MENU_ITEM_IDS.SITE_ANNOUNCEMENTS },
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
      { id: SUMMARY_ROW_IDS.success, value: String(successCount) },
      { id: SUMMARY_ROW_IDS.failed, value: String(failedStatusCount) },
      {
        id: SUMMARY_ROW_IDS.unsupported,
        value: String(unsupportedStatusCount),
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
function buildManagedSiteModelSyncAutomationItem(
  input: Pick<OptionsOverviewAutomationRunData, "modelSyncExecution"> & {
    preferences: UserPreferences | null | undefined
  },
): OptionsOverviewAutomationItem {
  const config = input.preferences?.managedSiteModelSync
  const execution = input.modelSyncExecution
  const stats = execution?.statistics

  return buildPreferenceAutomationItem({
    id: OPTIONS_OVERVIEW_AUTOMATION_ITEM_IDS.managedSiteModelSync,
    enabled: input.preferences ? config?.enabled === true : undefined,
    runStatus: resolveModelSyncRunStatus(execution),
    primaryTarget: { menuItemId: MENU_ITEM_IDS.MANAGED_SITE_MODEL_SYNC },
    summaryRows: [
      {
        id: SUMMARY_ROW_IDS.lastRun,
        value: formatTimestampValue(stats?.endedAt),
        valueType: SUMMARY_VALUE_TYPES.datetime,
      },
      { id: SUMMARY_ROW_IDS.success, value: String(stats?.successCount ?? 0) },
      { id: SUMMARY_ROW_IDS.failed, value: String(stats?.failureCount ?? 0) },
      { id: SUMMARY_ROW_IDS.skipped, value: String(stats?.skippedCount ?? 0) },
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
function buildWebdavAutoSyncAutomationItem(
  input: Pick<OptionsOverviewAutomationRunData, "webdavStatus"> & {
    preferences: UserPreferences | null | undefined
  },
): OptionsOverviewAutomationItem {
  const webdav = input.preferences?.webdav
  const selectedDomains = resolveWebdavSyncDataSelection(webdav?.syncData)
  const snapshot = input.webdavStatus

  return buildPreferenceAutomationItem({
    id: OPTIONS_OVERVIEW_AUTOMATION_ITEM_IDS.webdavAutoSync,
    enabled: input.preferences ? webdav?.autoSync === true : undefined,
    runStatus: resolveWebdavRunStatus(snapshot),
    primaryTarget: buildImportExportAnchorTarget(
      WEBDAV_AUTO_SYNC_TARGET_IDS.root,
    ),
    summaryRows: [
      {
        id: SUMMARY_ROW_IDS.lastRun,
        value: formatTimestampValue(snapshot?.lastSyncTime || undefined),
        valueType: SUMMARY_VALUE_TYPES.datetime,
      },
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
  enabled: boolean | undefined
  runStatus: OptionsOverviewAutomationItem["statusLabel"]
  primaryTarget: OptionsOverviewNavigationTarget
  summaryRows: OptionsOverviewAutomationItem["summaryRows"]
  actions: OptionsOverviewAutomationAction[]
}): OptionsOverviewAutomationItem {
  return {
    id: input.id,
    ...resolveAutomationState(input.enabled, input.runStatus),
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

/** Resolves announcement outcomes with failures taking precedence over support gaps. */
function resolveAnnouncementRunStatus(input: {
  dataAvailable: boolean | undefined
  failedStatusCount: number
  unsupportedStatusCount: number
  successCount: number
}): OptionsOverviewAutomationStatusLabel {
  if (input.dataAvailable === false) return STATUS_LABELS.unknown
  if (input.failedStatusCount > 0) {
    return input.successCount > 0 ? STATUS_LABELS.partial : STATUS_LABELS.failed
  }
  if (input.unsupportedStatusCount > 0) {
    return input.successCount > 0
      ? STATUS_LABELS.limited
      : STATUS_LABELS.unsupported
  }
  return input.successCount > 0 ? STATUS_LABELS.success : STATUS_LABELS.notRun
}

/** Distinguishes unavailable history, empty history, and a recorded no-op. */
function resolveModelSyncRunStatus(
  execution: OptionsOverviewAutomationRunData["modelSyncExecution"],
): OptionsOverviewAutomationStatusLabel {
  if (execution === undefined) return STATUS_LABELS.unknown
  const stats = execution?.statistics
  if (!stats) return STATUS_LABELS.notRun
  if (stats.failureCount > 0) {
    return stats.successCount > 0 ? STATUS_LABELS.partial : STATUS_LABELS.failed
  }
  return stats.successCount > 0 ? STATUS_LABELS.success : STATUS_LABELS.skipped
}

const webdavRunStatusLabels = {
  error: STATUS_LABELS.failed,
  success: STATUS_LABELS.success,
  idle: STATUS_LABELS.notRun,
} as const satisfies Record<
  NonNullable<
    OptionsOverviewAutomationRunData["webdavStatus"]
  >["lastSyncStatus"],
  OptionsOverviewAutomationStatusLabel
>

/** A running sync takes precedence over the previous persisted outcome. */
function resolveWebdavRunStatus(
  snapshot: OptionsOverviewAutomationRunData["webdavStatus"],
): OptionsOverviewAutomationStatusLabel {
  if (!snapshot) return STATUS_LABELS.unknown
  if (snapshot.isSyncing) return STATUS_LABELS.running
  return webdavRunStatusLabels[snapshot.lastSyncStatus] ?? STATUS_LABELS.notRun
}

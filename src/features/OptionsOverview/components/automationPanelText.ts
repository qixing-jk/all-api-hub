import type { TFunction } from "i18next"

import {
  OPTIONS_OVERVIEW_AUTOMATION_STATUS_LABELS as AUTOMATION_STATUS_LABELS,
  OPTIONS_OVERVIEW_AUTO_CHECKIN_ACTION_IDS,
  OPTIONS_OVERVIEW_AUTOMATION_ACTION_IDS,
  OPTIONS_OVERVIEW_AUTOMATION_ITEM_IDS,
  OPTIONS_OVERVIEW_AUTOMATION_SUMMARY_ROW_IDS as SUMMARY_ROW_IDS,
  OPTIONS_OVERVIEW_AUTOMATION_SUMMARY_VALUE_TYPES as SUMMARY_VALUE_TYPES,
} from "../ids"
import type { OptionsOverviewAutomationItem } from "../types"
import {
  getAutoCheckinActionLabel,
  getAutoCheckinStatusLabel,
} from "./autoCheckinPanelText"

type AutomationItemId = OptionsOverviewAutomationItem["id"]
type AutomationSummaryRowId =
  OptionsOverviewAutomationItem["summaryRows"][number]["id"]
type AutomationActionId = OptionsOverviewAutomationItem["actions"][number]["id"]
type AutomationStatusLabel = OptionsOverviewAutomationItem["statusLabel"]
type AutomationTextResolver = (t: TFunction) => string

const automationDisabledDescriptionResolvers = {
  [OPTIONS_OVERVIEW_AUTOMATION_ITEM_IDS.autoCheckin]: (t: TFunction) =>
    t("optionsOverview:automation.empty.autoCheckin.disabled"),
  [OPTIONS_OVERVIEW_AUTOMATION_ITEM_IDS.siteAnnouncements]: (t: TFunction) =>
    t("optionsOverview:automation.empty.siteAnnouncements.disabled"),
  [OPTIONS_OVERVIEW_AUTOMATION_ITEM_IDS.managedSiteModelSync]: (t: TFunction) =>
    t("optionsOverview:automation.empty.managedSiteModelSync.disabled"),
  [OPTIONS_OVERVIEW_AUTOMATION_ITEM_IDS.webdavAutoSync]: (t: TFunction) =>
    t("optionsOverview:automation.empty.webdavAutoSync.disabled"),
} as const satisfies Record<AutomationItemId, (t: TFunction) => string>

const automationItemLabelResolvers = {
  [OPTIONS_OVERVIEW_AUTOMATION_ITEM_IDS.autoCheckin]: (t: TFunction) =>
    t("optionsOverview:automation.items.autoCheckin.label"),
  [OPTIONS_OVERVIEW_AUTOMATION_ITEM_IDS.siteAnnouncements]: (t: TFunction) =>
    t("optionsOverview:automation.items.siteAnnouncements.label"),
  [OPTIONS_OVERVIEW_AUTOMATION_ITEM_IDS.managedSiteModelSync]: (t: TFunction) =>
    t("optionsOverview:automation.items.managedSiteModelSync.label"),
  [OPTIONS_OVERVIEW_AUTOMATION_ITEM_IDS.webdavAutoSync]: (t: TFunction) =>
    t("optionsOverview:automation.items.webdavAutoSync.label"),
} as const satisfies Record<AutomationItemId, (t: TFunction) => string>

const automationSummaryRowLabelResolvers: Record<
  AutomationItemId,
  Partial<Record<AutomationSummaryRowId, AutomationTextResolver>>
> = {
  [OPTIONS_OVERVIEW_AUTOMATION_ITEM_IDS.autoCheckin]: {
    [SUMMARY_ROW_IDS.lastRun]: (t: TFunction) =>
      t("optionsOverview:autoCheckin.lastRun"),
    [SUMMARY_ROW_IDS.nextRun]: (t: TFunction) =>
      t("optionsOverview:autoCheckin.nextRun"),
    [SUMMARY_ROW_IDS.nextRetry]: (t: TFunction) =>
      t("optionsOverview:autoCheckin.nextRetry"),
  },
  [OPTIONS_OVERVIEW_AUTOMATION_ITEM_IDS.siteAnnouncements]: {
    [SUMMARY_ROW_IDS.interval]: (t: TFunction) =>
      t("optionsOverview:automation.items.siteAnnouncements.interval"),
    [SUMMARY_ROW_IDS.records]: (t: TFunction) =>
      t("optionsOverview:automation.items.siteAnnouncements.records"),
    [SUMMARY_ROW_IDS.unread]: (t: TFunction) =>
      t("optionsOverview:automation.items.siteAnnouncements.unread"),
    [SUMMARY_ROW_IDS.lastChecked]: (t: TFunction) =>
      t("optionsOverview:automation.items.siteAnnouncements.lastChecked"),
  },
  [OPTIONS_OVERVIEW_AUTOMATION_ITEM_IDS.managedSiteModelSync]: {
    [SUMMARY_ROW_IDS.interval]: (t: TFunction) =>
      t("optionsOverview:automation.items.managedSiteModelSync.interval"),
    [SUMMARY_ROW_IDS.concurrency]: (t: TFunction) =>
      t("optionsOverview:automation.items.managedSiteModelSync.concurrency"),
    [SUMMARY_ROW_IDS.allowedModels]: (t: TFunction) =>
      t("optionsOverview:automation.items.managedSiteModelSync.allowedModels"),
  },
  [OPTIONS_OVERVIEW_AUTOMATION_ITEM_IDS.webdavAutoSync]: {
    [SUMMARY_ROW_IDS.interval]: (t: TFunction) =>
      t("optionsOverview:automation.items.webdavAutoSync.interval"),
    [SUMMARY_ROW_IDS.strategy]: (t: TFunction) =>
      t("optionsOverview:automation.items.webdavAutoSync.strategy"),
    [SUMMARY_ROW_IDS.domains]: (t: TFunction) =>
      t("optionsOverview:automation.items.webdavAutoSync.domains"),
  },
}

const automationActionLabelResolvers: Record<
  AutomationItemId,
  Partial<Record<AutomationActionId, AutomationTextResolver>>
> = {
  [OPTIONS_OVERVIEW_AUTOMATION_ITEM_IDS.autoCheckin]: {
    [OPTIONS_OVERVIEW_AUTO_CHECKIN_ACTION_IDS.openAutoCheckin]: (
      t: TFunction,
    ) =>
      getAutoCheckinActionLabel(
        OPTIONS_OVERVIEW_AUTO_CHECKIN_ACTION_IDS.openAutoCheckin,
        t,
      ),
    [OPTIONS_OVERVIEW_AUTO_CHECKIN_ACTION_IDS.retryFailed]: (t: TFunction) =>
      getAutoCheckinActionLabel(
        OPTIONS_OVERVIEW_AUTO_CHECKIN_ACTION_IDS.retryFailed,
        t,
      ),
  },
  [OPTIONS_OVERVIEW_AUTOMATION_ITEM_IDS.siteAnnouncements]: {
    [OPTIONS_OVERVIEW_AUTOMATION_ACTION_IDS.openAnnouncements]: (
      t: TFunction,
    ) => t("optionsOverview:automation.items.siteAnnouncements.openPage"),
    [OPTIONS_OVERVIEW_AUTOMATION_ACTION_IDS.openAnnouncementSettings]: (
      t: TFunction,
    ) => t("optionsOverview:automation.items.siteAnnouncements.openSettings"),
  },
  [OPTIONS_OVERVIEW_AUTOMATION_ITEM_IDS.managedSiteModelSync]: {
    [OPTIONS_OVERVIEW_AUTOMATION_ACTION_IDS.openManagedSiteModelSync]: (
      t: TFunction,
    ) => t("optionsOverview:automation.items.managedSiteModelSync.open"),
  },
  [OPTIONS_OVERVIEW_AUTOMATION_ITEM_IDS.webdavAutoSync]: {
    [OPTIONS_OVERVIEW_AUTOMATION_ACTION_IDS.openImportExport]: (t: TFunction) =>
      t("optionsOverview:automation.items.webdavAutoSync.open"),
  },
}

const automationStatusLabelResolvers = {
  [AUTOMATION_STATUS_LABELS.enabled]: (t: TFunction) =>
    t("optionsOverview:automation.status.enabled"),
  [AUTOMATION_STATUS_LABELS.disabled]: (t: TFunction) =>
    t("optionsOverview:coverageStatus.disabled"),
} as const satisfies Record<AutomationStatusLabel, AutomationTextResolver>

const automationSummaryFallbackResolvers: Record<
  AutomationItemId,
  Partial<Record<AutomationSummaryRowId, AutomationTextResolver>>
> = {
  [OPTIONS_OVERVIEW_AUTOMATION_ITEM_IDS.autoCheckin]: {
    [SUMMARY_ROW_IDS.lastRun]: (t: TFunction) =>
      t("optionsOverview:autoCheckin.notRunYet"),
    [SUMMARY_ROW_IDS.nextRun]: (t: TFunction) =>
      t("optionsOverview:autoCheckin.notScheduled"),
    [SUMMARY_ROW_IDS.nextRetry]: (t: TFunction) =>
      t("optionsOverview:autoCheckin.notScheduled"),
  },
  [OPTIONS_OVERVIEW_AUTOMATION_ITEM_IDS.siteAnnouncements]: {
    [SUMMARY_ROW_IDS.lastChecked]: (t: TFunction) =>
      t("optionsOverview:automation.neverChecked"),
  },
  [OPTIONS_OVERVIEW_AUTOMATION_ITEM_IDS.managedSiteModelSync]: {},
  [OPTIONS_OVERVIEW_AUTOMATION_ITEM_IDS.webdavAutoSync]: {},
}

/**
 * Explains disabled automation rows without treating them as failures.
 */
export function getAutomationDisabledDescription(
  itemId: AutomationItemId,
  t: TFunction,
) {
  return automationDisabledDescriptionResolvers[itemId](t)
}

/**
 * Formats summary row values without letting empty timestamps leak into the UI.
 */
export function formatSummaryValue(
  itemId: OptionsOverviewAutomationItem["id"],
  row: OptionsOverviewAutomationItem["summaryRows"][number],
  t: TFunction,
) {
  if (!row.value) {
    return getAutomationSummaryFallback(itemId, row.id, t)
  }

  if (row.valueType === SUMMARY_VALUE_TYPES.datetime) {
    return new Date(row.value).toLocaleString()
  }

  return row.value
}

/**
 * Resolves automation row labels from semantic automation ids.
 */
export function getAutomationItemLabel(id: AutomationItemId, t: TFunction) {
  return automationItemLabelResolvers[id](t)
}

/**
 * Resolves automation row status labels without dynamic translation keys.
 */
export function getAutomationStatusLabel(
  item: OptionsOverviewAutomationItem,
  t: TFunction,
) {
  if (
    item.id === OPTIONS_OVERVIEW_AUTOMATION_ITEM_IDS.autoCheckin &&
    item.autoCheckinPanel
  ) {
    return getAutoCheckinStatusLabel(item.autoCheckinPanel.status, t)
  }

  return automationStatusLabelResolvers[item.statusLabel](t)
}

/**
 * Resolves automation summary row labels from item and row ids.
 */
export function getAutomationSummaryRowLabel(
  itemId: AutomationItemId,
  rowId: AutomationSummaryRowId,
  t: TFunction,
) {
  return automationSummaryRowLabelResolvers[itemId][rowId]?.(t) ?? rowId
}

/**
 * Resolves empty-state fallbacks for automation summary rows.
 */
function getAutomationSummaryFallback(
  itemId: AutomationItemId,
  rowId: AutomationSummaryRowId,
  t: TFunction,
) {
  return automationSummaryFallbackResolvers[itemId][rowId]?.(t) ?? "-"
}

/**
 * Resolves automation action labels from item and action ids.
 */
export function getAutomationActionLabel(
  itemId: AutomationItemId,
  actionId: AutomationActionId,
  t: TFunction,
) {
  return automationActionLabelResolvers[itemId][actionId]?.(t) ?? actionId
}

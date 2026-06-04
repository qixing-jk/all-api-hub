import type { TFunction } from "i18next"

import {
  OPTIONS_OVERVIEW_CONFIGURATION_STATUSES as CONFIGURATION_STATUSES,
  OPTIONS_OVERVIEW_ACTION_CENTER_ITEM_IDS,
  OPTIONS_OVERVIEW_CONFIGURATION_SUB_ITEM_IDS,
} from "../ids"
import type {
  OptionsOverviewActionCenterItem,
  OptionsOverviewConfigurationSubItem,
} from "../types"

type ActionCenterItemId = OptionsOverviewActionCenterItem["id"]
type ConfigurationStatus = OptionsOverviewActionCenterItem["status"]
type ConfigurationSubItemId = OptionsOverviewConfigurationSubItem["id"]
type ActionCenterTextResolver = (t: TFunction) => string

const actionCenterTextResolvers = {
  [OPTIONS_OVERVIEW_ACTION_CENTER_ITEM_IDS.accountFoundation]: {
    label: (t: TFunction) =>
      t("optionsOverview:configurationOverview.accountFoundation.label"),
    description: (t: TFunction) =>
      t("optionsOverview:configurationOverview.accountFoundation.description"),
    state: {
      [CONFIGURATION_STATUSES.needsSetup]: (t: TFunction) =>
        t(
          "optionsOverview:configurationOverview.accountFoundation.state.needs_setup",
        ),
      [CONFIGURATION_STATUSES.disabled]: (t: TFunction) =>
        t(
          "optionsOverview:configurationOverview.accountFoundation.state.disabled",
        ),
      [CONFIGURATION_STATUSES.notApplicable]: (t: TFunction) =>
        t(
          "optionsOverview:configurationOverview.accountFoundation.state.not_applicable",
        ),
    },
  },
  [OPTIONS_OVERVIEW_ACTION_CENTER_ITEM_IDS.credentialAssets]: {
    label: (t: TFunction) =>
      t("optionsOverview:configurationOverview.credentialAssets.label"),
    description: (t: TFunction) =>
      t("optionsOverview:configurationOverview.credentialAssets.description"),
    state: {
      [CONFIGURATION_STATUSES.needsSetup]: (t: TFunction) =>
        t(
          "optionsOverview:configurationOverview.credentialAssets.state.needs_setup",
        ),
      [CONFIGURATION_STATUSES.disabled]: (t: TFunction) =>
        t(
          "optionsOverview:configurationOverview.credentialAssets.state.disabled",
        ),
      [CONFIGURATION_STATUSES.notApplicable]: (t: TFunction) =>
        t(
          "optionsOverview:configurationOverview.credentialAssets.state.not_applicable",
        ),
    },
  },
  [OPTIONS_OVERVIEW_ACTION_CENTER_ITEM_IDS.automation]: {
    label: (t: TFunction) =>
      t("optionsOverview:configurationOverview.automation.label"),
    description: (t: TFunction) =>
      t("optionsOverview:configurationOverview.automation.description"),
    state: {
      [CONFIGURATION_STATUSES.needsSetup]: (t: TFunction) =>
        t("optionsOverview:configurationOverview.automation.state.needs_setup"),
      [CONFIGURATION_STATUSES.disabled]: (t: TFunction) =>
        t("optionsOverview:configurationOverview.automation.state.disabled"),
      [CONFIGURATION_STATUSES.notApplicable]: (t: TFunction) =>
        t(
          "optionsOverview:configurationOverview.automation.state.not_applicable",
        ),
    },
  },
  [OPTIONS_OVERVIEW_ACTION_CENTER_ITEM_IDS.dataHistory]: {
    label: (t: TFunction) =>
      t("optionsOverview:configurationOverview.dataHistory.label"),
    description: (t: TFunction) =>
      t("optionsOverview:configurationOverview.dataHistory.description"),
    state: {
      [CONFIGURATION_STATUSES.needsSetup]: (t: TFunction) =>
        t(
          "optionsOverview:configurationOverview.dataHistory.state.needs_setup",
        ),
      [CONFIGURATION_STATUSES.disabled]: (t: TFunction) =>
        t("optionsOverview:configurationOverview.dataHistory.state.disabled"),
      [CONFIGURATION_STATUSES.notApplicable]: (t: TFunction) =>
        t(
          "optionsOverview:configurationOverview.dataHistory.state.not_applicable",
        ),
    },
  },
  [OPTIONS_OVERVIEW_ACTION_CENTER_ITEM_IDS.backupSync]: {
    label: (t: TFunction) =>
      t("optionsOverview:configurationOverview.backupSync.label"),
    description: (t: TFunction) =>
      t("optionsOverview:configurationOverview.backupSync.description"),
    state: {
      [CONFIGURATION_STATUSES.needsSetup]: (t: TFunction) =>
        t("optionsOverview:configurationOverview.backupSync.state.needs_setup"),
      [CONFIGURATION_STATUSES.disabled]: (t: TFunction) =>
        t("optionsOverview:configurationOverview.backupSync.state.disabled"),
      [CONFIGURATION_STATUSES.notApplicable]: (t: TFunction) =>
        t(
          "optionsOverview:configurationOverview.backupSync.state.not_applicable",
        ),
    },
  },
  [OPTIONS_OVERVIEW_ACTION_CENTER_ITEM_IDS.managedSite]: {
    label: (t: TFunction) =>
      t("optionsOverview:configurationOverview.managedSite.label"),
    description: (t: TFunction) =>
      t("optionsOverview:configurationOverview.managedSite.description"),
    state: {
      [CONFIGURATION_STATUSES.needsSetup]: (t: TFunction) =>
        t(
          "optionsOverview:configurationOverview.managedSite.state.needs_setup",
        ),
      [CONFIGURATION_STATUSES.disabled]: (t: TFunction) =>
        t("optionsOverview:configurationOverview.managedSite.state.disabled"),
      [CONFIGURATION_STATUSES.notApplicable]: (t: TFunction) =>
        t(
          "optionsOverview:configurationOverview.managedSite.state.not_applicable",
        ),
    },
  },
} as const satisfies Record<
  ActionCenterItemId,
  {
    label: (t: TFunction) => string
    description: (t: TFunction) => string
    state: Record<
      Exclude<ConfigurationStatus, typeof CONFIGURATION_STATUSES.configured>,
      (t: TFunction) => string
    >
  }
>

const configurationSubItemLabelResolvers = {
  [OPTIONS_OVERVIEW_CONFIGURATION_SUB_ITEM_IDS.accounts]: (t: TFunction) =>
    t("optionsOverview:configurationOverview.subItems.accounts"),
  [OPTIONS_OVERVIEW_CONFIGURATION_SUB_ITEM_IDS.apiProfiles]: (t: TFunction) =>
    t("optionsOverview:configurationOverview.subItems.apiProfiles"),
  [OPTIONS_OVERVIEW_CONFIGURATION_SUB_ITEM_IDS.apiKeys]: (t: TFunction) =>
    t("optionsOverview:configurationOverview.subItems.apiKeys"),
  [OPTIONS_OVERVIEW_CONFIGURATION_SUB_ITEM_IDS.autoCheckin]: (t: TFunction) =>
    t("optionsOverview:configurationOverview.subItems.autoCheckin"),
  [OPTIONS_OVERVIEW_CONFIGURATION_SUB_ITEM_IDS.siteAnnouncements]: (
    t: TFunction,
  ) => t("optionsOverview:configurationOverview.subItems.siteAnnouncements"),
  [OPTIONS_OVERVIEW_CONFIGURATION_SUB_ITEM_IDS.usageAnalytics]: (
    t: TFunction,
  ) => t("optionsOverview:configurationOverview.subItems.usageAnalytics"),
  [OPTIONS_OVERVIEW_CONFIGURATION_SUB_ITEM_IDS.balanceHistory]: (
    t: TFunction,
  ) => t("optionsOverview:configurationOverview.subItems.balanceHistory"),
  [OPTIONS_OVERVIEW_CONFIGURATION_SUB_ITEM_IDS.webdavManual]: (t: TFunction) =>
    t("optionsOverview:configurationOverview.subItems.webdavManual"),
  [OPTIONS_OVERVIEW_CONFIGURATION_SUB_ITEM_IDS.webdavAutoSync]: (
    t: TFunction,
  ) => t("optionsOverview:configurationOverview.subItems.webdavAutoSync"),
  [OPTIONS_OVERVIEW_CONFIGURATION_SUB_ITEM_IDS.managedSiteChannels]: (
    t: TFunction,
  ) => t("optionsOverview:configurationOverview.subItems.managedSiteChannels"),
  [OPTIONS_OVERVIEW_CONFIGURATION_SUB_ITEM_IDS.managedSiteModelSync]: (
    t: TFunction,
  ) => t("optionsOverview:configurationOverview.subItems.managedSiteModelSync"),
} as const satisfies Record<ConfigurationSubItemId, (t: TFunction) => string>

const actionCenterStatusLabelResolvers = {
  [CONFIGURATION_STATUSES.configured]: (t: TFunction) =>
    t("optionsOverview:coverageStatus.configured"),
  [CONFIGURATION_STATUSES.disabled]: (t: TFunction) =>
    t("optionsOverview:coverageStatus.disabled"),
  [CONFIGURATION_STATUSES.needsSetup]: (t: TFunction) =>
    t("optionsOverview:coverageStatus.needs_setup"),
  [CONFIGURATION_STATUSES.notApplicable]: (t: TFunction) =>
    t("optionsOverview:coverageStatus.not_applicable"),
} as const satisfies Record<ConfigurationStatus, ActionCenterTextResolver>

/**
 * Resolves action-center card labels from semantic item ids.
 */
export function getActionCenterLabel(id: ActionCenterItemId, t: TFunction) {
  return actionCenterTextResolvers[id].label(t)
}

/**
 * Resolves action-center card descriptions from semantic item ids.
 */
export function getActionCenterDescription(
  id: ActionCenterItemId,
  t: TFunction,
) {
  return actionCenterTextResolvers[id].description(t)
}

/**
 * Explains non-ready configuration states without changing the card hierarchy.
 */
export function getActionCenterStateDescription(
  item: OptionsOverviewActionCenterItem,
  t: TFunction,
) {
  if (item.status === CONFIGURATION_STATUSES.configured) {
    return ""
  }

  return actionCenterTextResolvers[item.id].state[item.status](t)
}

/**
 * Resolves labels for nested capability entrypoints.
 */
export function getConfigurationSubItemLabel(
  id: ConfigurationSubItemId,
  t: TFunction,
) {
  return configurationSubItemLabelResolvers[id](t)
}

/**
 * Resolves setup coverage status labels from normalized status values.
 */
export function getActionCenterStatusLabel(
  status: OptionsOverviewActionCenterItem["status"],
  t: TFunction,
) {
  return actionCenterStatusLabelResolvers[status](t)
}

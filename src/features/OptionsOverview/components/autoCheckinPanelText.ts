import type { TFunction } from "i18next"

import {
  OPTIONS_OVERVIEW_AUTO_CHECKIN_PANEL_STATUSES as AUTO_CHECKIN_PANEL_STATUSES,
  OPTIONS_OVERVIEW_AUTO_CHECKIN_ACTION_IDS,
} from "../ids"
import type { OptionsOverviewAutoCheckinPanel } from "../types"

type AutoCheckinPanelStatus = OptionsOverviewAutoCheckinPanel["status"]
type AutoCheckinActionId =
  OptionsOverviewAutoCheckinPanel["actions"][number]["id"]
type AutoCheckinTextResolver = (t: TFunction) => string

const autoCheckinStatusLabelResolvers = {
  [AUTO_CHECKIN_PANEL_STATUSES.ready]: (t: TFunction) =>
    t("optionsOverview:autoCheckin.status.ready"),
  [AUTO_CHECKIN_PANEL_STATUSES.success]: (t: TFunction) =>
    t("optionsOverview:autoCheckin.status.success"),
  [AUTO_CHECKIN_PANEL_STATUSES.partial]: (t: TFunction) =>
    t("optionsOverview:autoCheckin.status.partial"),
  [AUTO_CHECKIN_PANEL_STATUSES.failed]: (t: TFunction) =>
    t("optionsOverview:autoCheckin.status.failed"),
  [AUTO_CHECKIN_PANEL_STATUSES.disabled]: (t: TFunction) =>
    t("optionsOverview:autoCheckin.status.disabled"),
  [AUTO_CHECKIN_PANEL_STATUSES.notRun]: (t: TFunction) =>
    t("optionsOverview:autoCheckin.status.not_run"),
} as const satisfies Record<AutoCheckinPanelStatus, AutoCheckinTextResolver>

const autoCheckinEmptyDescriptionResolvers: Partial<
  Record<AutoCheckinPanelStatus, AutoCheckinTextResolver>
> = {
  [AUTO_CHECKIN_PANEL_STATUSES.disabled]: (t: TFunction) =>
    t("optionsOverview:autoCheckin.empty.disabled.description"),
  [AUTO_CHECKIN_PANEL_STATUSES.notRun]: (t: TFunction) =>
    t("optionsOverview:autoCheckin.empty.notRun.description"),
}

const autoCheckinActionLabelResolvers = {
  [OPTIONS_OVERVIEW_AUTO_CHECKIN_ACTION_IDS.openAutoCheckin]: (t: TFunction) =>
    t("optionsOverview:autoCheckin.actions.open"),
  [OPTIONS_OVERVIEW_AUTO_CHECKIN_ACTION_IDS.retryFailed]: (t: TFunction) =>
    t("optionsOverview:autoCheckin.actions.retryFailed"),
} as const satisfies Record<AutoCheckinActionId, AutoCheckinTextResolver>

/**
 * Resolves auto check-in run status labels from normalized panel status.
 */
export function getAutoCheckinStatusLabel(
  status: AutoCheckinPanelStatus,
  t: TFunction,
) {
  return autoCheckinStatusLabelResolvers[status](t)
}

/**
 * Explains why auto check-in has no execution data yet.
 */
export function getAutoCheckinEmptyDescription(
  status: AutoCheckinPanelStatus,
  t: TFunction,
) {
  return autoCheckinEmptyDescriptionResolvers[status]?.(t) ?? ""
}

/**
 * Resolves auto check-in action labels from semantic action ids.
 */
export function getAutoCheckinActionLabel(
  id: AutoCheckinActionId,
  t: TFunction,
) {
  return autoCheckinActionLabelResolvers[id](t)
}

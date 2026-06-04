import type { TFunction } from "i18next"

import { OPTIONS_OVERVIEW_STATUS_CARD_IDS } from "../ids"
import type { OptionsOverviewStatusCard } from "../types"

type StatusCardId = OptionsOverviewStatusCard["id"]
type StatusCardTextResolver = (t: TFunction) => string

const statusCardLabelResolvers = {
  [OPTIONS_OVERVIEW_STATUS_CARD_IDS.accounts]: (t: TFunction) =>
    t("optionsOverview:status.accounts.label"),
  [OPTIONS_OVERVIEW_STATUS_CARD_IDS.profiles]: (t: TFunction) =>
    t("optionsOverview:status.profiles.label"),
  [OPTIONS_OVERVIEW_STATUS_CARD_IDS.todayUsage]: (t: TFunction) =>
    t("optionsOverview:status.todayUsage.label"),
  [OPTIONS_OVERVIEW_STATUS_CARD_IDS.attention]: (t: TFunction) =>
    t("optionsOverview:status.attention.label"),
} as const satisfies Record<StatusCardId, StatusCardTextResolver>

const statusCardDescriptionResolvers = {
  [OPTIONS_OVERVIEW_STATUS_CARD_IDS.accounts]: (t: TFunction) =>
    t("optionsOverview:status.accounts.description"),
  [OPTIONS_OVERVIEW_STATUS_CARD_IDS.profiles]: (t: TFunction) =>
    t("optionsOverview:status.profiles.description"),
  [OPTIONS_OVERVIEW_STATUS_CARD_IDS.todayUsage]: (t: TFunction) =>
    t("optionsOverview:status.todayUsage.description"),
  [OPTIONS_OVERVIEW_STATUS_CARD_IDS.attention]: (t: TFunction) =>
    t("optionsOverview:status.attention.description"),
} as const satisfies Record<StatusCardId, StatusCardTextResolver>

/**
 * Resolves status-card labels from semantic card ids.
 */
export function getStatusCardLabel(id: StatusCardId, t: TFunction) {
  return statusCardLabelResolvers[id](t)
}

/**
 * Resolves status-card descriptions from semantic card ids.
 */
export function getStatusCardDescription(id: StatusCardId, t: TFunction) {
  return statusCardDescriptionResolvers[id](t)
}

import type { TFunction } from "i18next"

import { OPTIONS_OVERVIEW_WIDGET_IDS } from "../ids"
import type { OptionsOverviewWidgetId } from "../types"

type GridTextResolver = (t: TFunction) => string

const sectionTitleResolvers = {
  [OPTIONS_OVERVIEW_WIDGET_IDS.statusSummary]: (t: TFunction) =>
    t("optionsOverview:sections.statusSummary"),
  [OPTIONS_OVERVIEW_WIDGET_IDS.needsAttention]: (t: TFunction) =>
    t("optionsOverview:sections.needsAttention"),
  [OPTIONS_OVERVIEW_WIDGET_IDS.automationOverview]: (t: TFunction) =>
    t("optionsOverview:sections.automationOverview"),
  [OPTIONS_OVERVIEW_WIDGET_IDS.recentUsage]: (t: TFunction) =>
    t("optionsOverview:sections.recentUsage"),
  [OPTIONS_OVERVIEW_WIDGET_IDS.actionCenter]: (t: TFunction) =>
    t("optionsOverview:sections.configurationOverview"),
} as const satisfies Record<OptionsOverviewWidgetId, GridTextResolver>

/**
 * Resolves static section headings from stable widget ids.
 */
export function getOverviewSectionTitle(
  id: OptionsOverviewWidgetId,
  t: TFunction,
) {
  return sectionTitleResolvers[id](t)
}

import { MENU_ITEM_IDS } from "~/constants/optionsMenuIds"
import type { AccountMetricCoverage } from "~/types"
import { getTodayMetricPresentation } from "~/utils/core/formatters"

import { OPTIONS_OVERVIEW_STATUS_CARD_IDS } from "./ids"
import { buildAccountNavigationTarget } from "./navigationTargets"
import type { OptionsOverviewStatusCard } from "./types"

/**
 * Creates the top-row aggregate cards shown above the overview widgets.
 */
export function buildStatusCards(input: {
  enabledAccountCount: number
  profileCount: number
  attentionCount: number
  todayRequests: number
  todayRequestsCoverage: AccountMetricCoverage
}): OptionsOverviewStatusCard[] {
  const todayRequestsPresentation = getTodayMetricPresentation(
    input.todayRequests,
    input.todayRequestsCoverage,
  )
  return [
    {
      id: OPTIONS_OVERVIEW_STATUS_CARD_IDS.accounts,
      value: String(input.enabledAccountCount),
      severity: input.enabledAccountCount > 0 ? "success" : "warning",
      target: buildAccountNavigationTarget(),
    },
    {
      id: OPTIONS_OVERVIEW_STATUS_CARD_IDS.profiles,
      value: String(input.profileCount),
      severity: input.profileCount > 0 ? "success" : "info",
      target: { menuItemId: MENU_ITEM_IDS.API_CREDENTIAL_PROFILES },
    },
    {
      id: OPTIONS_OVERVIEW_STATUS_CARD_IDS.todayUsage,
      value:
        todayRequestsPresentation.value === null
          ? "—"
          : String(todayRequestsPresentation.value),
      severity:
        todayRequestsPresentation.value !== null && input.todayRequests > 0
          ? "success"
          : "info",
      coverage: input.todayRequestsCoverage,
      target: { menuItemId: MENU_ITEM_IDS.USAGE_ANALYTICS },
    },
    {
      id: OPTIONS_OVERVIEW_STATUS_CARD_IDS.attention,
      value: String(input.attentionCount),
      severity: input.attentionCount > 0 ? "warning" : "success",
    },
  ]
}

import { MENU_ITEM_IDS } from "~/constants/optionsMenuIds"
import { OPTIONS_OVERVIEW_STATUS_CARD_IDS } from "~/features/OptionsOverview/ids"
import { buildAccountNavigationTarget } from "~/features/OptionsOverview/navigationTargets"
import type { OptionsOverviewStatusCard } from "~/features/OptionsOverview/types"
import type { AccountMetricCoverage } from "~/types"
import { getTodayMetricPresentation } from "~/utils/core/formatters"

/**
 * Creates the top-row aggregate cards shown above the overview widgets.
 */
export function buildStatusCards(input: {
  enabledAccountCount: number
  profileCount: number
  attentionCount: number
  todayRequests: number
  todayRequestsCoverage: AccountMetricCoverage
  accountsDataAvailable?: boolean
  profilesDataAvailable?: boolean
}): OptionsOverviewStatusCard[] {
  const accountsDataAvailable = input.accountsDataAvailable !== false
  const profilesDataAvailable = input.profilesDataAvailable !== false
  const todayRequestsPresentation = getTodayMetricPresentation(
    input.todayRequests,
    input.todayRequestsCoverage,
  )

  return [
    {
      id: OPTIONS_OVERVIEW_STATUS_CARD_IDS.accounts,
      value: accountsDataAvailable ? String(input.enabledAccountCount) : "-",
      severity: accountsDataAvailable
        ? input.enabledAccountCount > 0
          ? "success"
          : "warning"
        : "info",
      target: buildAccountNavigationTarget(),
    },
    {
      id: OPTIONS_OVERVIEW_STATUS_CARD_IDS.profiles,
      value: profilesDataAvailable ? String(input.profileCount) : "-",
      severity:
        profilesDataAvailable && input.profileCount > 0 ? "success" : "info",
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

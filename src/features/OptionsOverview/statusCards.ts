import { MENU_ITEM_IDS } from "~/constants/optionsMenuIds"

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
}): OptionsOverviewStatusCard[] {
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
      value: String(input.todayRequests),
      severity: input.todayRequests > 0 ? "success" : "info",
      target: { menuItemId: MENU_ITEM_IDS.USAGE_ANALYTICS },
    },
    {
      id: OPTIONS_OVERVIEW_STATUS_CARD_IDS.attention,
      value: String(input.attentionCount),
      severity: input.attentionCount > 0 ? "warning" : "success",
    },
  ]
}

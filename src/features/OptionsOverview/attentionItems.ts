import { MENU_ITEM_IDS } from "~/constants/optionsMenuIds"
import { SiteHealthStatus, type DisplaySiteData } from "~/types"

import { OPTIONS_OVERVIEW_ATTENTION_KINDS } from "./ids"
import { buildAccountNavigationTarget } from "./navigationTargets"
import type {
  OptionsOverviewAttentionItem,
  OptionsOverviewSeverity,
} from "./types"

const SEVERITY_ORDER: Record<
  Exclude<OptionsOverviewSeverity, "success">,
  number
> = {
  error: 0,
  warning: 1,
  info: 2,
}

/**
 * Creates actionable setup and health items ordered by user impact.
 */
export function buildAttentionItems(input: {
  enabledAccountCount: number
  profileCount: number
  problemAccounts: DisplaySiteData[]
}): OptionsOverviewAttentionItem[] {
  const items: OptionsOverviewAttentionItem[] = input.problemAccounts.map(
    (account) => ({
      id: `account:${account.id}:${account.health.status}`,
      kind: OPTIONS_OVERVIEW_ATTENTION_KINDS.accountUnhealthy,
      severity:
        account.health.status === SiteHealthStatus.Error ? "error" : "warning",
      titleOptions: { name: account.name },
      descriptionOptions: { reason: account.health.reason },
      target: buildAccountNavigationTarget(account.id),
    }),
  )

  if (input.enabledAccountCount === 0) {
    items.push({
      id: "setup:add-account",
      kind: OPTIONS_OVERVIEW_ATTENTION_KINDS.addAccount,
      severity: "info",
      target: buildAccountNavigationTarget(),
    })
  }

  if (input.profileCount === 0) {
    items.push({
      id: "setup:add-profile",
      kind: OPTIONS_OVERVIEW_ATTENTION_KINDS.addProfile,
      severity: "info",
      target: { menuItemId: MENU_ITEM_IDS.API_CREDENTIAL_PROFILES },
    })
  }

  return items.sort((left, right) => {
    const severityDiff =
      SEVERITY_ORDER[left.severity] - SEVERITY_ORDER[right.severity]
    if (severityDiff !== 0) return severityDiff
    return left.id.localeCompare(right.id)
  })
}

import { getAccountSiteProductProfile } from "~/services/accounts/accountSiteProfile"
import { normalizeAccountTodayStatsAvailability } from "~/services/accounts/accountTodayStats"
import type { AccountTodayStatsAvailability, SiteAccount } from "~/types"

/**
 * Resolve persisted metric coverage against the product profile fallback.
 *
 * Kept outside accountTodayStats.ts because account site definitions use that
 * lower-level module while product profiles depend on those definitions.
 */
export const resolveAccountTodayStatsAvailability = (
  account: Pick<SiteAccount, "site_type" | "account_info">,
): AccountTodayStatsAvailability => {
  const profile = getAccountSiteProductProfile(account.site_type)
  return normalizeAccountTodayStatsAvailability(
    account.account_info.todayStatsAvailability,
    profile.metrics.legacyTodayStatsAvailability,
  )
}

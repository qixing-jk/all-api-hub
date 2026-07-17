import { UI_CONSTANTS } from "~/constants/ui"
import type { DisplaySiteData } from "~/types"

/** Resolves the CNY-per-USD rate for an account, with the UI fallback. */
export function resolveAccountExchangeRate(account?: DisplaySiteData): number {
  return account && account.balance?.USD > 0
    ? account.balance.CNY / account.balance.USD
    : UI_CONSTANTS.EXCHANGE_RATE.DEFAULT
}

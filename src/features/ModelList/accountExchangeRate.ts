import { DEFAULT_USD_TO_CNY_RATE } from "~/constants/money"
import type { DisplaySiteData } from "~/types"

/** Returns an evidenced recharge conversion, even when the balance is empty. */
export function resolveKnownAccountExchangeRate(
  account?: DisplaySiteData,
): number | undefined {
  const rate =
    account?.exchangeRate ??
    (account?.balance && account.balance.USD !== 0
      ? account.balance.CNY / account.balance.USD
      : undefined)
  return rate !== undefined && Number.isFinite(rate) && rate > 0
    ? rate
    : undefined
}

/** Resolves the CNY-per-USD rate for display, with the UI fallback. */
export function resolveAccountExchangeRate(account?: DisplaySiteData): number {
  return resolveKnownAccountExchangeRate(account) ?? DEFAULT_USD_TO_CNY_RATE
}

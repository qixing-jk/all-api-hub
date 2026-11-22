import { CURRENCIES, isSupportedCurrency } from "~/constants/money"
import type { getDisplayBalancePortfolio } from "~/services/accounts/metrics/balanceProjection"
import { assetIdentity, type Asset } from "~/services/amounts/assets"
import { ASSET_KINDS } from "~/services/amounts/financialConstants"
import type { CurrencyType } from "~/types"

type PortfolioAmounts = Pick<
  ReturnType<typeof getDisplayBalancePortfolio>,
  "amounts" | "convertedCurrencyTotals"
>

/** Choose the overview's primary amount without changing the native asset breakdown. */
export function getBalancePortfolioPresentation(
  portfolio: PortfolioAmounts,
  displayCurrency: CurrencyType | undefined,
  allowCurrencyToggle: boolean,
) {
  const rank = (asset: Asset) =>
    asset.kind === ASSET_KINDS.Currency
      ? asset.code === CURRENCIES.USD
        ? 0
        : 1
      : 2
  const amounts = [...portfolio.amounts].sort(
    (a, b) =>
      rank(a.asset) - rank(b.asset) ||
      assetIdentity(a.asset).localeCompare(assetIdentity(b.asset)),
  )
  const primary = amounts[0]
  const convertedValue = displayCurrency
    ? portfolio.convertedCurrencyTotals[displayCurrency]
    : undefined
  const useConvertedPrimary =
    primary?.asset.kind === ASSET_KINDS.Currency &&
    isSupportedCurrency(primary.asset.code) &&
    amounts.some(
      ({ asset }) =>
        asset.kind === ASSET_KINDS.Currency &&
        isSupportedCurrency(asset.code) &&
        asset.code !== displayCurrency,
    ) &&
    displayCurrency !== undefined &&
    convertedValue !== undefined
  const primaryAmount: PortfolioAmounts["amounts"][number] | undefined =
    useConvertedPrimary &&
    displayCurrency !== undefined &&
    convertedValue !== undefined
      ? {
          asset: { kind: ASSET_KINDS.Currency, code: displayCurrency },
          value: convertedValue,
        }
      : primary
  const hasAdditionalAssetGroups =
    amounts.length > 1 &&
    (!useConvertedPrimary ||
      amounts.some(
        ({ asset }) =>
          asset.kind !== ASSET_KINDS.Currency ||
          !isSupportedCurrency(asset.code),
      ))
  const canToggleCurrency =
    allowCurrencyToggle &&
    primary?.asset.kind === ASSET_KINDS.Currency &&
    isSupportedCurrency(primary.asset.code)
  return {
    amounts,
    primary,
    primaryAmount,
    useConvertedPrimary,
    hasAdditionalAssetGroups,
    canToggleCurrency,
  }
}

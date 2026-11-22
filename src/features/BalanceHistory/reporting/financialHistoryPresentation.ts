import type { TFunction } from "i18next"

import type { Asset } from "~/services/amounts/assets"
import { normalizeDecimalUnits } from "~/services/amounts/decimal"
import {
  ASSET_KINDS,
  OBSERVATION_STATUSES,
} from "~/services/amounts/financialConstants"
import {
  FINANCIAL_HISTORY_LIFECYCLE_STATUSES,
  type FinancialHistoryObservation,
  type FinancialHistorySeries,
} from "~/services/history/dailyBalanceHistory/selectors"
import { getBalanceRoleLabel } from "~/utils/core/balancePresentation"
import { formatAllowanceLabel } from "~/utils/core/budgetPresentation"
import { formatExactDecimal } from "~/utils/core/decimalFormatting"
import { getAssetDisplayValue, getAssetLabel } from "~/utils/core/money"

/** Format recorded values in the asset's own units in the overview and trend. */
export function getFinancialHistoryPresentation(
  series: FinancialHistorySeries[],
  t: TFunction<"balanceHistory">,
  locale: string,
) {
  const unitLabel = (asset: Asset) =>
    asset.kind === ASSET_KINDS.Quota
      ? normalizeDecimalUnits("1", asset.displayScale) === undefined
        ? asset.label
        : asset.displayLabel
      : getAssetLabel(asset, t("native.unknownAsset"))
  const displayValue = (asset: Asset, value: string) =>
    asset.kind === ASSET_KINDS.Unknown
      ? value
      : getAssetDisplayValue({ asset, value })
  const displayAmount = (asset: Asset, value: string) =>
    `${formatExactDecimal(displayValue(asset, value), locale)} ${unitLabel(asset)}`
  const balanceLabel = (item: FinancialHistorySeries) =>
    item.allowance
      ? formatAllowanceLabel(item.allowance, t)
      : (item.position.label ?? getBalanceRoleLabel(item.position, t))
  const metricLabel = (item: FinancialHistorySeries) =>
    `${balanceLabel(item)} · ${unitLabel(item.position.asset)}`
  const seriesByLabel = new Map<string, FinancialHistorySeries[]>()
  const labelKey = (item: FinancialHistorySeries, label: string) =>
    JSON.stringify([item.accountId, label])
  for (const item of series) {
    const key = labelKey(item, metricLabel(item))
    const group = seriesByLabel.get(key) ?? []
    group.push(item)
    seriesByLabel.set(key, group)
  }
  const optionLabel = (item: FinancialHistorySeries, includeUnit = true) => {
    const metric = metricLabel(item)
    const label = includeUnit ? metric : balanceLabel(item)
    const duplicates = seriesByLabel.get(labelKey(item, metric))
    if (!duplicates || duplicates.length < 2) return label
    const sourceLabel = (other: FinancialHistorySeries) => {
      const source = other.position.amount.source
      if (source.adapter === "kimi" || source.adapter === "kimi-global") {
        if (
          source.operation === "console" ||
          source.operation === "console/account"
        )
          return t("native.sources.console")
        if (
          source.operation === "inference" ||
          source.operation === "inference/balance"
        )
          return t("native.sources.inference")
      }
      return undefined
    }
    const source = sourceLabel(item)
    const sameSource = duplicates.filter(
      (other) => sourceLabel(other) === source,
    )
    const ordinal =
      !source || sameSource.length > 1
        ? t("native.sources.numbered", {
            number:
              [...sameSource]
                .sort((a, b) => a.key.localeCompare(b.key))
                .findIndex((other) => other.key === item.key) + 1,
          })
        : undefined
    return [label, source, ordinal].filter(Boolean).join(" · ")
  }
  const statusLabel = (status: FinancialHistoryObservation["status"]) =>
    ({
      [OBSERVATION_STATUSES.Known]: t("account:financial.observed"),
      [OBSERVATION_STATUSES.Stale]: t("account:financial.lastKnown"),
      [OBSERVATION_STATUSES.Unknown]: t("native.unknown"),
      [OBSERVATION_STATUSES.Unavailable]: t("account:financial.unavailable"),
      [OBSERVATION_STATUSES.Unsupported]: t("native.unsupported"),
      [FINANCIAL_HISTORY_LIFECYCLE_STATUSES.Ended]: t("native.ended"),
      [FINANCIAL_HISTORY_LIFECYCLE_STATUSES.Expired]: t("native.expired"),
      [FINANCIAL_HISTORY_LIFECYCLE_STATUSES.Reset]: t("native.reset"),
    })[status]
  return {
    metricLabel,
    optionLabel,
    statusLabel,
    unitLabel,
    displayValue,
    displayAmount,
  }
}

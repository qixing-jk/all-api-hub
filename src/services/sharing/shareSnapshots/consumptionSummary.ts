import {
  ACCOUNT_CASHFLOW_METRICS,
  type AccountCashflowMetric,
} from "~/constants/accountUsage"
import { CURRENCIES } from "~/constants/money"
import {
  getSiteDayReadings,
  type SiteDayReading,
} from "~/services/accounts/metrics/accountTodayStats"
import {
  displayCashflowAmount,
  selectDisplayCashflowGroups,
  type ConsumptionProjection,
  type ReferenceCashflow,
} from "~/services/accounts/metrics/consumptionProjection"
import { assetIdentity } from "~/services/amounts/assets"
import { isKnownOrStaleObservation } from "~/services/amounts/balance"
import { subtractDecimal } from "~/services/amounts/decimal"
import {
  ASSET_KINDS,
  FINANCIAL_COVERAGE,
} from "~/services/amounts/financialConstants"
import type { AccountUsageSummary, CurrencyType } from "~/types"
import { ACCOUNT_TODAY_METRIC_STATUSES } from "~/types/accountTodayStats"
import { formatBalanceWindow } from "~/utils/core/balancePresentation"
import { convertCurrencyAmount, formatAssetAmount } from "~/utils/core/money"
import { t } from "~/utils/i18n/core"

import { publicShareAsset } from "./balanceSummary"

/** Provider-day readings remain separate from local-day arithmetic and omit account and source identities. */
export function publicSiteDayUsage(
  observations: readonly (
    AccountUsageSummary | (SiteDayReading & { exchangeRate?: number })
  )[],
  currencyType?: CurrencyType,
  exchangeRate?: number,
) {
  return observations.flatMap((input) => {
    const reading =
      "usage" in input ? input : getSiteDayReadings({ usage: input })[0]
    if (!reading) return []
    const { usage, observedAt, lastKnown } = reading
    const cost = usage.cost
    const amount = cost?.amount
    const known = isKnownOrStaleObservation(amount)
    const requests =
      typeof usage.totalRequests === "number" &&
      Number.isFinite(usage.totalRequests) &&
      usage.totalRequests >= 0
        ? usage.totalRequests
        : undefined
    const tokens =
      typeof usage.totalTokens === "number" &&
      Number.isFinite(usage.totalTokens) &&
      usage.totalTokens >= 0
        ? usage.totalTokens
        : undefined
    const value =
      known && cost && cost.asset.kind !== ASSET_KINDS.Unknown
        ? { asset: publicShareAsset(cost.asset), value: amount.value }
        : undefined
    const displayed = value
      ? convertCurrencyAmount(
          value,
          currencyType,
          "exchangeRate" in input ? input.exchangeRate : exchangeRate,
        )
      : undefined
    const converted =
      displayed &&
      value &&
      assetIdentity(displayed.asset) !== assetIdentity(value.asset)
        ? displayed
        : undefined
    return !value && requests === undefined && tokens === undefined
      ? []
      : [
          {
            ...(value ? { cost: value } : {}),
            ...(converted ? { displayCost: converted } : {}),
            ...(value && cost?.coverage === FINANCIAL_COVERAGE.Partial
              ? { costCoverage: FINANCIAL_COVERAGE.Partial }
              : {}),
            ...(requests === undefined ? {} : { requests }),
            ...(tokens === undefined ? {} : { tokens }),
            ...(observedAt === undefined ? {} : { observedAt }),
            lastKnown,
            ...(usage.reportedDay ? { reportedDay: usage.reportedDay } : {}),
            ...(cost?.window ? { window: { ...cost.window } } : {}),
          },
        ]
  })
}

/** Keep provider-day figures identifiable in captions and image exports without merging their periods. */
export function siteDayUsageValues(
  usage: ReturnType<typeof publicSiteDayUsage>[number],
  locale?: string,
): string[] {
  return [
    usage.cost
      ? formatAssetAmount(usage.displayCost ?? usage.cost, locale)
      : undefined,
    usage.costCoverage === FINANCIAL_COVERAGE.Partial
      ? t("account:todayMetricAvailability.partial")
      : undefined,
    usage.requests === undefined
      ? undefined
      : `${usage.requests} ${t("usageAnalytics:summary.requests")}`,
    usage.tokens === undefined
      ? undefined
      : `${usage.tokens} ${t("usageAnalytics:summary.totalTokens")}`,
  ].filter((value): value is string => value !== undefined)
}

/** The full caption retains every reading and the provider's original interval. */
export function shareSiteDayLines(
  observations: ReturnType<typeof publicSiteDayUsage> | undefined,
  locale?: string,
): string[] {
  return (observations ?? []).flatMap((usage) => {
    const values = siteDayUsageValues(usage, locale).join(" · ")
    const native =
      usage.displayCost && usage.cost
        ? ` · ${formatAssetAmount(usage.cost, locale)}`
        : ""
    return [
      `${t("account:financial.siteDay")}: ${values}${native}${usage.lastKnown ? ` · ${t("account:financial.lastKnown")}` : ""}${usage.reportedDay ? ` · ${usage.reportedDay}` : usage.observedAt !== undefined ? ` · ${new Date(usage.observedAt).toLocaleString(locale)}` : ""}`,
      ...formatBalanceWindow(usage.window, t, locale),
    ]
  })
}

/** Aggregated amounts, windows and counts are public; upstream and local identities are omitted. */
export function publicConsumptionSummary(
  consumption: Pick<
    ConsumptionProjection,
    "groups" | "nativeCoverage" | "references" | "retained"
  >,
) {
  const coverage = ({
    status,
    completeCount,
    partialCount,
    eligibleCount,
    legacyUnclassifiedCount,
  }: ConsumptionProjection["nativeCoverage"]) => ({
    status,
    completeCount,
    partialCount,
    eligibleCount,
    legacyUnclassifiedCount,
  })
  return {
    ...(consumption.references?.length
      ? {
          references: consumption.references.map(
            ({ amount, observedAt, lastKnown }) => ({
              amount: { USD: amount.USD, CNY: amount.CNY },
              ...(observedAt === undefined ? {} : { observedAt }),
              lastKnown,
            }),
          ),
        }
      : {}),
    groups: consumption.groups.map((group) => ({
      amount: {
        value: group.amount.value,
        asset: publicShareAsset(group.amount.asset),
      },
      ...(group.cnyValue === undefined ? {} : { cnyValue: group.cnyValue }),
      ...(group.usdValue === undefined ? {} : { usdValue: group.usdValue }),
      window: {
        start: group.window.start,
        end: group.window.end,
        timeZone: group.window.timeZone,
      },
      coverage: coverage(group.coverage),
    })),
    nativeCoverage: coverage(consumption.nativeCoverage),
    ...(consumption.retained?.length
      ? {
          retained: consumption.retained.map((fact) => ({
            amount: {
              asset: publicShareAsset(fact.amount.asset),
              value: fact.amount.value,
            },
            observedAt: fact.observedAt,
            window: {
              start: fact.window.start,
              end: fact.window.end,
              timeZone: fact.window.timeZone,
            },
          })),
        }
      : {}),
  }
}

/** Reference observations retain their release conversion and observation time. */
function shareReferenceCashflowLines(
  references: readonly ReferenceCashflow[] | undefined,
  locale?: string,
  currencyType: CurrencyType = CURRENCIES.USD,
): string[] {
  return (references ?? []).map((reference) =>
    [
      t("account:financial.legacy"),
      reference.lastKnown ? t("account:financial.lastKnown") : undefined,
      formatAssetAmount(
        {
          asset: { kind: ASSET_KINDS.Currency, code: currencyType },
          value: String(reference.amount[currencyType]),
        },
        locale,
      ),
      reference.observedAt === undefined
        ? undefined
        : new Date(reference.observedAt).toLocaleString(locale),
    ]
      .filter(Boolean)
      .join(" · "),
  )
}

/** Net cashflow requires the same asset, period and complete account population. */
export function getShareNetAmount(
  income: ReturnType<typeof publicConsumptionSummary> | undefined,
  consumption: ReturnType<typeof publicConsumptionSummary> | undefined,
  currencyType?: CurrencyType,
) {
  if (
    income?.nativeCoverage.status !== ACCOUNT_TODAY_METRIC_STATUSES.Complete ||
    consumption?.nativeCoverage.status !==
      ACCOUNT_TODAY_METRIC_STATUSES.Complete
  )
    return undefined
  const combineMoney = (summary: typeof income) => {
    if (!summary) return undefined
    const groups = selectDisplayCashflowGroups(summary, currencyType)
    return groups.length === 1 ? groups[0] : undefined
  }
  const received = combineMoney(income)
  const spent = combineMoney(consumption)
  if (!received || !spent || !income || !consumption) return undefined
  if (
    received.coverage.status !== ACCOUNT_TODAY_METRIC_STATUSES.Complete ||
    spent.coverage.status !== ACCOUNT_TODAY_METRIC_STATUSES.Complete ||
    received.coverage.completeCount !== income.nativeCoverage.eligibleCount ||
    spent.coverage.completeCount !== consumption.nativeCoverage.eligibleCount ||
    received.coverage.completeCount === 0 ||
    received.coverage.completeCount !== spent.coverage.completeCount ||
    received.window.start !== spent.window.start ||
    received.window.end !== spent.window.end ||
    received.window.timeZone !== spent.window.timeZone
  )
    return undefined
  const receivedAmount = displayCashflowAmount(received, currencyType)
  const spentAmount = displayCashflowAmount(spent, currencyType)
  if (assetIdentity(receivedAmount.asset) !== assetIdentity(spentAmount.asset))
    return undefined
  try {
    return {
      asset: receivedAmount.asset,
      value: subtractDecimal(receivedAmount.value, spentAmount.value),
    }
  } catch {
    return undefined
  }
}

/** The image and full caption use the same native amount and interval labels. */
export function shareConsumptionLines(
  summary: ReturnType<typeof publicConsumptionSummary> | undefined,
  locale?: string,
  metric: AccountCashflowMetric = ACCOUNT_CASHFLOW_METRICS.Consumption,
  currencyType?: CurrencyType,
): string[] {
  if (!summary) return []
  const label =
    metric === ACCOUNT_CASHFLOW_METRICS.Income
      ? t("account:financial.reportedIncome")
      : t("account:stats.todayConsumption")
  const references = shareReferenceCashflowLines(
    summary.references,
    locale,
    currencyType,
  ).map((line) => `${label}: ${line}`)
  references.push(
    ...(summary.retained ?? []).flatMap((fact) => [
      `${label}: ${formatAssetAmount(convertCurrencyAmount(fact.amount, currencyType), locale)} · ${t("account:financial.lastKnown")} · ${new Date(fact.observedAt).toLocaleString(locale)}`,
      ...formatBalanceWindow(fact.window, t, locale),
    ]),
  )
  if (!summary.groups.length)
    return references.length
      ? references
      : [`${label}: ${t("account:financial.unavailable")}`]
  const groups = selectDisplayCashflowGroups(summary, currencyType)
  const combinedOriginal =
    groups.length < summary.groups.length
      ? ` · ${summary.groups.map(({ amount }) => formatAssetAmount(amount, locale)).join(" + ")}`
      : undefined
  return [
    ...groups.flatMap((group) => {
      const displayed = displayCashflowAmount(group, currencyType)
      const original =
        combinedOriginal ??
        (assetIdentity(displayed.asset) !== assetIdentity(group.amount.asset)
          ? ` · ${formatAssetAmount(group.amount, locale)}`
          : "")
      return [
        `${group.coverage.status === ACCOUNT_TODAY_METRIC_STATUSES.Complete ? "" : `${t(group.coverage.status === ACCOUNT_TODAY_METRIC_STATUSES.Partial ? "account:todayMetricAvailability.partial" : "account:financial.coverageUnknown")} · `}${label}: ${formatAssetAmount(displayed, locale)}${original}`,
        ...formatBalanceWindow(group.window, t, locale),
        t("account:todayMetricAvailability.coverage", {
          complete: group.coverage.completeCount,
          partial: group.coverage.partialCount,
          eligible: group.coverage.eligibleCount,
        }),
      ]
    }),
    ...references,
  ]
}
